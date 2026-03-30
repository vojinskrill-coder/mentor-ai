import { Module, forwardRef } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TenantModule } from '@mentor-ai/shared/tenant-context';
import { AgentExecutionModule } from '../agent-execution/agent-execution.module';
import { OpenClawTenantModule } from '../openclaw-tenant/openclaw-tenant.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { BridgeController } from './bridge.controller';
import { BridgeService } from './bridge.service';
import { BrainStateService } from './brain-state.service';

/**
 * Bridge Module
 *
 * Provides the REST API that OpenClaw calls via the mentor-ai-bridge skill.
 * This is the connection between OpenClaw (brain) and Mentor AI (state service).
 *
 * Architecture:
 * - BridgeController: REST endpoints (read state, write state)
 * - BridgeService: State operations + WebSocket event emission via AppEventBus
 * - BrainStateService: Tracks 9 BMC canvas block scan status per tenant
 */
@Module({
  imports: [
    ConfigModule,
    TenantModule,
    forwardRef(() => AgentExecutionModule), // For OpenClawClientService (notify on approval)
    OpenClawTenantModule, // For file proxy via SSH
    KnowledgeModule, // For semantic concept search via Qdrant
  ],
  controllers: [BridgeController],
  providers: [BridgeService, BrainStateService],
  exports: [BridgeService, BrainStateService],
})
export class BridgeModule {}
