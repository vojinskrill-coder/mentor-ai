/**
 * LLM prompt template for extracting new business concepts from AI output text.
 *
 * Story 2.15: AI-Driven Concept Discovery and Creation
 */

/** Valid concept categories — must match actual DB values from Obsidian vault */
const VALID_CATEGORIES = [
  'Uvod u Poslovanje',
  'Marketing',
  'Prodaja',
  'Vrednost',
  'Finansije',
  'Operacije',
  'Menadžment',
  'Preduzetništvo',
  'Digitalni Marketing',
  'Odnosi sa Klijentima',
  'Računovodstvo',
  'Tehnologija',
  'Inovacije',
  'Liderstvo',
  'Strategija',
  'Poslovni Modeli',
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
  maxConcepts = 5
): string {
  const existingList =
    existingNames.length > 0
      ? `\nEXISTING CONCEPTS (do NOT extract these):\n${existingNames.join(', ')}\n`
      : '';

  return `You are a business knowledge base curator. Analyze the following AI-generated text and identify new business concepts that are NOT already in the knowledge base.

TEXT FOR ANALYSIS:
"""
${aiOutput}
"""
${existingList}
VALID CATEGORIES: ${VALID_CATEGORIES.join(', ')}

RULES:
- Extract only clearly defined business concepts (frameworks, methodologies, strategies, tools, processes, metrics).
- Do NOT extract generic terms (e.g., "business", "growth", "success") or proper names (companies, people).
- Do NOT extract concepts that already exist in the list above.
- Each concept must have a clear, specific definition of at least 15 words in English.
- Assign the most appropriate category from the list of valid categories.
- Department tags should match relevant departments: FINANCE, MARKETING, TECHNOLOGY, OPERATIONS, LEGAL, CREATIVE, STRATEGY, SALES.
- Extract at most ${maxConcepts} concepts. Prioritize the most specific and useful ones.
- If there are no new concepts, return an empty array.
- Write concept names in English (or keep established terms like "Lean Startup", "OKR").
- ALWAYS write definitions in English.

Return ONLY a valid JSON array (no markdown, no explanations):
[{"name": "Concept Name", "category": "Category", "definition": "Clear concept definition in English.", "departmentTags": ["STRATEGY", "FINANCE"]}]

If there are no new concepts, return: []`;
}

/**
 * Parses the LLM response into extracted concept candidates.
 * Validates each candidate against known categories and minimum quality.
 */
export function parseExtractionResponse(response: string): ExtractedConceptCandidate[] {
  try {
    // Extract outermost JSON array from response (greedy: first '[' to last ']')
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];

    const parsed = JSON.parse(jsonMatch[0]) as unknown[];
    if (!Array.isArray(parsed)) return [];

    const validCategorySet = new Set<string>(VALID_CATEGORIES);

    return parsed
      .filter(
        (item): item is Record<string, unknown> =>
          typeof item === 'object' &&
          item !== null &&
          typeof (item as Record<string, unknown>).name === 'string' &&
          typeof (item as Record<string, unknown>).category === 'string' &&
          typeof (item as Record<string, unknown>).definition === 'string'
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
