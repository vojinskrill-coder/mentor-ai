import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { createId } from '@paralleldrive/cuid2';
import {
  AgentExecutionResponse,
  AgentExecutionStatus,
  AgentEnrichmentEntry,
  AgentType,
  ConceptMatch,
} from '@mentor-ai/shared/types';
import { NoteSource, NoteType, NoteStatus } from '@mentor-ai/shared/prisma';
import { OpenClawClientService } from './openclaw-client.service';
import { AgentPromptService } from './agent-prompt.service';
import { AgentRegistryService } from './agent-registry.service';
import { BudgetService } from './budget.service';
import { AgentExecutionEventBus } from './agent-execution-event-bus.service';
import { NotesService } from '../notes/notes.service';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import { AppEventBus, APP_EVENTS } from '../events/app-event-bus.service';
import { CitationInjectorService } from '../knowledge/services/citation-injector.service';
import { WebSearchService } from '../web-search/web-search.service';
import { ConfigService } from '@nestjs/config';
// WS events go through AppEventBus → event handlers → WsServerHolder

@Injectable()
export class AgentExecutionService {
  private readonly logger = new Logger(AgentExecutionService.name);
  // With STAGE_MAX_CONCURRENCY=5 and 2-4 agent jobs per task, peak is 10-20.
  // Each job uses a unique session-id, so no OpenClaw lock contention.
  // This limit prevents runaway execution, not lock issues.
  private readonly MAX_CONCURRENT_PER_TENANT = 50;

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly openClawClient: OpenClawClientService,
    private readonly agentPrompt: AgentPromptService,
    private readonly registry: AgentRegistryService,
    private readonly budgetService: BudgetService,
    private readonly eventBus: AgentExecutionEventBus,
    private readonly notesService: NotesService,
    private readonly aiGateway: AiGatewayService,
    private readonly appEventBus: AppEventBus,
    private readonly citationInjector: CitationInjectorService,
    private readonly webSearchService: WebSearchService,
    private readonly configService: ConfigService,
  ) {
    this.geminiApiKey = this.configService.get<string>('GEMINI_API_KEY') ?? '';
  }

  private readonly geminiApiKey: string;

  private emitAgentEvent(tenantId: string, eventName: string, payload: unknown): void {
    this.eventBus.emit({ tenantId, eventName, payload });
  }

  private startHeartbeat(
    executionId: string,
    jobId: string | null,
    agentType: string,
    tenantId: string,
    startTime: number
  ): ReturnType<typeof setInterval> {
    return setInterval(() => {
      this.emitAgentEvent(tenantId, 'agent:executing-heartbeat', {
        executionId,
        jobId,
        elapsedMs: Date.now() - startTime,
        agentType,
      });
    }, 5000);
  }

  async triggerAgent(
    noteId: string,
    agentType: AgentType,
    userId: string,
    tenantId: string
  ): Promise<{ executionId: string }> {
    // Validate agent type
    const agentDef = this.registry.getAgent(agentType);

    // Verify note
    const note = await this.prisma.note.findFirst({
      where: { id: noteId, tenantId },
    });

    if (!note) {
      throw new NotFoundException(`Note ${noteId} not found`);
    }

    if (!note.userReport) {
      throw new BadRequestException('Task has no completed report');
    }

    // Check OpenClaw config
    if (!this.openClawClient.isConfigured()) {
      throw new BadRequestException('Agent execution is not configured');
    }

    // Check for existing active execution on this note+agentType
    const existingActive = await this.prisma.agentExecution.findFirst({
      where: {
        noteId,
        tenantId,
        agentType,
        status: { in: ['PENDING', 'FORMATTING', 'EXECUTING'] },
      },
    });

    if (existingActive) {
      throw new BadRequestException(`${agentDef.label} is already in progress for this task`);
    }

    // Check budget
    const canSpend = await this.budgetService.canSpend(tenantId);
    if (!canSpend) {
      throw new ForbiddenException('Daily budget exceeded');
    }

    // Check concurrency via DB count (safe across multiple instances)
    const activeCount = await this.prisma.agentExecution.count({
      where: {
        tenantId,
        status: { in: ['PENDING', 'FORMATTING', 'EXECUTING'] },
      },
    });
    if (activeCount >= this.MAX_CONCURRENT_PER_TENANT) {
      throw new BadRequestException(
        `Maximum ${this.MAX_CONCURRENT_PER_TENANT} concurrent agent executions`
      );
    }

    // Create execution record + reserve budget
    const executionId = `agx_${createId()}`;
    const estimatedCost = agentDef.estimatedCostEur;

    await this.prisma.agentExecution.create({
      data: {
        id: executionId,
        tenantId,
        userId,
        noteId,
        status: 'PENDING',
        agentType,
        estimatedCostEur: estimatedCost,
      },
    });

    await this.budgetService.recordSpend(tenantId, estimatedCost);

    this.logger.log({
      message: 'Agent triggered',
      executionId,
      noteId,
      agentType,
      userId,
      tenantId,
      reservedCostEur: estimatedCost,
    });

    // Fire-and-forget async pipeline
    this.executeAgentPipeline(executionId, agentType, note, userId, tenantId, estimatedCost).catch(
      (err) => {
        this.logger.error({
          message: 'Agent pipeline failed unexpectedly',
          executionId,
          agentType,
          error: err.message,
        });
      }
    );

    return { executionId };
  }

  private async executeAgentPipeline(
    executionId: string,
    agentType: AgentType,
    note: {
      id: string;
      title: string;
      content: string;
      userReport: string | null;
      expectedOutcome: string | null;
      conceptId?: string | null;
      conversationId?: string | null;
    },
    userId: string,
    tenantId: string,
    reservedCostEur: number
  ): Promise<void> {
    const openClawAgentId = this.registry.getOpenClawAgentId(agentType);

    const agentLabel = this.registry.getAgent(agentType).label;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let chunkIndex = 0;

    try {
      // Emit concept activity for graph visualization
      if (note.conceptId) {
        this.emitAgentEvent(tenantId, 'agent:concept-activity', {
          agentType, conceptId: note.conceptId, status: 'started',
        });
      }

      // Step 1: Format task into agent-specific instruction
      await this.updateStatus(executionId, 'FORMATTING');
      this.emitAgentEvent(tenantId, 'agent:status-change', {
        executionId, jobId: null, noteId: note.id, agentType, status: 'FORMATTING',
        label: `${agentLabel}: Priprema instrukcija...`,
      });

      const formattedPrompt = await this.agentPrompt.formatPrompt({
        agentType,
        taskTitle: note.title,
        taskContent: note.content,
        userReport: note.userReport!,
        expectedOutcome: note.expectedOutcome,
        tenantId,
        userId,
        onChunk: (chunk) => {
          this.emitAgentEvent(tenantId, 'agent:formatting-chunk', {
            executionId, jobId: null, chunk, index: chunkIndex++,
          });
        },
      });

      this.emitAgentEvent(tenantId, 'agent:formatting-complete', {
        executionId, jobId: null, promptLength: formattedPrompt.length,
      });

      await this.prisma.agentExecution.update({
        where: { id: executionId },
        data: { formattedPrompt },
      });

      // Step 2: Send to OpenClaw with the correct agent
      await this.updateStatus(executionId, 'EXECUTING', { startedAt: new Date() });
      this.emitAgentEvent(tenantId, 'agent:status-change', {
        executionId, jobId: null, noteId: note.id, agentType, status: 'EXECUTING',
        label: `${agentLabel}: Agent istražuje...`,
      });
      heartbeat = this.startHeartbeat(executionId, null, agentType, tenantId, Date.now());

      // Use unique session-id for parallel execution safety
      const workSessionId = `work-${executionId}-${openClawAgentId}`;
      const result = await this.openClawClient.executeAgent(formattedPrompt, {
        agentId: openClawAgentId,
        sessionId: workSessionId,
        tenantProfile: tenantId,
        onText: (text) => {
          this.emitAgentEvent(tenantId, 'agent:text-chunk', {
            executionId, jobId: null, text,
          });
        },
        onTool: (tool, status, query) => {
          this.emitAgentEvent(tenantId, 'agent:tool-event', {
            executionId, jobId: null, tool, status, query,
          });
        },
        onStatus: (phase) => {
          this.emitAgentEvent(tenantId, 'agent:status-change', {
            executionId, jobId: null, noteId: note.id, agentType, status: 'EXECUTING',
            label: `${agentLabel}: ${phase === 'running' ? 'Agent istražuje...' : phase}`,
          });
        },
      });

      clearInterval(heartbeat);
      heartbeat = null;

      if (!result.success) {
        const errorMsg = result.error ?? 'Agent execution failed';
        await this.updateStatus(executionId, 'FAILED', {
          error: errorMsg,
          completedAt: new Date(),
          durationMs: result.durationMs,
        });
        this.emitAgentEvent(tenantId, 'agent:status-change', {
          executionId, jobId: null, noteId: note.id, agentType, status: 'FAILED',
          label: `${agentLabel}: Greška`,
        });
        this.emitAgentEvent(tenantId, 'agent:error', {
          executionId, jobId: null, agentType, error: errorMsg,
        });
        return;
      }

      // Step 3: Store results in Note.agentEnrichments JSON (atomic merge)
      await this.mergeEnrichment(note.id, agentType, {
        executionId,
        status: AgentExecutionStatus.COMPLETED,
        result: result.output,
        completedAt: new Date().toISOString(),
        error: null,
      });

      // Step 3b: Persist agent output as reviewable child note (Sprint 2 Epic 2.3)
      const resultNoteId = await this.createResultNote(
        result.output, agentLabel, note, userId, tenantId, executionId
      );

      // Step 4: Calculate cost and adjust budget
      const actualCost = this.estimateActualCost(result.usage);
      const costDifference = actualCost - reservedCostEur;
      if (Math.abs(costDifference) > 0.0001) {
        await this.budgetService.recordSpend(tenantId, costDifference);
      }

      // Step 5: Mark completed + link result note (guard: don't overwrite if manually stopped)
      const currentExec = await this.prisma.agentExecution.findUnique({ where: { id: executionId }, select: { status: true } });
      if (currentExec?.status !== 'FAILED') {
        await this.prisma.agentExecution.update({
          where: { id: executionId },
          data: {
            status: 'COMPLETED',
            agentOutput: result.output,
            actualCostEur: actualCost,
            completedAt: new Date(),
            durationMs: result.durationMs,
            resultNoteId,
          },
        });

        this.emitAgentEvent(tenantId, 'agent:status-change', {
          executionId, jobId: null, noteId: note.id, agentType, status: 'COMPLETED',
          label: `${agentLabel}: Završeno`,
        });
      }
      this.emitAgentEvent(tenantId, 'agent:result', {
        executionId, jobId: null, agentType,
        output: result.output, durationMs: result.durationMs,
      });

      this.logger.log({
        message: 'Agent execution completed',
        executionId,
        agentType,
        durationMs: result.durationMs,
        actualCostEur: actualCost,
      });

      // Stop concept activity for graph visualization
      if (note.conceptId) {
        this.emitAgentEvent(tenantId, 'agent:concept-activity', {
          agentType, conceptId: note.conceptId, status: 'stopped',
        });
      }
    } catch (err) {
      if (heartbeat) clearInterval(heartbeat);

      // Stop concept activity on failure too
      if (note.conceptId) {
        this.emitAgentEvent(tenantId, 'agent:concept-activity', {
          agentType, conceptId: note.conceptId, status: 'stopped',
        });
      }

      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error({
        message: 'Agent pipeline error',
        executionId,
        agentType,
        error: errorMessage,
      });

      this.emitAgentEvent(tenantId, 'agent:status-change', {
        executionId, jobId: null, noteId: note.id, agentType, status: 'FAILED',
        label: `${agentLabel}: Greška`,
      });
      this.emitAgentEvent(tenantId, 'agent:error', {
        executionId, jobId: null, agentType, error: errorMessage,
      });

      // Store error in enrichments too (atomic merge — safe under concurrency)
      try {
        await this.mergeEnrichment(note.id, agentType, {
          executionId,
          status: AgentExecutionStatus.FAILED,
          result: null,
          completedAt: new Date().toISOString(),
          error: errorMessage,
        });
      } catch {
        /* best-effort */
      }

      await this.updateStatus(executionId, 'FAILED', {
        error: errorMessage,
        completedAt: new Date(),
      });
    }
  }

  private async updateStatus(
    executionId: string,
    status: string,
    extra?: Record<string, unknown>
  ): Promise<void> {
    await this.prisma.agentExecution.update({
      where: { id: executionId },
      data: { status, ...extra },
    });
  }

  /**
   * Atomically merges an enrichment entry into Note.agentEnrichments JSON
   * using PostgreSQL jsonb || operator. Prevents race conditions when
   * multiple agents write to the same note concurrently.
   *
   * NOTE: Uses raw SQL intentionally to get atomic JSONB merge semantics.
   * This bypasses Prisma middleware (logging, hooks, @updatedAt).
   * We manually set updated_at to compensate.
   */
  private async mergeEnrichment(
    noteId: string,
    agentType: string,
    entry: AgentEnrichmentEntry
  ): Promise<void> {
    const patch = JSON.stringify({ [agentType]: entry });
    await this.prisma.$executeRaw`
      UPDATE notes
      SET agent_enrichments = COALESCE(agent_enrichments, '{}'::jsonb) || ${patch}::jsonb,
          updated_at = NOW()
      WHERE id = ${noteId}
    `;
  }

  /**
   * Hybrid search pipeline: Gemini Flash generates search queries from the domain agent's
   * formatted prompt, then Serper API fetches real data. Returns formatted research block.
   *
   * Flow: domain prompt → Gemini extracts queries → Serper searches → formatted results
   */
  private async generateSearchAndEnrich(
    formattedPrompt: string,
    agentLabel: string,
    taskTitle: string,
  ): Promise<string> {
    if (!this.geminiApiKey || !this.webSearchService.isAvailable()) {
      this.logger.warn({ message: 'Search enrichment skipped — Gemini or Serper not configured' });
      return '';
    }

    try {
      // Step 1: Gemini Flash extracts 3-5 precise English search queries from domain prompt
      const queryGenPrompt = `You are a search query generator. Read the domain agent instruction below and generate 3-5 precise English search queries that will find the EXACT data this agent needs.

RULES:
- Queries MUST be in English (Google works best with English)
- Each query should target SPECIFIC data: benchmarks, statistics, case studies, pricing, competitor info
- Include the company industry context (luxury sculptures, bronze/marble, SE Europe)
- Be precise — "luxury sculpture market size 2024 EUR" not "sculpture market"
- Output ONLY a JSON array of strings, nothing else

DOMAIN AGENT INSTRUCTION:
${formattedPrompt.substring(0, 3000)}

Output format: ["query 1", "query 2", "query 3"]`;

      const geminiResponse = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.geminiApiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: queryGenPrompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 5000 },
          }),
          signal: AbortSignal.timeout(15_000),
        },
      );

      if (!geminiResponse.ok) {
        this.logger.warn({ message: 'Gemini Flash query generation failed', status: geminiResponse.status });
        return '';
      }

      const geminiData = await geminiResponse.json() as any;
      const queryText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const queryMatch = queryText.match(/\[[\s\S]*\]/);
      if (!queryMatch) {
        this.logger.warn({ message: 'No JSON array in Gemini response', preview: queryText.substring(0, 100) });
        return '';
      }

      const queries: string[] = JSON.parse(queryMatch[0]);
      if (!Array.isArray(queries) || queries.length === 0) return '';

      this.logger.log({
        message: 'Search queries generated by Gemini Flash',
        agentLabel,
        taskTitle,
        queries,
      });

      // Step 2: Run searches in parallel via Brave Search API (5 results per query)
      const braveKey = this.configService.get<string>('BRAVE_API_KEY') ?? '';
      const searchPromises = queries.slice(0, 5).map(async (q) => {
        try {
          const encoded = encodeURIComponent(q);
          const res = await fetch(
            `https://api.search.brave.com/res/v1/web/search?q=${encoded}&count=5`,
            { headers: { 'X-Subscription-Token': braveKey, 'Accept': 'application/json' }, signal: AbortSignal.timeout(10_000) },
          );
          if (!res.ok) return [];
          const data = await res.json() as any;
          return (data.web?.results ?? []).slice(0, 5).map((r: any) => ({
            title: r.title ?? '', link: r.url ?? '', snippet: r.description ?? '',
          }));
        } catch { return []; }
      });
      const searchResults = await Promise.all(searchPromises);

      // Step 3: Format results into a research block for the domain agent
      let researchBlock = '\n\n--- REZULTATI WEB ISTRAZIVANJA ---\n';
      researchBlock += 'Sledeci podaci su pronadjeni putem web pretrage. KORISTI ove izvore kao PRIMARNI izvor cinjenica.\n';
      researchBlock += 'OBAVEZNO citiraj izvor: ([Naziv](URL)) posle svake cinjenice.\n';
      researchBlock += 'NE IGNORISI ove podatke — tvoja analiza MORA biti zasnovana na njima.\n\n';

      let totalChars = 0;
      const MAX_RESEARCH_CHARS = 8_000;

      for (let i = 0; i < queries.length && i < searchResults.length; i++) {
        const results = searchResults[i] ?? [];
        if (results.length === 0) continue;

        researchBlock += `### Pretraga: "${queries[i]}"\n`;
        for (const r of results as Array<{ title: string; link: string; snippet: string }>) {
          if (totalChars > MAX_RESEARCH_CHARS) break;
          researchBlock += `\n**[${r.title}](${r.link})**\n${r.snippet}\n`;
          totalChars += r.snippet.length;
        }
        researchBlock += '\n';
      }

      researchBlock += '\n--- KRAJ SIROVIH REZULTATA ---\n';

      // Step 4: Summarize entire research block to ~5000 chars via Gemini Flash
      // One call for ALL results — preserves key data, removes noise
      if (totalChars > 5000) {
        try {
          const summarizePrompt = `Summarize the following web research results into a RICH, COMPREHENSIVE research brief of ~5000 characters.

RULES:
- PRESERVE all specific numbers, percentages, currency amounts, dates
- PRESERVE all source URLs — format as ([Title](URL)) inline after each fact
- PRESERVE competitor names, company examples, case studies with specifics
- PRESERVE industry benchmarks and comparison data
- REMOVE generic filler text, navigation content, duplicate information
- ORGANIZE by topic with clear ## headings
- Output in Serbian language
- Include comparison tables where data from multiple sources exists

RAW RESEARCH DATA:
${researchBlock}`;

          // Gemini 2.5 Flash for summarization — thinking disabled to maximize output tokens
          const sumResponse = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${this.geminiApiKey}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                contents: [{ parts: [{ text: summarizePrompt }] }],
                generationConfig: { temperature: 0.2, maxOutputTokens: 5000, thinkingConfig: { thinkingBudget: 0 } },
              }),
              signal: AbortSignal.timeout(30_000),
            },
          );

          if (sumResponse.ok) {
            const sumData = await sumResponse.json() as any;
            const summary = sumData.candidates?.[0]?.content?.parts?.[0]?.text;
            if (summary && summary.length > 1000) {
              researchBlock = '\n\n--- REZULTATI WEB ISTRAZIVANJA (sumirano) ---\n';
              researchBlock += 'Sledeci podaci su pronadjeni i sumirani iz web pretrage. KORISTI ih kao PRIMARNI izvor.\n';
              researchBlock += 'OBAVEZNO citiraj izvor: ([Naziv](URL)) posle svake cinjenice.\n\n';
              researchBlock += summary;
              researchBlock += '\n\n--- KRAJ WEB ISTRAZIVANJA ---\n';

              this.logger.log({
                message: 'Research summarized by Gemini',
                agentLabel, original: totalChars, summarized: summary.length,
              });
            }
          }
        } catch (sumErr) {
          this.logger.warn({ message: 'Research summarization failed, using raw results', error: sumErr instanceof Error ? sumErr.message : 'Unknown' });
        }
      }

      if (!researchBlock.includes('KRAJ WEB ISTRAZIVANJA')) {
        researchBlock += '\n--- KRAJ WEB ISTRAZIVANJA ---\n';
      }
      researchBlock += '\nKRITICNO: Koristi SAMO podatke iz izvora iznad. Svaku cinjenicu citiraj sa izvorom. NE izmisljaj podatke. NE kazi da "nemas podatke" ako su iznad navedeni.\n';

      this.logger.log({
        message: 'Search enrichment complete',
        agentLabel,
        queryCount: queries.length,
        totalResultChars: totalChars,
      });

      return researchBlock;
    } catch (err) {
      this.logger.warn({
        message: 'Search enrichment failed (non-blocking)',
        error: err instanceof Error ? err.message : 'Unknown',
      });
      return '';
    }
  }

  /**
   * Scan agent output for ![alt](url) images, check if URLs are real (HTTP 200).
   * For any fake/404 URLs, call FAL API with the alt text as prompt to generate real images.
   */
  private async fixFakeImageUrls(output: string, taskTitle?: string, _taskInstruction?: string, tenantId?: string): Promise<string> {
    const falKey = this.configService.get<string>('FAL_KEY') ?? '';
    const geminiKey = this.configService.get<string>('GEMINI_API_KEY') ?? '';
    if (!falKey && !geminiKey) return output;

    // Pre-clean: Convert FAL code blocks and FAL_IMAGE_SIZE commands into markdown image syntax
    let cleaned = output;

    // Remove JS code blocks with fal-ai (const fal = require... etc)
    cleaned = cleaned.replace(/```(?:javascript|js)?\s*\n[\s\S]*?fal[\s\S]*?```/gi, '');

    // Convert "FAL_IMAGE_SIZE=<size> fal-generate "<prompt>"" to ![prompt](https://placeholder.img)
    cleaned = cleaned.replace(/FAL_IMAGE_SIZE=\S+\s+fal-generate\s+"([^"]+)"/g, '![Generated image: $1](https://placeholder.img/generate)');

    // Convert standalone fal-generate commands
    cleaned = cleaned.replace(/fal-generate\s+"([^"]+)"/g, '![Generated image: $1](https://placeholder.img/generate)');

    // Remove [POTREBNO ISTRAZITI] markers completely
    cleaned = cleaned.replace(/\[POTREBNO (?:DODATNO )?ISTRA[ZŽ]ITI\]/gi, '');

    // Match ALL markdown images: ![alt](url) — any URL format including placeholders
    const imgPattern = /!\[([^\]]*)\]\(([^)]+)\)/g;
    const matches = [...cleaned.matchAll(imgPattern)];
    if (matches.length === 0) return cleaned;

    // Check which URLs are fake (not real accessible images)
    const fakeImages: Array<{ fullMatch: string; altText: string; index: number }> = [];
    for (const match of matches) {
      const url = match[2] ?? '';
      // If URL is not a real http URL or contains placeholder text, it's fake
      if (!url.startsWith('https://') || url.includes('placeholder')) {
        fakeImages.push({ fullMatch: match[0], altText: match[1] ?? '', index: match.index ?? 0 });
        continue;
      }
      // Check if real URL returns 200
      try {
        const headRes = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
        if (headRes.ok) continue;
      } catch { /* unreachable */ }
      fakeImages.push({ fullMatch: match[0], altText: match[1] ?? '', index: match.index ?? 0 });
    }

    if (fakeImages.length === 0) return output;

    // Load brand context
    let brandContext = '';
    if (tenantId) {
      try {
        const tenant = await this.prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { name: true, industry: true, description: true },
        });
        if (tenant) {
          brandContext = `Company: ${tenant.name}. Industry: ${tenant.industry}. ${tenant.description ?? ''}`;
        }
      } catch { /* non-blocking */ }
    }

    // ONE Gemini call to analyze the FULL document and generate prompts for ALL fake images
    let imagePrompts: string[] = [];

    if (geminiKey) {
      try {
        const imageList = fakeImages.map((img, i) => `IMAGE_${i + 1}: ${img.altText}`).join('\n');
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: `You are an expert image prompt engineer. Read this document and generate precise English image generation prompts for each image listed below.

CRITICAL RULES:
- Read the FULL document to understand context for each image
- Each prompt must describe EXACTLY what that specific image should show based on the document content around it
- Be SPECIFIC and VISUAL: describe the scene, objects, composition, lighting, colors, mood, textures, materials
- Do NOT use generic descriptions — each image serves a specific purpose in the document
- Add professional photography qualities: camera angle, depth of field, lighting setup, color grading
- Include style references: photorealistic, editorial, product photography, lifestyle, architectural, etc.
- Describe the environment, background, foreground elements, and spatial relationships
- 80-150 words per prompt — RICHER prompts produce BETTER images

${brandContext ? `COMPANY CONTEXT: ${brandContext}\n` : ''}${taskTitle ? `TASK: ${taskTitle}\n` : ''}
DOCUMENT:
${cleaned.substring(0, 8000)}

IMAGES TO GENERATE:
${imageList}

Return ONLY a JSON array of prompt strings, one per image, in the same order:
["prompt for IMAGE_1", "prompt for IMAGE_2", ...]` }] }],
              generationConfig: { temperature: 0.4, maxOutputTokens: 5000, thinkingConfig: { thinkingBudget: 0 } },
            }),
            signal: AbortSignal.timeout(20000),
          },
        );

        if (geminiRes.ok) {
          const gData = await geminiRes.json() as any;
          const gText = gData.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
          const jsonMatch = gText.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            imagePrompts = JSON.parse(jsonMatch[0]);
          }
        }
      } catch (err) {
        this.logger.warn({ message: 'Gemini image prompt generation failed', error: err instanceof Error ? err.message : 'Unknown' });
      }
    }

    // Generate real images via FAL API
    let fixedOutput = cleaned;
    let fixedCount = 0;

    for (let i = 0; i < fakeImages.length; i++) {
      const img = fakeImages[i]!;
      const prompt = imagePrompts[i] && imagePrompts[i]!.length > 20
        ? imagePrompts[i]!
        : `${img.altText}, professional photography, high quality, detailed, realistic`;

      try {
        const falRes = await fetch('https://fal.run/fal-ai/flux/schnell', {
          method: 'POST',
          headers: { 'Authorization': `Key ${falKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ prompt, image_size: 'landscape_16_9', num_images: 1 }),
          signal: AbortSignal.timeout(30000),
        });

        if (falRes.ok) {
          const falData = await falRes.json() as any;
          const realUrl = falData.images?.[0]?.url;
          if (realUrl) {
            fixedOutput = fixedOutput.replace(img.fullMatch, `![${img.altText}](${realUrl})`);
            fixedCount++;
            this.logger.log({ message: 'Fixed image via FAL fallback', index: i + 1, prompt: prompt.substring(0, 60) });
          }
        }
      } catch (err) {
        this.logger.warn({ message: 'Image generation failed', index: i + 1, error: err instanceof Error ? err.message : 'Unknown' });
      }
    }

    if (fixedCount > 0) {
      this.logger.log({ message: `Fixed ${fixedCount}/${fakeImages.length} fake images` });
    }
    return fixedOutput;
  }

  /**
   * Load the parent concept + its related concepts as ConceptMatch[] for citation injection.
   */
  private async loadConceptMatchesForNote(conceptId: string): Promise<ConceptMatch[]> {
    try {
      const concept = await this.prisma.concept.findUnique({
        where: { id: conceptId },
        select: { id: true, name: true, category: true, definition: true },
      });
      if (!concept) return [];

      // Load related concepts (both directions)
      const relationships = await this.prisma.conceptRelationship.findMany({
        where: {
          OR: [{ sourceConceptId: conceptId }, { targetConceptId: conceptId }],
        },
        include: {
          sourceConcept: { select: { id: true, name: true, category: true, definition: true } },
          targetConcept: { select: { id: true, name: true, category: true, definition: true } },
        },
        take: 10,
      });

      const matches: ConceptMatch[] = [
        { conceptId: concept.id, conceptName: concept.name, category: concept.category as any, definition: concept.definition, score: 1.0 },
      ];

      for (const rel of relationships) {
        const related = rel.sourceConceptId === conceptId ? rel.targetConcept : rel.sourceConcept;
        if (!matches.some((m) => m.conceptId === related.id)) {
          matches.push({
            conceptId: related.id,
            conceptName: related.name,
            category: related.category as any,
            definition: related.definition,
            score: 0.8,
          });
        }
      }

      return matches;
    } catch {
      return [];
    }
  }

  private estimateActualCost(usage?: { input?: number; output?: number; total?: number }): number {
    if (!usage?.total) return this.budgetService.getEstimatedCost();
    const inputCost = ((usage.input ?? 0) / 1_000_000) * 0.27;
    const outputCost = ((usage.output ?? 0) / 1_000_000) * 1.1;
    const fetchCost = 0.03;
    return Math.round((inputCost + outputCost + fetchCost) * 10000) / 10000;
  }

  /** Creates a child note for an agent/job result, returning the new note ID or null on failure. */
  private async createResultNote(
    output: string,
    agentLabel: string,
    note: { id: string; title: string; conceptId?: string | null; conversationId?: string | null },
    userId: string,
    tenantId: string,
    executionId: string,
    jobId?: string
  ): Promise<string | null> {
    if (!output) return null;
    try {
      const existingSteps = await this.prisma.note.count({
        where: { parentNoteId: note.id, tenantId },
      });
      const childNote = await this.notesService.createNote({
        title: `${agentLabel}: ${note.title}`,
        content: output,
        source: NoteSource.CONVERSATION,
        noteType: NoteType.AGENT_RESEARCH,
        status: NoteStatus.READY_FOR_REVIEW,
        parentNoteId: note.id,
        workflowStepNumber: existingSteps + 1,
        conceptId: note.conceptId ?? undefined,
        conversationId: note.conversationId ?? undefined,
        userId,
        tenantId,
      });
      this.logger.debug({
        message: 'Agent result persisted as child note',
        executionId,
        jobId,
        resultNoteId: childNote.id,
        parentNoteId: note.id,
      });
      return childNote.id;
    } catch (noteErr) {
      this.logger.warn({
        message: 'Failed to create child note for agent result',
        executionId,
        jobId,
        error: noteErr instanceof Error ? noteErr.message : 'Unknown',
      });
      return null;
    }
  }

  // --- Agent Job Pipeline ---

  async executeJob(
    jobId: string,
    userId: string,
    tenantId: string
  ): Promise<{ jobId: string; executionId: string }> {
    // Load and validate job
    const job = await this.prisma.agentJob.findFirst({
      where: { id: jobId, tenantId },
    });

    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }
    if (job.status !== 'PLANNED') {
      throw new BadRequestException(`Job is already ${job.status.toLowerCase()}`);
    }

    // Check dependencies are in terminal state (COMPLETED or FAILED)
    // Block only on actively running deps — FAILED deps are allowed (context will exclude them)
    if (job.dependsOn.length > 0) {
      const depJobs = await this.prisma.agentJob.findMany({
        where: { id: { in: job.dependsOn } },
      });
      const nonTerminalDeps = depJobs.filter(
        (d) => !['COMPLETED', 'FAILED'].includes(d.status),
      );
      if (nonTerminalDeps.length > 0) {
        throw new BadRequestException('Dependency jobs still in progress');
      }
    }

    // Load parent note
    const note = await this.prisma.note.findFirst({
      where: { id: job.noteId, tenantId },
    });
    if (!note) {
      throw new NotFoundException(`Note ${job.noteId} not found`);
    }

    // Validate agent type, config, budget
    const agentType = job.agentType as AgentType;
    const agentDef = this.registry.getAgent(agentType);

    if (!this.openClawClient.isConfigured()) {
      throw new BadRequestException('Agent execution is not configured');
    }

    const canSpend = await this.budgetService.canSpend(tenantId);
    if (!canSpend) {
      throw new ForbiddenException('Daily budget exceeded');
    }

    // Check concurrency
    const activeCount = await this.prisma.agentExecution.count({
      where: {
        tenantId,
        status: { in: ['PENDING', 'FORMATTING', 'EXECUTING'] },
      },
    });
    if (activeCount >= this.MAX_CONCURRENT_PER_TENANT) {
      throw new BadRequestException(
        `Maximum ${this.MAX_CONCURRENT_PER_TENANT} concurrent agent executions`
      );
    }

    // Create execution record + reserve budget
    const executionId = `agx_${createId()}`;
    const estimatedCost = agentDef.estimatedCostEur;

    await this.prisma.agentExecution.create({
      data: {
        id: executionId,
        tenantId,
        userId,
        noteId: job.noteId,
        status: 'PENDING',
        agentType,
        estimatedCostEur: estimatedCost,
      },
    });

    await this.budgetService.recordSpend(tenantId, estimatedCost);

    // Update job: RUNNING + link execution
    await this.prisma.agentJob.update({
      where: { id: jobId },
      data: { status: 'RUNNING', executionId },
    });

    this.logger.log({
      message: 'Job execution triggered',
      jobId,
      executionId,
      agentType,
      noteId: job.noteId,
    });

    // Gather dependency context
    let dependencyContext = '';
    if (job.dependsOn.length > 0) {
      const depJobs = await this.prisma.agentJob.findMany({
        where: { id: { in: job.dependsOn }, status: 'COMPLETED' },
        orderBy: { order: 'asc' },
      });
      for (const dep of depJobs) {
        if (dep.agentOutput) {
          const depLabel = this.registry.getAgent(dep.agentType as AgentType).label;
          dependencyContext += `\n--- Previous Result: ${depLabel} ---\n${dep.agentOutput}\n--- End ---\n`;
        }
      }
      this.logger.log({
        message: 'Dependency context gathered',
        jobId,
        dependencyCount: depJobs.length,
        contextLength: dependencyContext.length,
      });
    }

    // Fire-and-forget
    this.executeJobPipeline(
      executionId,
      jobId,
      agentType,
      note,
      job.instruction,
      dependencyContext,
      userId,
      tenantId,
      estimatedCost
    ).catch((err) => {
      this.logger.error({
        message: 'Job pipeline failed unexpectedly',
        jobId,
        executionId,
        error: err.message,
      });
    });

    return { jobId, executionId };
  }

  /**
   * Retry a FAILED agent job: reset to PLANNED, then re-execute.
   */
  async retryJob(
    jobId: string,
    userId: string,
    tenantId: string,
  ): Promise<{ jobId: string; executionId: string }> {
    const job = await this.prisma.agentJob.findFirst({
      where: { id: jobId, tenantId },
    });

    if (!job) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    // Allow re-run from any status (COMPLETED, FAILED, PLANNED)
    // Reset to PLANNED so executeJob() can pick it up fresh
    await this.prisma.agentJob.update({
      where: { id: jobId },
      data: { status: 'PLANNED', executionId: null, error: null, agentOutput: null },
    });

    this.logger.log({ message: 'Re-running job', jobId, status: job.status, tenantId });

    return this.executeJob(jobId, userId, tenantId);
  }

  /**
   * Force-stop all running executions and jobs for a tenant.
   */
  async stopAllExecutions(tenantId: string): Promise<{ stoppedExecutions: number; stoppedJobs: number }> {
    const execs = await this.prisma.agentExecution.updateMany({
      where: { tenantId, status: { in: ['EXECUTING', 'FORMATTING', 'PENDING'] } },
      data: { status: 'FAILED', error: 'Manually stopped by user', completedAt: new Date() },
    });

    const jobs = await this.prisma.agentJob.updateMany({
      where: { tenantId, status: 'RUNNING' },
      data: { status: 'FAILED', error: 'Manually stopped by user' },
    });

    this.logger.log({
      message: 'All executions stopped by user',
      tenantId,
      stoppedExecutions: execs.count,
      stoppedJobs: jobs.count,
    });

    return { stoppedExecutions: execs.count, stoppedJobs: jobs.count };
  }

  /**
   * Retry all PLANNED and FAILED jobs in waves of 5, respecting dependencies.
   * FAILED jobs are first reset to PLANNED. Then processes waves until all done.
   */
  async retryAllPendingJobs(
    userId: string,
    tenantId: string,
  ): Promise<{ totalJobs: number; message: string }> {
    // Reset all FAILED jobs to PLANNED
    const failedJobs = await this.prisma.agentJob.updateMany({
      where: { tenantId, status: 'FAILED' },
      data: { status: 'PLANNED', executionId: null, error: null },
    });

    const totalPlanned = await this.prisma.agentJob.count({
      where: { tenantId, status: 'PLANNED' },
    });

    if (totalPlanned === 0) {
      return { totalJobs: 0, message: 'No pending jobs to retry' };
    }

    this.logger.log({
      message: 'Retry all pending: starting wave execution',
      tenantId,
      resetFailed: failedJobs.count,
      totalPlanned,
    });

    // Fire-and-forget: process waves in background
    this.processJobWaves(userId, tenantId).catch((err) => {
      this.logger.error({
        message: 'Retry all pending: wave processing failed',
        error: err instanceof Error ? err.message : 'Unknown',
      });
    });

    return { totalJobs: totalPlanned, message: `Processing ${totalPlanned} jobs in waves of 5` };
  }

  private async processJobWaves(userId: string, tenantId: string): Promise<void> {
    const WAVE_SIZE = 3;
    const MAX_WAIT_PER_JOB_MS = 15 * 60_000; // 15 min max per job
    const POLL_INTERVAL_MS = 5_000;

    let processedTotal = 0;

    while (true) {
      // Find PLANNED jobs whose dependencies are all terminal
      const allPlanned = await this.prisma.agentJob.findMany({
        where: { tenantId, status: 'PLANNED' },
        select: { id: true, agentType: true, dependsOn: true, noteId: true },
      });

      if (allPlanned.length === 0) {
        this.logger.log({ message: `Retry all: complete. Processed ${processedTotal} jobs.`, tenantId });
        break;
      }

      // Filter to ready jobs (all deps COMPLETED or FAILED)
      const ready: typeof allPlanned = [];
      for (const job of allPlanned) {
        if (job.dependsOn.length === 0) {
          ready.push(job);
          continue;
        }
        const deps = await this.prisma.agentJob.findMany({
          where: { id: { in: job.dependsOn } },
          select: { status: true },
        });
        if (deps.every((d) => ['COMPLETED', 'FAILED'].includes(d.status))) {
          ready.push(job);
        }
      }

      if (ready.length === 0) {
        this.logger.warn({
          message: `Retry all: ${allPlanned.length} PLANNED but none ready (unmet deps). Stopping.`,
          tenantId,
        });
        break;
      }

      // Take wave of WAVE_SIZE
      const wave = ready.slice(0, WAVE_SIZE);
      this.logger.log({
        message: `Retry all: wave of ${wave.length} jobs (${allPlanned.length} remaining)`,
        tenantId,
        jobTypes: wave.map((j) => j.agentType),
      });

      // Execute wave in parallel
      const wavePromises = wave.map(async (job) => {
        try {
          await this.executeJob(job.id, userId, tenantId);

          // Poll for completion
          const start = Date.now();
          while (Date.now() - start < MAX_WAIT_PER_JOB_MS) {
            const current = await this.prisma.agentJob.findFirst({
              where: { id: job.id },
              select: { status: true },
            });
            if (!current || ['COMPLETED', 'FAILED'].includes(current.status)) break;
            await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
          }
        } catch (err) {
          this.logger.warn({
            message: `Retry all: job ${job.id} failed to start`,
            error: err instanceof Error ? err.message : 'Unknown',
          });
        }
      });

      await Promise.all(wavePromises);
      processedTotal += wave.length;

      // Send knowledge updates to domain masters + main for completed jobs in this wave
      await this.sendKnowledgeUpdatesForWave(wave, tenantId);

      // Short pause between waves
      await new Promise((r) => setTimeout(r, 2_000));
    }
  }

  /**
   * After a wave of jobs completes, send knowledge updates to domain master agents
   * and the main business brain agent. Groups by noteId to send one update per concept.
   */
  private async sendKnowledgeUpdatesForWave(
    jobs: Array<{ id: string; agentType: string; noteId: string }>,
    tenantId: string,
  ): Promise<void> {
    // Group completed jobs by noteId
    const noteIds = [...new Set(jobs.map((j) => j.noteId))];

    for (const noteId of noteIds) {
      try {
        const note = await this.prisma.note.findUnique({
          where: { id: noteId },
          select: { userReport: true, title: true },
        });
        if (!note?.userReport || note.userReport.length < 200) continue;

        const tenant = await this.prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { name: true },
        });

        const completedJobs = await this.prisma.agentJob.findMany({
          where: { noteId, tenantId, status: 'COMPLETED' },
          select: { agentType: true },
        });
        const agentTypes = [...new Set(completedJobs.map((j) => j.agentType))];
        const companyName = tenant?.name || 'Unknown Company';
        const summary = note.userReport.substring(0, 5000);

        // Stagger to avoid lock contention
        await new Promise((r) => setTimeout(r, Math.random() * 5_000));

        // Update domain masters
        for (const agentTypeStr of agentTypes) {
          try {
            const agentId = agentTypeStr.replace(/_/g, '-');
            await this.openClawClient.executeAgent(
              `KNOWLEDGE UPDATE za ${companyName} - Koncept: ${note.title}. Zapamti ove nalaze:\n\n${summary}`,
              { agentId, tenantProfile: tenantId, timeoutSeconds: 180 },
            );
          } catch { /* non-blocking */ }
        }

        // Update main
        try {
          await this.openClawClient.executeAgent(
            `KNOWLEDGE UPDATE za ${companyName}: Koncept "${note.title}" zavrsen. Zapamti i organizuj:\n${summary.substring(0, 3000)}`,
            { agentId: 'main', tenantProfile: tenantId, timeoutSeconds: 120 },
          );
        } catch { /* non-blocking */ }

        this.logger.log({
          message: 'Knowledge updates sent for concept',
          noteId,
          conceptName: note.title,
          agentTypes,
        });
      } catch (err) {
        this.logger.warn({
          message: 'Knowledge update failed (non-blocking)',
          noteId,
          error: err instanceof Error ? err.message : 'Unknown',
        });
      }
    }
  }

  private async executeJobPipeline(
    executionId: string,
    jobId: string,
    agentType: AgentType,
    note: {
      id: string;
      title: string;
      content: string;
      userReport: string | null;
      expectedOutcome: string | null;
      conceptId?: string | null;
      conversationId?: string | null;
    },
    jobInstruction: string,
    dependencyContext: string,
    userId: string,
    tenantId: string,
    reservedCostEur: number
  ): Promise<void> {
    const openClawAgentId = this.registry.getOpenClawAgentId(agentType);
    const agentLabel = this.registry.getAgent(agentType).label;
    let heartbeat: ReturnType<typeof setInterval> | null = null;
    let chunkIndex = 0;

    try {
      // Emit concept activity for graph visualization
      if (note.conceptId) {
        this.emitAgentEvent(tenantId, 'agent:concept-activity', {
          agentType, conceptId: note.conceptId, status: 'started',
        });
      }

      // Step 1: Build enriched instruction with dependency context
      await this.updateStatus(executionId, 'FORMATTING');
      this.emitAgentEvent(tenantId, 'agent:status-change', {
        executionId, jobId, noteId: note.id, agentType, status: 'FORMATTING',
        label: `${agentLabel}: Priprema instrukcija...`,
      });

      const enrichedInstruction = dependencyContext
        ? `${jobInstruction}\n\nContext from previous agent results:\n${dependencyContext}`
        : jobInstruction;

      // Note: web_search jobs no longer created separately — each domain agent does its own search

      // Retrieve pre-check context from main agent (stored during headless execution)
      const preCheckContext = (note as any).agentEnrichments?.mainPreCheck ?? null;

      const formattedPrompt = await this.agentPrompt.formatPrompt({
        agentType,
        taskTitle: note.title,
        taskContent: enrichedInstruction,
        userReport: note.userReport!,
        expectedOutcome: note.expectedOutcome,
        preCheckContext,
        tenantId,
        userId,
        onChunk: (chunk) => {
          this.emitAgentEvent(tenantId, 'agent:formatting-chunk', {
            executionId, jobId, chunk, index: chunkIndex++,
          });
        },
      });

      // Step 1b: Web search enrichment — Gemini Flash generates queries, Serper fetches data
      // Domain agents get pre-researched data so they focus on analysis, not searching.
      this.emitAgentEvent(tenantId, 'agent:status-change', {
        executionId, jobId, noteId: note.id, agentType, status: 'FORMATTING',
        label: `${agentLabel}: Web istrazivanje...`,
      });

      const searchResults = await this.generateSearchAndEnrich(formattedPrompt, agentLabel, note.title);
      // Put search results FIRST so DeepSeek sees data before instruction (16K context limit)
      const enrichedPrompt = searchResults
        ? `${searchResults}\n\n--- TVOJ ZADATAK (koristi podatke iznad) ---\n${formattedPrompt}`
        : formattedPrompt;

      this.emitAgentEvent(tenantId, 'agent:formatting-complete', {
        executionId, jobId, promptLength: enrichedPrompt.length,
      });

      await this.prisma.agentExecution.update({
        where: { id: executionId },
        data: { formattedPrompt: enrichedPrompt },
      });

      // Step 2: Execute domain agent via DeepSeek API directly (bypasses OpenClaw 4K output limit)
      await this.updateStatus(executionId, 'EXECUTING', { startedAt: new Date() });
      this.emitAgentEvent(tenantId, 'agent:status-change', {
        executionId, jobId, noteId: note.id, agentType, status: 'EXECUTING',
        label: `${agentLabel}: Analizira...`,
      });
      heartbeat = this.startHeartbeat(executionId, jobId, agentType, tenantId, Date.now());

      let result: { success: boolean; output: string; durationMs: number; usage?: { input?: number; output?: number; total?: number }; error?: string };

      {
        const startMs = Date.now();
        let fullOutput = '';
        try {
          await this.aiGateway.streamCompletionWithContext(
            [{ role: 'user', content: enrichedPrompt }],
            { tenantId, userId, skipRateLimit: true, skipQuotaCheck: true },
            (chunk: string) => {
              fullOutput += chunk;
              this.emitAgentEvent(tenantId, 'agent:text-chunk', { executionId, jobId, text: chunk });
            },
          );
          result = { success: true, output: fullOutput, durationMs: Date.now() - startMs };
        } catch (err) {
          result = {
            success: false,
            output: fullOutput,
            durationMs: Date.now() - startMs,
            error: err instanceof Error ? err.message : 'DeepSeek API call failed',
          };
        }

        // Send summarized result to OpenClaw for agent memory (fire-and-forget, max 2000 words)
        if (result.success && result.output.length > 100) {
          const summaryForMemory = result.output.length > 8000
            ? result.output.substring(0, 8000) + '\n\n[... ostatak skracen za memoriju]'
            : result.output;
          this.openClawClient.executeAgent(
            `REZULTAT ISTRAZIVANJA za zadatak "${note.title}" (${agentLabel}):\n\n${summaryForMemory}`,
            { agentId: openClawAgentId, tenantProfile: tenantId, timeoutSeconds: 60 },
          ).catch(() => { /* non-blocking memory update */ });
        }
      }

      clearInterval(heartbeat);
      heartbeat = null;

      if (!result.success) {
        const errorMsg = result.error ?? 'Agent execution failed';
        await this.prisma.agentJob.update({
          where: { id: jobId },
          data: { status: 'FAILED', error: errorMsg },
        });
        await this.updateStatus(executionId, 'FAILED', {
          error: errorMsg,
          completedAt: new Date(),
          durationMs: result.durationMs,
        });
        this.emitAgentEvent(tenantId, 'agent:status-change', {
          executionId, jobId, noteId: note.id, agentType, status: 'FAILED',
          label: `${agentLabel}: Greška`,
        });
        this.emitAgentEvent(tenantId, 'agent:error', {
          executionId, jobId, agentType, error: errorMsg,
        });

        // Emit agent.job.failed event (backend orchestration, fire-and-forget)
        this.appEventBus.emit(APP_EVENTS.AGENT_JOB_FAILED, {
          tenantId,
          jobId,
          noteId: note.id,
          agentType,
          success: false,
          error: errorMsg,
          durationMs: result.durationMs,
        });
        // Notify user about failure in conversation
        if (note.conversationId) {
          try {
            await this.prisma.message.create({
              data: {
                id: `msg_${createId()}`,
                conversationId: note.conversationId,
                role: 'ASSISTANT',
                content: `**${agentLabel}** — Greska: ${errorMsg.substring(0, 200)}`,
              },
            });
          } catch { /* non-blocking */ }
        }
        return;
      }

      // Step 3: Store result in both AgentJob and Note enrichments
      await this.prisma.agentJob.update({
        where: { id: jobId },
        data: { status: 'COMPLETED', agentOutput: result.output },
      });

      await this.mergeEnrichment(note.id, agentType, {
        executionId,
        status: AgentExecutionStatus.COMPLETED,
        result: result.output,
        completedAt: new Date().toISOString(),
        error: null,
      });

      // Step 3a-fix: Replace fake image URLs with real FAL-generated images
      let fixedOutput = result.output;
      try {
        fixedOutput = await this.fixFakeImageUrls(result.output, note.title, jobInstruction, tenantId);
      } catch (imgErr) {
        this.logger.error({ message: 'fixFakeImageUrls FAILED', error: imgErr instanceof Error ? imgErr.message : 'Unknown', stack: imgErr instanceof Error ? imgErr.stack?.substring(0, 300) : '' });
      }

      // Update job output with fixed images
      if (fixedOutput !== result.output) {
        await this.prisma.agentJob.update({
          where: { id: jobId },
          data: { agentOutput: fixedOutput },
        });
        await this.mergeEnrichment(note.id, agentType, {
          executionId,
          status: AgentExecutionStatus.COMPLETED,
          result: fixedOutput,
          completedAt: new Date().toISOString(),
          error: null,
        });
      }

      // Step 3b: Persist job output as reviewable child note (Sprint 2 Epic 2.3)
      const jobResultNoteId = await this.createResultNote(
        fixedOutput, agentLabel, note, userId, tenantId, executionId, jobId
      );

      // Step 3c: Add job output as conversation message with concept citations
      if (note.conversationId && fixedOutput) {
        try {
          let messageContent = `**${agentLabel}**\n\n${fixedOutput}`;

          // Inject concept citations so concept names become clickable links
          if (note.conceptId) {
            const conceptMatches = await this.loadConceptMatchesForNote(note.conceptId);
            if (conceptMatches.length > 0) {
              const citationResult = this.citationInjector.injectCitations(messageContent, conceptMatches);
              messageContent = citationResult.content;
            }
          }

          await this.prisma.message.create({
            data: {
              id: `msg_${createId()}`,
              conversationId: note.conversationId,
              role: 'ASSISTANT',
              content: messageContent,
            },
          });
          // Update conversation timestamp so it surfaces in the list
          await this.prisma.conversation.update({
            where: { id: note.conversationId },
            data: { updatedAt: new Date() },
          });
          // WS notify handled by AGENT_JOB_COMPLETED event below
        } catch { /* non-blocking — conversation message is supplementary */ }
      }

      // Step 4: Cost adjustment
      const actualCost = this.estimateActualCost(result.usage);
      const costDifference = actualCost - reservedCostEur;
      if (Math.abs(costDifference) > 0.0001) {
        await this.budgetService.recordSpend(tenantId, costDifference);
      }

      // Step 5: Mark execution completed (guard: don't overwrite if manually stopped)
      const currentExec2 = await this.prisma.agentExecution.findUnique({ where: { id: executionId }, select: { status: true } });
      if (currentExec2?.status !== 'FAILED') {
        await this.prisma.agentExecution.update({
          where: { id: executionId },
          data: {
            status: 'COMPLETED',
            agentOutput: result.output,
            actualCostEur: actualCost,
            completedAt: new Date(),
            durationMs: result.durationMs,
            resultNoteId: jobResultNoteId,
          },
        });

        this.emitAgentEvent(tenantId, 'agent:status-change', {
          executionId, jobId, noteId: note.id, agentType, status: 'COMPLETED',
          label: `${agentLabel}: Završeno`,
        });
      }
      this.emitAgentEvent(tenantId, 'agent:result', {
        executionId, jobId, agentType,
        output: result.output, durationMs: result.durationMs,
      });

      this.logger.log({
        message: 'Job execution completed',
        jobId,
        executionId,
        agentType,
        durationMs: result.durationMs,
        actualCostEur: actualCost,
      });

      // Emit agent.job.completed event (backend orchestration, fire-and-forget)
      this.appEventBus.emit(APP_EVENTS.AGENT_JOB_COMPLETED, {
        tenantId,
        jobId,
        noteId: note.id,
        agentType,
        success: true,
        output: result.output?.substring(0, 500),
        durationMs: result.durationMs,
      });

      if (note.conceptId) {
        this.emitAgentEvent(tenantId, 'agent:concept-activity', {
          agentType, conceptId: note.conceptId, status: 'stopped',
        });
      }
    } catch (err) {
      if (heartbeat) clearInterval(heartbeat);

      if (note.conceptId) {
        this.emitAgentEvent(tenantId, 'agent:concept-activity', {
          agentType, conceptId: note.conceptId, status: 'stopped',
        });
      }

      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error({
        message: 'Job pipeline error',
        jobId,
        executionId,
        agentType,
        error: errorMessage,
      });

      this.emitAgentEvent(tenantId, 'agent:status-change', {
        executionId, jobId, noteId: note.id, agentType, status: 'FAILED',
        label: `${agentLabel}: Greška`,
      });
      this.emitAgentEvent(tenantId, 'agent:error', {
        executionId, jobId, agentType, error: errorMessage,
      });

      try {
        await this.prisma.agentJob.update({
          where: { id: jobId },
          data: { status: 'FAILED', error: errorMessage },
        });
        await this.mergeEnrichment(note.id, agentType, {
          executionId,
          status: AgentExecutionStatus.FAILED,
          result: null,
          completedAt: new Date().toISOString(),
          error: errorMessage,
        });
      } catch {
        /* best-effort */
      }

      await this.updateStatus(executionId, 'FAILED', {
        error: errorMessage,
        completedAt: new Date(),
      });

      // Emit agent.job.failed event (backend orchestration, fire-and-forget)
      this.appEventBus.emit(APP_EVENTS.AGENT_JOB_FAILED, {
        tenantId,
        jobId,
        noteId: note.id,
        agentType,
        success: false,
        error: errorMessage,
      });
    }
  }

  /**
   * Send user feedback on a completed agent job to the agent so it can learn.
   * The feedback is sent to the agent's persistent session (default, not work session)
   * and also stored as a conversation message.
   */
  async submitJobFeedback(
    jobId: string,
    feedback: string,
    userId: string,
    tenantId: string,
  ): Promise<{ success: boolean }> {
    const job = await this.prisma.agentJob.findFirst({
      where: { id: jobId, tenantId },
    });

    if (!job) throw new NotFoundException(`Job ${jobId} not found`);
    if (!job.agentOutput) throw new BadRequestException('Job has no output to give feedback on');

    // Load the parent note for title and conversationId
    const note = await this.prisma.note.findUnique({
      where: { id: job.noteId },
      select: { title: true, conversationId: true },
    });

    const agentType = job.agentType as AgentType;
    const agentDef = this.registry.getAgent(agentType);
    const openClawAgentId = agentDef.openClawAgentId;

    // Send feedback to the agent's persistent session (so it learns for future tasks)
    if (this.openClawClient.isConfigured()) {
      try {
        const feedbackMessage = `FEEDBACK od korisnika za tvoj rad na konceptu "${note?.title ?? 'Unknown'}":

--- TVOJ OUTPUT ---
${job.agentOutput.substring(0, 2000)}
--- KRAJ OUTPUTA ---

--- KORISNIKOV FEEDBACK ---
${feedback}
--- KRAJ FEEDBACKA ---

Zapamti ovaj feedback i primeni ga u buducem radu. Sta ces uraditi drugacije sledeci put?`;

        await this.openClawClient.executeAgent(feedbackMessage, {
          agentId: openClawAgentId,
          tenantProfile: tenantId,
          timeoutSeconds: 120,
        });

        this.logger.log({
          message: 'Job feedback sent to agent',
          jobId, agentType, feedbackLength: feedback.length,
        });
      } catch (err) {
        this.logger.warn({
          message: 'Failed to send feedback to agent (non-blocking)',
          jobId, error: err instanceof Error ? err.message : 'Unknown',
        });
      }
    }

    // Store feedback as conversation message
    if (note?.conversationId) {
      try {
        await this.prisma.message.create({
          data: {
            id: `msg_${createId()}`,
            conversationId: note.conversationId,
            role: 'USER',
            content: `Feedback za ${agentDef.label}: ${feedback}`,
          },
        });
        await this.prisma.conversation.update({
          where: { id: note.conversationId },
          data: { updatedAt: new Date() },
        });
      } catch { /* non-blocking */ }
    }

    return { success: true };
  }

  async getExecution(
    executionId: string,
    tenantId: string
  ): Promise<AgentExecutionResponse | null> {
    const exec = await this.prisma.agentExecution.findFirst({
      where: { id: executionId, tenantId },
    });

    if (!exec) return null;
    return this.mapToResponse(exec);
  }

  async getExecutionsByNote(noteId: string, tenantId: string): Promise<AgentExecutionResponse[]> {
    const executions = await this.prisma.agentExecution.findMany({
      where: { noteId, tenantId },
      orderBy: { createdAt: 'desc' },
    });

    return executions.map((e) => this.mapToResponse(e));
  }

  private readonly VALID_STATUSES = new Set(Object.values(AgentExecutionStatus));

  private mapToResponse(exec: {
    id: string;
    noteId: string;
    resultNoteId: string | null;
    status: string;
    agentType: string;
    estimatedCostEur: unknown;
    actualCostEur: unknown;
    error: string | null;
    durationMs: number | null;
    createdAt: Date;
    completedAt: Date | null;
  }): AgentExecutionResponse {
    let status = exec.status as AgentExecutionStatus;
    if (!this.VALID_STATUSES.has(status)) {
      this.logger.warn({
        message: 'Unknown execution status in DB',
        executionId: exec.id,
        status: exec.status,
      });
      status = AgentExecutionStatus.FAILED;
    }

    return {
      id: exec.id,
      noteId: exec.noteId,
      resultNoteId: exec.resultNoteId,
      status,
      agentType: exec.agentType,
      estimatedCostEur: exec.estimatedCostEur ? Number(exec.estimatedCostEur) : null,
      actualCostEur: exec.actualCostEur ? Number(exec.actualCostEur) : null,
      error: exec.error,
      durationMs: exec.durationMs,
      createdAt: exec.createdAt.toISOString(),
      completedAt: exec.completedAt?.toISOString() ?? null,
    };
  }
}
