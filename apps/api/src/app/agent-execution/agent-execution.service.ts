import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { createId } from '@paralleldrive/cuid2';
import {
  AgentExecutionResponse,
  AgentExecutionStatus,
  AgentEnrichmentEntry,
  AgentRecommendationsResponse,
  AgentType,
} from '@mentor-ai/shared/types';
import { OpenClawClientService } from './openclaw-client.service';
import { AgentPromptService } from './agent-prompt.service';
import { AgentRecommenderService } from './agent-recommender.service';
import { AgentRegistryService } from './agent-registry.service';
import { BudgetService } from './budget.service';

@Injectable()
export class AgentExecutionService {
  private readonly logger = new Logger(AgentExecutionService.name);
  private readonly MAX_CONCURRENT_PER_TENANT = 3;

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly openClawClient: OpenClawClientService,
    private readonly agentPrompt: AgentPromptService,
    private readonly agentRecommender: AgentRecommenderService,
    private readonly registry: AgentRegistryService,
    private readonly budgetService: BudgetService
  ) {}

  async getRecommendations(
    noteId: string,
    userId: string,
    tenantId: string
  ): Promise<AgentRecommendationsResponse> {
    const note = await this.prisma.note.findFirst({
      where: { id: noteId, tenantId },
    });

    if (!note) {
      throw new NotFoundException(`Note ${noteId} not found`);
    }

    if (!note.userReport) {
      throw new BadRequestException('Task has no completed report');
    }

    const [recommendations, budget] = await Promise.all([
      this.agentRecommender.getRecommendations({
        taskTitle: note.title,
        taskContent: note.content,
        userReport: note.userReport,
        expectedOutcome: note.expectedOutcome,
        tenantId,
        userId,
      }),
      this.budgetService.getDailySpent(tenantId),
    ]);

    const estimatedCost = this.budgetService.getEstimatedCost();

    return {
      noteId: note.id,
      recommendations,
      agentTypes: this.registry.getAllAgentTypeInfos(),
      dailySpentEur: budget.spentEur,
      dailyLimitEur: budget.limitEur,
      canProceed: budget.spentEur + estimatedCost <= budget.limitEur,
    };
  }

  async triggerAgent(
    noteId: string,
    agentType: AgentType,
    userId: string,
    tenantId: string
  ): Promise<{ executionId: string }> {
    // Validate agent type
    const agentDef = this.registry.getAgent(agentType);

    // Verify note
    const note = await this.prisma.note.findFirst({
      where: { id: noteId, tenantId },
    });

    if (!note) {
      throw new NotFoundException(`Note ${noteId} not found`);
    }

    if (!note.userReport) {
      throw new BadRequestException('Task has no completed report');
    }

    // Check OpenClaw config
    if (!this.openClawClient.isConfigured()) {
      throw new BadRequestException('Agent execution is not configured');
    }

    // Check for existing active execution on this note+agentType
    const existingActive = await this.prisma.agentExecution.findFirst({
      where: {
        noteId,
        tenantId,
        agentType,
        status: { in: ['PENDING', 'FORMATTING', 'EXECUTING'] },
      },
    });

    if (existingActive) {
      throw new BadRequestException(`${agentDef.label} is already in progress for this task`);
    }

    // Check budget
    const canSpend = await this.budgetService.canSpend(tenantId);
    if (!canSpend) {
      throw new ForbiddenException('Daily budget exceeded');
    }

    // Check concurrency via DB count (safe across multiple instances)
    const activeCount = await this.prisma.agentExecution.count({
      where: {
        tenantId,
        status: { in: ['PENDING', 'FORMATTING', 'EXECUTING'] },
      },
    });
    if (activeCount >= this.MAX_CONCURRENT_PER_TENANT) {
      throw new BadRequestException(
        `Maximum ${this.MAX_CONCURRENT_PER_TENANT} concurrent agent executions`
      );
    }

    // Create execution record + reserve budget
    const executionId = `agx_${createId()}`;
    const estimatedCost = agentDef.estimatedCostEur;

    await this.prisma.agentExecution.create({
      data: {
        id: executionId,
        tenantId,
        userId,
        noteId,
        status: 'PENDING',
        agentType,
        estimatedCostEur: estimatedCost,
      },
    });

    await this.budgetService.recordSpend(tenantId, estimatedCost);

    this.logger.log({
      message: 'Agent triggered',
      executionId,
      noteId,
      agentType,
      userId,
      tenantId,
      reservedCostEur: estimatedCost,
    });

    // Fire-and-forget async pipeline
    this.executeAgentPipeline(executionId, agentType, note, userId, tenantId, estimatedCost).catch(
      (err) => {
        this.logger.error({
          message: 'Agent pipeline failed unexpectedly',
          executionId,
          agentType,
          error: err.message,
        });
      }
    );

    return { executionId };
  }

  private async executeAgentPipeline(
    executionId: string,
    agentType: AgentType,
    note: {
      id: string;
      title: string;
      content: string;
      userReport: string | null;
      expectedOutcome: string | null;
    },
    userId: string,
    tenantId: string,
    reservedCostEur: number
  ): Promise<void> {
    const openClawAgentId = this.registry.getOpenClawAgentId(agentType);

    try {
      // Step 1: Format task into agent-specific instruction
      await this.updateStatus(executionId, 'FORMATTING');

      const formattedPrompt = await this.agentPrompt.formatPrompt({
        agentType,
        taskTitle: note.title,
        taskContent: note.content,
        userReport: note.userReport!,
        expectedOutcome: note.expectedOutcome,
        tenantId,
        userId,
      });

      await this.prisma.agentExecution.update({
        where: { id: executionId },
        data: { formattedPrompt },
      });

      // Step 2: Send to OpenClaw with the correct agent
      await this.updateStatus(executionId, 'EXECUTING', { startedAt: new Date() });

      const result = await this.openClawClient.executeAgent(formattedPrompt, {
        agentId: openClawAgentId,
      });

      if (!result.success) {
        await this.updateStatus(executionId, 'FAILED', {
          error: result.error ?? 'Agent execution failed',
          completedAt: new Date(),
          durationMs: result.durationMs,
        });
        return;
      }

      // Step 3: Store results in Note.agentEnrichments JSON (atomic merge)
      await this.mergeEnrichment(note.id, agentType, {
        executionId,
        status: AgentExecutionStatus.COMPLETED,
        result: result.output,
        completedAt: new Date().toISOString(),
        error: null,
      });

      // Step 4: Calculate cost and adjust budget
      const actualCost = this.estimateActualCost(result.usage);
      const costDifference = actualCost - reservedCostEur;
      if (Math.abs(costDifference) > 0.0001) {
        await this.budgetService.recordSpend(tenantId, costDifference);
      }

      // Step 5: Mark completed
      await this.prisma.agentExecution.update({
        where: { id: executionId },
        data: {
          status: 'COMPLETED',
          agentOutput: result.output,
          actualCostEur: actualCost,
          completedAt: new Date(),
          durationMs: result.durationMs,
        },
      });

      this.logger.log({
        message: 'Agent execution completed',
        executionId,
        agentType,
        durationMs: result.durationMs,
        actualCostEur: actualCost,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error({
        message: 'Agent pipeline error',
        executionId,
        agentType,
        error: errorMessage,
      });

      // Store error in enrichments too (atomic merge — safe under concurrency)
      try {
        await this.mergeEnrichment(note.id, agentType, {
          executionId,
          status: AgentExecutionStatus.FAILED,
          result: null,
          completedAt: new Date().toISOString(),
          error: errorMessage,
        });
      } catch {
        /* best-effort */
      }

      await this.updateStatus(executionId, 'FAILED', {
        error: errorMessage,
        completedAt: new Date(),
      });
    } finally {
      // No cleanup needed — concurrency is tracked via DB status
    }
  }

  private async updateStatus(
    executionId: string,
    status: string,
    extra?: Record<string, unknown>
  ): Promise<void> {
    await this.prisma.agentExecution.update({
      where: { id: executionId },
      data: { status, ...extra },
    });
  }

  /**
   * Atomically merges an enrichment entry into Note.agentEnrichments JSON
   * using PostgreSQL jsonb || operator. Prevents race conditions when
   * multiple agents write to the same note concurrently.
   *
   * NOTE: Uses raw SQL intentionally to get atomic JSONB merge semantics.
   * This bypasses Prisma middleware (logging, hooks, @updatedAt).
   * We manually set updated_at to compensate.
   */
  private async mergeEnrichment(
    noteId: string,
    agentType: string,
    entry: AgentEnrichmentEntry
  ): Promise<void> {
    const patch = JSON.stringify({ [agentType]: entry });
    await this.prisma.$executeRaw`
      UPDATE notes
      SET agent_enrichments = COALESCE(agent_enrichments, '{}'::jsonb) || ${patch}::jsonb,
          updated_at = NOW()
      WHERE id = ${noteId}
    `;
  }

  private estimateActualCost(usage?: { input?: number; output?: number; total?: number }): number {
    if (!usage?.total) return this.budgetService.getEstimatedCost();
    const inputCost = ((usage.input ?? 0) / 1_000_000) * 0.27;
    const outputCost = ((usage.output ?? 0) / 1_000_000) * 1.1;
    const fetchCost = 0.03;
    return Math.round((inputCost + outputCost + fetchCost) * 10000) / 10000;
  }

  async getExecution(
    executionId: string,
    tenantId: string
  ): Promise<AgentExecutionResponse | null> {
    const exec = await this.prisma.agentExecution.findFirst({
      where: { id: executionId, tenantId },
    });

    if (!exec) return null;
    return this.mapToResponse(exec);
  }

  async getExecutionsByNote(noteId: string, tenantId: string): Promise<AgentExecutionResponse[]> {
    const executions = await this.prisma.agentExecution.findMany({
      where: { noteId, tenantId },
      orderBy: { createdAt: 'desc' },
    });

    return executions.map((e) => this.mapToResponse(e));
  }

  private readonly VALID_STATUSES = new Set(Object.values(AgentExecutionStatus));

  private mapToResponse(exec: {
    id: string;
    noteId: string;
    resultNoteId: string | null;
    status: string;
    agentType: string;
    estimatedCostEur: unknown;
    actualCostEur: unknown;
    error: string | null;
    durationMs: number | null;
    createdAt: Date;
    completedAt: Date | null;
  }): AgentExecutionResponse {
    let status = exec.status as AgentExecutionStatus;
    if (!this.VALID_STATUSES.has(status)) {
      this.logger.warn({
        message: 'Unknown execution status in DB',
        executionId: exec.id,
        status: exec.status,
      });
      status = AgentExecutionStatus.FAILED;
    }

    return {
      id: exec.id,
      noteId: exec.noteId,
      resultNoteId: exec.resultNoteId,
      status,
      agentType: exec.agentType,
      estimatedCostEur: exec.estimatedCostEur ? Number(exec.estimatedCostEur) : null,
      actualCostEur: exec.actualCostEur ? Number(exec.actualCostEur) : null,
      error: exec.error,
      durationMs: exec.durationMs,
      createdAt: exec.createdAt.toISOString(),
      completedAt: exec.completedAt?.toISOString() ?? null,
    };
  }
}
