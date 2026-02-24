import { Test, TestingModule } from '@nestjs/testing';
import { BusinessContextService } from './business-context.service';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';

describe('BusinessContextService', () => {
  let service: BusinessContextService;

  const mockPrismaService = {
    memory: {
      findMany: jest.fn(),
    },
  };

  const TENANT_ID = 'tnt_test_001';

  /** Helper: build a mock memory record */
  function buildMemory(
    overrides: Partial<{
      type: string;
      content: string;
      subject: string | null;
      userId: string;
      createdAt: Date;
    }> = {}
  ) {
    return {
      type: overrides.type ?? 'CLIENT_CONTEXT',
      content: overrides.content ?? 'Test memory content',
      subject: overrides.subject ?? null,
      userId: overrides.userId ?? 'usr_001',
      createdAt: overrides.createdAt ?? new Date('2025-06-15T10:00:00Z'),
    };
  }

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BusinessContextService,
        { provide: PlatformPrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<BusinessContextService>(BusinessContextService);
  });

  describe('getBusinessContext', () => {
    // ---------------------------------------------------------------
    // 1. Empty state
    // ---------------------------------------------------------------
    it('should return empty string when no memories exist', async () => {
      mockPrismaService.memory.findMany.mockResolvedValue([]);

      const result = await service.getBusinessContext(TENANT_ID);

      expect(result).toBe('');
    });

    // ---------------------------------------------------------------
    // 2. Soft-deleted exclusion & query shape
    // ---------------------------------------------------------------
    it('should query only non-deleted memories with isDeleted: false', async () => {
      mockPrismaService.memory.findMany.mockResolvedValue([]);

      await service.getBusinessContext(TENANT_ID);

      expect(mockPrismaService.memory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            tenantId: TENANT_ID,
            isDeleted: false,
          },
        })
      );
    });

    // ---------------------------------------------------------------
    // 3. Recency ordering: createdAt desc, take: 100
    // ---------------------------------------------------------------
    it('should order by createdAt desc and take at most 100', async () => {
      mockPrismaService.memory.findMany.mockResolvedValue([]);

      await service.getBusinessContext(TENANT_ID);

      expect(mockPrismaService.memory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: { createdAt: 'desc' },
          take: 100,
        })
      );
    });

    it('should select only type, content, subject, userId, createdAt', async () => {
      mockPrismaService.memory.findMany.mockResolvedValue([]);

      await service.getBusinessContext(TENANT_ID);

      expect(mockPrismaService.memory.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          select: {
            type: true,
            content: true,
            subject: true,
            userId: true,
            createdAt: true,
          },
        })
      );
    });

    // ---------------------------------------------------------------
    // 4. Memory aggregation: basic structure
    // ---------------------------------------------------------------
    it('should return a structured context block when memories exist', async () => {
      mockPrismaService.memory.findMany.mockResolvedValue([
        buildMemory({ type: 'CLIENT_CONTEXT', content: 'Client A pays in EUR' }),
      ]);

      const result = await service.getBusinessContext(TENANT_ID);

      expect(result).toContain('--- POSLOVNI KONTEKST (Business Brain Memorija) ---');
      expect(result).toContain('--- KRAJ POSLOVNOG KONTEKSTA ---');
      expect(result).toContain('Client A pays in EUR');
    });

    it('should include the instruction footer in the output', async () => {
      mockPrismaService.memory.findMany.mockResolvedValue([
        buildMemory({ type: 'CLIENT_CONTEXT', content: 'Some fact' }),
      ]);

      const result = await service.getBusinessContext(TENANT_ID);

      expect(result).toContain(
        'Koristi ovaj kontekst da daš odgovore prilagođene specifičnom poslovanju korisnika.'
      );
      expect(result).toContain('Referiši se na prethodne analize i odluke kada je relevantno.');
    });

    // ---------------------------------------------------------------
    // 5. Type grouping with Serbian labels
    // ---------------------------------------------------------------
    it('should group CLIENT_CONTEXT under "Klijent" label', async () => {
      mockPrismaService.memory.findMany.mockResolvedValue([
        buildMemory({ type: 'CLIENT_CONTEXT', content: 'Client data' }),
      ]);

      const result = await service.getBusinessContext(TENANT_ID);

      expect(result).toContain('[Klijent]');
    });

    it('should group PROJECT_CONTEXT under "Poslovni uvid" label', async () => {
      mockPrismaService.memory.findMany.mockResolvedValue([
        buildMemory({ type: 'PROJECT_CONTEXT', content: 'Project insight' }),
      ]);

      const result = await service.getBusinessContext(TENANT_ID);

      expect(result).toContain('[Poslovni uvid]');
    });

    it('should group USER_PREFERENCE under "Odluka" label', async () => {
      mockPrismaService.memory.findMany.mockResolvedValue([
        buildMemory({ type: 'USER_PREFERENCE', content: 'Preference data' }),
      ]);

      const result = await service.getBusinessContext(TENANT_ID);

      expect(result).toContain('[Odluka]');
    });

    it('should group FACTUAL_STATEMENT under "Poslovna činjenica" label', async () => {
      mockPrismaService.memory.findMany.mockResolvedValue([
        buildMemory({ type: 'FACTUAL_STATEMENT', content: 'A fact' }),
      ]);

      const result = await service.getBusinessContext(TENANT_ID);

      expect(result).toContain('[Poslovna činjenica]');
    });

    it('should fall back to raw type name for unknown memory types', async () => {
      mockPrismaService.memory.findMany.mockResolvedValue([
        buildMemory({ type: 'CUSTOM_TYPE', content: 'Custom data' }),
      ]);

      const result = await service.getBusinessContext(TENANT_ID);

      expect(result).toContain('[CUSTOM_TYPE]');
    });

    it('should group multiple memory types into separate sections', async () => {
      mockPrismaService.memory.findMany.mockResolvedValue([
        buildMemory({ type: 'CLIENT_CONTEXT', content: 'Client info' }),
        buildMemory({ type: 'PROJECT_CONTEXT', content: 'Project info' }),
        buildMemory({ type: 'USER_PREFERENCE', content: 'User pref' }),
      ]);

      const result = await service.getBusinessContext(TENANT_ID);

      expect(result).toContain('[Klijent]');
      expect(result).toContain('[Poslovni uvid]');
      expect(result).toContain('[Odluka]');
    });

    it('should include multiple memories within the same type section', async () => {
      mockPrismaService.memory.findMany.mockResolvedValue([
        buildMemory({ type: 'CLIENT_CONTEXT', content: 'Client Alpha' }),
        buildMemory({ type: 'CLIENT_CONTEXT', content: 'Client Beta' }),
      ]);

      const result = await service.getBusinessContext(TENANT_ID);

      expect(result).toContain('- Client Alpha');
      expect(result).toContain('- Client Beta');
    });

    // ---------------------------------------------------------------
    // 6. Subject formatting
    // ---------------------------------------------------------------
    it('should append subject in parentheses when present', async () => {
      mockPrismaService.memory.findMany.mockResolvedValue([
        buildMemory({ type: 'CLIENT_CONTEXT', content: 'Pays monthly', subject: 'Acme Corp' }),
      ]);

      const result = await service.getBusinessContext(TENANT_ID);

      expect(result).toContain('- Pays monthly (Acme Corp)');
    });

    it('should not append subject parentheses when subject is null', async () => {
      mockPrismaService.memory.findMany.mockResolvedValue([
        buildMemory({ type: 'CLIENT_CONTEXT', content: 'General fact', subject: null }),
      ]);

      const result = await service.getBusinessContext(TENANT_ID);

      expect(result).toContain('- General fact\n');
      expect(result).not.toMatch(/General fact \(/);
    });

    // ---------------------------------------------------------------
    // 7. Token truncation
    // ---------------------------------------------------------------
    it('should truncate content when memories exceed MAX_CONTEXT_TOKENS (1500)', async () => {
      // Each memory ~100 chars => ~25 tokens. 100 memories => ~2500 tokens (over 1500 limit).
      // The service should stop adding memories before all 100 are included.
      const manyMemories = Array.from({ length: 100 }, (_, i) =>
        buildMemory({
          type: 'CLIENT_CONTEXT',
          content: `Memory entry number ${i} with extra padding text to consume more tokens definitely`,
        })
      );

      mockPrismaService.memory.findMany.mockResolvedValue(manyMemories);

      const result = await service.getBusinessContext(TENANT_ID);

      // The result should NOT contain all 100 entries due to truncation
      const entryMatches = result.match(/Memory entry number/g) ?? [];
      expect(entryMatches.length).toBeLessThan(100);
      expect(entryMatches.length).toBeGreaterThan(0);
    });

    it('should keep total estimated tokens within MAX_CONTEXT_TOKENS budget', async () => {
      // Generate enough memories to blow past the 1500-token limit
      const largeMemories = Array.from({ length: 80 }, (_, i) =>
        buildMemory({
          type: 'PROJECT_CONTEXT',
          content: `Detailed business insight number ${i}: this is a very long description that repeats words to inflate token count substantially`,
        })
      );

      mockPrismaService.memory.findMany.mockResolvedValue(largeMemories);

      const result = await service.getBusinessContext(TENANT_ID);

      // The inner content (before footer) should not exceed the budget.
      // estimateTokens = Math.ceil(text.length / 4), MAX = 1500
      // The inner content part is up to maxContentTokens = 1500 - 100 = 1400 tokens = 5600 chars.
      // We check the full result is bounded (footer adds ~200 chars more).
      const estimatedTokens = Math.ceil(result.length / 4);
      // Full result includes footer, so allow up to ~1700 tokens total
      expect(estimatedTokens).toBeLessThanOrEqual(1700);
    });

    it('should break outer loop when section header itself exceeds remaining budget', async () => {
      // maxContentTokens = 1500 - 100 = 1400 tokens = 5600 chars.
      // Initial header "\n--- POSLOVNI KONTEKST ... ---\n" is 53 chars = 14 tokens.
      // We need the first type's content to push the token count so close to 1400
      // that a subsequent section header (even a small one) exceeds the budget.
      //
      // First type header "\n[Klijent]\n" = 11 chars = 3 tokens. Running: 17.
      // We need the memory line to push us to exactly 1400 - 1 = 1399 tokens.
      // Memory line format: "- " + content + "\n" = content.length + 3 chars.
      // We need ceil((content.length + 3) / 4) = 1399 - 17 = 1382 tokens => content.length + 3 = 5528 => content.length = 5525
      // After that: tokenCount = 17 + 1382 = 1399.
      // Next header "\n[Poslovni uvid]\n" = 18 chars = 5 tokens => 1399 + 5 = 1404 > 1400 => outer break.
      const hugeMemories = [
        buildMemory({
          type: 'CLIENT_CONTEXT',
          content: 'A'.repeat(5525),
        }),
        buildMemory({
          type: 'PROJECT_CONTEXT',
          content: 'Should not appear',
        }),
      ];

      mockPrismaService.memory.findMany.mockResolvedValue(hugeMemories);

      const result = await service.getBusinessContext(TENANT_ID);

      // First section should be present
      expect(result).toContain('[Klijent]');
      // Second section header should NOT be present because the outer loop breaks
      expect(result).not.toContain('[Poslovni uvid]');
      expect(result).not.toContain('Should not appear');
    });

    // ---------------------------------------------------------------
    // 8. Memory aggregation across users
    // ---------------------------------------------------------------
    it('should include memories from multiple users (tenant-wide aggregation)', async () => {
      mockPrismaService.memory.findMany.mockResolvedValue([
        buildMemory({ userId: 'usr_001', content: 'From user one' }),
        buildMemory({ userId: 'usr_002', content: 'From user two' }),
        buildMemory({ userId: 'usr_003', content: 'From user three' }),
      ]);

      const result = await service.getBusinessContext(TENANT_ID);

      expect(result).toContain('From user one');
      expect(result).toContain('From user two');
      expect(result).toContain('From user three');
    });

    // ---------------------------------------------------------------
    // 9. No userId filter in query (shared brain)
    // ---------------------------------------------------------------
    it('should NOT filter by userId in the query (shared brain across tenant)', async () => {
      mockPrismaService.memory.findMany.mockResolvedValue([]);

      await service.getBusinessContext(TENANT_ID);

      const callArgs = mockPrismaService.memory.findMany.mock.calls[0][0];
      expect(callArgs.where).not.toHaveProperty('userId');
    });
  });

  // -----------------------------------------------------------------
  // estimateTokens (private method tested indirectly)
  // -----------------------------------------------------------------
  describe('estimateTokens (indirect)', () => {
    it('should estimate tokens as ceil(text.length / 4)', () => {
      // We test this indirectly by checking output size correlates with input size.
      // The CHARS_PER_TOKEN = 4 constant means 100 chars = 25 tokens.
      // Access the private method via bracket notation for direct verification.
      const estimate = (service as any).estimateTokens('abcdefgh'); // 8 chars
      expect(estimate).toBe(2); // ceil(8 / 4) = 2
    });

    it('should return 1 for a single character', () => {
      const estimate = (service as any).estimateTokens('a'); // 1 char
      expect(estimate).toBe(1); // ceil(1 / 4) = 1
    });

    it('should return 0 for empty string', () => {
      const estimate = (service as any).estimateTokens(''); // 0 chars
      expect(estimate).toBe(0); // ceil(0 / 4) = 0
    });

    it('should round up for non-exact multiples', () => {
      const estimate = (service as any).estimateTokens('abcde'); // 5 chars
      expect(estimate).toBe(2); // ceil(5 / 4) = 2
    });

    it('should handle longer strings correctly', () => {
      const text = 'a'.repeat(100);
      const estimate = (service as any).estimateTokens(text);
      expect(estimate).toBe(25); // ceil(100 / 4) = 25
    });

    it('should handle strings with multibyte characters by JS string length', () => {
      // JS string.length counts UTF-16 code units, not bytes.
      // "čćžšđ" has length 5 in JS.
      const estimate = (service as any).estimateTokens('čćžšđ');
      expect(estimate).toBe(2); // ceil(5 / 4) = 2
    });
  });

  // -----------------------------------------------------------------
  // Integration-style: full output structure
  // -----------------------------------------------------------------
  describe('full output structure', () => {
    it('should produce correctly ordered output: header, sections, footer', async () => {
      mockPrismaService.memory.findMany.mockResolvedValue([
        buildMemory({ type: 'CLIENT_CONTEXT', content: 'Alpha client info', subject: 'Alpha' }),
        buildMemory({ type: 'FACTUAL_STATEMENT', content: 'Revenue is 1M EUR' }),
      ]);

      const result = await service.getBusinessContext(TENANT_ID);

      const headerIdx = result.indexOf('--- POSLOVNI KONTEKST');
      const clientIdx = result.indexOf('[Klijent]');
      const factIdx = result.indexOf('[Poslovna činjenica]');
      const footerIdx = result.indexOf('--- KRAJ POSLOVNOG KONTEKSTA ---');

      // All sections should be present
      expect(headerIdx).toBeGreaterThanOrEqual(0);
      expect(clientIdx).toBeGreaterThan(headerIdx);
      expect(factIdx).toBeGreaterThan(clientIdx);
      expect(footerIdx).toBeGreaterThan(factIdx);
    });

    it('should format each memory line with a leading dash', async () => {
      mockPrismaService.memory.findMany.mockResolvedValue([
        buildMemory({ type: 'USER_PREFERENCE', content: 'Prefer email over Slack' }),
      ]);

      const result = await service.getBusinessContext(TENANT_ID);

      expect(result).toContain('- Prefer email over Slack\n');
    });
  });
});
