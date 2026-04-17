import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { QdrantClientService } from '../qdrant/qdrant-client.service';
import { EmbeddingService } from '../knowledge/services/embedding.service';
import { v5 as uuidv5 } from 'uuid';

const COLLECTION_NAME = 'process-leads';
const EMBEDDING_DIMENSIONS = 1536; // text-embedding-3-small
const UUID_NAMESPACE = '8b14e2c4-7a3e-4d56-9f1a-1e4c3b2d5f6a'; // fixed namespace for deterministic IDs

export interface LeadRecord {
  name: string;
  company: string;
  email?: string | null;
  website?: string;
  location?: string;
  score?: number;
  tenantId: string;
  workflowSlug: string;
  runId: string;
  createdAt: string;
}

@Injectable()
export class ProcessDeduplicationService implements OnModuleInit {
  private readonly logger = new Logger(ProcessDeduplicationService.name);

  constructor(
    private readonly qdrantClient: QdrantClientService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  async onModuleInit(): Promise<void> {
    if (!this.qdrantClient.isAvailable()) {
      this.logger.warn('Qdrant not available — lead deduplication disabled');
      return;
    }
    try {
      await this.qdrantClient.ensureCollection(COLLECTION_NAME, EMBEDDING_DIMENSIONS);
      // Create payload index for tenant filtering
      const client = this.qdrantClient.getClient();
      await client.createPayloadIndex(COLLECTION_NAME, {
        field_name: 'tenantId',
        field_schema: 'keyword',
      }).catch(() => { /* index already exists */ });
      this.logger.log('Process leads collection ready');
    } catch (err) {
      this.logger.warn(`Failed to ensure process-leads collection: ${err}`);
    }
  }

  /**
   * Find existing leads similar to a query (for dedup before search step).
   * Returns a compact list of known leads for the tenant.
   */
  async findKnownLeads(tenantId: string, limit = 100): Promise<LeadRecord[]> {
    if (!this.qdrantClient.isAvailable()) return [];

    try {
      const client = this.qdrantClient.getClient();
      const result = await client.scroll(COLLECTION_NAME, {
        filter: {
          must: [{ key: 'tenantId', match: { value: tenantId } }],
        },
        limit,
        with_payload: true,
      });

      return (result.points ?? []).map((p) => p.payload as unknown as LeadRecord);
    } catch (err) {
      this.logger.warn(`Failed to fetch known leads: ${err}`);
      return [];
    }
  }

  /**
   * Store approved leads in Qdrant for future deduplication.
   * Uses company+name as the embedding text for semantic matching.
   */
  async storeLeads(leads: LeadRecord[]): Promise<number> {
    if (!this.qdrantClient.isAvailable() || leads.length === 0) return 0;

    let stored = 0;
    const client = this.qdrantClient.getClient();

    for (const lead of leads) {
      try {
        // Create embedding from company + name + location (semantic identity)
        const embeddingText = [lead.company, lead.name, lead.location].filter(Boolean).join(' — ');
        const { vector } = await this.embeddingService.embed(embeddingText);

        if (vector.every(v => v === 0)) continue; // Embedding failed

        // Deterministic ID from company+name so upsert is idempotent
        const pointId = uuidv5(`${lead.tenantId}:${lead.company}:${lead.name}`.toLowerCase(), UUID_NAMESPACE);

        await client.upsert(COLLECTION_NAME, {
          wait: true,
          points: [{
            id: pointId,
            vector,
            payload: lead as unknown as Record<string, unknown>,
          }],
        });

        stored++;
      } catch (err) {
        this.logger.warn(`Failed to store lead ${lead.name} @ ${lead.company}: ${err}`);
      }
    }

    this.logger.log(`Stored ${stored}/${leads.length} leads in Qdrant`);
    return stored;
  }

  /**
   * Check if a specific lead already exists (by semantic similarity).
   * Returns true if a very similar lead is found (score > 0.92).
   */
  async isDuplicate(tenantId: string, company: string, name: string): Promise<boolean> {
    if (!this.qdrantClient.isAvailable()) return false;

    try {
      const embeddingText = `${company} — ${name}`;
      const { vector } = await this.embeddingService.embed(embeddingText);
      if (vector.every(v => v === 0)) return false;

      const client = this.qdrantClient.getClient();
      const results = await client.search(COLLECTION_NAME, {
        vector,
        limit: 1,
        score_threshold: 0.92, // Very high — only near-exact matches
        filter: {
          must: [{ key: 'tenantId', match: { value: tenantId } }],
        },
      });

      return results.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Build a deduplication context string for the agent prompt.
   * Lists known leads compactly so the agent skips them.
   */
  async buildDeduplicationContext(tenantId: string): Promise<string> {
    const known = await this.findKnownLeads(tenantId);
    if (known.length === 0) return '';

    const lines = known.map(l =>
      `- ${l.name} | ${l.company} | ${(l as any).website || 'no website'}`
    );

    return [
      '## BLACKLIST — DO NOT RETURN THESE',
      `We already have ${known.length} leads. A lead is a DUPLICATE if the full name AND company AND website all match.`,
      'SKIP any company+person combination from this list:',
      '',
      ...lines,
      '',
      'Find ONLY NEW companies and people NOT on this list.',
    ].join('\n');
  }

  /**
   * Build dedup context for content processes.
   * Lists previously created content topics so the agent doesn't repeat them.
   */
  async buildContentDeduplicationContext(tenantId: string): Promise<string> {
    // Find topics from previous completed content runs
    const known = await this.findKnownLeads(tenantId); // reuse same collection, filter by type
    const contentItems = known.filter(l => (l as any).contentType === 'instagram-post');

    if (contentItems.length === 0) return '';

    const topics = contentItems.map(l => `- ${l.name}`);
    return [
      '## Previously Created Content (do NOT repeat these topics)',
      `We already posted about these ${contentItems.length} topics:`,
      '',
      ...topics,
      '',
      'Create DIFFERENT topics. Do not repeat or closely rephrase any of the above.',
    ].join('\n');
  }
}
