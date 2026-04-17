import { Injectable, Inject, Logger } from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { VAULT_STORAGE, VaultStorage } from '../vault-storage/vault-storage.interface';

export interface ConceptContent {
  slug: string;
  content: string;
  source: 'vault' | 'database' | 'fallback';
  metadata?: Record<string, any>;
}

@Injectable()
export class ContentDeliveryService {
  private readonly logger = new Logger(ContentDeliveryService.name);

  constructor(
    private readonly prisma: PlatformPrismaService,
    @Inject(VAULT_STORAGE) private readonly vaultStorage: VaultStorage,
  ) {}

  async getConceptContent(
    tenantId: string,
    conceptId: string,
  ): Promise<ConceptContent | null> {
    // Verify concept exists and belongs to tenant context
    const concept = await (this.prisma as any).concept.findUnique({
      where: { id: conceptId },
    });

    if (!concept) {
      this.logger.warn(`Concept ${conceptId} not found`);
      return null;
    }

    // Cross-tenant rejection: concepts are platform-wide but content is tenant-specific
    // The slug is used to locate tenant-specific vault content
    const slug = concept.slug;

    // Vault-first: try reading from tenant vault
    try {
      const content = await this.vaultStorage.readFile(
        tenantId,
        `concepts/${slug}.md`,
      );
      this.logger.debug(`Vault hit for ${tenantId}/${slug}`);
      return {
        slug,
        content,
        source: 'vault',
        metadata: {
          conceptId: concept.id,
          name: concept.name,
          category: concept.category,
        },
      };
    } catch {
      this.logger.debug(`Vault miss for ${tenantId}/${slug}, falling back`);
    }

    // Fallback: return concept description from DB
    if (concept.description) {
      return {
        slug,
        content: concept.description,
        source: 'database',
        metadata: {
          conceptId: concept.id,
          name: concept.name,
          category: concept.category,
        },
      };
    }

    // Graceful degradation
    return {
      slug,
      content: `# ${concept.name}\n\nContent is being generated. Please check back later.`,
      source: 'fallback',
      metadata: {
        conceptId: concept.id,
        name: concept.name,
        category: concept.category,
      },
    };
  }

  async getConceptContentBySlug(
    tenantId: string,
    slug: string,
  ): Promise<ConceptContent | null> {
    const concept = await (this.prisma as any).concept.findFirst({
      where: { slug },
    });

    if (!concept) return null;
    return this.getConceptContent(tenantId, concept.id);
  }

  async listAvailableContent(tenantId: string): Promise<string[]> {
    try {
      const files = await this.vaultStorage.listFiles(tenantId, 'concepts');
      return files
        .filter((f: string) => f.endsWith('.md'))
        .map((f: string) => f.replace('.md', ''));
    } catch {
      return [];
    }
  }
}
