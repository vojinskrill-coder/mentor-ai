import { Injectable, Logger } from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import type { ChatMessage, ConceptMatch, ConceptCategory } from '@mentor-ai/shared/types';
import { AiGatewayService } from '../../ai-gateway/ai-gateway.service';
import { ConceptMatchingService, ConceptMatchingOptions } from './concept-matching.service';

/**
 * Result of LLM-based concept classification.
 */
export interface ConceptClassificationResult {
  /** Best matching category keyword */
  category: string;
  /** Confidence score 0.0-1.0 */
  confidence: number;
  /** Optional: specific concept name if the LLM identified one */
  suggestedConceptName?: string;
  /** True if classification was a fallback (LLM failed, used standard matching) */
  usedFallback?: boolean;
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
  Prodaja: 'Sales process, sales plan, sales techniques, negotiation, closing deals',
  Marketing: 'Branding, positioning, marketing strategy, advertising, promotion',
  'Digitalni Marketing':
    'Online marketing, SEO, social media, email marketing, content marketing',
  Vrednost: 'Value creation, value proposition, forms of value, value perception',
  'Određivanje Cene': 'Pricing strategies, price elasticity, pricing models, discounts',
  Finansije: 'Financial management, budget, investments, cash flow, financial analysis',
  Operacije: 'Operations management, processes, manufacturing, supply chain, logistics',
  Menadžment: 'Team management, organization, delegation, decision-making',
  'Poslovni Modeli': 'Business models, monetization, scaling, distribution channels',
  Strategija: 'Business strategy, competitive advantage, strategic planning, market analysis',
  Tehnologija: 'IT systems, software, automation, digital transformation',
  Preduzetništvo: 'Startup, launching a business, idea validation, innovative business',
  'Odnosi sa Klijentima': 'CRM, customer satisfaction, loyalty, customer support',
  'Ljudski Resursi': 'Hiring, training, employee development, organizational culture',
  Liderstvo: 'Leadership, vision, team motivation, personal leader development',
  'Kognitivne Sklonosti': 'Decision psychology, biases, heuristics, buyer behavior',
  Sistemi: 'Business systems, process automation, IT infrastructure',
  'Upravljanje Podacima': 'Analytics, data, reporting, business intelligence',
};

/**
 * All known category keywords (keys of the map above).
 */
const ALL_CATEGORY_KEYWORDS = Object.keys(CATEGORY_KEYWORDS);

/** Max retries for transient LLM errors */
const CLASSIFIER_MAX_RETRIES = 1;
const CLASSIFIER_BASE_BACKOFF_MS = 2000;

/**
 * Determines if an LLM error is transient (worth retrying).
 */
function isTransientLlmError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    // Rate limits, server errors, network issues
    if (msg.includes('429') || msg.includes('rate limit')) return true;
    if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504')) return true;
    if (msg.includes('econnreset') || msg.includes('etimedout') || msg.includes('timeout')) return true;
    if (msg.includes('service unavailable') || msg.includes('server error')) return true;
  }
  return false;
}

/**
 * Exponential backoff: min(baseMs * 2^attempt, maxMs) ± 25% jitter
 */
function classifierBackoff(attempt: number, baseMs = CLASSIFIER_BASE_BACKOFF_MS, maxMs = 8000): number {
  const delay = Math.min(baseMs * Math.pow(2, attempt), maxMs);
  const jitter = delay * 0.25 * (Math.random() * 2 - 1);
  return Math.max(0, delay + jitter);
}

function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * System prompt for the classifier LLM. Concise, structured JSON output.
 */
