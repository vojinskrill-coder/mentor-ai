import { Test } from '@nestjs/testing';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { VAULT_STORAGE } from '../vault-storage/vault-storage.interface';
import {
  OnboardingVerificationService,
  VerificationResult,
} from './onboarding-verification.service';

// ── Mocks ──────────────────────────────────────────────────────

function createMockPrisma() {
  return {
    concept: {
      count: jest.fn().mockResolvedValue(10),
    },
    conversation: {
      count: jest.fn().mockResolvedValue(10),
    },
    note: {
      count: jest.fn().mockResolvedValue(10),
    },
  };
}

function createMockVault() {
  return {
    fileExists: jest.fn().mockResolvedValue(true),
    readFile: jest.fn().mockResolvedValue('non-empty content'),
    writeFile: jest.fn(),
    listFiles: jest.fn(),
    writeFiles: jest.fn(),
    createDirectories: jest.fn(),
  };
}

const TENANT_ID = 'test-tenant-001';
const EXPECTED_COUNT = 10;

// Valid SOUL.md content
const VALID_SOUL = `# SOUL Configuration
Tenant: test-tenant-001
Language: ENGLISH
Some other content here.`;

describe('OnboardingVerificationService', () => {
  let service: OnboardingVerificationService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let mockVault: ReturnType<typeof createMockVault>;

  beforeEach(async () => {
    mockPrisma = createMockPrisma();
    mockVault = createMockVault();

    // Default: SOUL.md returns valid content
    mockVault.readFile.mockImplementation((_tid: string, path: string) => {
      if (path === 'SOUL.md') return Promise.resolve(VALID_SOUL);
      return Promise.resolve('non-empty content');
    });

    const module = await Test.createTestingModule({
      providers: [
        OnboardingVerificationService,
        { provide: PlatformPrismaService, useValue: mockPrisma },
        { provide: VAULT_STORAGE, useValue: mockVault },
      ],
    }).compile();

    service = module.get(OnboardingVerificationService);
  });

  // ── All Passing ──────────────────────────────────────────────

  it('passes when all checks pass', async () => {
    const result = await service.verifyTenantSetup(TENANT_ID, EXPECTED_COUNT);

    expect(result.verified).toBe(true);
    expect(result.failures).toHaveLength(0);
    // 3 PG checks + 9 vault files + 1 SOUL.md = 13 checks
    expect(result.checks).toHaveLength(13);
  });

  // ── Concept Count ────────────────────────────────────────────

  it('fails when concept count is 0', async () => {
    mockPrisma.concept.count.mockResolvedValue(0);

    const result = await service.verifyTenantSetup(TENANT_ID, EXPECTED_COUNT);

    expect(result.verified).toBe(false);
    const conceptFailure = result.failures.find((f) => f.check === 'concept_count');
    expect(conceptFailure).toBeDefined();
    expect(conceptFailure!.passed).toBe(false);
    expect(conceptFailure!.actual).toBe(0);
    expect(conceptFailure!.expected).toBe(EXPECTED_COUNT);
  });

  // ── Vault File Missing ───────────────────────────────────────

  it('fails when vault file missing (fileExists returns false)', async () => {
    mockVault.fileExists.mockImplementation((_tid: string, path: string) => {
      if (path === 'SCHEMA.md') return Promise.resolve(false);
      return Promise.resolve(true);
    });

    const result = await service.verifyTenantSetup(TENANT_ID, EXPECTED_COUNT);

    expect(result.verified).toBe(false);
    const fileFailure = result.failures.find(
      (f) => f.check === 'vault_file:SCHEMA.md',
    );
    expect(fileFailure).toBeDefined();
    expect(fileFailure!.passed).toBe(false);
    expect(fileFailure!.message).toContain('does not exist');
  });

  // ── SOUL.md Wrong Tenant ─────────────────────────────────────

  it('fails when SOUL.md has wrong tenantId', async () => {
    mockVault.readFile.mockImplementation((_tid: string, path: string) => {
      if (path === 'SOUL.md') {
        return Promise.resolve('Tenant: other-tenant-999\nLanguage: ENGLISH');
      }
      return Promise.resolve('non-empty content');
    });

    const result = await service.verifyTenantSetup(TENANT_ID, EXPECTED_COUNT);

    expect(result.verified).toBe(false);
    const soulFailure = result.failures.find((f) => f.check === 'soul_md');
    expect(soulFailure).toBeDefined();
    expect(soulFailure!.passed).toBe(false);
    expect(soulFailure!.message).toContain('tenantId');
  });

  // ── SOUL.md Missing ENGLISH ──────────────────────────────────

  it("fails when SOUL.md doesn't contain ENGLISH", async () => {
    mockVault.readFile.mockImplementation((_tid: string, path: string) => {
      if (path === 'SOUL.md') {
        return Promise.resolve(`Tenant: ${TENANT_ID}\nLanguage: SERBIAN`);
      }
      return Promise.resolve('non-empty content');
    });

    const result = await service.verifyTenantSetup(TENANT_ID, EXPECTED_COUNT);

    expect(result.verified).toBe(false);
    const soulFailure = result.failures.find((f) => f.check === 'soul_md');
    expect(soulFailure).toBeDefined();
    expect(soulFailure!.passed).toBe(false);
    expect(soulFailure!.message).toContain('ENGLISH');
  });

  // ── Failure Details ──────────────────────────────────────────

  it('failure result includes specific check name and details', async () => {
    mockPrisma.concept.count.mockResolvedValue(0);
    mockPrisma.conversation.count.mockResolvedValue(0);

    const result = await service.verifyTenantSetup(TENANT_ID, EXPECTED_COUNT);

    expect(result.verified).toBe(false);
    expect(result.failures.length).toBeGreaterThanOrEqual(2);

    for (const failure of result.failures) {
      expect(failure.check).toBeDefined();
      expect(failure.check.length).toBeGreaterThan(0);
      expect(failure.passed).toBe(false);
      expect(failure.message).toBeDefined();
      expect(failure.message.length).toBeGreaterThan(0);
    }
  });

  // ── Checks Count ─────────────────────────────────────────────

  it('checks count matches expected for each type', async () => {
    const result = await service.verifyTenantSetup(TENANT_ID, EXPECTED_COUNT);

    const pgChecks = result.checks.filter(
      (c) =>
        c.check === 'concept_count' ||
        c.check === 'conversation_count' ||
        c.check === 'note_count',
    );
    expect(pgChecks).toHaveLength(3);

    const vaultChecks = result.checks.filter((c) =>
      c.check.startsWith('vault_file:'),
    );
    expect(vaultChecks).toHaveLength(9);

    const soulChecks = result.checks.filter((c) => c.check === 'soul_md');
    expect(soulChecks).toHaveLength(1);
  });
});
