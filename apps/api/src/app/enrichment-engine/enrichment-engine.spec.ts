import { EnrichmentExecutorService } from './enrichment-executor.service';
import { GuardrailValidationService } from './guardrail-validation.service';
import { QueueProcessorService } from './queue-processor.service';
import { EnrichmentStatus } from '../enrichment-queue/enrichment-queue.service';

describe('EnrichmentExecutorService', () => {
  let executor: EnrichmentExecutorService;
  let mockQueue: any;
  let mockConfig: any;

  beforeEach(() => {
    mockQueue = {
      markExecuting: jest.fn().mockResolvedValue(undefined),
      markValidating: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
      getEntry: jest.fn().mockResolvedValue({
        id: 'entry-1',
        tenantId: 'tenant-1',
        conceptSlug: 'test-concept',
        status: EnrichmentStatus.DISPATCHED,
      }),
    };
    mockConfig = {
      getTimeouts: jest.fn().mockReturnValue({ enrichmentStepMs: 5000 }),
      getRelayConfig: jest.fn().mockReturnValue({
        host: 'localhost',
        port: 3100,
        authToken: 'token',
        timeout: 30000,
      }),
    };
    executor = new EnrichmentExecutorService(mockQueue, mockConfig);
  });

  it('should transition DISPATCHED -> EXECUTING', async () => {
    // Mock fetch to succeed
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    await executor.executeEnrichment('entry-1');
    expect(mockQueue.markExecuting).toHaveBeenCalledWith('entry-1');
  });

  it('should transition EXECUTING -> VALIDATING on success', async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
    const result = await executor.executeEnrichment('entry-1');
    expect(result).toBe(true);
    expect(mockQueue.markValidating).toHaveBeenCalledWith('entry-1');
  });

  it('should mark FAILED on relay error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: 'Internal Server Error',
    });
    const result = await executor.executeEnrichment('entry-1');
    expect(result).toBe(false);
    expect(mockQueue.markFailed).toHaveBeenCalled();
  });

  it('should mark FAILED on network error', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const result = await executor.executeEnrichment('entry-1');
    expect(result).toBe(false);
    expect(mockQueue.markFailed).toHaveBeenCalled();
  });

  it('should handle missing entry after marking executing', async () => {
    mockQueue.getEntry.mockResolvedValue(null);
    global.fetch = jest.fn();
    const result = await executor.executeEnrichment('entry-1');
    expect(result).toBe(false);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});

describe('GuardrailValidationService', () => {
  let validator: GuardrailValidationService;
  let mockQueue: any;
  let mockContentValidation: any;
  let mockVault: any;
  let mockConfig: any;

  beforeEach(() => {
    mockQueue = {
      getEntry: jest.fn().mockResolvedValue({
        id: 'entry-1',
        tenantId: 'tenant-1',
        conceptSlug: 'test-concept',
        status: EnrichmentStatus.VALIDATING,
        retryCount: 0,
        maxRetries: 5,
      }),
      markCompleted: jest.fn().mockResolvedValue(undefined),
      markCorrecting: jest.fn().mockResolvedValue(undefined),
      markBackToValidating: jest.fn().mockResolvedValue(undefined),
      markFailed: jest.fn().mockResolvedValue(undefined),
    };
    mockContentValidation = {
      validateContent: jest.fn().mockReturnValue({
        valid: true,
        errors: [],
        warnings: [],
        stats: {},
      }),
    };
    mockVault = {
      readFile: jest.fn().mockResolvedValue('# Valid content'),
    };
    mockConfig = {
      getEnrichmentConfig: jest.fn().mockReturnValue({
        minWords: 50,
        minChars: 200,
        requireDiacritics: true,
        requireFrontmatter: true,
        requireSources: true,
        maxRetries: 5,
      }),
    };
    validator = new GuardrailValidationService(
      mockQueue,
      mockContentValidation,
      mockVault,
      mockConfig,
    );
  });

  it('should complete entry when validation passes', async () => {
    const result = await validator.validateAndComplete('entry-1', 'test-concept');
    expect(result).toBe(true);
    expect(mockQueue.markCompleted).toHaveBeenCalledWith('entry-1');
  });

  it('should enter correction loop when validation fails', async () => {
    mockContentValidation.validateContent.mockReturnValue({
      valid: false,
      errors: ['Too short'],
      warnings: [],
      stats: {},
    });
    const result = await validator.validateAndComplete('entry-1', 'test-concept');
    expect(result).toBe(false);
    expect(mockQueue.markCorrecting).toHaveBeenCalled();
  });

  it('should mark failed when max corrections reached', async () => {
    mockQueue.getEntry.mockResolvedValue({
      id: 'entry-1',
      tenantId: 'tenant-1',
      retryCount: 5,
      maxRetries: 5,
    });
    mockContentValidation.validateContent.mockReturnValue({
      valid: false,
      errors: ['Still bad'],
      warnings: [],
      stats: {},
    });
    const result = await validator.validateAndComplete('entry-1', 'test-concept');
    expect(result).toBe(false);
    expect(mockQueue.markFailed).toHaveBeenCalled();
  });

  it('should handle vault read errors', async () => {
    mockVault.readFile.mockRejectedValue(new Error('File not found'));
    const result = await validator.validateAndComplete('entry-1', 'test-concept');
    expect(result).toBe(false);
    expect(mockQueue.markFailed).toHaveBeenCalled();
  });

  it('should handle missing entry', async () => {
    mockQueue.getEntry.mockResolvedValue(null);
    const result = await validator.validateAndComplete('entry-1', 'test-concept');
    expect(result).toBe(false);
  });

  it('should transition back to VALIDATING after correction', async () => {
    mockContentValidation.validateContent.mockReturnValue({
      valid: false,
      errors: ['Missing diacritics'],
      warnings: [],
      stats: {},
    });
    await validator.validateAndComplete('entry-1', 'test-concept');
    expect(mockQueue.markBackToValidating).toHaveBeenCalled();
  });
});

