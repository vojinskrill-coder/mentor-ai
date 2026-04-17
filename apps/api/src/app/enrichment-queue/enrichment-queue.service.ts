import { Injectable, Logger } from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { InvalidStateTransitionError } from './enrichment-queue.error';

/** Local enum — avoids depending on @prisma/client generate */
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

const VALID_TRANSITIONS: Record<string, string[]> = {
  [EnrichmentStatus.QUEUED]: [EnrichmentStatus.DISPATCHED],
  [EnrichmentStatus.DISPATCHED]: [EnrichmentStatus.EXECUTING, EnrichmentStatus.FAILED],
  [EnrichmentStatus.EXECUTING]: [EnrichmentStatus.VALIDATING, EnrichmentStatus.FAILED],
  [EnrichmentStatus.VALIDATING]: [
    EnrichmentStatus.COMPLETED,
    EnrichmentStatus.CORRECTING,
    EnrichmentStatus.FAILED,
  ],
  [EnrichmentStatus.CORRECTING]: [
    EnrichmentStatus.VALIDATING,
    EnrichmentStatus.FAILED,
    EnrichmentStatus.PERMANENTLY_FAILED,
  ],
  [EnrichmentStatus.FAILED]: [EnrichmentStatus.QUEUED],
  [EnrichmentStatus.COMPLETED]: [],
  [EnrichmentStatus.PERMANENTLY_FAILED]: [],
};

export interface EnrichmentEntry {
  id: string;
  tenantId: string;
  conceptSlug: string;
  status: EnrichmentStatus;
  retryCount: number;
  maxRetries: number;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class EnrichmentQueueService {
  private readonly logger = new Logger(EnrichmentQueueService.name);

  constructor(private readonly prisma: PlatformPrismaService) {}

  private get queue() {
    return (this.prisma as any).enrichmentQueue;
  }

  async enqueue(
    tenantId: string,
    conceptSlug: string,
    maxRetries = 5,
  ): Promise<EnrichmentEntry> {
    return this.queue.create({
      data: {
        tenantId,
        conceptSlug,
        status: EnrichmentStatus.QUEUED,
        retryCount: 0,
        maxRetries,
      },
    });
  }

  async enqueueBatch(
    tenantId: string,
    conceptSlugs: string[],
    maxRetries = 5,
  ): Promise<number> {
    const result = await this.queue.createMany({
      data: conceptSlugs.map((slug) => ({
        tenantId,
        conceptSlug: slug,
        status: EnrichmentStatus.QUEUED,
        retryCount: 0,
        maxRetries,
      })),
    });
    this.logger.log(`Enqueued ${result.count} entries for tenant ${tenantId}`);
    return result.count;
  }

  async dequeue(tenantId: string): Promise<EnrichmentEntry | null> {
    // Use raw query for FOR UPDATE SKIP LOCKED
    const entries = await this.prisma.$queryRawUnsafe<EnrichmentEntry[]>(
      `UPDATE "enrichment_queue"
       SET status = $1, "updatedAt" = NOW()
       WHERE id = (
         SELECT id FROM "enrichment_queue"
         WHERE "tenantId" = $2 AND status = $3
         ORDER BY "createdAt" ASC
         LIMIT 1
         FOR UPDATE SKIP LOCKED
       )
       RETURNING *`,
      EnrichmentStatus.DISPATCHED,
      tenantId,
      EnrichmentStatus.QUEUED,
    );
    return entries.length > 0 ? (entries[0] ?? null) : null;
  }

  async markExecuting(entryId: string): Promise<EnrichmentEntry> {
    return this.transition(entryId, EnrichmentStatus.EXECUTING);
  }

  async markValidating(entryId: string): Promise<EnrichmentEntry> {
    return this.transition(entryId, EnrichmentStatus.VALIDATING);
  }

  async markCompleted(entryId: string): Promise<EnrichmentEntry> {
    return this.transition(entryId, EnrichmentStatus.COMPLETED);
  }

  async markCorrecting(entryId: string): Promise<EnrichmentEntry> {
    return this.transition(entryId, EnrichmentStatus.CORRECTING);
  }

  async markBackToValidating(entryId: string): Promise<EnrichmentEntry> {
    return this.transition(entryId, EnrichmentStatus.VALIDATING);
  }

  async markFailed(
    entryId: string,
    errorMessage: string,
  ): Promise<EnrichmentEntry> {
    const entry = await this.getEntry(entryId);
    if (!entry) throw new Error(`Entry ${entryId} not found`);

    const isPermanent = entry.retryCount >= entry.maxRetries;
    const targetStatus = isPermanent
      ? EnrichmentStatus.PERMANENTLY_FAILED
      : EnrichmentStatus.FAILED;

    return this.queue.update({
      where: { id: entryId },
      data: {
        status: targetStatus,
        errorMessage,
        retryCount: { increment: 1 },
        updatedAt: new Date(),
      },
    });
  }

  async retryFailed(tenantId: string): Promise<number> {
    const result = await this.queue.updateMany({
      where: {
        tenantId,
        status: EnrichmentStatus.FAILED,
      },
      data: {
        status: EnrichmentStatus.QUEUED,
        updatedAt: new Date(),
      },
    });
    this.logger.log(`Retried ${result.count} failed entries for tenant ${tenantId}`);
    return result.count;
  }

  async getQueueStats(tenantId: string): Promise<Record<string, number>> {
    const entries = await this.queue.groupBy({
      by: ['status'],
      where: { tenantId },
      _count: true,
    });
    const stats: Record<string, number> = {};
    for (const entry of entries) {
      stats[entry.status] = entry._count;
    }
    return stats;
  }

  async getEntry(entryId: string): Promise<EnrichmentEntry | null> {
    return this.queue.findUnique({ where: { id: entryId } });
  }

  private async transition(
    entryId: string,
    targetStatus: EnrichmentStatus,
  ): Promise<EnrichmentEntry> {
    const entry = await this.getEntry(entryId);
    if (!entry) throw new Error(`Entry ${entryId} not found`);

    const allowed = VALID_TRANSITIONS[entry.status] || [];
    if (!allowed.includes(targetStatus)) {
      throw new InvalidStateTransitionError(
        entryId,
        entry.status,
        targetStatus,
      );
    }

    return this.queue.update({
      where: { id: entryId },
      data: { status: targetStatus, updatedAt: new Date() },
    });
  }
}
