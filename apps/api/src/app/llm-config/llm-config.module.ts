import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TenantModule } from '@mentor-ai/shared/tenant-context';
import { AuthModule } from '../auth/auth.module';
import { LlmConfigController } from './llm-config.controller';
import { LlmConfigService } from './llm-config.service';

@Module({
  imports: [ConfigModule, AuthModule, TenantModule], // TenantModule provides PlatformPrismaService
  controllers: [LlmConfigController],
  providers: [LlmConfigService],
  exports: [LlmConfigService],
})
export class LlmConfigModule {}
