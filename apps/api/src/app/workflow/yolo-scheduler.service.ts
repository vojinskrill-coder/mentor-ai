import { Injectable, Logger } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { NoteSource, NoteType, NoteStatus } from '@mentor-ai/shared/prisma';
import type {
  ExecutionPlanStep,
  YoloConfig,
  YoloProgressPayload,
  YoloCompletePayload,
} from '@mentor-ai/shared/types';
import { WorkflowService } from './workflow.service';
import { NotesService } from '../notes/notes.service';
import { ConceptService } from '../knowledge/services/concept.service';
import { ConceptMatchingService } from '../knowledge/services/concept-matching.service';
import { CurriculumService } from '../knowledge/services/curriculum.service';
import { ConceptExtractionService } from '../knowledge/services/concept-extraction.service';

// ─── Internal Types ─────────────────────────────────────────────

interface YoloTask {
  taskId: string;
  conceptId: string;
  conceptName: string;
  dependencies: string[]; // conceptIds that must complete first
  status: 'pending' | 'ready' | 'running' | 'completed' | 'failed';
  retries: number;
}

interface YoloCallbacks {
  onProgress: (payload: YoloProgressPayload) => void;
  onComplete: (payload: YoloCompletePayload) => void;
  onError: (error: string) => void;
  saveMessage: (role: string, content: string, conceptId?: string) => Promise<string>;
  createConversationForConcept?: (conceptId: string, conceptName: string) => Promise<string | null>;
  onConceptDiscovered?: (conceptId: string, conceptName: string, conversationId: string) => void;
}

interface YoloRunState {
  planId: string;
  tenantId: string;
  userId: string;
  conversationId: string;
  config: YoloConfig;
  tasks: Map<string, YoloTask>;
  readyQueue: string[];
  runningTasks: Map<string, Promise<void>>;
  completedConcepts: Set<string>;
  failedConcepts: Set<string>;
  completedCount: number;
  failedCount: number;
  cancelled: boolean;
  startTime: number;
  logBuffer: string[];
  conceptConversations: Map<string, string>;
  discoveredConceptIds: Set<string>;
  discoveredCount: number;
  totalConceptsCreated: number;
  workerOutputs: Map<string, string>;
  locks: Map<string, { taskId: string; acquiredAt: number }>;
  consecutiveFailures: number;
  /** Per-worker step tracking for real-time progress (Story 2.16) */
  workerStepInfo: Map<string, { stepIndex: number; totalSteps: number; stepTitle: string }>;
}

const MAX_LOG_BUFFER = 100;
const SUMMARY_TRUNCATE_LENGTH = 300;
const RETRY_BASE_DELAY_MS = 5_000; // 5s base, exponential: 5s, 15s, 45s
const CIRCUIT_BREAKER_THRESHOLD = 3;
const CIRCUIT_BREAKER_COOLDOWN_MS = 30_000; // 30s pause after consecutive failures

@Injectable()
export class YoloSchedulerService {
  private readonly logger = new Logger(YoloSchedulerService.name);
  private readonly activeRuns = new Map<string, YoloRunState>();

  constructor(
    private readonly workflowService: WorkflowService,
    private readonly prisma: PlatformPrismaService,
    private readonly notesService: NotesService,
    private readonly conceptService: ConceptService,
    private readonly conceptMatchingService: ConceptMatchingService,
    private readonly curriculumService: CurriculumService,
    private readonly conceptExtractionService: ConceptExtractionService,
  ) {}

