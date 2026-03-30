import { Injectable, inject, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { AuthService } from '../../../core/auth/auth.service';
import { environment } from '../../../../environments/environment';
import type {
  BrainProposalItem,
  BridgeAgentStatusPayload,
  BridgeTaskProgressPayload,
  ChatMessageChunk,
  ChatComplete,
  ChatErrorData,
  WorkflowPlanReadyPayload,
  WorkflowStepProgressPayload,
  WorkflowCompletePayload,
  WorkflowErrorPayload,
  WorkflowConversationsCreatedPayload,
  WorkflowStepConfirmationPayload,
  WorkflowStepAwaitingInputPayload,
  WorkflowStepMessagePayload,
  WorkflowNavigatePayload,
  YoloProgressPayload,
  YoloCompletePayload,
  ParallelPopuniStartPayload,
  ParallelPopuniProgressPayload,
  ParallelPopuniTaskDonePayload,
  ParallelPopuniBatchDonePayload,
  JobsPlannedPayload,
  AgentStatusChangePayload,
  AgentFormattingChunkPayload,
  AgentFormattingCompletePayload,
  AgentExecutingHeartbeatPayload,
  AgentResultPayload,
  AgentErrorPayload,
  AgentTextChunkPayload,
  AgentToolEventPayload,
  ProcessRunStartedPayload,
  ProcessStepPayload,
  ProcessCompletePayload,
  ProcessApprovalNeededPayload,
  ProcessCancelledPayload,
} from '@mentor-ai/shared/types';

interface MessageReceivedData {
  messageId: string;
  role: 'USER' | 'ASSISTANT';
}

type MessageDeletedCallback = (data: { messageId: string; conversationId: string }) => void;
type MessageReceivedCallback = (data: MessageReceivedData) => void;
type MessageChunkCallback = (data: ChatMessageChunk) => void;
type CompleteCallback = (data: ChatComplete) => void;
type ErrorCallback = (error: ChatErrorData) => void;
type NotesUpdatedCallback = (data: { conversationId: string; count: number }) => void;
type ConceptDetectedCallback = (data: {
  conversationId: string;
  conceptId: string;
  conceptName: string;
}) => void;
type PlanReadyCallback = (data: WorkflowPlanReadyPayload) => void;
type StepProgressCallback = (data: WorkflowStepProgressPayload) => void;
type WorkflowCompleteCallback = (data: WorkflowCompletePayload) => void;
type WorkflowErrorCallback = (data: WorkflowErrorPayload) => void;
type ConversationsCreatedCallback = (data: WorkflowConversationsCreatedPayload) => void;
type StepConfirmationCallback = (data: WorkflowStepConfirmationPayload) => void;
type StepAwaitingInputCallback = (data: WorkflowStepAwaitingInputPayload) => void;
type StepMessageCallback = (data: WorkflowStepMessagePayload) => void;
type NavigateToConversationCallback = (data: WorkflowNavigatePayload) => void;
type TasksCreatedForExecutionCallback = (data: {
  conversationId: string;
  taskIds: string[];
  reusedTaskIds?: string[];
  taskCount: number;
}) => void;
type YoloProgressCallback = (data: YoloProgressPayload) => void;
type YoloCompleteCallback = (data: YoloCompletePayload) => void;
type TasksDiscoveredCallback = (data: { conceptIds: string[]; conversationId: string }) => void;
type DiscoveryChunkCallback = (data: { chunk: string; index: number }) => void;
type DiscoveryCompleteCallback = (data: { fullContent: string }) => void;
type DiscoveryErrorCallback = (data: { message: string }) => void;
type TaskAiStartCallback = (data: { taskId: string; conversationId: string }) => void;
type TaskAiChunkCallback = (data: {
  taskId: string;
  conversationId: string;
  content: string;
  index: number;
}) => void;
type TaskAiCompleteCallback = (data: {
  taskId: string;
  fullContent: string;
  conversationId: string;
}) => void;
type TaskAiErrorCallback = (data: {
  taskId: string;
  conversationId: string;
  message: string;
}) => void;
type TaskResultStartCallback = (data: { taskId: string; conversationId: string | null }) => void;
type TaskResultChunkCallback = (data: {
  taskId: string;
  conversationId: string | null;
  content: string;
  index: number;
}) => void;
type TaskResultCompleteCallback = (data: {
  taskId: string;
  conversationId: string | null;
  score: number | null;
  finalResult: string;
}) => void;
type TaskResultErrorCallback = (data: {
  taskId: string;
  conversationId: string | null;
  message: string;
}) => void;
type ResearchPhaseCallback = (data: { phase: 'researching' | 'responding' }) => void;
type AutoPopuniStartCallback = (data: { taskIds: string[]; taskCount: number }) => void;
type AutoPopuniCompleteCallback = (data: { totalTasks: number; completedTasks: number }) => void;
type AutoPopuniTaskErrorCallback = (data: { taskId: string; message: string }) => void;
type ParallelPopuniStartCallback = (data: ParallelPopuniStartPayload) => void;
type ParallelPopuniProgressCallback = (data: ParallelPopuniProgressPayload) => void;
type ParallelPopuniTaskDoneCallback = (data: ParallelPopuniTaskDonePayload) => void;
type ParallelPopuniBatchDoneCallback = (data: ParallelPopuniBatchDonePayload) => void;
type JobsPlannedCallback = (data: JobsPlannedPayload) => void;
type TaskAiWorkflowStartCallback = (data: { taskId: string; conversationId: string; message: string; auto: boolean }) => void;
type TaskAiStepProgressCallback = (data: { taskId: string; conversationId: string; stepIndex: number; totalSteps: number; stepTitle: string; auto: boolean }) => void;
type TaskAiStepCompleteCallback = (data: { taskId: string; conversationId: string; stepIndex: number; totalSteps: number; stepTitle: string; auto: boolean }) => void;
type TaskScoringStartCallback = (data: { taskId: string }) => void;
type ExecutionReplayCompleteCallback = (data: { executionId: string; eventCount: number }) => void;
type AgentStatusChangeCallback = (data: AgentStatusChangePayload) => void;
type AgentFormattingChunkCallback = (data: AgentFormattingChunkPayload) => void;
type AgentFormattingCompleteCallback = (data: AgentFormattingCompletePayload) => void;
type AgentHeartbeatCallback = (data: AgentExecutingHeartbeatPayload) => void;
type AgentResultCallback = (data: AgentResultPayload) => void;
type AgentErrorCallback = (data: AgentErrorPayload) => void;
type AgentTextChunkCallback = (data: AgentTextChunkPayload) => void;
type AgentToolEventCallback = (data: AgentToolEventPayload) => void;
type DigestReadyCallback = (data: { title: string; timestamp: string }) => void;
type ScanCompleteCallback = (data: { runId: string; staleFound: number; reExecuted: number; tasksCompleted: number }) => void;
type InitProgressCallback = (data: { stage: string; persona: string; personaIndex: number; totalPersonas: number; assignedSoFar: number }) => void;
type StageInitializedCallback = (data: { stage: string; assignmentCount: number; noteCount: number }) => void;
type ExecutionProgressCallback = (data: { stage: string; total: number; executed: number; failed: number; current: { conceptId: string; conceptName: string; personaType: string } | null }) => void;
type ExecutionStartedCallback = (data: { stage: string; timestamp: string }) => void;
type ExecutionCompleteCallback = (data: { stage: string; total: number; executed: number; failed: number; timestamp: string }) => void;

/** Execution persistence types for reconnect resilience */
export interface ActiveExecution {
  id: string;
  type: string;
  status: string;
  planId: string | null;
  conversationId: string | null;
  checkpoint: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
}
export interface RecentCompletion {
  id: string;
  type: string;
  result: Record<string, unknown> | null;
  conversationId: string | null;
  updatedAt: string;
}
export interface ExecutionActiveState {
  active: ActiveExecution[];
  recentlyCompleted: RecentCompletion[];
}
type ExecutionActiveStateCallback = (data: ExecutionActiveState) => void;

/**
 * Service for managing WebSocket connection for real-time chat.
 * Handles streaming message chunks from AI responses.
 */
@Injectable({ providedIn: 'root' })
export class ChatWebsocketService {
  private socket: Socket | null = null;
  private readonly authService = inject(AuthService);

  /** Connection state — 'connected', 'disconnected', or 'reconnecting' */
  readonly connectionState$ = signal<'connected' | 'disconnected' | 'reconnecting'>('disconnected');

  /** Whether a workflow was active when disconnect happened */
  readonly wasWorkflowActive$ = signal(false);

  /** Last failed emit error for UI display */
  readonly lastEmitError$ = signal<string | null>(null);

  /** Tracked by chat component — set true during workflow execution */
  private _isWorkflowRunning = false;
  setWorkflowRunning(running: boolean): void {
    this._isWorkflowRunning = running;
  }

  /** Check connection before emit, set error signal if not connected */
  private checkConnected(action: string): boolean {
    if (!this.socket?.connected) {
      this.lastEmitError$.set(`Nije moguće: ${action} — veza nije aktivna`);
      return false;
    }
    return true;
  }

  private messageDeletedCallbacks: MessageDeletedCallback[] = [];
  private messageReceivedCallbacks: MessageReceivedCallback[] = [];
  private messageChunkCallbacks: MessageChunkCallback[] = [];
  private completeCallbacks: CompleteCallback[] = [];
  private errorCallbacks: ErrorCallback[] = [];
  private notesUpdatedCallbacks: NotesUpdatedCallback[] = [];
  private conceptDetectedCallbacks: ConceptDetectedCallback[] = [];
  private planReadyCallbacks: PlanReadyCallback[] = [];
  private stepProgressCallbacks: StepProgressCallback[] = [];
  private workflowCompleteCallbacks: WorkflowCompleteCallback[] = [];
  private workflowErrorCallbacks: WorkflowErrorCallback[] = [];
  private conversationsCreatedCallbacks: ConversationsCreatedCallback[] = [];
  private stepConfirmationCallbacks: StepConfirmationCallback[] = [];
  private stepAwaitingInputCallbacks: StepAwaitingInputCallback[] = [];
  private stepMessageCallbacks: StepMessageCallback[] = [];
  private navigateToConversationCallbacks: NavigateToConversationCallback[] = [];
  private tasksCreatedForExecutionCallbacks: TasksCreatedForExecutionCallback[] = [];
  private yoloProgressCallbacks: YoloProgressCallback[] = [];
  private yoloCompleteCallbacks: YoloCompleteCallback[] = [];
  private discoveryChunkCallbacks: DiscoveryChunkCallback[] = [];
  private discoveryCompleteCallbacks: DiscoveryCompleteCallback[] = [];
  private discoveryErrorCallbacks: DiscoveryErrorCallback[] = [];
  private tasksDiscoveredCallbacks: TasksDiscoveredCallback[] = [];
  private taskAiStartCallbacks: TaskAiStartCallback[] = [];
  private taskAiChunkCallbacks: TaskAiChunkCallback[] = [];
  private taskAiCompleteCallbacks: TaskAiCompleteCallback[] = [];
  private taskAiErrorCallbacks: TaskAiErrorCallback[] = [];
  private taskResultStartCallbacks: TaskResultStartCallback[] = [];
  private taskResultChunkCallbacks: TaskResultChunkCallback[] = [];
  private taskResultCompleteCallbacks: TaskResultCompleteCallback[] = [];
  private taskResultErrorCallbacks: TaskResultErrorCallback[] = [];
  private researchPhaseCallbacks: ResearchPhaseCallback[] = [];
  private autoPopuniStartCallbacks: AutoPopuniStartCallback[] = [];
  private autoPopuniCompleteCallbacks: AutoPopuniCompleteCallback[] = [];
  private autoPopuniTaskErrorCallbacks: AutoPopuniTaskErrorCallback[] = [];
  private executionActiveStateCallbacks: ExecutionActiveStateCallback[] = [];
  private parallelPopuniStartCallbacks: ParallelPopuniStartCallback[] = [];
  private parallelPopuniProgressCallbacks: ParallelPopuniProgressCallback[] = [];
  private parallelPopuniTaskDoneCallbacks: ParallelPopuniTaskDoneCallback[] = [];
  private parallelPopuniBatchDoneCallbacks: ParallelPopuniBatchDoneCallback[] = [];
  private jobsPlannedCallbacks: JobsPlannedCallback[] = [];
  private taskAiWorkflowStartCallbacks: TaskAiWorkflowStartCallback[] = [];
  private taskAiStepProgressCallbacks: TaskAiStepProgressCallback[] = [];
  private taskAiStepCompleteCallbacks: TaskAiStepCompleteCallback[] = [];
  private taskScoringStartCallbacks: TaskScoringStartCallback[] = [];
  private executionReplayCompleteCallbacks: ExecutionReplayCompleteCallback[] = [];
  private agentStatusChangeCallbacks: AgentStatusChangeCallback[] = [];
  private agentFormattingChunkCallbacks: AgentFormattingChunkCallback[] = [];
  private agentFormattingCompleteCallbacks: AgentFormattingCompleteCallback[] = [];
  private agentHeartbeatCallbacks: AgentHeartbeatCallback[] = [];
  private agentResultCallbacks: AgentResultCallback[] = [];
  private agentErrorCallbacks: AgentErrorCallback[] = [];
  private agentTextChunkCallbacks: AgentTextChunkCallback[] = [];
  private agentToolEventCallbacks: AgentToolEventCallback[] = [];
  private digestReadyCallbacks: DigestReadyCallback[] = [];
  private scanCompleteCallbacks: ScanCompleteCallback[] = [];
  private initProgressCallbacks: InitProgressCallback[] = [];
  private stageInitializedCallbacks: StageInitializedCallback[] = [];
  private executionProgressCallbacks: ExecutionProgressCallback[] = [];
  private executionStartedCallbacks: ExecutionStartedCallback[] = [];
  private executionCompleteCallbacks: ExecutionCompleteCallback[] = [];
  private agentConceptActivityCallbacks: Array<(data: { agentType: string; conceptId: string; status: string }) => void> = [];

  // ── Bridge event callbacks (Brain Architecture) ──
  private proposalNewCallbacks: Array<(data: { tenantId: string; proposal: Partial<BrainProposalItem> }) => void> = [];
  private proposalApprovedCallbacks: Array<(data: { tenantId: string; proposalId: string; title: string }) => void> = [];
  private bridgeTaskCreatedCallbacks: Array<(data: { tenantId: string; noteId: string; title: string; conceptId?: string }) => void> = [];
  private bridgeTaskContributionCallbacks: Array<(data: { tenantId: string; noteId: string; agentType: string; summary: string }) => void> = [];
  private bridgeTaskProgressCallbacks: Array<(data: BridgeTaskProgressPayload) => void> = [];
  private bridgeTaskCompleteCallbacks: Array<(data: { tenantId: string; noteId: string; score?: number }) => void> = [];
  private bridgeAgentStatusCallbacks: Array<(data: BridgeAgentStatusPayload) => void> = [];
  private bridgeTreeUpdatedCallbacks: Array<(data: { tenantId: string; action: string; conceptId: string; conceptName: string }) => void> = [];
  private bridgeConversationCreatedCallbacks: Array<(data: { tenantId: string; conversationId: string; conceptId: string; title: string }) => void> = [];
  private bridgeActionExecutingCallbacks: Array<(data: { tenantId: string; noteId: string; agentType: string; actionId: string }) => void> = [];
  private bridgeActionCompleteCallbacks: Array<(data: { tenantId: string; noteId: string; agentType: string; actionId: string; status: string }) => void> = [];

  // ── Process Workflow Engine callbacks ──
  private processRunStartedCallbacks: Array<(data: ProcessRunStartedPayload) => void> = [];
  private processStepStartedCallbacks: Array<(data: ProcessStepPayload) => void> = [];
  private processStepOutputCallbacks: Array<(data: ProcessStepPayload) => void> = [];
  private processStepFailedCallbacks: Array<(data: ProcessStepPayload) => void> = [];
  private processCompleteCallbacks: Array<(data: ProcessCompletePayload) => void> = [];
  private processApprovalNeededCallbacks: Array<(data: ProcessApprovalNeededPayload) => void> = [];
  private processCancelledCallbacks: Array<(data: ProcessCancelledPayload) => void> = [];

  /**
   * Connects to the WebSocket server.
   * Uses the current auth token for authentication.
   */
  async connect(): Promise<void> {
    // Already connected or connecting — don't interfere.
    // Socket.io handles reconnection internally.
    if (this.socket) return;

    const token = this.authService.getAccessToken();
    if (!token) {
      return;
    }

    const wsUrl = environment.apiUrl.replace(/^http/, 'ws');

    this.socket = io(`${wsUrl}/ws/chat`, {
      auth: { token },
      query: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    // Handle session expiration — server tells us the user no longer exists in DB
    this.socket.on('auth:session-expired', () => {
      localStorage.removeItem('mentor_ai_token');
      localStorage.removeItem('mentor_ai_user');
      localStorage.removeItem('mentor_ai_google_user');
      window.location.href = '/login';
    });

    // Connection state tracking
    this.socket.on('connect', () => {
      this.connectionState$.set('connected');
    });

    this.socket.on('disconnect', (_reason: string) => {
      this.connectionState$.set('disconnected');
      // Track if workflow was running when we disconnected
      if (this._isWorkflowRunning) {
        this.wasWorkflowActive$.set(true);
      }
    });

    this.socket.io.on('reconnect_attempt', () => {
      this.connectionState$.set('reconnecting');
    });

    this.socket.io.on('reconnect', () => {
      this.connectionState$.set('connected');
    });

    this.socket.io.on('reconnect_failed', () => {
      this.connectionState$.set('disconnected');
    });

    this.socket.on(
      'chat:message-deleted',
      (data: { messageId: string; conversationId: string }) => {
        this.messageDeletedCallbacks.forEach((cb) => cb(data));
      }
    );

    this.socket.on('chat:message-received', (data: MessageReceivedData) => {
      this.messageReceivedCallbacks.forEach((cb) => cb(data));
    });

    this.socket.on('chat:message-chunk', (data: ChatMessageChunk) => {
      this.messageChunkCallbacks.forEach((cb) => cb(data));
    });

    this.socket.on('chat:complete', (data: ChatComplete) => {
      this.completeCallbacks.forEach((cb) => cb(data));
    });

    this.socket.on('chat:research-phase', (data: { phase: 'researching' | 'responding' }) => {
      this.researchPhaseCallbacks.forEach((cb) => cb(data));
    });

    this.socket.on('chat:error', (error: ChatErrorData) => {
      this.errorCallbacks.forEach((cb) => cb(error));
    });

    this.socket.on('chat:notes-updated', (data: { conversationId: string; count: number }) => {
      this.notesUpdatedCallbacks.forEach((cb) => cb(data));
    });

    this.socket.on(
      'chat:concept-detected',
      (data: { conversationId: string; conceptId: string; conceptName: string }) => {
        this.conceptDetectedCallbacks.forEach((cb) => cb(data));
      }
    );

    this.socket.on('workflow:plan-ready', (data: WorkflowPlanReadyPayload) => {
      this.planReadyCallbacks.forEach((cb) => cb(data));
    });

    this.socket.on('workflow:step-progress', (data: WorkflowStepProgressPayload) => {
      this.stepProgressCallbacks.forEach((cb) => cb(data));
    });

    this.socket.on('workflow:complete', (data: WorkflowCompletePayload) => {
      this.workflowCompleteCallbacks.forEach((cb) => cb(data));
    });

    this.socket.on('workflow:error', (data: WorkflowErrorPayload) => {
      this.workflowErrorCallbacks.forEach((cb) => cb(data));
    });

    this.socket.on(
      'workflow:conversations-created',
      (data: WorkflowConversationsCreatedPayload) => {
        this.conversationsCreatedCallbacks.forEach((cb) => cb(data));
      }
    );

    this.socket.on(
      'workflow:step-awaiting-confirmation',
      (data: WorkflowStepConfirmationPayload) => {
        this.stepConfirmationCallbacks.forEach((cb) => cb(data));
      }
    );

    this.socket.on('workflow:step-awaiting-input', (data: WorkflowStepAwaitingInputPayload) => {
      this.stepAwaitingInputCallbacks.forEach((cb) => cb(data));
    });

    this.socket.on('workflow:step-message', (data: WorkflowStepMessagePayload) => {
      this.stepMessageCallbacks.forEach((cb) => cb(data));
    });

    this.socket.on('workflow:navigate-to-conversation', (data: WorkflowNavigatePayload) => {
      this.navigateToConversationCallbacks.forEach((cb) => cb(data));
    });

    this.socket.on(
      'chat:tasks-created-for-execution',
      (data: {
        conversationId: string;
        taskIds: string[];
        reusedTaskIds?: string[];
        taskCount: number;
      }) => {
        this.tasksCreatedForExecutionCallbacks.forEach((cb) => cb(data));
      }
    );

    this.socket.on('workflow:yolo-progress', (data: YoloProgressPayload) => {
      this.yoloProgressCallbacks.forEach((cb) => cb(data));
    });

    this.socket.on('workflow:yolo-complete', (data: YoloCompletePayload) => {
      this.yoloCompleteCallbacks.forEach((cb) => cb(data));
    });

    this.socket.on(
      'tree:tasks-discovered',
      (data: { conceptIds: string[]; conversationId: string }) => {
        this.tasksDiscoveredCallbacks.forEach((cb) => cb(data));
      }
    );

    this.socket.on('discovery:message-chunk', (data: { chunk: string; index: number }) => {
      this.discoveryChunkCallbacks.forEach((cb) => cb(data));
    });

    this.socket.on('discovery:message-complete', (data: { fullContent: string }) => {
      this.discoveryCompleteCallbacks.forEach((cb) => cb(data));
    });

    this.socket.on('discovery:error', (data: { message: string }) => {
      this.discoveryErrorCallbacks.forEach((cb) => cb(data));
    });

    this.socket.on('task:ai-start', (data: { taskId: string; conversationId: string }) => {
      this.taskAiStartCallbacks.forEach((cb) => cb(data));
    });

    this.socket.on(
      'task:ai-chunk',
      (data: { taskId: string; conversationId: string; content: string; index: number }) => {
        this.taskAiChunkCallbacks.forEach((cb) => cb(data));
      }
    );

    this.socket.on(
      'task:ai-complete',
      (data: { taskId: string; fullContent: string; conversationId: string }) => {
        this.taskAiCompleteCallbacks.forEach((cb) => cb(data));
      }
    );

    this.socket.on(
      'task:ai-error',
      (data: { taskId: string; conversationId: string; message: string }) => {
        this.taskAiErrorCallbacks.forEach((cb) => cb(data));
      }
    );

    this.socket.on(
      'task:result-start',
      (data: { taskId: string; conversationId: string | null }) => {
        this.taskResultStartCallbacks.forEach((cb) => cb(data));
      }
    );

    this.socket.on(
      'task:result-chunk',
      (data: { taskId: string; conversationId: string | null; content: string; index: number }) => {
        this.taskResultChunkCallbacks.forEach((cb) => cb(data));
      }
    );

    this.socket.on(
      'task:result-complete',
      (data: {
        taskId: string;
        conversationId: string | null;
        score: number | null;
        finalResult: string;
      }) => {
        this.taskResultCompleteCallbacks.forEach((cb) => cb(data));
      }
    );

    this.socket.on(
      'task:result-error',
      (data: { taskId: string; conversationId: string | null; message: string }) => {
        this.taskResultErrorCallbacks.forEach((cb) => cb(data));
      }
    );

    // Auto AI Popuni events
    this.socket.on('auto-popuni:start', (data: { taskIds: string[]; taskCount: number }) => {
      this.autoPopuniStartCallbacks.forEach((cb) => cb(data));
    });

    this.socket.on(
      'auto-popuni:complete',
      (data: { totalTasks: number; completedTasks: number }) => {
        this.autoPopuniCompleteCallbacks.forEach((cb) => cb(data));
      }
    );

    this.socket.on('auto-popuni:task-error', (data: { taskId: string; message: string }) => {
      this.autoPopuniTaskErrorCallbacks.forEach((cb) => cb(data));
    });

    // Parallel Popuni events
    this.socket.on('parallel-popuni:start', (data: ParallelPopuniStartPayload) => {
      this.parallelPopuniStartCallbacks.forEach((cb) => cb(data));
    });

    this.socket.on('parallel-popuni:task-progress', (data: ParallelPopuniProgressPayload) => {
      this.parallelPopuniProgressCallbacks.forEach((cb) => cb(data));
    });

    this.socket.on('parallel-popuni:task-done', (data: ParallelPopuniTaskDonePayload) => {
      this.parallelPopuniTaskDoneCallbacks.forEach((cb) => cb(data));
    });

    this.socket.on('parallel-popuni:batch-done', (data: ParallelPopuniBatchDonePayload) => {
      this.parallelPopuniBatchDoneCallbacks.forEach((cb) => cb(data));
    });

    // Execution persistence: active state response
    this.socket.on('execution:active-state', (data: ExecutionActiveState) => {
      this.executionActiveStateCallbacks.forEach((cb) => cb(data));
    });

    // Agent job pipeline: jobs planned after scoring
    this.socket.on('jobs:planned', (data: JobsPlannedPayload) => {
      this.jobsPlannedCallbacks.forEach((cb) => cb(data));
    });

    // Task AI workflow events (auto-popuni with per-step progress)
    this.socket.on('task:ai-workflow-start', (data: { taskId: string; conversationId: string; message: string; auto: boolean }) => {
      this.taskAiWorkflowStartCallbacks.forEach((cb) => cb(data));
    });

    this.socket.on('task:ai-step-progress', (data: { taskId: string; conversationId: string; stepIndex: number; totalSteps: number; stepTitle: string; auto: boolean }) => {
      this.taskAiStepProgressCallbacks.forEach((cb) => cb(data));
    });

    this.socket.on('task:ai-step-complete', (data: { taskId: string; conversationId: string; stepIndex: number; totalSteps: number; stepTitle: string; auto: boolean }) => {
      this.taskAiStepCompleteCallbacks.forEach((cb) => cb(data));
    });

    // Scoring start event
    this.socket.on('task:scoring-start', (data: { taskId: string }) => {
      this.taskScoringStartCallbacks.forEach((cb) => cb(data));
    });

    // Execution replay complete
    this.socket.on('execution:replay-complete', (data: { executionId: string; eventCount: number }) => {
      this.executionReplayCompleteCallbacks.forEach((cb) => cb(data));
    });

    // Agent execution streaming events
    // Use onAny as a catch-all to verify events arrive from the server
    this.socket.onAny((eventName: string, ...args: unknown[]) => {
      if (eventName.startsWith('agent:')) {
        console.debug('[WS:agent]', eventName, args[0] && typeof args[0] === 'object' ? (args[0] as Record<string, unknown>)['executionId'] : '');
      }
    });

    this.socket.on('agent:status-change', (data: AgentStatusChangePayload) => {
      this.agentStatusChangeCallbacks.forEach((cb) => cb(data));
    });

    this.socket.on('agent:formatting-chunk', (data: AgentFormattingChunkPayload) => {
      this.agentFormattingChunkCallbacks.forEach((cb) => cb(data));
    });

    this.socket.on('agent:formatting-complete', (data: AgentFormattingCompletePayload) => {
      this.agentFormattingCompleteCallbacks.forEach((cb) => cb(data));
    });

    this.socket.on('agent:executing-heartbeat', (data: AgentExecutingHeartbeatPayload) => {
      this.agentHeartbeatCallbacks.forEach((cb) => cb(data));
    });

    this.socket.on('agent:result', (data: AgentResultPayload) => {
      this.agentResultCallbacks.forEach((cb) => cb(data));
    });

    this.socket.on('agent:error', (data: AgentErrorPayload) => {
      this.agentErrorCallbacks.forEach((cb) => cb(data));
    });

    this.socket.on('agent:text-chunk', (data: AgentTextChunkPayload) => {
      this.agentTextChunkCallbacks.forEach((cb) => cb(data));
    });

    this.socket.on('agent:tool-event', (data: AgentToolEventPayload) => {
      this.agentToolEventCallbacks.forEach((cb) => cb(data));
    });

    // Autonomous maturity events
    this.socket.on('autonomous:digest-ready', (data: { title: string; timestamp: string }) => {
      this.digestReadyCallbacks.forEach((cb) => cb(data));
    });

    this.socket.on('autonomous:scan-complete', (data: { runId: string; staleFound: number; reExecuted: number; tasksCompleted: number }) => {
      this.scanCompleteCallbacks.forEach((cb) => cb(data));
    });

    // Maturity stage initialization + execution events
    this.socket.on('maturity:init-progress', (data: { stage: string; persona: string; personaIndex: number; totalPersonas: number; assignedSoFar: number }) => {
      this.initProgressCallbacks.forEach((cb) => cb(data));
    });
    this.socket.on('maturity:stage-initialized', (data: { stage: string; assignmentCount: number; noteCount: number }) => {
      this.stageInitializedCallbacks.forEach((cb) => cb(data));
    });
    this.socket.on('maturity:execution-started', (data: { stage: string; timestamp: string }) => {
      this.executionStartedCallbacks.forEach((cb) => cb(data));
    });
    this.socket.on('maturity:execution-progress', (data: any) => {
      this.executionProgressCallbacks.forEach((cb) => cb(data));
    });
    this.socket.on('maturity:execution-complete', (data: any) => {
      this.executionCompleteCallbacks.forEach((cb) => cb(data));
    });

    // Agent concept activity (for graph visualization)
    this.socket.on('agent:concept-activity', (data: { agentType: string; conceptId: string; status: string }) => {
      this.agentConceptActivityCallbacks.forEach((cb) => cb(data));
    });

    // ── Bridge events (Brain Architecture) ──
    // All callbacks wrapped in try-catch to prevent one failing callback from breaking the chain
    const safe = (callbacks: Array<(data: any) => void>, data: any) => {
      callbacks.forEach((cb) => { try { cb(data); } catch (e) { console.error('Bridge event callback error:', e); } });
    };
    this.socket.on('proposal:new', (data: any) => safe(this.proposalNewCallbacks, data));
    this.socket.on('proposal:approved', (data: any) => safe(this.proposalApprovedCallbacks, data));
    this.socket.on('task:created', (data: any) => safe(this.bridgeTaskCreatedCallbacks, data));
    this.socket.on('task:contribution', (data: any) => safe(this.bridgeTaskContributionCallbacks, data));
    this.socket.on('task:progress', (data: any) => safe(this.bridgeTaskProgressCallbacks, data));
    this.socket.on('task:complete', (data: any) => safe(this.bridgeTaskCompleteCallbacks, data));
    this.socket.on('agent:status', (data: any) => safe(this.bridgeAgentStatusCallbacks, data));
    this.socket.on('tree:updated', (data: any) => safe(this.bridgeTreeUpdatedCallbacks, data));
    this.socket.on('conversation:created', (data: any) => safe(this.bridgeConversationCreatedCallbacks, data));
    this.socket.on('action:executing', (data: any) => safe(this.bridgeActionExecutingCallbacks, data));
    this.socket.on('action:complete', (data: any) => safe(this.bridgeActionCompleteCallbacks, data));

    // Process Workflow Engine events
    this.socket.on('process:run-started', (data: any) => safe(this.processRunStartedCallbacks, data));
    this.socket.on('process:step-started', (data: any) => safe(this.processStepStartedCallbacks, data));
    this.socket.on('process:step-output', (data: any) => safe(this.processStepOutputCallbacks, data));
    this.socket.on('process:step-failed', (data: any) => safe(this.processStepFailedCallbacks, data));
    this.socket.on('process:complete', (data: any) => safe(this.processCompleteCallbacks, data));
    this.socket.on('process:approval-needed', (data: any) => safe(this.processApprovalNeededCallbacks, data));
    this.socket.on('process:cancelled', (data: any) => safe(this.processCancelledCallbacks, data));
  }

  /**
   * Returns a promise that resolves once the socket is connected.
   * If already connected, resolves immediately.
   */
  waitForConnection(timeoutMs = 10000): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.socket?.connected) {
        resolve();
        return;
      }
      const timer = setTimeout(() => {
        reject(new Error('WebSocket connection timeout'));
      }, timeoutMs);
      const check = () => {
        if (this.socket?.connected) {
          clearTimeout(timer);
          resolve();
        } else {
          setTimeout(check, 100);
        }
      };
      check();
    });
  }

  /**
   * Disconnects from the WebSocket server.
   * Does NOT clear callbacks — they persist for app-wide listeners (app-shell).
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
  }

  /**
   * Force a fresh reconnection (preserves registered callbacks).
   * Use for manual reconnect UI buttons.
   */
  forceReconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.connect();
  }

  /**
   * Sends a message to the server.
   * @param conversationId - Conversation to send message to
   * @param content - Message content
   * @returns true if message was sent, false if WebSocket not connected
   */
  sendMessage(conversationId: string, content: string, attachmentIds?: string[]): boolean {
    if (!this.checkConnected('slanje poruke')) {
      return false;
    }

    const payload: Record<string, unknown> = { conversationId, content };
    if (attachmentIds && attachmentIds.length > 0) {
      payload['attachmentIds'] = attachmentIds;
    }
    this.socket!.emit('chat:message-send', payload);
    return true;
  }

  regenerateResponse(conversationId: string): boolean {
    if (!this.checkConnected('regeneracija odgovora')) {
      return false;
    }
    this.socket!.emit('chat:regenerate', { conversationId });
    return true;
  }

  emitRunAgents(taskIds: string[], conversationId: string): void {
    if (!this.checkConnected('pokretanje agenata')) return;
    this.socket!.emit('workflow:run-agents', { taskIds, conversationId });
  }

  emitParallelPopuni(taskIds: string[], conversationId: string, autoPopuni?: boolean): void {
    if (!this.checkConnected('paralelno izvršavanje')) return;
    this.socket!.emit('workflow:parallel-popuni', { taskIds, conversationId, autoPopuni });
  }

  emitParallelPopuniCancel(batchId: string): void {
    if (!this.checkConnected('otkazivanje')) return;
    this.socket!.emit('parallel-popuni:cancel', { batchId });
  }

  emitGetPlan(planId: string, conversationId: string): void {
    if (!this.checkConnected('učitavanje plana')) return;
    this.socket!.emit('workflow:get-plan', { planId, conversationId });
  }

  emitWorkflowApproval(planId: string, approved: boolean, conversationId: string): void {
    if (!this.checkConnected('odobravanje plana')) return;
    this.socket!.emit('workflow:approve', { planId, approved, conversationId });
  }

  emitWorkflowCancel(planId: string, conversationId: string): void {
    if (!this.checkConnected('otkazivanje')) return;
    this.socket!.emit('workflow:cancel', { planId, conversationId });
  }

  emitStepContinue(planId: string, conversationId: string, userInput?: string): void {
    if (!this.checkConnected('nastavak koraka')) return;
    this.socket!.emit('workflow:step-continue', { planId, conversationId, userInput });
  }

  emitStartYolo(conversationId: string): void {
    if (!this.checkConnected('pokretanje YOLO režima')) return;
    this.socket!.emit('workflow:start-yolo', { conversationId });
  }

  /** Story 3.2: Start per-domain YOLO execution */
  emitStartDomainYolo(conversationId: string, category: string): void {
    if (!this.checkConnected('pokretanje YOLO režima')) return;
    this.socket!.emit('yolo:start-domain', { conversationId, category });
  }

  emitDiscoveryMessage(content: string): void {
    if (!this.checkConnected('slanje poruke')) return;
    this.socket!.emit('discovery:send-message', { content });
  }

  /** Story 3.11: Emit AI task execution request */
  emitExecuteTaskAi(taskId: string, conversationId: string): void {
    if (!this.checkConnected('izvršavanje zadatka')) return;
    this.socket!.emit('task:execute-ai', { taskId, conversationId });
  }

  /** Story 3.12: Emit task result submission request */
  emitSubmitTaskResult(taskId: string): void {
    if (!this.checkConnected('slanje rezultata')) return;
    this.socket!.emit('task:submit-result', { taskId });
  }

  /** Request active execution state from server (for reconnect resilience) */
  getActiveExecutions(): void {
    if (!this.checkConnected('provera aktivnih izvršavanja')) return;
    this.socket!.emit('execution:get-active');
  }

  /** Request replay of events since a timestamp for an execution */
  replayEvents(executionId: string, since?: string): void {
    if (!this.checkConnected('replay događaja')) return;
    this.socket!.emit('execution:replay-events', { executionId, since });
  }

  /**
   * Registers a callback for when a message is received by the server.
   * @param callback - Function to call with message data
   * @returns Unsubscribe function to remove the callback
   */
  onMessageDeleted(callback: MessageDeletedCallback): () => void {
    this.messageDeletedCallbacks.push(callback);
    return () => {
      const index = this.messageDeletedCallbacks.indexOf(callback);
      if (index > -1) this.messageDeletedCallbacks.splice(index, 1);
    };
  }

  onMessageReceived(callback: MessageReceivedCallback): () => void {
    this.messageReceivedCallbacks.push(callback);
    return () => {
      const index = this.messageReceivedCallbacks.indexOf(callback);
      if (index > -1) this.messageReceivedCallbacks.splice(index, 1);
    };
  }

  /**
   * Registers a callback for streaming message chunks.
   * @param callback - Function to call with each chunk
   * @returns Unsubscribe function to remove the callback
   */
  onMessageChunk(callback: MessageChunkCallback): () => void {
    this.messageChunkCallbacks.push(callback);
    return () => {
      const index = this.messageChunkCallbacks.indexOf(callback);
      if (index > -1) this.messageChunkCallbacks.splice(index, 1);
    };
  }

  /**
   * Registers a callback for when a message is complete.
   * @param callback - Function to call when complete
   * @returns Unsubscribe function to remove the callback
   */
  onComplete(callback: CompleteCallback): () => void {
    this.completeCallbacks.push(callback);
    return () => {
      const index = this.completeCallbacks.indexOf(callback);
      if (index > -1) this.completeCallbacks.splice(index, 1);
    };
  }

  onResearchPhase(callback: ResearchPhaseCallback): () => void {
    this.researchPhaseCallbacks.push(callback);
    return () => {
      const index = this.researchPhaseCallbacks.indexOf(callback);
      if (index > -1) this.researchPhaseCallbacks.splice(index, 1);
    };
  }

  /**
   * Registers a callback for errors.
   * @param callback - Function to call on error
   * @returns Unsubscribe function to remove the callback
   */
  onError(callback: ErrorCallback): () => void {
    this.errorCallbacks.push(callback);
    return () => {
      const index = this.errorCallbacks.indexOf(callback);
      if (index > -1) this.errorCallbacks.splice(index, 1);
    };
  }

  /**
   * Registers a callback for when notes are updated (auto-generated tasks).
   * @param callback - Function to call with notes update data
   * @returns Unsubscribe function to remove the callback
   */
  onNotesUpdated(callback: NotesUpdatedCallback): () => void {
    this.notesUpdatedCallbacks.push(callback);
    return () => {
      const index = this.notesUpdatedCallbacks.indexOf(callback);
      if (index > -1) this.notesUpdatedCallbacks.splice(index, 1);
    };
  }

  onTasksCreatedForExecution(callback: TasksCreatedForExecutionCallback): () => void {
    this.tasksCreatedForExecutionCallbacks.push(callback);
    return () => {
      const index = this.tasksCreatedForExecutionCallbacks.indexOf(callback);
      if (index > -1) this.tasksCreatedForExecutionCallbacks.splice(index, 1);
    };
  }

  /**
   * Registers a callback for when a conversation is auto-classified to a concept.
   * @param callback - Function to call with concept detection data
   * @returns Unsubscribe function to remove the callback
   */
  onConceptDetected(callback: ConceptDetectedCallback): () => void {
    this.conceptDetectedCallbacks.push(callback);
    return () => {
      const index = this.conceptDetectedCallbacks.indexOf(callback);
      if (index > -1) this.conceptDetectedCallbacks.splice(index, 1);
    };
  }

  onPlanReady(callback: PlanReadyCallback): () => void {
    this.planReadyCallbacks.push(callback);
    return () => {
      const index = this.planReadyCallbacks.indexOf(callback);
      if (index > -1) this.planReadyCallbacks.splice(index, 1);
    };
  }

  onStepProgress(callback: StepProgressCallback): () => void {
    this.stepProgressCallbacks.push(callback);
    return () => {
      const index = this.stepProgressCallbacks.indexOf(callback);
      if (index > -1) this.stepProgressCallbacks.splice(index, 1);
    };
  }

  onWorkflowComplete(callback: WorkflowCompleteCallback): () => void {
    this.workflowCompleteCallbacks.push(callback);
    return () => {
      const index = this.workflowCompleteCallbacks.indexOf(callback);
      if (index > -1) this.workflowCompleteCallbacks.splice(index, 1);
    };
  }

  onWorkflowError(callback: WorkflowErrorCallback): () => void {
    this.workflowErrorCallbacks.push(callback);
    return () => {
      const index = this.workflowErrorCallbacks.indexOf(callback);
      if (index > -1) this.workflowErrorCallbacks.splice(index, 1);
    };
  }

  onConversationsCreated(callback: ConversationsCreatedCallback): () => void {
    this.conversationsCreatedCallbacks.push(callback);
    return () => {
      const index = this.conversationsCreatedCallbacks.indexOf(callback);
      if (index > -1) this.conversationsCreatedCallbacks.splice(index, 1);
    };
  }

  onStepAwaitingConfirmation(callback: StepConfirmationCallback): () => void {
    this.stepConfirmationCallbacks.push(callback);
    return () => {
      const index = this.stepConfirmationCallbacks.indexOf(callback);
      if (index > -1) this.stepConfirmationCallbacks.splice(index, 1);
    };
  }

  onStepAwaitingInput(callback: StepAwaitingInputCallback): () => void {
    this.stepAwaitingInputCallbacks.push(callback);
    return () => {
      const index = this.stepAwaitingInputCallbacks.indexOf(callback);
      if (index > -1) this.stepAwaitingInputCallbacks.splice(index, 1);
    };
  }

  onStepMessage(callback: StepMessageCallback): () => void {
    this.stepMessageCallbacks.push(callback);
    return () => {
      const index = this.stepMessageCallbacks.indexOf(callback);
      if (index > -1) this.stepMessageCallbacks.splice(index, 1);
    };
  }

  onNavigateToConversation(callback: NavigateToConversationCallback): () => void {
    this.navigateToConversationCallbacks.push(callback);
    return () => {
      const index = this.navigateToConversationCallbacks.indexOf(callback);
      if (index > -1) this.navigateToConversationCallbacks.splice(index, 1);
    };
  }

  onYoloProgress(callback: YoloProgressCallback): () => void {
    this.yoloProgressCallbacks.push(callback);
    return () => {
      const index = this.yoloProgressCallbacks.indexOf(callback);
      if (index > -1) this.yoloProgressCallbacks.splice(index, 1);
    };
  }

  onYoloComplete(callback: YoloCompleteCallback): () => void {
    this.yoloCompleteCallbacks.push(callback);
    return () => {
      const index = this.yoloCompleteCallbacks.indexOf(callback);
      if (index > -1) this.yoloCompleteCallbacks.splice(index, 1);
    };
  }

  onDiscoveryChunk(callback: DiscoveryChunkCallback): () => void {
    this.discoveryChunkCallbacks.push(callback);
    return () => {
      const index = this.discoveryChunkCallbacks.indexOf(callback);
      if (index > -1) this.discoveryChunkCallbacks.splice(index, 1);
    };
  }

  onDiscoveryComplete(callback: DiscoveryCompleteCallback): () => void {
    this.discoveryCompleteCallbacks.push(callback);
    return () => {
      const index = this.discoveryCompleteCallbacks.indexOf(callback);
      if (index > -1) this.discoveryCompleteCallbacks.splice(index, 1);
    };
  }

  onDiscoveryError(callback: DiscoveryErrorCallback): () => void {
    this.discoveryErrorCallbacks.push(callback);
    return () => {
      const index = this.discoveryErrorCallbacks.indexOf(callback);
      if (index > -1) this.discoveryErrorCallbacks.splice(index, 1);
    };
  }

  onTasksDiscovered(callback: TasksDiscoveredCallback): () => void {
    this.tasksDiscoveredCallbacks.push(callback);
    return () => {
      const index = this.tasksDiscoveredCallbacks.indexOf(callback);
      if (index > -1) this.tasksDiscoveredCallbacks.splice(index, 1);
    };
  }

  onTaskAiStart(callback: TaskAiStartCallback): () => void {
    this.taskAiStartCallbacks.push(callback);
    return () => {
      const index = this.taskAiStartCallbacks.indexOf(callback);
      if (index > -1) this.taskAiStartCallbacks.splice(index, 1);
    };
  }

  onTaskAiChunk(callback: TaskAiChunkCallback): () => void {
    this.taskAiChunkCallbacks.push(callback);
    return () => {
      const index = this.taskAiChunkCallbacks.indexOf(callback);
      if (index > -1) this.taskAiChunkCallbacks.splice(index, 1);
    };
  }

  onTaskAiComplete(callback: TaskAiCompleteCallback): () => void {
    this.taskAiCompleteCallbacks.push(callback);
    return () => {
      const index = this.taskAiCompleteCallbacks.indexOf(callback);
      if (index > -1) this.taskAiCompleteCallbacks.splice(index, 1);
    };
  }

  onTaskAiError(callback: TaskAiErrorCallback): () => void {
    this.taskAiErrorCallbacks.push(callback);
    return () => {
      const index = this.taskAiErrorCallbacks.indexOf(callback);
      if (index > -1) this.taskAiErrorCallbacks.splice(index, 1);
    };
  }

  onTaskResultStart(callback: TaskResultStartCallback): () => void {
    this.taskResultStartCallbacks.push(callback);
    return () => {
      const index = this.taskResultStartCallbacks.indexOf(callback);
      if (index > -1) this.taskResultStartCallbacks.splice(index, 1);
    };
  }

  onTaskResultChunk(callback: TaskResultChunkCallback): () => void {
    this.taskResultChunkCallbacks.push(callback);
    return () => {
      const index = this.taskResultChunkCallbacks.indexOf(callback);
      if (index > -1) this.taskResultChunkCallbacks.splice(index, 1);
    };
  }

  onTaskResultComplete(callback: TaskResultCompleteCallback): () => void {
    this.taskResultCompleteCallbacks.push(callback);
    return () => {
      const index = this.taskResultCompleteCallbacks.indexOf(callback);
      if (index > -1) this.taskResultCompleteCallbacks.splice(index, 1);
    };
  }

  onTaskResultError(callback: TaskResultErrorCallback): () => void {
    this.taskResultErrorCallbacks.push(callback);
    return () => {
      const index = this.taskResultErrorCallbacks.indexOf(callback);
      if (index > -1) this.taskResultErrorCallbacks.splice(index, 1);
    };
  }

  onAutoPopuniStart(callback: AutoPopuniStartCallback): () => void {
    this.autoPopuniStartCallbacks.push(callback);
    return () => {
      const index = this.autoPopuniStartCallbacks.indexOf(callback);
      if (index > -1) this.autoPopuniStartCallbacks.splice(index, 1);
    };
  }

  onAutoPopuniComplete(callback: AutoPopuniCompleteCallback): () => void {
    this.autoPopuniCompleteCallbacks.push(callback);
    return () => {
      const index = this.autoPopuniCompleteCallbacks.indexOf(callback);
      if (index > -1) this.autoPopuniCompleteCallbacks.splice(index, 1);
    };
  }

  onAutoPopuniTaskError(callback: AutoPopuniTaskErrorCallback): () => void {
    this.autoPopuniTaskErrorCallbacks.push(callback);
    return () => {
      const index = this.autoPopuniTaskErrorCallbacks.indexOf(callback);
      if (index > -1) this.autoPopuniTaskErrorCallbacks.splice(index, 1);
    };
  }

  onExecutionActiveState(callback: ExecutionActiveStateCallback): () => void {
    this.executionActiveStateCallbacks.push(callback);
    return () => {
      const index = this.executionActiveStateCallbacks.indexOf(callback);
      if (index > -1) this.executionActiveStateCallbacks.splice(index, 1);
    };
  }

  onParallelPopuniStart(callback: ParallelPopuniStartCallback): () => void {
    this.parallelPopuniStartCallbacks.push(callback);
    return () => {
      const index = this.parallelPopuniStartCallbacks.indexOf(callback);
      if (index > -1) this.parallelPopuniStartCallbacks.splice(index, 1);
    };
  }

  onParallelPopuniProgress(callback: ParallelPopuniProgressCallback): () => void {
    this.parallelPopuniProgressCallbacks.push(callback);
    return () => {
      const index = this.parallelPopuniProgressCallbacks.indexOf(callback);
      if (index > -1) this.parallelPopuniProgressCallbacks.splice(index, 1);
    };
  }

  onParallelPopuniTaskDone(callback: ParallelPopuniTaskDoneCallback): () => void {
    this.parallelPopuniTaskDoneCallbacks.push(callback);
    return () => {
      const index = this.parallelPopuniTaskDoneCallbacks.indexOf(callback);
      if (index > -1) this.parallelPopuniTaskDoneCallbacks.splice(index, 1);
    };
  }

  onParallelPopuniBatchDone(callback: ParallelPopuniBatchDoneCallback): () => void {
    this.parallelPopuniBatchDoneCallbacks.push(callback);
    return () => {
      const index = this.parallelPopuniBatchDoneCallbacks.indexOf(callback);
      if (index > -1) this.parallelPopuniBatchDoneCallbacks.splice(index, 1);
    };
  }

  onJobsPlanned(callback: JobsPlannedCallback): () => void {
    this.jobsPlannedCallbacks.push(callback);
    return () => {
      const index = this.jobsPlannedCallbacks.indexOf(callback);
      if (index > -1) this.jobsPlannedCallbacks.splice(index, 1);
    };
  }

  onTaskAiWorkflowStart(callback: TaskAiWorkflowStartCallback): () => void {
    this.taskAiWorkflowStartCallbacks.push(callback);
    return () => {
      const index = this.taskAiWorkflowStartCallbacks.indexOf(callback);
      if (index > -1) this.taskAiWorkflowStartCallbacks.splice(index, 1);
    };
  }

  onTaskAiStepProgress(callback: TaskAiStepProgressCallback): () => void {
    this.taskAiStepProgressCallbacks.push(callback);
    return () => {
      const index = this.taskAiStepProgressCallbacks.indexOf(callback);
      if (index > -1) this.taskAiStepProgressCallbacks.splice(index, 1);
    };
  }

  onTaskAiStepComplete(callback: TaskAiStepCompleteCallback): () => void {
    this.taskAiStepCompleteCallbacks.push(callback);
    return () => {
      const index = this.taskAiStepCompleteCallbacks.indexOf(callback);
      if (index > -1) this.taskAiStepCompleteCallbacks.splice(index, 1);
    };
  }

  onTaskScoringStart(callback: TaskScoringStartCallback): () => void {
    this.taskScoringStartCallbacks.push(callback);
    return () => {
      const index = this.taskScoringStartCallbacks.indexOf(callback);
      if (index > -1) this.taskScoringStartCallbacks.splice(index, 1);
    };
  }

  onExecutionReplayComplete(callback: ExecutionReplayCompleteCallback): () => void {
    this.executionReplayCompleteCallbacks.push(callback);
    return () => {
      const index = this.executionReplayCompleteCallbacks.indexOf(callback);
      if (index > -1) this.executionReplayCompleteCallbacks.splice(index, 1);
    };
  }

  onAgentStatusChange(callback: AgentStatusChangeCallback): () => void {
    this.agentStatusChangeCallbacks.push(callback);
    return () => {
      const index = this.agentStatusChangeCallbacks.indexOf(callback);
      if (index > -1) this.agentStatusChangeCallbacks.splice(index, 1);
    };
  }

  onAgentFormattingChunk(callback: AgentFormattingChunkCallback): () => void {
    this.agentFormattingChunkCallbacks.push(callback);
    return () => {
      const index = this.agentFormattingChunkCallbacks.indexOf(callback);
      if (index > -1) this.agentFormattingChunkCallbacks.splice(index, 1);
    };
  }

  onAgentFormattingComplete(callback: AgentFormattingCompleteCallback): () => void {
    this.agentFormattingCompleteCallbacks.push(callback);
    return () => {
      const index = this.agentFormattingCompleteCallbacks.indexOf(callback);
      if (index > -1) this.agentFormattingCompleteCallbacks.splice(index, 1);
    };
  }

  onAgentHeartbeat(callback: AgentHeartbeatCallback): () => void {
    this.agentHeartbeatCallbacks.push(callback);
    return () => {
      const index = this.agentHeartbeatCallbacks.indexOf(callback);
      if (index > -1) this.agentHeartbeatCallbacks.splice(index, 1);
    };
  }

  onAgentResult(callback: AgentResultCallback): () => void {
    this.agentResultCallbacks.push(callback);
    return () => {
      const index = this.agentResultCallbacks.indexOf(callback);
      if (index > -1) this.agentResultCallbacks.splice(index, 1);
    };
  }

  onAgentError(callback: AgentErrorCallback): () => void {
    this.agentErrorCallbacks.push(callback);
    return () => {
      const index = this.agentErrorCallbacks.indexOf(callback);
      if (index > -1) this.agentErrorCallbacks.splice(index, 1);
    };
  }

  onAgentTextChunk(callback: AgentTextChunkCallback): () => void {
    this.agentTextChunkCallbacks.push(callback);
    return () => {
      const index = this.agentTextChunkCallbacks.indexOf(callback);
      if (index > -1) this.agentTextChunkCallbacks.splice(index, 1);
    };
  }

  onAgentToolEvent(callback: AgentToolEventCallback): () => void {
    this.agentToolEventCallbacks.push(callback);
    return () => {
      const index = this.agentToolEventCallbacks.indexOf(callback);
      if (index > -1) this.agentToolEventCallbacks.splice(index, 1);
    };
  }

  onDigestReady(callback: DigestReadyCallback): () => void {
    this.digestReadyCallbacks.push(callback);
    return () => {
      const index = this.digestReadyCallbacks.indexOf(callback);
      if (index > -1) this.digestReadyCallbacks.splice(index, 1);
    };
  }

  onScanComplete(callback: ScanCompleteCallback): () => void {
    this.scanCompleteCallbacks.push(callback);
    return () => {
      const index = this.scanCompleteCallbacks.indexOf(callback);
      if (index > -1) this.scanCompleteCallbacks.splice(index, 1);
    };
  }

  onInitProgress(callback: InitProgressCallback): () => void {
    this.initProgressCallbacks.push(callback);
    return () => {
      const index = this.initProgressCallbacks.indexOf(callback);
      if (index > -1) this.initProgressCallbacks.splice(index, 1);
    };
  }

  onStageInitialized(callback: StageInitializedCallback): () => void {
    this.stageInitializedCallbacks.push(callback);
    return () => {
      const index = this.stageInitializedCallbacks.indexOf(callback);
      if (index > -1) this.stageInitializedCallbacks.splice(index, 1);
    };
  }

  onExecutionStarted(callback: ExecutionStartedCallback): () => void {
    this.executionStartedCallbacks.push(callback);
    return () => {
      const index = this.executionStartedCallbacks.indexOf(callback);
      if (index > -1) this.executionStartedCallbacks.splice(index, 1);
    };
  }

  onExecutionProgress(callback: ExecutionProgressCallback): () => void {
    this.executionProgressCallbacks.push(callback);
    return () => {
      const index = this.executionProgressCallbacks.indexOf(callback);
      if (index > -1) this.executionProgressCallbacks.splice(index, 1);
    };
  }

  onExecutionComplete(callback: ExecutionCompleteCallback): () => void {
    this.executionCompleteCallbacks.push(callback);
    return () => {
      const index = this.executionCompleteCallbacks.indexOf(callback);
      if (index > -1) this.executionCompleteCallbacks.splice(index, 1);
    };
  }

  onAgentConceptActivity(callback: (data: { agentType: string; conceptId: string; status: string }) => void): () => void {
    this.agentConceptActivityCallbacks.push(callback);
    return () => {
      const index = this.agentConceptActivityCallbacks.indexOf(callback);
      if (index > -1) this.agentConceptActivityCallbacks.splice(index, 1);
    };
  }

  // ── Bridge event registration (Brain Architecture) ──

  onProposalNew(callback: (typeof this.proposalNewCallbacks)[number]): () => void {
    this.proposalNewCallbacks.push(callback);
    return () => { const i = this.proposalNewCallbacks.indexOf(callback); if (i > -1) this.proposalNewCallbacks.splice(i, 1); };
  }

  onProposalApproved(callback: (typeof this.proposalApprovedCallbacks)[number]): () => void {
    this.proposalApprovedCallbacks.push(callback);
    return () => { const i = this.proposalApprovedCallbacks.indexOf(callback); if (i > -1) this.proposalApprovedCallbacks.splice(i, 1); };
  }

  onBridgeTaskCreated(callback: (typeof this.bridgeTaskCreatedCallbacks)[number]): () => void {
    this.bridgeTaskCreatedCallbacks.push(callback);
    return () => { const i = this.bridgeTaskCreatedCallbacks.indexOf(callback); if (i > -1) this.bridgeTaskCreatedCallbacks.splice(i, 1); };
  }

  onBridgeTaskContribution(callback: (typeof this.bridgeTaskContributionCallbacks)[number]): () => void {
    this.bridgeTaskContributionCallbacks.push(callback);
    return () => { const i = this.bridgeTaskContributionCallbacks.indexOf(callback); if (i > -1) this.bridgeTaskContributionCallbacks.splice(i, 1); };
  }

  onBridgeTaskProgress(callback: (typeof this.bridgeTaskProgressCallbacks)[number]): () => void {
    this.bridgeTaskProgressCallbacks.push(callback);
    return () => { const i = this.bridgeTaskProgressCallbacks.indexOf(callback); if (i > -1) this.bridgeTaskProgressCallbacks.splice(i, 1); };
  }

  onBridgeTaskComplete(callback: (typeof this.bridgeTaskCompleteCallbacks)[number]): () => void {
    this.bridgeTaskCompleteCallbacks.push(callback);
    return () => { const i = this.bridgeTaskCompleteCallbacks.indexOf(callback); if (i > -1) this.bridgeTaskCompleteCallbacks.splice(i, 1); };
  }

  onBridgeAgentStatus(callback: (typeof this.bridgeAgentStatusCallbacks)[number]): () => void {
    this.bridgeAgentStatusCallbacks.push(callback);
    return () => { const i = this.bridgeAgentStatusCallbacks.indexOf(callback); if (i > -1) this.bridgeAgentStatusCallbacks.splice(i, 1); };
  }

  onBridgeTreeUpdated(callback: (typeof this.bridgeTreeUpdatedCallbacks)[number]): () => void {
    this.bridgeTreeUpdatedCallbacks.push(callback);
    return () => { const i = this.bridgeTreeUpdatedCallbacks.indexOf(callback); if (i > -1) this.bridgeTreeUpdatedCallbacks.splice(i, 1); };
  }

  onBridgeConversationCreated(callback: (typeof this.bridgeConversationCreatedCallbacks)[number]): () => void {
    this.bridgeConversationCreatedCallbacks.push(callback);
    return () => { const i = this.bridgeConversationCreatedCallbacks.indexOf(callback); if (i > -1) this.bridgeConversationCreatedCallbacks.splice(i, 1); };
  }

  onBridgeActionExecuting(callback: (typeof this.bridgeActionExecutingCallbacks)[number]): () => void {
    this.bridgeActionExecutingCallbacks.push(callback);
    return () => { const i = this.bridgeActionExecutingCallbacks.indexOf(callback); if (i > -1) this.bridgeActionExecutingCallbacks.splice(i, 1); };
  }

  onBridgeActionComplete(callback: (typeof this.bridgeActionCompleteCallbacks)[number]): () => void {
    this.bridgeActionCompleteCallbacks.push(callback);
    return () => { const i = this.bridgeActionCompleteCallbacks.indexOf(callback); if (i > -1) this.bridgeActionCompleteCallbacks.splice(i, 1); };
  }

  // ── Process Workflow Engine event registration ──

  onProcessRunStarted(callback: (typeof this.processRunStartedCallbacks)[number]): () => void {
    this.processRunStartedCallbacks.push(callback);
    return () => { const i = this.processRunStartedCallbacks.indexOf(callback); if (i > -1) this.processRunStartedCallbacks.splice(i, 1); };
  }

  onProcessStepStarted(callback: (typeof this.processStepStartedCallbacks)[number]): () => void {
    this.processStepStartedCallbacks.push(callback);
    return () => { const i = this.processStepStartedCallbacks.indexOf(callback); if (i > -1) this.processStepStartedCallbacks.splice(i, 1); };
  }

  onProcessStepOutput(callback: (typeof this.processStepOutputCallbacks)[number]): () => void {
    this.processStepOutputCallbacks.push(callback);
    return () => { const i = this.processStepOutputCallbacks.indexOf(callback); if (i > -1) this.processStepOutputCallbacks.splice(i, 1); };
  }

  onProcessStepFailed(callback: (typeof this.processStepFailedCallbacks)[number]): () => void {
    this.processStepFailedCallbacks.push(callback);
    return () => { const i = this.processStepFailedCallbacks.indexOf(callback); if (i > -1) this.processStepFailedCallbacks.splice(i, 1); };
  }

  onProcessComplete(callback: (typeof this.processCompleteCallbacks)[number]): () => void {
    this.processCompleteCallbacks.push(callback);
    return () => { const i = this.processCompleteCallbacks.indexOf(callback); if (i > -1) this.processCompleteCallbacks.splice(i, 1); };
  }

  onProcessApprovalNeeded(callback: (typeof this.processApprovalNeededCallbacks)[number]): () => void {
    this.processApprovalNeededCallbacks.push(callback);
    return () => { const i = this.processApprovalNeededCallbacks.indexOf(callback); if (i > -1) this.processApprovalNeededCallbacks.splice(i, 1); };
  }

  onProcessCancelled(callback: (typeof this.processCancelledCallbacks)[number]): () => void {
    this.processCancelledCallbacks.push(callback);
    return () => { const i = this.processCancelledCallbacks.indexOf(callback); if (i > -1) this.processCancelledCallbacks.splice(i, 1); };
  }

  clearCallbacks(): void {
    // H6: Include messageDeletedCallbacks in cleanup to prevent accumulation on reconnect
    this.messageDeletedCallbacks = [];
    this.messageReceivedCallbacks = [];
    this.messageChunkCallbacks = [];
    this.completeCallbacks = [];
    this.errorCallbacks = [];
    this.notesUpdatedCallbacks = [];
    this.conceptDetectedCallbacks = [];
    this.planReadyCallbacks = [];
    this.stepProgressCallbacks = [];
    this.workflowCompleteCallbacks = [];
    this.workflowErrorCallbacks = [];
    this.conversationsCreatedCallbacks = [];
    this.stepConfirmationCallbacks = [];
    this.stepAwaitingInputCallbacks = [];
    this.stepMessageCallbacks = [];
    this.navigateToConversationCallbacks = [];
    this.tasksCreatedForExecutionCallbacks = [];
    this.yoloProgressCallbacks = [];
    this.yoloCompleteCallbacks = [];
    this.discoveryChunkCallbacks = [];
    this.discoveryCompleteCallbacks = [];
    this.discoveryErrorCallbacks = [];
    this.tasksDiscoveredCallbacks = [];
    this.taskAiStartCallbacks = [];
    this.taskAiChunkCallbacks = [];
    this.taskAiCompleteCallbacks = [];
    this.taskAiErrorCallbacks = [];
    this.taskResultStartCallbacks = [];
    this.taskResultChunkCallbacks = [];
    this.taskResultCompleteCallbacks = [];
    this.taskResultErrorCallbacks = [];
    this.researchPhaseCallbacks = [];
    this.autoPopuniStartCallbacks = [];
    this.autoPopuniCompleteCallbacks = [];
    this.autoPopuniTaskErrorCallbacks = [];
    this.executionActiveStateCallbacks = [];
    this.parallelPopuniStartCallbacks = [];
    this.parallelPopuniProgressCallbacks = [];
    this.parallelPopuniTaskDoneCallbacks = [];
    this.parallelPopuniBatchDoneCallbacks = [];
    this.jobsPlannedCallbacks = [];
    this.taskAiWorkflowStartCallbacks = [];
    this.taskAiStepProgressCallbacks = [];
    this.taskAiStepCompleteCallbacks = [];
    this.taskScoringStartCallbacks = [];
    this.executionReplayCompleteCallbacks = [];
    this.agentStatusChangeCallbacks = [];
    this.agentFormattingChunkCallbacks = [];
    this.agentFormattingCompleteCallbacks = [];
    this.agentHeartbeatCallbacks = [];
    this.agentResultCallbacks = [];
    this.agentErrorCallbacks = [];
    this.agentTextChunkCallbacks = [];
    this.agentToolEventCallbacks = [];
    this.digestReadyCallbacks = [];
    this.scanCompleteCallbacks = [];
    this.initProgressCallbacks = [];
    this.stageInitializedCallbacks = [];
    this.executionProgressCallbacks = [];
    this.executionStartedCallbacks = [];
    this.executionCompleteCallbacks = [];
    this.agentConceptActivityCallbacks = [];
    // Bridge callbacks
    this.proposalNewCallbacks = [];
    this.proposalApprovedCallbacks = [];
    this.bridgeTaskCreatedCallbacks = [];
    this.bridgeTaskContributionCallbacks = [];
    this.bridgeTaskProgressCallbacks = [];
    this.bridgeTaskCompleteCallbacks = [];
    this.bridgeAgentStatusCallbacks = [];
    this.bridgeTreeUpdatedCallbacks = [];
    this.bridgeConversationCreatedCallbacks = [];
    this.bridgeActionExecutingCallbacks = [];
    this.bridgeActionCompleteCallbacks = [];
    // Process Workflow Engine
    this.processRunStartedCallbacks = [];
    this.processStepStartedCallbacks = [];
    this.processStepOutputCallbacks = [];
    this.processStepFailedCallbacks = [];
    this.processCompleteCallbacks = [];
    this.processApprovalNeededCallbacks = [];
    this.processCancelledCallbacks = [];
  }
}
