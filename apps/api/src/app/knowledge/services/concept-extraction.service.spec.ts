import { Test, TestingModule } from '@nestjs/testing';
import { ConceptExtractionService } from './concept-extraction.service';
import { ConceptService } from './concept.service';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { AiGatewayService } from '../../ai-gateway/ai-gateway.service';

describe('ConceptExtractionService', () => {
  let service: ConceptExtractionService;
  let mockPrisma: {
    concept: {
      findMany: jest.Mock;
      create: jest.Mock;
    };
  };
  let mockAiGateway: { streamCompletion: jest.Mock };
  let mockConceptService: {
    findByName: jest.Mock;
    createDynamicRelationships: jest.Mock;
  };

  beforeEach(async () => {
    mockPrisma = {
      concept: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
      },
    };
    mockAiGateway = {
      streamCompletion: jest.fn(),
    };
    mockConceptService = {
      findByName: jest.fn().mockResolvedValue(null),
      createDynamicRelationships: jest.fn().mockResolvedValue({
        conceptId: 'cpt_test',
        conceptName: 'Test',
        relationshipsCreated: 3,
        errors: [],
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConceptExtractionService,
        { provide: PlatformPrismaService, useValue: mockPrisma },
        { provide: AiGatewayService, useValue: mockAiGateway },
        { provide: ConceptService, useValue: mockConceptService },
      ],
    }).compile();

    service = module.get<ConceptExtractionService>(ConceptExtractionService);
  });

  const mockLlmResponse = (response: string) => {
    mockAiGateway.streamCompletion.mockImplementation(
      async (_messages: unknown, callback: (chunk: string) => void) => {
        callback(response);
      },
    );
  };

  describe('extractAndCreateConcepts', () => {
    it('should extract and create concepts from AI output', async () => {
      mockLlmResponse(
        `[{"name": "Value Chain Analysis", "category": "Strategy", "definition": "A framework for analyzing a firm's activities to find competitive advantage.", "departmentTags": ["STRATEGY"]}]`,
      );
      mockPrisma.concept.create.mockResolvedValue({
        id: 'cpt_new1',
        name: 'Value Chain Analysis',
        slug: 'value-chain-analysis',
        category: 'Strategy',
        definition: 'A framework for analyzing a firm\'s activities to find competitive advantage.',
        departmentTags: ['STRATEGY'],
        source: 'AI_DISCOVERED',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.extractAndCreateConcepts(
        'The AI discussed Value Chain Analysis as a strategic tool.',
      );

      expect(result.created).toHaveLength(1);
      expect(result.created[0]!.name).toBe('Value Chain Analysis');
      expect(result.skippedDuplicates).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
      expect(mockPrisma.concept.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            name: 'Value Chain Analysis',
            category: 'Strategy',
            source: 'AI_DISCOVERED',
          }),
        }),
      );
    });

    it('should skip duplicate concepts detected via findByName', async () => {
      mockLlmResponse(
        `[{"name": "SWOT Analysis", "category": "Strategy", "definition": "Strategic planning framework for evaluation.", "departmentTags": ["STRATEGY"]}]`,
      );
      mockConceptService.findByName.mockResolvedValue({
        id: 'cpt_existing',
        name: 'SWOT Analysis',
      });

      const result = await service.extractAndCreateConcepts('AI mentioned SWOT Analysis.');

      expect(result.created).toHaveLength(0);
      expect(result.skippedDuplicates).toContain('SWOT Analysis');
      expect(mockPrisma.concept.create).not.toHaveBeenCalled();
    });

    it('should reject invalid category candidates', async () => {
      mockLlmResponse(
        `[{"name": "Test", "category": "InvalidCat", "definition": "Some definition text here.", "departmentTags": []}]`,
      );

      const result = await service.extractAndCreateConcepts('Some AI output.');

      expect(result.created).toHaveLength(0);
      expect(mockPrisma.concept.create).not.toHaveBeenCalled();
    });

    it('should enforce per-response cap (maxNew)', async () => {
      const concepts = Array.from({ length: 10 }, (_, i) => ({
        name: `Concept ${i + 1}`,
        category: 'Finance',
        definition: `Definition for concept number ${i + 1} in the series.`,
        departmentTags: ['FINANCE'],
      }));
      mockLlmResponse(JSON.stringify(concepts));
      mockPrisma.concept.create.mockImplementation(async ({ data }: { data: { id: string; name: string; slug: string; category: string; definition: string } }) => ({
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      const result = await service.extractAndCreateConcepts('AI output', { maxNew: 3 });

      expect(result.created).toHaveLength(3);
      expect(mockPrisma.concept.create).toHaveBeenCalledTimes(3);
    });

    it('should call createDynamicRelationships for each created concept', async () => {
      mockLlmResponse(
        `[{"name": "New Concept", "category": "Marketing", "definition": "A new marketing concept for analysis.", "departmentTags": ["MARKETING"]}]`,
      );
      mockPrisma.concept.create.mockResolvedValue({
        id: 'cpt_new1',
        name: 'New Concept',
        slug: 'new-concept',
        category: 'Marketing',
        definition: 'A new marketing concept for analysis.',
        departmentTags: ['MARKETING'],
        source: 'AI_DISCOVERED',
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.extractAndCreateConcepts('AI output mentioning New Concept.');

      // Allow fire-and-forget to be called
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(mockConceptService.createDynamicRelationships).toHaveBeenCalledWith(
        'cpt_new1',
        'New Concept',
        'Marketing',
      );
    });

    it('should return empty result when LLM fails', async () => {
      mockAiGateway.streamCompletion.mockRejectedValue(new Error('LLM unavailable'));

      const result = await service.extractAndCreateConcepts('Some text.');

      expect(result.created).toHaveLength(0);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('LLM unavailable');
    });

    it('should handle DB unique constraint gracefully', async () => {
      mockLlmResponse(
        `[{"name": "Duplicate Concept", "category": "Finance", "definition": "A concept that already exists in database.", "departmentTags": []}]`,
      );
      mockPrisma.concept.create.mockRejectedValue(
        new Error('Unique constraint failed on the fields: (`slug`)'),
      );

      const result = await service.extractAndCreateConcepts('AI output.');

      expect(result.created).toHaveLength(0);
      expect(result.skippedDuplicates).toContain('Duplicate Concept');
      expect(result.errors).toHaveLength(0);
    });

    it('should handle empty AI output gracefully', async () => {
      mockLlmResponse('[]');

      const result = await service.extractAndCreateConcepts('');

      expect(result.created).toHaveLength(0);
      expect(result.skippedDuplicates).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it('should generate correct slug from concept name', async () => {
      mockLlmResponse(
        `[{"name": "Value Chain Analysis", "category": "Strategy", "definition": "A strategic analysis framework for business.", "departmentTags": ["STRATEGY"]}]`,
      );
      mockPrisma.concept.create.mockImplementation(async ({ data }: { data: { slug: string } }) => ({
        ...data,
        id: 'cpt_new',
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      await service.extractAndCreateConcepts('text');

      expect(mockPrisma.concept.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            slug: 'value-chain-analysis',
          }),
        }),
      );
    });

    it('should use cpt_ prefix for generated concept IDs', async () => {
      mockLlmResponse(
        `[{"name": "Test Concept", "category": "Finance", "definition": "A test concept with proper definition.", "departmentTags": []}]`,
      );
      mockPrisma.concept.create.mockImplementation(async ({ data }: { data: { id: string } }) => ({
        ...data,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      await service.extractAndCreateConcepts('text');

      expect(mockPrisma.concept.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            id: expect.stringMatching(/^cpt_/),
          }),
        }),
      );
    });
  });
});
