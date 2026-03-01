/**
 * Business Context Service (Story 3.2)
 *
 * Aggregates ALL memories for a tenant (across all users and domains)
 * into a structured context block for injection into LLM system prompts.
 *
 * This is the "shared brain" — every concept execution receives the full
 * accumulated business knowledge, regardless of which user or department
 * created it.
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
   * Loads and formats all business memories for a tenant.
   * Returns a structured text block ready for system prompt injection.
   *
   * Groups memories by type and includes attribution.
   * Truncates to ~4000 tokens.
   */
  async getBusinessContext(tenantId: string): Promise<string> {
    // Check cache first
    const cached = this.cache.get(tenantId);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      this.logger.debug({ message: 'Business context cache hit', tenantId });
      return cached.value;
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

    // Group by type
    const grouped = new Map<string, typeof memories>();
    for (const mem of memories) {
      const key = mem.type;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(mem);
    }

    // Build formatted context
    let context = '\n--- POSLOVNI KONTEKST (Business Brain Memorija) ---\n';
    let tokenCount = this.estimateTokens(context);
    const maxContentTokens = MAX_CONTEXT_TOKENS - 100;

    const typeLabels: Record<string, string> = {
      CLIENT_CONTEXT: 'Klijent',
      PROJECT_CONTEXT: 'Poslovni uvid',
      USER_PREFERENCE: 'Odluka',
      FACTUAL_STATEMENT: 'Poslovna činjenica',
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

    context += '--- KRAJ POSLOVNOG KONTEKSTA ---\n\n';
    context +=
      'Koristi ovaj kontekst da daš odgovore prilagođene specifičnom poslovanju korisnika. ';
    context += 'Referiši se na prethodne analize i odluke kada je relevantno.\n';

    this.logger.debug({
      message: 'Business context built',
      tenantId,
      memoriesIncluded: memories.length,
      estimatedTokens: this.estimateTokens(context),
    });

    // Store in cache
    this.cache.set(tenantId, { value: context, cachedAt: Date.now() });

    return context;
  }

  private estimateTokens(text: string): number {
    return Math.ceil(text.length / CHARS_PER_TOKEN);
  }
}
