import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { NoteSource, NoteType, NoteStatus } from '@mentor-ai/shared/prisma';
import type {
  WorkflowStep,
  ExecutionPlan,
  ExecutionPlanStep,
  ChatMessage,
  ConceptCitation,
  EnrichedSearchResult,
} from '@mentor-ai/shared/types';
import { ConceptService } from '../knowledge/services/concept.service';
import { ConceptMatchingService } from '../knowledge/services/concept-matching.service';
import { CitationInjectorService } from '../knowledge/services/citation-injector.service';
import { CitationService } from '../knowledge/services/citation.service';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import { NotesService } from '../notes/notes.service';
import { WebSearchService } from '../web-search/web-search.service';
import { BusinessContextService } from '../knowledge/services/business-context.service';
import { ConceptRelevanceService } from '../knowledge/services/concept-relevance.service';
import { PromptCheckerService } from './prompt-checker.service';
import { MaturityEngineService } from '../maturity/maturity-engine.service';
import { generateSystemPrompt } from '../personas/templates/persona-prompts';
import { getVisibleCategories } from '../knowledge/config/department-categories';
import { AppEventBus, APP_EVENTS } from '../events/app-event-bus.service';

const MAX_RECURSION_DEPTH = 10;

const WORKFLOW_GENERATION_SYSTEM_PROMPT = `You are an experienced business workflow designer. Create structured, sequential workflows where each step PRODUCES a concrete business document.

Every workflow must:
1. Start with diagnostics/assessment before strategic recommendations — NEVER skip analysis of the current state
2. Include prompts that instruct the AI to EXECUTE the work and PRODUCE results — NOT to explain to the user
3. Each step produces a usable output (analysis, plan, matrix, strategy, profile, etc.)
4. Use the appropriate departmental framework when departmentTag is specified
5. Be SPECIFIC to the given company and industry — NOT generic

CONCEPT USAGE:
- Each step MUST apply {{conceptName}} as an analytical framework — not explain it
- If the concept has PREREQUISITE concepts, earlier steps must apply those foundations before the main concept
- If the concept has RELATED concepts, use them for supplementary analysis where relevant
- NEVER list concept definitions — APPLY them to the concrete business

SEQUENTIAL BUILDING:
- Step 2 MUST use findings from step 1 — must not generate an independent analysis
- Step 3 MUST synthesize findings from steps 1 and 2 into a concrete plan
- promptTemplate of each step (except the first) MUST contain the instruction: "Based on the previously completed analysis, ..."
- NEVER repeat analysis that was already done in a previous step

OUTPUT QUALITY:
- Every finding must have a rationale — not just a claim
- Recommendations must be prioritized — not a list of equally important items
- Every document must end with CONCRETE next steps
- Use tables for comparative analyses and numerical data
- Format: clean markdown with ## sections, tables, > callout blocks

CRITICAL for the promptTemplate field:
- Prompt MUST instruct the AI to DO the work, NOT to explain to the user how to do it
- Prompt is INTERNAL — the user NEVER sees it. The user only sees the produced document.
- ALWAYS use imperative verbs: "Execute", "Create", "Analyze", "Develop", "Map", "Produce"
- NEVER use: "Explain", "Consider", "You should", "It is recommended"
- ALWAYS use placeholder {{businessContext}} for company name and industry
- ALWAYS use placeholder {{conceptName}} for the concept name
- EVERY prompt MUST request minimum 800 words of output with structured headings and concrete examples

Example GOOD promptTemplate:
"Execute a complete SWOT analysis for {{businessContext}} using the {{conceptName}} framework. Produce a structured matrix with minimum 5 items per category. For each item write: finding, evidence/rationale, action recommendation. Use tables where possible. Minimum 1000 words."

Example BAD promptTemplate:
"Explain what SWOT analysis is and how to apply it to a business"

IMPORTANT: All text MUST be in English.
Return ONLY valid JSON array without markdown formatting.`;

/**
 * Callbacks provided by the gateway for plan execution.
 * Avoids circular dependency with ConversationService.
 */
export interface ExecutionCallbacks {
  onStepStart: (stepId: string) => void;
  onStepChunk: (stepId: string, chunk: string) => void;
  onStepComplete: (stepId: string, fullContent: string, citations: ConceptCitation[]) => void;
  onStepFailed: (stepId: string, error: string) => void;
  onStepAwaitingConfirmation: (upcomingStep: ExecutionPlanStep) => void;
  onComplete: (
    status: 'completed' | 'cancelled' | 'failed',
    completedSteps: number,
    totalSteps: number
  ) => void;
  /** Called when post-execution discovery creates new pending tasks (Story 3.2 AC6) */
  onTasksDiscovered?: (newConceptIds: string[]) => void;
  saveMessage: (
    role: 'system' | 'user' | 'assistant',
    content: string,
    conceptId?: string
  ) => Promise<string>;
}

@Injectable()
export class WorkflowService {
  private readonly logger = new Logger(WorkflowService.name);

