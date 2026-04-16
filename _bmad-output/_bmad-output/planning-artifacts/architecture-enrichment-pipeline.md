---
stepsCompleted: [1]
inputDocuments: ['prd-v2-autonomous-brain-architecture.md']
workflowType: 'architecture'
project_name: 'Neuron OS'
user_name: 'Tanjav'
date: '2026-04-15'
scope: 'Core Platform Foundation — Enrichment Pipeline'
---

# Architecture: Core Platform Foundation

## 1. Problem Statement

The current implementation has fundamental architectural flaws that prevent scaling beyond a single developer testing on one machine:

| Problem | Current State | Impact at Scale |
|---|---|---|
| Hardcoded values | IPs, tenant IDs, paths scattered in code | Cannot deploy to any other environment |
| Fire-and-forget async | Vault provisioning, enrichment trigger | Race conditions multiply with concurrent tenants |
| In-memory state | `runningExecutions` Set, LRU caches | Lost on restart, cannot scale horizontally |
| Single SSH connection per operation | 15+ connections per vault provision | Exhausts SSH limits at 10+ concurrent onboardings |
| One Hetzner server | All vaults, relay, media on one box | Single point of failure, cannot scale |
| Legacy code paths | Old pipeline produces garbage completions | Silent data corruption |

## 2. Architecture Principles

1. **Configuration as Code** — every value comes from config, never hardcoded
2. **Await Everything** — no fire-and-forget for operations that have downstream dependencies
3. **Distributed State** — no in-memory locks; use database or Redis for coordination
4. **Idempotent Operations** — every step can be safely retried
5. **Observable Pipeline** — every step logs, emits events, and can be monitored
6. **Vault as Source of Truth** — content lives in vault; PG has metadata; Qdrant has vectors
7. **Tenant Isolation by Default** — every data path includes tenantId; no global defaults
8. **Reproducible Environment** — any OpenClaw instance can be created from repo config

## 3. System Components

### 3.1 Configuration Layer

```
PlatformConfigService (singleton)
├── getTenantConfig(tenantId) → TenantConfig
├── getRelayConfig() → RelayConfig  
├── getQdrantConfig() → QdrantConfig
├── getVaultConfig(tenantId) → VaultConfig
└── getTimeouts() → TimeoutConfig

Sources (priority order):
1. Environment variables (deployment-specific)
2. config.yaml in repo (defaults)
3. Database (tenant-specific overrides)

No hardcoded values in any service. Every service receives config via injection.
```

**Config Schema:**
```yaml
# platform-config.yaml (in repo, version controlled)
relay:
  host: ${RELAY_HOST}           # env var
  port: ${RELAY_PORT:3100}      # env var with default
  authToken: ${RELAY_AUTH_TOKEN} # env var (secret)
  timeoutSeconds: ${RELAY_TIMEOUT:600}

vault:
  storageBackend: ${VAULT_BACKEND:ssh}  # ssh | s3 | local
  sshHost: ${VAULT_SSH_HOST}
  sshUser: ${VAULT_SSH_USER:root}
  sshKeyPath: ${VAULT_SSH_KEY}
  basePath: /root/.openclaw-{tenantId}/vault

qdrant:
  host: ${QDRANT_URL}
  apiKey: ${QDRANT_API_KEY}
  collectionPrefix: concepts   # per-tenant: concepts-{tenantId}
  vectorDimension: 1536

enrichment:
  concurrency: ${ENRICHMENT_CONCURRENCY:1}
  sessionStrategy: persistent  # persistent | fresh
  compactionInterval: 20       # concepts before compaction
  maxRetries: 2
  guardrails:
    minWords: 4500
    minChars: 15000
    language: english
    requireSources: true
    requireFrontmatter: true

openclaw:
  agents:
    - id: main
      soulTemplate: templates/vault/SOUL.template.md
    - id: research
    - id: content
    - id: marketing
    - id: financial
    - id: sales
    - id: designer
    - id: dev
  tenantProtocolTemplate: templates/vault/TENANT-PROTOCOL.template.md
  guardrailsTemplate: templates/vault/GUARDRAILS.template.md
  schemaTemplate: templates/vault/SCHEMA.template.md
  skillsDir: skills/
```

### 3.2 Vault Storage Abstraction

