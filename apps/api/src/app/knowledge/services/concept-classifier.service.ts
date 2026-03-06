import { Injectable, Logger } from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import type { ChatMessage, ConceptMatch, ConceptCategory } from '@mentor-ai/shared/types';
import { AiGatewayService } from '../../ai-gateway/ai-gateway.service';
import { ConceptMatchingService, ConceptMatchingOptions } from './concept-matching.service';

/**
 * Result of LLM-based concept classification.
 */
export interface ConceptClassificationResult {
  /** Best matching category keyword (Serbian) */
  category: string;
  /** Confidence score 0.0-1.0 */
  confidence: number;
  /** Optional: specific concept name if the LLM identified one */
  suggestedConceptName?: string;
}

/** Context for LLM billing */
export interface ClassificationContext {
  tenantId: string;
  userId: string;
  conversationId?: string;
}

/**
 * Category keywords the LLM can choose from + 1-line descriptions.
 * Uses `contains` matching against actual DB category names to handle
 * both "6. Prodaja" (numbered Obsidian) and "Prodaja" (AI-discovered) formats.
 */
const CATEGORY_KEYWORDS: Record<string, string> = {
  Prodaja: 'Prodajni proces, prodajni plan, tehnike prodaje, pregovaranje, zatvaranje posla',
  Marketing: 'Brending, pozicioniranje, marketing strategija, oglašavanje, promocija',
  'Digitalni Marketing':
    'Online marketing, SEO, društvene mreže, email marketing, content marketing',
  Vrednost: 'Kreiranje vrednosti, vrednosna ponuda, oblici vrednosti, percepcija vrednosti',
  'Određivanje Cene': 'Cenovne strategije, cenovna elastičnost, pricing modeli, popusti',
  Finansije: 'Finansijsko upravljanje, budžet, investicije, tok novca, finansijska analiza',
  Operacije: 'Operativno upravljanje, procesi, proizvodnja, lanac snabdevanja, logistika',
  Menadžment: 'Upravljanje timom, organizacija, delegiranje, donošenje odluka',
  'Poslovni Modeli': 'Modeli poslovanja, monetizacija, skaliranje, kanali distribucije',
  Strategija: 'Poslovna strategija, konkurentska prednost, strateško planiranje, analiza tržišta',
  Tehnologija: 'IT sistemi, softver, automatizacija, digitalna transformacija',
  Preduzetništvo: 'Startup, pokretanje biznisa, validacija ideje, inovativno poslovanje',
  'Odnosi sa Klijentima': 'CRM, zadovoljstvo kupaca, lojalnost, korisnička podrška',
  'Ljudski Resursi': 'Zapošljavanje, obuka, razvoj zaposlenih, organizaciona kultura',
  Liderstvo: 'Vođenje, vizija, motivacija tima, lični razvoj lidera',
  'Kognitivne Sklonosti': 'Psihologija odlučivanja, pristrasnosti, heuristike, ponašanje kupaca',
  Sistemi: 'Poslovni sistemi, automatizacija procesa, IT infrastruktura',
  'Upravljanje Podacima': 'Analitika, podaci, izveštavanje, business intelligence',
};

/**
 * All known category keywords (keys of the map above).
 */
const ALL_CATEGORY_KEYWORDS = Object.keys(CATEGORY_KEYWORDS);

/**
 * System prompt for the classifier LLM. Serbian, concise, structured JSON output.
 */
const CLASSIFIER_SYSTEM_PROMPT = `Ti si klasifikator poslovnih tema za srpski biznis alat. Odredi JEDNU kategoriju za razgovor korisnika.

KATEGORIJE:
${Object.entries(CATEGORY_KEYWORDS)
  .map(([cat, desc]) => `- "${cat}": ${desc}`)
  .join('\n')}

PRAVILA:
1. Fokus na NAMERU korisnika, ne na pojedinačne reči u poruci
2. "Prodajni plan" → Prodaja (ne Vrednost, ne Marketing)
3. "Marketing strategija" → Marketing (ne Strategija)
4. "Finansijski izveštaj" → Finansije
5. Ako korisnik traži PLAN/ANALIZU/STRATEGIJU za neku oblast, kategorija je DOMEN te oblasti
6. Ako nije jasno, biraj NAJSPECIFIČNIJU kategoriju za zahtev

VRATI ISKLJUČIVO VALIDAN JSON (bez markdown, bez objašnjenja):
{"category": "ime kategorije", "confidence": 0.0-1.0, "conceptName": "opciono: konkretan koncept ako prepoznaješ"}

Odgovor MORA biti manji od 100 tokena.`;

/**
 * Service that uses a fast LLM call to classify user intent into a business category,
 * then finds the best matching concept within that category.
 *
 * This solves the problem where pure semantic/keyword search picks wrong concepts
 * because it matches words rather than understanding user intent.
 * E.g., "prodajni plan" was matched to "Proizvod" instead of "Prodaja" concepts.
 *
 * Follows the same LLM-call pattern as PromptCheckerService (fast/cheap model).
 */
