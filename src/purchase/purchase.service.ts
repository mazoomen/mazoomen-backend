import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PurchaseService {
  constructor(private readonly prisma: PrismaService) {}

  // ──────────────────────────────────────────────
  // Client's own purchases
  // ──────────────────────────────────────────────

  async findMyPurchases(userId: string) {
    return this.prisma.purchase.findMany({
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
  }

  // ──────────────────────────────────────────────
  // All purchases (Admin only)
  // ──────────────────────────────────────────────

  async findAll() {
    return this.prisma.purchase.findMany({
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
  }
}
