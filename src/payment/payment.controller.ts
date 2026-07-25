import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { PaymentService } from './payment.service';
import { CreateChargeDto } from './dto/create-charge.dto';

@ApiTags('Payment')
@Controller('payment')
export class PaymentController {
  constructor(private readonly paymentService: PaymentService) {}

  /**
   * POST /payment/create-charge
   * Initiates payment charge with Tap Payments and returns checkout URL.
   */
  @Post('create-charge')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create Tap Payment Charge',
    description:
      'Creates a pending order in Prisma database and generates a Tap Payments Checkout URL.',
  })
  @ApiResponse({
    status: 201,
    description: 'Charge created successfully. Returns checkout URL.',
  })
  @ApiResponse({ status: 400, description: 'Invalid request data or Tap API error.' })
  async createCharge(@Body() createChargeDto: CreateChargeDto) {
    return this.paymentService.createCharge(createChargeDto);
  }

  /**
   * POST /payment/tap/webhook
   * Webhook endpoint called asynchronously by Tap Payments on payment status updates.
   */
  @Post('tap/webhook')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Tap Payments Webhook Handler',
    description:
      'Receives payment events from Tap Payments, updates order status in DB, and triggers template generation.',
  })
  @ApiResponse({ status: 200, description: 'Webhook received and processed successfully.' })
  async handleWebhook(@Body() payload: any) {
    return this.paymentService.handleWebhook(payload);
  }

  /**
   * GET /payment/status/:orderId
   * Retrieves status of an order by ID & verifies directly with Tap API if PENDING.
   */
  @Get('status/:orderId')
  @ApiOperation({
    summary: 'Get Order Payment Status',
    description: 'Returns the payment status of an order by ID.',
  })
  @ApiParam({ name: 'orderId', description: 'Prisma Order UUID' })
  @ApiQuery({ name: 'tap_id', required: false, description: 'Tap Charge ID' })
  @ApiResponse({ status: 200, description: 'Returns order details and status.' })
  @ApiResponse({ status: 404, description: 'Order not found.' })
  async getOrderStatus(
    @Param('orderId') orderId: string,
    @Query('tap_id') tapId?: string,
    @Query('tap_charge_id') tapChargeId?: string,
  ) {
    return this.paymentService.getOrderStatus(orderId, tapId || tapChargeId);
  }
}
