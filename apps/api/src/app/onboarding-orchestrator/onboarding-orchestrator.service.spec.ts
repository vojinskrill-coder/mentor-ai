import { OnboardingOrchestratorService } from './onboarding-orchestrator.service';

describe('OnboardingOrchestratorService', () => {
  let service: OnboardingOrchestratorService;
  let mockVerification: any;
  let mockQueue: any;
  let mockPrisma: any;

  beforeEach(() => {
    mockVerification = {
      verifyTenantSetup: jest.fn().mockResolvedValue({
        passed: true,
        checks: [],
        summary: 'All passed',
      }),
    };
    mockQueue = {
      enqueueBatch: jest.fn().mockResolvedValue(443),
    };
    mockPrisma = {
      concept: {
        findMany: jest.fn().mockResolvedValue(
          Array.from({ length: 443 }, (_, i) => ({ slug: `concept-${i}` })),
        ),
      },
    };
    service = new OnboardingOrchestratorService(
      mockVerification,
      mockQueue,
      mockPrisma,
    );
  });

  it('should finalize onboarding successfully', async () => {
    const result = await service.finalizeOnboarding('tenant-1', 8);
    expect(result.success).toBe(true);
    expect(result.verificationPassed).toBe(true);
    expect(result.enrichmentCount).toBe(443);
    expect(result.errors).toHaveLength(0);
  });

  it('should fail when verification fails', async () => {
    mockVerification.verifyTenantSetup.mockResolvedValue({
      passed: false,
      checks: [
        { name: 'tenant_exists', passed: false, details: 'Not found' },
      ],
      summary: 'Failed',
    });
    const result = await service.finalizeOnboarding('bad-tenant', 8);
    expect(result.success).toBe(false);
    expect(result.verificationPassed).toBe(false);
    expect(result.enrichmentCount).toBe(0);
  });

  it('should handle enrichment queue errors gracefully', async () => {
    mockQueue.enqueueBatch.mockRejectedValue(new Error('DB error'));
    const result = await service.finalizeOnboarding('tenant-1', 8);
    expect(result.success).toBe(false);
    expect(result.verificationPassed).toBe(true);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
