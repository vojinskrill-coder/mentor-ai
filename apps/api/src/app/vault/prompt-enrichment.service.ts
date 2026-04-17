import { Injectable, Logger } from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { BrainIndexService } from './brain-index.service';
import { SectionFilterService } from './section-filter.service';

/**
 * PromptEnrichmentService — invisibly enriches user messages before
 * they reach the AI agent.
 *
 * Adds business context, relevant concept content, quality standards,
 * role/department context, and historical context to every user message.
 *
 * The user never sees the enrichment — their original message appears
 * in the chat UI. The enriched version goes to the AI agent.
 *
 * Target latency: < 500ms (no web search — that's the agent's job).
 */

export interface EnrichmentContext {
  tenantId: string;
  userId: string;
  userDepartment: string | null; // null = owner
  userRole: string;
  originalMessage: string;
}

export interface EnrichedPrompt {
  systemContext: string; // Injected into system prompt
  enrichedMessage: string; // Replaces user message for the agent
  conceptsMatched: string[]; // For debugging/logging
  enrichmentDurationMs: number;
}

@Injectable()
export class PromptEnrichmentService {
  private readonly logger = new Logger(PromptEnrichmentService.name);

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly brainIndex: BrainIndexService,
    private readonly sectionFilter: SectionFilterService,
  ) {}

  /**
   * Enrich a user's message with business context, relevant concepts,
   * and quality standards.
   *
   * This is called BEFORE the message is sent to the AI agent.
   * The user's original message is preserved in the chat UI.
   */
  async enrichMessage(ctx: EnrichmentContext): Promise<EnrichedPrompt> {
    const startMs = Date.now();
    const parts: string[] = [];
    const conceptsMatched: string[] = [];

    // 1. Find relevant concepts from brain index (fast, < 50ms)
    const relevantConcepts = await this.brainIndex.findRelevantConcepts(
      ctx.tenantId,
      ctx.originalMessage,
      5, // Top 5 relevant concepts
      ctx.userDepartment,
    );

    // 2. Load concept content for the top matches (filtered by department)
    if (relevantConcepts.length > 0) {
      const conceptDetails = await this.prisma.concept.findMany({
        where: { id: { in: relevantConcepts.map((c) => c.id) } },
        select: {
          name: true,
          category: true,
          definition: true,
          extendedDescription: true,
          confidence: true,
          tier: true,
        },
      });

      if (conceptDetails.length > 0) {
        parts.push('--- RELEVANT BUSINESS KNOWLEDGE ---');
        for (const concept of conceptDetails) {
          conceptsMatched.push(concept.name);

          // Get filtered content based on user's role
          let content = concept.definition ?? '';
          if (concept.extendedDescription) {
            const filtered = this.sectionFilter.filterByDepartment(
              concept.extendedDescription,
              ctx.userDepartment,
              ctx.userRole,
            );
            // Extract key points (first 1000 chars of filtered content, skip frontmatter)
            const body = filtered.replace(/---[\s\S]*?---\n?/, '').trim();
            content = body.substring(0, 1000);
          }

          parts.push(`\n**${concept.name}** (${concept.category}, confidence: ${concept.confidence?.toFixed(1) ?? '?'}):`);
          parts.push(content);
        }
        parts.push('--- END BUSINESS KNOWLEDGE ---\n');
      }
    }

    // 3. Load business profile context (tenant name, industry, etc.)
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: ctx.tenantId },
      select: { name: true, industry: true, description: true },
    });

    // 4. Build system context (injected into system prompt)
    const systemContext = this.buildSystemContext(
      tenant,
      ctx.userDepartment,
      ctx.userRole,
    );

    // 5. Build enriched message (replaces user message for the agent)
    const enrichedMessage = this.buildEnrichedMessage(
      ctx.originalMessage,
      parts,
      ctx.userDepartment,
      ctx.userRole,
    );

    const durationMs = Date.now() - startMs;

    if (durationMs > 500) {
      this.logger.warn({
        message: 'Prompt enrichment exceeded 500ms target',
        durationMs,
        tenantId: ctx.tenantId,
        conceptsMatched: conceptsMatched.length,
      });
    }

    return {
      systemContext,
      enrichedMessage,
      conceptsMatched,
      enrichmentDurationMs: durationMs,
    };
  }

  // ── Internal ──────────────────────────────────────────────────

  private buildSystemContext(
    tenant: { name: string; industry: string; description: string | null } | null,
    department: string | null,
    role: string,
  ): string {
    const lines: string[] = [];

    if (tenant) {
      lines.push(`You are an AI business advisor for ${tenant.name} (${tenant.industry}).`);
      if (tenant.description) {
        lines.push(`Business: ${tenant.description.substring(0, 300)}`);
      }
    }

    // Role-based perspective (Story 2.2)
    if (department && role !== 'PLATFORM_OWNER' && role !== 'TENANT_OWNER') {
      lines.push(`\nThe user is from the ${department} department. Tailor your response to their perspective.`);
      lines.push(`Focus on ${department}-relevant aspects. Do not expose raw financial data unless the user is from Finance or is the owner.`);
      lines.push(`Cross-functional information (e.g., budget) should be framed from the ${department} perspective.`);
    } else {
      lines.push('\nThe user is the business owner — provide ALL perspectives without department filtering.');
    }

    lines.push('\nQuality Standards:');
    lines.push('- Include real numbers, statistics, and data when available');
    lines.push('- Reference specific strategies and frameworks, not generic advice');
    lines.push('- Include URLs to sources when citing external data');
    lines.push('- Be actionable — tell the user what to DO, not just what to think about');

    return lines.join('\n');
  }

  private buildEnrichedMessage(
    originalMessage: string,
    conceptParts: string[],
    department: string | null,
    role: string,
  ): string {
    const lines: string[] = [];

    // User's original message first
    lines.push(originalMessage);

    // Inject concept context (invisible to user, visible to agent)
    if (conceptParts.length > 0) {
      lines.push('\n' + conceptParts.join('\n'));
    }

    // Add quality instructions only when concepts were matched
    // (trivial messages like "hello" shouldn't get research instructions)
    if (conceptParts.length > 0) {
      lines.push('\nWhen responding, include:');
      lines.push('- Specific data and numbers relevant to the question');
      lines.push('- URLs to sources that confirm key claims');
      lines.push('- Actionable recommendations, not just analysis');
      lines.push('- Industry-specific context from the business knowledge above');
    }

    return lines.join('\n');
  }
}
