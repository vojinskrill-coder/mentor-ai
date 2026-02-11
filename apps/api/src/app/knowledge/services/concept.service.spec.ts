import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConceptService } from './concept.service';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { AiGatewayService } from '../../ai-gateway/ai-gateway.service';
import { ConceptCategory, RelationshipType } from '@mentor-ai/shared/types';

describe('ConceptService', () => {
  let service: ConceptService;
  let mockPrisma: {
    concept: {
      findMany: jest.Mock;
      findUnique: jest.Mock;
      count: jest.Mock;
      groupBy: jest.Mock;
    };
    conceptRelationship: {
      findUnique: jest.Mock;
      createMany: jest.Mock;
    };
  };
  let mockAiGateway: { streamCompletion: jest.Mock };

  const mockConcept = {
    id: 'cpt_test123',
    name: 'Test Concept',
    slug: 'test-concept',
    category: 'Finance',
    definition: 'A test concept definition',
    extendedDescription: 'Extended description for testing',
    departmentTags: ['Finance', 'Operations'],
    embeddingId: null,
    version: 1,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
  };

  const mockConceptWithRelations = {
    ...mockConcept,
    relatedTo: [
      {
        id: 'crel_1',
        sourceConceptId: 'cpt_test123',
        targetConceptId: 'cpt_related1',
        relationshipType: 'RELATED',
        targetConcept: {
          id: 'cpt_related1',
          name: 'Related Concept',
          slug: 'related-concept',
          category: 'Finance',
          definition: 'A related concept',
          extendedDescription: null,
          departmentTags: ['Finance'],
          embeddingId: null,
          version: 1,
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        },
      },
    ],
    relatedFrom: [
      {
        id: 'crel_2',
        sourceConceptId: 'cpt_prereq',
        targetConceptId: 'cpt_test123',
        relationshipType: 'PREREQUISITE',
        sourceConcept: {
          id: 'cpt_prereq',
          name: 'Prerequisite Concept',
          slug: 'prerequisite-concept',
          category: 'Finance',
          definition: 'A prerequisite concept',
          extendedDescription: null,
          departmentTags: ['Finance'],
          embeddingId: null,
          version: 1,
          createdAt: new Date('2026-01-01'),
          updatedAt: new Date('2026-01-01'),
        },
      },
    ],
  };

  beforeEach(async () => {
    mockPrisma = {
      concept: {
        findMany: jest.fn(),
        findUnique: jest.fn(),
        count: jest.fn(),
        groupBy: jest.fn(),
      },
      conceptRelationship: {
        findUnique: jest.fn(),
        createMany: jest.fn(),
      },
    };

    mockAiGateway = {
      streamCompletion: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConceptService,
        { provide: PlatformPrismaService, useValue: mockPrisma },
        { provide: AiGatewayService, useValue: mockAiGateway },
      ],
    }).compile();

    service = module.get<ConceptService>(ConceptService);
  });

  describe('findAll', () => {
    it('should return paginated list of concepts', async () => {
      const mockConcepts = [mockConcept];
      mockPrisma.concept.findMany.mockResolvedValue(mockConcepts);
      mockPrisma.concept.count.mockResolvedValue(1);

      const result = await service.findAll();

      expect(mockPrisma.concept.findMany).toHaveBeenCalled();
      expect(mockPrisma.concept.count).toHaveBeenCalled();
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.id).toBe('cpt_test123');
      expect(result.meta.page).toBe(1);
      expect(result.meta.total).toBe(1);
    });

    it('should filter by category when provided', async () => {
      mockPrisma.concept.findMany.mockResolvedValue([]);
      mockPrisma.concept.count.mockResolvedValue(0);

      await service.findAll({ category: ConceptCategory.FINANCE });

      const findManyArgs = mockPrisma.concept.findMany.mock.calls[0][0];
      expect(findManyArgs.where.category).toBe(ConceptCategory.FINANCE);
    });

    it('should search by name and definition when search provided', async () => {
      mockPrisma.concept.findMany.mockResolvedValue([]);
      mockPrisma.concept.count.mockResolvedValue(0);

      await service.findAll({ search: 'test query' });

      const findManyArgs = mockPrisma.concept.findMany.mock.calls[0][0];
      expect(findManyArgs.where.OR).toBeDefined();
      expect(findManyArgs.where.OR).toHaveLength(2);
    });

    it('should limit page size to 100 maximum', async () => {
      mockPrisma.concept.findMany.mockResolvedValue([]);
      mockPrisma.concept.count.mockResolvedValue(0);

      await service.findAll({ limit: 500 });

      const findManyArgs = mockPrisma.concept.findMany.mock.calls[0][0];
      expect(findManyArgs.take).toBe(100);
    });

    it('should calculate correct skip for pagination', async () => {
      mockPrisma.concept.findMany.mockResolvedValue([]);
      mockPrisma.concept.count.mockResolvedValue(0);

      await service.findAll({ page: 3, limit: 20 });

      const findManyArgs = mockPrisma.concept.findMany.mock.calls[0][0];
      expect(findManyArgs.skip).toBe(40); // (3-1) * 20
    });
  });

  describe('findById', () => {
    it('should return concept with related concepts', async () => {
      mockPrisma.concept.findUnique.mockResolvedValue(mockConceptWithRelations);

      const result = await service.findById('cpt_test123');

      expect(mockPrisma.concept.findUnique).toHaveBeenCalledWith({
        where: { id: 'cpt_test123' },
        include: expect.objectContaining({
          relatedTo: expect.any(Object),
          relatedFrom: expect.any(Object),
        }),
      });
      expect(result.id).toBe('cpt_test123');
      expect(result.relatedConcepts).toHaveLength(2);
    });

    it('should include outgoing relationships with direction', async () => {
      mockPrisma.concept.findUnique.mockResolvedValue(mockConceptWithRelations);

      const result = await service.findById('cpt_test123');

      const outgoing = result.relatedConcepts.find(
        (r) => r.concept.id === 'cpt_related1'
      );
      expect(outgoing?.direction).toBe('outgoing');
      expect(outgoing?.relationshipType).toBe(RelationshipType.RELATED);
    });

    it('should include incoming relationships with direction', async () => {
      mockPrisma.concept.findUnique.mockResolvedValue(mockConceptWithRelations);

      const result = await service.findById('cpt_test123');

      const incoming = result.relatedConcepts.find(
        (r) => r.concept.id === 'cpt_prereq'
      );
      expect(incoming?.direction).toBe('incoming');
      expect(incoming?.relationshipType).toBe(RelationshipType.PREREQUISITE);
    });

    it('should throw NotFoundException when concept not found', async () => {
      mockPrisma.concept.findUnique.mockResolvedValue(null);

      await expect(service.findById('cpt_nonexistent')).rejects.toThrow(
        NotFoundException
      );
    });

    it('should use cpt_ prefix validation pattern in error', async () => {
      mockPrisma.concept.findUnique.mockResolvedValue(null);

      try {
        await service.findById('cpt_invalid');
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundException);
        expect((error as NotFoundException).getResponse()).toMatchObject({
          type: 'concept_not_found',
          title: 'Concept Not Found',
          status: 404,
        });
      }
    });
  });

  describe('findBySlug', () => {
    it('should find concept by slug and return with relations', async () => {
      mockPrisma.concept.findUnique
        .mockResolvedValueOnce(mockConcept) // First call for slug lookup
        .mockResolvedValueOnce(mockConceptWithRelations); // Second call for full fetch

      const result = await service.findBySlug('test-concept');

      expect(mockPrisma.concept.findUnique).toHaveBeenCalledWith({
        where: { slug: 'test-concept' },
      });
      expect(result.id).toBe('cpt_test123');
    });

    it('should throw NotFoundException when slug not found', async () => {
      mockPrisma.concept.findUnique.mockResolvedValue(null);

      await expect(service.findBySlug('nonexistent-slug')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('findRelated', () => {
    it('should return related concepts as summaries', async () => {
      mockPrisma.concept.findUnique.mockResolvedValue(mockConceptWithRelations);

      const result = await service.findRelated('cpt_test123');

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('concept');
      expect(result[0]).toHaveProperty('relationshipType');
      expect(result[0]).toHaveProperty('direction');
    });
  });

  describe('getCategories', () => {
    it('should return categories with counts', async () => {
      mockPrisma.concept.groupBy.mockResolvedValue([
        { category: 'Finance', _count: { id: 10 } },
        { category: 'Marketing', _count: { id: 8 } },
        { category: 'Technology', _count: { id: 12 } },
      ]);

      const result = await service.getCategories();

      expect(mockPrisma.concept.groupBy).toHaveBeenCalledWith({
        by: ['category'],
        _count: { id: true },
        orderBy: { category: 'asc' },
      });
      expect(result).toHaveLength(3);
      expect(result[0]).toEqual({ category: 'Finance', count: 10 });
    });

    it('should return empty array when no concepts exist', async () => {
      mockPrisma.concept.groupBy.mockResolvedValue([]);

      const result = await service.getCategories();

      expect(result).toEqual([]);
    });
  });

  describe('getCount', () => {
    it('should return total concept count', async () => {
      mockPrisma.concept.count.mockResolvedValue(60);

      const result = await service.getCount();

      expect(mockPrisma.concept.count).toHaveBeenCalled();
      expect(result).toBe(60);
    });

    it('should return 0 when no concepts exist', async () => {
      mockPrisma.concept.count.mockResolvedValue(0);

      const result = await service.getCount();

      expect(result).toBe(0);
    });
  });

  // ─── Story 2.13: Dynamic Relationship Creation Tests ───────

  describe('createDynamicRelationships', () => {
    const mockCandidates = [
      { id: 'cpt_c1', slug: 'market-segmentation', name: 'Market Segmentation', category: 'Marketing', definition: 'Dividing a market' },
      { id: 'cpt_c2', slug: 'competitive-analysis', name: 'Competitive Analysis', category: 'Strategy', definition: 'Analyzing competitors' },
    ];

    it('should create relationships from AI suggestions', async () => {
      // Concept lookup (now includes name for resolvedName fallback)
      mockPrisma.concept.findUnique.mockResolvedValue({
        name: 'SWOT Analysis',
        definition: 'Analyzing strengths and weaknesses',
        slug: 'swot-analysis',
        category: 'Strategy',
      });

      // Candidates query
      mockPrisma.concept.findMany.mockResolvedValue(mockCandidates);

      // AI response with valid JSON
      mockAiGateway.streamCompletion.mockImplementation(
        async (_msgs: unknown, onChunk: (chunk: string) => void) => {
          onChunk('[{"slug":"market-segmentation","type":"RELATED"},{"slug":"competitive-analysis","type":"PREREQUISITE"}]');
        },
      );

      mockPrisma.conceptRelationship.createMany.mockResolvedValue({ count: 2 });

      const result = await service.createDynamicRelationships('cpt_new', 'SWOT Analysis', 'Strategy');

      expect(result.relationshipsCreated).toBe(2);
      expect(result.errors).toHaveLength(0);
      expect(mockPrisma.conceptRelationship.createMany).toHaveBeenCalledWith({
        data: [
          { sourceConceptId: 'cpt_new', targetConceptId: 'cpt_c1', relationshipType: 'RELATED' },
          { sourceConceptId: 'cpt_new', targetConceptId: 'cpt_c2', relationshipType: 'PREREQUISITE' },
        ],
        skipDuplicates: true,
      });
    });

    it('should resolve name and category from DB when not provided', async () => {
      mockPrisma.concept.findUnique.mockResolvedValue({
        name: 'Test Concept', definition: 'Test', slug: 'test', category: 'Finance',
      });
      mockPrisma.concept.findMany.mockResolvedValue([]);

      const result = await service.createDynamicRelationships('cpt_new');

      expect(result.errors).toHaveLength(0);
      expect(result.conceptName).toBe('Test Concept'); // resolved from DB
      // findMany should have been called with categories including Finance + adjacent
      const findManyArgs = mockPrisma.concept.findMany.mock.calls[0][0];
      expect(findManyArgs.where.category.in).toContain('Finance');
      expect(findManyArgs.where.category.in).toContain('Strategy'); // adjacent to Finance
    });

    it('should return early when concept not found', async () => {
      mockPrisma.concept.findUnique.mockResolvedValue(null);

      const result = await service.createDynamicRelationships('cpt_missing', 'Missing');

      expect(result.errors).toContain('Concept cpt_missing not found');
      expect(result.relationshipsCreated).toBe(0);
      expect(mockPrisma.concept.findMany).not.toHaveBeenCalled();
    });

    it('should return early when no candidates found', async () => {
      mockPrisma.concept.findUnique.mockResolvedValue({
        name: 'Test', definition: 'Test', slug: 'test', category: 'Finance',
      });
      mockPrisma.concept.findMany.mockResolvedValue([]);

      const result = await service.createDynamicRelationships('cpt_new', 'Test', 'Finance');

      expect(result.relationshipsCreated).toBe(0);
      expect(mockAiGateway.streamCompletion).not.toHaveBeenCalled();
    });

    it('should handle invalid JSON from AI gracefully', async () => {
      mockPrisma.concept.findUnique.mockResolvedValue({
        name: 'Test', definition: 'Test', slug: 'test', category: 'Strategy',
      });
      mockPrisma.concept.findMany.mockResolvedValue(mockCandidates);
      mockAiGateway.streamCompletion.mockImplementation(
        async (_msgs: unknown, onChunk: (chunk: string) => void) => {
          onChunk('I cannot generate JSON for this request.');
        },
      );

      const result = await service.createDynamicRelationships('cpt_new', 'Test', 'Strategy');

      expect(result.relationshipsCreated).toBe(0);
      expect(result.errors).toHaveLength(0); // No error, just zero results
    });

    it('should filter out invalid slugs from AI suggestions', async () => {
      mockPrisma.concept.findUnique.mockResolvedValue({
        name: 'Test', definition: 'Test', slug: 'test', category: 'Strategy',
      });
      mockPrisma.concept.findMany.mockResolvedValue(mockCandidates);
      mockAiGateway.streamCompletion.mockImplementation(
        async (_msgs: unknown, onChunk: (chunk: string) => void) => {
          onChunk('[{"slug":"market-segmentation","type":"RELATED"},{"slug":"nonexistent-concept","type":"RELATED"}]');
        },
      );
      mockPrisma.conceptRelationship.createMany.mockResolvedValue({ count: 1 });

      const result = await service.createDynamicRelationships('cpt_new', 'Test', 'Strategy');

      expect(result.relationshipsCreated).toBe(1);
      const createArgs = mockPrisma.conceptRelationship.createMany.mock.calls[0][0];
      expect(createArgs.data).toHaveLength(1);
      expect(createArgs.data[0].targetConceptId).toBe('cpt_c1');
    });

    it('should catch and report errors without throwing', async () => {
      mockPrisma.concept.findUnique.mockRejectedValue(new Error('DB connection lost'));

      const result = await service.createDynamicRelationships('cpt_new', 'Test', 'Strategy');

      expect(result.errors).toContain('DB connection lost');
      expect(result.relationshipsCreated).toBe(0);
    });
  });
});
