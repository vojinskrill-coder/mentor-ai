import { Injectable, Logger } from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';

/**
 * BrainIndexService — maintains a fast-lookup index of all concepts
 * in a tenant's vault.
 *
 * Follows the Karpathy LLM Wiki pattern: the index is a compact catalog
 * that agents read FIRST before doing vector search or full-note reads.
 * For vaults under 500 concepts, the index alone is sufficient for
 * concept identification.
 *
 * The index is stored as a JSON field on TenantVault and regenerated
 * whenever concepts change (enrich, create, update, delete).
 */

export interface BrainIndexEntry {
  id: string;
  name: string;
  slug: string;
  category: string;
  summary: string; // Max 150 chars
  departmentTags: string[];
  confidence: number;
  tier: string;
  enriched: boolean;
}

export interface BrainIndex {
  tenantId: string;
  lastUpdated: string; // ISO timestamp
  totalConcepts: number;
  enrichedConcepts: number;
  categories: string[];
  entries: BrainIndexEntry[];
}

/** Cache with TTL */
interface CachedIndex {
  index: BrainIndex;
  cachedAt: number;
}

const CACHE_TTL_MS = 60_000; // 1 minute cache

@Injectable()
export class BrainIndexService {
  private readonly logger = new Logger(BrainIndexService.name);
  private readonly cache = new Map<string, CachedIndex>();

  constructor(private readonly prisma: PlatformPrismaService) {}

  /**
   * Get the brain index for a tenant. Returns cached version if fresh,
   * otherwise regenerates from DB.
   */
  async getIndex(tenantId: string): Promise<BrainIndex | null> {
    // Check cache
    const cached = this.cache.get(tenantId);
    if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
      return cached.index;
    }

