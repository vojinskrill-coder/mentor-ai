import { Injectable, Logger } from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { Prisma } from '@prisma/client';

@Injectable()
export class ExecutionStateService {
  private readonly logger = new Logger(ExecutionStateService.name);

  constructor(private readonly prisma: PlatformPrismaService) {}

  /**
   * Create a new execution record. Returns the execution ID.
   */
  async createExecution(
    tenantId: string,
    userId: string,
    type: string,
    planId?: string,
    conversationId?: string,
    metadata?: Record<string, unknown>
  ): Promise<string> {
    const execution = await this.prisma.execution.create({
      data: {
        tenantId,
        userId,
        type,
        status: 'executing',
        planId: planId ?? null,
        conversationId: conversationId ?? null,
        metadata: (metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
    this.logger.log({ message: 'Execution created', executionId: execution.id, type, tenantId });
    return execution.id;
  }

  /**
   * Update execution status, optionally setting result or error.
   */
  async updateStatus(
    executionId: string,
    status: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    result?: any,
    error?: string | null
  ): Promise<void> {
    await this.prisma.execution.update({
      where: { id: executionId },
      data: {
        status,
        ...(result !== undefined && result !== null
          ? { result: result as Prisma.InputJsonValue }
          : {}),
        ...(error !== undefined ? { error } : {}),
      },
    });
    this.logger.log({ message: 'Execution status updated', executionId, status });
  }

  /**
   * Update checkpoint data for resume capability.
   */
  async updateCheckpoint(
    executionId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    checkpoint: any
  ): Promise<void> {
    await this.prisma.execution.update({
      where: { id: executionId },
      data: { checkpoint: checkpoint as Prisma.InputJsonValue },
    });
  }

  /**
   * Append an event to the journal. Fire-and-forget safe — errors are logged but not thrown.
   */
  async appendEvent(
    executionId: string,
    eventName: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload: any
  ): Promise<void> {
    await this.prisma.executionEvent.create({
      data: {
        executionId,
        eventName,
        payload: payload as Prisma.InputJsonValue,
      },
    });
  }

  /**
   * Get events for an execution since a given timestamp, with tenant ownership verification.
   * Returns empty array if the execution does not belong to the specified tenant.
   */
  async getEventsSince(executionId: string, since: Date, tenantId: string) {
    // Verify execution belongs to this tenant before returning events
    const execution = await this.prisma.execution.findFirst({
      where: { id: executionId, tenantId },
      select: { id: true },
    });
    if (!execution) {
      return [];
    }

    return this.prisma.executionEvent.findMany({
      where: {
        executionId,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Get active (executing or pending) executions for a specific tenant.
   */
  async getActiveExecutions(tenantId: string) {
    return this.prisma.execution.findMany({
      where: {
        tenantId,
        status: { in: ['executing', 'pending'] },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * SYSTEM-ONLY: Get ALL active executions across all tenants for server restart recovery.
   * Must NOT be called from user-facing code paths.
   */
  async getAllActiveExecutions() {
    return this.prisma.execution.findMany({
      where: {
        status: { in: ['executing', 'pending'] },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Get executions that completed after a given timestamp (for "completed while away" display).
   */
  async getRecentCompletions(tenantId: string, since: Date) {
    return this.prisma.execution.findMany({
      where: {
        tenantId,
        status: { in: ['completed', 'failed'] },
        updatedAt: { gte: since },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  /**
   * Find an execution by its planId, scoped to a specific tenant.
   */
  async getByPlanId(planId: string, tenantId: string) {
    const execution = await this.prisma.execution.findUnique({
      where: { planId },
    });
    // Defense-in-depth: verify tenant ownership (findUnique can't filter by non-unique field)
    if (execution && execution.tenantId !== tenantId) {
      return null;
    }
    return execution;
  }

  /**
   * Find stale executions for a specific tenant (stuck in executing state for too long).
   */
  async getStaleExecutions(tenantId: string, olderThanMinutes: number) {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
    return this.prisma.execution.findMany({
      where: {
        tenantId,
        status: 'executing',
        updatedAt: { lt: cutoff },
      },
    });
  }

  /**
   * SYSTEM-ONLY: Find stale executions across ALL tenants for server restart recovery.
   * Must NOT be called from user-facing code paths.
   */
  async getAllStaleExecutions(olderThanMinutes: number) {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
    return this.prisma.execution.findMany({
      where: {
        status: 'executing',
        updatedAt: { lt: cutoff },
      },
    });
  }

  /**
   * SYSTEM-ONLY: Delete old event journal entries across all tenants for cleanup.
   * This is an administrative housekeeping operation. ExecutionEvents inherit
   * tenant scope through the Execution FK. Age-based pruning is tenant-agnostic by design.
   */
  async pruneOldEvents(olderThanDays: number): Promise<number> {
    const cutoff = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);
    const result = await this.prisma.executionEvent.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    if (result.count > 0) {
      this.logger.log({ message: 'Pruned old execution events', count: result.count });
    }
    return result.count;
  }
}
