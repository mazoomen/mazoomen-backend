import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { Roles, GetUser } from '../auth/decorators';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { ContactService } from './contact.service';
import { CreateContactDto, ReplyContactDto, UpdateContactStatusDto } from './dto';

@ApiTags('Contact')
@Controller('contact')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  /**
   * POST /contact
   * Submit a contact message. Authenticated users only.
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Submit contact message',
    description: 'Allows authenticated users to send a message / issue report to admins.',
  })
  @ApiResponse({ status: 201, description: 'Contact message submitted successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized — requires login' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  create(
    @GetUser('id') userId: string,
    @Body() dto: CreateContactDto,
  ) {
    return this.contactService.create(userId, dto);
  }

  /**
   * GET /contact/admin
   * Get all contact messages for admin. Admin only.
   */
  @Get('admin')
  @Roles(Role.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get all contact messages (Admin)',
    description: 'Retrieves all contact submissions ordered by submission date.',
  })
  @ApiResponse({ status: 200, description: 'List of contact messages' })
  findAllAdmin() {
    return this.contactService.findAllAdmin();
  }

  /**
   * POST /contact/admin/:id/reply
   * Reply to a contact message. Admin only.
   */
  @Post('admin/:id/reply')
  @Roles(Role.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Reply to contact message (Admin)',
    description: 'Adds an admin reply to a contact submission and sends a notification to the user.',
  })
  @ApiResponse({ status: 200, description: 'Reply submitted successfully' })
  @ApiResponse({ status: 404, description: 'Message not found' })
  replyAdmin(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReplyContactDto,
  ) {
    return this.contactService.replyAdmin(id, dto.reply);
  }

  /**
   * PATCH /contact/admin/:id/status
   * Update message status (UNREAD, READ, RESOLVED, REPLIED). Admin only.
   */
  @Patch('admin/:id/status')
  @Roles(Role.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Update contact message status (Admin)',
    description: 'Updates status of contact message to UNREAD, READ, RESOLVED, or REPLIED.',
  })
  @ApiResponse({ status: 200, description: 'Status updated' })
  @ApiResponse({ status: 404, description: 'Message not found' })
  updateStatusAdmin(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateContactStatusDto,
  ) {
    return this.contactService.updateStatusAdmin(id, dto);
  }

  /**
   * DELETE /contact/admin/:id
   * Delete contact message. Admin only.
   */
  @Delete('admin/:id')
  @Roles(Role.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Delete contact message (Admin)',
    description: 'Deletes a contact message by ID.',
  })
  @ApiResponse({ status: 200, description: 'Message deleted' })
  @ApiResponse({ status: 404, description: 'Message not found' })
  removeAdmin(@Param('id', ParseUUIDPipe) id: string) {
    return this.contactService.removeAdmin(id);
  }
}