```typescript
interface VaultStorage {
  // File operations
  writeFile(tenantId: string, path: string, content: string): Promise<void>;
  readFile(tenantId: string, path: string): Promise<string>;
  fileExists(tenantId: string, path: string): Promise<boolean>;
  listFiles(tenantId: string, dir: string): Promise<string[]>;
  
  // Batch operations (single connection)
  writeFiles(tenantId: string, files: Map<string, string>): Promise<void>;
  
  // Directory operations
  createDirectories(tenantId: string, dirs: string[]): Promise<void>;
}

// Implementations:
class SshVaultStorage implements VaultStorage { ... }  // Current: Hetzner SSH
class S3VaultStorage implements VaultStorage { ... }   // Future: AWS S3
class LocalVaultStorage implements VaultStorage { ... } // Testing: local filesystem
```

**Key change:** Instead of 15+ SSH connections, `SshVaultStorage.writeFiles()` opens ONE connection and writes all files through a single SFTP session.

### 3.3 Enrichment Pipeline

```
┌─────────────────────────────────────────────────────────────┐
│                    ENRICHMENT PIPELINE                       │
│                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌───────┐ │
│  │ DISPATCH │───▶│ EXECUTE  │───▶│ VALIDATE │───▶│ STORE │ │
│  └──────────┘    └──────────┘    └──────────┘    └───────┘ │
│       │               │               │               │     │
│   Pick next       Send to         Read vault       Update   │
│   concept from    OpenClaw        article,         PG meta  │
│   queue           relay           run guardrails   + Qdrant │
│       │               │               │               │     │
│   ┌───▼───┐      ┌───▼───┐      ┌───▼───┐      ┌───▼───┐ │
│   │ Queue │      │ Relay │      │ Guard │      │  DB   │ │
│   │ (DB)  │      │(HTTP) │      │(Code) │      │      │ │
│   └───────┘      └───────┘      └───────┘      └───────┘ │
│                                      │                     │
│                                 ┌───▼───┐                 │
│                                 │CORRECT│                 │
│                                 │(retry)│                 │
│                                 └───────┘                 │
└─────────────────────────────────────────────────────────────┘
```

**State Machine (per concept):**
```
QUEUED → DISPATCHED → EXECUTING → VALIDATING → COMPLETED
                         │              │
                         ▼              ▼
                      FAILED ←── CORRECTING (max 2x)
                         │
                         ▼
                    PERMANENTLY_FAILED
```

**No in-memory state.** The queue is a database table:
```sql
CREATE TABLE enrichment_queue (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  concept_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'QUEUED',
  attempt INT DEFAULT 0,
  session_id TEXT,
  dispatched_at TIMESTAMP,
  completed_at TIMESTAMP,
  error TEXT,
  UNIQUE(tenant_id, concept_id)
);
```

Any backend instance can pick up work. No `runningExecutions` Set. No lost state on restart.

### 3.4 Tenant Onboarding Flow

```
setupCompany(tenantId, companyName, industry, description)
  │
  ├── 1. AWAIT selectConcepts(tenantId, ...)
  │     └── AI scores concepts per category
  │     └── Creates concept records in PG
  │     └── Embeds to per-tenant Qdrant collection
  │
  ├── 2. AWAIT provisionVault(tenantId, ...)
  │     └── Creates vault structure via VaultStorage
  │     └── Writes all templates (SCHEMA, PROTOCOL, GUARDRAILS, SOUL, etc.)
  │     └── Verifies all files exist
  │
  ├── 3. AWAIT verifySetup(tenantId)
  │     └── Checks PG concepts exist
  │     └── Checks Qdrant collection exists
  │     └── Checks vault files exist
  │     └── Checks SOUL.md is correct
  │     └── FAILS if any check fails (no partial state)
  │
  └── 4. RETURN success
        └── completeOnboarding triggers maturity engine
        └── maturityEngine.initializeStage AWAITS concept count stabilization
        └── Enrichment queue populated
        └── Pipeline starts processing
```

**Every step is AWAITED. No fire-and-forget.**

### 3.5 Content Delivery

```
User clicks concept in tree
  │
  ├── Frontend: GET /api/v1/knowledge/concepts/{id}
  │
  ├── Backend: KnowledgeController.getConcept(id)
  │     ├── Read metadata from PG (name, slug, tier, confidence)
  │     ├── Read content from VaultStorage.readFile(tenantId, slug)
  │     └── Return merged response
  │
  └── Frontend: Renders markdown content
```

**Vault is the source of truth for content. PG is metadata only.**

### 3.6 Tenant Isolation

