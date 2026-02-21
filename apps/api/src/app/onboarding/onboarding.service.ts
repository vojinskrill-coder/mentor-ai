import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import {
  TenantStatus as PrismaTenantStatus,
  NoteSource,
  NoteType,
  NoteStatus,
  UserRole,
  Department,
} from '@mentor-ai/shared/prisma';
import type {
  OnboardingStatus,
  QuickTask,
  QuickWinResponse,
  OnboardingCompleteResponse,
  TenantStatus,
  ConceptMatch,
  MessageRole,
} from '@mentor-ai/shared/types';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import { NotesService } from '../notes/notes.service';
import { ConceptService } from '../knowledge/services/concept.service';
import { ConceptMatchingService } from '../knowledge/services/concept-matching.service';
import { ConversationService } from '../conversation/conversation.service';
import { WebSearchService } from '../web-search/web-search.service';
import { BrainSeedingService } from '../knowledge/services/brain-seeding.service';
import { OnboardingMetricService } from './onboarding-metric.service';
import {
  QUICK_TASK_TEMPLATES,
  getTasksByIndustry,
  getTaskById,
  generateSystemPrompt,
  generateUserPrompt,
} from './templates/quick-task-templates';

/**
 * Service for managing the onboarding quick win flow.
 * Enables users to experience AI value within 5 minutes of registration.
 */
