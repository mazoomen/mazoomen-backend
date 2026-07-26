import { Injectable, NotFoundException, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { ContactStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContactDto, UpdateContactStatusDto } from './dto';

@Injectable()
export class ContactService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  async create(userId: string | undefined, dto: CreateContactDto) {
    const created = await this.prisma.contactMessage.create({
      data: {
        userId: userId || null,
        email: dto.email.trim().toLowerCase(),
        phone: dto.phone.trim(),
        message: dto.message.trim(),
      },
    });

    await this.cacheManager.del('contact:all');
    return created;
  }

  async findAllAdmin() {
    const cacheKey = 'contact:all';
    const cached = await this.cacheManager.get<any[]>(cacheKey);
    if (cached) return cached;

    const messages = await this.prisma.contactMessage.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    await this.cacheManager.set(cacheKey, messages, 900000);
    return messages;
  }

  async replyAdmin(id: string, replyText: string) {
    const existing = await this.prisma.contactMessage.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Contact message not found');
    }

    const updated = await this.prisma.contactMessage.update({
      where: { id },
      data: {
        adminReply: replyText.trim(),
        repliedAt: new Date(),
        status: ContactStatus.REPLIED,
      },
    });

    // Create Notification if user is linked
    if (existing.userId) {
      await this.prisma.notification.create({
        data: {
          userId: existing.userId,
          title: 'Admin replied to your support message',
          titleAr: 'رد من الدعم الفني على استفسارك',
          message: replyText.trim(),
          messageAr: replyText.trim(),
        },
      });
      await this.cacheManager.del(`notifications:user:${existing.userId}`);
    }

    await this.cacheManager.del('contact:all');
    return updated;
  }

  async updateStatusAdmin(id: string, dto: UpdateContactStatusDto) {
    const existing = await this.prisma.contactMessage.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Contact message not found');
    }

    const updated = await this.prisma.contactMessage.update({
      where: { id },
      data: { status: dto.status },
    });

    await this.cacheManager.del('contact:all');
    return updated;
  }

  async removeAdmin(id: string) {
    const existing = await this.prisma.contactMessage.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Contact message not found');
    }

    const deleted = await this.prisma.contactMessage.delete({
      where: { id },
    });

    await this.cacheManager.del('contact:all');
    return deleted;
  }
}
