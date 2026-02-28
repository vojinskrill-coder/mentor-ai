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
   * Get all events for an execution since a given timestamp, ordered chronologically.
   */
  async getEventsSince(executionId: string, since: Date) {
    return this.prisma.executionEvent.findMany({
      where: {
        executionId,
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Get all active (executing or pending) executions for a tenant.
   * Pass '*' for tenantId to get all tenants (used for server restart recovery).
   */
  async getActiveExecutions(tenantId: string) {
    const where: Prisma.ExecutionWhereInput = {
      status: { in: ['executing', 'pending'] },
    };
    if (tenantId !== '*') {
      where.tenantId = tenantId;
    }
    return this.prisma.execution.findMany({
      where,
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
   * Find an execution by its planId.
   */
  async getByPlanId(planId: string) {
    return this.prisma.execution.findUnique({
      where: { planId },
    });
  }

  /**
   * Find stale executions (stuck in executing state for too long).
   */
  async getStaleExecutions(olderThanMinutes: number) {
    const cutoff = new Date(Date.now() - olderThanMinutes * 60 * 1000);
    return this.prisma.execution.findMany({
      where: {
        status: 'executing',
        updatedAt: { lt: cutoff },
      },
    });
  }

  /**
   * Delete old event journal entries for cleanup.
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