    return this.regenerateIndex(tenantId);
  }

  /**
   * Regenerate the brain index from the database.
   * Called after concept changes (enrich, create, update).
   */
  async regenerateIndex(tenantId: string): Promise<BrainIndex | null> {
    const vault = await this.prisma.tenantVault.findUnique({
      where: { tenantId },
      select: { id: true, status: true },
    });

    if (!vault || vault.status !== 'ready') return null;

    // Load concepts WITHOUT extendedDescription — avoids loading 13MB+ of content
    const concepts = await this.prisma.concept.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        slug: true,
        category: true,
        definition: true,
        departmentTags: true,
        confidence: true,
        tier: true,
        // NOT selecting extendedDescription — would load 13MB+ for 445 concepts
      },
      orderBy: [{ categorySortOrder: 'asc' }, { sortOrder: 'asc' }],
    });

    // Count enriched concepts server-side (no memory load)
    const enrichedCount = await this.prisma.concept.count({
      where: {
        tenantId,
        extendedDescription: { not: null },
        confidence: { gte: 0.7 },
      },
    });

    // Build set of enriched IDs for the enriched flag
    const enrichedIds = new Set(
      (await this.prisma.concept.findMany({
        where: { tenantId, extendedDescription: { not: null }, confidence: { gte: 0.7 } },
        select: { id: true },
      })).map((c) => c.id),
    );

    const entries: BrainIndexEntry[] = concepts.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      category: c.category,
      summary: (c.definition ?? '').substring(0, 150),
      departmentTags: c.departmentTags,
      confidence: c.confidence ?? 0.3,
      tier: c.tier ?? 'working',
      enriched: enrichedIds.has(c.id),
    }));

    const categories = [...new Set(concepts.map((c) => c.category))].sort();

    const index: BrainIndex = {
      tenantId,
      lastUpdated: new Date().toISOString(),
      totalConcepts: entries.length,
      enrichedConcepts: enrichedCount,
      categories,
      entries,
    };

    // Cache it
    this.cache.set(tenantId, { index, cachedAt: Date.now() });

    this.logger.log({
      message: 'Brain index regenerated',
      tenantId,
      totalConcepts: entries.length,
      enrichedConcepts: enrichedCount,
      categories: categories.length,
    });

    return index;
  }

  /**
   * Invalidate cache for a tenant (call after concept changes).
   */
  invalidateCache(tenantId: string): void {
    this.cache.delete(tenantId);
  }

  /**
   * Find concepts relevant to a query using the index.
   * Performs keyword matching against concept names, categories, and summaries.
   * Much faster than vector search for simple lookups.
   *
   * @returns Top N matching entries sorted by relevance score
   */
  async findRelevantConcepts(
    tenantId: string,
    query: string,
    topN: number = 5,
    departmentFilter?: string | null,
  ): Promise<BrainIndexEntry[]> {
    const index = await this.getIndex(tenantId);
    if (!index) return [];

    const queryWords = query
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 2);

    // Bilingual mapping: common English terms → Serbian concept keywords
    const EN_TO_SR: Record<string, string[]> = {
      'pricing': ['cena', 'cene', 'odredjivanje'],
      'marketing': ['marketing'],
      'sales': ['prodaja', 'prodajni'],
      'finance': ['finansije', 'finansijski', 'budzet'],
      'operations': ['operacije', 'proizvodnja'],
      'management': ['menadzment', 'upravljanje'],
      'strategy': ['strategija', 'poslovni'],
      'startup': ['startup'],
      'hr': ['ljudski', 'resursi'],
      'value': ['vrednost'],
      'systems': ['sistemi'],
      'data': ['podaci', 'podataka'],
      'structure': ['struktura', 'kompanijska'],
      'buying': ['kupovina'],
      'selling': ['prodaja'],
      'delivery': ['isporuka'],
      'bias': ['kognitivne', 'sklonosti'],
      'people': ['ljudima', 'rad'],
      'self': ['upravljanje', 'radom'],
      'business': ['poslovanje', 'poslovni'],
      'model': ['model', 'modeli'],
      'competition': ['konkurent', 'barijera'],
    };

    // Expand query with Serbian equivalents
    for (const word of [...queryWords]) {
      const srWords = EN_TO_SR[word];
      if (srWords) {
        for (const sr of srWords) {
          if (!queryWords.includes(sr)) queryWords.push(sr);
        }
      }
    }

    const scored = index.entries
      .filter((entry) => {
        // Department filtering
        if (departmentFilter) {
          if (!entry.departmentTags.includes(departmentFilter) && !entry.departmentTags.includes('all')) {
            return false;
          }
        }
        return true;
      })
      .map((entry) => {
        let score = 0;
        const nameLower = entry.name.toLowerCase();
        const catLower = entry.category.toLowerCase();
        const sumLower = entry.summary.toLowerCase();

        for (const word of queryWords) {
          if (nameLower.includes(word)) score += 10;
          if (catLower.includes(word)) score += 5;
          if (sumLower.includes(word)) score += 3;
        }

        // Only apply boosts if there was at least one keyword match
        if (score > 0) {
          // Boost enriched concepts (they have real content)
          if (entry.enriched) score += 2;
          // Boost high-confidence concepts
          score += entry.confidence * 3;
        }

        return { entry, score };
      })
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, topN);

    return scored.map((s) => s.entry);
  }

  /**
   * Generate the index as a markdown string (for agent consumption).
   * Organized by category with one-line entries.
   */
  async generateIndexMarkdown(tenantId: string): Promise<string> {
    const index = await this.getIndex(tenantId);
    if (!index) return '# Brain Index\n\nNo vault found for this tenant.';

    const lines: string[] = [
      `# Brain Index`,
      ``,
      `Last updated: ${index.lastUpdated}`,
      `Total concepts: ${index.totalConcepts} (${index.enrichedConcepts} enriched)`,
      ``,
    ];

    // Group by category
    const byCategory = new Map<string, BrainIndexEntry[]>();
    for (const entry of index.entries) {
      const existing = byCategory.get(entry.category) ?? [];
      existing.push(entry);
      byCategory.set(entry.category, existing);
    }

    for (const [category, entries] of byCategory) {
      lines.push(`## ${category}`);
      lines.push('');
      for (const entry of entries) {
        const enrichedMark = entry.enriched ? '✓' : '○';
        const confStr = entry.confidence.toFixed(1);
        lines.push(`- ${enrichedMark} **[[${entry.name}]]** — ${entry.summary} [${confStr}]`);
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}