const CLASSIFIER_SYSTEM_PROMPT = `You are a business topic classifier for a business intelligence tool. Determine ONE category for the user's conversation.

CATEGORIES:
${Object.entries(CATEGORY_KEYWORDS)
  .map(([cat, desc]) => `- "${cat}": ${desc}`)
  .join('\n')}

RULES:
1. Focus on the user's INTENT, not individual words in the message
2. If the user asks for a PLAN/ANALYSIS/STRATEGY for a domain, the category is that DOMAIN
3. If unclear, choose the MOST SPECIFIC category for the request

MANDATORY RESOLUTION RULES (strictly follow):
- "Sales plan" / "Sales strategy" / "Sales process" → Prodaja (NEVER Marketing or Strategija)
- "Marketing strategy" / "Marketing plan" / "Marketing campaign" → Marketing (NEVER Strategija)
- "Content creation" / "Content marketing" / "Writing blogs" → Digitalni Marketing (NEVER Vrednost)
- "Competitive analysis" / "Competition analysis" → Strategija (NEVER Marketing)
- "Product price" / "Pricing strategy" / "Discounts" → Odredjivanje Cene (NEVER Prodaja)
- "Financial report" / "Budget" / "ROI analysis" → Finansije
- "Business model" / "Monetization" → Poslovni Modeli (NEVER Strategija)
- "Hiring" / "Employee training" → Ljudski Resursi (NEVER Menadzment)
- "SEO" / "Social media" / "Email marketing" → Digitalni Marketing (NEVER Marketing)
- If contains the word "sales" in any form → probably Prodaja

RETURN EXCLUSIVELY VALID JSON (no markdown, no explanations):
{"category": "category name", "confidence": 0.0-1.0, "conceptName": "optional: specific concept if you recognize one"}

Response MUST be under 100 tokens.`;

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
      this.logger.warn({
        message: 'LLM classification failed or low confidence — falling back to standard concept matching',
        hadClassification: !!classification,
        confidence: classification?.confidence ?? null,
        usedFallback: true,
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
   * Retries once on transient errors (rate limits, server errors, timeouts) with 2s backoff.
   * Returns null on any failure (non-blocking).
   */
  private async classifyWithLlm(
    userMessage: string,
    aiResponse: string,
    context: ClassificationContext
  ): Promise<ConceptClassificationResult | null> {
    const userContent = `USER MESSAGE:\n"""${userMessage}"""\n\nAI RESPONSE (truncated):\n"""${aiResponse.substring(0, 500)}"""`;

    let lastError: unknown = null;

    for (let attempt = 0; attempt <= CLASSIFIER_MAX_RETRIES; attempt++) {
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

        const result = this.parseClassifierResponse(responseContent);
        if (result) {
          return result;
        }

        // Parse failed but no exception — don't retry parse failures
        this.logger.warn({
          message: 'Classifier LLM returned unparseable response',
          attempt,
          responsePreview: responseContent.substring(0, 200),
          errorType: 'PARSE_FAILURE',
        });
        return null;
      } catch (err) {
        lastError = err;

        const errorType = isTransientLlmError(err) ? 'TRANSIENT' : 'FATAL';

        if (errorType === 'TRANSIENT' && attempt < CLASSIFIER_MAX_RETRIES) {
          const backoff = classifierBackoff(attempt);
          this.logger.warn({
            message: `Classifier LLM transient error, retrying (attempt ${attempt + 1}/${CLASSIFIER_MAX_RETRIES})`,
            error: err instanceof Error ? err.message : 'Unknown',
            errorType,
            backoffMs: Math.round(backoff),
          });
          await sleepMs(backoff);
          continue;
        }

        // Fatal or retries exhausted
        this.logger.error({
          message: 'Classifier LLM call failed — falling back to standard matching',
          error: err instanceof Error ? err.message : 'Unknown',
          errorType,
          attempt,
          maxRetries: CLASSIFIER_MAX_RETRIES,
        });
        return null;
      }
    }

    // Should not reach here, but safety net
    this.logger.error({
      message: 'Classifier LLM retries exhausted',
      error: lastError instanceof Error ? lastError.message : 'Unknown',
    });
    return null;
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
      'hocu',
      'hoću',
      'želim',
      'zelim',
      'daj',
      'molim',
      'trebam',
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
