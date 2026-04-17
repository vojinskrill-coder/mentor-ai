import { EnrichmentQueueService, EnrichmentStatus } from './enrichment-queue.service';
import { InvalidStateTransitionError } from './enrichment-queue.error';

describe('EnrichmentQueueService', () => {
  let service: EnrichmentQueueService;
  let mockPrisma: any;
  let mockQueue: any;

  const makeEntry = (overrides: Partial<any> = {}) => ({
    id: 'entry-1',
    tenantId: 'tenant-1',
    conceptSlug: 'test-concept',
    status: EnrichmentStatus.QUEUED,
    retryCount: 0,
    maxRetries: 5,
    errorMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  });

  beforeEach(() => {
    mockQueue = {
      create: jest.fn(),
      createMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      groupBy: jest.fn(),
    };
    mockPrisma = {
      enrichmentQueue: mockQueue,
      $queryRawUnsafe: jest.fn(),
    };
    service = new EnrichmentQueueService(mockPrisma as any);
  });

  it('should enqueue a single entry', async () => {
    const entry = makeEntry();
    mockQueue.create.mockResolvedValue(entry);
    const result = await service.enqueue('tenant-1', 'test-concept');
    expect(result).toEqual(entry);
    expect(mockQueue.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: 'tenant-1',
          conceptSlug: 'test-concept',
          status: EnrichmentStatus.QUEUED,
        }),
      }),
    );
  });

  it('should enqueue a batch', async () => {
    mockQueue.createMany.mockResolvedValue({ count: 3 });
    const count = await service.enqueueBatch('tenant-1', ['a', 'b', 'c']);
    expect(count).toBe(3);
  });

  it('should dequeue using FOR UPDATE SKIP LOCKED', async () => {
    const entry = makeEntry({ status: EnrichmentStatus.DISPATCHED });
    mockPrisma.$queryRawUnsafe.mockResolvedValue([entry]);
    const result = await service.dequeue('tenant-1');
    expect(result).toEqual(entry);
    expect(mockPrisma.$queryRawUnsafe).toHaveBeenCalled();
  });

  it('should return null when queue is empty', async () => {
    mockPrisma.$queryRawUnsafe.mockResolvedValue([]);
    const result = await service.dequeue('tenant-1');
    expect(result).toBeNull();
  });

  it('should transition DISPATCHED -> EXECUTING', async () => {
    const entry = makeEntry({ status: EnrichmentStatus.DISPATCHED });
    mockQueue.findUnique.mockResolvedValue(entry);
    mockQueue.update.mockResolvedValue({
      ...entry,
      status: EnrichmentStatus.EXECUTING,
    });
    const result = await service.markExecuting('entry-1');
    expect(result.status).toBe(EnrichmentStatus.EXECUTING);
  });

  it('should transition EXECUTING -> VALIDATING', async () => {
    const entry = makeEntry({ status: EnrichmentStatus.EXECUTING });
    mockQueue.findUnique.mockResolvedValue(entry);
    mockQueue.update.mockResolvedValue({
      ...entry,
      status: EnrichmentStatus.VALIDATING,
    });
    const result = await service.markValidating('entry-1');
    expect(result.status).toBe(EnrichmentStatus.VALIDATING);
  });

  it('should transition VALIDATING -> COMPLETED', async () => {
    const entry = makeEntry({ status: EnrichmentStatus.VALIDATING });
    mockQueue.findUnique.mockResolvedValue(entry);
    mockQueue.update.mockResolvedValue({
      ...entry,
      status: EnrichmentStatus.COMPLETED,
    });
    const result = await service.markCompleted('entry-1');
    expect(result.status).toBe(EnrichmentStatus.COMPLETED);
  });

  it('should transition VALIDATING -> CORRECTING', async () => {
    const entry = makeEntry({ status: EnrichmentStatus.VALIDATING });
    mockQueue.findUnique.mockResolvedValue(entry);
    mockQueue.update.mockResolvedValue({
      ...entry,
      status: EnrichmentStatus.CORRECTING,
    });
    const result = await service.markCorrecting('entry-1');
    expect(result.status).toBe(EnrichmentStatus.CORRECTING);
  });

  it('should transition CORRECTING -> VALIDATING (back to validating)', async () => {
    const entry = makeEntry({ status: EnrichmentStatus.CORRECTING });
    mockQueue.findUnique.mockResolvedValue(entry);
    mockQueue.update.mockResolvedValue({
      ...entry,
      status: EnrichmentStatus.VALIDATING,
    });
    const result = await service.markBackToValidating('entry-1');
    expect(result.status).toBe(EnrichmentStatus.VALIDATING);
  });

  it('should reject invalid state transition', async () => {
    const entry = makeEntry({ status: EnrichmentStatus.QUEUED });
    mockQueue.findUnique.mockResolvedValue(entry);
    await expect(service.markExecuting('entry-1')).rejects.toThrow(
      InvalidStateTransitionError,
    );
  });

  it('should reject transition from COMPLETED', async () => {
    const entry = makeEntry({ status: EnrichmentStatus.COMPLETED });
    mockQueue.findUnique.mockResolvedValue(entry);
    await expect(service.markExecuting('entry-1')).rejects.toThrow(
      InvalidStateTransitionError,
    );
  });

  it('should reject transition from PERMANENTLY_FAILED', async () => {
    const entry = makeEntry({ status: EnrichmentStatus.PERMANENTLY_FAILED });
    mockQueue.findUnique.mockResolvedValue(entry);
    await expect(service.markExecuting('entry-1')).rejects.toThrow(
      InvalidStateTransitionError,
    );
  });

  it('should mark as FAILED and increment retryCount', async () => {
    const entry = makeEntry({
      status: EnrichmentStatus.EXECUTING,
      retryCount: 1,
    });
    mockQueue.findUnique.mockResolvedValue(entry);
    mockQueue.update.mockResolvedValue({
      ...entry,
      status: EnrichmentStatus.FAILED,
      retryCount: 2,
    });
    const result = await service.markFailed('entry-1', 'timeout');
    expect(mockQueue.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: EnrichmentStatus.FAILED,
          errorMessage: 'timeout',
        }),
      }),
    );
  });

  it('should mark as PERMANENTLY_FAILED when retries exhausted', async () => {
    const entry = makeEntry({
      status: EnrichmentStatus.EXECUTING,
      retryCount: 5,
      maxRetries: 5,
    });
    mockQueue.findUnique.mockResolvedValue(entry);
    mockQueue.update.mockResolvedValue({
      ...entry,
      status: EnrichmentStatus.PERMANENTLY_FAILED,
    });
    await service.markFailed('entry-1', 'too many retries');
    expect(mockQueue.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: EnrichmentStatus.PERMANENTLY_FAILED,
        }),
      }),
    );
  });

  it('should retry all failed entries', async () => {
    mockQueue.updateMany.mockResolvedValue({ count: 5 });
    const count = await service.retryFailed('tenant-1');
    expect(count).toBe(5);
  });

  it('should return queue stats', async () => {
    mockQueue.groupBy.mockResolvedValue([
      { status: 'QUEUED', _count: 10 },
      { status: 'COMPLETED', _count: 5 },
    ]);
    const stats = await service.getQueueStats('tenant-1');
    expect(stats['QUEUED']).toBe(10);
    expect(stats['COMPLETED']).toBe(5);
  });

  it('should get a single entry', async () => {
    const entry = makeEntry();
    mockQueue.findUnique.mockResolvedValue(entry);
    const result = await service.getEntry('entry-1');
    expect(result).toEqual(entry);
  });

  it('should throw on transition for nonexistent entry', async () => {
    mockQueue.findUnique.mockResolvedValue(null);
    await expect(service.markExecuting('nonexistent')).rejects.toThrow(
      'not found',
    );
  });

  it('should throw on markFailed for nonexistent entry', async () => {
    mockQueue.findUnique.mockResolvedValue(null);
    await expect(
      service.markFailed('nonexistent', 'error'),
    ).rejects.toThrow('not found');
  });

  it('should use default maxRetries of 5', async () => {
    mockQueue.create.mockImplementation(({ data }: any) => data);
    const result = await service.enqueue('tenant-1', 'slug');
    expect(result.maxRetries).toBe(5);
  });
});
