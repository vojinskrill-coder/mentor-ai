import {
  CATEGORY_ADJACENCY,
  getRelevantCategories,
  buildRelationshipClassificationPrompt,
} from './relationship-prompt';

describe('relationship-prompt', () => {
  describe('getRelevantCategories', () => {
    it('should return own category + adjacent categories', () => {
      const result = getRelevantCategories('Finance');
      expect(result).toContain('Finance');
      expect(result).toContain('Strategy');
      expect(result).toContain('Operations');
      expect(result).not.toContain('Marketing');
    });

    it('should return just the category itself for unknown categories', () => {
      const result = getRelevantCategories('Underwater Basket Weaving');
      expect(result).toEqual(['Underwater Basket Weaving']);
    });

    it('should include cross-domain categories for Strategy', () => {
      const result = getRelevantCategories('Strategy');
      expect(result).toContain('Strategy');
      expect(result).toContain('Finance');
      expect(result).toContain('Marketing');
      expect(result).toContain('Sales');
      expect(result).toContain('Operations');
    });
  });

  describe('CATEGORY_ADJACENCY', () => {
    it('should define adjacency for all expected categories', () => {
      const expectedCategories = [
        'Finance', 'Marketing', 'Strategy', 'Sales',
        'Operations', 'Technology', 'Creative', 'Legal',
      ];
      for (const cat of expectedCategories) {
        const adj = CATEGORY_ADJACENCY[cat];
        expect(adj).toBeDefined();
        expect(adj!.length).toBeGreaterThan(0);
      }
    });
  });

  describe('buildRelationshipClassificationPrompt', () => {
    const candidates = [
      { id: 'cpt_1', slug: 'cash-flow', name: 'Cash Flow', category: 'Finance', definition: 'Money movement' },
      { id: 'cpt_2', slug: 'budgeting', name: 'Budgeting', category: 'Finance', definition: 'Planning expenses' },
    ];

    it('should include concept name and category in prompt', () => {
      const prompt = buildRelationshipClassificationPrompt(
        'Revenue Forecasting', 'Finance', 'Predicting future revenue', candidates,
      );
      expect(prompt).toContain('Revenue Forecasting');
      expect(prompt).toContain('Finance');
      expect(prompt).toContain('Predicting future revenue');
    });

    it('should list all candidates with slugs', () => {
      const prompt = buildRelationshipClassificationPrompt(
        'Test', 'Finance', 'Def', candidates,
      );
      expect(prompt).toContain('cash-flow');
      expect(prompt).toContain('budgeting');
      expect(prompt).toContain('Cash Flow');
      expect(prompt).toContain('Budgeting');
    });

    it('should limit candidates to 20', () => {
      const manyCandidates = Array.from({ length: 25 }, (_, i) => ({
        id: `cpt_${i}`, slug: `concept-${i}`, name: `Concept ${i}`,
        category: 'Finance', definition: `Definition ${i}`,
      }));

      const prompt = buildRelationshipClassificationPrompt(
        'Test', 'Finance', 'Def', manyCandidates,
      );

      // Should contain concept-19 (0-indexed, 20th item) but not concept-20 (21st)
      expect(prompt).toContain('concept-19');
      expect(prompt).not.toContain('concept-20');
    });

    it('should include JSON format instruction', () => {
      const prompt = buildRelationshipClassificationPrompt(
        'Test', 'Finance', 'Def', candidates,
      );
      expect(prompt).toContain('JSON array');
      expect(prompt).toContain('"slug"');
      expect(prompt).toContain('"type"');
    });
  });
});
