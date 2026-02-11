import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from '../auth/auth.module';
import { EmailModule } from '@mentor-ai/shared/email';
import { TenantModule } from '@mentor-ai/shared/tenant-context';
import { TenantDeletionController } from './tenant-deletion.controller';
import { TenantDeletionService } from './tenant-deletion.service';
import { TenantDeletionProcessor } from './tenant-deletion.processor';
import { DeletionThrottlerGuard } from './guards/deletion-throttler.guard';

@Module({
  imports: [
    ConfigModule,
    AuthModule,
    EmailModule,
    TenantModule, // Provides PlatformPrismaService
    ThrottlerModule.forRoot([
      {
        name: 'deletion-daily',
        ttl: 86400000, // 24 hours in ms
        limit: 3,
      },
    ]),
    BullModule.registerQueueAsync({
      name: 'tenant-deletion',
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
  ],
  controllers: [TenantDeletionController],
  providers: [TenantDeletionService, TenantDeletionProcessor, DeletionThrottlerGuard],
  exports: [TenantDeletionService],
})
export class TenantDeletionModule {}
