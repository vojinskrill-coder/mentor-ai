import { Test, TestingModule } from '@nestjs/testing';
import { EnrichmentExecutorService, ExecutionResult } from './enrichment-executor.service';
import { GuardrailValidationService, ValidationResult } from './guardrail-validation.service';
import { QueueProcessorService, ProcessingResult } from './queue-processor.service';
import { PlatformConfigService } from '../platform-config/platform-config.service';
import { EnrichmentQueueService, EnrichmentStatus } from '../enrichment-queue/enrichment-queue.service';
import { ContentValidationService } from '../content-validation/content-validation.service';
import { VaultStorage } from '../vault-storage/vault-storage.interface';

// ── Mock Factories ──────────────────────────────────────────────────────────

function mockQueueEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-1',
    tenantId: 'tenant-1',
    conceptId: 'concept-1',
    status: EnrichmentStatus.DISPATCHED,
    attempt: 0,
    maxAttempts: 3,
    sessionId: null,
    dispatchedAt: new Date(),
    completedAt: null,
    failedAt: null,
    error: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function createMockConfigService() {
  return {
    getRelayConfig: jest.fn().mockReturnValue({
      host: '91.98.231.87',
      port: 3100,
      authToken: 'test-token',
      timeoutSeconds: 120,
    }),
    getTimeouts: jest.fn().mockReturnValue({
      enrichmentTimeout: 300,
      sshTimeout: 30,
      relayTimeout: 120,
    }),
    getEnrichmentConfig: jest.fn().mockReturnValue({
      concurrency: 2,
      sessionStrategy: 'per-concept',
      compactionInterval: 10,
      maxRetries: 2,
      guardrails: {
        minWords: 4500,
        minChars: 15000,
        language: 'english',
        requireSources: true,
        requireFrontmatter: true,
      },
    }),
  };
}

function createMockQueueService() {
  return {
    getEntry: jest.fn(),
    dequeue: jest.fn(),
    markExecuting: jest.fn().mockResolvedValue(undefined),
    markValidating: jest.fn().mockResolvedValue(undefined),
    markCompleted: jest.fn().mockResolvedValue(undefined),
    markFailed: jest.fn().mockResolvedValue(undefined),
    markCorrecting: jest.fn().mockResolvedValue(undefined),
  };
}

function createMockVaultStorage(): jest.Mocked<VaultStorage> {
  return {
    readFile: jest.fn(),
    writeFile: jest.fn(),
    fileExists: jest.fn(),
    listFiles: jest.fn(),
    writeFiles: jest.fn(),
    createDirectories: jest.fn(),
  };
}

function createMockValidationService() {
  return {
    validateContent: jest.fn(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EnrichmentExecutorService
// ═══════════════════════════════════════════════════════════════════════════

describe('EnrichmentExecutorService', () => {
  let service: EnrichmentExecutorService;
  let configService: ReturnType<typeof createMockConfigService>;
  let queueService: ReturnType<typeof createMockQueueService>;
  let vaultStorage: jest.Mocked<VaultStorage>;
  let validationService: ReturnType<typeof createMockValidationService>;

  beforeEach(async () => {
    configService = createMockConfigService();
    queueService = createMockQueueService();
    vaultStorage = createMockVaultStorage();
    validationService = createMockValidationService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnrichmentExecutorService,
        { provide: PlatformConfigService, useValue: configService },
        { provide: EnrichmentQueueService, useValue: queueService },
        { provide: 'VAULT_STORAGE', useValue: vaultStorage },
        { provide: ContentValidationService, useValue: validationService },
      ],
    }).compile();

    service = module.get(EnrichmentExecutorService);
  });

  it('should read timeout from config (not hardcoded)', async () => {
    const entry = mockQueueEntry();
    queueService.getEntry.mockResolvedValue(entry);

    // Mock callRelay to succeed
    jest.spyOn(service, 'callRelay').mockResolvedValue({ success: true });

    await service.executeEnrichment('entry-1');

    expect(configService.getTimeouts).toHaveBeenCalled();
    const callArgs = (service.callRelay as jest.Mock).mock.calls[0];
    expect(callArgs[2]).toBe(300); // enrichmentTimeout from config
  });

  it('should build relay URL from config', async () => {
    const entry = mockQueueEntry();
    queueService.getEntry.mockResolvedValue(entry);

    jest.spyOn(service, 'callRelay').mockResolvedValue({ success: true });

    await service.executeEnrichment('entry-1');

    expect(configService.getRelayConfig).toHaveBeenCalled();
    const callArgs = (service.callRelay as jest.Mock).mock.calls[0];
    expect(callArgs[0]).toEqual(
      expect.objectContaining({ host: '91.98.231.87', port: 3100 }),
    );
  });

  it('should transition DISPATCHED -> EXECUTING on start', async () => {
    const entry = mockQueueEntry({ status: EnrichmentStatus.DISPATCHED });
    queueService.getEntry.mockResolvedValue(entry);
    jest.spyOn(service, 'callRelay').mockResolvedValue({ success: true });

    await service.executeEnrichment('entry-1');

    expect(queueService.markExecuting).toHaveBeenCalledWith('entry-1');
  });

  it('should move to VALIDATING (not COMPLETED) on relay success', async () => {
    const entry = mockQueueEntry();
    queueService.getEntry.mockResolvedValue(entry);
    jest.spyOn(service, 'callRelay').mockResolvedValue({ success: true });

    const result = await service.executeEnrichment('entry-1');

    expect(result.status).toBe('validating');
    expect(queueService.markValidating).toHaveBeenCalledWith('entry-1');
    expect(queueService.markCompleted).not.toHaveBeenCalled();
  });

  it('should return skipped for already-COMPLETED entry', async () => {
    const entry = mockQueueEntry({ status: EnrichmentStatus.COMPLETED });
    queueService.getEntry.mockResolvedValue(entry);

    const result = await service.executeEnrichment('entry-1');

    expect(result.status).toBe('skipped');
    expect(result.reason).toContain('COMPLETED');
    expect(queueService.markExecuting).not.toHaveBeenCalled();
  });

  it('should return skipped for PERMANENTLY_FAILED entry', async () => {
    const entry = mockQueueEntry({ status: EnrichmentStatus.PERMANENTLY_FAILED });
    queueService.getEntry.mockResolvedValue(entry);

    const result = await service.executeEnrichment('entry-1');

    expect(result.status).toBe('skipped');
    expect(result.reason).toContain('PERMANENTLY_FAILED');
  });

  it('should mark FAILED on relay error', async () => {
    const entry = mockQueueEntry();
    queueService.getEntry.mockResolvedValue(entry);
    jest.spyOn(service, 'callRelay').mockRejectedValue(new Error('Connection refused'));

    const result = await service.executeEnrichment('entry-1');

    expect(result.status).toBe('failed');
    expect(result.error).toBe('Connection refused');
    expect(queueService.markFailed).toHaveBeenCalledWith('entry-1', 'Connection refused');
  });

  it('should emit structured log events', async () => {
    const entry = mockQueueEntry();
    queueService.getEntry.mockResolvedValue(entry);
    jest.spyOn(service, 'callRelay').mockResolvedValue({ success: true });

    const logSpy = jest.spyOn(service['logger'], 'log');

    await service.executeEnrichment('entry-1');

    // Should have at least 2 log calls: started + relay_returned
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'enrichment.started' }),
    );
    expect(logSpy).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'enrichment.relay_returned' }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// GuardrailValidationService
