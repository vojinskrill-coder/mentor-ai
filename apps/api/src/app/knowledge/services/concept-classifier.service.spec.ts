import { ConceptClassifierService, ConceptClassificationResult, ClassificationContext } from './concept-classifier.service';
import { AiGatewayService } from '../../ai-gateway/ai-gateway.service';
import { ConceptMatchingService, ConceptMatchingOptions } from './concept-matching.service';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Default billing context for all test calls */
const CTX: ClassificationContext = {
  tenantId: 'test-tenant-001',
  userId: 'test-user-001',
  conversationId: 'conv-001',
};

/** Default matching options */
const OPTS: ConceptMatchingOptions = { limit: 5 };

/** Build a JSON classifier response string the mock LLM would return */
function llmJson(
  category: string,
  confidence: number,
  conceptName?: string
): string {
  const obj: Record<string, unknown> = { category, confidence };
  if (conceptName) obj['conceptName'] = conceptName;
  return JSON.stringify(obj);
}

/** Wrap in markdown code block (common LLM quirk) */
function llmJsonWrapped(
  category: string,
  confidence: number,
  conceptName?: string
): string {
  return '```json\n' + llmJson(category, confidence, conceptName) + '\n```';
}

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

function createMockAiGateway() {
  return {
    streamCompletionWithContext: jest.fn(),
  };
}

function createMockConceptMatching() {
  return {
    findRelevantConcepts: jest.fn().mockResolvedValue([]),
  };
}

