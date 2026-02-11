import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '@mentor-ai/shared/email';
import { TenantModule } from '@mentor-ai/shared/tenant-context';
import { DataExportController } from './data-export.controller';
import { DataExportService } from './data-export.service';
import { DataExportProcessor } from './data-export.processor';
import { UserProfileCollector } from './collectors/user-profile.collector';
import { InvitationsCollector } from './collectors/invitations.collector';
import { JsonGenerator } from './generators/json.generator';
import { MarkdownGenerator } from './generators/markdown.generator';
import { PdfGenerator } from './generators/pdf.generator';
import { UserThrottlerGuard } from './guards/user-throttler.guard';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    EmailModule,
    TenantModule, // Provides PlatformPrismaService
    BullModule.registerQueueAsync({
      name: 'data-export',
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
          password: configService.get<string>('REDIS_PASSWORD', ''),
          ...(configService.get<string>('REDIS_TLS', 'false') === 'true'
            ? { tls: {} }
            : {}),
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: { age: 86400 },
          removeOnFail: { age: 604800 },
        },
      }),
      inject: [ConfigService],
    }),
    ThrottlerModule.forRoot([
      {
        name: 'export-daily',
        ttl: 86400000, // 24 hours in ms
        limit: 3,
      },
    ]),
  ],
  controllers: [DataExportController],
  providers: [
    DataExportService,
    DataExportProcessor,
    UserProfileCollector,
    InvitationsCollector,
    JsonGenerator,
    MarkdownGenerator,
    PdfGenerator,
    UserThrottlerGuard,
  ],
  exports: [DataExportService],
})
export class DataExportModule {}
