import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { HttpException, Logger, OnModuleInit, UnauthorizedException, Inject, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verify, JwtPayload as JwtPayloadBase } from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { ConversationService } from './conversation.service';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import { NotesService } from '../notes/notes.service';
import { ConceptMatchingService } from '../knowledge/services/concept-matching.service';
import { ConceptClassifierService } from '../knowledge/services/concept-classifier.service';
import { ConceptService } from '../knowledge/services/concept.service';
import { CitationInjectorService } from '../knowledge/services/citation-injector.service';
import { CitationService } from '../knowledge/services/citation.service';
import { MemoryContextBuilderService } from '../memory/services/memory-context-builder.service';
import { MemoryExtractionService } from '../memory/services/memory-extraction.service';
import { MemoryService } from '../memory/services/memory.service';
import { ConceptExtractionService } from '../knowledge/services/concept-extraction.service';
import { WorkflowService } from '../workflow/workflow.service';
import { YoloSchedulerService } from '../workflow/yolo-scheduler.service';
import { WebSearchService } from '../web-search/web-search.service';
import { BusinessContextService } from '../knowledge/services/business-context.service';
import { ExecutionStateService } from '../execution/execution-state.service';
import { AttachmentsService } from '../attachments/attachments.service';
import { JobPlannerService } from '../agent-execution/job-planner.service';
import { AgentExecutionEventBus } from '../agent-execution/agent-execution-event-bus.service';
import { OpenClawClientService } from '../agent-execution/openclaw-client.service';
import { HeadlessExecutorService } from '../maturity/headless-executor.service';
import { MaturityEngineService } from '../maturity/maturity-engine.service';
import { WsServerHolder } from '../maturity/ws-server-holder.service';
import { AppEventBus, APP_EVENTS } from '../events/app-event-bus.service';
import { BRIDGE_EVENTS } from '../bridge/bridge.service';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { createId } from '@paralleldrive/cuid2';
import { NoteSource, NoteType, NoteStatus } from '@mentor-ai/shared/prisma';
import { MemoryType, MemorySource, SuggestedAction } from '@mentor-ai/shared/types';
import {
  MessageRole,
  type ChatMessageSend,
  type ChatMessage,
  type ConceptCitation,
  type ExecutionPlanStep,
  type WorkflowPlanReadyPayload,
  type WorkflowStepProgressPayload,
  type WorkflowCompletePayload,
  type WorkflowConversationsCreatedPayload,
  type WorkflowStepConfirmationPayload,
  type WorkflowStepAwaitingInputPayload,
  type WorkflowStepMessagePayload,
  type WorkflowNavigatePayload,
  type YoloProgressPayload,
  type YoloCompletePayload,
  type ParallelPopuniTaskState,
  type ParallelPopuniStartPayload,
  type ParallelPopuniProgressPayload,
  type ParallelPopuniTaskDonePayload,
  type ParallelPopuniBatchDonePayload,
  type ParallelTaskStatus,
} from '@mentor-ai/shared/types';

interface AuthenticatedSocket extends Socket {
  userId: string;
  tenantId: string;
}

interface JwtPayload extends JwtPayloadBase {
  sub: string;
  email: string;
  'https://mentor-ai.com/tenant_id'?: string;
  'https://mentor-ai.com/user_id'?: string;
}

/**
 * WebSocket gateway for real-time chat streaming.
 * Handles client connections, message sending, and AI response streaming.
 * Note: CORS origin is configured dynamically in afterInit using ConfigService.
 */
