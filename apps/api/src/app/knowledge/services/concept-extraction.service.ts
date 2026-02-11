import { Injectable, Logger } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { AiGatewayService } from '../../ai-gateway/ai-gateway.service';
import { ConceptService } from './concept.service';
import type {
  ConceptExtractionResult,
  ConceptSummary,
  ConceptCategory,
  ChatMessage,
} from '@mentor-ai/shared/types';
import {
  buildConceptExtractionPrompt,
  parseExtractionResponse,
} from '../templates/extraction-prompt';

/** Context for concept extraction */
export interface ExtractionContext {
  conversationId?: string;
  conceptId?: string;
  maxNew?: number;
}

/** Default maximum concepts per extraction call */
const DEFAULT_MAX_NEW = 5;

/**
 * Generic service for extracting new business concepts from AI output text.
 * Creates concepts in the database and triggers relationship linking.
 *
 * Used by both manual chat (conversation.gateway.ts) and YOLO workflow
 * (yolo-scheduler.service.ts).
 *
 * Story 2.15: AI-Driven Concept Discovery and Creation
 */
@Injectable()
export class ConceptExtractionService {
  private readonly logger = new Logger(ConceptExtractionService.name);

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly aiGateway: AiGatewayService,
    private readonly conceptService: ConceptService,
  ) {}

  /**
   * Extracts new business concepts from AI output text, validates them,
   * creates them in the database, and triggers relationship linking.
   *
   * @param aiOutput - The AI-generated text to analyze
   * @param context - Optional context (conversationId, conceptId, maxNew cap)
   * @returns Result with created concepts, skipped duplicates, and errors
   */
  async extractAndCreateConcepts(
    aiOutput: string,
    context: ExtractionContext = {},
  ): Promise<ConceptExtractionResult> {
    const result: ConceptExtractionResult = {
      created: [],
      skippedDuplicates: [],
      errors: [],
    };

    const maxNew = context.maxNew ?? DEFAULT_MAX_NEW;

    try {
      // 1. Get existing concept names for deduplication in the prompt
      const existingConcepts = await this.prisma.concept.findMany({
        select: { name: true },
        orderBy: { name: 'asc' },
      });
      const existingNames = existingConcepts.map((c) => c.name);

      // 2. Call LLM to extract concept candidates
      const prompt = buildConceptExtractionPrompt(aiOutput, existingNames, maxNew);
      const messages: ChatMessage[] = [{ role: 'user', content: prompt }];

      let fullResponse = '';
      await this.aiGateway.streamCompletion(messages, (chunk) => {
        fullResponse += chunk;
      });

      // 3. Parse and validate candidates
      const candidates = parseExtractionResponse(fullResponse);

      if (candidates.length === 0) {
        this.logger.debug({ message: 'No new concepts extracted from AI output' });
        return result;
      }

      // 4. Process each candidate (up to maxNew)
      const toProcess = candidates.slice(0, maxNew);

      for (const candidate of toProcess) {
        // Duplicate check: case-insensitive name lookup
        const existing = await this.conceptService.findByName(candidate.name);
        if (existing) {
          result.skippedDuplicates.push(candidate.name);
          this.logger.debug({
            message: 'Skipped duplicate concept',
            name: candidate.name,
            existingId: existing.id,
          });
          continue;
        }

        // Create concept in DB
        try {
          const slug = this.generateSlug(candidate.name);
          const conceptId = `cpt_${createId()}`;

          const newConcept = await this.prisma.concept.create({
            data: {
              id: conceptId,
              name: candidate.name,
              slug,
              category: candidate.category,
              definition: candidate.definition,
              departmentTags: candidate.departmentTags,
              source: 'AI_DISCOVERED',
              version: 1,
            },
          });

          const summary: ConceptSummary = {
            id: newConcept.id,
            name: newConcept.name,
            slug: newConcept.slug,
            category: newConcept.category as ConceptCategory,
            definition: newConcept.definition,
          };
          result.created.push(summary);

          this.logger.log({
            message: 'AI-discovered concept created',
            conceptId: newConcept.id,
            name: newConcept.name,
            category: newConcept.category,
          });

          // Trigger relationship linking (non-blocking, fire-and-forget)
          // Deviation: uses .then()/.catch() instead of async/await per project-context.md rule
          // "Always use async/await over raw Promises". Rationale: relationship creation is
          // optional post-processing; failure must not block concept creation or return an
          // error to the caller. See AC6 for fire-and-forget requirement.
          this.conceptService
            .createDynamicRelationships(newConcept.id, newConcept.name, newConcept.category)
            .then((relResult) => {
              if (relResult.relationshipsCreated < 2) {
                this.logger.warn({
                  message: 'Fewer than 2 relationships created for AI-discovered concept (AC3)',
                  conceptId: newConcept.id,
                  conceptName: newConcept.name,
                  relationshipsCreated: relResult.relationshipsCreated,
                });
              }
            })
            .catch((err) => {
              this.logger.warn({
                message: 'Relationship creation failed for AI-discovered concept',
                conceptId: newConcept.id,
                error: err instanceof Error ? err.message : 'Unknown',
              });
            });
        } catch (err) {
          // Handle unique constraint or other DB errors gracefully
          const errMsg = err instanceof Error ? err.message : 'Unknown error';
          if (errMsg.includes('Unique constraint')) {
            result.skippedDuplicates.push(candidate.name);
            this.logger.debug({
              message: 'Concept skipped due to unique constraint',
              name: candidate.name,
            });
          } else {
            result.errors.push(`Failed to create "${candidate.name}": ${errMsg}`);
            this.logger.warn({
              message: 'Failed to create AI-discovered concept',
              name: candidate.name,
              error: errMsg,
            });
          }
        }
      }

      this.logger.log({
        message: 'Concept extraction complete',
        created: result.created.length,
        skipped: result.skippedDuplicates.length,
        errors: result.errors.length,
      });
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      result.errors.push(`Extraction failed: ${errMsg}`);
      this.logger.warn({
        message: 'Concept extraction failed',
        error: errMsg,
      });
    }

    return result;
  }

  /**
   * Generates a URL-friendly slug from a concept name.
   * Handles Unicode by stripping diacritics and non-alphanumeric characters.
   */
  private generateSlug(name: string): string {
    return name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Strip diacritics
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  }
}
