import { TenantIsolationService } from './tenant-isolation.service';

describe('TenantIsolationService', () => {
  let service: TenantIsolationService;
  let mockPrisma: any;
  let mockVault: any;

  beforeEach(() => {
    mockPrisma = {
      tenant: {
        findUnique: jest.fn().mockImplementation(({ where }: any) => {
          if (where.id === 'tenant-a') return Promise.resolve({ id: 'tenant-a', name: 'A' });
          if (where.id === 'tenant-b') return Promise.resolve({ id: 'tenant-b', name: 'B' });
          return Promise.resolve(null);
        }),
      },
      user: {
        findMany: jest.fn().mockImplementation(({ where }: any) => {
          if (where.tenantId === 'tenant-a') return Promise.resolve([{ id: 'user-1' }]);
          if (where.tenantId === 'tenant-b') return Promise.resolve([{ id: 'user-2' }]);
          return Promise.resolve([]);
        }),
      },
      memory: {
        count: jest.fn().mockResolvedValue(5),
      },
      concept: {
        findUnique: jest.fn().mockResolvedValue({ id: 'concept-1', slug: 'test' }),
      },
    };
    mockVault = {
      readFile: jest.fn().mockRejectedValue(new Error('Path traversal blocked')),
    };
    service = new TenantIsolationService(mockPrisma, mockVault);
  });

  it('should verify isolation between two tenants', async () => {
    const result = await service.verifyIsolation('tenant-a', 'tenant-b');
    expect(result.isolated).toBe(true);
    expect(result.checks.length).toBeGreaterThanOrEqual(5);
  });

  it('should detect user overlap between tenants', async () => {
    mockPrisma.user.findMany.mockResolvedValue([{ id: 'shared-user' }]);
    const result = await service.verifyIsolation('tenant-a', 'tenant-b');
    const userCheck = result.checks.find((c) => c.name === 'user_isolation');
    expect(userCheck!.passed).toBe(false);
  });

  it('should detect path traversal attempt', async () => {
    const result = await service.verifyIsolation('tenant-a', 'tenant-b');
    const pathCheck = result.checks.find((c) => c.name === 'path_traversal_blocked');
    expect(pathCheck!.passed).toBe(true);
  });

  it('should fail if path traversal succeeds', async () => {
    mockVault.readFile.mockResolvedValue('# Leaked content');
    const result = await service.verifyIsolation('tenant-a', 'tenant-b');
    const pathCheck = result.checks.find((c) => c.name === 'path_traversal_blocked');
    expect(pathCheck!.passed).toBe(false);
  });

  it('should verify concept access for valid tenant', async () => {
    const access = await service.verifyConceptAccess('tenant-a', 'concept-1');
    expect(access).toBe(true);
  });

  it('should deny concept access for invalid tenant', async () => {
    const access = await service.verifyConceptAccess('unknown', 'concept-1');
    expect(access).toBe(false);
  });

  it('should deny access for nonexistent concept', async () => {
    mockPrisma.concept.findUnique.mockResolvedValue(null);
    const access = await service.verifyConceptAccess('tenant-a', 'nonexistent');
    expect(access).toBe(false);
  });

  it('should fail isolation when tenant missing', async () => {
    const result = await service.verifyIsolation('tenant-a', 'unknown');
    const tenantCheck = result.checks.find((c) => c.name === 'tenants_exist_separately');
    expect(tenantCheck!.passed).toBe(false);
  });
});