```
Every data operation includes tenantId:

PG queries:        WHERE tenantId = ?
Qdrant searches:   collection = concepts-{tenantId}
Vault reads:       /root/.openclaw-{tenantId}/vault/
OpenClaw calls:    tenantProfile = tenantId
Bridge API:        body.tenantId (not env default)
Proposals:         tenantId from authenticated session
Messages:          scoped to user's tenant
Tree/Graph:        filtered by tenant concepts only
```

**No global defaults. No cross-tenant fallbacks.**

## 4. OpenClaw Configuration Management

### 4.1 Repo Structure (Source of Truth)

```
openclaw-config/
├── platform-config.yaml          # All configurable values
├── agents/                       # Base agent SOUL.md files (neutral)
│   ├── main/SOUL.md             # Neuron OS agent (no tenant-specific content)
│   ├── research/SOUL.md
│   ├── content/SOUL.md
│   ├── marketing/SOUL.md
│   ├── financial/SOUL.md
│   ├── sales/SOUL.md
│   ├── designer/SOUL.md
│   └── dev/SOUL.md
├── templates/vault/              # Templates for per-tenant vault files
│   ├── SCHEMA.template.md       # Article structure ({{companyName}} placeholders)
│   ├── TENANT-PROTOCOL.template.md  # Machine-readable agent rules
│   ├── GUARDRAILS.template.md   # Validation checkpoints
│   ├── SOUL.template.md         # Vault mode agent rules
│   ├── FLOW.template.md         # Pipeline documentation
│   └── bootstrap.template.md   # Tenant onboarding mandate
├── skills/                       # Platform-wide learned procedures
│   └── enrichment-procedure.md  # How to enrich (applies to ALL tenants)
└── deploy/
    └── setup-relay.sh           # Recreates OpenClaw from scratch
```

### 4.2 Template Resolution

```typescript
class TemplateService {
  resolve(templatePath: string, variables: Record<string, string>): string {
    let content = readFileSync(templatePath, 'utf-8');
    for (const [key, value] of Object.entries(variables)) {
      content = content.replaceAll(`{{${key}}}`, value);
    }
    return content;
  }
}
```

All templates use `{{placeholder}}` syntax. The provisioner resolves them at deploy time.

### 4.3 Environment Reproduction

```bash
# To create a new OpenClaw environment:
./openclaw-config/deploy/setup-relay.sh <host> <ssh-key>

# This copies:
# 1. All base agent SOUL.md files
# 2. Platform skills
# 3. Vault templates (for reference)
# 4. Platform config
# Result: identical agent behavior on any machine
```

## 5. Tenant Onboarding Contract

**Guarantee:** When a new tenant onboards, the system produces an identical, fully functional environment — regardless of whether it's tenant #1 or tenant #10,000.

### 5.1 What "Fully Configured" Means

Every tenant onboarding produces and VERIFIES all of the following before returning success:

```
BACKEND (PostgreSQL)
├── tenant record (status: ACTIVE)
├── user record (linked to tenant)
├── tenant_registry record
├── N concepts (balanced across categories, English names, relevance >= 0.70)
├── N stage_concept_assignments (status: QUEUED)
├── N conversations (one per concept)
├── N notes (noteType: TASK, one per concept)
└── VERIFIED: all counts match, all FKs valid

QDRANT
├── collection concepts-{tenantId} exists (status: green)
├── N points embedded (one per concept)
├── each point has: tenantId, name, category, departmentTags in payload
└── VERIFIED: point count matches PG concept count

VAULT (Obsidian on relay)
├── /root/.openclaw-{tenantId}/vault/
│   ├── SCHEMA.md (contains company name, 9 sections defined)
│   ├── TENANT-PROTOCOL.md (contains tenantId, language: ENGLISH, session strategy)
│   ├── GUARDRAILS.md (validation checkpoints)
│   ├── FLOW.md (pipeline documentation)
│   ├── index.md (N concept entries, all status: placeholder)
│   ├── log.md (vault-created entry)
│   ├── wikilink-map.md (N slug→path mappings)
│   ├── instructions/bootstrap.md (company profile)
│   ├── instructions/tenant-config.md (style rules)
│   └── wiki/concepts/ (empty, ready for enrichment)
├── VERIFIED: all files exist and have content > 0 bytes

OPENCLAW AGENTS
├── /root/.openclaw-{tenantId}/agents/main/agent/SOUL.md
│   ├── Contains: ENGLISH enforcement as first rule
│   ├── Contains: correct tenantId
│   ├── Contains: correct vault path
│   ├── Does NOT contain: any other tenant's data
│   └── VERIFIED: content matches template with resolved variables
├── /root/.openclaw-{tenantId}/tools/qdrant-search.sh (executable)
├── /root/.openclaw-{tenantId}/config/qdrant.env (credentials)
├── /root/.openclaw/workspace/{tenantId}-vault → symlink to vault
└── VERIFIED: all files exist, symlink resolves, qdrant.env has valid host

ENRICHMENT PIPELINE
├── enrichment_queue has N entries (status: QUEUED)
├── maturity stage set to BASIC
├── execution ready to start (no stale locks)
└── VERIFIED: queue count matches concept count
```

