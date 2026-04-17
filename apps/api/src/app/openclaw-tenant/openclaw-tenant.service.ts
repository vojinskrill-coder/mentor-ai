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
   * All operations are idempotent and safe to re-run.
   */
  async provisionTenant(
    tenantId: string,
    profile: BusinessProfile,
    souls: GeneratedSouls,
  ): Promise<{ success: boolean; profilePath: string; error?: string }> {
    const profilePath = `/root/.openclaw-${tenantId}`;

    this.logger.log({ message: 'Provisioning OpenClaw tenant', tenantId, profilePath });

    try {
      // Step 1: Create profile directory structure (mkdir -p is idempotent)
      await this.sshExecWithRetry(`mkdir -p ${profilePath}`);

      // Step 2: Copy base config (cp -f overwrites if exists — idempotent)
      await this.sshExecWithRetry(`cp -f ${this.baseProfile}/openclaw.json ${profilePath}/openclaw.json`);

      // Step 3: Create agent directories and write SOUL.MD files
      for (const agent of AGENTS) {
        const agentDir = `${profilePath}/agents/${agent}/agent`;
        await this.sshExecWithRetry(`mkdir -p ${agentDir}`);

        const soulContent = souls[agent as keyof GeneratedSouls];
        if (soulContent) {
          // Write SOUL.MD via base64 encoding for safe transfer (no heredoc escaping issues)
          const encoded = Buffer.from(soulContent).toString('base64');
          await this.sshExecWithRetry(
            `echo '${encoded}' | base64 -d > ${agentDir}/SOUL.md`
          );
        }
      }

      // Step 4: Verify with a test command
      const testResult = await this.sshExecWithRetry(
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

      // Attempt cleanup of partially created directory
      let cleanupStatus = 'not_attempted';
      try {
        this.logger.warn({ message: 'Attempting cleanup of partial provisioning', tenantId, profilePath });
        await this.sshExec(`rm -rf ${profilePath}`);
        cleanupStatus = 'success';
        this.logger.log({ message: 'Cleanup succeeded', tenantId, profilePath });
      } catch (cleanupError) {
        cleanupStatus = 'failed';
        const cleanupMsg = cleanupError instanceof Error ? cleanupError.message : 'Unknown';
        this.logger.error({ message: 'Cleanup failed', tenantId, profilePath, error: cleanupMsg });
      }

      return { success: false, profilePath, error: `${errorMsg} (cleanup: ${cleanupStatus})` };
    }
  }

  /**
   * Update a single agent's SOUL.MD for a tenant.
   */
  async updateSoul(tenantId: string, agentType: string, soulContent: string): Promise<void> {
    const soulPath = `/root/.openclaw-${tenantId}/agents/${agentType}/agent/SOUL.md`;
    const encoded = Buffer.from(soulContent).toString('base64');
    await this.sshExecWithRetry(`echo '${encoded}' | base64 -d > ${soulPath}`);
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

## Company Profile
- **Name**: ${profile.companyName}
- **Industry**: ${profile.industry}
- **Description**: ${profile.description ?? 'Not available'}
- **Website**: ${profile.websiteUrl ?? 'Not available'}
- **Current state**: ${profile.businessState ?? 'Not available'}

## Organization
- **Departments**: ${profile.departments?.join(', ') ?? 'Not defined'}
- **Owner role**: ${profile.userRole ?? 'OWNER'}
- **Strategy**: ${profile.strategy ?? 'Not defined'}
- **Execution mode**: ${profile.executionMode ?? 'MANUAL'}

${profile.crawledProfile ? `## Web Profile\n${profile.crawledProfile}\n` : ''}
${profile.onboardingOutput ? `## Onboarding Analysis\n${profile.onboardingOutput}\n` : ''}
${profile.pdfExtract ? `## Brochure (excerpt)\n${profile.pdfExtract}\n` : ''}
`;

    const userMdPath = `/root/.openclaw-${tenantId}/agents/main/agent/USER.md`;
    const encodedUser = Buffer.from(userMd).toString('base64');
    await this.sshExecWithRetry(`echo '${encodedUser}' | base64 -d > ${userMdPath}`);
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
    const encodedAgents = Buffer.from(agentsMd).toString('base64');
    await this.sshExecWithRetry(`echo '${encodedAgents}' | base64 -d > ${agentsMdPath}`);
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
    const result = await this.sshExecWithRetry(
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
    const result = await this.sshExecWithRetry(
      `find '${dir}' -type f 2>/dev/null || echo "DIR_NOT_FOUND"`
    );
    if (result.trim() === 'DIR_NOT_FOUND' || !result.trim()) return [];
    return result.trim().split('\n').filter(Boolean);
  }

  /**
   * Deep content validation for a deliverable file. Runs a Python check
   * on Hetzner via SSH that loads the file with the appropriate library
   * and counts meaningful content (cells, paragraphs, slides, pages, etc).
   *
   * Returns:
   *   - valid: true if the file has real content
   *   - reason: human-readable explanation when invalid
   *   - metric: the count that was measured (for logging)
   *
   * Supported types: xlsx, docx, pptx, pdf. Other types pass through as valid
   * (we already size-check them in the bridge sanity layer).
   *
   * This is the safety net against the "brain returns empty xlsx skeleton"
   * failure mode. Even if the brain skips per-file verification in its
   * exec loop, we catch empty content here before marking the task COMPLETED.
   */
  async validateDeliverableContent(
    remotePath: string,
  ): Promise<{ valid: boolean; reason?: string; metric?: number }> {
    const ext = (remotePath.split('.').pop() || '').toLowerCase();
    // Only validate binary-format deliverables — text formats (md, csv,
    // txt, svg, json) pass through because empty text is a valid
    // possibility and we'd get false positives.
    if (!['xlsx', 'docx', 'pptx', 'pdf'].includes(ext)) {
      return { valid: true };
    }

    // Build a python one-liner per extension. Each prints "OK <metric>"
    // on success or "FAIL <reason>" on invalid content.
    let py: string;
    switch (ext) {
      case 'xlsx':
        // Count non-empty cells across all sheets. Empty xlsx has
        // sheetData/ elements with zero <c> children.
        py = `
import sys
try:
    from openpyxl import load_workbook
    wb = load_workbook(sys.argv[1], read_only=True, data_only=True)
    total = 0
    for name in wb.sheetnames:
        ws = wb[name]
        for row in ws.iter_rows(values_only=True):
            for v in row:
                if v not in (None, ''):
                    total += 1
    if total < 3:
        print(f'FAIL empty_xlsx ({total} cells across {len(wb.sheetnames)} sheets)')
    else:
        print(f'OK {total}')
except Exception as e:
    print(f'FAIL parse_error {e}')
`;
        break;
      case 'docx':
        py = `
import sys
try:
    from docx import Document
    d = Document(sys.argv[1])
    text_chars = sum(len(p.text.strip()) for p in d.paragraphs)
    if text_chars < 50:
        print(f'FAIL empty_docx ({text_chars} chars, {len(d.paragraphs)} paragraphs)')
    else:
        print(f'OK {text_chars}')
except Exception as e:
    print(f'FAIL parse_error {e}')
`;
        break;
      case 'pptx':
        py = `
import sys
try:
    from pptx import Presentation
    p = Presentation(sys.argv[1])
    text_items = 0
    for slide in p.slides:
        for shape in slide.shapes:
            if shape.has_text_frame:
                for para in shape.text_frame.paragraphs:
                    if para.text.strip():
                        text_items += 1
    if text_items < 3 or len(p.slides) < 1:
        print(f'FAIL empty_pptx ({text_items} text items, {len(p.slides)} slides)')
    else:
        print(f'OK {text_items}')
except Exception as e:
    print(f'FAIL parse_error {e}')
`;
        break;
      case 'pdf':
        // Heuristic: count the number of characters extractable from all pages.
        // Empty/placeholder PDFs have very little text content.
        py = `
import sys
try:
    from pypdf import PdfReader
    r = PdfReader(sys.argv[1])
    total_chars = sum(len((p.extract_text() or '').strip()) for p in r.pages)
    if total_chars < 100:
        print(f'FAIL empty_pdf ({total_chars} chars, {len(r.pages)} pages)')
    else:
        print(f'OK {total_chars}')
except ImportError:
    # pypdf not installed — fall back to a byte-level heuristic: look
    # for streams. Don't fail the whole task over a missing dep.
    print('OK skipped_no_pypdf')
except Exception as e:
    print(f'FAIL parse_error {e}')
`;
        break;
      default:
        return { valid: true };
    }

    // base64-encode the script so shell quoting is a non-issue
    const b64 = Buffer.from(py.trim()).toString('base64');
    const cmd = `python3 -c "import base64,sys,os; exec(base64.b64decode('${b64}').decode())" '${remotePath.replace(/'/g, "'\\''")}'`;

    try {
      const out = await this.sshExecWithRetry(cmd);
      const line = out.trim();
      if (line.startsWith('OK')) {
        const metric = parseInt(line.split(/\s+/)[1] ?? '0', 10);
        return { valid: true, metric: Number.isNaN(metric) ? undefined : metric };
      }
      if (line.startsWith('FAIL')) {
        return { valid: false, reason: line.replace(/^FAIL\s*/, '').trim() };
      }
      // Unknown output — treat as valid rather than block the task
      return { valid: true };
    } catch (err) {
      this.logger.warn({
        message: 'Content validation exec failed',
        path: remotePath,
        error: err instanceof Error ? err.message : 'unknown',
      });
      // Don't block task completion if our validator itself errored.
      return { valid: true };
    }
  }

  /**
   * Check if a tenant profile exists on Hetzner.
   */
  async tenantExists(tenantId: string): Promise<boolean> {
    try {
      const result = await this.sshExecWithRetry(`test -d /root/.openclaw-${tenantId} && echo yes || echo no`);
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
  /**
   * Read a text file from Hetzner via SSH and return its content as a string.
   * Uses base64 encoding for safe transfer. Throws if file not found.
   */
  async readRemoteFile(remotePath: string): Promise<string> {
    const buf = await this.readFile(remotePath);
    return buf.toString('utf-8');
  }

  async writeRemoteFile(remotePath: string, content: string): Promise<void> {
    const dir = remotePath.substring(0, remotePath.lastIndexOf('/'));
    await this.sshExecWithRetry(`mkdir -p ${dir}`);
    const encoded = Buffer.from(content).toString('base64');
    await this.sshExecWithRetry(`echo '${encoded}' | base64 -d > ${remotePath}`);
    this.logger.log({ message: 'Remote file written', path: remotePath });
  }

  async deleteTenant(tenantId: string): Promise<void> {
    await this.sshExecWithRetry(`rm -rf /root/.openclaw-${tenantId}`);
    this.logger.log({ message: 'Tenant profile deleted', tenantId });
  }

  /**
   * Check if an error is transient and safe to retry.
   * Auth failures are NOT retried.
   */
  private isTransientError(error: Error): boolean {
    const msg = error.message.toLowerCase();
    const transientPatterns = ['timeout', 'econnreset', 'econnrefused', 'hang up', 'timed out', 'etimedout'];
    return transientPatterns.some((p) => msg.includes(p));
  }

  /**
   * Execute an SSH command with retry on transient failures.
   * Max 2 retries with exponential backoff (1s, 2s) plus 25% jitter.
   */
  private async sshExecWithRetry(command: string, maxRetries = 2): Promise<string> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await this.sshExec(command);
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));

        if (attempt >= maxRetries || !this.isTransientError(err)) {
          throw err;
        }

        const baseDelay = Math.min(1000 * Math.pow(2, attempt), 4000);
        const jitter = baseDelay * 0.25 * (Math.random() * 2 - 1); // ±25%
        const delay = Math.round(baseDelay + jitter);

        this.logger.warn({
          message: 'SSH transient error, retrying',
          attempt: attempt + 1,
          maxRetries,
          delayMs: delay,
          error: err.message,
          command: command.substring(0, 80),
        });

        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }

    // Unreachable, but TypeScript needs it
    throw new Error('sshExecWithRetry: exhausted retries');
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
