import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from './redis.service';
import { createId } from '@paralleldrive/cuid2';
import {
  CircuitBreakerState,
  CircuitBreakerStatus,
  CircuitBreakerEvent,
} from '@mentor-ai/shared/types';

// Re-export shared types for backward compatibility
export { CircuitBreakerState, CircuitBreakerStatus, CircuitBreakerEvent };

/**
 * Service for implementing circuit breaker pattern for LLM providers.
 * Prevents cascading failures by temporarily blocking requests to failing providers.
 *
 * State transitions:
 * - CLOSED → OPEN: After failureThreshold consecutive failures
 * - OPEN → HALF_OPEN: After recoveryTimeout (30 seconds)
 * - HALF_OPEN → CLOSED: On first success
 * - HALF_OPEN → OPEN: On failure
 */
@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);

  /** Number of consecutive failures before opening circuit */
  private readonly failureThreshold = 5;
  /** Time in ms before attempting recovery (30 seconds) */
  private readonly recoveryTimeoutMs = 30 * 1000;
  /** TTL for circuit breaker state in Redis (1 hour) */
  private readonly stateTtlMs = 60 * 60 * 1000;

  /** In-memory fallback for when Redis is unavailable */
  private readonly localState: Map<string, CircuitBreakerStatus> = new Map();

  /** Event listeners for state changes */
  private readonly eventListeners: ((event: CircuitBreakerEvent) => void)[] =
    [];

  constructor(private readonly redisService: RedisService) {}

  /**
   * Checks if requests should be allowed through the circuit.
   *
   * @param providerId - The LLM provider identifier
   * @returns True if the circuit is closed or half-open (allow request)
   */
  async isAllowed(providerId: string): Promise<boolean> {
    const status = await this.getStatus(providerId);

    switch (status.state) {
      case CircuitBreakerState.CLOSED:
        return true;

      case CircuitBreakerState.OPEN:
        // Check if recovery timeout has passed
        if (
          status.openedAt &&
          Date.now() - status.openedAt >= this.recoveryTimeoutMs
        ) {
          await this.transitionTo(
            providerId,
            CircuitBreakerState.HALF_OPEN,
            status
          );
          return true;
        }
        return false;

      case CircuitBreakerState.HALF_OPEN:
        // Only allow one test request at a time
        // In a distributed system, this should use a lock
        return true;
    }
  }

  /**
   * Records a successful request.
   * Resets failure count and closes circuit if half-open.
   *
   * @param providerId - The LLM provider identifier
   * @param correlationId - Optional correlation ID for tracing
   */
  async recordSuccess(
    providerId: string,
    correlationId?: string
  ): Promise<void> {
    const status = await this.getStatus(providerId);

    const newStatus: CircuitBreakerStatus = {
      state: CircuitBreakerState.CLOSED,
      failures: 0,
      lastSuccess: Date.now(),
    };

    if (status.state !== CircuitBreakerState.CLOSED) {
      this.emitEvent(providerId, status.state, newStatus.state, 0, correlationId);
    }

    await this.saveStatus(providerId, newStatus);

    this.logger.debug({
      message: 'Circuit breaker success recorded',
      providerId,
      correlationId,
    });
  }

  /**
   * Records a failed request.
   * Increments failure count and may open circuit.
   *
   * @param providerId - The LLM provider identifier
   * @param correlationId - Optional correlation ID for tracing
   */
  async recordFailure(
    providerId: string,
    correlationId?: string
  ): Promise<void> {
    const status = await this.getStatus(providerId);
    const newFailures = status.failures + 1;

    let newState = status.state;
    let openedAt = status.openedAt;

    // Determine new state based on current state and failures
    switch (status.state) {
      case CircuitBreakerState.CLOSED:
        if (newFailures >= this.failureThreshold) {
          newState = CircuitBreakerState.OPEN;
          openedAt = Date.now();
          this.logger.warn({
            message: 'Circuit breaker opened',
            providerId,
            failures: newFailures,
            correlationId,
          });
        }
        break;

      case CircuitBreakerState.HALF_OPEN:
        // Test request failed, reopen circuit
        newState = CircuitBreakerState.OPEN;
        openedAt = Date.now();
        this.logger.warn({
          message: 'Circuit breaker reopened from half-open',
          providerId,
          correlationId,
        });
        break;

      case CircuitBreakerState.OPEN:
        // Already open, just update failure time
        break;
    }

    const newStatus: CircuitBreakerStatus = {
      state: newState,
      failures: newFailures,
      lastFailure: Date.now(),
      lastSuccess: status.lastSuccess,
      openedAt,
    };

    if (status.state !== newState) {
      this.emitEvent(
        providerId,
        status.state,
        newState,
        newFailures,
        correlationId
      );
    }

    await this.saveStatus(providerId, newStatus);
  }

  /**
   * Gets the current status of a circuit breaker.
   *
   * @param providerId - The LLM provider identifier
   * @returns Current circuit breaker status
   */
  async getStatus(providerId: string): Promise<CircuitBreakerStatus> {
    const key = this.getKey(providerId);

    if (this.redisService.isConfigured()) {
      const cached = await this.redisService.get<CircuitBreakerStatus>(key);
      if (cached) {
        return cached;
      }
    }

    // Check local state
    const local = this.localState.get(providerId);
    if (local) {
      return local;
    }

    // Default to closed
    return {
      state: CircuitBreakerState.CLOSED,
      failures: 0,
    };
  }

  /**
   * Manually resets a circuit breaker to closed state.
   *
   * @param providerId - The LLM provider identifier
   */
  async reset(providerId: string): Promise<void> {
    const status = await this.getStatus(providerId);

    const newStatus: CircuitBreakerStatus = {
      state: CircuitBreakerState.CLOSED,
      failures: 0,
      lastSuccess: Date.now(),
    };

    if (status.state !== CircuitBreakerState.CLOSED) {
      this.emitEvent(
        providerId,
        status.state,
        CircuitBreakerState.CLOSED,
        0
      );
    }

    await this.saveStatus(providerId, newStatus);

    this.logger.log({
      message: 'Circuit breaker manually reset',
      providerId,
    });
  }

  /**
   * Registers a listener for circuit breaker state change events.
   *
   * @param listener - Callback function for events
   */
  onStateChange(listener: (event: CircuitBreakerEvent) => void): void {
    this.eventListeners.push(listener);
  }

  /**
   * Transitions to a new state.
   */
  private async transitionTo(
    providerId: string,
    newState: CircuitBreakerState,
    currentStatus: CircuitBreakerStatus,
    correlationId?: string
  ): Promise<void> {
    const newStatus: CircuitBreakerStatus = {
      ...currentStatus,
      state: newState,
    };

    if (newState === CircuitBreakerState.HALF_OPEN) {
      this.logger.log({
        message: 'Circuit breaker entering half-open state',
        providerId,
        correlationId,
      });
    }

    this.emitEvent(
      providerId,
      currentStatus.state,
      newState,
      currentStatus.failures,
      correlationId
    );

    await this.saveStatus(providerId, newStatus);
  }

  /**
   * Saves the circuit breaker status.
   */
  private async saveStatus(
    providerId: string,
    status: CircuitBreakerStatus
  ): Promise<void> {
    // Always update local state
    this.localState.set(providerId, status);

    // Persist to Redis if available
    if (this.redisService.isConfigured()) {
      const key = this.getKey(providerId);
      await this.redisService.set(key, status, this.stateTtlMs);
    }
  }

  /**
   * Emits a state change event.
   */
  private emitEvent(
    providerId: string,
    previousState: CircuitBreakerState,
    newState: CircuitBreakerState,
    failures: number,
    correlationId?: string
  ): void {
    const event: CircuitBreakerEvent = {
      eventId: `cb_${createId()}`,
      providerId,
      previousState,
      newState,
      failures,
      timestamp: Date.now(),
      correlationId,
    };

    this.logger.log({
      message: 'Circuit breaker state changed',
      eventId: event.eventId,
      providerId,
      previousState,
      newState,
      failures,
      correlationId,
    });

    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (error) {
        this.logger.error({
          message: 'Error in circuit breaker event listener',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
  }

  /**
   * Generates the Redis key for a provider's circuit breaker state.
   */
  private getKey(providerId: string): string {
    return `circuit:${providerId}`;
  }
}
