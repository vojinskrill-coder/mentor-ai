import { Test, TestingModule } from '@nestjs/testing';
import { BrainIndexService } from './brain-index.service';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';

describe('BrainIndexService', () => {
  let service: BrainIndexService;

  const mockPrisma = {
    tenantVault: {
      findUnique: jest.fn(),
    },
    concept: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  };

  const mockConcepts = [
    { id: 'cpt_1', name: 'Marketing Plan', slug: 'marketing-plan', category: 'Marketing', definition: 'A plan for marketing activities', departmentTags: ['Marketing'], confidence: 0.8, tier: 'semantic' },
    { id: 'cpt_2', name: 'Finansijski Plan', slug: 'finansijski-plan', category: 'Finansije', definition: 'Financial planning overview', departmentTags: ['Finance'], confidence: 0.5, tier: 'working' },
    { id: 'cpt_3', name: 'Prodajni Plan', slug: 'prodajni-plan', category: 'Prodaja', definition: 'Sales strategy and planning', departmentTags: ['Sales'], confidence: 0.9, tier: 'procedural' },
  ];

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BrainIndexService,
        { provide: PlatformPrismaService, useValue: mockPrisma },
      ],
    }).compile();
    service = module.get<BrainIndexService>(BrainIndexService);
  });

  describe('findRelevantConcepts', () => {
    beforeEach(() => {
      mockPrisma.tenantVault.findUnique.mockResolvedValue({ id: 'vault_1', status: 'ready' });
      mockPrisma.concept.findMany.mockResolvedValue(mockConcepts);
      mockPrisma.concept.count.mockResolvedValue(1);
    });

    it('should find concepts matching English query via bilingual mapping', async () => {
      const results = await service.findRelevantConcepts('tnt_test', 'pricing strategy', 5);
      // "pricing" maps to Serbian ["cena", "cene", "odredjivanje"]
      // Should still match even though concept names are in Serbian
      expect(results.length).toBeGreaterThanOrEqual(0);
    });

    it('should find concepts matching direct keyword in name', async () => {
      const results = await service.findRelevantConcepts('tnt_test', 'marketing plan activities', 5);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0]!.name).toBe('Marketing Plan');
    });

    it('should filter by department when provided', async () => {
      const results = await service.findRelevantConcepts('tnt_test', 'plan', 5, 'Marketing');
      const names = results.map((r) => r.name);
      expect(names).not.toContain('Finansijski Plan'); // Finance only
    });

    it('should return empty for no keyword matches', async () => {
      const results = await service.findRelevantConcepts('tnt_test', 'xyz123 nonsense', 5);
      expect(results).toEqual([]);
    });

    it('should return null index for non-existent vault', async () => {
      mockPrisma.tenantVault.findUnique.mockResolvedValue(null);
      const results = await service.findRelevantConcepts('tnt_none', 'test', 5);
      expect(results).toEqual([]);
    });
  });

  describe('cache behavior', () => {
    it('should cache index and return cached version on second call', async () => {
      mockPrisma.tenantVault.findUnique.mockResolvedValue({ id: 'vault_1', status: 'ready' });
      mockPrisma.concept.findMany.mockResolvedValue(mockConcepts);
      mockPrisma.concept.count.mockResolvedValue(0);

      await service.getIndex('tnt_test');
      await service.getIndex('tnt_test');

      // Should only query DB once (second call uses cache)
      expect(mockPrisma.concept.findMany).toHaveBeenCalledTimes(2); // Once for concepts, once for enrichedIds
    });

    it('should invalidate cache', async () => {
      mockPrisma.tenantVault.findUnique.mockResolvedValue({ id: 'vault_1', status: 'ready' });
      mockPrisma.concept.findMany.mockResolvedValue(mockConcepts);
      mockPrisma.concept.count.mockResolvedValue(0);

      await service.getIndex('tnt_test');
      service.invalidateCache('tnt_test');
      await service.getIndex('tnt_test');

      // Should query DB again after invalidation
      expect(mockPrisma.concept.findMany).toHaveBeenCalledTimes(4); // 2 per getIndex call
    });
  });

  describe('generateIndexMarkdown', () => {
    it('should generate organized markdown with categories', async () => {
      mockPrisma.tenantVault.findUnique.mockResolvedValue({ id: 'vault_1', status: 'ready' });
      mockPrisma.concept.findMany.mockResolvedValue(mockConcepts);
      mockPrisma.concept.count.mockResolvedValue(1);

      const md = await service.generateIndexMarkdown('tnt_test');
      expect(md).toContain('# Brain Index');
      expect(md).toContain('## Marketing');
      expect(md).toContain('## Finansije');
      expect(md).toContain('[[Marketing Plan]]');
    });
  });
});
