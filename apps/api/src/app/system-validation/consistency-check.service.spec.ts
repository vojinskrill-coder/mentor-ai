import { ConsistencyCheckService } from './consistency-check.service';

describe('ConsistencyCheckService', () => {
  let service: ConsistencyCheckService;
  let mockPrisma: any;
  let mockVault: any;

  beforeEach(() => {
    mockPrisma = {
      concept: {
        findMany: jest.fn().mockResolvedValue([
          { id: '1', slug: 'prodaja' },
          { id: '2', slug: 'marketing' },
          { id: '3', slug: 'finansije' },
        ]),
      },
      enrichmentQueue: {
        findMany: jest.fn().mockResolvedValue([
          { conceptSlug: 'prodaja' },
          { conceptSlug: 'marketing' },
        ]),
      },
    };
    mockVault = {
      fileExists: jest.fn().mockResolvedValue(true),
      listFiles: jest.fn().mockResolvedValue(['prodaja.md', 'marketing.md']),
    };
    service = new ConsistencyCheckService(mockPrisma, mockVault);
  });

  it('should report consistent state when all vault files exist', async () => {
    const result = await service.verifyConsistency('tenant-1');
    expect(result.consistent).toBe(true);
    expect(result.missingVaultFiles).toHaveLength(0);
  });

  it('should detect missing vault files', async () => {
    mockVault.fileExists.mockImplementation(
      (_t: string, path: string) =>
        Promise.resolve(!path.includes('marketing')),
    );
    const result = await service.verifyConsistency('tenant-1');
    expect(result.consistent).toBe(false);
    expect(result.missingVaultFiles).toContain('marketing');
  });

  it('should detect orphaned vault files', async () => {
    mockVault.listFiles.mockResolvedValue([
      'prodaja.md',
      'marketing.md',
      'unknown-concept.md',
    ]);
    const result = await service.verifyConsistency('tenant-1');
    expect(result.orphanedVaultFiles).toContain('unknown-concept');
  });

  it('should report total and completed concept counts', async () => {
    const result = await service.verifyConsistency('tenant-1');
    expect(result.totalConcepts).toBe(3);
    expect(result.completedConcepts).toBe(2);
  });

  it('should handle vault errors gracefully', async () => {
    mockVault.fileExists.mockRejectedValue(new Error('Vault down'));
    mockVault.listFiles.mockRejectedValue(new Error('Vault down'));
    const result = await service.verifyConsistency('tenant-1');
    expect(result.missingVaultFiles.length).toBeGreaterThan(0);
  });

  it('should handle missing enrichment queue table', async () => {
    mockPrisma.enrichmentQueue = undefined;
    const result = await service.verifyConsistency('tenant-1');
    expect(result.completedConcepts).toBe(0);
    expect(result.consistent).toBe(true);
  });
});
