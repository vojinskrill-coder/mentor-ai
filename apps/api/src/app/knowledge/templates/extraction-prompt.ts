/**
 * LLM prompt template for extracting new business concepts from AI output text.
 *
 * Story 2.15: AI-Driven Concept Discovery and Creation
 */

/** Valid concept categories (must match ConceptCategory enum) */
const VALID_CATEGORIES = [
  'Finance',
  'Marketing',
  'Technology',
  'Operations',
  'Legal',
  'Creative',
  'Strategy',
  'Sales',
] as const;

/** Candidate concept extracted by the LLM */
export interface ExtractedConceptCandidate {
  name: string;
  category: string;
  definition: string;
  departmentTags: string[];
}

/**
 * Builds the prompt for extracting new business concepts from AI output.
 *
 * @param aiOutput - The AI-generated text to analyze
 * @param existingNames - Names of concepts already in the database (to avoid re-extraction)
 * @param maxConcepts - Maximum number of concepts to extract (default: 5)
 */
export function buildConceptExtractionPrompt(
  aiOutput: string,
  existingNames: string[],
  maxConcepts = 5,
): string {
  const existingList = existingNames.length > 0
    ? `\nEXISTING CONCEPTS (DO NOT extract these):\n${existingNames.join(', ')}\n`
    : '';

  return `You are a business knowledge graph curator. Analyze the following AI-generated text and identify distinct business concepts that are NOT already in the knowledge base.

TEXT TO ANALYZE:
"""
${aiOutput}
"""
${existingList}
VALID CATEGORIES: ${VALID_CATEGORIES.join(', ')}

RULES:
- Extract only well-defined business concepts (frameworks, methodologies, strategies, tools, processes).
- Do NOT extract generic terms (e.g., "business", "growth", "success") or proper nouns (company names, people).
- Do NOT extract concepts that are already in the existing concepts list above.
- Each concept must have a clear, specific definition of at least 10 words.
- Assign the most appropriate category from the valid categories list.
- Department tags should match the relevant departments: FINANCE, MARKETING, TECHNOLOGY, OPERATIONS, LEGAL, CREATIVE, STRATEGY, SALES.
- Extract at most ${maxConcepts} concepts. Prioritize the most specific and actionable ones.
- If no new concepts are found, return an empty array.

Return ONLY a valid JSON array (no markdown, no explanation):
[{"name": "Concept Name", "category": "Category", "definition": "A clear definition of the concept.", "departmentTags": ["STRATEGY", "FINANCE"]}]

If no new concepts found, return: []`;
}

/**
 * Parses the LLM response into extracted concept candidates.
 * Validates each candidate against known categories and minimum quality.
 */
export function parseExtractionResponse(
  response: string,
): ExtractedConceptCandidate[] {
  try {
    // Extract outermost JSON array from response (greedy: first '[' to last ']')
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]) as unknown[];
    if (!Array.isArray(parsed)) return [];

    const validCategorySet = new Set<string>(VALID_CATEGORIES);

    return parsed
      .filter((item): item is Record<string, unknown> =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as Record<string, unknown>).name === 'string' &&
        typeof (item as Record<string, unknown>).category === 'string' &&
        typeof (item as Record<string, unknown>).definition === 'string',
      )
      .filter((item) => {
        const name = item.name as string;
        const category = item.category as string;
        const definition = item.definition as string;

        // Validate category
        if (!validCategorySet.has(category)) return false;
        // Validate minimum definition quality (10+ chars AND 3+ words)
        if (definition.length < 10) return false;
        if (definition.trim().split(/\s+/).length < 3) return false;
        // Validate name is not empty
        if (name.trim().length === 0) return false;

        return true;
      })
      .map((item) => ({
        name: (item.name as string).trim(),
        category: item.category as string,
        definition: (item.definition as string).trim(),
        departmentTags: Array.isArray(item.departmentTags)
          ? (item.departmentTags as unknown[]).filter((t): t is string => typeof t === 'string')
          : [],
      }));
  } catch {
    return [];
  }
}
