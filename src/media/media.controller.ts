import {
  Controller,
  Post,
  Delete,
  Param,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { memoryStorage } from 'multer';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/decorators';
import { MediaService } from './media.service';

@ApiTags('Media')
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Upload a media file (image or video) to AWS S3',
    description:
      'Accepts multipart/form-data with a "file" field. ' +
      'Validates that the file type is jpeg, png, webp, mp4, or webm. ' +
      'Uploads the file to S3 and returns the metadata.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiResponse({ status: 201, description: 'File uploaded successfully and metadata saved' })
  @ApiResponse({ status: 400, description: 'Invalid file type, size, or format' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB maximum Multer-level limit
      },
    }),
  )
  async uploadMedia(
    @UploadedFile()
    file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    return this.mediaService.uploadMedia(file);
  }

  @Delete('cleanup-orphans')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.ADMIN)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Clean up orphaned media files from S3 and database (Admin only)',
    description: 'Finds media files not referenced by any invitation or template and deletes them from AWS S3 and database.',
  })
  @ApiResponse({ status: 200, description: 'Orphaned media cleaned up successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden — Admin access required' })
  async cleanupOrphans() {
    return this.mediaService.cleanupOrphans();
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a media file from S3 and database by ID',
    description: 'Removes the object from AWS S3 first, and then deletes the record from the database.',
  })
  @ApiParam({ name: 'id', description: 'UUID of the media record to delete' })
  @ApiResponse({ status: 204, description: 'Media successfully deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Media not found' })
  async deleteMedia(
    @Param('id', new ParseUUIDPipe())
    id: string,
  ) {
    await this.mediaService.deleteMedia(id);
  }
}

