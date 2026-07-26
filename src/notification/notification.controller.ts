import { Controller, Delete, Get, Param, ParseUUIDPipe, Patch, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { GetUser } from '../auth/decorators';
import { JwtAuthGuard } from '../auth/guards';
import { NotificationService } from './notification.service';

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  /**
   * GET /notifications
   * Get all notifications for current user.
   */
  @Get()
  @ApiOperation({
    summary: 'Get user notifications',
    description: 'Retrieves all notifications for the authenticated user ordered by date.',
  })
  @ApiResponse({ status: 200, description: 'List of notifications' })
  findAll(@GetUser('id') userId: string) {
    return this.notificationService.findAllForUser(userId);
  }

  /**
   * PATCH /notifications/read-all
   * Mark all notifications as read.
   */
  @Patch('read-all')
  @ApiOperation({
    summary: 'Mark all notifications as read',
    description: 'Updates all unread notifications for the user to read status.',
  })
  @ApiResponse({ status: 200, description: 'All marked as read' })
  markAllAsRead(@GetUser('id') userId: string) {
    return this.notificationService.markAllAsRead(userId);
  }

  /**
   * PATCH /notifications/:id/read
   * Mark a single notification as read.
   */
  @Patch(':id/read')
  @ApiOperation({
    summary: 'Mark notification as read',
    description: 'Marks a specific notification as read.',
  })
  @ApiResponse({ status: 200, description: 'Notification marked as read' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  markAsRead(
    @GetUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notificationService.markAsRead(userId, id);
  }

  /**
   * DELETE /notifications/:id
   * Delete a notification.
   */
  @Delete(':id')
  @ApiOperation({
    summary: 'Delete notification',
    description: 'Deletes a notification by ID.',
  })
  @ApiResponse({ status: 200, description: 'Notification deleted' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  remove(
    @GetUser('id') userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.notificationService.remove(userId, id);
  }
}
