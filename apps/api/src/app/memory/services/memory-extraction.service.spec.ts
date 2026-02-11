import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MemoryExtractionService, ExtractedMemory } from './memory-extraction.service';
import { MemoryService } from './memory.service';
import { MemoryEmbeddingService } from './memory-embedding.service';
import { LlmConfigService } from '../../llm-config/llm-config.service';
import { MemoryType, MemorySource, LlmProviderType, MessageRole } from '@mentor-ai/shared/types';
import type { Message } from '@mentor-ai/shared/types';

describe('MemoryExtractionService', () => {
  let service: MemoryExtractionService;
  let mockMemoryService: {
    createMemory: jest.Mock;
    findMemories: jest.Mock;
  };
  let mockMemoryEmbeddingService: {
    generateAndStoreEmbedding: jest.Mock;
  };
  let mockLlmConfigService: {
    getConfig: jest.Mock;
    getDecryptedApiKey: jest.Mock;
  };
  let mockConfigService: {
    get: jest.Mock;
  };

  const mockTenantId = 'tnt_test123';
  const mockUserId = 'usr_test456';

  const mockMessages: Message[] = [
    {
      id: 'msg_1',
      conversationId: 'sess_test',
      role: MessageRole.USER,
      content: 'I need to discuss Acme Corp project. They have a budget of $50,000.',
      confidenceScore: null,
      confidenceFactors: null,
      createdAt: new Date().toISOString(),
    },
    {
      id: 'msg_2',
      conversationId: 'sess_test',
      role: MessageRole.ASSISTANT,
      content: 'I understand. Let me help you with the Acme Corp project.',
      confidenceScore: 0.85,
      confidenceFactors: null,
      createdAt: new Date().toISOString(),
    },
  ];

  beforeEach(async () => {
    mockMemoryService = {
      createMemory: jest.fn().mockResolvedValue({
        id: 'mem_test789',
        type: MemoryType.CLIENT_CONTEXT,
        source: MemorySource.AI_EXTRACTED,
        content: 'Acme Corp has a budget of $50,000',
        subject: 'Acme Corp',
        confidence: 0.92,
      }),
      findMemories: jest.fn().mockResolvedValue({ data: [], meta: { total: 0 } }),
    };

    mockMemoryEmbeddingService = {
      generateAndStoreEmbedding: jest.fn().mockResolvedValue('emb_test123'),
    };

    mockLlmConfigService = {
      getConfig: jest.fn().mockResolvedValue({
        primaryProvider: {
          providerType: LlmProviderType.OPENROUTER,
          modelId: 'openai/gpt-4',
        },
      }),
      getDecryptedApiKey: jest.fn().mockResolvedValue('test-api-key'),
    };

    mockConfigService = {
      get: jest.fn().mockReturnValue('http://localhost:4200'),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemoryExtractionService,
        { provide: MemoryService, useValue: mockMemoryService },
        { provide: MemoryEmbeddingService, useValue: mockMemoryEmbeddingService },
        { provide: LlmConfigService, useValue: mockLlmConfigService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    service = module.get<MemoryExtractionService>(MemoryExtractionService);
  });

  describe('extractMemories', () => {
    it('should skip extraction when fewer than 2 messages', async () => {
      const result = await service.extractMemories(
        [mockMessages[0]!],
        mockUserId,
        mockTenantId
      );

      expect(result).toHaveLength(0);
      expect(mockLlmConfigService.getConfig).not.toHaveBeenCalled();
    });

    it('should return empty array when no LLM provider configured', async () => {
      mockLlmConfigService.getConfig.mockResolvedValue({ primaryProvider: null });

      const result = await service.extractMemories(
        mockMessages,
        mockUserId,
        mockTenantId
      );

      expect(result).toHaveLength(0);
    });

    it('should return empty array when no API key available', async () => {
      mockLlmConfigService.getDecryptedApiKey.mockResolvedValue(null);

      const result = await service.extractMemories(
        mockMessages,
        mockUserId,
        mockTenantId
      );

      expect(result).toHaveLength(0);
    });

    it('should handle LLM extraction errors gracefully', async () => {
      mockLlmConfigService.getConfig.mockRejectedValue(new Error('LLM error'));

      const result = await service.extractMemories(
        mockMessages,
        mockUserId,
        mockTenantId
      );

      expect(result).toHaveLength(0);
    });
  });

  describe('deduplication', () => {
    it('should deduplicate against existing memories', async () => {
      // Mock LLM extraction to return a memory (so deduplication is reached)
      jest.spyOn(service as never, 'callLlmForExtraction' as never).mockResolvedValue([
        { type: MemoryType.CLIENT_CONTEXT, content: 'Acme Corp has a budget of $50,000', subject: 'Acme Corp', confidence: 0.9 },
      ] as never);

      // Mock existing memory with similar content
      mockMemoryService.findMemories.mockResolvedValue({
        data: [{
          id: 'mem_existing',
          content: 'Acme Corp has a budget of $50,000',
          type: MemoryType.CLIENT_CONTEXT,
        }],
        meta: { total: 1 },
      });

      // The deduplication happens internally - we just verify the service doesn't crash
      const result = await service.extractMemories(
        mockMessages,
        mockUserId,
        mockTenantId
      );

      // Should have queried for existing memories
      expect(mockMemoryService.findMemories).toHaveBeenCalledWith(
        mockTenantId,
        mockUserId,
        { limit: 100 }
      );
    });

    it('should proceed with all memories when deduplication fails', async () => {
      mockMemoryService.findMemories.mockRejectedValue(new Error('DB error'));

      // Should not throw, just return whatever was extracted
      const result = await service.extractMemories(
        mockMessages,
        mockUserId,
        mockTenantId
      );

      // Service should handle the error gracefully
      expect(result).toBeDefined();
    });
  });

  describe('text similarity', () => {
    it('should calculate text similarity correctly', () => {
      // Access private method via any for testing
      const servicePvt = service as any;

      // Identical texts should have similarity of 1
      const identical = servicePvt.calculateTextSimilarity(
        'acme corp budget fifty thousand',
        'acme corp budget fifty thousand'
      );
      expect(identical).toBe(1);

      // Completely different texts should have low similarity
      const different = servicePvt.calculateTextSimilarity(
        'acme corp budget',
        'project deadline friday'
      );
      expect(different).toBeLessThan(0.5);
    });

    it('should handle empty strings', () => {
      const servicePvt = service as any;

      const emptySimilarity = servicePvt.calculateTextSimilarity('', '');
      expect(emptySimilarity).toBe(1);
    });
  });

  describe('memory type normalization', () => {
    it('should normalize memory types correctly', () => {
      const servicePvt = service as any;

      expect(servicePvt.normalizeMemoryType('CLIENT_CONTEXT')).toBe(MemoryType.CLIENT_CONTEXT);
      expect(servicePvt.normalizeMemoryType('PROJECT_CONTEXT')).toBe(MemoryType.PROJECT_CONTEXT);
      expect(servicePvt.normalizeMemoryType('USER_PREFERENCE')).toBe(MemoryType.USER_PREFERENCE);
      expect(servicePvt.normalizeMemoryType('FACTUAL_STATEMENT')).toBe(MemoryType.FACTUAL_STATEMENT);
    });

    it('should default to FACTUAL_STATEMENT for unknown types', () => {
      const servicePvt = service as any;

      expect(servicePvt.normalizeMemoryType('UNKNOWN')).toBe(MemoryType.FACTUAL_STATEMENT);
      expect(servicePvt.normalizeMemoryType('invalid')).toBe(MemoryType.FACTUAL_STATEMENT);
    });
  });

  describe('message formatting', () => {
    it('should format messages for prompt correctly', () => {
      const servicePvt = service as any;

      const formatted = servicePvt.formatMessages(mockMessages);

      expect(formatted).toContain('User: I need to discuss Acme Corp');
      expect(formatted).toContain('Assistant: I understand');
    });
  });
});
