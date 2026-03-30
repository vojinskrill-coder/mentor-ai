import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { CronExpressionParser } from 'cron-parser';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { ProcessExecutorService } from './process-executor.service';

interface ScheduledWorkflow {
  workflowId: string;
  tenantId: string;
  cronSchedule: string;
  intervalHandle: ReturnType<typeof setInterval>;
}

@Injectable()
export class ProcessSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProcessSchedulerService.name);
  private readonly scheduled = new Map<string, ScheduledWorkflow>();

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly executor: ProcessExecutorService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.loadScheduledWorkflows();
  }

  onModuleDestroy(): void {
    this.clearAll();
  }

  /**
   * Load all active workflows with cron schedules and register them
   */
  async loadScheduledWorkflows(): Promise<void> {
    const workflows = await this.prisma.processWorkflow.findMany({
      where: {
        isActive: true,
        cronSchedule: { not: null },
      },
      select: {
        id: true,
        tenantId: true,
        cronSchedule: true,
        name: true,
      },
    });

    for (const wf of workflows) {
      if (wf.cronSchedule) {
        this.schedule(wf.id, wf.tenantId, wf.cronSchedule);
      }
    }

    this.logger.log(`Loaded ${workflows.length} scheduled workflows`);
  }

  /**
   * Register a workflow for cron-based execution
   */
  schedule(workflowId: string, tenantId: string, cronSchedule: string): void {
    // Remove existing schedule if any
    this.unschedule(workflowId);

    // Validate cron expression
    try {
      CronExpressionParser.parse(cronSchedule);
    } catch (err) {
      this.logger.error(`Invalid cron expression "${cronSchedule}" for workflow ${workflowId}: ${err}`);
      return;
    }

    // Check immediately on registration, then every 60 seconds (F12: fixes first-minute miss)
    this.checkAndTrigger(workflowId, tenantId, cronSchedule);
    const intervalHandle = setInterval(() => {
      this.checkAndTrigger(workflowId, tenantId, cronSchedule);
    }, 60_000);

    this.scheduled.set(workflowId, {
      workflowId,
      tenantId,
      cronSchedule,
      intervalHandle,
    });

    this.logger.log(`Scheduled workflow ${workflowId} with cron "${cronSchedule}"`);
  }

  /**
   * Remove a workflow from cron scheduling
   */
  unschedule(workflowId: string): void {
    const existing = this.scheduled.get(workflowId);
    if (existing) {
      clearInterval(existing.intervalHandle);
      this.scheduled.delete(workflowId);
      this.logger.log(`Unscheduled workflow ${workflowId}`);
    }
  }

  /**
   * Clear all scheduled workflows
   */
  private clearAll(): void {
    for (const [, entry] of this.scheduled) {
      clearInterval(entry.intervalHandle);
    }
    this.scheduled.clear();
  }

  /**
   * Check if cron matches current minute and trigger if no active run
   */
  private async checkAndTrigger(
    workflowId: string,
    tenantId: string,
    cronSchedule: string,
  ): Promise<void> {
    try {
      const interval = CronExpressionParser.parse(cronSchedule);
      const prev = interval.prev().toDate();
      const now = new Date();

      // Check if the previous occurrence was within the last 60 seconds
      const diffMs = now.getTime() - prev.getTime();
      if (diffMs > 60_000) return; // Not time yet

      // Check for active run (overlap protection)
      const activeRun = await this.prisma.processRun.findFirst({
        where: {
          workflowId,
          status: { in: ['RUNNING', 'WAITING_APPROVAL'] },
        },
      });

      if (activeRun) {
        this.logger.log(`Skipping cron trigger for ${workflowId}: active run exists (${activeRun.id})`);
        return;
      }

      // Trigger new run
      this.logger.log(`Cron trigger for workflow ${workflowId}`);
      await this.executor.startRun(workflowId, tenantId);
    } catch (err) {
      this.logger.error(`Cron check failed for ${workflowId}: ${err}`);
    }
  }
}
