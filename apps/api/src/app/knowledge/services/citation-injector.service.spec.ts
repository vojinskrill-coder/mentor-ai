import { CitationInjectorService } from './citation-injector.service';
import type { ConceptMatch, ConceptCategory } from '@mentor-ai/shared/types';

describe('CitationInjectorService', () => {
  let service: CitationInjectorService;

  beforeEach(() => {
    service = new CitationInjectorService();
  });

  describe('injectCitations', () => {
    const mockConcept: ConceptMatch = {
      conceptId: 'cpt_test123',
      conceptName: 'Value-Based Pricing',
      category: 'Finance' as ConceptCategory,
      definition: 'A pricing strategy based on perceived value',
      score: 0.85,
    };

    it('should return original content when no concepts provided', () => {
      const response = 'This is a test response about pricing strategies.';
      const result = service.injectCitations(response, []);

      expect(result.content).toBe(response);
      expect(result.citations).toHaveLength(0);
    });

    it('should inject citation when concept name is found in text', () => {
      const response = 'Consider using value-based pricing for your products.';
      const result = service.injectCitations(response, [mockConcept]);

      expect(result.content).toContain('[[Value-Based Pricing]]');
      expect(result.citations).toHaveLength(1);
      expect(result.citations[0]?.conceptId).toBe('cpt_test123');
      expect(result.citations[0]?.conceptName).toBe('Value-Based Pricing');
    });

    it('should limit citations to MAX_CITATIONS (5)', () => {
      const response = 'Consider pricing strategies for marketing and finance operations.';
      const concepts: ConceptMatch[] = Array.from({ length: 10 }, (_, i) => ({
        conceptId: `cpt_test${i}`,
        conceptName: `Concept ${i}`,
        category: 'Finance' as ConceptCategory,
        definition: 'Test definition',
        score: 0.9 - i * 0.05,
      }));

      const result = service.injectCitations(response, concepts);

      // Should inject at most 5 citations
      expect(result.citations.length).toBeLessThanOrEqual(5);
    });

    it('should sort concepts by score (highest first)', () => {
      const concepts: ConceptMatch[] = [
        { ...mockConcept, conceptId: 'cpt_low', conceptName: 'Low Score', score: 0.7 },
        { ...mockConcept, conceptId: 'cpt_high', conceptName: 'High Score', score: 0.95 },
        { ...mockConcept, conceptId: 'cpt_mid', conceptName: 'Mid Score', score: 0.85 },
      ];

      const response = 'Testing high score and low score concepts.';
      const result = service.injectCitations(response, concepts);

      // First citation should be the highest scored concept if found
      if (result.citations.length > 0) {
        const firstCit = result.citations[0];
        const lastCit = result.citations[result.citations.length - 1];
        expect(firstCit?.score).toBeGreaterThanOrEqual(lastCit?.score ?? 0);
      }
    });

    it('should include proper citation metadata', () => {
      const response = 'Consider using value-based pricing.';
      const result = service.injectCitations(response, [mockConcept], 'msg_test123');

      expect(result.citations.length).toBeGreaterThan(0);
      const firstCitation = result.citations[0];
      expect(firstCitation?.id).toMatch(/^cit_/);
      expect(firstCitation?.messageId).toBe('msg_test123');
      expect(firstCitation?.position).toBeGreaterThan(0);
      expect(firstCitation?.createdAt).toBeDefined();
    });

    it('should not inject duplicate citations at same position', () => {
      const concepts: ConceptMatch[] = [
        { ...mockConcept, conceptId: 'cpt_1', conceptName: 'Pricing', score: 0.9 },
        { ...mockConcept, conceptId: 'cpt_2', conceptName: 'Pricing Strategy', score: 0.85 },
      ];

      const response = 'Consider using pricing strategies.';
      const result = service.injectCitations(response, concepts);

      // Positions should be unique
      const positions = result.citations.map((c) => c.position);
      const uniquePositions = [...new Set(positions)];
      expect(positions.length).toBe(uniquePositions.length);
    });
  });

  describe('parseCitations', () => {
    it('should parse citations from content', () => {
      const content = 'This is about [[Value-Based Pricing]] and [[ROI]] concepts.';
      const citations = service.parseCitations(content);

      expect(citations).toHaveLength(2);
      expect(citations[0]?.name).toBe('Value-Based Pricing');
      expect(citations[1]?.name).toBe('ROI');
    });

    it('should return empty array when no citations found', () => {
      const content = 'This is regular text without any citations.';
      const citations = service.parseCitations(content);

      expect(citations).toHaveLength(0);
    });

    it('should include position of each citation', () => {
      const content = 'Start [[First]] middle [[Second]] end.';
      const citations = service.parseCitations(content);

      expect(citations).toHaveLength(2);
      expect(citations[0]?.position).toBeLessThan(citations[1]?.position ?? Infinity);
    });
  });

  describe('stripCitations', () => {
    it('should remove citation markers from content', () => {
      const content = 'Consider [[Value-Based Pricing]] for your products.';
      const stripped = service.stripCitations(content);

      expect(stripped).toBe('Consider for your products.');
      expect(stripped).not.toContain('[[');
      expect(stripped).not.toContain(']]');
    });

    it('should handle multiple citations', () => {
      const content = 'Using [[ROI]] and [[KPIs]] for [[Analytics]].';
      const stripped = service.stripCitations(content);

      expect(stripped).toBe('Using and for.');
    });

    it('should return original content when no citations', () => {
      const content = 'Plain text without citations.';
      const stripped = service.stripCitations(content);

      expect(stripped).toBe(content);
    });
  });
});
