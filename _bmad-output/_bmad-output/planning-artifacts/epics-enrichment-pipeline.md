---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories']
status: 'stories-complete-v2'
totalEpics: 6
totalStories: 32
frCoverage: '24/24'
nfrCoverage: '10/10'
arCoverage: '4/4'
reviewPasses:
  architect_winston: 'conditional-pass -> issues-resolved'
  tea_murat: 'conditional-pass -> issues-resolved'
  dev_amelia: 'conditional-pass -> issues-resolved'
inputDocuments:
  - "_bmad-output/planning-artifacts/architecture-enrichment-pipeline.md"
  - "_bmad-output/planning-artifacts/prd-v2-autonomous-brain-architecture.md"
project_name: 'Neuron OS — Enrichment Pipeline'
date: '2026-04-15'
scope: 'Full Journey: Tenant Creation -> Onboarding -> Enrichment -> Content Delivery'
---

# Neuron OS Enrichment Pipeline — Epic Breakdown

## Overview

Full journey coverage: user creates tenant -> concepts selected -> vault provisioned -> onboarding verified -> enrichment queue populated -> maturity engine triggers -> each concept enriched by OpenClaw -> each article validated + corrected -> PG + Qdrant synced -> user sees content -> zero cross-tenant leakage.

32 stories across 6 epics. Every story has tests. Every review finding resolved.

## Requirements Inventory

### Functional Requirements

- FR1: PlatformConfigService resolves config from env vars, config.yaml, and DB (priority order)
- FR2: No hardcoded values in any service
- FR3: VaultStorage abstraction with SSH, S3, and local implementations
- FR4: VaultStorage.writeFiles() uses single SSH connection for batch operations
- FR5: TemplateService resolves {{placeholder}} syntax in all vault templates
- FR6: All vault templates version-controlled with defined content
- FR7: NestJS backend exposed as MCP server with guardrail-enforced tools
- FR8: vault_write validates language, word count, structure before writing
- FR9: task_complete validates article, updates PG + Qdrant, only marks complete if checks pass
- FR10: Agent Registry defines all 8 agents with roles, capabilities, skills, guardrails
- FR11: Per-tenant agent provisioning generates SOUL.md from templates + tenant vars
- FR12: Onboarding AWAITs all steps (no fire-and-forget)
- FR13: OnboardingVerificationService checks PG, Qdrant, vault, SOUL.md, symlinks
- FR14: Concept selection uses balanced categories with relevance >= 0.70
- FR15: Enrichment queue backed by DB with state machine
- FR16: Guardrail validation + correction loop (max 2 retries)
- FR17: Persistent session per tenant with compaction every 20 concepts
- FR18: Content delivery reads from vault (source of truth)
- FR19: Per-tenant Qdrant collections with department-tag filtering
- FR20: Tenant isolation at every data path
- FR21: knowledge_search searches only tenant's collection with role filtering
- FR22: Configurable enrichment timeout
- FR23: Vault-read-after-write regardless of result.success
- FR24: Legacy cleanup: no premature COMPLETED, no stale paths

### NonFunctional Requirements

- NFR1: No in-memory locks, all state in DB
- NFR2: Idempotent operations
- NFR3: Observable pipeline with structured logging
- NFR4: Environment reproducible from repo + script
- NFR5: Max 1 SSH connection per batch
- NFR6: ~15K tokens per enrichment task
- NFR7: 10,000+ tenant support
- NFR8: All tests pass per story
- NFR9: Zero cross-tenant leakage
- NFR10: Deterministic agents

### Additional Requirements

- AR1: MCP spike before full build
- AR2: setup-relay.sh recreates environment
- AR3: Forensics updated per epic
- AR4: Contract test covers full journey

### FR Coverage Map

