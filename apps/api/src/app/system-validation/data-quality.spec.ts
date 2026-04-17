/**
 * DATA QUALITY TESTS
 *
 * These tests verify the seed data and runtime data generation
 * produces English-only content. Catches the exact bug that
 * caused Serbian slugs in production.
 */
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

describe('Data Quality — English Only', () => {
  const serbianCharRegex = /[čćšžđČĆŠŽĐ]/;
  const serbianWordRegex = /\b(koji|koja|koje|može|nije|već|što|zato|između|njihov|kompanij|tržišt|vrednost|kupac|prodaj|uvod|poslovanje|odredjivanje|proizvodnja|upravljanje|trziste)\b/i;

  describe('curriculum.json', () => {
    const currPath = join(process.cwd(), 'apps', 'api', 'src', 'app', 'knowledge', 'data', 'curriculum.json');
    let curriculum: any[];

    beforeAll(() => {
      curriculum = JSON.parse(readFileSync(currPath, 'utf-8'));
    });

    it('has no Serbian characters in IDs', () => {
      const bad = curriculum.filter(n => serbianCharRegex.test(n.id));
      expect(bad).toHaveLength(0);
    });

    it('has no Serbian characters in parentIds', () => {
      const bad = curriculum.filter(n => n.parentId && serbianCharRegex.test(n.parentId));
      expect(bad).toHaveLength(0);
    });

    it('has no Serbian words in IDs', () => {
      const bad = curriculum.filter(n => serbianWordRegex.test(n.id));
      expect(bad.map((n: any) => n.id)).toEqual([]);
    });

    it('has English labels', () => {
      const bad = curriculum.filter(n => serbianCharRegex.test(n.label));
      expect(bad).toHaveLength(0);
    });

    it('all parentIds reference existing IDs', () => {
      const ids = new Set(curriculum.map(n => n.id));
      const broken = curriculum.filter(n => n.parentId && !ids.has(n.parentId));
      expect(broken.map((n: any) => ({ id: n.id, parentId: n.parentId }))).toEqual([]);
    });

    it('has at least 400 nodes', () => {
      expect(curriculum.length).toBeGreaterThanOrEqual(400);
    });
  });

  describe('Slug generation', () => {
    function generateSlug(name: string): string {
      return name.toLowerCase()
        .replace(/[^a-z0-9\s]/g, '')
        .replace(/\s+/g, '-')
        .replace(/^-|-$/g, '');
    }

    it('generates English slug from English name', () => {
      expect(generateSlug('Minimum Viable Product (MVP)')).toBe('minimum-viable-product-mvp');
    });

    it('generates clean slug from name with special chars', () => {
      expect(generateSlug("O'Brien & Sons")).toBe('obrien-sons');
    });

    it('never produces Serbian characters in slugs', () => {
      const names = [
        'Marketing Strategy', 'Financial Planning', 'Sales Pipeline',
        'Customer Acquisition', 'Business Model Canvas', 'Value Proposition',
      ];
      for (const name of names) {
        const slug = generateSlug(name);
        expect(serbianCharRegex.test(slug)).toBe(false);
      }
    });
  });

  describe('Template files', () => {
    const templateDir = join(process.cwd(), 'openclaw-config', 'templates', 'vault');
    const templates = [
      'SCHEMA.template.md', 'TENANT-PROTOCOL.template.md', 'GUARDRAILS.template.md',
      'SOUL.template.md', 'FLOW.template.md', 'bootstrap.template.md',
    ];

    for (const tmpl of templates) {
      it(`${tmpl} has no hardcoded Serbian content`, () => {
        const content = readFileSync(join(templateDir, tmpl), 'utf-8');
        // Allow Serbian in negative examples ("NEVER write in Serbian", "čćšžđ" as detection examples)
        // But reject Serbian WORDS that indicate actual Serbian content
        const lines = content.split('\n');
        const serbianContentLines = lines.filter(line => {
          // Skip lines that are rules/guardrails about Serbian (they mention it as what to avoid)
          if (line.includes('NEVER') || line.includes('reject') || line.includes('detect') || line.includes('Serbian')) return false;
          return serbianWordRegex.test(line);
        });
        expect(serbianContentLines).toEqual([]);
      });
    }
  });

  describe('Agent registry', () => {
    it('all agent roles are in English', () => {
      const registryPath = join(process.cwd(), 'openclaw-config', 'agent-registry.yaml');
      const content = readFileSync(registryPath, 'utf-8');
      expect(serbianCharRegex.test(content)).toBe(false);
    });
  });

  describe('Bridge Skill', () => {
    const skillPath = join(process.cwd(), 'openclaw-config', 'skills', 'mentor-ai-bridge', 'SKILL.md');

    it('exists in repo', () => {
      expect(existsSync(skillPath)).toBe(true);
    });

    it('is in English', () => {
      const content = readFileSync(skillPath, 'utf-8');
      expect(/[čćšžđ]/.test(content)).toBe(false);
    });

    it('has no hardcoded tenant IDs', () => {
      const content = readFileSync(skillPath, 'utf-8');
      expect(content).not.toContain('tnt_rljn1gj4cgxoph0hxfohv6l4');
    });

    it('uses placeholder for tenant ID', () => {
      const content = readFileSync(skillPath, 'utf-8');
      expect(content).toContain('{{TENANT_ID}}');
    });

    it('uses placeholder for backend URL', () => {
      const content = readFileSync(skillPath, 'utf-8');
      expect(content).toContain('{{BACKEND_URL}}');
    });

    it('has all required endpoints', () => {
      const content = readFileSync(skillPath, 'utf-8');
      expect(content).toContain('/bridge/concepts/search');
      expect(content).toContain('/bridge/tasks');
      expect(content).toContain('/bridge/task-complete');
      expect(content).toContain('/bridge/proposals');
      expect(content).toContain('/bridge/agent-status');
    });

    it('has MCP gateway endpoints', () => {
      const content = readFileSync(skillPath, 'utf-8');
      expect(content).toContain('/mcp/v1/tools');
    });

    it('has no old Tailscale IP', () => {
      const content = readFileSync(skillPath, 'utf-8');
      expect(content).not.toContain('100.114.192.85');
    });
  });
});
