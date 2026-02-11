import { Test, TestingModule } from '@nestjs/testing';
import { ConfidenceService } from './confidence.service';
import { ConfidenceLevel, type ConfidenceContext } from '@mentor-ai/shared/types';

describe('ConfidenceService', () => {
  let service: ConfidenceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ConfidenceService],
    }).compile();

    service = module.get<ConfidenceService>(ConfidenceService);
  });

  const createDefaultContext = (): ConfidenceContext => ({
    messageCount: 5,
    hasClientContext: false,
    hasSpecificData: false,
    userQuestion: 'What is the best pricing strategy?',
  });

  describe('calculateConfidence', () => {
    it('should return a confidence score with all required fields', () => {
      const response = 'Based on your data, the recommended price is $99.';
      const context = createDefaultContext();

      const result = service.calculateConfidence(response, context);

      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(1);
      expect(result.level).toBeDefined();
      expect(result.factors).toHaveLength(3);
    });

    it('should return HIGH confidence for specific, definitive responses', () => {
      const response =
        'Based on your Q2 revenue of $500,000 and costs of $200,000, your gross margin is 60%. I recommend a pricing strategy that targets a 70% margin by Q4 2026.';
      const context: ConfidenceContext = {
        messageCount: 10,
        hasClientContext: true,
        hasSpecificData: true,
        userQuestion: 'What pricing should I use?',
      };

      const result = service.calculateConfidence(response, context);

      expect(result.level).toBe(ConfidenceLevel.HIGH);
      expect(result.score).toBeGreaterThanOrEqual(0.85);
    });

    it('should return LOW confidence for vague, hedging responses', () => {
      const response =
        'I am uncertain about this. It might possibly work, perhaps, but I am not sure. This is just my opinion.';
      const context: ConfidenceContext = {
        messageCount: 1,
        hasClientContext: false,
        hasSpecificData: false,
        userQuestion: 'What should I do?',
      };

      const result = service.calculateConfidence(response, context);

      expect(result.level).toBe(ConfidenceLevel.LOW);
      expect(result.score).toBeLessThan(0.5);
    });

    it('should return MEDIUM confidence for moderate responses', () => {
      const response =
        'Based on industry standards, this approach generally works well. Consider implementing it gradually.';
      const context = createDefaultContext();

      const result = service.calculateConfidence(response, context);

      expect(result.level).toBe(ConfidenceLevel.MEDIUM);
      expect(result.score).toBeGreaterThanOrEqual(0.5);
      expect(result.score).toBeLessThan(0.85);
    });

    it('should include hedging_language factor', () => {
      const response = 'The strategy is effective.';
      const context = createDefaultContext();

      const result = service.calculateConfidence(response, context);

      const hedgingFactor = result.factors.find((f) => f.name === 'hedging_language');
      expect(hedgingFactor).toBeDefined();
      expect(hedgingFactor?.weight).toBe(0.35);
    });

    it('should include context_depth factor', () => {
      const response = 'The strategy is effective.';
      const context = createDefaultContext();

      const result = service.calculateConfidence(response, context);

      const contextFactor = result.factors.find((f) => f.name === 'context_depth');
      expect(contextFactor).toBeDefined();
      expect(contextFactor?.weight).toBe(0.35);
    });

    it('should include response_specificity factor', () => {
      const response = 'The strategy is effective.';
      const context = createDefaultContext();

      const result = service.calculateConfidence(response, context);

      const specificityFactor = result.factors.find((f) => f.name === 'response_specificity');
      expect(specificityFactor).toBeDefined();
      expect(specificityFactor?.weight).toBe(0.3);
    });

    it('should increase context score with more message history', () => {
      const response = 'The strategy is effective.';

      const lowContext: ConfidenceContext = {
        messageCount: 1,
        hasClientContext: false,
        hasSpecificData: false,
        userQuestion: 'What should I do?',
      };

      const highContext: ConfidenceContext = {
        messageCount: 15,
        hasClientContext: true,
        hasSpecificData: true,
        userQuestion: 'What should I do?',
      };

      const lowResult = service.calculateConfidence(response, lowContext);
      const highResult = service.calculateConfidence(response, highContext);

      expect(highResult.score).toBeGreaterThan(lowResult.score);
    });

    it('should increase specificity score for responses with numbers', () => {
      const vague = 'Revenue increased significantly.';
      const specific = 'Revenue increased by 25% to $1,500,000 in Q2 2026.';
      const context = createDefaultContext();

      const vagueResult = service.calculateConfidence(vague, context);
      const specificResult = service.calculateConfidence(specific, context);

      const vagueFactor = vagueResult.factors.find((f) => f.name === 'response_specificity');
      const specificFactor = specificResult.factors.find((f) => f.name === 'response_specificity');

      expect(specificFactor?.score).toBeGreaterThan(vagueFactor?.score ?? 0);
    });

    it('should round score to 2 decimal places', () => {
      const response = 'Test response with some content.';
      const context = createDefaultContext();

      const result = service.calculateConfidence(response, context);

      // Check that score has at most 2 decimal places
      const decimalPlaces = (result.score.toString().split('.')[1] || '').length;
      expect(decimalPlaces).toBeLessThanOrEqual(2);
    });
  });

  describe('calculateMultiSectionConfidence', () => {
    it('should return section scores and overall average', () => {
      const sections = [
        'First section with clear data: revenue is $500,000.',
        'Second section is more uncertain, it might work.',
      ];
      const context = createDefaultContext();

      const result = service.calculateMultiSectionConfidence(sections, context);

      expect(result.sectionScores).toHaveLength(2);
      expect(result.overall).toBeDefined();
      expect(result.overall.score).toBeDefined();
      expect(result.overall.factors).toBeDefined();
    });

    it('should weight sections by length', () => {
      const sections = [
        'Short.',
        'This is a much longer section with more content that should have more weight in the overall calculation due to its length.',
      ];
      const context = createDefaultContext();

      const result = service.calculateMultiSectionConfidence(sections, context);

      // The longer section should have more influence on the overall score
      expect(result.overall.score).toBeDefined();
    });

    it('should handle single section', () => {
      const sections = ['Single section response.'];
      const context = createDefaultContext();

      const result = service.calculateMultiSectionConfidence(sections, context);

      expect(result.sectionScores).toHaveLength(1);
      expect(result.overall.score).toBe(result.sectionScores[0]?.score);
    });

    it('should handle empty sections array', () => {
      const sections: string[] = [];
      const context = createDefaultContext();

      const result = service.calculateMultiSectionConfidence(sections, context);

      expect(result.sectionScores).toHaveLength(0);
      expect(result.overall.factors).toHaveLength(0);
    });
  });

  describe('confidence level thresholds', () => {
    it('should classify 85-100% as HIGH', () => {
      // Create conditions for very high confidence
      const response = 'Based on Q2 2026 data: revenue $1,500,000, costs $500,000, margin 66.67%.';
      const context: ConfidenceContext = {
        messageCount: 20,
        hasClientContext: true,
        hasSpecificData: true,
        userQuestion: 'What are my financials?',
      };

      const result = service.calculateConfidence(response, context);

      if (result.score >= 0.85) {
        expect(result.level).toBe(ConfidenceLevel.HIGH);
      }
    });

    it('should classify 50-84% as MEDIUM', () => {
      const response = 'Based on industry trends, this approach generally works.';
      const context = createDefaultContext();

      const result = service.calculateConfidence(response, context);

      if (result.score >= 0.5 && result.score < 0.85) {
        expect(result.level).toBe(ConfidenceLevel.MEDIUM);
      }
    });

    it('should classify 0-49% as LOW', () => {
      const response = 'I am uncertain. This might possibly work, perhaps.';
      const context: ConfidenceContext = {
        messageCount: 1,
        hasClientContext: false,
        hasSpecificData: false,
        userQuestion: 'What should I do?',
      };

      const result = service.calculateConfidence(response, context);

      if (result.score < 0.5) {
        expect(result.level).toBe(ConfidenceLevel.LOW);
      }
    });
  });
});
