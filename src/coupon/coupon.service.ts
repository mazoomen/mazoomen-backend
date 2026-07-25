import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCouponDto, UpdateCouponDto } from './dto';

import { RequestStatus } from '@prisma/client';

@Injectable()
export class CouponService {
  constructor(private readonly prisma: PrismaService) {}

  // ──────────────────────────────────────────────
  // Validate Coupon (Public/Client)
  // ──────────────────────────────────────────────
  async validate(code: string, userId?: string) {
    if (!code) {
      throw new BadRequestException('errors.coupon_code_required');
    }

    const uppercaseCode = code.trim().toUpperCase();
    const coupon = await this.prisma.coupon.findUnique({
      where: { code: uppercaseCode },
    });

    if (!coupon || coupon.isDeleted || !coupon.isActive) {
      throw new BadRequestException('errors.invalid_or_expired_coupon');
    }

    if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
      throw new BadRequestException('errors.coupon_limit_reached');
    }

    // Check if this specific user has already used this coupon
    if (userId) {
      const existingUse = await this.prisma.purchaseRequest.findFirst({
        where: {
          userId,
          couponId: coupon.id,
          status: { notIn: [RequestStatus.CANCELLED, RequestStatus.REJECTED] },
        },
      });

      if (existingUse) {
        throw new BadRequestException('errors.coupon_already_used_by_user');
      }
    }

    return {
      valid: true,
      code: coupon.code,
      discountPercent: coupon.discountPercent,
      maxUses: coupon.maxUses,
      usedCount: coupon.usedCount,
    };
  }

  // ──────────────────────────────────────────────
  // Create Coupon (Admin)
  // ──────────────────────────────────────────────
  async create(dto: CreateCouponDto) {
    const uppercaseCode = dto.code.trim().toUpperCase();

    const existing = await this.prisma.coupon.findUnique({
      where: { code: uppercaseCode },
    });

    if (existing) {
      throw new ConflictException('errors.coupon_code_exists');
    }

    return this.prisma.coupon.create({
      data: {
        code: uppercaseCode,
        discountPercent: dto.discountPercent,
        maxUses: dto.maxUses ?? null,
        isActive: dto.isActive ?? true,
      },
    });
  }

  // ──────────────────────────────────────────────
  // Find All Coupons (Admin)
  // ──────────────────────────────────────────────
  async findAll() {
    return this.prisma.coupon.findMany({
      include: {
        _count: {
          select: { purchaseRequests: true },
        },
        purchaseRequests: {
          select: {
            id: true,
            userId: true,
            contactEmail: true,
            contactPhone: true,
            status: true,
            discountAmount: true,
            finalPrice: true,
            createdAt: true,
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phoneNumber: true,
              },
            },
            template: {
              select: {
                id: true,
                title: true,
                previewImage: true,
                price: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ──────────────────────────────────────────────
  // Find One Coupon (Admin)
  // ──────────────────────────────────────────────
  async findOne(id: string) {
    const coupon = await this.prisma.coupon.findUnique({
      where: { id },
      include: {
        _count: {
          select: { purchaseRequests: true },
        },
        purchaseRequests: {
          select: {
            id: true,
            userId: true,
            contactEmail: true,
            contactPhone: true,
            status: true,
            discountAmount: true,
            finalPrice: true,
            createdAt: true,
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                email: true,
                phoneNumber: true,
              },
            },
            template: {
              select: {
                id: true,
                title: true,
                previewImage: true,
                price: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!coupon) {
      throw new NotFoundException(`errors.coupon_not_found|${id}`);
    }

    return coupon;
  }

  // ──────────────────────────────────────────────
  // Update Coupon (Admin)
  // ──────────────────────────────────────────────
  async update(id: string, dto: UpdateCouponDto) {
    const coupon = await this.findOne(id);

    const dataToUpdate: any = {};

    if (dto.code !== undefined) {
      const uppercaseCode = dto.code.trim().toUpperCase();
      const existing = await this.prisma.coupon.findFirst({
        where: {
          code: uppercaseCode,
          NOT: { id },
        },
      });

      if (existing) {
        throw new ConflictException('errors.coupon_code_exists');
      }
      dataToUpdate.code = uppercaseCode;
    }

    if (dto.discountPercent !== undefined) {
      dataToUpdate.discountPercent = dto.discountPercent;
    }

    if (dto.maxUses !== undefined) {
      if (dto.maxUses !== null && dto.maxUses < coupon.usedCount) {
        throw new BadRequestException(
          `errors.max_uses_cannot_be_less_than_used_count|${coupon.usedCount}`,
        );
      }
      dataToUpdate.maxUses = dto.maxUses;
    }

    if (dto.isActive !== undefined) {
      dataToUpdate.isActive = dto.isActive;
    }

    return this.prisma.coupon.update({
      where: { id },
      data: dataToUpdate,
    });
  }

  // ──────────────────────────────────────────────
  // Toggle Active Status (Admin)
  // ──────────────────────────────────────────────
  async toggleActive(id: string) {
    const coupon = await this.findOne(id);
    return this.prisma.coupon.update({
      where: { id },
      data: { isActive: !coupon.isActive },
    });
  }

  // ──────────────────────────────────────────────
  // Soft Delete Coupon (Admin)
  // ──────────────────────────────────────────────
  async softDelete(id: string) {
    await this.findOne(id);
    return this.prisma.coupon.update({
      where: { id },
      data: { isDeleted: true, isActive: false },
    });
  }

  // ──────────────────────────────────────────────
  // Restore Soft-Deleted Coupon (Admin)
  // ──────────────────────────────────────────────
  async restore(id: string) {
    await this.findOne(id);
    return this.prisma.coupon.update({
      where: { id },
      data: { isDeleted: false, isActive: true },
    });
  }
}
