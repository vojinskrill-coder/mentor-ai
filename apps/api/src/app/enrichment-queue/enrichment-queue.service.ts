import { Injectable, Logger } from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { InvalidStateTransitionError } from './enrichment-queue.error';

/**
 * Local enum mirroring Prisma's EnrichmentStatus.
 * Used until `prisma generate` runs against the updated schema.
 * Once generated, this can be replaced with the Prisma import.
 */
export enum EnrichmentStatus {
  QUEUED = 'QUEUED',
  DISPATCHED = 'DISPATCHED',
  EXECUTING = 'EXECUTING',
  VALIDATING = 'VALIDATING',
  CORRECTING = 'CORRECTING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  PERMANENTLY_FAILED = 'PERMANENTLY_FAILED',
}

// ── Types ──────────────────────────────────────────────────────

export interface EnrichmentQueueEntry {
  id: string;
  tenantId: string;
  conceptId: string;
  status: EnrichmentStatus;
  attempt: number;
  maxAttempts: number;
  sessionId: string | null;
  dispatchedAt: Date | null;
  completedAt: Date | null;
  failedAt: Date | null;
  error: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface QueueStats {
  QUEUED: number;
  DISPATCHED: number;
  EXECUTING: number;
  VALIDATING: number;
  CORRECTING: number;
  COMPLETED: number;
  FAILED: number;
  PERMANENTLY_FAILED: number;
}

// ── Valid State Transitions ────────────────────────────────────

const VALID_TRANSITIONS: Record<EnrichmentStatus, EnrichmentStatus[]> = {
  [EnrichmentStatus.QUEUED]: [EnrichmentStatus.DISPATCHED],
  [EnrichmentStatus.DISPATCHED]: [EnrichmentStatus.EXECUTING],
  [EnrichmentStatus.EXECUTING]: [EnrichmentStatus.VALIDATING, EnrichmentStatus.FAILED],
  [EnrichmentStatus.VALIDATING]: [
    EnrichmentStatus.COMPLETED,
    EnrichmentStatus.CORRECTING,
    EnrichmentStatus.FAILED,
  ],
  [EnrichmentStatus.CORRECTING]: [EnrichmentStatus.VALIDATING, EnrichmentStatus.FAILED],
  [EnrichmentStatus.COMPLETED]: [],
  [EnrichmentStatus.FAILED]: [EnrichmentStatus.QUEUED], // via retryFailed only
  [EnrichmentStatus.PERMANENTLY_FAILED]: [],
};

// ── Service ────────────────────────────────────────────────────

@Injectable()
export class EnrichmentQueueService {
  private readonly logger = new Logger(EnrichmentQueueService.name);

  constructor(private readonly prisma: PlatformPrismaService) {}

  /**
   * Access the enrichmentQueue model.
   * Cast needed until `prisma generate` runs with the updated schema.
   */
  private get queue() {
    return (this.prisma as any).enrichmentQueue;
  }

  // ── Enqueue ──────────────────────────────────────────────────

  /**
   * Enqueue a single concept for enrichment. Idempotent — if already
   * exists for this tenant+concept, it is a no-op.
   */
  async enqueue(tenantId: string, conceptId: string): Promise<void> {
    await this.queue.upsert({
      where: {
        tenantId_conceptId: { tenantId, conceptId },
      },
      create: {
        tenantId,
        conceptId,
        status: EnrichmentStatus.QUEUED,
      },
      update: {}, // no-op if exists
    });
  }

  /**
   * Enqueue multiple concepts in a single transaction.
   * Each insert is idempotent (skipDuplicates).
   */
  async enqueueBatch(tenantId: string, conceptIds: string[]): Promise<void> {
    await this.queue.createMany({
      data: conceptIds.map((conceptId) => ({
        tenantId,
        conceptId,
        status: EnrichmentStatus.QUEUED,
      })),
      skipDuplicates: true,
    });
  }

  // ── Dequeue ──────────────────────────────────────────────────

  /**
   * Atomically dequeue the next QUEUED entry for the given tenant.
   * Uses FOR UPDATE SKIP LOCKED for safe concurrent access.
   * Returns null if the queue is empty.
   */
  async dequeue(tenantId: string): Promise<EnrichmentQueueEntry | null> {
    const rows = await this.prisma.$queryRaw<EnrichmentQueueEntry[]>`
      UPDATE enrichment_queue
      SET status = ${EnrichmentStatus.DISPATCHED}::"EnrichmentStatus",
          dispatched_at = NOW(),
          updated_at = NOW()
      WHERE id = (
        SELECT id FROM enrichment_queue
        WHERE tenant_id = ${tenantId}
          AND status = ${EnrichmentStatus.QUEUED}::"EnrichmentStatus"
        ORDER BY created_at ASC
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *
    `;

    if (!rows || rows.length === 0) {
      return null;
    }

    return rows[0] ?? null;
  }

