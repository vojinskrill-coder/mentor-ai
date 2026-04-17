import { Injectable, Inject, Logger } from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { VAULT_STORAGE, VaultStorage } from '../vault-storage/vault-storage.interface';

// ── Types ──────────────────────────────────────────────────────

export interface VerificationCheck {
  check: string;
  passed: boolean;
  expected: any;
  actual: any;
  message: string;
}

export interface VerificationResult {
  verified: boolean;
  checks: VerificationCheck[];
  failures: VerificationCheck[];
}

// ── Service ────────────────────────────────────────────────────

@Injectable()
export class OnboardingVerificationService {
  private readonly logger = new Logger(OnboardingVerificationService.name);

  constructor(
    private readonly prisma: PlatformPrismaService,
    @Inject(VAULT_STORAGE) private readonly vaultStorage: VaultStorage,
  ) {}

  /**
   * Run all verification checks for a newly onboarded tenant.
   * Returns a detailed result with per-check pass/fail and messages.
   */
  async verifyTenantSetup(
    tenantId: string,
    expectedConceptCount: number,
  ): Promise<VerificationResult> {
    const checks: VerificationCheck[] = [];

    // PG checks
    checks.push(await this.checkConceptCount(tenantId, expectedConceptCount));
    checks.push(await this.checkConversationCount(tenantId, expectedConceptCount));
    checks.push(await this.checkNoteCount(tenantId, expectedConceptCount));

    // Vault file checks
    const requiredFiles = [
      'SCHEMA.md',
      'TENANT-PROTOCOL.md',
      'GUARDRAILS.md',
      'FLOW.md',
      'index.md',
      'log.md',
      'wikilink-map.md',
      'instructions/bootstrap.md',
      'instructions/tenant-config.md',
    ];
    for (const file of requiredFiles) {
      checks.push(await this.checkVaultFile(tenantId, file));
    }

    // SOUL.md check
    checks.push(await this.checkSoulMd(tenantId));

    const failures = checks.filter((c) => !c.passed);
    return {
      verified: failures.length === 0,
      checks,
      failures,
    };
  }

  // ── Private Check Methods ────────────────────────────────────

  private async checkConceptCount(
    tenantId: string,
    expected: number,
  ): Promise<VerificationCheck> {
    try {
      const count = await (this.prisma as any).concept.count({
        where: { tenantId },
      });
      return {
        check: 'concept_count',
        passed: count >= expected,
        expected,
        actual: count,
        message:
          count >= expected
            ? `Found ${count} concepts (expected >= ${expected})`
            : `Only ${count} concepts found (expected >= ${expected})`,
      };
    } catch (error) {
      return {
        check: 'concept_count',
        passed: false,
        expected,
        actual: null,
        message: `Failed to query concepts: ${(error as Error).message}`,
      };
    }
  }

  private async checkConversationCount(
    tenantId: string,
    expected: number,
  ): Promise<VerificationCheck> {
    try {
      const count = await (this.prisma as any).conversation.count({
        where: { tenantId },
      });
      return {
        check: 'conversation_count',
        passed: count >= expected,
        expected,
        actual: count,
        message:
          count >= expected
            ? `Found ${count} conversations (expected >= ${expected})`
            : `Only ${count} conversations found (expected >= ${expected})`,
      };
    } catch (error) {
      return {
        check: 'conversation_count',
        passed: false,
        expected,
        actual: null,
        message: `Failed to query conversations: ${(error as Error).message}`,
      };
    }
  }

  private async checkNoteCount(
    tenantId: string,
    expected: number,
  ): Promise<VerificationCheck> {
    try {
      const count = await (this.prisma as any).note.count({
        where: { tenantId },
      });
      return {
        check: 'note_count',
        passed: count >= expected,
        expected,
        actual: count,
        message:
          count >= expected
            ? `Found ${count} notes (expected >= ${expected})`
            : `Only ${count} notes found (expected >= ${expected})`,
      };
    } catch (error) {
      return {
        check: 'note_count',
        passed: false,
        expected,
        actual: null,
        message: `Failed to query notes: ${(error as Error).message}`,
      };
    }
  }

  private async checkVaultFile(
    tenantId: string,
    path: string,
  ): Promise<VerificationCheck> {
    try {
      const exists = await this.vaultStorage.fileExists(tenantId, path);
      if (!exists) {
        return {
          check: `vault_file:${path}`,
          passed: false,
          expected: 'file exists and non-empty',
          actual: 'file missing',
          message: `Vault file ${path} does not exist`,
        };
      }

      const content = await this.vaultStorage.readFile(tenantId, path);
      const nonEmpty = content.trim().length > 0;
      return {
        check: `vault_file:${path}`,
        passed: nonEmpty,
        expected: 'file exists and non-empty',
        actual: nonEmpty ? `${content.length} bytes` : 'empty file',
        message: nonEmpty
          ? `Vault file ${path} exists (${content.length} bytes)`
          : `Vault file ${path} exists but is empty`,
      };
    } catch (error) {
      return {
        check: `vault_file:${path}`,
        passed: false,
        expected: 'file exists and non-empty',
        actual: null,
        message: `Failed to check vault file ${path}: ${(error as Error).message}`,
      };
    }
  }

  private async checkSoulMd(tenantId: string): Promise<VerificationCheck> {
    try {
      const exists = await this.vaultStorage.fileExists(tenantId, 'SOUL.md');
      if (!exists) {
        return {
          check: 'soul_md',
          passed: false,
          expected: 'SOUL.md exists with correct tenantId and ENGLISH',
          actual: 'file missing',
          message: 'SOUL.md does not exist in vault',
        };
      }

      const content = await this.vaultStorage.readFile(tenantId, 'SOUL.md');
      const issues: string[] = [];

      if (!content.includes(tenantId)) {
        issues.push(`does not contain tenantId "${tenantId}"`);
      }

      if (!content.includes('ENGLISH')) {
        issues.push('does not contain "ENGLISH"');
      }

      // Check for hardcoded tenant IDs from other tenants
      const hardcodedIds = ['dev-tenant-001'];
      for (const hid of hardcodedIds) {
        if (hid !== tenantId && content.includes(hid)) {
          issues.push(`contains hardcoded tenant ID "${hid}"`);
        }
      }

      const passed = issues.length === 0;
      return {
        check: 'soul_md',
        passed,
        expected: 'SOUL.md exists with correct tenantId and ENGLISH',
        actual: passed ? 'valid' : issues.join('; '),
        message: passed
          ? 'SOUL.md is valid'
          : `SOUL.md validation failed: ${issues.join('; ')}`,
      };
    } catch (error) {
      return {
        check: 'soul_md',
        passed: false,
        expected: 'SOUL.md exists with correct tenantId and ENGLISH',
        actual: null,
        message: `Failed to check SOUL.md: ${(error as Error).message}`,
      };
    }
  }
}
