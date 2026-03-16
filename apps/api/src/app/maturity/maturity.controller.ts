import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  Logger,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { CurrentUserPayload } from '../auth/strategies/jwt.strategy';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { MaturityEngineService } from './maturity-engine.service';
import { StalenessDetectorService } from './staleness-detector.service';
import { AutonomousSchedulerService } from './autonomous-scheduler.service';
import {
  MaturityStage,
  MaturityDashboardData,
  StageProgressSummary,
  PrerequisiteCheckResult,
  AutonomousRunResult,
  AutonomousStatusData,
  DigestSummaryItem,
} from '@mentor-ai/shared/types';

@Controller('v1/maturity')
@UseGuards(JwtAuthGuard)
export class MaturityController {
  private readonly logger = new Logger(MaturityController.name);

  constructor(
    private readonly engine: MaturityEngineService,
    private readonly staleness: StalenessDetectorService,
    private readonly scheduler: AutonomousSchedulerService,
    private readonly prisma: PlatformPrismaService
  ) {}

  /**
   * GET /api/v1/maturity/stage — current stage + progress dashboard
   */
  @Get('stage')
  async getCurrentStage(
    @CurrentUser() user: CurrentUserPayload
  ): Promise<{ data: MaturityDashboardData }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { maturityStage: true },
    });

    const currentStage = (tenant?.maturityStage as MaturityStage) || null;

    if (!currentStage) {
      return {
        data: {
          currentStage: null,
          progress: null,
          staleConcepts: [],
        },
      };
    }

    const progress = await this.engine.getStageProgress(user.tenantId, currentStage);

    // Check for stale concepts (batch load instead of N+1)
    const staleResults = await this.staleness.scanStage(user.tenantId, currentStage);

    let staleConcepts: MaturityDashboardData['staleConcepts'] = [];
    if (staleResults.length > 0) {
      const staleConceptIds = staleResults.map((s) => s.conceptId);
      const staleAssignmentIds = staleResults.map((s) => s.assignmentId);

      const [concepts, assignments] = await Promise.all([
        this.prisma.concept.findMany({
          where: { id: { in: staleConceptIds } },
          select: { id: true, name: true },
        }),
        this.prisma.stageConceptAssignment.findMany({
          where: { id: { in: staleAssignmentIds } },
          select: { id: true, completedAt: true },
        }),
      ]);

      const conceptNameMap = new Map(concepts.map((c) => [c.id, c.name]));
      const assignmentMap = new Map(assignments.map((a) => [a.id, a.completedAt]));

      staleConcepts = staleResults.map((s) => ({
        conceptId: s.conceptId,
        conceptName: conceptNameMap.get(s.conceptId) || s.conceptId,
        reason: s.reason,
        completedAt: assignmentMap.get(s.assignmentId)?.toISOString() || '',
      }));
    }

    return {
      data: {
        currentStage,
        progress,
        staleConcepts,
      },
    };
  }

  /**
   * GET /api/v1/maturity/stage/:stage/progress — progress for specific stage
   */
  @Get('stage/:stage/progress')
  async getStageProgress(
    @Param('stage') stage: string,
    @CurrentUser() user: CurrentUserPayload
  ): Promise<{ data: StageProgressSummary }> {
    this.validateStage(stage);
    const progress = await this.engine.getStageProgress(
      user.tenantId,
      stage as MaturityStage
    );
    return { data: progress };
  }

  /**
   * GET /api/v1/maturity/graph — graph visualization data (active concepts + edges + agents)
   */
  @Get('graph')
  async getGraphData(
    @CurrentUser() user: CurrentUserPayload,
    @Query('stage') stageParam?: string
  ) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { maturityStage: true },
    });

    const stage = stageParam || tenant?.maturityStage || 'BASIC';
    this.validateStage(stage);

    const data = await this.engine.getGraphData(user.tenantId, stage as MaturityStage);
    return { data };
  }

  /**
   * POST /api/v1/maturity/stage/:stage/initialize — initialize a stage
   */
  @Post('stage/:stage/initialize')
  async initializeStage(
    @Param('stage') stage: string,
    @CurrentUser() user: CurrentUserPayload
  ): Promise<{ data: { assignmentCount: number } }> {
    this.validateStage(stage);

    // Idempotency guard: return 409 if already initialized
    const existingCount = await this.prisma.stageConceptAssignment.count({
      where: { tenantId: user.tenantId, stage: stage as MaturityStage },
    });
    if (existingCount > 0) {
      throw new HttpException(
        `Stage ${stage} is already initialized with ${existingCount} assignments`,
        HttpStatus.CONFLICT
      );
    }

    this.logger.log({
      message: 'Initializing stage',
      stage,
      tenantId: user.tenantId,
      userId: user.userId,
    });

    const result = await this.engine.initializeStage(
      user.tenantId,
      stage as MaturityStage,
      user.userId
    );

    return { data: result };
  }

  /**
   * GET /api/v1/maturity/execution-status — check if execution is currently running
   * Returns enriched progress data so dashboard can recover state on page load.
   */
  @Get('execution-status')
  async getExecutionStatus(
    @CurrentUser() user: CurrentUserPayload
  ): Promise<{ data: {
    running: boolean; initializing: boolean; pendingCount: number; inProgressCount: number;
    total: number; executed: number; failed: number; currentConceptName: string | null;
  } }> {
    const running = this.engine.isExecutionRunning(user.tenantId);
    const initializing = this.engine.isInitializing(user.tenantId);
    const progress = this.engine.getExecutionProgress(user.tenantId);

    const [pendingCount, inProgressCount] = await Promise.all([
      this.prisma.stageConceptAssignment.count({
        where: { tenantId: user.tenantId, status: 'PENDING', noteId: { not: null } },
      }),
      this.prisma.stageConceptAssignment.count({
        where: { tenantId: user.tenantId, status: 'IN_PROGRESS' },
      }),
    ]);

    return {
      data: {
        running,
        initializing,
        pendingCount,
        inProgressCount,
        total: progress?.total ?? (pendingCount + inProgressCount),
        executed: progress?.executed ?? 0,
        failed: progress?.failed ?? 0,
        currentConceptName: progress?.current ?? null,
      },
    };
  }

  /**
   * POST /api/v1/maturity/stage/:stage/execute — manually trigger task execution
   */
  @Post('stage/:stage/execute')
  async executeStage(
    @Param('stage') stage: string,
    @CurrentUser() user: CurrentUserPayload
  ): Promise<{ data: { started: boolean; pendingCount: number; alreadyRunning: boolean } }> {
    this.validateStage(stage);

    // Check if execution is already running for this tenant
    if (this.engine.isExecutionRunning(user.tenantId)) {
      const pendingCount = await this.prisma.stageConceptAssignment.count({
        where: {
          tenantId: user.tenantId,
          stage: stage as MaturityStage,
          status: { in: ['PENDING', 'IN_PROGRESS'] },
          noteId: { not: null },
        },
      });
      return { data: { started: false, pendingCount, alreadyRunning: true } };
    }

    // Check if there are pending assignments with notes
    const pendingCount = await this.prisma.stageConceptAssignment.count({
      where: {
        tenantId: user.tenantId,
        stage: stage as MaturityStage,
        status: { in: ['PENDING', 'IN_PROGRESS'] },
        noteId: { not: null },
      },
    });

    if (pendingCount === 0) {
      return { data: { started: false, pendingCount: 0, alreadyRunning: false } };
    }

    // Fire-and-forget execution
    this.engine
      .runStageExecution(user.tenantId, stage as MaturityStage, user.userId)
      .catch((err) => {
        this.logger.error({
          message: 'Manual stage execution failed',
          stage,
          tenantId: user.tenantId,
          error: err instanceof Error ? err.message : 'Unknown',
        });
      });

    return { data: { started: true, pendingCount, alreadyRunning: false } };
  }

  /**
   * POST /api/v1/maturity/stage/transition — advance to next stage
   */
  @Post('stage/transition')
  async transitionStage(
    @CurrentUser() user: CurrentUserPayload
  ): Promise<{ data: { newStage: MaturityStage } }> {
    try {
      const result = await this.engine.transitionToNextStage(
        user.tenantId,
        user.userId
      );
      return { data: result };
    } catch (err) {
      throw new HttpException(
        err instanceof Error ? err.message : 'Transition failed',
        HttpStatus.BAD_REQUEST
      );
    }
  }

  /**
   * GET /api/v1/maturity/concept/:conceptId/prerequisites — soft gate check
   */
  @Get('concept/:conceptId/prerequisites')
  async checkPrerequisites(
    @Param('conceptId') conceptId: string,
    @CurrentUser() user: CurrentUserPayload
  ): Promise<{ data: PrerequisiteCheckResult }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { maturityStage: true },
    });

    if (!tenant?.maturityStage) {
      return {
        data: { canProceed: true, warnings: [], prerequisiteOutputs: [] },
      };
    }

    const result = await this.engine.checkPrerequisites(
      user.tenantId,
      conceptId,
      tenant.maturityStage as MaturityStage
    );

    return { data: result };
  }

  /**
   * POST /api/v1/maturity/concept/:conceptId/re-execute — trigger re-execution
   */
  @Post('concept/:conceptId/re-execute')
  async reExecuteConcept(
    @Param('conceptId') conceptId: string,
    @CurrentUser() user: CurrentUserPayload
  ): Promise<{ data: { newNoteId: string; version: number } }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { maturityStage: true },
    });

    if (!tenant?.maturityStage) {
      throw new HttpException('Maturity engine not initialized', HttpStatus.BAD_REQUEST);
    }

    // Guard: check assignment exists and is in a re-executable state
    const assignment = await this.prisma.stageConceptAssignment.findFirst({
      where: {
        tenantId: user.tenantId,
        conceptId,
        stage: tenant.maturityStage as MaturityStage,
      },
      select: { id: true, status: true },
    });

    if (!assignment) {
      throw new HttpException('No assignment found for this concept', HttpStatus.NOT_FOUND);
    }

    if (assignment.status !== 'COMPLETED') {
      throw new HttpException(
        `Cannot re-execute: assignment is in ${assignment.status} state`,
        HttpStatus.CONFLICT
      );
    }

    // Determine staleness reason (or use manual)
    let reason = 'Manual re-execution requested';
    const staleCheck = await this.staleness.checkStaleness(user.tenantId, assignment.id);
    if (staleCheck.reason) {
      reason = staleCheck.reason;
    }

    try {
      const result = await this.staleness.triggerReExecution(
        user.tenantId,
        conceptId,
        reason,
        user.userId,
        tenant.maturityStage as MaturityStage
      );
      return { data: result };
    } catch (err) {
      throw new HttpException(
        err instanceof Error ? err.message : 'Re-execution failed',
        HttpStatus.CONFLICT
      );
    }
  }

  /**
   * GET /api/v1/maturity/staleness — list stale concepts
   */
  @Get('staleness')
  async getStaleConcepts(
    @CurrentUser() user: CurrentUserPayload
  ): Promise<{ data: Array<{ conceptId: string; conceptName: string; reason: string }> }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { maturityStage: true },
    });

    if (!tenant?.maturityStage) {
      return { data: [] };
    }

    const staleResults = await this.staleness.scanStage(
      user.tenantId,
      tenant.maturityStage as MaturityStage
    );

    let data: Array<{ conceptId: string; conceptName: string; reason: string }> = [];
    if (staleResults.length > 0) {
      const conceptIds = staleResults.map((s) => s.conceptId);
      const concepts = await this.prisma.concept.findMany({
        where: { id: { in: conceptIds } },
        select: { id: true, name: true },
      });
      const nameMap = new Map(concepts.map((c) => [c.id, c.name]));

      data = staleResults.map((s) => ({
        conceptId: s.conceptId,
        conceptName: nameMap.get(s.conceptId) || s.conceptId,
        reason: s.reason,
      }));
    }

    return { data };
  }

  /**
   * GET /api/v1/maturity/autonomous/status — scheduler status + last run
   */
  @Get('autonomous/status')
  async getAutonomousStatus(
    @CurrentUser() user: CurrentUserPayload
  ): Promise<{ data: AutonomousStatusData }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { maturityStage: true },
    });

    const enabled = tenant?.maturityStage === 'AUTONOMOUS';

    const recentRuns = await this.prisma.autonomousRun.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { startedAt: 'desc' },
      take: 20,
    });

    const lastRun = recentRuns[0] ?? null;

    return {
      data: {
        enabled,
        lastRun: lastRun
          ? {
              runId: lastRun.id,
              runType: lastRun.runType,
              staleFound: lastRun.staleFound,
              reExecuted: lastRun.reExecuted,
              tasksCompleted: lastRun.tasksCompleted,
              durationMs: lastRun.completedAt
                ? lastRun.completedAt.getTime() - lastRun.startedAt.getTime()
                : 0,
              startedAt: lastRun.startedAt.toISOString(),
              completedAt: lastRun.completedAt?.toISOString() ?? null,
              status: lastRun.status,
            }
          : null,
        recentRuns: recentRuns.map((r) => ({
          runId: r.id,
          runType: r.runType,
          staleFound: r.staleFound,
          reExecuted: r.reExecuted,
          tasksCompleted: r.tasksCompleted,
          durationMs: r.completedAt
            ? r.completedAt.getTime() - r.startedAt.getTime()
            : 0,
          startedAt: r.startedAt.toISOString(),
          completedAt: r.completedAt?.toISOString() ?? null,
          status: r.status,
        })),
      },
    };
  }

  /**
   * POST /api/v1/maturity/autonomous/trigger — manually trigger staleness scan
   */
  @Post('autonomous/trigger')
  async triggerAutonomousRun(
    @CurrentUser() user: CurrentUserPayload
  ): Promise<{ data: AutonomousRunResult }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { maturityStage: true },
    });

    if (tenant?.maturityStage !== 'AUTONOMOUS') {
      throw new HttpException(
        'Autonomous mode is only available in AUTONOMOUS stage',
        HttpStatus.BAD_REQUEST
      );
    }

    const result = await this.scheduler.runForTenant(user.tenantId, user.userId);
    return { data: result };
  }

  /**
   * GET /api/v1/maturity/autonomous/runs — list recent autonomous runs
   */
  @Get('autonomous/runs')
  async getAutonomousRuns(
    @CurrentUser() user: CurrentUserPayload
  ): Promise<{ data: AutonomousRunResult[] }> {
    const runs = await this.prisma.autonomousRun.findMany({
      where: { tenantId: user.tenantId },
      orderBy: { startedAt: 'desc' },
      take: 20,
    });

    return {
      data: runs.map((r) => ({
        runId: r.id,
        runType: r.runType,
        staleFound: r.staleFound,
        reExecuted: r.reExecuted,
        tasksCompleted: r.tasksCompleted,
        durationMs: r.completedAt
          ? r.completedAt.getTime() - r.startedAt.getTime()
          : 0,
        startedAt: r.startedAt.toISOString(),
        completedAt: r.completedAt?.toISOString() ?? null,
        status: r.status,
      })),
    };
  }

  // ─── GET /digests ───

  @Get('digests')
  async getDigests(
    @CurrentUser() user: CurrentUserPayload,
    @Query('limit') limitStr?: string,
    @Query('offset') offsetStr?: string,
  ): Promise<{ data: DigestSummaryItem[]; total: number }> {
    const limit = Math.min(Math.max(parseInt(limitStr || '5', 10) || 5, 1), 20);
    const offset = Math.max(parseInt(offsetStr || '0', 10) || 0, 0);

    const [notes, total] = await Promise.all([
      this.prisma.note.findMany({
        where: { tenantId: user.tenantId, noteType: 'SUMMARY', parentNoteId: null },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: { id: true, title: true, content: true, createdAt: true },
      }),
      this.prisma.note.count({
        where: { tenantId: user.tenantId, noteType: 'SUMMARY', parentNoteId: null },
      }),
    ]);

    return {
      data: notes.map((n) => ({
        id: n.id,
        title: n.title,
        contentPreview: n.content.substring(0, 200) + (n.content.length > 200 ? '...' : ''),
        content: n.content,
        createdAt: n.createdAt.toISOString(),
      })),
      total,
    };
  }

  private validateStage(stage: string): void {
    if (!Object.values(MaturityStage).includes(stage as MaturityStage)) {
      throw new HttpException(
        `Invalid stage: ${stage}. Must be one of: ${Object.values(MaturityStage).join(', ')}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }
}
