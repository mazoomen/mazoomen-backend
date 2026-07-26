import { ApiProperty } from '@nestjs/swagger';
import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateProfileDto {
  @ApiProperty({
    description: 'User email address',
    example: 'aiman@mazoomen.app',
    required: false,
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsOptional()
  email?: string;

  @ApiProperty({
    description: 'Password — minimum 8 characters',
    example: 'Str0ng!Pass#2025',
    minLength: 8,
    required: false,
  })
  @IsString()
  @IsOptional()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @Matches(/((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message: 'errors.password_weak',
  })
  password?: string;

  @ApiProperty({
    description: 'First name of the user',
    example: 'Aiman',
    maxLength: 50,
    required: false,
  })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  firstName?: string;

  @ApiProperty({
    description: 'Last name of the user',
    example: 'BH',
    maxLength: 50,
    required: false,
  })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  lastName?: string;

  @ApiProperty({
    description: 'Phone number in international format (e.g. +966501234567)',
    example: '+962793809686',
    required: false,
  })
  @IsString()
  @IsOptional()
  @Matches(/^\+?[1-9]\d{7,14}$/, {
    message:
      'Phone number must be a valid international format (e.g. +966501234567)',
  })
  phoneNumber?: string;

  @ApiProperty({
    description: 'Profile avatar image URL',
    example: 'https://example.com/avatar.jpg',
    required: false,
  })
  @IsString()
  @IsOptional()
  avatarUrl?: string;
}
