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
import { Logger, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { verify, JwtPayload as JwtPayloadBase } from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import { ConversationService } from './conversation.service';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import { NotesService } from '../notes/notes.service';
import { ConceptMatchingService } from '../knowledge/services/concept-matching.service';
import { ConceptService } from '../knowledge/services/concept.service';
import { CitationInjectorService } from '../knowledge/services/citation-injector.service';
import { CitationService } from '../knowledge/services/citation.service';
import { MemoryContextBuilderService } from '../memory/services/memory-context-builder.service';
import { MemoryExtractionService } from '../memory/services/memory-extraction.service';
import { ConceptExtractionService } from '../knowledge/services/concept-extraction.service';
import { WorkflowService } from '../workflow/workflow.service';
import { YoloSchedulerService } from '../workflow/yolo-scheduler.service';
import { WebSearchService } from '../web-search/web-search.service';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { NoteSource, NoteType, NoteStatus } from '@mentor-ai/shared/prisma';
import { MessageRole, type ChatMessageSend, type ChatMessage, type ConceptCitation, type ExecutionPlanStep, type WorkflowPlanReadyPayload, type WorkflowStepProgressPayload, type WorkflowCompletePayload, type WorkflowConversationsCreatedPayload, type WorkflowStepConfirmationPayload, type WorkflowStepAwaitingInputPayload, type WorkflowStepMessagePayload, type WorkflowNavigatePayload } from '@mentor-ai/shared/types';

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
export class ConversationGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(ConversationGateway.name);
  private readonly jwksClient: jwksClient.JwksClient;
  private readonly auth0Domain: string;
  private readonly auth0Audience: string;

  constructor(
    private readonly conversationService: ConversationService,
    private readonly aiGatewayService: AiGatewayService,
    private readonly configService: ConfigService,
    private readonly prisma: PlatformPrismaService,
    private readonly notesService: NotesService,
    private readonly conceptMatchingService: ConceptMatchingService,
    private readonly citationInjectorService: CitationInjectorService,
    private readonly citationService: CitationService,
    private readonly memoryContextBuilder: MemoryContextBuilderService,
    private readonly memoryExtractionService: MemoryExtractionService,
    private readonly workflowService: WorkflowService,
    private readonly conceptService: ConceptService,
    private readonly conceptExtractionService: ConceptExtractionService,
    private readonly yoloScheduler: YoloSchedulerService,
    private readonly webSearchService: WebSearchService,
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
   * Handles new WebSocket connections.
   * Validates JWT token and attaches user info to socket.
   * In dev mode, bypasses token validation and uses mock user.
   */
  async handleConnection(client: Socket) {
    try {
      const devMode = this.configService.get<string>('DEV_MODE') === 'true';

      if (devMode) {
        const authenticatedClient = client as AuthenticatedSocket;

        // Try to extract real user identity from JWT token
        const token = this.extractToken(client);
        if (token && token !== 'dev-mode-token') {
          try {
            const jwtSecret = this.configService.get<string>('JWT_SECRET');
            if (jwtSecret) {
              const payload = verify(token, jwtSecret, { algorithms: ['HS256'] }) as JwtPayload;
              authenticatedClient.userId = (payload as any).userId || payload.sub || 'dev-user-001';
              authenticatedClient.tenantId = (payload as any).tenantId || 'dev-tenant-001';
              await client.join(`tenant:${authenticatedClient.tenantId}`);
              this.logger.log({
                message: 'WebSocket client connected (dev mode, real user)',
                clientId: client.id,
                userId: authenticatedClient.userId,
                tenantId: authenticatedClient.tenantId,
              });
              return;
            }
          } catch {
            this.logger.debug('Dev mode: WebSocket JWT validation failed, using dev user fallback');
          }
        }

        // No real token or validation failed - use dev fallback
        authenticatedClient.userId = 'dev-user-001';
        authenticatedClient.tenantId = 'dev-tenant-001';
        await client.join('tenant:dev-tenant-001');
        this.logger.log({
          message: 'WebSocket client connected (dev mode)',
          clientId: client.id,
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

      const payload = await this.verifyToken(token);
      const authenticatedClient = client as AuthenticatedSocket;
      authenticatedClient.userId =
        payload['https://mentor-ai.com/user_id'] ?? payload.sub;
      authenticatedClient.tenantId =
        payload['https://mentor-ai.com/tenant_id'] ?? '';

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
  @SubscribeMessage('chat:message-send')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ChatMessageSend
  ) {
    const authenticatedClient = client as AuthenticatedSocket;
    const { conversationId, content } = payload;

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

    try {
      // Verify user owns the conversation
      await this.conversationService.getConversation(
        authenticatedClient.tenantId,
        conversationId,
        authenticatedClient.userId
      );

      // Save user message
      const userMessage = await this.conversationService.addMessage(
        authenticatedClient.tenantId,
        conversationId,
        MessageRole.USER,
        content
      );

      // Emit confirmation of user message received
      client.emit('chat:message-received', {
        messageId: userMessage.id,
        role: 'USER',
      });

      // Get conversation history for context
      const conversation = await this.conversationService.getConversation(
        authenticatedClient.tenantId,
        conversationId,
        authenticatedClient.userId
      );

      // Format messages for AI
      const messages = conversation.messages.map((m) => ({
        role: m.role.toLowerCase() as 'user' | 'assistant',
        content: m.content,
      }));

      // Build business context from tenant profile + onboarding notes
      const businessContext = await this.buildBusinessContext(
        authenticatedClient.tenantId,
        authenticatedClient.userId
      );

      // Pre-AI enrichment: concept search + memory context + web search in parallel
      const webSearchEnabled = (payload as any).webSearchEnabled !== false;
      const [relevantConcepts, memoryContext, webSearchResults] = await Promise.all([
        this.conceptMatchingService.findRelevantConcepts(content, {
          limit: 5,
          threshold: 0.5,
          personaType: conversation.personaType ?? undefined,
        }).catch(() => [] as import('@mentor-ai/shared/types').ConceptMatch[]),
        this.memoryContextBuilder.buildContext(
          content,
          authenticatedClient.userId,
          authenticatedClient.tenantId,
        ).catch(() => ({ context: '', attributions: [] as import('@mentor-ai/shared/types').MemoryAttribution[], estimatedTokens: 0 })),
        webSearchEnabled && this.webSearchService.isAvailable()
          ? this.webSearchService.searchAndExtract(content, 3).catch(() => [] as import('@mentor-ai/shared/types').EnrichedSearchResult[])
          : Promise.resolve([] as import('@mentor-ai/shared/types').EnrichedSearchResult[]),
      ]);

      // Build enriched context with curriculum concepts + memory
      let enrichedContext = businessContext;

      if (relevantConcepts.length > 0) {
        enrichedContext += '\n\n--- CURRICULUM CONCEPT KNOWLEDGE ---\n';
        for (const concept of relevantConcepts.slice(0, 3)) {
          enrichedContext += `\nCONCEPT: ${concept.conceptName}\n`;
          enrichedContext += `DEFINITION: ${concept.definition}\n`;
          try {
            const full = await this.conceptService.findById(concept.conceptId);
            if (full.extendedDescription) {
              enrichedContext += `DETAILS: ${full.extendedDescription}\n`;
            }
          } catch { /* skip if concept not found */ }
        }
        enrichedContext += '--- END CONCEPT KNOWLEDGE ---\n';
        enrichedContext += 'Apply these concepts in your response. When referencing a concept, use [[Concept Name]] notation.\n';
        enrichedContext += 'VAŽNO: Odgovaraj na srpskom jeziku.\n';
      }

      if (memoryContext.context) {
        enrichedContext = this.memoryContextBuilder.injectIntoSystemPrompt(
          enrichedContext,
          memoryContext,
        );
      }

      // Append web search context if results available (Story 2.17)
      if (webSearchResults.length > 0) {
        enrichedContext += this.webSearchService.formatSourcesAsObsidian(webSearchResults);
      }

      // Stream AI response with confidence calculation (Story 2.5)
      let fullContent = '';
      let chunkIndex = 0;

      const completionResult = await this.aiGatewayService.streamCompletionWithContext(
        messages,
        {
          tenantId: authenticatedClient.tenantId,
          userId: authenticatedClient.userId,
          conversationId,
          personaType: conversation.personaType ?? undefined,
          messageCount: conversation.messages.length,
          hasClientContext: memoryContext.attributions.length > 0,
          hasSpecificData: relevantConcepts.length > 0,
          userQuestion: content,
          businessContext: enrichedContext,
        },
        (chunk: string) => {
          fullContent += chunk;
          client.emit('chat:message-chunk', {
            content: chunk,
            index: chunkIndex++,
          });
        }
      );

      // Extract confidence from result
      const confidence = completionResult.confidence;

      // Post-AI: inject citation markers into response
      let contentWithCitations = fullContent;
      let citations: ConceptCitation[] = [];

      if (relevantConcepts.length > 0) {
        const citationResult = this.citationInjectorService.injectCitations(
          fullContent,
          relevantConcepts,
        );
        contentWithCitations = citationResult.content;
        citations = citationResult.citations;
      }

      // Parse memory attributions from the AI response
      const memoryAttributions = memoryContext.attributions.length > 0
        ? this.memoryContextBuilder.parseAttributionsFromResponse(
            fullContent,
            memoryContext.attributions,
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

      // Emit completion with confidence + citations metadata
      client.emit('chat:complete', {
        messageId: aiMessage.id,
        fullContent: contentWithCitations,
        metadata: {
          totalChunks: chunkIndex,
          confidence: confidence ? {
            score: confidence.score,
            level: confidence.level,
            factors: confidence.factors,
          } : null,
          citations,
          memoryAttributions,
        },
      });

      this.logger.log({
        message: 'Chat message processed',
        conversationId,
        userId: authenticatedClient.userId,
        tenantId: authenticatedClient.tenantId,
        userMessageId: userMessage.id,
        aiMessageId: aiMessage.id,
        confidenceScore: confidence?.score ?? 'N/A',
        confidenceLevel: confidence?.level ?? 'N/A',
        citationCount: citations.length,
        conceptsFound: relevantConcepts.length,
        memoriesUsed: memoryContext.attributions.length,
      });

      // Fire-and-forget: detect explicit task creation or auto-generate tasks
      if (this.hasExplicitTaskIntent(content)) {
        this.detectAndCreateExplicitTasks(
          client,
          authenticatedClient.userId,
          authenticatedClient.tenantId,
          conversationId,
          conversation.conceptId ?? null,
          content,
          fullContent,
          relevantConcepts
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
          relevantConcepts
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

      // Fire-and-forget: extract memories from this exchange
      this.memoryExtractionService.extractMemories(
        conversation.messages.concat([
          { id: userMessage.id, conversationId, role: MessageRole.USER, content, confidenceScore: null, confidenceFactors: null, createdAt: new Date().toISOString() },
          { id: aiMessage.id, conversationId, role: MessageRole.ASSISTANT, content: fullContent, confidenceScore: null, confidenceFactors: null, createdAt: new Date().toISOString() },
        ]),
        authenticatedClient.userId,
        authenticatedClient.tenantId,
      ).catch((err: unknown) => {
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
      this.conceptExtractionService.extractAndCreateConcepts(fullContent, {
        conversationId,
        conceptId: conversation.conceptId ?? undefined,
      }).catch((err: unknown) => {
        this.logger.warn({
          message: 'Concept extraction failed (non-blocking)',
          conversationId,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      });

      // Auto-detect affirmative or selective task execution on welcome conversation
      if (conversation.messages.length <= 4) {
        const lowerContent = content.toLowerCase().trim();
        const affirmatives = ['da', 'yes', 'izvrši', 'izvrsi', 'hajde', 'naravno', 'svakako', 'pokreni sve'];
        const isFullAffirmative = affirmatives.some((p) =>
          lowerContent === p || lowerContent.startsWith(p + ' ') || lowerContent.startsWith(p + ','),
        );

        // Detect selective execution: "pokreni 1, 3, 5" or "pokreni prvi"
        const numberMatch = lowerContent.match(/(?:pokreni|izvrši|izvrsi|run|start)\s+([\d,\s]+)/);
        const isFirstOnly = /(?:pokreni|izvrši|izvrsi)\s+(?:prvi|first|1)$/i.test(lowerContent);

        const pendingTasks = await this.notesService.getPendingTasksByUser(
          authenticatedClient.userId,
          authenticatedClient.tenantId,
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
      this.logger.error({
        message: 'Failed to process chat message',
        conversationId,
        userId: authenticatedClient.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      client.emit('chat:error', {
        type: 'processing_error',
        message:
          error instanceof Error ? error.message : 'Failed to process message',
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
    relevantConcepts?: import('@mentor-ai/shared/types').ConceptMatch[]
  ): Promise<void> {
    // Only generate tasks every 2nd AI response to avoid excessive LLM calls
    const messageCount = conversationHistory.length;
    if (messageCount < 2) return; // Need at least 1 exchange

    const taskPrompt = `Based on the following conversation exchange, generate 1-3 actionable tasks or key takeaways that would help the user. Focus on practical next steps.

USER MESSAGE:
${userMessage}

AI RESPONSE:
${aiResponse}

Respond ONLY with a valid JSON array. Each item must have "title" (short, max 80 chars) and "content" (brief description, max 200 chars). Example:
[{"title": "Review quarterly budget", "content": "Analyze Q1 spending vs projections based on the discussed financial strategy"}]

If there are no meaningful tasks, respond with an empty array: []`;

    try {
      let taskResponseContent = '';
      await this.aiGatewayService.streamCompletionWithContext(
        [{ role: 'user', content: taskPrompt }],
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
      const jsonMatch = taskResponseContent.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        this.logger.debug({ message: 'No JSON array found in task generation response', conversationId });
        return;
      }

      const tasks = JSON.parse(jsonMatch[0]) as Array<{ title: string; content: string }>;
      if (!Array.isArray(tasks) || tasks.length === 0) return;

      // Create notes for each task (max 3)
      // Use relevantConcepts as fallback if conversation has no conceptId yet
      const effectiveConceptId = conceptId ?? relevantConcepts?.[0]?.conceptId ?? undefined;
      const tasksToCreate = tasks.slice(0, 3);
      for (const task of tasksToCreate) {
        if (!task.title) continue;
        await this.notesService.createNote({
          title: task.title,
          content: task.content ?? '',
          source: NoteSource.CONVERSATION,
          noteType: NoteType.TASK,
          status: NoteStatus.PENDING,
          conversationId,
          conceptId: effectiveConceptId,
          messageId,
          userId,
          tenantId,
        });
      }

      // Notify frontend that new notes are available
      client.emit('chat:notes-updated', { conversationId, count: tasksToCreate.length });

      this.logger.log({
        message: 'Auto-tasks generated',
        conversationId,
        taskCount: tasksToCreate.length,
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
    const conv = await this.conversationService.getConversation(
      tenantId,
      conversationId,
      userId
    );
    if (conv.conceptId) return;

    // Use semantic search to find best matching concept
    const matches = await this.conceptMatchingService.findRelevantConcepts(
      `${userMessage}\n${aiResponse}`,
      { limit: 1, threshold: 0.75 }
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
      await this.notesService.updateConceptIdForConversation(
        conversationId, topMatch.conceptId, tenantId
      ).catch(() => {});

      client.emit('chat:concept-detected', {
        conversationId,
        conceptId: topMatch.conceptId,
        conceptName: topMatch.conceptName,
      });

      this.logger.log({
        message: 'Conversation auto-classified',
        conversationId,
        conceptId: topMatch.conceptId,
        conceptName: topMatch.conceptName,
        score: topMatch.score,
      });
    }
  }

  // ─── Explicit Task Creation ─────────────────────────────────────

  private hasExplicitTaskIntent(userMessage: string): boolean {
    const taskKeywords = [
      'kreiraj task', 'kreiraj zadat', 'napravi task', 'napravi zadat',
      'kreiraj plan', 'napravi plan', 'kreiraj workflow', 'napravi workflow',
      'generiši task', 'generiši zadat', 'kreiraj korake', 'napravi korake',
      'create task', 'create plan', 'make a plan', 'make task',
    ];
    const lowerMsg = userMessage.toLowerCase();
    return taskKeywords.some((kw) => lowerMsg.includes(kw));
  }

  private async detectAndCreateExplicitTasks(
    client: Socket,
    userId: string,
    tenantId: string,
    conversationId: string,
    conceptId: string | null,
    userMessage: string,
    aiResponse: string,
    relevantConcepts?: import('@mentor-ai/shared/types').ConceptMatch[]
  ): Promise<void> {
    this.logger.log({
      message: 'Explicit task creation intent detected',
      conversationId,
      userId,
    });

    // Use LLM to extract structured tasks from the AI response
    const extractPrompt = `Na osnovu sledećeg AI odgovora, ekstrahuj konkretne zadatke kao JSON niz.
Svaki zadatak mora imati "title" (kratak, max 80 karaktera) i "content" (opis, max 500 karaktera).
Izdvoji samo konkretne, izvršive stavke — ne opšte observacije.

AI ODGOVOR:
${aiResponse}

Odgovori SAMO sa validnim JSON nizom: [{"title":"...","content":"..."}]
Ako nema zadataka, odgovori sa: []`;

    try {
      let extractedContent = '';
      await this.aiGatewayService.streamCompletionWithContext(
        [{ role: 'user', content: extractPrompt }],
        { tenantId, userId, skipRateLimit: true, skipQuotaCheck: true },
        (chunk: string) => { extractedContent += chunk; }
      );

      const jsonMatch = extractedContent.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        this.logger.debug({ message: 'No JSON array in explicit task extraction', conversationId });
        return;
      }

      const tasks = JSON.parse(jsonMatch[0]) as Array<{ title: string; content: string }>;
      if (!Array.isArray(tasks) || tasks.length === 0) return;

      // Create task notes in DB
      const effectiveConceptId = conceptId ?? relevantConcepts?.[0]?.conceptId ?? undefined;
      const createdTaskIds: string[] = [];

      for (const task of tasks.slice(0, 10)) {
        if (!task.title) continue;
        const result = await this.notesService.createNote({
          title: task.title,
          content: task.content ?? '',
          source: NoteSource.CONVERSATION,
          noteType: NoteType.TASK,
          status: NoteStatus.PENDING,
          conversationId,
          conceptId: effectiveConceptId,
          userId,
          tenantId,
        });
        createdTaskIds.push(result.id);
      }

      if (createdTaskIds.length === 0) return;

      // Emit event so frontend shows tasks with execute option
      client.emit('chat:tasks-created-for-execution', {
        conversationId,
        taskIds: createdTaskIds,
        taskCount: createdTaskIds.length,
      });

      // Also notify notes updated
      client.emit('chat:notes-updated', { conversationId, count: createdTaskIds.length });

      this.logger.log({
        message: 'Explicit tasks created',
        conversationId,
        taskCount: createdTaskIds.length,
      });
    } catch (error: unknown) {
      this.logger.warn({
        message: 'Failed to create explicit tasks',
        conversationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // ─── Workflow / Agent Execution Events ─────────────────────────

  /**
   * Handles "Run Agents" request: builds an execution plan from selected tasks.
   */
  @SubscribeMessage('workflow:run-agents')
  async handleRunAgents(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { taskIds: string[]; conversationId: string },
  ): Promise<void> {
    const authenticatedClient = client as AuthenticatedSocket;

    try {
      this.logger.log({
        message: 'Run Agents requested',
        userId: authenticatedClient.userId,
        taskIds: payload.taskIds,
        conversationId: payload.conversationId,
      });

      const plan = await this.workflowService.buildExecutionPlan(
        payload.taskIds,
        authenticatedClient.userId,
        authenticatedClient.tenantId,
        payload.conversationId,
      );

      const event: WorkflowPlanReadyPayload = {
        plan,
        conversationId: payload.conversationId,
      };
      client.emit('workflow:plan-ready', event);
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

  /**
   * Handles plan approval or rejection.
   * On approval, starts fire-and-forget execution of all plan steps.
   */
  @SubscribeMessage('workflow:approve')
  async handleWorkflowApproval(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { planId: string; approved: boolean; conversationId: string },
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
        const conceptName = plan.steps.find((s: ExecutionPlanStep) => s.conceptId === conceptId)?.conceptName ?? 'Zadatak';
        try {
          const conv = await this.conversationService.createConversation(
            authenticatedClient.tenantId,
            authenticatedClient.userId,
            conceptName,
            undefined,
            conceptId,
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
            conceptName: plan.steps.find((s: ExecutionPlanStep) => s.conceptId === id)?.conceptName ?? '',
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
    this.workflowService.executePlan(
      payload.planId,
      payload.conversationId,
      authenticatedClient.userId,
      authenticatedClient.tenantId,
      {
        onStepStart: (stepId) => {
          const stepInfo = plan?.steps.find((s: ExecutionPlanStep) => s.stepId === stepId);
          const stepIndex = plan?.steps.findIndex((s: ExecutionPlanStep) => s.stepId === stepId) ?? -1;
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
          const stepIndex = plan?.steps.findIndex((s: ExecutionPlanStep) => s.stepId === stepId) ?? -1;
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
          const stepIndex = plan?.steps.findIndex((s: ExecutionPlanStep) => s.stepId === stepId) ?? -1;
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
          const stepIndex = plan?.steps.findIndex((s: ExecutionPlanStep) => s.stepId === upcomingStep.stepId) ?? -1;
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

          // New interactive event with inputType discriminator
          const inputEvent: WorkflowStepAwaitingInputPayload = {
            planId: payload.planId,
            stepId: upcomingStep.stepId,
            stepTitle: upcomingStep.title,
            stepDescription: upcomingStep.description,
            conceptName: upcomingStep.conceptName,
            stepIndex,
            totalSteps,
            inputType: 'confirmation',
            conversationId: payload.conversationId,
          };
          client.emit('workflow:step-awaiting-input', inputEvent);
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
        saveMessage: async (_role, content, conceptId) => {
          // Route message to the concept's conversation if available
          const targetConvId = conceptId && conceptConversations.has(conceptId)
            ? conceptConversations.get(conceptId)!
            : payload.conversationId;
          const msg = await this.conversationService.addMessage(
            authenticatedClient.tenantId,
            targetConvId,
            MessageRole.ASSISTANT,
            content,
          );
          return msg.id;
        },
      },
    ).catch((err: unknown) => {
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
    @MessageBody() payload: { planId: string; conversationId: string },
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
    @MessageBody() payload: { planId: string; conversationId: string; userInput?: string },
  ): void {
    this.logger.log({
      message: 'User confirmed next workflow step',
      planId: payload.planId,
      hasUserInput: !!payload.userInput,
    });
    this.workflowService.continueStep(payload.planId, payload.userInput);
  }

  /**
   * Handles YOLO autonomous execution start.
   * Loads all pending tasks, creates per-concept conversations, and starts the scheduler.
   */
  @SubscribeMessage('workflow:start-yolo')
  async handleStartYolo(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { conversationId: string },
  ): Promise<void> {
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
        const conceptName =
          tasks.find((t) => t.conceptId === conceptId)?.title ??
          'Zadatak';
        try {
          const conv = await this.conversationService.createConversation(
            authenticatedClient.tenantId,
            authenticatedClient.userId,
            conceptName,
            undefined,
            conceptId,
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
            conceptName:
              tasks.find((t) => t.conceptId === id)?.title ?? '',
            conversationId: conceptConversations.get(id)!,
          })),
        originalConversationId: payload.conversationId,
      };
      client.emit('workflow:conversations-created', conversationsPayload);

      // Start YOLO scheduler
      const config = { maxConcurrency: 3, maxConceptsHardStop: 1000, retryAttempts: 3 };

      this.yoloScheduler
        .startYoloExecution(
          authenticatedClient.tenantId,
          authenticatedClient.userId,
          payload.conversationId,
          config,
          {
            onProgress: (progress) => {
              client.emit('workflow:yolo-progress', progress);
            },
            onComplete: (result) => {
              client.emit('workflow:yolo-complete', result);
              client.emit('chat:notes-updated', {
                conversationId: payload.conversationId,
                count: 0,
              });
            },
            onError: (error) => {
              client.emit('workflow:error', {
                message: error,
                conversationId: payload.conversationId,
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
                content,
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
                  conceptId,
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
            onConceptDiscovered: (conceptId: string, conceptName: string, discoveredConversationId: string) => {
              client.emit('chat:concept-detected', {
                conversationId: payload.conversationId,
                conceptId,
                conceptName,
                discoveredConversationId,
              });
            },
          },
          conceptConversations,
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
   * Builds, auto-approves, and executes a workflow plan for welcome conversation.
   * Skips the plan overlay — user sees inline progress directly.
   */
  private async autoExecuteWorkflow(
    client: Socket,
    taskIds: string[],
    conversationId: string,
  ): Promise<void> {
    const authenticatedClient = client as AuthenticatedSocket;

    // 1. Build the plan
    const plan = await this.workflowService.buildExecutionPlan(
      taskIds,
      authenticatedClient.userId,
      authenticatedClient.tenantId,
      conversationId,
    );
    const totalSteps = plan.steps.length;

    // 2. Create per-concept conversations
    const conceptConversations = new Map<string, string>();
    const conceptIds = [...new Set(plan.steps.map((s: ExecutionPlanStep) => s.conceptId))];

    for (const conceptId of conceptIds) {
      const conceptName = plan.steps.find((s: ExecutionPlanStep) => s.conceptId === conceptId)?.conceptName ?? 'Zadatak';
      try {
        const conv = await this.conversationService.createConversation(
          authenticatedClient.tenantId,
          authenticatedClient.userId,
          conceptName,
          undefined,
          conceptId,
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
          conceptName: plan.steps.find((s: ExecutionPlanStep) => s.conceptId === id)?.conceptName ?? '',
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
    this.workflowService.executePlan(
      plan.planId,
      conversationId,
      authenticatedClient.userId,
      authenticatedClient.tenantId,
      {
        onStepStart: (stepId) => {
          const stepInfo = plan.steps.find((s: ExecutionPlanStep) => s.stepId === stepId);
          const stepIndex = plan.steps.findIndex((s: ExecutionPlanStep) => s.stepId === stepId);
          const event: WorkflowStepProgressPayload = {
            planId: plan.planId, stepId,
            stepTitle: stepInfo?.title, stepIndex, totalSteps,
            status: 'in_progress', conversationId,
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
            planId: plan.planId, stepId,
            stepTitle: stepInfo?.title, stepIndex, totalSteps,
            status: 'completed', content: fullContent, citations, conversationId,
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
            planId: plan.planId, stepId,
            stepTitle: stepInfo?.title, stepIndex, totalSteps,
            status: 'failed', content: error, conversationId,
          };
          client.emit('workflow:step-progress', event);
        },
        onStepAwaitingConfirmation: (upcomingStep) => {
          const stepIndex = plan.steps.findIndex((s: ExecutionPlanStep) => s.stepId === upcomingStep.stepId);
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
            planId: plan.planId, status,
            completedSteps, totalSteps: totalStepsCount, conversationId,
          };
          client.emit('workflow:complete', event);
          client.emit('chat:notes-updated', { conversationId, count: 0 });
        },
        saveMessage: async (_role, content, conceptId) => {
          const targetConvId = conceptId && conceptConversations.has(conceptId)
            ? conceptConversations.get(conceptId)!
            : conversationId;
          const msg = await this.conversationService.addMessage(
            authenticatedClient.tenantId, targetConvId, MessageRole.ASSISTANT, content,
          );
          return msg.id;
        },
      },
    ).catch((err: unknown) => {
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
    @MessageBody() payload: { content: string },
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
      // Build minimal business context
      const businessContext = await this.buildBusinessContext(
        authenticatedClient.tenantId,
        authenticatedClient.userId,
      );

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
Odgovaraj precizno i koncizno na srpskom jeziku.
${businessContext}${webContext}`;

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
        },
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
    userId: string
  ): Promise<string> {
    try {
      const [tenant, onboardingNote] = await Promise.all([
        this.prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { name: true, industry: true, description: true },
        }),
        this.notesService.getLatestNoteBySource(
          userId,
          tenantId,
          NoteSource.ONBOARDING
        ),
      ]);

      if (!tenant) {
        return '';
      }

      let context = '--- BUSINESS CONTEXT ---\n';
      context += `Company: ${tenant.name}`;
      if (tenant.industry) {
        context += ` | Industry: ${tenant.industry}`;
      }
      context += '\n';
      if (tenant.description) {
        context += `Description: ${tenant.description}\n`;
      }

      if (onboardingNote?.content) {
        context += `\nBusiness Analysis:\n${onboardingNote.content}\n`;
      }

      context += '--- END BUSINESS CONTEXT ---\n';
      context += 'Use this business context to personalize your responses.\nVAŽNO: Odgovaraj na srpskom jeziku.';

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

  private extractToken(client: Socket): string | null {
    // Try Authorization header first
    const authHeader = client.handshake.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.slice(7);
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
