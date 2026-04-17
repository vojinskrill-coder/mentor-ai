import { Injectable, Logger, NotFoundException, BadRequestException, Inject, Optional, forwardRef } from '@nestjs/common';
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
import { ConceptClassifierService } from '../knowledge/services/concept-classifier.service';
import { WorkflowService } from '../workflow/workflow.service';
import { MaturityEngineService } from '../maturity/maturity-engine.service';
import { MaturityStage } from '@mentor-ai/shared/types';
import { OnboardingMetricService } from './onboarding-metric.service';
import {
  QUICK_TASK_TEMPLATES,
  getTasksByIndustry,
  getTaskById,
  generateSystemPrompt,
  generateUserPrompt,
} from './templates/quick-task-templates';
import { FOUNDATION_CATEGORIES } from '../knowledge/config/department-categories';
import { AppEventBus, APP_EVENTS } from '../events/app-event-bus.service';
import { BridgeService, BRIDGE_EVENTS } from '../bridge/bridge.service';
import { WebCrawlerService } from '../openclaw-tenant/web-crawler.service';
import { BusinessProfileService } from '../openclaw-tenant/business-profile.service';
import { SoulGeneratorService } from '../openclaw-tenant/soul-generator.service';
import { OpenClawTenantService } from '../openclaw-tenant/openclaw-tenant.service';
import { OpenClawClientService } from '../agent-execution/openclaw-client.service';
import { OnboardingOrchestratorService } from '../onboarding-orchestrator/onboarding-orchestrator.service';

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
    private readonly brainSeedingService: BrainSeedingService,
    private readonly conceptClassifierService: ConceptClassifierService,
    private readonly workflowService: WorkflowService,
    private readonly maturityEngineService: MaturityEngineService,
    private readonly eventBus: AppEventBus,
    private readonly webCrawlerService: WebCrawlerService,
    private readonly businessProfileService: BusinessProfileService,
    private readonly soulGeneratorService: SoulGeneratorService,
    private readonly openClawTenantService: OpenClawTenantService,
    private readonly openClawClient: OpenClawClientService,
    @Inject(forwardRef(() => BridgeService))
    private readonly bridgeService: BridgeService,
    @Optional() private readonly orchestrator?: OnboardingOrchestratorService,
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

    // Fire-and-forget: provision OpenClaw tenant profile in background
    this.provisionOpenClawTenant(tenantId, companyName, websiteUrl).catch(err => {
      this.logger.warn({
        message: 'OpenClaw tenant provisioning failed (non-blocking)',
        tenantId,
        error: err instanceof Error ? err.message : 'Unknown',
      });
    });
  }

  /**
   * Provisions a dedicated OpenClaw agent profile for this tenant.
   * Crawls the website, generates SOUL.MD per agent, deploys to Hetzner.
   * Runs in background — does not block onboarding flow.
   */
  private async provisionOpenClawTenant(
    tenantId: string,
    companyName: string,
    websiteUrl?: string,
  ): Promise<void> {
    // Check if already provisioned
    const exists = await this.openClawTenantService.tenantExists(tenantId);
    if (exists) {
      this.logger.log({ message: 'OpenClaw tenant already provisioned', tenantId });
      return;
    }

    this.logger.log({ message: 'Starting OpenClaw tenant provisioning', tenantId, websiteUrl });
    const startTime = Date.now();

    // Step 1: Crawl website (if URL provided)
    let crawlResult;
    if (websiteUrl) {
      crawlResult = await this.webCrawlerService.crawlWebsite(websiteUrl);
      this.logger.log({ message: 'Website crawled', tenantId, pages: crawlResult.pages.length });
    }

    // Step 2: Generate business profile
    const profile = crawlResult
      ? await this.businessProfileService.analyzeWebsite(crawlResult, companyName)
      : {
          companyName,
          industry: 'Unknown',
          description: companyName,
          products: [] as string[],
          services: [] as string[],
          targetClients: [] as string[],
          geography: 'Unknown',
          brandVoice: 'Professional',
          competitors: [] as string[],
          uniqueValue: '',
          priceRange: '',
          teamDescription: '',
          visualStyle: 'Professional',
          keyMetrics: {},
          rawSummary: companyName,
        };

    // Step 3: Generate SOUL.MD files
    const souls = await this.soulGeneratorService.generateAllSouls(profile);

    // Step 4: Deploy to Hetzner
    const result = await this.openClawTenantService.provisionTenant(tenantId, profile, souls);

    this.logger.log({
      message: `OpenClaw tenant provisioning ${result.success ? 'completed' : 'failed'}`,
      tenantId,
      durationMs: Date.now() - startTime,
      error: result.error,
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

    const companyName = tenant?.name ?? 'Unknown company';
    const industry = tenant?.industry ?? 'General';
    const companyDescription = tenant?.description ?? '';

    // 1. Web search for industry context — trends, competitors, market data
    let webContext = '';
    if (this.webSearchService.isAvailable()) {
      try {
        const searchQueries = [
          `${industry} market trends 2025 2026`,
          `${companyName} ${industry} competition analysis`,
        ];
        const allResults = await Promise.all(
          searchQueries.map((q) => this.webSearchService.searchAndExtract(q, 3).catch(() => []))
        );
        const combined = allResults.flat();
        if (combined.length > 0) {
          webContext = this.webSearchService.formatSourcesAsObsidian(combined);
        }
      } catch (err) {
        this.logger.warn({
          message: 'Web search failed during business analysis (non-blocking)',
          error: err instanceof Error ? err.message : 'Unknown',
        });
      }
    }

    // 2. Load knowledge base concepts: foundation first, then keyword-matched
    let conceptContext = '';
    try {
      // Always include foundation concepts (Uvod u Poslovanje, Vrednost) — the starting point
      const foundationConcepts = await this.prisma.concept.findMany({
        where: {
          OR: [
            ...FOUNDATION_CATEGORIES.flatMap((cat) => [
              { category: cat },
              { category: { endsWith: cat } },
            ]),
          ],
        },
        select: { id: true, name: true, category: true, definition: true },
        orderBy: { sortOrder: 'asc' },
      });

      // Then find industry/business-relevant concepts via keyword matching
      const query = [companyName, industry, companyDescription].filter(Boolean).join('. ');
      const keywordMatches = await this.conceptMatchingService.findRelevantConcepts(query, {
        limit: 15,
        threshold: 0.3,
      });

      // Merge: foundation first (deduped), then keyword matches
      const foundationIds = new Set(foundationConcepts.map((c) => c.id));
      const allConcepts = [
        ...foundationConcepts.map((c) => ({
          name: c.name,
          category: c.category ?? 'Uvod u Poslovanje',
          definition: c.definition ?? '',
        })),
        ...keywordMatches
          .filter((m) => !foundationIds.has(m.conceptId))
          .map((m) => ({
            name: m.conceptName,
            category: m.category as string,
            definition: m.definition,
          })),
      ];

      if (allConcepts.length > 0) {
        conceptContext = '\n\n--- RELEVANT BUSINESS CONCEPTS FROM KNOWLEDGE BASE ---\n';
        conceptContext +=
          'Start from FOUNDATIONS (Introduction to Business, Value) then build with specific concepts:\n\n';
        conceptContext += allConcepts
          .map((c) => `- **${c.name}** (${c.category}): ${c.definition}`)
          .join('\n');
        conceptContext += '\n--- END OF CONCEPTS ---';
        conceptContext +=
          '\nUse these concepts as a basis for concrete recommendations. Link each recommendation to a relevant concept.';
      }
    } catch {
      // Non-blocking — concepts may not be seeded yet
    }

    const systemPrompt = `You are a leading business consultant specialized in the ${industry} sector.
Your task is to create a DEEP, CONTEXTUALIZED business analysis that will give the owner a clear picture of where they stand and where they need to go.

THIS IS NOT A GENERIC ANALYSIS. Every insight must be specific to this company, this industry, this market.

ANALYSIS STRUCTURE:

## 1. Current State Diagnosis (300-500 words)
- Where the company REALLY stands — no sugarcoating
- What are the key indicators of business health
- What works and what doesn't — concretely, with examples from their industry

## 2. Market and Competition Analysis (300-500 words)
- What is the state of the ${industry} sector — trends, opportunities, threats
- Who are the main competitors and how does this company position itself
- Which market niches are untapped
- Use data from web research if available

## 3. Strategic Advantages (200-300 words)
- 3-5 concrete advantages the company can leverage IMMEDIATELY
- For each advantage: WHY it is an advantage and HOW to turn it into profit

## 4. Critical Vulnerabilities (200-300 words)
- 2-4 biggest risks that can DESTROY the business if not addressed
- For each risk: probability, impact, and first mitigation action
- Be direct — the owner needs to know the truth

## 5. Action Plan — First 90 Days (500-700 words)
- 5-8 CONCRETE steps, ordered by priority
- For each step:
  * What exactly needs to be done (not "improve marketing" but "create a landing page for segment X with offer Y")
  * Who is responsible (which department/function)
  * Expected result and KPI for measurement
  * Time frame (week 1-2, week 3-4, month 2-3)
  * Related business concept from the knowledge base (if applicable)

## 6. Long-Term Vision — 12 Months (200-300 words)
- Where the company can be in a year if it follows the plan
- What are the key milestones along the way
- What investments are necessary

RULES:
- Write EXCLUSIVELY in English
- Use a direct, professional tone — as if speaking with the owner
- EVERY recommendation must be SPECIFIC to this company and industry
- DO NOT use generic phrases ("improve marketing", "invest in people")
- Use concrete numbers, percentages, and time frames wherever possible
- If you have data from web research, cite sources inline in format ([Name](URL))
- Total length: 1800-2500 words`;

    const userPrompt = `COMPANY: ${companyName}
INDUSTRY: ${industry}
${companyDescription ? `BUSINESS DESCRIPTION:\n${companyDescription}` : ''}

CURRENT BUSINESS STATE: ${businessState}

ACTIVE DEPARTMENTS: ${departments.join(', ')}
${webContext}
${conceptContext}

Create a deep analysis of this business.`;

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

    const companyName = tenant?.name ?? 'Unknown company';
    const industry = tenant?.industry ?? 'General';
    const companyDescription = tenant?.description ?? '';

    // 1. Web search — industry best practices, competitor strategies, market opportunities
    let webContext = '';
    if (this.webSearchService.isAvailable()) {
      try {
        const searchQueries = [
          `${industry} best practices strategy growth`,
          `${industry} ${departments[0] ?? ''} tasks priorities action plan`,
        ];
        const allResults = await Promise.all(
          searchQueries.map((q) => this.webSearchService.searchAndExtract(q, 3).catch(() => []))
        );
        const combined = allResults.flat();
        if (combined.length > 0) {
          webContext = this.webSearchService.formatSourcesAsObsidian(combined);
        }
      } catch (err) {
        this.logger.warn({
          message: 'Web search failed during brain creation (non-blocking)',
          error: err instanceof Error ? err.message : 'Unknown',
        });
      }
    }

    // 2. Load knowledge base concepts: foundation first, then keyword-matched, then department-relevant
    let conceptContext = '';
    try {
      // Always include foundation concepts (Uvod u Poslovanje, Vrednost)
      const foundationConcepts = await this.prisma.concept.findMany({
        where: {
          OR: [
            ...FOUNDATION_CATEGORIES.flatMap((cat) => [
              { category: cat },
              { category: { endsWith: cat } },
            ]),
          ],
        },
        select: { id: true, name: true, category: true, definition: true },
        orderBy: { sortOrder: 'asc' },
      });
      // Keyword-matched concepts for this business
      const query = [companyName, industry, companyDescription, businessState]
        .filter(Boolean)
        .join('. ');
      const keywordMatches = await this.conceptMatchingService.findRelevantConcepts(query, {
        limit: 25,
        threshold: 0.25,
      });

      // Department-specific concepts (if departments selected)
      const deptCategories = departments.flatMap((dept) => {
        const mapping: Record<string, string[]> = {
          MARKETING: ['Marketing', 'Digitalni Marketing'],
          FINANCE: ['Finansije', 'Računovodstvo'],
          SALES: ['Prodaja', 'Odnosi sa Klijentima'],
          OPERATIONS: ['Operacije', 'Preduzetništvo', 'Menadžment'],
          TECHNOLOGY: ['Tehnologija', 'Inovacije'],
          STRATEGY: ['Strategija', 'Poslovni Modeli', 'Liderstvo'],
          LEGAL: ['Menadžment'],
          CREATIVE: ['Marketing', 'Digitalni Marketing'],
        };
        return mapping[dept] ?? [];
      });
      let deptConcepts: Array<{
        id: string;
        name: string;
        category: string | null;
        definition: string;
      }> = [];
      if (deptCategories.length > 0) {
        deptConcepts = await this.prisma.concept.findMany({
          where: {
            OR: deptCategories.flatMap((cat) => [
              { category: cat },
              { category: { endsWith: cat } },
            ]),
          },
          select: { id: true, name: true, category: true, definition: true },
          orderBy: { sortOrder: 'asc' },
          take: 30,
        });
      }

      // Merge: foundation → keyword matches → department concepts (deduped)
      const seenIds = new Set<string>();
      const allConcepts: Array<{ name: string; category: string; definition: string }> = [];

      for (const c of foundationConcepts) {
        seenIds.add(c.id);
        allConcepts.push({
          name: c.name,
          category: c.category ?? 'Uvod u Poslovanje',
          definition: c.definition ?? '',
        });
      }
      for (const m of keywordMatches) {
        if (!seenIds.has(m.conceptId)) {
          seenIds.add(m.conceptId);
          allConcepts.push({
            name: m.conceptName,
            category: m.category as string,
            definition: m.definition,
          });
        }
      }
      for (const c of deptConcepts) {
        if (!seenIds.has(c.id)) {
          seenIds.add(c.id);
          allConcepts.push({
            name: c.name,
            category: c.category ?? 'General',
            definition: c.definition ?? '',
          });
        }
      }

      if (allConcepts.length > 0) {
        conceptContext = '\n\n--- BUSINESS CONCEPTS DATABASE ---\n';
        conceptContext +=
          'Concepts are ordered by importance: FOUNDATIONS (Introduction to Business, Value) are the base on which everything else is built.\n';
        conceptContext += 'EVERY task MUST be linked to one or more of these concepts:\n\n';
        conceptContext += allConcepts
          .map((c) => `- **${c.name}** (${c.category}): ${c.definition}`)
          .join('\n');
        conceptContext += '\n--- END OF CONCEPTS DATABASE ---';
      }
    } catch {
      // Non-blocking — concepts may not be seeded yet
    }

    const systemPrompt = `You are a business strategist creating a personalized "Business Brain" — a task system that will move the company forward.

Your task is to create EXACTLY 10 CONCRETE, ACTIONABLE tasks tailored to THIS company, THIS industry, and THIS current state.
NO more than 10 — focus is on quality, not quantity. Each task must be detailed enough to start working on immediately.

FOR EACH TASK YOU MUST SPECIFY:

### [Number]. [Task title — action-oriented, clear]
- **Concept:** [Which business concept from the knowledge base is the foundation of this task]
- **Department:** [Which department is responsible]
- **Priority:** CRITICAL / HIGH / MEDIUM
- **Why this:** [2-3 sentences — WHY this task is important for THIS SPECIFIC business. Connect with current state, industry, challenges. Not generic phrases.]
- **What specifically needs to be done:**
  1. [Step 1 — specific, measurable]
  2. [Step 2 — specific, measurable]
  3. [Step 3 — specific, measurable]
- **Expected result:** [What the company will have/know/achieve when completed]
- **KPI for measurement:** [Concrete metric — number, percentage, deadline]
- **Time frame:** [Week 1-2 / Month 1 / Month 2-3]
- **Depends on:** [Which previous tasks must be completed before this one — or "Independent"]

TASK ORDER:
- FIRST task MUST be linked to the concept "Introduction to Business" / "Business" — this is the FOUNDATION on which everything else is built
- Then DIAGNOSTIC tasks (analysis, mapping, audit) — the owner must first UNDERSTAND where they are
- Then STRATEGIC tasks (defining position, goals, plan)
- Then OPERATIONAL tasks (implementation, creating processes)
- Finally OPTIMIZATION tasks (measurement, improvement, scaling)

GROUP by departments: ${departments.join(', ')}
Each department should have minimum 2 tasks.

RULES:
- Write EXCLUSIVELY in English
- DO NOT use generic tasks ("improve communication", "invest in team")
- EVERY task must be specific enough that the owner can start working on it IMMEDIATELY
- Use data from web research for market-based recommendations
- You MUST link each task to a concept from the knowledge base
- If you have web data, cite sources inline ([Name](URL))
- Total length: 2000-3000 words`;

    const userPrompt = `COMPANY: ${companyName}
INDUSTRY: ${industry}
${companyDescription ? `BUSINESS DESCRIPTION:\n${companyDescription}` : ''}

CURRENT BUSINESS STATE: ${businessState}

ACTIVE DEPARTMENTS: ${departments.join(', ')}
${webContext}
${conceptContext}

Create a personalized Business Brain with exactly 10 prioritized tasks.`;

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

    const brainRelayMode = process.env['BRAIN_RELAY_MODE'] === 'true';

    let welcomeConversationId: string | null = null;
    let taskIds: string[] = [];
    let planId: string | undefined;

    if (brainRelayMode) {
      // ── AI BRAIN MODE ──
      // OpenClaw handles all planning, task creation, and execution.
      // AWAITED — frontend shows loading indicator while brain works.
      this.logger.log({ message: 'Brain relay mode: awaiting director briefing', tenantId });

      try {
        const convId = await this.briefOpenClawDirector(tenantId, userId, generatedOutput, taskIds, executionMode);
        if (convId) welcomeConversationId = convId;
      } catch (err) {
        this.logger.warn({
          message: 'OpenClaw director briefing failed',
          tenantId,
          error: err instanceof Error ? err.message : 'Unknown',
        });
      }

    } else {
      // ── LEGACY MODE ──
      // NestJS handles planning, seeding, maturity, and workflow execution.

      // Generate initial action plan from business context via embeddings
      try {
        const planResult = await this.generateInitialPlan(tenantId, userId);
        welcomeConversationId = planResult.conversationId;
        taskIds = planResult.taskIds;
      } catch (err) {
        this.logger.warn({
          message: 'Initial plan generation failed (non-blocking)',
          tenantId,
          userId,
          error: err instanceof Error ? err.message : 'Unknown',
        });
      }

      // Build execution plan and return planId so frontend can load it
      if (taskIds.length > 0 && welcomeConversationId) {
        try {
          const plan = await this.workflowService.buildExecutionPlan(
            taskIds,
            userId,
            tenantId,
            welcomeConversationId
          );
          planId = plan.planId;
          this.logger.log({
            message: 'Execution plan built for onboarding',
            planId: plan.planId,
            taskCount: taskIds.length,
            tenantId,
            userId,
          });
        } catch (err) {
          this.logger.warn({
            message: 'Plan generation failed (non-blocking)',
            tenantId,
            userId,
            error: err instanceof Error ? err.message : 'Unknown',
          });
        }
      }

      // Story 3.2: Seed Brain pending tasks based on user's department
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

      // Initialize BASIC maturity stage
      this.maturityEngineService
        .initializeStage(tenantId, MaturityStage.BASIC, userId)
        .catch((err) => {
          this.logger.warn({
            message: 'Auto-BASIC maturity initialization failed (non-blocking)',
            tenantId,
            userId,
            error: err instanceof Error ? err.message : 'Unknown',
          });
        });

      // Finalize onboarding via orchestrator (DB-backed enrichment pipeline)
      if (this.orchestrator) {
        try {
          const conceptCount = taskIds.length;
          await this.orchestrator.finalizeOnboarding(tenantId, conceptCount);
        } catch (e) {
          this.logger.warn({ message: 'Orchestrator finalization failed (non-blocking)', error: (e as Error).message });
        }
      }

      // Deploy USER.md + AGENTS.md to OpenClaw and brief the director (fire-and-forget)
      this.briefOpenClawDirector(tenantId, userId, generatedOutput, taskIds, executionMode)
        .catch((err) => {
          this.logger.warn({
            message: 'OpenClaw director briefing failed (non-blocking)',
            tenantId,
            error: err instanceof Error ? err.message : 'Unknown',
          });
        });
    } // end legacy mode

    this.logger.log({
      message: 'Onboarding completed successfully',
      tenantId,
      userId,
      timeSavedMinutes,
      noteId: note.id,
      welcomeConversationId,
    });

    this.eventBus.emit(APP_EVENTS.ONBOARDING_COMPLETED, {
      tenantId,
      userId,
      taskId,
      noteId: note.id,
      timeSavedMinutes,
      welcomeConversationId: welcomeConversationId ?? undefined,
    });

    return {
      output: generatedOutput,
      timeSavedMinutes,
      noteId: note.id,
      celebrationMessage: `Čestitamo! Upravo ste uštedeli ~${timeSavedMinutes} minuta!`,
      newTenantStatus: 'ACTIVE' as TenantStatus,
      welcomeConversationId: welcomeConversationId ?? undefined,
      executionMode: (executionMode as 'MANUAL' | 'YOLO') ?? undefined,
      planId,
      taskIds: taskIds.length > 0 ? taskIds : undefined,
    };
  }

  /**
   * Brief the OpenClaw director agent after onboarding completion.
   * Writes USER.md + AGENTS.md to Hetzner, then sends the onboarding analysis
   * and task list so the director can start organizing work.
   */
  private async briefOpenClawDirector(
    tenantId: string,
    userId: string,
    generatedOutput: string,
    taskIds: string[],
    executionMode?: string,
  ): Promise<string | null> {
    // 1. Load tenant profile for USER.md
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, industry: true, description: true },
    });
    if (!tenant) return null;

    // 2. Write USER.md to Hetzner
    try {
      await this.openClawTenantService.writeUserMd(tenantId, {
        companyName: tenant.name,
        industry: tenant.industry,
        description: tenant.description ?? undefined,
        onboardingOutput: generatedOutput.substring(0, 3000),
        strategy: executionMode === 'YOLO' ? 'AUTONOMNO' : 'MANUALNO',
        executionMode: executionMode ?? 'MANUAL',
      });
      this.logger.log({ message: 'USER.md deployed to OpenClaw', tenantId });
    } catch (err) {
      this.logger.warn({
        message: 'USER.md deployment failed',
        tenantId,
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }

    // 3. Write AGENTS.md to Hetzner
    try {
      const bridgeUrl = process.env['OPENCLAW_RELAY_URL']?.replace('/execute', '') ?? 'http://localhost:3000/api';
      await this.openClawTenantService.writeAgentsMd(tenantId, bridgeUrl);
      this.logger.log({ message: 'AGENTS.md deployed to OpenClaw', tenantId });
    } catch (err) {
      this.logger.warn({
        message: 'AGENTS.md deployment failed',
        tenantId,
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }

    // 5. Create welcome conversation
    const conversation = await this.conversationService.createConversation(
      tenantId, userId, `Poslovni Mozak — ${tenant.name}`,
    );
    const welcomeConvId = conversation.id;

    // 5. Build briefing message and save as user message in the conversation
    const briefing = [
      `ONBOARDING ZAVRSEN za ${tenant.name} (${tenant.industry}).`,
      '',
      `VAZNO — tvoj tenantId za sve Bridge API pozive je: ${tenantId}`,
      'Koristi TACNO ovaj tenantId u SVAKOM curl pozivu ka mentor-ai-bridge.',
      '',
      '=== BIZNIS ANALIZA ===',
      generatedOutput.substring(0, 2500),
      '=== KRAJ ANALIZE ===',
      '',
      'TVOJ ZADATAK:',
      '',
      'KORAK 1 — Pretrazi bazu znanja (obavezno uradi SVE ove pretrage):',
      `  curl -s -H "Authorization: Bearer 9b8d2c89d0ff9f2477b9c2b50b4bf1c0a6a01672014cd02d" "http://100.114.192.85:3000/api/bridge/concepts/search?q=prodaja&tenantId=${tenantId}"`,
      `  curl -s -H "Authorization: Bearer 9b8d2c89d0ff9f2477b9c2b50b4bf1c0a6a01672014cd02d" "http://100.114.192.85:3000/api/bridge/concepts/search?q=marketing&tenantId=${tenantId}"`,
      `  curl -s -H "Authorization: Bearer 9b8d2c89d0ff9f2477b9c2b50b4bf1c0a6a01672014cd02d" "http://100.114.192.85:3000/api/bridge/concepts/search?q=finansije&tenantId=${tenantId}"`,
      `  curl -s -H "Authorization: Bearer 9b8d2c89d0ff9f2477b9c2b50b4bf1c0a6a01672014cd02d" "http://100.114.192.85:3000/api/bridge/concepts/search?q=operacije&tenantId=${tenantId}"`,
      `  curl -s -H "Authorization: Bearer 9b8d2c89d0ff9f2477b9c2b50b4bf1c0a6a01672014cd02d" "http://100.114.192.85:3000/api/bridge/concepts/search?q=vrednost&tenantId=${tenantId}"`,
      `  curl -s -H "Authorization: Bearer 9b8d2c89d0ff9f2477b9c2b50b4bf1c0a6a01672014cd02d" "http://100.114.192.85:3000/api/bridge/concepts/search?q=strategija&tenantId=${tenantId}"`,
      `  curl -s -H "Authorization: Bearer 9b8d2c89d0ff9f2477b9c2b50b4bf1c0a6a01672014cd02d" "http://100.114.192.85:3000/api/bridge/concepts/search?q=cena&tenantId=${tenantId}"`,
      'Iz rezultata odaberi koncepte koji su NAJRELEVANTNIJI za analizu biznisa. Zapamti njihove ID-jeve.',
      '',
      'KORAK 2 — Za svaku preporuku kreiraj proposal sa relatedConcepts:',
      `  curl -s -X POST -H "Authorization: Bearer 9b8d2c89d0ff9f2477b9c2b50b4bf1c0a6a01672014cd02d" -H "Content-Type: application/json" "http://100.114.192.85:3000/api/bridge/proposals" -d '{"tenantId":"${tenantId}","canvasBlock":"CANVAS_BLOCK","type":"task_execution","title":"NASLOV","reasoning":"OBRAZLOZENJE","proposedAction":"AKCIJA","estimatedCost":1.5,"priority":"high","relatedConcepts":["CONCEPT_ID"]}'`,
      '',
      'PRAVILA ZA NASLOVE I OPISE (OBAVEZNO):',
      '- title: Konkretan i akcionski. NIKADA ne koristi jednu rec ili kategoriju.',
      '  LOSE: "Marketing", "Prodaja", "Strategija"',
      '  DOBRO: "Kreirati cenovnu strategiju za premium pozicioniranje skulptura"',
      '  DOBRO: "Razviti B2B partnerski program sa arhitektama i dizajnerima"',
      '  DOBRO: "Implementirati CRM sistem za pracenje prodajnog pipeline-a"',
      '',
      '- reasoning: Minimum 4-5 recenica. Objasni CEO-u ZASTO je ovo kriticno. Koristi brojeve.',
      '  Primer: "Trenutno imate 15 klijenata sa prosecnom vrednoscu od 13K EUR. Povecanje prosecne',
      '  vrednosti na 25K kroz upsell strategiju bi donelo dodatnih 180K EUR godisnje bez novih',
      '  klijenata. Bez ovog, rast zavisi iskljucivo od akvizicije koja kosta 5x vise."',
      '',
      '- proposedAction: Korak-po-korak plan sa agentima. Minimum 4 koraka.',
      '  Primer: "1. Research agent istrazuje konkurentske cene (brave-search). 2. Financial agent',
      '  pravi Excel sa cenovnim modelom (excel-xlsx). 3. Content agent pise prodajni pitch.',
      '  4. Designer pravi prezentaciju za klijente (generate-presentation). Output: Excel cenovnik,',
      '  prodajni pitch dokument, prezentacija sa 10 slide-ova."',
      '',
      'canvasBlock: KEY_PARTNERS, KEY_ACTIVITIES, KEY_RESOURCES, VALUE_PROPOSITION, CUSTOMER_RELATIONSHIPS, CHANNELS, CUSTOMER_SEGMENTS, REVENUE_STREAMS, COST_STRUCTURE',
      '',
      'KREIRAJ MINIMUM 5 predloga. Svaki MORA imati relatedConcepts sa concept ID-jevima iz pretrage.',
      '',
      'NA KRAJU OBAVEZNO napisi kratak rezime sta si nasao i sta si kreirao.',
      'Korisnik ce videti tvoj tekstualni odgovor u chatu. Ako ne napises nista, videce praznu poruku.',
    ].join('\n');

    await this.conversationService.addMessage(
      tenantId,
      welcomeConvId,
      'USER' as MessageRole,
      briefing
    );

    // 6. Send to OpenClaw director and save response
    if (!this.openClawClient.isConfigured()) {
      this.logger.warn({ message: 'OpenClaw not configured, skipping director briefing' });
      return welcomeConvId;
    }

    try {
      const result = await this.openClawClient.executeAgent(briefing, {
        agentId: 'main',
        sessionId: welcomeConvId,
        tenantProfile: tenantId,
        timeoutSeconds: 3600, // 1 hour — matches OpenClaw config timeout
        // Streaming callbacks — emit WebSocket events in real-time
        onText: (text) => {
          // Text chunks from director — could be streamed to chat in future
          this.logger.debug({ message: 'Brain briefing chunk', tenantId, len: text.length });
        },
        onTool: (tool, status, query) => {
          // Tool events — director is using skills (search_concepts, brave_search, etc.)
          this.eventBus.emit(BRIDGE_EVENTS.AGENT_STATUS, {
            tenantId,
            taskId: welcomeConvId,
            agent: 'direktor',
            status: status === 'start' ? 'running' : 'completed',
            message: status === 'start'
              ? `Koristi ${tool}${query ? ': ' + query.substring(0, 100) : ''}`
              : `Završio ${tool}`,
            timestamp: new Date().toISOString(),
          });
          this.logger.log({ message: `Brain tool: ${tool} ${status}`, tenantId, query: query?.substring(0, 50) });
        },
        onStatus: (phase) => {
          this.eventBus.emit(BRIDGE_EVENTS.AGENT_STATUS, {
            tenantId,
            taskId: welcomeConvId,
            agent: 'direktor',
            status: 'running',
            message: `Faza: ${phase}`,
            timestamp: new Date().toISOString(),
          });
        },
      });

      // Save director's response as assistant message in the welcome conversation
      const directorOutput = result.output || 'Poslovni mozak je analizirao vaš biznis i kreirao predloge. Pogledajte panel Zadaci za detalje.';
      await this.conversationService.addMessage(
        tenantId,
        welcomeConvId,
        'ASSISTANT' as MessageRole,
        directorOutput
      );

      // Process director's response: extract concepts, create proposals, seed tree
      if (result.output) {
        await this.processDirectorResponse(tenantId, userId, welcomeConvId, result.output, generatedOutput);
      }

      this.eventBus.emit(BRIDGE_EVENTS.AGENT_STATUS, {
        tenantId,
        taskId: welcomeConvId,
        agent: 'direktor',
        status: 'completed',
        message: 'Briefing završen — preporuke i koncepti kreirani',
        timestamp: new Date().toISOString(),
      });

      this.logger.log({
        message: 'OpenClaw director briefed, response processed, proposals created',
        tenantId,
        conversationId: welcomeConvId,
        success: result.success,
        outputLength: result.output?.length ?? 0,
      });
    } catch (err) {
      // Save fallback message
      await this.conversationService.addMessage(
        tenantId,
        welcomeConvId,
        'ASSISTANT' as MessageRole,
        'Poslovni mozak je primio analizu i razmišlja o preporukama. Predlozi će se pojaviti uskoro u panelu Zadaci.'
      ).catch(() => {});

      this.logger.error({
        message: 'Failed to brief OpenClaw director',
        tenantId,
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }

    return welcomeConvId;
  }

  /**
   * Process director's response: extract recommendations, match to concepts,
   * create proposals and tasks visible in the UI.
   */
  private async processDirectorResponse(
    tenantId: string,
    userId: string,
    conversationId: string,
    directorResponse: string,
    businessAnalysis: string,
  ): Promise<void> {
    this.logger.log({ message: 'Processing director response', tenantId, responseLen: directorResponse.length });

    // 1. Extract recommendations from director's numbered list
    const recommendations = this.extractRecommendations(directorResponse);
    this.logger.log({ message: `Extracted ${recommendations.length} recommendations`, tenantId });

    if (recommendations.length === 0) {
      // Fallback: use the business analysis to find concepts
      const fallbackRecs = this.extractRecommendations(businessAnalysis);
      recommendations.push(...fallbackRecs.slice(0, 10));
    }

    // 2. For each recommendation, search knowledge graph and create task + proposal
    const createdTaskIds: string[] = [];
    const matchedConceptIds: string[] = [];

    for (const rec of recommendations.slice(0, 15)) {
      try {
        // Search for matching concept — try multiple search strategies
        let conceptId: string | null = null;

        // Strategy 1: Search by title
        let concepts = await this.bridgeService.searchConcepts(tenantId, rec.title, 3);
        const firstMatch = concepts[0];
        if (firstMatch) {
          conceptId = firstMatch.id;
        }

        // Strategy 2: Extract key business terms and search each
        if (!conceptId) {
          const keywords = this.extractKeyTerms(rec.title + ' ' + rec.description);
          for (const kw of keywords) {
            concepts = await this.bridgeService.searchConcepts(tenantId, kw, 2);
            const kwMatch = concepts[0];
            if (kwMatch) {
              conceptId = kwMatch.id;
              break;
            }
          }
        }

        if (conceptId && !matchedConceptIds.includes(conceptId)) {
          matchedConceptIds.push(conceptId);
        }

        // Determine canvas block from recommendation keywords
        const canvasBlock = this.inferCanvasBlock(rec.title + ' ' + rec.description);

        // Create proposal (visible in Task Hub left panel)
        await this.bridgeService.createProposal({
          tenantId,
          canvasBlock,
          type: 'task_execution',
          title: rec.title,
          reasoning: rec.description,
          proposedAction: rec.description,
          estimatedCost: 1.5,
          priority: rec.priority ?? 'medium',
          relatedConcepts: conceptId ? [conceptId] : [],
        });

        // Also create a TASK (visible in Task Hub right panel)
        const task = await this.bridgeService.createTask({
          tenantId,
          title: rec.title,
          content: rec.description,
          conceptId: conceptId ?? undefined,
          expectedOutcome: rec.expectedOutcome,
        });

        createdTaskIds.push(task.id);
      } catch (err) {
        this.logger.warn({
          message: 'Failed to process recommendation',
          title: rec.title,
          error: err instanceof Error ? err.message : 'Unknown',
        });
      }
    }

    // 3. Emit tree update so frontend refreshes the concept tree
    if (matchedConceptIds.length > 0) {
      this.eventBus.emit(BRIDGE_EVENTS.TREE_UPDATED, {
        tenantId,
        action: 'onboarding_concepts_linked',
        conceptIds: matchedConceptIds,
      });
    }

    this.logger.log({
      message: 'Director response processed',
      tenantId,
      tasksCreated: createdTaskIds.length,
      conceptsMatched: matchedConceptIds.length,
      proposalsCreated: recommendations.length,
    });
  }

  /**
   * Extract structured recommendations from AI text.
   * Handles numbered lists, markdown headings, and bullet points.
   */
  private extractRecommendations(text: string): Array<{
    title: string;
    description: string;
    priority?: string;
    expectedOutcome?: string;
  }> {
    const recommendations: Array<{
      title: string;
      description: string;
      priority?: string;
      expectedOutcome?: string;
    }> = [];

    let match: RegExpExecArray | null;

    // Pattern 1: "### N. **Title** (Category)\n**Zašto:** ...\n**Akcije:** ..."
    // This is the director's preferred format
    const heading = /###?\s*\d*\.?\s*\*\*([^*]+)\*\*[^\n]*\n((?:(?!###?\s)[\s\S])*?)(?=###?\s|\n##\s|$)/g;
    while ((match = heading.exec(text)) !== null) {
      const title = (match[1] ?? '').trim();
      const body = (match[2] ?? '').trim();
      if (title.length > 5 && !recommendations.some(r => r.title === title)) {
        // Extract priority from keywords
        const priority = body.toLowerCase().includes('kritič') || body.toLowerCase().includes('kritičan')
          ? 'critical' : body.toLowerCase().includes('visok') ? 'high' : 'medium';
        recommendations.push({ title, description: body.substring(0, 800), priority });
      }
    }

    if (recommendations.length >= 3) return recommendations;

    // Pattern 2: Numbered bold items: "1. **Title**: description" or "1. **Title** - description"
    const numberedBold = /\d+\.\s*\*\*([^*]+)\*\*[:\s-]*([^\n]+(?:\n(?!\d+\.\s*\*\*).*)*)/g;
    while ((match = numberedBold.exec(text)) !== null) {
      const title = (match[1] ?? '').trim();
      const desc = (match[2] ?? '').trim();
      if (title.length > 5 && !recommendations.some(r => r.title === title)) {
        recommendations.push({ title, description: desc.substring(0, 800) });
      }
    }

    if (recommendations.length >= 3) return recommendations;

    // Pattern 3: Plain numbered: "1. Title\n description"
    const numbered = /\d+\.\s+([^\n*]+)\n((?:(?!\d+\.).*\n?){1,5})/g;
    while ((match = numbered.exec(text)) !== null) {
      const title = (match[1] ?? '').trim();
      const desc = (match[2] ?? '').trim();
      if (title.length > 10 && !recommendations.some(r => r.title === title)) {
        recommendations.push({ title, description: desc.substring(0, 800) });
      }
    }

    return recommendations;
  }

  /**
   * Infer BMC canvas block from task description keywords.
   */
  /**
   * Extract key business terms from text for concept search.
   */
  private extractKeyTerms(text: string): string[] {
    const terms: string[] = [];
    const businessTerms = [
      'prodaj', 'marketing', 'finansij', 'operacij', 'strategij', 'vrednost',
      'klijent', 'cen', 'prihod', 'trošk', 'budžet', 'brand', 'konkurenc',
      'lead', 'pipeline', 'ugovor', 'profit', 'investicij', 'digitalizacij',
      'automatizacij', 'proces', 'tim', 'zaposleni', 'obuk', 'partner',
      'kanal', 'segment', 'retencij', 'lojalnost', 'cash flow', 'ROI',
    ];
    const lower = text.toLowerCase();
    for (const term of businessTerms) {
      if (lower.includes(term)) {
        terms.push(term);
      }
    }
    return terms.slice(0, 5);
  }

  private inferCanvasBlock(text: string): string {
    const lower = text.toLowerCase();
    if (lower.match(/partner|dobavljač|supplier|vendor/)) return 'KEY_PARTNERS';
    if (lower.match(/prodaj|sales|lead|outreach|klijent.*kontakt/)) return 'CUSTOMER_SEGMENTS';
    if (lower.match(/marketing|kampanj|brand|advertis|reklam|SEO|content/)) return 'CHANNELS';
    if (lower.match(/cen[aou]|pricing|pretplat|subscription|revenue|prihod/)) return 'REVENUE_STREAMS';
    if (lower.match(/trošk|cost|budžet|budget|ušteda/)) return 'COST_STRUCTURE';
    if (lower.match(/vrednost|value|ponuda|proposition|benefit/)) return 'VALUE_PROPOSITION';
    if (lower.match(/odnos|relationship|lojalnost|loyalty|retencij|retention/)) return 'CUSTOMER_RELATIONSHIPS';
    if (lower.match(/operacij|process|efikasnost|automat|workflow/)) return 'KEY_ACTIVITIES';
    if (lower.match(/resurs|resource|tim|team|talent|zaposleni/)) return 'KEY_RESOURCES';
    return 'KEY_ACTIVITIES'; // default
  }

  /**
   * Generates initial action plan by searching embeddings with business context.
   * Multi-query approach for maximum coverage, diversified across categories.
   * Creates rich TASK notes with structured content, then a welcome conversation.
   */
  private async generateInitialPlan(
    tenantId: string,
    userId: string
  ): Promise<{ conversationId: string | null; taskIds: string[] }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { name: true, industry: true, description: true },
    });
    if (!tenant) return { conversationId: null, taskIds: [] };

    // Multi-query approach for maximum concept coverage
    const queries = [
      tenant.industry,
      tenant.description,
      [tenant.name, tenant.industry, tenant.description].filter(Boolean).join('. '),
    ].filter(Boolean) as string[];

    // Run all searches in parallel
    const allMatches = new Map<string, ConceptMatch>();
    const searchResults = await Promise.all(
      queries.map((query) =>
        this.conceptMatchingService
          .findRelevantConcepts(query, { limit: 20, threshold: 0.3 })
          .catch(() => [] as ConceptMatch[])
      )
    );
    for (const matches of searchResults) {
      for (const m of matches) {
        const existing = allMatches.get(m.conceptId);
        if (!existing || m.score > existing.score) {
          allMatches.set(m.conceptId, m);
        }
      }
    }

    // Always include foundation concepts
    const foundationConcepts = await this.prisma.concept.findMany({
      where: {
        OR: [
          ...FOUNDATION_CATEGORIES.flatMap((cat) => [
            { category: cat },
            { category: { endsWith: cat } },
          ]),
          { category: 'Poslovanje' },
        ],
      },
      select: { id: true, name: true, category: true, definition: true },
      orderBy: { sortOrder: 'asc' },
    });

    const foundationMatches: ConceptMatch[] = foundationConcepts.map((c) => ({
      conceptId: c.id,
      conceptName: c.name,
      category: (c.category ??
        'Uvod u Poslovanje') as unknown as import('@mentor-ai/shared/types').ConceptCategory,
      definition: c.definition ?? '',
      score: 1.0,
    }));

    // Diversify: max 5 per category, sorted by score
    const byCategory = new Map<string, ConceptMatch[]>();
    const foundationIds = new Set(foundationConcepts.map((c) => c.id));
    for (const m of allMatches.values()) {
      if (foundationIds.has(m.conceptId)) continue;
      const cat = m.category ?? 'General';
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(m);
    }
    const embeddingMatches: ConceptMatch[] = [];
    for (const [, concepts] of byCategory) {
      concepts.sort((a, b) => b.score - a.score);
      embeddingMatches.push(...concepts.slice(0, 5));
    }
    embeddingMatches.sort((a, b) => b.score - a.score);

    const diversified = [...foundationMatches, ...embeddingMatches];

    if (diversified.length === 0) {
      this.logger.warn({ message: 'No concepts found for initial plan', tenantId });
      return { conversationId: null, taskIds: [] };
    }

    // Ensure "Uvod u Poslovanje" foundation concept is first (foundational starting point)
    // Concept names may have number prefixes (e.g., "1. Poslovanje")
    const poslovanjeIdx = diversified.findIndex(
      (m) =>
        m.conceptName === 'Poslovanje' ||
        m.conceptName === '1. Poslovanje' ||
        (m.category as string)?.endsWith('Uvod u Poslovanje')
    );
    if (poslovanjeIdx > 0) {
      const removed = diversified.splice(poslovanjeIdx, 1);
      diversified.unshift(removed[0]!);
    }

    // Limit to top 10 concepts
    let topTasks = diversified.slice(0, 10);

    // Verify low-confidence embedding matches via LLM classifier
    const tenantContext = [tenant.name, tenant.industry, tenant.description]
      .filter(Boolean)
      .join('. ');
    topTasks = await this.verifyConceptMatches(topTasks, tenantContext, tenantId, userId);

    // Load prerequisite relationships for all selected concepts
    const topConceptIds = topTasks.map((m) => m.conceptId);
    const prerequisites = await this.prisma.conceptRelationship.findMany({
      where: {
        sourceConceptId: { in: topConceptIds },
        relationshipType: 'PREREQUISITE',
      },
      select: {
        sourceConceptId: true,
        targetConcept: { select: { name: true } },
      },
    });
    const prereqMap = new Map<string, string[]>();
    for (const rel of prerequisites) {
      const existing = prereqMap.get(rel.sourceConceptId) ?? [];
      existing.push(rel.targetConcept.name);
      prereqMap.set(rel.sourceConceptId, existing);
    }

    // Generate rich task content via LLM — single batched call for all 10 concepts
    const conceptDescriptions = topTasks
      .map((m, i) => {
        const prereqs = prereqMap.get(m.conceptId) ?? [];
        return `${i + 1}. Concept: "${m.conceptName}" | Category: ${m.category} | Definition: ${m.definition}${prereqs.length > 0 ? ` | Prerequisites: ${prereqs.join(', ')}` : ''}`;
      })
      .join('\n');

    const taskEnrichmentSystemPrompt = `You are a business consultant who creates actionable tasks.

For EACH concept, write a structured task in the following format:

---TASK: {ordinal number}---
TITLE: {action-oriented title — verb + concrete action, max 60 characters}
CONTENT:
## Goal
{1-2 sentences: what specifically needs to be achieved for "${tenant.name}" in the "${tenant.industry}" industry}

## Why this is important
{2-3 sentences: business value, what is lost if not done}

## Steps for implementation
1. {Concrete step with description — not generic}
2. {Concrete step with description}
3. {Concrete step with description}
4. {Concrete step with description}
5. {Concrete step with description}

## Expected result
{1-2 sentences: measurable outcome, KPI or deliverable}

## Time frame
{Suggested deadline: 1 week / 2 weeks / 1 month}
---END TASK---

RULES:
- Every title MUST be an action verb: "Analyze...", "Define...", "Create...", "Map...", "Develop...", "Optimize...", "Establish..."
- Steps must be SPECIFIC to "${tenant.name}" and "${tenant.industry}" — not generic
- If the concept has prerequisites, mention them in the "Why this is important" section
- ${tenant.description ? `Company context: ${tenant.description}` : ''}
- Write EXCLUSIVELY in English
- EXACTLY ${topTasks.length} tasks, no more no less`;

    const taskEnrichmentUserPrompt = `Concepts for which tasks need to be created:
${conceptDescriptions}

Generate structured tasks.`;

    let enrichedContent = '';
    try {
      await this.aiGateway.streamCompletionWithContext(
        [
          { role: 'system', content: taskEnrichmentSystemPrompt },
          { role: 'user', content: taskEnrichmentUserPrompt },
        ],
        { tenantId, userId, skipRateLimit: true, skipQuotaCheck: true },
        (chunk: string) => {
          enrichedContent += chunk;
        }
      );
    } catch (err) {
      this.logger.warn({
        message: 'Task enrichment LLM call failed, using template fallback',
        error: err instanceof Error ? err.message : 'Unknown',
      });
    }

    // Parse LLM output into per-task title + content
    const parsedTasks = this.parseEnrichedTasks(enrichedContent, topTasks);

    // Create TASK notes (dedup: skip if task already exists for this concept)
    const createdTaskIds: string[] = [];
    for (let i = 0; i < topTasks.length; i++) {
      const match = topTasks[i]!;
      const parsed = parsedTasks[i];

      const existingId = await this.notesService.findExistingTask(tenantId, {
        conceptId: match.conceptId,
      });
      if (existingId) {
        createdTaskIds.push(existingId);
        continue;
      }

      const title = parsed?.title ?? this.buildActionTitle(match.conceptName);
      const content = parsed?.content ?? this.buildFallbackTaskContent(match, tenant);

      const note = await this.notesService.createNote({
        title,
        content,
        source: NoteSource.ONBOARDING,
        noteType: NoteType.TASK,
        status: NoteStatus.PENDING,
        conceptId: match.conceptId,
        userId,
        tenantId,
      });
      createdTaskIds.push(note.id);
    }

    // Build concept summaries for welcome message
    const conceptSummaries = topTasks
      .map((m, i) => {
        const parsed = parsedTasks[i];
        const title = parsed?.title ?? this.buildActionTitle(m.conceptName);
        return `${i + 1}. "${title}" — Concept: ${m.conceptName}, Definition: ${m.definition}`;
      })
      .join('\n');

    // Generate narrative welcome message via LLM
    const welcomeSystemPrompt = `You are a business advisor introducing the client to a personalized action plan.

Write a welcome message that:
1. Greets the client by company name and summarizes their profile (2-3 sentences)
2. Explains the strategy: WHY these ${topTasks.length} tasks, what is the ultimate goal
3. For EACH task explains WHY it is important for THEIR business (not just the name — business value)
4. Explains the ORDER — why we start with task #1, how each subsequent one builds on the previous
5. At the end clearly suggest the first step

RULES:
- DO NOT use [[Concept Name]] tags
- DO NOT list steps as a dry list — explain the business logic behind each
- Use the company name "${tenant.name}" and industry "${tenant.industry}"
- Write warmly but professionally, like an experienced consultant
- At the end add: reply "yes" for all tasks, "run 1, 3, 5" for selection, or "run first" for just the first
- Write EXCLUSIVELY in English
- Between 500 and 800 words — enough detail for context`;

    const welcomeUserPrompt = `Company: ${tenant.name ?? 'Unknown'}
Industry: ${tenant.industry ?? 'General'}
${tenant.description ? `Description: ${tenant.description}` : ''}

Prepared tasks (in order):
${conceptSummaries}

Write a personalized welcome.`;

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
      const taskList = topTasks
        .map((m, i) => {
          const parsed = parsedTasks[i];
          const title = parsed?.title ?? this.buildActionTitle(m.conceptName);
          return `${i + 1}. **${title}**${i === 0 ? ' (preporučeno)' : ''}`;
        })
        .join('\n');
      welcomeMsg = `Dobrodošli! Pripremili smo ${topTasks.length} zadataka za vaše poslovanje:\n\n${taskList}\n\nOdgovorite "da" da pokrenete sve zadatke.`;
    }

    // Create welcome conversation
    const conversation = await this.conversationService.createConversation(
      tenantId,
      userId,
      'Dobrodošli u Mentor AI',
      undefined,
      topTasks[0]?.conceptId
    );
    await this.conversationService.addMessage(
      tenantId,
      conversation.id,
      'ASSISTANT' as MessageRole,
      welcomeMsg
    );

    // Link task notes to the welcome conversation
    const conceptIds = topTasks.map((m) => m.conceptId);
    await this.notesService.linkNotesToConversation(conceptIds, conversation.id, userId, tenantId);

    this.logger.log({
      message: 'Initial plan generated',
      tenantId,
      userId,
      taskCount: topTasks.length,
      enrichedViaLLM: enrichedContent.length > 0,
      concepts: topTasks.map((m) => m.conceptName),
      welcomeConversationId: conversation.id,
    });

    return { conversationId: conversation.id, taskIds: createdTaskIds };
  }

  /**
   * Verifies low-confidence embedding matches via LLM classifier.
   * Only reclassifies tasks with score < 0.6. Non-blocking — errors keep original.
   */
  private async verifyConceptMatches(
    tasks: ConceptMatch[],
    tenantContext: string,
    tenantId: string,
    userId: string
  ): Promise<ConceptMatch[]> {
    // Run all LLM verifications in parallel to avoid serial latency
    const results = await Promise.allSettled(
      tasks.map(async (task) => {
        // High-confidence matches: keep as-is
        if (task.score >= 0.6) return task;

        // Low-confidence: verify via LLM classifier
        // Construct a realistic user message + AI context for the classifier prompt:
        //   userMessage = what the user wants (concept name in business context)
        //   aiResponse = the concept definition (what the AI matched to)
        const userMessage = `Trebam zadatak za: ${task.conceptName}. ${tenantContext}`;
        const aiResponse = task.definition ?? task.conceptName;
        try {
          const betterMatches = await this.conceptClassifierService.classifyAndMatch(
            userMessage,
            aiResponse,
            { limit: 1, threshold: 0.5 },
            { tenantId, userId }
          );

          if (betterMatches.length > 0 && betterMatches[0]!.conceptId !== task.conceptId) {
            this.logger.log({
              message: 'Onboarding: LLM reclassified concept match',
              original: { id: task.conceptId, name: task.conceptName, score: task.score },
              reclassified: {
                id: betterMatches[0]!.conceptId,
                name: betterMatches[0]!.conceptName,
              },
            });
            return betterMatches[0]!;
          }
        } catch {
          // LLM failure: keep original match
        }
        return task;
      })
    );

    return results.map((r, i) => (r.status === 'fulfilled' ? r.value : tasks[i]!));
  }

  /**
   * Parses LLM-generated enriched task content into per-task title + content.
   * Falls back gracefully if LLM output is malformed.
   */
  private parseEnrichedTasks(
    llmOutput: string,
    concepts: ConceptMatch[]
  ): Array<{ title: string; content: string } | null> {
    if (!llmOutput || llmOutput.trim().length === 0) {
      return concepts.map(() => null);
    }

    // Split by task delimiters
    const taskBlocks = llmOutput.split(/---ZADATAK:\s*\d+---/).filter((b) => b.trim().length > 0);

    return concepts.map((_, index) => {
      const block = taskBlocks[index];
      if (!block) return null;

      // Remove end delimiter if present
      const cleaned = block.replace(/---KRAJ ZADATKA---/g, '').trim();

      // Extract title
      const titleMatch = cleaned.match(/NASLOV:\s*(.+?)(?:\n|$)/);
      const title = titleMatch?.[1]?.trim();
      if (!title) return null;

      // Extract content (everything after SADRŽAJ:)
      const contentMatch = cleaned.match(/SADRŽAJ:\s*([\s\S]+)/);
      const content = contentMatch?.[1]?.trim();
      if (!content) return null;

      return { title, content };
    });
  }

  /**
   * Fallback task content when LLM enrichment fails.
   * Still richer than a single line — includes definition + category context.
   */
  private buildFallbackTaskContent(
    match: ConceptMatch,
    tenant: { name: string | null; industry: string | null }
  ): string {
    return `## Cilj
Primenite koncept "${match.conceptName}" na poslovanje ${tenant.name ?? 'vaše kompanije'} u industriji ${tenant.industry ?? 'vašoj industriji'}.

## Definicija koncepta
${match.definition}

## Kategorija
${match.category}

## Koraci za realizaciju
1. Analizirajte trenutno stanje u kontekstu ovog koncepta
2. Identifikujte ključne oblasti za poboljšanje
3. Definišite konkretne akcije i odgovorne osobe
4. Postavite merljive KPI za praćenje napretka
5. Implementirajte i pratite rezultate`;
  }

  /**
   * Generates an action title for a concept name (Serbian).
   * Uses category-aware verb mapping for natural Serbian titles.
   */
  private buildActionTitle(conceptName: string): string {
    const lower = conceptName.toLowerCase();

    // Category-based Serbian verb prefixes
    if (lower.includes('analiz') || lower.includes('swot') || lower.includes('dijagnos'))
      return `Analizirajte: ${conceptName}`;
    if (lower.includes('plan') || lower.includes('strategij') || lower.includes('model'))
      return `Kreirajte: ${conceptName}`;
    if (lower.includes('vrednost') || lower.includes('ponud') || lower.includes('cen'))
      return `Definišite: ${conceptName}`;
    if (lower.includes('marketing') || lower.includes('brend') || lower.includes('brand'))
      return `Razvijte: ${conceptName}`;
    if (lower.includes('prodaj') || lower.includes('kupac') || lower.includes('klijent'))
      return `Optimizujte: ${conceptName}`;
    if (lower.includes('finans') || lower.includes('budžet') || lower.includes('novčan'))
      return `Analizirajte: ${conceptName}`;
    if (lower.includes('operaci') || lower.includes('proces') || lower.includes('efikas'))
      return `Uspostavite: ${conceptName}`;
    if (lower.includes('tim') || lower.includes('lider') || lower.includes('menadž'))
      return `Razvijte: ${conceptName}`;
    if (lower.includes('inovacij') || lower.includes('tehnolog') || lower.includes('digital'))
      return `Implementirajte: ${conceptName}`;

    // Default: "Primenite" (Apply) — universal action verb
    return `Primenite: ${conceptName}`;
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

    // Keep tenantRegistry in sync
    try {
      await this.prisma.tenantRegistry.update({
        where: { id: tenantId },
        data: { status: PrismaTenantStatus.ACTIVE },
      });
    } catch {
      // Registry entry may not exist in dev/single-DB setups — not critical
    }

    this.logger.log({
      message: 'Tenant status updated to ACTIVE',
      tenantId,
      previousStatus: tenant.status,
      newStatus: 'ACTIVE',
    });
  }
}
