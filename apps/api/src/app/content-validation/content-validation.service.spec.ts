import { ContentValidationService } from './content-validation.service';

describe('ContentValidationService', () => {
  let service: ContentValidationService;

  beforeEach(() => {
    service = new ContentValidationService();
  });

  const validSerbianContent = `---
title: Prodajni Plan
category: Prodaja
---

# Prodajni Plan

Prodajni plan je ključni dokument koji definiše strategiju prodaje za kompaniju.
Kroz ovaj dokument se analiziraju tržišni uslovi, identifikuju ciljne grupe i
postavljaju merljivi ciljevi prodaje. Upravljanje prodajom zahteva sistematičan
pristup koji uključuje planiranje, organizovanje, vođenje i kontrolu svih
prodajnih aktivnosti. Svaka kompanija mora da ima jasan prodajni plan koji
definiše korake ka ostvarivanju poslovnih ciljeva i koji se redovno ažurira
prema promenama na tržištu.

## Sources

- Kotler, P. (2022). Marketing Management.
`;

  it('should validate valid Serbian content', () => {
    const result = service.validateContent(validSerbianContent);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should detect Serbian diacritics', () => {
    const result = service.validateContent(validSerbianContent);
    expect(result.stats.hasDiacritics).toBe(true);
  });

  it('should detect frontmatter', () => {
    const result = service.validateContent(validSerbianContent);
    expect(result.stats.hasFrontmatter).toBe(true);
  });

  it('should detect Sources section', () => {
    const result = service.validateContent(validSerbianContent);
    expect(result.stats.hasSources).toBe(true);
  });

  it('should fail on too few words', () => {
    const result = service.validateContent('Short text', { minWords: 50 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining('Word count'),
    );
  });

  it('should fail on too few characters', () => {
    const result = service.validateContent('Short', { minChars: 200 });
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining('Character count'),
    );
  });

  it('should fail on missing frontmatter', () => {
    const content =
      'A '.repeat(100) + '\n\n## Sources\n- Source 1';
    const result = service.validateContent(content, {
      requireFrontmatter: true,
      requireDiacritics: false,
      requireSources: true,
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining('frontmatter'),
    );
  });

  it('should fail on missing Sources section', () => {
    const content =
      '---\ntitle: Test\n---\n\n' + 'Word '.repeat(100);
    const result = service.validateContent(content, {
      requireDiacritics: false,
      requireSources: true,
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContainEqual(
      expect.stringContaining('Sources'),
    );
  });

  it('should count words correctly', () => {
    const result = service.validateContent('one two three four five', {
      minWords: 0,
      minChars: 0,
      requireDiacritics: false,
      requireFrontmatter: false,
      requireSources: false,
    });
    expect(result.stats.wordCount).toBe(5);
  });

  it('should not false-positive on English text', () => {
    const englishContent =
      '---\ntitle: Test\n---\n\n' +
      'The quick brown fox jumps over the lazy dog. '.repeat(20) +
      '\n\n## Sources\n- Wikipedia';
    const result = service.validateContent(englishContent);
    // English content should NOT trigger diacritics error (low Serbian word count)
    const diacriticsError = result.errors.find((e) =>
      e.includes('diacritics'),
    );
    expect(diacriticsError).toBeUndefined();
  });

  it('should detect Serbian words', () => {
    const result = service.validateContent(validSerbianContent, {
      minWords: 0,
      minChars: 0,
      requireDiacritics: false,
      requireFrontmatter: false,
      requireSources: false,
    });
    expect(result.stats.serbianWordCount).toBeGreaterThan(0);
  });

  it('should pass with all checks disabled', () => {
    const result = service.validateContent('x', {
      minWords: 0,
      minChars: 0,
      requireDiacritics: false,
      requireFrontmatter: false,
      requireSources: false,
    });
    expect(result.valid).toBe(true);
  });

  it('should accept custom config overrides', () => {
    const result = service.validateContent('Short', {
      minWords: 1,
      minChars: 1,
      requireDiacritics: false,
      requireFrontmatter: false,
      requireSources: false,
    });
    expect(result.valid).toBe(true);
  });

  it('should handle empty content', () => {
    const result = service.validateContent('');
    expect(result.valid).toBe(false);
    expect(result.stats.wordCount).toBe(0);
    expect(result.stats.charCount).toBe(0);
  });

  it('should detect "Izvori" as sources section', () => {
    const content =
      '---\ntitle: Test\n---\n\n' +
      'Word '.repeat(60) +
      '\n\n## Izvori\n- Izvor 1';
    const result = service.validateContent(content, {
      requireDiacritics: false,
    });
    expect(result.stats.hasSources).toBe(true);
  });

  it('should warn when no diacritics found on non-Serbian content', () => {
    const result = service.validateContent(
      '---\ntitle: Test\n---\n\n' +
        'Hello world. '.repeat(30) +
        '\n\n## Sources\n- Src',
      { requireDiacritics: true },
    );
    expect(result.warnings).toContainEqual(
      expect.stringContaining('diacritics'),
    );
  });

  it('should flag missing diacritics on Serbian content', () => {
    // Serbian words but transliterated (no diacritics)
    const content =
      '---\ntitle: Test\n---\n\n' +
      'Prodaja je za kompaniju kroz upravljanje strategija na trziste poslovanje marketing finansije prema nakon ' +
      'Word '.repeat(30) +
      '\n\n## Sources\n- Src';
    const result = service.validateContent(content, {
      requireDiacritics: true,
      serbianWordThreshold: 3,
    });
    const diacriticsError = result.errors.find((e) =>
      e.includes('diacritics'),
    );
    expect(diacriticsError).toBeDefined();
  });

  it('should report character count in stats', () => {
    const content = 'Hello World';
    const result = service.validateContent(content, {
      minWords: 0,
      minChars: 0,
      requireDiacritics: false,
      requireFrontmatter: false,
      requireSources: false,
    });
    expect(result.stats.charCount).toBe(11);
  });
});
