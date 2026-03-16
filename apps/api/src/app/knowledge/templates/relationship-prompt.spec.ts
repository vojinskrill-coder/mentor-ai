import {
  CATEGORY_ADJACENCY,
  getRelevantCategories,
  buildRelationshipClassificationPrompt,
} from './relationship-prompt';

describe('relationship-prompt', () => {
  describe('getRelevantCategories', () => {
    it('should return own category + adjacent categories', () => {
      const result = getRelevantCategories('Finansije');
      expect(result).toContain('Finansije');
      expect(result).toContain('Računovodstvo');
      expect(result).toContain('Strategija');
      expect(result).toContain('Operacije');
      expect(result).not.toContain('Marketing');
    });

    it('should return just the category itself for unknown categories', () => {
      const result = getRelevantCategories('Underwater Basket Weaving');
      expect(result).toEqual(['Underwater Basket Weaving']);
    });

    it('should include cross-domain categories for Strategija', () => {
      const result = getRelevantCategories('Strategija');
      expect(result).toContain('Strategija');
      expect(result).toContain('Finansije');
      expect(result).toContain('Marketing');
      expect(result).toContain('Poslovni Modeli');
      expect(result).toContain('Liderstvo');
    });
  });

  describe('CATEGORY_ADJACENCY', () => {
    it('should define adjacency for all expected categories', () => {
      const expectedCategories = [
        'Finansije', 'Marketing', 'Strategija', 'Prodaja',
        'Operacije', 'Tehnologija', 'Menadžment', 'Liderstvo',
        'Uvod u Poslovanje', 'Vrednost', 'Preduzetništvo',
        'Digitalni Marketing', 'Odnosi sa Klijentima', 'Računovodstvo',
        'Inovacije', 'Poslovni Modeli',
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
      expect(prompt).toContain('JSON');
      expect(prompt).toContain('"slug"');
      expect(prompt).toContain('"type"');
    });
  });
});
