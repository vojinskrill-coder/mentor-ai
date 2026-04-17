import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TenantModule } from '@mentor-ai/shared/tenant-context';
import { AgentExecutionModule } from '../agent-execution/agent-execution.module';
import { OpenClawTenantModule } from '../openclaw-tenant/openclaw-tenant.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { AiGatewayModule } from '../ai-gateway/ai-gateway.module';
import { ProcessController } from './process.controller';
import { ProcessExecutorService } from './process-executor.service';
import { ProcessSchedulerService } from './process-scheduler.service';
import { SchemaValidatorService } from './schema-validator.service';
import { ProcessDeduplicationService } from './process-dedup.service';
import { FalImageService } from './fal-image.service';
import { N8nModule } from '../n8n/n8n.module';
import { ProductImagesModule } from '../product-images/product-images.module';

/**
 * Process Workflow Engine Module
 *
 * Provides process definition, execution, scheduling, and validation.
 * Orchestrates agents through multi-step business processes:
 * - n8n for workflow execution (default when n8n workflow exists)
 * - OpenClaw for agentic steps requiring tool use
 * - JSON Schema validation and approval gates
 */
@Module({
  imports: [
    ConfigModule,
    TenantModule,
    forwardRef(() => AgentExecutionModule), // For OpenClawClientService
    OpenClawTenantModule, // For SSH deploy of SKILL.md
    AiGatewayModule, // For auto-generate skills
    KnowledgeModule, // For EmbeddingService (lead dedup)
    N8nModule, // For n8n workflow execution
    ProductImagesModule, // For product image context in content processes
  ],
  controllers: [ProcessController],
  providers: [
    ProcessExecutorService,
    ProcessSchedulerService,
    SchemaValidatorService,
    ProcessDeduplicationService,
    FalImageService,
  ],
  exports: [ProcessExecutorService, ProcessSchedulerService, FalImageService, ProcessDeduplicationService],
})
export class ProcessModule {}