  // ── State Transitions ────────────────────────────────────────

  /** DISPATCHED -> EXECUTING */
  async markExecuting(id: string): Promise<void> {
    await this.transition(id, EnrichmentStatus.DISPATCHED, EnrichmentStatus.EXECUTING);
  }

  /** EXECUTING -> VALIDATING */
  async markValidating(id: string): Promise<void> {
    await this.transition(id, EnrichmentStatus.EXECUTING, EnrichmentStatus.VALIDATING);
  }

  /** VALIDATING -> COMPLETED */
  async markCompleted(id: string): Promise<void> {
    await this.transition(id, EnrichmentStatus.VALIDATING, EnrichmentStatus.COMPLETED, {
      completedAt: new Date(),
    });
  }

  /** VALIDATING -> CORRECTING */
  async markCorrecting(id: string): Promise<void> {
    await this.transition(id, EnrichmentStatus.VALIDATING, EnrichmentStatus.CORRECTING);
  }

  /** CORRECTING -> VALIDATING */
  async markBackToValidating(id: string): Promise<void> {
    await this.transition(id, EnrichmentStatus.CORRECTING, EnrichmentStatus.VALIDATING);
  }

  /**
   * Move any active status -> FAILED. Increments the attempt counter.
   * If attempt >= maxAttempts, moves to PERMANENTLY_FAILED instead.
   */
  async markFailed(id: string, error: string): Promise<void> {
    const entry = await this.queue.findUnique({ where: { id } });
    if (!entry) {
      throw new Error(`EnrichmentQueue entry ${id} not found`);
    }

    const allowedFrom: EnrichmentStatus[] = [
      EnrichmentStatus.EXECUTING,
      EnrichmentStatus.VALIDATING,
      EnrichmentStatus.CORRECTING,
    ];

    if (!allowedFrom.includes(entry.status)) {
      throw new InvalidStateTransitionError(entry.status, EnrichmentStatus.FAILED, id);
    }

    const newAttempt = entry.attempt + 1;
    const finalStatus =
      newAttempt >= entry.maxAttempts
        ? EnrichmentStatus.PERMANENTLY_FAILED
        : EnrichmentStatus.FAILED;

    await this.queue.update({
      where: { id },
      data: {
        status: finalStatus,
        attempt: newAttempt,
        failedAt: new Date(),
        error,
      },
    });
  }

  // ── Retry ────────────────────────────────────────────────────

  /**
   * Re-enqueue FAILED entries (not PERMANENTLY_FAILED) where
   * attempt < maxAttempts. Returns count of re-enqueued entries.
   */
  async retryFailed(tenantId: string): Promise<number> {
    const result = await this.queue.updateMany({
      where: {
        tenantId,
        status: EnrichmentStatus.FAILED,
        attempt: { lt: 3 }, // safety — also checked by markFailed
      },
      data: {
        status: EnrichmentStatus.QUEUED,
        error: null,
        failedAt: null,
      },
    });
    return result.count;
  }

  // ── Query ────────────────────────────────────────────────────

  /** Count entries per status for a given tenant. */
  async getQueueStats(tenantId: string): Promise<QueueStats> {
    const counts = await this.queue.groupBy({
      by: ['status'],
      where: { tenantId },
      _count: true,
    });

    const stats: QueueStats = {
      QUEUED: 0,
      DISPATCHED: 0,
      EXECUTING: 0,
      VALIDATING: 0,
      CORRECTING: 0,
      COMPLETED: 0,
      FAILED: 0,
      PERMANENTLY_FAILED: 0,
    };

    for (const row of counts) {
      stats[row.status as EnrichmentStatus] = (row as any)._count;
    }

    return stats;
  }

  /** Get a single entry by ID. */
  async getEntry(id: string): Promise<EnrichmentQueueEntry | null> {
    return this.queue.findUnique({ where: { id } });
  }

  // ── Internal ─────────────────────────────────────────────────

  /**
   * Validate and execute a state transition.
   * Throws InvalidStateTransitionError if the transition is not allowed.
   */
  private async transition(
    id: string,
    expectedFrom: EnrichmentStatus,
    to: EnrichmentStatus,
    extra: Record<string, unknown> = {},
  ): Promise<void> {
    const entry = await this.queue.findUnique({ where: { id } });
    if (!entry) {
      throw new Error(`EnrichmentQueue entry ${id} not found`);
    }

    if (entry.status !== expectedFrom) {
      throw new InvalidStateTransitionError(entry.status, to, id);
    }

    const allowed = VALID_TRANSITIONS[expectedFrom];
    if (!allowed.includes(to)) {
      throw new InvalidStateTransitionError(expectedFrom, to, id);
    }

    await this.queue.update({
      where: { id },
      data: { status: to, ...extra },
    });
  }
}