  /**
   * Starts YOLO autonomous execution for all pending tasks of a tenant.
   * Returns the planId for tracking.
   */
  async startYoloExecution(
    tenantId: string,
    userId: string,
    conversationId: string,
    config: YoloConfig,
    callbacks: YoloCallbacks,
    conceptConversations: Map<string, string>,
  ): Promise<string> {
    const planId = `yolo_${createId()}`;

    // Load all pending TASK notes for this tenant
    const taskNotes = await this.prisma.note.findMany({
      where: { tenantId, noteType: 'TASK', status: 'PENDING' },
    });

    if (taskNotes.length === 0) {
      callbacks.onError('No pending tasks found');
      return planId;
    }

    // Build task map with concept info (batch lookups to avoid N+1)
    const tasks = new Map<string, YoloTask>();
    const notesWithConcepts = taskNotes.filter((n) => n.conceptId);
    const uniqueConceptIds = [...new Set(notesWithConcepts.map((n) => n.conceptId!))];
    const conceptNames = new Map<string, string>();
    await Promise.all(
      uniqueConceptIds.map(async (conceptId) => {
        try {
          const concept = await this.conceptService.findById(conceptId);
          if (concept.name) conceptNames.set(conceptId, concept.name);
        } catch {
          // Fallback — concept name resolved from note title below
        }
      }),
    );
    for (const note of notesWithConcepts) {
      tasks.set(note.id, {
        taskId: note.id,
        conceptId: note.conceptId!,
        conceptName: conceptNames.get(note.conceptId!) ?? note.title,
        dependencies: [],
        status: 'pending',
        retries: 0,
      });
    }

    if (tasks.size === 0) {
      callbacks.onError('No tasks with linked concepts found');
      return planId;
    }

    // Resolve dependencies from PREREQUISITE relationships
    await this.resolveDependencies(tasks);

    // Initialize ready queue with tasks that have no unmet dependencies
    const readyQueue: string[] = [];
    for (const [taskId, task] of tasks) {
      if (task.dependencies.length === 0) {
        task.status = 'ready';
        readyQueue.push(taskId);
      }
    }

    const state: YoloRunState = {
      planId,
      tenantId,
      userId,
      conversationId,
      config,
      tasks,
      readyQueue,
      runningTasks: new Map(),
      completedConcepts: new Set(),
      failedConcepts: new Set(),
      completedCount: 0,
      failedCount: 0,
      cancelled: false,
      startTime: Date.now(),
      logBuffer: [],
      conceptConversations,
      discoveredConceptIds: new Set(uniqueConceptIds),
      discoveredCount: 0,
      totalConceptsCreated: 0,
      workerOutputs: new Map(),
      locks: new Map(),
      consecutiveFailures: 0,
      workerStepInfo: new Map(),
    };

    this.activeRuns.set(planId, state);

    this.addLog(state, `YOLO started: ${tasks.size} tasks, maxConcurrency=${config.maxConcurrency}`);

    // Emit initial progress
    callbacks.onProgress(this.buildProgressPayload(state));

    // Fire-and-forget the main dispatch loop
    this.runDispatchLoop(state, callbacks).catch((err) => {
      this.logger.error({
        message: 'YOLO dispatch loop failed',
        planId,
        error: err instanceof Error ? err.message : 'Unknown',
      });
      this.activeRuns.delete(planId);
      callbacks.onError(err instanceof Error ? err.message : 'YOLO execution failed');
    });

    return planId;
  }

  cancelRun(planId: string): boolean {
    const state = this.activeRuns.get(planId);
    if (!state) return false;
    state.cancelled = true;
    return true;
  }

  getRunState(planId: string): YoloRunState | undefined {
    return this.activeRuns.get(planId);
  }

  // ─── Main Dispatch Loop ──────────────────────────────────────

