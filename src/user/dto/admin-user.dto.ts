import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @ApiProperty({
    description: 'User email address',
    example: 'newuser@mazoomen.app',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsNotEmpty({ message: 'Email address is required' })
  email: string;

  @ApiProperty({
    description: 'Password — minimum 8 characters',
    example: 'Str0ng!Pass#2025',
    minLength: 8,
  })
  @IsString()
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password: string;

  @ApiProperty({
    description: 'First name of the user',
    example: 'Groom',
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty({ message: 'First name is required' })
  @MaxLength(50)
  firstName: string;

  @ApiProperty({
    description: 'Last name of the user',
    example: 'User',
    maxLength: 50,
  })
  @IsString()
  @IsNotEmpty({ message: 'Last name is required' })
  @MaxLength(50)
  lastName: string;

  @ApiProperty({
    description: 'Phone number in international format (e.g. +966501234567)',
    example: '+966501234567',
  })
  @IsString()
  @IsNotEmpty({ message: 'Phone number is required' })
  @Matches(/^\+?[1-9]\d{7,14}$/, {
    message:
      'Phone number must be a valid international format (e.g. +966501234567)',
  })
  phoneNumber: string;

  @ApiProperty({
    description: 'Account role (ADMIN or CLIENT)',
    enum: Role,
    example: Role.CLIENT,
  })
  @IsEnum(Role, { message: 'Role must be either ADMIN or CLIENT' })
  @IsNotEmpty({ message: 'Role is required' })
  role: Role;

  @ApiPropertyOptional({
    description: 'Active status of the user',
    example: true,
  })
  @IsBoolean({ message: 'isActive must be a boolean value' })
  @IsOptional()
  isActive?: boolean;
}

export class UpdateUserByAdminDto {
  @ApiPropertyOptional({
    description: 'User email address',
    example: 'edited@mazoomen.app',
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({
    description: 'Password — minimum 8 characters',
    example: 'Str0ng!Pass#2025',
    minLength: 8,
  })
  @IsString()
  @IsOptional()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  password?: string;

  @ApiPropertyOptional({
    description: 'First name of the user',
    example: 'EditedGroom',
    maxLength: 50,
  })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  firstName?: string;

  @ApiPropertyOptional({
    description: 'Last name of the user',
    example: 'EditedUser',
    maxLength: 50,
  })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  lastName?: string;

  @ApiPropertyOptional({
    description: 'Phone number in international format (e.g. +966501234567)',
    example: '+966501234567',
  })
  @IsString()
  @IsOptional()
  @Matches(/^\+?[1-9]\d{7,14}$/, {
    message:
      'Phone number must be a valid international format (e.g. +966501234567)',
  })
  phoneNumber?: string;

  @ApiPropertyOptional({
    description: 'Account role (ADMIN or CLIENT)',
    enum: Role,
    example: Role.CLIENT,
  })
  @IsEnum(Role, { message: 'Role must be either ADMIN or CLIENT' })
  @IsOptional()
  role?: Role;

  @ApiPropertyOptional({
    description: 'Active status of the user',
    example: true,
  })
  @IsBoolean({ message: 'isActive must be a boolean value' })
  @IsOptional()
  isActive?: boolean;
}
