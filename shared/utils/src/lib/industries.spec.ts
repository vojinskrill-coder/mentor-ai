import { INDUSTRIES, isValidIndustry } from './industries';

describe('Industries', () => {
  describe('INDUSTRIES constant', () => {
    it('should contain expected industries', () => {
      expect(INDUSTRIES).toContain('Technology');
      expect(INDUSTRIES).toContain('Healthcare');
      expect(INDUSTRIES).toContain('Finance');
      expect(INDUSTRIES).toContain('Other');
    });

    it('should have 11 industry options', () => {
      expect(INDUSTRIES.length).toBe(11);
    });
  });

  describe('isValidIndustry', () => {
    it('should return true for valid industries', () => {
      expect(isValidIndustry('Technology')).toBe(true);
      expect(isValidIndustry('Healthcare')).toBe(true);
      expect(isValidIndustry('Other')).toBe(true);
    });

    it('should return false for invalid industries', () => {
      expect(isValidIndustry('InvalidIndustry')).toBe(false);
      expect(isValidIndustry('')).toBe(false);
      expect(isValidIndustry('TECHNOLOGY')).toBe(false); // Case sensitive
    });
  });
});
