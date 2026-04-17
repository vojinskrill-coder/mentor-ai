import { Module } from '@nestjs/common';
import { McpServerController } from './mcp-server.controller';
import { McpAuthGuard } from './mcp-auth.guard';
import { VaultStorageModule } from '../vault-storage/vault-storage.module';
import { ContentValidationModule } from '../content-validation/content-validation.module';
import { EnrichmentQueueModule } from '../enrichment-queue/enrichment-queue.module';
import { PlatformConfigModule } from '../platform-config/platform-config.module';

@Module({
  imports: [
    VaultStorageModule,
    ContentValidationModule,
    EnrichmentQueueModule,
    PlatformConfigModule,
  ],
  controllers: [McpServerController],
  providers: [McpAuthGuard],
})
export class McpServerModule {}