  private async runDispatchLoop(state: YoloRunState, callbacks: YoloCallbacks): Promise<void> {
    const { config, tasks } = state;

    while ((state.readyQueue.length > 0 || state.runningTasks.size > 0) && !state.cancelled) {
      // Backpressure: reduce concurrency if queue is very large
      const effectiveConcurrency = state.readyQueue.length > 500 ? 1 : config.maxConcurrency;

      // Hard stop check
      if (state.completedCount >= config.maxConceptsHardStop) {
        this.addLog(state, `Hard stop reached: ${state.completedCount} concepts completed`);
        break;
      }

      // Circuit breaker: pause if too many consecutive failures (likely DB outage)
      if (state.consecutiveFailures >= CIRCUIT_BREAKER_THRESHOLD) {
        const cooldown = config.circuitBreakerCooldownMs ?? CIRCUIT_BREAKER_COOLDOWN_MS;
        this.addLog(state, `Circuit breaker: ${state.consecutiveFailures} consecutive failures, pausing ${cooldown / 1000}s`);
        await new Promise((r) => setTimeout(r, cooldown));
        state.consecutiveFailures = 0;
      }

      // Dispatch from ready queue up to effectiveConcurrency
      let dispatched = false;
      while (state.readyQueue.length > 0 && state.runningTasks.size < effectiveConcurrency) {
        const taskId = state.readyQueue.shift()!;
        const task = tasks.get(taskId);
        if (!task || task.status === 'completed' || task.status === 'failed') continue;

        // Try to acquire concept lock
        if (!this.tryAcquireLock(state, task.conceptId, taskId)) {
          // Can't lock, put back in queue
          state.readyQueue.push(taskId);
          break; // Wait for a running task to finish
        }

        task.status = 'running';
        this.addLog(state, `Dispatching: ${task.conceptName} (${taskId})`);

        const workerPromise = this.executeWorker(state, task, callbacks)
          .then(async () => {
            task.status = 'completed';
            state.completedCount++;
            state.completedConcepts.add(task.conceptId);
            state.consecutiveFailures = 0; // Reset circuit breaker on success
            this.releaseLock(state, task.conceptId);
            this.addLog(state, `Completed: ${task.conceptName}`);

            // Mark the original task note as COMPLETED
            this.notesService.updateStatus(task.taskId, NoteStatus.COMPLETED, state.tenantId).catch((err) => {
              this.logger.warn({
                message: 'Failed to mark task as completed',
                taskId: task.taskId,
                error: err instanceof Error ? err.message : 'Unknown',
              });
            });

            // Extract and create new concepts from AI output (Story 2.15)
            // Runs BEFORE discovery so new concepts have graph edges for traversal
            const workerOutput = state.workerOutputs.get(task.taskId);
            state.workerOutputs.delete(task.taskId);
            if (workerOutput && state.totalConceptsCreated < 20) {
              try {
                const extractionResult = await this.conceptExtractionService.extractAndCreateConcepts(
                  workerOutput,
                  {
                    conversationId: state.conversationId,
                    conceptId: task.conceptId,
                    maxNew: Math.min(5, 20 - state.totalConceptsCreated),
                  },
                );
                state.totalConceptsCreated += extractionResult.created.length;
                if (extractionResult.created.length > 0) {
                  this.addLog(state, `Created ${extractionResult.created.length} new concepts from AI output`);
                }
              } catch (err) {
                this.logger.warn({
                  message: 'Concept extraction failed in YOLO (non-blocking)',
                  taskId: task.taskId,
                  error: err instanceof Error ? err.message : 'Unknown',
                });
              }

              // Discover related concepts from AI output
              await this.discoverRelatedConcepts(state, task, workerOutput, callbacks);
            }

            // Re-dispatch: find newly ready tasks (including discovered ones)
            this.reEvaluateReadyQueue(state);
            callbacks.onProgress(this.buildProgressPayload(state));
          })
          .catch(async (err) => {
            state.consecutiveFailures++;
            task.retries++;
            if (task.retries <= config.retryAttempts) {
              // Exponential backoff: 5s, 15s, 45s...
              const baseDelay = config.retryBaseDelayMs ?? RETRY_BASE_DELAY_MS;
              const delay = baseDelay * Math.pow(3, task.retries - 1);
              this.addLog(state, `Retrying (${task.retries}/${config.retryAttempts}) in ${delay / 1000}s: ${task.conceptName}`);
              await new Promise((r) => setTimeout(r, delay));
              task.status = 'ready';
              state.readyQueue.push(taskId);
            } else {
              task.status = 'failed';
              state.failedCount++;
              state.failedConcepts.add(task.conceptId);
              this.addLog(state, `Failed: ${task.conceptName} — ${err instanceof Error ? err.message : 'Unknown'}`);
            }
            this.releaseLock(state, task.conceptId);
            this.reEvaluateReadyQueue(state);
            callbacks.onProgress(this.buildProgressPayload(state));
          })
          .finally(() => {
            state.runningTasks.delete(taskId);
          });

        state.runningTasks.set(taskId, workerPromise);
        dispatched = true;
      }

      // If nothing dispatched and tasks are running, wait for one to finish
      if (state.runningTasks.size > 0) {
        await Promise.race([...state.runningTasks.values()]).catch(() => {
          // Errors handled in individual worker .catch()
        });
      } else if (!dispatched && state.readyQueue.length === 0) {
        // Nothing running, nothing ready — we're done or deadlocked
        break;
      }
    }

    // Clean up
    const durationMs = Date.now() - state.startTime;
    const totalTasks = tasks.size;
    const hardStopped = state.completedCount >= config.maxConceptsHardStop;

    let status: 'completed' | 'failed' | 'hard-stopped' = 'completed';
    if (hardStopped) status = 'hard-stopped';
    else if (state.failedCount > 0 && state.completedCount === 0) status = 'failed';

    this.addLog(state, `YOLO finished: ${status}, completed=${state.completedCount}, failed=${state.failedCount}, duration=${durationMs}ms`);

    callbacks.onComplete({
      planId: state.planId,
      status,
      completed: state.completedCount,
      failed: state.failedCount,
      total: totalTasks,
      discoveredCount: state.discoveredCount,
      durationMs,
      conversationId: state.conversationId,
      logs: [...state.logBuffer],
    });

    // Scheduled cleanup
    setTimeout(() => {
      this.activeRuns.delete(state.planId);
    }, 30000);
  }