| Req | Epic | Stories |
|---|---|---|
| FR1 | E1 | 1.1 |
| FR2 | E1 | 1.6 |
| FR3-4 | E1 | 1.2, 1.3, 1.4 |
| FR5-6 | E1 | 1.5 |
| FR7 | E2 | 2.1, 2.3 |
| FR8, FR21 | E2 | 2.4 |
| FR9 | E2 | 2.5 |
| FR10 | E2 | 2.6 |
| FR11 | E2 | 2.7 |
| FR12 | E3 | 3.5 |
| FR13 | E3 | 3.4 |
| FR14 | E3 | 3.2 |
| FR15 | E1, E4 | 1.7, 4.1, 4.2 |
| FR16 | E4 | 4.3 |
| FR17 | E4 | 4.5 |
| FR18 | E5 | 5.1 |
| FR19 | E5 | 5.2 |
| FR20 | E5 | 5.3 |
| FR22 | E4 | 4.1 |
| FR23 | E4 | 4.3 |
| FR24 | E4 | 4.6 |
| AR1 | E2 | 2.1 |
| AR2 | E1 | 1.8 |
| AR3 | E6 | 6.1 |
| AR4 | E6 | 6.2 |

## Epic List

1. **E1: Platform Foundation** — Config, VaultStorage, templates, queue schema, hardcoded elimination, deploy
2. **E2: Agent Enforcement Layer** — MCP spike, shared validation, MCP server + 9 tools, Agent Registry, provisioning
3. **E3: Tenant Onboarding Pipeline** — Registration, selection, scaffolding, verification, orchestrator+rollback
4. **E4: Enrichment Engine** — Executor, queue processor+reaper, guardrails, maturity engine, sessions, cleanup
5. **E5: Content Delivery & Isolation** — Vault reads, Qdrant sync, isolation
6. **E6: System Validation** — Forensics, contract test, consistency check

---

## Epic 1: Platform Foundation

**Goal:** Shared infrastructure with zero external dependencies. Config, storage, templates, queue schema, deploy.

---

### Story 1.1: PlatformConfigService

As a **platform operator**, I want all config resolved from env + yaml with typed accessors, so no service has hardcoded values.

**AC:**

**Given** `openclaw-config/platform-config.yaml` with sections: relay, vault, qdrant, enrichment, timeouts
**When** PlatformConfigService initializes as singleton
**Then** merges env (priority 1) over yaml (priority 2)
**And** `getRelayConfig()` -> `{ host, port, authToken, timeoutSeconds }`
**And** `getVaultConfig(tenantId)` -> `{ storageBackend, sshHost, sshUser, sshKeyPath, basePath }` with tenantId interpolated
**And** `getQdrantConfig()` -> `{ host, apiKey, collectionPrefix, vectorDimension }`
**And** `getEnrichmentConfig()` -> `{ concurrency, sessionStrategy, compactionInterval, maxRetries, guardrails: { minWords, minChars, language, requireSources, requireFrontmatter } }`
**And** `getTimeouts()` -> `{ enrichmentTimeout, sshTimeout, relayTimeout }`
**And** missing required key throws `ConfigurationError` with key name and hint
**And** exported via `PlatformConfigModule`

**This story creates:** `openclaw-config/platform-config.yaml` with all sections and `${ENV_VAR:default}` syntax.

**Tests:** env override, yaml default, missing key error, tenantId interpolation, guardrail fields, timeout fields, singleton check.

---

### Story 1.2: VaultStorage Interface + SshVaultStorage

As a **backend dev**, I want file I/O behind an interface so storage is swappable.

**AC:**

**Given** `VaultStorage` interface: `writeFile(tenantId, path, content)`, `readFile(tenantId, path)`, `fileExists(tenantId, path)`, `listFiles(tenantId, dir)`, `writeFiles(tenantId, Map<string,string>)`, `createDirectories(tenantId, string[])`
**When** `SshVaultStorage` implements it
**Then** paths resolve via `PlatformConfigService.getVaultConfig(tenantId).basePath` + `/{path}`
**And** `writeFiles` opens ONE SSH connection, one SFTP session, writes all, closes
**And** `createDirectories` uses single `mkdir -p` exec
**And** connection config from PlatformConfigService
**And** throws `VaultStorageError { tenantId, path, operation, cause }`
**And** path sanitization in base class: any path with `..` or starting with `/` throws `VaultStorageError('Path traversal blocked')`

**Tests:** single connection (mock assert), mkdir joins paths, error context, path traversal blocked.

---

### Story 1.3: LocalVaultStorage

