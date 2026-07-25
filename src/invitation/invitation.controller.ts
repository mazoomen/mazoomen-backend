import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Put,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Req,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import * as express from 'express';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Throttle } from '@nestjs/throttler';
import { Role } from '@prisma/client';
import { JwtAuthGuard, OptionalJwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles, GetUser } from '../auth/decorators';
import { InvitationService } from './invitation.service';
import { AbuseService } from '../common/services/abuse.service';
import {
  CreateInvitationDto,
  UpdateInvitationDto,
  AddMomentDto,
  ToggleStatusDto,
} from './dto';

@ApiTags('Invitations')
@Controller('invitations')
export class InvitationController {
  constructor(
    private readonly invitationService: InvitationService,
    private readonly abuseService: AbuseService,
  ) {}

  /**
   * POST /invitations
   * Creates a new invitation. Client only.
   * The client must have an APPROVED order for the chosen template.
   */
  @Post()
  @Roles(Role.CLIENT)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Create a new invitation',
    description:
      'Creates a digital invitation for the authenticated client. ' +
      'Requires an APPROVED order for the specified template.',
  })
  @ApiResponse({
    status: 201,
    description: 'Invitation created successfully',
    schema: {
      example: {
        id: 'e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b',
        userId: 'c3a1e1d0-4f6a-4b2c-9e8f-1a2b3c4d5e6f',
        templateId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        slug: 'ahmed-wedding',
        eventDate: '2025-09-15T18:00:00.000Z',
        locationUrl: 'https://maps.google.com/?q=24.7136,46.6753',
        welcomeText: 'يسرنا دعوتكم لحضور حفل زفاف أحمد وسارة',
        images: [
          'https://cdn.mazoomen.app/img/photo1.jpg',
          'https://cdn.mazoomen.app/img/photo2.jpg',
        ],
        musicUrl: 'https://cdn.mazoomen.app/audio/wedding-nasheed.mp3',
        createdAt: '2025-09-01T12:00:00.000Z',
        template: {
          id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
          title: 'Royal Gold Wedding',
          thumbnailUrl: 'https://cdn.mazoomen.app/templates/royal-gold.jpg',
        },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'No approved order for this template',
    schema: {
      example: {
        statusCode: 400,
        message:
          'You do not have an approved order for this template. ' +
          'Please purchase the template and wait for admin approval before creating an invitation.',
        error: 'Bad Request',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid JWT',
  })
  @ApiResponse({
    status: 409,
    description: 'Slug already taken',
    schema: {
      example: {
        statusCode: 409,
        message:
          'The slug "ahmed-wedding" is already taken. Please choose a different one.',
        error: 'Conflict',
      },
    },
  })
  create(@GetUser('id') userId: string, @Body() dto: CreateInvitationDto) {
    return this.invitationService.create(userId, dto);
  }

  /**
   * PUT /invitations/:id
   * Updates an existing invitation. Client (must be the owner) or Admin.
   */
  @Put(':id')
  @Roles(Role.CLIENT, Role.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Update an invitation',
    description:
      'Updates an existing invitation. Only the invitation owner (client) or an admin can update it. ' +
      'The templateId cannot be changed.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID of the invitation to update',
    example: 'e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b',
  })
  @ApiResponse({ status: 200, description: 'Invitation updated successfully' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid JWT',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — you are not the owner of this invitation',
  })
  @ApiResponse({ status: 404, description: 'Invitation not found' })
  @ApiResponse({ status: 409, description: 'Slug already taken' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser('id') userId: string,
    @GetUser('role') role: string,
    @Body() dto: UpdateInvitationDto,
  ) {
    return this.invitationService.update(id, userId, role, dto);
  }

  /**
   * POST /invitations/:id/moments
   * Adds a moment (photo link) to the invitation.
   * Uses optional auth — authenticated users get ownership checks,
   * anonymous guests are allowed if guest uploads are enabled.
   */
  @Post(':id/moments')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Add a photo moment to the invitation',
    description: 'Enables guests or hosts to add photos/moments.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID of the invitation',
    example: 'e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b',
  })
  addMoment(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AddMomentDto,
    @GetUser('id') userId?: string,
  ) {
    return this.invitationService.addMoment(id, dto.url, userId);
  }

  /**
   * POST /invitations/:id/guest-upload
   * Public endpoint — allows anonymous guests to upload images to invitation moments.
   * Rate limited to prevent upload spam and DDoS vectors.
   */
  @Throttle({ default: { ttl: 60000, limit: 3 } }) // Limit to 3 files per minute per IP
  @Post(':id/guest-upload')
  @ApiOperation({
    summary: 'Upload an image as a guest (no auth required)',
    description:
      'Allows anonymous guests to upload photos/moments if permitted by the invitation configuration.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID of the invitation',
    example: 'e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b',
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit at Multer level
      },
    }),
  )
  async guestUpload(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Req() req: express.Request,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    const ip = this.abuseService.extractIp(req);
    return this.invitationService.guestUpload(id, file, ip);
  }

  /**
   * GET /invitations/slug/:slug
   * Public endpoint — used by the frontend to fetch invitation data
   * when a guest opens a shareable link (e.g. mazoomen.com/invite/ahmed-wedding).
   * Uses optional auth to allow owner/admin access to deactivated invitations.
   */
  @Get('slug/:slug')
  @UseGuards(OptionalJwtAuthGuard)
  @ApiOperation({
    summary: 'Get invitation by slug (Public)',
    description:
      'Fetches a published invitation by its unique slug. ' +
      'Used by the frontend when a guest opens a shareable link.',
  })
  @ApiParam({
    name: 'slug',
    description: 'Unique URL slug of the invitation',
    example: 'ahmed-wedding',
  })
  @ApiResponse({
    status: 200,
    description: 'Invitation data',
    schema: {
      example: {
        id: 'e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b',
        templateId: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        slug: 'ahmed-wedding',
        eventDate: '2025-09-15T18:00:00.000Z',
        locationUrl: 'https://maps.google.com/?q=24.7136,46.6753',
        welcomeText: 'يسرنا دعوتكم لحضور حفل زفاف أحمد وسارة',
        images: [
          'https://cdn.mazoomen.app/img/photo1.jpg',
          'https://cdn.mazoomen.app/img/photo2.jpg',
        ],
        musicUrl: 'https://cdn.mazoomen.app/audio/wedding-nasheed.mp3',
        createdAt: '2025-09-01T12:00:00.000Z',
        template: {
          id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
          title: 'Royal Gold Wedding',
          thumbnailUrl: 'https://cdn.mazoomen.app/templates/royal-gold.jpg',
          demoLink: 'https://demo.mazoomen.app/royal-gold',
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Invitation not found' })
  findBySlug(
    @Param('slug') slug: string,
    @Req() req: express.Request,
    @GetUser('id') userId?: string,
    @GetUser('role') role?: Role,
  ) {
    const ip = this.abuseService.extractIp(req);
    return this.invitationService.findBySlug(slug, ip, userId, role);
  }

  /**
   * GET /invitations/:id/rsvps
   * Returns all RSVPs for a specific invitation with statistics.
   * Client only (must be the invitation owner).
   */
  @Get(':id/rsvps')
  @Roles(Role.CLIENT, Role.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get RSVPs for an invitation',
    description:
      'Returns all RSVP responses for a specific invitation, including attendance statistics. ' +
      'Accessible by the invitation owner or platform admins.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID of the invitation',
    example: 'e1f2a3b4-c5d6-4e7f-8a9b-0c1d2e3f4a5b',
  })
  @ApiResponse({
    status: 200,
    description: 'RSVPs with statistics',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid JWT',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden — you are not authorized to view RSVPs for this invitation',
  })
  @ApiResponse({ status: 404, description: 'Invitation not found' })
  findRsvps(
    @Param('id', ParseUUIDPipe) id: string,
    @GetUser('id') userId: string,
    @GetUser('role') role: Role,
  ) {
    return this.invitationService.findRsvps(id, userId, role);
  }

  /**
   * PATCH /invitations/:id/status
   * Toggles invitation activation status. Admin only.
   */
  @Patch(':id/status')
  @Roles(Role.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Toggle invitation activation status (Admin)',
    description:
      'Allows admins to activate/deactivate a user invitation. Requires ADMIN role.',
  })
  @ApiResponse({
    status: 200,
    description: 'Invitation status toggled successfully',
  })
  toggleStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ToggleStatusDto,
  ) {
    return this.invitationService.toggleStatus(id, dto.isActive);
  }

  /**
   * GET /invitations/download-file
   * Proxies a file download, forcing attachment headers to prevent opening in tab.
   */
  @Get('download-file')
  async downloadFile(
    @Query('url') url: string,
    @Res({ passthrough: true }) res: express.Response,
  ) {
    if (!url) {
      throw new BadRequestException('URL query parameter is required');
    }

    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
        throw new BadRequestException('Invalid URL protocol');
      }
    } catch {
      throw new BadRequestException('Invalid URL');
    }

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new BadRequestException('Failed to fetch file');
      }

      const filename = url.split('/').pop()?.split('?')[0] || 'download.jpg';
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Content-Type', response.headers.get('content-type') || 'image/jpeg');

      const { Readable } = require('stream');
      const nodeStream = Readable.fromWeb(response.body as any);
      return new StreamableFile(nodeStream);
    } catch (err) {
      throw new BadRequestException('Failed to stream file');
    }
  }
}
