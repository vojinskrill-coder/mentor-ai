/**
 * LLM prompt template for classifying relationships between a new concept
 * and existing concepts in the knowledge base.
 *
 * Story 2.13: Dynamic Concept Relationship Creation
 */

/** Category adjacency map for pre-filtering candidates — uses actual Serbian DB categories */
export const CATEGORY_ADJACENCY: Record<string, string[]> = {
  'Uvod u Poslovanje': ['Vrednost', 'Preduzetništvo', 'Poslovni Modeli'],
  Marketing: ['Prodaja', 'Digitalni Marketing', 'Odnosi sa Klijentima', 'Strategija'],
  Prodaja: ['Marketing', 'Odnosi sa Klijentima', 'Strategija'],
  Vrednost: ['Uvod u Poslovanje', 'Strategija', 'Poslovni Modeli'],
  Finansije: ['Računovodstvo', 'Strategija', 'Operacije'],
  Operacije: ['Menadžment', 'Tehnologija', 'Finansije'],
  Menadžment: ['Liderstvo', 'Operacije', 'Strategija'],
  Preduzetništvo: ['Uvod u Poslovanje', 'Inovacije', 'Poslovni Modeli'],
  'Digitalni Marketing': ['Marketing', 'Tehnologija', 'Prodaja'],
  'Odnosi sa Klijentima': ['Prodaja', 'Marketing', 'Menadžment'],
  Računovodstvo: ['Finansije', 'Operacije'],
  Tehnologija: ['Inovacije', 'Operacije', 'Digitalni Marketing'],
  Inovacije: ['Tehnologija', 'Preduzetništvo', 'Strategija'],
  Liderstvo: ['Menadžment', 'Strategija'],
  Strategija: ['Poslovni Modeli', 'Finansije', 'Marketing', 'Liderstvo'],
  'Poslovni Modeli': ['Strategija', 'Vrednost', 'Preduzetništvo'],
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
  candidates: CandidateConcept[]
): string {
  const limitedCandidates = candidates.slice(0, MAX_CANDIDATES);

  const candidateList = limitedCandidates
    .map((c, i) => `${i + 1}. ${c.name} (${c.category}) [slug: ${c.slug}] - "${c.definition}"`)
    .join('\n');

  return `You are a business knowledge base expert. Analyze relationships between the NEW concept and existing concepts.

NEW CONCEPT: "${conceptName}"
CATEGORY: ${conceptCategory}
DEFINITION: "${conceptDefinition}"

EXISTING CONCEPTS FOR EVALUATION:
${candidateList}

For each existing concept, classify the relationship FROM the new concept TO the existing one:
- PREREQUISITE: The existing concept must be understood BEFORE the new concept (existing is a foundation for the new)
- RELATED: Concepts are in the same business domain and complement each other
- ADVANCED: The existing concept is a deeper/more specialized version of the new concept
- NONE: No meaningful relationship

RULES:
- Include ONLY concepts with PREREQUISITE, RELATED, or ADVANCED relationships. Omit NONE.
- Be selective: create relationships only where there is a real business logical connection.
- Aim for 3-8 relationships per concept. Quality over quantity.
- Relationships between different categories are valuable when they reflect real business connections.

Return ONLY a valid JSON array (no markdown, no explanations):
[{"slug": "concept-slug", "type": "RELATED"}, {"slug": "another-slug", "type": "PREREQUISITE"}]

If there are no meaningful relationships, return an empty array: []`;
}
