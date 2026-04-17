import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TenantModule } from '@mentor-ai/shared/tenant-context';
import { AppEventsModule } from '../events/events.module';
import { ProcessModule } from '../process/process.module';
import { VaultModule } from '../vault/vault.module';
import { McpEvolutionService } from '../vault/mcp-evolution.service';
import { N8nOrchestratorService } from './n8n-orchestrator.service';
import { N8nCallbackController } from './n8n-callback.controller';

@Module({
  imports: [
    ConfigModule,
    TenantModule,
    AppEventsModule,
    forwardRef(() => ProcessModule),
    VaultModule, // For McpEvolutionService (spec drift propagation)
  ],
  controllers: [N8nCallbackController],
  providers: [
    N8nOrchestratorService,
    { provide: 'McpEvolutionService', useExisting: McpEvolutionService },
  ],
  exports: [N8nOrchestratorService],
})
export class N8nModule {}
