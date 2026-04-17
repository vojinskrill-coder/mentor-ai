import { Test, TestingModule } from '@nestjs/testing';
import { VaultService } from './vault.service';
import { SourceVaultService } from './source-vault.service';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';

describe('VaultService', () => {
  let service: VaultService;
  let prisma: any;
  let sourceVault: SourceVaultService;

  const mockPrisma = {
    tenantVault: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    concept: {
      create: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      findMany: jest.fn(),
    },
    conceptRelationship: {
      create: jest.fn(),
    },
    vaultOperationLog: {
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn((ops: unknown[]) => Promise.resolve(ops)),
  };

  const mockSourceConcepts = [
    {
      name: 'Uvod u Marketing',
      slug: 'uvod-u-marketing',
      category: 'Marketing',
      sortOrder: 1,
      categorySortOrder: 3,
      originalContent: 'Test content',
      definition: 'Test definition',
      departmentTags: ['Marketing'],
      curriculumId: 'uvod-u-marketing',
      parentCurriculumId: 'marketing',
    },
    {
      name: 'Finansijski Plan',
      slug: 'finansijski-plan',
      category: 'Finansije',
      sortOrder: 1,
      categorySortOrder: 8,
      originalContent: 'Finance content',
      definition: 'Finance definition',
      departmentTags: ['Finance'],
      curriculumId: 'finansijski-plan',
      parentCurriculumId: 'finansije',
    },
  ];

  const mockCategories = [
    { id: 'marketing', label: 'Marketing', sortOrder: 3 },
    { id: 'finansije', label: 'Finansije', sortOrder: 8 },
  ];

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VaultService,
        { provide: PlatformPrismaService, useValue: mockPrisma },
        {
          provide: SourceVaultService,
          useValue: {
            loadSourceConcepts: jest.fn().mockResolvedValue(mockSourceConcepts),
            getCategories: jest.fn().mockResolvedValue(mockCategories),
          },
        },
      ],
    }).compile();

    service = module.get<VaultService>(VaultService);
    prisma = module.get(PlatformPrismaService);
    sourceVault = module.get(SourceVaultService);
  });

  describe('createTenantVault', () => {
    it('should create vault record with correct structure', async () => {
      mockPrisma.tenantVault.findUnique.mockResolvedValue(null);
      mockPrisma.tenantVault.upsert.mockResolvedValue({
        id: 'vault_test123',
        tenantId: 'tnt_test',
        status: 'creating',
      });
      mockPrisma.concept.findMany.mockResolvedValue([]);
      mockPrisma.tenantVault.update.mockResolvedValue({});

      const result = await service.createTenantVault('tnt_test', 'Test Corp', 'technology');

      expect(result.conceptCount).toBe(2); // 2 mock concepts
      expect(result.categoryCount).toBe(2); // 2 mock categories
      expect(mockPrisma.tenantVault.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            tenantId: 'tnt_test',
            name: 'Test Corp Knowledge Base',
            status: 'creating',
          }),
        }),
      );
    });

    it('should skip creation if vault already exists and is ready', async () => {
      mockPrisma.tenantVault.findUnique.mockResolvedValue({
        id: 'vault_existing',
        status: 'ready',
      });

      const result = await service.createTenantVault('tnt_test', 'Test Corp');

      expect(result.vaultId).toBe('vault_existing');
      expect(mockPrisma.concept.create).not.toHaveBeenCalled();
    });

    it('should create concepts with tenant isolation', async () => {
      mockPrisma.tenantVault.findUnique.mockResolvedValue(null);
      mockPrisma.tenantVault.upsert.mockResolvedValue({
        id: 'vault_test',
        tenantId: 'tnt_test',
      });
      mockPrisma.concept.findMany.mockResolvedValue([]);
      mockPrisma.tenantVault.update.mockResolvedValue({});

      await service.createTenantVault('tnt_test', 'Test Corp');

      // Verify concepts are created via $transaction
      expect(mockPrisma.$transaction).toHaveBeenCalled();
      const transactionCalls = mockPrisma.$transaction.mock.calls;
      expect(transactionCalls.length).toBeGreaterThan(0);
    });

    it('should log operation to VaultOperationLog', async () => {
      mockPrisma.tenantVault.findUnique.mockResolvedValue(null);
      mockPrisma.tenantVault.upsert.mockResolvedValue({
        id: 'vault_test',
        tenantId: 'tnt_test',
      });
      mockPrisma.concept.findMany.mockResolvedValue([]);
      mockPrisma.tenantVault.update.mockResolvedValue({});

      await service.createTenantVault('tnt_test', 'Test Corp');

      expect(mockPrisma.vaultOperationLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            tenantId: 'tnt_test',
            operationType: 'create',
            status: 'running',
          }),
        }),
      );

      expect(mockPrisma.vaultOperationLog.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'completed',
          }),
        }),
      );
    });

    it('should set vault status to error on failure', async () => {
      mockPrisma.tenantVault.findUnique.mockResolvedValue(null);
      mockPrisma.tenantVault.upsert.mockRejectedValue(new Error('DB connection failed'));

      await expect(
        service.createTenantVault('tnt_test', 'Test Corp'),
      ).rejects.toThrow('DB connection failed');

      expect(mockPrisma.tenantVault.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: 'error',
          }),
        }),
      );
    });
  });

  describe('getVaultStatus', () => {
    it('should return vault status for tenant', async () => {
      mockPrisma.tenantVault.findUnique.mockResolvedValue({
        id: 'vault_test',
        status: 'ready',
        conceptCount: 445,
        categoryCount: 22,
      });

      const result = await service.getVaultStatus('tnt_test');

      expect(result?.status).toBe('ready');
      expect(result?.conceptCount).toBe(445);
    });

    it('should return null for tenant without vault', async () => {
      mockPrisma.tenantVault.findUnique.mockResolvedValue(null);

      const result = await service.getVaultStatus('tnt_nonexistent');

      expect(result).toBeNull();
    });
  });
});
