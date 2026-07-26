import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateContactDto {
  @ApiProperty({ example: 'user@example.com', description: 'User contact email' })
  @IsEmail({}, { message: 'Invalid email address' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @ApiProperty({ example: '+962791234567', description: 'User phone / WhatsApp number' })
  @IsString()
  @IsNotEmpty({ message: 'Phone number is required' })
  phone: string;

  @ApiProperty({ example: 'I need help with custom template styling', description: 'Message or problem description' })
  @IsString()
  @IsNotEmpty({ message: 'Message is required' })
  @MaxLength(3000, { message: 'Message must not exceed 3000 characters' })
  message: string;
}