describe('QueueProcessorService', () => {
  let processor: QueueProcessorService;
  let mockQueue: any;
  let mockExecutor: any;
  let mockValidator: any;
  let mockConfig: any;

  beforeEach(() => {
    mockQueue = {
      dequeue: jest.fn(),
      getQueueStats: jest.fn().mockResolvedValue({}),
    };
    mockExecutor = {
      executeEnrichment: jest.fn().mockResolvedValue(true),
    };
    mockValidator = {
      validateAndComplete: jest.fn().mockResolvedValue(true),
    };
    mockConfig = {
      getEnrichmentConfig: jest.fn().mockReturnValue({
        batchSize: 10,
        zombieTimeoutMs: 300000,
      }),
    };
    processor = new QueueProcessorService(
      mockQueue,
      mockExecutor,
      mockValidator,
      mockConfig,
    );
  });

  it('should process queue entries', async () => {
    mockQueue.dequeue
      .mockResolvedValueOnce({ id: 'e1', conceptSlug: 'slug-1' })
      .mockResolvedValueOnce({ id: 'e2', conceptSlug: 'slug-2' })
      .mockResolvedValueOnce(null);

    const result = await processor.processQueue('tenant-1');
    expect(result.processed).toBe(2);
    expect(result.completed).toBe(2);
    expect(result.failed).toBe(0);
  });

  it('should handle empty queue', async () => {
    mockQueue.dequeue.mockResolvedValue(null);
    const result = await processor.processQueue('tenant-1');
    expect(result.processed).toBe(0);
  });

  it('should count failures', async () => {
    mockQueue.dequeue
      .mockResolvedValueOnce({ id: 'e1', conceptSlug: 'slug-1' })
      .mockResolvedValueOnce(null);
    mockExecutor.executeEnrichment.mockResolvedValue(false);

    const result = await processor.processQueue('tenant-1');
    expect(result.processed).toBe(1);
    expect(result.failed).toBe(1);
    expect(result.completed).toBe(0);
  });

  it('should count validation failures', async () => {
    mockQueue.dequeue
      .mockResolvedValueOnce({ id: 'e1', conceptSlug: 'slug-1' })
      .mockResolvedValueOnce(null);
    mockValidator.validateAndComplete.mockResolvedValue(false);

    const result = await processor.processQueue('tenant-1');
    expect(result.failed).toBe(1);
  });

  it('should respect batch size limit', async () => {
    mockConfig.getEnrichmentConfig.mockReturnValue({
      batchSize: 2,
      zombieTimeoutMs: 300000,
    });
    mockQueue.dequeue.mockResolvedValue({
      id: 'e1',
      conceptSlug: 'slug-1',
    });

    const result = await processor.processQueue('tenant-1');
    expect(result.processed).toBe(2);
    expect(mockQueue.dequeue).toHaveBeenCalledTimes(2);
  });
});