@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly aiGateway: AiGatewayService,
    private readonly notesService: NotesService,
    private readonly metricService: OnboardingMetricService,
    private readonly conceptService: ConceptService,
    private readonly conceptMatchingService: ConceptMatchingService,
    private readonly conversationService: ConversationService,
    private readonly webSearchService: WebSearchService,
    private readonly brainSeedingService: BrainSeedingService
  ) {}

  /**
   * Extracts text content from a PDF brochure buffer.
   * Returns the extracted text, truncated to 3000 chars to fit within description limits.
   */
  async extractBrochureText(pdfBuffer: Buffer): Promise<string> {
    const MAX_PDF_SIZE = 70 * 1024 * 1024; // 70MB
    if (pdfBuffer.length > MAX_PDF_SIZE) {
      throw new BadRequestException({
        type: 'pdf_too_large',
        title: 'PDF Too Large',
        status: 400,
        detail: 'PDF file must be 70MB or smaller',
      });
    }

    let text: string;
    try {
      const { PDFParse } = await import('pdf-parse');
      const parser = new PDFParse({ data: pdfBuffer });
      const result = await parser.getText();
      text = result.text?.trim() ?? '';
      await parser.destroy();
    } catch (err) {
      this.logger.warn({
        message: 'Failed to parse PDF',
        error: err instanceof Error ? err.message : 'Unknown',
      });
      throw new BadRequestException({
        type: 'pdf_parse_error',
        title: 'PDF Parse Error',
        status: 400,
        detail: 'Could not extract text from this PDF. It may be image-only or corrupted.',
      });
    }
    if (!text) {
      throw new BadRequestException({
        type: 'pdf_empty',
        title: 'No Text Found',
        status: 400,
        detail: 'No text could be extracted from this PDF. It may be image-only.',
      });
    }

    return text.substring(0, 3000);
  }

  /**
   * Saves company details during onboarding step 1.
   * Updates the tenant record with company name, industry, and description.
   * Also creates/updates the User record so chat FK constraints are satisfied.
   * Sets tenant status to ONBOARDING if currently DRAFT.
   */
  async setupCompany(
    tenantId: string,
    userId: string,
    companyName: string,
    industry: string,
    description?: string,
    websiteUrl?: string
  ): Promise<void> {
    this.logger.log({
      message: 'Setting up company details',
      tenantId,
      userId,
      companyName,
      industry,
      websiteUrl,
    });

    const existing = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    if (existing) {
      await this.prisma.tenant.update({
        where: { id: tenantId },
        data: {
          name: companyName,
          industry,
          description: description ?? null,
          status:
            existing.status === PrismaTenantStatus.DRAFT
              ? PrismaTenantStatus.ONBOARDING
              : existing.status,
        },
      });
    } else {
      await this.prisma.tenant.create({
        data: {
          id: tenantId,
          name: companyName,
          industry,
          description: description ?? null,
          status: PrismaTenantStatus.ONBOARDING,
        },
      });
    }

    // Ensure User record exists (fixes chat FK violation)
    await this.prisma.user.upsert({
      where: { id: userId },
      create: {
        id: userId,
        email: `${userId}@mentor-ai.local`,
        name: companyName,
        role: UserRole.TENANT_OWNER,
        tenantId,
      },
      update: {},
    });

    // Fetch website content if URL provided — enrich description with extracted data
    if (websiteUrl && this.webSearchService.isAvailable()) {
      try {
        const websiteContent = await this.webSearchService.fetchWebpage(websiteUrl);
        if (websiteContent) {
          const enrichedDesc = [
            description,
            `\n\n--- Website Content (${websiteUrl}) ---\n${websiteContent}`,
          ]
            .filter(Boolean)
            .join('');
          await this.prisma.tenant.update({
            where: { id: tenantId },
            data: { description: enrichedDesc.substring(0, 5000) },
          });
          this.logger.log({
            message: 'Enriched tenant description with website content',
            tenantId,
            websiteUrl,
            contentLength: websiteContent.length,
          });
        }
      } catch (err) {
        this.logger.warn({
          message: 'Failed to fetch website content (non-blocking)',
          websiteUrl,
          error: err instanceof Error ? err.message : 'Unknown',
        });
      }
    }

    this.logger.log({
      message: 'Company details and user record saved',
      tenantId,
      userId,
    });
  }

  /**
   * Sets the user's department during onboarding (Story 3.2).
   * null = owner/CEO (sees all categories).
   */
  async setDepartment(userId: string, department: string | null): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { department: (department as Department) ?? null },
    });
  }

  /**
   * Gets the current onboarding status for a user.
   */
  async getStatus(tenantId: string, userId: string): Promise<OnboardingStatus> {
    this.logger.log({
      message: 'Getting onboarding status',
      tenantId,
      userId,
    });

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { status: true },
    });

    if (!tenant) {
      this.logger.log({
        message: 'Tenant not found, returning DRAFT status for onboarding',
        tenantId,
      });
      return {
        currentStep: 1 as const,
        tenantStatus: 'DRAFT' as TenantStatus,
        selectedIndustry: undefined,
        selectedTaskId: undefined,
        startedAt: undefined,
      };
    }

    // If user already has conversations, they've used the system — skip onboarding
    const conversationCount = await this.prisma.conversation.count({
      where: { userId },
    });

    if (conversationCount > 0) {
      // Auto-upgrade tenant to ACTIVE if still in DRAFT/ONBOARDING
      if (tenant.status === 'DRAFT' || tenant.status === 'ONBOARDING') {
        await this.prisma.tenant.update({
          where: { id: tenantId },
          data: { status: 'ACTIVE' },
        });
        this.logger.log({
          message: 'Auto-upgraded tenant to ACTIVE (user has existing conversations)',
          tenantId,
          userId,
          conversationCount,
        });
      }
      return {
        currentStep: 'complete' as const,
        tenantStatus: 'ACTIVE' as TenantStatus,
        selectedIndustry: undefined,
        selectedTaskId: undefined,
        startedAt: undefined,
      };
    }

    const metric = await this.metricService.getMetric(userId);

    let currentStep: 1 | 2 | 3 | 'complete' = 1;
    if (metric?.completedAt) {
      currentStep = 'complete';
    } else if (metric?.quickTaskType) {
      currentStep = 3;
    } else if (metric?.industry) {
      currentStep = 2;
    }

    return {
      currentStep,
      tenantStatus: tenant.status as TenantStatus,
      selectedIndustry: metric?.industry,
      selectedTaskId: metric?.quickTaskType,
      startedAt: metric?.startedAt,
    };
  }

  /**
   * Analyses the user's business using AI.
   * Fetches tenant details and generates a comprehensive business analysis.
   */
  async analyseBusiness(
    tenantId: string,
    userId: string,
    businessState: string,
    departments: string[]
  ): Promise<{ output: string; generationTimeMs: number }> {
    this.logger.log({
      message: 'Analysing business',
      tenantId,
      userId,
      departments,
    });

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, industry: true, description: true },
    });

    const companyName = tenant?.name ?? 'Unknown Company';
    const industry = tenant?.industry ?? 'General';
    const companyDescription = tenant?.description ?? '';

    const systemPrompt = `You are a senior business consultant with 20+ years of experience across multiple industries. You provide clear, actionable analysis grounded in proven business frameworks.

Analyze the following business and provide:
1. **Business Overview** — A concise summary of where the business stands
2. **Strengths** — 3-5 key strengths to leverage
3. **Opportunities** — 3-5 growth opportunities specific to their industry and situation
4. **Risk Areas** — 2-3 potential risks or challenges to watch
5. **Strategic Recommendations** — 3-5 concrete, prioritized next steps

Be specific and practical. Avoid generic advice. Reference their industry, departments, and current state directly.`;

    const userPrompt = `Company: ${companyName}
Industry: ${industry}
${companyDescription ? `Description: ${companyDescription}` : ''}

Current Business State: ${businessState}

Active Departments/Functions: ${departments.join(', ')}

Please provide a comprehensive business analysis.`;

    const startTime = Date.now();
    let fullOutput = '';

    const result = await this.aiGateway.streamCompletionWithContext(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { tenantId, userId, skipRateLimit: true, skipQuotaCheck: true },
      (chunk: string) => {
        fullOutput += chunk;
      }
    );

    const generationTimeMs = Date.now() - startTime;

    this.logger.log({
      message: 'Business analysis completed',
      tenantId,
      userId,
      generationTimeMs,
      tokens: result.inputTokens + result.outputTokens,
    });

    return { output: fullOutput, generationTimeMs };
  }

  /**
   * Creates a "Business Brain" — auto-generates personalized tasks and focus areas
   * based on the business profile and available concepts.
   */
  async createBusinessBrain(
    tenantId: string,
    userId: string,
    businessState: string,
    departments: string[]
  ): Promise<{ output: string; generationTimeMs: number }> {
    this.logger.log({
      message: 'Creating business brain',
      tenantId,
      userId,
      departments,
    });

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, industry: true, description: true },
    });

    const companyName = tenant?.name ?? 'Unknown Company';
    const industry = tenant?.industry ?? 'General';
    const companyDescription = tenant?.description ?? '';

    // Fetch relevant concepts to ground the business brain in domain knowledge
    const conceptsResult = await this.conceptService.findAll({ limit: 30 });
    const conceptSummaries = conceptsResult.data
      .map((c) => `- ${c.name} (${c.category}): ${c.definition}`)
      .join('\n');

    const systemPrompt = `You are a senior business strategist and management consultant with 20+ years of experience. Your task is to create a personalized "Business Brain" — a set of actionable, prioritized tasks that will drive measurable business improvement.

For each task, provide:
1. **Title** — Clear, action-oriented title
2. **Description** — 2-3 sentences explaining what to do and WHY it matters for this specific business
3. **Priority** — High / Medium / Low
4. **Department** — Which department owns this task
5. **Related Concept** — Which business concept from the provided list this task applies

Generate 8-10 tasks. Be specific to the company's industry, current state, and departments. Avoid generic advice.`;

    const userPrompt = `Company: ${companyName}
Industry: ${industry}
${companyDescription ? `Description: ${companyDescription}` : ''}

Current Business State: ${businessState}

Active Departments: ${departments.join(', ')}

Available Business Concepts:
${conceptSummaries}

Generate a personalized Business Brain with 8-10 prioritized tasks.`;

    const startTime = Date.now();
    let fullOutput = '';

    const result = await this.aiGateway.streamCompletionWithContext(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      { tenantId, userId, skipRateLimit: true, skipQuotaCheck: true },
      (chunk: string) => {
        fullOutput += chunk;
      }
    );

    const generationTimeMs = Date.now() - startTime;

    this.logger.log({
      message: 'Business brain created',
      tenantId,
      userId,
      generationTimeMs,
      tokens: result.inputTokens + result.outputTokens,
    });

    return { output: fullOutput, generationTimeMs };
  }

  /**
   * Gets available quick tasks for an industry.
   */
  getTasksForIndustry(industry: string): QuickTask[] {
    const tasks = getTasksByIndustry(industry);

    this.logger.log({
      message: 'Retrieved tasks for industry',
      industry,
      taskCount: tasks.length,
    });

    return tasks;
  }

  /**
   * Gets all available quick tasks.
   */
  getAllTasks(): QuickTask[] {
    return QUICK_TASK_TEMPLATES;
  }

  /**
   * Executes a quick win task using the AI Gateway.
   */
  async executeQuickWin(
    tenantId: string,
    userId: string,
    taskId: string,
    userContext: string,
    industry: string
  ): Promise<QuickWinResponse> {
    this.logger.log({
      message: 'Executing quick win task',
      tenantId,
      userId,
      taskId,
      industry,
      contextLength: userContext.length,
    });

    const task = getTaskById(taskId);
    if (!task) {
      throw new BadRequestException({
        type: 'invalid_task',
        title: 'Invalid Task',
        status: 400,
        detail: `Task with ID '${taskId}' does not exist`,
      });
    }

    const hasIncomplete = await this.metricService.hasIncompleteOnboarding(userId);
    if (!hasIncomplete) {
      await this.metricService.startOnboarding(tenantId, userId, industry, taskId);
    }

    const systemPrompt = generateSystemPrompt(task, industry);
    const userPrompt = generateUserPrompt(task, userContext);

    const startTime = Date.now();
    let fullOutput = '';
    let tokensUsed = 0;

    try {
      const result = await this.aiGateway.streamCompletionWithContext(
        [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        { tenantId, userId, skipRateLimit: true, skipQuotaCheck: true },
        (chunk: string) => {
          fullOutput += chunk;
        }
      );

      tokensUsed = result.inputTokens + result.outputTokens;
    } catch (error) {
      this.logger.error({
        message: 'AI Gateway error during quick win',
        tenantId,
        userId,
        taskId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }

    const generationTimeMs = Date.now() - startTime;

    this.logger.log({
      message: 'Quick win task completed',
      tenantId,
      userId,
      taskId,
      generationTimeMs,
      tokensUsed,
      outputLength: fullOutput.length,
    });

    return {
      output: fullOutput,
      generationTimeMs,
      tokensUsed,
    };
  }

  /**
   * Completes the onboarding flow, saves the note, and transitions tenant to ACTIVE.
   */
  async completeOnboarding(
    tenantId: string,
    userId: string,
    taskId: string,
    generatedOutput: string,
    executionMode?: string
  ): Promise<OnboardingCompleteResponse> {
    this.logger.log({
      message: 'Completing onboarding',
      tenantId,
      userId,
      taskId,
    });

    // Determine note title based on strategy or task
    let noteTitle = 'Onboarding Quick Win';
    let timeSavedMinutes = 15;

    if (taskId === 'ANALYSE_BUSINESS') {
      noteTitle = 'Business Analysis';
      timeSavedMinutes = 30;
    } else if (taskId === 'CREATE_BUSINESS_BRAIN') {
      noteTitle = 'Business Brain — Tasks & Focus Areas';
      timeSavedMinutes = 45;
    } else {
      const task = getTaskById(taskId);
      if (task) {
        noteTitle = task.name;
        timeSavedMinutes = task.estimatedTimeSaved;
      }
    }

    // Update tenant status to ACTIVE
    await this.updateTenantStatus(tenantId);

    // Complete the onboarding metric
    await this.metricService.completeOnboarding(userId);

    // Save the generated output as a note
    const note = await this.notesService.createNote({
      title: noteTitle,
      content: generatedOutput,
      source: NoteSource.ONBOARDING,
      userId,
      tenantId,
    });

    // Generate initial action plan from business context via embeddings
    let welcomeConversationId: string | null = null;
    try {
      welcomeConversationId = await this.generateInitialPlan(tenantId, userId);
    } catch (err) {
      this.logger.warn({
        message: 'Initial plan generation failed (non-blocking)',
        tenantId,
        userId,
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }

    // Story 3.2: Seed Brain pending tasks based on user's department (fire-and-forget)
    // Loads user's department from DB and seeds concept tasks accordingly
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { department: true, role: true },
    });
    this.brainSeedingService
      .seedPendingTasksForUser(
        userId,
        tenantId,
        (user?.department as string) ?? null,
        user?.role ?? 'TENANT_OWNER'
      )
      .catch((err) => {
        this.logger.warn({
          message: 'Brain seeding failed after onboarding (non-blocking)',
          userId,
          tenantId,
          error: err instanceof Error ? err.message : 'Unknown',
        });
      });

    this.logger.log({
      message: 'Onboarding completed successfully',
      tenantId,
      userId,
      timeSavedMinutes,
      noteId: note.id,
      welcomeConversationId,
    });

    return {
      output: generatedOutput,
      timeSavedMinutes,
      noteId: note.id,
      celebrationMessage: `Congratulations! You just saved ~${timeSavedMinutes} minutes!`,
      newTenantStatus: 'ACTIVE' as TenantStatus,
      welcomeConversationId: welcomeConversationId ?? undefined,
      executionMode: (executionMode as 'MANUAL' | 'YOLO') ?? undefined,
    };
  }

  /**
   * Generates initial action plan by searching Qdrant embeddings with business context.
   * Multi-query approach for maximum coverage, diversified across categories.
   * Creates a welcome conversation with task list.
   */
  private async generateInitialPlan(tenantId: string, userId: string): Promise<string | null> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, industry: true, description: true },
    });
    if (!tenant) return null;

    // Multi-query approach for maximum concept coverage
    const queries = [
      tenant.industry,
      tenant.description,
      [tenant.name, tenant.industry, tenant.description].filter(Boolean).join('. '),
    ].filter(Boolean) as string[];

    const allMatches = new Map<string, ConceptMatch>();
    for (const query of queries) {
      const matches = await this.conceptMatchingService
        .findRelevantConcepts(query, { limit: 20, threshold: 0.3 })
        .catch(() => [] as ConceptMatch[]);
      for (const m of matches) {
        const existing = allMatches.get(m.conceptId);
        if (!existing || m.score > existing.score) {
          allMatches.set(m.conceptId, m);
        }
      }
    }

    // Diversify: max 5 per category, sorted by score
    const byCategory = new Map<string, ConceptMatch[]>();
    for (const m of allMatches.values()) {
      const cat = m.category ?? 'General';
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(m);
    }
    const diversified: ConceptMatch[] = [];
    for (const [, concepts] of byCategory) {
      concepts.sort((a, b) => b.score - a.score);
      diversified.push(...concepts.slice(0, 5));
    }
    diversified.sort((a, b) => b.score - a.score);

    if (diversified.length === 0) {
      this.logger.warn({ message: 'No concepts found for initial plan', tenantId });
      return null;
    }

    // Create TASK notes for each matched concept
    for (const match of diversified) {
      const title = this.buildActionTitle(match.conceptName);
      await this.notesService.createNote({
        title,
        content: `Primenite ${match.conceptName} na vaše poslovanje: ${match.definition}`,
        source: NoteSource.ONBOARDING,
        noteType: NoteType.TASK,
        status: NoteStatus.PENDING,
        conceptId: match.conceptId,
        userId,
        tenantId,
      });
    }

    // Build concept summaries for narrative welcome message generation
    const conceptSummaries = diversified
      .map((m, i) => {
        const title = this.buildActionTitle(m.conceptName);
        return `${i + 1}. "${title}" — Koncept: ${m.conceptName}, Definicija: ${m.definition}`;
      })
      .join('\n');

    // Generate narrative welcome message via LLM (explains WHY each task matters)
    const welcomeSystemPrompt = `Ti si poslovni savetnik koji upoznaje klijenta sa personalizovanim akcionim planom.

Napiši dobrodošlicu koja:
1. Pozdravi klijenta i kratko rezimira njihov poslovni profil (1-2 rečenice)
2. Objasni ZAŠTO je svaki zadatak važan za NJIHOVO konkretno poslovanje
3. Objasni REDOSLED — zašto počinjemo sa zadatkom #1, kako svaki naredni nadograđuje prethodni
4. Preporuči da počnu sa zadatkom #1 i objasni zašto

PRAVILA:
- NE koristi [[Naziv Koncepta]] oznake — ovo je pregled plana, ne isporučeni dokument
- NE nabraja korake kao suvu listu — objasni poslovnu vrednost svakog
- Koristi ime kompanije i industrije
- Piši toplo ali profesionalno, kao iskusan konsultant
- Na kraju dodaj instrukcije: odgovorite "da" za sve zadatke, "pokreni 1, 3, 5" za izbor, ili "pokreni prvi" za samo prvi
- Piši ISKLJUČIVO na srpskom jeziku
- Maksimum 400 reči`;

    const welcomeUserPrompt = `Kompanija: ${tenant?.name ?? 'Nepoznata'}
Industrija: ${tenant?.industry ?? 'Opšta'}
${tenant?.description ? `Opis: ${tenant.description}` : ''}

Pripremljeni zadaci (po redosledu):
${conceptSummaries}

Napiši personalizovanu dobrodošlicu.`;

    let welcomeMsg = '';
    try {
      await this.aiGateway.streamCompletionWithContext(
        [
          { role: 'system', content: welcomeSystemPrompt },
          { role: 'user', content: welcomeUserPrompt },
        ],
        { tenantId, userId, skipRateLimit: true, skipQuotaCheck: true },
        (chunk: string) => {
          welcomeMsg += chunk;
        }
      );
    } catch (err) {
      this.logger.warn({
        message: 'Failed to generate narrative welcome message, using fallback',
        error: err instanceof Error ? err.message : 'Unknown',
      });
      // Fallback to simple template if LLM fails
      const taskList = diversified
        .map(
          (m, i) =>
            `${i + 1}. **${this.buildActionTitle(m.conceptName)}**${i === 0 ? ' (preporučeno)' : ''}`
        )
        .join('\n');
      welcomeMsg = `Dobrodošli! Pripremili smo ${diversified.length} zadataka za vaše poslovanje:\n\n${taskList}\n\nOdgovorite "da" da pokrenete sve zadatke.`;
    }

    // Create welcome conversation linked to the first matched concept
    const conversation = await this.conversationService.createConversation(
      tenantId,
      userId,
      'Dobrodošli u Mentor AI',
      undefined, // personaType
      diversified[0]?.conceptId // link to first matched concept for tree display
    );
    await this.conversationService.addMessage(
      tenantId,
      conversation.id,
      'ASSISTANT' as MessageRole,
      welcomeMsg
    );

    // Link all onboarding task notes to the welcome conversation
    // so they appear in the notes panel when viewing this conversation
    const conceptIds = diversified.map((m) => m.conceptId);
    await this.notesService.linkNotesToConversation(conceptIds, conversation.id, userId, tenantId);

    this.logger.log({
      message: 'Initial plan generated from embeddings',
      tenantId,
      userId,
      taskCount: diversified.length,
      concepts: diversified.map((m) => m.conceptName),
      welcomeConversationId: conversation.id,
    });

    return conversation.id;
  }

  private buildActionTitle(conceptName: string): string {
    const lower = conceptName.toLowerCase();
    if (lower.includes('swot')) return 'Izvršite SWOT Analizu';
    if (lower.includes('value proposition')) return 'Definišite Vrednosnu Ponudu';
    if (lower.includes('marketing plan') || lower.includes('marketing strategy'))
      return 'Kreirajte Marketing Plan';
    if (lower.includes('business model')) return 'Mapirajte Poslovni Model';
    if (lower.includes('cash flow')) return 'Analizirajte Novčani Tok';
    if (lower.includes('pricing')) return 'Razvijte Strategiju Cena';
    if (lower.includes('competitor') || lower.includes('competitive'))
      return 'Analizirajte Konkurenciju';
    if (lower.includes('target market') || lower.includes('segmentation'))
      return 'Definišite Ciljno Tržište';
    if (lower.includes('financial plan')) return 'Kreirajte Finansijski Plan';
    if (lower.includes('brand')) return 'Razvijte Strategiju Brenda';
    return `Primenite ${conceptName}`;
  }

  /**
   * Updates the tenant status from ONBOARDING to ACTIVE.
   */
  private async updateTenantStatus(tenantId: string): Promise<void> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { status: true },
    });

    if (!tenant) {
      throw new NotFoundException({
        type: 'tenant_not_found',
        title: 'Tenant Not Found',
        status: 404,
        detail: 'Cannot update status for non-existent tenant',
      });
    }

    if (
      tenant.status !== PrismaTenantStatus.DRAFT &&
      tenant.status !== PrismaTenantStatus.ONBOARDING
    ) {
      this.logger.log({
        message: 'Tenant already active, skipping status update',
        tenantId,
        currentStatus: tenant.status,
      });
      return;
    }

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { status: PrismaTenantStatus.ACTIVE },
    });

    this.logger.log({
      message: 'Tenant status updated to ACTIVE',
      tenantId,
      previousStatus: tenant.status,
      newStatus: 'ACTIVE',
    });
  }
}
