/**
 * Mentor AI API Server
 */

import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app/app.module';
import { AllExceptionsFilter } from './app/common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const globalPrefix = 'api';
  app.setGlobalPrefix(globalPrefix);

  // CORS: use CORS_ORIGIN env var in production, localhost in dev
  const corsOrigin = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(',')
    : ['http://localhost:4200', 'http://127.0.0.1:4200'];
  app.enableCors({
    origin: corsOrigin,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Tenant-Id', 'X-Correlation-Id'],
    credentials: true,
  });

  // Log all incoming requests for debugging
  app.use((req: any, _res: any, next: any) => {
    if (req.url.includes('brochure')) {
      Logger.log(`[REQ] ${req.method} ${req.url} Content-Length: ${req.headers['content-length'] ?? 'none'}`, 'RequestLogger');
    }
    next();
  });

  // Global exception filter — RFC 7807 ProblemDetails for all errors
  app.useGlobalFilters(new AllExceptionsFilter());

  // Enable validation with class-validator
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    })
  );

  const port = process.env.PORT || 3000;
  await app.listen(port);
  Logger.log(`🚀 Application is running on: http://localhost:${port}/${globalPrefix}`);

  if (process.env.DEV_MODE === 'true') {
    Logger.warn('⚠️  DEV MODE ENABLED - Authentication bypassed for development');
  }
}

bootstrap();
