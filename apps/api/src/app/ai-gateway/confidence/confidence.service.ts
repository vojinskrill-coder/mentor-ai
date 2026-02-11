import { Injectable, Logger } from '@nestjs/common';
import {
  ConfidenceScore,
  ConfidenceFactor,
  ConfidenceLevel,
  ConfidenceContext,
  type PersonaType,
} from '@mentor-ai/shared/types';
import { getHedgingConfidenceScore, analyzeHedging } from './hedging-detector';

/**
 * Configuration for confidence factor weights.
 * Weights must sum to 1.0.
 */
const FACTOR_WEIGHTS = {
  hedging: 0.35,
  context: 0.35,
  specificity: 0.3,
} as const;

/**
 * Service for calculating AI response confidence scores.
 * Uses multi-factor analysis including hedging language, context depth, and response specificity.
 */
@Injectable()
export class ConfidenceService {
  private readonly logger = new Logger(ConfidenceService.name);

  /**
   * Calculates confidence score for an AI response.
   *
   * @param response - The AI-generated response text
   * @param context - Context information for the calculation
   * @returns ConfidenceScore with overall score, level, and factor breakdown
   */
  calculateConfidence(response: string, context: ConfidenceContext): ConfidenceScore {
    const factors: ConfidenceFactor[] = [];

    // Factor 1: Hedging language analysis
    const hedgingScore = this.calculateHedgingFactor(response);
    factors.push(hedgingScore);

    // Factor 2: Context depth analysis
    const contextScore = this.calculateContextFactor(context);
    factors.push(contextScore);

    // Factor 3: Response specificity analysis
    const specificityScore = this.calculateSpecificityFactor(response);
    factors.push(specificityScore);

    // Calculate weighted average
    const totalScore = factors.reduce((sum, factor) => sum + factor.score * factor.weight, 0);

    const level = this.getConfidenceLevel(totalScore);

    const result: ConfidenceScore = {
      score: Math.round(totalScore * 100) / 100, // Round to 2 decimal places
      level,
      factors,
    };

    this.logger.log({
      message: 'Confidence calculated',
      score: result.score,
      level: result.level,
      factorScores: factors.map((f) => ({ name: f.name, score: f.score })),
    });

    return result;
  }

  /**
   * Calculates confidence for a multi-section response.
   * Each section gets its own score, and overall is the weighted average.
   *
   * @param sections - Array of response sections to analyze
   * @param context - Context information for the calculation
   * @returns Array of section scores and overall average
   */
  calculateMultiSectionConfidence(
    sections: string[],
    context: ConfidenceContext,
  ): { sectionScores: ConfidenceScore[]; overall: ConfidenceScore } {
    const sectionScores = sections.map((section) => this.calculateConfidence(section, context));

    // Calculate weighted average based on section length
    const totalLength = sections.reduce((sum, s) => sum + s.length, 0);
    let weightedSum = 0;

    for (let i = 0; i < sections.length; i++) {
      const weight = sections[i]!.length / totalLength;
      weightedSum += sectionScores[i]!.score * weight;
    }

    // Build overall score by averaging factors
    const avgFactors = this.averageFactors(sectionScores.map((s) => s.factors));

    const overall: ConfidenceScore = {
      score: Math.round(weightedSum * 100) / 100,
      level: this.getConfidenceLevel(weightedSum),
      factors: avgFactors,
    };

    return { sectionScores, overall };
  }

  /**
   * Calculates the hedging language factor.
   *
   * @param response - Response text to analyze
   * @returns Hedging confidence factor
   */
  private calculateHedgingFactor(response: string): ConfidenceFactor {
    const hedgingScore = getHedgingConfidenceScore(response);
    const analysis = analyzeHedging(response);

    return {
      name: 'hedging_language',
      score: hedgingScore,
      weight: FACTOR_WEIGHTS.hedging,
      description: `Hedging word count: ${analysis.hedgingCount}. Lower hedging indicates higher confidence.`,
    };
  }