  // ─── Worker Execution ────────────────────────────────────────

  private async executeWorker(
    state: YoloRunState,
    task: YoloTask,
    callbacks: YoloCallbacks,
  ): Promise<void> {
    const { tenantId, userId } = state;

    // Get conversation for this concept
    const conversationId = state.conceptConversations.get(task.conceptId) ?? state.conversationId;

    // Generate/load workflow for this concept
    const workflow = await this.workflowService.getOrGenerateWorkflow(
      task.conceptId, tenantId, userId,
    );

    const completedSummaries: Array<{ title: string; conceptName: string; summary: string }> = [];

    const totalSteps = workflow.steps.length;

    // Execute each workflow step sequentially within this worker
    for (let stepIdx = 0; stepIdx < workflow.steps.length; stepIdx++) {
      if (state.cancelled) return;

      const workflowStep = workflow.steps[stepIdx]!;

      const step: ExecutionPlanStep = {
        stepId: `yolo_step_${createId()}`,
        conceptId: task.conceptId,
        conceptName: task.conceptName,
        workflowStepNumber: workflowStep.stepNumber,
        title: workflowStep.title,
        description: workflowStep.description,
        estimatedMinutes: workflowStep.estimatedMinutes,
        departmentTag: workflowStep.departmentTag,
        status: 'in_progress',
      };

      // Track step info and emit step-start progress (Story 2.16)
      state.workerStepInfo.set(task.taskId, {
        stepIndex: stepIdx,
        totalSteps,
        stepTitle: workflowStep.title,
      });
      callbacks.onProgress(this.buildProgressPayload(state));

      // Execute the step using WorkflowService's shared logic
      let fullContent = '';
      const result = await this.workflowService.executeStepAutonomous(
        step,
        conversationId,
        userId,
        tenantId,
        (chunk) => { fullContent += chunk; }, // Collect chunks silently — no per-step streaming in YOLO
        completedSummaries,
      );

      // Emit step-complete progress (Story 2.16)
      state.workerStepInfo.set(task.taskId, {
        stepIndex: stepIdx,
        totalSteps,
        stepTitle: `${workflowStep.title} ✓`,
      });
      callbacks.onProgress(this.buildProgressPayload(state));

      // Save AI message to concept conversation
      await callbacks.saveMessage('assistant', result.content, task.conceptId);

      // Create sub-task note
      await this.notesService.createNote({
        title: step.title,
        content: result.content,
        source: NoteSource.CONVERSATION,
        noteType: NoteType.TASK,
        status: NoteStatus.READY_FOR_REVIEW,
        userId,
        tenantId,
        conversationId,
        conceptId: task.conceptId,
        parentNoteId: task.taskId,
        expectedOutcome: step.description?.substring(0, 500),
        workflowStepNumber: step.workflowStepNumber,
      });

      // Memory discipline: only keep truncated summary
      completedSummaries.push({
        title: step.title,
        conceptName: task.conceptName,
        summary: result.content.substring(0, SUMMARY_TRUNCATE_LENGTH),
      });
    }

    // Store concatenated summaries for concept discovery
    const outputForDiscovery = completedSummaries
      .map((s) => `${s.title}: ${s.summary}`)
      .join('\n');
    state.workerOutputs.set(task.taskId, outputForDiscovery);

    // Clean up step tracking (Story 2.16)
    state.workerStepInfo.delete(task.taskId);
  }

  // ─── Concept Discovery ─────────────────────────────────────────

