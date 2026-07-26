import {
  Injectable,
  NotFoundException,
  Inject,
  BadRequestException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRsvpDto } from './dto';
import { AbuseService } from '../common/services/abuse.service';
import { createHash } from 'crypto';

@Injectable()
export class RsvpService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
    private readonly abuseService: AbuseService,
  ) {}

  // ──────────────────────────────────────────────
  // Submit RSVP (Public — any guest)
  // ──────────────────────────────────────────────

  async create(dto: CreateRsvpDto, ip?: string, idempotencyKey?: string) {
    const clientIp = ip || 'unknown';

    // 1. Redis atomic rate limiting via AbuseService
    await this.abuseService.checkRsvpLimit(clientIp, dto.invitationId);

    // 2. Idempotency protection to prevent duplicate submissions
    const nameNorm = (dto.name || '').trim();
    const payloadHash = createHash('sha256')
      .update(`${dto.invitationId}:${nameNorm}:${dto.attendance}`)
      .digest('hex');

    const lockKey = idempotencyKey
      ? `idempotency:header:${idempotencyKey}`
      : `idempotency:payload:${payloadHash}`;
    const lockTtl = idempotencyKey ? 3600 * 1000 : 10 * 1000; // 1 hour for header, 10s for double clicks

    const isLocked = await this.cacheManager.get(lockKey);
    if (isLocked) {
      throw new ConflictException('Duplicate submission detected.');
    }
    await this.cacheManager.set(lockKey, '1', lockTtl);

    // 3. Spam message check
    if (dto.message) {
      if (/<[^>]*>/g.test(dto.message)) {
        throw new BadRequestException(
          'Spam detected: HTML tags are not allowed.',
        );
      }
      const urlRegex = /https?:\/\/[^\s]+/gi;
      const urls = dto.message.match(urlRegex);
      if (urls && urls.length > 1) {
        throw new BadRequestException('Spam detected: too many links.');
      }
      if (/(.)\1{9,}/.test(dto.message)) {
        throw new BadRequestException(
          'Spam detected: repetitive character sequences.',
        );
      }
    }

    // 4. Verify the invitation exists
    const invitation = await this.prisma.invitation.findUnique({
      where: { id: dto.invitationId },
      include: { purchase: true },
    });

    if (!invitation) {
      throw new NotFoundException(
        `errors.invitation_not_found|${dto.invitationId}`,
      );
    }

    // 5. Check if an RSVP with the same name exists (update if present, otherwise create new)
    const existingRsvp = await this.prisma.rSVP.findFirst({
      where: {
        invitationId: dto.invitationId,
        name: nameNorm,
        isDeleted: false,
      },
    });

    let rsvp;
    if (existingRsvp) {
      rsvp = await this.prisma.rSVP.update({
        where: { id: existingRsvp.id },
        data: {
          attendance: dto.attendance,
          guestsCount: dto.guestsCount,
          message: dto.message,
          isHidden: false,
        },
      });
    } else {
      rsvp = await this.prisma.rSVP.create({
        data: {
          invitationId: dto.invitationId,
          name: nameNorm,
          attendance: dto.attendance,
          guestsCount: dto.guestsCount,
          message: dto.message,
        },
      });
    }

    // Send notification to invitation owner
    if (invitation.purchase?.userId) {
      try {
        const isAttending = dto.attendance === 'YES';
        const eventName = invitation.eventTitle || 'Invitation';

        await this.prisma.notification.create({
          data: {
            userId: invitation.purchase.userId,
            title: `New RSVP: ${dto.name}`,
            titleAr: `تأكيد حضور جديد: ${dto.name}`,
            message: `${dto.name} responded ${isAttending ? 'Attending' : 'Not Attending'}${
              dto.guestsCount ? ` (${dto.guestsCount} guests)` : ''
            }${dto.message ? `. Message: "${dto.message}"` : ''}`,
            messageAr: `قام ${dto.name} بالرد (${isAttending ? 'سيحضر' : 'يعتذر عن الحضور'}) في ${eventName}${
              dto.guestsCount ? ` (عدد الحضور: ${dto.guestsCount})` : ''
            }${dto.message ? `. الرسالة: "${dto.message}"` : ''}`,
          },
        });
        await this.cacheManager.del(`notifications:user:${invitation.purchase.userId}`);
      } catch (notifyErr) {
        console.error('Failed to create RSVP notification:', notifyErr);
      }
    }

    // Invalidate the invitation slug cache and rsvps list cache so guestbook updates instantly
    await this.cacheManager.del(`invitations:slug:${invitation.slug}`);
    await this.cacheManager.del(`invitations:rsvps:${dto.invitationId}`);

    return rsvp;
  }

  // ──────────────────────────────────────────────
  // Toggle guestbook message visibility (Client only — owner)
  // ──────────────────────────────────────────────

  async toggleHide(rsvpId: string, userId: string, userRole: string) {
    const rsvp = await this.prisma.rSVP.findUnique({
      where: { id: rsvpId },
      include: { invitation: { include: { purchase: true } } },
    });

    if (!rsvp) {
      throw new NotFoundException(`errors.rsvp_not_found|RSVP not found`);
    }

    if (rsvp.invitation.purchase.userId !== userId && userRole !== 'ADMIN') {
      throw new ForbiddenException('errors.unauthorized_rsvp_edit');
    }

    const updated = await this.prisma.rSVP.update({
      where: { id: rsvpId },
      data: { isHidden: !rsvp.isHidden },
    });

    // Invalidate caches so updates reflect instantly
    await this.cacheManager.del(`invitations:slug:${rsvp.invitation.slug}`);
    await this.cacheManager.del(`invitations:rsvps:${rsvp.invitationId}`);

    return updated;
  }

  // ──────────────────────────────────────────────
  // Soft delete RSVP (Client only — owner)
  // ──────────────────────────────────────────────

  async softDelete(rsvpId: string, userId: string, userRole: string) {
    const rsvp = await this.prisma.rSVP.findUnique({
      where: { id: rsvpId },
      include: { invitation: { include: { purchase: true } } },
    });

    if (!rsvp) {
      throw new NotFoundException(`errors.rsvp_not_found|RSVP not found`);
    }

    if (rsvp.invitation.purchase.userId !== userId && userRole !== 'ADMIN') {
      throw new ForbiddenException('errors.unauthorized_rsvp_delete');
    }

    const updated = await this.prisma.rSVP.update({
      where: { id: rsvpId },
      data: { isDeleted: true },
    });

    // Invalidate caches so statistics and lists update instantly
    await this.cacheManager.del(`invitations:slug:${rsvp.invitation.slug}`);
    await this.cacheManager.del(`invitations:rsvps:${rsvp.invitationId}`);

    return updated;
  }
}
