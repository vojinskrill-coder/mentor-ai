/**
 * LLM prompt template for classifying relationships between a new concept
 * and existing concepts in the knowledge base.
 *
 * Story 2.13: Dynamic Concept Relationship Creation
 */

/** Category adjacency map for pre-filtering candidates */
export const CATEGORY_ADJACENCY: Record<string, string[]> = {
  Finance: ['Strategy', 'Operations'],
  Marketing: ['Sales', 'Creative', 'Strategy'],
  Strategy: ['Finance', 'Marketing', 'Sales', 'Operations'],
  Sales: ['Marketing', 'Strategy'],
  Operations: ['Strategy', 'Finance', 'Technology'],
  Technology: ['Operations', 'Creative'],
  Creative: ['Marketing', 'Technology'],
  Legal: ['Finance', 'Operations'],
};

export interface CandidateConcept {
  id: string;
  slug: string;
  name: string;
  category: string;
  definition: string;
}

export interface RelationshipSuggestion {
  slug: string;
  type: 'PREREQUISITE' | 'RELATED' | 'ADVANCED';
}

const MAX_CANDIDATES = 20;

/**
 * Gets relevant categories for a given category (same + adjacent).
 */
export function getRelevantCategories(category: string): string[] {
  const adjacent = CATEGORY_ADJACENCY[category] ?? [];
  return [category, ...adjacent];
}

/**
 * Builds the system prompt for relationship classification.
 */
export function buildRelationshipClassificationPrompt(
  conceptName: string,
  conceptCategory: string,
  conceptDefinition: string,
  candidates: CandidateConcept[],
): string {
  const limitedCandidates = candidates.slice(0, MAX_CANDIDATES);

  const candidateList = limitedCandidates
    .map((c, i) => `${i + 1}. ${c.name} (${c.category}) [slug: ${c.slug}] - "${c.definition}"`)
    .join('\n');

  return `You are a business knowledge graph expert. Analyze the relationships between a NEW concept and existing concepts.

NEW CONCEPT: "${conceptName}"
CATEGORY: ${conceptCategory}
DEFINITION: "${conceptDefinition}"

EXISTING CONCEPTS TO EVALUATE:
${candidateList}

For each existing concept, classify the relationship FROM the new concept TO the existing concept:
- PREREQUISITE: The existing concept must be understood BEFORE the new concept (the existing concept is a foundation for the new one)
- RELATED: The concepts are in the same business domain and complement each other
- ADVANCED: The existing concept is a deeper/more specialized version of the new concept
- NONE: No meaningful relationship

RULES:
- Only include concepts with PREREQUISITE, RELATED, or ADVANCED relationships. Omit NONE.
- Be selective: only create relationships where there is a genuine business logic connection.
- Aim for 3-8 relationships per concept. Quality over quantity.
- Cross-category relationships are valuable when they reflect real business connections.

Return ONLY a valid JSON array (no markdown, no explanation):
[{"slug": "concept-slug", "type": "RELATED"}, {"slug": "another-slug", "type": "PREREQUISITE"}]

If no meaningful relationships exist, return an empty array: []`;
}
