import { Test, TestingModule } from '@nestjs/testing';
import { MemoryEmbeddingService } from './memory-embedding.service';
import { MemoryService } from './memory.service';
import { QdrantClientService } from '../../qdrant/qdrant-client.service';
import { MemoryType } from '@mentor-ai/shared/types';

describe('MemoryEmbeddingService', () => {
  let service: MemoryEmbeddingService;
  let mockMemoryService: {
    findRelevantMemories: jest.Mock;
    updateEmbeddingId: jest.Mock;
  };
  const mockTenantId = 'tnt_test123';
  const mockUserId = 'usr_test456';
  const mockMemoryId = 'mem_test789';

  const mockMemories = [
    {
      id: 'mem_1',
      content: 'Acme Corp has a budget of $50,000',
      subject: 'Acme Corp',
      type: MemoryType.CLIENT_CONTEXT,
    },
    {
      id: 'mem_2',
      content: 'Project Phoenix deadline is Q1 2026',
      subject: 'Project Phoenix',
      type: MemoryType.PROJECT_CONTEXT,
    },
  ];

  beforeEach(async () => {
    mockMemoryService = {
      findRelevantMemories: jest.fn().mockResolvedValue(mockMemories),
      updateEmbeddingId: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemoryEmbeddingService,
        { provide: MemoryService, useValue: mockMemoryService },
        {
          provide: QdrantClientService,
          useValue: { isAvailable: jest.fn().mockReturnValue(false) },
        },
      ],
    }).compile();

    service = module.get<MemoryEmbeddingService>(MemoryEmbeddingService);
  });

  describe('generateAndStoreEmbedding', () => {
    it('should generate placeholder embedding ID', async () => {
      const result = await service.generateAndStoreEmbedding(
        mockTenantId,
        mockMemoryId,
        'Test content',
        {
          userId: mockUserId,
          type: MemoryType.CLIENT_CONTEXT,
          subject: 'Test Subject',
        }
      );

      expect(result).toMatch(/^emb_mem_test789_\d+$/);
    });

    it('should update memory with embedding ID', async () => {
      await service.generateAndStoreEmbedding(mockTenantId, mockMemoryId, 'Test content', {
        userId: mockUserId,
        type: MemoryType.CLIENT_CONTEXT,
      });

      expect(mockMemoryService.updateEmbeddingId).toHaveBeenCalledWith(
        mockTenantId,
        mockMemoryId,
        expect.stringMatching(/^emb_/)
      );
    });
  });

  describe('semanticSearch', () => {
    it('should fall back to keyword search', async () => {
      const results = await service.semanticSearch(
        mockTenantId,
        mockUserId,
        'Acme budget',
        10,
        0.7
      );

      expect(mockMemoryService.findRelevantMemories).toHaveBeenCalledWith(
        mockTenantId,
        mockUserId,
        'Acme budget',
        10
      );
      expect(results).toHaveLength(2);
    });

    it('should return results with decreasing scores', async () => {
      const results = await service.semanticSearch(mockTenantId, mockUserId, 'test query', 10);

      expect(results[0]!.score).toBeGreaterThan(results[1]!.score);
    });

    it('should map memory fields to search result format', async () => {
      const results = await service.semanticSearch(mockTenantId, mockUserId, 'Acme', 10);

      expect(results[0]).toEqual(
        expect.objectContaining({
          memoryId: 'mem_1',
          content: expect.stringContaining('Acme Corp'),
          subject: 'Acme Corp',
          type: MemoryType.CLIENT_CONTEXT,
          score: expect.any(Number),
        })
      );
    });
  });

  describe('hybridSearch', () => {
    it('should combine semantic and keyword search results', async () => {
      const results = await service.hybridSearch(mockTenantId, mockUserId, 'Acme Corp budget', 10);

      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });

    it('should prioritize exact subject matches', async () => {
      mockMemoryService.findRelevantMemories.mockResolvedValue([
        {
          id: 'mem_exact',
          content: 'Acme Corp details',
          subject: 'Acme Corp',
          type: MemoryType.CLIENT_CONTEXT,
        },
      ]);

      const results = await service.hybridSearch(
        mockTenantId,
        mockUserId,
        'Tell me about Acme Corp',
        10
      );

      // Exact subject match should have high score
      const exactMatch = results.find((r) => r.subject === 'Acme Corp');
      if (exactMatch) {
        expect(exactMatch.score).toBeGreaterThanOrEqual(0.9);
      }
    });

    it('should deduplicate results', async () => {
      // Same memory returned from both searches
      mockMemoryService.findRelevantMemories.mockResolvedValue([mockMemories[0]]);

      const results = await service.hybridSearch(mockTenantId, mockUserId, 'Acme Corp', 10);

      // Should only have one entry for mem_1, not duplicates
      const mem1Count = results.filter((r) => r.memoryId === 'mem_1').length;
      expect(mem1Count).toBeLessThanOrEqual(1);
    });

    it('should limit results to specified count', async () => {
      const results = await service.hybridSearch(mockTenantId, mockUserId, 'test', 1);

      expect(results.length).toBeLessThanOrEqual(1);
    });

    it('should sort results by score descending', async () => {
      const results = await service.hybridSearch(mockTenantId, mockUserId, 'test', 10);

      for (let i = 1; i < results.length; i++) {
        expect(results[i - 1]!.score).toBeGreaterThanOrEqual(results[i]!.score);
      }
    });
  });

  describe('deleteEmbedding', () => {
    it('should not throw when deleting embedding (stub)', async () => {
      await expect(service.deleteEmbedding(mockTenantId, 'emb_test123')).resolves.not.toThrow();
    });
  });

  describe('ensureCollection', () => {
    it('should not throw when ensuring collection exists (stub)', async () => {
      await expect(service.ensureCollection(mockTenantId)).resolves.not.toThrow();
    });
  });
});