@Injectable()
export class ConceptClassifierService {
  private readonly logger = new Logger(ConceptClassifierService.name);

  constructor(
    private readonly aiGatewayService: AiGatewayService,
    private readonly conceptMatchingService: ConceptMatchingService,
    private readonly prisma: PlatformPrismaService
  ) {}

  /**
   * Classifies text into a category using an LLM, then finds the best concept
   * within that category. Falls back to standard matching on LLM failure.
   */
  async classifyAndMatch(
    userMessage: string,
    aiResponse: string,
    options: ConceptMatchingOptions,
    context: ClassificationContext
  ): Promise<ConceptMatch[]> {
    // 1. Try LLM classification
    const classification = await this.classifyWithLlm(userMessage, aiResponse, context);

    if (!classification || classification.confidence < 0.4) {
      this.logger.debug({
        message: 'LLM classification failed or low confidence, using standard matching',
        classification,
      });
      return this.conceptMatchingService.findRelevantConcepts(
        `${userMessage}\n${aiResponse}`,
        options
      );
    }

    this.logger.log({
      message: 'LLM classified conversation intent',
      category: classification.category,
      confidence: classification.confidence,
      suggestedConcept: classification.suggestedConceptName,
    });

    // 2. If LLM suggested a specific concept name, try direct lookup first
    if (classification.suggestedConceptName) {
      const directMatch = await this.findConceptByName(
        classification.suggestedConceptName,
        classification.category
      );
      if (directMatch) {
        return [directMatch];
      }
    }

    // 3. Search within the classified category
    const limit = options.limit ?? 5;
    const categoryMatches = await this.findConceptsInCategory(
      userMessage,
      classification.category,
      limit
    );

    if (categoryMatches.length > 0) {
      return categoryMatches;
    }

    // 4. Category search returned nothing — fall back to unconstrained search
    this.logger.debug({
      message: 'Category-filtered search returned no results, falling back',
      category: classification.category,
    });
    return this.conceptMatchingService.findRelevantConcepts(
      `${userMessage}\n${aiResponse}`,
      options
    );
  }

  /**
   * Calls the fast/cheap LLM to classify the conversation into a category.
   * Returns null on any failure (non-blocking).
   */
  private async classifyWithLlm(
    userMessage: string,
    aiResponse: string,
    context: ClassificationContext
  ): Promise<ConceptClassificationResult | null> {
    const userContent = `PORUKA KORISNIKA:\n"""${userMessage}"""\n\nODGOVOR AI (skraćen):\n"""${aiResponse.substring(0, 500)}"""`;

    let responseContent = '';
    try {
      await this.aiGatewayService.streamCompletionWithContext(
        [
          { role: 'system', content: CLASSIFIER_SYSTEM_PROMPT } as ChatMessage,
          { role: 'user', content: userContent } as ChatMessage,
        ],
        {
          tenantId: context.tenantId,
          userId: context.userId,
          conversationId: context.conversationId,
          skipRateLimit: true,
          skipQuotaCheck: true,
          useFallback: true,
        },
        (chunk: string) => {
          responseContent += chunk;
        }
      );
    } catch (err) {
      this.logger.warn({
        message: 'Classifier LLM call failed, will fall back to standard matching',
        error: err instanceof Error ? err.message : 'Unknown',
      });
      return null;
    }

    return this.parseClassifierResponse(responseContent);
  }

  /**
   * Parses the LLM JSON response into a ClassificationResult.
   */
  private parseClassifierResponse(response: string): ConceptClassificationResult | null {
    try {
      const cleaned = response
        .replace(/```json?\n?/g, '')
        .replace(/```/g, '')
        .trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON object found');

      const parsed = JSON.parse(jsonMatch[0]);
      const category = String(parsed.category ?? '').trim();

      if (!category) return null;

      // Validate category is a known keyword (exact or fuzzy)
      const resolved = this.resolveCategory(category);
      if (!resolved) {
        this.logger.warn({
          message: 'LLM returned unknown category',
          category,
          responsePreview: response.substring(0, 200),
        });
        return null;
      }

      return {
        category: resolved,
        confidence: Math.min(Number(parsed.confidence ?? 0.5), 1.0),
        suggestedConceptName: parsed.conceptName ?? undefined,
      };
    } catch (err) {
      this.logger.warn({
        message: 'Failed to parse classifier response',
        error: err instanceof Error ? err.message : 'Unknown',
        responsePreview: response.substring(0, 200),
      });
      return null;
    }
  }

