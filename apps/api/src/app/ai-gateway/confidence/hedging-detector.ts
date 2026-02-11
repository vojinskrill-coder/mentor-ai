/**
 * Hedging language detector for confidence scoring.
 * Analyzes AI response text for uncertainty markers.
 */

/**
 * Hedging pattern with weight indicating uncertainty impact.
 */
interface HedgingPattern {
  /** Regular expression pattern to match */
  pattern: RegExp;
  /** Weight of this pattern (0.0-1.0, higher = more uncertain) */
  weight: number;
  /** Category of hedging */
  category: string;
}

/**
 * Result of hedging analysis.
 */
export interface HedgingAnalysisResult {
  /** Uncertainty ratio (0.0-1.0, higher = more uncertain) */
  uncertaintyRatio: number;
  /** Total hedging words found */
  hedgingCount: number;
  /** Total word count in the text */
  wordCount: number;
  /** Breakdown by category */
  categories: Record<string, number>;
  /** Position-weighted uncertainty (early hedging has more impact) */
  positionWeightedScore: number;
}

/**
 * Hedging language patterns with uncertainty weights.
 * Higher weight = more uncertainty impact.
 */
const HEDGING_PATTERNS: HedgingPattern[] = [
  // Possibility hedges (moderate uncertainty)
  {
    pattern: /\b(might|may|could|possibly|perhaps)\b/gi,
    weight: 0.5,
    category: 'possibility',
  },
  // Approximation hedges (lower uncertainty)
  {
    pattern: /\b(approximately|roughly|around|about|nearly|almost)\b/gi,
    weight: 0.3,
    category: 'approximation',
  },
  // Uncertainty markers (high uncertainty)
  {
    pattern: /\b(uncertain|unclear|unsure|not sure|hard to say|difficult to determine)\b/gi,
    weight: 0.8,
    category: 'uncertainty',
  },
  // Qualification hedges (lower uncertainty)
  {
    pattern: /\b(generally|usually|typically|often|sometimes|frequently)\b/gi,
    weight: 0.2,
    category: 'qualification',
  },
  // Disclaimer phrases (high uncertainty)
  {
    pattern:
      /\b(this is just|this is only|limited data|not financial advice|not legal advice|consult a professional)\b/gi,
    weight: 0.6,
    category: 'disclaimer',
  },
  // Conditional phrases (moderate uncertainty)
  {
    pattern: /\b(if|depending on|it depends|would depend)\b/gi,
    weight: 0.4,
    category: 'conditional',
  },
  // Weak assertions (moderate uncertainty)
  {
    pattern: /\b(seems|appears|suggests|indicates|implies)\b/gi,
    weight: 0.4,
    category: 'weak_assertion',
  },
  // Probability words (lower uncertainty)
  {
    pattern: /\b(likely|probably|presumably|presumably)\b/gi,
    weight: 0.3,
    category: 'probability',
  },
];

/**
 * Analyzes text for hedging language to determine uncertainty level.
 *
 * @param text - Text content to analyze
 * @returns Analysis result with uncertainty metrics
 */
export function analyzeHedging(text: string): HedgingAnalysisResult {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const wordCount = words.length;

  if (wordCount === 0) {
    return {
      uncertaintyRatio: 0,
      hedgingCount: 0,
      wordCount: 0,
      categories: {},
      positionWeightedScore: 0,
    };
  }

  const categories: Record<string, number> = {};
  let totalHedgingCount = 0;
  let weightedSum = 0;
  let positionWeightedSum = 0;

  for (const { pattern, weight, category } of HEDGING_PATTERNS) {
    const matches = text.matchAll(pattern);

    for (const match of matches) {
      totalHedgingCount++;
      weightedSum += weight;

      // Track category counts
      categories[category] = (categories[category] ?? 0) + 1;

      // Position weighting: hedging in first 20% of text has 2x impact
      if (match.index !== undefined) {
        const position = match.index / text.length;
        const positionMultiplier = position < 0.2 ? 2.0 : position < 0.5 ? 1.5 : 1.0;
        positionWeightedSum += weight * positionMultiplier;
      } else {
        positionWeightedSum += weight;
      }
    }
  }

  // Calculate uncertainty ratio (normalize by word count)
  // More hedging words relative to total words = higher uncertainty
  const normalizedHedgingDensity = totalHedgingCount / wordCount;

  // Cap at 1.0 and scale appropriately
  // A density of 0.1 (10% hedging words) would be quite high
  const uncertaintyRatio = Math.min(1.0, normalizedHedgingDensity * 10);

  // Position-weighted score normalized similarly
  const positionWeightedScore = Math.min(1.0, (positionWeightedSum / wordCount) * 10);

  return {
    uncertaintyRatio,
    hedgingCount: totalHedgingCount,
    wordCount,
    categories,
    positionWeightedScore,
  };
}

/**
 * Gets confidence score from hedging analysis.
 * Inverts uncertainty to confidence (less hedging = higher confidence).
 *
 * @param text - Text to analyze
 * @returns Confidence score (0.0-1.0)
 */
export function getHedgingConfidenceScore(text: string): number {
  const analysis = analyzeHedging(text);

  // Use position-weighted score for more nuanced result
  // Invert: high uncertainty = low confidence
  return 1 - analysis.positionWeightedScore;
}
