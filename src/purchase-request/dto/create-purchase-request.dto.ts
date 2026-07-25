import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreatePurchaseRequestDto {
  @ApiProperty({
    description: 'UUID of the template to purchase',
    example: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    format: 'uuid',
  })
  @IsUUID('4', { message: 'templateId must be a valid UUID' })
  @IsNotEmpty({ message: 'Template ID is required' })
  templateId: string;

  @ApiProperty({
    description: 'Contact email of the customer requesting the template',
    example: 'client@example.com',
  })
  @IsEmail({}, { message: 'contactEmail must be a valid email address' })
  @IsNotEmpty({ message: 'Contact email is required' })
  contactEmail: string;

  @ApiProperty({
    description: 'Contact phone number of the customer',
    example: '+966500000000',
  })
  @IsString()
  @IsNotEmpty({ message: 'Contact phone is required' })
  contactPhone: string;

  @ApiProperty({
    description: 'The language mode chosen by the client',
    example: 'both',
    default: 'both',
  })
  @IsString()
  @IsOptional()
  languageMode?: string;

  @ApiProperty({
    description: 'Optional coupon code for discount',
    example: 'MAZOOMEN',
    required: false,
  })
  @IsString()
  @IsOptional()
  couponCode?: string;
}