  /**
   * Calculates the context depth factor.
   *
   * @param context - Context information
   * @returns Context depth confidence factor
   */
  private calculateContextFactor(context: ConfidenceContext): ConfidenceFactor {
    let score = 0.5; // Base score

    // More conversation history = more context = higher confidence
    if (context.messageCount > 10) {
      score += 0.2;
    } else if (context.messageCount > 5) {
      score += 0.15;
    } else if (context.messageCount > 2) {
      score += 0.1;
    }

    // Client context available = higher confidence
    if (context.hasClientContext) {
      score += 0.15;
    }

    // Specific data provided = higher confidence
    if (context.hasSpecificData) {
      score += 0.15;
    }

    // Cap at 1.0
    score = Math.min(1.0, score);

    const description = this.buildContextDescription(context);

    return {
      name: 'context_depth',
      score,
      weight: FACTOR_WEIGHTS.context,
      description,
    };
  }

  /**
   * Calculates the response specificity factor.
   * Specific responses with numbers, dates, and concrete terms score higher.
   *
   * @param response - Response text to analyze
   * @returns Specificity confidence factor
   */
  private calculateSpecificityFactor(response: string): ConfidenceFactor {
    let score = 0.6; // Base score

    // Count specific indicators
    const numberMatches = response.match(/\d+(\.\d+)?%?/g) ?? [];
    const currencyMatches = response.match(/\$[\d,]+(\.\d{2})?/g) ?? [];
    const dateMatches =
      response.match(/\b(January|February|March|April|May|June|July|August|September|October|November|December|\d{4}|Q[1-4])\b/gi) ??
      [];

    // Increase score based on specificity indicators
    if (numberMatches.length > 3) {
      score += 0.2;
    } else if (numberMatches.length > 0) {
      score += 0.1;
    }

    if (currencyMatches.length > 0) {
      score += 0.1;
    }

    if (dateMatches.length > 0) {
      score += 0.1;
    }

    // Cap at 1.0
    score = Math.min(1.0, score);

    return {
      name: 'response_specificity',
      score,
      weight: FACTOR_WEIGHTS.specificity,
      description: `Found ${numberMatches.length} numbers, ${currencyMatches.length} currencies, ${dateMatches.length} dates. Specific recommendations score higher.`,
    };
  }

  /**
   * Determines confidence level from numeric score.
   *
   * @param score - Numeric score (0.0-1.0)
   * @returns Confidence level enum
   */
  private getConfidenceLevel(score: number): ConfidenceLevel {
    if (score >= 0.85) {
      return ConfidenceLevel.HIGH;
    }
    if (score >= 0.5) {
      return ConfidenceLevel.MEDIUM;
    }
    return ConfidenceLevel.LOW;
  }

  /**
   * Builds a description for the context factor.
   */
  private buildContextDescription(context: ConfidenceContext): string {
    const parts: string[] = [];

    if (context.messageCount > 0) {
      parts.push(`${context.messageCount} messages in history`);
    }

    if (context.hasClientContext) {
      parts.push('client context available');
    }

    if (context.hasSpecificData) {
      parts.push('specific data provided');
    }

    if (parts.length === 0) {
      return 'Limited context available for this response.';
    }

    return `Context: ${parts.join(', ')}. More context improves confidence.`;
  }

  /**
   * Averages factors across multiple confidence scores.
   */
  private averageFactors(factorArrays: ConfidenceFactor[][]): ConfidenceFactor[] {
    if (factorArrays.length === 0) return [];

    const firstFactors = factorArrays[0]!;
    return firstFactors.map((factor, index) => {
      const avgScore =
        factorArrays.reduce((sum, factors) => sum + (factors[index]?.score ?? 0), 0) /
        factorArrays.length;

      return {
        name: factor.name,
        score: Math.round(avgScore * 100) / 100,
        weight: factor.weight,
        description: `Average across ${factorArrays.length} sections.`,
      };
    });
  }
}
