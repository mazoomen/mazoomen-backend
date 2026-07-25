import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class ValidateCouponDto {
  @ApiProperty({
    description: 'Coupon code to validate',
    example: 'MAZOOMEN',
  })
  @IsString()
  @IsNotEmpty({ message: 'Coupon code is required' })
  code: string;
}
