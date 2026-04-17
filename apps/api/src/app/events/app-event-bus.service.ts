import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';

/**
 * Centralized Application Event Bus
 *
 * ALL application events flow through here. This is the single source of truth
 * for event-driven orchestration. No more setTimeout hacks, polling loops,
 * or fire-and-forget promises scattered across services.
 *
 * Event categories:
 * - note.*         : Note CRUD lifecycle
 * - conversation.* : Conversation and message lifecycle
 * - onboarding.*   : Onboarding completion
 * - workflow.*     : Workflow execution lifecycle
 * - maturity.*     : Stage execution lifecycle
 * - concept.*      : Concept/task lifecycle
 * - agent.*        : Agent job execution lifecycle
 * - knowledge.*    : Knowledge update lifecycle
 * - system.*       : System health events
 */

// ─── Event Types ───

export interface NoteCreatedEvent {
  tenantId: string;
  noteId: string;
  userId: string;
  noteType: string;
  source: string;
  conceptId?: string;
  conversationId?: string;
}

export interface NoteUpdatedEvent {
  tenantId: string;
  noteId: string;
  userId?: string;
  title?: string;
  content?: string;
}

export interface NoteStatusChangedEvent {
  tenantId: string;
  noteId: string;
  userId?: string;
  previousStatus: string | null;
  newStatus: string;
}

export interface ConversationCreatedEvent {
  tenantId: string;
  conversationId: string;
  userId: string;
  personaType?: string;
  conceptId?: string;
}

export interface ConversationMessageAddedEvent {
  tenantId: string;
  conversationId: string;
  messageId: string;
  role: string;
  userId: string;
}

export interface OnboardingCompletedEvent {
  tenantId: string;
  userId: string;
  taskId: string;
  noteId: string;
  timeSavedMinutes: number;
  welcomeConversationId?: string;
}

export interface WorkflowStepCompletedEvent {
  tenantId: string;
  planId: string;
  stepId: string;
  conceptId: string;
  conceptName: string;
  userId: string;
  stepNumber: number;
  totalSteps: number;
}

export interface WorkflowCompletedEvent {
  tenantId: string;
  planId: string;
  userId: string;
  status: 'completed' | 'cancelled';
  completedSteps: number;
  totalSteps: number;
}

export interface ConceptCompletedEvent {
  tenantId: string;
  conceptId: string;
  noteId: string;
  userId: string;
  stage: string;
  personaType: string;
  success: boolean;
  error?: string;
}

export interface WaveCompletedEvent {
  tenantId: string;
  stage: string;
  userId: string;
  waveNumber: number;
  completed: number;
  failed: number;
  remaining: number;
}

export interface AgentJobCompletedEvent {
  tenantId: string;
  jobId: string;
  noteId: string;
  agentType: string;
  success: boolean;
  output?: string;
  durationMs?: number;
  error?: string;
}

export interface AgentJobStuckEvent {
  tenantId: string;
  executionId: string;
  jobId?: string;
  agentType: string;
  stuckDurationMs: number;
}

export interface KnowledgeUpdateEvent {
  tenantId: string;
  conceptName: string;
  agentTypes: string[];
  summary: string;
  companyName: string;
  personaType?: string;
}

export interface StageExecutionEvent {
  tenantId: string;
  stage: string;
  userId: string;
  status: 'started' | 'completed' | 'failed' | 'stalled';
  total?: number;
  executed?: number;
  failed?: number;
}

// ─── Event Names (constants for type safety) ───

export const APP_EVENTS = {
  // Note lifecycle
  NOTE_CREATED: 'note.created',
  NOTE_UPDATED: 'note.updated',
  NOTE_STATUS_CHANGED: 'note.status-changed',

  // Conversation lifecycle
  CONVERSATION_CREATED: 'conversation.created',
  CONVERSATION_MESSAGE_ADDED: 'conversation.message-added',

  // Onboarding
  ONBOARDING_COMPLETED: 'onboarding.completed',

  // Workflow execution
  WORKFLOW_STEP_COMPLETED: 'workflow.step-completed',
  WORKFLOW_COMPLETED: 'workflow.completed',

  // Concept lifecycle
  CONCEPT_COMPLETED: 'concept.completed',
  CONCEPT_FAILED: 'concept.failed',

  // Wave lifecycle
  WAVE_COMPLETED: 'wave.completed',
  WAVE_STALLED: 'wave.stalled',

  // Agent lifecycle
  AGENT_JOB_COMPLETED: 'agent.job.completed',
  AGENT_JOB_FAILED: 'agent.job.failed',
  AGENT_JOB_STUCK: 'agent.job.stuck',

  // Knowledge
  KNOWLEDGE_UPDATE_NEEDED: 'knowledge.update.needed',
  KNOWLEDGE_UPDATE_COMPLETED: 'knowledge.update.completed',

  // Stage execution
  STAGE_EXECUTION_STARTED: 'stage.execution.started',
  STAGE_EXECUTION_COMPLETED: 'stage.execution.completed',
  STAGE_EXECUTION_CONTINUE: 'stage.execution.continue',

  // System
  SYSTEM_HEALTH_CHECK: 'system.health.check',
} as const;