### 5.2 Onboarding Verification Service

```typescript
class OnboardingVerificationService {
  /**
   * Called AFTER all provisioning steps complete.
   * Returns { verified: true } ONLY if every check passes.
   * If ANY check fails, returns { verified: false, failures: [...] }
   * and the onboarding is marked as FAILED (not ACTIVE).
   */
  async verifyTenantSetup(tenantId: string): Promise<VerificationResult> {
    const checks: Check[] = [];
    
    // PostgreSQL checks
    checks.push(await this.checkConceptCount(tenantId));
    checks.push(await this.checkAssignmentCount(tenantId));
    checks.push(await this.checkConversationCount(tenantId));
    checks.push(await this.checkTaskCount(tenantId));
    
    // Qdrant checks
    checks.push(await this.checkQdrantCollection(tenantId));
    checks.push(await this.checkQdrantPointCount(tenantId));
    
    // Vault checks (via VaultStorage)
    checks.push(await this.checkVaultFiles(tenantId));
    checks.push(await this.checkSoulMd(tenantId));
    checks.push(await this.checkSymlink(tenantId));
    checks.push(await this.checkQdrantEnv(tenantId));
    
    // Cross-system consistency
    checks.push(await this.checkConceptCountsMatch(tenantId));
    // PG concepts == Qdrant points == index.md entries
    
    // Tenant isolation
    checks.push(await this.checkNoLeakedContent(tenantId));
    // SOUL.md doesn't reference other tenants
    // Proposals don't link to other tenants' concepts
    
    const failures = checks.filter(c => !c.passed);
    return {
      verified: failures.length === 0,
      checks,
      failures,
    };
  }
}
```

### 5.3 The Contract Test

```typescript
describe('Tenant Onboarding Contract', () => {
  // This test creates a real tenant and verifies EVERYTHING
  it('produces a fully functional tenant environment', async () => {
    const tenantId = await createTestTenant();
    
    // Run the same verification that production onboarding runs
    const result = await verificationService.verifyTenantSetup(tenantId);
    
    expect(result.verified).toBe(true);
    expect(result.failures).toHaveLength(0);
    
    // Verify enrichment can run
    const enrichResult = await enrichOneConcept(tenantId);
    expect(enrichResult.vaultArticleExists).toBe(true);
    expect(enrichResult.contentLanguage).toBe('english');
    expect(enrichResult.wordCount).toBeGreaterThan(4500);
    
    // Verify content delivery works
    const concept = await getFirstConcept(tenantId);
    const content = await fetchConceptContent(concept.id);
    expect(content.length).toBeGreaterThan(15000);
    expect(content).toContain('## Sources');
    
    // Verify tenant isolation
    const otherTenantId = await createTestTenant();
    const leak = await checkCrossTenantLeak(tenantId, otherTenantId);
    expect(leak.found).toBe(false);
    
    // Cleanup
    await deleteTestTenant(tenantId);
    await deleteTestTenant(otherTenantId);
  });
});
```

### 5.4 Deterministic Configuration

Every value that affects tenant behavior comes from ONE of these sources:

| Source | What | Example |
|---|---|---|
| **platform-config.yaml** (repo) | Platform-wide defaults | `enrichment.minWords: 4500` |
| **Environment variables** | Deployment-specific secrets | `QDRANT_API_KEY=xxx` |
| **Templates** (repo) | Agent behavior definitions | `SOUL.template.md` |
| **Skills** (repo) | Learned procedures | `enrichment-procedure.md` |
| **Tenant record** (DB) | Business-specific values | `name: "Irish Law"` |

**Nothing comes from:**
- Hardcoded strings in TypeScript
- In-memory state that doesn't survive restart
- Manual SSH commands
- Files created outside the provisioning pipeline

