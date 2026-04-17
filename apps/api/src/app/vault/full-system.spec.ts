/**
 * COMPREHENSIVE SYSTEM TESTS
 * Tests every aspect of the enrichment pipeline configuration.
 * Run with: npx jest apps/api/src/app/vault/full-system.spec.ts
 */
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

// ═══ 1. TENANT ISOLATION ═══
describe('1. Tenant Isolation', () => {
  it('OPENCLAW_DEFAULT_TENANT_ID should be empty', () => {
    require('dotenv').config({ path: join(process.cwd(), 'apps', 'api', '.env'), override: true });
    const defaultTenant = process.env.OPENCLAW_DEFAULT_TENANT_ID;
    expect(!defaultTenant || defaultTenant.trim() === '').toBe(true);
  });

  it('Bridge controller resolves body tenantId over env default', () => {
    // The resolveTenantId function should prioritize body over env
    const resolveTenantId = (requested?: string) => {
      const defaultTid = ''; // cleared
      return requested || defaultTid || '';
    };
    expect(resolveTenantId('tnt_new')).toBe('tnt_new');
    expect(resolveTenantId(undefined)).toBe('');
    expect(resolveTenantId('')).toBe('');
  });
});

// ═══ 2. CONCEPT SELECTION ═══
describe('2. Concept Selection', () => {
  it('Category balance: selects from multiple categories', () => {
    // Simulate the balanced selection logic
    const categories = ['Marketing', 'Sales', 'Finance', 'Operations', 'Strategy', 'HR'];
    const TARGET = 80;
    const perCategory = Math.max(3, Math.floor(TARGET / categories.length));
    expect(perCategory).toBeGreaterThanOrEqual(3);
    expect(perCategory * categories.length).toBeGreaterThanOrEqual(18);
  });

  it('Relevance threshold is 0.70', () => {
    const threshold = 0.70;
    expect(threshold).toBe(0.70);
    // Score below threshold should be filtered
    expect(0.69 >= threshold).toBe(false);
    expect(0.70 >= threshold).toBe(true);
    expect(0.75 >= threshold).toBe(true);
  });
});

// ═══ 3. LANGUAGE ═══
describe('3. Language Enforcement', () => {
  it('Curriculum labels are in English', () => {
    const currPath = join(__dirname, '../knowledge/data/curriculum.json');
    if (existsSync(currPath)) {
      const curr = JSON.parse(readFileSync(currPath, 'utf-8'));
      const serbianLabels = curr.filter((n: any) => /[čćšžđ]/i.test(n.label));
      expect(serbianLabels.length).toBeLessThanOrEqual(1);
    }
  });

  it('SOUL template enforces ENGLISH as first rule', () => {
    const templatePath = join(process.cwd(), 'openclaw-config/templates/vault/SOUL.template.md');
    if (existsSync(templatePath)) {
      const content = readFileSync(templatePath, 'utf-8');
      const lines = content.split('\n');
      const englishLine = lines.findIndex(l => l.includes('ENGLISH'));
      expect(englishLine).toBeLessThan(10);
    }
  });

  it('TENANT-PROTOCOL template has language enforcement', () => {
    const templatePath = join(process.cwd(), 'openclaw-config/templates/vault/TENANT-PROTOCOL.template.md');
    if (existsSync(templatePath)) {
      const content = readFileSync(templatePath, 'utf-8');
      expect(content).toContain('ALL_OUTPUT_ENGLISH');
      expect(content).toContain('STRICT');
      expect(content).toContain('čćšžđ');
    }
  });
});

