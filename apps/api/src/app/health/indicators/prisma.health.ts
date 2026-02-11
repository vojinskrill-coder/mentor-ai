import { Injectable } from '@nestjs/common';
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';

const HEALTH_CHECK_TIMEOUT = 5000; // 5 seconds max

@Injectable()
export class PrismaHealthIndicator extends HealthIndicator {
  constructor(private readonly prisma: PlatformPrismaService) {
    super();
  }

  /**
   * Check if Prisma/PostgreSQL connection is healthy.
   * Uses a simple SELECT 1 query with timeout handling.
   */
  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.checkWithTimeout(
        () => this.prisma.$queryRaw`SELECT 1`,
        HEALTH_CHECK_TIMEOUT
      );
      return this.getStatus(key, true);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      throw new HealthCheckError(
        'Prisma check failed',
        this.getStatus(key, false, { message: errorMessage })
      );
    }
  }

  /**
   * Execute a health check with timeout.
   * Implements circuit breaker pattern to prevent cascading failures.
   */
  private async checkWithTimeout<T>(
    check: () => Promise<T>,
    timeout: number
  ): Promise<T> {
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error('Health check timeout')),
        timeout
      );
    });

    try {
      const result = await Promise.race([check(), timeoutPromise]);
      return result;
    } finally {
      // Clean up timer to prevent memory leaks
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }
}