// ═══════════════════════════════════════════════════════════════════════════

describe('GuardrailValidationService', () => {
  let service: GuardrailValidationService;
  let configService: ReturnType<typeof createMockConfigService>;
  let queueService: ReturnType<typeof createMockQueueService>;
  let vaultStorage: jest.Mocked<VaultStorage>;
  let validationService: ReturnType<typeof createMockValidationService>;

  beforeEach(async () => {
    configService = createMockConfigService();
    queueService = createMockQueueService();
    vaultStorage = createMockVaultStorage();
    validationService = createMockValidationService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GuardrailValidationService,
        { provide: PlatformConfigService, useValue: configService },
        { provide: EnrichmentQueueService, useValue: queueService },
        { provide: 'VAULT_STORAGE', useValue: vaultStorage },
        { provide: ContentValidationService, useValue: validationService },
      ],
    }).compile();

    service = module.get(GuardrailValidationService);
  });

  it('should read vault file (VaultStorage.readFile called)', async () => {
    const entry = mockQueueEntry({ status: EnrichmentStatus.VALIDATING });
    queueService.getEntry.mockResolvedValue(entry);
    vaultStorage.readFile.mockResolvedValue('# Article content');
    validationService.validateContent.mockReturnValue({ valid: true, errors: [] });

    await service.validateAndComplete('entry-1', 'test-concept');

    expect(vaultStorage.readFile).toHaveBeenCalledWith('tenant-1', 'wiki/concepts/test-concept.md');
  });

  it('should mark COMPLETED when article is valid', async () => {
    const entry = mockQueueEntry({ status: EnrichmentStatus.VALIDATING });
    queueService.getEntry.mockResolvedValue(entry);
    vaultStorage.readFile.mockResolvedValue('# Valid article content');
    validationService.validateContent.mockReturnValue({ valid: true, errors: [] });

    const result = await service.validateAndComplete('entry-1', 'test-concept');

    expect(result.status).toBe('completed');
    expect(queueService.markCompleted).toHaveBeenCalledWith('entry-1');
  });

  it('should return CORRECTING with correction message when invalid (attempt < maxRetries)', async () => {
    const entry = mockQueueEntry({ status: EnrichmentStatus.VALIDATING, attempt: 0 });
    queueService.getEntry.mockResolvedValue(entry);
    vaultStorage.readFile.mockResolvedValue('short');
    validationService.validateContent.mockReturnValue({
      valid: false,
      errors: ['Content too short: 5 chars (need >= 15000)', 'Missing Sources/References section'],
    });

    const result = await service.validateAndComplete('entry-1', 'test-concept');

    expect(result.status).toBe('correcting');
    expect(result.errors).toContain('Content too short: 5 chars (need >= 15000)');
    expect(result.errors).toContain('Missing Sources/References section');
    expect(result.correctionMessage).toContain('Content too short');
    expect(result.correctionMessage).toContain('Missing Sources/References section');
    expect(result.correctionMessage).toContain('Fix ONLY these issues');
    expect(queueService.markCorrecting).toHaveBeenCalledWith('entry-1');
  });

  it('should mark FAILED after max retries exhausted', async () => {
    const entry = mockQueueEntry({ status: EnrichmentStatus.VALIDATING, attempt: 2 });
    queueService.getEntry.mockResolvedValue(entry);
    vaultStorage.readFile.mockResolvedValue('short');
    validationService.validateContent.mockReturnValue({
      valid: false,
      errors: ['Word count too low'],
    });

    const result = await service.validateAndComplete('entry-1', 'test-concept');

    expect(result.status).toBe('permanently_failed');
    expect(result.errors).toContain('Word count too low');
    expect(queueService.markFailed).toHaveBeenCalledWith(
      'entry-1',
      expect.stringContaining('Validation failed after 2 attempts'),
    );
  });

  it('should return FAILED with "No article in vault" when vault file is missing', async () => {
    const entry = mockQueueEntry({ status: EnrichmentStatus.VALIDATING });
    queueService.getEntry.mockResolvedValue(entry);
    vaultStorage.readFile.mockRejectedValue(new Error('File not found'));

    const result = await service.validateAndComplete('entry-1', 'test-concept');

    expect(result.status).toBe('failed');
    expect(result.error).toBe('No article in vault');
    expect(queueService.markFailed).toHaveBeenCalledWith('entry-1', 'No article written to vault');
  });

  it('should include specific validation errors in correction message', async () => {
    const entry = mockQueueEntry({ status: EnrichmentStatus.VALIDATING, attempt: 1 });
    queueService.getEntry.mockResolvedValue(entry);
    vaultStorage.readFile.mockResolvedValue('some content');
    const specificErrors = ['Missing YAML frontmatter (---)', 'Content too short: 100 chars (need >= 15000)'];
    validationService.validateContent.mockReturnValue({
      valid: false,
      errors: specificErrors,
    });

    const result = await service.validateAndComplete('entry-1', 'test-concept');

    expect(result.status).toBe('correcting');
    expect(result.correctionMessage).toContain('Missing YAML frontmatter');
    expect(result.correctionMessage).toContain('Content too short');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// QueueProcessorService
// ═══════════════════════════════════════════════════════════════════════════

describe('QueueProcessorService', () => {
  let service: QueueProcessorService;
  let configService: ReturnType<typeof createMockConfigService>;
  let queueService: ReturnType<typeof createMockQueueService>;
  let executor: { executeEnrichment: jest.Mock };
  let guardrail: { validateAndComplete: jest.Mock };

  beforeEach(async () => {
    configService = createMockConfigService();
    queueService = createMockQueueService();
    executor = { executeEnrichment: jest.fn() };
    guardrail = { validateAndComplete: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QueueProcessorService,
        { provide: PlatformConfigService, useValue: configService },
        { provide: EnrichmentQueueService, useValue: queueService },
        { provide: EnrichmentExecutorService, useValue: executor },
        { provide: GuardrailValidationService, useValue: guardrail },
      ],
    }).compile();

    service = module.get(QueueProcessorService);
  });

  it('should process entries until queue is empty', async () => {
    const entry1 = mockQueueEntry({ id: 'e1' });
    const entry2 = mockQueueEntry({ id: 'e2' });

    queueService.dequeue
      .mockResolvedValueOnce(entry1)
      .mockResolvedValueOnce(entry2)
      .mockResolvedValueOnce(null); // queue empty

    executor.executeEnrichment
      .mockResolvedValueOnce({ status: 'validating', durationMs: 100 })
      .mockResolvedValueOnce({ status: 'validating', durationMs: 200 });

    const result = await service.processQueue('tenant-1');

    expect(queueService.dequeue).toHaveBeenCalledTimes(3);
    expect(executor.executeEnrichment).toHaveBeenCalledTimes(2);
    expect(result.completed).toBe(2);
    expect(result.failed).toBe(0);
  });

  it('should track completed and failed counts separately', async () => {
    const entry1 = mockQueueEntry({ id: 'e1' });
    const entry2 = mockQueueEntry({ id: 'e2' });
    const entry3 = mockQueueEntry({ id: 'e3' });

    queueService.dequeue
      .mockResolvedValueOnce(entry1)
      .mockResolvedValueOnce(entry2)
      .mockResolvedValueOnce(entry3)
      .mockResolvedValueOnce(null);

    executor.executeEnrichment
      .mockResolvedValueOnce({ status: 'validating', durationMs: 100 })
      .mockResolvedValueOnce({ status: 'failed', error: 'Connection refused' })
      .mockResolvedValueOnce({ status: 'validating', durationMs: 150 });

    const result = await service.processQueue('tenant-1');

    expect(result.completed).toBe(2);
    expect(result.failed).toBe(1);
  });
});
