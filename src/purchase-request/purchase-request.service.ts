import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RequestStatus } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreatePurchaseRequestDto,
  UpdatePurchaseRequestStatusDto,
} from './dto';

@Injectable()
export class PurchaseRequestService {
  constructor(private readonly prisma: PrismaService) {}

  // ──────────────────────────────────────────────
  // Create Purchase Request (Client only)
  // ──────────────────────────────────────────────

  async create(userId: string, dto: CreatePurchaseRequestDto) {
    // 1. Check if user already has a pending purchase request
    const pendingRequest = await this.prisma.purchaseRequest.findFirst({
      where: {
        userId,
        status: RequestStatus.PENDING,
      },
    });

    if (pendingRequest) {
      throw new ConflictException(
        'errors.pending_purchase_request_exists|You already have a pending purchase request. Please wait for the administrator to review it before creating another request.',
      );
    }

    // 2. Verify template exists
    const template = await this.prisma.template.findUnique({
      where: { id: dto.templateId },
    });

    if (!template) {
      throw new NotFoundException(
        `errors.template_not_found|${dto.templateId}`,
      );
    }

    // 2. Validate coupon if provided
    let couponId: string | undefined;
    let couponCode: string | undefined;
    let discountAmount: number | undefined;
    let finalPrice: number = Number(template.price);

    if (dto.couponCode && dto.couponCode.trim()) {
      const codeUpper = dto.couponCode.trim().toUpperCase();
      const coupon = await this.prisma.coupon.findUnique({
        where: { code: codeUpper },
      });

      if (!coupon || coupon.isDeleted || !coupon.isActive) {
        throw new BadRequestException('errors.invalid_or_expired_coupon');
      }

      if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
        throw new BadRequestException('errors.coupon_limit_reached');
      }

      // Enforce one-time use per user
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

      couponId = coupon.id;
      couponCode = coupon.code;
      discountAmount = (Number(template.price) * coupon.discountPercent) / 100;
      finalPrice = Number(template.price) - discountAmount;
    }

    // 3. Auto-approve if final price is 0 (e.g. 100% discount coupon)
    const isAutoApproved = finalPrice <= 0;
    const status = isAutoApproved ? RequestStatus.APPROVED : RequestStatus.PENDING;

    // 4. Create purchase request and optional purchase record in transaction
    const request = await this.prisma.$transaction(async (tx) => {
      if (couponId) {
        await tx.coupon.update({
          where: { id: couponId },
          data: { usedCount: { increment: 1 } },
        });
      }

      const createdRequest = await tx.purchaseRequest.create({
        data: {
          userId,
          templateId: dto.templateId,
          contactEmail: dto.contactEmail,
          contactPhone: dto.contactPhone,
          languageMode: dto.languageMode || 'both',
          status,
          couponId,
          couponCode,
          discountAmount,
          finalPrice,
        },
        include: {
          template: {
            select: {
              id: true,
              title: true,
              previewImage: true,
              price: true,
            },
          },
          coupon: {
            select: {
              id: true,
              code: true,
              discountPercent: true,
            },
          },
        },
      });

      if (isAutoApproved) {
        const slug = `invite-${randomUUID().substring(0, 8)}`;
        const purchase = await tx.purchase.create({
          data: {
            userId,
            templateId: dto.templateId,
            purchaseRequestId: createdRequest.id,
            slug,
            languageMode: dto.languageMode || 'both',
          },
        });
        (createdRequest as any).purchase = purchase;
      }

      return createdRequest;
    });

    // 5. Update User phone number in profile if not already set (e.g. Google auth user)
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (user && (!user.phoneNumber || user.phoneNumber.trim() === '')) {
      const existingPhoneUser = await this.prisma.user.findFirst({
        where: { phoneNumber: dto.contactPhone.trim() },
      });
      if (!existingPhoneUser) {
        await this.prisma.user.update({
          where: { id: userId },
          data: { phoneNumber: dto.contactPhone.trim() },
        });
      }
    }

    return request;
  }

  // ──────────────────────────────────────────────
  // Client's own purchase requests
  // ──────────────────────────────────────────────

  async findMyRequests(userId: string) {
    return this.prisma.purchaseRequest.findMany({
      where: { userId },
      include: {
        template: {
          select: {
            id: true,
            title: true,
            previewImage: true,
            price: true,
          },
        },
        coupon: {
          select: {
            id: true,
            code: true,
            discountPercent: true,
          },
        },
        purchase: {
          include: {
            testimonial: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ──────────────────────────────────────────────
  // All purchase requests (Admin only)
  // ──────────────────────────────────────────────

  async findAll() {
    return this.prisma.purchaseRequest.findMany({
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
        coupon: {
          select: {
            id: true,
            code: true,
            discountPercent: true,
          },
        },
        purchase: {
          include: {
            invitation: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ──────────────────────────────────────────────
  // Update status (Admin only)
  // ──────────────────────────────────────────────

  async updateStatus(id: string, dto: UpdatePurchaseRequestStatusDto) {
    // 1. Find the purchase request
    const request = await this.prisma.purchaseRequest.findUnique({
      where: { id },
    });

    if (!request) {
      throw new NotFoundException(`errors.purchase_request_not_found|${id}`);
    }

    // 2. Only PENDING requests can be transitioned
    if (request.status !== RequestStatus.PENDING) {
      throw new BadRequestException(
        `errors.purchase_request_processed|${request.status.toLowerCase()}`,
      );
    }

    // 3. Process status update in a transaction
    return this.prisma.$transaction(async (tx) => {
      // Update request status
      const updatedRequest = await tx.purchaseRequest.update({
        where: { id },
        data: { status: dto.status },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
          template: {
            select: {
              id: true,
              title: true,
              price: true,
            },
          },
        },
      });

      // If approved, create a Purchase record
      if (dto.status === RequestStatus.APPROVED) {
        const slug = `invite-${randomUUID().substring(0, 8)}`;
        await tx.purchase.create({
          data: {
            userId: request.userId,
            templateId: request.templateId,
            purchaseRequestId: request.id,
            slug,
            languageMode: request.languageMode,
          },
        });
      }

      // If rejected and coupon was used, decrement usage count
      if (dto.status === RequestStatus.REJECTED && request.couponId) {
        await tx.coupon.update({
          where: { id: request.couponId },
          data: { usedCount: { decrement: 1 } },
        });
      }

      return updatedRequest;
    });
  }

  // ──────────────────────────────────────────────
  // Cancel Purchase Request (Client only)
  // ──────────────────────────────────────────────

  async cancel(userId: string, userRole: string, id: string) {
    const request = await this.prisma.purchaseRequest.findUnique({
      where: { id },
    });

    if (!request) {
      throw new NotFoundException(`errors.purchase_request_not_found|${id}`);
    }

    if (request.userId !== userId && userRole !== 'ADMIN') {
      throw new BadRequestException('errors.unauthorized_request');
    }

    if (request.status !== RequestStatus.PENDING) {
      throw new BadRequestException(
        `errors.purchase_request_processed|${request.status.toLowerCase()}`,
      );
    }

    if (request.couponId) {
      await this.prisma.coupon.update({
        where: { id: request.couponId },
        data: { usedCount: { decrement: 1 } },
      });
    }

    return this.prisma.purchaseRequest.update({
      where: { id },
      data: { status: RequestStatus.CANCELLED },
    });
  }
}
