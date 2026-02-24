import { Injectable, Logger } from '@nestjs/common';
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
import { generateSystemPrompt } from '../personas/templates/persona-prompts';
import { getVisibleCategories } from '../knowledge/config/department-categories';

const MAX_RECURSION_DEPTH = 10;

const WORKFLOW_GENERATION_SYSTEM_PROMPT = `Ti si dizajner poslovnih radnih tokova. Kreiraj strukturirane, sekvencijalne radne tokove gde svaki korak PROIZVODI konkretan poslovni dokument.

Svaki radni tok mora:
1. Početi sa analizom/procenom pre strateških preporuka
2. Uključiti promptove koji instruiraju AI da IZVRŠI posao i PROIZVEDE rezultate
3. Svaki korak proizvodi upotrebljiv izlaz (analizu, plan, matricu, strategiju, profil, itd.)
4. Koristiti odgovarajući departmanski okvir kada je departmentTag specificiran

KRITIČNO za promptTemplate polje:
- Prompt MORA instruirati AI da URADI posao, NE da objašnjava korisniku kako da ga uradi
- Prompt je INTERNI — korisnik ga NIKADA ne vidi. Korisnik vidi samo proizveden dokument.
- UVEK koristi imperativne glagole: "Izvrši", "Kreiraj", "Analiziraj", "Razvij", "Mapiraj", "Proizvedi"
- NIKADA ne koristi: "Objasnite", "Razmotrite", "Trebalo bi da", "Preporučuje se"

Primer DOBAR promptTemplate: "Izvrši kompletnu SWOT analizu za {{businessContext}} koristeći {{conceptName}} framework. Proizvedi strukturiranu matricu sa specifičnim nalazima za svaku kategoriju. Minimum 3 stavke po kategoriji sa konkretnim obrazloženjem."
Primer LOŠ promptTemplate: "Objasnite šta je SWOT analiza i kako je primeniti na poslovanje"

VAŽNO: Sav tekst MORA biti na SRPSKOM JEZIKU.
Vrati SAMO validan JSON niz bez markdown formatiranja.`;

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
    private readonly conceptRelevanceService: ConceptRelevanceService
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

    // Gather prerequisite names
    const prerequisites = concept.relatedConcepts
      .filter((r) => r.relationshipType === 'PREREQUISITE' && r.direction === 'outgoing')
      .map((r) => r.concept.name);

    const prompt = this.buildGenerationPrompt(
      concept.name,
      concept.definition,
      concept.extendedDescription,
      prerequisites,
      concept.departmentTags
    );

    // LLM call to generate workflow steps
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

  private buildGenerationPrompt(
    name: string,
    definition: string,
    extendedDescription: string | undefined,
    prerequisites: string[],
    departmentTags: string[]
  ): string {
    return `Generiši radni tok za IZVRŠAVANJE poslovne analize i PROIZVODNJU rezultata koristeći koncept "${name}".

Definicija: ${definition}
${extendedDescription ? `Prošireni opis: ${extendedDescription}` : ''}
${prerequisites.length > 0 ? `Preduslovi: ${prerequisites.join(', ')}` : 'Nema preduslova.'}
${departmentTags.length > 0 ? `Relevantni departmani: ${departmentTags.join(', ')}` : ''}

Vrati JSON niz koraka. Svaki korak mora imati:
- stepNumber (celobrojna vrednost počevši od 1)
- title (koncizan naslov akcije, max 60 karaktera, na srpskom)
- description (šta ovaj korak postiže, max 200 karaktera, na srpskom)
- promptTemplate (INTERNI prompt koji instruiše AI da IZVRŠI korak i PROIZVEDE konkretan rezultat — NE da objašnjava kako se radi. Koristi akcione glagole: "Izvrši", "Kreiraj", "Analiziraj", "Mapiraj". NIKADA "Objasnite" ili "Trebalo bi". MORA sadržati {{conceptName}} i {{businessContext}} placeholdere)
- expectedOutcome (konkretan deliverable, max 100 karaktera, na srpskom)
- estimatedMinutes (celobrojna vrednost)
- departmentTag (opciono: "CFO", "CMO", "CTO", "OPERATIONS", "LEGAL", "CREATIVE")

Generiši 3-6 koraka. Poredaj od procene/analize ka strateškim preporukama.`;
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
          `Perform a comprehensive analysis of "{{conceptName}}" applied specifically to this business. {{businessContext}}. Produce a structured deliverable with concrete findings and recommendations.`,
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
          title: 'Apply concept to business',
          description: 'Perform analysis using this concept for the specific business',
          promptTemplate:
            'Apply the "{{conceptName}}" framework to this specific business. {{businessContext}}. Produce a structured analysis with actionable recommendations.',
          expectedOutcome: 'Concrete analysis deliverable with recommendations',
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

    const allIds = new Set(conceptIds);
    const graph = new Map<string, string[]>();

    // Build adjacency: for each concept, find its prerequisites within our set
    for (const id of conceptIds) {
      try {
        const concept = await this.conceptService.findById(id);
        const prereqs = concept.relatedConcepts
          .filter(
            (r) =>
              r.relationshipType === 'PREREQUISITE' &&
              r.direction === 'outgoing' &&
              allIds.has(r.concept.id)
          )
          .map((r) => r.concept.id);
        graph.set(id, prereqs);
      } catch {
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

    // Collect concept IDs from explicit task links + semantic search (parallel)
    const conceptIdSet = new Set<string>();
    for (const task of tasks) {
      if (task.conceptId) {
        conceptIdSet.add(task.conceptId);
      }
    }
    // Run semantic searches in parallel
    const searchPromises = tasks
      .map((task) => {
        const searchText = `${task.title} ${task.content ?? ''}`.trim();
        if (searchText.length <= 5) return null;
        return this.conceptMatchingService
          .findRelevantConcepts(searchText, { limit: 3, threshold: 0.3 })
          .catch(() => [] as { conceptId: string }[]);
      })
      .filter(Boolean);
    const searchResults = await Promise.all(searchPromises);
    for (const matches of searchResults) {
      for (const m of matches!) {
        conceptIdSet.add(m.conceptId);
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
        'Nema relevantnih koncepata za odabrane zadatke. Proverite da li su koncepti učitani u bazu znanja.'
      );
    }

    // Resolve ordering
    const orderedConceptIds = await this.resolveConceptOrder(conceptIds);

    // Generate/load workflows in parallel (cached = instant, uncached = LLM call)
    const workflows = await Promise.all(
      orderedConceptIds.map(async (conceptId) => ({
        conceptId,
        workflow: await this.getOrGenerateWorkflow(conceptId, tenantId, userId),
      }))
    );

    const planSteps: ExecutionPlanStep[] = [];
    for (const { conceptId, workflow } of workflows) {
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
          title: 'Korisnički odgovor',
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
          summary: result.content.substring(0, 300),
        });
        callbacks.onStepComplete(step.stepId, result.content, result.citations);

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
                expectedOutcome: step.description?.substring(0, 500),
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
      } catch (error) {
        this.logger.warn({
          message: 'Failed to mark task complete',
          taskId,
          error: error instanceof Error ? error.message : 'Unknown',
        });
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
    completedSummaries: Array<{ title: string; conceptName: string; summary: string }> = []
  ): Promise<{ content: string; citations: ConceptCitation[] }> {
    // Load the workflow to get the prompt template
    const workflow = await this.getOrGenerateWorkflow(step.conceptId, tenantId, userId);
    const workflowStep = workflow.steps.find((s) => s.stepNumber === step.workflowStepNumber);

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
    let conceptKnowledge = '\n\n--- CONCEPT KNOWLEDGE (use this to perform the task) ---';

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
            .slice(0, 3)
            .map((r) => `${r.concept.name} (${r.relationshipType})`)
            .join(', ');
          conceptKnowledge += `\nRELATED: ${related}`;
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
    conceptKnowledge += '\n--- END CONCEPT KNOWLEDGE ---';

    // 3. Load business context
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, industry: true, description: true },
    });
    let businessInfo = '';
    if (tenant) {
      businessInfo = `\n\n--- BUSINESS CONTEXT ---\nCompany: ${tenant.name}`;
      if (tenant.industry) businessInfo += `\nIndustry: ${tenant.industry}`;
      if (tenant.description) businessInfo += `\nDescription: ${tenant.description}`;
      businessInfo += '\n--- END BUSINESS CONTEXT ---';
    }

    // 3.2 Story 3.2: Load tenant-wide Business Brain context (all memories)
    let brainContext = '';
    try {
      brainContext = await this.businessContextService.getBusinessContext(tenantId);
    } catch (err) {
      this.logger.warn({
        message: 'Business context load failed (non-blocking)',
        tenantId,
        error: err instanceof Error ? err.message : 'Unknown',
      });
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
    let systemPromptText = `Ti si iskusan poslovni konsultant koji IZVRŠAVA zadatke za klijenta. NE objašnjavaš koncepte i NE daješ uputstva — ti PROIZVODIŠ konkretan poslovni dokument.

ZADATAK: ${step.title}
OČEKIVANI REZULTAT: ${workflowStep.expectedOutcome}

PRAVILA:
1. URADI posao — nemoj opisivati kako se radi. Proizvedi gotov dokument.
2. Koristi ZNANJE O KONCEPTIMA ispod kao analitički okvir, ali ga NE objašnjavaj korisniku
3. Primeni analizu specifično na OVO poslovanje koristeći POSLOVNI KONTEKST
4. Proizvedi kompletan, upotrebljiv rezultat koji klijent može odmah koristiti
5. Kada koristiš znanje iz koncepta, označi ga kao [[Naziv Koncepta]]
6. Budi konkretan — koristi ime kompanije, industriju i specifičnu situaciju
7. Strukturiraj sa zaglavljima, tabelama, nabrajanjima i konkretnim preporukama
8. Odgovaraj ISKLJUČIVO na srpskom jeziku

ZABRANJENO (nikada ne radi ovo):
- NE piši "trebalo bi da analizirate..." ili "preporučuje se da razmotrite..."
- NE piši "potrebno je da razmotrite..." ili "razmislite o sledećem..."
- NE objašnjavaj šta je koncept ili framework — PRIMENI ga
- NE daj generičke savete — daj SPECIFIČNE nalaze za ovu kompaniju
- NE opisuj korake koje klijent treba da preduzme — TI ih preduzmi i predstavi rezultate
- NE piši uvode tipa "U ovom dokumentu ćemo..." — odmah počni sa sadržajem

PRIMER DOBROG ODGOVORA (SWOT analiza za "LuxVino", luksuzna vina):
---
## SWOT Analiza — LuxVino

### Snage
1. **Premium pozicioniranje** — ručna berba i ograničena proizvodnja [[Value Proposition]]
2. **45 godina porodičnog vinogradarstva** — autentičnost brenda
3. **Ekskluzivni ugovori sa 30+ restorana** — stabilan B2B kanal

### Slabosti
1. **Samo 2% prihoda iz online kanala** — propuštena digitalna publika
---

PRIMER LOŠEG ODGOVORA (ZABRANJENO):
---
"SWOT analiza je strateški alat koji se koristi za procenu snaga, slabosti, prilika i pretnji.
Da biste je primenili na vaše poslovanje, trebalo bi da:
1. Identifikujete vaše ključne snage..."
---
Ovo je ZABRANJENO jer objašnjava alat umesto da ga primeni.${conceptKnowledge}${businessInfo}${brainContext}${webSearchContext}`;

    if (step.departmentTag) {
      const personaPrompt = generateSystemPrompt(step.departmentTag);
      if (personaPrompt) {
        systemPromptText = `${systemPromptText}\n\n${personaPrompt}`;
      }
    }

    // Inject completed step summaries to prevent repetition
    if (completedSummaries.length > 0) {
      systemPromptText += '\n\n--- VEĆ ZAVRŠENI KORACI (NE PONAVLJAJ) ---';
      for (const prev of completedSummaries) {
        systemPromptText += `\nKORAK: ${prev.title} (${prev.conceptName})`;
        systemPromptText += `\nREZIME: ${prev.summary}`;
      }
      systemPromptText += '\n--- KRAJ ZAVRŠENIH KORAKA ---';
      systemPromptText +=
        '\nKRITIČNO: NE ponavljaj analize ili preporuke iz prethodnih koraka. Nadogradi na njima i fokusiraj se SAMO na nove uvide specifične za trenutni zadatak.';
    }

    // 5. Build user prompt from template
    const prompt = workflowStep.promptTemplate
      .replace(/\{\{conceptName\}\}/g, step.conceptName)
      .replace(
        /\{\{businessContext\}\}/g,
        tenant ? `for ${tenant.name} (${tenant.industry ?? 'business'})` : 'for this business'
      );

    // 6. Stream AI response
    let fullContent = '';
    await this.aiGatewayService.streamCompletionWithContext(
      [{ role: 'user', content: prompt } as ChatMessage],
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
      'izradi',
      'napravi',
      'izvrši',
      'uradi',
      'za',
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
  private async discoverAndCreatePendingTasks(
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
      .filter((r) => !visibleCategories || visibleCategories.includes(r.concept.category));

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
      content: `Istraži koncept: ${concept.name}`,
      source: NoteSource.CONVERSATION,
      noteType: NoteType.TASK,
      status: NoteStatus.PENDING,
      conceptId: concept.id,
      userId,
      tenantId,
    }));

    await this.prisma.note.createMany({ data: noteData });

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
