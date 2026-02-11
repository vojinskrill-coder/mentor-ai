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
      expect(prompt).toContain('DO NOT extract these');
    });

    it('should include valid categories list', () => {
      const prompt = buildConceptExtractionPrompt('text', []);
      expect(prompt).toContain('Finance');
      expect(prompt).toContain('Marketing');
      expect(prompt).toContain('Strategy');
      expect(prompt).toContain('Sales');
    });

    it('should respect maxConcepts parameter', () => {
      const prompt = buildConceptExtractionPrompt('text', [], 3);
      expect(prompt).toContain('at most 3 concepts');
    });

    it('should use default maxConcepts of 5', () => {
      const prompt = buildConceptExtractionPrompt('text', []);
      expect(prompt).toContain('at most 5 concepts');
    });

    it('should handle empty existing names list', () => {
      const prompt = buildConceptExtractionPrompt('text', []);
      expect(prompt).not.toContain('EXISTING CONCEPTS');
    });
  });

  describe('parseExtractionResponse', () => {
    it('should parse valid JSON array of concept candidates', () => {
      const response = `[{"name": "Blue Ocean Strategy", "category": "Strategy", "definition": "A business strategy framework for creating uncontested market space.", "departmentTags": ["STRATEGY"]}]`;
      const result = parseExtractionResponse(response);
      expect(result).toHaveLength(1);
      const first = result[0]!;
      expect(first.name).toBe('Blue Ocean Strategy');
      expect(first.category).toBe('Strategy');
      expect(first.definition).toContain('business strategy framework');
      expect(first.departmentTags).toEqual(['STRATEGY']);
    });

    it('should extract JSON array from markdown-wrapped response', () => {
      const response = `Here are the concepts:\n\`\`\`json\n[{"name": "Test Concept", "category": "Finance", "definition": "A test concept definition here.", "departmentTags": []}]\n\`\`\``;
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
      const response = `[{"name": "Test", "category": "Finance", "definition": "Short", "departmentTags": []}]`;
      const result = parseExtractionResponse(response);
      expect(result).toHaveLength(0);
    });

    it('should reject candidates with empty name', () => {
      const response = `[{"name": "  ", "category": "Finance", "definition": "A valid definition text.", "departmentTags": []}]`;
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
        {"name": "Valid Concept", "category": "Finance", "definition": "A valid concept with proper definition.", "departmentTags": ["FINANCE"]},
        {"name": "Invalid", "category": "BadCategory", "definition": "Valid definition text.", "departmentTags": []},
        {"name": "Short Def", "category": "Finance", "definition": "Short", "departmentTags": []}
      ]`;
      const result = parseExtractionResponse(response);
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('Valid Concept');
    });

    it('should handle missing departmentTags gracefully', () => {
      const response = `[{"name": "Test Concept", "category": "Marketing", "definition": "A valid definition for testing."}]`;
      const result = parseExtractionResponse(response);
      expect(result).toHaveLength(1);
      expect(result[0]!.departmentTags).toEqual([]);
    });

    it('should trim name and definition whitespace', () => {
      const response = `[{"name": "  Padded Name  ", "category": "Finance", "definition": "  A padded definition text.  ", "departmentTags": []}]`;
      const result = parseExtractionResponse(response);
      expect(result).toHaveLength(1);
      expect(result[0]!.name).toBe('Padded Name');
      expect(result[0]!.definition).toBe('A padded definition text.');
    });
  });
});
