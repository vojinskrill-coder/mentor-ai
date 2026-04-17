import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface ValidationConfig {
  minWords?: number;
  minChars?: number;
  requireDiacritics?: boolean;
  requireFrontmatter?: boolean;
  requireSources?: boolean;
  serbianWordThreshold?: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    wordCount: number;
    charCount: number;
    hasDiacritics: boolean;
    hasFrontmatter: boolean;
    hasSources: boolean;
    serbianWordCount: number;
  };
}

const SERBIAN_DIACRITICS = /[čćšžđČĆŠŽĐ]/;

// Common Serbian words that indicate Serbian content
const SERBIAN_WORDS = [
  'i', 'u', 'je', 'na', 'da', 'su', 'za', 'sa', 'se', 'od',
  'koji', 'koja', 'koje', 'biti', 'može', 'kroz', 'ili', 'ali',
  'kada', 'kako', 'što', 'kao', 'sve', 'između', 'prema', 'nakon',
  'prije', 'posle', 'ovaj', 'ovog', 'toga', 'tom', 'tim', 'već',
  'još', 'samo', 'tako', 'vrlo', 'više', 'manje', 'ovo', 'taj',
  'koji', 'poslovanje', 'prodaja', 'marketing', 'finansije',
  'upravljanje', 'strategija', 'tržište', 'kompanija', 'preduzeće',
];

// English words that should NOT trigger Serbian detection
const ENGLISH_COMMON = new Set([
  'the', 'and', 'for', 'are', 'but', 'not', 'you', 'all', 'can',
  'her', 'was', 'one', 'our', 'out', 'has', 'his', 'how', 'its',
  'let', 'may', 'new', 'now', 'old', 'see', 'way', 'who', 'did',
  'get', 'got', 'had', 'him', 'use', 'say', 'she', 'too', 'any',
]);

@Injectable()
export class ContentValidationService {
  private readonly logger = new Logger(ContentValidationService.name);
  private readonly defaultConfig: ValidationConfig;

  constructor(@Optional() private readonly configService?: ConfigService) {
    this.defaultConfig = {
      minWords: 50,
      minChars: 200,
      requireDiacritics: true,
      requireFrontmatter: true,
      requireSources: true,
      serbianWordThreshold: 5,
    };
  }

  validateContent(
    content: string,
    config?: Partial<ValidationConfig>,
  ): ValidationResult {
    const cfg = { ...this.defaultConfig, ...config };
    const errors: string[] = [];
    const warnings: string[] = [];

    const words = content
      .split(/\s+/)
      .filter((w) => w.length > 0);
    const wordCount = words.length;
    const charCount = content.length;

    // Diacritics check
    const hasDiacritics = SERBIAN_DIACRITICS.test(content);

    // Frontmatter check (---\n...\n---)
    const hasFrontmatter = /^---\n[\s\S]*?\n---/m.test(content);

    // Sources section check
    const hasSources = /## (Sources|Izvori|Reference)/im.test(content);

    // Serbian word count (case-insensitive, excluding common English words)
    const lowerWords = words.map((w) =>
      w.toLowerCase().replace(/[^a-zčćšžđ]/g, ''),
    );
    const serbianWordCount = lowerWords.filter(
      (w) =>
        w.length > 1 &&
        SERBIAN_WORDS.includes(w) &&
        !ENGLISH_COMMON.has(w),
    ).length;

    // Validation checks
    if (cfg.minWords && wordCount < cfg.minWords) {
      errors.push(
        `Word count ${wordCount} is below minimum ${cfg.minWords}`,
      );
    }

    if (cfg.minChars && charCount < cfg.minChars) {
      errors.push(
        `Character count ${charCount} is below minimum ${cfg.minChars}`,
      );
    }

    if (cfg.requireDiacritics && !hasDiacritics) {
      // Only flag if content appears to be Serbian
      if (serbianWordCount >= (cfg.serbianWordThreshold || 5)) {
        errors.push(
          'Serbian content detected but no diacritics (čćšžđ) found',
        );
      } else {
        warnings.push('No Serbian diacritics found');
      }
    }

    if (cfg.requireFrontmatter && !hasFrontmatter) {
      errors.push('Missing frontmatter section (---...---)');
    }

    if (cfg.requireSources && !hasSources) {
      errors.push('Missing Sources/Izvori section');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      stats: {
        wordCount,
        charCount,
        hasDiacritics,
        hasFrontmatter,
        hasSources,
        serbianWordCount,
      },
    };
  }
}
