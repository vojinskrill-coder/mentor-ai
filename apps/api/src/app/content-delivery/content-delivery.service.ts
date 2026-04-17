import { Injectable, Inject, Logger } from '@nestjs/common';
import { VaultStorage, VAULT_STORAGE } from '../vault-storage/vault-storage.interface';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';

/**
 * Content Delivery Service (Story 5.1)
 *
 * Reads enriched concept content from the vault (source of truth).
 * PG provides metadata only — content is NEVER read from PG.
 * Gracefully degrades if vault is unreachable.
 */

export interface ConceptContent {
  id: string;
  name: string;
  slug: string;
  category: string;
  tier: string | null;
  confidence: number | null;
  enrichmentStatus: 'completed' | 'pending' | 'error';
  content: string | null;
  error?: string;
}

@Injectable()
export class ContentDeliveryService {
  private readonly logger = new Logger(ContentDeliveryService.name);

  constructor(
    private readonly prisma: PlatformPrismaService,
    @Inject(VAULT_STORAGE) private readonly vaultStorage: VaultStorage,
  ) {}

  /**
   * Get concept with content from vault.
   * tenantId comes from authenticated session — never from URL.
   */
  async getConceptContent(tenantId: string, conceptId: string): Promise<ConceptContent> {
    // 1. Metadata from PG
    const concept = await (this.prisma as any).concept.findUnique({
      where: { id: conceptId },
      select: {
        id: true,
        name: true,
        slug: true,
        category: true,
        tier: true,
        confidence: true,
        tenantId: true,
      },
    });

    if (!concept) {
      throw new Error(`Concept ${conceptId} not found`);
    }

    // Tenant isolation: verify concept belongs to this tenant
    if (concept.tenantId && concept.tenantId !== tenantId) {
      throw new Error(`Concept ${conceptId} does not belong to tenant ${tenantId}`);
    }

    // 2. Content from vault (source of truth — NEVER from PG)
    const slug = concept.slug || concept.name.toLowerCase().replace(/\s+/g, '-');
    const vaultPath = `wiki/concepts/${slug}.md`;

    try {
      const exists = await this.vaultStorage.fileExists(tenantId, vaultPath);
      if (!exists) {
        return {
          id: concept.id,
          name: concept.name,
          slug,
          category: concept.category,
          tier: concept.tier,
          confidence: concept.confidence,
          enrichmentStatus: 'pending',
          content: null,
        };
      }

      const content = await this.vaultStorage.readFile(tenantId, vaultPath);
      return {
        id: concept.id,
        name: concept.name,
        slug,
        category: concept.category,
        tier: concept.tier,
        confidence: concept.confidence,
        enrichmentStatus: 'completed',
        content,
      };
    } catch (err) {
      // Graceful degradation — not a 500
      this.logger.error({
        event: 'content_delivery.vault_error',
        tenantId,
        conceptId,
        error: (err as Error).message,
      });

      return {
        id: concept.id,
        name: concept.name,
        slug,
        category: concept.category,
        tier: concept.tier,
        confidence: concept.confidence,
        enrichmentStatus: 'error',
        content: null,
        error: 'Content temporarily unavailable',
      };
    }
  }
}
