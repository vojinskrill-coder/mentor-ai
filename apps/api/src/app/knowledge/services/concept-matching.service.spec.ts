import { Test, TestingModule } from '@nestjs/testing';
import { ConceptMatchingService } from './concept-matching.service';
import { EmbeddingService } from './embedding.service';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import type { ConceptCategory, PersonaType } from '@mentor-ai/shared/types';

describe('ConceptMatchingService', () => {
  let service: ConceptMatchingService;
  let mockPrisma: {
    concept: {
      findMany: jest.Mock;
    };
  };
  let mockEmbeddingService: {
    search: jest.Mock;
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
  ];

  beforeEach(async () => {
    mockPrisma = {
      concept: {
        findMany: jest.fn(),
      },
    };

    mockEmbeddingService = {
      search: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConceptMatchingService,
        { provide: PlatformPrismaService, useValue: mockPrisma },
        { provide: EmbeddingService, useValue: mockEmbeddingService },
      ],
    }).compile();

    service = module.get<ConceptMatchingService>(ConceptMatchingService);
  });

  describe('findRelevantConcepts', () => {
    it('should use semantic search when available', async () => {
      const semanticMatches = [
        { conceptId: 'cpt_test1', score: 0.85, name: 'Value-Based Pricing' },
      ];
      mockEmbeddingService.search.mockResolvedValue(semanticMatches);
      mockPrisma.concept.findMany.mockResolvedValue([mockConcepts[0]]);

      const result = await service.findRelevantConcepts(
        'Consider using value-based pricing for your products.'
      );

      expect(mockEmbeddingService.search).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0]?.conceptId).toBe('cpt_test1');
      expect(result[0]?.score).toBe(0.85);
    });

    it('should fall back to keyword matching when semantic search returns empty', async () => {
      mockEmbeddingService.search.mockResolvedValue([]);
      mockPrisma.concept.findMany.mockResolvedValue(mockConcepts);

      const result = await service.findRelevantConcepts(
        'We need to focus on pricing and market strategies.'
      );

      expect(mockEmbeddingService.search).toHaveBeenCalled();
      expect(mockPrisma.concept.findMany).toHaveBeenCalled();
    });

    it('should filter by threshold (>0.7)', async () => {
      const semanticMatches = [
        { conceptId: 'cpt_test1', score: 0.85, name: 'High Score' },
        { conceptId: 'cpt_test2', score: 0.65, name: 'Low Score' }, // Below threshold
      ];
      mockEmbeddingService.search.mockResolvedValue(semanticMatches);
      mockPrisma.concept.findMany.mockResolvedValue([mockConcepts[0]]);

      const result = await service.findRelevantConcepts('Test response');

      // Only high score should be included
      expect(result.every((r) => r.score >= 0.7)).toBe(true);
    });

    it('should respect limit option', async () => {
      const semanticMatches = Array.from({ length: 10 }, (_, i) => ({
        conceptId: `cpt_test${i}`,
        score: 0.9 - i * 0.01,
        name: `Concept ${i}`,
      }));
      mockEmbeddingService.search.mockResolvedValue(semanticMatches);
      mockPrisma.concept.findMany.mockResolvedValue(
        semanticMatches.map((m) => ({
          id: m.conceptId,
          name: m.name,
          category: 'Finance',
          definition: 'Test',
        }))
      );

      const result = await service.findRelevantConcepts('Test response', {
        limit: 3,
      });

      expect(result.length).toBeLessThanOrEqual(3);
    });

    it('should filter by personaType when provided', async () => {
      mockEmbeddingService.search.mockResolvedValue([]);
      mockPrisma.concept.findMany.mockResolvedValue([]);

      await service.findRelevantConcepts('Test response', {
        personaType: 'CFO' as PersonaType,
      });

      // Check that search was called with filter
      expect(mockEmbeddingService.search).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Number),
        expect.objectContaining({ department: 'CFO' })
      );
    });

    it('should return empty array when no matches found', async () => {
      mockEmbeddingService.search.mockResolvedValue([]);
      mockPrisma.concept.findMany.mockResolvedValue([]);

      const result = await service.findRelevantConcepts('Unrelated text about nothing.');

      expect(result).toHaveLength(0);
    });

    it('should enrich matches with concept data from database', async () => {
      const semanticMatches = [
        { conceptId: 'cpt_test1', score: 0.85, name: 'Value-Based Pricing' },
      ];
      mockEmbeddingService.search.mockResolvedValue(semanticMatches);
      mockPrisma.concept.findMany.mockResolvedValue([mockConcepts[0]]);

      const result = await service.findRelevantConcepts('Test response');

      expect(result[0]).toMatchObject({
        conceptId: 'cpt_test1',
        conceptName: 'Value-Based Pricing',
        category: 'Finance',
        definition: expect.any(String),
      });
    });

    it('should use custom threshold when provided', async () => {
      const semanticMatches = [
        { conceptId: 'cpt_test1', score: 0.75, name: 'Just Above' },
        { conceptId: 'cpt_test2', score: 0.55, name: 'Below Custom' },
      ];
      mockEmbeddingService.search.mockResolvedValue(semanticMatches);
      mockPrisma.concept.findMany.mockResolvedValue([mockConcepts[0]]);

      const result = await service.findRelevantConcepts('Test response', {
        threshold: 0.6,
      });

      // 0.75 should be included, 0.55 should not
      expect(result.every((r) => r.score >= 0.6)).toBe(true);
    });
  });
});
