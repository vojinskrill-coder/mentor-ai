import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from './redis.service';
import { UserRole } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';

/**
 * Priority levels for request queuing.
 * Higher number = higher priority.
 */
export const PRIORITY_MAP: Record<UserRole, number> = {
  [UserRole.TENANT_OWNER]: 3,
  [UserRole.ADMIN]: 2,
  [UserRole.MEMBER]: 1,
};

/**
 * Queued request information.
 */
export interface QueuedRequest {
  id: string;
  tenantId: string;
  userId: string;
  priority: number;
  timestamp: number;
  conversationId?: string;
}

/**
 * Queue position information for WebSocket events.
 */
export interface QueuePosition {
  position: number;
  estimatedWait: number; // seconds
  requestId: string;
}

/**
 * Service for managing AI request queues with priority.
 * Implements a Redis-based priority queue for handling concurrent requests.
 */
@Injectable()
export class RequestQueueService {
  private readonly logger = new Logger(RequestQueueService.name);

  /** Queue timeout in milliseconds (2 minutes) */
  private readonly queueTimeoutMs = 2 * 60 * 1000;
  /** Average processing time per request in seconds */
  private readonly avgProcessingTimeSec = 5;

  constructor(private readonly redisService: RedisService) {}

  /**
   * Adds a request to the queue with priority based on user role.
   *
   * @param tenantId - The tenant identifier
   * @param userId - The user identifier
   * @param userRole - The user's role for priority calculation
   * @param conversationId - Optional conversation ID
   * @returns The queued request information
   */
  async enqueue(
    tenantId: string,
    userId: string,
    userRole: UserRole,
    conversationId?: string
  ): Promise<QueuedRequest> {
    const request: QueuedRequest = {
      id: `req_${createId()}`,
      tenantId,
      userId,
      priority: PRIORITY_MAP[userRole] ?? 1,
      timestamp: Date.now(),
      conversationId,
    };

    if (!this.redisService.isConfigured()) {
      this.logger.debug({
        message: 'Queue disabled - Redis not configured',
        requestId: request.id,
      });
      return request;
    }

    const queueKey = this.getQueueKey(tenantId);

    // Add to sorted set with priority-timestamp score
    // Higher priority items have lower scores for ZRANGEBYSCORE
    const score = this.calculateScore(request.priority, request.timestamp);

    await this.redisService.getClient().zadd(queueKey, {
      score,
      member: JSON.stringify(request),
    });

    // Set queue TTL to cleanup stale queues
    await this.redisService.getClient().expire(queueKey, 3600); // 1 hour

    this.logger.log({
      message: 'Request enqueued',
      requestId: request.id,
      tenantId,
      userId,
      priority: request.priority,
    });

    return request;
  }

  /**
   * Removes a request from the queue after processing.
   *
   * @param request - The request to dequeue
   */
  async dequeue(request: QueuedRequest): Promise<void> {
    if (!this.redisService.isConfigured()) {
      return;
    }

    const queueKey = this.getQueueKey(request.tenantId);
    await this.redisService
      .getClient()
      .zrem(queueKey, JSON.stringify(request));

    this.logger.debug({
      message: 'Request dequeued',
      requestId: request.id,
    });
  }

  /**
   * Gets the queue position for a request.
   *
   * @param request - The queued request
   * @returns Queue position information
   */
  async getPosition(request: QueuedRequest): Promise<QueuePosition> {
    if (!this.redisService.isConfigured()) {
      return {
        position: 0,
        estimatedWait: 0,
        requestId: request.id,
      };
    }

    const queueKey = this.getQueueKey(request.tenantId);
    const score = this.calculateScore(request.priority, request.timestamp);

    // Count how many requests are ahead (lower score = higher priority)
    const position = await this.redisService
      .getClient()
      .zcount(queueKey, '-inf', score - 1);

    return {
      position: position + 1, // 1-indexed
      estimatedWait: position * this.avgProcessingTimeSec,
      requestId: request.id,
    };
  }

  /**
   * Checks if a request has timed out in the queue.
   *
   * @param request - The queued request
   * @returns True if the request has exceeded queue timeout
   */
  isTimedOut(request: QueuedRequest): boolean {
    return Date.now() - request.timestamp > this.queueTimeoutMs;
  }

  /**
   * Gets the next request to process from the queue (highest priority).
   *
   * @param tenantId - The tenant identifier
   * @returns The next request or null if queue is empty
   */
  async getNext(tenantId: string): Promise<QueuedRequest | null> {
    if (!this.redisService.isConfigured()) {
      return null;
    }

    const queueKey = this.getQueueKey(tenantId);

    // Get the lowest score (highest priority) item
    const result = await this.redisService
      .getClient()
      .zrange(queueKey, 0, 0);

    if (!result || result.length === 0) {
      return null;
    }

    try {
      return JSON.parse(result[0] as string) as QueuedRequest;
    } catch {
      return null;
    }
  }

  /**
   * Gets the current queue length for a tenant.
   *
   * @param tenantId - The tenant identifier
   * @returns Number of requests in queue
   */
  async getQueueLength(tenantId: string): Promise<number> {
    if (!this.redisService.isConfigured()) {
      return 0;
    }

    const queueKey = this.getQueueKey(tenantId);
    return this.redisService.getClient().zcard(queueKey);
  }

  /**
   * Cleans up expired requests from the queue.
   *
   * @param tenantId - The tenant identifier
   * @returns Number of expired requests removed
   */
  async cleanupExpired(tenantId: string): Promise<number> {
    if (!this.redisService.isConfigured()) {
      return 0;
    }

    const queueKey = this.getQueueKey(tenantId);
    const cutoffTime = Date.now() - this.queueTimeoutMs;

    // Get all items and filter expired ones
    const allItems = await this.redisService
      .getClient()
      .zrange(queueKey, 0, -1);

    let removedCount = 0;

    for (const item of allItems) {
      try {
        const request = JSON.parse(item as string) as QueuedRequest;
        if (request.timestamp < cutoffTime) {
          await this.redisService
            .getClient()
            .zrem(queueKey, item as string);
          removedCount++;
        }
      } catch {
        // Skip malformed items
      }
    }

    if (removedCount > 0) {
      this.logger.log({
        message: 'Expired requests cleaned up',
        tenantId,
        removedCount,
      });
    }

    return removedCount;
  }

  /**
   * Generates the Redis key for a tenant's queue.
   */
  private getQueueKey(tenantId: string): string {
    return `queue:${tenantId}`;
  }

  /**
   * Calculates the score for sorting.
   * Lower score = higher priority.
   * Within same priority, earlier timestamp = lower score (FIFO).
   */
  private calculateScore(priority: number, timestamp: number): number {
    // Invert priority (higher priority = lower score)
    // Add timestamp to maintain FIFO within same priority
    return (4 - priority) * 1e15 + timestamp;
  }
}
