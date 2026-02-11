import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KnowledgeController } from './knowledge.controller';
import { ConceptService } from './services/concept.service';
import { CitationService } from './services/citation.service';
import { CurriculumService } from './services/curriculum.service';
import { ConceptCategory, RelationshipType } from '@mentor-ai/shared/types';

describe('KnowledgeController', () => {
  let controller: KnowledgeController;
  let mockConceptService: {
    findAll: jest.Mock;
    findById: jest.Mock;
    findBySlug: jest.Mock;
    findRelated: jest.Mock;
    getCategories: jest.Mock;
    getCount: jest.Mock;
  };
  let mockCitationService: {
    getCitationsForMessage: jest.Mock;
    getConceptSummaryForPanel: jest.Mock;
  };

  const mockConceptSummary = {
    id: 'cpt_test123',
    name: 'Test Concept',
    slug: 'test-concept',
    category: ConceptCategory.FINANCE,
    definition: 'A test concept definition',
  };

  const mockConceptWithRelations = {
    ...mockConceptSummary,
    extendedDescription: 'Extended description',
    departmentTags: ['Finance'],
    embeddingId: undefined,
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    relatedConcepts: [
      {
        concept: {
          id: 'cpt_related1',
          name: 'Related Concept',
          slug: 'related-concept',
          category: ConceptCategory.FINANCE,
          definition: 'A related concept',
        },
        relationshipType: RelationshipType.RELATED,
        direction: 'outgoing' as const,
      },
    ],
  };

  beforeEach(async () => {
    mockConceptService = {
      findAll: jest.fn(),
      findById: jest.fn(),
      findBySlug: jest.fn(),
      findRelated: jest.fn(),
      getCategories: jest.fn(),
      getCount: jest.fn(),
    };

    mockCitationService = {
      getCitationsForMessage: jest.fn(),
      getConceptSummaryForPanel: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [KnowledgeController],
      providers: [
        { provide: ConceptService, useValue: mockConceptService },
        { provide: CitationService, useValue: mockCitationService },
        { provide: CurriculumService, useValue: {} },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    controller = module.get<KnowledgeController>(KnowledgeController);
  });

  describe('listConcepts', () => {
    it('should return paginated list of concepts', async () => {
      const mockResult = {
        data: [mockConceptSummary],
        meta: { page: 1, limit: 20, total: 1, totalPages: 1 },
      };
      mockConceptService.findAll.mockResolvedValue(mockResult);

      const result = await controller.listConcepts();

      expect(mockConceptService.findAll).toHaveBeenCalledWith({
        category: undefined,
        search: undefined,
        page: undefined,
        limit: undefined,
      });
      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
    });

    it('should pass category filter to service', async () => {
      const mockResult = {
        data: [],
        meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
      };
      mockConceptService.findAll.mockResolvedValue(mockResult);

      await controller.listConcepts(ConceptCategory.FINANCE);

      expect(mockConceptService.findAll).toHaveBeenCalledWith({
        category: ConceptCategory.FINANCE,
        search: undefined,
        page: undefined,
        limit: undefined,
      });
    });

    it('should pass search query to service', async () => {
      const mockResult = {
        data: [],
        meta: { page: 1, limit: 20, total: 0, totalPages: 0 },
      };
      mockConceptService.findAll.mockResolvedValue(mockResult);

      await controller.listConcepts(undefined, 'budget');

      expect(mockConceptService.findAll).toHaveBeenCalledWith({
        category: undefined,
        search: 'budget',
        page: undefined,
        limit: undefined,
      });
    });

    it('should parse pagination parameters', async () => {
      const mockResult = {
        data: [],
        meta: { page: 2, limit: 10, total: 50, totalPages: 5 },
      };
      mockConceptService.findAll.mockResolvedValue(mockResult);

      await controller.listConcepts(undefined, undefined, '2', '10');

      expect(mockConceptService.findAll).toHaveBeenCalledWith({
        category: undefined,
        search: undefined,
        page: 2,
        limit: 10,
      });
    });
  });

  describe('getConcept', () => {
    it('should return concept with relations by ID', async () => {
      mockConceptService.findById.mockResolvedValue(mockConceptWithRelations);

      const result = await controller.getConcept('cpt_test123');

      expect(mockConceptService.findById).toHaveBeenCalledWith('cpt_test123');
      expect(result.data.id).toBe('cpt_test123');
      expect(result.data.relatedConcepts).toHaveLength(1);
    });

    it('should propagate NotFoundException from service', async () => {
      mockConceptService.findById.mockRejectedValue(
        new NotFoundException({
          type: 'concept_not_found',
          title: 'Concept Not Found',
          status: 404,
        })
      );

      await expect(controller.getConcept('cpt_nonexistent')).rejects.toThrow(
        NotFoundException
      );
    });
  });

  describe('getConceptBySlug', () => {
    it('should return concept with relations by slug', async () => {
      mockConceptService.findBySlug.mockResolvedValue(mockConceptWithRelations);

      const result = await controller.getConceptBySlug('test-concept');

      expect(mockConceptService.findBySlug).toHaveBeenCalledWith('test-concept');
      expect(result.data.slug).toBe('test-concept');
    });

    it('should propagate NotFoundException for invalid slug', async () => {
      mockConceptService.findBySlug.mockRejectedValue(
        new NotFoundException({
          type: 'concept_not_found',
          title: 'Concept Not Found',
          status: 404,
        })
      );

      await expect(
        controller.getConceptBySlug('nonexistent-slug')
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('getRelatedConcepts', () => {
    it('should return related concepts for a concept ID', async () => {
      const mockRelations = [
        {
          concept: mockConceptSummary,
          relationshipType: RelationshipType.RELATED,
          direction: 'outgoing' as const,
        },
      ];
      mockConceptService.findRelated.mockResolvedValue(mockRelations);

      const result = await controller.getRelatedConcepts('cpt_test123');

      expect(mockConceptService.findRelated).toHaveBeenCalledWith('cpt_test123');
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.direction).toBe('outgoing');
    });
  });

  describe('getCategories', () => {
    it('should return all categories with counts', async () => {
      const mockCategories = [
        { category: 'Finance', count: 10 },
        { category: 'Marketing', count: 8 },
        { category: 'Technology', count: 12 },
      ];
      mockConceptService.getCategories.mockResolvedValue(mockCategories);

      const result = await controller.getCategories();

      expect(mockConceptService.getCategories).toHaveBeenCalled();
      expect(result.data).toHaveLength(3);
      expect(result.data[0]?.count).toBe(10);
    });
  });

  describe('getStats', () => {
    it('should return knowledge base statistics', async () => {
      mockConceptService.getCount.mockResolvedValue(60);
      mockConceptService.getCategories.mockResolvedValue([
        { category: 'Finance', count: 10 },
        { category: 'Marketing', count: 10 },
      ]);

      const result = await controller.getStats();

      expect(mockConceptService.getCount).toHaveBeenCalled();
      expect(mockConceptService.getCategories).toHaveBeenCalled();
      expect(result.data.totalConcepts).toBe(60);
      expect(result.data.categories).toHaveLength(2);
    });
  });
});
