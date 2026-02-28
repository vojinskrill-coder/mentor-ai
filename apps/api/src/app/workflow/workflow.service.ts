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

const WORKFLOW_GENERATION_SYSTEM_PROMPT = `Ti si iskusan dizajner poslovnih radnih tokova za srpska preduzeća. Kreiraj strukturirane, sekvencijalne radne tokove gde svaki korak PROIZVODI konkretan poslovni dokument.

Svaki radni tok mora:
1. Početi sa dijagnostikom/procenom pre strateških preporuka — NIKADA ne preskoči analizu trenutnog stanja
2. Uključiti promptove koji instruiraju AI da IZVRŠI posao i PROIZVEDE rezultate — NE da objašnjava korisniku
3. Svaki korak proizvodi upotrebljiv izlaz (analizu, plan, matricu, strategiju, profil, itd.)
4. Koristiti odgovarajući departmanski okvir kada je departmentTag specificiran
5. Biti SPECIFIČAN za datu kompaniju i industriju — NE generički

KRITIČNO za promptTemplate polje:
- Prompt MORA instruirati AI da URADI posao, NE da objašnjava korisniku kako da ga uradi
- Prompt je INTERNI — korisnik ga NIKADA ne vidi. Korisnik vidi samo proizveden dokument.
- UVEK koristi imperativne glagole: "Izvrši", "Kreiraj", "Analiziraj", "Razvij", "Mapiraj", "Proizvedi"
- NIKADA ne koristi: "Objasnite", "Razmotrite", "Trebalo bi da", "Preporučuje se"
- UVEK koristi placeholder {{businessContext}} za ime kompanije i industrije
- UVEK koristi placeholder {{conceptName}} za naziv koncepta
- SVAKI prompt MORA tražiti minimum 800 reči izlaza sa strukturiranim zaglavljima i konkretnim primerima

Primer DOBAR promptTemplate:
"Izvrši kompletnu SWOT analizu za {{businessContext}} koristeći {{conceptName}} framework. Proizvedi strukturiranu matricu sa minimum 5 stavki po kategoriji. Za svaku stavku napiši: nalaz, dokaz/obrazloženje, preporuka za akciju. Koristi tabele gde je moguće. Minimum 1000 reči."

Primer LOŠ promptTemplate:
"Objasnite šta je SWOT analiza i kako je primeniti na poslovanje"

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
    // Load concept name if available
    let conceptName = 'Poslovni zadatak';
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
            '\n\nKONVERZACIJA KORISNIKA (ovo je kontekst iz kojeg je nastao zadatak):';
          for (const msg of messages.reverse()) {
            const role = msg.role === 'USER' ? 'KORISNIK' : 'AI';
            const content =
              msg.content.length > 1000 ? msg.content.substring(0, 1000) + '...' : msg.content;
            conversationContext += `\n${role}: ${content}`;
          }
        }
      } catch {
        /* conversation not found */
      }
    }

    const prompt = `Generiši radni tok za IZVRŠAVANJE konkretnog poslovnog zadatka.

ZADATAK: ${task.title}
${task.content ? `OPIS ZADATKA: ${task.content}` : ''}${conceptContext}${conversationContext}

KRITIČNO: Koraci MORAJU biti direktno povezani sa ZADATKOM iznad i sa KONVERZACIJOM korisnika.
NE generiši generičke korake za koncept. Generiši korake koji rešavaju KONKRETAN problem korisnika.

Vrati JSON niz koraka. Svaki korak mora imati:
- stepNumber (celobrojna vrednost počevši od 1)
- title (koncizan naslov akcije, max 60 karaktera, na srpskom)
- description (šta ovaj korak postiže, max 200 karaktera, na srpskom)
- promptTemplate (INTERNI prompt koji instruiše AI da IZVRŠI korak. Koristi {{conceptName}} i {{businessContext}} placeholdere. Akcioni glagoli: "Izvrši", "Kreiraj", "Analiziraj". NIKADA "Objasnite" ili "Trebalo bi".)
- expectedOutcome (konkretan deliverable, max 100 karaktera, na srpskom)
- estimatedMinutes (celobrojna vrednost)
- departmentTag (opciono: "CFO", "CMO", "CTO", "OPERATIONS", "LEGAL", "CREATIVE")

