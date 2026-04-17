import { ContentValidationService } from './content-validation.service';

describe('ContentValidationService', () => {
  let service: ContentValidationService;

  const makeArticle = (
    words: number,
    lang: 'en' | 'sr' = 'en',
    hasSources = true,
  ) => {
    const word = lang === 'en' ? 'business ' : 'koji mo\u017ee ';
    let content =
      '---\ntitle: Test\n---\n\n# Test Article\n\n## Overview\n<!-- dept:all -->\n\n';
    content += word.repeat(words);
    if (hasSources) content += '\n\n## Sources\n- [Test](https://test.com)\n';
    return content;
  };

  beforeEach(() => {
    // No ConfigService — uses hardcoded defaults
    service = new ContentValidationService();
  });

  describe('Serbian diacritical characters', () => {
    it('rejects content with \u010d', () => {
      const content = makeArticle(5500) + ' \u010d';
      const r = service.validateContent(content);
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('Serbian diacritical characters'))).toBe(true);
    });

    it('rejects content with \u0107', () => {
      const content = makeArticle(5500) + ' \u0107';
      const r = service.validateContent(content);
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('Serbian diacritical characters'))).toBe(true);
    });

    it('rejects content with \u0161', () => {
      const content = makeArticle(5500) + ' \u0161';
      const r = service.validateContent(content);
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('Serbian diacritical characters'))).toBe(true);
    });

    it('rejects content with \u017e', () => {
      const content = makeArticle(5500) + ' \u017e';
      const r = service.validateContent(content);
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('Serbian diacritical characters'))).toBe(true);
    });

    it('rejects content with \u0111', () => {
      const content = makeArticle(5500) + ' \u0111';
      const r = service.validateContent(content);
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('Serbian diacritical characters'))).toBe(true);
    });
  });

  describe('Serbian words', () => {
    it('rejects content with > 5 Serbian words', () => {
      const r = service.validateContent(makeArticle(5500, 'sr'));
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('Serbian words'))).toBe(true);
    });
  });

  describe('word count', () => {
    it('rejects content under 4500 words (default threshold)', () => {
      const content = makeArticle(500);
      const r = service.validateContent(content);
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('Word count too low'))).toBe(true);
    });
  });

  describe('character count', () => {
    it('rejects content under 15000 chars (default threshold)', () => {
      const r = service.validateContent('short');
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('too short'))).toBe(true);
    });
  });

  describe('frontmatter', () => {
    it('rejects missing frontmatter when requireFrontmatter: true', () => {
      const content =
        'No frontmatter ' +
        'word '.repeat(6000) +
        '\n## Sources\n- [X](https://x.com)';
      const r = service.validateContent(content);
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('frontmatter'))).toBe(true);
    });
  });

  describe('sources section', () => {
    it('rejects missing Sources section when requireSources: true', () => {
      const content = makeArticle(5500, 'en', false);
      const r = service.validateContent(content);
      expect(r.valid).toBe(false);
      expect(r.errors.some((e) => e.includes('Sources'))).toBe(true);
    });
  });

  describe('valid content', () => {
    it('accepts valid 5500-word English article with all required sections', () => {
      const content = makeArticle(5500);
      const r = service.validateContent(content);
      expect(r.valid).toBe(true);
      expect(r.errors).toHaveLength(0);
    });
  });

  describe('no false positives on English words', () => {
    it('does NOT flag "image", "primary", "pervasive", "climate", "invasive"', () => {
      const content =
        makeArticle(5500) +
        ' image primary pervasive climate invasive ';
      const r = service.validateContent(content);
      const serbianWordError = r.errors.find((e) =>
        e.includes('Serbian words'),
      );
      expect(serbianWordError).toBeUndefined();
    });
  });

  describe('custom config overrides', () => {
    it('accepts short content when minWords is lowered', () => {
      const content = makeArticle(200);
      const r = service.validateContent(content, {
        minWords: 100,
        minChars: 100,
      });
      expect(r.errors.some((e) => e.includes('Word count'))).toBe(false);
      expect(r.errors.some((e) => e.includes('too short'))).toBe(false);
    });

    it('accepts missing Sources when requireSources: false', () => {
      const content = makeArticle(5500, 'en', false);
      const r = service.validateContent(content, { requireSources: false });
      const sourcesError = r.errors.find((e) => e.includes('Sources'));
      expect(sourcesError).toBeUndefined();
    });
  });

  describe('specific error strings per check', () => {
    it('returns specific error string for each failed check', () => {
      const r = service.validateContent('short');
      expect(r.errors.some((e) => e.startsWith('Content too short:'))).toBe(true);
      expect(r.errors.some((e) => e.startsWith('Word count too low:'))).toBe(true);
      expect(r.errors.some((e) => e === 'Missing YAML frontmatter (---)')).toBe(true);
      expect(r.errors.some((e) => e === 'Missing Sources/References section')).toBe(true);
    });
  });

  describe('empty content', () => {
    it('returns multiple errors (too short, no frontmatter, no sources)', () => {
      const r = service.validateContent('');
      expect(r.valid).toBe(false);
      expect(r.errors.length).toBeGreaterThanOrEqual(3);
      expect(r.errors.some((e) => e.includes('too short'))).toBe(true);
      expect(r.errors.some((e) => e.includes('frontmatter'))).toBe(true);
      expect(r.errors.some((e) => e.includes('Sources'))).toBe(true);
    });
  });

  describe('partial validity', () => {
    it('content with frontmatter but no sources returns only sources error', () => {
      const content = makeArticle(5500, 'en', false);
      const r = service.validateContent(content);
      // Should not have frontmatter error
      expect(r.errors.some((e) => e.includes('frontmatter'))).toBe(false);
      // Should have sources error
      expect(r.errors.some((e) => e.includes('Sources'))).toBe(true);
    });

    it('has frontmatter + sources but too short — returns only length errors', () => {
      const content =
        '---\ntitle: Test\n---\n\nbusiness word test\n\n## Sources\n- [X](https://x.com)\n';
      const r = service.validateContent(content);
      expect(r.valid).toBe(false);
      // Should NOT have frontmatter or sources errors
      expect(r.errors.some((e) => e.includes('frontmatter'))).toBe(false);
      expect(r.errors.some((e) => e.includes('Sources'))).toBe(false);
      // Should have length errors
      expect(r.errors.some((e) => e.includes('too short'))).toBe(true);
      expect(r.errors.some((e) => e.includes('Word count too low'))).toBe(true);
    });
  });
});
