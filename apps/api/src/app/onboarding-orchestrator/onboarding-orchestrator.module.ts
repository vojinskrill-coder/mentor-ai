import { Module } from '@nestjs/common';
import { TenantModule } from '@mentor-ai/shared/tenant-context';
import { OnboardingOrchestratorService } from './onboarding-orchestrator.service';
import { OnboardingVerificationModule } from '../onboarding-verification/onboarding-verification.module';
import { EnrichmentQueueModule } from '../enrichment-queue/enrichment-queue.module';

@Module({
  imports: [TenantModule, OnboardingVerificationModule, EnrichmentQueueModule],
  providers: [OnboardingOrchestratorService],
  exports: [OnboardingOrchestratorService],
})
export class OnboardingOrchestratorModule {}
