import { Test, TestingModule } from '@nestjs/testing';
import { MemoryContextBuilderService, MemoryContext } from './memory-context-builder.service';
import { MemoryEmbeddingService, MemorySearchResult } from './memory-embedding.service';
import { MemoryType } from '@mentor-ai/shared/types';

describe('MemoryContextBuilderService', () => {
  let service: MemoryContextBuilderService;
  let mockMemoryEmbeddingService: {
    hybridSearch: jest.Mock;
  };

  const mockTenantId = 'tnt_test123';
  const mockUserId = 'usr_test456';

  const mockSearchResults: MemorySearchResult[] = [
    {
      memoryId: 'mem_1',
      score: 0.95,
      content: 'Acme Corp has a budget of $50,000 for this project',
      subject: 'Acme Corp',
      type: MemoryType.CLIENT_CONTEXT,
    },
    {
      memoryId: 'mem_2',
      score: 0.85,
      content: 'Project Phoenix deadline is end of Q1 2026',
      subject: 'Project Phoenix',
      type: MemoryType.PROJECT_CONTEXT,
    },
  ];

  beforeEach(async () => {
    mockMemoryEmbeddingService = {
      hybridSearch: jest.fn().mockResolvedValue(mockSearchResults),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemoryContextBuilderService,
        { provide: MemoryEmbeddingService, useValue: mockMemoryEmbeddingService },
      ],
    }).compile();

    service = module.get<MemoryContextBuilderService>(MemoryContextBuilderService);
  });

  describe('buildContext', () => {
    it('should return empty context when no memories found', async () => {
      mockMemoryEmbeddingService.hybridSearch.mockResolvedValue([]);

      const result = await service.buildContext('test query', mockUserId, mockTenantId);

      expect(result.context).toBe('');
      expect(result.attributions).toHaveLength(0);
      expect(result.estimatedTokens).toBe(0);
    });

    it('should build context from search results', async () => {
      const result = await service.buildContext(
        'Tell me about Acme Corp budget',
        mockUserId,
        mockTenantId
      );

      expect(result.context).toContain('PREVIOUS CONTEXT ABOUT THIS USER');
      expect(result.context).toContain('Acme Corp');
      expect(result.context).toContain('$50,000');
      expect(result.context).toContain('END PREVIOUS CONTEXT');
    });

    it('should include attributions for included memories', async () => {
      const result = await service.buildContext(
        'test query',
        mockUserId,
        mockTenantId
      );

      expect(result.attributions).toHaveLength(2);
      expect(result.attributions[0]).toEqual(
        expect.objectContaining({
          memoryId: 'mem_1',
          subject: 'Acme Corp',
          type: MemoryType.CLIENT_CONTEXT,
        })
      );
    });

    it('should estimate tokens correctly', async () => {
      const result = await service.buildContext(
        'test query',
        mockUserId,
        mockTenantId
      );

      expect(result.estimatedTokens).toBeGreaterThan(0);
      // Rough estimate: context length / 4
      expect(result.estimatedTokens).toBeLessThan(result.context.length);
    });

    it('should respect MAX_MEMORY_TOKENS limit', async () => {
      // Create many large memories
      const largeResults: MemorySearchResult[] = Array.from({ length: 50 }, (_, i) => ({
        memoryId: `mem_${i}`,
        score: 0.9 - i * 0.01,
        content: 'A'.repeat(500), // 500 chars each = ~125 tokens each
        subject: `Subject ${i}`,
        type: MemoryType.FACTUAL_STATEMENT,
      }));

      mockMemoryEmbeddingService.hybridSearch.mockResolvedValue(largeResults);

      const result = await service.buildContext(
        'test query',
        mockUserId,
        mockTenantId
      );

      // Should have stopped before including all 50 memories
      expect(result.attributions.length).toBeLessThan(50);
      expect(result.estimatedTokens).toBeLessThanOrEqual(2000);
    });

    it('should call hybridSearch with correct parameters', async () => {
      await service.buildContext('my query', mockUserId, mockTenantId);

      expect(mockMemoryEmbeddingService.hybridSearch).toHaveBeenCalledWith(
        mockTenantId,
        mockUserId,
        'my query',
        10
      );
    });
  });

  describe('injectIntoSystemPrompt', () => {
    it('should append memory context to system prompt', () => {
      const systemPrompt = 'You are a helpful assistant.';
      const memoryContext: MemoryContext = {
        context: '\n--- MEMORY CONTEXT ---\nSome context\n--- END ---\n',
        attributions: [],
        estimatedTokens: 20,
      };

      const result = service.injectIntoSystemPrompt(systemPrompt, memoryContext);

      expect(result).toContain('You are a helpful assistant.');
      expect(result).toContain('MEMORY CONTEXT');
    });

    it('should return original prompt when no context', () => {
      const systemPrompt = 'You are a helpful assistant.';
      const emptyContext: MemoryContext = {
        context: '',
        attributions: [],
        estimatedTokens: 0,
      };

      const result = service.injectIntoSystemPrompt(systemPrompt, emptyContext);

      expect(result).toBe(systemPrompt);
    });
  });

  describe('parseAttributionsFromResponse', () => {
    const providedAttributions = [
      {
        memoryId: 'mem_1',
        subject: 'Acme Corp',
        summary: 'budget of $50,000',
        type: MemoryType.CLIENT_CONTEXT,
      },
      {
        memoryId: 'mem_2',
        subject: 'Project Phoenix',
        summary: 'deadline Q1 2026',
        type: MemoryType.PROJECT_CONTEXT,
      },
    ];

    it('should parse "Based on our previous discussion" pattern', () => {
      const response = 'Based on our previous discussion about Acme Corp, I see they have a budget constraint.';

      const matched = service.parseAttributionsFromResponse(response, providedAttributions);

      expect(matched).toHaveLength(1);
      expect(matched[0]!.subject).toBe('Acme Corp');
    });

    it('should parse "As we discussed regarding" pattern', () => {
      const response = 'As we discussed regarding Project Phoenix, the deadline is approaching.';

      const matched = service.parseAttributionsFromResponse(response, providedAttributions);

      expect(matched).toHaveLength(1);
      expect(matched[0]!.subject).toBe('Project Phoenix');
    });

    it('should match multiple patterns in one response', () => {
      const response = `Based on our previous discussion about Acme Corp, they have a budget.
        As we discussed regarding Project Phoenix, it has a deadline.`;

      const matched = service.parseAttributionsFromResponse(response, providedAttributions);

      expect(matched).toHaveLength(2);
    });

    it('should not duplicate matched attributions', () => {
      const response = `Based on our previous discussion about Acme Corp.
        Based on our previous discussion about Acme Corp again.`;

      const matched = service.parseAttributionsFromResponse(response, providedAttributions);

      // Should only have one Acme Corp match
      const acmeMatches = matched.filter((m) => m.subject === 'Acme Corp');
      expect(acmeMatches).toHaveLength(1);
    });

    it('should return empty array when no patterns match', () => {
      const response = 'Here is some general information without memory references.';

      const matched = service.parseAttributionsFromResponse(response, providedAttributions);

      expect(matched).toHaveLength(0);
    });

    it('should handle partial subject matches', () => {
      const response = 'Based on our previous discussion about Acme, I can help.';

      const matched = service.parseAttributionsFromResponse(response, providedAttributions);

      // Should match "Acme Corp" from partial "Acme"
      expect(matched.some((m) => m.subject === 'Acme Corp')).toBe(true);
    });
  });

  describe('private formatMemory', () => {
    it('should format memory with type and subject', () => {
      const servicePvt = service as any;
      const result = servicePvt.formatMemory({
        type: MemoryType.CLIENT_CONTEXT,
        subject: 'Acme Corp',
        content: 'has a budget of $50,000',
        score: 0.9,
      });

      expect(result).toBe('[Client: Acme Corp] has a budget of $50,000');
    });

    it('should format memory without subject', () => {
      const servicePvt = service as any;
      const result = servicePvt.formatMemory({
        type: MemoryType.USER_PREFERENCE,
        content: 'prefers morning meetings',
        score: 0.8,
      });

      expect(result).toBe('[Preference] prefers morning meetings');
    });
  });

  describe('private getTypeLabel', () => {
    it('should return correct labels for all types', () => {
      const servicePvt = service as any;

      expect(servicePvt.getTypeLabel(MemoryType.CLIENT_CONTEXT)).toBe('Client');
      expect(servicePvt.getTypeLabel(MemoryType.PROJECT_CONTEXT)).toBe('Project');
      expect(servicePvt.getTypeLabel(MemoryType.USER_PREFERENCE)).toBe('Preference');
      expect(servicePvt.getTypeLabel(MemoryType.FACTUAL_STATEMENT)).toBe('Fact');
    });

    it('should return Note for unknown type', () => {
      const servicePvt = service as any;

      expect(servicePvt.getTypeLabel('UNKNOWN' as any)).toBe('Note');
    });
  });
});
