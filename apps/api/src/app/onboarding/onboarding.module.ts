import { Module } from '@nestjs/common';
import { TenantModule } from '@mentor-ai/shared/tenant-context';
import { AuthModule } from '../auth/auth.module';
import { AiGatewayModule } from '../ai-gateway/ai-gateway.module';
import { NotesModule } from '../notes/notes.module';
import { KnowledgeModule } from '../knowledge/knowledge.module';
import { ConversationModule } from '../conversation/conversation.module';
import { WebSearchModule } from '../web-search/web-search.module';
import { FileUploadModule } from '../file-upload/file-upload.module';
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
  ],
  controllers: [OnboardingController],
  providers: [OnboardingService, OnboardingMetricService],
  exports: [OnboardingService, OnboardingMetricService],
})
export class OnboardingModule {}
