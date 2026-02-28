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

  return `Ti si ekspert za poslovne baze znanja. Analiziraj odnose između NOVOG koncepta i postojećih koncepata.

NOVI KONCEPT: "${conceptName}"
KATEGORIJA: ${conceptCategory}
DEFINICIJA: "${conceptDefinition}"

POSTOJEĆI KONCEPTI ZA EVALUACIJU:
${candidateList}

Za svaki postojeći koncept, klasifikuj odnos OD novog koncepta KA postojećem:
- PREREQUISITE: Postojeći koncept mora biti shvaćen PRE novog koncepta (postojeći je temelj za novi)
- RELATED: Koncepti su u istom poslovnom domenu i dopunjuju se međusobno
- ADVANCED: Postojeći koncept je dublja/specijalizovanija verzija novog koncepta
- NONE: Nema smislenog odnosa

PRAVILA:
- Uključi SAMO koncepte sa PREREQUISITE, RELATED ili ADVANCED odnosom. Izostavi NONE.
- Budi selektivan: kreiraj odnose samo tamo gde postoji stvarna poslovna logička veza.
- Ciljaj na 3-8 odnosa po konceptu. Kvalitet iznad kvantiteta.
- Odnosi između različitih kategorija su vredni kada odražavaju stvarne poslovne veze.

Vrati SAMO validan JSON niz (bez markdown-a, bez objašnjenja):
[{"slug": "concept-slug", "type": "RELATED"}, {"slug": "another-slug", "type": "PREREQUISITE"}]

Ako ne postoje smisleni odnosi, vrati prazan niz: []`;
}
