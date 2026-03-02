import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import type {
  ChatMessage,
  PromptCheckResult,
  PromptCheckIssue,
  PromptCheckVerdict,
} from '@mentor-ai/shared/types';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import { WebSearchService } from '../web-search/web-search.service';

/** Maximum rewrite cycles before force pass-through */
const MAX_REWRITE_CYCLES = 2;

/** Timeout for URL HEAD requests (ms) */
const URL_CHECK_TIMEOUT_MS = 3_000;

/** Maximum URLs to validate per prompt */
const MAX_URL_CHECKS = 5;

/**
 * Meta-prompt for the checker LLM. Evaluates prompt quality and returns structured JSON.
 * Designed for fast execution (~200-500 output tokens) on a fallback model.
 */
const CHECKER_SYSTEM_PROMPT = `Ti si kontrolor kvaliteta AI promptova za srpski biznis alat. Tvoj posao je da PROCENIŠ da li je prompt dovoljno specifičan i kontekstualizovan PRE nego što se pošalje na izvršavanje.

EVALUIRAJ prompt prema ovim kriterijumima:
1. SPECIFIČNOST: Da li koristi PRAVO ime kompanije, industriju i specifične detalje? Ili koristi generičke placeholder-e ("Kompanija XYZ", "vaše poslovanje", "primer industrija")?
2. PORAVNANJE SA ZAHTEVOM: Da li je prompt DIREKTNO povezan sa originalnim zahtevom korisnika? Ili se udaljio u generičku analizu?
3. POSLOVNI KONTEKST: Da li su ime kompanije i industrija INTEGRISANI u sam prompt, ne samo pomenuti?
4. AKCIONA ORIJENTACIJA: Da li prompt traži KONKRETAN rezultat (dokument, plan, analizu) ili generičke savete?
5. JEZIK: Da li je prompt na srpskom jeziku?

DONESI ODLUKU:
- "pass" — prompt je dovoljno kvalitetan, pošalji ga na izvršavanje
- "rewrite" — prompt ima problema, vratio sam poboljšanu verziju u enrichedPrompt
- "enrich" — promptu nedostaju realni podaci, potrebna je web pretraga

ZA "rewrite" i "enrich":
- U enrichedPrompt OBAVEZNO zadrži SVE originalne instrukcije i dodaj specifičnost
- NE menjaj osnovnu nameru prompta
- ZAMENI svaki placeholder PRAVIM podacima iz poslovnog konteksta
- DODAJ konkretne zahteve za format izlaza (tabele, brojke, rokovi)

VRATI ISKLJUČIVO VALIDAN JSON (bez markdown):
{
  "verdict": "pass" | "rewrite" | "enrich",
  "issues": [
    {"code": "placeholder_detected" | "generic_content" | "missing_original_ask" | "missing_business_context" | "too_vague" | "language_mismatch", "description": "opis problema", "severity": "critical" | "warning"}
  ],
  "enrichedPrompt": "poboljšan prompt sa svim ispravkama (samo ako verdict != pass)",
  "webSearchNeeded": true | false,
  "searchQuery": "optimizovan upit za Google pretragu (samo ako webSearchNeeded=true)"
}

BUDI STROG ali EFIKASAN. Ako je prompt 80%+ dobar, vrati "pass". Fokusiraj se na KRITIČNE probleme:
- Placeholder imena umesto pravih
- Potpuno odsustvo poslovnog konteksta
- Prompt koji nema veze sa korisnikovim zahtevom

NE blokiraj promptove koji su funkcionalno OK ali ne savršeni.
Odgovor MORA biti manji od 500 tokena.`;

/**
 * Context provided to the checker for evaluation.
 */
export interface PromptCheckContext {
  /** The user prompt about to be sent to the main LLM */
  userPrompt: string;
  /** The user's original ask (task title + content) */
  originalAsk: string;
  /** Tenant business info */
  businessInfo: {
    companyName?: string;
    industry?: string;
    description?: string;
  };
  /** Tenant ID for LLM call billing */
  tenantId: string;
  /** User ID for LLM call billing */
  userId: string;
  /** Conversation ID for token usage attribution */
  conversationId?: string;
  /** Concept name being worked on */
  conceptName?: string;
  /** Step title (if checking a workflow step prompt) */
  stepTitle?: string;
  /** Whether this is a workflow generation call (vs step execution) */
  isWorkflowGeneration?: boolean;
}

