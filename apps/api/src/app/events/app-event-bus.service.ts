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

@Injectable()
export class AppEventBus {
  private readonly logger = new Logger(AppEventBus.name);

  constructor(private readonly eventEmitter: EventEmitter2) {}

  /**
   * Emit an event through the centralized bus.
   * All events are logged for observability.
   */
  emit(event: string, payload: Record<string, unknown>): void {
    this.logger.debug({
      message: `Event: ${event}`,
      tenantId: payload['tenantId'],
      ...this.extractLogFields(payload),
    });
    this.eventEmitter.emit(event, payload);
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

  private extractLogFields(payload: Record<string, unknown>): Record<string, unknown> {
    const fields: Record<string, unknown> = {};
    if (payload['conceptId']) fields['conceptId'] = payload['conceptId'];
    if (payload['jobId']) fields['jobId'] = payload['jobId'];
    if (payload['agentType']) fields['agentType'] = payload['agentType'];
    if (payload['status']) fields['status'] = payload['status'];
    return fields;
  }
}
