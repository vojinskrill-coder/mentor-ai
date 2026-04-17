import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { Client as SshClient } from 'ssh2';
import { readFileSync } from 'fs';
import { ContentValidationService } from '../content-validation/content-validation.service';

/**
 * TenantGuardService — validates tenant isolation at every critical point.
 * Used by: headless executor, onboarding, bridge controller, vault provisioner.
 *
 * Every function that touches tenant data MUST call these checks.
 */
@Injectable()
export class TenantGuardService {
  private readonly logger = new Logger(TenantGuardService.name);
  private readonly lsaTenantId: string;
  private readonly hetznerHost: string;
  private readonly sshKeyPath: string;

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly configService: ConfigService,
    private readonly contentValidation: ContentValidationService,
  ) {
    this.lsaTenantId = this.configService.get<string>('OPENCLAW_DEFAULT_TENANT_ID') ?? ''; // No default tenant — must be provided per request
    this.hetznerHost = this.configService.get<string>('HETZNER_HOST') ?? '91.98.231.87';
    this.sshKeyPath = this.configService.get<string>('HETZNER_SSH_KEY') ?? '';
  }

  /**
   * Validate tenantId is real and not accidentally the default LSA.
   * Returns { valid, error } — caller decides how to handle.
   */
  async validateTenantId(tenantId: string, context: string): Promise<{ valid: boolean; error?: string }> {
    if (!tenantId || tenantId.trim() === '') {
      return { valid: false, error: `${context}: tenantId is empty` };
    }

    // Check it exists in DB
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, name: true },
    });

    if (!tenant) {
      return { valid: false, error: `${context}: tenant ${tenantId} does not exist in DB` };
    }

    return { valid: true };
  }

  /**
   * Validate vault exists on relay for this tenant.
   * TODO: Migrate to VaultStorage when agent-level paths (agents/, tools/) are added to the interface.
   */
  async validateVaultExists(tenantId: string): Promise<{ valid: boolean; files: string[]; missing: string[] }> {
    const vaultPath = `/root/.openclaw-${tenantId}/vault`;
    const requiredFiles = [
      `${vaultPath}/SCHEMA.md`,
      `${vaultPath}/index.md`,
      `${vaultPath}/instructions/bootstrap.md`,
      `${vaultPath}/instructions/tenant-config.md`,
      `${vaultPath}/log.md`,
      `${vaultPath}/wikilink-map.md`,
      `${vaultPath}/GUARDRAILS.md`,
      `${vaultPath}/FLOW.md`,
      `/root/.openclaw-${tenantId}/agents/main/agent/SOUL.md`,
    ];

    const found: string[] = [];
    const missing: string[] = [];

    for (const f of requiredFiles) {
      try {
        const result = await this.sshExec(`test -s '${f}' && echo OK || echo MISSING`);
        if (result.trim() === 'OK') {
          found.push(f);
        } else {
          missing.push(f);
        }
      } catch {
        missing.push(f);
      }
    }

    return { valid: missing.length === 0, files: found, missing };
  }

  /**
   * Validate SOUL.md on relay contains correct tenant, not LSA.
   * TODO: Migrate to VaultStorage when agent-level paths (agents/main/agent/) are added to the interface.
   */
  async validateSoulMd(tenantId: string): Promise<{ valid: boolean; error?: string }> {
    try {
      const soulContent = await this.sshExec(
        `cat /root/.openclaw-${tenantId}/agents/main/agent/SOUL.md 2>/dev/null`
      );

      if (!soulContent || soulContent.length < 50) {
        return { valid: false, error: 'SOUL.md is empty or missing' };
      }

      if (soulContent.includes('Luxury Statues Adria') || soulContent.includes('LSA')) {
        return { valid: false, error: 'SOUL.md contains LSA references — wrong tenant config' };
      }

      if (!soulContent.includes('ENGLISH')) {
        return { valid: false, error: 'SOUL.md does not enforce English language' };
      }

      if (!soulContent.includes(tenantId)) {
        return { valid: false, error: `SOUL.md does not reference tenant ${tenantId}` };
      }

      return { valid: true };
    } catch (err) {
      return { valid: false, error: `SSH error reading SOUL.md: ${(err as Error).message}` };
    }
  }

  /**
   * Validate enriched content quality.
   * Delegates to the shared ContentValidationService.
   */
  validateContent(content: string): { valid: boolean; errors: string[] } {
    return this.contentValidation.validateContent(content);
  }

  /**
   * Validate workspace symlink exists for tenant.
   * TODO: Migrate to VaultStorage when workspace symlink management is added to the interface.
   */
  async validateWorkspaceSymlink(tenantId: string): Promise<boolean> {
    try {
      const result = await this.sshExec(
        `readlink /root/.openclaw/workspace/${tenantId}-vault 2>/dev/null || echo MISSING`
      );
      return result.trim() !== 'MISSING' && result.includes('vault');
    } catch {
      return false;
    }
  }

  /**
   * Full pre-enrichment validation — call before sending ANY task to OpenClaw.
   */
  async preEnrichmentCheck(tenantId: string): Promise<{ ready: boolean; errors: string[] }> {
    const errors: string[] = [];

    // 1. Tenant exists
    const tenantCheck = await this.validateTenantId(tenantId, 'pre-enrichment');
    if (!tenantCheck.valid) errors.push(tenantCheck.error!);

    // 2. Vault exists
    const vaultCheck = await this.validateVaultExists(tenantId);
    if (!vaultCheck.valid) errors.push(`Vault missing files: ${vaultCheck.missing.join(', ')}`);

    // 3. SOUL.md correct
    const soulCheck = await this.validateSoulMd(tenantId);
    if (!soulCheck.valid) errors.push(soulCheck.error!);

    // 4. Workspace symlink
    const symlinkOk = await this.validateWorkspaceSymlink(tenantId);
    if (!symlinkOk) errors.push('Workspace symlink missing');

    if (errors.length > 0) {
      this.logger.error({ message: 'Pre-enrichment validation FAILED', tenantId, errors });
    } else {
      this.logger.log({ message: 'Pre-enrichment validation passed', tenantId });
    }

    return { ready: errors.length === 0, errors };
  }

  private sshExec(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const conn = new SshClient();
      let output = '';
      conn.on('ready', () => {
        conn.exec(command, (err, stream) => {
          if (err) { conn.end(); return reject(err); }
          stream.on('data', (d: Buffer) => { output += d.toString(); });
          stream.stderr.on('data', () => {});
          stream.on('close', () => { conn.end(); resolve(output); });
        });
      });
      conn.on('error', reject);
      const config: Record<string, unknown> = {
        host: this.hetznerHost, port: 22, username: 'root',
      };
      if (this.sshKeyPath) {
        try { config['privateKey'] = readFileSync(this.sshKeyPath); } catch { return reject(new Error('SSH key not found')); }
      }
      conn.connect(config as any);
    });
  }
}
