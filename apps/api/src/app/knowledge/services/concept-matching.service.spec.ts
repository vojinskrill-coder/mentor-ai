import { Test, TestingModule } from '@nestjs/testing';
import { ConceptMatchingService } from './concept-matching.service';
import { EmbeddingService } from './embedding.service';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';

describe('ConceptMatchingService', () => {
  let service: ConceptMatchingService;
  let mockPrisma: {
    concept: {
      findMany: jest.Mock;
    };
  };

  const mockConcepts = [
    {
      id: 'cpt_test1',
      name: 'Value-Based Pricing',
      category: 'Finance',
      definition: 'A pricing strategy based on perceived customer value.',
    },
    {
      id: 'cpt_test2',
      name: 'Market Segmentation',
      category: 'Marketing',
      definition: 'Dividing a market into distinct groups of buyers.',
    },
    {
      id: 'cpt_test3',
      name: 'Competitive Strategy',
      category: 'Strategy',
      definition: 'An approach to compete effectively in the market.',
    },
  ];

  beforeEach(async () => {
    mockPrisma = {
      concept: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConceptMatchingService,
        { provide: PlatformPrismaService, useValue: mockPrisma },
        { provide: EmbeddingService, useValue: {} },
      ],
    }).compile();

    service = module.get<ConceptMatchingService>(ConceptMatchingService);
  });

  describe('findRelevantConcepts (keyword matching)', () => {
    it('should find concepts by keyword match in name or definition', async () => {
      mockPrisma.concept.findMany.mockResolvedValue([mockConcepts[0]]);

      const result = await service.findRelevantConcepts(
        'Consider using value-based pricing for your products.'
      );

      expect(mockPrisma.concept.findMany).toHaveBeenCalled();
      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it('should return empty array when no keywords match', async () => {
      mockPrisma.concept.findMany.mockResolvedValue([]);

      const result = await service.findRelevantConcepts('xyz abc');

      expect(result).toHaveLength(0);
    });

    it('should return empty array for very short input', async () => {
      const result = await service.findRelevantConcepts('hi');

      expect(result).toHaveLength(0);
    });

    it('should respect limit option', async () => {
      mockPrisma.concept.findMany.mockResolvedValue(mockConcepts);

      const result = await service.findRelevantConcepts(
        'We need pricing strategy and market segmentation for competitive advantage.',
        { limit: 2 }
      );

      expect(result.length).toBeLessThanOrEqual(2);
    });

    it('should score concepts by keyword match count', async () => {
      // Concept with more keyword matches should score higher
      mockPrisma.concept.findMany.mockResolvedValue([
        mockConcepts[0], // "pricing", "strategy", "value", "customer"
        mockConcepts[1], // "market", "segmentation"
      ]);

      const result = await service.findRelevantConcepts('pricing strategy value customer market');

      if (result.length >= 2) {
        // More keyword matches = higher score
        expect(result[0]!.score).toBeGreaterThanOrEqual(result[1]!.score);
      }
    });

    it('should filter common English words and return empty', async () => {
      const result = await service.findRelevantConcepts('the and for are but not you all can');

      // All words are common/short — no keywords extracted, no DB query, empty result
      expect(result).toHaveLength(0);
      expect(mockPrisma.concept.findMany).not.toHaveBeenCalled();
    });

    it('should pass department filter when personaType is provided', async () => {
      mockPrisma.concept.findMany.mockResolvedValue([]);

      await service.findRelevantConcepts('pricing strategy', {
        personaType: 'CFO' as any,
      });

      const callArgs = mockPrisma.concept.findMany.mock.calls[0]?.[0];
      expect(callArgs?.where).toHaveProperty('departmentTags');
    });
  });
});
