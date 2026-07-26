import { Injectable, NotFoundException } from '@nestjs/common';
import { ContactStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateContactDto, UpdateContactStatusDto } from './dto';

@Injectable()
export class ContactService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string | undefined, dto: CreateContactDto) {
    return this.prisma.contactMessage.create({
      data: {
        userId: userId || null,
        email: dto.email.trim().toLowerCase(),
        phone: dto.phone.trim(),
        message: dto.message.trim(),
      },
    });
  }

  async findAllAdmin() {
    return this.prisma.contactMessage.findMany({
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
    }

    return updated;
  }

  async updateStatusAdmin(id: string, dto: UpdateContactStatusDto) {
    const existing = await this.prisma.contactMessage.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Contact message not found');
    }

    return this.prisma.contactMessage.update({
      where: { id },
      data: { status: dto.status },
    });
  }

  async removeAdmin(id: string) {
    const existing = await this.prisma.contactMessage.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Contact message not found');
    }

    return this.prisma.contactMessage.delete({
      where: { id },
    });
  }
}