### 5.5 Environment Reproduction Test

```bash
# This test proves any OpenClaw environment can be recreated identically:
./openclaw-config/deploy/setup-relay.sh new-host.example.com ~/.ssh/id_ed25519

# Then run the contract test against the new environment:
RELAY_HOST=new-host.example.com npx jest --testPathPattern=onboarding-contract
```

If the contract test passes on the new environment, it's production-ready.

## 6. OpenClaw Memory Architecture

### 6.1 Principle: Zero Context Bloat

OpenClaw's session context NEVER accumulates business knowledge. All knowledge lives in two external stores:

```
OBSIDIAN VAULT (precise reads)          QDRANT (semantic discovery)
├── wiki/concepts/*.md                  ├── concepts-{tenantId} collection
│   └── Full enriched articles          │   └── Chunked vectors per section
├── wiki/skills/*.md                    ├── payload: tenantId, category,
│   └── Learned procedures              │            departmentTags, tier
├── instructions/tenant-config.md       └── filtered by tenantId + role
│   └── Business profile
├── index.md
│   └── What exists, what's enriched
└── log.md
    └── What was done, when
```

### 6.2 Session Strategy

```
Per enrichment task, OpenClaw's context contains ONLY:
1. Current task: { concept, category, tenantId, vaultPath }  (~200 tokens)
2. TENANT-PROTOCOL.md (read once per session)                (~2000 tokens)
3. SCHEMA.md (read once per session)                          (~1500 tokens)
4. tenant-config.md (read once per session)                   (~500 tokens)
5. Current concept's research results (from web_search)       (~3000 tokens)
6. Current article being written                              (~8000 tokens)
Total: ~15,000 tokens per task

What is NOT in context:
- Previous concepts' articles (read from vault if needed)
- Previous conversations (search Qdrant if needed)
- Business profile details beyond tenant-config.md
- Other tenants' data
- Accumulated session history from prior concepts
```

### 6.3 Cross-Concept Knowledge via Vault

When enriching concept B and needing to reference concept A:
1. OpenClaw reads `vault/wiki/concepts/concept-a.md` (precise read)
2. Or searches Qdrant: `memory_search(tenantId, "concept A topic")` (semantic)
3. Extracts the relevant section
4. Uses it in concept B's article via `[[concept-a]]` wikilink
5. Does NOT hold concept A's full article in session context

### 6.4 Role-Based Vector Filtering

Qdrant payload includes `departmentTags` per chunk. When a user with role=CMO asks a question:
```
search(
  collection: concepts-{tenantId},
  filter: { departmentTags: { any: ["Marketing", "all"] } },
  query: user's question
)
```
Result: only Marketing-relevant concept chunks, not Finance or Operations content.

### 6.5 Compaction Protocol

After every 20 enrichments in a persistent session:
1. OpenClaw writes a summary of key decisions/patterns to `vault/wiki/skills/session-learnings.md`
2. Clears accumulated session history
3. Reads `log.md` to know what's done
4. Continues with clean context + vault-backed knowledge

This prevents the 192K context overflow that crashed the relay.

## 7. Agent Configuration Determinism

### 7.1 Every Agent is Fully Defined in Config

Each OpenClaw agent has a complete, reproducible configuration:

```
openclaw-config/agents/{agent-id}/
├── SOUL.md                    # Identity, rules, capabilities
├── skills/                    # Learned procedures for this agent role
│   ├── research-methods.md   # How to research (sources, queries)
│   ├── writing-style.md      # Output formatting, tone
│   └── tool-usage.md         # Which tools, how to call them
├── context-injection.yaml     # What context to inject per task
└── guardrails.yaml            # Agent-specific validation rules
```

### 7.2 Agent Registry (Platform-Wide)

