import { Injectable } from '@nestjs/common';
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from '@nestjs/terminus';

export interface MemoryHealthOptions {
  /**
   * Memory usage threshold (0-1).
   * Default: 0.9 (90%)
   */
  threshold?: number;
}

@Injectable()
export class MemoryHealthIndicator extends HealthIndicator {
  /**
   * Check if memory usage is below the threshold.
   * @param key - The key which will be used for the health indicator result
   * @param options - Memory health check options
   */
  async isHealthy(
    key: string,
    options: MemoryHealthOptions = {}
  ): Promise<HealthIndicatorResult> {
    const threshold = options.threshold ?? 0.9;
    const memoryUsage = process.memoryUsage();
    const heapTotal = memoryUsage.heapTotal;
    const heapUsed = memoryUsage.heapUsed;
    const usageRatio = heapUsed / heapTotal;
    const usagePercent = Math.round(usageRatio * 100);

    const isHealthy = usageRatio < threshold;

    const details = {
      heapUsed: this.formatBytes(heapUsed),
      heapTotal: this.formatBytes(heapTotal),
      usage: `${usagePercent}%`,
      threshold: `${Math.round(threshold * 100)}%`,
    };

    if (isHealthy) {
      return this.getStatus(key, true, details);
    }

    throw new HealthCheckError(
      `Memory usage (${usagePercent}%) exceeds threshold (${Math.round(threshold * 100)}%)`,
      this.getStatus(key, false, details)
    );
  }

  /**
   * Format bytes to human readable string.
   */
  private formatBytes(bytes: number): string {
    const mb = bytes / (1024 * 1024);
    return `${mb.toFixed(2)} MB`;
  }
}
