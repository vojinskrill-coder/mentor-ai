import { Injectable, Logger } from '@nestjs/common';
import {
  ConfidenceScore,
  ConfidenceLevel,
  ConfidenceFactor,
  ImprovementSuggestion,
  type PersonaType,
} from '@mentor-ai/shared/types';

/**
 * Context for generating improvement suggestions.
 */
export interface SuggestionContext {
  /** Persona type for persona-specific suggestions */
  personaType?: PersonaType;
  /** Whether client context was provided */
  hasClientContext: boolean;
  /** Whether specific data was provided */
  hasSpecificData: boolean;
  /** Previous confidence score for improvement delta */
  previousScore?: number;
}

/**
 * Result of improvement suggestion generation.
 */
export interface ImprovementResult {
  /** Primary suggestion to display */
  primarySuggestion: string | null;
  /** All applicable suggestions with priorities */
  suggestions: ImprovementSuggestion[];
  /** Improvement delta message if applicable */
  improvementDelta: string | null;
  /** Previous score for reference */
  previousScore?: number;
  /** Current score for reference */
  currentScore: number;
}

/**
 * Mapping of confidence factors to improvement suggestions.
 */
const FACTOR_SUGGESTIONS: Record<string, ImprovementSuggestion[]> = {
  hedging_language: [
    {
      category: 'ambiguous_question',
      suggestion: 'Try asking a more specific question to get a clearer answer.',
      priority: 2,
    },
    {
      category: 'missing_context',
      suggestion: 'Provide more details about your specific situation for targeted guidance.',
      priority: 3,
    },
  ],
  context_depth: [
    {
      category: 'missing_context',
      suggestion: 'Share more background about your business or project.',
      priority: 1,
    },
    {
      category: 'data_gap',
      suggestion: 'Provide relevant data points like revenue, costs, or timelines.',
      priority: 1,
    },
  ],
  response_specificity: [
    {
      category: 'data_gap',
      suggestion: 'Include specific numbers (budget, revenue, headcount) for more precise recommendations.',
      priority: 1,
    },
    {
      category: 'missing_context',
      suggestion: 'Describe your goals or constraints to get tailored advice.',
      priority: 2,
    },
  ],
};

/**
 * Persona-specific improvement suggestions.
 */
const PERSONA_SUGGESTIONS: Record<string, ImprovementSuggestion[]> = {
  CFO: [
    {
      category: 'data_gap',
      suggestion: 'Provide your Q2 financial data (revenue, costs, margins) for more accurate analysis.',
      priority: 1,
    },
    {
      category: 'missing_context',
      suggestion: 'Share your budget constraints or financial goals.',
      priority: 2,
    },
  ],
  CMO: [
    {
      category: 'data_gap',
      suggestion: 'Include your marketing budget or campaign performance metrics.',
      priority: 1,
    },
    {
      category: 'missing_context',
      suggestion: 'Describe your target audience or market segment.',
      priority: 2,
    },
  ],
  CTO: [
    {
      category: 'missing_context',
      suggestion: 'Describe your current tech stack or infrastructure constraints.',
      priority: 1,
    },
    {
      category: 'data_gap',
      suggestion: 'Provide metrics like response times, uptime, or user load.',
      priority: 2,
    },
  ],
  OPERATIONS: [
    {
      category: 'data_gap',
      suggestion: 'Share your current operational metrics or KPIs.',
      priority: 1,
    },
    {
      category: 'missing_context',
      suggestion: 'Describe your process or workflow constraints.',
      priority: 2,
    },
  ],
  LEGAL: [
    {
      category: 'missing_context',
      suggestion: 'Specify your jurisdiction or industry for relevant compliance guidance.',
      priority: 1,
    },
    {
      category: 'data_gap',
      suggestion: 'Provide details about the contract or agreement in question.',
      priority: 2,
    },
  ],
  CREATIVE: [
    {
      category: 'missing_context',
      suggestion: 'Describe your brand voice or creative direction.',
      priority: 1,
    },
    {
      category: 'data_gap',
      suggestion: 'Share examples of creative work you admire or want to emulate.',
      priority: 2,
    },
  ],
};

/**
 * Service for generating improvement suggestions based on confidence scores.
 * Provides actionable feedback to users on how to improve AI response quality.
 */
@Injectable()
export class ImprovementSuggestionsService {
  private readonly logger = new Logger(ImprovementSuggestionsService.name);

