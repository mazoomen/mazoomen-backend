import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({
    description: 'Registered email address',
    example: 'aiman@mazoomen.app',
  })
  @IsEmail()
  @Transform(({ value }) => value?.toLowerCase().trim())
  email: string;

  @ApiProperty({
    description: 'Account password',
    example: 'Str0ng!Pass#2025',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128, { message: 'Password must not exceed 128 characters' })
  password: string;
}
