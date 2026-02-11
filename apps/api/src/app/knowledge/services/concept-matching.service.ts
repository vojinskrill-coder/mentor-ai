import { Injectable, Logger } from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import type {
  ConceptMatch,
  ConceptCategory,
  PersonaType,
} from '@mentor-ai/shared/types';
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
}

/**
 * Service for finding relevant business concepts using semantic search.
 * Integrates with EmbeddingService for vector similarity search.
 *
 * @example
 * ```typescript
 * const matches = await conceptMatchingService.findRelevantConcepts(
 *   "We should consider a value-based pricing strategy",
 *   { limit: 5, threshold: 0.7 }
 * );
 * ```
 */
@Injectable()
export class ConceptMatchingService {
  private readonly logger = new Logger(ConceptMatchingService.name);

  /** Default maximum concepts to return */
  private readonly DEFAULT_LIMIT = 5;

  /** Default minimum similarity threshold */
  private readonly DEFAULT_THRESHOLD = 0.7;

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly embeddingService: EmbeddingService
  ) {}

  /**
   * Finds relevant business concepts for a given text response.
   * Uses semantic search to find concepts with similar meaning.
   *
   * @param response - The AI response text to find concepts for
   * @param options - Matching options (limit, threshold, personaType)
   * @returns Array of matching concepts with similarity scores
   * @throws Error if embedding service fails
   */
  async findRelevantConcepts(
    response: string,
    options: ConceptMatchingOptions = {}
  ): Promise<ConceptMatch[]> {
    const limit = options.limit ?? this.DEFAULT_LIMIT;
    const threshold = options.threshold ?? this.DEFAULT_THRESHOLD;

    this.logger.debug({
      message: 'Finding relevant concepts',
      responseLength: response.length,
      limit,
      threshold,
      personaType: options.personaType,
    });

    // Try semantic search via EmbeddingService
    const semanticMatches = await this.embeddingService.search(
      response,
      limit * 2, // Get more to filter later
      options.personaType ? { department: options.personaType } : undefined
    );

    // If semantic search returns results, use them
    if (semanticMatches.length > 0) {
      const filteredMatches = semanticMatches
        .filter((match) => match.score >= threshold)
        .slice(0, limit);

      this.logger.debug({
        message: 'Semantic search completed',
        totalMatches: semanticMatches.length,
        filteredMatches: filteredMatches.length,
      });

      // Enrich with concept details from database
      return this.enrichMatchesWithConceptData(filteredMatches);
    }

    // Fallback to keyword-based search if semantic search unavailable
    this.logger.debug({
      message: 'Falling back to keyword-based matching',
    });

    return this.fallbackKeywordMatch(response, limit, options.personaType);
  }

  /**
   * Enriches semantic matches with full concept data from database.
   *
   * @param matches - Raw matches from embedding service
   * @returns Enriched concept matches with category and definition
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
        if (!concept) {
          this.logger.warn({
            message: 'Concept not found in database',
            conceptId: match.conceptId,
          });
          return null;
        }

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
   * Fallback keyword-based matching when semantic search is unavailable.
   * Searches for concepts whose names or definitions contain keywords from the response.
   *
   * @param response - The AI response text
   * @param limit - Maximum concepts to return
   * @param personaType - Optional persona type filter
   * @returns Matching concepts with estimated scores
   */
  private async fallbackKeywordMatch(
    response: string,
    limit: number,
    personaType?: PersonaType
  ): Promise<ConceptMatch[]> {
    // Extract significant words from response (3+ characters, lowercase)
    const words = response
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length >= 3)
      .map((word) => word.replace(/[^a-z]/g, ''))
      .filter((word) => word.length >= 3);

    // Remove common words
    const commonWords = new Set([
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
    ]);
    const keywords = [...new Set(words.filter((w) => !commonWords.has(w)))];

    if (keywords.length === 0) {
      return [];
    }

    // Build OR conditions for keyword search
    const searchConditions = keywords.slice(0, 10).map((keyword) => ({
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
      },
      take: limit * 2,
    });

    // Score concepts by keyword match count
    const scoredConcepts = concepts.map((concept) => {
      const nameWords = concept.name.toLowerCase().split(/\s+/);
      const defWords = concept.definition.toLowerCase().split(/\s+/);
      const allWords = [...nameWords, ...defWords];

      const matchCount = keywords.filter((keyword) =>
        allWords.some((word) => word.includes(keyword))
      ).length;

      // Normalize score to 0-1 range (approximate)
      const score = Math.min(0.5 + matchCount * 0.1, 0.95);

      return {
        conceptId: concept.id,
        conceptName: concept.name,
        category: concept.category as ConceptCategory,
        definition: concept.definition,
        score,
      };
    });

    // Sort by score and return top matches
    return scoredConcepts
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
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