  private async discoverRelatedConcepts(
    state: YoloRunState,
    task: YoloTask,
    aiOutput: string,
    callbacks: YoloCallbacks,
  ): Promise<void> {
    if (state.tasks.size >= state.config.maxConceptsHardStop) return;

    const candidates: Array<{ conceptId: string; conceptName: string; source: string }> = [];

    // Phase 1: Graph-based discovery (language-independent, reliable)
    try {
      const concept = await this.conceptService.findById(task.conceptId);
      for (const rel of concept.relatedConcepts) {
        // Skip incoming prerequisites (we don't want to go backwards)
        if (rel.relationshipType === 'PREREQUISITE' && rel.direction === 'incoming') continue;
        candidates.push({
          conceptId: rel.concept.id,
          conceptName: rel.concept.name,
          source: `graph:${rel.relationshipType}`,
        });
      }
      this.addLog(state, `Graph discovery for ${task.conceptName}: ${candidates.length} candidates`);
    } catch (err) {
      this.logger.warn({
        message: 'Graph discovery failed',
        conceptId: task.conceptId,
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }

    // Phase 2: Semantic search (cross-language may still find some matches)
    try {
      const matches = await this.conceptMatchingService.findRelevantConcepts(
        aiOutput,
        { limit: 10, threshold: 0.55 },
      );
      for (const match of matches) {
        if (!candidates.some((c) => c.conceptId === match.conceptId)) {
          candidates.push({
            conceptId: match.conceptId,
            conceptName: match.conceptName,
            source: `semantic:${match.score.toFixed(2)}`,
          });
        }
      }
    } catch (err) {
      this.logger.warn({
        message: 'Semantic discovery failed (non-blocking)',
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }

    // Process candidates
    for (const candidate of candidates) {
      if (state.discoveredConceptIds.has(candidate.conceptId)) continue;
      if (state.tasks.size >= state.config.maxConceptsHardStop) break;
      await this.addDiscoveredConcept(
        state, candidate.conceptId, candidate.conceptName,
        candidate.source, task.conceptName, callbacks,
      );
    }
  }

  private async addDiscoveredConcept(
    state: YoloRunState,
    conceptId: string,
    conceptName: string,
    source: string,
    parentName: string,
    callbacks: YoloCallbacks,
  ): Promise<void> {
    try {
      state.discoveredConceptIds.add(conceptId);
      state.discoveredCount++;
      this.addLog(state, `Discovered: ${conceptName} (${source}) via ${parentName}`);

      // Curriculum linking (best-effort)
      try {
        const node = this.curriculumService.matchTopic(conceptName);
        if (node) await this.curriculumService.ensureConceptExists(node.id);
      } catch {
        // Non-blocking
      }

      // Story 2.13: Fire-and-forget dynamic relationship creation
      // Deviation: uses .then()/.catch() instead of try/catch — fire-and-forget requires it
      this.conceptService
        .createDynamicRelationships(conceptId, conceptName)
        .then((res) => {
          if (res.relationshipsCreated > 0) {
            this.addLog(state, `Created ${res.relationshipsCreated} relationships for ${conceptName}`);
          }
        })
        .catch((err) =>
          this.logger.warn({
            message: 'Dynamic relationship creation failed',
            conceptName,
            error: err instanceof Error ? err.message : 'Unknown',
          }),
        );

      // Create PENDING task note
      const taskNote = await this.notesService.createNote({
        title: conceptName,
        content: `Primenite ${conceptName} na vaše poslovanje`,
        source: NoteSource.CONVERSATION,
        noteType: NoteType.TASK,
        status: NoteStatus.PENDING,
        userId: state.userId,
        tenantId: state.tenantId,
        conversationId: state.conversationId,
        conceptId,
      });

      // Create conversation via callback
      let conversationId: string | null = null;
      if (callbacks.createConversationForConcept) {
        conversationId = await callbacks.createConversationForConcept(conceptId, conceptName);
        if (conversationId) {
          state.conceptConversations.set(conceptId, conversationId);
        }
      }

      // Add to task map + ready queue
      state.tasks.set(taskNote.id, {
        taskId: taskNote.id,
        conceptId,
        conceptName,
        dependencies: [],
        status: 'ready',
        retries: 0,
      });
      state.readyQueue.push(taskNote.id);

      // Emit tree update to frontend
      if (callbacks.onConceptDiscovered && conversationId) {
        callbacks.onConceptDiscovered(conceptId, conceptName, conversationId);
      }
    } catch (itemErr) {
      // Roll back so it can be retried from another worker's discovery
      state.discoveredConceptIds.delete(conceptId);
      state.discoveredCount = Math.max(0, state.discoveredCount - 1);
      this.logger.warn({
        message: 'Failed to add discovered concept',
        conceptName,
        error: itemErr instanceof Error ? itemErr.message : 'Unknown',
      });
    }
  }

  // ─── Dependency Resolution ───────────────────────────────────

  private async resolveDependencies(tasks: Map<string, YoloTask>): Promise<void> {
    const conceptIdToTaskIds = new Map<string, string[]>();
    for (const [taskId, task] of tasks) {
      const list = conceptIdToTaskIds.get(task.conceptId) ?? [];
      list.push(taskId);
      conceptIdToTaskIds.set(task.conceptId, list);
    }

    const allConceptIds = [...conceptIdToTaskIds.keys()];
    if (allConceptIds.length <= 1) return;

    // Query PREREQUISITE relationships among our concepts
    for (const [, task] of tasks) {
      try {
        const concept = await this.conceptService.findById(task.conceptId);
        const prereqs = concept.relatedConcepts
          .filter(
            (r) =>
              r.relationshipType === 'PREREQUISITE' &&
              r.direction === 'outgoing' &&
              allConceptIds.includes(r.concept.id),
          )
          .map((r) => r.concept.id);
        task.dependencies = prereqs;
      } catch {
        task.dependencies = [];
      }
    }
  }

  // ─── Ready Queue Re-evaluation ───────────────────────────────

  private reEvaluateReadyQueue(state: YoloRunState): void {
    for (const [taskId, task] of state.tasks) {
      if (task.status !== 'pending') continue;

      const allDepsMet = task.dependencies.every(
        (depConceptId) => state.completedConcepts.has(depConceptId),
      );
      if (allDepsMet && !state.readyQueue.includes(taskId)) {
        task.status = 'ready';
        state.readyQueue.push(taskId);
        this.addLog(state, `Unblocked: ${task.conceptName}`);
      }
    }
  }

  // ─── Lock Manager ────────────────────────────────────────────

  private static readonly LOCK_TTL_MS = 5 * 60 * 1000; // 5 minutes

  private tryAcquireLock(state: YoloRunState, conceptId: string, taskId: string): boolean {
    const holder = state.locks.get(conceptId);
    if (holder) {
      if (holder.taskId === taskId) return true;
      // Release stale lock if TTL exceeded
      if (Date.now() - holder.acquiredAt > YoloSchedulerService.LOCK_TTL_MS) {
        this.addLog(state, `Stale lock released: ${conceptId} (held by ${holder.taskId})`);
        state.locks.delete(conceptId);
      } else {
        return false;
      }
    }
    state.locks.set(conceptId, { taskId, acquiredAt: Date.now() });
    return true;
  }

  private releaseLock(state: YoloRunState, conceptId: string): void {
    state.locks.delete(conceptId);
  }

  // ─── Logging (Ring Buffer) ───────────────────────────────────

  private addLog(state: YoloRunState, message: string): void {
    const entry = `[${new Date().toISOString()}] ${message}`;
    state.logBuffer.push(entry);
    if (state.logBuffer.length > MAX_LOG_BUFFER) {
      state.logBuffer.shift();
    }
    this.logger.log({ message: `YOLO [${state.planId}] ${message}` });
  }

  // ─── Progress Builder ────────────────────────────────────────

  private buildProgressPayload(state: YoloRunState): YoloProgressPayload {
    const currentTasks: YoloProgressPayload['currentTasks'] = [];
    for (const [, task] of state.tasks) {
      if (task.status === 'running') {
        const stepInfo = state.workerStepInfo.get(task.taskId);
        currentTasks.push({
          conceptName: task.conceptName,
          status: 'running',
          currentStep: stepInfo?.stepTitle,
          currentStepIndex: stepInfo?.stepIndex,
          totalSteps: stepInfo?.totalSteps,
        });
      }
    }

    // Include last 10 log entries for activity stream (Story 2.16)
    const recentLogs = state.logBuffer.slice(-10);

    return {
      planId: state.planId,
      running: state.runningTasks.size,
      maxConcurrency: state.config.maxConcurrency,
      completed: state.completedCount,
      failed: state.failedCount,
      total: state.tasks.size,
      discoveredCount: state.discoveredCount,
      currentTasks,
      recentLogs,
      conversationId: state.conversationId,
    };
  }
}
