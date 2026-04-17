import { Test, TestingModule } from '@nestjs/testing';
import { RecommendationService } from './recommendation.service';
import { BrainIndexService } from './brain-index.service';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';

describe('RecommendationService', () => {
  let service: RecommendationService;

  const mockPrisma = {
    mcpToolCatalog: { findMany: jest.fn() },
    tenantCredential: { findMany: jest.fn() },
    tenant: { findUnique: jest.fn() },
    processWorkflow: { findMany: jest.fn() },
  };

  const mockBrainIndex = {
    getIndex: jest.fn(),
  };

  const mockTools = [
    { slug: 'apollo-io', displayName: 'Apollo.io', description: 'B2B lead search', category: 'crm' },
    { slug: 'notion', displayName: 'Notion', description: 'Note and database', category: 'db' },
    { slug: 'gmail', displayName: 'Gmail', description: 'Email', category: 'comms' },
  ];

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecommendationService,
        { provide: PlatformPrismaService, useValue: mockPrisma },
        { provide: BrainIndexService, useValue: mockBrainIndex },
      ],
    }).compile();
    service = module.get<RecommendationService>(RecommendationService);
  });

  describe('getMcpRecommendations', () => {
    it('should recommend unconnected tools', async () => {
      mockPrisma.mcpToolCatalog.findMany.mockResolvedValue(mockTools);
      mockPrisma.tenantCredential.findMany.mockResolvedValue([{ toolSlug: 'apollo-io' }]);
      mockPrisma.tenant.findUnique.mockResolvedValue({ industry: 'technology' });
      mockPrisma.processWorkflow.findMany.mockResolvedValue([]);

      const cards = await service.getMcpRecommendations('tnt_test');

      const connectCards = cards.filter((c) => c.action.label === 'Connect');
      expect(connectCards.length).toBe(2); // notion + gmail (apollo already connected)
      expect(connectCards.map((c) => c.title)).not.toContain('Connect Apollo.io');
    });

    it('should suggest building a process for connected tools without processes', async () => {
      mockPrisma.mcpToolCatalog.findMany.mockResolvedValue(mockTools);
      mockPrisma.tenantCredential.findMany.mockResolvedValue([{ toolSlug: 'apollo-io' }]);
      mockPrisma.tenant.findUnique.mockResolvedValue({ industry: 'technology' });
      mockPrisma.processWorkflow.findMany.mockResolvedValue([]);

      const cards = await service.getMcpRecommendations('tnt_test');

      const buildCards = cards.filter((c) => c.action.label === 'Build Process');
      expect(buildCards.length).toBe(1);
      expect(buildCards[0]!.title).toContain('Apollo.io');
    });
  });

  describe('getTaskRecommendations', () => {
    it('should return low-confidence concepts as high priority', async () => {
      mockBrainIndex.getIndex.mockResolvedValue({
        entries: [
          { id: 'cpt_1', name: 'Test Concept', category: 'Marketing', departmentTags: ['all'], confidence: 0.3, enriched: true, tier: 'semantic' },
          { id: 'cpt_2', name: 'Good Concept', category: 'Sales', departmentTags: ['all'], confidence: 0.9, enriched: true, tier: 'procedural' },
        ],
      });

      const cards = await service.getTaskRecommendations('tnt_test');

      expect(cards.length).toBe(1);
      expect(cards[0]!.priority).toBe('high');
      expect(cards[0]!.title).toContain('Test Concept');
    });

    it('should filter by department', async () => {
      mockBrainIndex.getIndex.mockResolvedValue({
        entries: [
          { id: 'cpt_1', name: 'Marketing Concept', departmentTags: ['Marketing'], confidence: 0.3, enriched: true },
          { id: 'cpt_2', name: 'Finance Concept', departmentTags: ['Finance'], confidence: 0.3, enriched: true },
        ],
      });

      const cards = await service.getTaskRecommendations('tnt_test', 'Marketing');

      expect(cards.length).toBe(1);
      expect(cards[0]!.title).toContain('Marketing');
    });
  });

  describe('getProcessSuggestions', () => {
    it('should suggest Apollo process for lead-related topics', async () => {
      mockPrisma.tenantCredential.findMany.mockResolvedValue([{ toolSlug: 'apollo-io' }]);
      mockPrisma.processWorkflow.findMany.mockResolvedValue([]);

      const cards = await service.getProcessSuggestions('tnt_test', 'I need to find new leads for my business');

      expect(cards.length).toBe(1);
      expect(cards[0]!.title).toContain('Lead Discovery');
    });

    it('should suggest existing process instead of new one', async () => {
      mockPrisma.tenantCredential.findMany.mockResolvedValue([{ toolSlug: 'apollo-io' }]);
      mockPrisma.processWorkflow.findMany.mockResolvedValue([
        { id: 'proc_1', name: 'Lead Discovery Pipeline', slug: 'lead-discovery' },
      ]);

      const cards = await service.getProcessSuggestions('tnt_test', 'find leads for luxury clients');

      const existing = cards.find((c) => c.action.label === 'Run It');
      expect(existing).toBeDefined();
    });

    it('should return empty for no connected tools', async () => {
      mockPrisma.tenantCredential.findMany.mockResolvedValue([]);

      const cards = await service.getProcessSuggestions('tnt_test', 'find leads');

      expect(cards).toEqual([]);
    });
  });

  describe('dismissCard', () => {
    it('should hide dismissed cards for 7 days', async () => {
      mockBrainIndex.getIndex.mockResolvedValue({
        entries: [
          { id: 'cpt_1', name: 'Concept A', departmentTags: ['all'], confidence: 0.3, enriched: true },
        ],
      });

      const cardsBefore = await service.getTaskRecommendations('tnt_test');
      expect(cardsBefore.length).toBe(1);

      service.dismissCard('tnt_test', cardsBefore[0]!.id);

      const cardsAfter = await service.getTaskRecommendations('tnt_test');
      expect(cardsAfter.length).toBe(0);
    });
  });
});
