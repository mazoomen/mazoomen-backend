import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class UpdateCouponDto {
  @ApiProperty({
    description: 'Unique coupon code (case-insensitive)',
    example: 'MAZOOMEN',
  })
  @IsString()
  @IsOptional()
  code?: string;

  @ApiProperty({
    description: 'Discount percentage (1-100)',
    example: 50,
  })
  @IsInt({ message: 'Discount percentage must be an integer' })
  @Min(1, { message: 'Discount percentage must be at least 1%' })
  @Max(100, { message: 'Discount percentage cannot exceed 100%' })
  @IsOptional()
  discountPercent?: number;

  @ApiProperty({
    description: 'Maximum number of usages (null = unlimited)',
    example: 3,
    required: false,
  })
  @IsInt({ message: 'Max uses must be an integer' })
  @Min(1, { message: 'Max uses must be at least 1' })
  @IsOptional()
  maxUses?: number | null;

  @ApiProperty({
    description: 'Whether the coupon is currently active',
    example: true,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
