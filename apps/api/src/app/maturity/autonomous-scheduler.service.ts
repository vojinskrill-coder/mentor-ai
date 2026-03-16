import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import type { MaturityStage, AutonomousRunResult } from '@mentor-ai/shared/types';
import { StalenessDetectorService } from './staleness-detector.service';
import { MaturityEngineService } from './maturity-engine.service';
import { HeadlessExecutorService } from './headless-executor.service';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import { WsServerHolder } from './ws-server-holder.service';
import { createId } from '@paralleldrive/cuid2';

/**
 * Autonomous scheduler — runs cron jobs for tenants in AUTONOMOUS stage.
 *
 * - Daily staleness scan (2:00 AM) — detect + re-execute stale concepts
 * - Weekly KPI monitor (Monday 3:00 AM) — refresh key metrics
 * - Weekly digest (Monday 9:00 AM) — LLM-generated summary report
 */
@Injectable()
export class AutonomousSchedulerService {
  private readonly logger = new Logger(AutonomousSchedulerService.name);

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly staleness: StalenessDetectorService,
    private readonly maturityEngine: MaturityEngineService,
    private readonly headlessExecutor: HeadlessExecutorService,
    private readonly aiGateway: AiGatewayService,
    private readonly wsHolder: WsServerHolder
  ) {}

  // ── Daily staleness scan — 2:00 AM ──

  @Cron('0 2 * * *')
  async dailyStalenessRun(): Promise<void> {
    const tenants = await this.getAutonomousTenants();
    if (tenants.length === 0) return;

    this.logger.log({ message: 'Daily staleness scan starting', tenantCount: tenants.length });

    for (const tenant of tenants) {
      try {
        await this.runStalenessForTenant(tenant.id, 'system');
      } catch (err) {
        this.logger.error({
          message: 'Daily staleness scan failed for tenant',
          tenantId: tenant.id,
          error: err instanceof Error ? err.message : 'Unknown',
        });
      }
    }
  }

  // ── Weekly KPI monitoring — Monday 3:00 AM ──

  @Cron('0 3 * * 1')
  async weeklyKpiMonitor(): Promise<void> {
    const tenants = await this.getAutonomousTenants();
    if (tenants.length === 0) return;

    this.logger.log({ message: 'Weekly KPI monitor starting', tenantCount: tenants.length });

    for (const tenant of tenants) {
      const run = await this.createRun(tenant.id, 'kpi_monitor');
      try {
        // Find recently completed concepts with high-value data that might be outdated
        const recentCompletions = await this.prisma.stageConceptAssignment.findMany({
          where: {
            tenantId: tenant.id,
            stage: 'AUTONOMOUS' as MaturityStage,
            status: 'COMPLETED',
            completedAt: {
              // Completed in the last 30 days
              gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            },
          },
          take: 5,
          orderBy: { completedAt: 'desc' },
        });

        if (recentCompletions.length === 0) {
          await this.completeRun(run.id, { staleFound: 0, reExecuted: 0, tasksCompleted: 0 });
          continue;
        }

        // For each, check if the concept's data might need refreshing
        let refreshed = 0;
        for (const assignment of recentCompletions) {
          const staleCheck = await this.staleness.checkStaleness(tenant.id, assignment.id);
          if (staleCheck.isStale) {
            await this.staleness.triggerReExecution(
              tenant.id,
              assignment.conceptId,
              `KPI monitoring: ${staleCheck.reason}`,
              'system',
              'AUTONOMOUS' as MaturityStage
            );
            refreshed++;
          }
        }

        await this.completeRun(run.id, {
          staleFound: refreshed,
          reExecuted: refreshed,
          tasksCompleted: 0,
          resultSummary: `KPI monitor: checked ${recentCompletions.length} concepts, ${refreshed} need refresh`,
        });
      } catch (err) {
        await this.failRun(run.id, err instanceof Error ? err.message : 'Unknown');
      }
    }
  }

  // ── Weekly digest — Monday 9:00 AM ──

  @Cron('0 9 * * 1')
  async weeklyDigest(): Promise<void> {
    const tenants = await this.getAutonomousTenants();
    if (tenants.length === 0) return;

    this.logger.log({ message: 'Weekly digest starting', tenantCount: tenants.length });

    for (const tenant of tenants) {
      const run = await this.createRun(tenant.id, 'weekly_digest');
      try {
        // Gather maturity progress
        const progress = await this.maturityEngine.getStageProgress(
          tenant.id,
          'AUTONOMOUS' as MaturityStage
        );

        // Get recent completed tasks (last 7 days)
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const recentTasks = await this.prisma.note.findMany({
          where: {
            tenantId: tenant.id,
            status: 'COMPLETED',
            updatedAt: { gte: weekAgo },
            noteType: 'TASK',
            parentNoteId: null, // Top-level tasks only
          },
          select: { title: true, aiScore: true, conceptId: true },
          orderBy: { updatedAt: 'desc' },
          take: 20,
        });

        // Get recent autonomous runs
        const recentRuns = await this.prisma.autonomousRun.findMany({
          where: {
            tenantId: tenant.id,
            startedAt: { gte: weekAgo },
          },
          orderBy: { startedAt: 'desc' },
          take: 10,
        });

        const dateStr = new Date().toLocaleDateString('sr-Latn-RS', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });

        // Generate digest via LLM
        const digestPrompt = `Ti si poslovni analitičar. Generiši NEDELJNI IZVEŠTAJ za kompaniju ${tenant.name || 'N/A'}.

MATURITY PROGRES:
- Faza: AUTONOMOUS
- Ukupno koncepata: ${progress.totalAssignments}
- Završeno: ${progress.completed}
- U toku: ${progress.inProgress}
- Progres: ${progress.completionPercent}%

ZAVRŠENI ZADACI (poslednjih 7 dana):
${recentTasks.map((t) => `- ${t.title}${t.aiScore ? ` (ocena: ${t.aiScore}/100)` : ''}`).join('\n') || 'Nema završenih zadataka.'}

AUTONOMNI SKENOVI (poslednjih 7 dana):
${recentRuns.map((r) => `- ${r.runType}: pronađeno ${r.staleFound} zastarelih, re-izvršeno ${r.reExecuted}`).join('\n') || 'Nema skenova.'}

PRAVILA:
1. Piši na srpskom jeziku
2. Strukturiraj sa ## zaglavljima
3. Dodaj sekciju "Preporuke za sledeću nedelju"
4. Budi konkretan — navedi specifične koncepte i brojke
5. Ukupno 300-500 reči`;

        let digestContent = '';
        await this.aiGateway.streamCompletionWithContext(
          [{ role: 'user', content: digestPrompt }],
          { tenantId: tenant.id, userId: 'system', skipRateLimit: true, skipQuotaCheck: true },
          (chunk: string) => {
            digestContent += chunk;
          }
        );

        // Save digest as a note
        // Find a valid userId for this tenant (first user)
        const tenantUser = await this.prisma.user.findFirst({
          where: { tenantId: tenant.id },
          select: { id: true },
        });
        const digestUserId = tenantUser?.id ?? 'system';

        await this.prisma.note.create({
          data: {
            id: `note_${createId()}`,
            title: `Nedeljni izveštaj — ${dateStr}`,
            content: digestContent,
            source: 'MANUAL',
            noteType: 'SUMMARY',
            status: 'COMPLETED',
            userId: digestUserId,
            tenantId: tenant.id,
          },
        });

        // Broadcast notification
        this.wsHolder.emitToTenant(tenant.id, 'autonomous:digest-ready', {
          title: `Nedeljni izveštaj — ${dateStr}`,
          timestamp: new Date().toISOString(),
        });

        await this.completeRun(run.id, {
          staleFound: 0,
          reExecuted: 0,
          tasksCompleted: 1,
          resultSummary: `Weekly digest generated: ${digestContent.substring(0, 200)}...`,
        });
      } catch (err) {
        await this.failRun(run.id, err instanceof Error ? err.message : 'Unknown');
      }
    }
  }

  // ── Manual trigger ──

  async runForTenant(tenantId: string, userId: string): Promise<AutonomousRunResult> {
    return this.runStalenessForTenant(tenantId, userId);
  }

  // ── Private helpers ──

  private async runStalenessForTenant(
    tenantId: string,
    userId: string
  ): Promise<AutonomousRunResult> {
    // Race condition guard: skip if a staleness_scan is already RUNNING for this tenant
    const runningRun = await this.prisma.autonomousRun.findFirst({
      where: { tenantId, runType: 'staleness_scan', status: 'RUNNING' },
      select: { id: true, startedAt: true },
    });

    if (runningRun) {
      const ageMs = Date.now() - runningRun.startedAt.getTime();
      if (ageMs < 30 * 60 * 1000) {
        this.logger.log({
          message: 'Staleness scan already running, skipping',
          tenantId,
          existingRunId: runningRun.id,
        });
        return this.buildRunResult(runningRun.id, 'staleness_scan', Date.now(), {
          staleFound: 0, reExecuted: 0, tasksCompleted: 0,
        });
      }
      // Stuck run (>30 min) — mark as FAILED and proceed
      await this.failRun(runningRun.id, 'Timed out after 30 minutes');
    }

    const startTime = Date.now();
    const run = await this.createRun(tenantId, 'staleness_scan');

    try {
      // Get current stage
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { maturityStage: true },
      });

      if (!tenant?.maturityStage) {
        await this.completeRun(run.id, {
          staleFound: 0,
          reExecuted: 0,
          tasksCompleted: 0,
          resultSummary: 'No maturity stage set',
        });
        return this.buildRunResult(run.id, 'staleness_scan', startTime, {
          staleFound: 0,
          reExecuted: 0,
          tasksCompleted: 0,
        });
      }

      // Scan for stale concepts
      const staleResults = await this.staleness.scanStage(
        tenantId,
        tenant.maturityStage as MaturityStage
      );

      this.logger.log({
        message: 'Staleness scan found results',
        tenantId,
        staleCount: staleResults.length,
      });

      if (staleResults.length === 0) {
        await this.completeRun(run.id, {
          staleFound: 0,
          reExecuted: 0,
          tasksCompleted: 0,
          resultSummary: 'No stale concepts found',
        });
        return this.buildRunResult(run.id, 'staleness_scan', startTime, {
          staleFound: 0,
          reExecuted: 0,
          tasksCompleted: 0,
        });
      }

      // Trigger re-execution for stale concepts → creates new PENDING notes
      const newTasks: Array<{ id: string; conceptId: string | null }> = [];
      for (const stale of staleResults) {
        try {
          const result = await this.staleness.triggerReExecution(
            tenantId,
            stale.conceptId,
            stale.reason,
            userId,
            tenant.maturityStage as MaturityStage
          );
          newTasks.push({ id: result.newNoteId, conceptId: stale.conceptId });
        } catch (err) {
          this.logger.warn({
            message: 'Failed to trigger re-execution for stale concept',
            conceptId: stale.conceptId,
            error: err instanceof Error ? err.message : 'Unknown',
          });
        }
      }

      // Execute new tasks via headless pipeline
      const batchResult = await this.headlessExecutor.executeBatch({
        tasks: newTasks,
        tenantId,
        userId,
        runType: 'autonomous-staleness',
      });

      await this.completeRun(run.id, {
        staleFound: staleResults.length,
        reExecuted: newTasks.length,
        tasksCompleted: batchResult.completed,
        resultSummary: `Found ${staleResults.length} stale, re-executed ${newTasks.length}, completed ${batchResult.completed}`,
      });

      // Broadcast result
      this.wsHolder.emitToTenant(tenantId, 'autonomous:scan-complete', {
        runId: run.id,
        staleFound: staleResults.length,
        reExecuted: newTasks.length,
        tasksCompleted: batchResult.completed,
      });

      return this.buildRunResult(run.id, 'staleness_scan', startTime, {
        staleFound: staleResults.length,
        reExecuted: newTasks.length,
        tasksCompleted: batchResult.completed,
      });
    } catch (err) {
      await this.failRun(run.id, err instanceof Error ? err.message : 'Unknown');
      throw err;
    }
  }

  private async getAutonomousTenants(): Promise<Array<{ id: string; name: string | null }>> {
    return this.prisma.tenant.findMany({
      where: { maturityStage: 'AUTONOMOUS' },
      select: { id: true, name: true },
    });
  }

  private async createRun(tenantId: string, runType: string) {
    return this.prisma.autonomousRun.create({
      data: {
        id: createId(),
        tenantId,
        runType,
        status: 'RUNNING',
      },
    });
  }

  private async completeRun(
    runId: string,
    data: {
      staleFound: number;
      reExecuted: number;
      tasksCompleted: number;
      resultSummary?: string;
    }
  ) {
    return this.prisma.autonomousRun.update({
      where: { id: runId },
      data: {
        status: 'COMPLETED',
        staleFound: data.staleFound,
        reExecuted: data.reExecuted,
        tasksCompleted: data.tasksCompleted,
        resultSummary: data.resultSummary,
        completedAt: new Date(),
      },
    });
  }

  private async failRun(runId: string, error: string) {
    return this.prisma.autonomousRun.update({
      where: { id: runId },
      data: {
        status: 'FAILED',
        error,
        completedAt: new Date(),
      },
    });
  }

  private buildRunResult(
    runId: string,
    runType: string,
    startTime: number,
    data: { staleFound: number; reExecuted: number; tasksCompleted: number }
  ): AutonomousRunResult {
    const now = new Date();
    return {
      runId,
      runType,
      staleFound: data.staleFound,
      reExecuted: data.reExecuted,
      tasksCompleted: data.tasksCompleted,
      durationMs: Date.now() - startTime,
      startedAt: new Date(startTime).toISOString(),
      completedAt: now.toISOString(),
      status: 'COMPLETED',
    };
  }
}