```yaml
# openclaw-config/agent-registry.yaml
agents:
  main:
    role: "Business Knowledge Writer"
    model: "deepseek/MiniMax-M2.7"
    capabilities: [web_search, read, write, edit, exec, image_synthesize]
    context_injection:
      - source: vault/TENANT-PROTOCOL.md
        when: always
      - source: vault/SCHEMA.md  
        when: enrichment_task
      - source: vault/instructions/tenant-config.md
        when: always
      - source: qdrant_search
        when: cross_reference_needed
    guardrails:
      language: english_only
      min_words: 4500
      require_sources: true
      require_frontmatter: true
      
  research:
    role: "Market Research Analyst"
    model: "deepseek/MiniMax-M2.7"
    capabilities: [web_search, read, write]
    context_injection:
      - source: vault/instructions/tenant-config.md
        when: always
      - source: vault/wiki/skills/research-methods.md
        when: always
    guardrails:
      require_citations: true
      min_sources: 5
      
  content:
    role: "Content Creator"
    model: "deepseek/MiniMax-M2.7"
    capabilities: [web_search, read, write, image_synthesize]
    context_injection:
      - source: vault/instructions/tenant-config.md
        when: always
      - source: brand_context
        when: image_generation
    guardrails:
      brand_compliance: true
      no_other_tenant_references: true

  marketing:
    role: "Marketing Strategist"
    model: "deepseek/MiniMax-M2.7"
    capabilities: [web_search, read, write]
    context_injection:
      - source: vault/instructions/tenant-config.md
        when: always
      - source: qdrant_search
        when: competitor_analysis
    guardrails:
      language: english_only
      business_specific: true

  financial:
    role: "Financial Analyst"
    model: "deepseek/MiniMax-M2.7"
    capabilities: [web_search, read, write]
    context_injection:
      - source: vault/instructions/tenant-config.md
        when: always
    guardrails:
      no_fabricated_numbers: true
      require_sources_for_data: true

  sales:
    role: "Sales Strategist"  
    model: "deepseek/MiniMax-M2.7"
    capabilities: [web_search, read, write]
    
  designer:
    role: "Visual Designer"
    model: "deepseek/MiniMax-M2.7"
    capabilities: [image_synthesize, read, write]
    context_injection:
      - source: brand_context
        when: always
        
  dev:
    role: "Technology Advisor"
    model: "deepseek/MiniMax-M2.7"
    capabilities: [web_search, read, write, exec]
```

### 7.3 Per-Tenant Agent Provisioning

When a tenant onboards, each agent gets:

```
/root/.openclaw-{tenantId}/agents/{agent-id}/agent/SOUL.md
```

Generated by: `TemplateService.resolve(agentRegistry[id].soulTemplate, tenantVars)`

The SOUL.md includes:
1. Agent identity from registry (role, capabilities)
2. Tenant-specific context (company name, industry, brand)
3. Skills from `openclaw-config/agents/{id}/skills/`
4. Guardrails from registry
5. Context injection rules from registry

### 7.4 Spawn Test

```typescript
describe('Agent Determinism', () => {
  it('produces identical SOUL.md for same tenant config', () => {
    const config = { companyName: 'Test Corp', industry: 'Tech', tenantId: 'tnt_test' };
    
    const soul1 = templateService.resolveAgentSoul('main', config);
    const soul2 = templateService.resolveAgentSoul('main', config);
    
    expect(soul1).toBe(soul2); // Byte-identical
  });
  
  it('produces different SOUL.md for different tenants', () => {
    const config1 = { companyName: 'Irish Law', industry: 'Legal', tenantId: 'tnt_a' };
    const config2 = { companyName: 'LSA', industry: 'Art', tenantId: 'tnt_b' };
    
    const soul1 = templateService.resolveAgentSoul('main', config1);
    const soul2 = templateService.resolveAgentSoul('main', config2);
    
    expect(soul1).not.toBe(soul2);
    expect(soul1).toContain('Irish Law');
    expect(soul2).toContain('LSA');
    expect(soul1).not.toContain('LSA');
    expect(soul2).not.toContain('Irish Law');
  });
  
  for (const agentId of ['main', 'research', 'content', 'marketing', 'financial', 'sales', 'designer', 'dev']) {
    it(`agent ${agentId} has complete config in registry`, () => {
      const agent = agentRegistry[agentId];
      expect(agent.role).toBeTruthy();
      expect(agent.model).toBeTruthy();
      expect(agent.capabilities.length).toBeGreaterThan(0);
    });
  }
});
```

### 7.5 Reproduction Guarantee

```
Same repo config + same tenant data = same agent behavior

Because:
- SOUL.md is generated from template + tenant vars (deterministic)
- Skills are in repo (version-controlled)
- Context injection rules are in registry (version-controlled)
- Guardrails are in registry (version-controlled)
- Business context comes from tenant record (in DB)
- All external knowledge comes from vault + Qdrant (not from agent memory)
```

## 8. MCP Server — Guardrail Enforcement Layer

### 8.1 Why MCP

