import { HealthService } from './health.service';

describe('HealthService', () => {
  let service: HealthService;

  beforeEach(() => {
    service = new HealthService();
  });

  describe('getVersion', () => {
    it('should return version from package.json', () => {
      const version = service.getVersion();

      expect(version).toBeDefined();
      expect(typeof version).toBe('string');
    });
  });

  describe('getTimestamp', () => {
    it('should return valid ISO 8601 timestamp', () => {
      const timestamp = service.getTimestamp();

      expect(timestamp).toBeDefined();
      // Verify ISO 8601 format
      const date = new Date(timestamp);
      expect(date.toISOString()).toBe(timestamp);
    });

    it('should return current time', () => {
      const before = new Date().getTime();
      const timestamp = service.getTimestamp();
      const after = new Date().getTime();

      const timestampMs = new Date(timestamp).getTime();
      expect(timestampMs).toBeGreaterThanOrEqual(before);
      expect(timestampMs).toBeLessThanOrEqual(after);
    });
  });

});
