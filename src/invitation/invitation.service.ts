import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Inject,
  Logger,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { RsvpAttendance } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateInvitationDto, UpdateInvitationDto } from './dto';
import {
  detectMimeType,
  MIME_TO_EXT,
  getImageDimensions,
} from '../common/utils/file.utils';
import { writeFileSync, existsSync, mkdirSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { TooManyRequestsException } from '../common/exceptions/too-many-requests.exception';
import { AbuseService } from '../common/services/abuse.service';
import { S3Service } from '../media/s3.service';
import { MediaType } from '@prisma/client';


/** Fields from the DTO that map directly to Prisma update data. */
const UPDATABLE_STRING_FIELDS = [
  'slug',
  'languageMode',
  'eventTitle',
  'eventTitleAr',
  'eventTitleEn',
  'eventLocation',
  'eventLocationAr',
  'eventLocationEn',
  'locationUrl',
  'welcomeText',
  'welcomeTextAr',
  'welcomeTextEn',
  'musicUrl',
  'contactName',
  'contactPhone',
] as const;

const UPDATABLE_ARRAY_FIELDS = [
  'images',
  'eventProgram',
  'eventDetails',
  'moments',
  'hiddenMoments',
  'deletedMoments',
  'deletedImages',
  'hiddenImages',
  'galleryOrder',
] as const;
const UPDATABLE_BOOLEAN_FIELDS = ['isActive', 'allowGuestUploads', 'showMoments', 'allowCompanions'] as const;

@Injectable()
export class InvitationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly abuseService: AbuseService,
    private readonly s3Service: S3Service,
  ) {}

  private readonly logger = new Logger(InvitationService.name);

  /** Standard include clause for invitation responses with template info. */
  private readonly invitationInclude = {
    purchase: {
      include: {
        template: {
          select: {
            id: true,
            title: true,
            titleAr: true,
            titleEn: true,
            previewImage: true,
            editableFields: true,
          },
        },
      },
    },
  } as const;

  // ──────────────────────────────────────────────
  // Create invitation (Client only)
  // ──────────────────────────────────────────────

  async create(userId: string, dto: CreateInvitationDto) {
    // 1. Verify the client has access to this purchase
    const purchase = await this.prisma.purchase.findUnique({
      where: { id: dto.purchaseId },
      include: { invitation: true },
    });

    if (!purchase) {
      throw new NotFoundException(
        `errors.purchase_not_found|${dto.purchaseId}`,
      );
    }

    if (purchase.userId !== userId) {
      throw new ForbiddenException('errors.unauthorized_invitation');
    }

    if (purchase.invitation) {
      throw new BadRequestException('errors.invitation_exists');
    }

    // 2. Check slug uniqueness
    await this.ensureSlugAvailable(dto.slug);

    // 3. Create the invitation
    const invitation = await this.prisma.invitation.create({
      data: {
        purchaseId: dto.purchaseId,
        slug: dto.slug,
        languageMode: dto.languageMode ?? purchase.languageMode,
        eventTitle: dto.eventTitle,
        eventTitleAr: dto.eventTitleAr,
        eventTitleEn: dto.eventTitleEn,
        eventLocation: dto.eventLocation,
        eventLocationAr: dto.eventLocationAr,
        eventLocationEn: dto.eventLocationEn,
        eventDate: new Date(dto.eventDate),
        locationUrl: dto.locationUrl,
        welcomeText: dto.welcomeText,
        welcomeTextAr: dto.welcomeTextAr,
        welcomeTextEn: dto.welcomeTextEn,
        images: dto.images ?? [],
        musicUrl: dto.musicUrl,
        eventProgram: dto.eventProgram ?? [],
        eventDetails: dto.eventDetails ?? [],
        contactName: dto.contactName,
        contactPhone: dto.contactPhone,
        allowGuestUploads: dto.allowGuestUploads ?? true,
        showMoments: dto.showMoments ?? true,
        allowCompanions: dto.allowCompanions ?? true,
        moments: dto.moments ?? [],
      },
      include: this.invitationInclude,
    });

    return this.mapInvitationResponse(invitation);
  }

  // ──────────────────────────────────────────────
  // Update invitation (Client owner or Admin)
  // ──────────────────────────────────────────────

  async update(
    invitationId: string,
    userId: string,
    userRole: string,
    dto: UpdateInvitationDto,
  ) {
    // 1. Find the invitation
    const invitation = await this.prisma.invitation.findUnique({
      where: { id: invitationId },
      include: { purchase: true },
    });

    if (!invitation) {
      throw new NotFoundException(
        `errors.invitation_not_found|${invitationId}`,
      );
    }

    // 2. Ensure the authenticated client owns this invitation OR is an ADMIN
    if (invitation.purchase.userId !== userId && userRole !== 'ADMIN') {
      throw new ForbiddenException('errors.unauthorized_edit');
    }

    // 3. If slug is being updated, check uniqueness
    if (dto.slug && dto.slug !== invitation.slug) {
      await this.ensureSlugAvailable(dto.slug);

      // Also update slug in purchase record
      await this.prisma.purchase.update({
        where: { id: invitation.purchaseId },
        data: { slug: dto.slug },
      });
    }

    // 4. Build update payload dynamically from DTO (replaces 20+ manual if-checks)
    const updateData: Record<string, any> = {};

    for (const field of UPDATABLE_STRING_FIELDS) {
      if (dto[field] !== undefined) updateData[field] = dto[field];
    }
    for (const field of UPDATABLE_ARRAY_FIELDS) {
      if (dto[field] !== undefined) updateData[field] = dto[field];
    }
    for (const field of UPDATABLE_BOOLEAN_FIELDS) {
      if (dto[field] !== undefined) updateData[field] = dto[field];
    }
    if (dto.eventDate !== undefined) {
      updateData.eventDate = new Date(dto.eventDate);
    }
    // 4b. Perform automatic S3 storage and DB cleanup for removed images, moments, and audio
    const urlsToRemove: string[] = [];

    // Background music track cleanup
    if (dto.musicUrl !== undefined && invitation.musicUrl && dto.musicUrl !== invitation.musicUrl) {
      urlsToRemove.push(invitation.musicUrl);
    }

    // Gallery images cleanup
    if (dto.images !== undefined || dto.hiddenImages !== undefined || dto.deletedImages !== undefined) {
      const oldGallery = [...(invitation.images || []), ...(invitation.hiddenImages || []), ...(invitation.deletedImages || [])];
      const newGallery = [
        ...(dto.images ?? invitation.images ?? []),
        ...(dto.hiddenImages ?? invitation.hiddenImages ?? []),
        ...(dto.deletedImages ?? invitation.deletedImages ?? []),
      ];
      const removedImages = oldGallery.filter((url) => !newGallery.includes(url));
      urlsToRemove.push(...removedImages);
    }

    // Guest moments cleanup
    if (dto.moments !== undefined || dto.hiddenMoments !== undefined || dto.deletedMoments !== undefined) {
      const oldMoments = [...(invitation.moments || []), ...(invitation.hiddenMoments || []), ...(invitation.deletedMoments || [])];
      const newMoments = [
        ...(dto.moments ?? invitation.moments ?? []),
        ...(dto.hiddenMoments ?? invitation.hiddenMoments ?? []),
        ...(dto.deletedMoments ?? invitation.deletedMoments ?? []),
      ];
      const removedMoments = oldMoments.filter((url) => !newMoments.includes(url));
      urlsToRemove.push(...removedMoments);
    }

    if (urlsToRemove.length > 0) {
      const uniqueUrls = Array.from(new Set(urlsToRemove.filter(Boolean)));
      for (const url of uniqueUrls) {
        try {
          // 1. Delete from AWS S3
          await this.s3Service.deleteFileByUrl(url);

          // 2. Delete matching Media DB record
          const key = this.s3Service.extractKeyFromUrl(url);
          const whereClause: any[] = [{ url }];
          if (key) whereClause.push({ key });

          await this.prisma.media.deleteMany({
            where: {
              OR: whereClause,
            },
          });
        } catch (error) {
          this.logger.error(`Automatic S3/Media cleanup failed for URL ${url}:`, error);
        }
      }
    }

    // 5. Update
    const updatedInvitation = await this.prisma.invitation.update({
      where: { id: invitationId },
      data: updateData,
      include: this.invitationInclude,
    });

    // Invalidate invitation caches
    await this.cacheManager.del(`invitations:slug:${invitation.slug}`);
    if (updatedInvitation.slug !== invitation.slug) {
      await this.cacheManager.del(`invitations:slug:${updatedInvitation.slug}`);
    }

    return this.mapInvitationResponse(updatedInvitation);
  }

  // ──────────────────────────────────────────────
  // Get invitation by slug (Public)
  // ──────────────────────────────────────────────

  async findBySlug(
    slug: string,
    ip: string,
    userId?: string,
    userRole?: string,
  ) {
    const bruteforceKey = `slug-bruteforce:${ip}`;
    const failedAttempts =
      (await this.cacheManager.get<number>(bruteforceKey)) || 0;
    if (failedAttempts >= 10) {
      throw new TooManyRequestsException(
        'Too many failed slug lookups. Please try again later.',
      );
    }

    const cacheKey = `invitations:slug:${slug}`;
    let invitation = await this.cacheManager.get<any>(cacheKey);

    if (invitation === 'NOT_FOUND') {
      throw new NotFoundException(`errors.invitation_slug_not_found|${slug}`);
    }

    if (!invitation) {
      invitation = await this.prisma.invitation.findUnique({
        where: { slug },
        include: {
          purchase: {
            include: {
              template: {
                select: {
                  id: true,
                  title: true,
                  titleAr: true,
                  titleEn: true,
                  previewImage: true,
                  demoLink: true,
                },
              },
            },
          },
          rsvps: {
            where: {
              isDeleted: false,
              isHidden: false,
            },
            select: {
              name: true,
              message: true,
              createdAt: true,
            },
            orderBy: { createdAt: 'desc' },
          },
        },
      });

      if (!invitation) {
        await this.cacheManager.set(
          bruteforceKey,
          failedAttempts + 1,
          60 * 1000,
        );
        await this.cacheManager.set(cacheKey, 'NOT_FOUND', 60 * 1000);
        throw new NotFoundException(`errors.invitation_slug_not_found|${slug}`);
      }

      // Cache invitation details for 10 minutes (600,000 ms)
      await this.cacheManager.set(cacheKey, invitation, 600000);
    }

    // Check if invitation is deactivated
    if (!invitation.isActive) {
      const isOwnerOrAdmin =
        (userId && invitation.purchase.userId === userId) ||
        userRole === 'ADMIN';

      if (!isOwnerOrAdmin) {
        throw new ForbiddenException('errors.invitation_deactivated');
      }
    }

    const mapped = this.mapInvitationResponse(invitation);
    const isOwnerOrAdmin =
      (userId && invitation.purchase.userId === userId) ||
      userRole === 'ADMIN';
    if (!isOwnerOrAdmin) {
      if (mapped.moments && mapped.hiddenMoments) {
        mapped.moments = mapped.moments.filter(
          (m: string) => !mapped.hiddenMoments.includes(m),
        );
      }
      if (mapped.images && mapped.hiddenImages) {
        mapped.images = mapped.images.filter(
          (img: string) => !mapped.hiddenImages.includes(img),
        );
      }
    }
    return mapped;
  }

  // ──────────────────────────────────────────────
  // Toggle activation status (Admin only)
  // ──────────────────────────────────────────────

  async toggleStatus(id: string, isActive: boolean) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { id },
    });

    if (!invitation) {
      throw new NotFoundException(`errors.invitation_not_found|${id}`);
    }

    const updated = await this.prisma.invitation.update({
      where: { id },
      data: { isActive },
    });

    await this.cacheManager.del(`invitations:slug:${invitation.slug}`);

    return updated;
  }

  // ──────────────────────────────────────────────
  // Get RSVPs for an invitation (Client only — owner)
  // ──────────────────────────────────────────────

  async findRsvps(invitationId: string, userId: string, userRole?: string) {
    // 1. Find the invitation
    const invitation = await this.prisma.invitation.findUnique({
      where: { id: invitationId },
      include: { purchase: true },
    });

    if (!invitation) {
      throw new NotFoundException(
        `errors.invitation_not_found|${invitationId}`,
      );
    }

    // 2. Ensure the client owns this invitation OR user is an ADMIN
    if (invitation.purchase.userId !== userId && userRole !== 'ADMIN') {
      throw new ForbiddenException('errors.unauthorized_rsvp');
    }

    // 3. Fetch active RSVPs (exclude soft-deleted ones)
    const rsvps = await this.prisma.rSVP.findMany({
      where: { invitationId, isDeleted: false },
      orderBy: { createdAt: 'desc' },
    });

    // 4. Compute statistics
    const totalResponses = rsvps.length;
    const attending = rsvps.filter((r) => r.attendance === RsvpAttendance.YES);
    const excused = rsvps.filter((r) => r.attendance === RsvpAttendance.NO);

    const totalAttending = attending.reduce(
      (sum, r) => sum + (r.guestsCount > 0 ? r.guestsCount : 1),
      0,
    );
    const totalExcused = excused.length;

    return {
      invitationId,
      statistics: {
        totalResponses,
        totalAttending,
        totalExcused,
        totalCompanions: attending.reduce((sum, r) => sum + Math.max(0, r.guestsCount - 1), 0),
      },
      rsvps,
    };
  }

  // ──────────────────────────────────────────────
  // Add a moment (public/guest photo capture)
  // ──────────────────────────────────────────────

  async addMoment(invitationId: string, url: string, userId?: string) {
    const invitation = await this.prisma.invitation.findUnique({
      where: { id: invitationId },
      include: { purchase: true },
    });

    if (!invitation) {
      throw new NotFoundException(
        `errors.invitation_not_found|${invitationId}`,
      );
    }

    // Validate moment URL
    let isTrusted = false;
    try {
      if (url.startsWith('/') && !url.startsWith('//')) {
        isTrusted = true;
      } else {
        const parsedUrl = new URL(url);
        const hostname = parsedUrl.hostname.toLowerCase();
        const allowedDomains = process.env.TRUSTED_CDN_DOMAINS
          ? process.env.TRUSTED_CDN_DOMAINS.split(',').map((d) =>
              d.trim().toLowerCase(),
            )
          : ['cdn.mazoomen.app'];

        isTrusted = allowedDomains.some(
          (domain) => hostname === domain || hostname.endsWith(`.${domain}`),
        );
      }
    } catch (e) {
      isTrusted = false;
    }

    if (!isTrusted) {
      throw new BadRequestException(
        'errors.untrusted_url|URL must be a local path or from a trusted CDN domain.',
      );
    }

    // Only invitation owner or admin can manually link external URLs as moments
    const isOwner = userId && invitation.purchase.userId === userId;
    const isCallerAdmin =
      userId && (await this.isOwnerOrAdmin(userId, invitation.purchase.userId));
    if (!isOwner && !isCallerAdmin) {
      throw new ForbiddenException('errors.unauthorized_edit');
    }

    // Limit moments list to prevent excessive DB bloat
    if (invitation.moments.length >= 100) {
      throw new BadRequestException('errors.gallery_limit_reached');
    }

    // Append URL to moments scalar list
    const updated = await this.prisma.invitation.update({
      where: { id: invitationId },
      data: {
        moments: { push: url },
      },
      include: this.invitationInclude,
    });

    await this.cacheManager.del(`invitations:slug:${invitation.slug}`);

    return this.mapInvitationResponse(updated);
  }

  // ──────────────────────────────────────────────
  // Private Helpers
  // ──────────────────────────────────────────────

  /**
   * Ensures a slug is available — checks both invitations table
   * and template demo links (reserved slugs).
   */
  private async ensureSlugAvailable(slug: string): Promise<void> {
    const existingSlug = await this.prisma.invitation.findUnique({
      where: { slug },
    });

    if (existingSlug) {
      throw new ConflictException(`errors.slug_taken|${slug}`);
    }

    // Check if slug conflicts with a template demo link
    // Optimized: query only templates whose demoLink ends with this slug
    const conflictingTemplate = await this.prisma.template.findFirst({
      where: {
        demoLink: { endsWith: `/${slug}` },
      },
      select: { id: true },
    });

    if (conflictingTemplate) {
      throw new ConflictException(`errors.slug_taken|${slug}`);
    }
  }

  // ──────────────────────────────────────────────
  // Secure Guest Upload (Public Endpoint Service)
  // ──────────────────────────────────────────────

  async guestUpload(
    invitationId: string,
    file: Express.Multer.File,
    ip?: string,
  ): Promise<{ url: string }> {
    const clientIp = ip || 'unknown';

    // 1. Centralized upload rate limiting
    await this.abuseService.checkUploadLimit(clientIp, invitationId);

    // 2. Size limit: 20MB for images
    if (file.size > 20 * 1024 * 1024) {
      throw new BadRequestException('File size must not exceed 20MB.');
    }

    // 3. Detect and validate image MIME type
    const detectedMime = detectMimeType(file.buffer, file.mimetype) || file.mimetype || 'image/jpeg';
    const isImage = detectedMime.startsWith('image/') || (file.mimetype && file.mimetype.startsWith('image/'));
    if (!isImage) {
      throw new BadRequestException('Uploaded file is not a valid image.');
    }

    // 4. Determine extension
    const safeExt = MIME_TO_EXT[detectedMime] || `.${detectedMime.split('/')[1] || 'jpg'}`;

    // 6. Verify invitation exists
    const invitation = await this.prisma.invitation.findUnique({
      where: { id: invitationId },
      include: { purchase: true },
    });

    if (!invitation) {
      throw new NotFoundException(
        `errors.invitation_not_found|${invitationId}`,
      );
    }

    // 7. Verify invitation status
    if (!invitation.isActive) {
      throw new ForbiddenException('errors.invitation_deactivated');
    }

    if (!invitation.allowGuestUploads) {
      throw new ForbiddenException('errors.guest_uploads_disabled');
    }

    if (invitation.moments.length >= 50) {
      throw new BadRequestException('errors.gallery_limit_reached');
    }

    const uniqueName = randomUUID();
    const key = `guest-moments/${invitationId}/images/${uniqueName}${safeExt}`;

    // Upload directly to S3
    const fileUrl = await this.s3Service.uploadFile(file.buffer, key, detectedMime);

    // Save metadata in DB
    await this.prisma.media.create({
      data: {
        url: fileUrl,
        key,
        type: MediaType.IMAGE,
        mimeType: detectedMime,
        size: file.size,
      },
    });

    // 8. Automatically append the image to the moments list of this invitation
    const updated = await this.prisma.invitation.update({
      where: { id: invitationId },
      data: {
        moments: { push: fileUrl },
      },
      include: this.invitationInclude,
    });

    // Send notification to invitation owner
    if (invitation.purchase?.userId) {
      try {
        const eventName = invitation.eventTitle || 'Invitation';
        await this.prisma.notification.create({
          data: {
            userId: invitation.purchase.userId,
            title: 'New Guest Photo Uploaded',
            titleAr: 'صورة جديدة من ضيف',
            message: `A guest uploaded a new memory photo to your invitation '${eventName}'.`,
            messageAr: `قام أحد الضيوف برفع صورة ذكرى جديدة في دعوة '${eventName}'.`,
          },
        });
      } catch (notifyErr) {
        console.error('Failed to create guest photo upload notification:', notifyErr);
      }
    }

    // 9. Invalidate caches for this invitation
    await this.cacheManager.del(`invitations:slug:${invitation.slug}`);

    return this.mapInvitationResponse(updated) as any;
  }

  /**
   * Checks if the given userId is the owner of the resource or an ADMIN.
   */
  private async isOwnerOrAdmin(
    userId: string | undefined,
    ownerId: string,
  ): Promise<boolean> {
    if (!userId) return false;
    if (userId === ownerId) return true;

    const caller = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    return caller?.role === 'ADMIN';
  }

  /**
  /**
   * Maps database output to a clean API response structure,
   * ensuring all media URLs are strictly formatted as CloudFront CDN URLs.
   */
  private mapInvitationResponse(invitation: any) {
    const { purchase, rsvps, ...invitationFields } = invitation;

    const cloudFrontUrl = (process.env.CLOUDFRONT_URL || '').replace(/\/+$/, '');

    const sanitizeUrl = (url: string) => {
      if (!url) return url;
      const clean = url.split('?')[0]; // Strip presigned query string parameters
      if (clean.includes('.s3.') && clean.includes('.amazonaws.com/')) {
        const parts = clean.split('.amazonaws.com/');
        if (parts.length === 2 && cloudFrontUrl) {
          return `${cloudFrontUrl}/${parts[1].replace(/^\/+/, '')}`;
        }
      }
      return clean;
    };

    const images = Array.isArray(invitationFields.images)
      ? invitationFields.images.map(sanitizeUrl)
      : invitationFields.images;

    const moments = Array.isArray(invitationFields.moments)
      ? invitationFields.moments.map(sanitizeUrl)
      : invitationFields.moments;

    const hiddenMoments = Array.isArray(invitationFields.hiddenMoments)
      ? invitationFields.hiddenMoments.map(sanitizeUrl)
      : invitationFields.hiddenMoments || [];

    const deletedMoments = Array.isArray(invitationFields.deletedMoments)
      ? invitationFields.deletedMoments.map(sanitizeUrl)
      : invitationFields.deletedMoments || [];

    const deletedImages = Array.isArray(invitationFields.deletedImages)
      ? invitationFields.deletedImages.map(sanitizeUrl)
      : invitationFields.deletedImages || [];

    const hiddenImages = Array.isArray(invitationFields.hiddenImages)
      ? invitationFields.hiddenImages.map(sanitizeUrl)
      : invitationFields.hiddenImages || [];

    const galleryOrder = Array.isArray(invitationFields.galleryOrder)
      ? invitationFields.galleryOrder.map(sanitizeUrl)
      : invitationFields.galleryOrder || [];

    return {
      ...invitationFields,
      images,
      moments,
      hiddenMoments,
      deletedMoments,
      deletedImages,
      hiddenImages,
      galleryOrder,
      userId: purchase?.userId,
      templateId: purchase?.templateId,
      template: purchase?.template,
      purchaseId: purchase?.id,
      wishes: rsvps
        ? rsvps
            .filter((r: any) => r.message && r.message.trim() !== '')
            .map((r: any) => ({ name: r.name, text: r.message }))
        : [],
    };
  }
}
