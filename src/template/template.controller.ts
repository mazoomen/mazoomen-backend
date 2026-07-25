import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Role } from '@prisma/client';
import { JwtAuthGuard, RolesGuard } from '../auth/guards';
import { Roles } from '../auth/decorators';
import { TemplateService } from './template.service';
import { CreateTemplateDto, UpdateTemplateDto } from './dto';

@ApiTags('Templates')
@Controller('templates')
export class TemplateController {
  constructor(private readonly templateService: TemplateService) {}

  /**
   * POST /templates
   * Creates a new invitation template. Admin only.
   */
  @Post()
  @Roles(Role.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Create a template (Admin)',
    description:
      'Creates a new invitation design template. Requires ADMIN role.',
  })
  @ApiResponse({
    status: 201,
    description: 'Template created successfully',
    schema: {
      example: {
        id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        title: 'Royal Gold Wedding',
        description:
          'A luxurious gold-themed wedding invitation template with elegant animations.',
        previewImage: 'https://cdn.mazoomen.app/templates/royal-gold.jpg',
        demoLink: 'https://demo.mazoomen.app/royal-gold',
        price: '149.99',
        editableFields: {
          eventTitle: { type: 'string', label: 'Event Title' },
          eventDate: { type: 'date', label: 'Event Date' },
        },
        isPremium: true,
        createdAt: '2025-09-01T12:00:00.000Z',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized — missing or invalid JWT',
  })
  @ApiResponse({ status: 403, description: 'Forbidden — requires ADMIN role' })
  @ApiResponse({
    status: 400,
    description: 'Validation failed — invalid input data',
  })
  create(@Body() dto: CreateTemplateDto) {
    return this.templateService.create(dto);
  }

  /**
   * GET /templates
   * Returns all available templates. Public endpoint.
   */
  @Get()
  @ApiOperation({
    summary: 'List all templates (Public)',
    description:
      'Returns all available invitation templates, sorted by newest first. No authentication required.',
  })
  @ApiResponse({
    status: 200,
    description: 'List of all templates',
    schema: {
      example: [
        {
          id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
          title: 'Royal Gold Wedding',
          description:
            'A luxurious gold-themed wedding invitation template with elegant animations.',
          previewImage: 'https://cdn.mazoomen.app/templates/royal-gold.jpg',
          demoLink: 'https://demo.mazoomen.app/royal-gold',
          price: '149.99',
          editableFields: {
            eventTitle: { type: 'string', label: 'Event Title' },
            eventDate: { type: 'date', label: 'Event Date' },
          },
          isPremium: true,
          createdAt: '2025-09-01T12:00:00.000Z',
        },
        {
          id: 'b2c3d4e5-f6a7-4b8c-9d0e-1f2a3b4c5d6e',
          title: 'Elegant Rose',
          description:
            'A romantic floral design perfect for weddings and anniversaries.',
          previewImage: 'https://cdn.mazoomen.app/templates/elegant-rose.jpg',
          demoLink: 'https://demo.mazoomen.app/elegant-rose',
          price: '99.99',
          editableFields: {
            eventTitle: { type: 'string', label: 'Event Title' },
            eventDate: { type: 'date', label: 'Event Date' },
          },
          isPremium: false,
          createdAt: '2025-08-20T10:00:00.000Z',
        },
      ],
    },
  })
  findAll(@Query('includeInactive') includeInactive?: string) {
    return this.templateService.findAll(includeInactive === 'true');
  }

  /**
   * GET /templates/:id
   * Returns a single template by ID. Public endpoint.
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Get a template by ID (Public)',
    description:
      'Returns a single invitation template by its UUID. No authentication required.',
  })
  @ApiParam({
    name: 'id',
    description: 'UUID of the template',
    example: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
  })
  @ApiResponse({
    status: 200,
    description: 'Template details',
    schema: {
      example: {
        id: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
        title: 'Royal Gold Wedding',
        description:
          'A luxurious gold-themed wedding invitation template with elegant animations.',
        previewImage: 'https://cdn.mazoomen.app/templates/royal-gold.jpg',
        demoLink: 'https://demo.mazoomen.app/royal-gold',
        price: '149.99',
        editableFields: {
          eventTitle: { type: 'string', label: 'Event Title' },
          eventDate: { type: 'date', label: 'Event Date' },
        },
        isPremium: true,
        createdAt: '2025-09-01T12:00:00.000Z',
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Template not found',
    schema: {
      example: {
        statusCode: 404,
        message: 'Template with ID "a1b2c3d4-..." not found',
        error: 'Not Found',
      },
    },
  })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.templateService.findOne(id);
  }

  /**
   * PUT /templates/:id
   * Updates an existing invitation template or changes its status. Admin only.
   */
  @Put(':id')
  @Roles(Role.ADMIN)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Update a template (Admin)',
    description:
      'Updates details or toggles activation status of an existing template. Requires ADMIN role.',
  })
  @ApiResponse({ status: 200, description: 'Template updated successfully' })
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.templateService.update(id, dto);
  }
}
