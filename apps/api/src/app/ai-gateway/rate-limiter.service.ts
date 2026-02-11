import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from './redis.service';
import { RateLimitInfo, RateLimitHeaders } from '@mentor-ai/shared/types';

/**
 * Alias for RateLimitInfo for backward compatibility.
 * @deprecated Use RateLimitInfo from @mentor-ai/shared/types directly.
 */
export type RateLimitResult = RateLimitInfo;

// Re-export shared types for consumers
export type { RateLimitHeaders };

/**
 * Service for enforcing rate limits on AI gateway requests.
 * Implements per-tenant and per-user rate limiting using sliding window algorithm.
 */
@Injectable()
export class RateLimiterService {
  private readonly logger = new Logger(RateLimiterService.name);

  /** Default tenant rate limit: requests per minute */
  private readonly tenantLimitPerMinute: number;
  /** Default user rate limit within tenant: requests per minute */
  private readonly userLimitPerMinute: number;
  /** Window duration in milliseconds (1 minute) */
  private readonly windowMs = 60 * 1000;

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService
  ) {
    this.tenantLimitPerMinute = this.configService.get<number>(
      'RATE_LIMIT_TENANT_PER_MINUTE',
      60
    );
    this.userLimitPerMinute = this.configService.get<number>(
      'RATE_LIMIT_USER_PER_MINUTE',
      20
    );

    this.logger.log({
      message: 'Rate limiter initialized',
      tenantLimitPerMinute: this.tenantLimitPerMinute,
      userLimitPerMinute: this.userLimitPerMinute,
    });
  }

  /**
   * Checks if a request should be allowed based on tenant rate limits.
   *
   * @param tenantId - The tenant identifier (e.g., 'tnt_123')
   * @returns Rate limit result with allowed status and limit info
   */
  async checkTenantLimit(tenantId: string): Promise<RateLimitResult> {
    return this.checkLimit(`tenant:${tenantId}`, this.tenantLimitPerMinute);
  }

  /**
   * Checks if a request should be allowed based on user rate limits within a tenant.
   *
   * @param tenantId - The tenant identifier
   * @param userId - The user identifier (e.g., 'usr_123')
   * @returns Rate limit result with allowed status and limit info
   */
  async checkUserLimit(
    tenantId: string,
    userId: string
  ): Promise<RateLimitResult> {
    return this.checkLimit(
      `user:${tenantId}:${userId}`,
      this.userLimitPerMinute
    );
  }

  /**
   * Checks both tenant and user rate limits.
   * Returns the most restrictive result.
   *
   * @param tenantId - The tenant identifier
   * @param userId - The user identifier
   * @returns The most restrictive rate limit result
   */
  async checkLimits(
    tenantId: string,
    userId: string
  ): Promise<RateLimitResult & { limitType: 'tenant' | 'user' }> {
    const [tenantResult, userResult] = await Promise.all([
      this.checkTenantLimit(tenantId),
      this.checkUserLimit(tenantId, userId),
    ]);

    // If either limit is exceeded, return that result
    if (!tenantResult.allowed) {
      this.logger.warn({
        message: 'Tenant rate limit exceeded',
        tenantId,
        limit: tenantResult.limit,
        remaining: tenantResult.remaining,
      });
      return { ...tenantResult, limitType: 'tenant' };
    }

    if (!userResult.allowed) {
      this.logger.warn({
        message: 'User rate limit exceeded',
        tenantId,
        userId,
        limit: userResult.limit,
        remaining: userResult.remaining,
      });
      return { ...userResult, limitType: 'user' };
    }

    // Return user result as it's typically more restrictive
    return { ...userResult, limitType: 'user' };
  }

  /**
   * Generates rate limit headers for HTTP responses.
   *
   * @param result - The rate limit result
   * @returns Headers object ready to be set on the response
   */
  getHeaders(result: RateLimitResult): RateLimitHeaders {
    const headers: RateLimitHeaders = {
      'X-RateLimit-Limit': String(result.limit),
      'X-RateLimit-Remaining': String(Math.max(0, result.remaining)),
      'X-RateLimit-Reset': String(result.reset),
    };

    if (result.retryAfter !== undefined) {
      headers['Retry-After'] = String(result.retryAfter);
    }

    return headers;
  }

  /**
   * Internal method to check rate limit using Redis.
   */
  private async checkLimit(
    identifier: string,
    limit: number
  ): Promise<RateLimitResult> {
    // If Redis is not configured, allow all requests
    if (!this.redisService.isConfigured()) {
      this.logger.debug({
        message: 'Rate limiting disabled - Redis not configured',
        identifier,
      });
      return {
        allowed: true,
        limit,
        remaining: limit,
        reset: Math.floor(Date.now() / 1000) + 60,
      };
    }

    const rateLimiter = this.redisService.getRateLimiter(
      identifier,
      limit,
      this.windowMs
    );

    if (!rateLimiter) {
      return {
        allowed: true,
        limit,
        remaining: limit,
        reset: Math.floor(Date.now() / 1000) + 60,
      };
    }

    const result = await rateLimiter.limit(identifier);

    const response: RateLimitResult = {
      allowed: result.success,
      limit: result.limit,
      remaining: result.remaining,
      reset: Math.floor(result.reset / 1000), // Convert to Unix timestamp
    };

    if (!result.success) {
      // Calculate retry-after in seconds
      response.retryAfter = Math.ceil((result.reset - Date.now()) / 1000);
    }

    this.logger.debug({
      message: 'Rate limit check',
      identifier,
      allowed: response.allowed,
      remaining: response.remaining,
      limit: response.limit,
    });

    return response;
  }
}
