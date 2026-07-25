import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateCouponDto {
  @ApiProperty({
    description: 'Unique coupon code (case-insensitive)',
    example: 'MAZOOMEN',
  })
  @IsString()
  @IsNotEmpty({ message: 'Coupon code is required' })
  code: string;

  @ApiProperty({
    description: 'Discount percentage (1-100)',
    example: 50,
  })
  @IsInt({ message: 'Discount percentage must be an integer' })
  @Min(1, { message: 'Discount percentage must be at least 1%' })
  @Max(100, { message: 'Discount percentage cannot exceed 100%' })
  discountPercent: number;

  @ApiProperty({
    description: 'Maximum number of times this coupon can be used (null or omitted = unlimited)',
    example: 3,
    required: false,
  })
  @IsInt({ message: 'Max uses must be an integer' })
  @Min(1, { message: 'Max uses must be at least 1' })
  @IsOptional()
  maxUses?: number;

  @ApiProperty({
    description: 'Whether the coupon is currently active',
    example: true,
    default: true,
  })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
