import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class ReplyContactDto {
  @ApiProperty({ example: 'Thank you for reaching out, we have updated your account.', description: 'Admin reply text' })
  @IsString()
  @IsNotEmpty({ message: 'Reply message is required' })
  @MaxLength(3000, { message: 'Reply message must not exceed 3000 characters' })
  reply: string;
}
