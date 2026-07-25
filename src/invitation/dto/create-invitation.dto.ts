import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUrl,
  IsUUID,
  Matches,
  MaxLength,
  ArrayMaxSize,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class EventProgramItemDto {
  [key: string]: any;

  @ApiProperty({ description: 'Time of the program item', example: '8:00 م' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50, { message: 'Program item time must not exceed 50 characters' })
  time: string;

  @ApiPropertyOptional({
    description: 'Title/Description of the program item',
    example: 'الاستقبال',
  })
  @IsString()
  @IsOptional()
  @MaxLength(150, {
    message: 'Program item title must not exceed 150 characters',
  })
  title?: string;

  @ApiPropertyOptional({
    description: 'Arabic title of the program item',
    example: 'الاستقبال',
  })
  @IsString()
  @IsOptional()
  @MaxLength(150, {
    message: 'Program item Arabic title must not exceed 150 characters',
  })
  titleAr?: string;

  @ApiPropertyOptional({
    description: 'English title of the program item',
    example: 'Reception',
  })
  @IsString()
  @IsOptional()
  @MaxLength(150, {
    message: 'Program item English title must not exceed 150 characters',
  })
  titleEn?: string;
}

export class EventDetailsItemDto {
  [key: string]: any;

  @ApiPropertyOptional({
    description: 'Event detail rule or guideline text',
    example: 'الدخول عبر رمز QR فقط',
  })
  @IsString()
  @IsOptional()
  @MaxLength(300, {
    message: 'Event detail text must not exceed 300 characters',
  })
  text?: string;

  @ApiPropertyOptional({
    description: 'Arabic event detail rule or guideline text',
    example: 'الدخول عبر رمز QR فقط',
  })
  @IsString()
  @IsOptional()
  @MaxLength(300, {
    message: 'Arabic event detail text must not exceed 300 characters',
  })
  textAr?: string;

  @ApiPropertyOptional({
    description: 'English event detail rule or guideline text',
    example: 'Entry via QR code only',
  })
  @IsString()
  @IsOptional()
  @MaxLength(300, {
    message: 'English event detail text must not exceed 300 characters',
  })
  textEn?: string;
}

export class CreateInvitationDto {
  @ApiProperty({
    description: 'UUID of the template purchase to use for this invitation',
    example: 'a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d',
    format: 'uuid',
  })
  @IsUUID('4', { message: 'purchaseId must be a valid UUID' })
  @IsNotEmpty({ message: 'Purchase ID is required' })
  purchaseId: string;

  @ApiProperty({
    description:
      'URL-friendly slug for the shareable link (e.g. mazoomen.com/invite/ahmed-wedding)',
    example: 'ahmed-wedding',
  })
  @IsString()
  @IsNotEmpty({ message: 'Slug is required' })
  @MaxLength(100, { message: 'Slug must not exceed 100 characters' })
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message:
      'Slug must be lowercase alphanumeric with hyphens only (e.g. "ahmed-wedding")',
  })
  slug: string;

  @ApiProperty({
    description: 'Title of the event or couple names',
    example: 'حفل زفاف أحمد وسارة',
  })
  @IsString()
  @IsNotEmpty({ message: 'Event title is required' })
  @MaxLength(200, { message: 'Event title must not exceed 200 characters' })
  eventTitle: string;

  @ApiProperty({
    description: 'Location of the event (venue name or description)',
    example: 'قاعة الروابي - الرياض',
  })
  @IsString()
  @IsNotEmpty({ message: 'Event location is required' })
  @MaxLength(300, { message: 'Event location must not exceed 300 characters' })
  eventLocation: string;

  @ApiProperty({
    description: 'Event date and time in ISO 8601 format',
    example: '2025-09-15T18:00:00.000Z',
  })
  @IsDateString({}, { message: 'eventDate must be a valid ISO 8601 date' })
  @IsNotEmpty({ message: 'Event date is required' })
  eventDate: string;

  @ApiPropertyOptional({
    description: 'Google Maps or venue URL for the event location',
    example: 'https://maps.google.com/?q=24.7136,46.6753',
  })
  @IsOptional()
  @IsUrl({}, { message: 'locationUrl must be a valid URL' })
  @MaxLength(500, { message: 'Location URL must not exceed 500 characters' })
  locationUrl?: string;

  @ApiPropertyOptional({
    description: 'Welcome / greeting message displayed on the invitation',
    example: 'يسرنا دعوتكم لحضور حفل زفاف أحمد وسارة',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000, { message: 'Welcome text must not exceed 1000 characters' })
  welcomeText?: string;

  @ApiPropertyOptional({
    description: 'Array of image URLs to display in the invitation gallery',
    example: [
      'https://cdn.mazoomen.app/img/photo1.jpg',
      'https://cdn.mazoomen.app/img/photo2.jpg',
    ],
    type: [String],
  })
  @IsOptional()
  @IsArray({ message: 'images must be an array of URLs' })
  @ArrayMaxSize(20, { message: 'Gallery images list cannot exceed 20 items' })
  @IsUrl({}, { each: true, message: 'Each image must be a valid URL' })
  @MaxLength(500, {
    each: true,
    message: 'Image URLs must not exceed 500 characters',
  })
  images?: string[];

  @ApiPropertyOptional({
    description: 'Optional background music URL for the invitation page',
    example: 'https://cdn.mazoomen.app/audio/wedding-nasheed.mp3',
  })
  @IsOptional()
  @IsUrl({}, { message: 'musicUrl must be a valid URL' })
  @MaxLength(500, { message: 'Music URL must not exceed 500 characters' })
  musicUrl?: string;

  @ApiPropertyOptional({
    description: 'Array of event program / timeline items',
    type: [EventProgramItemDto],
  })
  @IsOptional()
  @IsArray({ message: 'eventProgram must be an array' })
  @ArrayMaxSize(30, { message: 'eventProgram cannot exceed 30 items' })
  @ValidateNested({ each: true })
  @Type(() => EventProgramItemDto)
  eventProgram?: EventProgramItemDto[];

  @ApiPropertyOptional({
    description: 'Array of event detail / guideline items',
    type: [EventDetailsItemDto],
  })
  @IsOptional()
  @IsArray({ message: 'eventDetails must be an array' })
  @ArrayMaxSize(30, { message: 'eventDetails cannot exceed 30 items' })
  @ValidateNested({ each: true })
  @Type(() => EventDetailsItemDto)
  eventDetails?: EventDetailsItemDto[];

  @ApiPropertyOptional({
    description: 'The language configuration chosen by the client',
    example: 'both',
    default: 'both',
  })
  @IsString()
  @IsOptional()
  @MaxLength(20, { message: 'Language mode must not exceed 20 characters' })
  languageMode?: string;

  @ApiPropertyOptional({
    description: 'Arabic event title / couple names',
    example: 'أحمد & سارة',
  })
  @IsString()
  @IsOptional()
  @MaxLength(200, {
    message: 'Arabic event title must not exceed 200 characters',
  })
  eventTitleAr?: string;

  @ApiPropertyOptional({
    description: 'English event title / couple names',
    example: 'Ahmed & Sarah',
  })
  @IsString()
  @IsOptional()
  @MaxLength(200, {
    message: 'English event title must not exceed 200 characters',
  })
  eventTitleEn?: string;

  @ApiPropertyOptional({
    description: 'Arabic location hall name',
    example: 'قاعة السمو، الرياض',
  })
  @IsString()
  @IsOptional()
  @MaxLength(300, {
    message: 'Arabic event location must not exceed 300 characters',
  })
  eventLocationAr?: string;

  @ApiPropertyOptional({
    description: 'English location hall name',
    example: 'Royal Hall, Riyadh',
  })
  @IsString()
  @IsOptional()
  @MaxLength(300, {
    message: 'English event location must not exceed 300 characters',
  })
  eventLocationEn?: string;

  @ApiPropertyOptional({
    description: 'Arabic welcome message text',
    example: 'يسرنا دعوتكم لمشاركتنا...',
  })
  @IsString()
  @IsOptional()
  @MaxLength(1000, {
    message: 'Arabic welcome text must not exceed 1000 characters',
  })
  welcomeTextAr?: string;

  @ApiPropertyOptional({
    description: 'English welcome message text',
    example: 'We are delighted to invite you...',
  })
  @IsString()
  @IsOptional()
  @MaxLength(1000, {
    message: 'English welcome text must not exceed 1000 characters',
  })
  welcomeTextEn?: string;

  @ApiPropertyOptional({
    description: 'WhatsApp Contact Name',
    example: 'أخو العريس',
  })
  @IsOptional()
  @IsString()
  @MaxLength(100, { message: 'Contact name must not exceed 100 characters' })
  contactName?: string;

  @ApiPropertyOptional({
    description: 'WhatsApp Contact Phone',
    example: '+966500000000',
  })
  @IsOptional()
  @IsString()
  @MaxLength(20, { message: 'Contact phone must not exceed 20 characters' })
  contactPhone?: string;

  @ApiPropertyOptional({
    description: 'Whether guests are allowed to upload moments/photos',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  allowGuestUploads?: boolean;

  @ApiPropertyOptional({
    description: 'Whether to show the guest moments/photos feed to guests',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  showMoments?: boolean;

  @ApiPropertyOptional({
    description: 'Whether guests are allowed to add companions to their RSVP response',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  allowCompanions?: boolean;

  @ApiPropertyOptional({
    description: 'Array of photo URLs/paths for moments',
    example: ['/public/uploads/moment1.jpg'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100, { message: 'Moments photo list cannot exceed 100 items' })
  @IsString({ each: true })
  @MaxLength(500, {
    each: true,
    message: 'Moment URLs must not exceed 500 characters',
  })
  moments?: string[];

  @ApiPropertyOptional({
    description: 'Array of photo URLs/paths for hidden moments',
    example: ['/public/uploads/moment1.jpg'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100, { message: 'Hidden moments photo list cannot exceed 100 items' })
  @IsString({ each: true })
  @MaxLength(500, {
    each: true,
    message: 'Hidden moment URLs must not exceed 500 characters',
  })
  hiddenMoments?: string[];

  @ApiPropertyOptional({
    description: 'Array of photo URLs/paths for soft-deleted moments',
    example: ['/public/uploads/moment1.jpg'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100, { message: 'Deleted moments list cannot exceed 100 items' })
  @IsString({ each: true })
  @MaxLength(500, {
    each: true,
    message: 'Deleted moment URLs must not exceed 500 characters',
  })
  deletedMoments?: string[];

  @ApiPropertyOptional({
    description: 'Array of photo URLs/paths for soft-deleted host gallery images',
    example: ['/public/uploads/image1.jpg'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100, { message: 'Deleted images list cannot exceed 100 items' })
  @IsString({ each: true })
  @MaxLength(500, {
    each: true,
    message: 'Deleted image URLs must not exceed 500 characters',
  })
  deletedImages?: string[];

  @ApiPropertyOptional({
    description: 'Unified array of photo URLs defining the custom display sequence',
    example: ['/public/uploads/image1.jpg', '/public/uploads/moment1.jpg'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200, { message: 'Gallery order list cannot exceed 200 items' })
  @IsString({ each: true })
  @MaxLength(500, {
    each: true,
    message: 'Gallery order URLs must not exceed 500 characters',
  })
  galleryOrder?: string[];

  @ApiPropertyOptional({
    description: 'Array of photo URLs/paths for hidden host gallery images',
    example: ['/public/uploads/image1.jpg'],
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100, { message: 'Hidden images list cannot exceed 100 items' })
  @IsString({ each: true })
  @MaxLength(500, {
    each: true,
    message: 'Hidden image URLs must not exceed 500 characters',
  })
  hiddenImages?: string[];
}
