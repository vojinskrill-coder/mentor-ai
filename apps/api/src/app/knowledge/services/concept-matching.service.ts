import { Injectable, Logger } from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import type { ConceptMatch, ConceptCategory, PersonaType } from '@mentor-ai/shared/types';
import { EmbeddingService } from './embedding.service';

/**
 * Options for concept matching.
 */
export interface ConceptMatchingOptions {
  /** Maximum number of concepts to return (default: 5) */
  limit?: number;
  /** Minimum similarity score threshold (default: 0.7) */
  threshold?: number;
  /** Filter by persona type (maps to department) */
  personaType?: PersonaType;
  /** Whether to include prerequisite concepts in results (default: true) */
  includePrerequisites?: boolean;
}

/**
 * Service for finding relevant business concepts using semantic + keyword search.
 * When Qdrant embeddings are available, uses AI-scored cosine similarity.
 * Falls back to improved keyword matching that handles Serbian text.
 * Walks the PREREQUISITE relationship graph so results include dependency context.
 */
@Injectable()
export class ConceptMatchingService {
  private readonly logger = new Logger(ConceptMatchingService.name);

  private readonly DEFAULT_LIMIT = 5;
  private readonly DEFAULT_THRESHOLD = 0.3;

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly embeddingService: EmbeddingService
  ) {}

  /**
   * Finds relevant business concepts for a given text.
   *
   * Strategy:
   * 1. Try Qdrant semantic search (AI embedding similarity) if available
   * 2. Fall back to improved keyword matching (supports Serbian)
   * 3. Walk PREREQUISITE relationships to include dependency context
   * 4. Sort by relationship-boosted score (concepts with more incoming = more foundational)
   */
  async findRelevantConcepts(
    response: string,
    options: ConceptMatchingOptions = {}
  ): Promise<ConceptMatch[]> {
    const limit = options.limit ?? this.DEFAULT_LIMIT;
    const threshold = options.threshold ?? this.DEFAULT_THRESHOLD;
    const includePrerequisites = options.includePrerequisites ?? true;

    this.logger.debug({
      message: 'Finding relevant concepts',
      responseLength: response.length,
      limit,
      threshold,
      personaType: options.personaType,
    });

    // 1. Try semantic search via Qdrant embeddings first
    let directMatches = await this.semanticSearch(
      response,
      limit * 2,
      threshold,
      options.personaType
    );

    // 2. If no semantic results, fall back to keyword matching
    if (directMatches.length === 0) {
      directMatches = await this.keywordMatch(response, limit * 2, options.personaType);
    }

    if (directMatches.length === 0) {
      return [];
    }

    // 3. Walk PREREQUISITE graph to include dependency context
    if (includePrerequisites) {
      directMatches = await this.expandWithPrerequisites(directMatches, limit);
    }

    // 4. Boost scores by relationship importance (more incoming = more foundational)
    const boosted = await this.boostByRelationshipImportance(directMatches);

    // Sort by boosted score, take top N
    return boosted.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Semantic search via Qdrant embeddings.
   * Returns empty array if Qdrant is not available or embeddings not generated.
   */
  private async semanticSearch(
    query: string,
    limit: number,
    threshold: number,
    personaType?: PersonaType
  ): Promise<ConceptMatch[]> {
    try {
      const filter = personaType
        ? { department: this.personaToDepartment(personaType) }
        : undefined;

      const semanticMatches = await this.embeddingService.search(query, limit, filter);

      if (semanticMatches.length === 0) {
        return [];
      }

      // Filter by threshold and enrich with full concept data
      const aboveThreshold = semanticMatches.filter((m) => m.score >= threshold);
      if (aboveThreshold.length === 0) {
        return [];
      }

      const enriched = await this.enrichMatchesWithConceptData(aboveThreshold);

      this.logger.debug({
        message: 'Semantic search results',
        totalMatches: semanticMatches.length,
        aboveThreshold: aboveThreshold.length,
        enriched: enriched.length,
      });

      return enriched;
    } catch (err) {
      this.logger.debug({
        message: 'Semantic search unavailable, will use keyword fallback',
        error: err instanceof Error ? err.message : 'Unknown',
      });
      return [];
    }
  }

  /**
   * Enriches semantic matches with full concept data from database.
   */
  private async enrichMatchesWithConceptData(
    matches: Array<{ conceptId: string; score: number; name: string }>
  ): Promise<ConceptMatch[]> {
    if (matches.length === 0) {
      return [];
    }

    const conceptIds = matches.map((m) => m.conceptId);

    const concepts = await this.prisma.concept.findMany({
      where: { id: { in: conceptIds } },
      select: {
        id: true,
        name: true,
        category: true,
        definition: true,
      },
    });

    const conceptMap = new Map(concepts.map((c) => [c.id, c]));

    return matches
      .map((match) => {
        const concept = conceptMap.get(match.conceptId);
        if (!concept) return null;

        return {
          conceptId: concept.id,
          conceptName: concept.name,
          category: concept.category as ConceptCategory,
          definition: concept.definition,
          score: match.score,
        };
      })
      .filter((m): m is ConceptMatch => m !== null);
  }

  /**
   * Improved keyword matching that handles Serbian text properly.
   * Supports Latin and Cyrillic characters (ćčšžđ).
   */
  private async keywordMatch(
    response: string,
    limit: number,
    personaType?: PersonaType
  ): Promise<ConceptMatch[]> {
    // Extract words preserving Serbian characters (a-z + ćčšžđ + Latin extended)
    const words = response
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length >= 3)
      .map((word) => word.replace(/[^a-zčćšžđàáâãäåèéêëìíîïòóôõöùúûüýÿñ]/gi, ''))
      .filter((word) => word.length >= 3);

    // Remove common words (English + Serbian)
    const commonWords = new Set([
      // English
      'the',
      'and',
      'for',
      'are',
      'but',
      'not',
      'you',
      'all',
      'can',
      'her',
      'was',
      'one',
      'our',
      'out',
      'has',
      'have',
      'been',
      'will',
      'with',
      'this',
      'that',
      'from',
      'they',
      'would',
      'about',
      'which',
      'their',
      'there',
      'should',
      'could',
      // Serbian
      'koji',
      'koja',
      'koje',
      'kao',
      'ali',
      'ili',
      'ako',
      'jer',
      'dok',
      'već',
      'vec',
      'još',
      'jos',
      'sve',
      'sam',
      'smo',
      'ste',
      'ima',
      'nije',
      'biti',
      'bio',
      'bila',
      'bilo',
      'može',
      'moze',
      'treba',
      'samo',
      'ovo',
      'taj',
      'tog',
      'tom',
      'tim',
      'kod',
      'između',
      'između',
      'nakon',
      'pre',
      'posle',
      'kroz',
      'nad',
      'pod',
    ]);
    const keywords = [...new Set(words.filter((w) => !commonWords.has(w)))];

    if (keywords.length === 0) {
      return [];
    }

    // Build OR conditions for keyword search (take top 15 keywords)
    const searchConditions = keywords.slice(0, 15).map((keyword) => ({
      OR: [
        { name: { contains: keyword, mode: 'insensitive' as const } },
        { definition: { contains: keyword, mode: 'insensitive' as const } },
      ],
    }));

    // Add department filter if persona specified
    const departmentFilter = personaType
      ? { departmentTags: { has: this.personaToDepartment(personaType) } }
      : {};

    const concepts = await this.prisma.concept.findMany({
      where: {
        OR: searchConditions,
        ...departmentFilter,
      },
      select: {
        id: true,
        name: true,
        category: true,
        definition: true,
        sortOrder: true,
      },
      take: limit * 2,
    });

    // Score concepts by keyword match count + name-match boost
    const scoredConcepts = concepts.map((concept) => {
      const nameLower = concept.name.toLowerCase();
      const defLower = concept.definition.toLowerCase();

      let matchScore = 0;
      for (const keyword of keywords) {
        // Name match is worth 3x more than definition match
        if (nameLower.includes(keyword)) {
          matchScore += 3;
        } else if (defLower.includes(keyword)) {
          matchScore += 1;
        }
      }

      // Normalize to 0-1 range: base 0.3 + up to 0.65 from matches
      const score = Math.min(0.3 + matchScore * 0.05, 0.95);

      return {
        conceptId: concept.id,
        conceptName: concept.name,
        category: concept.category as ConceptCategory,
        definition: concept.definition,
        score,
      };
    });

    return scoredConcepts.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Expands matched concepts with their PREREQUISITE dependencies.
   * If concept X requires concept Y (PREREQUISITE), Y is added to results
   * with a slightly lower score so it appears in context.
   */
  private async expandWithPrerequisites(
    matches: ConceptMatch[],
    maxTotal: number
  ): Promise<ConceptMatch[]> {
    const matchedIds = new Set(matches.map((m) => m.conceptId));

    // Find all PREREQUISITE relationships where matched concepts are the target
    // i.e., "what concepts are prerequisites for the ones we matched?"
    const prerequisites = await this.prisma.conceptRelationship.findMany({
      where: {
        sourceConceptId: { in: [...matchedIds] },
        relationshipType: 'PREREQUISITE',
      },
      select: {
        targetConceptId: true,
        targetConcept: {
          select: {
            id: true,
            name: true,
            category: true,
            definition: true,
            sortOrder: true,
          },
        },
      },
    });

    // Add prerequisite concepts that aren't already in results
    const prereqMatches: ConceptMatch[] = [];
    for (const rel of prerequisites) {
      if (matchedIds.has(rel.targetConceptId)) continue;
      matchedIds.add(rel.targetConceptId);

      const c = rel.targetConcept;
      prereqMatches.push({
        conceptId: c.id,
        conceptName: c.name,
        category: c.category as ConceptCategory,
        definition: c.definition,
        score: 0.85, // High score — prerequisites are foundational
      });
    }

    this.logger.debug({
      message: 'Expanded with prerequisites',
      directMatches: matches.length,
      prerequisitesAdded: prereqMatches.length,
    });

    // Prerequisites first (they're foundational), then direct matches
    return [...prereqMatches, ...matches].slice(0, maxTotal * 2);
  }

  /**
   * Boosts concept scores based on their relationship importance.
   * Concepts with more incoming PREREQUISITE relationships are more foundational
   * and get a score boost (they're needed by many other concepts).
   */
  private async boostByRelationshipImportance(matches: ConceptMatch[]): Promise<ConceptMatch[]> {
    if (matches.length === 0) return matches;

    const conceptIds = matches.map((m) => m.conceptId);

    // Count incoming PREREQUISITE relationships for each concept
    // (how many other concepts list this one as a prerequisite)
    const incomingCounts = await this.prisma.conceptRelationship.groupBy({
      by: ['targetConceptId'],
      where: {
        targetConceptId: { in: conceptIds },
        relationshipType: 'PREREQUISITE',
      },
      _count: { id: true },
    });

    const countMap = new Map(incomingCounts.map((c) => [c.targetConceptId, c._count.id]));

    // Boost score: more incoming prerequisites = more foundational = higher score
    // Max boost of +0.15 for concepts with 10+ incoming relationships
    return matches.map((m) => {
      const incomingCount = countMap.get(m.conceptId) ?? 0;
      const boost = Math.min(incomingCount * 0.015, 0.15);
      return {
        ...m,
        score: Math.min(m.score + boost, 1.0),
      };
    });
  }

  /**
   * Maps PersonaType to department name for filtering.
   */
  private personaToDepartment(personaType: PersonaType): string {
    const mapping: Record<PersonaType, string> = {
      CFO: 'Finance',
      CMO: 'Marketing',
      CTO: 'Technology',
      OPERATIONS: 'Operations',
      LEGAL: 'Legal',
      CREATIVE: 'Creative',
      CSO: 'Strategy',
      SALES: 'Sales',
    };
    return mapping[personaType] || personaType;
  }
}
