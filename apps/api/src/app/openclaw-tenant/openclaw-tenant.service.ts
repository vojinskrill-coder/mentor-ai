import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'ssh2';
import { readFileSync } from 'fs';
import type { GeneratedSouls } from './soul-generator.service';
import type { BusinessProfile } from './business-profile.service';

const AGENTS = ['main', 'financial', 'marketing', 'content', 'sales'] as const;

@Injectable()
export class OpenClawTenantService {
  private readonly logger = new Logger(OpenClawTenantService.name);
  private readonly hetznerHost: string;
  private readonly hetznerUser: string;
  private readonly sshKeyPath: string;
  private readonly baseProfile: string;

  constructor(private readonly configService: ConfigService) {
    this.hetznerHost = this.configService.get<string>('HETZNER_HOST') ?? '91.98.231.87';
    this.hetznerUser = this.configService.get<string>('HETZNER_USER') ?? 'root';
    this.sshKeyPath = this.configService.get<string>('HETZNER_SSH_KEY') ?? '';
    this.baseProfile = '/root/.openclaw'; // Base config to copy from
  }

  /**
   * Provision a new OpenClaw tenant profile on Hetzner.
   * Creates isolated directory, copies base config, writes custom SOUL.MD files.
   */
  async provisionTenant(
    tenantId: string,
    profile: BusinessProfile,
    souls: GeneratedSouls,
  ): Promise<{ success: boolean; profilePath: string; error?: string }> {
    const profilePath = `/root/.openclaw-${tenantId}`;

    this.logger.log({ message: 'Provisioning OpenClaw tenant', tenantId, profilePath });

    try {
      // Step 1: Create profile directory structure
      await this.sshExec(`mkdir -p ${profilePath}`);

      // Step 2: Copy base config (same LLM, tools, API keys)
      await this.sshExec(`cp ${this.baseProfile}/openclaw.json ${profilePath}/openclaw.json`);

      // Step 3: Create agent directories and write SOUL.MD files
      for (const agent of AGENTS) {
        const agentDir = `${profilePath}/agents/${agent}/agent`;
        await this.sshExec(`mkdir -p ${agentDir}`);

        const soulContent = souls[agent as keyof GeneratedSouls];
        if (soulContent) {
          // Write SOUL.MD via heredoc to handle special characters
          await this.sshExec(
            `cat > ${agentDir}/SOUL.md << 'SOUL_EOF'\n${soulContent}\nSOUL_EOF`
          );
        }
      }

      // Step 4: Verify with a test command
      const testResult = await this.sshExec(
        `ls ${profilePath}/agents/*/agent/SOUL.md 2>/dev/null | wc -l`
      );
      const soulCount = parseInt(testResult.trim(), 10);

      if (soulCount < AGENTS.length) {
        this.logger.warn({
          message: 'Not all SOUL.MD files written',
          expected: AGENTS.length,
          found: soulCount,
          tenantId,
        });
      }

      this.logger.log({
        message: 'Tenant provisioned successfully',
        tenantId,
        profilePath,
        soulFiles: soulCount,
      });

      return { success: true, profilePath };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown';
      this.logger.error({ message: 'Tenant provisioning failed', tenantId, error: errorMsg });
      return { success: false, profilePath, error: errorMsg };
    }
  }

  /**
   * Update a single agent's SOUL.MD for a tenant.
   */
  async updateSoul(tenantId: string, agentType: string, soulContent: string): Promise<void> {
    const soulPath = `/root/.openclaw-${tenantId}/agents/${agentType}/agent/SOUL.md`;
    await this.sshExec(`cat > ${soulPath} << 'SOUL_EOF'\n${soulContent}\nSOUL_EOF`);
    this.logger.log({ message: 'SOUL.MD updated', tenantId, agentType });
  }

  /**
   * Check if a tenant profile exists on Hetzner.
   */
  async tenantExists(tenantId: string): Promise<boolean> {
    try {
      const result = await this.sshExec(`test -d /root/.openclaw-${tenantId} && echo yes || echo no`);
      return result.trim() === 'yes';
    } catch {
      return false;
    }
  }

  /**
   * Delete a tenant profile (for cleanup).
   */
  async deleteTenant(tenantId: string): Promise<void> {
    await this.sshExec(`rm -rf /root/.openclaw-${tenantId}`);
    this.logger.log({ message: 'Tenant profile deleted', tenantId });
  }

  /**
   * Execute a command on Hetzner via SSH.
   */
  private sshExec(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      let output = '';

      const connectConfig: Record<string, unknown> = {
        host: this.hetznerHost,
        port: 22,
        username: this.hetznerUser,
        readyTimeout: 10_000,
      };

      // Use SSH key from env, or fallback to SSH agent
      if (this.sshKeyPath) {
        try {
          connectConfig['privateKey'] = readFileSync(this.sshKeyPath);
        } catch {
          // Fallback to agent
          connectConfig['agent'] = process.env['SSH_AUTH_SOCK'];
        }
      } else {
        connectConfig['agent'] = process.env['SSH_AUTH_SOCK'];
      }

      conn.on('ready', () => {
        conn.exec(command, (err, stream) => {
          if (err) {
            conn.end();
            return reject(err);
          }

          stream.on('data', (data: Buffer) => {
            output += data.toString();
          });

          stream.stderr.on('data', (data: Buffer) => {
            // Log stderr but don't fail
            const errText = data.toString().trim();
            if (errText) {
              this.logger.debug({ message: 'SSH stderr', output: errText.substring(0, 200) });
            }
          });

          stream.on('close', (code: number) => {
            conn.end();
            if (code !== 0 && code !== null) {
              reject(new Error(`SSH command exited with code ${code}: ${output.substring(0, 200)}`));
            } else {
              resolve(output);
            }
          });
        });
      });

      conn.on('error', (err) => {
        reject(new Error(`SSH connection failed: ${err.message}`));
      });

      conn.connect(connectConfig as any);
    });
  }
}
