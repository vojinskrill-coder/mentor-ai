import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'ssh2';
import { readFileSync } from 'fs';
import { QdrantClientService } from '../qdrant/qdrant-client.service';
import { VAULT_STORAGE, VaultStorage } from '../vault-storage/vault-storage.interface';
import { TemplateService } from '../template/template.service';

/**
 * VaultProvisionerService — creates per-tenant Karpathy LLM Wiki vault
 * on the OpenClaw relay (Hetzner) during onboarding.
 *
 * Creates:
 *   - Vault filesystem structure (raw/, wiki/, skills/, instructions/)
 *   - SCHEMA.md, bootstrap.md, tenant-config.md, index.md, log.md, wikilink-map.md
 *   - SOUL.md for vault mode operation
 *   - qdrant-search.sh tool
 *   - qdrant.env credentials
 *   - Per-tenant Qdrant collection (concepts-{tenantId})
 */
@Injectable()
export class VaultProvisionerService {
  private readonly logger = new Logger(VaultProvisionerService.name);
  private readonly hetznerHost: string;
  private readonly hetznerUser: string;
  private readonly sshKeyPath: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly qdrantClient: QdrantClientService,
    @Inject(VAULT_STORAGE) private readonly vaultStorage: VaultStorage,
    private readonly templateService: TemplateService,
  ) {
    this.hetznerHost = this.configService.get<string>('HETZNER_HOST') ?? '91.98.231.87';
    this.hetznerUser = this.configService.get<string>('HETZNER_USER') ?? 'root';
    this.sshKeyPath = this.configService.get<string>('HETZNER_SSH_KEY') ?? '';
  }

  /**
   * Provision a complete Karpathy vault for a new tenant.
   */
  async provisionVault(params: {
    tenantId: string;
    companyName: string;
    industry: string;
    description: string;
    website?: string;
    brandColors?: string;
    visualStyle?: string;
    targetAudience?: string;
    conceptSlugs: Array<{ slug: string; name: string; category: string }>;
  }): Promise<{ success: boolean; vaultPath: string; error?: string }> {
    const { tenantId, companyName, industry, description, conceptSlugs } = params;
    const vaultPath = `/root/.openclaw-${tenantId}/vault`;
    const basePath = `/root/.openclaw-${tenantId}`;

    this.logger.log({ message: 'Provisioning Karpathy vault', tenantId, vaultPath, conceptCount: conceptSlugs.length });

    try {
      // ── 1. Create vault directories via VaultStorage ──
      const vaultDirs = [
        'raw/research', 'raw/user-uploads', 'raw/snapshots',
        'wiki/concepts', 'wiki/skills', 'instructions',
      ];
      await this.vaultStorage.createDirectories(tenantId, vaultDirs);

      // Non-vault directories + symlinks still require direct SSH
      // TODO: Migrate agent/tool/config paths to VaultStorage when the interface supports non-vault paths.
      const nonVaultDirs = [
        `${basePath}/agents/main/agent`, `${basePath}/tools`, `${basePath}/config`,
        `${basePath}/workspace`, `/root/.openclaw/workspace`,
      ].join(' ');
      await this.sshExec(`mkdir -p ${nonVaultDirs} && ln -sf ${vaultPath}/wiki/skills ${basePath}/skills 2>/dev/null; ln -sf ${vaultPath} /root/.openclaw/workspace/${tenantId}-vault 2>/dev/null; ln -sf ${vaultPath} ${basePath}/workspace/vault 2>/dev/null; echo OK`);

      // ── 2. Resolve template-based vault files ──
      const templateVars: Record<string, string> = {
        tenantId,
        companyName,
        industry,
        description,
        website: params.website ?? 'N/A',
        brandColors: params.brandColors ?? 'Professional palette appropriate for ' + industry,
        visualStyle: params.visualStyle ?? 'Clean, professional, modern',
        targetAudience: params.targetAudience ?? 'Business professionals',
        vaultPath,
        workspaceVaultPath: `/root/.openclaw/workspace/${tenantId}-vault`,
      };
      const templateFiles = this.templateService.resolveAll(templateVars);

      // ── 3. Build the full set of vault files ──
      const vaultFiles = new Map<string, string>();

      // Template-resolved files — map output names to vault-relative paths
      const templatePathMap: Record<string, string> = {
        'SCHEMA.md': 'SCHEMA.md',
        'TENANT-PROTOCOL.md': 'TENANT-PROTOCOL.md',
        'GUARDRAILS.md': 'GUARDRAILS.md',
        'FLOW.md': 'FLOW.md',
        'bootstrap.md': 'instructions/bootstrap.md',
        'SOUL.md': 'SOUL.md', // Vault copy — agent SOUL.md handled separately below
      };
      for (const [outputName, content] of templateFiles) {
        const vaultRelPath = templatePathMap[outputName];
        if (vaultRelPath) {
          vaultFiles.set(vaultRelPath, content);
        }
      }

      // Inline-generated vault files (not covered by templates)
      vaultFiles.set('instructions/tenant-config.md', this.generateTenantConfig(params));
      vaultFiles.set('index.md', this.generateIndex(conceptSlugs));
      vaultFiles.set('wikilink-map.md', this.generateWikilinkMap(conceptSlugs));
      vaultFiles.set('log.md', `# Operation Log\n\n| Date | Concept | Action | Note |\n|------|---------|--------|------|\n| ${new Date().toISOString().split('T')[0]} | — | vault-created | Initial provisioning with ${conceptSlugs.length} concepts |\n`);

      // Write all vault files in a single batch
      await this.vaultStorage.writeFiles(tenantId, vaultFiles);

      // ── 4. Non-vault files still written via direct SFTP ──
      // TODO: Migrate to VaultStorage when agent-level paths are added to the interface.
      await this.writeFile(`${basePath}/agents/main/agent/SOUL.md`, this.generateVaultSoulMd(tenantId, companyName, industry, vaultPath));
      await this.writeFile(`${basePath}/tools/qdrant-search.sh`, this.generateQdrantTool(tenantId));

      const qdrantUrl = this.configService.get<string>('QDRANT_URL') ?? '';
      const qdrantKey = this.configService.get<string>('QDRANT_API_KEY') ?? '';
      await this.writeFile(`${basePath}/config/qdrant.env`, `QDRANT_HOST=${qdrantUrl}\nQDRANT_API_KEY=${qdrantKey}\nQDRANT_COLLECTION=concepts-${tenantId}\n`);

      // Make qdrant-search.sh executable
      await this.sshExec(`chmod +x ${basePath}/tools/qdrant-search.sh`);

      // Create per-tenant Qdrant collection
      if (this.qdrantClient.isAvailable()) {
        try {
          await this.qdrantClient.ensureCollection(`concepts-${tenantId}`, 1536);
          this.logger.log({ message: 'Per-tenant Qdrant collection created', collection: `concepts-${tenantId}` });
        } catch (err) {
          this.logger.warn({ message: 'Qdrant collection creation failed (non-blocking)', error: (err as Error).message });
        }
      }

      // Verify
      const fileCount = await this.sshExec(`find ${vaultPath} -type f | wc -l`);
      this.logger.log({
        message: 'Vault provisioned successfully',
        tenantId,
        vaultPath,
        files: parseInt(fileCount.trim(), 10),
        concepts: conceptSlugs.length,
      });

      return { success: true, vaultPath };
    } catch (err) {
      const error = (err as Error).message;
      this.logger.error({ message: 'Vault provisioning failed', tenantId, error });
      return { success: false, vaultPath, error };
    }
  }

  // ── File Generators ──

  private generateSchema(companyName: string): string {
    return `# SCHEMA.md — Concept Article Structure

## Frontmatter (required YAML block at top of every article)

\`\`\`yaml
---
title: "{Concept Name}"
slug: "{kebab-case-slug}"
category: "{category}"
stage: episodic
confidence: high
departmentTags: []
relatedConcepts: []
wordCount: 0
enrichedAt: null
sources: []
---
\`\`\`

## Article Sections (required in order)

Every article MUST contain these sections. Minimum 400 words per section.

### 1. Overview
<!-- dept:all -->
What this concept is. Clear definition. How it applies to ${companyName}.

### 2. Why This Matters for ${companyName}
<!-- dept:strategy -->
Industry-specific justification. Connect to market position, clients, goals.

### 3. Detailed Analysis
<!-- dept:all -->
Deep dive with sub-headings, data tables, research. Inline citations required.

### 4. Strategies and Best Practices
<!-- dept:all -->
Actionable strategies with expected outcomes, timelines, resources.

### 5. Industry Application
<!-- dept:all -->
Real examples, case studies, competitor analysis specific to ${companyName}'s industry.

### 6. Implementation Roadmap
<!-- dept:operations -->
Step-by-step plan with phases, actions, owners, deliverables.

### 7. Key Metrics and KPIs
<!-- dept:finance -->
Measurable indicators, targets, benchmarks.

### 8. Related Concepts
<!-- dept:all -->
Cross-links using [[wikilink]] format. Resolve via wikilink-map.md.

### 9. Sources and References
<!-- dept:all -->
Every source: [Title](URL) — how it was used.

## Formatting Rules
- Every H2 section must have <!-- dept:tag --> comment
- Use [[wikilink]] for cross-concept references
- Minimum 5,000 words per article
- Bold key terms with **
- Include at least 3 data tables
- No fabricated statistics
- Inline citations: "Market worth $4.2B ([Source](URL))"

## Enrichment Completion Checklist
- [ ] All sections present and filled (400+ words each)
- [ ] Minimum 5,000 words total
- [ ] Every H2 has dept tag
- [ ] All [[wikilinks]] resolved via wikilink-map.md
- [ ] Frontmatter complete
- [ ] Written to wiki/concepts/{slug}.md
- [ ] index.md updated
- [ ] log.md updated
- [ ] Qdrant embedding triggered
`;
  }

  private generateBootstrap(params: {
    tenantId: string;
    companyName: string;
    industry: string;
    description: string;
    website?: string;
    brandColors?: string;
    visualStyle?: string;
    targetAudience?: string;
  }): string {
    return `# bootstrap.md — Tenant Onboarding

## Company Identity

**Company Name:** ${params.companyName}
**Industry:** ${params.industry}
**Website:** ${params.website ?? 'N/A'}

## Business Profile

${params.description}

## Brand Identity

**Visual style:** ${params.visualStyle ?? 'Clean, professional, modern'}
**Color palette:** ${params.brandColors ?? 'Professional palette appropriate for ' + params.industry}
**Target audience:** ${params.targetAudience ?? 'Business professionals'}

## Knowledge Base Mandate

This knowledge base exists to systematically build ${params.companyName}'s business intelligence.
Each concept is enriched with industry-specific research, real data, and actionable strategies.

## Vault Path

\`/root/.openclaw-${params.tenantId}/vault\`

## Qdrant Collection

\`concepts-${params.tenantId}\`

## Operational Notes

- Write all articles in English
- Use web_search for real market data and citations
- Every claim needs an inline source citation
- Write to vault files, return only status + path in messages
- Do NOT spawn sub-agents that return full content in messages
- Sequential one-shot sub-agents only (research → content)
`;
  }

  private generateTenantConfig(params: {
    companyName: string;
    industry: string;
    description: string;
    website?: string;
    brandColors?: string;
    visualStyle?: string;
  }): string {
    return `# Tenant Configuration — ${params.companyName}

## Business Profile
- **Company:** ${params.companyName}
- **Industry:** ${params.industry}
- **Website:** ${params.website ?? 'N/A'}
- **Description:** ${(params.description ?? '').substring(0, 2000)}

## Style Rules
- Language: English
- Tone: Professional, research-backed, actionable
- Visual style: ${params.visualStyle ?? 'Clean and modern'}
- Brand colors: ${params.brandColors ?? 'N/A'}
- Format: Markdown with tables, inline citations, wikilinks
`;
  }

  private generateIndex(concepts: Array<{ slug: string; name: string; category: string }>): string {
    let md = `# Concept Index\n\n| Slug | Name | Category | Stage | File |\n|------|------|----------|-------|------|\n`;
    for (const c of concepts) {
      md += `| ${c.slug} | ${c.name} | ${c.category} | placeholder | — |\n`;
    }
    return md;
  }

  private generateWikilinkMap(concepts: Array<{ slug: string; name: string }>): string {
    let md = `# Wikilink Map\n\n`;
    for (const c of concepts) {
      md += `${c.slug} → wiki/concepts/${c.slug}.md\n`;
    }
    return md;
  }

  private generateVaultSoulMd(tenantId: string, companyName: string, industry: string, vaultPath: string): string {
    // Vault accessible via workspace symlink
    const workspaceVaultPath = `/root/.openclaw/workspace/${tenantId}-vault`;

    return `# SOUL.md — Vault Operation Mode for ${companyName}

## CRITICAL LANGUAGE RULE — READ THIS FIRST
**EVERY word you write MUST be in ENGLISH. Not Serbian. Not any other language. ENGLISH ONLY.**
**If you catch yourself writing in Serbian — STOP and rewrite in English.**
**This rule applies to: articles, file names, log entries, status messages, and ALL output.**
**Violation of this rule means the entire output is rejected.**

## Identity
I am the Business Knowledge Writer for ${companyName} (${industry}).
I write in ENGLISH. All my output is in ENGLISH. No exceptions.

## Active Tenant: ${tenantId}
**Vault Path:** ${workspaceVaultPath}
**Alternative Path:** ${vaultPath}

## Vault Mode Protocol

When a task arrives with a vaultPath field:

### Step 1: Read Protocol (ALWAYS FIRST)
\`\`\`
read ${workspaceVaultPath}/TENANT-PROTOCOL.md
read ${workspaceVaultPath}/SCHEMA.md
read ${workspaceVaultPath}/index.md
read ${workspaceVaultPath}/instructions/tenant-config.md
\`\`\`

### Step 2: Check if concept exists
If slug is in index.md with stage: semantic → SKIP (already enriched)

### Step 3: Research
Use web_search to find real data. Every claim needs a source URL.

### Step 4: Write Article (IN ENGLISH)
Write to: \`${workspaceVaultPath}/wiki/concepts/{slug}.md\`
Follow SCHEMA.md structure exactly. Minimum 5000 words. ALL IN ENGLISH.

### Step 5: Update Vault
\`\`\`
edit ${workspaceVaultPath}/index.md   — mark concept as semantic
edit ${workspaceVaultPath}/log.md     — add timestamp + action
\`\`\`

### Step 6: Return Status
Return ONLY: concept name, file path, word count, status. Never return full article in message.

## Hard Rules
1. **ENGLISH ONLY** — every word of every article, every log entry, every status message
2. **5000+ words** minimum per article
3. **Real sources** — web_search for data, inline citations with URLs
4. **No fabrication** — if data unavailable, say so
5. **No Serbian** — not a single word. Not in headings, not in content, not in metadata
6. **No other tenants** — never reference other companies or their data
7. **Write to vault** — never return full article content in messages
8. **One concept at a time** — complete fully before starting next
`;
  }

  private generateQdrantTool(tenantId: string): string {
    return `#!/bin/bash
# qdrant-search.sh — semantic search for tenant vault
# Usage: qdrant-search.sh search <tenantId> "query"
#        qdrant-search.sh embed <tenantId> /path/to/file.md
set -e

ACTION="\$1"
TENANT_ID="\$2"
ARG="\$3"
CONFIG="/root/.openclaw-\${TENANT_ID}/config/qdrant.env"

if [ -f "\$CONFIG" ]; then
  export \$(grep -v '^#' "\$CONFIG" | xargs)
else
  echo '{"error":"qdrant config not found"}' >&2
  exit 1
fi

COLLECTION="concepts-\${TENANT_ID}"

case "\$ACTION" in
  search)
    # Semantic search via Qdrant scroll with payload filter
    curl -s --fail \\
      -H "api-key: \${QDRANT_API_KEY}" \\
      -H "Content-Type: application/json" \\
      "\${QDRANT_HOST}/collections/\${COLLECTION}/points/scroll" \\
      -d '{"limit":10,"with_payload":true,"with_vector":false}' \\
      2>/dev/null || echo '{"error":"search failed"}'
    ;;
  embed)
    echo '{"status":"embedding_requested","file":"'\$ARG'","collection":"'\$COLLECTION'"}'
    # Real embedding done by the backend NestJS service
    ;;
  *)
    echo "Usage: qdrant-search.sh [search|embed] <tenantId> <query|file>"
    ;;
esac
`;
  }

  // ── SSH Helpers ──

  /** Write file to remote server via SFTP (reliable for large content) */
  private async writeFile(remotePath: string, content: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      conn.on('ready', () => {
        conn.sftp((err, sftp) => {
          if (err) { conn.end(); return reject(err); }
          const writeStream = sftp.createWriteStream(remotePath);
          writeStream.on('close', () => { conn.end(); resolve(); });
          writeStream.on('error', (e: Error) => { conn.end(); reject(e); });
          writeStream.end(Buffer.from(content, 'utf-8'));
        });
      });
      conn.on('error', reject);
      conn.connect(this.getSshConfig());
    });
  }

  private sshExec(command: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      let output = '';

      conn.on('ready', () => {
        conn.exec(command, (err, stream) => {
          if (err) { conn.end(); return reject(err); }
          stream.on('data', (data: Buffer) => { output += data.toString(); });
          stream.stderr.on('data', (data: Buffer) => { output += '[STDERR] ' + data.toString(); });
          stream.on('close', (code: number) => {
            conn.end();
            if (code !== 0 && code !== null) {
              this.logger.warn({ message: 'SSH command non-zero exit', command: command.substring(0, 80), code });
            }
            resolve(output);
          });
        });
      });

      conn.on('error', reject);
      conn.connect(this.getSshConfig());
    });
  }

  private generateGuardrails(companyName: string): string {
    return `# GUARDRAILS.md — Enrichment Pipeline Validation

## Language Rule (NON-NEGOTIABLE)
- **EVERY word in EVERY file MUST be in ENGLISH**
- Zero tolerance for Serbian, Croatian, or any non-English content
- If any section contains non-English text, the entire article is REJECTED
- Validation: \`grep -P '[čćšžđ]' wiki/concepts/*.md\` must return EMPTY

## Enrichment Validation Checkpoints

### Checkpoint 1: Pre-Write
| Check | Command | Expected |
|-------|---------|----------|
| SCHEMA.md readable | \`test -f SCHEMA.md\` | exit 0 |
| index.md readable | \`test -f index.md\` | exit 0 |
| tenant-config.md readable | \`test -f instructions/tenant-config.md\` | exit 0 |
| Concept not already enriched | \`grep {slug} index.md \\| grep placeholder\` | match found |

### Checkpoint 2: Post-Write
| Check | Command | Expected |
|-------|---------|----------|
| File exists | \`test -f wiki/concepts/{slug}.md\` | exit 0 |
| File size > 15KB | \`test $(wc -c < wiki/concepts/{slug}.md) -gt 15000\` | exit 0 |
| Word count > 5000 | \`test $(wc -w < wiki/concepts/{slug}.md) -gt 5000\` | exit 0 |
| Has YAML frontmatter | \`head -1 wiki/concepts/{slug}.md\` | "---" |
| No Serbian chars | \`grep -cP '[čćšžđ]' wiki/concepts/{slug}.md\` | 0 |
| Has Sources section | \`grep -c '## Sources' wiki/concepts/{slug}.md\` | ≥ 1 |
| Has dept tags | \`grep -c 'dept:' wiki/concepts/{slug}.md\` | ≥ 3 |

### Checkpoint 3: Post-Update
| Check | Command | Expected |
|-------|---------|----------|
| index.md updated | \`grep {slug} index.md \\| grep semantic\` | match found |
| log.md has entry | \`grep {slug} log.md\` | match found |

### Retry Logic
- If Checkpoint 2 fails → delete the file, log error, retry once
- If retry also fails → mark concept as "failed" in index.md, move to next
- Maximum 2 attempts per concept
- If language check fails → ALWAYS reject and retry

## Quality Standards
- Minimum 5,000 words per article
- Minimum 3 data tables with real data
- Minimum 5 inline citations with URLs
- Every H2 section must have <!-- dept:tag --> marker
- Every claim must have an inline source reference
- No placeholder text ("Lorem ipsum", "TBD", "TODO")
`;
  }

  private generateFlow(companyName: string, tenantId: string): string {
    return `# FLOW.md — Complete Pipeline: Onboarding to Enrichment

## Phase 1: Onboarding (Backend)
| Step | Who | Action | Validates |
|------|-----|--------|-----------|
| 1.1 | Google OAuth | User registers | User + Tenant created in DB |
| 1.2 | Backend | setupCompany() | Company details saved |
| 1.3 | Backend | AI scores concepts (>= 0.75 relevance) | Balanced across categories |
| 1.4 | Backend | createConceptsFromCurriculum() | Concepts in PostgreSQL + Qdrant |
| 1.5 | Backend | provisionVault() | Vault on Hetzner with all files |
| 1.6 | Backend | Per-tenant Qdrant collection | concepts-${tenantId} exists |

## Phase 2: Onboarding Complete (Backend)
| Step | Who | Action | Validates |
|------|-----|--------|-----------|
| 2.1 | Backend | completeOnboarding() | Tenant status → ACTIVE |
| 2.2 | Backend | OpenClaw director briefing | Welcome conversation created |
| 2.3 | Backend | enrichOnboardingConcepts() | Waits for concepts, then triggers maturity |
| 2.4 | Backend | maturityEngine.initializeStage() | Tasks + conversations + assignments created |

## Phase 3: Maturity Engine Execution (Backend + OpenClaw)
| Step | Who | Action | Validates |
|------|-----|--------|-----------|
| 3.1 | Backend | Picks ready concepts (dependencies met) | Parallel batch (3 concurrent) |
| 3.2 | Backend | Sends minimal JSON task to OpenClaw | vaultPath included |
| 3.3 | OpenClaw | Reads vault (SCHEMA, config, index) | All files readable |
| 3.4 | OpenClaw | web_search for real data | Sources found |
| 3.5 | OpenClaw | Writes article to vault IN ENGLISH | 5000+ words, English only |
| 3.6 | OpenClaw | Updates index.md + log.md | Concept marked semantic |
| 3.7 | Backend | Reads vault article via SSH | Content synced to PostgreSQL |
| 3.8 | Backend | Re-embeds to Qdrant | Full content vectorized |
| 3.9 | Backend | Updates conversation | Enrichment visible in chat |
| 3.10 | Backend | Marks task COMPLETED | Only if content > 1000 chars |

## Phase 4: Next Batch (Backend)
| Step | Who | Action | Validates |
|------|-----|--------|-----------|
| 4.1 | Backend | All current assignments complete | 0 PENDING |
| 4.2 | Backend | AI scores remaining concepts (>= 0.70) | New batch selected |
| 4.3 | Backend | Creates new concepts + vault entries | index.md updated |
| 4.4 | Backend | Triggers new stage execution | Loop back to Phase 3 |

## Critical Rules
1. **ENGLISH ONLY** — every article, every log entry, every message
2. **Vault is source of truth** — PostgreSQL is sync copy
3. **No fake completions** — task COMPLETED only with real content
4. **Fresh session per concept** — no accumulated context
5. **Validate after every step** — check GUARDRAILS.md checkpoints
`;
  }

  private generateTenantProtocol(tenantId: string, companyName: string, industry: string): string {
    const wsVaultPath = `/root/.openclaw/workspace/${tenantId}-vault`;
    return `# TENANT-PROTOCOL.md — Machine-Readable Agent Instructions
# Version: 1.0 | Tenant: ${tenantId} | Company: ${companyName}
# READ THIS FILE ON EVERY TASK. It is the authoritative behavior spec.

## IDENTITY
tenant_id: ${tenantId}
company: ${companyName}
industry: ${industry}
language: ENGLISH
vault_path: ${wsVaultPath}

## LANGUAGE PROTOCOL
rule: ALL_OUTPUT_ENGLISH
enforcement: STRICT
check: content must NOT contain characters čćšžđ
check: content must NOT contain Serbian words (koji, koja, može, biti, kako, ali, ili, nije, već)
on_violation: STOP, DELETE output, REWRITE in English
exception: NONE — no Serbian in any file, log entry, message, or status

## SESSION PROTOCOL
mode: PERSISTENT
session_id: enrichment-${tenantId}
compaction_trigger: AFTER_EVERY_20_CONCEPTS
compaction_check: AT_TASK_START check log.md count — if >= 20 since last compaction, compact before continuing
compaction_process:
  1. Summarize all enriched concepts so far into MEMORY.md
  2. Archive conversation history
  3. Continue in same session with fresh context + MEMORY.md
benefit: cross-concept knowledge preserved — wikilinks, shared frameworks, learned patterns

## ENRICHMENT PROTOCOL
trigger: JSON task with concept + category + tenantId + vaultPath
at_session_start: READ log.md to see what is already done. READ MEMORY.md for cross-concept context.
sequence:
  1. READ ${wsVaultPath}/TENANT-PROTOCOL.md (this file)
  2. READ ${wsVaultPath}/SCHEMA.md
  3. READ ${wsVaultPath}/log.md — see what is already enriched
  4. READ ${wsVaultPath}/index.md — check if concept already enriched (stage: semantic → SKIP)
  5. READ ${wsVaultPath}/instructions/tenant-config.md
  5. web_search: "{concept} {industry} best practices 2025 2026"
  6. web_search: "{company} competitors {category}"
  7. WRITE article to ${wsVaultPath}/wiki/concepts/{slug}.md
     - Follow SCHEMA.md structure exactly
     - Minimum 5000 words
     - ALL IN ENGLISH
     - Real citations with URLs inline
     - At least 3 data tables
  8. EDIT ${wsVaultPath}/index.md — change stage: placeholder → semantic
  9. EDIT ${wsVaultPath}/log.md — add: date | concept | enriched | word count
  10. RETURN: {"status":"complete","path":"wiki/concepts/{slug}.md","wordCount":N}

## VALIDATION BEFORE SAVING
before_write_checks:
  - [ ] Article language is 100% English
  - [ ] Word count >= 5000
  - [ ] Has YAML frontmatter (---)
  - [ ] Has Sources section with URLs
  - [ ] Has dept tags (<!-- dept:xxx -->)
  - [ ] No placeholder text (TBD, TODO, Lorem)
  - [ ] No references to other companies/tenants

## TENANT ISOLATION
rule: NEVER access data from other tenants
rule: NEVER read/write files outside ${wsVaultPath}/
rule: NEVER reference Luxury Statues Adria, LSA, or tnt_rljn1gj4cgxoph0hxfohv6l4
rule: NEVER use information from other tenant conversations or proposals
on_violation: STOP immediately, report error

## SUB-AGENT PROTOCOL
allowed: YES — sequential one-shot sub-agents (mode: "run")
constraint: sub-agents write to vault files, return only status + path
constraint: max 1 concurrent sub-agent
constraint: sub-agents inherit this tenant protocol
constraint: sub-agent output must pass same language and quality checks

## RETRY PROTOCOL
on_failure: retry once with fresh session
on_language_failure: add explicit "REWRITE IN ENGLISH" instruction
on_timeout: mark as failed, move to next concept
max_retries: 2
`;
  }

  private getSshConfig(): Record<string, unknown> {
    const config: Record<string, unknown> = {
      host: this.hetznerHost,
      port: 22,
      username: this.hetznerUser,
    };
    if (this.sshKeyPath) {
      try {
        config['privateKey'] = readFileSync(this.sshKeyPath);
      } catch {
        throw new Error(`SSH key not found: ${this.sshKeyPath}`);
      }
    }
    return config;
  }
}