OpenClaw is an LLM agent. It CAN and DOES ignore SOUL.md instructions:
- Writes in Serbian despite "ENGLISH ONLY" rule
- Spawns sub-agents despite restrictions
- Uses wrong tenant context despite isolation rules
- Skips reading TENANT-PROTOCOL.md

**SOUL.md = suggestions. MCP = enforcement.**

The agent physically cannot bypass guardrails because every operation goes through our MCP server which validates before executing.

### 8.2 MCP Tool Registry (Current Scope)

```yaml
# MCP tools exposed by our NestJS backend
tools:
  # ── VAULT OPERATIONS ──
  vault_read:
    description: "Read a concept article from tenant vault"
    params: { tenantId: string, slug: string }
    guardrails:
      - validates tenantId matches current session
      - returns ONLY this tenant's content
      - never returns other tenant data
    
  vault_write:
    description: "Write enriched concept article to tenant vault"
    params: { tenantId: string, slug: string, content: string }
    guardrails:
      - validates content is English (rejects Serbian characters)
      - validates word count >= 4500
      - validates YAML frontmatter present
      - validates Sources section present
      - validates dept tags present
      - validates no other tenant references
      - ONLY writes if ALL checks pass
      - returns specific error for each failed check
    
  vault_index_update:
    description: "Update index.md to mark concept as enriched"
    params: { tenantId: string, slug: string, stage: string }
    guardrails:
      - validates article exists before allowing status change
      - validates stage transition is valid (placeholder→episodic→semantic)
    
  vault_log:
    description: "Add entry to operation log"
    params: { tenantId: string, concept: string, action: string, note: string }
    guardrails:
      - validates tenantId
      - appends only, never overwrites
    
  # ── KNOWLEDGE RETRIEVAL ──
  knowledge_search:
    description: "Semantic search across tenant knowledge base"
    params: { tenantId: string, query: string, limit: int, departmentFilter?: string[] }
    guardrails:
      - searches ONLY concepts-{tenantId} Qdrant collection
      - applies department filter if user role requires it
      - never returns cross-tenant results
    
  knowledge_get_config:
    description: "Get tenant business profile and configuration"
    params: { tenantId: string }
    guardrails:
      - returns ONLY this tenant's config
      - includes: company name, industry, description, brand
    
  knowledge_get_schema:
    description: "Get article structure requirements"
    params: { tenantId: string }
    guardrails:
      - returns SCHEMA.md content for this tenant
    
  # ── TASK MANAGEMENT ──
  task_complete:
    description: "Mark enrichment task as completed"
    params: { tenantId: string, conceptId: string, articlePath: string }
    guardrails:
      - reads the article from vault
      - runs ALL content validations (language, words, structure)
      - updates PG metadata (confidence, tier)
      - updates Qdrant embedding
      - ONLY marks complete if ALL validations pass
      - returns validation errors if any check fails
    
  task_get_next:
    description: "Get next concept to enrich from queue"
    params: { tenantId: string }
    guardrails:
      - returns ONLY concepts from enrichment queue
      - respects dependency ordering
      - marks concept as DISPATCHED (prevents double-pick)
```

### 8.3 MCP Server Implementation

```typescript
// NestJS MCP Controller — exposed as MCP endpoint for OpenClaw
@Controller('mcp/v1')
export class McpToolController {
  
  @Post('vault_write')
  async vaultWrite(@Body() params: VaultWriteParams): Promise<McpResult> {
    // 1. Validate tenant
    const tenantCheck = await this.tenantGuard.validateTenantId(params.tenantId, 'vault_write');
    if (!tenantCheck.valid) return { error: tenantCheck.error };
    
    // 2. Validate content (ENFORCED — agent cannot bypass)
    const contentCheck = this.tenantGuard.validateContent(params.content);
    if (!contentCheck.valid) {
      return { 
        error: 'Content validation failed',
        details: contentCheck.errors,
        action: 'Fix the specific errors and call vault_write again'
      };
    }
    
    // 3. Write to vault
    await this.vaultStorage.writeFile(params.tenantId, `wiki/concepts/${params.slug}.md`, params.content);
    
    // 4. Update PG + Qdrant
    await this.syncToDatabase(params.tenantId, params.slug, params.content);
    
    return { success: true, path: `wiki/concepts/${params.slug}.md` };
  }
}
```

### 8.4 OpenClaw Tool Configuration

