import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const logger = new Logger('Bootstrap');

  // ── Trust Proxy ───────────────────────────────────────────────────
  // Enables correct client IP parsing when hosted behind reverse proxies (Nginx, Cloudflare, etc.)
  app.set('trust proxy', true);

  // ── Security Headers ──────────────────────────────────────────────
  app.use(helmet());
  app.use(cookieParser());

  // ── Static Assets ─────────────────────────────────────────────────
  app.useStaticAssets(join(process.cwd(), 'public'), {
    prefix: '/public/',
    setHeaders: (res, path) => {
      // 1. Strict Content-Security-Policy to block script execution (even if HTML/SVG is served)
      res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");

      // 2. Prevent MIME-type sniffing
      res.setHeader('X-Content-Type-Options', 'nosniff');

      // 3. Restrict inline execution: only allow safe media formats (images/audio) to render inline
      const lowercasePath = path.toLowerCase();
      if (
        lowercasePath.endsWith('.jpg') ||
        lowercasePath.endsWith('.jpeg') ||
        lowercasePath.endsWith('.png') ||
        lowercasePath.endsWith('.gif') ||
        lowercasePath.endsWith('.webp') ||
        lowercasePath.endsWith('.mp3') ||
        lowercasePath.endsWith('.wav') ||
        lowercasePath.endsWith('.ogg')
      ) {
        res.setHeader('Content-Disposition', 'inline');
      } else {
        // Force file download for any other extension format
        res.setHeader('Content-Disposition', 'attachment');
      }
    },
  });

  // ── Global Filters & Interceptors ─────────────────────────────────
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new LoggingInterceptor());

  // ── CORS ──────────────────────────────────────────────────────────
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3001',
    credentials: true,
  });

  // ── Validation ────────────────────────────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // Strip properties not in the DTO
      forbidNonWhitelisted: true, // Throw if unknown properties are sent
      transform: true, // Auto-transform payloads to DTO instances
    }),
  );

  // ── Swagger / OpenAPI ─────────────────────────────────────────────
  // Only enable Swagger in non-production environments
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const config = new DocumentBuilder()
      .setTitle('Mazoomen API')
      .setDescription(
        'REST API for **Mazoomen** — a premium digital invitation platform. ' +
          'Manage templates, orders, invitations, and guest RSVPs.',
      )
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Enter your JWT token',
        },
        'JWT-auth',
      )
      .build();

    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
      },
    });
    logger.log('Swagger UI available at /api');
  }

  // ── Start Server ──────────────────────────────────────────────────
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;
  await app.listen(port, '0.0.0.0');
  logger.log(`Mazoomen API running on port ${port}`);
}
bootstrap();
