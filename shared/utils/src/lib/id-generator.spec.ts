import {
  generateUserId,
  generateTenantId,
  hasValidPrefix,
  stripPrefix,
  ID_PREFIX,
} from './id-generator';

describe('ID Generator', () => {
  describe('generateUserId', () => {
    it('should generate an ID with usr_ prefix', () => {
      const id = generateUserId();
      expect(id).toMatch(/^usr_[a-z0-9]+$/);
    });

    it('should generate unique IDs', () => {
      const id1 = generateUserId();
      const id2 = generateUserId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('generateTenantId', () => {
    it('should generate an ID with tnt_ prefix', () => {
      const id = generateTenantId();
      expect(id).toMatch(/^tnt_[a-z0-9]+$/);
    });

    it('should generate unique IDs', () => {
      const id1 = generateTenantId();
      const id2 = generateTenantId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('hasValidPrefix', () => {
    it('should return true for user ID with correct prefix', () => {
      expect(hasValidPrefix('usr_abc123', ID_PREFIX.USER)).toBe(true);
    });

    it('should return true for tenant ID with correct prefix', () => {
      expect(hasValidPrefix('tnt_abc123', ID_PREFIX.TENANT)).toBe(true);
    });

    it('should return false for ID with wrong prefix', () => {
      expect(hasValidPrefix('usr_abc123', ID_PREFIX.TENANT)).toBe(false);
      expect(hasValidPrefix('tnt_abc123', ID_PREFIX.USER)).toBe(false);
    });

    it('should return false for ID without prefix', () => {
      expect(hasValidPrefix('abc123', ID_PREFIX.USER)).toBe(false);
    });
  });

  describe('stripPrefix', () => {
    it('should remove usr_ prefix', () => {
      expect(stripPrefix('usr_abc123')).toBe('abc123');
    });

    it('should remove tnt_ prefix', () => {
      expect(stripPrefix('tnt_abc123')).toBe('abc123');
    });

    it('should return original string if no known prefix', () => {
      expect(stripPrefix('unknown_abc123')).toBe('unknown_abc123');
    });
  });
});
