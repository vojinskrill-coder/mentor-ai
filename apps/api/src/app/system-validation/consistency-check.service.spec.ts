import { ConsistencyCheckService } from './consistency-check.service';

function createMockPrisma(concepts: any[] = []) {
  return {
    concept: {
      findMany: jest.fn().mockResolvedValue(concepts),
    },
  };
}

function createMockVaultStorage() {
  return {
    readFile: jest.fn().mockResolvedValue('content'),
    writeFile: jest.fn(),
    fileExists: jest.fn().mockResolvedValue(true),
    listFiles: jest.fn().mockResolvedValue([]),
    writeFiles: jest.fn(),
    createDirectories: jest.fn(),
  };
}

function createMockQueueService() {
  return {
    getQueueStats: jest.fn().mockResolvedValue({
      QUEUED: 0, DISPATCHED: 0, EXECUTING: 0, VALIDATING: 0,
      CORRECTING: 0, COMPLETED: 3, FAILED: 0, PERMANENTLY_FAILED: 0,
    }),
    enqueue: jest.fn(),
    dequeue: jest.fn(),
    markExecuting: jest.fn(),
    markValidating: jest.fn(),
    markCompleted: jest.fn(),
    markFailed: jest.fn(),
    markCorrecting: jest.fn(),
    retryFailed: jest.fn(),
    getEntry: jest.fn(),
    enqueueBatch: jest.fn(),
    markBackToValidating: jest.fn(),
  };
}

describe('ConsistencyCheckService', () => {
  const concepts = [
    { id: 'cpt-1', name: 'Marketing Strategy', slug: 'marketing-strategy' },
    { id: 'cpt-2', name: 'Sales Pipeline', slug: 'sales-pipeline' },
    { id: 'cpt-3', name: 'Financial Planning', slug: 'financial-planning' },
  ];

  it('reports all consistent when vault files exist with content', async () => {
    const prisma = createMockPrisma(concepts);
    const vault = createMockVaultStorage();
    const queue = createMockQueueService();
    const service = new ConsistencyCheckService(prisma as any, vault, queue as any);

    const result = await service.verifyConsistency('tnt-1');

    expect(result.consistent).toBe(true);
    expect(result.checked).toBe(3);
    expect(result.drifts).toHaveLength(0);
  });

  it('detects missing vault file', async () => {
    const prisma = createMockPrisma(concepts);
    const vault = createMockVaultStorage();
    // Second concept's file doesn't exist
    vault.fileExists
      .mockResolvedValueOnce(true)   // cpt-1
      .mockResolvedValueOnce(false)  // cpt-2 MISSING
      .mockResolvedValueOnce(true);  // cpt-3
    const queue = createMockQueueService();
    const service = new ConsistencyCheckService(prisma as any, vault, queue as any);

    const result = await service.verifyConsistency('tnt-1');

    expect(result.consistent).toBe(false);
    expect(result.drifts).toHaveLength(1);
    expect(result.drifts[0]!.conceptId).toBe('cpt-2');
    expect(result.drifts[0]!.issue).toBe('missing_vault_file');
  });

  it('detects empty vault file', async () => {
    const prisma = createMockPrisma(concepts);
    const vault = createMockVaultStorage();
    // Third concept's file is empty
    vault.readFile
      .mockResolvedValueOnce('content 1')
      .mockResolvedValueOnce('content 2')
      .mockResolvedValueOnce('');  // cpt-3 EMPTY
    const queue = createMockQueueService();
    const service = new ConsistencyCheckService(prisma as any, vault, queue as any);

    const result = await service.verifyConsistency('tnt-1');

    expect(result.consistent).toBe(false);
    expect(result.drifts).toHaveLength(1);
    expect(result.drifts[0]!.conceptId).toBe('cpt-3');
    expect(result.drifts[0]!.issue).toBe('empty_vault_file');
  });

  it('detects vault read error as missing file', async () => {
    const prisma = createMockPrisma(concepts);
    const vault = createMockVaultStorage();
    vault.fileExists
      .mockResolvedValueOnce(true)
      .mockRejectedValueOnce(new Error('SSH connection failed'))
      .mockResolvedValueOnce(true);
    const queue = createMockQueueService();
    const service = new ConsistencyCheckService(prisma as any, vault, queue as any);

    const result = await service.verifyConsistency('tnt-1');

    expect(result.consistent).toBe(false);
    expect(result.drifts[0]!.issue).toBe('missing_vault_file');
    expect(result.drifts[0]!.details).toContain('SSH connection failed');
  });

  it('returns empty drifts for tenant with no concepts', async () => {
    const prisma = createMockPrisma([]);
    const vault = createMockVaultStorage();
    const queue = createMockQueueService();
    const service = new ConsistencyCheckService(prisma as any, vault, queue as any);

    const result = await service.verifyConsistency('tnt-empty');

    expect(result.consistent).toBe(true);
    expect(result.checked).toBe(0);
    expect(result.drifts).toHaveLength(0);
  });

  it('generates slug from name when concept has no slug', async () => {
    const conceptsNoSlug = [
      { id: 'cpt-1', name: 'Business Strategy', slug: null },
    ];
    const prisma = createMockPrisma(conceptsNoSlug);
    const vault = createMockVaultStorage();
    const queue = createMockQueueService();
    const service = new ConsistencyCheckService(prisma as any, vault, queue as any);

    await service.verifyConsistency('tnt-1');

    expect(vault.fileExists).toHaveBeenCalledWith('tnt-1', 'wiki/concepts/business-strategy.md');
  });
});
