/**
 * Business Context Service (Story 3.2, Sprint 2 Epic 2.1)
 *
 * Aggregates ALL memories for a tenant (across all users and domains)
 * into a structured context block for injection into LLM system prompts.
 *
 * This is the "shared brain" — every concept execution receives
 * accumulated business knowledge, regardless of which user or department
 * created it.
 *
 * Sprint 2 improvement: When a query is provided, memories are scored
 * by keyword relevance so the most pertinent ones fill the token budget
 * first, rather than purely chronological ordering.
 */

import { Injectable, Logger } from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';

/** Approximate characters per token for estimation */
const CHARS_PER_TOKEN = 4;

/** Max tokens for the business context section in the system prompt.
 *  Reduced from 4000 to 1500 to fit within 8K context window models. */
const MAX_CONTEXT_TOKENS = 1500;

/** Cache entry with TTL tracking */
interface CacheEntry {
  value: string;
  cachedAt: number;
}

/** Cache TTL: 5 minutes */
const CACHE_TTL_MS = 5 * 60 * 1000;

/** Minimum word length for relevance scoring (skip articles, prepositions) */
const MIN_KEYWORD_LENGTH = 3;

/** Common stop words (Serbian + English), hoisted to module scope to avoid re-creation per call */
const STOP_WORDS = new Set([
  // Serbian
  'je', 'da', 'ne', 'za', 'na', 'sa', 'od', 'do', 'se', 'su', 'im',
  'ili', 'ali', 'kao', 'što', 'sto', 'sta', 'šta', 'taj', 'ova', 'ovo',
  'tog', 'tom', 'sve', 'bio', 'ako', 'već', 'vec', 'može', 'moze',
  'koji', 'koja', 'koje', 'koje', 'treba', 'trebao', 'sam', 'ste',
  'neke', 'neki', 'jeste', 'nema', 'ima', 'bih', 'bismo',
  // English
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can',
  'had', 'her', 'was', 'one', 'our', 'out', 'has', 'have', 'with',
  'this', 'that', 'from', 'they', 'been', 'said', 'each', 'which',
  'their', 'will', 'other', 'about', 'many', 'then', 'them', 'some',
  'what', 'how', 'when', 'where', 'who', 'why',
]);

@Injectable()
export class BusinessContextService {
  private readonly logger = new Logger(BusinessContextService.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly prisma: PlatformPrismaService) {}

  /** Invalidate cache for a tenant (call after memory write) */
  invalidateCache(tenantId: string): void {
    this.cache.delete(tenantId);
  }

  /**
   * Loads and formats business memories for a tenant.
   * Returns a structured text block ready for system prompt injection.
   *
   * When a query is provided, memories are ranked by keyword relevance
   * so the most pertinent ones appear first within the token budget.
   * Without a query, falls back to chronological ordering (cached).
   */
  async getBusinessContext(tenantId: string, query?: string): Promise<string> {
    // Without query: use cached chronological approach
    if (!query) {
      const cached = this.cache.get(tenantId);
      if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
        this.logger.debug({ message: 'Business context cache hit', tenantId });
        return cached.value;
      }
    }

    const memories = await this.prisma.memory.findMany({
      where: {
        tenantId,
        isDeleted: false,
      },
      select: {
        type: true,
        content: true,
        subject: true,
        userId: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 100, // Cap to prevent excessive load
    });

    if (memories.length === 0) {
      return '';
    }

    // Score and sort by relevance when query is provided
    let sortedMemories = memories;
    if (query) {
      const keywords = this.extractKeywords(query);
      if (keywords.length > 0) {
        const scored = memories.map((mem) => ({
          ...mem,
          relevanceScore: this.scoreRelevance(mem.content, mem.subject, keywords),
        }));
        // Sort by relevance (highest first), then by recency as tiebreaker
        scored.sort((a, b) => b.relevanceScore - a.relevanceScore);
        sortedMemories = scored;
      }
    }

    // Group by type (preserving sort order within each group)
    const grouped = new Map<string, typeof memories>();
    for (const mem of sortedMemories) {
      const key = mem.type;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(mem);
    }

    // Build formatted context
    let context = '\n--- BUSINESS CONTEXT (Business Brain Memory) ---\n';
    let tokenCount = this.estimateTokens(context);
    const maxContentTokens = MAX_CONTEXT_TOKENS - 100;

    const typeLabels: Record<string, string> = {
      CLIENT_CONTEXT: 'Client',
      PROJECT_CONTEXT: 'Business insight',
      USER_PREFERENCE: 'Decision',
      FACTUAL_STATEMENT: 'Business fact',
    };

    for (const [type, mems] of grouped) {
      const label = typeLabels[type] || type;
      const sectionHeader = `\n[${label}]\n`;
      const headerTokens = this.estimateTokens(sectionHeader);

      if (tokenCount + headerTokens > maxContentTokens) break;

      context += sectionHeader;
      tokenCount += headerTokens;

      for (const mem of mems) {
        const subjectPart = mem.subject ? ` (${mem.subject})` : '';
        const line = `- ${mem.content}${subjectPart}\n`;
        const lineTokens = this.estimateTokens(line);

        if (tokenCount + lineTokens > maxContentTokens) break;

        context += line;
        tokenCount += lineTokens;
      }
    }

    context += '--- END OF BUSINESS CONTEXT ---\n\n';
    context +=
      'Use this context to provide responses tailored to the user\'s specific business. ';
    context += 'Reference previous analyses and decisions when relevant.\n';

    this.logger.debug({
      message: 'Business context built',
      tenantId,
      memoriesIncluded: memories.length,
      estimatedTokens: this.estimateTokens(context),
      relevanceFiltered: !!query,
    });

    // Only cache chronological (non-query) results
    if (!query) {
      this.cache.set(tenantId, { value: context, cachedAt: Date.now() });
    }

    return context;
  }

  /**
   * Extracts meaningful keywords from a query string.
   * Strips common Serbian/English stop words and short tokens.
   */
  extractKeywords(query: string): string[] {
    return query
      .toLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= MIN_KEYWORD_LENGTH && !STOP_WORDS.has(w));
  }

  /**
   * Scores a memory's relevance to a set of keywords.
   * Returns a value 0..1 based on keyword overlap.
   */
  scoreRelevance(content: string, subject: string | null, keywords: string[]): number {
    if (keywords.length === 0) return 0;

    const text = `${content} ${subject ?? ''}`.toLowerCase();
    // Tokenize the text into words for accurate matching (avoids substring false positives)
    const textWords = new Set(
      text.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean)
    );

    let matchCount = 0;
    for (const keyword of keywords) {
      if (textWords.has(keyword)) {
        matchCount++;
      }
    }

    return matchCount / keywords.length;
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }
}
