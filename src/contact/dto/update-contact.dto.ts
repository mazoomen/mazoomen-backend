import { ApiProperty } from '@nestjs/swagger';
import { ContactStatus } from '@prisma/client';
import { IsEnum, IsNotEmpty } from 'class-validator';

export class UpdateContactStatusDto {
  @ApiProperty({ enum: ContactStatus, example: ContactStatus.READ })
  @IsEnum(ContactStatus, { message: 'Status must be UNREAD, READ, or RESOLVED' })
  @IsNotEmpty()
  status: ContactStatus;
}
