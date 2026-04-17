import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ContentValidationConfig {
  minWords: number;
  minChars: number;
  language: string;
  requireSources: boolean;
  requireFrontmatter: boolean;
}

export interface ContentValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * ContentValidationService — shared guardrail logic for enriched content.
 *
 * Extracted from TenantGuardService.validateContent() to eliminate duplication
 * across tenant-guard.service.ts, headless-executor.service.ts, and future consumers.
 *
 * Reads default thresholds from ConfigService (if available) but allows per-call overrides.
 */
@Injectable()
export class ContentValidationService {
  private readonly logger = new Logger(ContentValidationService.name);
  private readonly defaultConfig: ContentValidationConfig;

  constructor(@Optional() private readonly configService?: ConfigService) {
    this.defaultConfig = {
      minWords: this.readConfig('CONTENT_MIN_WORDS', 4500),
      minChars: this.readConfig('CONTENT_MIN_CHARS', 15000),
      language: this.configService?.get<string>('CONTENT_LANGUAGE') ?? 'english',
      requireSources: this.readConfig('CONTENT_REQUIRE_SOURCES', true),
      requireFrontmatter: this.readConfig('CONTENT_REQUIRE_FRONTMATTER', true),
    };
  }

  /**
   * Validate enriched content quality.
   *
   * Checks performed:
   * 1. Minimum character length
   * 2. Serbian diacritical characters
   * 3. Serbian word frequency (> 5 definitive Serbian words triggers rejection)
   * 4. Minimum word count
   * 5. YAML frontmatter presence (---)
   * 6. Sources/References section presence
   */
  validateContent(
    content: string,
    config?: Partial<ContentValidationConfig>,
  ): ContentValidationResult {
    const cfg = { ...this.defaultConfig, ...config };
    const errors: string[] = [];

    // 1. Length check
    if (!content || content.length < cfg.minChars) {
      errors.push(
        `Content too short: ${content?.length ?? 0} chars (need >= ${cfg.minChars})`,
      );
    }

    // 2. Serbian diacritics check (U+010D, U+0107, U+0161, U+017E, U+0111)
    if (/[\u010d\u0107\u0161\u017e\u0111]/i.test(content)) {
      errors.push('Content contains Serbian diacritical characters (\u010d\u0107\u0161\u017e\u0111)');
    }

    // 3. Serbian words check — definitive Serbian words only, avoid false positives
    // These words do NOT appear in English: koji, koja, koje, mo\u017ee, nije, ve\u0107, etc.
    // Words like "image", "primary", "invasive" must NOT trigger
    const serbianWords = content.match(
      /\b(koji|koja|koje|mo\u017ee|nije|ve\u0107|\u0161to|zato|izme\u0111u|njihov|kompanij|tr\u017ei\u0161t|vrednost|kupac|prodaj)\b/gi,
    );
    if (serbianWords && serbianWords.length > 5) {
      errors.push(
        `Content has ${serbianWords.length} Serbian words: ${serbianWords.slice(0, 5).join(', ')}...`,
      );
    }

    // 4. Word count
    const wordCount = content.split(/\s+/).filter((w) => w.length > 0).length;
    if (wordCount < cfg.minWords) {
      errors.push(
        `Word count too low: ${wordCount} (need >= ${cfg.minWords})`,
      );
    }

    // 5. Frontmatter check
    if (cfg.requireFrontmatter && !content.includes('---')) {
      errors.push('Missing YAML frontmatter (---)');
    }

    // 6. Sources section
    if (
      cfg.requireSources &&
      !content.includes('## Sources') &&
      !content.includes('## References')
    ) {
      errors.push('Missing Sources/References section');
    }

    return { valid: errors.length === 0, errors };
  }

  private readConfig<T>(key: string, fallback: T): T {
    if (!this.configService) return fallback;
    const val = this.configService.get<T>(key);
    return val ?? fallback;
  }
}