As a **dev writing tests**, I want local filesystem VaultStorage for fast, isolated tests.

**AC:**

**Given** `LocalVaultStorage` implements VaultStorage
**When** used in tests (`NODE_ENV=test` or `storageBackend: local`)
**Then** reads/writes to `{tempDir}/{tenantId}/vault/{path}`
**And** each test instance gets isolated temp dir
**And** inherits path traversal protection from base class
**And** `VaultStorageFactory` returns correct impl per config

**Tests:** write+read round-trip, fileExists false->true, path traversal blocked, factory returns correct type.

---

### Story 1.4: TemplateService

As a **platform operator**, I want templates resolved with strict placeholder checking.

**AC:**

**Given** templates at `openclaw-config/templates/vault/` with `{{key}}` syntax
**When** `resolve(templateName, vars)` called
**Then** replaces all `{{key}}` with values
**And** throws `TemplateResolutionError` listing unresolved placeholders if any remain
**And** `resolveAll(vars)` resolves all 6 templates -> `Map<filename, content>`
**And** deterministic: same inputs = identical output

**Tests:** resolves correctly, missing var throws with name, resolveAll returns 6, determinism, special chars in tenant name (`O'Brien & Sons`), each real template resolves with sample data.

---

### Story 1.5: Template File Authoring

As a **platform operator**, I want all 6 vault templates authored with production content.

**AC:**

**Given** templates created at `openclaw-config/templates/vault/`
**Then** SCHEMA.template.md: 9 sections, 5000+ word req, dept tags, `{{companyName}}`/`{{industry}}`
**And** TENANT-PROTOCOL.template.md: ALL_OUTPUT_ENGLISH STRICT, session PERSISTENT, compaction 20, isolation rules, `{{tenantId}}`
**And** GUARDRAILS.template.md: Checkpoint 1 (before write), Checkpoint 2 (after write), Correction Protocol max 2
**And** SOUL.template.md: ENGLISH first rule, `{{companyName}}`, vault path with `{{tenantId}}`, Neuron OS role
**And** FLOW.template.md: enrichment pipeline documentation
**And** bootstrap.template.md: onboarding mandate with `{{companyName}}`, `{{industry}}`, `{{description}}`
**And** all use only `{{placeholder}}` syntax, all placeholders from known set

**Tests:** each file exists > 100 bytes, all placeholders from known set, SCHEMA has 9 sections, no hardcoded tenant IDs.

---

### Story 1.6: Hardcoded Value Elimination

As a **platform operator**, I want zero hardcoded IPs/IDs/timeouts in service code.

**AC:**

**Given** existing hardcoded: `91.98.231.87`, `tnt_rljn1gj4cgxoph0hxfohv6l4`, `/root/.openclaw-`, `3100`, `600`
**When** refactored
**Then** each service injects PlatformConfigService and VaultStorage
**And** grep for those values in `apps/api/src/` returns 0 matches (excluding test fixtures)

**Tests:** grep validation script, each service constructs with mock config.

---

### Story 1.7: Enrichment Queue Schema + State Machine

As a **platform operator**, I want queue in DB so no state lost on restart and onboarding/enrichment share it.

**AC:**

**Given** Prisma migration: `enrichment_queue` (id, tenant_id, concept_id, status, attempt, max_attempts=3, session_id, dispatched_at, completed_at, failed_at, error, created_at, updated_at, UNIQUE(tenant_id, concept_id))
**When** `EnrichmentQueueService` created
**Then** `enqueue(tenantId, conceptId)` upsert QUEUED (idempotent)
**And** `enqueueBatch(tenantId, conceptIds[])` single transaction
**And** `dequeue(tenantId)` atomic select+update QUEUED->DISPATCHED (`FOR UPDATE SKIP LOCKED`)
**And** transitions: DISPATCHED->EXECUTING, EXECUTING->VALIDATING, VALIDATING->COMPLETED(+completed_at), VALIDATING->CORRECTING, CORRECTING->VALIDATING, any->FAILED(+attempt++, failed_at), FAILED->QUEUED (via retryFailed if attempt < max)
**And** `retryFailed(tenantId)` re-enqueues FAILED below max_attempts
**And** invalid transitions throw `InvalidStateTransitionError`
**And** `getQueueStats(tenantId)` -> counts per status

