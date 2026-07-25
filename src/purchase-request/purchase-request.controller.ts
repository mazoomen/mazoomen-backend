import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles, GetUser } from '../auth/decorators';
import { PurchaseRequestService } from './purchase-request.service';
import {
  CreatePurchaseRequestDto,
  UpdatePurchaseRequestStatusDto,
} from './dto';

@ApiTags('Purchase Requests')
@ApiBearerAuth('JWT-auth')
@Controller('purchase-requests')
export class PurchaseRequestController {
  constructor(
    private readonly purchaseRequestService: PurchaseRequestService,
  ) {}

  /**
   * POST /purchase-requests
   * Creates a new purchase request. Client only.
   */
  @Post()
  @Roles(Role.CLIENT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'Request a template purchase',
    description:
      'Creates a new purchase request for a template with contact information. Requires CLIENT role.',
  })
  @ApiResponse({
    status: 201,
    description: 'Purchase request created successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid JWT',
  })
  @ApiResponse({ status: 404, description: 'Template not found' })
  @ApiResponse({
    status: 409,
    description: 'Conflict — user already has a PENDING purchase request',
  })
  create(@GetUser('id') userId: string, @Body() dto: CreatePurchaseRequestDto) {
    return this.purchaseRequestService.create(userId, dto);
  }

  /**
   * GET /purchase-requests/my-requests
   * Returns authenticated client's requests. Client only.
   */
  @Get('my-requests')
  @Roles(Role.CLIENT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'Get my purchase requests',
    description:
      'Returns all purchase requests belonging to the authenticated client, sorted by newest first.',
  })
  @ApiResponse({ status: 200, description: "List of client's requests" })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid JWT',
  })
  findMyRequests(@GetUser('id') userId: string) {
    return this.purchaseRequestService.findMyRequests(userId);
  }

  /**
   * GET /purchase-requests
   * Returns all purchase requests. Admin only.
   */
  @Get()
  @Roles(Role.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'Get all purchase requests (Admin)',
    description:
      'Returns all purchase requests from all users. Requires ADMIN role.',
  })
  @ApiResponse({ status: 200, description: 'List of all purchase requests' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid JWT',
  })
  @ApiResponse({ status: 403, description: 'Forbidden — requires ADMIN role' })
  findAll() {
    return this.purchaseRequestService.findAll();
  }

  /**
   * PATCH /purchase-requests/:id/status
   * Approves or rejects a purchase request. Admin only.
   */
  @Patch(':id/status')
  @Roles(Role.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'Update purchase request status (Admin)',
    description:
      'Approves or rejects a PENDING purchase request. Transitioning to APPROVED automatically generates a Purchase. Requires ADMIN role.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID of the purchase request',
    example: 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a',
  })
  @ApiResponse({
    status: 200,
    description: 'Status updated successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Request has already been processed',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid JWT',
  })
  @ApiResponse({ status: 404, description: 'Purchase request not found' })
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePurchaseRequestStatusDto,
  ) {
    return this.purchaseRequestService.updateStatus(id, dto);
  }

  /**
   * PATCH /purchase-requests/:id/cancel
   * Cancels a pending purchase request. Client or Admin.
   */
  @Patch(':id/cancel')
  @Roles(Role.CLIENT, Role.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'Cancel a pending purchase request',
    description:
      'Allows a client to cancel their own purchase request if it is still PENDING, or an admin to override. Requires CLIENT or ADMIN role.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID of the purchase request',
    example: 'd4e5f6a7-b8c9-4d0e-1f2a-3b4c5d6e7f8a',
  })
  @ApiResponse({
    status: 200,
    description: 'Purchase request cancelled successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Request cannot be cancelled as it is already processed',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid JWT',
  })
  @ApiResponse({ status: 404, description: 'Purchase request not found' })
  cancel(@GetUser() user: any, @Param('id', ParseUUIDPipe) id: string) {
    return this.purchaseRequestService.cancel(user.id, user.role, id);
  }
}
