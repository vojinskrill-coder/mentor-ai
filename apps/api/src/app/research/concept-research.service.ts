import { Injectable, Logger } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { NoteSource, NoteType, NoteStatus } from '@mentor-ai/shared/prisma';
import type {
  ConceptMatch,
  EnrichedSearchResult,
  MemoryAttribution,
} from '@mentor-ai/shared/types';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import { ConceptService } from '../knowledge/services/concept.service';
import { ConceptMatchingService } from '../knowledge/services/concept-matching.service';
import { BusinessContextService } from '../knowledge/services/business-context.service';
import { ConceptExtractionService } from '../knowledge/services/concept-extraction.service';
import { MemoryContextBuilderService } from '../memory/services/memory-context-builder.service';
import { MemoryExtractionService } from '../memory/services/memory-extraction.service';
import { WebSearchService } from '../web-search/web-search.service';
import { NotesService } from '../notes/notes.service';

import type {
  ConceptResearchInput,
  ConceptResearchResult,
  ConceptResearchSummary,
  CreatedTaskInfo,
  ResearchProgressCallbacks,
} from './concept-research.types';

const SUMMARY_TRUNCATE_LENGTH = 300;

@Injectable()
export class ConceptResearchService {
  private readonly logger = new Logger(ConceptResearchService.name);

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly aiGatewayService: AiGatewayService,
    private readonly conceptService: ConceptService,
    private readonly conceptMatchingService: ConceptMatchingService,
    private readonly businessContextService: BusinessContextService,
    private readonly memoryContextBuilder: MemoryContextBuilderService,
    private readonly memoryExtractionService: MemoryExtractionService,
    private readonly conceptExtractionService: ConceptExtractionService,
    private readonly webSearchService: WebSearchService,
    private readonly notesService: NotesService
  ) {}

  /**
   * Conducts multi-turn AI research on a concept, then extracts actionable tasks.
   * This is the core research method used by both YOLO mode and (optionally) manual chat.
   *
   * Flow:
   * 1. Load concept details
   * 2. Ensure conversation exists (dedup by conceptId + userId)
   * 3. Run 2-3 AI conversation turns with full enrichment
   * 4. Extract tasks from the final turn's output
   * 5. Fire-and-forget post-processing (memory + concept extraction)
   */
  async researchConcept(
    input: ConceptResearchInput,
    callbacks?: ResearchProgressCallbacks
  ): Promise<ConceptResearchResult> {
    const turnCount = input.turnCount ?? 3;

    // 1. Load concept
    const concept = await this.conceptService.findById(input.conceptId);

    this.logger.log({
      message: 'Starting concept research',
      conceptId: input.conceptId,
      conceptName: concept.name,
      turnCount,
      tenantId: input.tenantId,
    });

    // 2. Ensure conversation exists (dedup: check for existing conceptId + userId)
    let conversationId = input.conversationId;
    if (!conversationId) {
      const existing = await this.prisma.conversation.findFirst({
        where: {
          conceptId: input.conceptId,
          userId: input.userId,
        },
        select: { id: true },
      });

      if (existing) {
        conversationId = existing.id;
      } else {
        const newConv = await this.prisma.conversation.create({
          data: {
            id: `sess_${createId()}`,
            userId: input.userId,
            title: concept.name,
            conceptId: input.conceptId,
          },
        });
        conversationId = newConv.id;
      }
    }

    // 3. Build turn prompts
    const prompts = this.buildTurnPrompts(concept.name, turnCount);

    // 4. Execute turns sequentially
    const conversationMessages: Array<{ role: string; content: string }> = [];
    let lastAiResponse = '';
    let fullyCompleted = true;
    let failureReason: string | undefined;

    // Load existing messages for context (in case conversation already has history)
    const existingMessages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      select: { role: true, content: true },
    });
    for (const msg of existingMessages) {
      conversationMessages.push({
        role: msg.role.toLowerCase(),
        content: msg.content,
      });
    }

    for (let i = 0; i < prompts.length; i++) {
      const turnPrompt = prompts[i]!;
      try {
        // 4a. Build enrichment context
        callbacks?.onTurnProgress?.({
          conceptId: input.conceptId,
          conceptName: concept.name,
          turnIndex: i,
          totalTurns: prompts.length,
          phase: 'enrichment',
        });

        const enrichedContext = await this.buildEnrichmentContext(
          turnPrompt,
          input.tenantId,
          input.userId,
          input.conceptId,
          concept.name,
          input.webSearchEnabled ?? true,
          input.priorResearchSummaries,
          input.alreadyCreatedTaskTitles
        );

        // 4b. Save user message to DB
        await this.prisma.message.create({
          data: {
            id: `msg_${createId()}`,
            conversationId,
            role: 'USER',
            content: turnPrompt,
          },
        });
        conversationMessages.push({ role: 'user', content: turnPrompt });

        // 4c. Stream AI response
        callbacks?.onTurnProgress?.({
          conceptId: input.conceptId,
          conceptName: concept.name,
          turnIndex: i,
          totalTurns: prompts.length,
          phase: 'generating',
        });

        let fullContent = '';
        await this.aiGatewayService.streamCompletionWithContext(
          conversationMessages.map((m) => ({
            role: m.role as 'user' | 'assistant' | 'system',
            content: m.content,
          })),
          {
            tenantId: input.tenantId,
            userId: input.userId,
            conversationId,
            personaType: input.personaType,
            skipRateLimit: true,
            skipQuotaCheck: true,
            businessContext: enrichedContext,
          },
          (chunk: string) => {
            fullContent += chunk;
          }
        );

        // 4d. Save AI message to DB
        await this.prisma.message.create({
          data: {
            id: `msg_${createId()}`,
            conversationId,
            role: 'ASSISTANT',
            content: fullContent,
          },
        });
        conversationMessages.push({ role: 'assistant', content: fullContent });
        lastAiResponse = fullContent;

        // 4e. Update conversation timestamp
        await this.prisma.conversation.update({
          where: { id: conversationId },
          data: { updatedAt: new Date() },
        });

        this.logger.log({
          message: 'Research turn completed',
          conceptId: input.conceptId,
          turnIndex: i,
          responseLength: fullContent.length,
        });
      } catch (error) {
        fullyCompleted = false;
        failureReason = error instanceof Error ? error.message : 'Unknown error';
        this.logger.warn({
          message: 'Research turn failed',
          turnIndex: i,
          conceptId: input.conceptId,
          error: failureReason,
        });
        break;
      }
    }

    // 5. Task extraction from the last completed turn
    let createdTasks: CreatedTaskInfo[] = [];
    if (lastAiResponse) {
      try {
        callbacks?.onTurnProgress?.({
          conceptId: input.conceptId,
          conceptName: concept.name,
          turnIndex: prompts.length - 1,
          totalTurns: prompts.length,
          phase: 'post-processing',
        });

        createdTasks = await this.extractAndCreateTasks(
          lastAiResponse,
          input.tenantId,
          input.userId,
          conversationId,
          input.conceptId,
          input.alreadyCreatedTaskTitles
        );
        callbacks?.onTasksCreated?.(createdTasks);
      } catch (err) {
        this.logger.warn({
          message: 'Task extraction failed',
          conceptId: input.conceptId,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    // 6. Build summary for cross-concept injection
    const summary: ConceptResearchSummary = {
      conceptId: input.conceptId,
      conceptName: concept.name,
      category: concept.category,
      keySummary: lastAiResponse ? lastAiResponse.substring(0, SUMMARY_TRUNCATE_LENGTH) : '',
      taskTitles: createdTasks.map((t) => t.title),
    };

    // 7. Fire-and-forget post-processing
    if (lastAiResponse && conversationMessages.length >= 2) {
      // Memory extraction
      const messagesForExtraction = conversationMessages.map((m, idx) => ({
        id: `msg_research_${idx}`,
        conversationId,
        role: m.role.toUpperCase() as 'USER' | 'ASSISTANT',
        content: m.content,
        confidenceScore: null,
        confidenceFactors: null,
        createdAt: new Date().toISOString(),
      }));
      this.memoryExtractionService
        .extractMemories(messagesForExtraction as any, input.userId, input.tenantId, {
          conceptName: concept.name,
        })
        .catch((err) => {
          this.logger.debug({
            message: 'Memory extraction failed (non-critical)',
            error: err instanceof Error ? err.message : 'Unknown',
          });
        });

      // Concept extraction
      const allAiContent = conversationMessages
        .filter((m) => m.role === 'assistant')
        .map((m) => m.content)
        .join('\n\n');
      this.conceptExtractionService
        .extractAndCreateConcepts(allAiContent, {
          conversationId,
          conceptId: input.conceptId,
        })
        .catch((err) => {
          this.logger.debug({
            message: 'Concept extraction failed (non-critical)',
            error: err instanceof Error ? err.message : 'Unknown',
          });
        });
    }

    this.logger.log({
      message: 'Concept research completed',
      conceptId: input.conceptId,
      conceptName: concept.name,
      fullyCompleted,
      tasksCreated: createdTasks.length,
      turnsCompleted: fullyCompleted ? turnCount : 'partial',
    });

    return {
      conceptId: input.conceptId,
      conceptName: concept.name,
      conversationId,
      researchOutput: lastAiResponse,
      createdTasks,
      summary,
      fullyCompleted,
      failureReason,
    };
  }

  // ─── Private Helpers ─────────────────────────────────────────

  /**
   * Builds 2-3 turn prompts for researching a concept (Serbian).
   */
  private buildTurnPrompts(conceptName: string, turnCount: number): string[] {
    const prompts: string[] = [];

    // Turn 1: Situational analysis
    prompts.push(
      `Analiziraj koncept "${conceptName}" u kontekstu mog poslovanja.\n` +
        'Odgovori na sledeća pitanja:\n' +
        '1. Kako se ovaj koncept trenutno primenjuje (ili ne primenjuje) u mom poslovanju?\n' +
        '2. Koji su ključni izazovi vezani za ovaj koncept u mojoj industriji?\n' +
        '3. Koje prilike za poboljšanje postoje?\n' +
        'Budi specifičan — koristi podatke o mojoj kompaniji i industriji iz konteksta.'
    );

    // Turn 2: Strategic recommendations
    prompts.push(
      `Na osnovu prethodne analize, predloži 3-5 konkretnih, izvršivih koraka za primenu koncepta "${conceptName}".\n` +
        'Za svaki korak navedi:\n' +
        '- Konkretan opis akcije\n' +
        '- Očekivani rezultat i metriku uspeha\n' +
        '- Vremenski okvir (kratkoročno/srednjoročno/dugoročno)\n' +
        '- Potrebne resurse\n' +
        'Budi veoma konkretan i prilagodi preporuke mom poslovanju.'
    );

    if (turnCount >= 3) {
      // Turn 3: Implementation prioritization
      prompts.push(
        'Prioritizuj predložene korake po hitnosti i poslovnom uticaju.\n' +
          'Za top 3 prioriteta:\n' +
          '1. Napravi mini-plan akcije sa prvim konkretnim korakom\n' +
          '2. Identifikuj potencijalne prepreke i kako ih prevazići\n' +
          '3. Predloži KPI za merenje napretka\n' +
          'Fokusiraj se na ono što mogu da započnem odmah.'
      );
    }

    return prompts.slice(0, turnCount);
  }

  /**
   * Builds the enriched system prompt context, mirroring the gateway's enrichment pipeline.
   * Includes: business context, business brain memories, concept knowledge, user memories,
   * web search results, and cross-concept awareness injection.
   */
  private async buildEnrichmentContext(
    query: string,
    tenantId: string,
    userId: string,
    conceptId: string,
    conceptName: string,
    webSearchEnabled: boolean,
    priorResearchSummaries?: ConceptResearchSummary[],
    alreadyCreatedTaskTitles?: string[]
  ): Promise<string> {
    // Parallel enrichment (same as gateway handleMessage lines 659-685)
    const shouldSearch = webSearchEnabled && this.webSearchService.isAvailable();
    const [
      relevantConcepts,
      memoryContext,
      webSearchResults,
      businessBrainContext,
      tenant,
      onboardingNote,
    ] = await Promise.all([
      this.conceptMatchingService
        .findRelevantConcepts(query, { limit: 5, threshold: 0.5 })
        .catch(() => [] as ConceptMatch[]),
      this.memoryContextBuilder.buildContext(query, userId, tenantId).catch(() => ({
        context: '',
        attributions: [] as MemoryAttribution[],
        estimatedTokens: 0,
      })),
      shouldSearch
        ? this.webSearchService.searchAndExtract(query, 3).catch(() => [] as EnrichedSearchResult[])
        : Promise.resolve([] as EnrichedSearchResult[]),
      this.businessContextService.getBusinessContext(tenantId).catch(() => ''),
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, industry: true, description: true },
      }),
      this.notesService
        .getLatestNoteBySource(userId, tenantId, NoteSource.ONBOARDING)
        .catch(() => null),
    ]);

    // Build context string (same structure as gateway buildBusinessContext + enrichment)
    let enrichedContext = '--- POSLOVNI KONTEKST ---\n';
    if (tenant) {
      enrichedContext += `Kompanija: ${tenant.name}`;
      if (tenant.industry) enrichedContext += ` | Industrija: ${tenant.industry}`;
      enrichedContext += '\n';
      if (tenant.description) enrichedContext += `Opis: ${tenant.description}\n`;
    }
    if (onboardingNote?.content) {
      enrichedContext += `\nPoslovna analiza:\n${onboardingNote.content}\n`;
    }
    enrichedContext += '--- KRAJ POSLOVNOG KONTEKSTA ---\n';
    enrichedContext +=
      'Koristi ovaj poslovni kontekst za personalizaciju odgovora. Odgovaraj ISKLJUČIVO na srpskom jeziku.\n';

    // Feature awareness capabilities
    enrichedContext += '\n--- TVOJE MOGUĆNOSTI ---\n';
    enrichedContext += 'Možeš da:\n';
    enrichedContext += '- Pretražuješ web za najnovije informacije, podatke i trendove\n';
    enrichedContext += '- Kreiraš konkretne zadatke i planove akcije za poslovne koncepte\n';
    enrichedContext += '- Analiziraš i oceniš rezultate rada i dobiješ AI score\n';
    enrichedContext += '- Povežeš teme sa relevantnim poslovnim konceptima iz baze znanja\n';
    enrichedContext += '- Generišeš workflow korake za izvršavanje složenih zadataka\n';
    enrichedContext +=
      'Kada korisnik traži nešto što zahteva ove mogućnosti, koristi ih proaktivno.\n';
    enrichedContext += '--- KRAJ MOGUĆNOSTI ---\n';

    // Business brain memories
    if (businessBrainContext) {
      enrichedContext += '\n' + businessBrainContext;
    }

    // Cross-concept awareness: inject prior research summaries
    if (priorResearchSummaries && priorResearchSummaries.length > 0) {
      enrichedContext += '\n\n--- PRETHODNO ISTRAŽENI KONCEPTI (NE PONAVLJAJ) ---\n';
      for (const prior of priorResearchSummaries.slice(-15)) {
        enrichedContext += `KONCEPT: ${prior.conceptName} (${prior.category})\n`;
        enrichedContext += `REZIME: ${prior.keySummary}\n`;
        if (prior.taskTitles.length > 0) {
          enrichedContext += `KREIRANI ZADACI: ${prior.taskTitles.join(', ')}\n`;
        }
        enrichedContext += '\n';
      }
      enrichedContext += '--- KRAJ PRETHODNIH ISTRAŽIVANJA ---\n';
      enrichedContext +=
        'KRITIČNO: NE ponavljaj analize iz prethodnih istraživanja. Fokusiraj se na NOVE uvide specifične za trenutni koncept.\n';
    }

    // Already-created task titles for dedup awareness
    if (alreadyCreatedTaskTitles && alreadyCreatedTaskTitles.length > 0) {
      enrichedContext += '\n--- VEĆ KREIRANI ZADACI (NE DUPLIRAJ) ---\n';
      enrichedContext += alreadyCreatedTaskTitles.join(', ') + '\n';
      enrichedContext += '--- KRAJ LISTE ZADATAKA ---\n';
    }

    // Curriculum concept knowledge
    if (relevantConcepts.length > 0) {
      enrichedContext += '\n\n--- BAZA ZNANJA ---\n';
      for (const rc of relevantConcepts.slice(0, 5)) {
        enrichedContext += `\nKONCEPT: ${rc.conceptName}\n`;
        enrichedContext += `DEFINICIJA: ${rc.definition}\n`;
        try {
          const full = await this.conceptService.findById(rc.conceptId);
          if (full.extendedDescription) {
            enrichedContext += `DETALJNO: ${full.extendedDescription}\n`;
          }
        } catch {
          /* skip if concept not found */
        }
      }
      enrichedContext += '--- KRAJ BAZE ZNANJA ---\n';
      enrichedContext +=
        'Primeni ove koncepte u odgovoru. Kada referenciraš koncept, koristi [[Naziv Koncepta]] oznaku.\n';
    }

    // Memory context
    if (memoryContext.context) {
      enrichedContext = this.memoryContextBuilder.injectIntoSystemPrompt(
        enrichedContext,
        memoryContext
      );
    }

    // Web search results
    if (webSearchResults.length > 0) {
      enrichedContext += this.webSearchService.formatSourcesAsObsidian(webSearchResults);
    }

    return enrichedContext;
  }

  /**
   * Extracts structured tasks from AI research output and creates PENDING notes.
   * Mirrors gateway's detectAndCreateExplicitTasks logic (lines 1254-1455).
   * Does NOT call triggerAutoAiPopuni — callers handle that separately.
   */
  private async extractAndCreateTasks(
    aiResponse: string,
    tenantId: string,
    userId: string,
    conversationId: string,
    primaryConceptId: string,
    alreadyCreatedTaskTitles?: string[]
  ): Promise<CreatedTaskInfo[]> {
    // Use LLM to extract structured tasks from the AI response
    const extractPrompt = `Na osnovu sledećeg AI odgovora, ekstrahuj konkretne zadatke kao JSON niz.
Svaki zadatak mora imati "title" (kratak, max 80 karaktera) i "content" (opis, max 500 karaktera).
Izdvoji samo konkretne, izvršive stavke — ne opšte observacije.

AI ODGOVOR:
${aiResponse}

Odgovori SAMO sa validnim JSON nizom: [{"title":"...","content":"..."}]
Ako nema zadataka, odgovori sa: []`;

    let extractedContent = '';
    await this.aiGatewayService.streamCompletionWithContext(
      [{ role: 'user', content: extractPrompt }],
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
        message: 'No JSON array in research task extraction',
        conversationId,
        extractedContent: extractedContent.substring(0, 500),
      });
      return [];
    }

    let tasks: Array<{ title: string; content: string }>;
    try {
      tasks = JSON.parse(jsonMatch[0]) as Array<{ title: string; content: string }>;
    } catch (parseErr) {
      this.logger.warn({
        message: 'Failed to parse task JSON from research extraction',
        conversationId,
        error: parseErr instanceof Error ? parseErr.message : 'Unknown',
      });
      return [];
    }
    if (!Array.isArray(tasks) || tasks.length === 0) return [];

    const createdTasks: CreatedTaskInfo[] = [];
    const alreadyTitles = new Set((alreadyCreatedTaskTitles ?? []).map((t) => t.toLowerCase()));

    for (const task of tasks.slice(0, 10)) {
      if (!task.title) continue;

      // Skip if title was already created in this session
      if (alreadyTitles.has(task.title.toLowerCase())) {
        this.logger.debug({
          message: 'Skipping task — already created in session',
          title: task.title,
        });
        continue;
      }

      // Find best concept match for this task
      let taskConceptId: string | undefined = primaryConceptId;
      let taskConceptName: string | null = null;
      let taskConversationId = conversationId;

      try {
        const conceptMatches = await this.conceptMatchingService.findRelevantConcepts(
          `${task.title}. ${task.content ?? ''}`,
          { limit: 1, threshold: 0.6 }
        );

        if (conceptMatches.length > 0 && conceptMatches[0]) {
          const bestMatch = conceptMatches[0];
          taskConceptId = bestMatch.conceptId;
          taskConceptName = bestMatch.conceptName;

          // Cross-concept: create new conversation if task maps to a different concept
          if (taskConceptId !== primaryConceptId) {
            this.logger.log({
              message: 'Cross-concept task detected during research',
              taskTitle: task.title,
              primaryConceptId,
              targetConceptId: taskConceptId,
            });

            // Check for existing conversation for the target concept
            const existingConv = await this.prisma.conversation.findFirst({
              where: { conceptId: taskConceptId, userId },
              select: { id: true },
            });

            if (existingConv) {
              taskConversationId = existingConv.id;
            } else {
              const newConv = await this.prisma.conversation.create({
                data: {
                  id: `sess_${createId()}`,
                  userId,
                  title: task.title,
                  conceptId: taskConceptId,
                },
              });
              taskConversationId = newConv.id;
            }
          }
        } else {
          taskConceptId = primaryConceptId;
        }
      } catch {
        taskConceptId = primaryConceptId;
      }

      // Resolve concept name if we don't have it yet
      if (!taskConceptName && taskConceptId) {
        try {
          const conceptMap = await this.conceptService.findByIds([taskConceptId]);
          const info = conceptMap.get(taskConceptId);
          if (info) taskConceptName = info.name;
        } catch {
          /* ignore */
        }
      }

      // Tenant-wide dedup: check by conceptId AND title
      const existingId = await this.notesService.findExistingTask(tenantId, {
        conceptId: taskConceptId,
        title: task.title,
      });
      if (existingId) {
        this.logger.debug({
          message: 'Skipping duplicate research task',
          title: task.title,
          existingId,
          tenantId,
        });
        continue;
      }

      const result = await this.notesService.createNote({
        title: task.title,
        content: task.content ?? '',
        source: NoteSource.CONVERSATION,
        noteType: NoteType.TASK,
        status: NoteStatus.PENDING,
        conversationId: taskConversationId,
        conceptId: taskConceptId,
        userId,
        tenantId,
      });

      createdTasks.push({
        id: result.id,
        title: task.title,
        conceptId: taskConceptId ?? null,
        conceptName: taskConceptName,
        conversationId: taskConversationId,
      });

      // Track for session-level dedup
      alreadyTitles.add(task.title.toLowerCase());
    }

    this.logger.log({
      message: 'Research task extraction completed',
      conversationId,
      tasksExtracted: tasks.length,
      tasksCreated: createdTasks.length,
    });

    return createdTasks;
  }
}