Generiši 3-6 koraka. Poredaj logički prema zadatku.`;

    let responseContent = '';
    await this.aiGatewayService.streamCompletionWithContext(
      [
        { role: 'system', content: WORKFLOW_GENERATION_SYSTEM_PROMPT } as ChatMessage,
        { role: 'user', content: prompt } as ChatMessage,
      ],
      { tenantId, userId, skipRateLimit: true, skipQuotaCheck: true },
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
    let prompt = `Generiši radni tok za IZVRŠAVANJE poslovne analize i PROIZVODNJU konkretnih rezultata koristeći koncept "${name}".

--- KONCEPT ---
Naziv: ${name}
Definicija: ${definition}
${extendedDescription ? `Prošireni opis: ${extendedDescription}` : ''}
${prerequisites.length > 0 ? `Preduslovi (koncept se gradi na njima): ${prerequisites.join(', ')}` : 'Nema preduslova — ovo je fundamentalni koncept.'}
${relatedConcepts && relatedConcepts.length > 0 ? `Povezani koncepti: ${relatedConcepts.join(', ')}` : ''}
${departmentTags.length > 0 ? `Relevantni departmani: ${departmentTags.join(', ')}` : ''}`;

    if (tenant) {
      prompt += `

--- POSLOVNI KONTEKST ---
Kompanija: ${tenant.name ?? 'Nepoznata'}
Industrija: ${tenant.industry ?? 'Opšta'}
${tenant.description ? `Opis: ${tenant.description}` : ''}
KRITIČNO: Koraci MORAJU biti prilagođeni ovoj kompaniji i industriji. NE generiši generičke korake.`;
    }

    prompt += `

--- FORMAT ODGOVORA ---
Vrati JSON niz koraka. Svaki korak mora imati:
- stepNumber (celobrojna vrednost počevši od 1)
- title (koncizan naslov akcije, max 60 karaktera, na srpskom, akcioni glagol: "Analizirajte...", "Kreirajte...", "Mapirajte...")
- description (šta ovaj korak postiže i ZAŠTO je važan, max 200 karaktera, na srpskom)
- promptTemplate (INTERNI prompt koji instruiše AI da IZVRŠI korak i PROIZVEDE konkretan dokument. Mora sadržati {{conceptName}} i {{businessContext}} placeholdere. Zahtevaj minimum 800 reči izlaza, strukturu sa zaglavljima, tabele gde je moguće, konkretne primere i preporuke.)
- expectedOutcome (konkretan deliverable koji klijent može odmah koristiti, max 100 karaktera, na srpskom)
- estimatedMinutes (celobrojna vrednost, realna procena)
- departmentTag (opciono: "CFO", "CMO", "CTO", "OPERATIONS", "LEGAL", "CREATIVE")

