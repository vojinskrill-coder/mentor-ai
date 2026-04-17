import { Injectable, Logger } from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { BrainIndexService } from './brain-index.service';

/**
 * RecommendationService — generates contextual recommendation cards
 * for different modes (dashboard, chat, process results, tasks).
 *
 * Reads from: brain index, MCP catalog, tenant credentials, process
 * workflows, concept confidence/staleness. Generates cards that the
 * frontend renders as interactive UI elements.
 *
 * Card types:
 *   - mcp_config: "Connect Apollo to enable lead search"
 *   - task: "Review your pricing strategy"
 *   - process_suggestion: "Automate weekly lead discovery"
 *   - next_step: "Send outreach to top 5 leads"
 */

export interface RecommendationCard {
  id: string;
  type: 'mcp_config' | 'task' | 'process_suggestion' | 'next_step';
  title: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
  action: {
    label: string;
    type: 'navigate' | 'start_conversation' | 'build_process' | 'run_process';
    payload: Record<string, unknown>;
  };
  metadata: Record<string, unknown>;
  dismissedUntil?: string; // ISO date — don't show until this date
}

@Injectable()
export class RecommendationService {
  private readonly logger = new Logger(RecommendationService.name);
  // In-memory dismissal tracking per tenant+user (simple approach — no DB table needed)
  // Key: `${tenantId}:${cardId}`, Value: expiry timestamp
  private readonly dismissals = new Map<string, number>();

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly brainIndex: BrainIndexService,
  ) {}

  /**
   * Dismiss a card for 7 days. Card won't appear in recommendations until then.
   */
  dismissCard(tenantId: string, cardId: string, daysToHide: number = 7): void {
    const key = `${tenantId}:${cardId}`;
    this.dismissals.set(key, Date.now() + daysToHide * 24 * 60 * 60 * 1000);
  }

  /**
   * Check if a card is currently dismissed.
   */
  private isDismissed(tenantId: string, cardId: string): boolean {
    const key = `${tenantId}:${cardId}`;
    const expiry = this.dismissals.get(key);
    if (!expiry) return false;
    if (Date.now() > expiry) {
      this.dismissals.delete(key); // Expired, clean up
      return false;
    }
    return true;
  }

  /**
   * Filter out dismissed cards from a list.
   */
  private filterDismissed(tenantId: string, cards: RecommendationCard[]): RecommendationCard[] {
    return cards.filter((c) => !this.isDismissed(tenantId, c.id));
  }

  /**
   * Story 6.1: MCP Configuration Recommendations
   * Returns cards for unconnected tools relevant to the business.
   */
  async getMcpRecommendations(tenantId: string): Promise<RecommendationCard[]> {
    const cards: RecommendationCard[] = [];

    // Load MCP catalog and tenant credentials
    const [allTools, credentials, tenant] = await Promise.all([
      this.prisma.mcpToolCatalog.findMany({
        where: { isActive: true },
        select: { slug: true, displayName: true, description: true, category: true },
      }),
      this.prisma.tenantCredential.findMany({
        where: { tenantId },
        select: { toolSlug: true },
      }),
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { industry: true },
      }),
    ]);

    const connectedSlugs = new Set(credentials.map((c) => c.toolSlug));
    const industry = (tenant?.industry ?? '').toLowerCase();

    // Prioritize tools by industry relevance
    const industryToolPriority: Record<string, string[]> = {
      technology: ['apollo-io', 'notion', 'gmail', 'google-sheets'],
      luxury: ['apollo-io', 'notion', 'fal-ai', 'gmail'],
      ecommerce: ['apollo-io', 'google-sheets', 'gmail', 'notion'],
      consulting: ['apollo-io', 'notion', 'gmail'],
      default: ['apollo-io', 'notion', 'brave-search', 'gmail'],
    };

    const priorityList = Object.entries(industryToolPriority)
      .find(([key]) => industry.includes(key))?.[1] ?? industryToolPriority['default']!;

    for (const tool of allTools) {
      if (connectedSlugs.has(tool.slug)) continue; // Already connected

      const priority = priorityList.includes(tool.slug) ? 'high' : 'medium';

      cards.push({
        id: `mcp_${tool.slug}`,
        type: 'mcp_config',
        title: `Connect ${tool.displayName}`,
        description: (tool.description ?? '').substring(0, 100),
        priority: priority as 'high' | 'medium',
        action: {
          label: 'Connect',
          type: 'navigate',
          payload: { route: '/settings', toolSlug: tool.slug },
        },
        metadata: { toolSlug: tool.slug, category: tool.category },
      });
    }

    // Also suggest next actions for CONNECTED tools without processes
    const existingProcesses = await this.prisma.processWorkflow.findMany({
      where: { tenantId, status: 'published' },
      select: { designArtifact: true },
    });
    const processToolSlugs = new Set<string>();
    for (const proc of existingProcesses) {
      const design = proc.designArtifact as Record<string, unknown> | null;
      const tools = (design?.['tools'] as string[]) ?? [];
      tools.forEach((t) => processToolSlugs.add(t));
    }

    for (const cred of credentials) {
      if (processToolSlugs.has(cred.toolSlug)) continue; // Already has a process
      const tool = allTools.find((t) => t.slug === cred.toolSlug);
      if (!tool) continue;

      cards.push({
        id: `mcp_process_${cred.toolSlug}`,
        type: 'mcp_config',
        title: `${tool.displayName} connected — build a process?`,
        description: `You connected ${tool.displayName} but haven't built any processes with it yet.`,
        priority: 'medium',
        action: {
          label: 'Build Process',
          type: 'build_process',
          payload: { toolSlug: cred.toolSlug, description: `Automate tasks using ${tool.displayName}` },
        },
        metadata: { toolSlug: cred.toolSlug },
      });
    }

    const prioOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return cards.sort((a, b) => (prioOrder[a.priority] ?? 1) - (prioOrder[b.priority] ?? 1));
  }

  /**
   * Story 6.2: AI Recommended Task Cards
   * Returns tasks based on concept staleness, unexplored areas, and relationships.
   */
  async getTaskRecommendations(tenantId: string, userDepartment?: string | null): Promise<RecommendationCard[]> {
    const cards: RecommendationCard[] = [];
    const index = await this.brainIndex.getIndex(tenantId);
    if (!index) return cards;

    // Find concepts needing attention — collect high-priority first,
    // then medium, and stop once we have enough candidates (max 20
    // to sort from, avoids creating 345+ objects for 345 unenriched concepts)
    const MAX_CANDIDATES = 20;
    const highPriority: RecommendationCard[] = [];
    const mediumPriority: RecommendationCard[] = [];

    for (const entry of index.entries) {
      if (highPriority.length + mediumPriority.length >= MAX_CANDIDATES) break;

      // Department filter
      if (userDepartment && !entry.departmentTags.includes(userDepartment) && !entry.departmentTags.includes('all')) {
        continue;
      }

      // Low confidence — high priority review
      if (entry.enriched && entry.confidence < 0.5) {
        highPriority.push({
          id: `task_review_${entry.id}`,
          type: 'task',
          title: `Review: ${entry.name}`,
          description: `This concept has low confidence (${(entry.confidence * 100).toFixed(0)}%). Review and update with current data.`,
          priority: 'high',
          action: {
            label: 'Review Now',
            type: 'start_conversation',
            payload: { conceptId: entry.id, conceptName: entry.name },
          },
          metadata: { conceptId: entry.id, confidence: entry.confidence, reason: 'low_confidence' },
        });
        continue;
      }

      // Unenriched concepts — medium priority explore
      if (!entry.enriched && mediumPriority.length < 10) {
        mediumPriority.push({
          id: `task_enrich_${entry.id}`,
          type: 'task',
          title: `Explore: ${entry.name}`,
          description: `This concept hasn't been developed yet. Start a conversation to build your knowledge.`,
          priority: 'medium',
          action: {
            label: 'Start',
            type: 'start_conversation',
            payload: { conceptId: entry.id, conceptName: entry.name },
          },
          metadata: { conceptId: entry.id, reason: 'unenriched' },
        });
      }
    }

    // High priority first, then medium, filter dismissed, limit to 10
    return this.filterDismissed(tenantId, [...highPriority, ...mediumPriority]).slice(0, 10);
  }

  /**
   * Story 6.3: Process Suggestion Cards (for chat context)
   * Returns process suggestions based on the conversation topic and connected tools.
   */
  async getProcessSuggestions(
    tenantId: string,
    conversationTopic: string,
  ): Promise<RecommendationCard[]> {
    const cards: RecommendationCard[] = [];

    // Check connected tools
    const credentials = await this.prisma.tenantCredential.findMany({
      where: { tenantId },
      select: { toolSlug: true },
    });
    const connectedTools = credentials.map((c) => c.toolSlug);

    if (connectedTools.length === 0) return cards;

    // Check for existing similar processes
    const existingProcesses = await this.prisma.processWorkflow.findMany({
      where: { tenantId, status: 'published' },
      select: { name: true, slug: true, id: true },
    });

    // Topic-to-process mapping with expanded keywords (English + Serbian synonyms)
    const topicLower = conversationTopic.toLowerCase();
    const suggestions: Array<{ title: string; description: string; toolSlug: string; priority: 'high' | 'medium' }> = [];

    const matchesTopic = (keywords: string[]) => keywords.some((kw) => topicLower.includes(kw));

    if (matchesTopic(['lead', 'prospect', 'client', 'partner', 'acquisition', 'find companies', 'find people', 'icp', 'lidovi', 'klijent', 'prospekt', 'pronadji']) && connectedTools.includes('apollo-io')) {
      suggestions.push({
        title: 'Automate Lead Discovery',
        description: 'Search and score prospects on Apollo automatically',
        toolSlug: 'apollo-io',
        priority: 'high',
      });
    }
    if (matchesTopic(['content', 'post', 'article', 'blog', 'social', 'topic', 'idea', 'sadrzaj', 'objava', 'tema']) && connectedTools.includes('brave-search')) {
      suggestions.push({
        title: 'Automate Content Research',
        description: 'Research trending topics and generate content ideas',
        toolSlug: 'brave-search',
        priority: 'medium',
      });
    }
    if (matchesTopic(['email', 'outreach', 'campaign', 'follow-up', 'nurture', 'send', 'mejl', 'kampanja', 'poruka']) && connectedTools.includes('gmail')) {
      suggestions.push({
        title: 'Automate Email Outreach',
        description: 'Send personalized outreach emails to your leads',
        toolSlug: 'gmail',
        priority: 'medium',
      });
    }
    if (matchesTopic(['competitor', 'research', 'market', 'trend', 'benchmark', 'industry', 'analysis', 'konkurent', 'istrazivanje', 'trziste', 'analiza']) && connectedTools.includes('brave-search')) {
      suggestions.push({
        title: 'Automate Market Research',
        description: 'Monitor competitors and market trends automatically',
        toolSlug: 'brave-search',
        priority: 'medium',
      });
    }

    for (const suggestion of suggestions) {
      // Check if similar process already exists
      const existing = existingProcesses.find((p) =>
        p.name.toLowerCase().includes(suggestion.title.toLowerCase().split(' ').slice(1).join(' ').substring(0, 10)),
      );

      if (existing) {
        cards.push({
          id: `process_existing_${existing.id}`,
          type: 'process_suggestion',
          title: `You already have: ${existing.name}`,
          description: `Run your existing process instead of building a new one.`,
          priority: 'low',
          action: {
            label: 'Run It',
            type: 'run_process',
            payload: { processId: existing.id, processName: existing.name },
          },
          metadata: { existingProcessId: existing.id },
        });
      } else {
        cards.push({
          id: `process_suggest_${suggestion.toolSlug}_${Date.now()}`,
          type: 'process_suggestion',
          title: suggestion.title,
          description: suggestion.description,
          priority: suggestion.priority,
          action: {
            label: 'Build This Process',
            type: 'build_process',
            payload: { description: `${suggestion.title} using ${suggestion.toolSlug}`, toolSlug: suggestion.toolSlug },
          },
          metadata: { toolSlug: suggestion.toolSlug },
        });
      }
    }

    return cards;
  }

  /**
   * Story 6.4: Next-Step Cards After Process Completion
   * Returns follow-up action cards based on process results and connected tools.
   */
  async getNextStepCards(
    tenantId: string,
    processName: string,
    resultCount: number,
  ): Promise<RecommendationCard[]> {
    const cards: RecommendationCard[] = [];

    const credentials = await this.prisma.tenantCredential.findMany({
      where: { tenantId },
      select: { toolSlug: true },
    });
    const connectedTools = new Set(credentials.map((c) => c.toolSlug));

    // Contextual suggestions based on connected tools
    if (connectedTools.has('gmail')) {
      cards.push({
        id: `next_email_${Date.now()}`,
        type: 'next_step',
        title: `Send outreach to top ${Math.min(resultCount, 5)} results`,
        description: 'Create personalized email outreach for the best matches.',
        priority: 'high',
        action: {
          label: 'Build Outreach Process',
          type: 'build_process',
          payload: { description: `Send personalized outreach emails to the top ${Math.min(resultCount, 5)} leads from ${processName}` },
        },
        metadata: { tool: 'gmail' },
      });
    }

    if (connectedTools.has('notion')) {
      cards.push({
        id: `next_save_${Date.now()}`,
        type: 'next_step',
        title: 'Save results to Notion',
        description: 'Archive these results in your Notion workspace.',
        priority: 'medium',
        action: {
          label: 'Save to Notion',
          type: 'build_process',
          payload: { description: `Save ${processName} results to Notion database` },
        },
        metadata: { tool: 'notion' },
      });
    }

    if (connectedTools.has('google-sheets')) {
      cards.push({
        id: `next_export_${Date.now()}`,
        type: 'next_step',
        title: 'Export to Google Sheets',
        description: 'Export results to a spreadsheet for further analysis.',
        priority: 'low',
        action: {
          label: 'Export',
          type: 'build_process',
          payload: { description: `Export ${processName} results to Google Sheets` },
        },
        metadata: { tool: 'google-sheets' },
      });
    }

    // Always suggest scheduling
    cards.push({
      id: `next_schedule_${Date.now()}`,
      type: 'next_step',
      title: 'Schedule this process weekly',
      description: `Run ${processName} automatically every week.`,
      priority: 'medium',
      action: {
        label: 'Set Schedule',
        type: 'navigate',
        payload: { route: '/settings', section: 'processes' },
      },
      metadata: {},
    });

    return cards;
  }

  /**
   * Get all recommendations for a tenant (combined view for dashboard).
   */
  async getAllRecommendations(tenantId: string, userDepartment?: string | null): Promise<RecommendationCard[]> {
    const [mcpCards, taskCards] = await Promise.all([
      this.getMcpRecommendations(tenantId),
      this.getTaskRecommendations(tenantId, userDepartment),
    ]);

    const prioOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return [...mcpCards, ...taskCards]
      .sort((a, b) => (prioOrder[a.priority] ?? 1) - (prioOrder[b.priority] ?? 1))
      .slice(0, 15);
  }
}
