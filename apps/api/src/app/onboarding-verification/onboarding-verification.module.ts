import { Module } from '@nestjs/common';
import { TenantModule } from '@mentor-ai/shared/tenant-context';
import { VaultStorageModule } from '../vault-storage/vault-storage.module';
import { OnboardingVerificationService } from './onboarding-verification.service';

@Module({
  imports: [TenantModule, VaultStorageModule],
  providers: [OnboardingVerificationService],
  exports: [OnboardingVerificationService],
})
export class OnboardingVerificationModule {}