@Injectable()
export class PromptCheckerService {
  private readonly logger = new Logger(PromptCheckerService.name);
  private readonly enabled: boolean;

  constructor(
    private readonly aiGatewayService: AiGatewayService,
    private readonly webSearchService: WebSearchService,
    private readonly configService: ConfigService
  ) {
    const envValue = this.configService.get<string>('PROMPT_CHECKER_ENABLED');
    this.enabled = envValue !== 'false'; // Enabled by default unless explicitly disabled
  }

  /**
   * Whether the prompt checker is enabled.
   * Controlled by PROMPT_CHECKER_ENABLED env var (default: true).
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Main entry point: checks a prompt for quality issues
   * and optionally rewrites it, up to MAX_REWRITE_CYCLES times.
   * Returns the final verdict with an enriched prompt if needed.
   *
   * Non-blocking: any failure returns original prompt unchanged.
   */
  async checkAndEnrichPrompt(context: PromptCheckContext): Promise<PromptCheckResult> {
    const passThrough: PromptCheckResult = {
      verdict: 'pass',
      issues: [],
      webSearchNeeded: false,
      cyclesUsed: 0,
      durationMs: 0,
    };

    // Skip if disabled via env var
    if (!this.enabled) {
      return passThrough;
    }

    // Skip if no business context to validate against
    if (!context.businessInfo.companyName) {
      return passThrough;
    }

    const startTime = Date.now();
    let currentPrompt = context.userPrompt;
    let totalCycles = 0;
    let lastResult: PromptCheckResult | null = null;

    for (let cycle = 0; cycle < MAX_REWRITE_CYCLES; cycle++) {
      totalCycles = cycle + 1;

      // 1. Run the LLM checker call
      const checkResult = await this.runCheckerLlm(currentPrompt, context);

      // 2. If pass, return immediately
      if (checkResult.verdict === 'pass') {
        return {
          ...checkResult,
          cyclesUsed: totalCycles,
          durationMs: Date.now() - startTime,
        };
      }

      // 3. If web search needed and available, enrich
      let enrichedPrompt = checkResult.enrichedPrompt ?? currentPrompt;
      if (
        checkResult.webSearchNeeded &&
        checkResult.searchQuery &&
        this.webSearchService.isAvailable()
      ) {
        try {
          const searchResults = await this.webSearchService.searchAndExtract(
            checkResult.searchQuery,
            3
          );
          if (searchResults.length > 0) {
            const webContext = this.webSearchService.formatSourcesAsObsidian(searchResults);
            enrichedPrompt = enrichedPrompt + '\n\n' + webContext;
          }
        } catch (err) {
          this.logger.warn({
            message: 'Checker web search failed (non-blocking)',
            error: err instanceof Error ? err.message : 'Unknown',
          });
        }
      }

      // 4. Update prompt for next cycle
      currentPrompt = enrichedPrompt;
      lastResult = {
        verdict: checkResult.verdict,
        issues: [...checkResult.issues],
        enrichedPrompt: currentPrompt,
        webSearchNeeded: checkResult.webSearchNeeded,
        searchQuery: checkResult.searchQuery,
        cyclesUsed: totalCycles,
        durationMs: Date.now() - startTime,
      };

      // If the checker returned 'enrich' (web search done), pass through
      if (checkResult.verdict === 'enrich') {
        return lastResult;
      }

      // If 'rewrite', loop again for re-evaluation
    }

    // Max cycles exceeded — pass through with warning
    this.logger.warn({
      message: 'Prompt checker max cycles exceeded, passing through',
      cycles: totalCycles,
      context: context.stepTitle ?? context.originalAsk?.substring(0, 100),
    });

    return {
      verdict: 'pass',
      issues: lastResult?.issues ?? [],
      enrichedPrompt: currentPrompt,
      webSearchNeeded: false,
      cyclesUsed: totalCycles,
      durationMs: Date.now() - startTime,
      warning: 'Max rewrite cycles reached. Prompt passed through with warning.',
    };
  }

  /**
   * Calls the fallback LLM with the checker meta-prompt.
   * Returns a structured verdict.
   */
  private async runCheckerLlm(
    userPrompt: string,
    context: PromptCheckContext
  ): Promise<Omit<PromptCheckResult, 'cyclesUsed' | 'durationMs'>> {
    const checkerUserMessage = this.buildCheckerUserMessage(userPrompt, context);

    let responseContent = '';
    try {
      await this.aiGatewayService.streamCompletionWithContext(
        [
          { role: 'system', content: CHECKER_SYSTEM_PROMPT } as ChatMessage,
          { role: 'user', content: checkerUserMessage } as ChatMessage,
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
        message: 'Checker LLM call failed, defaulting to pass',
        error: err instanceof Error ? err.message : 'Unknown',
      });
      return {
        verdict: 'pass',
        issues: [],
        webSearchNeeded: false,
      };
    }

    return this.parseCheckerResponse(responseContent, userPrompt);
  }

