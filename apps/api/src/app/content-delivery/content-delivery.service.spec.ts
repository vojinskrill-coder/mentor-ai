import { ContentDeliveryService } from './content-delivery.service';

// ── Mock Factories ────────────────────────────────────────────

function createMockPrisma(conceptOverrides: Record<string, unknown> = {}) {
  return {
    concept: {
      findUnique: jest.fn().mockResolvedValue({
        id: 'cpt-1',
        name: 'Test Concept',
        slug: 'test-concept',
        category: 'Marketing',
        tier: 'enriched',
        confidence: 0.85,
        tenantId: 'tnt-1',
        ...conceptOverrides,
      }),
    },
  };
}

function createMockVaultStorage(fileContent: string | null = null) {
  return {
    readFile: jest.fn().mockResolvedValue(fileContent ?? ''),
    writeFile: jest.fn(),
    fileExists: jest.fn().mockResolvedValue(fileContent !== null),
    listFiles: jest.fn().mockResolvedValue([]),
    writeFiles: jest.fn(),
    createDirectories: jest.fn(),
  };
}

// ── Tests ─────────────────────────────────────────────────────

describe('ContentDeliveryService', () => {
  function createService(
    prismaOverrides: Record<string, unknown> = {},
    vaultContent: string | null = null,
  ) {
    const prisma = createMockPrisma(prismaOverrides);
    const vaultStorage = createMockVaultStorage(vaultContent);
    const service = new ContentDeliveryService(prisma as any, vaultStorage);
    return { service, prisma, vaultStorage };
  }

  it('returns enriched concept with vault content', async () => {
    const content = '---\ntitle: Test\n---\n# Test Article\nLots of content here...';
    const { service, vaultStorage } = createService({}, content);

    const result = await service.getConceptContent('tnt-1', 'cpt-1');

    expect(result.enrichmentStatus).toBe('completed');
    expect(result.content).toBe(content);
    expect(vaultStorage.readFile).toHaveBeenCalledWith('tnt-1', 'wiki/concepts/test-concept.md');
  });

  it('returns pending status when vault file does not exist', async () => {
    const { service } = createService({}, null);

    const result = await service.getConceptContent('tnt-1', 'cpt-1');

    expect(result.enrichmentStatus).toBe('pending');
    expect(result.content).toBeNull();
  });

  it('returns error status on vault read failure (graceful, not 500)', async () => {
    const prisma = createMockPrisma();
    const vaultStorage = createMockVaultStorage(null);
    vaultStorage.fileExists.mockRejectedValue(new Error('SSH timeout'));
    const service = new ContentDeliveryService(prisma as any, vaultStorage);

    const result = await service.getConceptContent('tnt-1', 'cpt-1');

    expect(result.enrichmentStatus).toBe('error');
    expect(result.content).toBeNull();
    expect(result.error).toBe('Content temporarily unavailable');
  });

  it('uses tenantId from parameter, not from concept', async () => {
    const { service, vaultStorage } = createService({}, 'content');

    await service.getConceptContent('tnt-1', 'cpt-1');

    // VaultStorage should be called with the auth tenantId
    expect(vaultStorage.fileExists).toHaveBeenCalledWith('tnt-1', expect.any(String));
  });

  it('rejects cross-tenant access (concept belongs to different tenant)', async () => {
    const { service } = createService({ tenantId: 'tnt-other' }, 'content');

    await expect(service.getConceptContent('tnt-1', 'cpt-1'))
      .rejects.toThrow('does not belong to tenant');
  });

  it('throws when concept not found', async () => {
    const prisma = createMockPrisma();
    (prisma.concept.findUnique as jest.Mock).mockResolvedValue(null);
    const vaultStorage = createMockVaultStorage();
    const service = new ContentDeliveryService(prisma as any, vaultStorage);

    await expect(service.getConceptContent('tnt-1', 'nonexistent'))
      .rejects.toThrow('not found');
  });

  it('never reads content from PG — only metadata', async () => {
    const { service, prisma } = createService({}, 'vault content');

    await service.getConceptContent('tnt-1', 'cpt-1');

    // Verify PG query selects metadata fields only
    const selectArg = (prisma.concept.findUnique as jest.Mock).mock.calls[0][0].select;
    expect(selectArg).not.toHaveProperty('description');
    expect(selectArg).not.toHaveProperty('content');
    expect(selectArg).not.toHaveProperty('extendedDescription');
    expect(selectArg).toHaveProperty('id');
    expect(selectArg).toHaveProperty('name');
    expect(selectArg).toHaveProperty('slug');
  });

  it('returns metadata even when content is null (pending)', async () => {
    const { service } = createService({}, null);

    const result = await service.getConceptContent('tnt-1', 'cpt-1');

    expect(result.id).toBe('cpt-1');
    expect(result.name).toBe('Test Concept');
    expect(result.category).toBe('Marketing');
    expect(result.content).toBeNull();
  });

  it('generates slug from name if concept has no slug', async () => {
    const { service, vaultStorage } = createService({ slug: null, name: 'Business Strategy' }, 'content');

    await service.getConceptContent('tnt-1', 'cpt-1');

    expect(vaultStorage.fileExists).toHaveBeenCalledWith('tnt-1', 'wiki/concepts/business-strategy.md');
  });
});