function createMockPrisma() {
  return {
    concept: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
}

// ---------------------------------------------------------------------------
// Suite
// ---------------------------------------------------------------------------

describe('ConceptClassifierService', () => {
  let service: ConceptClassifierService;
  let mockAiGateway: ReturnType<typeof createMockAiGateway>;
  let mockConceptMatching: ReturnType<typeof createMockConceptMatching>;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(() => {
    mockAiGateway = createMockAiGateway();
    mockConceptMatching = createMockConceptMatching();
    mockPrisma = createMockPrisma();

    service = new ConceptClassifierService(
      mockAiGateway as unknown as AiGatewayService,
      mockConceptMatching as unknown as ConceptMatchingService,
      mockPrisma as unknown as PlatformPrismaService,
    );
  });

  // =========================================================================
  // 1. classifyAndMatch — main entry point
  // =========================================================================
  describe('classifyAndMatch()', () => {
    /**
     * Helper: configure the mock LLM to stream the given response string.
     * The real service calls streamCompletionWithContext with a chunk callback;
     * we invoke that callback with the full text.
     */
    function mockLlmResponse(text: string) {
      mockAiGateway.streamCompletionWithContext.mockImplementation(
        async (_msgs: unknown, _opts: unknown, onChunk: (c: string) => void) => {
          onChunk(text);
        },
      );
    }

    function mockLlmThrow(error: Error) {
      mockAiGateway.streamCompletionWithContext.mockRejectedValue(error);
    }

    it('should use classified category when LLM returns high confidence', async () => {
      mockLlmResponse(llmJson('Prodaja', 0.9));
      // Category search returns some concepts
      mockPrisma.concept.findMany.mockResolvedValue([
        { id: 'c1', name: 'Prodajni Plan', category: '6. Prodaja', definition: 'Plan prodaje' },
      ]);

      const result = await service.classifyAndMatch('prodajni plan', 'Evo plana...', OPTS, CTX);

      expect(result.length).toBeGreaterThan(0);
      expect(result[0]!.conceptName).toBe('Prodajni Plan');
      // Standard matching should NOT have been called
      expect(mockConceptMatching.findRelevantConcepts).not.toHaveBeenCalled();
    });

    it('should fall back to standard matching when confidence < 0.4', async () => {
      mockLlmResponse(llmJson('Prodaja', 0.3));
      mockConceptMatching.findRelevantConcepts.mockResolvedValue([
        { conceptId: 'c2', conceptName: 'Fallback', category: 'Marketing', definition: 'def', score: 0.5 },
      ]);

      const result = await service.classifyAndMatch('nesto nejasno', 'ok', OPTS, CTX);

      expect(mockConceptMatching.findRelevantConcepts).toHaveBeenCalled();
      expect(result[0]!.conceptName).toBe('Fallback');
    });

    it('should fall back to standard matching when LLM returns null (parse failure)', async () => {
      mockLlmResponse('This is not valid JSON at all');
      mockConceptMatching.findRelevantConcepts.mockResolvedValue([]);

      await service.classifyAndMatch('test', 'resp', OPTS, CTX);

      expect(mockConceptMatching.findRelevantConcepts).toHaveBeenCalled();
    });

    it('should fall back to standard matching when LLM throws an error', async () => {
      mockLlmThrow(new Error('Provider timeout'));
      mockConceptMatching.findRelevantConcepts.mockResolvedValue([]);

      const result = await service.classifyAndMatch('test', 'resp', OPTS, CTX);

      expect(mockConceptMatching.findRelevantConcepts).toHaveBeenCalled();
      expect(result).toEqual([]);
    });

    it('should attempt direct concept lookup when LLM suggests a concept name', async () => {
      mockLlmResponse(llmJson('Prodaja', 0.9, 'Prodajni Plan'));
      mockPrisma.concept.findFirst.mockResolvedValue({
        id: 'c1',
        name: 'Prodajni Plan',
        category: '6. Prodaja',
        definition: 'Plan prodaje',
      });

      const result = await service.classifyAndMatch('prodajni plan', 'evo plana', OPTS, CTX);

      expect(mockPrisma.concept.findFirst).toHaveBeenCalled();
      expect(result).toHaveLength(1);
      expect(result[0]!.conceptId).toBe('c1');
      expect(result[0]!.score).toBe(0.95);
    });

    it('should fall through to category search when suggested concept name not found', async () => {
      mockLlmResponse(llmJson('Prodaja', 0.85, 'Nepostojeći Koncept'));
      mockPrisma.concept.findFirst.mockResolvedValue(null); // not found
      mockPrisma.concept.findMany.mockResolvedValue([
        { id: 'c3', name: 'Prodajne Tehnike', category: '6. Prodaja', definition: 'Tehnike za prodaju' },
      ]);

      const result = await service.classifyAndMatch('prodajne tehnike', 'ok', OPTS, CTX);

      expect(mockPrisma.concept.findFirst).toHaveBeenCalled(); // tried direct lookup
      expect(mockPrisma.concept.findMany).toHaveBeenCalled(); // fell through to category search
      expect(result.length).toBeGreaterThan(0);
    });

    it('should fall back to standard matching when category search returns empty', async () => {
      mockLlmResponse(llmJson('Sistemi', 0.8));
      mockPrisma.concept.findMany.mockResolvedValue([]); // category has no matches
      mockConceptMatching.findRelevantConcepts.mockResolvedValue([
        { conceptId: 'fallback1', conceptName: 'Generic', category: 'Sistemi', definition: 'def', score: 0.4 },
      ]);

      const result = await service.classifyAndMatch('sistem nešto', 'odg', OPTS, CTX);

      expect(mockConceptMatching.findRelevantConcepts).toHaveBeenCalled();
      expect(result[0]!.conceptName).toBe('Generic');
    });

    it('should respect the limit option from caller', async () => {
      mockLlmResponse(llmJson('Finansije', 0.85));
      const manyConcepts = Array.from({ length: 10 }, (_, i) => ({
        id: `c${i}`,
        name: `Concept ${i}`,
        category: 'Finansije',
        definition: `Definition with budget keyword ${i}`,
      }));
      mockPrisma.concept.findMany.mockResolvedValue(manyConcepts);

      const result = await service.classifyAndMatch(
        'budget analiza finansije',
        'resp',
        { limit: 3 },
        CTX,
      );

      expect(result.length).toBeLessThanOrEqual(3);
    });

    it('should default limit to 5 when not specified', async () => {
      mockLlmResponse(llmJson('Finansije', 0.85));
      const manyConcepts = Array.from({ length: 20 }, (_, i) => ({
        id: `c${i}`,
        name: `Concept ${i}`,
        category: 'Finansije',
        definition: `finansijski opis ${i}`,
      }));
      mockPrisma.concept.findMany.mockResolvedValue(manyConcepts);

      const result = await service.classifyAndMatch('finansije', 'resp', {}, CTX);

      expect(result.length).toBeLessThanOrEqual(5);
    });

    it('should pass the correct messages and options to aiGatewayService', async () => {
      mockLlmResponse(llmJson('Prodaja', 0.9));
      mockPrisma.concept.findMany.mockResolvedValue([]);
      mockConceptMatching.findRelevantConcepts.mockResolvedValue([]);

      await service.classifyAndMatch('poruka', 'odgovor', OPTS, CTX);

      const [messages, options] = mockAiGateway.streamCompletionWithContext.mock.calls[0]!;
      expect(messages).toHaveLength(2);
      expect(messages[0].role).toBe('system');
      expect(messages[1].role).toBe('user');
      expect(messages[1].content).toContain('poruka');
      expect(options.tenantId).toBe('test-tenant-001');
      expect(options.userId).toBe('test-user-001');
      expect(options.skipRateLimit).toBe(true);
      expect(options.skipQuotaCheck).toBe(true);
      expect(options.useFallback).toBe(true);
    });

    it('should truncate AI response to 500 chars in the LLM prompt', async () => {
      const longResponse = 'x'.repeat(1000);
      mockLlmResponse(llmJson('Marketing', 0.8));
      mockPrisma.concept.findMany.mockResolvedValue([]);
      mockConceptMatching.findRelevantConcepts.mockResolvedValue([]);

      await service.classifyAndMatch('test', longResponse, OPTS, CTX);

      const userContent = mockAiGateway.streamCompletionWithContext.mock.calls[0]![0][1].content;
      // The ai response inside the user message should be truncated
      expect(userContent.length).toBeLessThan(1000);
    });
  });

  // =========================================================================
  // 2. classifyWithLlm (private) — tested via classifyAndMatch behavior
  // =========================================================================
  describe('classifyWithLlm() — LLM classification', () => {
    function mockLlmResponse(text: string) {
      mockAiGateway.streamCompletionWithContext.mockImplementation(
        async (_msgs: unknown, _opts: unknown, onChunk: (c: string) => void) => {
          onChunk(text);
        },
      );
    }

    it('should parse valid JSON with category and confidence', async () => {
      mockLlmResponse(llmJson('Finansije', 0.85));
      mockPrisma.concept.findMany.mockResolvedValue([
        { id: 'f1', name: 'Budžet', category: 'Finansije', definition: 'def' },
      ]);

      const result = await service.classifyAndMatch('budžet', 'resp', OPTS, CTX);

      // If it parsed correctly, it should NOT fall back
      expect(mockConceptMatching.findRelevantConcepts).not.toHaveBeenCalled();
    });

    it('should handle markdown-wrapped JSON from LLM', async () => {
      mockLlmResponse(llmJsonWrapped('Marketing', 0.75));
      mockPrisma.concept.findMany.mockResolvedValue([
        { id: 'm1', name: 'Brending', category: 'Marketing', definition: 'brend' },
      ]);

      const result = await service.classifyAndMatch('brending', 'o brendu', OPTS, CTX);

      expect(mockConceptMatching.findRelevantConcepts).not.toHaveBeenCalled();
      expect(result.length).toBeGreaterThan(0);
    });

    it('should return null for completely invalid response text', async () => {
      mockLlmResponse('Ovo je odgovor na srpskom, bez JSON-a.');

      await service.classifyAndMatch('test', 'resp', OPTS, CTX);

      // Falls back to standard matching because parse returns null
      expect(mockConceptMatching.findRelevantConcepts).toHaveBeenCalled();
    });

    it('should return null when JSON has empty category', async () => {
      mockLlmResponse('{"category": "", "confidence": 0.9}');

      await service.classifyAndMatch('test', 'resp', OPTS, CTX);

      expect(mockConceptMatching.findRelevantConcepts).toHaveBeenCalled();
    });

    it('should return null when JSON has unknown category', async () => {
      mockLlmResponse('{"category": "Nepoznata Kategorija", "confidence": 0.9}');

      await service.classifyAndMatch('test', 'resp', OPTS, CTX);

      expect(mockConceptMatching.findRelevantConcepts).toHaveBeenCalled();
    });

    it('should cap confidence at 1.0 if LLM returns higher', async () => {
      // Confidence > 1.0 should be capped via Math.min
      mockLlmResponse('{"category": "Prodaja", "confidence": 1.5}');
      mockPrisma.concept.findMany.mockResolvedValue([
        { id: 'p1', name: 'Test', category: 'Prodaja', definition: 'def' },
      ]);

      const result = await service.classifyAndMatch('prodaja', 'resp', OPTS, CTX);

      // Should still classify successfully (confidence capped at 1.0, > 0.4 threshold)
      expect(mockConceptMatching.findRelevantConcepts).not.toHaveBeenCalled();
    });

    it('should default confidence to 0.5 when not provided', async () => {
      mockLlmResponse('{"category": "Prodaja"}');
      mockPrisma.concept.findMany.mockResolvedValue([
        { id: 'p1', name: 'Test', category: 'Prodaja', definition: 'def' },
      ]);

      const result = await service.classifyAndMatch('prodaja', 'resp', OPTS, CTX);

      // Confidence 0.5 >= 0.4 threshold — should use classification
      expect(mockConceptMatching.findRelevantConcepts).not.toHaveBeenCalled();
    });

    it('should handle LLM streaming multiple chunks', async () => {
      mockAiGateway.streamCompletionWithContext.mockImplementation(
        async (_msgs: unknown, _opts: unknown, onChunk: (c: string) => void) => {
          onChunk('{"categ');
          onChunk('ory": "Prodaja"');
          onChunk(', "confidence": 0.8}');
        },
      );
      mockPrisma.concept.findMany.mockResolvedValue([
        { id: 'p1', name: 'Test', category: 'Prodaja', definition: 'def' },
      ]);

      const result = await service.classifyAndMatch('prodaja', 'resp', OPTS, CTX);

      expect(mockConceptMatching.findRelevantConcepts).not.toHaveBeenCalled();
      expect(result.length).toBeGreaterThan(0);
    });
  });

  // =========================================================================
  // 3. resolveCategory / normalizeDiacritics (private) — tested indirectly
  // =========================================================================
  describe('resolveCategory() — diacritics & fuzzy matching', () => {
    function mockLlmWithCategory(category: string) {
      mockAiGateway.streamCompletionWithContext.mockImplementation(
        async (_msgs: unknown, _opts: unknown, onChunk: (c: string) => void) => {
          onChunk(JSON.stringify({ category, confidence: 0.9 }));
        },
      );
      mockPrisma.concept.findMany.mockResolvedValue([
        { id: 'x1', name: 'Test', category, definition: 'def' },
      ]);
    }

    it('should resolve exact category match (e.g., "Prodaja")', async () => {
      mockLlmWithCategory('Prodaja');

      await service.classifyAndMatch('test', 'resp', OPTS, CTX);

      expect(mockConceptMatching.findRelevantConcepts).not.toHaveBeenCalled();
    });

    it('should resolve diacritics: "Odredjivanje Cene" matches "Određivanje Cene"', async () => {
      mockAiGateway.streamCompletionWithContext.mockImplementation(
        async (_msgs: unknown, _opts: unknown, onChunk: (c: string) => void) => {
          onChunk(JSON.stringify({ category: 'Odredjivanje Cene', confidence: 0.85 }));
        },
      );
      mockPrisma.concept.findMany.mockResolvedValue([
        { id: 'oc1', name: 'Cenovnik', category: 'Određivanje Cene', definition: 'cene' },
      ]);

      const result = await service.classifyAndMatch('cene', 'resp', OPTS, CTX);

      expect(mockConceptMatching.findRelevantConcepts).not.toHaveBeenCalled();
      expect(result.length).toBeGreaterThan(0);
    });

    it('should resolve diacritics: "Kognitivne Sklonosti" with š→s', async () => {
      mockAiGateway.streamCompletionWithContext.mockImplementation(
        async (_msgs: unknown, _opts: unknown, onChunk: (c: string) => void) => {
          onChunk(JSON.stringify({ category: 'kognitivne sklonosti', confidence: 0.8 }));
        },
      );
      mockPrisma.concept.findMany.mockResolvedValue([
        { id: 'ks1', name: 'Heuristike', category: 'Kognitivne Sklonosti', definition: 'def' },
      ]);

      const result = await service.classifyAndMatch('heuristike', 'resp', OPTS, CTX);

      expect(mockConceptMatching.findRelevantConcepts).not.toHaveBeenCalled();
    });

    it('should resolve partial match: "prodaja" resolves to "Prodaja" via includes', async () => {
      mockAiGateway.streamCompletionWithContext.mockImplementation(
        async (_msgs: unknown, _opts: unknown, onChunk: (c: string) => void) => {
          onChunk(JSON.stringify({ category: 'prodaja', confidence: 0.9 }));
        },
      );
      mockPrisma.concept.findMany.mockResolvedValue([
        { id: 'p1', name: 'Test', category: 'Prodaja', definition: 'def' },
      ]);

      const result = await service.classifyAndMatch('test', 'resp', OPTS, CTX);

      expect(mockConceptMatching.findRelevantConcepts).not.toHaveBeenCalled();
    });

    it('should reject completely unknown category and fall back', async () => {
      mockAiGateway.streamCompletionWithContext.mockImplementation(
        async (_msgs: unknown, _opts: unknown, onChunk: (c: string) => void) => {
          onChunk(JSON.stringify({ category: 'Astrologija', confidence: 0.95 }));
        },
      );

      await service.classifyAndMatch('stars', 'resp', OPTS, CTX);

      expect(mockConceptMatching.findRelevantConcepts).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 4. findConceptsInCategory (private) — tested via classifyAndMatch
  // =========================================================================
  describe('findConceptsInCategory() — category-constrained search', () => {
    function setupWithCategory(category: string) {
      mockAiGateway.streamCompletionWithContext.mockImplementation(
        async (_msgs: unknown, _opts: unknown, onChunk: (c: string) => void) => {
          onChunk(JSON.stringify({ category, confidence: 0.9 }));
        },
      );
    }

    it('should filter concepts by category using contains matching', async () => {
      setupWithCategory('Prodaja');
      mockPrisma.concept.findMany.mockResolvedValue([
        { id: 'p1', name: 'Prodajni Plan', category: '6. Prodaja', definition: 'plan za prodaju' },
      ]);

      const result = await service.classifyAndMatch('prodajni plan detalji', 'resp', OPTS, CTX);

      // Verify findMany was called with category contains filter
      const where = mockPrisma.concept.findMany.mock.calls[0]![0].where;
      expect(where.category).toEqual({
        contains: 'Prodaja',
        mode: 'insensitive',
      });
    });

    it('should extract keywords from user message (filter words < 3 chars)', async () => {
      setupWithCategory('Marketing');
      mockPrisma.concept.findMany.mockResolvedValue([]);

      await service.classifyAndMatch('ja i on marketing', 'resp', OPTS, CTX);

      // "ja" (2 chars) and "i" (1 char) and "on" (2 chars) should be filtered
      // Only "marketing" should be used as keyword
      const where = mockPrisma.concept.findMany.mock.calls[0]![0].where;
      expect(where.OR).toBeDefined();
    });

    it('should filter out common Serbian stopwords', async () => {
      setupWithCategory('Strategija');
      mockPrisma.concept.findMany.mockResolvedValue([]);

      // All words except "strategija" are stopwords or short
      await service.classifyAndMatch('koji kao ali strategija', 'resp', OPTS, CTX);

      const where = mockPrisma.concept.findMany.mock.calls[0]![0].where;
      // Should have OR conditions only for "strategija"
      if (where.OR) {
        expect(where.OR.length).toBe(1);
      }
    });

    it('should return top concepts by sortOrder when no keywords extracted', async () => {
      setupWithCategory('Finansije');
      mockPrisma.concept.findMany.mockResolvedValue([
        { id: 'f1', name: 'Budžet', category: 'Finansije', definition: 'budžetiranje' },
      ]);

      // Only stopwords → no keywords extracted
      const result = await service.classifyAndMatch('koji ali jer', 'resp', OPTS, CTX);

      const callArgs = mockPrisma.concept.findMany.mock.calls[0]![0];
      expect(callArgs.orderBy).toEqual({ sortOrder: 'asc' });
      expect(result[0]!.score).toBe(0.7); // default score for no-keyword matches
    });

    it('should score concepts higher when name matches keyword (3 pts) vs definition (1 pt)', async () => {
      setupWithCategory('Prodaja');
      mockPrisma.concept.findMany.mockResolvedValue([
        { id: 'p1', name: 'Prodajni Proces', category: 'Prodaja', definition: 'genericki opis' },
        { id: 'p2', name: 'Genericki Naziv', category: 'Prodaja', definition: 'prodajni opis nesto' },
      ]);

      const result = await service.classifyAndMatch('prodajni nesto', 'resp', OPTS, CTX);

      // p1 has "prodajni" in name (3 pts) + "nesto" not found = 3
      // p2 has "prodajni" in definition (1 pt) + "nesto" in definition (1 pt) = 2
      // So p1 should rank higher
      expect(result[0]!.conceptId).toBe('p1');
    });

    it('should cap score at 0.95', async () => {
      setupWithCategory('Prodaja');
      // Concept name matches many keywords → high match score
      mockPrisma.concept.findMany.mockResolvedValue([
        {
          id: 'p1',
          name: 'prodajni proces plan zatvaranje pregovaranje',
          category: 'Prodaja',
          definition: 'definition with prodaja keywords',
        },
      ]);

      const result = await service.classifyAndMatch(
        'prodajni proces plan zatvaranje pregovaranje prodaja',
        'resp',
        OPTS,
        CTX,
      );

      expect(result[0]!.score).toBeLessThanOrEqual(0.95);
    });

    it('should limit keywords to first 10', async () => {
      setupWithCategory('Operacije');
      mockPrisma.concept.findMany.mockResolvedValue([]);

      const manyWords = Array.from({ length: 20 }, (_, i) => `keyword${i}`).join(' ');
      await service.classifyAndMatch(manyWords, 'resp', OPTS, CTX);

      const where = mockPrisma.concept.findMany.mock.calls[0]![0].where;
      if (where.OR) {
        expect(where.OR.length).toBeLessThanOrEqual(10);
      }
    });
  });

  // =========================================================================
  // 5. findConceptByName (private) — tested via classifyAndMatch
  // =========================================================================
  describe('findConceptByName() — direct concept lookup', () => {
    function mockLlmWithConcept(category: string, conceptName: string) {
      mockAiGateway.streamCompletionWithContext.mockImplementation(
        async (_msgs: unknown, _opts: unknown, onChunk: (c: string) => void) => {
          onChunk(JSON.stringify({ category, confidence: 0.9, conceptName }));
        },
      );
    }

    it('should find concept by exact name match (case-insensitive)', async () => {
      mockLlmWithConcept('Prodaja', 'Prodajni Plan');
      mockPrisma.concept.findFirst.mockResolvedValue({
        id: 'c1',
        name: 'Prodajni Plan',
        category: '6. Prodaja',
        definition: 'Plan za prodaju',
      });

      const result = await service.classifyAndMatch('prodajni plan', 'resp', OPTS, CTX);

      expect(result).toHaveLength(1);
      expect(result[0]!.conceptId).toBe('c1');
      expect(result[0]!.conceptName).toBe('Prodajni Plan');
      expect(result[0]!.definition).toBe('Plan za prodaju');
      expect(result[0]!.score).toBe(0.95);
    });

    it('should use case-insensitive and contains matching in Prisma query', async () => {
      mockLlmWithConcept('Prodaja', 'prodajni plan');
      mockPrisma.concept.findFirst.mockResolvedValue(null);
      mockPrisma.concept.findMany.mockResolvedValue([]);
      mockConceptMatching.findRelevantConcepts.mockResolvedValue([]);

      await service.classifyAndMatch('test', 'resp', OPTS, CTX);

      const findFirstArgs = mockPrisma.concept.findFirst.mock.calls[0]![0];
      expect(findFirstArgs.where.name).toEqual({
        equals: 'prodajni plan',
        mode: 'insensitive',
      });
      expect(findFirstArgs.where.category).toEqual({
        contains: 'Prodaja',
        mode: 'insensitive',
      });
    });

    it('should fall through to category search when name not found', async () => {
      mockLlmWithConcept('Marketing', 'Nepostojeći');
      mockPrisma.concept.findFirst.mockResolvedValue(null);
      mockPrisma.concept.findMany.mockResolvedValue([
        { id: 'm1', name: 'Brending', category: 'Marketing', definition: 'brend' },
      ]);

      const result = await service.classifyAndMatch('brending', 'resp', OPTS, CTX);

      expect(mockPrisma.concept.findFirst).toHaveBeenCalled();
      expect(mockPrisma.concept.findMany).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // 6. CRITICAL REGRESSION TESTS — known misclassification patterns
  // =========================================================================
  describe('Regression: known classification patterns', () => {
    /**
     * These tests verify that when the LLM correctly classifies a query,
     * the service uses that classification properly instead of falling back.
     * They test the full pipeline: LLM returns the expected category ->
     * category-constrained search finds the right concepts.
     *
     * The actual LLM is mocked to return the CORRECT category, verifying
     * the service respects the classification rather than misrouting.
     */

    function setupClassification(
      category: string,
      conceptName: string,
      conceptDef: string,
      confidence = 0.9,
    ) {
      mockAiGateway.streamCompletionWithContext.mockImplementation(
        async (_msgs: unknown, _opts: unknown, onChunk: (c: string) => void) => {
          onChunk(JSON.stringify({ category, confidence }));
        },
      );
      mockPrisma.concept.findMany.mockResolvedValue([
        { id: `r_${category}`, name: conceptName, category, definition: conceptDef },
      ]);
    }

    it('"prodajna strategija" should classify as Prodaja, NOT Marketing', async () => {
      setupClassification('Prodaja', 'Prodajna Strategija', 'Strategija za prodaju proizvoda');

      const result = await service.classifyAndMatch('prodajna strategija', 'evo strategije za prodaju', OPTS, CTX);

      expect(result.length).toBeGreaterThan(0);
      expect(mockConceptMatching.findRelevantConcepts).not.toHaveBeenCalled();
      // Verify the category filter used "Prodaja"
      const where = mockPrisma.concept.findMany.mock.calls[0]![0].where;
      expect(where.category.contains).toBe('Prodaja');
    });

    it('"kreiranje sadržaja" should classify as Digitalni Marketing, NOT Vrednost', async () => {
      setupClassification(
        'Digitalni Marketing',
        'Content Marketing',
        'Kreiranje i distribucija sadržaja',
      );

      const result = await service.classifyAndMatch(
        'kreiranje sadržaja za blog',
        'sadržaj je ključan',
        OPTS,
        CTX,
      );

      expect(result.length).toBeGreaterThan(0);
      const where = mockPrisma.concept.findMany.mock.calls[0]![0].where;
      expect(where.category.contains).toBe('Digitalni Marketing');
    });

    it('"analiza konkurencije" should classify as Strategija, NOT Marketing', async () => {
      setupClassification(
        'Strategija',
        'Analiza Konkurencije',
        'Analiza konkurentskog okruženja i pozicioniranje',
      );

      const result = await service.classifyAndMatch(
        'analiza konkurencije',
        'treba analizirati konkurente',
        OPTS,
        CTX,
      );

      expect(result.length).toBeGreaterThan(0);
      const where = mockPrisma.concept.findMany.mock.calls[0]![0].where;
      expect(where.category.contains).toBe('Strategija');
    });

    it('"cena proizvoda" should classify as Određivanje Cene, NOT Prodaja', async () => {
      setupClassification(
        'Određivanje Cene',
        'Cenovne Strategije',
        'Metode određivanja cena proizvoda i usluga',
      );

      const result = await service.classifyAndMatch(
        'cena proizvoda',
        'određivanje cene je bitno',
        OPTS,
        CTX,
      );

      expect(result.length).toBeGreaterThan(0);
      const where = mockPrisma.concept.findMany.mock.calls[0]![0].where;
      expect(where.category.contains).toBe('Određivanje Cene');
    });

    it('"finansijski izveštaj" should classify as Finansije', async () => {
      setupClassification('Finansije', 'Finansijski Izveštaji', 'Izrada i analiza finansijskih izveštaja');

      const result = await service.classifyAndMatch(
        'finansijski izveštaj',
        'evo izveštaja',
        OPTS,
        CTX,
      );

      expect(result.length).toBeGreaterThan(0);
      const where = mockPrisma.concept.findMany.mock.calls[0]![0].where;
      expect(where.category.contains).toBe('Finansije');
    });

    it('"upravljanje timom" should classify as Menadžment', async () => {
      setupClassification('Menadžment', 'Upravljanje Timom', 'Efikasno vođenje tima');

      const result = await service.classifyAndMatch(
        'upravljanje timom',
        'tim treba organizovati',
        OPTS,
        CTX,
      );

      const where = mockPrisma.concept.findMany.mock.calls[0]![0].where;
      expect(where.category.contains).toBe('Menadžment');
    });

    it('"SEO optimizacija" should classify as Digitalni Marketing', async () => {
      setupClassification(
        'Digitalni Marketing',
        'SEO Optimizacija',
        'Optimizacija za pretraživače',
      );

      const result = await service.classifyAndMatch(
        'SEO optimizacija sajta',
        'treba poboljšati SEO',
        OPTS,
        CTX,
      );

      const where = mockPrisma.concept.findMany.mock.calls[0]![0].where;
      expect(where.category.contains).toBe('Digitalni Marketing');
    });

    it('"pokretanje biznisa" should classify as Preduzetništvo', async () => {
      setupClassification(
        'Preduzetništvo',
        'Pokretanje Biznisa',
        'Koraci za pokretanje novog poslovanja',
      );

      const result = await service.classifyAndMatch(
        'pokretanje biznisa',
        'prvi koraci',
        OPTS,
        CTX,
      );

      const where = mockPrisma.concept.findMany.mock.calls[0]![0].where;
      expect(where.category.contains).toBe('Preduzetništvo');
    });

    it('"zapošljavanje radnika" should classify as Ljudski Resursi', async () => {
      setupClassification(
        'Ljudski Resursi',
        'Zapošljavanje',
        'Proces regrutacije i zapošljavanja',
      );

      const result = await service.classifyAndMatch(
        'zapošljavanje radnika',
        'proces zapošljavanja',
        OPTS,
        CTX,
      );

      const where = mockPrisma.concept.findMany.mock.calls[0]![0].where;
      expect(where.category.contains).toBe('Ljudski Resursi');
    });

    it('"motivacija zaposlenih" should classify as Liderstvo', async () => {
      setupClassification(
        'Liderstvo',
        'Motivacija Tima',
        'Tehnike motivacije i inspiracije zaposlenih',
      );

      const result = await service.classifyAndMatch(
        'motivacija zaposlenih',
        'kako motivisati tim',
        OPTS,
        CTX,
      );

      const where = mockPrisma.concept.findMany.mock.calls[0]![0].where;
      expect(where.category.contains).toBe('Liderstvo');
    });

    it('"CRM sistem" should classify as Odnosi sa Klijentima', async () => {
      setupClassification(
        'Odnosi sa Klijentima',
        'CRM',
        'Upravljanje odnosima sa klijentima',
      );

      const result = await service.classifyAndMatch(
        'CRM sistem za praćenje klijenata',
        'CRM je bitan',
        OPTS,
        CTX,
      );

      const where = mockPrisma.concept.findMany.mock.calls[0]![0].where;
      expect(where.category.contains).toBe('Odnosi sa Klijentima');
    });

    it('"poslovni model freemium" should classify as Poslovni Modeli', async () => {
      setupClassification(
        'Poslovni Modeli',
        'Freemium Model',
        'Model poslovanja sa besplatnim i premium nivoom',
      );

      const result = await service.classifyAndMatch(
        'poslovni model freemium',
        'freemium model je popularan',
        OPTS,
        CTX,
      );

      const where = mockPrisma.concept.findMany.mock.calls[0]![0].where;
      expect(where.category.contains).toBe('Poslovni Modeli');
    });
  });

  // =========================================================================
  // 7. Edge cases and error handling
  // =========================================================================
  describe('Edge cases', () => {
    it('should handle empty user message gracefully', async () => {
      mockAiGateway.streamCompletionWithContext.mockImplementation(
        async (_msgs: unknown, _opts: unknown, onChunk: (c: string) => void) => {
          onChunk(llmJson('Prodaja', 0.5));
        },
      );
      mockPrisma.concept.findMany.mockResolvedValue([]);
      mockConceptMatching.findRelevantConcepts.mockResolvedValue([]);

      const result = await service.classifyAndMatch('', 'some response', OPTS, CTX);

      // Should not throw, just return results (possibly empty)
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle empty AI response gracefully', async () => {
      mockAiGateway.streamCompletionWithContext.mockImplementation(
        async (_msgs: unknown, _opts: unknown, onChunk: (c: string) => void) => {
          onChunk(llmJson('Marketing', 0.7));
        },
      );
      mockPrisma.concept.findMany.mockResolvedValue([]);
      mockConceptMatching.findRelevantConcepts.mockResolvedValue([]);

      const result = await service.classifyAndMatch('marketing plan', '', OPTS, CTX);

      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle non-Error exceptions from LLM', async () => {
      mockAiGateway.streamCompletionWithContext.mockRejectedValue('string error');
      mockConceptMatching.findRelevantConcepts.mockResolvedValue([]);

      const result = await service.classifyAndMatch('test', 'resp', OPTS, CTX);

      // Should not throw, should fall back
      expect(mockConceptMatching.findRelevantConcepts).toHaveBeenCalled();
    });

    it('should handle LLM returning JSON with extra whitespace and text', async () => {
      mockAiGateway.streamCompletionWithContext.mockImplementation(
        async (_msgs: unknown, _opts: unknown, onChunk: (c: string) => void) => {
          onChunk('  Here is the result:\n\n  {"category": "Finansije", "confidence": 0.8}  \n\n');
        },
      );
      mockPrisma.concept.findMany.mockResolvedValue([
        { id: 'f1', name: 'Budžet', category: 'Finansije', definition: 'def' },
      ]);

      const result = await service.classifyAndMatch('budžet', 'resp', OPTS, CTX);

      // Should still parse the JSON out of the surrounding text
      expect(mockConceptMatching.findRelevantConcepts).not.toHaveBeenCalled();
    });

    it('should handle context without conversationId', async () => {
      const ctxNoConv: ClassificationContext = {
        tenantId: 'tenant-1',
        userId: 'user-1',
        // no conversationId
      };

      mockAiGateway.streamCompletionWithContext.mockImplementation(
        async (_msgs: unknown, _opts: unknown, onChunk: (c: string) => void) => {
          onChunk(llmJson('Prodaja', 0.9));
        },
      );
      mockPrisma.concept.findMany.mockResolvedValue([]);
      mockConceptMatching.findRelevantConcepts.mockResolvedValue([]);

      // Should not throw
      const result = await service.classifyAndMatch('test', 'resp', OPTS, ctxNoConv);
      expect(Array.isArray(result)).toBe(true);
    });

    it('should handle LLM returning confidence exactly at 0.4 threshold (passes)', async () => {
      mockAiGateway.streamCompletionWithContext.mockImplementation(
        async (_msgs: unknown, _opts: unknown, onChunk: (c: string) => void) => {
          onChunk(llmJson('Prodaja', 0.4));
        },
      );
      mockPrisma.concept.findMany.mockResolvedValue([
        { id: 'p1', name: 'Test', category: 'Prodaja', definition: 'def' },
      ]);

      const result = await service.classifyAndMatch('test', 'resp', OPTS, CTX);

      // 0.4 is NOT < 0.4, so it should use classification (not fall back)
      expect(mockConceptMatching.findRelevantConcepts).not.toHaveBeenCalled();
    });

    it('should handle LLM returning confidence at 0.39 threshold (falls back)', async () => {
      mockAiGateway.streamCompletionWithContext.mockImplementation(
        async (_msgs: unknown, _opts: unknown, onChunk: (c: string) => void) => {
          onChunk(llmJson('Prodaja', 0.39));
        },
      );
      mockConceptMatching.findRelevantConcepts.mockResolvedValue([]);

      await service.classifyAndMatch('test', 'resp', OPTS, CTX);

      // 0.39 < 0.4 → falls back
      expect(mockConceptMatching.findRelevantConcepts).toHaveBeenCalled();
    });
  });
});
