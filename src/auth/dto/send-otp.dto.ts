import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class SendOtpDto {
  @ApiProperty({ description: 'Target email address for OTP verification', example: 'user@example.com' })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email address is required' })
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @ApiProperty({ description: 'User first name', example: 'Aiman' })
  @IsString()
  @IsNotEmpty({ message: 'First name is required' })
  @MaxLength(50)
  firstName: string;

  @ApiProperty({ description: 'User last name', example: 'BH' })
  @IsString()
  @IsNotEmpty({ message: 'Last name is required' })
  @MaxLength(50)
  lastName: string;

  @ApiProperty({
    description: 'Phone number in international format (e.g. +966501234567)',
    example: '+962793809686',
  })
  @IsString()
  @IsNotEmpty({ message: 'Phone number is required' })
  @Matches(/^\+?[1-9]\d{7,14}$/, {
    message:
      'Phone number must be a valid international format (e.g. +966501234567)',
  })
  phoneNumber: string;

  @ApiProperty({
    description: 'Password — minimum 8 characters',
    example: 'Str0ng!Pass#2025',
    minLength: 8,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(128, { message: 'Password must not exceed 128 characters' })
  @Matches(/((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message: 'errors.password_weak',
  })
  password: string;
}
