import { Injectable, inject, signal } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { AuthService } from '../../../core/auth/auth.service';
import { environment } from '../../../../environments/environment';
import type {
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
} from '@mentor-ai/shared/types';

interface MessageReceivedData {
  messageId: string;
  role: 'USER' | 'ASSISTANT';
}

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

  /**
   * Connects to the WebSocket server.
   * Uses the current auth token for authentication.
   */
  async connect(): Promise<void> {
    if (this.socket?.connected) return;

    // Cleanup old socket listeners to prevent duplicates on reconnect
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    // Clear callbacks from previous connection to prevent accumulation on reconnect
    this.clearCallbacks();

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

    this.socket.on('chat:message-received', (data: MessageReceivedData) => {
      this.messageReceivedCallbacks.forEach((cb) => cb(data));
    });

    this.socket.on('chat:message-chunk', (data: ChatMessageChunk) => {
      this.messageChunkCallbacks.forEach((cb) => cb(data));
    });

    this.socket.on('chat:complete', (data: ChatComplete) => {
      this.completeCallbacks.forEach((cb) => cb(data));
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
      (data: { conversationId: string; taskIds: string[]; taskCount: number }) => {
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
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    this.clearCallbacks();
  }

  /**
   * Sends a message to the server.
   * @param conversationId - Conversation to send message to
   * @param content - Message content
   * @returns true if message was sent, false if WebSocket not connected
   */
  sendMessage(conversationId: string, content: string): boolean {
    if (!this.checkConnected('slanje poruke')) {
      return false;
    }

    this.socket!.emit('chat:message-send', { conversationId, content });
    return true;
  }

  emitRunAgents(taskIds: string[], conversationId: string): void {
    if (!this.checkConnected('pokretanje agenata')) return;
    this.socket!.emit('workflow:run-agents', { taskIds, conversationId });
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

  /**
   * Registers a callback for when a message is received by the server.
   * @param callback - Function to call with message data
   * @returns Unsubscribe function to remove the callback
   */
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

  clearCallbacks(): void {
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
  }
}
