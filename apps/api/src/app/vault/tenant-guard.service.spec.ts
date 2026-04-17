import { TenantGuardService } from './tenant-guard.service';
import { ContentValidationService } from '../content-validation/content-validation.service';

describe('TenantGuardService', () => {
  let service: TenantGuardService;
  let contentValidation: ContentValidationService;

  beforeEach(() => {
    const mockPrisma = {
      tenant: { findUnique: jest.fn().mockResolvedValue({ id: 'tnt_test', name: 'Test' }) },
    };
    const mockConfig = {
      get: jest.fn((key: string) => {
        if (key === 'OPENCLAW_DEFAULT_TENANT_ID') return 'tnt_rljn1gj4cgxoph0hxfohv6l4';
        if (key === 'HETZNER_HOST') return '91.98.231.87';
        if (key === 'HETZNER_SSH_KEY') return '';
        return undefined;
      }),
    };
    contentValidation = new ContentValidationService();
    service = new TenantGuardService(mockPrisma as any, mockConfig as any, contentValidation);
  });

  describe('validateTenantId', () => {
    it('rejects empty tenantId', async () => {
      const r = await service.validateTenantId('', 'test');
      expect(r.valid).toBe(false);
      expect(r.error).toContain('empty');
    });

    it('accepts any valid tenant including LSA', async () => {
      const r = await service.validateTenantId('tnt_rljn1gj4cgxoph0hxfohv6l4', 'test');
      expect(r.valid).toBe(true);
    });

    it('accepts valid tenant', async () => {
      const r = await service.validateTenantId('tnt_test', 'test');
      expect(r.valid).toBe(true);
    });
  });

  describe('validateContent', () => {
    const makeArticle = (words: number, lang: 'en' | 'sr' = 'en', hasSources = true) => {
      const word = lang === 'en' ? 'business ' : 'koji može ';
      let content = '---\ntitle: Test\n---\n\n# Test Article\n\n## Overview\n<!-- dept:all -->\n\n';
      content += word.repeat(words);
      if (hasSources) content += '\n\n## Sources\n- [Test](https://test.com)\n';
      return content;
    };

    it('rejects short content', () => {
      const r = service.validateContent('short');
      expect(r.valid).toBe(false);
      expect(r.errors.some(e => e.includes('too short'))).toBe(true);
    });

    it('rejects Serbian characters', () => {
      const content = makeArticle(5000) + ' čćšžđ';
      const r = service.validateContent(content);
      expect(r.valid).toBe(false);
      expect(r.errors.some(e => e.includes('Serbian') && e.includes('characters'))).toBe(true);
    });

    it('rejects Serbian words', () => {
      const r = service.validateContent(makeArticle(5000, 'sr'));
      expect(r.valid).toBe(false);
    });

    it('rejects missing frontmatter', () => {
      const content = 'No frontmatter ' + 'word '.repeat(6000) + '\n## Sources\n- [X](https://x.com)';
      const r = service.validateContent(content);
      expect(r.valid).toBe(false);
      expect(r.errors.some(e => e.includes('frontmatter'))).toBe(true);
    });

    it('rejects missing Sources section', () => {
      const content = makeArticle(5000, 'en', false);
      const r = service.validateContent(content);
      expect(r.valid).toBe(false);
      expect(r.errors.some(e => e.includes('Sources'))).toBe(true);
    });

    it('accepts valid English article', () => {
      const content = makeArticle(5500);
      const r = service.validateContent(content);
      expect(r.valid).toBe(true);
      expect(r.errors).toHaveLength(0);
    });

    it('does not false-positive on English words', () => {
      const content = makeArticle(5000) + ' image primary pervasive climate invasive ';
      const r = service.validateContent(content);
      const serbianError = r.errors.find(e => e.includes('Serbian words'));
      expect(serbianError).toBeUndefined();
    });
  });
});