Generiši 4-6 koraka. Redosled:
1. Dijagnostika/analiza trenutnog stanja
2. Istraživanje tržišta/konkurencije (ako je relevantno)
3. Strateško planiranje
4. Akcioni plan sa konkretnim koracima
5. KPI i sistem merenja (ako je relevantno)
6. Implementacioni roadmap`;

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
          `Izvrši sveobuhvatnu analizu koncepta "{{conceptName}}" primenjenu na {{businessContext}}. Proizvedi strukturiran dokument sa konkretnim nalazima, tabelarnim prikazom i akcionim preporukama. Minimum 800 reči.`,
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
          title: 'Analizirajte trenutno stanje',
          description: 'Dijagnostika i analiza primenom ovog koncepta na konkretno poslovanje',
          promptTemplate:
            'Izvrši detaljnu analizu koncepta "{{conceptName}}" primenjenu na {{businessContext}}. Dijagnostikuj trenutno stanje, identifikuj ključne oblasti za poboljšanje. Proizvedi strukturiran dokument sa zaglavljima, tabelama i konkretnim preporukama za akciju. Minimum 1000 reči.',
          expectedOutcome: 'Kompletan analitički izveštaj sa akcionim preporukama',
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
        'Nema relevantnih koncepata za odabrane zadatke. Proverite da li su koncepti učitani u bazu znanja.'
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
          summary: result.content.substring(0, 2000),
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
    let conceptKnowledge = '\n\n--- BAZA ZNANJA (koristi ovo za izradu zadatka) ---';

    for (const conceptId of conceptIdsToLoad) {
      try {
        const concept = await this.conceptService.findById(conceptId);
        loadedConcepts.push(concept);

        conceptKnowledge += `\n\nKONCEPT: ${concept.name} (${concept.category})`;
        conceptKnowledge += `\nDEFINICIJA: ${concept.definition}`;
        if (concept.extendedDescription) {
          conceptKnowledge += `\nDETALJNO ZNANJE: ${concept.extendedDescription}`;
        }
        if (concept.relatedConcepts && concept.relatedConcepts.length > 0) {
          const related = concept.relatedConcepts
            .slice(0, 5)
            .map((r) => `${r.concept.name} (${r.relationshipType})`)
            .join(', ');
          conceptKnowledge += `\nPOVEZANI KONCEPTI: ${related}`;
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
    conceptKnowledge += '\n--- KRAJ BAZE ZNANJA ---';

    // 3. Load business context
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, industry: true, description: true },
    });
    let businessInfo = '';
    if (tenant) {
      businessInfo = `\n\n--- POSLOVNI KONTEKST ---\nKompanija: ${tenant.name}`;
      if (tenant.industry) businessInfo += `\nIndustrija: ${tenant.industry}`;
      if (tenant.description) businessInfo += `\nOpis: ${tenant.description}`;
      businessInfo += '\n--- KRAJ POSLOVNOG KONTEKSTA ---';
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
            '\n\n--- KONTEKST KONVERZACIJE (korisnikov zahtev koji je pokrenuo ovaj zadatak) ---';
          for (const msg of recentMessages.reverse()) {
            const role = msg.role === 'USER' ? 'KORISNIK' : 'AI';
            // Truncate long messages to keep prompt focused
            const content =
              msg.content.length > 500 ? msg.content.substring(0, 500) + '...' : msg.content;
            conversationContext += `\n${role}: ${content}`;
          }
          conversationContext += '\n--- KRAJ KONTEKSTA KONVERZACIJE ---';
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
      taskSpecificContext = '\n\n--- SPECIFIČAN ZAHTEV KORISNIKA ---';
      if (step.taskTitle) taskSpecificContext += `\nZADATAK: ${step.taskTitle}`;
      if (step.taskContent) taskSpecificContext += `\nOPIS: ${step.taskContent}`;
      taskSpecificContext +=
        '\nKRITIČNO: Tvoj odgovor MORA biti direktno relevantan za ovaj konkretan zahtev korisnika. Ne pravi generičku analizu — fokusiraj se na ono što je korisnik tražio.';
      taskSpecificContext += '\n--- KRAJ SPECIFIČNOG ZAHTEVA ---';
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

RAZLIKUJ DVA TIPA ZADATAKA:
A) DIGITALNI (sadržaj, planovi, analize, mejlovi, kampanje, budžeti, šabloni, procedure):
   → PROIZVEDI GOTOV REZULTAT. Ne daj instrukcije — URADI posao i prikaži gotov dokument.
B) FIZIČKI (odlazak negde, naručivanje, pozivi, instalacija, sastanci):
   → NE simuliraj da si obavio fizičku radnju. Napiši KO treba ŠTA da uradi sa svim detaljima.
   → Označi sa "⚠ ZAHTEVA LJUDSKU AKCIJU:" ispred svakog koraka koji AI ne može izvršiti.

ZABRANJENO (nikada ne radi ovo):
- NE piši "trebalo bi da analizirate..." ili "preporučuje se da razmotrite..." za digitalne zadatke
- NE piši "potrebno je da razmotrite..." ili "razmislite o sledećem..."
- NE objašnjavaj šta je koncept ili framework — PRIMENI ga
- NE daj generičke savete — daj SPECIFIČNE nalaze za ovu kompaniju
- NE opisuj korake koje klijent treba da preduzme za digitalni rad — TI ih izvrši i predstavi rezultate
- NE piši uvode tipa "U ovom dokumentu ćemo..." — odmah počni sa sadržajem
- NE izmišljaj podatke — ako nemaš konkretan podatak, naznači [POPUNITI: ...]

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
Ovo je ZABRANJENO jer objašnjava alat umesto da ga primeni.${taskSpecificContext}${conversationContext}${conceptKnowledge}${businessInfo}${brainContext}${webSearchContext}`;

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
        tenant
          ? `za kompaniju "${tenant.name}" u industriji ${tenant.industry ?? 'opšte poslovanje'}`
          : 'za ovo poslovanje'
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
