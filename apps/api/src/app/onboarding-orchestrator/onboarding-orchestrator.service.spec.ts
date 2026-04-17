import { Test } from '@nestjs/testing';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { OnboardingVerificationService } from '../onboarding-verification/onboarding-verification.service';
import { EnrichmentQueueService } from '../enrichment-queue/enrichment-queue.service';
import { OnboardingOrchestratorService } from './onboarding-orchestrator.service';

// ── Mocks ──────────────────────────────────────────────────────

const TENANT_ID = 'test-tenant-001';
const EXPECTED_COUNT = 3;

const MOCK_CONCEPTS = [
  { id: 'concept-1' },
  { id: 'concept-2' },
  { id: 'concept-3' },
];

function createMockVerification() {
  return {
    verifyTenantSetup: jest.fn().mockResolvedValue({
      verified: true,
      checks: [],
      failures: [],
    }),
  };
}

function createMockQueue() {
  return {
    enqueueBatch: jest.fn().mockResolvedValue(undefined),
  };
}

function createMockPrisma() {
  return {
    concept: {
      findMany: jest.fn().mockResolvedValue(MOCK_CONCEPTS),
    },
  };
}

describe('OnboardingOrchestratorService', () => {
  let service: OnboardingOrchestratorService;
  let mockVerification: ReturnType<typeof createMockVerification>;
  let mockQueue: ReturnType<typeof createMockQueue>;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    mockVerification = createMockVerification();
    mockQueue = createMockQueue();
    mockPrisma = createMockPrisma();

    const module = await Test.createTestingModule({
      providers: [
        OnboardingOrchestratorService,
        { provide: OnboardingVerificationService, useValue: mockVerification },
        { provide: EnrichmentQueueService, useValue: mockQueue },
        { provide: PlatformPrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(OnboardingOrchestratorService);
  });

  // ── Success Path ─────────────────────────────────────────────

  it('verification passes -> queue populated', async () => {
    const result = await service.finalizeOnboarding(TENANT_ID, EXPECTED_COUNT);

    expect(result.success).toBe(true);
    expect(result.queuedCount).toBe(MOCK_CONCEPTS.length);
    expect(mockQueue.enqueueBatch).toHaveBeenCalledWith(
      TENANT_ID,
      ['concept-1', 'concept-2', 'concept-3'],
    );
  });

  // ── Failure Path ─────────────────────────────────────────────

  it('verification fails -> queue NOT populated, returns failures', async () => {
    const failures = [
      {
        check: 'concept_count',
        passed: false,
        expected: 3,
        actual: 0,
        message: 'Only 0 concepts found',
      },
    ];
    mockVerification.verifyTenantSetup.mockResolvedValue({
      verified: false,
      checks: failures,
      failures,
    });

    const result = await service.finalizeOnboarding(TENANT_ID, EXPECTED_COUNT);

    expect(result.success).toBe(false);
    expect(result.failures).toEqual(failures);
    expect(result.queuedCount).toBeUndefined();
    expect(mockQueue.enqueueBatch).not.toHaveBeenCalled();
  });

  // ── Correct Tenant Query ─────────────────────────────────────

  it('concepts queried for correct tenantId', async () => {
    await service.finalizeOnboarding(TENANT_ID, EXPECTED_COUNT);

    expect(mockPrisma.concept.findMany).toHaveBeenCalledWith({
      where: { tenantId: TENANT_ID },
      select: { id: true },
    });
  });
});
