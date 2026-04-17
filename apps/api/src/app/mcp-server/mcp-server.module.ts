import { Module } from '@nestjs/common';
import { TenantModule } from '@mentor-ai/shared/tenant-context';
import { McpServerController } from './mcp-server.controller';
import { McpAuthGuard } from './mcp-auth.guard';
import { ContentValidationModule } from '../content-validation/content-validation.module';
import { VaultStorageModule } from '../vault-storage/vault-storage.module';

@Module({
  imports: [TenantModule, ContentValidationModule, VaultStorageModule],
  controllers: [McpServerController],
  providers: [McpAuthGuard],
})
export class McpServerModule {}