@WebSocketGateway({
  namespace: '/ws/chat',
  cors: {
    origin: true, // Dynamically set in afterInit based on environment
    credentials: true,
  },
})
export class ConversationGateway implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ConversationGateway.name);
  private readonly jwksClient: jwksClient.JwksClient;
  private readonly auth0Domain: string;
  private readonly auth0Audience: string;
  /** Cached dev user resolved from DB (avoids repeat queries per connection) */
  private resolvedDevUser: { userId: string; tenantId: string } | null = null;

  constructor(
    private readonly conversationService: ConversationService,
    private readonly aiGatewayService: AiGatewayService,
    private readonly configService: ConfigService,
    private readonly prisma: PlatformPrismaService,
    private readonly notesService: NotesService,
    private readonly conceptMatchingService: ConceptMatchingService,
    private readonly conceptClassifierService: ConceptClassifierService,
    private readonly citationInjectorService: CitationInjectorService,
    private readonly citationService: CitationService,
    private readonly memoryContextBuilder: MemoryContextBuilderService,
    private readonly memoryExtractionService: MemoryExtractionService,
    private readonly memoryService: MemoryService,
    private readonly workflowService: WorkflowService,
    private readonly conceptService: ConceptService,
    private readonly conceptExtractionService: ConceptExtractionService,
    private readonly yoloScheduler: YoloSchedulerService,
    private readonly webSearchService: WebSearchService,
    private readonly businessContextService: BusinessContextService,
    private readonly executionStateService: ExecutionStateService,
    private readonly attachmentsService: AttachmentsService,
    private readonly jobPlannerService: JobPlannerService,
    private readonly agentEventBus: AgentExecutionEventBus,
    private readonly maturityEngine: MaturityEngineService,
    private readonly wsServerHolder: WsServerHolder,
    private readonly appEventBus: AppEventBus,
    private readonly openClawClient: OpenClawClientService,
    @Inject(forwardRef(() => HeadlessExecutorService))
    private readonly headlessExecutor: HeadlessExecutorService,
  ) {
    this.auth0Domain = this.configService.get<string>('AUTH0_DOMAIN') ?? '';
    this.auth0Audience = this.configService.get<string>('AUTH0_AUDIENCE') ?? '';

    this.jwksClient = jwksClient({
      cache: true,
      rateLimit: true,
      jwksRequestsPerMinute: 5,
      jwksUri: `https://${this.auth0Domain}/.well-known/jwks.json`,
    });
  }

  /**
   * Server restart recovery: mark stale executions as failed, resume YOLO from checkpoint.
   */
  async onModuleInit(): Promise<void> {
    // Share WebSocket server reference for autonomous services
    this.wsServerHolder.server = this.server;

    // Mark stale executions (stuck > 30 min) as failed
    const stale = await this.executionStateService.getAllStaleExecutions(30);
    for (const exec of stale) {
      await this.executionStateService.updateStatus(
        exec.id,
        'failed',
        null,
        'Server restarted during execution'
      );
      this.logger.warn({
        message: 'Marked stale execution as failed',
        executionId: exec.id,
        type: exec.type,
      });
    }

    // Find recently active executions (not stale) that can be resumed
    const brainRelay = this.configService.get<string>('BRAIN_RELAY_MODE', 'false') === 'true';
    const resumable = await this.executionStateService.getAllActiveExecutions();
    for (const exec of resumable) {
      if ((exec.type === 'yolo' || exec.type === 'domain-yolo') && !brainRelay) {
        this.scheduleYoloResume(exec);
      }
      // Workflows with user-confirmation steps cannot auto-resume
      if (exec.type === 'workflow') {
        await this.executionStateService.updateStatus(
          exec.id,
          'failed',
          null,
          'Server restarted — workflow requires user interaction to resume'
        );
        this.logger.warn({ message: 'Workflow interrupted by restart', executionId: exec.id });
      }
      // Auto-popuni: mark as failed (ephemeral pipeline, not safely resumable)
      if (exec.type === 'auto-popuni') {
        await this.executionStateService.updateStatus(
          exec.id,
          'failed',
          null,
          'Server restarted during auto-popuni'
        );
      }
    }

    // Subscribe to agent execution events and broadcast to tenant rooms
    this.agentEventBus.onEvent((event) => {
      try {
        if (this.server) {
          const room = `tenant:${event.tenantId}`;
          const socketsInRoom = this.server.sockets?.adapter?.rooms?.get(room)?.size ?? 0;
          this.logger.debug({
            message: 'Broadcasting agent event',
            eventName: event.eventName,
            room,
            socketsInRoom,
          });
          this.server.to(room).emit(event.eventName, event.payload);
        }
      } catch (err) {
        this.logger.error({
          message: 'Failed to broadcast agent event',
          eventName: event.eventName,
          error: err instanceof Error ? err.message : 'Unknown',
        });
      }
    });

    // Subscribe to Bridge events and broadcast to ALL connected clients
    // (Room-based targeting had socketsInRoom=0 issue; using global emit instead)
    for (const eventName of Object.values(BRIDGE_EVENTS)) {
      this.appEventBus.on(eventName, (payload) => {
        try {
          if (this.server) {
            const wsEventName = eventName.replace('bridge.', '').replace(/\./g, ':');
            // Emit to all connected sockets — frontend filters by tenantId if needed
            this.server.emit(wsEventName, payload);
            this.logger.log({
              message: 'Bridge event broadcast (global)',
              wsEvent: wsEventName,
              tenantId: payload['tenantId'],
            });

            // Also emit agent:concept-activity for graph view when agent status changes
            if (eventName === BRIDGE_EVENTS.AGENT_STATUS && payload['taskId']) {
              this.prisma.note.findUnique({
                where: { id: payload['taskId'] as string },
                select: { conceptId: true },
              }).then((note) => {
                if (note?.conceptId) {
                  this.server.emit('agent:concept-activity', {
                    agentType: payload['agent'] ?? 'direktor',
                    conceptId: note.conceptId,
                    status: payload['status'] === 'completed' ? 'completed' : 'started',
                  });
                }
              }).catch(() => {});
            }
          }
        } catch (err) {
          this.logger.error({
            message: 'Failed to broadcast bridge event',
            eventName,
            error: err instanceof Error ? err.message : 'Unknown',
          });
        }
      });
    }

    // Daily event journal cleanup
    setInterval(
      () => {
        this.executionStateService
          .pruneOldEvents(7)
          .catch((err) =>
            this.logger.debug({ message: 'Event pruning failed', error: err?.message })
          );
      },
      24 * 60 * 60 * 1000
    );
  }

  /**
   * Schedule YOLO resume after server restart. Delays 5s to allow full initialization.
   */
  private scheduleYoloResume(exec: {
    id: string;
    tenantId: string;
    userId: string;
    type: string;
    conversationId: string | null;
    metadata: unknown;
    checkpoint: unknown;
  }): void {
    // M4: Runtime metadata validation
    const metadata = exec.metadata;
    if (!metadata || typeof metadata !== 'object') {
      this.executionStateService
        .updateStatus(exec.id, 'failed', null, 'Invalid metadata for resume')
        .catch((err) => this.logger.warn({ message: 'Status update failed', error: err?.message }));
      this.logger.warn({
        message: 'YOLO resume skipped — invalid metadata',
        executionId: exec.id,
        metadata: JSON.stringify(metadata),
      });
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta = metadata as { config?: any; category?: string };
    const checkpoint = (exec.checkpoint ?? {}) as { completedCount?: number };

    if (!meta.config || !exec.conversationId) {
      this.executionStateService
        .updateStatus(exec.id, 'failed', null, 'Insufficient metadata for resume')
        .catch((err) => this.logger.warn({ message: 'Status update failed', error: err?.message }));
      return;
    }

    this.logger.log({
      message: 'Scheduling YOLO resume after server restart',
      executionId: exec.id,
      type: exec.type,
      completedSoFar: checkpoint.completedCount ?? 0,
    });

    // M3: Mark as 'pending' while waiting for resume to prevent duplicate scheduling
    this.executionStateService.updateStatus(exec.id, 'pending').catch((err) =>
      this.logger.warn({
        message: 'Failed to mark execution as pending for resume',
        error: err?.message,
      })
    );

    // Delay to let server fully initialize (WebSocket server, DB pool, etc.)
    setTimeout(() => {
      // Re-mark as executing before starting
      this.executionStateService
        .updateStatus(exec.id, 'executing')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .then(() => this.resumeYoloExecution(exec as any))
        .catch((err) => {
          this.logger.error({
            message: 'YOLO resume failed',
            executionId: exec.id,
            error: err?.message,
          });
          this.executionStateService
            .updateStatus(exec.id, 'failed', null, err?.message ?? 'Resume failed')
            .catch((e) => this.logger.warn({ message: 'Status update failed', error: e?.message }));
        });
    }, 5000);
  }

  /**
   * Resume a YOLO execution from checkpoint after server restart.
   * Leverages the fact that completed tasks are already COMPLETED in DB —
   * the scheduler naturally picks up only PENDING tasks.
   */

  private async resumeYoloExecution(exec: {
    id: string;
    tenantId: string;
    userId: string;
    type: string;
    conversationId: string;
    metadata: any;
  }): Promise<void> {
    const tenantId = exec.tenantId;
    const userId = exec.userId;
    const conversationId = exec.conversationId;
    const executionId = exec.id;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const metadata = exec.metadata as { config?: any; category?: string };
    const config = metadata.config;
    const category = metadata.category;
    const conceptConversations = new Map<string, string>();

    this.logger.log({ message: 'Resuming YOLO execution', executionId, tenantId });

    await this.yoloScheduler.startYoloExecution(
      tenantId,
      userId,
      conversationId,
      config,
      {
        onProgress: (progress: YoloProgressPayload) => {
          this.emitToTenant(tenantId, executionId, 'workflow:yolo-progress', progress);
          this.executionStateService
            .updateCheckpoint(executionId, progress)
            .catch((err) =>
              this.logger.debug({ message: 'Checkpoint update failed', error: err?.message })
            );
        },
        onComplete: (result: YoloCompletePayload) => {
          this.emitToTenant(tenantId, executionId, 'workflow:yolo-complete', result);
          this.emitToTenant(tenantId, executionId, 'chat:notes-updated', {
            conversationId,
            count: 0,
          });
          this.executionStateService
            .updateStatus(executionId, 'completed', result)
            .catch((err) =>
              this.logger.debug({ message: 'Execution status update failed', error: err?.message })
            );
        },
        onError: (error: string) => {
          this.emitToTenant(tenantId, executionId, 'workflow:error', {
            message: error,
            conversationId,
          });
          this.executionStateService
            .updateStatus(executionId, 'failed', null, error)
            .catch((err) =>
              this.logger.debug({ message: 'Execution status update failed', error: err?.message })
            );
        },
        saveMessage: async (_role: string, content: string, conceptId?: string) => {
          const targetConvId =
            conceptId && conceptConversations.has(conceptId)
              ? conceptConversations.get(conceptId)!
              : conversationId;
          const msg = await this.conversationService.addMessage(
            tenantId,
            targetConvId,
            MessageRole.ASSISTANT,
            content
          );
          return msg.id;
        },
        createConversationForConcept: async (conceptId: string, conceptName: string) => {
          try {
            const conv = await this.conversationService.createConversation(
              tenantId,
              userId,
              conceptName,
              undefined,
              conceptId
            );
            conceptConversations.set(conceptId, conv.id);
            this.emitToTenant(tenantId, executionId, 'workflow:conversations-created', {
              planId: 'yolo-resume',
              conversations: [{ conceptId, conceptName, conversationId: conv.id }],
              originalConversationId: conversationId,
            });
            return conv.id;
          } catch (err) {
            this.logger.warn({
              message: 'Failed to create conversation during YOLO resume',
              conceptId,
              error: err instanceof Error ? err.message : 'Unknown',
            });
            return null;
          }
        },
        onConceptDiscovered: (
          conceptId: string,
          conceptName: string,
          discoveredConversationId: string
        ) => {
          this.emitToTenant(tenantId, executionId, 'chat:concept-detected', {
            conversationId,
            conceptId,
            conceptName,
            discoveredConversationId,
          });
        },
      },
      conceptConversations,
      category
    );
  }

  /**
   * Broadcast an event to all connected sockets belonging to a tenant.
   * Also journals the event for replay on reconnect.
   */

  private emitToTenant(
    tenantId: string,
    executionId: string,
    eventName: string,
    payload: any
  ): void {
    // Journal the event for replay
    this.executionStateService
      .appendEvent(executionId, eventName, payload)
      .catch((err) =>
        this.logger.debug({ message: 'Event journaling failed', error: err?.message })
      );

    // Broadcast to all sockets in this tenant's room
    if (this.server) {
      this.server.to(`tenant:${tenantId}`).emit(eventName, payload);
    }
  }

  /**
   * Returns active executions and recently completed ones for reconnecting clients.
   */
  @SubscribeMessage('execution:get-active')
  async handleGetActiveExecutions(@ConnectedSocket() client: Socket): Promise<void> {
    const auth = client as AuthenticatedSocket;

    const active = await this.executionStateService.getActiveExecutions(auth.tenantId);
    const recentlyCompleted = await this.executionStateService.getRecentCompletions(
      auth.tenantId,
      new Date(Date.now() - 5 * 60 * 1000) // last 5 minutes
    );

    client.emit('execution:active-state', {
      active: active.map((e) => ({
        id: e.id,
        type: e.type,
        status: e.status,
        planId: e.planId,
        conversationId: e.conversationId,
        checkpoint: e.checkpoint,
        metadata: e.metadata,
        createdAt: e.createdAt,
      })),
      recentlyCompleted: recentlyCompleted.map((e) => ({
        id: e.id,
        type: e.type,
        result: e.result,
        conversationId: e.conversationId,
        updatedAt: e.updatedAt,
      })),
    });
  }

  /**
   * Replays journaled events for an execution since a given timestamp.
   * Used after reconnect to catch up on missed events.
   */
  @SubscribeMessage('execution:replay-events')
  async handleReplayEvents(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { executionId: string; since?: string }
  ): Promise<void> {
    const auth = client as AuthenticatedSocket;
    const since = payload.since ? new Date(payload.since) : new Date(0);
    const events = await this.executionStateService.getEventsSince(
      payload.executionId,
      since,
      auth.tenantId
    );

    for (const event of events) {
      client.emit(event.eventName, event.payload);
    }
    client.emit('execution:replay-complete', {
      executionId: payload.executionId,
      eventCount: events.length,
    });
  }

  /**
   * Resolves the real active tenant/user for DEV_MODE, matching JwtAuthGuard.getDevUser().
   * Caches the result for server lifetime. Falls back to static IDs if DB query fails.
   */
  private async resolveDevUser(): Promise<{ userId: string; tenantId: string }> {
    if (this.resolvedDevUser) return this.resolvedDevUser;

    try {
      const tenant = await this.prisma.tenant.findFirst({
        where: { status: 'ACTIVE' },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });

      if (tenant) {
        const user = await this.prisma.user.findFirst({
          where: { tenantId: tenant.id, isActive: true },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });

        if (user) {
          this.resolvedDevUser = { userId: user.id, tenantId: tenant.id };
          this.logger.log({
            message: 'WebSocket dev mode: resolved real tenant/user from DB',
            tenantId: tenant.id,
            userId: user.id,
          });
          return this.resolvedDevUser;
        }
      }
    } catch (err) {
      this.logger.warn({
        message: 'WebSocket dev mode: failed to resolve tenant from DB, using fallback',
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }

    // No active tenant/user — ensure fallback records exist for FK constraints
    const fallbackTenantId = 'dev-tenant-001';
    const fallbackUserId = 'dev-user-001';
    try {
      await this.prisma.tenant.upsert({
        where: { id: fallbackTenantId },
        create: {
          id: fallbackTenantId,
          name: 'Dev Tenant',
          industry: 'Technology',
          status: 'ACTIVE',
        },
        update: {},
      });
      await this.prisma.user.upsert({
        where: { id: fallbackUserId },
        create: {
          id: fallbackUserId,
          email: 'dev@mentor-ai.local',
          name: 'Dev User',
          role: 'TENANT_OWNER',
          tenantId: fallbackTenantId,
        },
        update: {},
      });
      this.logger.log('WebSocket dev mode: created fallback tenant/user records in DB');
    } catch (seedErr) {
      this.logger.warn({
        message: 'WebSocket dev mode: failed to seed fallback records',
        error: seedErr instanceof Error ? seedErr.message : 'Unknown',
      });
    }

    this.resolvedDevUser = { userId: fallbackUserId, tenantId: fallbackTenantId };
    return this.resolvedDevUser;
  }

  /**
   * Handles new WebSocket connections.
   * Validates JWT token and attaches user info to socket.
   * In dev mode, bypasses token validation and uses mock user.
   */
  async handleConnection(client: Socket) {
    try {
      const devMode = this.configService.get<string>('DEV_MODE') === 'true';

      if (devMode) {
        const authenticatedClient = client as AuthenticatedSocket;

        // Try to extract real user identity from JWT token and verify the user exists in DB
        const token = this.extractToken(client);
        if (token && token !== 'dev-mode-token') {
          try {
            const jwtSecret = this.configService.get<string>('JWT_SECRET');
            if (jwtSecret) {
              const payload = verify(token, jwtSecret, { algorithms: ['HS256'] }) as JwtPayload;
              const devFallback = await this.resolveDevUser();
              const tokenUserId = (payload as any).userId || payload.sub || devFallback.userId;
              const tokenTenantId = (payload as any).tenantId || devFallback.tenantId;

              // Verify the user actually exists in DB (may have been cleaned up)
              const userExists = await this.prisma.user.findUnique({
                where: { id: tokenUserId },
                select: { id: true },
              });

              if (userExists) {
                authenticatedClient.userId = tokenUserId;
                authenticatedClient.tenantId = tokenTenantId;
                await client.join(`tenant:${authenticatedClient.tenantId}`);
                this.logger.log({
                  message: 'WebSocket client connected (dev mode, real user)',
                  clientId: client.id,
                  userId: authenticatedClient.userId,
                  tenantId: authenticatedClient.tenantId,
                });
                return;
              }

              // User deleted from DB — disconnect so frontend clears stale token
              this.logger.warn({
                message: 'WebSocket rejected: JWT user not found in DB',
                tokenUserId,
              });
              client.emit('auth:session-expired', {
                message: 'Your session is no longer valid. Please log in again.',
              });
              client.disconnect();
              return;
            }
          } catch {
            this.logger.debug('Dev mode: WebSocket JWT validation failed, using dev user fallback');
          }
        }

        // No token or placeholder token — resolve dev user from DB
        const devUser = await this.resolveDevUser();
        authenticatedClient.userId = devUser.userId;
        authenticatedClient.tenantId = devUser.tenantId;
        await client.join(`tenant:${devUser.tenantId}`);
        this.logger.log({
          message: 'WebSocket client connected (dev mode, dev user)',
          clientId: client.id,
          tenantId: devUser.tenantId,
          userId: devUser.userId,
        });
        return;
      }

      const token = this.extractToken(client);
      if (!token) {
        this.logger.warn({
          message: 'WebSocket connection rejected: No token provided',
          clientId: client.id,
        });
        client.disconnect();
        return;
      }

      const authenticatedClient = client as AuthenticatedSocket;

      // Try JWT_SECRET (HS256) verification first — covers Google OAuth tokens
      const jwtSecret = this.configService.get<string>('JWT_SECRET');
      let authenticated = false;

      if (jwtSecret) {
        try {
          const payload = verify(token, jwtSecret, { algorithms: ['HS256'] }) as JwtPayload;
          const tokenUserId = (payload as any).userId || payload.sub;
          const tokenTenantId = (payload as any).tenantId || '';

          if (tokenUserId) {
            // Verify the user actually exists in DB
            const userExists = await this.prisma.user.findUnique({
              where: { id: tokenUserId },
              select: { id: true },
            });

            if (userExists) {
              authenticatedClient.userId = tokenUserId;
              authenticatedClient.tenantId = tokenTenantId;
              authenticated = true;
            } else {
              this.logger.warn({
                message: 'WebSocket rejected: JWT user not found in DB',
                tokenUserId,
              });
              client.emit('auth:session-expired', {
                message: 'Your session is no longer valid. Please log in again.',
              });
              client.disconnect();
              return;
            }
          }
        } catch {
          // HS256 verification failed — try Auth0 JWKS fallback below
        }
      }

      // Fallback: Auth0 JWKS (RS256) verification if configured
      if (!authenticated && this.auth0Domain) {
        try {
          const payload = await this.verifyToken(token);
          authenticatedClient.userId = payload['https://mentor-ai.com/user_id'] ?? payload.sub;
          authenticatedClient.tenantId = payload['https://mentor-ai.com/tenant_id'] ?? '';
          authenticated = true;
        } catch {
          // Auth0 verification also failed
        }
      }

      if (!authenticated) {
        this.logger.warn({
          message: 'WebSocket connection rejected: Invalid token',
          clientId: client.id,
        });
        client.disconnect();
        return;
      }

      // Join tenant-specific room for isolation
      await client.join(`tenant:${authenticatedClient.tenantId}`);

      this.logger.log({
        message: 'WebSocket client connected',
        clientId: client.id,
        userId: authenticatedClient.userId,
        tenantId: authenticatedClient.tenantId,
      });
    } catch (error) {
      this.logger.warn({
        message: 'WebSocket connection rejected: Invalid token',
        clientId: client.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      client.disconnect();
    }
  }

  /**
   * Handles WebSocket disconnections.
   */
  handleDisconnect(client: Socket) {
    this.logger.log({
      message: 'WebSocket client disconnected',
      clientId: client.id,
    });
  }

  /**
   * Handles incoming chat messages.
   * Saves user message, streams AI response, and saves AI message.
   */
  @SubscribeMessage('chat:regenerate')
  async handleRegenerate(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { conversationId: string }
  ) {
    const authenticatedClient = client as AuthenticatedSocket;
    const { conversationId } = payload;

    if (!conversationId) {
      client.emit('chat:error', {
        type: 'invalid_payload',
        message: 'conversationId is required for regeneration',
      });
      return;
    }

    try {
      const result = await this.conversationService.deleteLastAssistantMessage(
        authenticatedClient.tenantId,
        conversationId,
        authenticatedClient.userId
      );

      if (!result) {
        client.emit('chat:error', {
          type: 'regenerate_failed',
          message: 'Cannot regenerate: no valid USER->ASSISTANT message pair found',
        });
        return;
      }

      // Notify frontend that the old message was deleted
      client.emit('chat:message-deleted', {
        messageId: result.deletedMessageId,
        conversationId,
      });

      // Re-process by calling handleMessage with _isRegenerate flag (skips saving user message)
      await this.handleMessage(client, {
        conversationId,
        content: result.lastUserContent,
        _isRegenerate: true,
      });
    } catch (error) {
      this.logger.error({
        message: 'Failed to regenerate response',
        conversationId,
        userId: authenticatedClient.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      client.emit('chat:error', {
        type: 'regenerate_error',
        message: error instanceof Error ? error.message : 'Failed to regenerate response',
      });
    }
  }

  /**
   * Brain Relay Mode: Thin gateway that forwards messages to OpenClaw
   * without any NestJS-side intelligence (no enrichment, no auto-actions).
   * OpenClaw handles all thinking via SOUL.md + mentor-ai-bridge skill.
   *
   * Toggle: Set BRAIN_RELAY_MODE=true in .env to enable.
   */
  private async handleMessageRelay(
    client: Socket,
    authenticatedClient: AuthenticatedSocket,
    conversationId: string,
    content: string,
    attachmentIds?: string[],
    isRegenerate?: boolean
  ): Promise<void> {
    // 1. Extract attachment text if provided
    let attachmentContext = '';
    if (attachmentIds?.length) {
      attachmentContext = await this.attachmentsService
        .getExtractedText(attachmentIds, authenticatedClient.tenantId)
        .catch(() => '');
    }

    // 2. Save user message (skip on regeneration)
    let userMessage: { id: string } | undefined;
    if (!isRegenerate) {
      userMessage = await this.conversationService.addMessage(
        authenticatedClient.tenantId,
        conversationId,
        MessageRole.USER,
        content
      );

      // Link attachments
      if (attachmentIds?.length && userMessage) {
        await Promise.all(
          attachmentIds.map((attId) =>
            this.attachmentsService
              .linkToMessage(attId, userMessage!.id, authenticatedClient.tenantId)
              .catch(() => {})
          )
        );
      }

      client.emit('chat:message-received', {
        messageId: userMessage.id,
        role: 'USER',
      });
    }

    // 3. Forward to OpenClaw — no enrichment, no context building
    const messageToSend = attachmentContext
      ? `${attachmentContext}\n\n${content}`
      : content;

    let fullContent = '';
    let chunkIndex = 0;

    if (this.openClawClient.isConfigured()) {
      const ocResult = await this.openClawClient.executeAgent(messageToSend, {
        agentId: 'main',
        sessionId: conversationId,
        tenantProfile: authenticatedClient.tenantId,
        onText: (text) => {
          fullContent += text;
          client.emit('chat:message-chunk', { content: text, index: chunkIndex++ });
        },
        onTool: (tool, status, query) => {
          if (status === 'start') {
            client.emit('chat:research-phase', { phase: 'researching', tool, query });
          }
        },
      });

      if (!ocResult.success) {
        // Fallback to AiGateway on OpenClaw failure
        this.logger.warn({ message: 'OpenClaw relay failed, falling back to AiGateway', error: ocResult.error });
        fullContent = '';
        chunkIndex = 0;

        const conversation = await this.conversationService.getConversation(
          authenticatedClient.tenantId, conversationId, authenticatedClient.userId
        );
        const messages = conversation.messages.map((m) => ({
          role: m.role.toLowerCase() as 'user' | 'assistant',
          content: m.content,
        }));

        await this.aiGatewayService.streamCompletionWithContext(
          messages,
          {
            tenantId: authenticatedClient.tenantId,
            userId: authenticatedClient.userId,
            conversationId,
          },
          (chunk: string) => {
            fullContent += chunk;
            client.emit('chat:message-chunk', { content: chunk, index: chunkIndex++ });
          }
        );
      }
    } else {
      // No OpenClaw — fallback to AiGateway
      const conversation = await this.conversationService.getConversation(
        authenticatedClient.tenantId, conversationId, authenticatedClient.userId
      );
      const messages = conversation.messages.map((m) => ({
        role: m.role.toLowerCase() as 'user' | 'assistant',
        content: m.content,
      }));

      await this.aiGatewayService.streamCompletionWithContext(
        messages,
        {
          tenantId: authenticatedClient.tenantId,
          userId: authenticatedClient.userId,
          conversationId,
        },
        (chunk: string) => {
          fullContent += chunk;
          client.emit('chat:message-chunk', { content: chunk, index: chunkIndex++ });
        }
      );
    }

    // 4. Save AI message
    const aiMessage = await this.conversationService.addMessage(
      authenticatedClient.tenantId,
      conversationId,
      MessageRole.ASSISTANT,
      fullContent
    );

    // 5. Emit completion (minimal metadata — no confidence, no citations from NestJS)
    client.emit('chat:complete', {
      messageId: aiMessage.id,
      fullContent,
      metadata: {
        totalChunks: chunkIndex,
        confidence: null,
        citations: [],
        suggestedActions: undefined,
      },
    });

    this.logger.log({
      message: 'Chat message processed (relay mode)',
      conversationId,
      userId: authenticatedClient.userId,
      aiMessageId: aiMessage.id,
      contentLength: fullContent.length,
    });
  }

  @SubscribeMessage('chat:message-send')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ChatMessageSend & { attachmentIds?: string[]; _isRegenerate?: boolean }
  ) {
    const authenticatedClient = client as AuthenticatedSocket;
    const { conversationId, content, attachmentIds: rawAttachmentIds } = payload;

    // Validate and sanitize attachmentIds
    const attachmentIds: string[] | undefined =
      Array.isArray(rawAttachmentIds) &&
      rawAttachmentIds.length > 0 &&
      rawAttachmentIds.length <= 5 &&
      rawAttachmentIds.every((id) => typeof id === 'string' && id.length > 0 && id.length < 50)
        ? rawAttachmentIds
        : undefined;

    // Validate payload
    if (!conversationId || !content) {
      client.emit('chat:error', {
        type: 'invalid_payload',
        message: 'conversationId and content are required',
      });
      return;
    }

    // Validate conversationId format
    if (!conversationId.startsWith('sess_')) {
      client.emit('chat:error', {
        type: 'invalid_conversation_id',
        message: 'conversationId must have sess_ prefix',
      });
      return;
    }

    // Validate content length
    const MAX_MESSAGE_LENGTH = 32000;
    if (content.length > MAX_MESSAGE_LENGTH) {
      client.emit('chat:error', {
        type: 'message_too_long',
        message: `Message cannot exceed ${MAX_MESSAGE_LENGTH} characters`,
      });
      return;
    }

    // ── BRAIN RELAY MODE ──
    // When enabled, forward directly to OpenClaw without NestJS intelligence.
    // Toggle: BRAIN_RELAY_MODE=true in .env
    const relayMode = this.configService.get<string>('BRAIN_RELAY_MODE', 'false') === 'true';
    if (relayMode) {
      try {
        await this.handleMessageRelay(
          client, authenticatedClient, conversationId, content, attachmentIds, payload._isRegenerate
        );
      } catch (error) {
        this.logger.error({
          message: 'Relay mode error',
          conversationId,
          error: error instanceof Error ? error.message : 'Unknown',
        });
        client.emit('chat:error', {
          type: 'relay_error',
          message: error instanceof Error ? error.message : 'Failed to process message',
        });
      }
      return;
    }

    try {
      // Verify user owns the conversation
      await this.conversationService.getConversation(
        authenticatedClient.tenantId,
        conversationId,
        authenticatedClient.userId
      );

      // Extract text from attachments if provided
      let attachmentContext = '';
      if (attachmentIds && attachmentIds.length > 0) {
        attachmentContext = await this.attachmentsService
          .getExtractedText(attachmentIds, authenticatedClient.tenantId)
          .catch(() => '');
      }

      // Save user message (skipped during regeneration — message already exists)
      let userMessage: { id: string } | undefined;
      if (!payload._isRegenerate) {
        userMessage = await this.conversationService.addMessage(
          authenticatedClient.tenantId,
          conversationId,
          MessageRole.USER,
          content
        );

        // Link attachments to the saved message
        if (attachmentIds && attachmentIds.length > 0) {
          await Promise.all(
            attachmentIds.map((attId) =>
              this.attachmentsService
                .linkToMessage(attId, userMessage!.id, authenticatedClient.tenantId)
                .catch((err) => {
                  this.logger.warn(`Failed to link attachment ${attId}: ${err}`);
                })
            )
          );
        }

        // Emit confirmation of user message received
        client.emit('chat:message-received', {
          messageId: userMessage.id,
          role: 'USER',
        });
      }

      // Get conversation history for context
      const conversation = await this.conversationService.getConversation(
        authenticatedClient.tenantId,
        conversationId,
        authenticatedClient.userId
      );

      // Format messages for AI (inject attachment context into last user message)
      const messages = conversation.messages.map((m, i, arr) => {
        const isLastUserMsg = i === arr.length - 1 && m.role.toLowerCase() === 'user';
        const msgContent =
          isLastUserMsg && attachmentContext ? `${attachmentContext}\n\n${m.content}` : m.content;
        return {
          role: m.role.toLowerCase() as 'user' | 'assistant',
          content: msgContent,
        };
      });

      // === PERFORMANCE TIMING ===
      const perfStart = Date.now();
      const perf: Record<string, number> = {};

      // Build business context from tenant profile + onboarding notes
      const businessContext = await this.buildBusinessContext(
        authenticatedClient.tenantId,
        authenticatedClient.userId
      );
      perf.businessContext = Date.now() - perfStart;

      // Pre-AI enrichment: concept search + memory context + web search + business brain + cross-conversation insights in parallel
      const enrichmentStart = Date.now();
      const webSearchEnabled = (payload as any).webSearchEnabled !== false;
      const [relevantConcepts, memoryContext, webSearchResults, businessBrainContext, conceptInsights] =
        await Promise.all([
          this.conceptMatchingService
            .findRelevantConcepts(content, {
              limit: 5,
              threshold: 0.5,
              personaType: conversation.personaType ?? undefined,
            })
            .catch(() => [] as import('@mentor-ai/shared/types').ConceptMatch[]),
          this.memoryContextBuilder
            .buildContext(content, authenticatedClient.userId, authenticatedClient.tenantId)
            .catch(() => ({
              context: '',
              attributions: [] as import('@mentor-ai/shared/types').MemoryAttribution[],
              estimatedTokens: 0,
            })),
          webSearchEnabled && this.webSearchService.isAvailable()
            ? this.webSearchService
                .searchAndExtract(content, 3)
                .catch(() => [] as import('@mentor-ai/shared/types').EnrichedSearchResult[])
            : Promise.resolve([] as import('@mentor-ai/shared/types').EnrichedSearchResult[]),
          this.businessContextService
            .getBusinessContext(authenticatedClient.tenantId, content)
            .catch(() => ''),
          // Cross-conversation insights: load prior analyses about the same concept
          conversation.conceptId
            ? this.conversationService
                .getConceptInsights(
                  authenticatedClient.tenantId,
                  authenticatedClient.userId,
                  conversation.conceptId,
                  conversationId,
                  3
                )
                .catch(() => [] as Array<{ conversationId: string; title: string; summary: string }>)
            : Promise.resolve([] as Array<{ conversationId: string; title: string; summary: string }>),
        ]);

      perf.enrichmentParallel = Date.now() - enrichmentStart;

      // Build enriched context with curriculum concepts + memory + business brain
      const conceptLoadStart = Date.now();
      let enrichedContext = businessContext;

      // Append tenant-wide business brain memories (Story 3.3 AC3)
      if (businessBrainContext) {
        enrichedContext += '\n' + businessBrainContext;
      }

      if (relevantConcepts.length > 0) {
        enrichedContext += '\n\n--- BAZA ZNANJA (koristi za analizu i preporuke) ---\n';
        for (const concept of relevantConcepts.slice(0, 5)) {
          enrichedContext += `\nKONCEPT: ${concept.conceptName} (${concept.category})`;
          enrichedContext += `\nDEFINICIJA: ${concept.definition}`;
          try {
            const full = await this.conceptService.findById(concept.conceptId);
            if (full.extendedDescription) {
              // Trim to first paragraph or 800 chars to reduce context bloat
              const desc = full.extendedDescription;
              const firstParagraphEnd = desc.indexOf('\n\n');
              const trimmed =
                firstParagraphEnd > 0 && firstParagraphEnd < 800
                  ? desc.substring(0, firstParagraphEnd)
                  : desc.substring(0, 800);
              enrichedContext += `\nDETALJNO: ${trimmed}`;
            }
            if (full.relatedConcepts && full.relatedConcepts.length > 0) {
              const related = full.relatedConcepts
                .slice(0, 3)
                .map((r) => `${r.concept.name} (${r.relationshipType})`)
                .join(', ');
              enrichedContext += `\nPOVEZANI: ${related}`;
            }
          } catch {
            /* skip if concept not found */
          }
          enrichedContext += '\n';
        }
        enrichedContext += '--- KRAJ BAZE ZNANJA ---\n';
        enrichedContext +=
          'Primeni ove koncepte u odgovoru. Kada referenciraš koncept, koristi [[Naziv Koncepta]] oznaku.\n';
      }

      // Inject cross-conversation insights (Sprint 2 Epic 2.1)
      // Enables the AI to build on prior analyses about the same concept
      if (conceptInsights.length > 0) {
        enrichedContext += '\n\n--- PRETHODNE ANALIZE O OVOM KONCEPTU ---\n';
        enrichedContext +=
          'Ovi uvidi su iz prethodnih konverzacija na istu temu. Nadogradi se na njih, ne ponavljaj.\n';
        for (const insight of conceptInsights) {
          enrichedContext += `\n[${insight.title}]\n${insight.summary}\n`;
        }
        enrichedContext += '--- KRAJ PRETHODNIH ANALIZA ---\n';
      }

      if (memoryContext.context) {
        enrichedContext = this.memoryContextBuilder.injectIntoSystemPrompt(
          enrichedContext,
          memoryContext
        );
      }

      // Append web search context if results available (Story 2.17)
      if (webSearchResults.length > 0) {
        enrichedContext += this.webSearchService.formatSourcesAsObsidian(webSearchResults);
      }

      perf.conceptLoading = Date.now() - conceptLoadStart;
      perf.contextChars = enrichedContext.length;

      // === MULTI-STEP ORCHESTRATION ===
      const isComplex = this.isComplexQuery(content);
      let researchBrief = '';

      if (isComplex) {
        const researchStart = Date.now();
        client.emit('chat:research-phase', { phase: 'researching' });
        researchBrief = await this.buildResearchBrief(
          content,
          enrichedContext,
          relevantConcepts,
          webSearchEnabled,
          conversation.personaType ?? undefined,
          authenticatedClient.tenantId,
          authenticatedClient.userId
        );
        client.emit('chat:research-phase', { phase: 'responding' });
        perf.researchBrief = Date.now() - researchStart;
      }

      const finalContext = researchBrief
        ? `${enrichedContext}\n\n--- ISTRAŽIVAČKI BRIEF ---\n${researchBrief}\n--- KRAJ BRIEFA ---\nKoristi brief kao osnovu za stručan odgovor. Ne pominjaj brief — samo daj sveobuhvatan odgovor.`
        : enrichedContext;

      perf.finalContextChars = finalContext.length;

      // Stream AI response — route to OpenClaw main agent if configured, else fallback to AiGateway
      let fullContent = '';
      let chunkIndex = 0;
      const aiCallStart = Date.now();

      let completionResult: { confidence?: any; provider?: string } = {};

      if (this.openClawClient.isConfigured()) {
        // Build message for OpenClaw main agent with all enriched context
        const contextBlock = finalContext
          ? `\n--- KONTEKST ---\n${finalContext.substring(0, 6000)}\n--- KRAJ KONTEKSTA ---\n`
          : '';
        const mainMessage = `${contextBlock}\n${content}`;

        // Use conversationId as session so main agent remembers this conversation
        const ocResult = await this.openClawClient.executeAgent(mainMessage, {
          agentId: 'main',
          sessionId: conversationId,
          tenantProfile: authenticatedClient.tenantId,
          onText: (text) => {
            fullContent += text;
            client.emit('chat:message-chunk', {
              content: text,
              index: chunkIndex++,
            });
          },
          onTool: (tool, status, query) => {
            if (status === 'start') {
              client.emit('chat:research-phase', { phase: 'researching', tool, query });
            }
          },
        });

        if (ocResult.success) {
          // OpenClaw doesn't provide confidence scores — leave completionResult empty
          completionResult = { provider: 'openclaw-main' };
        } else {
          // Fallback to AiGateway on OpenClaw failure
          this.logger.warn({ message: 'OpenClaw main agent failed, falling back to AiGateway', error: ocResult.error });
          fullContent = '';
          chunkIndex = 0;
          completionResult = await this.aiGatewayService.streamCompletionWithContext(
            messages,
            {
              tenantId: authenticatedClient.tenantId,
              userId: authenticatedClient.userId,
              conversationId,
              personaType: conversation.personaType ?? undefined,
              businessContext: finalContext,
            },
            (chunk: string) => {
              fullContent += chunk;
              client.emit('chat:message-chunk', { content: chunk, index: chunkIndex++ });
            }
          );
        }
      } else {
        // No OpenClaw — use AiGateway directly
        completionResult = await this.aiGatewayService.streamCompletionWithContext(
          messages,
          {
            tenantId: authenticatedClient.tenantId,
            userId: authenticatedClient.userId,
            conversationId,
            personaType: conversation.personaType ?? undefined,
            messageCount: conversation.messages.length,
            hasClientContext: memoryContext.attributions.length > 0,
            hasSpecificData: relevantConcepts.length > 0 || researchBrief.length > 0,
            userQuestion: content,
            businessContext: finalContext,
          },
          (chunk: string) => {
            fullContent += chunk;
            client.emit('chat:message-chunk', { content: chunk, index: chunkIndex++ });
          }
        );
      }

      perf.aiCall = Date.now() - aiCallStart;
      perf.totalMs = Date.now() - perfStart;

      // === LOG PERFORMANCE BREAKDOWN ===
      this.logger.log({
        message: '⏱ PERF BREAKDOWN',
        businessContextMs: perf.businessContext,
        enrichmentParallelMs: perf.enrichmentParallel,
        conceptLoadingMs: perf.conceptLoading,
        researchBriefMs: perf.researchBrief ?? 0,
        aiCallMs: perf.aiCall,
        totalMs: perf.totalMs,
        contextChars: perf.contextChars,
        finalContextChars: perf.finalContextChars,
        isComplex,
        conceptsMatched: relevantConcepts.length,
      });

      // Extract confidence from result
      const confidence = completionResult.confidence;

      // Post-AI: inject citation markers into response
      let contentWithCitations = fullContent;
      let citations: ConceptCitation[] = [];

      if (relevantConcepts.length > 0) {
        const citationResult = this.citationInjectorService.injectCitations(
          fullContent,
          relevantConcepts
        );
        contentWithCitations = citationResult.content;
        citations = citationResult.citations;
      }

      // Parse memory attributions from the AI response
      const memoryAttributions =
        memoryContext.attributions.length > 0
          ? this.memoryContextBuilder.parseAttributionsFromResponse(
              fullContent,
              memoryContext.attributions
            )
          : [];

      // Save AI message with citations in content (Story 2.5 + 2.6)
      const aiMessage = await this.conversationService.addMessage(
        authenticatedClient.tenantId,
        conversationId,
        MessageRole.ASSISTANT,
        contentWithCitations,
        confidence?.score ?? null,
        confidence?.factors ?? null
      );

      // Store citations in DB (fire-and-forget)
      if (citations.length > 0) {
        this.citationService.storeCitations(aiMessage.id, citations).catch((err) => {
          this.logger.warn({
            message: 'Failed to store citations (non-blocking)',
            conversationId,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        });
      }

      // Infer suggested actions based on response context (D1)
      const suggestedActions: SuggestedAction[] = [];
      if (relevantConcepts.length > 0) {
        suggestedActions.push(
          { type: 'create_tasks', label: 'Kreiraj zadatke', icon: 'tasks' },
          { type: 'deep_dive', label: 'Istraži dublje', icon: 'explore' }
        );
        if (relevantConcepts.length > 1) {
          suggestedActions.push({
            type: 'next_domain',
            label: 'Sledeći koncept →',
            icon: 'arrow',
            payload: { conceptId: relevantConcepts[1]?.conceptId },
          });
        }
      } else {
        suggestedActions.push({ type: 'save_note', label: 'Sačuvaj kao belešku', icon: 'note' });
      }
      if (confidence && confidence.score < 0.5) {
        suggestedActions.push({ type: 'web_search', label: 'Pretraži web', icon: 'web' });
      }

      // Emit completion with confidence + citations metadata
      client.emit('chat:complete', {
        messageId: aiMessage.id,
        fullContent: contentWithCitations,
        metadata: {
          totalChunks: chunkIndex,
          confidence: confidence
            ? {
                score: confidence.score,
                level: confidence.level,
                factors: confidence.factors,
              }
            : null,
          citations,
          memoryAttributions,
          webSearchSources:
            webSearchResults.length > 0
              ? webSearchResults.map((r) => ({ title: r.title, link: r.link }))
              : undefined,
          suggestedActions: suggestedActions.length > 0 ? suggestedActions : undefined,
        },
      });

      this.logger.log({
        message: 'Chat message processed',
        conversationId,
        userId: authenticatedClient.userId,
        tenantId: authenticatedClient.tenantId,
        userMessageId: userMessage?.id ?? 'regenerated',
        aiMessageId: aiMessage.id,
        confidenceScore: confidence?.score ?? 'N/A',
        confidenceLevel: confidence?.level ?? 'N/A',
        citationCount: citations.length,
        conceptsFound: relevantConcepts.length,
        memoriesUsed: memoryContext.attributions.length,
      });

      this.appEventBus.emit(APP_EVENTS.CONVERSATION_MESSAGE_ADDED, {
        tenantId: authenticatedClient.tenantId,
        conversationId,
        messageId: aiMessage.id,
        role: 'ASSISTANT',
        userId: authenticatedClient.userId,
      });

      // Fire-and-forget: detect explicit task creation or auto-generate tasks
      const forceRedo = this.hasRedoIntent(content);
      if (this.hasExplicitTaskIntent(content)) {
        this.detectAndCreateExplicitTasks(
          client,
          authenticatedClient.userId,
          authenticatedClient.tenantId,
          conversationId,
          conversation.conceptId ?? null,
          content,
          fullContent,
          relevantConcepts,
          forceRedo
        ).catch((err: unknown) => {
          this.logger.warn({
            message: 'Explicit task creation failed (non-blocking)',
            conversationId,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        });
      } else {
        this.generateAutoTasks(
          client,
          authenticatedClient.userId,
          authenticatedClient.tenantId,
          conversationId,
          conversation.conceptId ?? null,
          content,
          fullContent,
          messages,
          aiMessage.id,
          relevantConcepts,
          forceRedo
        ).catch((err: unknown) => {
          this.logger.warn({
            message: 'Auto-task generation failed (non-blocking)',
            conversationId,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        });
      }

      // Fire-and-forget: auto-classify conversation to a curriculum concept
      this.autoClassifyConversation(
        client,
        authenticatedClient.tenantId,
        authenticatedClient.userId,
        conversationId,
        content,
        fullContent
      ).catch((err: unknown) => {
        this.logger.warn({
          message: 'Auto-classify failed (non-blocking)',
          conversationId,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      });

      // Fire-and-forget: extract memories from this exchange (Story 3.3: concept-tagging)
      const conceptName = conversation.conceptId
        ? (relevantConcepts.find((c) => c.conceptId === conversation.conceptId)?.conceptName ??
          (await this.conceptService.findById(conversation.conceptId).catch(() => null))?.name)
        : undefined;

      this.memoryExtractionService
        .extractMemories(
          conversation.messages.concat([
            ...(userMessage
              ? [
                  {
                    id: userMessage.id,
                    conversationId,
                    role: MessageRole.USER as const,
                    content,
                    confidenceScore: null,
                    confidenceFactors: null,
                    createdAt: new Date().toISOString(),
                  },
                ]
              : []),
            {
              id: aiMessage.id,
              conversationId,
              role: MessageRole.ASSISTANT,
              content: fullContent,
              confidenceScore: null,
              confidenceFactors: null,
              createdAt: new Date().toISOString(),
            },
          ]),
          authenticatedClient.userId,
          authenticatedClient.tenantId,
          { conceptName }
        )
        .catch((err: unknown) => {
          this.logger.warn({
            message: 'Memory extraction failed (non-blocking)',
            conversationId,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        });

      // Fire-and-forget: extract and create new concepts from AI output (Story 2.15)
      // Deviation: uses .catch() instead of async/await per project-context.md rule
      // "Always use async/await over raw Promises". Rationale: concept extraction is
      // optional post-processing; failure must not block message delivery (AC6).
      this.conceptExtractionService
        .extractAndCreateConcepts(fullContent, {
          conversationId,
          conceptId: conversation.conceptId ?? undefined,
        })
        .catch((err: unknown) => {
          this.logger.warn({
            message: 'Concept extraction failed (non-blocking)',
            conversationId,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        });

      // Auto-detect affirmative or selective task execution on welcome conversation
      if (conversation.messages.length <= 4) {
        const lowerContent = content.toLowerCase().trim();
        const affirmatives = [
          'da',
          'yes',
          'izvrši',
          'izvrsi',
          'hajde',
          'naravno',
          'svakako',
          'pokreni sve',
        ];
        const isFullAffirmative = affirmatives.some(
          (p) =>
            lowerContent === p ||
            lowerContent.startsWith(p + ' ') ||
            lowerContent.startsWith(p + ',')
        );

        // Detect selective execution: "pokreni 1, 3, 5" or "pokreni prvi"
        const numberMatch = lowerContent.match(/(?:pokreni|izvrši|izvrsi|run|start)\s+([\d,\s]+)/);
        const isFirstOnly = /(?:pokreni|izvrši|izvrsi)\s+(?:prvi|first|1)$/i.test(lowerContent);

        const pendingTasks = await this.notesService.getPendingTasksByUser(
          authenticatedClient.userId,
          authenticatedClient.tenantId
        );

        if (pendingTasks.length > 0) {
          let taskIds: string[];

          if (isFirstOnly) {
            // Run only the first (recommended) task
            taskIds = [pendingTasks[0]!.id];
          } else if (numberMatch) {
            // Parse selected task numbers: "pokreni 1, 3, 5"
            const selectedNumbers = numberMatch[1]!
              .split(/[,\s]+/)
              .map((n) => parseInt(n.trim(), 10))
              .filter((n) => !isNaN(n) && n >= 1 && n <= pendingTasks.length);
            taskIds = selectedNumbers.map((n) => pendingTasks[n - 1]!.id);
          } else if (isFullAffirmative) {
            // Run all tasks
            taskIds = pendingTasks.map((t) => t.id);
          } else {
            taskIds = [];
          }

          if (taskIds.length > 0) {
            // Auto-execute: skip plan overlay, build + execute immediately
            this.autoExecuteWorkflow(client, taskIds, conversationId).catch((err: unknown) => {
              this.logger.error({
                message: 'Auto-execute workflow failed',
                error: err instanceof Error ? err.message : 'Unknown error',
              });
              client.emit('workflow:error', {
                message: err instanceof Error ? err.message : 'Automatsko izvršavanje nije uspelo',
                conversationId,
              });
            });
          }
        }
      }
    } catch (error) {
      // Extract meaningful error details from HttpException or plain Error
      let errorType = 'processing_error';
      let errorMessage = 'Failed to process message';

      if (error instanceof HttpException) {
        const response = error.getResponse();
        if (typeof response === 'object' && response !== null) {
          const resp = response as Record<string, unknown>;
          errorType = (resp['type'] as string) ?? errorType;
          errorMessage = (resp['detail'] as string) ?? (resp['message'] as string) ?? error.message;
        } else {
          errorMessage = error.message;
        }
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }

      this.logger.error({
        message: 'Failed to process chat message',
        conversationId,
        userId: authenticatedClient.userId,
        errorType,
        error: errorMessage,
      });

      client.emit('chat:error', {
        type: errorType,
        message: errorMessage,
      });
    }
  }

  /**
   * Post-processing: generates auto-tasks from the conversation using a separate LLM call.
   * Runs as fire-and-forget so it doesn't block the chat response.
   */
  private async generateAutoTasks(
    client: Socket,
    userId: string,
    tenantId: string,
    conversationId: string,
    conceptId: string | null,
    userMessage: string,
    aiResponse: string,
    conversationHistory: ChatMessage[],
    messageId: string,
    relevantConcepts?: import('@mentor-ai/shared/types').ConceptMatch[],
    forceRedo = false
  ): Promise<void> {
    // Only generate tasks every 2nd AI response to avoid excessive LLM calls
    const messageCount = conversationHistory.length;
    if (messageCount < 2) return; // Need at least 1 exchange

    // Load tenant for business-specific context
    let tenantName = 'klijent';
    let tenantIndustry = 'opšta';
    try {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, industry: true },
      });
      if (tenant?.name) tenantName = tenant.name;
      if (tenant?.industry) tenantIndustry = tenant.industry;
    } catch {
      /* non-blocking */
    }

    // Build concept context
    let conceptHint = '';
    if (relevantConcepts && relevantConcepts.length > 0) {
      conceptHint =
        '\nPovezani koncepti: ' +
        relevantConcepts
          .slice(0, 3)
          .map((c) => c.conceptName)
          .join(', ');
    }

    const taskSystemPrompt = `Ti si poslovni asistent za "${tenantName}" (${tenantIndustry}).
Iz konverzacije izvuci 1-3 konkretna, izvršiva zadatka. Fokusiraj se na praktične sledeće korake koje korisnik može preduzeti.${conceptHint}

PRAVILA:
- "title": akcioni naslov na srpskom, max 80 karaktera (npr. "Analizirajte mesečne troškove marketinga")
- "content": konkretan opis šta treba uraditi, zašto, i koji je očekivani rezultat (150-400 karaktera)
- Zadaci moraju biti SPECIFIČNI za "${tenantName}" — ne generički poslovni saveti
- Samo izvršive stavke — ne opšte observacije
- Ako nema smislenih zadataka, vrati prazan niz
- Piši ISKLJUČIVO na srpskom jeziku`;

    const taskUserPrompt = `KORISNIK: ${userMessage}

AI ODGOVOR: ${aiResponse.length > 2000 ? aiResponse.substring(0, 2000) + '...' : aiResponse}

Odgovori SAMO sa validnim JSON nizom: [{"title":"...","content":"..."}]
Ako nema zadataka: []`;

    try {
      let taskResponseContent = '';
      await this.aiGatewayService.streamCompletionWithContext(
        [
          { role: 'system', content: taskSystemPrompt },
          { role: 'user', content: taskUserPrompt },
        ],
        {
          tenantId,
          userId,
          skipRateLimit: true,
          skipQuotaCheck: true,
        },
        (chunk: string) => {
          taskResponseContent += chunk;
        }
      );

      // Parse the JSON response
      const cleanedContent = taskResponseContent
        .replace(/```(?:json)?\s*/gi, '')
        .replace(/```/g, '')
        .trim();
      const jsonMatch = cleanedContent.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        this.logger.debug({
          message: 'No JSON array found in task generation response',
          conversationId,
        });
        return;
      }

      const tasks = JSON.parse(jsonMatch[0]) as Array<{ title: string; content: string }>;
      if (!Array.isArray(tasks) || tasks.length === 0) return;

      // Create notes for each task (max 3)
      const effectiveConceptId = conceptId ?? relevantConcepts?.[0]?.conceptId ?? undefined;
      const tasksToCreate = tasks.slice(0, 3);

      // Tenant-wide dedup (Story 3.4 AC3)
      let createdCount = 0;
      let reusedCount = 0;
      for (const task of tasksToCreate) {
        if (!task.title) continue;
        const existingId = await this.notesService.findExistingTask(tenantId, {
          conceptId: effectiveConceptId,
          title: task.title,
        });
        if (existingId) {
          this.logger.debug({
            message: 'Skipping duplicate auto-task',
            title: task.title,
            existingId,
            tenantId,
          });
          continue;
        }

        // Prior work reuse for auto-tasks
        if (!forceRedo && effectiveConceptId) {
          const reusable = await this.notesService.findReusableTask(tenantId, effectiveConceptId, task.title);
          if (reusable) {
            await this.notesService.createNote({
              title: task.title,
              content: reusable.content,
              source: NoteSource.CONVERSATION,
              noteType: NoteType.TASK,
              status: NoteStatus.COMPLETED,
              conversationId,
              conceptId: effectiveConceptId,
              messageId,
              userId,
              tenantId,
              reusedFromNoteId: reusable.id,
              userReport: reusable.userReport,
              aiScore: reusable.aiScore,
              aiFeedback: reusable.aiFeedback ?? undefined,
            });
            reusedCount++;
            this.logger.log({
              message: 'Reused prior work for auto-task',
              title: task.title,
              reusedFrom: reusable.id,
              score: reusable.aiScore,
            });
            continue;
          }
        }

        await this.notesService.createNote({
          title: task.title,
          content:
            typeof task.content === 'object'
              ? JSON.stringify(task.content, null, 2)
              : (task.content ?? ''),
          source: NoteSource.CONVERSATION,
          noteType: NoteType.TASK,
          status: NoteStatus.PENDING,
          conversationId,
          conceptId: effectiveConceptId,
          messageId,
          userId,
          tenantId,
        });
        createdCount++;
      }

      if (createdCount === 0 && reusedCount === 0) return;

      // Notify frontend that new notes are available
      client.emit('chat:notes-updated', { conversationId, count: createdCount + reusedCount });

      this.logger.log({
        message: 'Auto-tasks generated',
        conversationId,
        freshCount: createdCount,
        reusedCount,
      });
    } catch (error: unknown) {
      this.logger.warn({
        message: 'Failed to generate auto-tasks',
        conversationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Post-processing: auto-classifies a conversation to a curriculum concept
   * using semantic similarity search. Runs fire-and-forget.
   */
  private async autoClassifyConversation(
    client: Socket,
    tenantId: string,
    userId: string,
    conversationId: string,
    userMessage: string,
    aiResponse: string
  ): Promise<void> {
    // Check if conversation already has a concept assigned
    const conv = await this.conversationService.getConversation(tenantId, conversationId, userId);
    if (conv.conceptId) return;

    // Use LLM classifier to determine intent → category → best concept
    // Falls back to standard semantic/keyword search on LLM failure
    const matches = await this.conceptClassifierService.classifyAndMatch(
      userMessage,
      aiResponse,
      { limit: 1, threshold: 0.5 },
      { tenantId, userId, conversationId }
    );

    const topMatch = matches[0];
    if (topMatch) {
      await this.conversationService.updateConceptId(
        tenantId,
        conversationId,
        userId,
        topMatch.conceptId
      );

      // Retroactively link existing tasks that had no concept
      await this.notesService
        .updateConceptIdForConversation(conversationId, topMatch.conceptId, tenantId)
        .catch(() => {
          /* ignore — best-effort linkage */
        });

      client.emit('chat:concept-detected', {
        conversationId,
        conceptId: topMatch.conceptId,
        conceptName: topMatch.conceptName,
      });

      this.logger.log({
        message: 'Conversation auto-classified (LLM)',
        conversationId,
        conceptId: topMatch.conceptId,
        conceptName: topMatch.conceptName,
        category: topMatch.category,
        score: topMatch.score,
      });
    }
  }

  // ─── Complex Query Detection (Multi-Step Orchestration) ────────

  private isComplexQuery(content: string): boolean {
    const lower = content.toLowerCase().trim();

    // Skip short messages (greetings, yes/no)
    if (lower.length < 30) return false;

    // Skip simple patterns
    if (
      /^(šta je|što je|what is|objasni|explain|zdravo|hej|ćao|hi|hello|da|ne|ok|važi|hvala)\b/.test(
        lower
      )
    )
      return false;

    // Complex intent verbs (Serbian + English)
    const complexVerbs =
      /\b(analiziraj|analizuj|uporedi|poredi|istraži|istražuj|razvij|razradi|predloži|predlozi|osmisli|isplaniraj|planiraj|dizajniraj|optimizuj|proceni|evaluate|analyze|compare|research|develop|plan|design|optimize|assess|benchmark|strategij)/;

    // Complex intent nouns signaling depth
    const complexNouns =
      /\b(strategij|analiz|konkurencij|tržišt|market|poslovni model|finansijsk|budžet|budget|roi|plan rasta|growth|scaling|skaliranj|optimizacij|swot|pest|porter|canvas|due diligence|rizik|pricing|cenovna|revenue|prihod|forecast|prognoz|roadmap)/;

    // Multi-clause (comma + action verb = multiple asks)
    const multiClause = /,\s*(i\s+)?(predloži|analiziraj|napravi|razvij|osmisli|kreiraj)/.test(
      lower
    );

    // Require BOTH a complex verb AND a complex noun, or multi-clause
    // (previously triggered on verb OR noun alone, causing too many double-calls)
    return (complexVerbs.test(lower) && complexNouns.test(lower)) || multiClause;
  }

  // ─── Explicit Task Creation ─────────────────────────────────────

  private hasRedoIntent(content: string): boolean {
    const lower = content.toLowerCase();
    return /\b(ponovo|iznova|opet|redo|ponoviti|again|refresh|ažuriraj|azuriraj|osvezi|osveži)\b/.test(
      lower
    );
  }

  private hasExplicitTaskIntent(userMessage: string): boolean {
    const lowerMsg = userMessage.toLowerCase();

    // Action verbs (Serbian + English) — \b only at start so "kreirajte" matches "kreiraj" prefix
    const actionVerbs =
      /\b(kreiraj|napravi|generiši|generisi|dodaj|create|make|add|generate|osmisli|predloži|predlozi|definiši|definisi|razradi|isplaniraj|planiraj|odredi|postavi|sastavi|pripremi)/;
    // Task nouns — NO trailing \b so Serbian inflected roots match: "zadat" → "zadatke", "akcij" → "akcije"
    const taskNouns =
      /\b(tasks?|zadat|plan|workflow|korak|koraci|akcij|to-?do|stavk|cilj|strategi|aktivnost|raspored|checklis|list)/;

    // Match if message contains both an action verb and a task noun (in any order)
    return actionVerbs.test(lowerMsg) && taskNouns.test(lowerMsg);
  }

  private async detectAndCreateExplicitTasks(
    client: Socket,
    userId: string,
    tenantId: string,
    conversationId: string,
    conceptId: string | null,
    userMessage: string,
    aiResponse: string,
    relevantConcepts?: import('@mentor-ai/shared/types').ConceptMatch[],
    forceRedo = false
  ): Promise<void> {
    this.logger.log({
      message: 'Explicit task creation intent detected',
      conversationId,
      userId,
    });

    // Load business context for task personalization
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, industry: true, description: true },
    });

    // Load recent conversation history for full context
    let conversationContext = '';
    try {
      const recentMessages = await this.prisma.message.findMany({
        where: { conversationId },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { role: true, content: true },
      });
      if (recentMessages.length > 0) {
        conversationContext = '\n\nISTORIJA KONVERZACIJE (kontekst iz kojeg nastaju zadaci):\n';
        for (const msg of recentMessages.reverse()) {
          const role = msg.role === 'USER' ? 'KORISNIK' : 'AI';
          const content =
            msg.content.length > 800 ? msg.content.substring(0, 800) + '...' : msg.content;
          conversationContext += `${role}: ${content}\n`;
        }
      }
    } catch {
      /* non-blocking */
    }

    // Build concept context from matched concepts
    let conceptContext = '';
    if (relevantConcepts && relevantConcepts.length > 0) {
      conceptContext = '\n\nPOVEZANI POSLOVNI KONCEPTI:\n';
      for (const c of relevantConcepts.slice(0, 5)) {
        conceptContext += `- ${c.conceptName} (${c.category}): ${c.definition}\n`;
      }
    }

    // LLM extraction with full context
    const extractSystemPrompt = `Ti si poslovni konsultant koji kreira konkretne, izvršive zadatke za kompaniju "${tenant?.name ?? 'klijent'}" u industriji "${tenant?.industry ?? 'opšta'}".
${tenant?.description ? `Opis kompanije: ${tenant.description}` : ''}

Tvoj posao: Na osnovu onoga što je korisnik TRAŽIO i šta je AI ODGOVORIO, ekstrahuj konkretne poslovne zadatke.

PRAVILA ZA SVAKI ZADATAK:
1. "title" — akcioni naslov na srpskom (glagol + radnja, max 80 karaktera): "Analizirajte...", "Kreirajte...", "Definišite..."
2. "content" — strukturiran opis sa:
   - Cilj: šta konkretno treba postići (1-2 rečenice)
   - Kontekst: zašto je ovo važno za poslovanje (1-2 rečenice)
   - Koraci: 3-5 konkretnih koraka za realizaciju
   - Očekivani rezultat: merljiv ishod ili deliverable
3. "conceptMatch" — ako zadatak odgovara nekom od POVEZANIH POSLOVNIH KONCEPATA, navedi naziv koncepta (tačan match)

KRITIČNO:
- Zadaci MORAJU biti direktno povezani sa onim što je korisnik TRAŽIO u konverzaciji
- Svaki zadatak mora biti SPECIFIČAN za "${tenant?.name ?? 'ovu kompaniju'}" — ne generički
- Izdvoji samo izvršive stavke — ne opšte observacije ili savete
- Minimum 3, maksimum 8 zadataka
- Piši ISKLJUČIVO na srpskom jeziku`;

    const extractUserPrompt = `KORISNIKOV ZAHTEV:
${userMessage}

AI ODGOVOR:
${aiResponse}${conversationContext}${conceptContext}

Odgovori SAMO sa validnim JSON nizom:
[{"title":"...","content":"...","conceptMatch":"naziv koncepta ili null"}]`;

    try {
      let extractedContent = '';
      await this.aiGatewayService.streamCompletionWithContext(
        [
          { role: 'system', content: extractSystemPrompt },
          { role: 'user', content: extractUserPrompt },
        ],
        { tenantId, userId, skipRateLimit: true, skipQuotaCheck: true },
        (chunk: string) => {
          extractedContent += chunk;
        }
      );

      // Strip markdown code block wrappers
      const cleanedContent = extractedContent
        .replace(/```(?:json)?\s*/gi, '')
        .replace(/```/g, '')
        .trim();

      const jsonMatch = cleanedContent.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        this.logger.warn({
          message: 'No JSON array in explicit task extraction',
          conversationId,
          extractedContent: extractedContent.substring(0, 500),
        });
        return;
      }

      const tasks = JSON.parse(jsonMatch[0]) as Array<{
        title: string;
        content: string;
        conceptMatch?: string | null;
      }>;
      if (!Array.isArray(tasks) || tasks.length === 0) return;

      // Build concept name → ID map for matching
      const conceptNameMap = new Map<string, string>();
      if (relevantConcepts) {
        for (const c of relevantConcepts) {
          conceptNameMap.set(c.conceptName.toLowerCase(), c.conceptId);
        }
      }

      // Create task notes in DB (with duplicate prevention + prior work reuse)
      const fallbackConceptId = conceptId ?? relevantConcepts?.[0]?.conceptId ?? undefined;
      const createdTasks: Array<{
        id: string;
        title: string;
        conceptId: string | null;
        conversationId: string;
      }> = [];
      const reusedTasks: Array<{
        id: string;
        title: string;
        conceptId: string | null;
        conversationId: string;
      }> = [];

      for (const task of tasks.slice(0, 10)) {
        if (!task.title) continue;

        // Resolve concept: LLM-matched concept name → ID, or fallback
        let taskConceptId = fallbackConceptId;
        if (task.conceptMatch) {
          const matchedId = conceptNameMap.get(task.conceptMatch.toLowerCase());
          if (matchedId) taskConceptId = matchedId;
        }

        // Tenant-wide dedup (Story 3.4 AC3)
        const existingId = await this.notesService.findExistingTask(tenantId, {
          conceptId: taskConceptId,
          title: task.title,
        });
        if (existingId) {
          this.logger.debug({
            message: 'Skipping duplicate explicit task',
            title: task.title,
            existingId,
            tenantId,
          });
          continue;
        }

        // Prior work reuse: check for high-quality completed task on same concept
        if (!forceRedo && taskConceptId) {
          const reusable = await this.notesService.findReusableTask(tenantId, taskConceptId, task.title);
          if (reusable) {
            const result = await this.notesService.createNote({
              title: task.title,
              content: reusable.content,
              source: NoteSource.CONVERSATION,
              noteType: NoteType.TASK,
              status: NoteStatus.COMPLETED,
              conversationId,
              conceptId: taskConceptId,
              userId,
              tenantId,
              reusedFromNoteId: reusable.id,
              userReport: reusable.userReport,
              aiScore: reusable.aiScore,
              aiFeedback: reusable.aiFeedback ?? undefined,
            });
            reusedTasks.push({
              id: result.id,
              title: task.title,
              conceptId: taskConceptId ?? null,
              conversationId,
            });
            this.logger.log({
              message: 'Reused prior work for task',
              title: task.title,
              reusedFrom: reusable.id,
              score: reusable.aiScore,
              tenantId,
            });
            continue;
          }
        }

        const result = await this.notesService.createNote({
          title: task.title,
          content:
            typeof task.content === 'object'
              ? JSON.stringify(task.content, null, 2)
              : (task.content ?? ''),
          source: NoteSource.CONVERSATION,
          noteType: NoteType.TASK,
          status: NoteStatus.PENDING,
          conversationId,
          conceptId: taskConceptId,
          userId,
          tenantId,
        });
        createdTasks.push({
          id: result.id,
          title: task.title,
          conceptId: taskConceptId ?? null,
          conversationId,
        });
      }

      const totalCreated = createdTasks.length + reusedTasks.length;
      if (totalCreated === 0) return;

      // Ensure conversations exist for cross-concept tasks (brain tree lifecycle gap).
      // Without this, concepts with tasks but no conversation appear in the brain tree
      // without a "Pogledaj" navigation link.
      const allTasks = [...createdTasks, ...reusedTasks];
      const crossConceptIds = [
        ...new Set(
          allTasks
            .filter((t) => t.conceptId !== null && t.conceptId !== conceptId)
            .map((t) => t.conceptId!)
        ),
      ];

      if (crossConceptIds.length > 0) {
        for (const crossConceptId of crossConceptIds) {
          try {
            // Check if a conversation already exists for this concept + user
            const existingConv = await this.prisma.conversation.findFirst({
              where: { conceptId: crossConceptId, userId },
              select: { id: true },
            });
            if (existingConv) continue;

            // Look up concept name for the conversation title
            let crossConceptName = 'Zadatak';
            try {
              const concept = await this.conceptService.findById(crossConceptId);
              crossConceptName = concept.name;
            } catch {
              const taskForConcept = allTasks.find((t) => t.conceptId === crossConceptId);
              crossConceptName = taskForConcept?.title ?? 'Zadatak';
            }

            await this.conversationService.createConversation(
              tenantId,
              userId,
              crossConceptName,
              undefined,
              crossConceptId
            );

            this.logger.debug({
              message: 'Created conversation for cross-concept task',
              crossConceptId,
              crossConceptName,
              originConversationId: conversationId,
            });
          } catch (err) {
            this.logger.warn({
              message: 'Failed to create cross-concept conversation',
              crossConceptId,
              error: err instanceof Error ? err.message : 'Unknown',
            });
          }
        }
      }

      // Emit event so frontend shows tasks with execute option
      // reusedTaskIds tells frontend to skip auto-execution for these
      client.emit('chat:tasks-created-for-execution', {
        conversationId,
        taskIds: createdTasks.map((t) => t.id),
        reusedTaskIds: reusedTasks.map((t) => t.id),
        taskCount: totalCreated,
      });

      // Also notify notes updated
      client.emit('chat:notes-updated', { conversationId, count: totalCreated });

      // Send chat message listing created tasks
      const taskList = createdTasks.map((t, i) => `${i + 1}. **${t.title}**`).join('\n');
      const taskMsg = `Kreirao sam ${createdTasks.length} zadatak${createdTasks.length > 1 ? 'a' : ''}:\n\n${taskList}\n\nPokrecem automatsko izvrsavanje. Rezultati ce biti dostupni u panelu zadataka.`;
      try {
        await this.conversationService.addMessage(tenantId, conversationId, MessageRole.ASSISTANT, taskMsg);
        client.emit('chat:message-chunk', { content: taskMsg, index: 0 });
        client.emit('chat:message-complete', { conversationId });
      } catch { /* non-blocking */ }

      this.logger.log({
        message: 'Explicit tasks created',
        conversationId,
        freshCount: createdTasks.length,
        reusedCount: reusedTasks.length,
        conceptsLinked: createdTasks.filter((t) => t.conceptId !== null).length,
      });

      // Tasks created as PENDING — user launches them manually from task panel
    } catch (error: unknown) {
      this.logger.warn({
        message: 'Failed to create explicit tasks',
        conversationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Auto AI Popuni pipeline: checks tenant config, then for each task:
   * 1. Execute AI (same as handleExecuteTaskAi)
   * 2. Copy aiResult to userReport, mark COMPLETED
   * 3. Score the result (same as handleSubmitTaskResult)
   * Emits the same events so frontend picks up progress transparently.
   */
  private async triggerAutoAiPopuni(
    client: Socket,
    tenantId: string,
    userId: string,
    tasks: Array<{ id: string; title: string; conceptId: string | null; conversationId: string }>,
    originConversationId?: string
  ): Promise<void> {
    // Check if auto AI popuni is enabled for this tenant
    let tenant: { autoAiPopuni: boolean } | null;
    try {
      tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { autoAiPopuni: true },
      });
    } catch (err) {
      this.logger.warn({
        message: 'Auto AI Popuni: tenant lookup failed',
        tenantId,
        error: err instanceof Error ? err.message : 'Unknown',
      });
      return;
    }
    if (!tenant?.autoAiPopuni) return;

    this.logger.log({
      message: 'Auto AI Popuni enabled — starting pipeline',
      tenantId,
      taskCount: tasks.length,
    });

    // Create execution record for persistence
    const executionId = await this.executionStateService.createExecution(
      tenantId,
      userId,
      'auto-popuni',
      undefined,
      originConversationId,
      { taskIds: tasks.map((t) => t.id) }
    );

    // Emit event so frontend knows auto-popuni is starting
    this.emitToTenant(tenantId, executionId, 'auto-popuni:start', {
      taskIds: tasks.map((t) => t.id),
      taskCount: tasks.length,
    });

    // Process tasks sequentially (max 1 at a time to avoid LLM overload)
    let completedCount = 0;
    const completedTaskIds: string[] = [];
    for (const task of tasks) {
      try {
        await this.autoPopuniSingleTask(client, tenantId, userId, task, originConversationId);
        completedCount++;
        completedTaskIds.push(task.id);
        this.executionStateService
          .updateCheckpoint(executionId, { completedTaskIds, completedCount })
          .catch((err) =>
            this.logger.debug({ message: 'Checkpoint update failed', error: err?.message })
          );
      } catch (err) {
        this.logger.warn({
          message: 'Auto AI Popuni failed for task',
          taskId: task.id,
          taskTitle: task.title,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
        this.emitToTenant(tenantId, executionId, 'auto-popuni:task-error', {
          taskId: task.id,
          message: 'Automatsko popunjavanje nije uspelo',
        });
      }
    }

    this.emitToTenant(tenantId, executionId, 'auto-popuni:complete', {
      totalTasks: tasks.length,
      completedTasks: completedCount,
    });

    this.executionStateService
      .updateStatus(executionId, 'completed', {
        totalTasks: tasks.length,
        completedTasks: completedCount,
      })
      .catch((err) =>
        this.logger.debug({ message: 'Execution status update failed', error: err?.message })
      );

    this.logger.log({
      message: 'Auto AI Popuni pipeline finished',
      tenantId,
      totalTasks: tasks.length,
      completedTasks: completedCount,
    });

    // C7: After auto-popuni completes tasks, traverse concept_relationships
    // to spawn new PENDING tasks for ADVANCED/related concepts (autonomous growth loop)
    const completedConceptIds = [
      ...new Set(
        tasks.filter((t) => completedTaskIds.includes(t.id) && t.conceptId).map((t) => t.conceptId!)
      ),
    ];

    if (completedConceptIds.length > 0) {
      this.workflowService
        .discoverAndCreatePendingTasks(completedConceptIds, userId, tenantId)
        .then((newConceptIds) => {
          if (newConceptIds.length > 0) {
            this.emitToTenant(tenantId, executionId, 'tree:tasks-discovered', {
              conceptIds: newConceptIds,
              timestamp: new Date().toISOString(),
            });
            this.logger.log({
              message: 'Auto-popuni: post-execution discovery created new tasks',
              newTaskCount: newConceptIds.length,
            });
          }
        })
        .catch((err) => {
          this.logger.warn({
            message: 'Post auto-popuni discovery failed (non-blocking)',
            error: err instanceof Error ? err.message : 'Unknown',
          });
        });
    }
  }

  /**
   * Auto-popuni for a single task:
   * 1. AI executes the task (stream to client)
   * 2. Mark as COMPLETED with userReport
   * 3. Score the result (stream to client)
   */
  private async autoPopuniSingleTask(
    client: Socket,
    tenantId: string,
    userId: string,
    task: { id: string; title: string; conceptId: string | null; conversationId: string },
    _originConversationId?: string
  ): Promise<void> {
    const convId = task.conversationId;

    // Use HeadlessExecutor — same pipeline as maturity flow:
    // synthesis → job planner → Gemini search → Brave → DeepSeek agents → consolidation
    client.emit('task:ai-start', {
      taskId: task.id,
      conversationId: convId,
      timestamp: new Date().toISOString(),
      auto: true,
    });

    const result = await this.headlessExecutor.executeTask({
      taskId: task.id,
      tenantId,
      userId,
    });

    if (result.success) {
      client.emit('task:ai-complete', {
        taskId: task.id,
        conversationId: convId,
        auto: true,
      });
    } else {
      client.emit('task:ai-error', {
        taskId: task.id,
        conversationId: convId,
        error: result.error,
        auto: true,
      });
    }

    client.emit('chat:notes-updated', { conversationId: convId, count: 0 });
  }


  // Legacy autoPopuniSingleTask body removed - now uses HeadlessExecutor


  // ─── YOLO Auto-Popuni Queue (H2 fix: sequential to avoid LLM overload) ───
  private autoPopuniYoloQueue: Array<{
    client: Socket;
    tenantId: string;
    userId: string;
    taskId: string;
    conversationId: string;
  }> = [];
  private isProcessingAutoPopuniYolo = false;

  /**
   * Enqueue a YOLO-completed task for auto-popuni (synthesize + score).
   * Tasks are processed sequentially to avoid overwhelming the LLM provider.
   */
  private enqueueAutoPopuniAfterYolo(
    client: Socket,
    tenantId: string,
    userId: string,
    taskId: string,
    conversationId: string
  ): void {
    this.autoPopuniYoloQueue.push({ client, tenantId, userId, taskId, conversationId });
    this.processAutoPopuniYoloQueue().catch((err) => {
      this.logger.warn({
        message: 'YOLO auto-popuni queue processing error',
        error: err instanceof Error ? err.message : 'Unknown',
      });
    });
  }

  private async processAutoPopuniYoloQueue(): Promise<void> {
    if (this.isProcessingAutoPopuniYolo) return;
    this.isProcessingAutoPopuniYolo = true;

    while (this.autoPopuniYoloQueue.length > 0) {
      const item = this.autoPopuniYoloQueue.shift()!;
      await this.autoPopuniAfterYolo(
        item.client,
        item.tenantId,
        item.userId,
        item.taskId,
        item.conversationId
      );
    }

    this.isProcessingAutoPopuniYolo = false;
  }

  /**
   * Auto AI Popuni after YOLO completes a task: synthesize workflow step
   * outputs into a userReport and score it. Checks tenant config first.
   * Reuses the same handleExecuteTaskAi → handleSubmitTaskResult logic.
   * Emits auto-popuni:start/complete events for frontend spinner (H3 fix).
   */
  private async autoPopuniAfterYolo(
    client: Socket,
    tenantId: string,
    userId: string,
    taskId: string,
    conversationId: string
  ): Promise<void> {
    // Check if auto AI popuni is enabled
    try {
      const tenant = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { autoAiPopuni: true },
      });
      if (!tenant?.autoAiPopuni) return;
    } catch (err) {
      this.logger.warn({
        message: 'YOLO auto-popuni: tenant lookup failed',
        tenantId,
        error: err instanceof Error ? err.message : 'Unknown',
      });
      return;
    }

    this.logger.log({
      message: 'YOLO auto-popuni: synthesizing + scoring task',
      taskId,
      tenantId,
    });

    // Emit start event so frontend shows spinner (H3 fix)
    client.emit('auto-popuni:start', {
      taskIds: [taskId],
      taskCount: 1,
    });

    // Reuse handleExecuteTaskAi — it synthesizes child notes into a final
    // deliverable, auto-scores via scoreTaskInternal, and plans agent jobs.
    try {
      await this.handleExecuteTaskAi(client, { taskId, conversationId });
      // Emit complete event (H3 fix)
      client.emit('auto-popuni:complete', { totalTasks: 1, completedTasks: 1 });

      // Maturity Engine: update stage progress after task completion
      try {
        const note = await this.prisma.note.findUnique({
          where: { id: taskId },
          select: { conceptId: true },
        });
        if (note?.conceptId) {
          const result = await this.maturityEngine.onConceptCompleted(
            tenantId, note.conceptId, taskId, userId
          );
          if (result.stageCompleted) {
            client.emit('maturity:stage-completed', {
              stage: result.nextStage,
            });
          }
        }
      } catch (maturityErr) {
        this.logger.warn({
          message: 'Maturity stage update failed (non-blocking)',
          taskId,
          error: maturityErr instanceof Error ? maturityErr.message : 'Unknown',
        });
      }
    } catch (err) {
      this.logger.warn({
        message: 'YOLO auto-popuni AI execute failed',
        taskId,
        error: err instanceof Error ? err.message : 'Unknown',
      });
      client.emit('auto-popuni:complete', { totalTasks: 1, completedTasks: 0 });
    }
  }

  // ─── Workflow / Agent Execution Events ─────────────────────────

  /**
   * Handles "Run Agents" request: builds an execution plan from selected tasks.
   */
  @SubscribeMessage('workflow:run-agents')
  async handleRunAgents(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { taskIds: string[]; conversationId: string }
  ): Promise<void> {
    const authenticatedClient = client as AuthenticatedSocket;

    try {
      this.logger.log({
        message: 'Run Agents requested',
        userId: authenticatedClient.userId,
        taskIds: payload.taskIds,
        conversationId: payload.conversationId,
      });

      // Check if tasks have linked concepts — tasks created from chat may not
      const tasks = await this.prisma.note.findMany({
        where: {
          id: { in: payload.taskIds },
          tenantId: authenticatedClient.tenantId,
          noteType: 'TASK',
          status: 'PENDING',
        },
        select: { id: true, conceptId: true },
      });

      const tasksWithConcepts = tasks.filter((t) => t.conceptId);
      const tasksWithoutConcepts = tasks.filter((t) => !t.conceptId);

      // If ALL tasks lack concepts, use direct AI execution instead of workflow
      if (tasksWithConcepts.length === 0 && tasksWithoutConcepts.length > 0) {
        this.logger.log({
          message: 'Tasks have no concepts — falling back to direct AI execution',
          taskCount: tasksWithoutConcepts.length,
        });
        for (const task of tasksWithoutConcepts) {
          await this.handleExecuteTaskAi(client, {
            taskId: task.id,
            conversationId: payload.conversationId,
          });
        }
        return;
      }

      // Build workflow execution plan for concept-linked tasks
      const taskIdsForPlan =
        tasksWithConcepts.length < tasks.length
          ? tasksWithConcepts.map((t) => t.id)
          : payload.taskIds;

      const plan = await this.workflowService.buildExecutionPlan(
        taskIdsForPlan,
        authenticatedClient.userId,
        authenticatedClient.tenantId,
        payload.conversationId
      );

      const event: WorkflowPlanReadyPayload = {
        plan,
        conversationId: payload.conversationId,
      };
      client.emit('workflow:plan-ready', event);

      // Execute concept-less tasks via direct AI (after plan is sent)
      for (const task of tasksWithoutConcepts) {
        await this.handleExecuteTaskAi(client, {
          taskId: task.id,
          conversationId: payload.conversationId,
        });
      }
    } catch (error) {
      this.logger.error({
        message: 'Failed to build execution plan',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      client.emit('workflow:error', {
        message: error instanceof Error ? error.message : 'Failed to build plan',
        conversationId: payload.conversationId,
      });
    }
  }

  // ─── Parallel Popuni (Manual Mode) ─────────────────────────────

  /** Active batch cancellation flags — set batchId → true to cancel */
  private parallelPopuniCancelled = new Map<string, boolean>();

  @SubscribeMessage('workflow:parallel-popuni')
  async handleParallelPopuni(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: { taskIds: string[]; conversationId: string; autoPopuni?: boolean }
  ): Promise<void> {
    // Block old pipeline in brain relay mode
    if (this.configService.get<string>('BRAIN_RELAY_MODE', 'false') === 'true') {
      client.emit('workflow:error', {
        message: 'Brain relay mode aktivan — koristite novi UI za pokretanje zadataka.',
        conversationId: payload.conversationId,
      });
      return;
    }

    const auth = client as AuthenticatedSocket;
    const { userId, tenantId } = auth;

    try {
      if (!payload.taskIds?.length) {
        client.emit('workflow:error', {
          message: 'Nema izabranih zadataka',
          conversationId: payload.conversationId,
        });
        return;
      }

      const batchId = createId();
      this.parallelPopuniCancelled.set(batchId, false);

      this.logger.log({
        message: 'Parallel Popuni requested',
        batchId,
        userId,
        taskCount: payload.taskIds.length,
      });

      // Load only PENDING tasks — skip already completed ones to avoid re-execution
      const tasks = await this.prisma.note.findMany({
        where: {
          id: { in: payload.taskIds },
          tenantId,
          noteType: 'TASK',
          status: 'PENDING',
        },
        select: {
          id: true,
          title: true,
          content: true,
          conceptId: true,
          conversationId: true,
          status: true,
          expectedOutcome: true,
        },
      });

      if (tasks.length === 0) {
        client.emit('workflow:error', {
          message: 'Zadaci nisu pronađeni',
          conversationId: payload.conversationId,
        });
        return;
      }

      // Determine auto-popuni: use payload flag, or fall back to tenant setting
      let autoPopuni = payload.autoPopuni;
      if (autoPopuni === undefined) {
        const tenant = await this.prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { autoAiPopuni: true },
        });
        autoPopuni = tenant?.autoAiPopuni ?? false;
      }

      // Resolve PREREQUISITE dependency layers
      const layers = await this.resolveParallelDependencies(tasks);

      // Create per-concept conversations (same pattern as handleWorkflowApproval line 3463)
      const conceptConversations = new Map<string, string>();
      const uniqueConceptIds = [
        ...new Set(tasks.filter((t) => t.conceptId).map((t) => t.conceptId!)),
      ];
      for (const conceptId of uniqueConceptIds) {
        // Use actual concept name from DB, fall back to task title
        let conceptName = 'Zadatak';
        try {
          const concept = await this.conceptService.findById(conceptId);
          conceptName = concept.name;
        } catch {
          const taskForConcept = tasks.find((t) => t.conceptId === conceptId);
          conceptName = taskForConcept?.title ?? 'Zadatak';
        }
        try {
          const conv = await this.conversationService.createConversation(
            tenantId,
            userId,
            conceptName,
            undefined,
            conceptId
          );
          conceptConversations.set(conceptId, conv.id);
        } catch (err) {
          this.logger.warn({
            message: 'Failed to create concept conversation for parallel-popuni',
            conceptId,
            error: err instanceof Error ? err.message : 'Unknown',
          });
        }
      }

      // Link task notes to their concept conversations
      for (const task of tasks) {
        if (task.conceptId && conceptConversations.has(task.conceptId)) {
          await this.prisma.note
            .update({
              where: { id: task.id },
              data: { conversationId: conceptConversations.get(task.conceptId)! },
            })
            .catch(() => {
              /* ignore link failure */
            });
        }
      }

      // Build initial task states
      const initialStates: ParallelPopuniTaskState[] = tasks.map((t) => ({
        taskId: t.id,
        title: t.title,
        status: 'queued' as ParallelTaskStatus,
      }));

      // Emit start
      const startPayload: ParallelPopuniStartPayload = {
        batchId,
        tasks: initialStates,
      };
      client.emit('parallel-popuni:start', startPayload);

      // Run the parallel loop (fire-and-forget with error handling)
      this.runParallelPopuniLoop(
        client,
        layers,
        batchId,
        tenantId,
        userId,
        payload.conversationId,
        autoPopuni,
        conceptConversations
      ).catch((err) => {
        this.parallelPopuniCancelled.delete(batchId);
        this.logger.error({
          message: 'Parallel Popuni loop crashed',
          batchId,
          error: err instanceof Error ? err.message : 'Unknown',
        });
        // C2: Always emit batch-done even on crash so frontend UI doesn't get stuck
        client.emit('parallel-popuni:batch-done', {
          batchId,
          completedCount: 0,
          failedCount: 1,
        } satisfies ParallelPopuniBatchDonePayload);
      });
    } catch (error) {
      this.logger.error({
        message: 'Parallel Popuni handler failed',
        error: error instanceof Error ? error.message : 'Unknown',
      });
      client.emit('workflow:error', {
        message: error instanceof Error ? error.message : 'Greška pri pokretanju',
        conversationId: payload.conversationId,
      });
    }
  }

  @SubscribeMessage('parallel-popuni:cancel')
  handleParallelPopuniCancel(
    @ConnectedSocket() _client: Socket,
    @MessageBody() payload: { batchId: string }
  ): void {
    if (payload.batchId && this.parallelPopuniCancelled.has(payload.batchId)) {
      this.parallelPopuniCancelled.set(payload.batchId, true);
      this.logger.log({ message: 'Parallel Popuni cancelled', batchId: payload.batchId });
    }
  }

  /**
   * Resolve PREREQUISITE dependency layers among selected tasks.
   * Returns array of layers — each layer's tasks can run simultaneously.
   * Layer N+1 depends on Layer N.
   */
  private async resolveParallelDependencies(
    tasks: Array<{ id: string; conceptId: string | null }>
  ): Promise<Array<Array<{ id: string; conceptId: string | null }>>> {
    const conceptIds = tasks.filter((t) => t.conceptId).map((t) => t.conceptId!);

    if (conceptIds.length === 0) {
      // No concepts → all tasks in one layer (all parallel)
      return [tasks];
    }

    // Load PREREQUISITE edges between selected task concepts
    const relationships = await this.prisma.conceptRelationship.findMany({
      where: {
        relationshipType: 'PREREQUISITE',
        sourceConceptId: { in: conceptIds },
        targetConceptId: { in: conceptIds },
      },
      select: { sourceConceptId: true, targetConceptId: true },
    });

    // Build in-degree map (conceptId → count of prerequisites among selected)
    const conceptToTask = new Map<string, string[]>();
    for (const t of tasks) {
      if (t.conceptId) {
        const existing = conceptToTask.get(t.conceptId) ?? [];
        existing.push(t.id);
        conceptToTask.set(t.conceptId, existing);
      }
    }

    // taskId → set of prerequisite taskIds (among selected)
    const prereqs = new Map<string, Set<string>>();
    for (const t of tasks) prereqs.set(t.id, new Set());

    for (const rel of relationships) {
      // source is PREREQUISITE of target → target depends on source
      const dependentTaskIds = conceptToTask.get(rel.targetConceptId) ?? [];
      const prereqTaskIds = conceptToTask.get(rel.sourceConceptId) ?? [];
      for (const depId of dependentTaskIds) {
        for (const preId of prereqTaskIds) {
          if (depId !== preId) {
            prereqs.get(depId)?.add(preId);
          }
        }
      }
    }

    // Topological sort into layers (Kahn's algorithm)
    const layers: Array<Array<{ id: string; conceptId: string | null }>> = [];
    const taskMap = new Map(tasks.map((t) => [t.id, t]));
    const remaining = new Set(tasks.map((t) => t.id));

    while (remaining.size > 0) {
      // Find all tasks with no unresolved prerequisites
      const layer: Array<{ id: string; conceptId: string | null }> = [];
      for (const taskId of remaining) {
        const deps = prereqs.get(taskId)!;
        const unresolvedDeps = [...deps].filter((d) => remaining.has(d));
        if (unresolvedDeps.length === 0) {
          layer.push(taskMap.get(taskId)!);
        }
      }

      if (layer.length === 0) {
        // Circular dependency — dump remaining into one layer
        for (const taskId of remaining) {
          layer.push(taskMap.get(taskId)!);
        }
        layers.push(layer);
        break;
      }

      for (const t of layer) remaining.delete(t.id);
      layers.push(layer);
    }

    this.logger.log({
      message: 'Parallel dependency resolution',
      layerCount: layers.length,
      layerSizes: layers.map((l) => l.length),
    });

    return layers;
  }

  /**
   * Execute all dependency layers, running all tasks within a layer simultaneously.
   */
  private async runParallelPopuniLoop(
    client: Socket,
    layers: Array<Array<{ id: string; conceptId: string | null }>>,
    batchId: string,
    tenantId: string,
    userId: string,
    conversationId: string,
    autoPopuni: boolean,
    conceptConversations: Map<string, string>
  ): Promise<void> {
    // Cache business context once for all tasks (lean: skip chat-only formatting/capabilities)
    const businessContext = await this.buildBusinessContext(tenantId, userId, { lean: true });

    // Pre-load tenant + brainContext once for all workflow steps across all tasks
    const [cachedTenant, cachedBrainCtx] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, industry: true, description: true },
      }),
      this.businessContextService.getBusinessContext(tenantId).catch(() => ''),
    ]);
    const stepCachedContext = { tenant: cachedTenant, brainContext: cachedBrainCtx };

    const completedSummaries = new Map<string, string>();
    let completedCount = 0;
    let failedCount = 0;

    for (let layerIdx = 0; layerIdx < layers.length; layerIdx++) {
      if (this.parallelPopuniCancelled.get(batchId)) break;

      const layer = layers[layerIdx]!;
      this.logger.log({
        message: `Parallel Popuni: executing layer ${layerIdx + 1}/${layers.length}`,
        batchId,
        taskCount: layer.length,
      });

      // Run ALL tasks in this layer simultaneously
      const results = await Promise.allSettled(
        layer.map((task) =>
          this.executeParallelPopuniWorker(
            client,
            task,
            batchId,
            tenantId,
            userId,
            businessContext,
            completedSummaries,
            autoPopuni,
            conceptConversations,
            stepCachedContext
          )
        )
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          completedCount++;
        } else {
          failedCount++;
        }
      }
    }

    // Clean up cancellation flag
    this.parallelPopuniCancelled.delete(batchId);

    // Emit batch done
    const batchDone: ParallelPopuniBatchDonePayload = {
      batchId,
      completedCount,
      failedCount,
    };
    client.emit('parallel-popuni:batch-done', batchDone);

    this.logger.log({
      message: 'Parallel Popuni batch complete',
      batchId,
      completedCount,
      failedCount,
    });

    // Story 3.2: Discover related concepts and create new pending tasks
    const completedConceptIds = [
      ...new Set(
        layers
          .flat()
          .filter((task) => completedSummaries.has(task.id) && task.conceptId)
          .map((task) => task.conceptId!)
      ),
    ];

    if (completedConceptIds.length > 0) {
      this.workflowService
        .discoverAndCreatePendingTasks(completedConceptIds, userId, tenantId)
        .then((newConceptIds) => {
          if (newConceptIds.length > 0) {
            client.emit('tree:tasks-discovered', {
              conceptIds: newConceptIds,
              conversationId,
              timestamp: new Date().toISOString(),
            });
            this.logger.log({
              message: 'Parallel Popuni: post-execution discovery created new tasks',
              batchId,
              newTaskCount: newConceptIds.length,
            });
          }
        })
        .catch((err) => {
          this.logger.warn({
            message: 'Post parallel-popuni discovery failed (non-blocking)',
            batchId,
            error: err instanceof Error ? err.message : 'Unknown',
          });
        });
    }
  }

  /**
   * Execute a single task in the parallel popuni batch.
   * Full lifecycle: workflow → steps → synthesis → scoring → job planning.
   * Modeled after autoPopuniSingleTask but emits parallel-popuni events.
   */
  private async executeParallelPopuniWorker(
    client: Socket,
    task: { id: string; conceptId: string | null },
    batchId: string,
    tenantId: string,
    userId: string,
    _businessContext: string,
    completedSummaries: Map<string, string>,
    _autoPopuni: boolean,
    _conceptConversations: Map<string, string>,
    _stepCachedContext?: {
      tenant: { name: string; industry: string | null; description: string | null } | null;
      brainContext: string;
    }
  ): Promise<void> {
    const taskNote = await this.prisma.note.findUnique({ where: { id: task.id } });
    if (!taskNote) throw new Error(`Task ${task.id} not found`);

    // Skip already completed tasks
    if (taskNote.status === 'COMPLETED' && taskNote.userReport) {
      const donePayload: ParallelPopuniTaskDonePayload = {
        batchId,
        taskId: task.id,
        status: 'completed',
        score: taskNote.aiScore,
      };
      client.emit('parallel-popuni:task-done', donePayload);
      completedSummaries.set(task.id, (taskNote.userReport ?? '').substring(0, 500));
      return;
    }

    try {
      // Execute via HeadlessExecutor — same pipeline as maturity flow
      const progressPayload: ParallelPopuniProgressPayload = {
        batchId,
        taskId: task.id,
        status: 'running-workflow',
      };
      client.emit('parallel-popuni:task-progress', progressPayload);

      const result = await this.headlessExecutor.executeTask({
        taskId: task.id,
        tenantId,
        userId,
      });

      const updatedNote = await this.prisma.note.findUnique({
        where: { id: task.id },
        select: { userReport: true, aiScore: true },
      });

      completedSummaries.set(task.id, (updatedNote?.userReport ?? '').substring(0, 500));

      if (!result.success) {
        throw new Error(result.error ?? 'HeadlessExecutor failed');
      }

      const score = updatedNote?.aiScore ?? null;

      // Emit task done
      const donePayload: ParallelPopuniTaskDonePayload = {
        batchId,
        taskId: task.id,
        status: 'completed',
        score,
      };
      client.emit('parallel-popuni:task-done', donePayload);
    } catch (err) {
      this.logger.warn({
        message: 'Parallel Popuni worker failed',
        batchId,
        taskId: task.id,
        error: err instanceof Error ? err.message : 'Unknown',
      });

      const errorPayload: ParallelPopuniTaskDonePayload = {
        batchId,
        taskId: task.id,
        status: 'failed',
        error: err instanceof Error ? err.message : 'Nepoznata greška',
      };
      client.emit('parallel-popuni:task-done', errorPayload);
      throw err; // Let Promise.allSettled catch it
    }
  }

  /**
   * Fetches a pre-built execution plan by ID.
   * If the plan is not in memory (e.g. server restart), rebuilds from DB tasks.
   */
  @SubscribeMessage('workflow:get-plan')
  async handleGetPlan(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { planId: string; conversationId: string }
  ): Promise<void> {
    const authenticatedClient = client as AuthenticatedSocket;
    const { userId, tenantId } = authenticatedClient;

    try {
      // Verify the user owns this conversation
      const conv = await this.conversationService.getConversation(
        tenantId,
        payload.conversationId,
        userId
      );
      if (!conv) {
        client.emit('workflow:error', {
          message: 'Conversation not found',
          conversationId: payload.conversationId,
        });
        return;
      }

      // Try to fetch the plan from in-memory store
      const plan = this.workflowService.getActivePlan(payload.planId);
      if (plan) {
        client.emit('workflow:plan-ready', {
          plan,
          conversationId: payload.conversationId,
        } as WorkflowPlanReadyPayload);
        return;
      }

      // Fallback: rebuild plan from conversation's pending tasks
      this.logger.warn({
        message: 'Plan not found in memory, rebuilding from DB tasks',
        planId: payload.planId,
        conversationId: payload.conversationId,
      });

      const tasks = await this.prisma.note.findMany({
        where: {
          conversationId: payload.conversationId,
          tenantId,
          noteType: 'TASK',
          status: 'PENDING',
        },
        select: { id: true },
      });

      if (tasks.length > 0) {
        const rebuilt = await this.workflowService.buildExecutionPlan(
          tasks.map((t) => t.id),
          userId,
          tenantId,
          payload.conversationId
        );
        client.emit('workflow:plan-ready', {
          plan: rebuilt,
          conversationId: payload.conversationId,
        } as WorkflowPlanReadyPayload);
      } else {
        client.emit('workflow:error', {
          message: 'Nije pronađen plan niti zadaci za rekonstrukciju',
          conversationId: payload.conversationId,
        });
      }
    } catch (error) {
      this.logger.error({
        message: 'Failed to get/rebuild execution plan',
        planId: payload.planId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      client.emit('workflow:error', {
        message: error instanceof Error ? error.message : 'Failed to load plan',
        conversationId: payload.conversationId,
      });
    }
  }

  /**
   * Handles plan approval or rejection.
   * On approval, starts fire-and-forget execution of all plan steps.
   */
  @SubscribeMessage('workflow:approve')
  async handleWorkflowApproval(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { planId: string; approved: boolean; conversationId: string }
  ): Promise<void> {
    const authenticatedClient = client as AuthenticatedSocket;

    if (!payload.approved) {
      this.workflowService.cancelPlan(payload.planId);
      const event: WorkflowCompletePayload = {
        planId: payload.planId,
        status: 'cancelled',
        completedSteps: 0,
        totalSteps: 0,
        conversationId: payload.conversationId,
      };
      client.emit('workflow:complete', event);
      return;
    }

    // Get plan for step metadata
    const plan = this.workflowService.getActivePlan(payload.planId);
    const totalSteps = plan?.steps.length ?? 0;

    // Create per-concept conversations for execution results
    const conceptConversations = new Map<string, string>();
    if (plan) {
      const conceptIds = [...new Set(plan.steps.map((s: ExecutionPlanStep) => s.conceptId))];
      for (const conceptId of conceptIds) {
        const conceptName =
          plan.steps.find((s: ExecutionPlanStep) => s.conceptId === conceptId)?.conceptName ??
          'Zadatak';
        try {
          const conv = await this.conversationService.createConversation(
            authenticatedClient.tenantId,
            authenticatedClient.userId,
            conceptName,
            undefined,
            conceptId
          );
          conceptConversations.set(conceptId, conv.id);
        } catch (err) {
          this.logger.warn({
            message: 'Failed to create concept conversation, using original',
            conceptId,
            error: err instanceof Error ? err.message : 'Unknown',
          });
        }
      }

      // Notify frontend about created conversations
      const conversationsCreated: WorkflowConversationsCreatedPayload = {
        planId: payload.planId,
        conversations: conceptIds
          .filter((id) => conceptConversations.has(id))
          .map((id) => ({
            conceptId: id,
            conceptName:
              plan.steps.find((s: ExecutionPlanStep) => s.conceptId === id)?.conceptName ?? '',
            conversationId: conceptConversations.get(id)!,
          })),
        originalConversationId: payload.conversationId,
      };
      client.emit('workflow:conversations-created', conversationsCreated);

      // Auto-navigate frontend to the first concept conversation
      const firstConv = conversationsCreated.conversations[0];
      if (firstConv) {
        const navEvent: WorkflowNavigatePayload = {
          planId: payload.planId,
          conversationId: firstConv.conversationId,
          conceptName: firstConv.conceptName,
        };
        client.emit('workflow:navigate-to-conversation', navEvent);
      }
    }

    // Fire-and-forget execution
    this.workflowService
      .executePlan(
        payload.planId,
        payload.conversationId,
        authenticatedClient.userId,
        authenticatedClient.tenantId,
        {
          onStepStart: (stepId) => {
            const stepInfo = plan?.steps.find((s: ExecutionPlanStep) => s.stepId === stepId);
            const stepIndex =
              plan?.steps.findIndex((s: ExecutionPlanStep) => s.stepId === stepId) ?? -1;
            const event: WorkflowStepProgressPayload = {
              planId: payload.planId,
              stepId,
              stepTitle: stepInfo?.title,
              stepIndex,
              totalSteps,
              status: 'in_progress',
              conversationId: payload.conversationId,
            };
            client.emit('workflow:step-progress', event);
          },
          onStepChunk: (_stepId, chunk) => {
            client.emit('chat:message-chunk', { content: chunk, index: -1 });
          },
          onStepComplete: (stepId, fullContent, citations) => {
            const stepInfo = plan?.steps.find((s: ExecutionPlanStep) => s.stepId === stepId);
            const stepIndex =
              plan?.steps.findIndex((s: ExecutionPlanStep) => s.stepId === stepId) ?? -1;
            const event: WorkflowStepProgressPayload = {
              planId: payload.planId,
              stepId,
              stepTitle: stepInfo?.title,
              stepIndex,
              totalSteps,
              status: 'completed',
              content: fullContent,
              citations,
              conversationId: payload.conversationId,
            };
            client.emit('workflow:step-progress', event);

            // Emit complete step message for chat rendering
            const stepMsg: WorkflowStepMessagePayload = {
              planId: payload.planId,
              conversationId: payload.conversationId,
              messageId: stepId,
              content: fullContent,
              stepIndex,
              totalSteps,
              inputType: 'confirmation',
              conceptName: stepInfo?.conceptName ?? '',
            };
            client.emit('workflow:step-message', stepMsg);
          },
          onStepFailed: (stepId, error) => {
            const stepInfo = plan?.steps.find((s: ExecutionPlanStep) => s.stepId === stepId);
            const stepIndex =
              plan?.steps.findIndex((s: ExecutionPlanStep) => s.stepId === stepId) ?? -1;
            const event: WorkflowStepProgressPayload = {
              planId: payload.planId,
              stepId,
              stepTitle: stepInfo?.title,
              stepIndex,
              totalSteps,
              status: 'failed',
              content: error,
              conversationId: payload.conversationId,
            };
            client.emit('workflow:step-progress', event);
          },
          onStepAwaitingConfirmation: (upcomingStep) => {
            const stepIndex =
              plan?.steps.findIndex((s: ExecutionPlanStep) => s.stepId === upcomingStep.stepId) ??
              -1;

            // Notify frontend for UI tracking (non-blocking)
            const event: WorkflowStepConfirmationPayload = {
              planId: payload.planId,
              completedStepId: '',
              nextStep: {
                stepId: upcomingStep.stepId,
                title: upcomingStep.title,
                description: upcomingStep.description,
                conceptName: upcomingStep.conceptName,
                stepIndex,
                totalSteps,
              },
              conversationId: payload.conversationId,
            };
            client.emit('workflow:step-awaiting-confirmation', event);

            // Auto-resolve on backend: plan was already approved, no frontend round-trip needed.
            // This prevents the workflow from hanging when the user navigates to another conversation.
            setTimeout(() => {
              this.workflowService.continueStep(payload.planId);
            }, 100);
          },
          onComplete: (status, completedSteps, totalStepsCount) => {
            const event: WorkflowCompletePayload = {
              planId: payload.planId,
              status,
              completedSteps,
              totalSteps: totalStepsCount,
              conversationId: payload.conversationId,
            };
            client.emit('workflow:complete', event);

            // Refresh notes on frontend
            client.emit('chat:notes-updated', {
              conversationId: payload.conversationId,
              count: 0,
            });
          },
          onTasksDiscovered: (newConceptIds) => {
            client.emit('tree:tasks-discovered', {
              conceptIds: newConceptIds,
              conversationId: payload.conversationId,
              timestamp: new Date().toISOString(),
            });
          },
          saveMessage: async (_role, content, conceptId) => {
            // Route message to the concept's conversation if available
            const targetConvId =
              conceptId && conceptConversations.has(conceptId)
                ? conceptConversations.get(conceptId)!
                : payload.conversationId;
            const msg = await this.conversationService.addMessage(
              authenticatedClient.tenantId,
              targetConvId,
              MessageRole.ASSISTANT,
              content
            );
            return msg.id;
          },
        }
      )
      .catch((err: unknown) => {
        this.logger.error({
          message: 'Workflow execution failed',
          planId: payload.planId,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
        client.emit('workflow:error', {
          planId: payload.planId,
          message: err instanceof Error ? err.message : 'Execution failed',
          conversationId: payload.conversationId,
        });
      });
  }

  /**
   * Handles cancellation of a running workflow.
   */
  @SubscribeMessage('workflow:cancel')
  handleWorkflowCancel(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { planId: string; conversationId: string }
  ): void {
    const cancelled = this.workflowService.cancelPlan(payload.planId);
    if (!cancelled) {
      client.emit('workflow:error', {
        message: 'Plan not found or already completed',
        conversationId: payload.conversationId,
      });
    }
    // The execution loop will detect cancellation and emit workflow:complete
  }

  /**
   * Handles user confirming to continue to the next workflow step.
   * Optionally passes user input to inject as context for the next step.
   */
  @SubscribeMessage('workflow:step-continue')
  handleStepContinue(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { planId: string; conversationId: string; userInput?: string }
  ): void {
    const authenticatedClient = client as AuthenticatedSocket;
    this.logger.log({
      message: 'User confirmed next workflow step',
      planId: payload.planId,
      hasUserInput: !!payload.userInput,
    });

    // Story 3.2: Store user input as Business Brain memory (fire-and-forget)
    if (payload.userInput && payload.userInput.trim().length > 10) {
      this.memoryService
        .createMemory(authenticatedClient.tenantId, authenticatedClient.userId, {
          type: MemoryType.FACTUAL_STATEMENT,
          source: MemorySource.USER_STATED,
          content: payload.userInput.trim(),
          subject: 'workflow-input',
          confidence: 1.0,
        })
        .catch((err) => {
          this.logger.warn({
            message: 'Failed to store workflow user input as memory',
            error: err instanceof Error ? err.message : 'Unknown',
          });
        });
    }

    this.workflowService.continueStep(payload.planId, payload.userInput);
  }

  /**
   * Story 3.11: Handles "Execute Task with AI" — AI does the task's work directly
   * and streams the result back. Simpler than the full workflow engine.
   */
  @SubscribeMessage('task:execute-ai')
  async handleExecuteTaskAi(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { taskId: string; conversationId: string }
  ): Promise<void> {
    const authenticatedClient = client as AuthenticatedSocket;

    try {
      this.logger.log({
        message: 'AI task execution requested (HeadlessExecutor pipeline)',
        userId: authenticatedClient.userId,
        taskId: payload.taskId,
      });

      const task = await this.prisma.note.findUnique({
        where: { id: payload.taskId },
      });
      if (!task || task.tenantId !== authenticatedClient.tenantId) {
        client.emit('task:ai-error', { taskId: payload.taskId, message: 'Zadatak nije pronadjen' });
        return;
      }

      const convId = task.conversationId ?? payload.conversationId;

      client.emit('task:ai-start', {
        taskId: payload.taskId,
        conversationId: convId,
        timestamp: new Date().toISOString(),
      });

      // Execute via HeadlessExecutor — same pipeline as maturity flow
      this.logger.log({ message: 'Calling HeadlessExecutor for task panel', taskId: payload.taskId, hasExecutor: !!this.headlessExecutor });
      const result = await this.headlessExecutor.executeTask({
        taskId: payload.taskId,
        tenantId: authenticatedClient.tenantId,
        userId: authenticatedClient.userId,
      });

      if (result.success) {
        // Reload note to get updated userReport and score
        const updatedNote = await this.prisma.note.findUnique({
          where: { id: payload.taskId },
          select: { userReport: true, aiScore: true },
        });

        client.emit('task:ai-complete', {
          taskId: payload.taskId,
          conversationId: convId,
          timestamp: new Date().toISOString(),
        });
        client.emit('task:result-complete', {
          taskId: payload.taskId,
          conversationId: convId,
          score: updatedNote?.aiScore ?? null,
          finalResult: updatedNote?.userReport ?? '',
          timestamp: new Date().toISOString(),
        });
      } else {
        client.emit('task:ai-error', {
          taskId: payload.taskId,
          conversationId: convId,
          message: result.error ?? 'Izvrsavanje neuspesno',
        });
      }

      client.emit('chat:notes-updated', { conversationId: convId, count: 0 });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown';
      const errStack = err instanceof Error ? err.stack?.substring(0, 500) : '';
      this.logger.error({
        message: 'Task execution failed in handleExecuteTaskAi',
        taskId: payload.taskId,
        error: errMsg,
        stack: errStack,
      });
      client.emit('task:ai-error', {
        taskId: payload.taskId,
        message: errMsg,
      });
    }
  }



  private async scoreTaskInternal(
    client: Socket,
    taskId: string,
    tenantId: string,
    userId: string,
    prebuiltBusinessContext?: string
  ): Promise<{ score: number | null; result: string; conversationId: string | null }> {
    const task = await this.prisma.note.findUnique({ where: { id: taskId } });
    if (!task || task.tenantId !== tenantId) throw new Error('Zadatak nije pronadjen');
    if (task.status !== 'COMPLETED' || !task.userReport) throw new Error('Zadatak nema izvestaj');

    const businessContext = prebuiltBusinessContext ?? (await this.buildBusinessContext(tenantId, userId, { lean: true }));
    let conceptContext = '';
    if (task.conceptId) {
      try {
        const concept = await this.conceptService.findById(task.conceptId);
        conceptContext = `\n\nKONCEPT: ${concept.name} (${concept.category})\nDEFINICIJA: ${concept.definition}`;
      } catch { /* */ }
    }

    const prompt = `Ti si senior poslovni konsultant. Optimizuj i oceni rezultat.\n${conceptContext}\n\nZADATAK: ${task.title}\n${task.content ? 'OPIS: ' + task.content : ''}\n${task.expectedOutcome ? 'OCEKIVANI REZULTAT: ' + task.expectedOutcome : ''}\n\nIZLAZ:\n${task.userReport}\n\nNapravi OPTIMIZOVANI REZULTAT pa na kraju:\n---\nEVALUACIJA:\n- Primenljivost: X/10\n- Specificnost: X/10\n- Kompletnost: X/10\n- Relevantnost: X/10\n- Kvalitet: X/10\nOCENA: X/10\n---\nSrpski jezik.`;

    let fullResult = '';
    let chunkIndex = 0;
    await this.aiGatewayService.streamCompletionWithContext(
      [{ role: 'user', content: prompt }],
      { tenantId, userId, conversationId: task.conversationId ?? undefined, businessContext, useFallback: true },
      (chunk: string) => {
        fullResult += chunk;
        client.emit('task:result-chunk', { taskId, conversationId: task.conversationId, content: chunk, index: chunkIndex++ });
      }
    );

    let score: number | null = null;
    const scoreMatch = fullResult.match(/OCENA:\s*(\d{1,2})\s*\/\s*10/i);
    if (scoreMatch) {
      const rawScore = parseInt(scoreMatch[1]!, 10);
      if (rawScore >= 1 && rawScore <= 10) score = rawScore * 10;
    }

    await this.prisma.note.update({
      where: { id: taskId },
      data: { userReport: fullResult, aiScore: score, aiFeedback: score !== null ? `AI ocena: ${score}/100` : null, status: 'COMPLETED' },
    });

    this.logger.log({ message: 'Task scoring completed', taskId, score, resultLength: fullResult.length });
    return { score, result: fullResult, conversationId: task.conversationId };
  }

  /**
   * Story 3.12: Handles "Submit Result" — takes completed task output,
   * produces an optimized final deliverable, and scores it 1-10.
   */
  @SubscribeMessage('task:submit-result')
  async handleSubmitTaskResult(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { taskId: string }
  ): Promise<void> {
    const authenticatedClient = client as AuthenticatedSocket;

    try {
      this.logger.log({
        message: 'Task result submission requested',
        userId: authenticatedClient.userId,
        taskId: payload.taskId,
      });

      // Emit start acknowledgment
      client.emit('task:result-start', {
        taskId: payload.taskId,
        conversationId: null,
        timestamp: new Date().toISOString(),
      });

      const { score, result, conversationId } = await this.scoreTaskInternal(
        client,
        payload.taskId,
        authenticatedClient.tenantId,
        authenticatedClient.userId
      );

      // Emit completion
      client.emit('task:result-complete', {
        taskId: payload.taskId,
        conversationId,
        score,
        finalResult: result,
        timestamp: new Date().toISOString(),
      });

      // Refresh notes
      client.emit('chat:notes-updated', { conversationId, count: 0 });

      // Auto-plan agent jobs after scoring
      try {
        const jobs = await this.jobPlannerService.planJobs(
          payload.taskId,
          authenticatedClient.tenantId,
          authenticatedClient.userId
        );
        if (jobs.length > 0) {
          client.emit('jobs:planned', {
            noteId: payload.taskId,
            conversationId,
            jobs,
          });
          this.logger.log({
            message: 'Jobs planned after scoring',
            taskId: payload.taskId,
            jobCount: jobs.length,
          });
        }
      } catch (jobErr) {
        this.logger.error({
          message: 'Job planning failed after scoring',
          taskId: payload.taskId,
          error: jobErr instanceof Error ? jobErr.message : 'Unknown',
        });
      }
    } catch (error) {
      this.logger.error({
        message: 'Task result submission failed',
        taskId: payload.taskId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      client.emit('task:result-error', {
        taskId: payload.taskId,
        conversationId: null,
        message:
          error instanceof Error
            ? error.message
            : 'Ocenjivanje rezultata nije uspelo. Pokušajte ponovo.',
      });
    }
  }

  /**
   * Sprint 2 Epic 2.2: Step-level feedback handler.
   * Allows reviewing individual workflow steps (child notes) of a task.
   * Accepts score, feedback text, and optional attachment IDs.
   */
  @SubscribeMessage('task:step-feedback')
  async handleStepFeedback(
    @ConnectedSocket() client: Socket,
    @MessageBody()
    payload: {
      stepId: string;
      score?: number;
      feedback?: string;
      attachmentIds?: string[];
    }
  ): Promise<void> {
    const authenticatedClient = client as AuthenticatedSocket;

    try {
      this.logger.log({
        message: 'Step feedback submitted',
        userId: authenticatedClient.userId,
        stepId: payload.stepId,
        score: payload.score,
      });

      // 1. Validate step note exists, belongs to tenant, and user owns it
      const step = await this.prisma.note.findFirst({
        where: {
          id: payload.stepId,
          tenantId: authenticatedClient.tenantId,
          userId: authenticatedClient.userId,
        },
      });
      if (!step) {
        client.emit('task:step-feedback-error', {
          stepId: payload.stepId,
          message: 'Korak nije pronađen',
        });
        return;
      }

      // 2. Verify it's a child note (has parentNoteId)
      if (!step.parentNoteId) {
        client.emit('task:step-feedback-error', {
          stepId: payload.stepId,
          message: 'Ovaj zadatak nema nadređeni korak',
        });
        return;
      }

      // 3. Build update data
      const updateData: Record<string, unknown> = {};
      if (payload.score !== undefined) {
        const clampedScore = Math.max(0, Math.min(100, payload.score));
        updateData.aiScore = clampedScore;
      }
      if (payload.feedback) {
        updateData.aiFeedback = payload.feedback;
      }
      // Mark as completed when feedback is given
      if (payload.score !== undefined || payload.feedback) {
        updateData.status = NoteStatus.COMPLETED;
      }

      await this.prisma.note.update({
        where: { id: payload.stepId },
        data: updateData,
      });

      // 4. Link attachments to the step note
      if (payload.attachmentIds && payload.attachmentIds.length > 0) {
        for (const attachmentId of payload.attachmentIds) {
          await this.attachmentsService
            .linkToNote(attachmentId, payload.stepId, authenticatedClient.tenantId)
            .catch((err) =>
              this.logger.warn({
                message: 'Failed to link attachment to step',
                attachmentId,
                stepId: payload.stepId,
                error: err instanceof Error ? err.message : 'Unknown',
              })
            );
        }
      }

      // 5. Emit completion
      client.emit('task:step-feedback-complete', {
        stepId: payload.stepId,
        parentId: step.parentNoteId,
        score: updateData.aiScore ?? step.aiScore,
        feedback: updateData.aiFeedback ?? step.aiFeedback,
        status: updateData.status ?? step.status,
      });

      // 6. Notify notes updated
      client.emit('chat:notes-updated', {
        conversationId: step.conversationId,
        count: 0,
      });

      this.logger.log({
        message: 'Step feedback saved',
        stepId: payload.stepId,
        parentId: step.parentNoteId,
        score: updateData.aiScore,
      });
    } catch (error) {
      this.logger.error({
        message: 'Step feedback failed',
        stepId: payload.stepId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      client.emit('task:step-feedback-error', {
        stepId: payload.stepId,
        message: error instanceof Error ? error.message : 'Greška pri čuvanju povratne informacije',
      });
    }
  }

  /**
   * Handles YOLO autonomous execution start.
   * Loads all pending tasks, creates per-concept conversations, and starts the scheduler.
   */
  @SubscribeMessage('workflow:start-yolo')
  async handleStartYolo(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { conversationId: string }
  ): Promise<void> {
    if (this.configService.get<string>('BRAIN_RELAY_MODE', 'false') === 'true') {
      client.emit('workflow:error', { message: 'Brain relay mode aktivan — YOLO isključen.', conversationId: payload.conversationId });
      return;
    }
    const authenticatedClient = client as AuthenticatedSocket;

    try {
      this.logger.log({
        message: 'YOLO execution requested',
        userId: authenticatedClient.userId,
        conversationId: payload.conversationId,
      });

      // Load all pending TASK notes for this tenant
      const tasks = await this.prisma.note.findMany({
        where: {
          tenantId: authenticatedClient.tenantId,
          noteType: 'TASK',
          status: 'PENDING',
        },
      });

      if (tasks.length === 0) {
        client.emit('workflow:error', {
          message: 'No pending tasks found',
          conversationId: payload.conversationId,
        });
        return;
      }

      // Create per-concept conversations
      const conceptConversations = new Map<string, string>();
      const conceptIds = [...new Set(tasks.filter((t) => t.conceptId).map((t) => t.conceptId!))];

      for (const conceptId of conceptIds) {
        const conceptName = tasks.find((t) => t.conceptId === conceptId)?.title ?? 'Zadatak';
        try {
          const conv = await this.conversationService.createConversation(
            authenticatedClient.tenantId,
            authenticatedClient.userId,
            conceptName,
            undefined,
            conceptId
          );
          conceptConversations.set(conceptId, conv.id);
        } catch (err) {
          this.logger.warn({
            message: 'Failed to create concept conversation for YOLO',
            conceptId,
            error: err instanceof Error ? err.message : 'Unknown',
          });
        }
      }

      // Notify frontend about created conversations
      const conversationsPayload = {
        planId: 'yolo-pending',
        conversations: conceptIds
          .filter((id) => conceptConversations.has(id))
          .map((id) => ({
            conceptId: id,
            conceptName: tasks.find((t) => t.conceptId === id)?.title ?? '',
            conversationId: conceptConversations.get(id)!,
          })),
        originalConversationId: payload.conversationId,
      };
      client.emit('workflow:conversations-created', conversationsPayload);

      // H1: Create Execution record for YOLO (enables recovery on server restart)
      const executionBudget = parseInt(process.env['YOLO_EXECUTION_BUDGET'] ?? '50', 10);
      const config = {
        maxConcurrency: 3,
        maxConceptsHardStop: 1000,
        retryAttempts: 3,
        maxExecutionBudget: executionBudget,
      };

      const executionId = await this.executionStateService.createExecution(
        authenticatedClient.tenantId,
        authenticatedClient.userId,
        'yolo',
        undefined,
        payload.conversationId,
        { config }
      );

      this.yoloScheduler
        .startYoloExecution(
          authenticatedClient.tenantId,
          authenticatedClient.userId,
          payload.conversationId,
          config,
          {
            onProgress: (progress) => {
              client.emit('workflow:yolo-progress', progress);
              // Update checkpoint for recovery
              this.executionStateService
                .updateCheckpoint(executionId, { completedCount: progress.completed })
                .catch(() => {
                  /* non-blocking */
                });
            },
            onComplete: (result) => {
              client.emit('workflow:yolo-complete', result);
              client.emit('chat:notes-updated', {
                conversationId: payload.conversationId,
                count: 0,
              });
              // Mark execution as completed
              this.executionStateService
                .updateStatus(executionId, 'completed', {
                  completed: result.completed,
                  failed: result.failed,
                  total: result.total,
                })
                .catch(() => {
                  /* non-blocking */
                });
            },
            onError: (error) => {
              client.emit('workflow:error', {
                message: error,
                conversationId: payload.conversationId,
              });
              this.executionStateService
                .updateStatus(executionId, 'failed', null, error)
                .catch(() => {
                  /* non-blocking */
                });
            },
            saveMessage: async (_role, content, conceptId) => {
              const targetConvId =
                conceptId && conceptConversations.has(conceptId)
                  ? conceptConversations.get(conceptId)!
                  : payload.conversationId;
              const msg = await this.conversationService.addMessage(
                authenticatedClient.tenantId,
                targetConvId,
                MessageRole.ASSISTANT,
                content
              );
              return msg.id;
            },
            createConversationForConcept: async (conceptId: string, conceptName: string) => {
              try {
                const conv = await this.conversationService.createConversation(
                  authenticatedClient.tenantId,
                  authenticatedClient.userId,
                  conceptName,
                  undefined,
                  conceptId
                );
                conceptConversations.set(conceptId, conv.id);
                client.emit('workflow:conversations-created', {
                  planId: 'yolo-discovery',
                  conversations: [{ conceptId, conceptName, conversationId: conv.id }],
                  originalConversationId: payload.conversationId,
                });
                return conv.id;
              } catch (err) {
                this.logger.warn({
                  message: 'Failed to create conversation for discovered concept',
                  conceptId,
                  error: err instanceof Error ? err.message : 'Unknown',
                });
                return null;
              }
            },
            onConceptDiscovered: (
              conceptId: string,
              conceptName: string,
              discoveredConversationId: string
            ) => {
              client.emit('chat:concept-detected', {
                conversationId: payload.conversationId,
                conceptId,
                conceptName,
                discoveredConversationId,
              });
            },
            // H3: Wire onTaskCompleted for auto AI popuni after each YOLO task
            onTaskCompleted: (taskId: string, conversationId: string) => {
              this.enqueueAutoPopuniAfterYolo(
                client,
                authenticatedClient.tenantId,
                authenticatedClient.userId,
                taskId,
                conversationId
              );
            },
          },
          conceptConversations
        )
        .catch((err: unknown) => {
          this.logger.error({
            message: 'YOLO execution failed',
            error: err instanceof Error ? err.message : 'Unknown error',
          });
          client.emit('workflow:error', {
            message: err instanceof Error ? err.message : 'YOLO execution failed',
            conversationId: payload.conversationId,
          });
          this.executionStateService
            .updateStatus(
              executionId,
              'failed',
              null,
              err instanceof Error ? err.message : 'Unknown'
            )
            .catch(() => {
              /* non-blocking */
            });
        });
    } catch (error) {
      this.logger.error({
        message: 'Failed to start YOLO execution',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      client.emit('workflow:error', {
        message: error instanceof Error ? error.message : 'Failed to start YOLO',
        conversationId: payload.conversationId,
      });
    }
  }

  /**
   * Story 3.2: Handles per-domain YOLO execution start.
   * Scopes YOLO to a single category (domain).
   */
  @SubscribeMessage('yolo:start-domain')
  async handleStartDomainYolo(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { conversationId: string; category: string }
  ): Promise<void> {
    if (this.configService.get<string>('BRAIN_RELAY_MODE', 'false') === 'true') {
      client.emit('workflow:error', { message: 'Brain relay mode aktivan — domain YOLO isključen.', conversationId: payload.conversationId });
      return;
    }
    const authenticatedClient = client as AuthenticatedSocket;

    try {
      this.logger.log({
        message: 'Per-domain YOLO requested',
        userId: authenticatedClient.userId,
        category: payload.category,
        conversationId: payload.conversationId,
      });

      // Create per-concept conversations for discovered tasks
      const conceptConversations = new Map<string, string>();

      // H1: Create Execution record for domain YOLO
      const executionBudget = parseInt(process.env['YOLO_EXECUTION_BUDGET'] ?? '50', 10);
      const config = {
        maxConcurrency: 3,
        maxConceptsHardStop: 100,
        retryAttempts: 3,
        maxExecutionBudget: executionBudget,
      };

      const executionId = await this.executionStateService.createExecution(
        authenticatedClient.tenantId,
        authenticatedClient.userId,
        'domain-yolo',
        undefined,
        payload.conversationId,
        { config, category: payload.category }
      );

      this.yoloScheduler
        .startYoloExecution(
          authenticatedClient.tenantId,
          authenticatedClient.userId,
          payload.conversationId,
          config,
          {
            onProgress: (progress) => {
              client.emit('workflow:yolo-progress', progress);
              this.executionStateService
                .updateCheckpoint(executionId, { completedCount: progress.completed })
                .catch(() => {
                  /* non-blocking */
                });
            },
            onComplete: (result) => {
              client.emit('workflow:yolo-complete', result);
              client.emit('chat:notes-updated', {
                conversationId: payload.conversationId,
                count: 0,
              });
              this.executionStateService
                .updateStatus(executionId, 'completed', {
                  completed: result.completed,
                  failed: result.failed,
                  total: result.total,
                })
                .catch(() => {
                  /* non-blocking */
                });
            },
            onError: (error) => {
              client.emit('workflow:error', {
                message: error,
                conversationId: payload.conversationId,
              });
              this.executionStateService
                .updateStatus(executionId, 'failed', null, error)
                .catch(() => {
                  /* non-blocking */
                });
            },
            saveMessage: async (_role, content, conceptId) => {
              const targetConvId =
                conceptId && conceptConversations.has(conceptId)
                  ? conceptConversations.get(conceptId)!
                  : payload.conversationId;
              const msg = await this.conversationService.addMessage(
                authenticatedClient.tenantId,
                targetConvId,
                MessageRole.ASSISTANT,
                content
              );
              return msg.id;
            },
            createConversationForConcept: async (conceptId: string, conceptName: string) => {
              try {
                const conv = await this.conversationService.createConversation(
                  authenticatedClient.tenantId,
                  authenticatedClient.userId,
                  conceptName,
                  undefined,
                  conceptId
                );
                conceptConversations.set(conceptId, conv.id);
                client.emit('workflow:conversations-created', {
                  planId: 'yolo-domain',
                  conversations: [{ conceptId, conceptName, conversationId: conv.id }],
                  originalConversationId: payload.conversationId,
                });
                return conv.id;
              } catch (err) {
                this.logger.warn({
                  message: 'Failed to create conversation for domain YOLO concept',
                  conceptId,
                  error: err instanceof Error ? err.message : 'Unknown',
                });
                return null;
              }
            },
            onConceptDiscovered: (
              conceptId: string,
              conceptName: string,
              discoveredConversationId: string
            ) => {
              client.emit('chat:concept-detected', {
                conversationId: payload.conversationId,
                conceptId,
                conceptName,
                discoveredConversationId,
              });
            },
            // H3: Wire onTaskCompleted for auto AI popuni after each domain YOLO task
            onTaskCompleted: (taskId: string, conversationId: string) => {
              this.enqueueAutoPopuniAfterYolo(
                client,
                authenticatedClient.tenantId,
                authenticatedClient.userId,
                taskId,
                conversationId
              );
            },
          },
          conceptConversations,
          payload.category // Story 3.2: per-domain scope
        )
        .catch((err: unknown) => {
          this.logger.error({
            message: 'Domain YOLO execution failed',
            category: payload.category,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
          client.emit('workflow:error', {
            message: err instanceof Error ? err.message : 'Domain YOLO failed',
            conversationId: payload.conversationId,
          });
          this.executionStateService
            .updateStatus(
              executionId,
              'failed',
              null,
              err instanceof Error ? err.message : 'Unknown'
            )
            .catch(() => {
              /* non-blocking */
            });
        });
    } catch (error) {
      this.logger.error({
        message: 'Failed to start domain YOLO',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      client.emit('workflow:error', {
        message: error instanceof Error ? error.message : 'Failed to start domain YOLO',
        conversationId: payload.conversationId,
      });
    }
  }

  /**
   * Builds, auto-approves, and executes a workflow plan for welcome conversation.
   * Skips the plan overlay — user sees inline progress directly.
   */
  private async autoExecuteWorkflow(
    client: Socket,
    taskIds: string[],
    conversationId: string
  ): Promise<void> {
    const authenticatedClient = client as AuthenticatedSocket;

    // 1. Build the plan
    const plan = await this.workflowService.buildExecutionPlan(
      taskIds,
      authenticatedClient.userId,
      authenticatedClient.tenantId,
      conversationId
    );
    const totalSteps = plan.steps.length;

    // 2. Create per-concept conversations
    const conceptConversations = new Map<string, string>();
    const conceptIds = [...new Set(plan.steps.map((s: ExecutionPlanStep) => s.conceptId))];

    for (const conceptId of conceptIds) {
      const conceptName =
        plan.steps.find((s: ExecutionPlanStep) => s.conceptId === conceptId)?.conceptName ??
        'Zadatak';
      try {
        const conv = await this.conversationService.createConversation(
          authenticatedClient.tenantId,
          authenticatedClient.userId,
          conceptName,
          undefined,
          conceptId
        );
        conceptConversations.set(conceptId, conv.id);
      } catch (err) {
        this.logger.warn({
          message: 'Failed to create concept conversation',
          conceptId,
          error: err instanceof Error ? err.message : 'Unknown',
        });
      }
    }

    // 3. Notify frontend about created conversations
    const conversationsCreated: WorkflowConversationsCreatedPayload = {
      planId: plan.planId,
      conversations: conceptIds
        .filter((id) => conceptConversations.has(id))
        .map((id) => ({
          conceptId: id,
          conceptName:
            plan.steps.find((s: ExecutionPlanStep) => s.conceptId === id)?.conceptName ?? '',
          conversationId: conceptConversations.get(id)!,
        })),
      originalConversationId: conversationId,
    };
    client.emit('workflow:conversations-created', conversationsCreated);

    // Auto-navigate frontend to the first concept conversation
    const firstConv = conversationsCreated.conversations[0];
    if (firstConv) {
      const navEvent: WorkflowNavigatePayload = {
        planId: plan.planId,
        conversationId: firstConv.conversationId,
        conceptName: firstConv.conceptName,
      };
      client.emit('workflow:navigate-to-conversation', navEvent);
    }

    // 4. Execute immediately (no plan overlay)
    this.workflowService
      .executePlan(
        plan.planId,
        conversationId,
        authenticatedClient.userId,
        authenticatedClient.tenantId,
        {
          onStepStart: (stepId) => {
            const stepInfo = plan.steps.find((s: ExecutionPlanStep) => s.stepId === stepId);
            const stepIndex = plan.steps.findIndex((s: ExecutionPlanStep) => s.stepId === stepId);
            const event: WorkflowStepProgressPayload = {
              planId: plan.planId,
              stepId,
              stepTitle: stepInfo?.title,
              stepIndex,
              totalSteps,
              status: 'in_progress',
              conversationId,
            };
            client.emit('workflow:step-progress', event);
          },
          onStepChunk: (_stepId, chunk) => {
            client.emit('chat:message-chunk', { content: chunk, index: -1 });
          },
          onStepComplete: (stepId, fullContent, citations) => {
            const stepInfo = plan.steps.find((s: ExecutionPlanStep) => s.stepId === stepId);
            const stepIndex = plan.steps.findIndex((s: ExecutionPlanStep) => s.stepId === stepId);
            const event: WorkflowStepProgressPayload = {
              planId: plan.planId,
              stepId,
              stepTitle: stepInfo?.title,
              stepIndex,
              totalSteps,
              status: 'completed',
              content: fullContent,
              citations,
              conversationId,
            };
            client.emit('workflow:step-progress', event);

            // Emit complete step message for chat rendering
            const stepMsg: WorkflowStepMessagePayload = {
              planId: plan.planId,
              conversationId,
              messageId: stepId,
              content: fullContent,
              stepIndex,
              totalSteps,
              inputType: 'confirmation',
              conceptName: stepInfo?.conceptName ?? '',
            };
            client.emit('workflow:step-message', stepMsg);
          },
          onStepFailed: (stepId, error) => {
            const stepInfo = plan.steps.find((s: ExecutionPlanStep) => s.stepId === stepId);
            const stepIndex = plan.steps.findIndex((s: ExecutionPlanStep) => s.stepId === stepId);
            const event: WorkflowStepProgressPayload = {
              planId: plan.planId,
              stepId,
              stepTitle: stepInfo?.title,
              stepIndex,
              totalSteps,
              status: 'failed',
              content: error,
              conversationId,
            };
            client.emit('workflow:step-progress', event);
          },
          onStepAwaitingConfirmation: (upcomingStep) => {
            const stepIndex = plan.steps.findIndex(
              (s: ExecutionPlanStep) => s.stepId === upcomingStep.stepId
            );
            const event: WorkflowStepConfirmationPayload = {
              planId: plan.planId,
              completedStepId: '',
              nextStep: {
                stepId: upcomingStep.stepId,
                title: upcomingStep.title,
                description: upcomingStep.description,
                conceptName: upcomingStep.conceptName,
                stepIndex,
                totalSteps,
              },
              conversationId,
            };
            client.emit('workflow:step-awaiting-confirmation', event);

            // New interactive event with inputType discriminator
            const inputEvent: WorkflowStepAwaitingInputPayload = {
              planId: plan.planId,
              stepId: upcomingStep.stepId,
              stepTitle: upcomingStep.title,
              stepDescription: upcomingStep.description,
              conceptName: upcomingStep.conceptName,
              stepIndex,
              totalSteps,
              inputType: 'confirmation',
              conversationId,
            };
            client.emit('workflow:step-awaiting-input', inputEvent);
          },
          onComplete: (status, completedSteps, totalStepsCount) => {
            const event: WorkflowCompletePayload = {
              planId: plan.planId,
              status,
              completedSteps,
              totalSteps: totalStepsCount,
              conversationId,
            };
            client.emit('workflow:complete', event);
            client.emit('chat:notes-updated', { conversationId, count: 0 });
          },
          onTasksDiscovered: (newConceptIds) => {
            client.emit('tree:tasks-discovered', {
              conceptIds: newConceptIds,
              conversationId,
              timestamp: new Date().toISOString(),
            });
          },
          saveMessage: async (_role, content, conceptId) => {
            const targetConvId =
              conceptId && conceptConversations.has(conceptId)
                ? conceptConversations.get(conceptId)!
                : conversationId;
            const msg = await this.conversationService.addMessage(
              authenticatedClient.tenantId,
              targetConvId,
              MessageRole.ASSISTANT,
              content
            );
            return msg.id;
          },
        }
      )
      .catch((err: unknown) => {
        this.logger.error({
          message: 'Auto-execute plan failed',
          planId: plan.planId,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
        client.emit('workflow:error', {
          planId: plan.planId,
          message: err instanceof Error ? err.message : 'Execution failed',
          conversationId,
        });
      });
  }

  // ─── Discovery Chat (Story 2.17) ─────────────────────────────

  /**
   * Handles discovery chat messages.
   * Ephemeral: no conversation persistence, no concept matching.
   * Web search enabled for supplementing responses.
   */
  @SubscribeMessage('discovery:send-message')
  async handleDiscoveryMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { content: string }
  ): Promise<void> {
    const authenticatedClient = client as AuthenticatedSocket;
    const { content } = payload;

    if (!content) {
      client.emit('discovery:error', {
        message: 'content is required for discovery chat',
      });
      return;
    }

    try {
      // Build business context: tenant profile + business brain memories in parallel
      const [businessContext, brainMemoryContext] = await Promise.all([
        this.buildBusinessContext(authenticatedClient.tenantId, authenticatedClient.userId),
        this.businessContextService
          .getBusinessContext(authenticatedClient.tenantId)
          .catch(() => ''),
      ]);

      // Web search for discovery context
      let webContext = '';
      if (this.webSearchService.isAvailable()) {
        try {
          const results = await this.webSearchService.searchAndExtract(content, 3);
          if (results.length > 0) {
            webContext = this.webSearchService.formatSourcesAsObsidian(results);
          }
        } catch {
          // Non-blocking: skip web search on failure
        }
      }

      const systemPrompt = `Ti si poslovni asistent koji pomaže korisniku da istraži i razume poslovne teme.
Odgovaraj precizno na srpskom jeziku.

FORMATIRANJE (OBAVEZNO):
- Organizuj odgovor sa ## naslovom za svaku sekciju
- Koristi **bold** za ključne termine
- Koristi bullet liste za nabrajanje
- Koristi tabele za numeričke podatke ili poređenja
- Koristi callout blokove: > **Ključni uvid:** ... ili > **Rezime:** ...
- Ako imaš web izvore, citiraj INLINE: ([Naziv](URL))

${businessContext}${brainMemoryContext ? '\n' + brainMemoryContext : ''}${webContext}`;

      // Stream response via discovery-specific events (no persistence)
      let fullContent = '';
      let chunkIndex = 0;

      await this.aiGatewayService.streamCompletionWithContext(
        [{ role: 'user', content }],
        {
          tenantId: authenticatedClient.tenantId,
          userId: authenticatedClient.userId,
          businessContext: systemPrompt,
        },
        (chunk: string) => {
          fullContent += chunk;
          client.emit('discovery:message-chunk', {
            chunk,
            index: chunkIndex++,
          });
        }
      );

      client.emit('discovery:message-complete', {
        fullContent,
        totalChunks: chunkIndex,
      });

      this.logger.log({
        message: 'Discovery chat message processed',
        userId: authenticatedClient.userId,
        contentLength: content.length,
        responseLength: fullContent.length,
        webSearchUsed: webContext.length > 0,
      });
    } catch (error) {
      this.logger.error({
        message: 'Discovery chat message failed',
        userId: authenticatedClient.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      client.emit('discovery:error', {
        message: error instanceof Error ? error.message : 'Discovery chat failed',
      });
    }
  }

  private async buildBusinessContext(
    tenantId: string,
    userId: string,
    options?: { lean?: boolean }
  ): Promise<string> {
    try {
      const [tenant, onboardingNote] = await Promise.all([
        this.prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { name: true, industry: true, description: true },
        }),
        this.notesService.getLatestNoteBySource(userId, tenantId, NoteSource.ONBOARDING),
      ]);

      if (!tenant) {
        return '';
      }

      // Core identity — this is the base system prompt when no persona is set
      let context = `Ti si poslovni savetnik za kompaniju "${tenant.name}".
Tvoj cilj: pružaj konkretne, upotrebljive savete prilagođene OVOM poslovanju. Misli kao iskusan konsultant koji poznaje ovu kompaniju iznutra.

--- POSLOVNI KONTEKST ---
Kompanija: ${tenant.name}`;
      if (tenant.industry) {
        context += `\nIndustrija: ${tenant.industry}`;
      }
      if (tenant.description) {
        context += `\nOpis: ${tenant.description}`;
      }

      if (onboardingNote?.content) {
        // Truncate very long onboarding notes to keep prompt focused
        const noteContent =
          onboardingNote.content.length > 3000
            ? onboardingNote.content.substring(0, 3000) + '\n...(skraćeno)'
            : onboardingNote.content;
        context += `\n\nPoslovna analiza (iz onboardinga):\n${noteContent}`;
      }

      context += '\n--- KRAJ POSLOVNOG KONTEKSTA ---';

      // Output quality rules
      context += `

--- PRAVILA ZA ODGOVARANJE ---
1. UVEK personalizuj odgovore za "${tenant.name}" (${tenant.industry ?? 'opšte poslovanje'}) — ne daj generičke savete
2. Koristi podatke iz POSLOVNOG KONTEKSTA, BAZE ZNANJA i MEMORIJE za konkretne preporuke
3. Kada koristiš znanje iz koncepta, označi ga kao [[Naziv Koncepta]]
4. Budi konkretan: umesto "trebalo bi da razmotrite..." reci šta tačno treba uraditi i zašto
5. Ako imaš web izvore, citiraj INLINE: ([Naziv izvora](URL))
6. Odgovaraj ISKLJUČIVO na srpskom jeziku
7. Minimum 300 reči za pitanja koja zahtevaju analizu — ne daj površne odgovore
--- KRAJ PRAVILA ---`;

      // Formatting rules + capabilities only for interactive chat (not task execution)
      if (!options?.lean) {
        context += `

--- FORMATIRANJE (STROGO OBAVEZNO — svaki odgovor MORA koristiti ove formate) ---
1. SEKCIJE: Organizuj svaki odgovor sa ## naslovom za svaku sekciju.

2. CALLOUT BLOKOVI (koristi MINIMUM 2 različita tipa po odgovoru):
> **Ključni uvid:** Ovde ide najvažniji zaključak ili preporuka.
> **Upozorenje:** Ovde ide rizik, opasnost ili problem.
> **Metrika:** Relevantni brojevi i KPI za datu oblast.
> **Rezime:** Kratki zaključak sa konkretnom preporukom.

3. TABELE SA BROJEVIMA (OBAVEZNO kad god imaš numeričke podatke):
| Kategorija | Vrednost | Promena |
|------------|----------|---------|
| Primer     | 100.000€ | +15%    |

4. OSTALA PRAVILA:
- Koristi **bold** za sve ključne termine
- Koristi bullet liste za nabrajanje, NE dugačke paragrafe
- NIKADA ne piši odgovor bez bar jednog callout bloka
- Koristi tabele kada god imaš numeričke podatke ili poređenja
--- KRAJ FORMATIRANJA ---

--- FUNKCIONALNOSTI APLIKACIJE koje možeš da koristiš ---
- Kreiranje zadataka: Predloži konkretne zadatke korisniku na osnovu razgovora
- Pretraga weba: Koristi web pretragu za aktuelne podatke i statistike
- Poslovni kontekst: Imaš pristup svim memorijama i poslovnom profilu kompanije
- Radni tokovi: Možeš da generišeš višekoračne planove za složene zadatke
- Koncepti: Možeš da preporučiš relevantne poslovne koncepte iz baze znanja
Kada korisnik pita šta možeš ili traži pomoć, pomeni ove funkcionalnosti.
--- KRAJ FUNKCIONALNOSTI ---`;
      }

      this.logger.log({
        message: 'Business context built for chat',
        tenantId,
        userId,
        hasOnboardingNote: !!onboardingNote,
        contextLength: context.length,
      });

      return context;
    } catch (error) {
      this.logger.warn({
        message: 'Failed to build business context, proceeding without it',
        tenantId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return '';
    }
  }

  // ─── Multi-Step Orchestration: Research Brief Builder ──────────

  private generateSearchAngles(query: string): string[] {
    return [query, `${query} statistika podaci`, `${query} primeri best practice`];
  }

  private deduplicateConcepts(
    concepts: import('@mentor-ai/shared/types').ConceptMatch[]
  ): import('@mentor-ai/shared/types').ConceptMatch[] {
    const map = new Map<string, import('@mentor-ai/shared/types').ConceptMatch>();
    for (const c of concepts) {
      const existing = map.get(c.conceptId);
      if (!existing || c.score > existing.score) {
        map.set(c.conceptId, c);
      }
    }
    return Array.from(map.values());
  }

  private async buildResearchBrief(
    userQuery: string,
    existingContext: string,
    existingConcepts: import('@mentor-ai/shared/types').ConceptMatch[],
    webSearchEnabled: boolean,
    personaType: import('@mentor-ai/shared/types').PersonaType | undefined,
    tenantId: string,
    userId: string
  ): Promise<string> {
    const startTime = Date.now();
    try {
      this.logger.log({
        message: 'Complex query detected — building research brief',
        userQuery: userQuery.substring(0, 80),
      });

      const searchAngles = this.generateSearchAngles(userQuery);

      // Parallel: deeper concept matching + web searches
      const [deepConcepts, ...webResults] = await Promise.all([
        this.conceptMatchingService.findRelevantConcepts(userQuery, { limit: 8, threshold: 0.35 }),
        ...(webSearchEnabled
          ? searchAngles.map((angle) =>
              this.webSearchService.searchAndExtract(angle, 3).catch(() => [])
            )
          : []),
      ]);

      // Deduplicate and merge concepts
      const allConcepts = this.deduplicateConcepts([...existingConcepts, ...deepConcepts]);
      const topConcepts = allConcepts.slice(0, 6);

      // Load full concept trees for top matches
      const conceptDetails = await Promise.all(
        topConcepts.map((c) => this.conceptService.findById(c.conceptId).catch(() => null))
      );

      // Build concept knowledge for brief
      let conceptKnowledge = '';
      for (const detail of conceptDetails) {
        if (!detail) continue;
        conceptKnowledge += `\n## ${detail.name} (${detail.category})\n${detail.definition?.substring(0, 500) ?? ''}\n`;
        const prereqs = detail.relatedConcepts
          ?.filter((r) => r.relationshipType === 'PREREQUISITE' && r.direction === 'outgoing')
          .map((r) => r.concept?.name)
          .filter(Boolean);
        if (prereqs?.length) {
          conceptKnowledge += `Preduslovi: ${prereqs.join(', ')}\n`;
        }
      }

      // Deduplicate web results by link
      const allWebResults = webResults.flat();
      const seenLinks = new Set<string>();
      const uniqueWeb = allWebResults.filter((r) => {
        if (!r.link || seenLinks.has(r.link)) return false;
        seenLinks.add(r.link);
        return true;
      });

      let webKnowledge = '';
      for (const r of uniqueWeb.slice(0, 8)) {
        webKnowledge += `\n- ${r.title}: ${r.snippet ?? ''}${r.pageContent ? ` | ${r.pageContent.substring(0, 300)}` : ''}\n  Izvor: ${r.link}\n`;
      }

      // Internal LLM call to synthesize research brief
      const briefPrompt = `Na osnovu korisničkog pitanja i prikupljenih podataka, napravi ISTRAŽIVAČKI BRIEF (500-800 reči).

KORISNIČKO PITANJE: ${userQuery}

BAZA ZNANJA:
${conceptKnowledge || '(nema koncepata)'}

WEB ISTRAŽIVANJE:
${webKnowledge || '(nema web rezultata)'}

FORMAT BRIEFA:
1. KLJUČNA PITANJA: Koji su glavni aspekti korisničkog pitanja?
2. NALAZI: Za svaki aspekt — šta govore podaci iz baze i weba?
3. PRAZNINE: Koje informacije nedostaju?
4. STRUKTURA ODGOVORA: Predloži logičan raspored sekcija za finalni odgovor
5. KONKRETNI PODACI: Navedi sve brojke, statistike, primere iz izvora`;

      const briefMessages = [{ role: 'user' as const, content: briefPrompt }];

      let briefContent = '';
      const RESEARCH_TIMEOUT_MS = 10_000;

      const briefResult = await Promise.race([
        this.aiGatewayService.streamCompletionWithContext(
          briefMessages,
          {
            tenantId,
            userId,
            conversationId: 'research-brief',
            personaType,
            messageCount: 1,
            hasClientContext: false,
            hasSpecificData: true,
            userQuestion: userQuery,
            businessContext: existingContext,
          },
          (chunk: string) => {
            briefContent += chunk;
          }
        ),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), RESEARCH_TIMEOUT_MS)),
      ]);

      if (!briefResult || briefContent.length < 100) {
        this.logger.warn({
          message: 'Research brief too short or timed out, discarding',
          length: briefContent.length,
        });
        return '';
      }

      this.logger.log({
        message: 'Research brief completed',
        duration: Date.now() - startTime,
        briefLength: briefContent.length,
        conceptCount: topConcepts.length,
        webResultCount: uniqueWeb.length,
      });

      return briefContent;
    } catch (error) {
      this.logger.warn({
        message: 'Research brief generation failed, falling back to single-pass',
        error: error instanceof Error ? error.message : 'Unknown error',
        duration: Date.now() - startTime,
      });
      return '';
    }
  }

  private extractToken(client: Socket): string | null {
    // Try Authorization header first
    const authHeader = client.handshake.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }

    // Try socket.io auth option (client passes auth: { token })
    const authToken = (client.handshake as any).auth?.token;
    if (typeof authToken === 'string' && authToken) {
      return authToken;
    }

    // Try query parameter
    const token = client.handshake.query.token;
    if (typeof token === 'string') {
      return token;
    }

    return null;
  }

  private async verifyToken(token: string): Promise<JwtPayload> {
    return new Promise((resolve, reject) => {
      const getKey = (
        header: { kid?: string },
        callback: (err: Error | null, key?: string) => void
      ) => {
        if (!header.kid) {
          callback(new Error('No kid in token header'));
          return;
        }

        this.jwksClient.getSigningKey(header.kid, (err, key) => {
          if (err) {
            callback(err);
            return;
          }
          const signingKey = key?.getPublicKey();
          callback(null, signingKey);
        });
      };

      verify(
        token,
        getKey,
        {
          audience: this.auth0Audience,
          issuer: `https://${this.auth0Domain}/`,
          algorithms: ['RS256'],
        },
        (err, decoded) => {
          if (err) {
            reject(new UnauthorizedException('Invalid token'));
          } else {
            resolve(decoded as JwtPayload);
          }
        }
      );
    });
  }
}
