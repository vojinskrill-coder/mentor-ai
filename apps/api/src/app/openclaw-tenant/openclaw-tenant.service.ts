import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'ssh2';
import { readFileSync } from 'fs';
import type { GeneratedSouls } from './soul-generator.service';
import type { BusinessProfile } from './business-profile.service';

const AGENTS = ['main', 'financial', 'marketing', 'content', 'sales', 'research', 'designer', 'dev'] as const;

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
   * Write USER.md with full tenant business profile.
   * Called after onboarding completion to give OpenClaw full business context.
   */
  async writeUserMd(tenantId: string, profile: {
    companyName: string;
    industry: string;
    description?: string;
    websiteUrl?: string;
    businessState?: string;
    departments?: string[];
    userRole?: string;
    strategy?: string;
    executionMode?: string;
    onboardingOutput?: string;
    pdfExtract?: string;
    crawledProfile?: string;
  }): Promise<void> {
    const userMd = `# USER.md — ${profile.companyName}

## Profil Kompanije
- **Ime**: ${profile.companyName}
- **Industrija**: ${profile.industry}
- **Opis**: ${profile.description ?? 'Nije dostupno'}
- **Website**: ${profile.websiteUrl ?? 'Nije dostupno'}
- **Trenutno stanje**: ${profile.businessState ?? 'Nije dostupno'}

## Organizacija
- **Departmani**: ${profile.departments?.join(', ') ?? 'Nije definisano'}
- **Uloga vlasnika**: ${profile.userRole ?? 'OWNER'}
- **Strategija**: ${profile.strategy ?? 'Nije definisana'}
- **Režim rada**: ${profile.executionMode ?? 'MANUAL'}

${profile.crawledProfile ? `## Web Profil\n${profile.crawledProfile}\n` : ''}
${profile.onboardingOutput ? `## Onboarding Analiza\n${profile.onboardingOutput}\n` : ''}
${profile.pdfExtract ? `## Brošura (izvod)\n${profile.pdfExtract}\n` : ''}
`;

    const userMdPath = `/root/.openclaw-${tenantId}/agents/main/agent/USER.md`;
    await this.sshExec(`cat > ${userMdPath} << 'USER_EOF'\n${userMd}\nUSER_EOF`);
    this.logger.log({ message: 'USER.md written', tenantId });
  }

  /**
   * Write AGENTS.md with mentor-ai-bridge usage instructions for the director agent.
   */
  async writeAgentsMd(tenantId: string, bridgeBaseUrl: string): Promise<void> {
    const agentsMd = `# AGENTS.md — Mentor AI Bridge Instructions

## Bridge API
Base URL: ${bridgeBaseUrl}
Auth: Bearer token in Authorization header

## Available Tools (via mentor-ai-bridge skill)

### Read Operations
- \`get_brain_state\` → GET /bridge/brain-state?tenantId=${tenantId}
- \`search_concepts\` → GET /bridge/concepts/search?q=...&tenantId=${tenantId}
- \`get_concept\` → GET /bridge/concepts/:id
- \`get_pending\` → GET /bridge/concepts/pending?tenantId=${tenantId}
- \`get_categories\` → GET /bridge/categories
- \`get_context\` → GET /bridge/context/${tenantId}
- \`get_budget\` → GET /bridge/budget/${tenantId}
- \`get_proposals\` → GET /bridge/proposals?tenantId=${tenantId}

### Write Operations
- \`create_proposal\` → POST /bridge/proposals
- \`create_concept\` → POST /bridge/concepts
- \`create_conversation\` → POST /bridge/conversations
- \`create_task\` → POST /bridge/tasks
- \`add_contribution\` → POST /bridge/task-contribution
- \`update_progress\` → POST /bridge/task-progress
- \`complete_task\` → POST /bridge/task-complete
- \`update_agent_status\` → POST /bridge/agent-status
- \`create_memory\` → POST /bridge/memories
- \`update_brain_state\` → POST /bridge/brain-state

## Rules
- Always include tenantId: "${tenantId}" in all requests
- Check budget before spawning agents
- Create proposals instead of acting directly (unless user approved)
- Report agent status changes for real-time UI updates
- Structure task results with ## headings for PDF export compatibility
`;

    const agentsMdPath = `/root/.openclaw-${tenantId}/agents/main/agent/AGENTS.md`;
    await this.sshExec(`cat > ${agentsMdPath} << 'AGENTS_EOF'\n${agentsMd}\nAGENTS_EOF`);
    this.logger.log({ message: 'AGENTS.md written', tenantId });
  }

  /**
   * Read a file from the OpenClaw workspace as a Buffer.
   * Uses base64 encoding over SSH for binary-safe transfer.
   * Path is strictly validated before execution.
   */
  async readFile(filePath: string): Promise<Buffer> {
    // Strict path whitelist: tenant workspace OR shared workspace deliverables
    const isTenantPath = /^\/root\/\.openclaw-[a-z0-9_-]+\/[a-zA-Z0-9_./-]+$/.test(filePath);
    const isSharedDeliverable = /^\/root\/\.openclaw\/workspace\/deliverables\/[a-zA-Z0-9_./-]+$/.test(filePath);
    if (!isTenantPath && !isSharedDeliverable) {
      throw new Error(`Invalid file path: ${filePath}`);
    }

    // Use single quotes in SSH to prevent all shell expansion
    const result = await this.sshExec(
      `base64 '${filePath.replace(/'/g, "'\\''")}' 2>/dev/null || echo "FILE_NOT_FOUND"`
    );

    if (result.trim() === 'FILE_NOT_FOUND') {
      throw new Error(`File not found: ${filePath}`);
    }

    return Buffer.from(result.trim(), 'base64');
  }

  /**
   * List all files in a deliverables directory for a given noteId.
   * Returns relative paths within that directory.
   */
  async listDeliverables(noteId: string): Promise<string[]> {
    if (!/^note_[a-zA-Z0-9_-]+$/.test(noteId)) {
      throw new Error(`Invalid noteId: ${noteId}`);
    }
    const dir = `/root/.openclaw/workspace/deliverables/${noteId}`;
    const result = await this.sshExec(
      `find '${dir}' -type f 2>/dev/null || echo "DIR_NOT_FOUND"`
    );
    if (result.trim() === 'DIR_NOT_FOUND' || !result.trim()) return [];
    return result.trim().split('\n').filter(Boolean);
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
  /**
   * Write a file to a remote path on Hetzner via SSH.
   * Creates parent directories if needed.
   */
  async writeRemoteFile(remotePath: string, content: string): Promise<void> {
    const dir = remotePath.substring(0, remotePath.lastIndexOf('/'));
    await this.sshExec(`mkdir -p ${dir}`);
    await this.sshExec(`cat > ${remotePath} << 'FILE_EOF'\n${content}\nFILE_EOF`);
    this.logger.log({ message: 'Remote file written', path: remotePath });
  }

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
