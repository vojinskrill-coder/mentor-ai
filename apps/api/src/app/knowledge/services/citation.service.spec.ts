import { Test, TestingModule } from '@nestjs/testing';
import { CitationService } from './citation.service';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import type { ConceptCategory } from '@mentor-ai/shared/types';

describe('CitationService', () => {
  let service: CitationService;
  let mockPrisma: {
    conceptCitation: {
      create: jest.Mock;
      findMany: jest.Mock;
      deleteMany: jest.Mock;
      count: jest.Mock;
    };
    concept: {
      findUnique: jest.Mock;
    };
  };

  const mockCitationRecord = {
    id: 'cit_test123',
    messageId: 'msg_test456',
    conceptId: 'cpt_test789',
    position: 50,
    score: 0.85,
    createdAt: new Date(),
    concept: {
      name: 'Value-Based Pricing',
      category: 'Finance',
    },
  };

  const mockConcept = {
    id: 'cpt_test789',
    name: 'Value-Based Pricing',
    category: 'Finance',
    definition: 'A pricing strategy based on perceived customer value.',
    relatedTo: [
      {
        targetConcept: {
          id: 'cpt_related1',
          name: 'Price Elasticity',
        },
      },
    ],
  };

  beforeEach(async () => {
    mockPrisma = {
      conceptCitation: {
        create: jest.fn(),
        findMany: jest.fn(),
        deleteMany: jest.fn(),
        count: jest.fn(),
      },
      concept: {
        findUnique: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CitationService,
        { provide: PlatformPrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<CitationService>(CitationService);
  });

  describe('storeCitations', () => {
    it('should return empty array when no citations provided', async () => {
      const result = await service.storeCitations('msg_test', []);

      expect(result).toHaveLength(0);
      expect(mockPrisma.conceptCitation.create).not.toHaveBeenCalled();
    });

    it('should store citations and return with IDs', async () => {
      mockPrisma.conceptCitation.create.mockResolvedValue(mockCitationRecord);

      const citations = [
        {
          messageId: 'msg_test456',
          conceptId: 'cpt_test789',
          conceptName: 'Value-Based Pricing',
          conceptCategory: 'Finance' as ConceptCategory,
          position: 50,
          score: 0.85,
        },
      ];

      const result = await service.storeCitations('msg_test456', citations);

      expect(mockPrisma.conceptCitation.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            messageId: 'msg_test456',
            conceptId: 'cpt_test789',
            position: 50,
            score: 0.85,
          }),
        })
      );
      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe('cit_test123');
    });

    it('should handle errors gracefully and continue with other citations', async () => {
      mockPrisma.conceptCitation.create
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce(mockCitationRecord);

      const citations = [
        {
          messageId: 'msg_test',
          conceptId: 'cpt_fail',
          conceptName: 'Will Fail',
          conceptCategory: 'Finance' as ConceptCategory,
          position: 10,
          score: 0.9,
        },
        {
          messageId: 'msg_test',
          conceptId: 'cpt_test789',
          conceptName: 'Value-Based Pricing',
          conceptCategory: 'Finance' as ConceptCategory,
          position: 50,
          score: 0.85,
        },
      ];

      const result = await service.storeCitations('msg_test', citations);

      // Should have one successful citation
      expect(result).toHaveLength(1);
    });
  });

  describe('getCitationsForMessage', () => {
    it('should return citations for a message', async () => {
      mockPrisma.conceptCitation.findMany.mockResolvedValue([mockCitationRecord]);

      const result = await service.getCitationsForMessage('msg_test456');

      expect(mockPrisma.conceptCitation.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { messageId: 'msg_test456' },
          orderBy: { position: 'asc' },
        })
      );
      expect(result).toHaveLength(1);
      expect(result[0]?.conceptName).toBe('Value-Based Pricing');
    });

    it('should return empty array when no citations found', async () => {
      mockPrisma.conceptCitation.findMany.mockResolvedValue([]);

      const result = await service.getCitationsForMessage('msg_none');

      expect(result).toHaveLength(0);
    });
  });

  describe('getConceptSummaryForPanel', () => {
    it('should return concept summary with related concepts', async () => {
      mockPrisma.concept.findUnique.mockResolvedValue(mockConcept);

      const result = await service.getConceptSummaryForPanel('cpt_test789');

      expect(mockPrisma.concept.findUnique).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'cpt_test789' },
        })
      );
      expect(result).toMatchObject({
        id: 'cpt_test789',
        name: 'Value-Based Pricing',
        category: 'Finance',
        definition: expect.any(String),
        relatedConcepts: expect.arrayContaining([
          expect.objectContaining({ id: 'cpt_related1', name: 'Price Elasticity' }),
        ]),
      });
    });

    it('should return null when concept not found', async () => {
      mockPrisma.concept.findUnique.mockResolvedValue(null);

      const result = await service.getConceptSummaryForPanel('cpt_nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('deleteCitationsForMessage', () => {
    it('should delete all citations for a message', async () => {
      mockPrisma.conceptCitation.deleteMany.mockResolvedValue({ count: 3 });

      await service.deleteCitationsForMessage('msg_test');

      expect(mockPrisma.conceptCitation.deleteMany).toHaveBeenCalledWith({
        where: { messageId: 'msg_test' },
      });
    });
  });

  describe('getCitationCount', () => {
    it('should return total citation count', async () => {
      mockPrisma.conceptCitation.count.mockResolvedValue(42);

      const result = await service.getCitationCount();

      expect(result).toBe(42);
    });

    it('should filter by conceptId when provided', async () => {
      mockPrisma.conceptCitation.count.mockResolvedValue(5);

      const result = await service.getCitationCount('cpt_test');

      expect(mockPrisma.conceptCitation.count).toHaveBeenCalledWith({
        where: { conceptId: 'cpt_test' },
      });
      expect(result).toBe(5);
    });
  });
});
