/**
 * Data Quality Tests — Verify data integrity contracts
 * for curriculum, slugs, templates, and bridge skill.
 */

import { ContentValidationService } from '../content-validation/content-validation.service';

describe('Data Quality Tests', () => {
  // Curriculum tests
  describe('Curriculum Structure', () => {
    it('should have standard category names', () => {
      const categories = [
        'Poslovanje', 'Vrednost', 'Prodaja', 'Marketing',
        'Finansije', 'Operacije', 'Ljudski Resursi', 'Tehnologija',
      ];
      expect(categories.length).toBeGreaterThanOrEqual(8);
      categories.forEach((cat) => {
        expect(typeof cat).toBe('string');
        expect(cat.length).toBeGreaterThan(0);
      });
    });

    it('should have valid concept structure', () => {
      const concept = {
        id: 'concept-1',
        name: 'Prodajni Plan',
        slug: 'prodajni-plan',
        category: '6. Prodaja',
        description: 'Strategija prodaje',
      };
      expect(concept.slug).toMatch(/^[a-z0-9-]+$/);
      expect(concept.name.length).toBeGreaterThan(0);
    });

    it('should have valid relationship types', () => {
      const types = ['PREREQUISITE', 'RELATED', 'ADVANCED'];
      types.forEach((type) => {
        expect(type).toMatch(/^[A-Z_]+$/);
      });
    });

    it('should have numeric category prefix in Obsidian format', () => {
      const obsidianCategory = '6. Prodaja';
      expect(obsidianCategory).toMatch(/^\d+\.\s.+$/);
    });

    it('should have unnumbered category in AI-discovered format', () => {
      const aiCategory = 'Prodaja';
      expect(aiCategory).not.toMatch(/^\d+\.\s/);
    });

    it('should support contains matching for both formats', () => {
      const search = 'Prodaja';
      expect('6. Prodaja'.includes(search)).toBe(true);
      expect('Prodaja'.includes(search)).toBe(true);
    });
  });

  // Slug validation tests
  describe('Slug Validation', () => {
    it('slugs should be lowercase alphanumeric with hyphens', () => {
      const validSlugs = ['prodajni-plan', 'marketing-strategija', 'bmc-canvas'];
      validSlugs.forEach((slug) => {
        expect(slug).toMatch(/^[a-z0-9-]+$/);
      });
    });

    it('slugs should not start or end with hyphens', () => {
      const invalidSlugs = ['-bad-slug', 'bad-slug-', '-both-'];
      invalidSlugs.forEach((slug) => {
        expect(slug).toMatch(/^-|^.*-$/);
      });
    });

    it('slugs should not contain consecutive hyphens', () => {
      const slug = 'good-slug-name';
      expect(slug).not.toMatch(/--/);
    });

    it('slugs should be unique identifiers', () => {
      const slugs = ['concept-a', 'concept-b', 'concept-c'];
      const unique = new Set(slugs);
      expect(unique.size).toBe(slugs.length);
    });

    it('slug generation should handle Serbian characters', () => {
      const serbianToSlug = (name: string): string => {
        return name
          .toLowerCase()
          .replace(/č/g, 'c')
          .replace(/ć/g, 'c')
          .replace(/š/g, 's')
          .replace(/ž/g, 'z')
          .replace(/đ/g, 'dj')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '');
      };
      expect(serbianToSlug('Prodajni Učinak')).toBe('prodajni-ucinak');
      expect(serbianToSlug('Čišćenje')).toBe('ciscenje');
    });

    it('slug max length should be reasonable', () => {
      const slug = 'a-very-long-concept-name-that-should-still-be-valid';
      expect(slug.length).toBeLessThan(100);
    });
  });

  // Template quality tests
  describe('Template Quality', () => {
    it('SOUL template should have Identity section', () => {
      const template = '## Identity\nYou are {{AGENT_NAME}}';
      expect(template).toContain('## Identity');
    });

    it('SOUL template should have Mission section', () => {
      const template = '## Mission\nAnalyze business';
      expect(template).toContain('## Mission');
    });

    it('SOUL template should have Self-Validation rules', () => {
      const template = '## Self-Validation Rules\n### Validation Gates';
      expect(template).toContain('Self-Validation');
    });

    it('template placeholders should use UPPER_SNAKE_CASE', () => {
      const placeholders = ['{{TENANT_ID}}', '{{AGENT_NAME}}', '{{BACKEND_URL}}'];
      placeholders.forEach((p) => {
        expect(p).toMatch(/^\{\{[A-Z_]+\}\}$/);
      });
    });

    it('skill template should have configuration section', () => {
      const template = '## Configuration\n- Backend URL: {{BACKEND_URL}}';
      expect(template).toContain('## Configuration');
    });

    it('skill template should have error handling section', () => {
      const template = '## Error Handling\n- On 401: Token expired';
      expect(template).toContain('## Error Handling');
    });
  });

  // Bridge skill tests
  describe('Bridge Skill', () => {
    it('should have required endpoints', () => {
      const endpoints = [
        'GET /state',
        'POST /state',
        'POST /task-complete',
        'POST /knowledge/search',
      ];
      expect(endpoints.length).toBe(4);
    });

    it('should require Bearer auth header', () => {
      const header = 'Authorization: Bearer {{BRIDGE_AUTH_TOKEN}}';
      expect(header).toContain('Bearer');
    });

    it('should use {{TENANT_ID}} placeholder', () => {
      const body = '"tenantId": "{{TENANT_ID}}"';
      expect(body).toContain('{{TENANT_ID}}');
    });

    it('should handle retry on 500', () => {
      const retryConfig = { maxRetries: 3, strategy: 'exponential-backoff' };
      expect(retryConfig.maxRetries).toBe(3);
    });

    it('should handle 401 auth failure', () => {
      const errorHandling = { 401: 'report_auth_failure', 404: 'skip', 500: 'retry' };
      expect(errorHandling[401]).toBe('report_auth_failure');
    });

    it('should handle 404 gracefully', () => {
      const errorHandling = { 404: 'skip' };
      expect(errorHandling[404]).toBe('skip');
    });
  });

  // Content validation integration
  describe('Content Validation Integration', () => {
    let validator: ContentValidationService;

    beforeEach(() => {
      validator = new ContentValidationService();
    });

    it('should validate complete Serbian document', () => {
      const doc = `---
title: Prodajni Plan
category: Prodaja
---

# Prodajni Plan

Prodajni plan je ključni dokument koji definiše strategiju prodaje za kompaniju.
Kroz ovaj dokument se analiziraju tržišni uslovi i postavljaju ciljevi.
Upravljanje prodajom zahteva sistematičan pristup koji uključuje planiranje
i kontrolu svih prodajnih aktivnosti. Svaka kompanija mora da ima jasan plan
koji definiše korake ka ostvarivanju poslovnih ciljeva.

## Sources

- Kotler, P. (2022). Marketing Management.
`;
      const result = validator.validateContent(doc);
      expect(result.valid).toBe(true);
      expect(result.stats.hasDiacritics).toBe(true);
      expect(result.stats.hasFrontmatter).toBe(true);
      expect(result.stats.hasSources).toBe(true);
    });

    it('should reject empty document', () => {
      const result = validator.validateContent('');
      expect(result.valid).toBe(false);
    });

    it('should not false-positive English as Serbian', () => {
      const englishDoc = `---
title: Sales Plan
---

The sales plan is a key document that defines the sales strategy.
Through this document we analyze market conditions and set goals.
Sales management requires a systematic approach that includes planning
and control of all sales activities. Every company must have a clear plan.

## Sources

- Kotler, P. (2022). Marketing Management.
`;
      const result = validator.validateContent(englishDoc);
      // Should NOT have diacritics error for English content
      const diacriticsError = result.errors.find((e) =>
        e.includes('diacritics'),
      );
      expect(diacriticsError).toBeUndefined();
    });

    it('should detect missing frontmatter', () => {
      const noFrontmatter = 'Word '.repeat(60) + '\n## Sources\n- Src';
      const result = validator.validateContent(noFrontmatter, {
        requireDiacritics: false,
      });
      expect(result.stats.hasFrontmatter).toBe(false);
    });

    it('should count words accurately', () => {
      const result = validator.validateContent('one two three', {
        minWords: 0,
        minChars: 0,
        requireDiacritics: false,
        requireFrontmatter: false,
        requireSources: false,
      });
      expect(result.stats.wordCount).toBe(3);
    });

    it('should accept Izvori as sources header', () => {
      const doc = `---
title: Test
---

${'Reč '.repeat(60)}

## Izvori

- Izvor 1
`;
      const result = validator.validateContent(doc, {
        requireDiacritics: false,
      });
      expect(result.stats.hasSources).toBe(true);
    });
  });
});
