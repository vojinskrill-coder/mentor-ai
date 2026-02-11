import {
  PERSONA_PROMPTS,
  getPersonaSystemPrompt,
  generateSystemPrompt,
} from './persona-prompts';

describe('PersonaPrompts', () => {
  describe('PERSONA_PROMPTS', () => {
    it('should have all 8 persona types', () => {
      expect(Object.keys(PERSONA_PROMPTS)).toHaveLength(8);
      expect(PERSONA_PROMPTS).toHaveProperty('CFO');
      expect(PERSONA_PROMPTS).toHaveProperty('CMO');
      expect(PERSONA_PROMPTS).toHaveProperty('CTO');
      expect(PERSONA_PROMPTS).toHaveProperty('OPERATIONS');
      expect(PERSONA_PROMPTS).toHaveProperty('LEGAL');
      expect(PERSONA_PROMPTS).toHaveProperty('CREATIVE');
      expect(PERSONA_PROMPTS).toHaveProperty('CSO');
      expect(PERSONA_PROMPTS).toHaveProperty('SALES');
    });

    it('should have valid structure for each persona', () => {
      Object.values(PERSONA_PROMPTS).forEach((prompt) => {
        expect(prompt).toHaveProperty('type');
        expect(prompt).toHaveProperty('systemPrompt');
        expect(prompt).toHaveProperty('capabilities');
        expect(prompt).toHaveProperty('limitations');
        expect(typeof prompt.systemPrompt).toBe('string');
        expect(Array.isArray(prompt.capabilities)).toBe(true);
        expect(Array.isArray(prompt.limitations)).toBe(true);
      });
    });

    it('should have system prompts approximately 500 tokens (estimated)', () => {
      // Rough token estimation: 1 token ≈ 4 characters
      // 500 tokens ≈ 2000 characters, allow range of 1000-3000 characters
      Object.entries(PERSONA_PROMPTS).forEach(([type, prompt]) => {
        const charCount = prompt.systemPrompt.length;
        const estimatedTokens = Math.ceil(charCount / 4);

        // Allow range of 200-800 tokens (reasonable flexibility)
        expect(estimatedTokens).toBeGreaterThanOrEqual(200);
        expect(estimatedTokens).toBeLessThanOrEqual(800);
      });
    });

    it('should include expertise section in all prompts', () => {
      Object.values(PERSONA_PROMPTS).forEach((prompt) => {
        expect(prompt.systemPrompt).toContain('EXPERTISE:');
      });
    });

    it('should include communication style section in all prompts', () => {
      Object.values(PERSONA_PROMPTS).forEach((prompt) => {
        expect(prompt.systemPrompt).toContain('COMMUNICATION STYLE:');
      });
    });

    it('should include response format section in all prompts', () => {
      Object.values(PERSONA_PROMPTS).forEach((prompt) => {
        expect(prompt.systemPrompt).toContain('RESPONSE FORMAT:');
      });
    });

    it('should include citation format instruction', () => {
      Object.values(PERSONA_PROMPTS).forEach((prompt) => {
        expect(prompt.systemPrompt).toContain('[[Concept Name]]');
      });
    });
  });

  describe('CFO Persona', () => {
    it('should have CFO type', () => {
      const cfoPrompt = PERSONA_PROMPTS['CFO'];
      expect(cfoPrompt).toBeDefined();
      expect(cfoPrompt!.type).toBe('CFO');
    });

    it('should mention financial expertise', () => {
      const cfoPrompt = PERSONA_PROMPTS['CFO'];
      expect(cfoPrompt).toBeDefined();
      expect(cfoPrompt!.systemPrompt).toContain('Chief Financial Officer');
      expect(cfoPrompt!.systemPrompt).toContain('Financial');
    });

    it('should mention ROI', () => {
      const cfoPrompt = PERSONA_PROMPTS['CFO'];
      expect(cfoPrompt).toBeDefined();
      expect(cfoPrompt!.systemPrompt).toContain('ROI');
    });

    it('should have relevant capabilities', () => {
      const cfoPrompt = PERSONA_PROMPTS['CFO'];
      expect(cfoPrompt).toBeDefined();
      expect(cfoPrompt!.capabilities).toContain('Financial analysis and modeling');
    });
  });

  describe('CMO Persona', () => {
    it('should have CMO type', () => {
      const cmoPrompt = PERSONA_PROMPTS['CMO'];
      expect(cmoPrompt).toBeDefined();
      expect(cmoPrompt!.type).toBe('CMO');
    });

    it('should mention marketing expertise', () => {
      const cmoPrompt = PERSONA_PROMPTS['CMO'];
      expect(cmoPrompt).toBeDefined();
      expect(cmoPrompt!.systemPrompt).toContain('Chief Marketing Officer');
      expect(cmoPrompt!.systemPrompt).toContain('Brand');
    });
  });

  describe('LEGAL Persona', () => {
    it('should have LEGAL type', () => {
      const legalPrompt = PERSONA_PROMPTS['LEGAL'];
      expect(legalPrompt).toBeDefined();
      expect(legalPrompt!.type).toBe('LEGAL');
    });

    it('should include disclaimer about not being legal advice', () => {
      const legalPrompt = PERSONA_PROMPTS['LEGAL'];
      expect(legalPrompt).toBeDefined();
      expect(legalPrompt!.systemPrompt).toContain('DISCLAIMER');
      expect(legalPrompt!.systemPrompt).toContain(
        'NOT a substitute for professional legal advice'
      );
    });

    it('should have limitations about legal advice', () => {
      const legalPrompt = PERSONA_PROMPTS['LEGAL'];
      expect(legalPrompt).toBeDefined();
      expect(legalPrompt!.limitations).toContain(
        'Cannot provide specific legal advice'
      );
    });
  });

  describe('getPersonaSystemPrompt', () => {
    it('should return prompt for valid type', () => {
      const prompt = getPersonaSystemPrompt('CFO');

      expect(prompt).toBeDefined();
      expect(prompt?.type).toBe('CFO');
    });

    it('should return undefined for invalid type', () => {
      const prompt = getPersonaSystemPrompt('INVALID');

      expect(prompt).toBeUndefined();
    });
  });

  describe('generateSystemPrompt', () => {
    it('should return system prompt string for valid type', () => {
      const prompt = generateSystemPrompt('CFO');

      expect(typeof prompt).toBe('string');
      expect(prompt.length).toBeGreaterThan(0);
      expect(prompt).toContain('Chief Financial Officer');
    });

    it('should return empty string for invalid type', () => {
      const prompt = generateSystemPrompt('INVALID');

      expect(prompt).toBe('');
    });

    it('should return the systemPrompt property from the PersonaSystemPrompt', () => {
      const prompt = generateSystemPrompt('CMO');
      const cmoPrompt = PERSONA_PROMPTS['CMO'];
      expect(cmoPrompt).toBeDefined();
      const expected = cmoPrompt!.systemPrompt;

      expect(prompt).toBe(expected);
    });
  });
});
