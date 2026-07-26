import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  Inject,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCouponDto, UpdateCouponDto } from './dto';
import { RequestStatus } from '@prisma/client';

@Injectable()
export class CouponService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {}

  // ──────────────────────────────────────────────
  // Validate Coupon (Public/Client)
  // ──────────────────────────────────────────────
  async validate(code: string, userId?: string) {
    if (!code) {
      throw new BadRequestException('errors.coupon_code_required');
    }

    const uppercaseCode = code.trim().toUpperCase();
    const cacheKey = `coupons:code:${uppercaseCode}`;
    let coupon = await this.cacheManager.get<any>(cacheKey);

    if (!coupon) {
      coupon = await this.prisma.coupon.findUnique({
        where: { code: uppercaseCode },
      });
      if (coupon) {
        await this.cacheManager.set(cacheKey, coupon, 3600000);
      }
    }

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

    const created = await this.prisma.coupon.create({
      data: {
        code: uppercaseCode,
        discountPercent: dto.discountPercent,
        maxUses: dto.maxUses ?? null,
        isActive: dto.isActive ?? true,
      },
    });

    await this.cacheManager.del('coupons:all');
    return created;
  }

  // ──────────────────────────────────────────────
  // Find All Coupons (Admin)
  // ──────────────────────────────────────────────
  async findAll() {
    const cacheKey = 'coupons:all';
    const cached = await this.cacheManager.get<any[]>(cacheKey);
    if (cached) return cached;

    const coupons = await this.prisma.coupon.findMany({
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

    await this.cacheManager.set(cacheKey, coupons, 3600000);
    return coupons;
  }

  // ──────────────────────────────────────────────
  // Find One Coupon (Admin)
  // ──────────────────────────────────────────────
  async findOne(id: string) {
    const cacheKey = `coupons:id:${id}`;
    const cached = await this.cacheManager.get<any>(cacheKey);
    if (cached) return cached;

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

    await this.cacheManager.set(cacheKey, coupon, 3600000);
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

    const updated = await this.prisma.coupon.update({
      where: { id },
      data: dataToUpdate,
    });

    await this.cacheManager.del('coupons:all');
    await this.cacheManager.del(`coupons:id:${id}`);
    await this.cacheManager.del(`coupons:code:${coupon.code}`);
    if (updated.code !== coupon.code) {
      await this.cacheManager.del(`coupons:code:${updated.code}`);
    }

    return updated;
  }

  // ──────────────────────────────────────────────
  // Toggle Active Status (Admin)
  // ──────────────────────────────────────────────
  async toggleActive(id: string) {
    const coupon = await this.findOne(id);
    const updated = await this.prisma.coupon.update({
      where: { id },
      data: { isActive: !coupon.isActive },
    });

    await this.cacheManager.del('coupons:all');
    await this.cacheManager.del(`coupons:id:${id}`);
    await this.cacheManager.del(`coupons:code:${coupon.code}`);
    return updated;
  }

  // ──────────────────────────────────────────────
  // Soft Delete Coupon (Admin)
  // ──────────────────────────────────────────────
  async softDelete(id: string) {
    const coupon = await this.findOne(id);
    const updated = await this.prisma.coupon.update({
      where: { id },
      data: { isDeleted: true, isActive: false },
    });

    await this.cacheManager.del('coupons:all');
    await this.cacheManager.del(`coupons:id:${id}`);
    await this.cacheManager.del(`coupons:code:${coupon.code}`);
    return updated;
  }

  // ──────────────────────────────────────────────
  // Restore Soft-Deleted Coupon (Admin)
  // ──────────────────────────────────────────────
  async restore(id: string) {
    const coupon = await this.findOne(id);
    const updated = await this.prisma.coupon.update({
      where: { id },
      data: { isDeleted: false, isActive: true },
    });

    await this.cacheManager.del('coupons:all');
    await this.cacheManager.del(`coupons:id:${id}`);
    await this.cacheManager.del(`coupons:code:${coupon.code}`);
    return updated;
  }
}
