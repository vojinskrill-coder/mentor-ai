import { Module, forwardRef } from '@nestjs/common';
import { TenantModule } from '@mentor-ai/shared/tenant-context';
import { AuthModule } from '../auth/auth.module';
import { AiGatewayModule } from '../ai-gateway/ai-gateway.module';
import { NotesModule } from '../notes/notes.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { ConversationModule } from '../conversation/conversation.module';
import { WebSearchModule } from '../web-search/web-search.module';
import { FileUploadModule } from '../file-upload/file-upload.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { MaturityModule } from '../maturity/maturity.module';
import { OpenClawTenantModule } from '../openclaw-tenant/openclaw-tenant.module';
import { AgentExecutionModule } from '../agent-execution/agent-execution.module';
import { BridgeModule } from '../bridge/bridge.module';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { OnboardingMetricService } from './onboarding-metric.service';

/**
 * Module for the onboarding quick win flow.
 * Provides sub-5-minute first value experience for new users.
 */
@Module({
  imports: [
    TenantModule, // Provides PlatformPrismaService
    AuthModule, // Provides AuthService for MfaRequiredGuard
    AiGatewayModule, // Provides AiGatewayService
    NotesModule, // Provides NotesService for saving onboarding output
    KnowledgeModule, // Provides ConceptService for business brain
    ConversationModule, // Provides ConversationService for welcome conversation
    WebSearchModule, // Provides WebSearchService for website analysis
    FileUploadModule, // Provides FileUploadService for PDF validation
    WorkflowModule, // Provides WorkflowService for building execution plans
    MaturityModule, // Provides MaturityEngineService for auto-BASIC initialization
    OpenClawTenantModule, // Provides OpenClaw tenant provisioning services
    AgentExecutionModule, // Provides OpenClawClientService for director briefing
    forwardRef(() => BridgeModule), // For post-briefing processing (circular with AgentExecution)
  ],
  controllers: [OnboardingController],
  providers: [OnboardingService, OnboardingMetricService],
  exports: [OnboardingService, OnboardingMetricService],
})
export class OnboardingModule {}
