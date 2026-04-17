import { Controller, Get, Param, Query, Logger, NotFoundException, Inject } from '@nestjs/common';
import { ConceptService } from './services/concept.service';
import { CitationService } from './services/citation.service';
import { CurriculumService } from './services/curriculum.service';
import { VAULT_STORAGE, VaultStorage } from '../vault-storage/vault-storage.interface';
import type {
  ConceptCategory,
  CurriculumNode,
  ConceptsListResponse,
  ConceptResponse,
  ConceptRelationsResponse,
  MessageCitationsResponse,
  ConceptCitationSummary,
} from '@mentor-ai/shared/types';

/**
 * Controller for business concepts knowledge base endpoints.
 * Provides read-only access to the platform's concept library.
 */
@Controller('v1/knowledge')
export class KnowledgeController {
  private readonly logger = new Logger(KnowledgeController.name);

  constructor(
    private readonly conceptService: ConceptService,
    private readonly citationService: CitationService,
    private readonly curriculumService: CurriculumService,
    @Inject(VAULT_STORAGE) private readonly vaultStorage: VaultStorage,
  ) {}

  /**
   * Lists concepts with optional filtering and pagination.
   *
   * @param category - Filter by category (Finance, Marketing, etc.)
   * @param search - Search query for name/definition
   * @param page - Page number (1-indexed, default 1)
   * @param limit - Items per page (default 20, max 100)
   */
  @Get('concepts')
  async listConcepts(
    @Query('category') category?: ConceptCategory,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string
  ): Promise<ConceptsListResponse> {
    this.logger.log({
      message: 'Listing concepts',
      category,
      search,
      page,
      limit,
    });

    const result = await this.conceptService.findAll({
      category,
      search,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });

    return {
      data: result.data,
      meta: result.meta,
    };
  }

  /**
   * Gets a single concept by ID with all related concepts.
   *
   * @param id - Concept ID (cpt_ prefix)
   */
  // Route must be AFTER /concepts/by-name and /concepts/by-slug to prevent shadowing
  @Get('concepts/:id')
  async getConcept(@Param('id') id: string): Promise<ConceptResponse> {
    // Guard: skip if id matches a sub-route name (prevents route shadowing)
    if (id === 'by-name' || id === 'by-slug' || id === 'summary') {
      throw new NotFoundException({ type: 'not_found', title: 'Not Found', status: 404, detail: 'Use the specific endpoint' });
    }
    this.logger.log({ message: 'Getting concept', id });

    const concept = await this.conceptService.findById(id);

    // Read content from Obsidian vault (source of truth) if concept belongs to a tenant
    // ConceptWithRelations doesn't include tenantId, so query it separately
    const conceptMeta = await this.conceptService.findTenantInfo(id);
    if (conceptMeta?.tenantId && concept.slug) {
      try {
        const vaultContent = await this.readVaultFile(conceptMeta.tenantId, concept.slug);
        if (vaultContent && vaultContent.length > 500) {
          (concept as any).extendedDescription = vaultContent;
          this.logger.log({ message: 'Vault content loaded', slug: concept.slug, length: vaultContent.length });
        }
      } catch {
        // Vault read failed — use PG content
      }
    }

    return { data: concept };
  }

  /** Read concept article from Obsidian vault via VaultStorage abstraction. */
  private async readVaultFile(tenantId: string, slug: string): Promise<string> {
    return this.vaultStorage.readFile(tenantId, `wiki/concepts/${slug}.md`);
  }

  /**
   * Gets a concept by its name (case-insensitive).
   * Used for citation name → conceptId lookup.
   */
  @Get('concepts/by-name/:name')
  async getConceptByName(
    @Param('name') name: string
  ): Promise<{ data: { id: string; name: string } }> {
    const concept = await this.conceptService.findByName(decodeURIComponent(name));
    if (!concept) {
      throw new NotFoundException({
        type: 'concept_not_found',
        title: 'Concept Not Found',
        status: 404,
        detail: `Concept with name "${name}" does not exist`,
      });
    }
    return { data: concept };
  }

