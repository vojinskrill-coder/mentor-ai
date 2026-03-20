import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { OpenClawClientService } from '../agent-execution/openclaw-client.service';
import {
  APP_EVENTS,
  KnowledgeUpdateEvent,
  AgentJobStuckEvent,
  StageExecutionEvent,
  ConceptCompletedEvent,
  NoteCreatedEvent,
  NoteUpdatedEvent,
  NoteStatusChangedEvent,
  ConversationCreatedEvent,
  ConversationMessageAddedEvent,
  OnboardingCompletedEvent,
  WorkflowStepCompletedEvent,
  WorkflowCompletedEvent,
} from './app-event-bus.service';

/**
 * Centralized Event Handlers
 *
 * React to application events with clean, isolated logic.
 * Each handler is independent and non-blocking unless explicitly async.
 */
@Injectable()
export class AppEventHandlers {
  private readonly logger = new Logger(AppEventHandlers.name);

  // Per-agent queue: ensures only ONE knowledge update per agent at a time (no lock contention)
  private readonly agentQueues = new Map<string, Promise<void>>();

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly openClawClient: OpenClawClientService,
  ) {}

  /**
   * Queue a task per agent — ensures sequential execution per agent session.
   * Different agents can run in parallel, but same agent is always sequential.
   */
  private async enqueueForAgent(agentId: string, task: () => Promise<void>): Promise<void> {
    const current = this.agentQueues.get(agentId) ?? Promise.resolve();
    const next = current.then(task).catch(() => {}).then(() => {
      // Clean up if this was the last task
      if (this.agentQueues.get(agentId) === next) {
        this.agentQueues.delete(agentId);
      }
    });
    this.agentQueues.set(agentId, next);
    return next;
  }

  // ─── Knowledge Updates (queued per agent, no lock contention) ───

  @OnEvent(APP_EVENTS.KNOWLEDGE_UPDATE_NEEDED, { async: true })
  async handleKnowledgeUpdate(event: KnowledgeUpdateEvent): Promise<void> {
    const { conceptName, agentTypes, summary, companyName, personaType } = event;

    // Queue updates per agent — parallel across agents, sequential within each agent
    const promises: Promise<void>[] = [];

    for (const agentTypeStr of agentTypes) {
      const agentId = agentTypeStr.replace(/_/g, '-');
      promises.push(
        this.enqueueForAgent(agentId, async () => {
          try {
            await this.openClawClient.executeAgent(
              `KNOWLEDGE UPDATE za ${companyName} - Koncept: ${conceptName}. Zapamti ove nalaze:\n\n${summary}`,
              { agentId, timeoutSeconds: 180 }
            );
            this.logger.log({ message: `Knowledge update: ${agentTypeStr} master`, conceptName });
          } catch (err) {
            this.logger.warn({ message: `Knowledge update failed: ${agentTypeStr}`, error: err instanceof Error ? err.message : 'Unknown' });
          }
        })
      );
    }

    // Main agent — also queued
    promises.push(
      this.enqueueForAgent('main', async () => {
        try {
          await this.openClawClient.executeAgent(
            `KNOWLEDGE UPDATE za ${companyName}: Koncept "${conceptName}" (${personaType ?? 'UNKNOWN'}) zavrsen. Zapamti:\n${summary.substring(0, 3000)}`,
            { agentId: 'main', timeoutSeconds: 120 }
          );
          this.logger.log({ message: 'Knowledge update: main', conceptName });
        } catch (err) {
          this.logger.warn({ message: 'Knowledge update failed: main', error: err instanceof Error ? err.message : 'Unknown' });
        }
      })
    );

    await Promise.all(promises);
  }

  // ─── Stuck Job Recovery ───

  @OnEvent(APP_EVENTS.AGENT_JOB_STUCK, { async: true })
  async handleStuckJob(event: AgentJobStuckEvent): Promise<void> {
    const { tenantId, executionId, jobId, agentType } = event;

    this.logger.warn({ message: 'Handling stuck job', executionId, jobId, agentType });

    // Force-fail stuck execution (idempotent — only if still in active state)
    await this.prisma.agentExecution.updateMany({
      where: { id: executionId, status: { in: ['EXECUTING', 'FORMATTING', 'PENDING'] } },
      data: {
        status: 'FAILED',
        error: `Stuck >20min — auto-recovered by event handler`,
        completedAt: new Date(),
      },
    });

    // Reset job to PLANNED for retry (idempotent — only if still RUNNING)
    if (jobId) {
      await this.prisma.agentJob.updateMany({
        where: { id: jobId, status: 'RUNNING' },
        data: { status: 'PLANNED', executionId: null, error: null },
      } as any);
      this.logger.log({ message: 'Stuck job reset to PLANNED', jobId });
    }
  }

  // Note: STAGE_EXECUTION_CONTINUE is handled by MaturityEngineService @OnEvent (not here)

  // ─── Stage Execution Completed ───

  @OnEvent(APP_EVENTS.STAGE_EXECUTION_COMPLETED)
  handleStageExecutionCompleted(event: StageExecutionEvent): void {
    this.logger.log({
      message: 'Stage execution completed',
      tenantId: event.tenantId,
      stage: event.stage,
      total: event.total,
      executed: event.executed,
      failed: event.failed,
    });
  }

  // ─── Concept Completed / Failed ───

  @OnEvent(APP_EVENTS.CONCEPT_COMPLETED)
  handleConceptCompleted(event: ConceptCompletedEvent): void {
    this.logger.log({
      message: 'Concept completed',
      tenantId: event.tenantId,
      conceptId: event.conceptId,
      noteId: event.noteId,
      stage: event.stage,
      personaType: event.personaType,
    });
  }

  @OnEvent(APP_EVENTS.CONCEPT_FAILED)
  handleConceptFailed(event: ConceptCompletedEvent): void {
    this.logger.warn({
      message: 'Concept failed',
      tenantId: event.tenantId,
      conceptId: event.conceptId,
      noteId: event.noteId,
      stage: event.stage,
      personaType: event.personaType,
      error: event.error,
    });
  }

  // ─── Note Lifecycle ───

  @OnEvent(APP_EVENTS.NOTE_CREATED)
  handleNoteCreated(event: NoteCreatedEvent): void {
    this.logger.log({
      message: 'Note created',
      tenantId: event.tenantId,
      noteId: event.noteId,
      noteType: event.noteType,
      source: event.source,
      conceptId: event.conceptId,
    });
  }

  @OnEvent(APP_EVENTS.NOTE_UPDATED)
  handleNoteUpdated(event: NoteUpdatedEvent): void {
    this.logger.log({
      message: 'Note updated',
      tenantId: event.tenantId,
      noteId: event.noteId,
    });
  }

  @OnEvent(APP_EVENTS.NOTE_STATUS_CHANGED)
  handleNoteStatusChanged(event: NoteStatusChangedEvent): void {
    this.logger.log({
      message: 'Note status changed',
      tenantId: event.tenantId,
      noteId: event.noteId,
      previousStatus: event.previousStatus,
      newStatus: event.newStatus,
    });
  }

  // ─── Conversation Lifecycle ───

  @OnEvent(APP_EVENTS.CONVERSATION_CREATED)
  handleConversationCreated(event: ConversationCreatedEvent): void {
    this.logger.log({
      message: 'Conversation created',
      tenantId: event.tenantId,
      conversationId: event.conversationId,
      userId: event.userId,
      personaType: event.personaType,
      conceptId: event.conceptId,
    });
  }

  @OnEvent(APP_EVENTS.CONVERSATION_MESSAGE_ADDED)
  handleConversationMessageAdded(event: ConversationMessageAddedEvent): void {
    this.logger.log({
      message: 'Conversation message added',
      tenantId: event.tenantId,
      conversationId: event.conversationId,
      messageId: event.messageId,
      role: event.role,
    });
  }

  // ─── Onboarding ───

  @OnEvent(APP_EVENTS.ONBOARDING_COMPLETED)
  handleOnboardingCompleted(event: OnboardingCompletedEvent): void {
    this.logger.log({
      message: 'Onboarding completed',
      tenantId: event.tenantId,
      userId: event.userId,
      taskId: event.taskId,
      noteId: event.noteId,
      timeSavedMinutes: event.timeSavedMinutes,
      welcomeConversationId: event.welcomeConversationId,
    });
  }

  // ─── Workflow Execution ───

  @OnEvent(APP_EVENTS.WORKFLOW_STEP_COMPLETED)
  handleWorkflowStepCompleted(event: WorkflowStepCompletedEvent): void {
    this.logger.log({
      message: 'Workflow step completed',
      tenantId: event.tenantId,
      planId: event.planId,
      stepId: event.stepId,
      conceptName: event.conceptName,
      stepNumber: event.stepNumber,
      totalSteps: event.totalSteps,
    });
  }

  @OnEvent(APP_EVENTS.WORKFLOW_COMPLETED)
  handleWorkflowCompleted(event: WorkflowCompletedEvent): void {
    this.logger.log({
      message: 'Workflow completed',
      tenantId: event.tenantId,
      planId: event.planId,
      userId: event.userId,
      status: event.status,
      completedSteps: event.completedSteps,
      totalSteps: event.totalSteps,
    });
  }

  // ─── Helpers ───

  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    label: string,
    maxRetries = 5,
    delayMs = 10_000,
  ): Promise<T> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isLock = msg.includes('session file locked') || msg.includes('.lock') || msg.includes('EBUSY');
        if (isLock && attempt < maxRetries) {
          this.logger.warn({ message: `Lock retry ${attempt + 1}/${maxRetries}: ${label}` });
          await new Promise((r) => setTimeout(r, delayMs));
          continue;
        }
        throw err;
      }
    }
    throw new Error(`Retry exhausted: ${label}`);
  }
}