**Tests:** enqueue, idempotent, enqueueBatch, dequeue atomic (integration with real PG), valid transitions, invalid throw, retryFailed, getQueueStats.

---

### Story 1.8: Deploy Script + Automated Test

As a **platform operator**, I want idempotent deploy script with CI-runnable test.

**AC:**

**Given** `setup-relay.sh <host> <ssh-key>`
**Then** copies agents, skills, creates workspace, reads from platform-config.yaml
**And** idempotent, exits non-zero on failure, logs with timestamps

**Automated test:** Docker Alpine container, run script, verify files, run again = no changes.

**Tests:** syntax check, no hardcoded IPs, Docker integration.

---

## Epic 2: Agent Enforcement Layer

**Goal:** OpenClaw cannot bypass guardrails. All 9 MCP tools enforced. Agent behavior deterministic.

**Depends on:** E1

---

### Story 2.1: MCP Spike

As a **tech lead**, I want proof OpenClaw can call our MCP tools before building the full layer.

**AC:** Minimal `/mcp/v1/ping`, OpenClaw discovers + calls it, auth works, < 2s latency.
**PIVOT GATE:** If fails, rest of E2 uses REST with same validation logic.
**Tests:** ping returns OK, missing auth 401, spike report written.

---

### Story 2.2: ContentValidationService (Shared)

As a **dev**, I want content validation in one shared service used by MCP, guardrails, and verification.

**AC:**

**Given** `ContentValidationService` injectable, reads thresholds from `PlatformConfigService.getEnrichmentConfig().guardrails`
**When** `validateContent(content)` called
**Then** checks: Serbian diacritics (č U+010D, ć U+0107, š U+0161, ž U+017E, đ U+0111), Serbian words (koji/koja/koje/može/nije/već/što/zato/između/njihov, threshold > 5), word count >= minWords, char count >= minChars, frontmatter `---`, Sources/References section, dept tags `<!-- dept:`
**And** returns `{ valid, errors[] }` with specific error per check
**And** no false positives on: image, primary, pervasive, climate, invasive
**And** thresholds configurable (not hardcoded)

**Tests:** rejects Serbian chars, rejects Serbian words, rejects short, rejects missing frontmatter, rejects missing Sources, accepts valid article, no false positives, custom thresholds work.

---

### Story 2.3: MCP Server Core

As a **backend dev**, I want MCP infra with auth, routing, tool discovery.

**AC:** McpModule at `/mcp/v1`, Bearer auth from `MCP_AUTH_TOKEN`, tenantId validated per request, `GET /tools` returns schemas, standard response format `{ success, data?, error?, details? }`.

**Tests:** missing/invalid/valid token, tool list, response format.

---

### Story 2.4: MCP Vault Tools (vault_write, vault_read, vault_index_update, vault_log)

As a **platform operator**, I want vault operations enforced with validation.

**AC:**

**vault_write:** ContentValidationService check -> reject with details or write via VaultStorage
**vault_read:** tenant-scoped path only, not-found on missing (no cross-tenant fallback)
**vault_index_update:** article must exist, stage transition forward-only (placeholder->episodic->semantic)
**vault_log:** append-only with timestamp, validates tenantId

**Tests:** write rejects bad content, write doesn't call VaultStorage on failure, read scoped, index rejects invalid transition, log appends.

---

### Story 2.5: MCP Knowledge + Task Tools (knowledge_search, knowledge_get_config, knowledge_get_schema, task_complete, task_get_next)

As a **platform operator**, I want knowledge and task lifecycle enforced through MCP.

**AC:**

**knowledge_search:** `concepts-{tenantId}` only, department filter, no cross-tenant
**knowledge_get_config:** tenant business profile from PG
**knowledge_get_schema:** SCHEMA.md from tenant vault
**task_complete:** reads vault article -> ContentValidationService -> if valid: COMPLETED + PG update + Qdrant re-embed, if invalid: returns errors, status stays EXECUTING
**task_get_next:** dequeues atomically, returns concept + schema, null on empty