  /**
   * Builds the user message sent to the checker LLM.
   */
  private buildCheckerUserMessage(userPrompt: string, context: PromptCheckContext): string {
    return `PROMPT ZA PROVERU:
"""
${userPrompt}
"""

ORIGINALNI ZAHTEV KORISNIKA:
"""
${context.originalAsk || 'Nije dostupan'}
"""

POSLOVNI KONTEKST:
- Kompanija: ${context.businessInfo.companyName ?? 'NEPOZNATA'}
- Industrija: ${context.businessInfo.industry ?? 'NEPOZNATA'}
- Opis: ${context.businessInfo.description ?? 'Nema opisa'}

KONCEPT: ${context.conceptName ?? 'Nema'}
KORAK: ${context.stepTitle ?? 'N/A'}
TIP: ${context.isWorkflowGeneration ? 'GENERISANJE RADNOG TOKA' : 'IZVRŠAVANJE KORAKA'}

Analiziraj i vrati JSON.`;
  }

  /**
   * Parses the checker LLM's JSON response into a typed result.
   * Falls back to 'pass' on parse failure.
   */
  private parseCheckerResponse(
    response: string,
    originalPrompt: string
  ): Omit<PromptCheckResult, 'cyclesUsed' | 'durationMs'> {
    try {
      const cleaned = response
        .replace(/```json?\n?/g, '')
        .replace(/```/g, '')
        .trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON object found');

      const parsed = JSON.parse(jsonMatch[0]);

      const verdict = this.normalizeVerdict(parsed.verdict);
      const issues: PromptCheckIssue[] = Array.isArray(parsed.issues)
        ? parsed.issues.map((i: Record<string, unknown>) => ({
            code: (i.code as string) ?? 'generic_content',
            description: (i.description as string) ?? '',
            severity: (i.severity as string) ?? 'warning',
          }))
        : [];

      return {
        verdict,
        issues,
        enrichedPrompt:
          verdict !== 'pass' ? ((parsed.enrichedPrompt as string) ?? originalPrompt) : undefined,
        webSearchNeeded: !!parsed.webSearchNeeded,
        searchQuery: (parsed.searchQuery as string) ?? undefined,
      };
    } catch (err) {
      this.logger.warn({
        message: 'Failed to parse checker response, defaulting to pass',
        error: err instanceof Error ? err.message : 'Unknown',
        responsePreview: response.substring(0, 200),
      });
      return {
        verdict: 'pass',
        issues: [],
        webSearchNeeded: false,
      };
    }
  }

  /**
   * Normalizes the verdict string from LLM output.
   */
  private normalizeVerdict(raw: unknown): PromptCheckVerdict {
    const str = String(raw).toLowerCase().trim();
    if (str === 'pass') return 'pass';
    if (str === 'rewrite') return 'rewrite';
    if (str === 'enrich') return 'enrich';
    return 'pass'; // Safe default
  }

  /**
   * Extracts URLs from text and validates them with HEAD requests.
   * Returns issues for unreachable URLs.
   */
  async validateUrls(text: string): Promise<PromptCheckIssue[]> {
    const urlRegex = /https?:\/\/[^\s)>\]"']+/g;
    const urls = [...new Set(text.match(urlRegex) ?? [])].slice(0, MAX_URL_CHECKS);

    if (urls.length === 0) return [];

    const issues: PromptCheckIssue[] = [];

    const results = await Promise.allSettled(
      urls.map((url) =>
        axios
          .head(url, {
            timeout: URL_CHECK_TIMEOUT_MS,
            maxRedirects: 3,
            validateStatus: (status) => status < 400,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MentorAI/1.0)' },
          })
          .then(() => ({ url, ok: true }))
          .catch(() => ({ url, ok: false }))
      )
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && !result.value.ok) {
        issues.push({
          code: 'unreachable_url',
          description: `URL nedostupan: ${result.value.url}`,
          severity: 'warning',
        });
      }
    }

    return issues;
  }
}
