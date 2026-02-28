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
import { WorkflowService } from '../workflow/workflow.service';
import { OnboardingMetricService } from './onboarding-metric.service';
import {
  QUICK_TASK_TEMPLATES,
  getTasksByIndustry,
  getTaskById,
  generateSystemPrompt,
  generateUserPrompt,
} from './templates/quick-task-templates';
import { FOUNDATION_CATEGORIES } from '../knowledge/config/department-categories';

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
    private readonly workflowService: WorkflowService
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

    const companyName = tenant?.name ?? 'Nepoznata kompanija';
    const industry = tenant?.industry ?? 'Opšta';
    const companyDescription = tenant?.description ?? '';

    // 1. Web search for industry context — trends, competitors, market data
    let webContext = '';
    if (this.webSearchService.isAvailable()) {
      try {
        const searchQueries = [
          `${industry} tržište Srbija trendovi 2025 2026`,
          `${companyName} ${industry} konkurencija analiza`,
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
        conceptContext = '\n\n--- RELEVANTNI POSLOVNI KONCEPTI IZ BAZE ZNANJA ---\n';
        conceptContext +=
          'Počni od OSNOVA (Uvod u Poslovanje, Vrednost) pa nadograđuj sa specifičnim konceptima:\n\n';
        conceptContext += allConcepts
          .map((c) => `- **${c.name}** (${c.category}): ${c.definition}`)
          .join('\n');
        conceptContext += '\n--- KRAJ KONCEPTA ---';
        conceptContext +=
          '\nKoristi ove koncepte kao osnovu za konkretne preporuke. Poveži svaku preporuku sa relevantnim konceptom.';
      }
    } catch {
      // Non-blocking — concepts may not be seeded yet
    }

    const systemPrompt = `Ti si vodeći poslovni konsultant specijalizovan za ${industry} sektor na Balkanu i u regionu.
Tvoj zadatak je da napraviš DUBOKU, KONTEKSTUALIZOVANU analizu poslovanja koja će vlasniku dati jasnu sliku gde se nalazi i kuda treba da ide.

OVO NIJE GENERIČKA ANALIZA. Svaki uvid mora biti specifičan za ovu kompaniju, ovu industriju, ovo tržište.

STRUKTURA ANALIZE:

## 1. Dijagnoza Trenutnog Stanja (300-500 reči)
- Gde se kompanija ZAISTA nalazi — bez ulepšavanja
- Koji su ključni pokazatelji zdravlja poslovanja
- Šta funkcioniše, a šta ne — konkretno, sa primerima iz njihove industrije

## 2. Analiza Tržišta i Konkurencije (300-500 reči)
- Kakvo je stanje u ${industry} sektoru — trendovi, prilike, pretnje
- Ko su glavni konkurenti i kako se ova kompanija pozicionira
- Koje su tržišne niše neiskorišćene
- Koristi podatke iz web istraživanja ako su dostupni

## 3. Strateške Prednosti (200-300 reči)
- 3-5 konkretnih prednosti koje kompanija može da iskoristi ODMAH
- Za svaku prednost: ZAŠTO je to prednost i KAKO je pretvoriti u profit

## 4. Kritične Ranjivosti (200-300 reči)
- 2-4 najveća rizika koji mogu da UNIŠTE poslovanje ako se ne reše
- Za svaki rizik: verovatnoća, uticaj, i prva akcija za mitigaciju
- Budi direktan — vlasnik treba da zna istinu

## 5. Akcioni Plan — Prvih 90 Dana (500-700 reči)
- 5-8 KONKRETNIH koraka, poređanih po prioritetu
- Za svaki korak:
  * Šta tačno treba da se uradi (ne "poboljšajte marketing" nego "kreirajte landing stranicu za segment X sa ponudom Y")
  * Ko je odgovoran (koji departman/funkcija)
  * Očekivani rezultat i KPI za merenje
  * Vremenski okvir (nedelja 1-2, nedelja 3-4, mesec 2-3)
  * Povezani poslovni koncept iz baze znanja (ako postoji)

## 6. Dugoročna Vizija — 12 Meseci (200-300 reči)
- Gde kompanija može da bude za godinu dana ako prati plan
- Koji su ključni mejlstoni na tom putu
- Koja ulaganja su neophodna

PRAVILA:
- Piši ISKLJUČIVO na srpskom jeziku (latinica)
- Koristi direktan, profesionalan ton — kao da razgovaraš sa vlasnikom
- SVAKA preporuka mora biti SPECIFIČNA za ovu kompaniju i industriju
- NE koristi generičke fraze ("poboljšajte marketing", "investirajte u ljude")
- Koristi konkretne brojke, procente, i vremenske okvire gde god je moguće
- Ako imaš podatke iz web istraživanja, citiraj izvore inline u formatu ([Naziv](URL))
- Ukupna dužina: 1800-2500 reči`;

    const userPrompt = `KOMPANIJA: ${companyName}
INDUSTRIJA: ${industry}
${companyDescription ? `OPIS POSLOVANJA:\n${companyDescription}` : ''}

TRENUTNO STANJE POSLOVANJA: ${businessState}

AKTIVNI DEPARTMANI: ${departments.join(', ')}
${webContext}
${conceptContext}

Napravi duboku analizu ovog poslovanja.`;

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

    const companyName = tenant?.name ?? 'Nepoznata kompanija';
    const industry = tenant?.industry ?? 'Opšta';
    const companyDescription = tenant?.description ?? '';

    // 1. Web search — industry best practices, competitor strategies, market opportunities
    let webContext = '';
    if (this.webSearchService.isAvailable()) {
      try {
        const searchQueries = [
          `${industry} najbolje prakse strategija rast Srbija`,
          `${industry} ${departments[0] ?? ''} zadaci prioriteti akcioni plan`,
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
            category: c.category ?? 'Opšta',
            definition: c.definition ?? '',
          });
        }
      }

      if (allConcepts.length > 0) {
        conceptContext = '\n\n--- BAZA POSLOVNIH KONCEPATA ---\n';
        conceptContext +=
          'Koncepti su poređani po važnosti: OSNOVE (Uvod u Poslovanje, Vrednost) su temelj na kom se gradi sve ostalo.\n';
        conceptContext += 'SVAKI zadatak MORA biti vezan za jedan ili više ovih koncepata:\n\n';
        conceptContext += allConcepts
          .map((c) => `- **${c.name}** (${c.category}): ${c.definition}`)
          .join('\n');
        conceptContext += '\n--- KRAJ BAZE KONCEPATA ---';
      }
    } catch {
      // Non-blocking — concepts may not be seeded yet
    }

    const systemPrompt = `Ti si poslovni strateg koji kreira personalizovani "Poslovni Mozak" — sistem zadataka koji će pokrenuti kompaniju napred.

Tvoj zadatak je da kreiraš TAČNO 10 KONKRETNIH, IZVRŠIVIH zadataka prilagođenih OVOJ kompaniji, OVOJ industriji, i OVOM trenutnom stanju.
NE više od 10 — fokus je na kvalitetu, ne kvantitetu. Svaki zadatak mora biti dovoljno detaljan da se može odmah početi sa radom.

ZA SVAKI ZADATAK OBAVEZNO NAVEDI:

### [Broj]. [Naslov zadatka — akcioni, jasan]
- **Koncept:** [Koji poslovni koncept iz baze znanja je osnova ovog zadatka]
- **Departman:** [Koji departman je odgovoran]
- **Prioritet:** KRITIČAN / VISOK / SREDNJI
- **Zašto baš ovo:** [2-3 rečenice — ZAŠTO je ovaj zadatak važan za OVO KONKRETNO poslovanje. Poveži sa trenutnim stanjem, industrijom, izazovima. Ne generičke fraze.]
- **Šta konkretno treba uraditi:**
  1. [Korak 1 — specifičan, merljiv]
  2. [Korak 2 — specifičan, merljiv]
  3. [Korak 3 — specifičan, merljiv]
- **Očekivani rezultat:** [Šta će kompanija imati/znati/postići kada se završi]
- **KPI za merenje:** [Konkretna metrika — broj, procenat, rok]
- **Vremenski okvir:** [Nedelja 1-2 / Mesec 1 / Mesec 2-3]
- **Zavisi od:** [Koji prethodni zadaci moraju biti završeni pre ovog — ili "Nezavisan"]

REDOSLED ZADATAKA:
- Počni sa DIJAGNOSTIČKIM zadacima (analiza, mapiranje, audit) — vlasnik prvo mora da RAZUME gde je
- Zatim STRATEŠKI zadaci (definisanje pozicije, ciljeva, plana)
- Zatim OPERATIVNI zadaci (implementacija, kreiranje procesa)
- Na kraju OPTIMIZACIONI zadaci (merenje, poboljšanje, skaliranje)

GRUPIŠI po departmanima: ${departments.join(', ')}
Svaki departman treba da ima minimum 2 zadatka.

PRAVILA:
- Piši ISKLJUČIVO na srpskom jeziku (latinica)
- NE koristi generičke zadatke ("poboljšajte komunikaciju", "investirajte u tim")
- SVAKI zadatak mora biti toliko specifičan da vlasnik može da počne da radi ODMAH
- Koristi podatke iz web istraživanja za preporuke zasnovane na tržištu
- OBAVEZNO poveži svaki zadatak sa konceptom iz baze znanja
- Ako imaš web podatke, citiraj izvore inline ([Naziv](URL))
- Ukupna dužina: 2000-3000 reči`;

    const userPrompt = `KOMPANIJA: ${companyName}
INDUSTRIJA: ${industry}
${companyDescription ? `OPIS POSLOVANJA:\n${companyDescription}` : ''}

TRENUTNO STANJE POSLOVANJA: ${businessState}

AKTIVNI DEPARTMANI: ${departments.join(', ')}
${webContext}
${conceptContext}

Kreiraj personalizovani Poslovni Mozak sa tačno 10 prioritizovanih zadataka.`;

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
    let taskIds: string[] = [];
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
    let planId: string | undefined;
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
      planId,
    };
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

    // Ensure "Poslovanje" concept is first (foundational starting point)
    const poslovanjeIdx = diversified.findIndex((m) => m.conceptName === 'Poslovanje');
    if (poslovanjeIdx > 0) {
      const removed = diversified.splice(poslovanjeIdx, 1);
      diversified.unshift(removed[0]!);
    }

    // Limit to top 10 concepts
    const topTasks = diversified.slice(0, 10);

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
        return `${i + 1}. Koncept: "${m.conceptName}" | Kategorija: ${m.category} | Definicija: ${m.definition}${prereqs.length > 0 ? ` | Preduslovi: ${prereqs.join(', ')}` : ''}`;
      })
      .join('\n');

    const taskEnrichmentSystemPrompt = `Ti si srpski poslovni konsultant koji kreira akcione zadatke.

Za SVAKI koncept napiši strukturirani zadatak u sledećem formatu:

---ZADATAK: {redni broj}---
NASLOV: {akcioni naslov na srpskom — glagol + konkretna radnja, max 60 karaktera}
SADRŽAJ:
## Cilj
{1-2 rečenice: šta konkretno treba postići za "${tenant.name}" u industriji "${tenant.industry}"}

## Zašto je ovo važno
{2-3 rečenice: poslovna vrednost, šta se gubi ako se ne uradi}

## Koraci za realizaciju
1. {Konkretan korak sa opisom — ne generički}
2. {Konkretan korak sa opisom}
3. {Konkretan korak sa opisom}
4. {Konkretan korak sa opisom}
5. {Konkretan korak sa opisom}

## Očekivani rezultat
{1-2 rečenice: merljiv ishod, KPI ili deliverable}

## Vremenski okvir
{Predloženi rok: 1 nedelja / 2 nedelje / 1 mesec}
---KRAJ ZADATKA---

PRAVILA:
- Svaki naslov MORA biti akcioni glagol na srpskom: "Analizirajte...", "Definišite...", "Kreirajte...", "Mapriajte...", "Razvijte...", "Optimizujte...", "Uspostavite..."
- Koraci moraju biti SPECIFIČNI za "${tenant.name}" i "${tenant.industry}" — ne generički
- Ako koncept ima preduslove, pomeni ih u sekciji "Zašto je ovo važno"
- ${tenant.description ? `Kontekst kompanije: ${tenant.description}` : ''}
- Piši ISKLJUČIVO na srpskom jeziku
- TAČNO ${topTasks.length} zadataka, ni više ni manje`;

    const taskEnrichmentUserPrompt = `Koncepti za koje treba kreirati zadatke:
${conceptDescriptions}

Generiši strukturirane zadatke.`;

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
        return `${i + 1}. "${title}" — Koncept: ${m.conceptName}, Definicija: ${m.definition}`;
      })
      .join('\n');

    // Generate narrative welcome message via LLM
    const welcomeSystemPrompt = `Ti si poslovni savetnik koji upoznaje klijenta sa personalizovanim akcionim planom.

Napiši dobrodošlicu koja:
1. Pozdravi klijenta po imenu kompanije i rezimira njihov profil (2-3 rečenice)
2. Objasni strategiju: ZAŠTO ovih ${topTasks.length} zadataka, koji je krajnji cilj
3. Za SVAKI zadatak objasni ZAŠTO je važan za NJIHOVO poslovanje (ne samo naziv — poslovnu vrednost)
4. Objasni REDOSLED — zašto počinjemo sa zadatkom #1, kako svaki naredni nadograđuje prethodni
5. Na kraju jasno predloži prvi korak

PRAVILA:
- NE koristi [[Naziv Koncepta]] oznake
- NE nabraja korake kao suvu listu — objasni poslovnu logiku iza svakog
- Koristi ime kompanije "${tenant.name}" i industrije "${tenant.industry}"
- Piši toplo ali profesionalno, kao iskusan konsultant
- Na kraju dodaj: odgovorite "da" za sve zadatke, "pokreni 1, 3, 5" za izbor, ili "pokreni prvi" za samo prvi
- Piši ISKLJUČIVO na srpskom jeziku
- Između 500 i 800 reči — dovoljno detalja za kontekst`;

    const welcomeUserPrompt = `Kompanija: ${tenant.name ?? 'Nepoznata'}
Industrija: ${tenant.industry ?? 'Opšta'}
${tenant.description ? `Opis: ${tenant.description}` : ''}

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

    this.logger.log({
      message: 'Tenant status updated to ACTIVE',
      tenantId,
      previousStatus: tenant.status,
      newStatus: 'ACTIVE',
    });
  }
}
