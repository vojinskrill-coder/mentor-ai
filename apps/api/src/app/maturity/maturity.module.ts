import { Module, forwardRef } from '@nestjs/common';
import { TenantModule } from '@mentor-ai/shared/tenant-context';
import { AuthModule } from '../auth/auth.module';
import { AiGatewayModule } from '../ai-gateway/ai-gateway.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { AgentExecutionModule } from '../agent-execution/agent-execution.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { MaturityEngineService } from './maturity-engine.service';
import { StageClassifierService } from './stage-classifier.service';
import { StalenessDetectorService } from './staleness-detector.service';
import { WsServerHolder } from './ws-server-holder.service';
import { HeadlessExecutorService } from './headless-executor.service';
import { AutonomousSchedulerService } from './autonomous-scheduler.service';
import { CrossPersonaIntelligenceService } from './cross-persona-intelligence.service';
import { MaturityController } from './maturity.controller';

/**
 * Business Maturity Engine module.
 * Manages stage progression (BASIC → ADVANCED → AUTONOMOUS),
 * persona-driven concept classification, staleness detection,
 * cross-concept ordering, and autonomous execution.
 */
@Module({
  imports: [
    TenantModule,
    AuthModule,
    AiGatewayModule,
    forwardRef(() => WorkflowModule), // circular: WorkflowModule imports MaturityModule
    AgentExecutionModule,
    KnowledgeModule,
  ],
  controllers: [MaturityController],
  providers: [
    MaturityEngineService,
    StageClassifierService,
    StalenessDetectorService,
    WsServerHolder,
    HeadlessExecutorService,
    AutonomousSchedulerService,
    CrossPersonaIntelligenceService,
  ],
  exports: [
    MaturityEngineService,
    HeadlessExecutorService,
    StalenessDetectorService,
    WsServerHolder,
  ],
})
export class MaturityModule {}