**Tests:** search correct collection, search applies filter, config returns tenant data, schema reads vault, complete validates before marking, complete rejects invalid, get_next dequeues, empty queue returns null.

---

### Story 2.6: Agent Registry

As a **platform operator**, I want all 8 agents in YAML as single source of truth.

**AC:** `agent-registry.yaml` with main/research/content/marketing/financial/sales/designer/dev, each with id/role/model/capabilities/contextInjection/guardrails. `getAgent(id)`, `getAllAgents()`, unknown throws.

**Tests:** all 8 load, each has required fields, main has language guardrails, unknown throws.

---

### Story 2.7: Per-Tenant Agent Provisioning + Skills

As a **platform operator**, I want deterministic SOUL.md + skills deployed per tenant.

**AC:**

**Given** registry + templates + VaultStorage
**When** `provisionAgents(tenantId, tenantConfig)` called
**Then** generates SOUL.md per agent from template + vars, writes to vault
**And** copies skill files from `openclaw-config/agents/{id}/skills/`
**And** SOUL.md contains tenant name, ENGLISH, correct path, no other tenants, no unresolved placeholders
**And** deterministic: same inputs = identical output

**Skill files created (in repo):**
- main: enrichment-method.md
- research: research-methods.md
- content: writing-style.md
- others: minimal stubs (expanded later)

**Tests:** provisions all 8, correct tenant data, ENGLISH rule, no placeholders, determinism, different tenants differ, skills copied, missing skill dir handled gracefully.

---

## Epic 3: Tenant Onboarding Pipeline

**Goal:** Atomic onboarding: fully verified environment or clean rollback. Zero partial state.

**Depends on:** E1, E2

---

### Story 3.1: Tenant Registration

As a **new tenant**, I want my tenant created with correct status tracking.

**AC:**

**Given** user provides companyName, industry, description
**When** `createTenant(data)` called
**Then** creates tenant (status: ONBOARDING), tenant_registry, user record
**And** duplicate name returns error

**Tests:** tenant created with ONBOARDING, registry entry, user linked, duplicate errors.

---

### Story 3.2: Balanced Concept Selection + Qdrant Embedding

As a **new tenant**, I want concepts selected with balanced categories, scored for relevance, and embedded in my private Qdrant collection.

**AC:**

**Given** platform concepts exist across categories
**When** `selectInitialConcepts(tenantId, industry, description, target=80)` called
**Then** groups by category, `perCategory = max(3, floor(target / categoryCount))`
**And** AI scores each concept (LLM from config, prompt: "Rate relevance 0-1 of '{name}' for {industry}: {description}", response: `{ score, reason }`)
**And** selects score >= 0.70; if category < 3 above threshold, takes top 3 anyway
**And** creates PG records with tenantId
**And** creates Qdrant collection `concepts-{tenantId}`, generates OpenAI embeddings (text-embedding-3-small, 1536-dim)
**And** point payload: `{ tenantId, conceptId, name, category, departmentTags, status: 'pending' }`
**And** departmentTags from category mapping (Marketing -> ["Marketing", "all"])

**Edge case:** if ALL concepts score < 0.70 for a category, takes top 3 with warning log

**Tests:** balanced distribution, < 0.70 excluded (except min 3), Qdrant collection created, payload has departmentTags, category mapping correct, zero-qualifying edge case handled.

---

### Story 3.3: Onboarding Scaffolding (Conversations, Notes, Assignments)

As a **new tenant**, I want all supporting records created so enrichment and verification have everything.

**AC:**

**Given** N concepts selected
**When** `createSupportingRecords(tenantId, concepts[])` called
**Then** creates 1 conversation per concept, 1 note per concept (noteType: TASK), stage_concept_assignments (status: QUEUED)
**And** all in single transaction (all or nothing)
**And** all records have correct tenantId

**Tests:** counts match, noteType TASK, assignment QUEUED, correct tenantId, partial failure rolls back.

---

### Story 3.4: OnboardingVerificationService

As a **platform operator**, I want every onboarding verified across all systems.

**AC:**

**Given** tenant completed selection, scaffolding, vault provisioning
**When** `verifyTenantSetup(tenantId, expectedCount)` called
**Then** checks:

**PG:** concepts == expected (correct tenantId), conversations == expected, notes == expected (TASK), assignments == expected (QUEUED)
**Qdrant:** collection exists, points == expected, sample point has tenantId + departmentTags
**Vault:** 9 files exist > 0 bytes, SOUL.md has tenantId + ENGLISH + no other tenant refs, symlink resolves
**Cross-system:** PG == Qdrant == index.md counts

**Returns** `{ verified, checks[], failures[{ check, expected, actual, message }] }`

**Tests:** passes when all good, fails on each individual check type, failure includes details.

---

### Story 3.5: Onboarding Orchestrator + Rollback

As a **new tenant**, I want atomic onboarding: working environment or clean rollback.

**AC:**

**Given** all sub-services available
**When** `onboardTenant(tenantId, companyName, industry, description)` called
**Then** strict AWAITED sequence:
1. createTenant -> PG records
2. selectInitialConcepts -> PG concepts + Qdrant
3. createSupportingRecords -> conversations + notes + assignments
4. provisionVault -> vault files + agent SOUL.md + symlinks (VaultProvisioning + AgentProvisioning)
5. verifyTenantSetup -> cross-system check
6. If verified: enqueueBatch -> populate enrichment_queue, set ACTIVE, trigger maturity engine
7. If failed: rollback -> delete PG tenant data, delete Qdrant collection, remove vault dir, set FAILED

**Rollback covers:** PG (concepts, conversations, notes, assignments), Qdrant (delete collection), Vault (remove tenant dir)
**No fire-and-forget.** Each step awaited. Error in step 1-4 triggers immediate rollback.

**Tests:**
- Integration: full onboarding with LocalVaultStorage + test DB
- Unit: sequence enforced (step 3 skipped if step 2 throws)
- Unit: rollback on step 2 failure cleans step 1 data
- Unit: rollback on step 4 failure cleans PG + Qdrant + vault
- Unit: queue populated only after verification
- Unit: ACTIVE only on success, FAILED on failure

---

## Epic 4: Enrichment Engine

**Goal:** Process queue reliably: dispatch to OpenClaw, validate, correct, connect to maturity engine, clean legacy.

**Depends on:** E1, E2

---

### Story 4.1: Enrichment Executor

As a **platform operator**, I want config-driven, observable enrichment execution.

**AC:**

**Given** `EnrichmentExecutorService` processes one queue entry
**When** `executeEnrichment(queueEntry)` called
**Then** timeout from `configService.getTimeouts().enrichmentTimeout`
**And** relay URL from `configService.getRelayConfig()`
**And** transitions: DISPATCHED->EXECUTING (before relay), success->VALIDATING (not COMPLETED)
**And** logs: `enrichment.started`, `enrichment.relay_returned`, `enrichment.failed`
**And** timeout: FAILED with `'Relay timeout after Xs'`
**And** already-COMPLETED: no-op (idempotent)

**Tests:** timeout from config, URL from config, correct transitions, logs emitted, timeout marks FAILED, COMPLETED is no-op, success goes to VALIDATING not COMPLETED.

---

### Story 4.2: Queue Processor + Zombie Reaper

As a **platform operator**, I want continuous processing with crash recovery.

**AC:**

**Given** `QueueProcessorService`
**When** started for tenant
**Then** loops: dequeue -> execute -> validate (4.3) -> next
**And** respects `configService.getEnrichmentConfig().concurrency`
**And** stops when queue empty
**And** logs: `queue.progress { completed, remaining, failed }`

**Zombie reaper** (on startup + every 5min):
- Finds DISPATCHED/EXECUTING where `updated_at < now() - 2*enrichmentTimeout`
- Re-queues if attempt < max_attempts, else PERMANENTLY_FAILED
- Logs: `queue.zombie_reaped { conceptId, previousStatus, newStatus }`

**Tests:** loops until empty, respects concurrency, reaper finds stuck entries, reaper re-queues, reaper permanently fails at max, simulate crash + recovery.

---

### Story 4.3: Guardrail Validation + Correction Loop

As a **platform operator**, I want every article validated and corrected up to 2 times.

**AC:**