  /** In-memory store for active execution plans */
  private readonly activePlans = new Map<string, ExecutionPlan>();
  /** Cancellation tokens for running plans */
  private readonly cancellationTokens = new Map<string, boolean>();
  /** Resolve functions for paused workflows awaiting user confirmation */
  private readonly stepResolvers = new Map<string, (userInput?: string) => void>();

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly conceptService: ConceptService,
    private readonly conceptMatchingService: ConceptMatchingService,
    private readonly citationInjectorService: CitationInjectorService,
    private readonly citationService: CitationService,
    private readonly aiGatewayService: AiGatewayService,
    private readonly notesService: NotesService,
    private readonly webSearchService: WebSearchService,
    private readonly businessContextService: BusinessContextService,
    private readonly conceptRelevanceService: ConceptRelevanceService,
    private readonly promptCheckerService: PromptCheckerService,
    @Inject(forwardRef(() => MaturityEngineService))
    private readonly maturityEngine: MaturityEngineService,
    private readonly eventBus: AppEventBus
  ) {}

  // ─── Workflow Generation ──────────────────────────────────────

  /**
   * Gets a cached workflow or generates a new one for a concept.
   */
  async getOrGenerateWorkflow(
    conceptId: string,
    tenantId: string,
    userId: string
  ): Promise<{ conceptName: string; steps: WorkflowStep[] }> {
    const existing = await this.prisma.conceptWorkflow.findUnique({
      where: { conceptId },
      include: { concept: { select: { name: true } } },
    });

    if (existing) {
      return {
        conceptName: existing.concept.name,
        steps: existing.steps as unknown as WorkflowStep[],
      };
    }

    return this.generateWorkflow(conceptId, tenantId, userId);
  }

  private async generateWorkflow(
    conceptId: string,
    tenantId: string,
    userId: string
  ): Promise<{ conceptName: string; steps: WorkflowStep[] }> {
    const concept = await this.conceptService.findById(conceptId);

    // Load tenant for business context injection
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, industry: true, description: true },
    });

    // Gather prerequisite names
    const prerequisites = concept.relatedConcepts
      .filter((r) => r.relationshipType === 'PREREQUISITE' && r.direction === 'outgoing')
      .map((r) => r.concept.name);

    // Gather related concept names for context
    const relatedConcepts = concept.relatedConcepts
      .filter((r) => r.relationshipType === 'RELATED')
      .slice(0, 5)
      .map((r) => r.concept.name);

    const prompt = this.buildGenerationPrompt(
      concept.name,
      concept.definition,
      concept.extendedDescription,
      prerequisites,
      concept.departmentTags,
      tenant,
      relatedConcepts
    );

    // LLM call to generate workflow steps (use fallback/GPT for speed)
    let responseContent = '';
    await this.aiGatewayService.streamCompletionWithContext(
      [
        { role: 'system', content: WORKFLOW_GENERATION_SYSTEM_PROMPT } as ChatMessage,
        { role: 'user', content: prompt } as ChatMessage,
      ],
      {
        tenantId,
        userId,
        skipRateLimit: true,
        skipQuotaCheck: true,
        useFallback: true,
      },
      (chunk: string) => {
        responseContent += chunk;
      }
    );

    const steps = this.parseWorkflowSteps(responseContent);

    // Cache in DB
    await this.prisma.conceptWorkflow.create({
      data: {
        id: `wfl_${createId()}`,
        conceptId,
        steps: steps as unknown as import('@prisma/client').Prisma.InputJsonValue,
      },
    });

    this.logger.log({
      message: 'Workflow generated and cached',
      conceptId,
      conceptName: concept.name,
      stepCount: steps.length,
    });

    return { conceptName: concept.name, steps };
  }

  /**
   * Generates workflow steps specific to a task's content and conversation context.
   * Unlike getOrGenerateWorkflow() which generates generic concept workflows,
   * this produces steps tailored to what the user actually discussed in chat.
   * These are NOT cached — each task gets unique steps.
   */
  async generateTaskSpecificWorkflow(
    task: {
      title: string;
      content: string;
      conversationId: string | null;
      conceptId: string | null;
    },
    tenantId: string,
    userId: string
  ): Promise<{ conceptName: string; steps: WorkflowStep[] }> {
    // Load tenant info for checker context
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, industry: true, description: true },
    });

    // Load concept name if available
    let conceptName = 'Business task';
    let conceptContext = '';
    if (task.conceptId) {
      try {
        const concept = await this.conceptService.findById(task.conceptId);
        conceptName = concept.name;
        conceptContext = `\nKoncept: ${concept.name} — ${concept.definition}`;
      } catch {
        /* concept not found */
      }
    }

    // Load conversation messages for context
    let conversationContext = '';
    if (task.conversationId) {
      try {
        const messages = await this.prisma.message.findMany({
          where: { conversationId: task.conversationId },
          orderBy: { createdAt: 'desc' },
          take: 15,
          select: { role: true, content: true },
        });
        if (messages.length > 0) {
          conversationContext =
            '\n\nUSER CONVERSATION (this is the context from which the task originated):';
          for (const msg of messages.reverse()) {
            const role = msg.role === 'USER' ? 'USER' : 'AI';
            const content =
              msg.content.length > 1000 ? msg.content.substring(0, 1000) + '...' : msg.content;
            conversationContext += `\n${role}: ${content}`;
          }
        }
      } catch {
        /* conversation not found */
      }
    }

    const prompt = `Generate a workflow for EXECUTING a specific business task.

TASK: ${task.title}
${task.content ? `TASK DESCRIPTION: ${task.content}` : ''}${conceptContext}${conversationContext}

CONVERSATION ANALYSIS:
- Read the conversation and identify WHAT the user already knows about this problem
- Do not generate steps for things that have already been discussed or resolved
- Reference specific problems, products, or situations the user mentioned
- promptTemplate MUST use specifics from the conversation

CONCEPT AS FRAMEWORK:
- If the task is linked to a concept, use the concept as an ANALYTICAL FRAMEWORK for structuring steps
- Do not explain the concept — apply it to the user's specific situation

SEQUENTIAL BUILDING:
- Step 2 MUST use findings from step 1 — promptTemplate must contain "Based on the previously completed analysis, ..."
- Step 3 MUST synthesize findings from steps 1 and 2 into a concrete plan
- NEVER repeat analysis that was already done in a previous step

CRITICAL: Steps MUST be directly related to the TASK above and to the USER'S CONVERSATION.
DO NOT generate generic steps for a concept. Generate steps that solve the user's SPECIFIC problem.

Return a JSON array of steps. Each step must have:
- stepNumber (integer starting from 1)
- title (concise action title, max 60 characters, in English)
- description (what this step achieves, max 200 characters, in English)
- promptTemplate (INTERNAL prompt that instructs the AI to EXECUTE the step. Use {{conceptName}} and {{businessContext}} placeholders. Action verbs: "Execute", "Create", "Analyze". NEVER "Explain" or "You should".)
- expectedOutcome (concrete deliverable, max 100 characters, in English)
- estimatedMinutes (integer)
- departmentTag (optional: "CFO", "CMO", "CTO", "OPERATIONS", "LEGAL", "CREATIVE")

Generate exactly 3 steps. Order logically according to the task.`;

    // Pre-generation prompt quality check
    let finalWorkflowPrompt = prompt;
    try {
      const checkResult = await this.promptCheckerService.checkAndEnrichPrompt({
        userPrompt: prompt,
        originalAsk: `${task.title}${task.content ? ' — ' + task.content : ''}`,
        businessInfo: {
          companyName: tenant?.name ?? undefined,
          industry: tenant?.industry ?? undefined,
          description: tenant?.description ?? undefined,
        },
        tenantId,
        userId,
        conversationId: task.conversationId ?? undefined,
        conceptName,
        isWorkflowGeneration: true,
      });

      if (checkResult.enrichedPrompt) {
        finalWorkflowPrompt = checkResult.enrichedPrompt;
      }

      this.logger.log({
        message: 'Workflow generation prompt checked',
        taskTitle: task.title,
        verdict: checkResult.verdict,
        issueCount: checkResult.issues.length,
        cyclesUsed: checkResult.cyclesUsed,
        durationMs: checkResult.durationMs,
        enriched: !!checkResult.enrichedPrompt,
      });
    } catch (err) {
      this.logger.warn({
        message: 'Prompt checker failed for workflow generation, proceeding with original',
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }

    let responseContent = '';
    await this.aiGatewayService.streamCompletionWithContext(
      [
        { role: 'system', content: WORKFLOW_GENERATION_SYSTEM_PROMPT } as ChatMessage,
        { role: 'user', content: finalWorkflowPrompt } as ChatMessage,
      ],
      { tenantId, userId, skipRateLimit: true, skipQuotaCheck: true, useFallback: true },
      (chunk: string) => {
        responseContent += chunk;
      }
    );

    const steps = this.parseWorkflowSteps(responseContent);

    this.logger.log({
      message: 'Task-specific workflow generated',
      taskTitle: task.title,
      conceptName,
      stepCount: steps.length,
    });

    return { conceptName, steps };
  }

  private buildGenerationPrompt(
    name: string,
    definition: string,
    extendedDescription: string | undefined,
    prerequisites: string[],
    departmentTags: string[],
    tenant?: { name: string | null; industry: string | null; description: string | null } | null,
    relatedConcepts?: string[]
  ): string {
    let prompt = `Generate a workflow for EXECUTING a business analysis and PRODUCING concrete results using the concept "${name}".

--- CONCEPT ---
Name: ${name}
Definition: ${definition}
${extendedDescription ? `Extended description: ${extendedDescription}` : ''}
${prerequisites.length > 0 ? `Prerequisites (concept builds on these): ${prerequisites.join(', ')}` : 'No prerequisites — this is a fundamental concept.'}
${relatedConcepts && relatedConcepts.length > 0 ? `Related concepts: ${relatedConcepts.join(', ')}` : ''}
${departmentTags.length > 0 ? `Relevant departments: ${departmentTags.join(', ')}` : ''}`;

    if (tenant) {
      prompt += `

--- BUSINESS CONTEXT ---
Company: ${tenant.name ?? 'Unknown'}
Industry: ${tenant.industry ?? 'General'}
${tenant.description ? `Description: ${tenant.description}` : ''}
CRITICAL: Steps MUST be tailored to this company and industry. DO NOT generate generic steps.`;
    }

    prompt += `

--- RESPONSE FORMAT ---
Return a JSON array of steps. Each step must have:
- stepNumber (integer starting from 1)
- title (concise action title, max 60 characters, in English, action verb: "Analyze...", "Create...", "Map...")
- description (what this step achieves and WHY it is important, max 200 characters, in English)
- promptTemplate (INTERNAL prompt that instructs the AI to EXECUTE the step and PRODUCE a concrete document. Must contain {{conceptName}} and {{businessContext}} placeholders. Request minimum 800 words of output, structured headings, tables where possible, concrete examples and recommendations.)
- expectedOutcome (concrete deliverable the client can use immediately, max 100 characters, in English)
- estimatedMinutes (integer, realistic estimate)
- departmentTag (optional: "CFO", "CMO", "CTO", "OPERATIONS", "LEGAL", "CREATIVE")

Generate 3-4 steps. Order:
1. Diagnostics/analysis of current state
2. Strategic planning and action plan
3. Implementation plan with KPI measurement
4. (optional, only for complex topics) Market/competition research`;

    return prompt;
  }

  private parseWorkflowSteps(response: string): WorkflowStep[] {
    try {
      const cleaned = response
        .replace(/```json?\n?/g, '')
        .replace(/```/g, '')
        .trim();
      const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
      if (!jsonMatch) throw new Error('No JSON array found');

      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Empty array');

      return parsed.map((step: Record<string, unknown>, index: number) => ({
        stepNumber: (step.stepNumber as number) ?? index + 1,
        title: (step.title as string) || `Step ${index + 1}`,
        description: (step.description as string) || '',
        promptTemplate:
          (step.promptTemplate as string) ||
          `Execute a comprehensive analysis of the concept "{{conceptName}}" applied to {{businessContext}}. Produce a structured document with concrete findings, tabular presentation, and actionable recommendations. Minimum 800 words.`,
        expectedOutcome: (step.expectedOutcome as string) || '',
        estimatedMinutes: (step.estimatedMinutes as number) ?? 5,
        departmentTag: (step.departmentTag as string) || undefined,
      }));
    } catch (error) {
      this.logger.warn({
        message: 'Failed to parse workflow steps, using fallback',
        error: error instanceof Error ? error.message : 'Unknown',
      });
      return [
        {
          stepNumber: 1,
          title: 'Analyze current state',
          description: 'Diagnostics and analysis by applying this concept to the concrete business',
          promptTemplate:
            'Execute a detailed analysis of the concept "{{conceptName}}" applied to {{businessContext}}. Diagnose the current state, identify key areas for improvement. Produce a structured document with headings, tables, and concrete actionable recommendations. Minimum 1000 words.',
          expectedOutcome: 'Complete analytical report with actionable recommendations',
          estimatedMinutes: 10,
        },
      ];
    }
  }

  // ─── Prerequisite Resolution ──────────────────────────────────

  /**
   * Resolves concept ordering by PREREQUISITE relationships via topological sort.
   * Returns concept IDs in prerequisite-first order.
   */
  async resolveConceptOrder(conceptIds: string[]): Promise<string[]> {
    if (conceptIds.length <= 1) return conceptIds;

    const graph = new Map<string, string[]>();

    // Batch load all prerequisite relationships in a single query instead of N findById calls
    try {
      const relationships = await this.prisma.conceptRelationship.findMany({
        where: {
          sourceConceptId: { in: conceptIds },
          relationshipType: 'PREREQUISITE',
          targetConceptId: { in: conceptIds },
        },
        select: { sourceConceptId: true, targetConceptId: true },
      });

      // Initialize graph nodes
      for (const id of conceptIds) {
        graph.set(id, []);
      }

      // Build adjacency from batch results
      for (const rel of relationships) {
        const prereqs = graph.get(rel.sourceConceptId);
        if (prereqs) {
          prereqs.push(rel.targetConceptId);
        }
      }
    } catch {
      // Fallback: return original order if query fails
      for (const id of conceptIds) {
        graph.set(id, []);
      }
    }

    return this.topologicalSort(graph);
  }

  private topologicalSort(graph: Map<string, string[]>): string[] {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const result: string[] = [];

    const visit = (nodeId: string, depth: number): void => {
      if (depth > MAX_RECURSION_DEPTH) {
        this.logger.warn({ message: 'Max recursion depth exceeded', nodeId, depth });
        return;
      }
      if (visited.has(nodeId)) return;
      if (visiting.has(nodeId)) {
        this.logger.warn({ message: 'Circular dependency detected, breaking cycle', nodeId });
        return;
      }

      visiting.add(nodeId);
      const deps = graph.get(nodeId) || [];
      for (const dep of deps) {
        visit(dep, depth + 1);
      }
      visiting.delete(nodeId);
      visited.add(nodeId);
      result.push(nodeId);
    };

    for (const nodeId of graph.keys()) {
      visit(nodeId, 0);
    }

    return result;
  }

  // ─── Execution Plan Building ──────────────────────────────────

  /**
   * Builds an execution plan from selected task IDs.
   * Loads linked concepts, generates workflows, orders by prerequisites.
   */
  async buildExecutionPlan(
    taskIds: string[],
    userId: string,
    tenantId: string,
    _conversationId: string
  ): Promise<ExecutionPlan> {
    // Load pending tasks
    const tasks = await this.prisma.note.findMany({
      where: {
        id: { in: taskIds },
        tenantId,
        noteType: 'TASK',
        status: 'PENDING',
      },
    });

    if (tasks.length === 0) {
      throw new Error('No pending tasks found for the given IDs');
    }

    // Collect concept IDs directly linked to tasks (no semantic expansion)
    // Also build a map from conceptId → task context for injection into steps
    const conceptIdSet = new Set<string>();
    const conceptTaskContext = new Map<
      string,
      { taskTitle: string; taskContent: string; taskConversationId: string | null }
    >();
    for (const task of tasks) {
      if (task.conceptId) {
        conceptIdSet.add(task.conceptId);
        // Keep the first task's context per concept (most relevant)
        if (!conceptTaskContext.has(task.conceptId)) {
          conceptTaskContext.set(task.conceptId, {
            taskTitle: task.title,
            taskContent: task.content ?? '',
            taskConversationId: task.conversationId,
          });
        }
      }
    }
    const conceptIds = [...conceptIdSet];

    this.logger.log({
      message: 'Concept resolution complete',
      taskCount: tasks.length,
      conceptCount: conceptIds.length,
      conceptIds: conceptIds.slice(0, 10),
    });

    if (conceptIds.length === 0) {
      throw new Error(
        'No relevant concepts found for the selected tasks. Check whether concepts are loaded in the knowledge base.'
      );
    }

    // Resolve ordering
    const orderedConceptIds = await this.resolveConceptOrder(conceptIds);

    // Generate workflows — task-specific ONLY when a real conversation exists,
    // otherwise use cached generic workflow (much faster, avoids 10+ serial LLM calls)
    const planSteps: ExecutionPlanStep[] = [];

    for (const conceptId of orderedConceptIds) {
      const taskCtx = conceptTaskContext.get(conceptId);

      // Use task-specific workflow when:
      // 1. Task has a real conversation with user dialogue, OR
      // 2. Task has rich content (>200 chars = enriched by LLM, not a one-liner)
      // Otherwise use cached generic workflow.
      const hasRealConversation = taskCtx && taskCtx.taskConversationId;
      const hasRichContent = taskCtx && taskCtx.taskContent && taskCtx.taskContent.length > 200;

      let workflow: { conceptName: string; steps: WorkflowStep[] };
      if (hasRealConversation || hasRichContent) {
        workflow = await this.generateTaskSpecificWorkflow(
          {
            title: taskCtx?.taskTitle ?? '',
            content: taskCtx?.taskContent ?? '',
            conversationId: taskCtx?.taskConversationId ?? null,
            conceptId,
          },
          tenantId,
          userId
        );
      } else {
        workflow = await this.getOrGenerateWorkflow(conceptId, tenantId, userId);
      }

      for (const step of workflow.steps) {
        planSteps.push({
          stepId: `step_${createId()}`,
          conceptId,
          conceptName: workflow.conceptName,
          workflowStepNumber: step.stepNumber,
          title: step.title,
          description: step.description,
          estimatedMinutes: step.estimatedMinutes,
          departmentTag: step.departmentTag,
          status: 'pending',
          taskTitle: taskCtx?.taskTitle,
          taskContent: taskCtx?.taskContent,
          taskConversationId: taskCtx?.taskConversationId ?? undefined,
        });
      }
    }

    // Deduplicate: if same concept+stepNumber appears multiple times, keep first
    const seen = new Set<string>();
    const deduplicatedSteps = planSteps.filter((step) => {
      const key = `${step.conceptId}:${step.workflowStepNumber}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const plan: ExecutionPlan = {
      planId: `ep_${createId()}`,
      taskIds,
      steps: deduplicatedSteps,
      totalEstimatedMinutes: deduplicatedSteps.reduce((sum, s) => sum + s.estimatedMinutes, 0),
      conceptOrder: orderedConceptIds,
      status: 'awaiting_approval',
      createdAt: new Date().toISOString(),
    };

    this.activePlans.set(plan.planId, plan);
    this.logger.log({
      message: 'Execution plan built',
      planId: plan.planId,
      taskCount: taskIds.length,
      conceptCount: orderedConceptIds.length,
      stepCount: deduplicatedSteps.length,
      estimatedMinutes: plan.totalEstimatedMinutes,
    });

    return plan;
  }

  // ─── Plan Execution ───────────────────────────────────────────

  /**
   * Executes an approved plan step by step.
   * Streams each step's LLM output via callbacks.
   */
  async executePlan(
    planId: string,
    conversationId: string,
    userId: string,
    tenantId: string,
    callbacks: ExecutionCallbacks
  ): Promise<void> {
    const plan = this.activePlans.get(planId);
    if (!plan) throw new Error(`Plan ${planId} not found`);

    plan.status = 'executing';
    this.cancellationTokens.set(planId, false);

    let completedCount = 0;
    const completedSummaries: Array<{ title: string; conceptName: string; summary: string }> = [];

    for (let i = 0; i < plan.steps.length; i++) {
      // Check cancellation
      if (this.cancellationTokens.get(planId)) {
        plan.status = 'cancelled';
        callbacks.onComplete('cancelled', completedCount, plan.steps.length);
        this.scheduledCleanup(planId);
        return;
      }

      const step = plan.steps[i];
      if (!step) continue;

      // Pause BEFORE each step — let the user provide input/answers
      callbacks.onStepAwaitingConfirmation(step);

      const userInput = await new Promise<string | undefined>((resolve) => {
        this.stepResolvers.set(planId, resolve);
      });
      this.stepResolvers.delete(planId);

      // Check cancellation after waiting
      if (this.cancellationTokens.get(planId)) {
        plan.status = 'cancelled';
        callbacks.onComplete('cancelled', completedCount, plan.steps.length);
        this.scheduledCleanup(planId);
        return;
      }

      // If user provided input, inject it as context for this step
      if (userInput) {
        completedSummaries.push({
          title: 'User response',
          conceptName: step.conceptName,
          summary: userInput,
        });
      }

      step.status = 'in_progress';
      callbacks.onStepStart(step.stepId);

      try {
        const result = await this.executeStepAutonomous(
          step,
          conversationId,
          userId,
          tenantId,
          (chunk) => callbacks.onStepChunk(step.stepId, chunk),
          completedSummaries
        );

        // Check cancellation after step
        if (this.cancellationTokens.get(planId)) {
          plan.status = 'cancelled';
          callbacks.onComplete('cancelled', completedCount, plan.steps.length);
          this.scheduledCleanup(planId);
          return;
        }

        // Save AI message with citation-injected content to concept conversation
        const messageId = await callbacks.saveMessage('assistant', result.content, step.conceptId);

        // Persist citations to DB (fire-and-forget)
        if (result.citations.length > 0 && messageId) {
          this.citationService.storeCitations(messageId, result.citations).catch((err) => {
            this.logger.warn({
              message: 'Failed to store workflow step citations',
              stepId: step.stepId,
              error: err instanceof Error ? err.message : 'Unknown',
            });
          });
        }

        step.status = 'completed';
        completedCount++;
        completedSummaries.push({
          title: step.title,
          conceptName: step.conceptName,
          summary: result.content.substring(0, 2000),
        });
        callbacks.onStepComplete(step.stepId, result.content, result.citations);

        this.eventBus.emit(APP_EVENTS.WORKFLOW_STEP_COMPLETED, {
          tenantId,
          planId,
          stepId: step.stepId,
          conceptId: step.conceptId,
          conceptName: step.conceptName,
          userId,
          stepNumber: i + 1,
          totalSteps: plan.steps.length,
        });

        // Create sub-task note linked to parent task (with dedup by parentNoteId + stepNumber, Story 3.4 AC3)
        for (const taskId of plan.taskIds) {
          try {
            const parentNote = await this.notesService.getNoteById(taskId, tenantId);
            if (parentNote && parentNote.conceptId === step.conceptId) {
              // Check if sub-task already exists for this step
              const existingSubTask = await this.notesService.findExistingSubTask(
                tenantId,
                taskId,
                step.workflowStepNumber ?? 0
              );
              if (existingSubTask) {
                this.logger.debug({
                  message: 'Skipping duplicate sub-task',
                  stepId: step.stepId,
                  existingSubTaskId: existingSubTask,
                  parentNoteId: taskId,
                  workflowStepNumber: step.workflowStepNumber,
                });
                break;
              }
              await this.notesService.createNote({
                title: step.title,
                content: result.content,
                source: NoteSource.CONVERSATION,
                noteType: NoteType.TASK,
                status: NoteStatus.READY_FOR_REVIEW,
                userId,
                tenantId,
                conversationId,
                conceptId: step.conceptId,
                parentNoteId: taskId,
                expectedOutcome: step.description?.substring(0, 2000),
                workflowStepNumber: step.workflowStepNumber,
              });
              break;
            }
          } catch (err) {
            this.logger.warn({
              message: 'Failed to create sub-task note',
              stepId: step.stepId,
              error: err instanceof Error ? err.message : 'Unknown',
            });
          }
        }
      } catch (error) {
        this.logger.error({
          message: 'Step execution failed',
          stepId: step.stepId,
          error: error instanceof Error ? error.message : 'Unknown',
        });
        step.status = 'failed';
        callbacks.onStepFailed(step.stepId, error instanceof Error ? error.message : 'Step failed');
      }
    }

    // Mark original tasks as completed
    for (const taskId of plan.taskIds) {
      try {
        await this.notesService.updateStatus(taskId, NoteStatus.COMPLETED, tenantId);
        this.logger.log({ message: 'Task marked COMPLETED', taskId, tenantId });
      } catch (error) {
        // Fallback: try direct DB update bypassing tenant check
        this.logger.error({
          message: 'Failed to mark task complete via service, trying direct update',
          taskId,
          tenantId,
          error: error instanceof Error ? error.message : 'Unknown',
        });
        try {
          await this.prisma.note.update({
            where: { id: taskId },
            data: { status: NoteStatus.COMPLETED },
          });
          this.logger.log({ message: 'Task marked COMPLETED via direct update', taskId });
        } catch (directError) {
          this.logger.error({
            message: 'Direct task update also failed',
            taskId,
            error: directError instanceof Error ? directError.message : 'Unknown',
          });
        }
      }
    }

    // Story 3.2: Discover related concepts and create new pending tasks
    const completedConceptIds = [
      ...new Set(plan.steps.filter((s) => s.status === 'completed').map((s) => s.conceptId)),
    ];
    if (completedConceptIds.length > 0) {
      this.discoverAndCreatePendingTasks(completedConceptIds, userId, tenantId)
        .then((newConceptIds) => {
          if (newConceptIds.length > 0 && callbacks.onTasksDiscovered) {
            callbacks.onTasksDiscovered(newConceptIds);
          }
        })
        .catch((err) => {
          this.logger.warn({
            message: 'Post-execution discovery failed',
            planId,
            error: err instanceof Error ? err.message : 'Unknown',
          });
        });
    }

    plan.status = 'completed';
    callbacks.onComplete('completed', completedCount, plan.steps.length);

    this.eventBus.emit(APP_EVENTS.WORKFLOW_COMPLETED, {
      tenantId,
      planId,
      userId,
      status: 'completed',
      completedSteps: completedCount,
      totalSteps: plan.steps.length,
    });

    this.scheduledCleanup(planId);
  }

  /**
   * Executes a single plan step by calling the LLM with Qdrant-driven concept knowledge.
   * Queries embeddings to find relevant concepts, loads full knowledge, and produces
   * actionable deliverables (not instructions). Citations come from known input concepts.
   */
  async executeStepAutonomous(
    step: ExecutionPlanStep,
    conversationId: string,
    userId: string,
    tenantId: string,
    onChunk: (chunk: string) => void,
    completedSummaries: Array<{ title: string; conceptName: string; summary: string }> = [],
    preloadedWorkflowSteps?: import('@mentor-ai/shared/types').WorkflowStep[],
    cachedContext?: {
      tenant: { name: string; industry: string | null; description: string | null } | null;
      brainContext: string;
    }
  ): Promise<{ content: string; citations: ConceptCitation[] }> {
    // Use preloaded steps when available (e.g., from parallel-popuni which generates
    // task-specific workflows that may differ from the cached generic workflow).
    // Fall back to loading/generating the workflow from cache.
    let workflowStep: import('@mentor-ai/shared/types').WorkflowStep | undefined;
    if (preloadedWorkflowSteps) {
      workflowStep = preloadedWorkflowSteps.find((s) => s.stepNumber === step.workflowStepNumber);
    }
    if (!workflowStep) {
      if (preloadedWorkflowSteps) {
        this.logger.warn({
          message: 'Preloaded workflow steps missing step number, falling back to cached workflow',
          stepNumber: step.workflowStepNumber,
          conceptId: step.conceptId,
          preloadedStepNumbers: preloadedWorkflowSteps.map((s) => s.stepNumber),
        });
      }
      const workflow = await this.getOrGenerateWorkflow(step.conceptId, tenantId, userId);
      workflowStep = workflow.steps.find((s) => s.stepNumber === step.workflowStepNumber);
    }

    if (!workflowStep) {
      throw new Error(
        `Workflow step ${step.workflowStepNumber} not found for concept ${step.conceptId}`
      );
    }

    // 1. Semantic search: find relevant concepts via Qdrant embeddings
    const searchText = `${step.title} ${step.description ?? ''} ${step.conceptName}`;
    const embeddingMatches = await this.conceptMatchingService
      .findRelevantConcepts(searchText, { limit: 5, threshold: 0.5 })
      .catch(() => [] as import('@mentor-ai/shared/types').ConceptMatch[]);

    // Collect: primary concept + all embedding matches
    const conceptIdsToLoad = new Set<string>([step.conceptId]);
    for (const m of embeddingMatches) {
      conceptIdsToLoad.add(m.conceptId);
    }

    // 2. Load ALL matched concepts and build rich knowledge block
    const loadedConcepts: import('@mentor-ai/shared/types').ConceptWithRelations[] = [];
    const citationCandidates: import('@mentor-ai/shared/types').ConceptMatch[] = [];
    let conceptKnowledge = '\n\n--- KNOWLEDGE BASE (use this for task execution) ---';

    for (const conceptId of conceptIdsToLoad) {
      try {
        const concept = await this.conceptService.findById(conceptId);
        loadedConcepts.push(concept);

        conceptKnowledge += `\n\nCONCEPT: ${concept.name} (${concept.category})`;
        conceptKnowledge += `\nDEFINITION: ${concept.definition}`;
        if (concept.extendedDescription) {
          conceptKnowledge += `\nDETAILED KNOWLEDGE: ${concept.extendedDescription}`;
        }
        if (concept.relatedConcepts && concept.relatedConcepts.length > 0) {
          const related = concept.relatedConcepts
            .slice(0, 5)
            .map((r) => `${r.concept.name} (${r.relationshipType})`)
            .join(', ');
          conceptKnowledge += `\nRELATED CONCEPTS: ${related}`;
        }

        citationCandidates.push({
          conceptId: concept.id,
          conceptName: concept.name,
          category: concept.category as import('@mentor-ai/shared/types').ConceptCategory,
          definition: concept.definition,
          score: embeddingMatches.find((m) => m.conceptId === concept.id)?.score ?? 0.8,
        });
      } catch {
        // Concept not found — skip
      }
    }
    conceptKnowledge += '\n--- END OF KNOWLEDGE BASE ---';

    // 3. Load business context (use cachedContext when available to avoid per-step DB lookups)
    const tenant =
      cachedContext?.tenant !== undefined
        ? cachedContext.tenant
        : await this.prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { name: true, industry: true, description: true },
          });
    let businessInfo = '';
    if (tenant) {
      businessInfo = `\n\n--- BUSINESS CONTEXT ---\nCompany: ${tenant.name}`;
      if (tenant.industry) businessInfo += `\nIndustry: ${tenant.industry}`;
      if (tenant.description) businessInfo += `\nDescription: ${tenant.description}`;
      businessInfo += '\n--- END OF BUSINESS CONTEXT ---';
    }

    // 3.2 Story 3.2: Load tenant-wide Business Brain context (all memories)
    let brainContext = '';
    if (cachedContext?.brainContext !== undefined) {
      brainContext = cachedContext.brainContext;
    } else {
      try {
        brainContext = await this.businessContextService.getBusinessContext(tenantId);
      } catch (err) {
        this.logger.warn({
          message: 'Business context load failed (non-blocking)',
          tenantId,
          error: err instanceof Error ? err.message : 'Unknown',
        });
      }
    }

    // 3.3 Load originating conversation messages for task-specific context
    let conversationContext = '';
    if (step.taskConversationId) {
      try {
        const recentMessages = await this.prisma.message.findMany({
          where: { conversationId: step.taskConversationId },
          orderBy: { createdAt: 'desc' },
          take: 10,
          select: { role: true, content: true },
        });
        if (recentMessages.length > 0) {
          conversationContext =
            '\n\n--- CONVERSATION CONTEXT (user request that triggered this task) ---';
          for (const msg of recentMessages.reverse()) {
            const role = msg.role === 'USER' ? 'USER' : 'AI';
            // Truncate long messages to keep prompt focused
            const content =
              msg.content.length > 500 ? msg.content.substring(0, 500) + '...' : msg.content;
            conversationContext += `\n${role}: ${content}`;
          }
          conversationContext += '\n--- END OF CONVERSATION CONTEXT ---';
        }
      } catch (err) {
        this.logger.warn({
          message: 'Failed to load conversation context for step (non-blocking)',
          stepId: step.stepId,
          conversationId: step.taskConversationId,
          error: err instanceof Error ? err.message : 'Unknown',
        });
      }
    }

    // 3.4 Build task-specific context from originating task
    let taskSpecificContext = '';
    if (step.taskTitle || step.taskContent) {
      taskSpecificContext = '\n\n--- SPECIFIC USER REQUEST ---';
      if (step.taskTitle) taskSpecificContext += `\nTASK: ${step.taskTitle}`;
      if (step.taskContent) taskSpecificContext += `\nDESCRIPTION: ${step.taskContent}`;
      taskSpecificContext +=
        '\nCRITICAL: Your response MUST be directly relevant to this specific user request. Do not create a generic analysis — focus on what the user asked for.';
      taskSpecificContext += '\n--- END OF SPECIFIC REQUEST ---';
    }

    // 3.5. Web search: enrich with real-time data (always when available)
    let webSearchContext = '';
    if (this.webSearchService.isAvailable()) {
      try {
        const searchQuery = this.buildSearchQuery(step, tenant);
        const enrichedResults = await this.webSearchService.searchAndExtract(searchQuery, 5);
        webSearchContext = this.webSearchService.formatSourcesAsObsidian(enrichedResults);
      } catch (err) {
        this.logger.warn({
          message: 'Web search failed (non-blocking)',
          stepId: step.stepId,
          error: err instanceof Error ? err.message : 'Unknown',
        });
      }
    }

    // 4. Build ACTIONABLE system prompt with anti-patterns and few-shot examples
    let systemPromptText = `You are an experienced business consultant who EXECUTES tasks for the client. You do NOT explain concepts and do NOT give instructions — you PRODUCE a concrete business document.

TASK: ${step.title}
EXPECTED OUTCOME: ${workflowStep.expectedOutcome}

RULES:
1. DO the work — do not describe how it is done. Produce the finished document.
2. Use CONCEPT KNOWLEDGE below as an analytical framework, but do NOT explain it to the user
3. Apply the analysis specifically to THIS business using the BUSINESS CONTEXT
4. Produce a complete, usable result the client can use immediately
5. When using concept knowledge, mark it as [[Concept Name]]
6. Be concrete — use the company name, industry, and specific situation
7. Structure with headings, tables, lists, and concrete recommendations
8. Respond EXCLUSIVELY in English

CONCEPT USAGE:
- Concepts below are your ANALYTICAL FRAMEWORK — not lessons to explain
- APPLY the concept to the concrete business: if the concept is "SWOT Analysis", do not explain what SWOT is — do the SWOT for this company
- If there are RELATED concepts, use them for supplementary depth of analysis
- Mark applied concepts with [[Concept Name]] so the user can trace the knowledge source
- Explain HOW the concept changes the analysis — not just that it was applied, but WHAT new it reveals

ANALYTICAL STANDARDS:
- Every finding MUST have a rationale — not just a claim. Instead of "Strong brand" → "Strong brand — because it has 45 years of tradition and exclusive contracts with 30+ restaurants"
- When applying an analytical framework, finish with STRATEGIC IMPLICATIONS — do not just list items
- Connect findings — if analysis shows a gap, the strategy must address that gap
- Recommendations must be PRIORITIZED — 3 critical recommendations at the top, others after
- Every document must end with CONCRETE next steps: who, what, when
- State KEY METRICS identified in this analysis (e.g., current margin, market size, conversion) — these are baseline values for future tracking
- Mark under which CONDITIONS this analysis should be redone (e.g., competitor price change, new market player, regulatory change)

OUTPUT FORMAT (markdown):
- Use ## for sections, ### for subsections
- Use > **Key Insight:** for the most important conclusions
- Use tables for all comparative and numerical data
- Use **bold** for key terms
- Use bullet lists for enumeration, NOT long paragraphs
- Minimum 800 words for analytical documents

DISTINGUISH TWO TYPES OF TASKS:
A) DIGITAL (content, plans, analyses, emails, campaigns, budgets, templates, procedures):
   → PRODUCE THE FINISHED RESULT. Do not give instructions — DO the work and present the finished document.
B) PHYSICAL (going somewhere, ordering, calls, installation, meetings):
   → DO NOT simulate having completed a physical action. Write WHO needs to do WHAT with all details.
   → Mark with "⚠ REQUIRES HUMAN ACTION:" before each step that AI cannot execute.

FORBIDDEN (never do this):
- DO NOT write "you should analyze..." or "it is recommended to consider..." for digital tasks
- DO NOT write "you need to consider..." or "think about the following..."
- DO NOT explain what a concept or framework is — APPLY it
- DO NOT give generic advice — give SPECIFIC findings for this company
- DO NOT describe steps the client should take for digital work — YOU execute them and present results
- DO NOT write introductions like "In this document we will..." — start with content immediately
- DO NOT fabricate data — if you don't have a concrete data point, indicate [TO BE FILLED: ...]

EXAMPLE OF GOOD RESPONSE (SWOT analysis for "LuxVino", luxury wines):
---
## SWOT Analysis — LuxVino

### Strengths
1. **Premium positioning** — hand-picked harvest and limited production [[Value Proposition]]
2. **45 years of family winemaking** — brand authenticity
3. **Exclusive contracts with 30+ restaurants** — stable B2B channel

### Weaknesses
1. **Only 2% of revenue from online channels** — missed digital audience
---

EXAMPLE OF BAD RESPONSE (FORBIDDEN):
---
"SWOT analysis is a strategic tool used to assess strengths, weaknesses, opportunities, and threats.
To apply it to your business, you should:
1. Identify your key strengths..."
---
This is FORBIDDEN because it explains the tool instead of applying it.${taskSpecificContext}${conversationContext}${conceptKnowledge}${businessInfo}${brainContext}${webSearchContext}`;

    if (step.departmentTag) {
      const personaPrompt = generateSystemPrompt(step.departmentTag);
      if (personaPrompt) {
        systemPromptText = `${systemPromptText}\n\n${personaPrompt}`;
      }
    }

    // Inject completed step summaries with explicit context-passing instructions
    if (completedSummaries.length > 0) {
      systemPromptText += '\n\n--- PREVIOUSLY COMPLETED STEPS ---';
      for (const prev of completedSummaries) {
        systemPromptText += `\nSTEP: ${prev.title} (${prev.conceptName})`;
        systemPromptText += `\nSUMMARY: ${prev.summary}`;
      }
      systemPromptText += '\n--- END OF COMPLETED STEPS ---';
      systemPromptText += `
USING PREVIOUS RESULTS:
- You MUST use findings from previous steps — do not repeat analysis that was already done
- Reference concrete data, names, numbers from previous steps
- If a previous step identifies a problem, your step must address that SPECIFIC problem
- If a previous step contains web search data, use those SPECIFIC sources and URLs
- NEVER repeat analyses or recommendations from previous steps — BUILD UPON them`;
    }

    // 4b. Maturity Engine: inject prerequisite concept outputs as context
    try {
      const tenantForStage = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { maturityStage: true },
      });
      if (tenantForStage?.maturityStage && step.conceptId) {
        const prereqs = await this.maturityEngine.checkPrerequisites(
          tenantId,
          step.conceptId,
          tenantForStage.maturityStage as import('@mentor-ai/shared/types').MaturityStage
        );
        if (prereqs.prerequisiteOutputs.length > 0) {
          systemPromptText += '\n\n--- PREREQUISITE CONCEPT RESULTS ---';
          for (const po of prereqs.prerequisiteOutputs) {
            systemPromptText += `\n### ${po.conceptName}\n${po.outputSummary}`;
          }
          systemPromptText += '\n--- END OF PREREQUISITE CONTEXT ---';
          systemPromptText += `\nUSE these findings as a FOUNDATION — do not repeat them, BUILD UPON them.`;
        }
      }
    } catch (err) {
      this.logger.warn({
        message: 'Prerequisite context injection failed (non-blocking)',
        conceptId: step.conceptId,
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }

    // 5. Build user prompt from template
    const prompt = workflowStep.promptTemplate
      .replace(/\{\{conceptName\}\}/g, step.conceptName)
      .replace(
        /\{\{businessContext\}\}/g,
        tenant
          ? `for the company "${tenant.name}" in the ${tenant.industry ?? 'general business'} industry`
          : 'for this business'
      );

    // 5b. Pre-execution prompt quality check
    let finalPrompt = prompt;
    try {
      const checkResult = await this.promptCheckerService.checkAndEnrichPrompt({
        userPrompt: prompt,
        originalAsk: [step.taskTitle, step.taskContent].filter(Boolean).join(' — '),
        businessInfo: {
          companyName: tenant?.name ?? undefined,
          industry: tenant?.industry ?? undefined,
          description: tenant?.description ?? undefined,
        },
        tenantId,
        userId,
        conversationId,
        conceptName: step.conceptName,
        stepTitle: step.title,
      });

      if (checkResult.enrichedPrompt) {
        finalPrompt = checkResult.enrichedPrompt;
      }

      this.logger.log({
        message: 'Prompt checker completed',
        stepId: step.stepId,
        verdict: checkResult.verdict,
        issueCount: checkResult.issues.length,
        issues: checkResult.issues.length > 0 ? checkResult.issues.map((i) => i.code) : [],
        cyclesUsed: checkResult.cyclesUsed,
        durationMs: checkResult.durationMs,
        enriched: !!checkResult.enrichedPrompt,
        warning: checkResult.warning,
      });
    } catch (err) {
      this.logger.warn({
        message: 'Prompt checker failed, proceeding with original prompt',
        stepId: step.stepId,
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }

    // 6. Stream AI response
    let fullContent = '';
    await this.aiGatewayService.streamCompletionWithContext(
      [{ role: 'user', content: finalPrompt } as ChatMessage],
      {
        tenantId,
        userId,
        conversationId,
        skipRateLimit: true,
        skipQuotaCheck: true,
        businessContext: systemPromptText,
      },
      (chunk: string) => {
        fullContent += chunk;
        onChunk(chunk);
      }
    );

    // 6b. Post-execution URL validation (non-blocking)
    try {
      const urlIssues = await this.promptCheckerService.validateUrls(fullContent);
      if (urlIssues.length > 0) {
        this.logger.warn({
          message: 'Unreachable URLs detected in LLM output',
          stepId: step.stepId,
          issues: urlIssues.map((i) => i.description),
        });
      }
    } catch {
      // URL validation failure is non-blocking
    }

    // 7. Inject citations from KNOWN input concepts (not post-hoc output scanning)
    let citations: ConceptCitation[] = [];
    let contentWithCitations = fullContent;
    if (citationCandidates.length > 0) {
      try {
        const citationResult = this.citationInjectorService.injectCitations(
          fullContent,
          citationCandidates
        );
        contentWithCitations = citationResult.content;
        citations = citationResult.citations;
      } catch {
        // Citation injection failed — return content without citations
      }
    }

    return { content: contentWithCitations, citations };
  }

  /**
   * Returns an active plan by ID (for metadata lookups).
   */
  getActivePlan(planId: string): ExecutionPlan | undefined {
    return this.activePlans.get(planId);
  }

  /**
   * Cancels a running plan.
   */
  cancelPlan(planId: string): boolean {
    if (this.activePlans.has(planId)) {
      this.cancellationTokens.set(planId, true);
      // Also resolve any pending step wait so the loop can exit
      const resolver = this.stepResolvers.get(planId);
      if (resolver) {
        resolver(undefined);
        this.stepResolvers.delete(planId);
      }
      return true;
    }
    return false;
  }

  /**
   * Continues a paused workflow after user confirmation.
   * Optionally accepts user input to inject as context for the next step.
   */
  continueStep(planId: string, userInput?: string): void {
    const resolver = this.stepResolvers.get(planId);
    if (resolver) {
      resolver(userInput);
    } else {
      this.logger.warn({ message: 'No step resolver found for plan', planId });
    }
  }

  /**
   * Builds an optimized search query from step context.
   * Leads with concept name, adds step keywords, company name, industry, and current year.
   * Note: Serbian concept names are passed as-is. A future enhancement could translate
   * key Serbian terms to English for improved Google search result quality.
   */
  buildSearchQuery(
    step: ExecutionPlanStep,
    tenant: { name?: string; industry?: string | null } | null
  ): string {
    const parts: string[] = [];

    // Lead with concept name words (most specific)
    if (step.conceptName) {
      parts.push(...step.conceptName.split(/\s+/).filter((w) => w.length > 0));
    }

    // Extract action keywords from step title (strip filler words)
    const fillerWords = new Set([
      'create',
      'a',
      'the',
      'draft',
      'build',
      'develop',
      'perform',
      'run',
      'kreiraj',
      'kreirajte',
      'izradi',
      'izradite',
      'napravi',
      'napravite',
      'izvrši',
      'izvršite',
      'uradi',
      'uradite',
      'analizirajte',
      'analiziraj',
      'definišite',
      'definiši',
      'razvijte',
      'razvij',
      'primenite',
      'primeni',
      'optimizujte',
      'optimizuj',
      'uspostavite',
      'uspostavi',
      'implementirajte',
      'mapirajte',
      'mapiraj',
      'za',
      'vaše',
      'vaš',
      'ovo',
    ]);
    const titleWords = step.title
      .split(/\s+/)
      .filter((w) => w.length > 2 && !fillerWords.has(w.toLowerCase()));
    parts.push(...titleWords.slice(0, 4));

    // Add company name and industry context
    if (tenant?.name) parts.push(tenant.name);
    if (tenant?.industry) parts.push(tenant.industry);

    // Append current year for temporal relevance
    parts.push(new Date().getFullYear().toString());

    // Deduplicate (case-insensitive) and limit to 12 words
    const seen = new Set<string>();
    const deduped = parts.filter((w) => {
      const lower = w.toLowerCase();
      if (seen.has(lower)) return false;
      seen.add(lower);
      return true;
    });

    return deduped.slice(0, 12).join(' ');
  }

  /**
   * @deprecated Use WebSearchService.formatSourcesAsObsidian() instead.
   * Kept as passthrough for test compatibility.
   */
  formatWebContext(results: EnrichedSearchResult[]): string {
    return this.webSearchService.formatSourcesAsObsidian(results);
  }

  /**
   * Story 3.2: Post-execution discovery hook.
   * Traverses relationship edges from completed concepts and creates new PENDING tasks
   * for the user, scoped to their visible categories.
   * Capped at 10 new tasks per execution to prevent explosion.
   */
  async discoverAndCreatePendingTasks(
    completedConceptIds: string[],
    userId: string,
    tenantId: string
  ): Promise<string[]> {
    const MAX_NEW_TASKS = 10;

    // Get user's department to scope discoveries
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { department: true, role: true },
    });
    const visibleCategories = getVisibleCategories(
      user?.department ?? null,
      user?.role ?? 'MEMBER'
    );

    // Load all outgoing relationships from completed concepts
    const relationships = await this.prisma.conceptRelationship.findMany({
      where: {
        sourceConceptId: { in: completedConceptIds },
      },
      include: {
        targetConcept: { select: { id: true, name: true, category: true } },
      },
    });

    if (relationships.length === 0) return [];

    // Get target concept IDs
    const targetConceptIds = relationships.map((r) => r.targetConcept.id);

    // Story 3.3 AC6: Single batch query for duplicate prevention
    // Covers both PENDING and COMPLETED task notes for this user
    const existingNotes = await this.prisma.note.findMany({
      where: {
        userId,
        tenantId,
        conceptId: { in: targetConceptIds },
        noteType: NoteType.TASK,
      },
      select: { conceptId: true },
    });

    const existingConceptIds = new Set(
      existingNotes.map((n) => n.conceptId).filter(Boolean) as string[]
    );

    // Filter to only new concepts within user's visible categories
    const newConcepts = relationships
      .map((r) => ({
        concept: r.targetConcept,
        relationshipType: r.relationshipType as 'PREREQUISITE' | 'RELATED' | 'ADVANCED',
      }))
      .filter((r) => !existingConceptIds.has(r.concept.id))
      // C8: Strip number prefix for category matching (DB has "3. Marketing", filter has "Marketing")
      .filter((r) => {
        if (!visibleCategories) return true;
        const stripped = r.concept.category.replace(/^\d+\.\s*/, '').trim();
        return (
          visibleCategories.includes(r.concept.category) || visibleCategories.includes(stripped)
        );
      });

    // Story 3.3 AC5: Relevance scoring — filter by business relevance
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { industry: true },
    });
    const tenantIndustry = tenant?.industry ?? '';
    const completedSet = new Set(completedConceptIds);
    const relevanceThreshold = this.conceptRelevanceService.getThreshold(user?.role ?? 'MEMBER');

    // Get categories of completed concepts for domain-specific prior activity scoring
    const completedConceptData = await this.prisma.concept.findMany({
      where: { id: { in: completedConceptIds } },
      select: { category: true },
    });
    const completedCategories = new Set(
      completedConceptData.map((c) => c.category.replace(/^\d+\.\s*/, '').trim())
    );

    const relevantConcepts = newConcepts.filter((r) => {
      const score = this.conceptRelevanceService.scoreRelevance({
        conceptCategory: r.concept.category,
        tenantIndustry,
        completedConceptIds: completedSet,
        completedCategories,
        department: user?.department ?? null,
        role: user?.role ?? 'MEMBER',
        relationshipType: r.relationshipType,
      });

      if (score < relevanceThreshold) {
        this.logger.log({
          message: 'Concept skipped — low relevance',
          conceptId: r.concept.id,
          conceptName: r.concept.name,
          score: score.toFixed(2),
          threshold: relevanceThreshold,
          category: r.concept.category,
        });
        return false;
      }
      return true;
    });

    // Deduplicate
    const uniqueNew = [...new Map(relevantConcepts.map((r) => [r.concept.id, r.concept])).values()];
    const toSeed = uniqueNew.slice(0, MAX_NEW_TASKS);

    if (toSeed.length === 0) return [];

    // Create PENDING task Notes
    const noteData = toSeed.map((concept) => ({
      id: `note_${createId()}`,
      title: concept.name,
      content: `Explore concept: ${concept.name}`,
      source: NoteSource.CONVERSATION,
      noteType: NoteType.TASK,
      status: NoteStatus.PENDING,
      conceptId: concept.id,
      userId,
      tenantId,
    }));

    await this.prisma.note.createMany({ data: noteData });

    // Maturity Engine: link discovered tasks to stage assignments
    try {
      const tasksWithConcepts = noteData
        .filter((n) => n.conceptId)
        .map((n) => ({ noteId: n.id, conceptId: n.conceptId! }));
      if (tasksWithConcepts.length > 0) {
        await this.maturityEngine.linkDiscoveredTasksToStage(tenantId, tasksWithConcepts);
      }
    } catch (err) {
      this.logger.warn({
        message: 'Maturity stage linking failed (non-blocking)',
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }

    const newConceptIds = toSeed.map((c) => c.id);

    this.logger.log({
      message: 'Post-execution discovery: new pending tasks created',
      userId,
      tenantId,
      completedConceptIds,
      newTaskCount: noteData.length,
      newConceptNames: toSeed.map((c) => c.name),
    });

    return newConceptIds;
  }

  private scheduledCleanup(planId: string): void {
    setTimeout(() => {
      this.activePlans.delete(planId);
      this.cancellationTokens.delete(planId);
      this.stepResolvers.delete(planId);
    }, 30000);
  }
}
