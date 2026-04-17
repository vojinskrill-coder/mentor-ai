import { Injectable, Logger } from '@nestjs/common';
import { OnboardingVerificationService } from '../onboarding-verification/onboarding-verification.service';
import { EnrichmentQueueService } from '../enrichment-queue/enrichment-queue.service';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';

export interface OnboardingResult {
  success: boolean;
  tenantId: string;
  verificationPassed: boolean;
  enrichmentCount: number;
  errors: string[];
}

@Injectable()
export class OnboardingOrchestratorService {
  private readonly logger = new Logger(OnboardingOrchestratorService.name);

  constructor(
    private readonly verification: OnboardingVerificationService,
    private readonly enrichmentQueue: EnrichmentQueueService,
    private readonly prisma: PlatformPrismaService,
  ) {}

  async finalizeOnboarding(
    tenantId: string,
    expectedAgentCount: number,
  ): Promise<OnboardingResult> {
    const errors: string[] = [];

    // Step 1: Verify tenant setup
    this.logger.log(`Verifying tenant setup for ${tenantId}...`);
    const verification = await this.verification.verifyTenantSetup(
      tenantId,
      expectedAgentCount,
    );

    if (!verification.passed) {
      this.logger.warn(
        `Verification failed for ${tenantId}: ${verification.summary}`,
      );
      return {
        success: false,
        tenantId,
        verificationPassed: false,
        enrichmentCount: 0,
        errors: verification.checks
          .filter((c) => !c.passed)
          .map((c) => `${c.name}: ${c.details || 'failed'}`),
      };
    }

    // Step 2: Populate enrichment queue with all concepts
    let enrichmentCount = 0;
    try {
      const concepts = await (this.prisma as any).concept.findMany({
        select: { slug: true },
      });
      const slugs = concepts.map((c: any) => c.slug);
      enrichmentCount = await this.enrichmentQueue.enqueueBatch(
        tenantId,
        slugs,
      );
      this.logger.log(
        `Enqueued ${enrichmentCount} concepts for enrichment (tenant: ${tenantId})`,
      );
    } catch (err) {
      const msg = `Failed to populate enrichment queue: ${(err as Error).message}`;
      errors.push(msg);
      this.logger.error(msg);
    }

    return {
      success: errors.length === 0,
      tenantId,
      verificationPassed: true,
      enrichmentCount,
      errors,
    };
  }
}