  /**
   * Generates improvement suggestions based on confidence score and context.
   *
   * @param confidence - The calculated confidence score
   * @param context - Context for generating suggestions
   * @returns Improvement result with suggestions and delta message
   */
  generateSuggestions(
    confidence: ConfidenceScore,
    context: SuggestionContext
  ): ImprovementResult {
    const suggestions: ImprovementSuggestion[] = [];

    // Only generate suggestions for non-high confidence
    if (confidence.level === ConfidenceLevel.HIGH) {
      return {
        primarySuggestion: null,
        suggestions: [],
        improvementDelta: this.calculateDelta(context.previousScore, confidence.score),
        previousScore: context.previousScore,
        currentScore: confidence.score,
      };
    }

    // Get factor-based suggestions
    for (const factor of confidence.factors) {
      if (factor.score < 0.7) {
        const factorSuggestions = this.getSuggestionsForFactor(factor, context);
        suggestions.push(...factorSuggestions);
      }
    }

    // Add persona-specific suggestions if applicable
    if (context.personaType && confidence.level === ConfidenceLevel.LOW) {
      const personaSuggestions = PERSONA_SUGGESTIONS[context.personaType] ?? [];
      for (const suggestion of personaSuggestions) {
        if (!suggestions.some((s) => s.category === suggestion.category)) {
          suggestions.push(suggestion);
        }
      }
    }

    // Sort by priority and deduplicate
    const uniqueSuggestions = this.deduplicateSuggestions(suggestions);
    uniqueSuggestions.sort((a, b) => a.priority - b.priority);

    // Get primary suggestion (highest priority)
    const primarySuggestion = uniqueSuggestions[0]?.suggestion ?? null;

    // Calculate improvement delta if previous score exists
    const improvementDelta = this.calculateDelta(context.previousScore, confidence.score);

    this.logger.log({
      message: 'Improvement suggestions generated',
      confidenceLevel: confidence.level,
      suggestionCount: uniqueSuggestions.length,
      hasPrimarySuggestion: !!primarySuggestion,
      hasImprovementDelta: !!improvementDelta,
    });

    return {
      primarySuggestion,
      suggestions: uniqueSuggestions,
      improvementDelta,
      previousScore: context.previousScore,
      currentScore: confidence.score,
    };
  }

  /**
   * Generates the improvement suggestion string for the confidence score.
   *
   * @param confidence - The calculated confidence score
   * @param context - Context for generating suggestions
   * @returns Improvement suggestion string or null
   */
  getImprovementSuggestion(
    confidence: ConfidenceScore,
    context: SuggestionContext
  ): string | null {
    const result = this.generateSuggestions(confidence, context);
    return result.primarySuggestion;
  }

  /**
   * Calculates the improvement delta message between two scores.
   *
   * @param previousScore - Previous confidence score (0.0-1.0)
   * @param currentScore - Current confidence score (0.0-1.0)
   * @returns Delta message or null if no previous score
   */
  calculateDelta(previousScore: number | undefined, currentScore: number): string | null {
    if (previousScore === undefined) {
      return null;
    }

    const previousPercent = Math.round(previousScore * 100);
    const currentPercent = Math.round(currentScore * 100);
    const delta = currentPercent - previousPercent;

    if (delta > 0) {
      return `Your input improved confidence from ${previousPercent}% to ${currentPercent}%`;
    } else if (delta < 0) {
      return `Confidence changed from ${previousPercent}% to ${currentPercent}%`;
    }

    return null; // No change
  }

  /**
   * Gets suggestions for a specific confidence factor.
   */
  private getSuggestionsForFactor(
    factor: ConfidenceFactor,
    context: SuggestionContext
  ): ImprovementSuggestion[] {
    const baseSuggestions = FACTOR_SUGGESTIONS[factor.name] ?? [];
    const suggestions: ImprovementSuggestion[] = [];

    for (const suggestion of baseSuggestions) {
      // Adjust priority based on factor score
      const adjustedPriority = factor.score < 0.5 ? suggestion.priority : suggestion.priority + 1;

      // Skip context-related suggestions if context already provided
      if (suggestion.category === 'missing_context' && context.hasClientContext) {
        continue;
      }

      // Skip data-related suggestions if data already provided
      if (suggestion.category === 'data_gap' && context.hasSpecificData) {
        continue;
      }

      suggestions.push({
        ...suggestion,
        priority: adjustedPriority,
      });
    }

    return suggestions;
  }

  /**
   * Deduplicates suggestions by category, keeping highest priority.
   */
  private deduplicateSuggestions(
    suggestions: ImprovementSuggestion[]
  ): ImprovementSuggestion[] {
    const byCategory = new Map<string, ImprovementSuggestion>();

    for (const suggestion of suggestions) {
      const existing = byCategory.get(suggestion.category);
      if (!existing || suggestion.priority < existing.priority) {
        byCategory.set(suggestion.category, suggestion);
      }
    }

    return Array.from(byCategory.values());
  }
}