  /**
   * Gets a concept by its URL-friendly slug.
   *
   * @param slug - URL-friendly concept slug
   */
  @Get('concepts/by-slug/:slug')
  async getConceptBySlug(@Param('slug') slug: string): Promise<ConceptResponse> {
    this.logger.log({
      message: 'Getting concept by slug',
      slug,
    });

    const concept = await this.conceptService.findBySlug(slug);

    return {
      data: concept,
    };
  }

  /**
   * Gets related concepts for a given concept ID.
   *
   * @param id - Concept ID
   */
  @Get('concepts/:id/related')
  async getRelatedConcepts(
    @Param('id') id: string
  ): Promise<ConceptRelationsResponse> {
    this.logger.log({
      message: 'Getting related concepts',
      id,
    });

    const relations = await this.conceptService.findRelated(id);

    return {
      data: relations,
    };
  }

  /**
   * Gets all concept categories with counts.
   */
  @Get('categories')
  async getCategories(): Promise<{
    data: Array<{ category: string; count: number }>;
  }> {
    this.logger.log({ message: 'Getting categories' });

    const categories = await this.conceptService.getCategories();

    return {
      data: categories,
    };
  }

  /**
   * Gets knowledge base statistics.
   */
  @Get('stats')
  async getStats(): Promise<{
    data: { totalConcepts: number; categories: Array<{ category: string; count: number }> };
  }> {
    this.logger.log({ message: 'Getting knowledge base stats' });

    const [totalConcepts, categories] = await Promise.all([
      this.conceptService.getCount(),
      this.conceptService.getCategories(),
    ]);

    return {
      data: {
        totalConcepts,
        categories,
      },
    };
  }

  // ── Curriculum Endpoints ──

  /**
   * Returns the full curriculum tree as a flat array of nodes.
   */
  @Get('curriculum')
  getCurriculum(): { data: CurriculumNode[] } {
    this.logger.log({ message: 'Getting full curriculum' });
    return { data: this.curriculumService.getFullTree() };
  }

  /**
   * Searches curriculum labels by substring match.
   * @param q - Search query string
   */
  @Get('curriculum/search')
  searchCurriculum(
    @Query('q') q?: string
  ): { data: CurriculumNode[] } {
    this.logger.log({ message: 'Searching curriculum', query: q });
    if (!q || q.length < 1) {
      return { data: this.curriculumService.getTopLevelNodes() };
    }
    return { data: this.curriculumService.searchCurriculum(q) };
  }

  // ── Citation Endpoints (Story 2.6) ──

  /**
   * Gets citations for a specific message.
   * Returns all concept citations associated with the message.
   *
   * @param messageId - The message ID (msg_ prefix)
   */
  @Get('messages/:messageId/citations')
  async getMessageCitations(
    @Param('messageId') messageId: string
  ): Promise<MessageCitationsResponse> {
    this.logger.log({
      message: 'Getting citations for message',
      messageId,
    });

    const citations = await this.citationService.getCitationsForMessage(messageId);

    return {
      data: citations,
    };
  }

  /**
   * Gets a concept summary suitable for the citation side panel.
   * Returns concept details with related concepts for exploration.
   *
   * @param conceptId - The concept ID (cpt_ prefix)
   */
  @Get('concepts/:conceptId/summary')
  async getConceptSummary(
    @Param('conceptId') conceptId: string
  ): Promise<{ data: ConceptCitationSummary }> {
    this.logger.log({
      message: 'Getting concept summary for panel',
      conceptId,
    });

    const summary = await this.citationService.getConceptSummaryForPanel(conceptId);

    if (!summary) {
      throw new NotFoundException({
        type: 'concept_not_found',
        title: 'Concept Not Found',
        status: 404,
        detail: `Concept with ID ${conceptId} does not exist`,
      });
    }

    return {
      data: summary,
    };
  }
}
