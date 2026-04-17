import { Injectable, Inject, Logger } from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { VAULT_STORAGE, VaultStorage } from '../vault-storage/vault-storage.interface';

export interface ConsistencyResult {
  consistent: boolean;
  totalConcepts: number;
  completedConcepts: number;
  missingVaultFiles: string[];
  orphanedVaultFiles: string[];
}

@Injectable()
export class ConsistencyCheckService {
  private readonly logger = new Logger(ConsistencyCheckService.name);

  constructor(
    private readonly prisma: PlatformPrismaService,
    @Inject(VAULT_STORAGE) private readonly vaultStorage: VaultStorage,
  ) {}

  async verifyConsistency(tenantId: string): Promise<ConsistencyResult> {
    // Get all concepts from DB
    const concepts = await (this.prisma as any).concept.findMany({
      select: { id: true, slug: true },
    });

    // Get completed enrichment entries
    const completed = await (this.prisma as any).enrichmentQueue?.findMany?.({
      where: { tenantId, status: 'COMPLETED' },
      select: { conceptSlug: true },
    }) || [];

    const completedSlugs = new Set<string>(
      completed.map((c: any) => c.conceptSlug as string),
    );

    // Check vault files for completed concepts
    const missingVaultFiles: string[] = [];
    for (const slug of Array.from(completedSlugs)) {
      try {
        const exists = await this.vaultStorage.fileExists(
          tenantId,
          `concepts/${slug}.md`,
        );
        if (!exists) {
          missingVaultFiles.push(slug);
        }
      } catch {
        missingVaultFiles.push(slug);
      }
    }

    // Check for orphaned vault files (files without DB concept)
    const orphanedVaultFiles: string[] = [];
    try {
      const vaultFiles = await this.vaultStorage.listFiles(
        tenantId,
        'concepts',
      );
      const conceptSlugs = new Set(concepts.map((c: any) => c.slug));
      for (const file of vaultFiles) {
        const slug = file.replace('.md', '');
        if (!conceptSlugs.has(slug)) {
          orphanedVaultFiles.push(slug);
        }
      }
    } catch {
      // Vault may not be available
    }

    const consistent = missingVaultFiles.length === 0;

    return {
      consistent,
      totalConcepts: concepts.length,
      completedConcepts: completedSlugs.size,
      missingVaultFiles,
      orphanedVaultFiles,
    };
  }
}
