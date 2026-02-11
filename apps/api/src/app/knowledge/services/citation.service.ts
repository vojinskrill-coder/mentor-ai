import { Injectable, Logger } from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { createId } from '@paralleldrive/cuid2';
import type {
  ConceptCitation,
  ConceptCategory,
  ConceptCitationSummary,
} from '@mentor-ai/shared/types';

/**
 * Service for managing concept citations.
 * Handles storage and retrieval of message-to-concept citations.
 */
@Injectable()
export class CitationService {
  private readonly logger = new Logger(CitationService.name);

  constructor(private readonly prisma: PlatformPrismaService) {}

  /**
   * Stores citations for a message in the database.
   *
   * @param messageId - The message ID to associate citations with
   * @param citations - Array of citations to store
   * @returns The stored citations with database IDs
   */
  async storeCitations(
    messageId: string,
    citations: Omit<ConceptCitation, 'id' | 'createdAt'>[]
  ): Promise<ConceptCitation[]> {
    if (citations.length === 0) {
      return [];
    }

    this.logger.log({
      message: 'Storing citations',
      messageId,
      count: citations.length,
    });

    const createdCitations: ConceptCitation[] = [];

    for (const citation of citations) {
      try {
        const created = await this.prisma.conceptCitation.create({
          data: {
            id: `cit_${createId()}`,
            messageId,
            conceptId: citation.conceptId,
            position: citation.position,
            score: citation.score,
          },
          include: {
            concept: {
              select: {
                name: true,
                category: true,
              },
            },
          },
        });

        createdCitations.push({
          id: created.id,
          messageId: created.messageId,
          conceptId: created.conceptId,
          conceptName: created.concept.name,
          conceptCategory: created.concept.category as ConceptCategory,
          position: created.position,
          score: created.score,
          createdAt: created.createdAt.toISOString(),
        });
      } catch (error) {
        this.logger.error({
          message: 'Failed to store citation',
          conceptId: citation.conceptId,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    this.logger.log({
      message: 'Citations stored',
      storedCount: createdCitations.length,
    });

    return createdCitations;
  }

  /**
   * Retrieves citations for a specific message.
   *
   * @param messageId - The message ID to get citations for
   * @returns Array of citations with concept details
   */
  async getCitationsForMessage(messageId: string): Promise<ConceptCitation[]> {
    this.logger.debug({
      message: 'Getting citations for message',
      messageId,
    });

    const citations = await this.prisma.conceptCitation.findMany({
      where: { messageId },
      include: {
        concept: {
          select: {
            name: true,
            category: true,
          },
        },
      },
      orderBy: { position: 'asc' },
    });

    return citations.map((c) => ({
      id: c.id,
      messageId: c.messageId,
      conceptId: c.conceptId,
      conceptName: c.concept.name,
      conceptCategory: c.concept.category as ConceptCategory,
      position: c.position,
      score: c.score,
      createdAt: c.createdAt.toISOString(),
    }));
  }

  /**
   * Gets a concept summary suitable for the citation side panel.
   *
   * @param conceptId - The concept ID
   * @returns Concept summary with related concepts
   */
  async getConceptSummaryForPanel(
    conceptId: string
  ): Promise<ConceptCitationSummary | null> {
    const concept = await this.prisma.concept.findUnique({
      where: { id: conceptId },
      include: {
        relatedTo: {
          include: {
            targetConcept: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          take: 5,
        },
      },
    });

    if (!concept) {
      return null;
    }

    return {
      id: concept.id,
      name: concept.name,
      category: concept.category as ConceptCategory,
      definition: concept.definition,
      extendedDescription: concept.extendedDescription ?? undefined,
      relatedConcepts: concept.relatedTo.map((r) => ({
        id: r.targetConcept.id,
        name: r.targetConcept.name,
      })),
    };
  }

  /**
   * Deletes all citations for a message.
   * Used when a message is deleted.
   *
   * @param messageId - The message ID
   */
  async deleteCitationsForMessage(messageId: string): Promise<void> {
    this.logger.log({
      message: 'Deleting citations for message',
      messageId,
    });

    await this.prisma.conceptCitation.deleteMany({
      where: { messageId },
    });
  }

  /**
   * Gets distinct concept IDs from citations for a user.
   * Used for concept tree growth — shows concepts discovered via AI citations.
   */
  async getDiscoveredConceptIds(userId: string): Promise<string[]> {
    // Get message IDs for this user's conversations, then find cited concepts
    const messages = await this.prisma.message.findMany({
      where: { conversation: { userId } },
      select: { id: true },
    });
    if (messages.length === 0) return [];

    const messageIds = messages.map((m) => m.id);
    const citations = await this.prisma.conceptCitation.findMany({
      where: { messageId: { in: messageIds } },
      select: { conceptId: true },
      distinct: ['conceptId'],
    });
    return citations.map((c) => c.conceptId);
  }

  /**
   * Gets citation count for analytics.
   *
   * @param conceptId - Optional concept ID to filter by
   * @returns Total citation count
   */
  async getCitationCount(conceptId?: string): Promise<number> {
    return this.prisma.conceptCitation.count({
      where: conceptId ? { conceptId } : undefined,
    });
  }
}
