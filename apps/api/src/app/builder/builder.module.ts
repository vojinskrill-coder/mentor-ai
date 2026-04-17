import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TenantModule } from '@mentor-ai/shared/tenant-context';
import { N8nModule } from '../n8n/n8n.module';
import { AgentExecutionModule } from '../agent-execution/agent-execution.module';
import { AppEventsModule } from '../events/events.module';
import { BuilderController } from './builder.controller';
import { McpCatalogService } from './mcp-catalog.service';
import { ProcessDraftService } from './process-draft.service';
import { N8nWorkflowGeneratorService } from './n8n-workflow-generator.service';
import { NotionDatabaseCreatorService } from './notion-database-creator.service';
import { ProcessDeployService } from './process-deploy.service';
import { ProcessArtifactsService } from './process-artifacts.service';
import { BuilderOrchestratorService } from './builder-orchestrator.service';
import { ProcessWizardService } from './process-wizard.service';

/**
 * Neuron Process Builder module.
 *
 * Phase 1: MCP catalog reads.
 * Phase 3A: Draft CRUD via ProcessDraftService.
 * Phase 3B: Real deploy — n8n workflow generation + Notion database
 *           creation + persistence on draft.invocationConfig.
 * Phase 5 (TBD): Publish flow — per-process agent rendering + promotion.
 */
@Module({
  imports: [
    ConfigModule,
    TenantModule,
    N8nModule,
    AgentExecutionModule,
    AppEventsModule,
  ],
  controllers: [BuilderController],
  providers: [
    McpCatalogService,
    ProcessDraftService,
    N8nWorkflowGeneratorService,
    NotionDatabaseCreatorService,
    ProcessDeployService,
    ProcessArtifactsService,
    BuilderOrchestratorService,
    ProcessWizardService,
  ],
  exports: [
    McpCatalogService,
    ProcessDraftService,
    N8nWorkflowGeneratorService,
    NotionDatabaseCreatorService,
    ProcessDeployService,
    ProcessArtifactsService,
  ],
})
export class BuilderModule {}
