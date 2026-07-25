import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { MediaModule } from '../media/media.module';
import { TemplateController } from './template.controller';
import { TemplateService } from './template.service';

@Module({
  imports: [AuthModule, MediaModule],
  controllers: [TemplateController],
  providers: [TemplateService],
  exports: [TemplateService],
})
export class TemplateModule {}

