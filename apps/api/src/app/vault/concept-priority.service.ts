import { Injectable, Logger } from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';

/**
 * ConceptPriorityService — ranks concepts by relevance to a specific
 * business profile to determine which 100 concepts should be enriched
 * first during onboarding.
 *
 * Scoring algorithm:
 *   1. Keyword overlap: how many business profile words match concept name/category
 *   2. Category relevance: does the concept category align with the business type
 *   3. Hierarchy position: root/parent concepts score higher (foundational)
 *   4. Foundation boost: "Uvod u Poslovanje" and "Vrednost" always in top 100
 */

export interface BusinessContext {
  companyName: string;
  industry: string;
  description: string;
  products?: string[];
  services?: string[];
  targetClients?: string[];
  geography?: string;
}

interface ScoredConcept {
  id: string;
  name: string;
  category: string;
  score: number;
}

/** Industries → relevant concept categories mapping */
const INDUSTRY_CATEGORY_BOOST: Record<string, string[]> = {
  technology: ['Sistemi', 'Upravljanje Podacima', 'Startup', 'Poslovni Modeli'],
  saas: ['Sistemi', 'Upravljanje Podacima', 'Startup', 'Poslovni Modeli', 'Odredjivanje Cene'],
  ecommerce: ['Marketing', 'Prodaja', 'Isporuka Vrednosti', 'Odredjivanje Cene'],
  consulting: ['Prodaja', 'Razvoj Poslovanja', 'Upravljanje Svojim Radom', 'Odredjivanje Cene'],
  manufacturing: ['Operacije i Proizvodnja', 'Isporuka Vrednosti', 'Finansije', 'Kompanijska Struktura'],
  retail: ['Prodaja', 'Marketing', 'Isporuka Vrednosti', 'Operacije i Proizvodnja'],
  finance: ['Finansije', 'Poslovni Modeli', 'Kompanijska Struktura'],
  healthcare: ['Operacije i Proizvodnja', 'Ljudski Resursi', 'Kompanijska Struktura'],
  education: ['Ljudski Resursi', 'Isporuka Vrednosti', 'Marketing'],
  creative: ['Marketing', 'Prodaja', 'Poslovni Modeli', 'Odredjivanje Cene'],
  luxury: ['Prodaja', 'Marketing', 'Odredjivanje Cene', 'Razvoj Poslovanja', 'Poslovni Modeli'],
  construction: ['Operacije i Proizvodnja', 'Finansije', 'Kompanijska Struktura', 'Ljudski Resursi'],
  food: ['Operacije i Proizvodnja', 'Marketing', 'Isporuka Vrednosti'],
  design: ['Marketing', 'Prodaja', 'Poslovni Modeli', 'Odredjivanje Cene'],
};

/** Foundation categories — always included in top 100 */
const FOUNDATION_CATEGORIES = ['Uvod u Poslovanje', 'Vrednost'];

@Injectable()
export class ConceptPriorityService {
  private readonly logger = new Logger(ConceptPriorityService.name);

  constructor(private readonly prisma: PlatformPrismaService) {}

  /**
   * Rank all concepts in a tenant vault by relevance to the business profile.
   * Returns the top N concept IDs ordered by score (highest first).
   */
  async rankConceptsByRelevance(
    tenantId: string,
    businessContext: BusinessContext,
    topN: number = 100,
  ): Promise<ScoredConcept[]> {
    // Load all tenant concepts
    const concepts = await this.prisma.concept.findMany({
      where: { tenantId },
      select: {
        id: true,
        name: true,
        category: true,
        parentId: true,
        sortOrder: true,
        categorySortOrder: true,
      },
    });

    if (concepts.length === 0) {
      this.logger.warn(`No concepts found for tenant ${tenantId}`);
      return [];
    }

    // Build keyword set from business profile
    const businessKeywords = this.extractKeywords(businessContext);

    // Score each concept
    const scored: ScoredConcept[] = concepts.map((c) => ({
      id: c.id,
      name: c.name,
      category: c.category,
      score: this.scoreConcept(c, businessKeywords, businessContext),
    }));

    // Sort by score descending, take top N
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, topN);

    this.logger.log({
      message: `Ranked ${concepts.length} concepts for tenant ${tenantId}`,
      topN,
      topScore: top[0]?.score ?? 0,
      bottomScore: top[top.length - 1]?.score ?? 0,
      foundationCount: top.filter((c) =>
        FOUNDATION_CATEGORIES.includes(c.category),
      ).length,
    });

    return top;
  }

  // ── Internal ──────────────────────────────────────────────────

  private scoreConcept(
    concept: { name: string; category: string; parentId: string | null; sortOrder: number; categorySortOrder: number },
    businessKeywords: Set<string>,
    ctx: BusinessContext,
  ): number {
    let score = 0;

    // 1. Foundation boost — always important
    if (FOUNDATION_CATEGORIES.includes(concept.category)) {
      score += 50;
    }

    // 2. Industry → category boost (word-boundary matching to avoid false positives)
    const industryWords = ctx.industry.toLowerCase().split(/[\s,;/&]+/).filter((w) => w.length > 2);
    for (const [key, categories] of Object.entries(INDUSTRY_CATEGORY_BOOST)) {
      if (industryWords.includes(key) || ctx.industry.toLowerCase() === key) {
        if (categories.includes(concept.category)) {
          score += 30;
        }
      }
    }

    // 3. Keyword overlap with concept name
    const nameWords = concept.name
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3);
    for (const word of nameWords) {
      if (businessKeywords.has(word)) {
        score += 10;
      }
    }

    // 4. Keyword overlap with category name
    const catWords = concept.category
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3);
    for (const word of catWords) {
      if (businessKeywords.has(word)) {
        score += 5;
      }
    }

    // 5. Hierarchy position — parent concepts (no parentId) score higher
    if (!concept.parentId) {
      score += 15;
    }

    // 6. Lower sort order = more fundamental = slight boost
    if (concept.categorySortOrder <= 5) {
      score += 5;
    }

    return score;
  }

  private extractKeywords(ctx: BusinessContext): Set<string> {
    const text = [
      ctx.companyName,
      ctx.industry,
      ctx.description,
      ...(ctx.products ?? []),
      ...(ctx.services ?? []),
      ...(ctx.targetClients ?? []),
      ctx.geography ?? '',
    ]
      .join(' ')
      .toLowerCase();

    // Extract meaningful words (3+ chars, no common stop words)
    const stopWords = new Set([
      'the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'was',
      'been', 'have', 'has', 'will', 'can', 'our', 'their', 'your', 'all',
      'not', 'but', 'they', 'which', 'each', 'into', 'also', 'more', 'most',
    ]);

    return new Set(
      text
        .replace(/[^a-z\s]/g, '')
        .split(/\s+/)
        .filter((w) => w.length > 3 && !stopWords.has(w)),
    );
  }
}
