import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { CreateChargeDto } from './dto/create-charge.dto';
import { OrderStatus, RequestStatus } from '@prisma/client';
import { randomUUID } from 'crypto';

@Injectable()
export class PaymentService {
  private readonly logger = new Logger(PaymentService.name);
  private readonly tapSecretKey: string;
  private readonly frontendUrl: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Inject(CACHE_MANAGER) private readonly cacheManager: Cache,
  ) {
    this.tapSecretKey =
      this.configService.get<string>('TAP_SECRET_KEY') ||
      process.env.TAP_SECRET_KEY ||
      '';
    this.frontendUrl =
      this.configService.get<string>('FRONTEND_URL') ||
      process.env.FRONTEND_URL ||
      'http://localhost:3001';
  }

  /**
   * 1. Create Charge Endpoint Handler
   * Creates a PENDING order in DB and calls Tap Payments API to get Checkout URL.
   */
  async createCharge(dto: CreateChargeDto) {
    // A. Create PENDING Order in DB via Prisma
    const order = await this.prisma.order.create({
      data: {
        customerName: dto.customerName,
        customerEmail: dto.customerEmail,
        templateDetails: dto.templateDetails,
        amount: dto.amount,
        currency: dto.currency || 'KWD',
        status: OrderStatus.PENDING,
      },
    });

    // Split customer name for Tap API payload
    const nameParts = dto.customerName.trim().split(' ');
    const firstName = nameParts[0] || 'Customer';
    const lastName = nameParts.slice(1).join(' ') || 'Customer';

    // B. Build Tap Payments API payload
    const tapPayload = {
      amount: Number(dto.amount),
      currency: dto.currency || 'KWD',
      threeDSecure: true,
      save_card: false,
      description: `Mazoomen Digital Template Purchase - Order #${order.id}`,
      statement_descriptor: 'Mazoomen Digital',
      metadata: {
        orderId: order.id,
        customerEmail: dto.customerEmail,
      },
      reference: {
        transaction: order.id, // Store Prisma order ID in reference.transaction
        order: order.id,
      },
      receipt: {
        email: true,
        sms: false,
      },
      customer: {
        first_name: firstName,
        last_name: lastName,
        email: dto.customerEmail,
      },
      source: {
        id: 'src_all', // Enables all payment methods activated on Tap merchant account
      },
      redirect: {
        url: `${this.frontendUrl}/payment/status?orderId=${order.id}`,
      },
    };

    try {
      // C. Make POST request to Tap Payments API
      const response = await fetch('https://api.tap.company/v2/charges', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.tapSecretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(tapPayload),
      });

      const chargeData = await response.json();

      if (!response.ok) {
        this.logger.error(
          'Tap Payments API Error response:',
          JSON.stringify(chargeData),
        );
        const errorMsg =
          chargeData?.errors?.[0]?.description ||
          chargeData?.message ||
          'Failed to communicate with Tap Payments API.';
        throw new BadRequestException(errorMsg);
      }

      const checkoutUrl = chargeData.transaction?.url;
      const tapChargeId = chargeData.id;

      if (!checkoutUrl) {
        throw new InternalServerErrorException(
          'Tap API response did not contain a valid transaction checkout URL',
        );
      }

      // D. Update Order with tapChargeId in Prisma
      await this.prisma.order.update({
        where: { id: order.id },
        data: { tapChargeId },
      });

      // E. Return checkout URL to frontend
      return {
        orderId: order.id,
        tapChargeId,
        checkoutUrl,
      };
    } catch (error: any) {
      this.logger.error('Error creating charge:', error.stack || error.message);

      // Mark order as FAILED in database if charge creation failed
      await this.prisma.order.update({
        where: { id: order.id },
        data: {
          status: OrderStatus.FAILED,
          failureReason: error?.message || 'Failed to initiate charge request',
        },
      });

      if (error instanceof BadRequestException) {
        throw error;
      }

      throw new InternalServerErrorException(
        error.message || 'Payment initiation failed. Please try again.',
      );
    }
  }

  /**
   * 2. Webhook Endpoint Handler
   * Receives real-time payment notifications from Tap Payments.
   */
  async handleWebhook(payload: any) {
    this.logger.log(
      `Received Tap Webhook event for Charge ID: ${payload?.id || 'N/A'}`,
    );

    const tapStatus = (payload?.status || '').toUpperCase();
    const orderId =
      payload?.reference?.transaction || payload?.metadata?.orderId;
    const tapChargeId = payload?.id;

    const failureReason =
      payload?.response?.message ||
      payload?.response?.description ||
      payload?.response?.code ||
      `Payment status: ${tapStatus}`;

    if (!orderId) {
      this.logger.warn(
        'Tap webhook payload missing reference.transaction or metadata.orderId',
      );
      return { status: 'ignored', reason: 'Missing order reference' };
    }

    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      this.logger.error(`Order with ID ${orderId} not found in database`);
      throw new NotFoundException(`Order #${orderId} not found`);
    }

    if (order.status === OrderStatus.COMPLETED) {
      this.logger.log(`Order #${orderId} is already COMPLETED. Skipping.`);
      return { status: 'already_processed', orderId };
    }

    if (tapStatus === 'CAPTURED' || tapStatus === 'SUCCESS') {
      const updatedOrder = await this.prisma.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.COMPLETED,
          tapChargeId: tapChargeId || order.tapChargeId,
          failureReason: null,
        },
      });

      this.logger.log(
        `Order #${orderId} successfully updated to COMPLETED in database via webhook.`,
      );

      await this.fulfillTemplateAccess(updatedOrder);

      return {
        status: 'success',
        message: 'Order completed and template access approved.',
        orderId: updatedOrder.id,
      };
    }

    if (
      ['FAILED', 'DECLINED', 'CANCELLED', 'EXPIRED', 'TIMEDOUT'].includes(
        tapStatus,
      )
    ) {
      await this.prisma.order.update({
        where: { id: orderId },
        data: {
          status: OrderStatus.FAILED,
          tapChargeId: tapChargeId || order.tapChargeId,
          failureReason,
        },
      });

      this.logger.warn(
        `Order #${orderId} marked as FAILED in database. Reason: ${failureReason}`,
      );
    }

    return { status: 'acknowledged', tapStatus, orderId, failureReason };
  }

  /**
   * Helper to retrieve order status by ID & auto-verify against Tap API if PENDING
   */
  async getOrderStatus(orderId: string, tapId?: string) {
    const cacheKey = `orders:id:${orderId}`;
    const cached = await this.cacheManager.get<any>(cacheKey);
    if (cached && (cached.status === OrderStatus.COMPLETED || cached.status === OrderStatus.FAILED)) {
      return cached;
    }

    let order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) {
      throw new NotFoundException(`Order #${orderId} not found`);
    }

    const chargeIdToQuery = tapId || order.tapChargeId;

    // If order is PENDING and we have a Tap charge ID, verify charge status directly with Tap API!
    if (order.status === OrderStatus.PENDING && chargeIdToQuery) {
      try {
        const response = await fetch(
          `https://api.tap.company/v2/charges/${chargeIdToQuery}`,
          {
            headers: {
              Authorization: `Bearer ${this.tapSecretKey}`,
            },
          },
        );

        if (response.ok) {
          const tapCharge = await response.json();
          const tapStatus = (tapCharge?.status || '').toUpperCase();

          if (tapStatus === 'CAPTURED' || tapStatus === 'SUCCESS') {
            order = await this.prisma.order.update({
              where: { id: orderId },
              data: {
                status: OrderStatus.COMPLETED,
                tapChargeId: chargeIdToQuery,
                failureReason: null,
              },
            });
            this.logger.log(
              `Order #${orderId} verified & updated to COMPLETED via direct Tap status check.`,
            );
            await this.fulfillTemplateAccess(order);
          } else if (
            ['FAILED', 'DECLINED', 'CANCELLED', 'EXPIRED', 'TIMEDOUT'].includes(
              tapStatus,
            )
          ) {
            const failureReason =
              tapCharge?.response?.message ||
              tapCharge?.response?.description ||
              `Payment status: ${tapStatus}`;

            order = await this.prisma.order.update({
              where: { id: orderId },
              data: {
                status: OrderStatus.FAILED,
                tapChargeId: chargeIdToQuery,
                failureReason,
              },
            });
          }
        }
      } catch (err: any) {
        this.logger.error(
          `Failed to verify Tap charge status for Order #${orderId}:`,
          err.stack || err.message,
        );
      }
    }

    const result = {
      id: order.id,
      customerName: order.customerName,
      customerEmail: order.customerEmail,
      amount: order.amount,
      currency: order.currency,
      status: order.status,
      failureReason: order.failureReason,
      createdAt: order.createdAt,
    };

    if (order.status === OrderStatus.COMPLETED || order.status === OrderStatus.FAILED) {
      await this.cacheManager.set(cacheKey, result, 300000);
    }

    return result;
  }

  /**
   * Internal helper: Fulfills template access by creating/approving PurchaseRequest and Purchase in DB
   */
  private async fulfillTemplateAccess(order: any) {
    try {
      const details = (order.templateDetails as any) || {};
      const templateId = details.templateId;
      const contactPhone = details.contactPhone || '';
      const languageMode = details.languageMode || 'both';

      const user = await this.prisma.user.findUnique({
        where: { email: order.customerEmail },
      });

      if (user && templateId) {
        const template = await this.prisma.template.findUnique({
          where: { id: templateId },
        });

        if (template) {
          let purchaseReq = await this.prisma.purchaseRequest.findFirst({
            where: {
              userId: user.id,
              templateId,
              status: RequestStatus.PENDING,
            },
          });

          if (!purchaseReq) {
            purchaseReq = await this.prisma.purchaseRequest.create({
              data: {
                userId: user.id,
                templateId,
                contactEmail: order.customerEmail,
                contactPhone,
                languageMode,
                status: RequestStatus.APPROVED,
                finalPrice: order.amount,
              },
            });
          } else {
            purchaseReq = await this.prisma.purchaseRequest.update({
              where: { id: purchaseReq.id },
              data: { status: RequestStatus.APPROVED },
            });
          }

          const existingPurchase = await this.prisma.purchase.findUnique({
            where: { purchaseRequestId: purchaseReq.id },
          });

          if (!existingPurchase) {
            const slug = `invite-${randomUUID().substring(0, 8)}`;
            await this.prisma.purchase.create({
              data: {
                userId: user.id,
                templateId,
                purchaseRequestId: purchaseReq.id,
                slug,
                languageMode,
              },
            });
            this.logger.log(
              `Template #${templateId} successfully UNLOCKED for user ${user.email}`,
            );
          }
          await this.cacheManager.del(`purchase-requests:user:${user.id}`);
          await this.cacheManager.del('purchase-requests:all');
          await this.cacheManager.del(`purchases:user:${user.id}`);
          await this.cacheManager.del('purchases:all');
        }
      }
    } catch (err: any) {
      this.logger.error(
        `Error fulfilling template access for Order #${order.id}:`,
        err.stack || err.message,
      );
    }
  }
}
