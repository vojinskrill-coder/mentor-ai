import { HealthCheckError } from '@nestjs/terminus';
import { MemoryHealthIndicator } from './memory.health';

describe('MemoryHealthIndicator', () => {
  let indicator: MemoryHealthIndicator;

  beforeEach(() => {
    indicator = new MemoryHealthIndicator();
  });

  describe('isHealthy', () => {
    it('should return healthy status when memory usage is below threshold', async () => {
      const result = await indicator.isHealthy('memory', { threshold: 0.99 });
      const memoryResult = result['memory'] as Record<string, unknown>;

      expect(result).toHaveProperty('memory');
      expect(memoryResult['status']).toBe('up');
      expect(memoryResult).toHaveProperty('heapUsed');
      expect(memoryResult).toHaveProperty('heapTotal');
      expect(memoryResult).toHaveProperty('usage');
      expect(memoryResult).toHaveProperty('threshold');
    });

    it('should use default threshold of 90% when not specified', async () => {
      const result = await indicator.isHealthy('memory');
      const memoryResult = result['memory'] as Record<string, unknown>;

      expect(memoryResult['threshold']).toBe('90%');
    });

    it('should throw HealthCheckError when memory exceeds threshold', async () => {
      // Set an impossibly low threshold to guarantee failure
      await expect(
        indicator.isHealthy('memory', { threshold: 0.0001 })
      ).rejects.toThrow(HealthCheckError);
    });

    it('should include memory details in error', async () => {
      try {
        await indicator.isHealthy('memory', { threshold: 0.0001 });
        fail('Expected HealthCheckError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HealthCheckError);
        const healthError = error as HealthCheckError;
        expect(healthError.causes).toHaveProperty('memory');
        const memoryCause = healthError.causes['memory'] as Record<
          string,
          unknown
        >;
        expect(memoryCause['status']).toBe('down');
        expect(memoryCause).toHaveProperty('heapUsed');
        expect(memoryCause).toHaveProperty('heapTotal');
      }
    });

    it('should format bytes correctly', async () => {
      const result = await indicator.isHealthy('memory', { threshold: 0.99 });
      const memoryResult = result['memory'] as Record<string, string>;

      // Check that heapUsed and heapTotal are formatted as "X.XX MB"
      expect(memoryResult['heapUsed']).toMatch(/^\d+\.\d{2} MB$/);
      expect(memoryResult['heapTotal']).toMatch(/^\d+\.\d{2} MB$/);
    });

    it('should format usage as percentage', async () => {
      const result = await indicator.isHealthy('memory', { threshold: 0.99 });
      const memoryResult = result['memory'] as Record<string, string>;

      // Check that usage is formatted as "X%"
      expect(memoryResult['usage']).toMatch(/^\d+%$/);
    });

    it('should use custom key in result', async () => {
      const result = await indicator.isHealthy('custom-memory', {
        threshold: 0.99,
      });
      const memoryResult = result['custom-memory'] as Record<string, unknown>;

      expect(result).toHaveProperty('custom-memory');
      expect(memoryResult['status']).toBe('up');
    });

    it('should handle threshold at boundary (exactly at threshold)', async () => {
      // Memory usage is typically > 0, so a threshold of 0 should fail
      await expect(
        indicator.isHealthy('memory', { threshold: 0 })
      ).rejects.toThrow(HealthCheckError);
    });

    it('should pass with threshold of 1 (100%)', async () => {
      // Threshold of 1 (100%) should always pass
      const result = await indicator.isHealthy('memory', { threshold: 1 });
      const memoryResult = result['memory'] as Record<string, unknown>;

      expect(memoryResult['status']).toBe('up');
    });
  });
});
