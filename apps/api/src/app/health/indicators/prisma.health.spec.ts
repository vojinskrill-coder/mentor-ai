import { HealthCheckError } from '@nestjs/terminus';
import { PrismaHealthIndicator } from './prisma.health';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';

describe('PrismaHealthIndicator', () => {
  let indicator: PrismaHealthIndicator;
  let mockPrismaService: jest.Mocked<PlatformPrismaService>;

  beforeEach(() => {
    mockPrismaService = {
      $queryRaw: jest.fn(),
    } as unknown as jest.Mocked<PlatformPrismaService>;

    indicator = new PrismaHealthIndicator(mockPrismaService);
  });

  describe('isHealthy', () => {
    it('should return healthy status when database is reachable', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

      const result = await indicator.isHealthy('database');

      expect(result).toEqual({
        database: { status: 'up' },
      });
      expect(mockPrismaService.$queryRaw).toHaveBeenCalled();
    });

    it('should throw HealthCheckError when database is unreachable', async () => {
      mockPrismaService.$queryRaw.mockRejectedValue(
        new Error('Connection refused')
      );

      await expect(indicator.isHealthy('database')).rejects.toThrow(
        HealthCheckError
      );
    });

    it('should include error message in failed status', async () => {
      mockPrismaService.$queryRaw.mockRejectedValue(
        new Error('Connection refused')
      );

      try {
        await indicator.isHealthy('database');
        fail('Expected HealthCheckError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HealthCheckError);
        const healthError = error as HealthCheckError;
        expect(healthError.causes).toEqual({
          database: {
            status: 'down',
            message: 'Connection refused',
          },
        });
      }
    });

    it('should handle unknown error types', async () => {
      mockPrismaService.$queryRaw.mockRejectedValue('unknown error');

      try {
        await indicator.isHealthy('database');
        fail('Expected HealthCheckError to be thrown');
      } catch (error) {
        expect(error).toBeInstanceOf(HealthCheckError);
        const healthError = error as HealthCheckError;
        expect(healthError.causes).toEqual({
          database: {
            status: 'down',
            message: 'Unknown error',
          },
        });
      }
    });

    it('should timeout after 5 seconds', async () => {
      // Create a promise that never resolves to simulate timeout
      mockPrismaService.$queryRaw = jest.fn().mockReturnValue(
        new Promise((resolve) => {
          setTimeout(resolve, 10000);
        })
      ) as typeof mockPrismaService.$queryRaw;

      const startTime = Date.now();

      await expect(indicator.isHealthy('database')).rejects.toThrow(
        HealthCheckError
      );

      const elapsed = Date.now() - startTime;
      // Should timeout within 6 seconds (5s timeout + buffer)
      expect(elapsed).toBeLessThan(6000);
    }, 10000);

    it('should use the provided key in result', async () => {
      mockPrismaService.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

      const result = await indicator.isHealthy('custom-db-key');

      expect(result).toEqual({
        'custom-db-key': { status: 'up' },
      });
    });
  });
});
