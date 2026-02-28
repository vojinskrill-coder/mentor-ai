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
      ? `\nPOSTOJEĆI KONCEPTI (NE ekstrahuj ove):\n${existingNames.join(', ')}\n`
      : '';

  return `Ti si kurator baze poslovnog znanja. Analiziraj sledeći AI-generisani tekst i identifikuj nove poslovne koncepte koji NISU već u bazi znanja.

TEKST ZA ANALIZU:
"""
${aiOutput}
"""
${existingList}
VALIDNE KATEGORIJE: ${VALID_CATEGORIES.join(', ')}

PRAVILA:
- Ekstrahuj samo jasno definisane poslovne koncepte (okviri, metodologije, strategije, alati, procesi, metrike).
- NE ekstrahuj generičke pojmove (npr. "poslovanje", "rast", "uspeh") ili vlastita imena (firme, osobe).
- NE ekstrahuj koncepte koji već postoje u listi iznad.
- Svaki koncept mora imati jasnu, specifičnu definiciju od minimum 15 reči na srpskom jeziku.
- Dodeli najadekvatniju kategoriju iz liste validnih kategorija.
- Department tags treba da odgovaraju relevantnim odeljenjima: FINANCE, MARKETING, TECHNOLOGY, OPERATIONS, LEGAL, CREATIVE, STRATEGY, SALES.
- Ekstrahuj najviše ${maxConcepts} konceptata. Prioritizuj najspecifičnije i najkorisnije.
- Ako nema novih koncepata, vrati prazan niz.
- Naziv koncepta piši na srpskom (ili engleski ako je to ustaljen termin, npr. "Lean Startup", "OKR").
- Definiciju UVEK piši na srpskom jeziku.

Vrati SAMO validan JSON niz (bez markdown-a, bez objašnjenja):
[{"name": "Naziv Koncepta", "category": "Kategorija", "definition": "Jasna definicija koncepta na srpskom jeziku.", "departmentTags": ["STRATEGY", "FINANCE"]}]

Ako nema novih koncepata, vrati: []`;
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
