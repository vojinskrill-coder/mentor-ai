import { Injectable, Logger } from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import type {
  ConceptMatch,
  ConceptCitation,
  CitationInjectionResult,
  ConceptCategory,
} from '@mentor-ai/shared/types';

/**
 * Service for injecting concept citations into AI responses.
 * Creates inline [[Concept Name]] markers and generates citation records.
 *
 * @example
 * ```typescript
 * const result = citationInjector.injectCitations(
 *   "Consider using value-based pricing for premium products.",
 *   [{ conceptId: "cpt_123", conceptName: "Value-Based Pricing", ... }]
 * );
 * // result.content = "Consider using value-based pricing [[Value-Based Pricing]] for premium products."
 * ```
 */
@Injectable()
export class CitationInjectorService {
  private readonly logger = new Logger(CitationInjectorService.name);

  /** Maximum number of citations to inject per response */
  private readonly MAX_CITATIONS = 5;

  /**
   * Injects concept citations into a response text.
   * Citations are placed at relevant positions in the text.
   *
   * @param response - The AI response text to inject citations into
   * @param concepts - Array of matching concepts to cite
   * @param messageId - Optional message ID to associate citations with (set later if not provided)
   * @returns Object containing modified content and citation records
   */
  injectCitations(
    response: string,
    concepts: ConceptMatch[],
    messageId = ''
  ): CitationInjectionResult {
    if (concepts.length === 0) {
      this.logger.debug({
        message: 'No concepts to inject',
        responseLength: response.length,
      });
      return { content: response, citations: [] };
    }

    // Sort by relevance (highest score first) and limit
    const sortedConcepts = [...concepts]
      .sort((a, b) => b.score - a.score)
      .slice(0, this.MAX_CITATIONS);

    this.logger.debug({
      message: 'Injecting citations',
      conceptCount: sortedConcepts.length,
      responseLength: response.length,
    });

    let content = response;
    const citations: ConceptCitation[] = [];
    const usedPositions = new Set<number>();

    for (const concept of sortedConcepts) {
      const insertionResult = this.findAndInsertCitation(
        content,
        concept,
        usedPositions
      );

      if (insertionResult) {
        content = insertionResult.content;
        usedPositions.add(insertionResult.position);

        citations.push({
          id: `cit_${createId()}`,
          messageId,
          conceptId: concept.conceptId,
          conceptName: concept.conceptName,
          conceptCategory: concept.category,
          position: insertionResult.position,
          score: concept.score,
          createdAt: new Date().toISOString(),
        });

        this.logger.debug({
          message: 'Citation injected',
          conceptName: concept.conceptName,
          position: insertionResult.position,
        });
      }
    }

    this.logger.log({
      message: 'Citations injection complete',
      citationsAdded: citations.length,
      originalLength: response.length,
      newLength: content.length,
    });

    return { content, citations };
  }

  /**
   * Finds an appropriate insertion point and inserts the citation.
   *
   * @param content - Current content
   * @param concept - Concept to insert
   * @param usedPositions - Set of already used positions
   * @returns Modified content and position, or null if no suitable position found
   */
  private findAndInsertCitation(
    content: string,
    concept: ConceptMatch,
    usedPositions: Set<number>
  ): { content: string; position: number } | null {
    // Strategy 1: Find concept name mentioned in text (case-insensitive)
    const namePattern = new RegExp(
      this.escapeRegex(concept.conceptName),
      'gi'
    );
    const nameMatch = namePattern.exec(content);

    if (nameMatch) {
      const endPosition = nameMatch.index + nameMatch[0].length;

      // Check if citation already exists at this position
      if (!this.hasCitationAt(content, endPosition)) {
        const citation = ` [[${concept.conceptName}]]`;
        return {
          content:
            content.slice(0, endPosition) + citation + content.slice(endPosition),
          position: endPosition,
        };
      }
    }

    // Strategy 2: Find related keywords from concept name
    const keywords = concept.conceptName
      .toLowerCase()
      .split(/[\s-]+/)
      .filter((w) => w.length >= 4);

    for (const keyword of keywords) {
      const keywordPattern = new RegExp(`\\b${this.escapeRegex(keyword)}\\b`, 'gi');
      let match: RegExpExecArray | null;

      while ((match = keywordPattern.exec(content)) !== null) {
        // Find end of sentence containing this keyword
        const sentenceEnd = this.findSentenceEnd(content, match.index);

        if (
          sentenceEnd !== -1 &&
          !usedPositions.has(sentenceEnd) &&
          !this.hasCitationAt(content, sentenceEnd)
        ) {
          const citation = ` [[${concept.conceptName}]]`;
          return {
            content:
              content.slice(0, sentenceEnd) +
              citation +
              content.slice(sentenceEnd),
            position: sentenceEnd,
          };
        }
      }
    }

    // Strategy 3: Find end of first paragraph if no keyword match
    const firstParagraphEnd = content.indexOf('\n\n');
    if (firstParagraphEnd !== -1 && !usedPositions.has(firstParagraphEnd)) {
      // Insert at end of first paragraph
      const sentenceEnd = this.findSentenceEnd(content, 0);
      if (
        sentenceEnd !== -1 &&
        sentenceEnd < firstParagraphEnd &&
        !this.hasCitationAt(content, sentenceEnd)
      ) {
        const citation = ` [[${concept.conceptName}]]`;
        return {
          content:
            content.slice(0, sentenceEnd) + citation + content.slice(sentenceEnd),
          position: sentenceEnd,
        };
      }
    }

    // No suitable position found
    this.logger.debug({
      message: 'No suitable position found for citation',
      conceptName: concept.conceptName,
    });
    return null;
  }

  /**
   * Finds the end of the sentence containing the given position.
   *
   * @param content - The text content
   * @param startPosition - Position to search from
   * @returns Position of sentence end (before period/question mark), or -1 if not found
   */
  private findSentenceEnd(content: string, startPosition: number): number {
    const sentenceEnders = /[.!?]/;
    let position = startPosition;

    while (position < content.length) {
      const char = content.charAt(position);
      if (sentenceEnders.test(char)) {
        return position;
      }
      position++;
    }

    return -1;
  }

  /**
   * Checks if there's already a citation at the given position.
   */
  private hasCitationAt(content: string, position: number): boolean {
    const ahead = content.slice(position, position + 10);
    return ahead.includes('[[') || ahead.trimStart().startsWith('[[');
  }

  /**
   * Escapes special regex characters in a string.
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  /**
   * Parses existing citations from message content.
   * Used for display purposes in the frontend.
   *
   * @param content - Message content with [[Citation]] markers
   * @returns Array of citation markers found
   */
  parseCitations(content: string): Array<{ name: string; position: number }> {
    const citations: Array<{ name: string; position: number }> = [];
    const pattern = /\[\[([^\]]+)\]\]/g;
    let match: RegExpExecArray | null;

    while ((match = pattern.exec(content)) !== null) {
      const name = match[1];
      if (name) {
        citations.push({
          name,
          position: match.index,
        });
      }
    }

    return citations;
  }

  /**
   * Removes citation markers from content for plain text display.
   *
   * @param content - Content with [[Citation]] markers
   * @returns Plain content without citation markers
   */
  stripCitations(content: string): string {
    return content.replace(/\s*\[\[[^\]]+\]\]/g, '');
  }
}
