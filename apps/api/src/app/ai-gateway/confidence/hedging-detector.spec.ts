import { analyzeHedging, getHedgingConfidenceScore } from './hedging-detector';

describe('HedgingDetector', () => {
  describe('analyzeHedging', () => {
    it('should return zero uncertainty for empty text', () => {
      const result = analyzeHedging('');

      expect(result.uncertaintyRatio).toBe(0);
      expect(result.hedgingCount).toBe(0);
      expect(result.wordCount).toBe(0);
    });

    it('should detect possibility hedges', () => {
      const result = analyzeHedging('This might work. It could be effective.');

      expect(result.hedgingCount).toBeGreaterThan(0);
      expect(result.categories['possibility']).toBe(2);
    });

    it('should detect uncertainty markers', () => {
      const result = analyzeHedging('I am uncertain about the outcome. It is unclear what will happen.');

      expect(result.hedgingCount).toBeGreaterThan(0);
      expect(result.categories['uncertainty']).toBe(2);
    });

    it('should detect approximation hedges', () => {
      const result = analyzeHedging('There are approximately 100 users. Roughly 50% are active.');

      expect(result.hedgingCount).toBeGreaterThan(0);
      expect(result.categories['approximation']).toBe(2);
    });

    it('should detect qualification hedges', () => {
      const result = analyzeHedging('Generally speaking, this works. It is typically reliable.');

      expect(result.hedgingCount).toBeGreaterThan(0);
      expect(result.categories['qualification']).toBe(2);
    });

    it('should detect disclaimer phrases', () => {
      const result = analyzeHedging(
        'This is just my opinion. Please consult a professional for specific advice.',
      );

      expect(result.hedgingCount).toBeGreaterThan(0);
      expect(result.categories['disclaimer']).toBeGreaterThanOrEqual(1);
    });

    it('should return higher uncertainty for more hedging words', () => {
      const lowHedging = analyzeHedging('The strategy is effective and proven.');
      const highHedging = analyzeHedging(
        'This might possibly work, perhaps it could be effective, but I am uncertain.',
      );

      expect(highHedging.uncertaintyRatio).toBeGreaterThan(lowHedging.uncertaintyRatio);
    });

    it('should weight early hedging more heavily', () => {
      const earlyHedging = analyzeHedging(
        'I am uncertain about this. The data shows clear trends in sales growth.',
      );
      const lateHedging = analyzeHedging(
        'The data shows clear trends in sales growth. I am uncertain about this.',
      );

      // Early hedging should have higher position-weighted score
      expect(earlyHedging.positionWeightedScore).toBeGreaterThanOrEqual(
        lateHedging.positionWeightedScore,
      );
    });

    it('should handle text with no hedging', () => {
      const result = analyzeHedging('The revenue increased by 25%. Costs decreased by 10%.');

      expect(result.hedgingCount).toBe(0);
      expect(result.uncertaintyRatio).toBe(0);
      expect(Object.keys(result.categories).length).toBe(0);
    });

    it('should count words correctly', () => {
      const result = analyzeHedging('One two three four five');

      expect(result.wordCount).toBe(5);
    });
  });

  describe('getHedgingConfidenceScore', () => {
    it('should return high confidence for text with no hedging', () => {
      const score = getHedgingConfidenceScore(
        'The revenue increased by 25%. Costs decreased by 10%. Profit margin improved significantly.',
      );

      expect(score).toBeGreaterThanOrEqual(0.9);
    });

    it('should return lower confidence for text with hedging', () => {
      const score = getHedgingConfidenceScore(
        'This might work. It could possibly be effective, but I am uncertain.',
      );

      expect(score).toBeLessThan(0.8);
    });

    it('should return value between 0 and 1', () => {
      const scores = [
        getHedgingConfidenceScore('Definite statement.'),
        getHedgingConfidenceScore('Might possibly maybe could perhaps uncertain.'),
        getHedgingConfidenceScore('Normal business text with some uncertainty perhaps.'),
      ];

      for (const score of scores) {
        expect(score).toBeGreaterThanOrEqual(0);
        expect(score).toBeLessThanOrEqual(1);
      }
    });

    it('should return 1.0 for empty text', () => {
      const score = getHedgingConfidenceScore('');

      expect(score).toBe(1);
    });

    it('should differentiate between low, medium, and high hedging', () => {
      const noHedging = getHedgingConfidenceScore(
        'The analysis shows clear results. Revenue is up. Costs are down.',
      );
      const someHedging = getHedgingConfidenceScore(
        'The analysis generally shows positive results. Revenue is probably up.',
      );
      const muchHedging = getHedgingConfidenceScore(
        'I am uncertain. This might possibly work. Perhaps it could be effective maybe.',
      );

      expect(noHedging).toBeGreaterThan(someHedging);
      expect(someHedging).toBeGreaterThan(muchHedging);
    });
  });
});
