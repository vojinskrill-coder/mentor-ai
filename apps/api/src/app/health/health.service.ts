import { Injectable } from '@nestjs/common';

// Read version from package.json
// eslint-disable-next-line @typescript-eslint/no-require-imports
const packageJson = require('../../../../../package.json');

/**
 * Health status values for the /health endpoint.
 * - healthy: Application is running and responding
 * - degraded: Application running but some non-critical checks failing (reserved for future use)
 * - unhealthy: Application has critical issues (reserved for future use)
 *
 * Note: Currently /health always returns 'healthy' if the app responds.
 * For dependency health, use /health/ready which returns 503 on failures.
 */
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface HealthResponse {
  status: HealthStatus;
  timestamp: string;
  version: string;
  correlationId?: string;
}

export interface LiveResponse {
  status: 'ok';
}

@Injectable()
export class HealthService {
  getVersion(): string {
    return packageJson.version || '0.0.0';
  }

  getTimestamp(): string {
    return new Date().toISOString();
  }
}
