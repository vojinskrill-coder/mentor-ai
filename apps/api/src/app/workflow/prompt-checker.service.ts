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
const CHECKER_SYSTEM_PROMPT = `You are a quality controller for AI prompts in a business tool. Your job is to EVALUATE whether a prompt is specific and contextualized enough BEFORE it is sent for execution.

EVALUATE the prompt against these criteria:
1. SPECIFICITY: Does it use the REAL company name, industry, and specific details? Or does it use generic placeholders ("Company XYZ", "your business", "example industry")?
2. ALIGNMENT WITH REQUEST: Is the prompt DIRECTLY related to the user's original request? Or has it drifted into generic analysis?
3. BUSINESS CONTEXT: Are the company name and industry INTEGRATED into the prompt itself, not just mentioned?
4. ACTION ORIENTATION: Does the prompt ask for a CONCRETE result (document, plan, analysis) or generic advice?
5. LANGUAGE: Is the prompt in the correct language?

MAKE A DECISION:
- "pass" — the prompt is of sufficient quality, send it for execution
- "rewrite" — the prompt has issues, I have returned an improved version in enrichedPrompt
- "enrich" — the prompt lacks real data, a web search is needed

FOR "rewrite" and "enrich":
- In enrichedPrompt you MUST keep ALL original instructions and add specificity
- Do NOT change the basic intent of the prompt
- REPLACE every placeholder with REAL data from the business context
- ADD concrete requirements for output format (tables, numbers, deadlines)

RETURN EXCLUSIVELY VALID JSON (no markdown):
{
  "verdict": "pass" | "rewrite" | "enrich",
  "issues": [
    {"code": "placeholder_detected" | "generic_content" | "missing_original_ask" | "missing_business_context" | "too_vague" | "language_mismatch", "description": "description of the issue", "severity": "critical" | "warning"}
  ],
  "enrichedPrompt": "improved prompt with all corrections (only if verdict != pass)",
  "webSearchNeeded": true | false,
  "searchQuery": "optimized Google search query (only if webSearchNeeded=true)"
}

BE STRICT but EFFICIENT. If the prompt is 80%+ good, return "pass". Focus on CRITICAL issues:
- Placeholder names instead of real ones
- Complete absence of business context
- Prompt that has nothing to do with the user's request

Do NOT block prompts that are functionally OK but not perfect.
Response MUST be less than 500 tokens.`;

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

ORIGINAL USER REQUEST:
"""
${context.originalAsk || 'Not available'}
"""

BUSINESS CONTEXT:
- Company: ${context.businessInfo.companyName ?? 'UNKNOWN'}
- Industry: ${context.businessInfo.industry ?? 'UNKNOWN'}
- Description: ${context.businessInfo.description ?? 'No description'}

CONCEPT: ${context.conceptName ?? 'None'}
STEP: ${context.stepTitle ?? 'N/A'}
TYPE: ${context.isWorkflowGeneration ? 'WORKFLOW GENERATION' : 'STEP EXECUTION'}

Analyze and return JSON.`;
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
