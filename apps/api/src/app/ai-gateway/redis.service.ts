import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

/**
 * Service for managing Redis connections and rate limiters using Upstash.
 * Provides a centralized Redis client and factory methods for rate limiters.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly redis: Redis;
  private readonly rateLimiters: Map<string, Ratelimit> = new Map();

  constructor(private readonly configService: ConfigService) {
    const url = this.configService.get<string>('UPSTASH_REDIS_REST_URL');
    const token = this.configService.get<string>('UPSTASH_REDIS_REST_TOKEN');

    if (!url || !token) {
      this.logger.warn({
        message: 'Upstash Redis not configured - rate limiting will be disabled',
      });
      // Create a null Redis instance that will fail gracefully
      this.redis = null as unknown as Redis;
      return;
    }

    this.redis = new Redis({
      url,
      token,
    });

    this.logger.log({
      message: 'Redis client initialized',
      url: url.replace(/\/\/.*@/, '//***@'), // Mask credentials in logs
    });
  }

  /**
   * Checks if Redis is configured and available.
   * @returns True if Redis is configured, false otherwise
   */
  isConfigured(): boolean {
    return this.redis !== null;
  }

  /**
   * Gets the underlying Redis client for direct operations.
   * @returns The Upstash Redis client instance
   */
  getClient(): Redis {
    return this.redis;
  }

  /**
   * Creates or retrieves a cached rate limiter for the given identifier.
   * Uses a sliding window algorithm for smooth rate limiting.
   *
   * @param identifier - Unique identifier for this rate limiter (e.g., 'tenant:tnt_123')
   * @param limit - Maximum number of requests allowed in the window
   * @param windowMs - Window duration in milliseconds
   * @returns A configured Ratelimit instance
   */
  getRateLimiter(
    identifier: string,
    limit: number,
    windowMs: number
  ): Ratelimit | null {
    if (!this.isConfigured()) {
      return null;
    }

    const cacheKey = `${identifier}:${limit}:${windowMs}`;

    if (this.rateLimiters.has(cacheKey)) {
      return this.rateLimiters.get(cacheKey)!;
    }

    // Convert milliseconds to seconds for the window
    const windowSec = Math.ceil(windowMs / 1000);

    const rateLimiter = new Ratelimit({
      redis: this.redis,
      limiter: Ratelimit.slidingWindow(limit, `${windowSec} s`),
      prefix: `ratelimit:${identifier}`,
      analytics: true,
    });

    this.rateLimiters.set(cacheKey, rateLimiter);

    this.logger.debug({
      message: 'Rate limiter created',
      identifier,
      limit,
      windowMs,
    });

    return rateLimiter;
  }

  /**
   * Increments a counter in Redis with optional expiration.
   * Useful for tracking usage over time periods.
   *
   * @param key - The Redis key to increment
   * @param expireMs - Optional expiration time in milliseconds
   * @returns The new value after incrementing
   */
  async increment(key: string, expireMs?: number): Promise<number> {
    if (!this.isConfigured()) {
      return 0;
    }

    const newValue = await this.redis.incr(key);

    if (expireMs && newValue === 1) {
      // Set expiration only on first increment
      await this.redis.pexpire(key, expireMs);
    }

    return newValue;
  }

  /**
   * Gets a value from Redis.
   *
   * @param key - The Redis key to retrieve
   * @returns The value or null if not found
   */
  async get<T>(key: string): Promise<T | null> {
    if (!this.isConfigured()) {
      return null;
    }

    return this.redis.get<T>(key);
  }

  /**
   * Sets a value in Redis with optional expiration.
   *
   * @param key - The Redis key
   * @param value - The value to store
   * @param expireMs - Optional expiration time in milliseconds
   */
  async set<T>(key: string, value: T, expireMs?: number): Promise<void> {
    if (!this.isConfigured()) {
      return;
    }

    if (expireMs) {
      await this.redis.set(key, value, { px: expireMs });
    } else {
      await this.redis.set(key, value);
    }
  }

  /**
   * Deletes a key from Redis.
   *
   * @param key - The Redis key to delete
   */
  async delete(key: string): Promise<void> {
    if (!this.isConfigured()) {
      return;
    }

    await this.redis.del(key);
  }

  /**
   * Cleanup on module destroy.
   */
  async onModuleDestroy(): Promise<void> {
    this.rateLimiters.clear();
    this.logger.log({ message: 'Redis service cleaned up' });
  }
}
