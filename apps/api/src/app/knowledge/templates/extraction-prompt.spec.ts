import {
  buildConceptExtractionPrompt,
  parseExtractionResponse,
} from './extraction-prompt';

describe('extraction-prompt', () => {
  describe('buildConceptExtractionPrompt', () => {
    it('should include the AI output text in the prompt', () => {
      const prompt = buildConceptExtractionPrompt(
        'Blue Ocean Strategy enables companies to create uncontested market space.',
        [],
      );
      expect(prompt).toContain('Blue Ocean Strategy enables companies');
    });

    it('should include existing concept names to avoid re-extraction', () => {
      const prompt = buildConceptExtractionPrompt(
        'Some AI output',
        ['SWOT Analysis', 'Porter Five Forces'],
      );
      expect(prompt).toContain('SWOT Analysis');
      expect(prompt).toContain('Porter Five Forces');
      expect(prompt).toContain('NE ekstrahuj');
    });

    it('should include valid categories list', () => {
      const prompt = buildConceptExtractionPrompt('text', []);
      expect(prompt).toContain('Finansije');
      expect(prompt).toContain('Marketing');
      expect(prompt).toContain('Strategija');
      expect(prompt).toContain('Prodaja');
    });

    it('should respect maxConcepts parameter', () => {
      const prompt = buildConceptExtractionPrompt('text', [], 3);
      expect(prompt).toContain('3 konceptat');
    });

    it('should use default maxConcepts of 5', () => {
      const prompt = buildConceptExtractionPrompt('text', []);
      expect(prompt).toContain('5 konceptat');
    });

    it('should handle empty existing names list', () => {
      const prompt = buildConceptExtractionPrompt('text', []);
      expect(prompt).not.toContain('POSTOJEĆI KONCEPTI');
    });
  });

  describe('parseExtractionResponse', () => {
    it('should parse valid JSON array of concept candidates', () => {
      const response = `[{"name": "Blue Ocean Strategy", "category": "Strategija", "definition": "Okvir poslovne strategije za kreiranje neosporenog tržišnog prostora.", "departmentTags": ["STRATEGY"]}]`;
      const result = parseExtractionResponse(response);
      expect(result).toHaveLength(1);
      const first = result[0]!;
      expect(first.name).toBe('Blue Ocean Strategy');
      expect(first.category).toBe('Strategija');
      expect(first.definition).toContain('poslovne strategije');
      expect(first.departmentTags).toEqual(['STRATEGY']);
    });

    it('should extract JSON array from markdown-wrapped response', () => {
      const response = `Here are the concepts:\n\`\`\`json\n[{"name": "Test Concept", "category": "Finansije", "definition": "Definicija test koncepta za testiranje.", "departmentTags": []}]\n\`\`\``;
      const result = parseExtractionResponse(response);
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('Test Concept');
    });

    it('should reject candidates with invalid category', () => {
      const response = `[{"name": "Test", "category": "InvalidCategory", "definition": "A valid definition here.", "departmentTags": []}]`;
      const result = parseExtractionResponse(response);
      expect(result).toHaveLength(0);
    });

    it('should reject candidates with short definition (< 10 chars)', () => {
      const response = `[{"name": "Test", "category": "Finansije", "definition": "Short", "departmentTags": []}]`;
      const result = parseExtractionResponse(response);
      expect(result).toHaveLength(0);
    });

    it('should reject candidates with empty name', () => {
      const response = `[{"name": "  ", "category": "Finansije", "definition": "A valid definition text.", "departmentTags": []}]`;
      const result = parseExtractionResponse(response);
      expect(result).toHaveLength(0);
    });

    it('should handle empty array response', () => {
      const result = parseExtractionResponse('[]');
      expect(result).toHaveLength(0);
    });

    it('should handle invalid JSON gracefully', () => {
      const result = parseExtractionResponse('not json at all');
      expect(result).toHaveLength(0);
    });

    it('should handle mixed valid and invalid candidates', () => {
      const response = `[
        {"name": "Valid Concept", "category": "Finansije", "definition": "Validan koncept sa odgovarajucom definicijom.", "departmentTags": ["FINANCE"]},
        {"name": "Invalid", "category": "BadCategory", "definition": "Valid definition text.", "departmentTags": []},
        {"name": "Short Def", "category": "Finansije", "definition": "Short", "departmentTags": []}
      ]`;
      const result = parseExtractionResponse(response);
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('Valid Concept');
    });

    it('should handle missing departmentTags gracefully', () => {
      const response = `[{"name": "Test Concept", "category": "Marketing", "definition": "Validna definicija za testiranje koncepta."}]`;
      const result = parseExtractionResponse(response);
      expect(result).toHaveLength(1);
      expect(result[0]!.departmentTags).toEqual([]);
    });

    it('should trim name and definition whitespace', () => {
      const response = `[{"name": "  Padded Name  ", "category": "Finansije", "definition": "  Definicija sa razmacima na pocetku i kraju.  ", "departmentTags": []}]`;
      const result = parseExtractionResponse(response);
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('Padded Name');
      expect(result[0]!.definition).toBe('Definicija sa razmacima na pocetku i kraju.');
    });
  });
});
