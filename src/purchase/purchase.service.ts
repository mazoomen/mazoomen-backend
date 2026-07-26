import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PurchaseService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  // ──────────────────────────────────────────────
  // Client's own purchases
  // ──────────────────────────────────────────────

  async findMyPurchases(userId: string) {
    const cacheKey = `purchases:user:${userId}`;
    const cached = await this.cacheManager.get<any[]>(cacheKey);
    if (cached) return cached;

    const purchases = await this.prisma.purchase.findMany({
      where: { userId },
      include: {
        template: {
          select: {
            id: true,
            title: true,
            previewImage: true,
            price: true,
            editableFields: true,
          },
        },
        invitation: {
          select: {
            id: true,
            slug: true,
            languageMode: true,
            eventTitle: true,
            eventTitleAr: true,
            eventTitleEn: true,
            eventDate: true,
            eventLocation: true,
            eventLocationAr: true,
            eventLocationEn: true,
            locationUrl: true,
            welcomeText: true,
            welcomeTextAr: true,
            welcomeTextEn: true,
            images: true,
            musicUrl: true,
            eventProgram: true,
            eventDetails: true,
            isActive: true,
            contactName: true,
            contactPhone: true,
            allowGuestUploads: true,
            showMoments: true,
            allowCompanions: true,
            moments: true,
            hiddenMoments: true,
            deletedMoments: true,
            deletedImages: true,
            hiddenImages: true,
            galleryOrder: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Cache purchases for 30 minutes (1,800,000 ms)
    await this.cacheManager.set(cacheKey, purchases, 1800000);
    return purchases;
  }

  // ──────────────────────────────────────────────
  // All purchases (Admin only)
  // ──────────────────────────────────────────────

  async findAll() {
    const cacheKey = 'purchases:all';
    const cached = await this.cacheManager.get<any[]>(cacheKey);
    if (cached) return cached;

    const purchases = await this.prisma.purchase.findMany({
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            phoneNumber: true,
          },
        },
        template: {
          select: {
            id: true,
            title: true,
            previewImage: true,
            price: true,
            editableFields: true,
          },
        },
        invitation: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    // Cache list for 30 minutes (1,800,000 ms)
    await this.cacheManager.set(cacheKey, purchases, 1800000);
    return purchases;
  }
}
