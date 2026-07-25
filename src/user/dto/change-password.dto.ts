import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  @ApiProperty({
    description: '6-digit OTP code received by email',
    example: '123456',
  })
  @IsString()
  @IsNotEmpty({ message: 'OTP code is required' })
  otp: string;

  @ApiProperty({
    description: 'New password — minimum 8 characters',
    example: 'NewPass#2026',
  })
  @IsString()
  @IsNotEmpty({ message: 'New password is required' })
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(128, { message: 'Password must not exceed 128 characters' })
  @Matches(/((?=.*\d)|(?=.*\W+))(?![.\n])(?=.*[A-Z])(?=.*[a-z]).*$/, {
    message: 'errors.password_weak',
  })
  newPassword: string;
}