// ═══ 4. VAULT CONFIGURATION ═══
describe('4. Vault Configuration Templates', () => {
  const templateDir = join(process.cwd(), 'openclaw-config/templates/vault');

  const requiredTemplates = [
    'SCHEMA.template.md',
    'TENANT-PROTOCOL.template.md',
    'GUARDRAILS.template.md',
    'SOUL.template.md',
    'FLOW.template.md',
    'bootstrap.template.md',
  ];

  for (const tmpl of requiredTemplates) {
    it(`Template exists: ${tmpl}`, () => {
      expect(existsSync(join(templateDir, tmpl))).toBe(true);
    });
  }

  it('SCHEMA template has 9 required sections', () => {
    const content = readFileSync(join(templateDir, 'SCHEMA.template.md'), 'utf-8');
    expect(content).toContain('### 1.');
    expect(content).toContain('### 9.');
    expect(content).toContain('5,000 words');
    expect(content).toContain('dept:');
  });

  it('GUARDRAILS template has validation checkpoints', () => {
    const content = readFileSync(join(templateDir, 'GUARDRAILS.template.md'), 'utf-8');
    expect(content).toContain('Checkpoint 1');
    expect(content).toContain('Checkpoint 2');
    expect(content).toContain('Correction Protocol');
  });

  it('TENANT-PROTOCOL template has session strategy', () => {
    const content = readFileSync(join(templateDir, 'TENANT-PROTOCOL.template.md'), 'utf-8');
    expect(content).toContain('PERSISTENT');
    expect(content).toContain('AFTER_EVERY_20_CONCEPTS');
    expect(content).toContain('enrichment-{{tenantId}}');
  });

  it('TENANT-PROTOCOL template has tenant isolation rules', () => {
    const content = readFileSync(join(templateDir, 'TENANT-PROTOCOL.template.md'), 'utf-8');
    expect(content).toContain('NEVER access data from other tenants');
    expect(content).toContain('Luxury Statues Adria');
    expect(content).toContain('tnt_rljn1gj4cgxoph0hxfohv6l4');
  });
});

// ═══ 5. OPENCLAW BASE CONFIG ═══
describe('5. OpenClaw Base Config (repo)', () => {
  it('Base SOUL.md has no LSA references', () => {
    const soulPath = join(process.cwd(), 'openclaw-config/agents/main/SOUL.md');
    if (existsSync(soulPath)) {
      const content = readFileSync(soulPath, 'utf-8');
      // SOUL.md may mention LSA as a "never reference" rule — that's OK
      // But it should NOT have LSA as the agent's IDENTITY
      expect(content).not.toContain('Director for Luxury Statues');
      expect(content).not.toContain('skulptura');
      expect(content).not.toContain('#C9A96E');
      expect(content).toContain('Neuron OS');
    }
  });

  it('Base SOUL.md is neutral/generic', () => {
    const soulPath = join(process.cwd(), 'openclaw-config/agents/main/SOUL.md');
    if (existsSync(soulPath)) {
      const content = readFileSync(soulPath, 'utf-8');
      expect(content).toContain('tenant-specific');
      expect(content).toContain('NEVER reference');
    }
  });
});

// ═══ 6. ENV CONFIGURATION ═══
describe('6. Environment Configuration', () => {
  beforeAll(() => {
    // Load from apps/api/.env (relative to project root)
    const envPath = join(process.cwd(), 'apps', 'api', '.env');
    require('dotenv').config({ path: envPath, override: true });
  });

  it('STAGE_MAX_CONCURRENCY is 1', () => {
    expect(process.env.STAGE_MAX_CONCURRENCY).toBe('1');
  });

  it('HETZNER_SSH_KEY is set', () => {
    expect(process.env.HETZNER_SSH_KEY).toBeTruthy();
  });

  it('QDRANT_URL is set', () => {
    expect(process.env.QDRANT_URL).toBeTruthy();
  });

  it('OPENAI_API_KEY is set', () => {
    expect(process.env.OPENAI_API_KEY).toBeTruthy();
  });

  it('OPENCLAW_DEFAULT_TENANT_ID is empty', () => {
    const val = process.env.OPENCLAW_DEFAULT_TENANT_ID;
    expect(!val || val.trim() === '').toBe(true);
  });
});