  /**
   * Resolves a category name from LLM output to a known keyword.
   * Handles exact match, then diacritics-normalized fuzzy match.
   */
  private resolveCategory(input: string): string | null {
    // Exact match
    if (ALL_CATEGORY_KEYWORDS.includes(input)) {
      return input;
    }

    // Fuzzy match: normalize diacritics
    const normalized = this.normalizeDiacritics(input.toLowerCase());
    for (const cat of ALL_CATEGORY_KEYWORDS) {
      const catNorm = this.normalizeDiacritics(cat.toLowerCase());
      if (catNorm === normalized) return cat;
      // Partial match: LLM might return "Prodaja" for "6. Prodaja"
      if (normalized.includes(catNorm) || catNorm.includes(normalized)) return cat;
    }

    return null;
  }

  /**
   * Removes Serbian diacritics for fuzzy comparison.
   */
  private normalizeDiacritics(str: string): string {
    return str
      .replace(/č/g, 'c')
      .replace(/ć/g, 'c')
      .replace(/š/g, 's')
      .replace(/ž/g, 'z')
      .replace(/đ/g, 'dj');
  }

  /**
   * Finds a concept by name, optionally filtered by category.
   */
  private async findConceptByName(
    name: string,
    categoryKeyword: string
  ): Promise<ConceptMatch | null> {
    const concept = await this.prisma.concept.findFirst({
      where: {
        name: { equals: name, mode: 'insensitive' },
        category: { contains: categoryKeyword, mode: 'insensitive' },
      },
      select: { id: true, name: true, category: true, definition: true },
    });

    if (!concept) return null;

    return {
      conceptId: concept.id,
      conceptName: concept.name,
      category: concept.category as ConceptCategory,
      definition: concept.definition,
      score: 0.95,
    };
  }

  /**
   * Searches for concepts within a category using the category keyword.
   * Uses `contains` matching to handle both "6. Prodaja" and "Prodaja" formats.
   * Scores by keyword match count within the filtered set.
   */
  private async findConceptsInCategory(
    userMessage: string,
    categoryKeyword: string,
    limit: number
  ): Promise<ConceptMatch[]> {
    // Extract keywords from user message
    const words = userMessage
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length >= 3)
      .map((w) => w.replace(/[^a-zčćšžđàáâãäåèéêëìíîïòóôõöùúûüýÿñ]/gi, ''))
      .filter((w) => w.length >= 3);

    const commonWords = new Set([
      'koji',
      'koja',
      'koje',
      'kao',
      'ali',
      'ili',
      'ako',
      'jer',
      'dok',
      'več',
      'vec',
      'još',
      'jos',
      'sve',
      'sam',
      'smo',
      'ste',
      'ima',
      'nije',
      'biti',
      'bio',
      'bila',
      'bilo',
      'može',
      'moze',
      'treba',
      'samo',
      'ovo',
      'taj',
      'tog',
      'tom',
      'tim',
      'kod',
      'napravi',
      'napraviti',
      'hocu',
      'hoću',
      'želim',
      'zelim',
      'daj',
      'molim',
      'kreira',
      'kreiraj',
      'kreiranje',
      'trebam',
      'zelim',
    ]);
    const keywords = [...new Set(words.filter((w) => !commonWords.has(w)))];

    // Category filter: matches both "6. Prodaja" and "Prodaja"
    const categoryFilter = {
      category: { contains: categoryKeyword, mode: 'insensitive' as const },
    };

    if (keywords.length === 0) {
      // No keywords — return top concepts in category by sortOrder
      const concepts = await this.prisma.concept.findMany({
        where: categoryFilter,
        select: { id: true, name: true, category: true, definition: true },
        orderBy: { sortOrder: 'asc' },
        take: limit,
      });
      return concepts.map((c) => ({
        conceptId: c.id,
        conceptName: c.name,
        category: c.category as ConceptCategory,
        definition: c.definition,
        score: 0.7,
      }));
    }

    // Search within category by keywords
    const searchConditions = keywords.slice(0, 10).map((keyword) => ({
      OR: [
        { name: { contains: keyword, mode: 'insensitive' as const } },
        { definition: { contains: keyword, mode: 'insensitive' as const } },
      ],
    }));

    const concepts = await this.prisma.concept.findMany({
      where: {
        ...categoryFilter,
        OR: searchConditions,
      },
      select: { id: true, name: true, category: true, definition: true },
      take: limit * 3,
    });

    // Score by keyword match count
    const scored = concepts.map((concept) => {
      const nameLower = concept.name.toLowerCase();
      const defLower = concept.definition.toLowerCase();
      let matchScore = 0;
      for (const keyword of keywords) {
        if (nameLower.includes(keyword)) matchScore += 3;
        else if (defLower.includes(keyword)) matchScore += 1;
      }
      return {
        conceptId: concept.id,
        conceptName: concept.name,
        category: concept.category as ConceptCategory,
        definition: concept.definition,
        score: Math.min(0.5 + matchScore * 0.05, 0.95),
      };
    });

    return scored.sort((a, b) => b.score - a.score).slice(0, limit);
  }
}
