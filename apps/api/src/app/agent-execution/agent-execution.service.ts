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
  AgentType,
} from '@mentor-ai/shared/types';
import { NoteSource, NoteType, NoteStatus } from '@mentor-ai/shared/prisma';
import { OpenClawClientService } from './openclaw-client.service';
import { AgentPromptService } from './agent-prompt.service';
import { AgentRegistryService } from './agent-registry.service';
import { BudgetService } from './budget.service';
import { AgentExecutionEventBus } from './agent-execution-event-bus.service';
import { NotesService } from '../notes/notes.service';

@Injectable()
export class AgentExecutionService {
  private readonly logger = new Logger(AgentExecutionService.name);
  private readonly MAX_CONCURRENT_PER_TENANT = 5;

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly openClawClient: OpenClawClientService,
    private readonly agentPrompt: AgentPromptService,
    private readonly registry: AgentRegistryService,
    private readonly budgetService: BudgetService,
    private readonly eventBus: AgentExecutionEventBus,
    private readonly notesService: NotesService
  ) {}

  private emitAgentEvent(tenantId: string, eventName: string, payload: unknown): void {
    this.eventBus.emit({ tenantId, eventName, payload });
  }

  private startHeartbeat(
    executionId: string,
    jobId: string | null,
    agentType: string,
    tenantId: string,
    startTime: number
  ): ReturnType<typeof setInterval> {
    return setInterval(() => {
      this.emitAgentEvent(tenantId, 'agent:executing-heartbeat', {
        executionId,
        jobId,
        elapsedMs: Date.now() - startTime,
        agentType,
      });
    }, 5000);
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
      conceptId?: string | null;
      conversationId?: string | null;
    },
    userId: string,
    tenantId: string,
    reservedCostEur: number
  ): Promise<void> {
    const openClawAgentId = this.registry.getOpenClawAgentId(agentType);

    const agentLabel = this.registry.getAgent(agentType).label;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let chunkIndex = 0;

    try {
      // Emit concept activity for graph visualization
      if (note.conceptId) {
        this.emitAgentEvent(tenantId, 'agent:concept-activity', {
          agentType, conceptId: note.conceptId, status: 'started',
        });
      }

      // Step 1: Format task into agent-specific instruction
      await this.updateStatus(executionId, 'FORMATTING');
      this.emitAgentEvent(tenantId, 'agent:status-change', {
        executionId, jobId: null, noteId: note.id, agentType, status: 'FORMATTING',
        label: `${agentLabel}: Priprema instrukcija...`,
      });

      const formattedPrompt = await this.agentPrompt.formatPrompt({
        agentType,
        taskTitle: note.title,
        taskContent: note.content,
        userReport: note.userReport!,
        expectedOutcome: note.expectedOutcome,
        tenantId,
        userId,
        onChunk: (chunk) => {
          this.emitAgentEvent(tenantId, 'agent:formatting-chunk', {
            executionId, jobId: null, chunk, index: chunkIndex++,
          });
        },
      });

      this.emitAgentEvent(tenantId, 'agent:formatting-complete', {
        executionId, jobId: null, promptLength: formattedPrompt.length,
      });

      await this.prisma.agentExecution.update({
        where: { id: executionId },
        data: { formattedPrompt },
      });

      // Step 2: Send to OpenClaw with the correct agent
      await this.updateStatus(executionId, 'EXECUTING', { startedAt: new Date() });
      this.emitAgentEvent(tenantId, 'agent:status-change', {
        executionId, jobId: null, noteId: note.id, agentType, status: 'EXECUTING',
        label: `${agentLabel}: Agent istražuje...`,
      });
      heartbeat = this.startHeartbeat(executionId, null, agentType, tenantId, Date.now());

      const result = await this.openClawClient.executeAgent(formattedPrompt, {
        agentId: openClawAgentId,
        onText: (text) => {
          this.emitAgentEvent(tenantId, 'agent:text-chunk', {
            executionId, jobId: null, text,
          });
        },
        onTool: (tool, status, query) => {
          this.emitAgentEvent(tenantId, 'agent:tool-event', {
            executionId, jobId: null, tool, status, query,
          });
        },
        onStatus: (phase) => {
          this.emitAgentEvent(tenantId, 'agent:status-change', {
            executionId, jobId: null, noteId: note.id, agentType, status: 'EXECUTING',
            label: `${agentLabel}: ${phase === 'running' ? 'Agent istražuje...' : phase}`,
          });
        },
      });

      clearInterval(heartbeat);
      heartbeat = null;

      if (!result.success) {
        const errorMsg = result.error ?? 'Agent execution failed';
        await this.updateStatus(executionId, 'FAILED', {
          error: errorMsg,
          completedAt: new Date(),
          durationMs: result.durationMs,
        });
        this.emitAgentEvent(tenantId, 'agent:status-change', {
          executionId, jobId: null, noteId: note.id, agentType, status: 'FAILED',
          label: `${agentLabel}: Greška`,
        });
        this.emitAgentEvent(tenantId, 'agent:error', {
          executionId, jobId: null, agentType, error: errorMsg,
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

      // Step 3b: Persist agent output as reviewable child note (Sprint 2 Epic 2.3)
      const resultNoteId = await this.createResultNote(
        result.output, agentLabel, note, userId, tenantId, executionId
      );

      // Step 4: Calculate cost and adjust budget
      const actualCost = this.estimateActualCost(result.usage);
      const costDifference = actualCost - reservedCostEur;
      if (Math.abs(costDifference) > 0.0001) {
        await this.budgetService.recordSpend(tenantId, costDifference);
      }

      // Step 5: Mark completed + link result note
      await this.prisma.agentExecution.update({
        where: { id: executionId },
        data: {
          status: 'COMPLETED',
          agentOutput: result.output,
          actualCostEur: actualCost,
          completedAt: new Date(),
          durationMs: result.durationMs,
          resultNoteId,
        },
      });

      this.emitAgentEvent(tenantId, 'agent:status-change', {
        executionId, jobId: null, noteId: note.id, agentType, status: 'COMPLETED',
        label: `${agentLabel}: Završeno`,
      });
      this.emitAgentEvent(tenantId, 'agent:result', {
        executionId, jobId: null, agentType,
        output: result.output, durationMs: result.durationMs,
      });

      this.logger.log({
        message: 'Agent execution completed',
        executionId,
        agentType,
        durationMs: result.durationMs,
        actualCostEur: actualCost,
      });

      // Stop concept activity for graph visualization
      if (note.conceptId) {
        this.emitAgentEvent(tenantId, 'agent:concept-activity', {
          agentType, conceptId: note.conceptId, status: 'stopped',
        });
      }
    } catch (err) {
      if (heartbeat) clearInterval(heartbeat);

      // Stop concept activity on failure too
      if (note.conceptId) {
        this.emitAgentEvent(tenantId, 'agent:concept-activity', {
          agentType, conceptId: note.conceptId, status: 'stopped',
        });
      }

      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error({
        message: 'Agent pipeline error',
        executionId,
        agentType,
        error: errorMessage,
      });

      this.emitAgentEvent(tenantId, 'agent:status-change', {
        executionId, jobId: null, noteId: note.id, agentType, status: 'FAILED',
        label: `${agentLabel}: Greška`,
      });
      this.emitAgentEvent(tenantId, 'agent:error', {
        executionId, jobId: null, agentType, error: errorMessage,
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

  /** Creates a child note for an agent/job result, returning the new note ID or null on failure. */
  private async createResultNote(
    output: string,
    agentLabel: string,
    note: { id: string; title: string; conceptId?: string | null; conversationId?: string | null },
    userId: string,
    tenantId: string,
    executionId: string,
    jobId?: string
  ): Promise<string | null> {
    if (!output) return null;
    try {
      const existingSteps = await this.prisma.note.count({
        where: { parentNoteId: note.id, tenantId },
      });
      const childNote = await this.notesService.createNote({
        title: `${agentLabel}: ${note.title}`,
        content: output,
        source: NoteSource.CONVERSATION,
        noteType: NoteType.AGENT_RESEARCH,
        status: NoteStatus.READY_FOR_REVIEW,
        parentNoteId: note.id,
        workflowStepNumber: existingSteps + 1,
        conceptId: note.conceptId ?? undefined,
        conversationId: note.conversationId ?? undefined,
        userId,
        tenantId,
      });
      this.logger.debug({
        message: 'Agent result persisted as child note',
        executionId,
        jobId,
        resultNoteId: childNote.id,
        parentNoteId: note.id,
      });
      return childNote.id;
    } catch (noteErr) {
      this.logger.warn({
        message: 'Failed to create child note for agent result',
        executionId,
        jobId,
        error: noteErr instanceof Error ? noteErr.message : 'Unknown',
      });
      return null;
    }
  }

  // --- Agent Job Pipeline ---

  async executeJob(
    jobId: string,
    userId: string,
    tenantId: string
  ): Promise<{ jobId: string; executionId: string }> {
    // Load and validate job
    const job = await this.prisma.agentJob.findFirst({
      where: { id: jobId, tenantId },
    });

    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }
    if (job.status !== 'PLANNED') {
      throw new BadRequestException(`Job is already ${job.status.toLowerCase()}`);
    }

    // Check dependencies are in terminal state (COMPLETED or FAILED)
    // Block only on actively running deps — FAILED deps are allowed (context will exclude them)
    if (job.dependsOn.length > 0) {
      const depJobs = await this.prisma.agentJob.findMany({
        where: { id: { in: job.dependsOn } },
      });
      const nonTerminalDeps = depJobs.filter(
        (d) => !['COMPLETED', 'FAILED'].includes(d.status),
      );
      if (nonTerminalDeps.length > 0) {
        throw new BadRequestException('Dependency jobs still in progress');
      }
    }

    // Load parent note
    const note = await this.prisma.note.findFirst({
      where: { id: job.noteId, tenantId },
    });
    if (!note) {
      throw new NotFoundException(`Note ${job.noteId} not found`);
    }

    // Validate agent type, config, budget
    const agentType = job.agentType as AgentType;
    const agentDef = this.registry.getAgent(agentType);

    if (!this.openClawClient.isConfigured()) {
      throw new BadRequestException('Agent execution is not configured');
    }

    const canSpend = await this.budgetService.canSpend(tenantId);
    if (!canSpend) {
      throw new ForbiddenException('Daily budget exceeded');
    }

    // Check concurrency
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
        noteId: job.noteId,
        status: 'PENDING',
        agentType,
        estimatedCostEur: estimatedCost,
      },
    });

    await this.budgetService.recordSpend(tenantId, estimatedCost);

    // Update job: RUNNING + link execution
    await this.prisma.agentJob.update({
      where: { id: jobId },
      data: { status: 'RUNNING', executionId },
    });

    this.logger.log({
      message: 'Job execution triggered',
      jobId,
      executionId,
      agentType,
      noteId: job.noteId,
    });

    // Gather dependency context
    let dependencyContext = '';
    if (job.dependsOn.length > 0) {
      const depJobs = await this.prisma.agentJob.findMany({
        where: { id: { in: job.dependsOn }, status: 'COMPLETED' },
        orderBy: { order: 'asc' },
      });
      for (const dep of depJobs) {
        if (dep.agentOutput) {
          const depLabel = this.registry.getAgent(dep.agentType as AgentType).label;
          dependencyContext += `\n--- Previous Result: ${depLabel} ---\n${dep.agentOutput}\n--- End ---\n`;
        }
      }
      this.logger.log({
        message: 'Dependency context gathered',
        jobId,
        dependencyCount: depJobs.length,
        contextLength: dependencyContext.length,
      });
    }

    // Fire-and-forget
    this.executeJobPipeline(
      executionId,
      jobId,
      agentType,
      note,
      job.instruction,
      dependencyContext,
      userId,
      tenantId,
      estimatedCost
    ).catch((err) => {
      this.logger.error({
        message: 'Job pipeline failed unexpectedly',
        jobId,
        executionId,
        error: err.message,
      });
    });

    return { jobId, executionId };
  }

  /**
   * Retry a FAILED agent job: reset to PLANNED, then re-execute.
   */
  async retryJob(
    jobId: string,
    userId: string,
    tenantId: string,
  ): Promise<{ jobId: string; executionId: string }> {
    const job = await this.prisma.agentJob.findFirst({
      where: { id: jobId, tenantId },
    });

    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }
    if (job.status !== 'FAILED') {
      throw new BadRequestException(
        `Only FAILED jobs can be retried, current status: ${job.status}`,
      );
    }

    // Reset to PLANNED so executeJob() can pick it up
    await this.prisma.agentJob.update({
      where: { id: jobId },
      data: { status: 'PLANNED', executionId: null, error: null },
    });

    this.logger.log({ message: 'Retrying failed job', jobId, tenantId });

    return this.executeJob(jobId, userId, tenantId);
  }

  private async executeJobPipeline(
    executionId: string,
    jobId: string,
    agentType: AgentType,
    note: {
      id: string;
      title: string;
      content: string;
      userReport: string | null;
      expectedOutcome: string | null;
      conceptId?: string | null;
      conversationId?: string | null;
    },
    jobInstruction: string,
    dependencyContext: string,
    userId: string,
    tenantId: string,
    reservedCostEur: number
  ): Promise<void> {
    const openClawAgentId = this.registry.getOpenClawAgentId(agentType);
    const agentLabel = this.registry.getAgent(agentType).label;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let chunkIndex = 0;

    try {
      // Emit concept activity for graph visualization
      if (note.conceptId) {
        this.emitAgentEvent(tenantId, 'agent:concept-activity', {
          agentType, conceptId: note.conceptId, status: 'started',
        });
      }

      // Step 1: Build enriched instruction with dependency context
      await this.updateStatus(executionId, 'FORMATTING');
      this.emitAgentEvent(tenantId, 'agent:status-change', {
        executionId, jobId, noteId: note.id, agentType, status: 'FORMATTING',
        label: `${agentLabel}: Priprema instrukcija...`,
      });

      const enrichedInstruction = dependencyContext
        ? `${jobInstruction}\n\nContext from previous agent results:\n${dependencyContext}`
        : jobInstruction;

      const formattedPrompt = await this.agentPrompt.formatPrompt({
        agentType,
        taskTitle: note.title,
        taskContent: enrichedInstruction,
        userReport: note.userReport!,
        expectedOutcome: note.expectedOutcome,
        tenantId,
        userId,
        onChunk: (chunk) => {
          this.emitAgentEvent(tenantId, 'agent:formatting-chunk', {
            executionId, jobId, chunk, index: chunkIndex++,
          });
        },
      });

      this.emitAgentEvent(tenantId, 'agent:formatting-complete', {
        executionId, jobId, promptLength: formattedPrompt.length,
      });

      await this.prisma.agentExecution.update({
        where: { id: executionId },
        data: { formattedPrompt },
      });

      // Step 2: Send to OpenClaw
      await this.updateStatus(executionId, 'EXECUTING', { startedAt: new Date() });
      this.emitAgentEvent(tenantId, 'agent:status-change', {
        executionId, jobId, noteId: note.id, agentType, status: 'EXECUTING',
        label: `${agentLabel}: Agent istražuje...`,
      });
      heartbeat = this.startHeartbeat(executionId, jobId, agentType, tenantId, Date.now());

      const result = await this.openClawClient.executeAgent(formattedPrompt, {
        agentId: openClawAgentId,
        onText: (text) => {
          this.emitAgentEvent(tenantId, 'agent:text-chunk', {
            executionId, jobId, text,
          });
        },
        onTool: (tool, status, query) => {
          this.emitAgentEvent(tenantId, 'agent:tool-event', {
            executionId, jobId, tool, status, query,
          });
        },
        onStatus: (phase) => {
          this.emitAgentEvent(tenantId, 'agent:status-change', {
            executionId, jobId, noteId: note.id, agentType, status: 'EXECUTING',
            label: `${agentLabel}: ${phase === 'running' ? 'Agent istražuje...' : phase}`,
          });
        },
      });

      clearInterval(heartbeat);
      heartbeat = null;

      if (!result.success) {
        const errorMsg = result.error ?? 'Agent execution failed';
        await this.prisma.agentJob.update({
          where: { id: jobId },
          data: { status: 'FAILED', error: errorMsg },
        });
        await this.updateStatus(executionId, 'FAILED', {
          error: errorMsg,
          completedAt: new Date(),
          durationMs: result.durationMs,
        });
        this.emitAgentEvent(tenantId, 'agent:status-change', {
          executionId, jobId, noteId: note.id, agentType, status: 'FAILED',
          label: `${agentLabel}: Greška`,
        });
        this.emitAgentEvent(tenantId, 'agent:error', {
          executionId, jobId, agentType, error: errorMsg,
        });
        return;
      }

      // Step 3: Store result in both AgentJob and Note enrichments
      await this.prisma.agentJob.update({
        where: { id: jobId },
        data: { status: 'COMPLETED', agentOutput: result.output },
      });

      await this.mergeEnrichment(note.id, agentType, {
        executionId,
        status: AgentExecutionStatus.COMPLETED,
        result: result.output,
        completedAt: new Date().toISOString(),
        error: null,
      });

      // Step 3b: Persist job output as reviewable child note (Sprint 2 Epic 2.3)
      const jobResultNoteId = await this.createResultNote(
        result.output, agentLabel, note, userId, tenantId, executionId, jobId
      );

      // Step 4: Cost adjustment
      const actualCost = this.estimateActualCost(result.usage);
      const costDifference = actualCost - reservedCostEur;
      if (Math.abs(costDifference) > 0.0001) {
        await this.budgetService.recordSpend(tenantId, costDifference);
      }

      // Step 5: Mark execution completed + link result note
      await this.prisma.agentExecution.update({
        where: { id: executionId },
        data: {
          status: 'COMPLETED',
          agentOutput: result.output,
          actualCostEur: actualCost,
          completedAt: new Date(),
          durationMs: result.durationMs,
          resultNoteId: jobResultNoteId,
        },
      });

      this.emitAgentEvent(tenantId, 'agent:status-change', {
        executionId, jobId, noteId: note.id, agentType, status: 'COMPLETED',
        label: `${agentLabel}: Završeno`,
      });
      this.emitAgentEvent(tenantId, 'agent:result', {
        executionId, jobId, agentType,
        output: result.output, durationMs: result.durationMs,
      });

      this.logger.log({
        message: 'Job execution completed',
        jobId,
        executionId,
        agentType,
        durationMs: result.durationMs,
        actualCostEur: actualCost,
      });

      if (note.conceptId) {
        this.emitAgentEvent(tenantId, 'agent:concept-activity', {
          agentType, conceptId: note.conceptId, status: 'stopped',
        });
      }
    } catch (err) {
      if (heartbeat) clearInterval(heartbeat);

      if (note.conceptId) {
        this.emitAgentEvent(tenantId, 'agent:concept-activity', {
          agentType, conceptId: note.conceptId, status: 'stopped',
        });
      }

      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error({
        message: 'Job pipeline error',
        jobId,
        executionId,
        agentType,
        error: errorMessage,
      });

      this.emitAgentEvent(tenantId, 'agent:status-change', {
        executionId, jobId, noteId: note.id, agentType, status: 'FAILED',
        label: `${agentLabel}: Greška`,
      });
      this.emitAgentEvent(tenantId, 'agent:error', {
        executionId, jobId, agentType, error: errorMessage,
      });

      try {
        await this.prisma.agentJob.update({
          where: { id: jobId },
          data: { status: 'FAILED', error: errorMessage },
        });
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
    }
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