/**
 * Batched event entry for high-frequency events (claude-code: SerialBatchEventUploader pattern).
 * Progress events are batched to prevent WebSocket flooding during heavy agent activity.
 */
interface BatchedEvent {
  event: string;
  payload: Record<string, unknown>;
  timestamp: number;
}

@Injectable()
export class AppEventBus {
  private readonly logger = new Logger(AppEventBus.name);

  /** High-frequency event patterns that should be batched (100ms window) */
  private static readonly BATCHED_PATTERNS = ['step-progress'];

  /** Batch state: claude-code coalescing pattern — 1 flush timer, pending batch */
  private pendingBatch: BatchedEvent[] = [];
  private batchTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly BATCH_WINDOW_MS = 100;
  private readonly MAX_BATCH_SIZE = 15;

  constructor(private readonly eventEmitter: EventEmitter2) {}

  /**
   * Emit an event through the centralized bus.
   * High-frequency events (step-progress) are batched; others emit immediately.
   */
  emit(event: string, payload: Record<string, unknown>): void {
    // Check if this event should be batched
    if (AppEventBus.BATCHED_PATTERNS.some(p => event.includes(p))) {
      this.enqueueBatch(event, payload);
      return;
    }

    this.logger.debug({
      message: `Event: ${event}`,
      tenantId: payload['tenantId'],
      ...this.extractLogFields(payload),
    });
    this.eventEmitter.emit(event, payload);
  }

  /**
   * Enqueue event into batch buffer (claude-code: SerialBatchEventUploader).
   * Flushes after 100ms window or when batch reaches max size.
   */
  private enqueueBatch(event: string, payload: Record<string, unknown>): void {
    this.pendingBatch.push({ event, payload, timestamp: Date.now() });

    if (this.pendingBatch.length >= this.MAX_BATCH_SIZE) {
      this.flushBatch();
    } else if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => this.flushBatch(), this.BATCH_WINDOW_MS);
    }
  }

  /**
   * Flush pending batch as a single 'bridge.batch' event.
   * WebSocket gateway receives one message with N events instead of N messages.
   */
  private flushBatch(): void {
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    if (this.pendingBatch.length === 0) return;

    const batch = this.pendingBatch;
    this.pendingBatch = [];

    // Emit individual events for backend handlers (they expect individual events)
    for (const entry of batch) {
      this.eventEmitter.emit(entry.event, entry.payload);
    }

    // Also emit a batched version for WebSocket gateway (single message)
    this.eventEmitter.emit('bridge.batch', {
      events: batch,
      tenantId: batch[0]?.payload['tenantId'],
    });
  }

  /**
   * Emit and wait for all handlers to complete.
   * Use for events where ordering matters.
   */
  async emitAsync(event: string, payload: Record<string, unknown>): Promise<void> {
    this.logger.debug({
      message: `Event (async): ${event}`,
      tenantId: payload['tenantId'],
    });
    await this.eventEmitter.emitAsync(event, payload);
  }

  /**
   * Subscribe to an event. Returns unsubscribe function for cleanup.
   */
  on(event: string, handler: (payload: Record<string, unknown>) => void): () => void {
    this.eventEmitter.on(event, handler);
    return () => this.eventEmitter.off(event, handler);
  }

  private extractLogFields(payload: Record<string, unknown>): Record<string, unknown> {
    const fields: Record<string, unknown> = {};
    if (payload['conceptId']) fields['conceptId'] = payload['conceptId'];
    if (payload['jobId']) fields['jobId'] = payload['jobId'];
    if (payload['agentType']) fields['agentType'] = payload['agentType'];
    if (payload['status']) fields['status'] = payload['status'];
    return fields;
  }
}
