import { TemplateService } from './template.service';
import { TemplateResolutionError } from './template.error';

/**
 * Sample variables that satisfy every placeholder used across the 6 vault templates.
 *
 * Templates with placeholders:
 *   SCHEMA.template.md       — {{companyName}}
 *   TENANT-PROTOCOL.template.md — {{tenantId}}, {{companyName}}, {{industry}}, {{vaultPath}}
 *   SOUL.template.md         — {{companyName}}, {{industry}}, {{tenantId}}, {{vaultPath}}
 *   bootstrap.template.md    — {{companyName}}, {{industry}}, {{website}}, {{description}},
 *                               {{visualStyle}}, {{brandColors}}, {{targetAudience}},
 *                               {{vaultPath}}, {{tenantId}}
 *   GUARDRAILS.template.md   — (none)
 *   FLOW.template.md         — (none)
 */
const SAMPLE_VARS: Record<string, string> = {
  companyName: 'Test Corp',
  tenantId: 'tnt_test',
  industry: 'Technology',
  description: 'A test company',
  language: 'English',
  website: 'https://testcorp.example.com',
  vaultPath: '/root/.openclaw-tnt_test/vault',
  visualStyle: 'Modern minimalist',
  brandColors: '#000000, #FFFFFF',
  targetAudience: 'Enterprise CTOs',
};

describe('TemplateService', () => {
  let service: TemplateService;

  beforeAll(() => {
    service = new TemplateService();
  });

  // ── Core placeholder resolution ──

  it('should replace all placeholders with provided values', () => {
    const result = service.resolve('SCHEMA.template.md', SAMPLE_VARS);
    expect(result).toContain('Test Corp');
    expect(result).not.toContain('{{companyName}}');
  });

  it('should throw TemplateResolutionError listing unresolved placeholders when variable is missing', () => {
    // Provide empty variables for a template that requires {{companyName}}
    try {
      service.resolve('SCHEMA.template.md', {});
      fail('Expected TemplateResolutionError');
    } catch (err) {
      expect(err).toBeInstanceOf(TemplateResolutionError);
      const tErr = err as TemplateResolutionError;
      expect(tErr.unresolvedPlaceholders).toContain('companyName');
      expect(tErr.message).toContain('SCHEMA.template.md');
    }
  });

  // ── resolveAll ──

  it('should return 6 entries from resolveAll (one per template)', () => {
    const map = service.resolveAll(SAMPLE_VARS);
    expect(map.size).toBe(6);
    expect(map.has('SCHEMA.md')).toBe(true);
    expect(map.has('TENANT-PROTOCOL.md')).toBe(true);
    expect(map.has('GUARDRAILS.md')).toBe(true);
    expect(map.has('SOUL.md')).toBe(true);
    expect(map.has('FLOW.md')).toBe(true);
    expect(map.has('bootstrap.md')).toBe(true);
  });

  // ── Determinism ──

  it('should produce identical output for identical inputs (determinism)', () => {
    const first = service.resolve('SOUL.template.md', SAMPLE_VARS);
    const second = service.resolve('SOUL.template.md', SAMPLE_VARS);
    expect(first).toBe(second);
  });

  // ── Special characters in values ──

  it('should handle special characters in variable values', () => {
    const vars = { ...SAMPLE_VARS, companyName: `O'Brien & Sons "LLC"` };
    const result = service.resolve('SCHEMA.template.md', vars);
    expect(result).toContain(`O'Brien & Sons "LLC"`);
    expect(result).not.toContain('{{companyName}}');
  });

  // ── Per-template resolution with sample data ──

  it('should resolve SCHEMA.template.md — contains company name and 5,000 words reference', () => {
    const result = service.resolve('SCHEMA.template.md', SAMPLE_VARS);
    expect(result).toContain('Test Corp');
    expect(result).toMatch(/5[,.]?000/); // "5,000" or "5000"
  });

  it('should resolve TENANT-PROTOCOL.template.md — contains tenantId and ENGLISH', () => {
    const result = service.resolve('TENANT-PROTOCOL.template.md', SAMPLE_VARS);
    expect(result).toContain('tnt_test');
    expect(result).toContain('ENGLISH');
  });

  it('should resolve SOUL.template.md — contains company name, no unresolved placeholders', () => {
    const result = service.resolve('SOUL.template.md', SAMPLE_VARS);
    expect(result).toContain('Test Corp');
    expect(result).not.toContain('{{companyName}}');
    expect(result).not.toMatch(/\{\{[^}]+\}\}/);
  });

  it('should resolve GUARDRAILS.template.md — static, no placeholders', () => {
    const result = service.resolve('GUARDRAILS.template.md', SAMPLE_VARS);
    expect(result).toContain('GUARDRAILS');
    expect(result).not.toMatch(/\{\{[^}]+\}\}/);
  });

  it('should resolve FLOW.template.md — static, no placeholders', () => {
    const result = service.resolve('FLOW.template.md', SAMPLE_VARS);
    expect(result).toContain('Pipeline');
    expect(result).not.toMatch(/\{\{[^}]+\}\}/);
  });

  it('should resolve bootstrap.template.md — contains all company details', () => {
    const result = service.resolve('bootstrap.template.md', SAMPLE_VARS);
    expect(result).toContain('Test Corp');
    expect(result).toContain('Technology');
    expect(result).toContain('A test company');
    expect(result).not.toMatch(/\{\{[^}]+\}\}/);
  });

  // ── No hardcoded tenant IDs or IPs after resolution ──

  it('should not contain hardcoded tenant IDs or IPs after resolution', () => {
    const map = service.resolveAll(SAMPLE_VARS);
    for (const [filename, content] of map) {
      // Should not have hardcoded Hetzner IP anywhere
      expect(content).not.toContain('91.98.231.87');

      // TENANT-PROTOCOL has "NEVER reference … tnt_rljn1gj4cgxoph0hxfohv6l4" as a
      // guardrail instruction — that's intentional, not a leaked hardcode.
      // All other templates must not contain it.
      if (filename !== 'TENANT-PROTOCOL.md') {
        expect(content).not.toContain('tnt_rljn1gj4cgxoph0hxfohv6l4');
      }
    }
  });
});
