import { Controller, Get, Headers } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthCheckResult,
} from '@nestjs/terminus';
import { HealthService, HealthResponse, LiveResponse } from './health.service';
import { PrismaHealthIndicator } from './indicators/prisma.health';
import { MemoryHealthIndicator } from './indicators/memory.health';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly healthService: HealthService,
    private readonly prismaHealth: PrismaHealthIndicator,
    private readonly memoryHealth: MemoryHealthIndicator
  ) {}

  /**
   * GET /health
   * Basic health check endpoint returning status, timestamp, and version.
   * Response time should be < 100ms (no blocking operations).
   */
  @Get()
  getHealth(
    @Headers('x-correlation-id') correlationId?: string
  ): HealthResponse {
    return {
      status: 'healthy',
      timestamp: this.healthService.getTimestamp(),
      version: this.healthService.getVersion(),
      ...(correlationId && { correlationId }),
    };
  }

  /**
   * GET /health/ready
   * Readiness probe checking all critical dependencies.
   * Returns 503 if any critical dependency fails.
   *
   * Checks performed:
   * - database: PostgreSQL via Prisma
   * - memory: Heap usage < 90% threshold
   *
   * TODO: Add Redis health indicator when Upstash is configured (Story 1.4 AC2 partial)
   */
  @Get('ready')
  @HealthCheck()
  async getReadiness(
    @Headers('x-correlation-id') correlationId?: string
  ): Promise<HealthCheckResult> {
    const result = await this.health.check([
      () => this.prismaHealth.isHealthy('database'),
      () => this.memoryHealth.isHealthy('memory', { threshold: 0.9 }),
      // TODO: Add Redis check when Upstash is configured
      // () => this.redisHealth.isHealthy('redis'),
    ]);

    // Add correlation ID to response if provided
    if (correlationId) {
      (result as HealthCheckResult & { correlationId?: string }).correlationId =
        correlationId;
    }

    return result;
  }

  /**
   * GET /health/live
   * Liveness probe for Kubernetes.
   * Minimal payload, no external checks.
   */
  @Get('live')
  getLiveness(): LiveResponse {
    return { status: 'ok' };
  }
}