**Given** queue entry in VALIDATING
**When** validation runs
**Then** reads article from vault via VaultStorage.readFile ALWAYS (regardless of relay success, FR23)
**And** runs ContentValidationService.validateContent (shared, 2.2)
**And** PASSES: COMPLETED + PG update (confidence: 0.85, tier: 'enriched') + Qdrant re-embed (via 5.2)
**And** FAILS (attempt < max): CORRECTING -> sends correction to relay with specific errors -> reads vault again -> re-validates
**And** FAILS (attempt >= max): PERMANENTLY_FAILED with all errors
**And** no vault file: FAILED with 'No article written'

**Tests:** vault read regardless of success, valid -> COMPLETED + PG + Qdrant, invalid -> CORRECTING + correction sent with errors, max retries -> PERMANENTLY_FAILED, no file -> FAILED.

---

### Story 4.4: Maturity Engine Integration

As a **platform operator**, I want maturity engine to trigger enrichment after onboarding and track completion.

**AC:**

**Given** tenant ACTIVE with populated queue
**When** `startEnrichment(tenantId)` called (by onboarding orchestrator)
**Then** verifies ACTIVE + queue has QUEUED entries
**And** starts QueueProcessorService
**And** logs: `maturity.enrichment_started { tenantId, queuedCount }`

**When** all entries terminal (COMPLETED or PERMANENTLY_FAILED)
**Then** logs: `maturity.enrichment_complete { completed, failed }`
**And** all completed: stage = ENRICHED
**And** any failed: stage = PARTIAL + calls `retryFailed(tenantId)` for second pass
**And** uses stabilization check: 2 consecutive polls (5s) with same stats before declaring complete

**Tests:** verifies ACTIVE, verifies queue, starts processor, completion detected, retryFailed called, ENRICHED on full success, PARTIAL on failures, stabilization prevents premature completion.

---

### Story 4.5: Session Management + Compaction

As a **platform operator**, I want persistent sessions that compact to prevent context overflow.

**AC:**

**Given** `SessionManager` per tenant
**When** enrichment starts
**Then** reuses `enrichment-{tenantId}` or creates new
**And** after 20 COMPLETED: sends compaction (relay endpoint `POST /sessions/{id}/compact` or fallback task: "Write learnings to vault, read log.md, continue")
**And** config from `configService.getEnrichmentConfig().sessionStrategy/compactionInterval`
**And** crash: queue entries recoverable via zombie reaper

**Tests:** same tenant reuses session, different tenants differ, compaction at interval, crash doesn't lose state.

---

### Story 4.6: Legacy Cleanup

As a **platform operator**, I want legacy code removed — one path for enrichment.

**AC:**

**Then** `runningExecutions` Set removed
**And** no COMPLETED without guardrail validation
**And** no enrichment outside queue
**And** maturity engine uses enqueueBatch + startEnrichment
**And** grep for `runningExecutions`, premature `status: 'COMPLETED', userReport:`, fire-and-forget `.executeEnrichment(` returns 0

**Tests:** grep validations, maturity engine uses queue.

---

## Epic 5: Content Delivery & Isolation

**Goal:** Users see vault content. Qdrant stays synced. Zero cross-tenant leakage.

**Depends on:** E1, E4

---

### Story 5.1: Vault-First Content Delivery

As a **tenant user**, I want enriched content from vault, not stale PG.

**AC:**

**Given** `GET /concepts/:id`
**When** requested
**Then** PG: metadata (name, slug, category, tier, confidence, enrichmentStatus from queue)
**And** Vault: `VaultStorage.readFile(tenantId, 'wiki/concepts/{slug}.md')`
**And** merged response: `{ ...metadata, content }`
**And** no vault file: `{ ...metadata, content: null, enrichmentStatus: 'pending' }`
**And** VaultStorage error: `{ ...metadata, content: null, enrichmentStatus: 'error' }` (graceful, not 500)
**And** tenantId from auth session, not URL
**And** NEVER reads content from PG

**Tests:** returns vault content, pending for unenriched, graceful on VaultStorage error, tenantId from auth, vault called with correct params.

---

### Story 5.2: Qdrant Sync Service

As a **platform operator**, I want Qdrant updated after each enrichment.

