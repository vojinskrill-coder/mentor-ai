import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { AiGatewayService } from '../../ai-gateway/ai-gateway.service';
import type {
  Concept,
  ConceptSummary,
  ConceptWithRelations,
  ConceptCategory,
  RelationshipType,
  DynamicRelationshipResult,
  PaginationMeta,
  ChatMessage,
} from '@mentor-ai/shared/types';
import {
  getRelevantCategories,
  buildRelationshipClassificationPrompt,
} from '../templates/relationship-prompt';
import type { RelationshipSuggestion } from '../templates/relationship-prompt';

/**
 * Query options for listing concepts.
 */
export interface ConceptQueryOptions {
  /** Filter by category */
  category?: ConceptCategory;
  /** Search query for name/definition */
  search?: string;
  /** Page number (1-indexed) */
  page?: number;
  /** Items per page */
  limit?: number;
}

/**
 * Service for querying and managing business concepts.
 * Provides read-only access to the platform's knowledge base.
 */
@Injectable()
export class ConceptService {
  private readonly logger = new Logger(ConceptService.name);

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly aiGateway: AiGatewayService,
  ) {}

  /**
   * Finds concepts with optional filtering and pagination.
   *
   * @param options - Query options for filtering and pagination
   * @returns Paginated list of concept summaries
   */
  async findAll(
    options: ConceptQueryOptions = {}
  ): Promise<{ data: ConceptSummary[]; meta: PaginationMeta }> {
    const page = options.page ?? 1;
    const limit = Math.min(options.limit ?? 20, 100);
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};

    if (options.category) {
      where.category = options.category;
    }

    if (options.search) {
      where.OR = [
        { name: { contains: options.search, mode: 'insensitive' } },
        { definition: { contains: options.search, mode: 'insensitive' } },
      ];
    }

    const [concepts, total] = await Promise.all([
      this.prisma.concept.findMany({
        where,
        select: {
          id: true,
          name: true,
          slug: true,
          category: true,
          definition: true,
        },
        orderBy: { name: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.concept.count({ where }),
    ]);

    this.logger.debug({
      message: 'Concepts query executed',
      category: options.category,
      search: options.search,
      page,
      limit,
      resultCount: concepts.length,
      total,
    });

    return {
      data: concepts.map((c) => ({
        id: c.id,
        name: c.name,
        slug: c.slug,
        category: c.category as ConceptCategory,
        definition: c.definition,
      })),
      meta: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  /**
   * Finds a single concept by ID with all related concepts.
   *
   * @param id - Concept ID (cpt_ prefix)
   * @returns Full concept with relationships
   * @throws NotFoundException if concept doesn't exist
   */
  async findById(id: string): Promise<ConceptWithRelations> {
    const concept = await this.prisma.concept.findUnique({
      where: { id },
      include: {
        relatedTo: {
          include: {
            targetConcept: {
              select: {
                id: true,
                name: true,
                slug: true,
                category: true,
                definition: true,
                extendedDescription: true,
                departmentTags: true,
                embeddingId: true,
                version: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
        },
        relatedFrom: {
          include: {
            sourceConcept: {
              select: {
                id: true,
                name: true,
                slug: true,
                category: true,
                definition: true,
                extendedDescription: true,
                departmentTags: true,
                embeddingId: true,
                version: true,
                createdAt: true,
                updatedAt: true,
              },
            },
          },
        },
      },
    });

    if (!concept) {
      throw new NotFoundException({
        type: 'concept_not_found',
        title: 'Concept Not Found',
        status: 404,
        detail: `Concept with ID ${id} does not exist`,
      });
    }

    this.logger.debug({
      message: 'Concept found',
      id: concept.id,
      name: concept.name,
      relatedToCount: concept.relatedTo.length,
      relatedFromCount: concept.relatedFrom.length,
    });

    // Combine relationships from both directions
    const relatedConcepts: ConceptWithRelations['relatedConcepts'] = [
      ...concept.relatedTo.map((rel) => ({
        concept: this.mapToConcept(rel.targetConcept),
        relationshipType: rel.relationshipType as RelationshipType,
        direction: 'outgoing' as const,
      })),
      ...concept.relatedFrom.map((rel) => ({
        concept: this.mapToConcept(rel.sourceConcept),
        relationshipType: rel.relationshipType as RelationshipType,
        direction: 'incoming' as const,
      })),
    ];

    return {
      id: concept.id,
      name: concept.name,
      slug: concept.slug,
      category: concept.category as ConceptCategory,
      definition: concept.definition,
      extendedDescription: concept.extendedDescription ?? undefined,
      departmentTags: concept.departmentTags,
      embeddingId: concept.embeddingId ?? undefined,
      version: concept.version,
      createdAt: concept.createdAt.toISOString(),
      updatedAt: concept.updatedAt.toISOString(),
      relatedConcepts,
    };
  }

  /**
   * Finds a single concept by slug.
   *
   * @param slug - URL-friendly concept slug
   * @returns Full concept with relationships
   * @throws NotFoundException if concept doesn't exist
   */
  async findBySlug(slug: string): Promise<ConceptWithRelations> {
    const concept = await this.prisma.concept.findUnique({
      where: { slug },
    });

    if (!concept) {
      throw new NotFoundException({
        type: 'concept_not_found',
        title: 'Concept Not Found',
        status: 404,
        detail: `Concept with slug ${slug} does not exist`,
      });
    }

    return this.findById(concept.id);
  }

  /**
   * Finds related concepts for a given concept ID.
   *
   * @param id - Concept ID
   * @returns List of related concepts with relationship type and direction
   */
  async findRelated(
    id: string
  ): Promise<
    Array<{
      concept: ConceptSummary;
      relationshipType: RelationshipType;
      direction: 'outgoing' | 'incoming';
    }>
  > {
    const concept = await this.findById(id);

    return concept.relatedConcepts.map((rel) => ({
      concept: {
        id: rel.concept.id,
        name: rel.concept.name,
        slug: rel.concept.slug,
        category: rel.concept.category,
        definition: rel.concept.definition,
      },
      relationshipType: rel.relationshipType,
      direction: rel.direction,
    }));
  }

  /**
   * Gets all unique categories in the database.
   *
   * @returns List of categories with concept counts
   */
  async getCategories(): Promise<Array<{ category: string; count: number }>> {
    const result = await this.prisma.concept.groupBy({
      by: ['category'],
      _count: { id: true },
      orderBy: { category: 'asc' },
    });

    return result.map((r) => ({
      category: r.category,
      count: r._count.id,
    }));
  }

  /**
   * Gets total count of concepts in the database.
   */
  async getCount(): Promise<number> {
    return this.prisma.concept.count();
  }

  /**
   * Finds a concept by name (case-insensitive).
   * Used for citation name → conceptId lookup.
   */
  async findByName(name: string): Promise<{ id: string; name: string } | null> {
    const concept = await this.prisma.concept.findFirst({
      where: { name: { equals: name, mode: 'insensitive' } },
      select: { id: true, name: true },
    });
    return concept;
  }

  /**
   * Batch lookup of concepts by IDs.
   * Used by ConversationService to resolve concept details for tree display.
   */
  async findByIds(
    ids: string[]
  ): Promise<Map<string, { id: string; name: string; slug: string; category: string }>> {
    if (ids.length === 0) return new Map();

    const concepts = await this.prisma.concept.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, slug: true, category: true },
    });

    return new Map(concepts.map((c) => [c.id, c]));
  }

  /**
   * Creates dynamic relationships between a newly discovered concept
   * and existing concepts using AI classification.
   * Non-blocking — errors are logged but never thrown to callers.
   *
   * Story 2.13: Dynamic Concept Relationship Creation
   */
  async createDynamicRelationships(
    conceptId: string,
    conceptName?: string,
    category?: string,
  ): Promise<DynamicRelationshipResult> {
    const result: DynamicRelationshipResult = {
      conceptId,
      conceptName: conceptName ?? conceptId,
      relationshipsCreated: 0,
      errors: [],
    };

    try {
      // 1. Load the concept's name, definition, and category
      const concept = await this.prisma.concept.findUnique({
        where: { id: conceptId },
        select: { name: true, definition: true, slug: true, category: true },
      });

      if (!concept) {
        result.errors.push(`Concept ${conceptId} not found`);
        return result;
      }

      // Resolve name and category from DB if not provided
      const resolvedName = conceptName ?? concept.name;
      result.conceptName = resolvedName;
      const resolvedCategory = category ?? concept.category;

      // 2. Query candidate concepts filtered by relevant categories
      const relevantCategories = getRelevantCategories(resolvedCategory);
      const candidates = await this.prisma.concept.findMany({
        where: {
          id: { not: conceptId },
          category: { in: relevantCategories },
        },
        select: {
          id: true,
          slug: true,
          name: true,
          category: true,
          definition: true,
        },
        orderBy: { name: 'asc' },
        take: 20,
      });

      if (candidates.length === 0) {
        this.logger.debug({ message: 'No candidate concepts for relationship creation', conceptName: resolvedName, category: resolvedCategory });
        return result;
      }

      // 3. Build LLM prompt and call AI for classification
      const prompt = buildRelationshipClassificationPrompt(
        resolvedName,
        resolvedCategory,
        concept.definition,
        candidates,
      );

      const messages: ChatMessage[] = [
        { role: 'user', content: prompt },
      ];

      let fullResponse = '';
      await this.aiGateway.streamCompletion(messages, (chunk) => {
        fullResponse += chunk;
      });

      // 4. Parse LLM response into relationship suggestions
      const suggestions = this.parseRelationshipSuggestions(fullResponse, candidates);

      if (suggestions.length === 0) {
        this.logger.debug({ message: 'No relationships suggested by AI', conceptName: resolvedName });
        return result;
      }

      // 5. Map slugs to concept IDs and batch-create relationships
      const slugToId = new Map(candidates.map((c) => [c.slug, c.id]));
      const relationshipData = suggestions
        .filter((s) => slugToId.has(s.slug))
        .map((s) => ({
          sourceConceptId: conceptId,
          targetConceptId: slugToId.get(s.slug)!,
          relationshipType: s.type,
        }));

      if (relationshipData.length > 0) {
        const created = await this.prisma.conceptRelationship.createMany({
          data: relationshipData,
          skipDuplicates: true,
        });
        result.relationshipsCreated = created.count;
      }

      this.logger.log({
        message: 'Dynamic relationships created',
        conceptName: resolvedName,
        category: resolvedCategory,
        candidatesEvaluated: candidates.length,
        suggestedCount: suggestions.length,
        createdCount: result.relationshipsCreated,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      result.errors.push(errMsg);
      this.logger.warn({
        message: 'Dynamic relationship creation failed',
        conceptName,
        error: errMsg,
      });
    }

    return result;
  }

  /**
   * Parses JSON relationship suggestions from LLM response.
   * Validates against known candidate slugs.
   */
  private parseRelationshipSuggestions(
    response: string,
    candidates: Array<{ slug: string }>,
  ): RelationshipSuggestion[] {
    try {
      // Extract first JSON array from response (non-greedy to avoid spanning multiple arrays)
      const jsonMatch = response.match(/\[[\s\S]*?\]/);
      if (!jsonMatch) return [];

      const parsed = JSON.parse(jsonMatch[0]) as unknown[];
      if (!Array.isArray(parsed)) return [];

      const validTypes = new Set(['PREREQUISITE', 'RELATED', 'ADVANCED']);
      const validSlugs = new Set(candidates.map((c) => c.slug));

      return parsed
        .filter((item): item is { slug: string; type: string } =>
          typeof item === 'object' &&
          item !== null &&
          'slug' in item &&
          'type' in item &&
          typeof (item as Record<string, unknown>).slug === 'string' &&
          typeof (item as Record<string, unknown>).type === 'string',
        )
        .filter((item) => validSlugs.has(item.slug) && validTypes.has(item.type))
        .map((item) => ({
          slug: item.slug,
          type: item.type as 'PREREQUISITE' | 'RELATED' | 'ADVANCED',
        }));
    } catch {
      this.logger.warn({ message: 'Failed to parse relationship suggestions from LLM', responseLength: response.length });
      return [];
    }
  }

  /**
   * Maps a Prisma concept to the Concept interface.
   */
  private mapToConcept(data: {
    id: string;
    name: string;
    slug: string;
    category: string;
    definition: string;
    extendedDescription: string | null;
    departmentTags: string[];
    embeddingId: string | null;
    version: number;
    createdAt: Date;
    updatedAt: Date;
  }): Concept {
    return {
      id: data.id,
      name: data.name,
      slug: data.slug,
      category: data.category as ConceptCategory,
      definition: data.definition,
      extendedDescription: data.extendedDescription ?? undefined,
      departmentTags: data.departmentTags,
      embeddingId: data.embeddingId ?? undefined,
      version: data.version,
      createdAt: data.createdAt.toISOString(),
      updatedAt: data.updatedAt.toISOString(),
    };
  }
}
