import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateChargeDto {
  @ApiProperty({ description: 'Customer full name', example: 'Aiman Ahmed' })
  @IsString()
  @IsNotEmpty()
  customerName: string;

  @ApiProperty({ description: 'Customer email address', example: 'aiman@example.com' })
  @IsEmail()
  @IsNotEmpty()
  customerEmail: string;

  @ApiProperty({
    description: 'Custom template details and configurations',
    example: { templateId: '123-uuid', title: 'Wedding Invitation', groomName: 'Aiman' },
  })
  @IsObject()
  @IsNotEmpty()
  templateDetails: Record<string, any>;

  @ApiProperty({ description: 'Charge amount in specified currency', example: 25.0 })
  @IsNumber()
  @Min(0.1)
  amount: number;

  @ApiProperty({ description: 'Currency ISO code', example: 'KWD', required: false, default: 'KWD' })
  @IsString()
  @IsOptional()
  currency?: string = 'KWD';
}