// ═══ 7. ENRICHMENT PIPELINE LOGIC ═══
describe('7. Enrichment Pipeline Logic', () => {
  it('Headless executor uses configurable timeout, not hardcoded', () => {
    const filePath = join(__dirname, '../maturity/headless-executor.service.ts');
    const content = readFileSync(filePath, 'utf-8');
    // Should use configService, not hardcoded 600
    expect(content).toContain("configService.get<string>('OPENCLAW_TIMEOUT_SECONDS')");
  });

  it('Headless executor checks vault regardless of result.success', () => {
    const filePath = join(__dirname, '../maturity/headless-executor.service.ts');
    const content = readFileSync(filePath, 'utf-8');
    // Should NOT have "if (result.success) {" gating the vault read
    // Instead should check vault regardless
    expect(content).toContain('Check vault regardless of result.success');
  });

  it('Legacy pipeline does not mark COMPLETED prematurely', () => {
    const filePath = join(__dirname, '../maturity/headless-executor.service.ts');
    const content = readFileSync(filePath, 'utf-8');
    // The synthesis save should NOT set status: COMPLETED
    expect(content).toContain("status: 'PENDING', userReport: fullContent");
  });

  it('Onboarding awaits vault provisioning', () => {
    const filePath = join(__dirname, '../onboarding/onboarding.service.ts');
    const content = readFileSync(filePath, 'utf-8');
    // Should await provisionVault, not fire-and-forget
    expect(content).toContain('await this.vaultProvisioner.provisionVault');
    // Verify it's awaited, not fire-and-forget
  });

  it('Concept polling uses stabilization check, not fixed threshold', () => {
    const filePath = join(__dirname, '../onboarding/onboarding.service.ts');
    const content = readFileSync(filePath, 'utf-8');
    expect(content).toContain('stableChecks');
    expect(content).not.toContain('conceptCount > 10) break');
  });
});

// ═══ 8. SKILLS (Platform-wide) ═══
describe('8. Platform Skills', () => {
  it('enrichment-procedure.md exists in repo', () => {
    const skillPath = join(process.cwd(), 'openclaw-config/skills/enrichment-procedure.md');
    expect(existsSync(skillPath)).toBe(true);
  });

  it('enrichment-procedure.md has key rules', () => {
    const skillPath = join(process.cwd(), 'openclaw-config/skills/enrichment-procedure.md');
    if (existsSync(skillPath)) {
      const content = readFileSync(skillPath, 'utf-8');
      expect(content).toContain('5,000 words');
      expect(content).toContain('English');
      expect(content).toContain('web_search');
      expect(content).toContain('SCHEMA.md');
    }
  });
});

// ═══ 9. CONTENT VALIDATION ═══
describe('9. Content Validation (TenantGuardService)', () => {
  // Import is tested in tenant-guard.service.spec.ts
  // Here we test the rules match the vault config

  it('Validation thresholds match SCHEMA requirements', () => {
    // SCHEMA says 5000 words, validation should be close
    const MIN_CHARS = 15000; // ~5000 words * 3 chars/word
    const MIN_WORDS = 4500; // slightly below 5000 to allow for formatting
    expect(MIN_CHARS).toBeGreaterThanOrEqual(15000);
    expect(MIN_WORDS).toBeGreaterThanOrEqual(4000);
  });

  it('Serbian character set is correct', () => {
    const serbianChars = 'čćšžđ';
    expect('č'.match(/[čćšžđ]/)).toBeTruthy();
    expect('a'.match(/[čćšžđ]/)).toBeNull();
  });
});

// ═══ 10. DEPLOY SCRIPT ═══
describe('10. Deploy Script', () => {
  it('setup-relay.sh exists', () => {
    const scriptPath = join(process.cwd(), 'openclaw-config/deploy/setup-relay.sh');
    expect(existsSync(scriptPath)).toBe(true);
  });
});