**AC:**

**Given** `QdrantSyncService`
**When** `syncEnrichedConcept(tenantId, conceptId, slug)` called
**Then** reads vault article, chunks by H2, embeds via OpenAI (1536-dim, model from config)
**And** deletes old points for concept, upserts new to `concepts-{tenantId}` with payload: `{ tenantId, conceptId, name, category, departmentTags, section, chunkIndex }`
**And** collection auto-created
**And** OpenAI failure: logged, not thrown (eventually consistent)
**And** Qdrant failure: logged, retry scheduled

**Tests:** correct collection, old points deleted, payload complete, auto-create, OpenAI fail logged, Qdrant fail logged.

---

### Story 5.3: Tenant Isolation Enforcement

As a **platform operator**, I want verified zero cross-tenant leakage.

**AC:**

**Then** every PG tenant query has tenantId filter (grep)
**And** Qdrant targets `concepts-{tenantId}` only
**And** VaultStorage tenantId in every call
**And** DEFAULT_TENANT_ID empty
**And** bridge: body tenantId > env default
**And** cross-tenant API request -> 403
**And** path traversal blocked (1.3)
**And** MCP spoofed tenantId -> 403

**Tests:** grep PG queries, grep DEFAULT_TENANT_ID, API cross-tenant 403, MCP mismatch 403, integration: 2 tenants zero leakage.

---

## Epic 6: System Validation

**Goal:** Prove the full journey works. Run after E1-E5.

**Depends on:** All

---

### Story 6.1: Forensics Suite

As a **platform operator**, I want automated health checks before every deploy.

**AC:** `full-system.spec.ts` verifies: env vars, config yaml, 6 templates, 8 agents, neutral SOUL.md, executor uses config timeout, no premature COMPLETED, no hardcoded IPs, queue table exists, deploy script exists. Non-zero on failure.

---

### Story 6.2: Full Journey Contract Test

As a **platform operator**, I want ONE test proving the entire journey.

**AC:**

**Phase 1 — Onboarding:** orchestrator succeeds, PG concepts correct, Qdrant collection + points, vault files, SOUL.md correct, queue populated
**Phase 2 — Enrichment:** dequeue concept, execute (mock relay or real), guardrail validates, COMPLETED, PG updated, Qdrant re-embedded
**Phase 3 — Content:** GET /concepts/:id returns vault content, English, >4500 words, frontmatter, Sources
**Phase 4 — Isolation:** second tenant onboarded, tenant A can't access B, Qdrant separate, vault separate
**Phase 5 — Cleanup:** both tenants deleted, PG + Qdrant + vault clean

**Runs with:** LocalVaultStorage + test DB (CI), or real SSH (staging)

---

### Story 6.3: Post-Enrichment Consistency Check

As a **platform operator**, I want drift detection after N enrichments.

**AC:**

**Given** tenant with N completed concepts
**When** `verifyConsistency(tenantId)` runs
**Then** checks each COMPLETED: PG exists, vault file exists > 0 bytes, Qdrant has points
**And** reports `{ consistent, drifts[{ conceptId, issue }] }`
**And** runnable as scheduled job or on-demand

**Tests:** detects missing vault file, missing Qdrant points, status mismatch, all consistent = empty drifts.

---

## Summary

| Epic | Stories | What it delivers |
|---|---|---|
| E1 | 8 | Config, VaultStorage, templates, queue, deploy |
| E2 | 7 | MCP, validation, tools, registry, provisioning |
| E3 | 5 | Registration, selection, scaffolding, verify, orchestrate+rollback |
| E4 | 6 | Executor, processor+reaper, guardrails, maturity, sessions, cleanup |
| E5 | 3 | Vault reads, Qdrant sync, isolation |
| E6 | 3 | Forensics, contract test, consistency |
| **Total** | **32** | **Full journey: tenant creation to enriched content delivery** |

```
E1 (Foundation) ──┬──→ E3 (Onboarding) ──→ E4 (Enrichment) ──→ E6 (Validation)
                   │                                              ↑
E2 (Enforcement) ──┤                                              │
                   └──→ E5 (Content Delivery) ────────────────────┘
```