```json
// Added to openclaw.json — OpenClaw discovers these tools via MCP
{
  "mcpServers": {
    "neuron-os": {
      "url": "http://{BACKEND_HOST}:{BACKEND_PORT}/mcp/v1",
      "auth": "Bearer {MCP_AUTH_TOKEN}",
      "tools": ["vault_read", "vault_write", "vault_index_update", "vault_log",
                 "knowledge_search", "knowledge_get_config", "knowledge_get_schema",
                 "task_complete", "task_get_next"]
    }
  }
}
```

### 8.5 Agent Workflow with MCP

```
Before (suggestions — agent can ignore):
  SOUL.md says "read SCHEMA.md" → agent might skip
  SOUL.md says "write in English" → agent might write Serbian
  SOUL.md says "validate before saving" → agent might skip validation

After (MCP enforcement — agent cannot bypass):
  Agent calls: task_get_next(tenantId) → gets concept + schema + config in one call
  Agent does: web_search, writes article
  Agent calls: vault_write(tenantId, slug, content)
    → MCP server validates language ✅ or ❌
    → MCP server validates word count ✅ or ❌
    → MCP server validates structure ✅ or ❌
    → If ❌: returns specific errors, agent MUST fix
    → If ✅: writes to vault, syncs PG + Qdrant, returns success
  Agent calls: task_complete(tenantId, conceptId, path)
    → MCP server verifies article exists and passes all checks
    → Updates status in DB
```

**The agent never directly accesses the filesystem, database, or Qdrant. Everything goes through MCP with guardrails.**

## 9. Testing Strategy

### 5.1 Test Layers

```
Layer 1: Unit Tests (per service)
├── PlatformConfigService — config resolution, defaults, env overrides
├── VaultStorage — file operations (mock SSH)
├── TenantGuardService — content validation, tenant checks
├── TemplateService — placeholder resolution
└── EnrichmentQueue — state machine transitions

Layer 2: Integration Tests (per pipeline step)
├── Onboarding → concepts created + vault provisioned + verified
├── Enrichment dispatch → task sent to relay correctly
├── Vault read → content returned from correct tenant vault
├── Guardrail validation → catches Serbian, short content, missing sections
├── Guardrail correction → sends fix request, re-validates
└── Content delivery → endpoint returns vault content

Layer 3: System Tests (end-to-end)
├── Full onboarding flow (tenant A)
├── Full enrichment of 1 concept (tenant A)
├── Verify no cross-tenant leaks (tenant A data not in tenant B)
├── Verify vault, PG, Qdrant all consistent
└── Verify UI shows correct data

Layer 4: Configuration Tests (forensics)
├── All env vars set correctly
├── All vault templates exist in repo
├── Base SOUL.md is neutral (no tenant-specific content)
├── Relay is reachable and responds
├── Qdrant collections accessible
└── SSH connectivity verified
```

### 5.2 Forensics Script (run before every deploy)

```bash
npx jest apps/api/src/app/vault/full-system.spec.ts --no-cache
# Must pass ALL checks before deploying
```

## 6. Migration Path

### Phase 1: Foundation (Current Sprint)
- [ ] Extract PlatformConfigService with all values from .env
- [ ] Implement VaultStorage abstraction (SSH implementation)
- [ ] Replace all hardcoded values with config
- [ ] Replace fire-and-forget with awaited calls
- [ ] Replace in-memory locks with DB queue
- [ ] All unit tests passing

### Phase 2: Pipeline Hardening
- [ ] Enrichment state machine with DB-backed queue
- [ ] Guardrail validation + correction loop
- [ ] Content delivery from vault
- [ ] Full integration tests

### Phase 3: Scale Preparation
- [ ] S3 vault storage implementation
- [ ] Redis-backed distributed locks
- [ ] Multiple OpenClaw relay support
- [ ] Horizontal backend scaling
- [ ] Load testing with 100+ concurrent tenants

## 7. Non-Negotiable Rules

1. **No hardcoded values** — every value from config
2. **No fire-and-forget** — every async operation awaited or queued
3. **No in-memory state** — database or Redis for coordination
4. **No silent failures** — every error logged with context
5. **No cross-tenant access** — every query scoped by tenantId
6. **No legacy fallbacks** — remove old code paths entirely
7. **Vault is truth** — content reads from vault, not PG
8. **Config in repo** — every OpenClaw setting version-controlled
9. **Tests before deploy** — forensics must pass
10. **OpenClaw aligned** — every change agreed with OpenClaw first
