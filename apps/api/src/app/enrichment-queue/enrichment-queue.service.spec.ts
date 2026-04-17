import { Test } from '@nestjs/testing';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { EnrichmentQueueService, EnrichmentStatus } from './enrichment-queue.service';
import { InvalidStateTransitionError } from './enrichment-queue.error';

// ── Mock Prisma ────────────────────────────────────────────────

function createMockPrisma() {
  return {
    enrichmentQueue: {
      upsert: jest.fn().mockResolvedValue({}),
      createMany: jest.fn().mockResolvedValue({ count: 0 }),
      findUnique: jest.fn().mockResolvedValue(null),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      groupBy: jest.fn().mockResolvedValue([]),
    },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
}

function makeEntry(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'eq-1',
    tenantId: 'tnt-1',
    conceptId: 'concept-1',
    status: EnrichmentStatus.QUEUED,
    attempt: 0,
    maxAttempts: 3,
    sessionId: null,
    dispatchedAt: null,
    completedAt: null,
    failedAt: null,
    error: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('EnrichmentQueueService', () => {
  let service: EnrichmentQueueService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    mockPrisma = createMockPrisma();

    const module = await Test.createTestingModule({
      providers: [
        EnrichmentQueueService,
        { provide: PlatformPrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(EnrichmentQueueService);
  });

  // ── Enqueue ──────────────────────────────────────────────────

  it('enqueue creates a QUEUED entry via upsert', async () => {
    await service.enqueue('tnt-1', 'concept-1');

    expect(mockPrisma.enrichmentQueue.upsert).toHaveBeenCalledWith({
      where: { tenantId_conceptId: { tenantId: 'tnt-1', conceptId: 'concept-1' } },
      create: {
        tenantId: 'tnt-1',
        conceptId: 'concept-1',
        status: EnrichmentStatus.QUEUED,
      },
      update: {},
    });
  });

  it('enqueue is idempotent — second call does not error', async () => {
    await service.enqueue('tnt-1', 'concept-1');
    await service.enqueue('tnt-1', 'concept-1');

    expect(mockPrisma.enrichmentQueue.upsert).toHaveBeenCalledTimes(2);
  });

  it('enqueueBatch inserts N entries with skipDuplicates', async () => {
    const ids = ['c-1', 'c-2', 'c-3'];
    await service.enqueueBatch('tnt-1', ids);

    expect(mockPrisma.enrichmentQueue.createMany).toHaveBeenCalledWith({
      data: ids.map((conceptId) => ({
        tenantId: 'tnt-1',
        conceptId,
        status: EnrichmentStatus.QUEUED,
      })),
      skipDuplicates: true,
    });
  });

  // ── Dequeue ──────────────────────────────────────────────────

  it('dequeue returns QUEUED entry and marks DISPATCHED', async () => {
    const entry = makeEntry({ status: EnrichmentStatus.DISPATCHED });
    mockPrisma.$queryRaw.mockResolvedValue([entry]);

    const result = await service.dequeue('tnt-1');

    expect(result).toEqual(entry);
    expect(mockPrisma.$queryRaw).toHaveBeenCalled();
  });

  it('dequeue returns null when queue is empty', async () => {
    mockPrisma.$queryRaw.mockResolvedValue([]);

    const result = await service.dequeue('tnt-1');

    expect(result).toBeNull();
  });

  // ── Valid Transitions ────────────────────────────────────────

  it('markExecuting transitions DISPATCHED -> EXECUTING', async () => {
    mockPrisma.enrichmentQueue.findUnique.mockResolvedValue(
      makeEntry({ status: EnrichmentStatus.DISPATCHED }),
    );

    await service.markExecuting('eq-1');

    expect(mockPrisma.enrichmentQueue.update).toHaveBeenCalledWith({
      where: { id: 'eq-1' },
      data: { status: EnrichmentStatus.EXECUTING },
    });
  });

  it('markValidating transitions EXECUTING -> VALIDATING', async () => {
    mockPrisma.enrichmentQueue.findUnique.mockResolvedValue(
      makeEntry({ status: EnrichmentStatus.EXECUTING }),
    );

    await service.markValidating('eq-1');

    expect(mockPrisma.enrichmentQueue.update).toHaveBeenCalledWith({
      where: { id: 'eq-1' },
      data: { status: EnrichmentStatus.VALIDATING },
    });
  });

  it('markCompleted transitions VALIDATING -> COMPLETED with completedAt', async () => {
    mockPrisma.enrichmentQueue.findUnique.mockResolvedValue(
      makeEntry({ status: EnrichmentStatus.VALIDATING }),
    );

    await service.markCompleted('eq-1');

    expect(mockPrisma.enrichmentQueue.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'eq-1' },
        data: expect.objectContaining({
          status: EnrichmentStatus.COMPLETED,
          completedAt: expect.any(Date),
        }),
      }),
    );
  });

  it('markCorrecting transitions VALIDATING -> CORRECTING', async () => {
    mockPrisma.enrichmentQueue.findUnique.mockResolvedValue(
      makeEntry({ status: EnrichmentStatus.VALIDATING }),
    );

    await service.markCorrecting('eq-1');

    expect(mockPrisma.enrichmentQueue.update).toHaveBeenCalledWith({
      where: { id: 'eq-1' },
      data: { status: EnrichmentStatus.CORRECTING },
    });
  });

  it('markBackToValidating transitions CORRECTING -> VALIDATING', async () => {
    mockPrisma.enrichmentQueue.findUnique.mockResolvedValue(
      makeEntry({ status: EnrichmentStatus.CORRECTING }),
    );

    await service.markBackToValidating('eq-1');

    expect(mockPrisma.enrichmentQueue.update).toHaveBeenCalledWith({
      where: { id: 'eq-1' },
      data: { status: EnrichmentStatus.VALIDATING },
    });
  });

  // ── Invalid Transitions ──────────────────────────────────────

  it('throws InvalidStateTransitionError for QUEUED -> COMPLETED', async () => {
    mockPrisma.enrichmentQueue.findUnique.mockResolvedValue(
      makeEntry({ status: EnrichmentStatus.QUEUED }),
    );

    await expect(service.markCompleted('eq-1')).rejects.toThrow(InvalidStateTransitionError);
  });

  it('throws InvalidStateTransitionError for COMPLETED -> EXECUTING', async () => {
    mockPrisma.enrichmentQueue.findUnique.mockResolvedValue(
      makeEntry({ status: EnrichmentStatus.COMPLETED }),
    );

    await expect(service.markExecuting('eq-1')).rejects.toThrow(InvalidStateTransitionError);
  });

  it('throws InvalidStateTransitionError for QUEUED -> EXECUTING (skipping DISPATCHED)', async () => {
    mockPrisma.enrichmentQueue.findUnique.mockResolvedValue(
      makeEntry({ status: EnrichmentStatus.QUEUED }),
    );

    await expect(service.markExecuting('eq-1')).rejects.toThrow(InvalidStateTransitionError);
  });

  // ── markFailed ───────────────────────────────────────────────

  it('markFailed increments attempt and sets FAILED', async () => {
    mockPrisma.enrichmentQueue.findUnique.mockResolvedValue(
      makeEntry({ status: EnrichmentStatus.EXECUTING, attempt: 0 }),
    );

    await service.markFailed('eq-1', 'timeout');

    expect(mockPrisma.enrichmentQueue.update).toHaveBeenCalledWith({
      where: { id: 'eq-1' },
      data: expect.objectContaining({
        status: EnrichmentStatus.FAILED,
        attempt: 1,
        error: 'timeout',
        failedAt: expect.any(Date),
      }),
    });
  });

  it('markFailed sets PERMANENTLY_FAILED when attempt >= maxAttempts', async () => {
    mockPrisma.enrichmentQueue.findUnique.mockResolvedValue(
      makeEntry({ status: EnrichmentStatus.EXECUTING, attempt: 2, maxAttempts: 3 }),
    );

    await service.markFailed('eq-1', 'max retries');

    expect(mockPrisma.enrichmentQueue.update).toHaveBeenCalledWith({
      where: { id: 'eq-1' },
      data: expect.objectContaining({
        status: EnrichmentStatus.PERMANENTLY_FAILED,
        attempt: 3,
      }),
    });
  });

  it('markFailed throws for QUEUED status', async () => {
    mockPrisma.enrichmentQueue.findUnique.mockResolvedValue(
      makeEntry({ status: EnrichmentStatus.QUEUED }),
    );

    await expect(service.markFailed('eq-1', 'nope')).rejects.toThrow(
      InvalidStateTransitionError,
    );
  });

  // ── retryFailed ──────────────────────────────────────────────

  it('retryFailed re-enqueues FAILED entries below max attempts', async () => {
    mockPrisma.enrichmentQueue.updateMany.mockResolvedValue({ count: 3 });

    const count = await service.retryFailed('tnt-1');

    expect(count).toBe(3);
    expect(mockPrisma.enrichmentQueue.updateMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tnt-1',
        status: EnrichmentStatus.FAILED,
        attempt: { lt: 3 },
      },
      data: {
        status: EnrichmentStatus.QUEUED,
        error: null,
        failedAt: null,
      },
    });
  });

  it('retryFailed ignores PERMANENTLY_FAILED entries', async () => {
    mockPrisma.enrichmentQueue.updateMany.mockResolvedValue({ count: 0 });

    const count = await service.retryFailed('tnt-1');

    expect(count).toBe(0);
    // The where clause only targets FAILED, never PERMANENTLY_FAILED
    expect(mockPrisma.enrichmentQueue.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: EnrichmentStatus.FAILED,
        }),
      }),
    );
  });

  // ── getQueueStats ────────────────────────────────────────────

  it('getQueueStats returns correct counts per status', async () => {
    mockPrisma.enrichmentQueue.groupBy.mockResolvedValue([
      { status: EnrichmentStatus.QUEUED, _count: 5 },
      { status: EnrichmentStatus.EXECUTING, _count: 2 },
      { status: EnrichmentStatus.COMPLETED, _count: 10 },
    ]);

    const stats = await service.getQueueStats('tnt-1');

    expect(stats).toEqual({
      QUEUED: 5,
      DISPATCHED: 0,
      EXECUTING: 2,
      VALIDATING: 0,
      CORRECTING: 0,
      COMPLETED: 10,
      FAILED: 0,
      PERMANENTLY_FAILED: 0,
    });
  });

  // ── getEntry ─────────────────────────────────────────────────

  it('getEntry returns entry by id', async () => {
    const entry = makeEntry();
    mockPrisma.enrichmentQueue.findUnique.mockResolvedValue(entry);

    const result = await service.getEntry('eq-1');

    expect(result).toEqual(entry);
    expect(mockPrisma.enrichmentQueue.findUnique).toHaveBeenCalledWith({
      where: { id: 'eq-1' },
    });
  });

  it('getEntry returns null for non-existent id', async () => {
    mockPrisma.enrichmentQueue.findUnique.mockResolvedValue(null);

    const result = await service.getEntry('nope');

    expect(result).toBeNull();
  });
});
