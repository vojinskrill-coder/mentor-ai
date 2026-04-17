import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { NoteSource, NoteType, NoteStatus } from '@mentor-ai/shared/prisma';
import { MessageRole } from '@mentor-ai/shared/types';
import type { NoteItem, ExecutionPlanStep, ChatMessage } from '@mentor-ai/shared/types';
import { WorkflowService } from '../workflow/workflow.service';
import { NotesService } from '../notes/notes.service';
import { ConversationService } from './conversation.service';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import { BusinessContextService } from '../knowledge/services/business-context.service';
import { AgentExecutionEventBus } from '../agent-execution/agent-execution-event-bus.service';
import { HeadlessExecutorService } from '../maturity/headless-executor.service';

@Injectable()
export class ConceptPlanService {
  private readonly logger = new Logger(ConceptPlanService.name);

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly workflowService: WorkflowService,
    private readonly notesService: NotesService,
    private readonly conversationService: ConversationService,
    private readonly aiGatewayService: AiGatewayService,
    private readonly businessContextService: BusinessContextService,
    private readonly eventBus: AgentExecutionEventBus,
    @Inject(forwardRef(() => HeadlessExecutorService))
    private readonly headlessExecutor: HeadlessExecutorService,
  ) {}

  /**
   * Fire-and-forget entry point. Called after conversation creation when a conceptId is present.
   * Checks for existing notes and routes to Branch A (create plan) or Branch B (suggest next steps).
   *
   * - Branch A: Creates TASKs in the task panel + sends a chat message explaining the plan.
   * - Branch B: Sends a chat message with next-step suggestions (no notes created).
   */
  async triggerConceptPlan(
    conceptId: string,
    conversationId: string,
    userId: string,
    tenantId: string
  ): Promise<void> {
    try {
      const existingNotes = await this.notesService.getByConcept(conceptId, userId, tenantId);

      if (existingNotes.length === 0) {
        await this.createAndExecutePlan(conceptId, conversationId, userId, tenantId);
      } else {
        await this.suggestNextSteps(existingNotes, conceptId, conversationId, userId, tenantId);
      }
    } catch (err) {
      this.logger.error({
        message: 'ConceptPlan trigger failed',
        conceptId,
        conversationId,
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }
  }

  // ─── Branch A: No existing notes — create plan tasks and execute ───

  private async createAndExecutePlan(
    conceptId: string,
    conversationId: string,
    userId: string,
    tenantId: string
  ): Promise<void> {
    // 1. Get or generate workflow steps for this concept
    const { conceptName, steps } = await this.workflowService.getOrGenerateWorkflow(
      conceptId,
      tenantId,
      userId
    );

    // 2. Dedup: skip if a parent task already exists for this concept
    const existingTaskId = await this.notesService.findExistingTask(tenantId, {
      conceptId,
      title: conceptName,
    });
    if (existingTaskId) {
      this.logger.log({
        message: 'Skipping plan creation — parent task already exists',
        conceptId,
        existingTaskId,
      });
      return;
    }

    // 3. Create parent TASK in task panel
    const parentNote = await this.notesService.createNote({
      title: conceptName,
      content: `Automatic plan for concept: ${conceptName}\n\nSteps: ${steps.length}`,
      source: NoteSource.CONVERSATION,
      noteType: NoteType.TASK,
      status: NoteStatus.PENDING,
      userId,
      tenantId,
      conversationId,
      conceptId,
    });

    // 4. Create child TASKs for each workflow step
    const childNoteIds: string[] = [];
    for (const step of steps) {
      const childNote = await this.notesService.createNote({
        title: step.title,
        content: step.description,
        source: NoteSource.CONVERSATION,
        noteType: NoteType.TASK,
        status: NoteStatus.PENDING,
        userId,
        tenantId,
        conversationId,
        conceptId,
        parentNoteId: parentNote.id,
        workflowStepNumber: step.stepNumber,
        expectedOutcome: step.expectedOutcome,
      });
      childNoteIds.push(childNote.id);
    }

    // 5. Notify frontend that tasks are available in task panel
    this.emitNotesUpdated(tenantId, conversationId);

    // 6. Send chat message explaining the plan
    const stepList = steps
      .map((s) => `${s.stepNumber}. **${s.title}** — ${s.description}`)
      .join('\n');
    const planMessage = `I have prepared a work plan for the concept **${conceptName}**. The plan contains ${steps.length} steps:\n\n${stepList}\n\nI have started automatic execution. Results will appear in the task panel.`;
    await this.sendChatMessage(tenantId, conversationId, planMessage);

    this.logger.log({
      message: 'Plan created — starting execution',
      conceptId,
      conceptName,
      parentNoteId: parentNote.id,
      stepCount: steps.length,
    });

    // 7. Execute via HeadlessExecutor — same pipeline as maturity flow
    // This triggers: synthesis → job planning → Gemini search → Brave → DeepSeek agents
    // with cross-agent collaboration, web search enrichment, and consolidated output.
    try {
      const result = await this.headlessExecutor.executeTask({
        taskId: parentNote.id,
        tenantId,
        userId,
      });

      if (result.success) {
        this.logger.log({
          message: 'Chat plan executed via headless pipeline',
          conceptId,
          conceptName,
          parentNoteId: parentNote.id,
        });
      } else {
        this.logger.warn({
          message: 'Chat plan execution failed',
          conceptId,
          error: result.error,
        });
      }
    } catch (err) {
      this.logger.error({
        message: 'Chat plan execution error',
        conceptId,
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }

    this.emitNotesUpdated(tenantId, conversationId);

    // 8. Send completion message in chat
    await this.sendChatMessage(
      tenantId,
      conversationId,
      `Plan for **${conceptName}** is complete. Results are available in the task panel.`
    );

    this.logger.log({
      message: 'Plan execution complete',
      conceptId,
      conceptName,
      stepCount: steps.length,
    });
  }

  // ─── Branch B: Notes exist — suggest next steps via chat message ───

  private async suggestNextSteps(
    existingNotes: NoteItem[],
    conceptId: string,
    conversationId: string,
    userId: string,
    tenantId: string
  ): Promise<void> {
    // 1. Get concept name and workflow
    const { conceptName, steps: workflowSteps } = await this.workflowService.getOrGenerateWorkflow(
      conceptId,
      tenantId,
      userId
    );

    // 2. Categorize existing notes
    const completed: NoteItem[] = [];
    const pending: NoteItem[] = [];
    for (const note of existingNotes) {
      if (note.status === 'COMPLETED' || note.status === 'READY_FOR_REVIEW') {
        completed.push(note);
      } else {
        pending.push(note);
      }
    }

    // 3. Build context for LLM
    let completedContext = '';
    if (completed.length > 0) {
      completedContext = completed
        .map((n) => {
          const snippet = n.content.length > 300 ? n.content.substring(0, 300) + '...' : n.content;
          const childInfo =
            n.children && n.children.length > 0
              ? ` (${n.children.filter((c) => c.status === 'COMPLETED' || c.status === 'READY_FOR_REVIEW').length}/${n.children.length} steps completed)`
              : '';
          return `- "${n.title}" [${n.status}]${childInfo}: ${snippet}`;
        })
        .join('\n');
    }

    let pendingContext = '';
    if (pending.length > 0) {
      pendingContext = pending
        .map((n) => {
          const isBare = n.content.startsWith('Istraži koncept:') || n.content.startsWith('Explore concept:');
          const label = isBare ? ' [not started]' : '';
          const snippet =
            !isBare && n.content.length > 200
              ? n.content.substring(0, 200) + '...'
              : isBare
                ? ''
                : n.content;
          return `- "${n.title}" [${n.status ?? 'PENDING'}]${label}${snippet ? ': ' + snippet : ''}`;
        })
        .join('\n');
    }

    const workflowContext = workflowSteps
      .map((s) => `${s.stepNumber}. ${s.title} — ${s.description}`)
      .join('\n');

    // 4. Load business context
    let businessContext = '';
    try {
      businessContext = await this.businessContextService.getBusinessContext(tenantId);
    } catch {
      // non-blocking
    }

    // 5. LLM call
    const systemPrompt = `You are a business advisor. Analyze what the user has already done for the concept "${conceptName}" and suggest next steps.

${completed.length > 0 ? `COMPLETED (do NOT suggest again):\n${completedContext}\n` : ''}
${pending.length > 0 ? `IN PROGRESS / NOT STARTED:\n${pendingContext}\n` : ''}
CONCEPT PLAN (all possible steps):
${workflowContext}

${businessContext ? `BUSINESS CONTEXT:\n${businessContext}\n` : ''}
HOW TO ANALYZE AND SUGGEST:
- Analyze results of completed steps and identify where the BIGGEST GAP exists between what the user has and what they need
- Do not suggest steps that are variations of already completed ones — suggest steps that BUILD ON results
- Each suggestion must be SPECIFIC to the company and results of previously done work
- If completed steps revealed a specific problem or opportunity, suggest a step that ADDRESSES it

Suggest 2-3 specific next steps. Be specific for the company and industry.
Focus on what is MOST IMPORTANT for the user at this moment.
For each suggestion explain WHY it is important and WHAT the user will gain.
Write in English. Minimum 400 words.`;

    let llmResponse = '';
    try {
      await this.aiGatewayService.streamCompletionWithContext(
        [
          { role: 'system', content: systemPrompt } as ChatMessage,
          {
            role: 'user',
            content: `Suggest next steps for the concept "${conceptName}".`,
          } as ChatMessage,
        ],
        { tenantId, userId, skipRateLimit: true, skipQuotaCheck: true, useFallback: true },
        (chunk: string) => {
          llmResponse += chunk;
        }
      );
    } catch (err) {
      this.logger.error({
        message: 'Branch B LLM call failed',
        conceptId,
        error: err instanceof Error ? err.message : 'Unknown',
      });
      return;
    }

    if (!llmResponse.trim()) {
      this.logger.warn({ message: 'Branch B: empty LLM response', conceptId });
      return;
    }

    // 6. Send suggestion as a chat message (not a note)
    await this.sendChatMessage(tenantId, conversationId, llmResponse);

    this.logger.log({
      message: 'Next steps suggestion sent as chat message',
      conceptId,
      conceptName,
      completedNotes: completed.length,
      pendingNotes: pending.length,
      responseLength: llmResponse.length,
    });
  }

  // ─── Helpers ───

  /**
   * Saves an assistant message to the conversation DB and pushes it to the frontend
   * via the EventBus → Gateway → socket.io broadcast path.
   *
   * Includes conversationId so the frontend can filter: only show the message
   * if it belongs to the active conversation, and skip streaming-state resets
   * for background messages.
   */
  private async sendChatMessage(
    tenantId: string,
    conversationId: string,
    content: string
  ): Promise<void> {
    const message = await this.conversationService.addMessage(
      tenantId,
      conversationId,
      MessageRole.ASSISTANT,
      content
    );

    this.eventBus.emit({
      tenantId,
      eventName: 'chat:complete',
      payload: {
        conversationId,
        messageId: message.id,
        fullContent: content,
        metadata: { background: true },
      },
    });
  }

  private emitNotesUpdated(tenantId: string, conversationId: string): void {
    this.eventBus.emit({
      tenantId,
      eventName: 'chat:notes-updated',
      payload: { conversationId, count: 0 },
    });
  }
}
