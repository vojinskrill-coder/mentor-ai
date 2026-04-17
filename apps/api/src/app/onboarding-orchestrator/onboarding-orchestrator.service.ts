import { Injectable, Logger } from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import {
  OnboardingVerificationService,
  VerificationCheck,
} from '../onboarding-verification/onboarding-verification.service';
import { EnrichmentQueueService } from '../enrichment-queue/enrichment-queue.service';

// ── Types ──────────────────────────────────────────────────────

export interface OnboardingResult {
  success: boolean;
  failures?: VerificationCheck[];
  queuedCount?: number;
}

// ── Service ────────────────────────────────────────────────────

@Injectable()
export class OnboardingOrchestratorService {
  private readonly logger = new Logger(OnboardingOrchestratorService.name);

  constructor(
    private readonly verificationService: OnboardingVerificationService,
    private readonly queueService: EnrichmentQueueService,
    private readonly prisma: PlatformPrismaService,
  ) {}

  /**
   * Called AFTER existing onboarding completes (concepts selected, vault provisioned).
   * Verifies everything, populates enrichment queue, activates tenant.
   */
  async finalizeOnboarding(
    tenantId: string,
    expectedConceptCount: number,
  ): Promise<OnboardingResult> {
    // 1. Verify tenant setup
    const verification = await this.verificationService.verifyTenantSetup(
      tenantId,
      expectedConceptCount,
    );

    if (!verification.verified) {
      this.logger.error({
        msg: 'Onboarding verification FAILED',
        tenantId,
        failures: verification.failures,
      });
      return { success: false, failures: verification.failures };
    }

    // 2. Populate enrichment queue
    const concepts = await (this.prisma as any).concept.findMany({
      where: { tenantId },
      select: { id: true },
    });
    await this.queueService.enqueueBatch(
      tenantId,
      concepts.map((c: { id: string }) => c.id),
    );

    // 3. Return success
    this.logger.log({
      msg: 'Onboarding verified and queue populated',
      tenantId,
      queuedCount: concepts.length,
    });
    return { success: true, queuedCount: concepts.length };
  }
}
