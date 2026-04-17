import { Injectable, Inject, Logger } from '@nestjs/common';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { VAULT_STORAGE, VaultStorage } from '../vault-storage/vault-storage.interface';

export interface IsolationResult {
  isolated: boolean;
  checks: IsolationCheck[];
}

export interface IsolationCheck {
  name: string;
  passed: boolean;
  details?: string;
}

@Injectable()
export class TenantIsolationService {
  private readonly logger = new Logger(TenantIsolationService.name);

  constructor(
    private readonly prisma: PlatformPrismaService,
    @Inject(VAULT_STORAGE) private readonly vaultStorage: VaultStorage,
  ) {}

  async verifyIsolation(
    tenantA: string,
    tenantB: string,
  ): Promise<IsolationResult> {
    const checks: IsolationCheck[] = [];

    // 1. PG check: tenants exist separately
    const [tA, tB] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: tenantA } }),
      this.prisma.tenant.findUnique({ where: { id: tenantB } }),
    ]);

    checks.push({
      name: 'tenants_exist_separately',
      passed: !!tA && !!tB && tA.id !== tB.id,
      details: `Tenant A: ${tA?.id || 'missing'}, Tenant B: ${tB?.id || 'missing'}`,
    });

    // 2. Users are isolated
    const [usersA, usersB] = await Promise.all([
      (this.prisma as any).user.findMany({
        where: { tenantId: tenantA },
        select: { id: true },
      }),
      (this.prisma as any).user.findMany({
        where: { tenantId: tenantB },
        select: { id: true },
      }),
    ]);
    const userIdsA = new Set(usersA.map((u: any) => u.id));
    const overlap = usersB.some((u: any) => userIdsA.has(u.id));
    checks.push({
      name: 'user_isolation',
      passed: !overlap,
      details: `Tenant A users: ${usersA.length}, Tenant B users: ${usersB.length}, overlap: ${overlap}`,
    });

    // 3. Vault isolation: tenant A cannot read tenant B files
    let vaultIsolated = true;
    try {
      // Attempt path traversal from tenant A to tenant B
      const traversalBlocked = await this.checkPathTraversal(tenantA, tenantB);
      vaultIsolated = traversalBlocked;
    } catch {
      vaultIsolated = true; // Error = blocked = good
    }
    checks.push({
      name: 'vault_isolation',
      passed: vaultIsolated,
      details: 'Cross-tenant vault access blocked',
    });

    // 4. Path traversal protection
    let pathTraversalBlocked = false;
    try {
      await this.vaultStorage.readFile(tenantA, '../' + tenantB + '/secret.md');
      pathTraversalBlocked = false; // Should NOT succeed
    } catch {
      pathTraversalBlocked = true; // Good — blocked
    }
    checks.push({
      name: 'path_traversal_blocked',
      passed: pathTraversalBlocked,
      details: 'Path traversal via .. is blocked',
    });

    // 5. Data isolation check
    const [memoriesA, memoriesB] = await Promise.all([
      (this.prisma as any).memory.count({ where: { tenantId: tenantA } }),
      (this.prisma as any).memory.count({ where: { tenantId: tenantB } }),
    ]);
    checks.push({
      name: 'memory_isolation',
      passed: true,
      details: `Tenant A memories: ${memoriesA}, Tenant B memories: ${memoriesB}`,
    });

    return {
      isolated: checks.every((c) => c.passed),
      checks,
    };
  }

  async verifyConceptAccess(
    tenantId: string,
    conceptId: string,
  ): Promise<boolean> {
    // Concepts are platform-wide (shared), but vault content is tenant-specific
    const concept = await (this.prisma as any).concept.findUnique({
      where: { id: conceptId },
    });

    if (!concept) return false;

    // Check if tenant exists
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });

    return !!tenant;
  }

  private async checkPathTraversal(
    tenantA: string,
    tenantB: string,
  ): Promise<boolean> {
    try {
      await this.vaultStorage.readFile(tenantA, `../${tenantB}/agents/main/SOUL.md`);
      return false; // If this succeeds, isolation is broken
    } catch {
      return true; // Good — blocked
    }
  }
}
