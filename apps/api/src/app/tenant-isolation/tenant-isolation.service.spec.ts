import { TenantIsolationService } from './tenant-isolation.service';
import { VaultStorageError } from '../vault-storage/vault-storage.error';

function createMockPrisma() {
  return {
    concept: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn().mockResolvedValue(null),
    },
  };
}

function createMockVaultStorage() {
  return {
    readFile: jest.fn().mockResolvedValue(''),
    writeFile: jest.fn(),
    fileExists: jest.fn().mockResolvedValue(true),
    listFiles: jest.fn().mockResolvedValue([]),
    writeFiles: jest.fn(),
    createDirectories: jest.fn(),
  };
}

describe('TenantIsolationService', () => {
  let service: TenantIsolationService;
  let prisma: ReturnType<typeof createMockPrisma>;
  let vaultStorage: ReturnType<typeof createMockVaultStorage>;

  beforeEach(() => {
    prisma = createMockPrisma();
    vaultStorage = createMockVaultStorage();
    service = new TenantIsolationService(prisma as any, vaultStorage);
  });

  describe('verifyIsolation', () => {
    it('passes when no cross-tenant data found and path traversal blocked', async () => {
      // Path traversal should throw VaultStorageError
      vaultStorage.readFile.mockRejectedValue(
        new VaultStorageError('Path traversal blocked', 'tnt-1', '../../tnt-2/vault/SCHEMA.md', 'read')
      );

      const result = await service.verifyIsolation('tnt-1', 'tnt-2');

      expect(result.isolated).toBe(true);
      expect(result.failures).toHaveLength(0);
    });

    it('fails when PG returns cross-tenant concepts', async () => {
      // First call: get tenant B's concept IDs
      prisma.concept.findMany
        .mockResolvedValueOnce([{ id: 'cpt-b1' }]) // tenant B's concepts
        .mockResolvedValueOnce([{ id: 'cpt-b1', tenantId: 'tnt-1' }]); // LEAK: B's concept found under A

      // Path traversal still blocked
      vaultStorage.readFile.mockRejectedValue(new Error('Path traversal blocked'));

      const result = await service.verifyIsolation('tnt-1', 'tnt-2');

      const pgCheck = result.checks.find(c => c.check === 'pg_cross_tenant_concepts');
      expect(pgCheck?.passed).toBe(false);
    });

    it('passes path traversal check when VaultStorage blocks ../ paths', async () => {
      vaultStorage.readFile.mockRejectedValue(
        new VaultStorageError('Path traversal blocked', 'tnt-1', '../../tnt-2/vault/SCHEMA.md', 'read')
      );

      const result = await service.verifyIsolation('tnt-1', 'tnt-2');

      const traversalCheck = result.checks.find(c => c.check === 'path_traversal_protection');
      expect(traversalCheck?.passed).toBe(true);
    });

    it('fails path traversal check when VaultStorage does NOT block ../ paths', async () => {
      // If readFile succeeds with traversal path, isolation is broken
      vaultStorage.readFile.mockResolvedValue('leaked content from other tenant');

      const result = await service.verifyIsolation('tnt-1', 'tnt-2');

      const traversalCheck = result.checks.find(c => c.check === 'path_traversal_protection');
      expect(traversalCheck?.passed).toBe(false);
    });
  });

  describe('verifyConceptAccess', () => {
    it('returns true when concept belongs to the requesting tenant', async () => {
      prisma.concept.findUnique.mockResolvedValue({ tenantId: 'tnt-1' });

      const result = await service.verifyConceptAccess('tnt-1', 'cpt-1');
      expect(result).toBe(true);
    });

    it('returns false when concept belongs to a different tenant', async () => {
      prisma.concept.findUnique.mockResolvedValue({ tenantId: 'tnt-other' });

      const result = await service.verifyConceptAccess('tnt-1', 'cpt-1');
      expect(result).toBe(false);
    });

    it('returns true for platform concepts (no tenantId)', async () => {
      prisma.concept.findUnique.mockResolvedValue({ tenantId: null });

      const result = await service.verifyConceptAccess('tnt-1', 'cpt-platform');
      expect(result).toBe(true);
    });

    it('returns false when concept does not exist', async () => {
      prisma.concept.findUnique.mockResolvedValue(null);

      const result = await service.verifyConceptAccess('tnt-1', 'nonexistent');
      expect(result).toBe(false);
    });
  });
});
