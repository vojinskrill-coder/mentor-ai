import { Test, TestingModule } from '@nestjs/testing';
import {
  ImprovementSuggestionsService,
  type SuggestionContext,
} from './improvement-suggestions.service';
import { ConfidenceLevel, PersonaType, type ConfidenceScore } from '@mentor-ai/shared/types';

describe('ImprovementSuggestionsService', () => {
  let service: ImprovementSuggestionsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ImprovementSuggestionsService],
    }).compile();

    service = module.get<ImprovementSuggestionsService>(ImprovementSuggestionsService);
  });

  const createLowConfidence = (): ConfidenceScore => ({
    score: 0.4,
    level: ConfidenceLevel.LOW,
    factors: [
      { name: 'hedging_language', score: 0.3, weight: 0.35 },
      { name: 'context_depth', score: 0.4, weight: 0.35 },
      { name: 'response_specificity', score: 0.5, weight: 0.3 },
    ],
  });

  const createMediumConfidence = (): ConfidenceScore => ({
    score: 0.65,
    level: ConfidenceLevel.MEDIUM,
    factors: [
      { name: 'hedging_language', score: 0.7, weight: 0.35 },
      { name: 'context_depth', score: 0.6, weight: 0.35 },
      { name: 'response_specificity', score: 0.65, weight: 0.3 },
    ],
  });

  const createHighConfidence = (): ConfidenceScore => ({
    score: 0.9,
    level: ConfidenceLevel.HIGH,
    factors: [
      { name: 'hedging_language', score: 0.95, weight: 0.35 },
      { name: 'context_depth', score: 0.85, weight: 0.35 },
      { name: 'response_specificity', score: 0.9, weight: 0.3 },
    ],
  });

  const createDefaultContext = (): SuggestionContext => ({
    hasClientContext: false,
    hasSpecificData: false,
  });

  describe('generateSuggestions', () => {
    it('should return no suggestions for high confidence', () => {
      const confidence = createHighConfidence();
      const context = createDefaultContext();

      const result = service.generateSuggestions(confidence, context);

      expect(result.primarySuggestion).toBeNull();
      expect(result.suggestions).toHaveLength(0);
    });

    it('should return suggestions for low confidence', () => {
      const confidence = createLowConfidence();
      const context = createDefaultContext();

      const result = service.generateSuggestions(confidence, context);

      expect(result.primarySuggestion).toBeDefined();
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it('should return suggestions for medium confidence with low factors', () => {
      const confidence = createMediumConfidence();
      confidence.factors[1]!.score = 0.5; // Low context depth
      const context = createDefaultContext();

      const result = service.generateSuggestions(confidence, context);

      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it('should include suggestions for low confidence with persona', () => {
      const confidence = createLowConfidence();
      const context: SuggestionContext = {
        ...createDefaultContext(),
        personaType: PersonaType.CFO,
      };

      const result = service.generateSuggestions(confidence, context);

      // Should have suggestions when persona is provided and confidence is low
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it('should skip context suggestions when context is provided', () => {
      const confidence = createLowConfidence();
      const context: SuggestionContext = {
        hasClientContext: true,
        hasSpecificData: false,
      };

      const result = service.generateSuggestions(confidence, context);

      // Should not have missing_context suggestions
      const hasContextSuggestion = result.suggestions.some(
        (s) => s.category === 'missing_context'
      );
      expect(hasContextSuggestion).toBe(false);
    });

    it('should skip data suggestions when data is provided', () => {
      const confidence = createLowConfidence();
      const context: SuggestionContext = {
        hasClientContext: false,
        hasSpecificData: true,
      };

      const result = service.generateSuggestions(confidence, context);

      // Should not have data_gap suggestions
      const hasDataSuggestion = result.suggestions.some(
        (s) => s.category === 'data_gap'
      );
      expect(hasDataSuggestion).toBe(false);
    });

    it('should sort suggestions by priority', () => {
      const confidence = createLowConfidence();
      const context = createDefaultContext();

      const result = service.generateSuggestions(confidence, context);

      // Verify suggestions are sorted by priority (ascending)
      for (let i = 1; i < result.suggestions.length; i++) {
        expect(result.suggestions[i]!.priority).toBeGreaterThanOrEqual(
          result.suggestions[i - 1]!.priority
        );
      }
    });

    it('should deduplicate suggestions by category', () => {
      const confidence = createLowConfidence();
      const context = createDefaultContext();

      const result = service.generateSuggestions(confidence, context);

      // Verify no duplicate categories
      const categories = result.suggestions.map((s) => s.category);
      const uniqueCategories = new Set(categories);
      expect(categories.length).toBe(uniqueCategories.size);
    });
  });

  describe('getImprovementSuggestion', () => {
    it('should return primary suggestion for low confidence', () => {
      const confidence = createLowConfidence();
      const context = createDefaultContext();

      const suggestion = service.getImprovementSuggestion(confidence, context);

      expect(suggestion).toBeDefined();
      expect(typeof suggestion).toBe('string');
    });

    it('should return null for high confidence', () => {
      const confidence = createHighConfidence();
      const context = createDefaultContext();

      const suggestion = service.getImprovementSuggestion(confidence, context);

      expect(suggestion).toBeNull();
    });
  });

  describe('calculateDelta', () => {
    it('should return positive improvement message when score increased', () => {
      const delta = service.calculateDelta(0.72, 0.85);

      expect(delta).toContain('improved');
      expect(delta).toContain('72%');
      expect(delta).toContain('85%');
    });

    it('should return change message when score decreased', () => {
      const delta = service.calculateDelta(0.85, 0.72);

      expect(delta).toContain('changed');
      expect(delta).toContain('85%');
      expect(delta).toContain('72%');
    });

    it('should return null when no previous score', () => {
      const delta = service.calculateDelta(undefined, 0.72);

      expect(delta).toBeNull();
    });

    it('should return null when score unchanged', () => {
      const delta = service.calculateDelta(0.72, 0.72);

      expect(delta).toBeNull();
    });
  });

  describe('generateSuggestions with improvement delta', () => {
    it('should include improvement delta when previous score exists', () => {
      const confidence = createMediumConfidence();
      const context: SuggestionContext = {
        ...createDefaultContext(),
        previousScore: 0.5,
      };

      const result = service.generateSuggestions(confidence, context);

      expect(result.improvementDelta).toBeDefined();
      expect(result.previousScore).toBe(0.5);
      expect(result.currentScore).toBe(0.65);
    });

    it('should not include delta when no previous score', () => {
      const confidence = createMediumConfidence();
      const context = createDefaultContext();

      const result = service.generateSuggestions(confidence, context);

      expect(result.improvementDelta).toBeNull();
      expect(result.previousScore).toBeUndefined();
    });
  });

  describe('persona-specific suggestions', () => {
    it('should include persona suggestions for low confidence', () => {
      // Test that persona-specific suggestions are added for low confidence
      const confidence = createLowConfidence();
      const context: SuggestionContext = {
        ...createDefaultContext(),
        personaType: PersonaType.CFO,
      };

      const result = service.generateSuggestions(confidence, context);

      // Should have suggestions from both factor-based and persona-based sources
      expect(result.suggestions.length).toBeGreaterThan(0);
    });

    it('should not add persona suggestions for high confidence', () => {
      const confidence = createHighConfidence();
      const context: SuggestionContext = {
        ...createDefaultContext(),
        personaType: PersonaType.CFO,
      };

      const result = service.generateSuggestions(confidence, context);

      expect(result.suggestions).toHaveLength(0);
    });
  });
});
