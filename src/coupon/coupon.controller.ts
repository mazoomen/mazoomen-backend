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
import { CouponService } from './coupon.service';
import { CreateCouponDto, UpdateCouponDto, ValidateCouponDto } from './dto';

@ApiTags('Coupons')
@ApiBearerAuth('JWT-auth')
@Controller('coupons')
export class CouponController {
  constructor(private readonly couponService: CouponService) {}

  /**
   * POST /coupons/validate
   * Validate a coupon code. Accessible by logged-in users during checkout.
   */
  @Post('validate')
  @UseGuards(JwtAuthGuard)
  @ApiOperation({
    summary: 'Validate coupon code',
    description: 'Validates a coupon code and returns discount percentage if valid for the current user.',
  })
  @ApiResponse({ status: 200, description: 'Coupon is valid' })
  @ApiResponse({ status: 400, description: 'Coupon is invalid, expired, limit reached, or already used by user' })
  validate(@GetUser('id') userId: string, @Body() dto: ValidateCouponDto) {
    return this.couponService.validate(dto.code, userId);
  }

  /**
   * POST /coupons
   * Create a new coupon. Admin only.
   */
  @Post()
  @Roles(Role.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'Create coupon (Admin)',
    description: 'Creates a new discount coupon. Requires ADMIN role.',
  })
  @ApiResponse({ status: 201, description: 'Coupon created successfully' })
  @ApiResponse({ status: 409, description: 'Coupon code already exists' })
  create(@Body() dto: CreateCouponDto) {
    return this.couponService.create(dto);
  }

  /**
   * GET /coupons
   * Get all coupons. Admin only.
   */
  @Get()
  @Roles(Role.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'Get all coupons (Admin)',
    description: 'Returns all coupons including usage count. Requires ADMIN role.',
  })
  @ApiResponse({ status: 200, description: 'List of coupons' })
  findAll() {
    return this.couponService.findAll();
  }

  /**
   * GET /coupons/:id
   * Get coupon details. Admin only.
   */
  @Get(':id')
  @Roles(Role.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'Get coupon by ID (Admin)',
  })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.couponService.findOne(id);
  }

  /**
   * PATCH /coupons/:id
   * Update a coupon. Admin only.
   */
  @Patch(':id')
  @Roles(Role.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'Update coupon (Admin)',
  })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateCouponDto,
  ) {
    return this.couponService.update(id, dto);
  }

  /**
   * PATCH /coupons/:id/toggle-active
   * Toggle coupon active/inactive status. Admin only.
   */
  @Patch(':id/toggle-active')
  @Roles(Role.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'Toggle active status (Admin)',
  })
  toggleActive(@Param('id', ParseUUIDPipe) id: string) {
    return this.couponService.toggleActive(id);
  }

  /**
   * DELETE /coupons/:id
   * Soft-delete a coupon. Admin only.
   */
  @Delete(':id')
  @Roles(Role.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'Soft-delete coupon (Admin)',
  })
  softDelete(@Param('id', ParseUUIDPipe) id: string) {
    return this.couponService.softDelete(id);
  }

  /**
   * PATCH /coupons/:id/restore
   * Restore a soft-deleted coupon. Admin only.
   */
  @Patch(':id/restore')
  @Roles(Role.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiOperation({
    summary: 'Restore soft-deleted coupon (Admin)',
  })
  restore(@Param('id', ParseUUIDPipe) id: string) {
    return this.couponService.restore(id);
  }
}
