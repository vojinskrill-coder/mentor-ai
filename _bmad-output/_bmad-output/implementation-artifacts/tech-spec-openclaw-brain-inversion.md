---
title: 'OpenClaw Business Brain Architecture Inversion'
slug: 'openclaw-brain-inversion'
created: '2026-03-27'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack:
  - 'NestJS (backend API + WebSocket gateway)'
  - 'Angular 21 (frontend, standalone components, signals)'
  - 'PostgreSQL / Prisma ORM (Neon cloud)'
  - 'Qdrant (vector DB, 1536-dim OpenAI embeddings)'
  - 'OpenClaw (agent runtime on Hetzner CX32, 32GB RAM)'
  - 'ClawTeam (multi-agent orchestration, pip install from fork)'
  - 'Socket.io (WebSocket, /ws/chat namespace)'
  - 'OpenRouter / MiniMax M1 (LLM, fallback DeepSeek)'
  - 'SSH2 (Hetzner provisioning)'
  - 'Puppeteer (PDF generation)'
files_to_modify:
  - 'apps/api/src/app/conversation/conversation.gateway.ts'
  - 'apps/api/src/app/conversation/concept-plan.service.ts'
  - 'apps/api/src/app/agent-execution/job-planner.service.ts'
  - 'apps/api/src/app/agent-execution/agent-prompt.service.ts'
  - 'apps/api/src/app/agent-execution/openclaw-client.service.ts'
  - 'apps/api/src/app/agent-execution/agent-execution.service.ts'
  - 'apps/api/src/app/openclaw-tenant/openclaw-tenant.service.ts'
  - 'apps/api/src/app/knowledge/services/concept-classifier.service.ts'
  - 'apps/api/src/app/notes/notes.service.ts'
  - 'apps/api/src/app/notes/notes.controller.ts'
  - 'apps/api/src/app/onboarding/onboarding.service.ts'
  - 'apps/api/prisma/schema.prisma'
  - 'shared/types/src/lib/types.ts'
  - 'apps/web/src/app/features/tasks/task-hub.component.ts'
  - 'apps/web/src/app/features/chat/services/chat-websocket.service.ts'
  - 'apps/api/src/app/bridge/bridge.controller.ts (NEW)'
  - 'apps/api/src/app/bridge/bridge.service.ts (NEW)'
  - 'apps/api/src/app/bridge/brain-state.service.ts (NEW)'
code_patterns:
  - 'Angular standalone components with signals (signal, computed, effect)'
  - 'Pure CSS in component styles[] array (Tailwind v4 does NOT process inline templates)'
  - 'Fire-and-forget async for non-blocking post-processing'
  - 'Atomic JSONB merging via raw SQL || operator for concurrent safety'
  - 'SSE streaming with circuit breaker (3 failures open, 30s recovery)'
  - 'Session ID format: work-{executionId}-{agentId} for parallel safety'
  - 'Event-driven: AppEventBus → WebSocket gateway → frontend'
  - 'Multi-tenant: TenantPrismaService scopes all DB operations'
  - 'ID prefixes: note_, cpt_, tnt_, usr_, ajob_, prop_ (CUID2)'
  - 'Global API prefix /api set in main.ts — controllers must NOT include api/'
test_patterns:
  - 'Service specs: concept-classifier.service.spec.ts, concept-extraction.service.spec.ts'
  - 'No E2E tests for OpenClaw integration (external dependency)'
  - 'Budget/cost tracking tested via unit tests on AgentExecutionService'
---

# Tech-Spec: OpenClaw Business Brain Architecture Inversion

**Created:** 2026-03-27

## Overview

### Problem Statement

Mentor AI currently acts as the "brain" — making 15+ LLM calls per concept (classification, job planning, workflow generation, prompt formatting) to simulate intelligence that OpenClaw already possesses natively. OpenClaw is reduced to a "dumb executor" receiving formatted prompts and returning text. This wastes tokens, limits context (1500-token snippets vs full session history), prevents real deliverable production (only text output), and blocks autonomous business thinking.

### Solution

Invert the architecture — OpenClaw becomes the autonomous business brain (thinks, proposes, produces, acts on approval), Mentor AI becomes the state service (DB, auth, UI, API). A Bridge API connects them. The brain uses Business Model You's 9 canvas blocks as cognitive domains, proposes initiatives to the owner, and produces tangible business deliverables — all within the task as the unit of decision-making. The brain thinks freely but acts only with user permission.

### Scope

**In Scope:**

- Bridge API (REST endpoints for OpenClaw to read/write Mentor AI state)
- SOUL.md / USER.md / AGENTS.md for the director agent
- mentor-ai-bridge custom OpenClaw skill
- Gateway simplification (remove intelligence layer, keep as relay)
- Proposal system (brain proposes via heartbeat, user approves via UI)
- Heartbeat cron (autonomous thinking cycle across 9 BMC canvas blocks)
- Brain state tracking service (canvas block scan status, staleness detection)
- Concept model extensions (tenantId for tenant-specific concepts, canvasBlock, discoveredBy)
- Agent contributions within tasks (enriched agentEnrichments JSON with files, actions, metrics)
- Per-action approval checkboxes on task cards
- Streaming via two channels (SSE for chat text, REST→WebSocket for agent/task status)
- ClawTeam integration for complex multi-agent pipelines with dependency chains
- Dev agent with git worktree isolation for code deliverables
- Task Hub UI modifications ([Pokreni] button, proposal text, BMC labels, agent contribution sections, action checkboxes)
- 5-phase incremental delivery plan

**Out of Scope:**

- Separate "Materijali" page (deliverables live inside task cards)
- Business Model Canvas as primary dashboard (future enhancement)
- External action execution in Phase 1-2 (publish/send/deploy is Phase 4)
- Multi-tenant OpenClaw instances (single server, session-based routing)
- Full UI redesign (existing 3 screens: Chat, Zadaci, Podešavanja)
- Mobile app changes

## Context for Development

### Codebase Patterns

**Architecture:** Nx monorepo with NestJS backend (`apps/api/`) and Angular 21 frontend (`apps/web/`). Shared types in `shared/types/`. Multi-tenant via `TenantPrismaService` scoping all DB operations. Auth0 for OAuth (placeholder in dev mode with `DEV_MODE=true` bypass).

**Gateway Intelligence (TO BE REMOVED):**
The `conversation.gateway.ts` (4,786 lines) currently performs 4-6 LLM calls per user message:
1. Research brief synthesis (lines 4588-4722)
2. Main AI response via OpenClaw or AiGateway fallback (lines 1071-1147)
3. Auto-task generation from AI response (lines 1500-1685)
4. Auto-classify conversation to concept (lines 1691-1743)
5. Memory extraction (lines 1338-1380, fire-and-forget)
6. Concept extraction (lines 1382-1397, fire-and-forget)

Additionally per task: `job-planner.service.ts` 1 LLM call (lines 88-106), `agent-prompt.service.ts` 1 LLM call (lines 64-76), `concept-classifier.service.ts` 1 LLM call (lines 179-213).

**OpenClaw Integration (TO BE EXTENDED):**
- `openclaw-client.service.ts`: SSE streaming, circuit breaker (3 failures → open, 30s recovery), exponential backoff (max 2 retries, 5s base)
- Payload: `{message, agentId, sessionId, timeoutSeconds, tenantProfile}`
- SSE events: `stdout` (text), `tool` (agent tool usage), `status` (phase), `result` (final), `error`

**Agent Enrichments (TO BE EXTENDED):**
Current shape: `{ [agentType]: { executionId, status, result: string|null, completedAt, error } }`
Extended shape adds: `files[]`, `actions[]`, `metrics{}` per agent contribution.

**Tenant Provisioning:**
`openclaw-tenant.service.ts` provisions via SSH to Hetzner (91.98.231.87). Currently 5 agents: main, financial, marketing, content, sales.

### Files to Reference

| File | Purpose | Lines | Action |
| ---- | ------- | ----- | ------ |
| `conversation.gateway.ts` | WebSocket gateway with intelligence | 4786 | SIMPLIFY (remove ~2500 lines) |
| `concept-plan.service.ts` | Concept execution orchestration | 365 | SIMPLIFY |
| `job-planner.service.ts` | LLM agent selection | 283 | REMOVE intelligence |
| `agent-prompt.service.ts` | LLM prompt formatting | 116 | REMOVE |
| `openclaw-client.service.ts` | OpenClaw SSE client | 560 | KEEP + extend |
| `agent-execution.service.ts` | Agent execution pipeline | 1773 | SIMPLIFY |
| `openclaw-tenant.service.ts` | Hetzner SSH provisioning | 182 | EXTEND |
| `concept-classifier.service.ts` | LLM concept classification | 440 | REMOVE LLM |
| `concept-matching.service.ts` | Qdrant semantic search | ~400 | KEEP (bridge exposes) |
| `workflow.service.ts` | Workflow generation + execution | 1641 | REMOVE execution logic |
| `headless-executor.service.ts` | Autonomous task execution | ~600 | REMOVE |
| `notes.service.ts` | Notes CRUD + task aggregation | 1162 | EXTEND |
| `notes.controller.ts` | Notes REST API | 260 | EXTEND |
| `onboarding.service.ts` | Onboarding flow | ~800 | EXTEND |
| `schema.prisma` | Database schema | 816 | EXTEND |
| `types.ts` | Shared TypeScript types | ~2000 | EXTEND |
| `task-hub.component.ts` | Task Hub UI | 792 | EXTEND |
| `chat-websocket.service.ts` | Frontend WebSocket | 1300 | EXTEND |

### Technical Decisions

**TD-1: Two-channel streaming.** SSE for chat text + REST→WebSocket for task/agent status. Independent channels prevent blocking.

**TD-2: No Deliverable model.** Extend `agentEnrichments` JSON with files/actions/metrics. Note model already supports hierarchy and PDF export.

**TD-3: BrainProposal as new model.** Pre-decision proposals separate from post-decision tasks/notes.

**TD-4: Task is unit of decision-making.** All agent contributions within task card. No separate materials page.

**TD-5: Think freely, act with permission.** Heartbeat discovers (cheap ~€0.10-0.30). Execution only on approval (€1-3). User controls budget through approvals.

**TD-6: BMC 9 canvas blocks as cognitive domains.** Brain scans most stale/at-risk block each heartbeat.

**TD-7: Bridge API auth.** Bearer token (OPENCLAW_AUTH_TOKEN), not exposed publicly.

**TD-8: Tenant-specific concepts.** New `tenantId` on Concept. Brain discovers → Bridge API creates → auto-creates conversation.

**TD-9: Gateway = thin relay.** Message in → save → forward to OpenClaw → stream back. No enrichment.

**TD-10: ClawTeam for multi-agent.** `win4r/ClawTeam-OpenClaw` fork. Director spawns teams with dependency chains.

---

## Implementation Plan

### Phase 1: Brain Can Talk (Foundation)

- [ ] **Task 1.1: Database Schema Migration**
  - File: `apps/api/prisma/schema.prisma`
  - Action: Add fields to Concept model and create BrainProposal model
  - Details:
    ```prisma
    // Add to Concept model:
    tenantId      String?   @map("tenant_id")
    canvasBlock   String?   @map("canvas_block")  // KEY_PARTNERS | KEY_ACTIVITIES | etc.
    discoveredBy  String?   @map("discovered_by")  // "brain-heartbeat" | "user-conversation" | "seed"
    discoveredAt  DateTime? @map("discovered_at")
    tenant        Tenant?   @relation(fields: [tenantId], references: [id])

    // New model:
    model BrainProposal {
      id              String   @id @default(cuid())  // prop_ prefix
      tenantId        String   @map("tenant_id")
      canvasBlock     String   @map("canvas_block")
      type            String   // concept_discovery | task_execution | risk_alert | opportunity | correction
      title           String
      reasoning       String   @db.Text
      proposedAction  String   @db.Text @map("proposed_action")
      estimatedCost   Float?   @map("estimated_cost")
      priority        String   @default("medium")  // critical | high | medium | low
      status          String   @default("pending")  // pending | approved | rejected | expired
      relatedConcepts String[] @map("related_concepts")

      approvedBy      String?  @map("approved_by")
      approvedAt      DateTime? @map("approved_at")
      rejectedReason  String?  @map("rejected_reason")

      executionNoteId String?  @map("execution_note_id")

      createdAt       DateTime @default(now()) @map("created_at")
      expiresAt       DateTime? @map("expires_at")

      tenant          Tenant   @relation(fields: [tenantId], references: [id])
      @@map("brain_proposals")
    }
    ```
  - Run: `npx prisma migrate dev --name add-brain-proposal-and-concept-fields`

- [ ] **Task 1.2: Shared Types Extension**
  - File: `shared/types/src/lib/types.ts`
  - Action: Extend `AgentEnrichmentEntry` and add new types
  - Details:
    ```typescript
    // Extended AgentEnrichmentEntry
    export interface AgentEnrichmentEntry {
      executionId: string;
      status: AgentExecutionStatus;
      result: string | null;
      completedAt: string | null;
      error: string | null;
      // NEW fields:
      summary?: string;
      files?: DeliverableFile[];
      actions?: DeliverableAction[];
      metrics?: Record<string, number | string>;
    }

    export interface DeliverableFile {
      name: string;
      displayName: string;
      path: string;          // OpenClaw workspace path
      mimeType: string;
      size: number;
    }

    export interface DeliverableAction {
      id: string;
      type: string;          // "publish" | "send" | "deploy" | "schedule" | "sync"
      target: string;        // "ghost-cms" | "convertkit" | "instagram" | "vercel" | "apollo-crm"
      label: string;         // "Objavi na Ghost CMS"
      status: string;        // "none" | "pending" | "approved" | "executing" | "completed" | "failed"
      scheduledFor?: string;
      result?: Record<string, unknown>;
    }

    export interface BrainProposalItem {
      id: string;
      canvasBlock: string;
      type: string;
      title: string;
      reasoning: string;
      proposedAction: string;
      estimatedCost: number | null;
      priority: string;
      status: string;
      relatedConcepts: string[];
      createdAt: string;
      expiresAt: string | null;
    }

    export interface BrainStateBlock {
      block: string;
      lastScan: string | null;
      conceptCount: number;
      risks: number;
      status: string;        // "ok" | "attention" | "stale" | "scanning"
    }

    export interface BrainState {
      canvasBlocks: BrainStateBlock[];
      pendingProposals: number;
      pendingConcepts: number;
      budgetRemaining: number;
      lastHeartbeat: string | null;
    }
    ```

- [ ] **Task 1.3: Bridge API Controller (NEW)**
  - File: `apps/api/src/app/bridge/bridge.controller.ts` (NEW)
  - File: `apps/api/src/app/bridge/bridge.module.ts` (NEW)
  - Action: Create REST endpoints that OpenClaw calls via mentor-ai-bridge skill
  - Details: All endpoints authenticated via Bearer token (OPENCLAW_AUTH_TOKEN). All POST endpoints that create/update data emit WebSocket events to the tenant room.
  - Endpoints:
    ```
    // READ operations (OpenClaw queries state)
    GET    /bridge/concepts/search?q=...&tenantId=...    → semantic search via Qdrant
    GET    /bridge/concepts/:id                          → concept + relationships + workflow cache
    GET    /bridge/concepts/pending?tenantId=...          → pending task concepts for tenant
    GET    /bridge/categories                             → 16 root categories with descriptions
    GET    /bridge/brain-state?tenantId=...               → 9 canvas blocks status
    GET    /bridge/context/:tenantId                      → business context (memories, profile)
    GET    /bridge/budget/:tenantId                       → daily budget remaining
    GET    /bridge/proposals?tenantId=...&status=pending   → pending proposals

    // WRITE operations (OpenClaw updates state)
    POST   /bridge/proposals                              → create proposal → WS: proposal:new
    POST   /bridge/concepts                               → create tenant concept → WS: tree:updated
    POST   /bridge/conversations                          → create conversation for concept → WS: conv:created
    POST   /bridge/tasks                                  → create task note → WS: task:created
    POST   /bridge/task-contribution                      → add agent result to task → WS: task:contribution-added
    POST   /bridge/task-progress                          → update execution progress → WS: task:progress
    POST   /bridge/task-complete                          → mark task done → WS: task:result-complete
    POST   /bridge/memories                               → store business memory
    POST   /bridge/agent-status                           → agent running/done → WS: agent:status-change
    POST   /bridge/brain-state                            → update canvas block scan status

    // USER-INITIATED (frontend calls, forwarded to OpenClaw or handled directly)
    PATCH  /bridge/proposals/:id                          → approve/reject proposal
    ```

- [ ] **Task 1.4: Bridge Service (NEW)**
  - File: `apps/api/src/app/bridge/bridge.service.ts` (NEW)
  - Action: Implement state operations + WebSocket emission for each bridge endpoint
  - Details:
    - Each write operation: validate tenant scope → DB operation → emit WebSocket to tenant room
    - `createConcept()`: Generate CUID2 with `cpt_` prefix, assign tenantId, embed in Qdrant, create conversation
    - `createProposal()`: Generate `prop_` ID, validate canvasBlock enum, set expiresAt (14 days default)
    - `addTaskContribution()`: Atomic JSONB merge into `Note.agentEnrichments` using raw SQL `||` operator (existing pattern from `agent-execution.service.ts`)
    - `approveProposal()`: Update status, create Note TASK from proposal, notify OpenClaw to execute via SSE/session

- [ ] **Task 1.5: Brain State Service (NEW)**
  - File: `apps/api/src/app/bridge/brain-state.service.ts` (NEW)
  - Action: Track 9 BMC canvas block scan status per tenant
  - Details:
    - Store in a simple key-value table or JSON field on Tenant
    - 9 blocks: KEY_PARTNERS, KEY_ACTIVITIES, KEY_RESOURCES, VALUE_PROPOSITION, CUSTOMER_RELATIONSHIPS, CHANNELS, CUSTOMER_SEGMENTS, REVENUE_STREAMS, COST_STRUCTURE
    - Per block: lastScan timestamp, conceptCount, riskCount, status (ok|attention|stale|scanning)
    - `getState(tenantId)`: returns full BrainState
    - `updateBlockScan(tenantId, block, findings)`: update after heartbeat scan
    - Stale threshold: block not scanned in 48 hours → status "stale"

- [ ] **Task 1.6: Gateway Simplification**
  - File: `apps/api/src/app/conversation/conversation.gateway.ts`
  - Action: Remove intelligence, keep relay. The `handleMessage()` method becomes:
    1. Validate payload (KEEP — lines 812-901)
    2. Save user message to DB (KEEP)
    3. Emit `chat:message-received` (KEEP)
    4. Forward to OpenClaw via SSE stream (KEEP — simplified)
    5. Re-emit SSE chunks as `chat:message-chunk` (KEEP)
    6. Save AI message to DB on completion (KEEP)
    7. Emit `chat:complete` (KEEP)
  - REMOVE:
    - Parallel enrichment pipeline (lines 932-973)
    - Research brief builder (lines 4588-4722)
    - Auto-task generation (lines 1500-1685)
    - Explicit task creation (lines 1802-2125)
    - Auto-classify conversation (lines 1691-1743)
    - Memory extraction fire-and-forget (lines 1338-1380)
    - Concept extraction fire-and-forget (lines 1382-1397)
    - Task scoring (lines 3472-3519)
    - Auto-popuni pipelines (lines 2134-2439)
    - Business context builder (lines 4459-4567) — OpenClaw has its own context
    - Complex query detection (lines 1046-1063)
  - KEEP (non-LLM processing):
    - Citation injection (pure text processing, lines 1170-1181)
    - Suggested actions inference (rule-based, lines 1213-1234)
    - Completion event emission (lines 1236-1270)
  - Notes: Gateway drops from ~4786 to ~800 lines. AiGatewayService dependency can be removed from gateway (OpenClaw is the only AI backend now).

- [ ] **Task 1.7: Remove Intelligence Services**
  - Files:
    - `job-planner.service.ts`: Remove `planJobs()` LLM call (lines 23-174). Keep `persistJobs()` and `getJobsForNote()`.
    - `agent-prompt.service.ts`: Remove `formatPrompt()` LLM call. Keep grounding block content as reference for SOUL.md.
    - `concept-classifier.service.ts`: Remove `classifyWithLlm()` (lines 179-213). Keep `findConceptsInCategory()` semantic search.
    - `concept-plan.service.ts`: Remove Branch B LLM suggestion (lines 193-322). Keep `createAndExecutePlan()` CRUD part (now triggered by bridge on approval).
    - `headless-executor.service.ts`: Mark as deprecated — OpenClaw handles execution. Keep temporarily for fallback.
    - `workflow.service.ts`: Remove `executePlan()`, `executeStepAutonomous()`. Keep `getOrGenerateWorkflow()` (cached workflows still useful as reference for SOUL.md).

- [ ] **Task 1.8: OpenClaw Tenant Provisioning Extension**
  - File: `apps/api/src/app/openclaw-tenant/openclaw-tenant.service.ts`
  - Action: Extend to provision USER.md, AGENTS.md alongside existing SOUL.md
  - Details:
    - Add `writeUserMd(tenantId, profile)`: Creates USER.md with full tenant profile (company name, industry, description, website, businessState, departments, role, onboarding analysis, PDF extract)
    - Add `writeAgentsMd(tenantId)`: Creates AGENTS.md with mentor-ai-bridge skill instructions (API endpoints, usage patterns, decision framework)
    - Extend `provisionTenant()` to call both after SOUL.md generation
    - Add agent list: expand from 5 to 8 (add: designer, dev, research)
    - Update `onboarding.service.ts` `completeOnboarding()`: after completion, call `writeUserMd()` with all gathered data

- [ ] **Task 1.9: mentor-ai-bridge Skill (OpenClaw)**
  - File: `~/.openclaw/workspace/skills/mentor-ai-bridge/SKILL.md` (on Hetzner)
  - Action: Create OpenClaw skill definition that wraps Bridge API calls
  - Details: SKILL.md with frontmatter (name, description, tools) + natural language instructions for each tool. Tools map 1:1 to Bridge API endpoints. Each tool includes: endpoint URL, method, payload schema, expected response, when to use.
  - Deploy: Via SSH to Hetzner during tenant provisioning or manually for initial setup.

- [ ] **Task 1.10: SOUL.md for Director Agent**
  - File: `~/.openclaw/workspace/direktor/SOUL.md` (on Hetzner)
  - Action: Create director persona with Business Model You framework
  - Details: Full persona document including:
    - Identity: Business partner / operational director
    - Thinking framework: RAZUMEM → ISTRAŽUJEM → ANALIZIRAM → PREDLAŽEM → ČEKAM → IZVRŠAVAM
    - 9 BMC canvas blocks as cognitive domains
    - Proposal cycle: heartbeat scan → analyze → create_proposal → STOP → wait for approval
    - Conversation mode: natural partner, not task-creator. Only create proposals when significant.
    - Team delegation rules: when to use which sub-agent, when to spawn ClawTeam
    - Rejection learning: note rejections in memory, don't re-propose unless data changes
    - Budget awareness: check_budget() before any agent spawning
    - Result format: structured sections for task panel rendering
    - Language: Serbian, concrete (numbers/dates/names), honest about uncertainty

### Phase 2: Brain Can Think (Proposals)

- [ ] **Task 2.1: Heartbeat Cron Configuration**
  - File: `~/.openclaw/openclaw.json` (on Hetzner)
  - Action: Add cron jobs for brain heartbeat and daily digest
  - Details:
    ```json5
    cron: {
      jobs: [
        {
          id: "brain-heartbeat",
          schedule: "0 */2 * * *",  // every 2 hours
          payload: {
            message: "HEARTBEAT: Run brain scan cycle. Use mentor-ai-bridge to get_brain_state, identify most stale or at-risk canvas block, scan it, create proposals if warranted.",
            agentId: "direktor"
          },
          delivery: { session: "isolated" }
        },
        {
          id: "daily-digest",
          schedule: "0 18 * * 1-5",  // 6 PM weekdays
          payload: {
            message: "DIGEST: Summarize today's activity. Use mentor-ai-bridge to get proposals status, completed tasks, and budget usage. Create a brief daily report.",
            agentId: "direktor"
          },
          delivery: { session: "isolated" }
        }
      ]
    }
    ```

- [ ] **Task 2.2: Task Hub — Proposal Display + Pokreni Button**
  - File: `apps/web/src/app/features/tasks/task-hub.component.ts`
  - Action: Extend task cards with proposal section and launch button
  - Details:
    - Add to each PENDING task card:
      - "🧠 Mozak predlaže:" section showing `reasoning` from BrainProposal linked to this task
      - BMC canvas block pill (e.g., "Prihodi", "Kanali")
      - Estimated cost display
      - Three buttons: [▶️ Pokreni] [💬 Razgovaraj] [❌ Odbij]
    - [▶️ Pokreni] calls `PATCH /bridge/proposals/:id` with status `approved`
    - [💬 Razgovaraj] navigates to Chat with concept context pre-loaded
    - [❌ Odbij] calls `PATCH /bridge/proposals/:id` with status `rejected` + optional reason dialog
    - Add new signal: `proposals = signal<BrainProposalItem[]>([])`
    - Fetch proposals alongside tasks on load and refresh
    - Match proposals to tasks by `executionNoteId` or `relatedConcepts`

- [ ] **Task 2.3: WebSocket Event Listeners for Bridge Events**
  - File: `apps/web/src/app/features/chat/services/chat-websocket.service.ts`
  - Action: Add listeners for new bridge-emitted events
  - Details:
    ```typescript
    // New event listeners:
    this.socket.on('proposal:new', (data) => { ... });
    this.socket.on('proposal:approved', (data) => { ... });
    this.socket.on('task:contribution-added', (data) => { ... });
    this.socket.on('task:progress', (data) => { ... });
    this.socket.on('agent:status-change', (data) => { ... });
    this.socket.on('tree:updated', (data) => { ... });
    ```
    Expose as observables or signal-based callbacks for components to subscribe.

- [ ] **Task 2.4: Proposal Service (Frontend)**
  - File: `apps/web/src/app/features/tasks/services/proposal.service.ts` (NEW)
  - Action: HTTP service for proposal CRUD
  - Details:
    ```typescript
    getProposals(status?: string): Observable<BrainProposalItem[]>
    approveProposal(id: string): Observable<void>
    rejectProposal(id: string, reason?: string): Observable<void>
    ```

### Phase 3: Brain Can Produce (Execution + Deliverables)

- [ ] **Task 3.1: Approval → Execution Pipeline**
  - File: `apps/api/src/app/bridge/bridge.service.ts`
  - Action: When proposal is approved, trigger OpenClaw execution
  - Details:
    - `approveProposal(id, userId)`:
      1. Update proposal status to `approved`, set `approvedBy`, `approvedAt`
      2. Create Note TASK from proposal (title, conceptId, expectedOutcome from proposedAction)
      3. Update proposal `executionNoteId` → new note ID
      4. Notify OpenClaw via `sessions_send` to director: "Proposal {title} approved. Execute now. NoteId: {noteId}"
      5. Emit WebSocket: `proposal:approved`, `task:created`
    - OpenClaw then executes using sub-agents and reports back via bridge API

- [ ] **Task 3.2: Agent Contribution View in Task Cards**
  - File: `apps/web/src/app/features/tasks/task-hub.component.ts`
  - Action: Expand completed/in-progress task cards to show agent contributions
  - Details:
    - When task has `agentEnrichments` with entries, render numbered sections:
      ```
      ① SADRŽAJ (Content) — summary, [Preview] [Download] buttons
      ② DISTRIBUCIJA (Marketing) — plan summary, file downloads
      ③ PRODAJA (Sales) — target list summary, [Preview] [Download]
      ④ FINANSIJE (Financial) — ROI summary, [Preview] [Download]
      ```
    - Each section shows: agent icon, summary text, file list with download buttons, action checkboxes
    - Actions (publish, send, deploy) shown as checkboxes with labels
    - File preview opens modal or side panel
    - File download proxied through: `GET /bridge/deliverables/:path` (NestJS proxies from OpenClaw workspace)

- [ ] **Task 3.3: File Proxy Endpoint**
  - File: `apps/api/src/app/bridge/bridge.controller.ts`
  - Action: Add endpoint to proxy file downloads from OpenClaw workspace
  - Details:
    - `GET /bridge/files?path=...&tenantId=...`
    - Validates tenant ownership
    - SSH cat or HTTP fetch from Hetzner workspace
    - Streams file to client with correct Content-Type and Content-Disposition headers
    - Security: path traversal prevention, tenant isolation check

- [ ] **Task 3.4: Agent Status Graph Component**
  - File: `apps/web/src/app/features/tasks/components/agent-graph.component.ts` (NEW)
  - Action: Real-time visualization of agent activity for a running task
  - Details:
    - Displays within expanded task card (not a separate page)
    - Shows: director node at top, connected to active worker agents below
    - Agent states: spawning (yellow), running (blue pulse), completed (green), failed (red), waiting (gray)
    - Activity feed below graph: timestamped log of agent actions
    - Receives data from `agent:status-change` WebSocket events
    - Pure CSS animations (no external library)

### Phase 4: Brain Can Act (External Actions)

- [ ] **Task 4.1: Action Execution Pipeline**
  - File: `apps/api/src/app/bridge/bridge.service.ts`
  - Action: Handle approved deliverable actions (publish, send, deploy)
  - Details:
    - `executeAction(noteId, agentType, actionId, userId)`:
      1. Validate action exists in `agentEnrichments[agentType].actions[]`
      2. Update action status to "executing"
      3. Emit WebSocket: `deliverable:action-executing`
      4. Send to OpenClaw director: "Execute action {actionId} on task {noteId}: {action.type} to {action.target}"
      5. OpenClaw uses appropriate skill (ghost-cms, convertkit, etc.)
      6. OpenClaw reports back via `POST /bridge/task-contribution` with updated action status + result
      7. Emit WebSocket: `deliverable:action-complete`
    - Double confirmation for bulk actions (email to 500+ contacts): frontend shows warning dialog

- [ ] **Task 4.2: Action Checkboxes and Approval UI**
  - File: `apps/web/src/app/features/tasks/task-hub.component.ts`
  - Action: Per-deliverable action checkboxes with approve button
  - Details:
    - Each action in `agentEnrichments[agent].actions[]` renders as a checkbox row
    - Checkbox label: action.label (e.g., "Objavi na Ghost CMS")
    - "Odobri izabrano (N)" button counts checked actions, calls backend per action
    - Post-execution: checkbox replaced with status (✅ Completed, link to result)
    - Preview mandatory: disable action checkbox until user clicks [Preview] at least once on the parent deliverable

- [ ] **Task 4.3: ClawTeam Integration**
  - File: OpenClaw configuration on Hetzner
  - Action: Install ClawTeam fork and configure for complex tasks
  - Details:
    - Install: `pip install -e .` from `win4r/ClawTeam-OpenClaw` repo
    - SOUL.md instructions: "For tasks requiring 2+ agents with dependencies, use `clawteam spawn-team` instead of sequential `sessions_spawn`"
    - Dev agent gets git worktree isolation: `clawteam spawn --agent-name dev --task "Build landing page"`
    - TOML template for common task types (e.g., content-campaign, market-analysis)
    - Security scan gate: dev agent code output → automated check before action approval

- [ ] **Task 4.4: OpenClaw Skills Installation**
  - File: OpenClaw configuration on Hetzner
  - Action: Install ClawHub skills for each agent
  - Details:
    ```bash
    # Research agent
    clawhub install brave-search tavily agent-browser deep-research-pro summarize

    # Financial agent
    clawhub install fin-cog excel-xlsx market-data

    # Content agent
    clawhub install seo-content-writer content-creator humanize-ai-text ghost-cms brand-voice-profile

    # Marketing agent
    clawhub install marketing-strategy-pmm meta-ads-report simplified-social-media seo-geo-skills-pack

    # Sales agent
    clawhub install apollo cold-email campaign-orchestrator attio-enhanced

    # Designer agent
    clawhub install figma-design-toolkit pptx

    # Dev agent
    clawhub install # (uses built-in code tools + git worktree via ClawTeam)

    # Operations (director)
    clawhub install gog todoist calendar mission-control
    ```
    - Audit each skill before install (security check against curated list)
    - Configure API keys per skill in openclaw.json

### Phase 5: Brain Learns (Self-Improvement)

- [ ] **Task 5.1: Rejection Learning in SOUL.md**
  - File: `~/.openclaw/workspace/direktor/SOUL.md`
  - Action: Add rejection learning instructions
  - Details: When user rejects proposal, brain calls `create_memory()` with: "Owner rejected {title} because {reason}. Do not re-propose unless circumstances change materially." Brain checks memories before proposing similar topics.

- [ ] **Task 5.2: Weekly Retrospective Cron**
  - File: `~/.openclaw/openclaw.json`
  - Action: Add weekly retro cron job
  - Details:
    ```json5
    {
      id: "weekly-retro",
      schedule: "0 17 * * 5",  // Friday 5 PM
      payload: {
        message: "RETROSPECTIVE: Review this week's proposals, approvals, rejections, and completed tasks. Identify patterns, contradictions, and improvement areas. Create a correction proposal if any past recommendations were wrong based on new data.",
        agentId: "direktor"
      },
      delivery: { session: "isolated" }
    }
    ```

- [ ] **Task 5.3: Concept Quality Gate**
  - File: `apps/api/src/app/bridge/bridge.service.ts`
  - Action: Add confidence threshold for auto-discovered concepts
  - Details:
    - When brain creates concept via `POST /bridge/concepts`, require `confidence` field (0-1)
    - Below 0.7: concept created but flagged `needsReview: true` in DB
    - Frontend shows review badge on flagged concepts in tree
    - Above 0.7: concept auto-accepted

---

### Acceptance Criteria

**Phase 1: Foundation**

- [ ] AC-1.1: Given the Bridge API is deployed, when OpenClaw calls `GET /bridge/concepts/search?q=cash+flow&tenantId=tnt_dev`, then it receives a list of matching concepts with names, categories, and relationship data.
- [ ] AC-1.2: Given a user sends a message in Chat, when the gateway receives it, then it saves to DB, forwards to OpenClaw as-is (no enrichment), streams SSE chunks back as `chat:message-chunk`, and saves the AI response — all without any LLM calls in NestJS.
- [ ] AC-1.3: Given OpenClaw calls `POST /bridge/tasks` with a task payload, when the Bridge service processes it, then a Note with `noteType=TASK` is created in DB AND a `task:created` WebSocket event is emitted to all connected clients of that tenant.
- [ ] AC-1.4: Given OpenClaw calls `POST /bridge/agent-status` with `{agent: "research", status: "running"}`, when the Bridge service processes it, then an `agent:status-change` WebSocket event is emitted to the tenant room within 100ms.
- [ ] AC-1.5: Given a new tenant completes onboarding, when `completeOnboarding()` runs, then USER.md is written to OpenClaw workspace via SSH containing: companyName, industry, description, websiteUrl, businessState, departments, role, strategy, executionMode, onboarding analysis output.

**Phase 2: Proposals**

- [ ] AC-2.1: Given the heartbeat cron fires, when the brain scans and finds a stale canvas block, then it creates a BrainProposal via `POST /bridge/proposals` AND the frontend receives a `proposal:new` WebSocket event AND the proposal appears on the Task Hub page within 5 seconds.
- [ ] AC-2.2: Given a pending proposal is displayed, when the user clicks [▶️ Pokreni], then the proposal status changes to `approved`, a TASK Note is created, and OpenClaw is notified to begin execution.
- [ ] AC-2.3: Given a pending proposal is displayed, when the user clicks [💬 Razgovaraj], then Chat opens with the concept context pre-loaded and the user can discuss the proposal with the brain before deciding.
- [ ] AC-2.4: Given a pending proposal is displayed, when the user clicks [❌ Odbij] and provides a reason, then the proposal status changes to `rejected` AND the brain stores a memory about the rejection reason.

**Phase 3: Execution + Deliverables**

- [ ] AC-3.1: Given a task is executing, when OpenClaw calls `POST /bridge/task-contribution` with content agent results including files, then the task card expands to show the content section (①) with summary, preview button, and download button.
- [ ] AC-3.2: Given a task has contributions from 3 agents (content, marketing, financial), when the user views the task card, then all 3 sections are displayed in order with distinct agent icons, summaries, files, and action checkboxes.
- [ ] AC-3.3: Given a file is listed in agent enrichments, when the user clicks [Download], then the file is proxied from OpenClaw workspace via `GET /bridge/files` and downloaded with correct filename and MIME type.
- [ ] AC-3.4: Given a task is executing, when OpenClaw reports agent status changes, then the agent graph within the task card updates in real-time showing which agents are running, completed, or waiting.

**Phase 4: External Actions**

- [ ] AC-4.1: Given a task has a deliverable with action "Objavi na Ghost CMS", when the user checks the action checkbox and clicks [Odobri], then the action status changes to "executing" and upon completion shows ✅ with the published URL.
- [ ] AC-4.2: Given a deliverable has an external action, when the user has NOT clicked [Preview] on that deliverable, then the action checkbox is disabled with tooltip "Pregledaj pre odobravanja".
- [ ] AC-4.3: Given a task has actions targeting 500+ recipients (bulk email), when the user clicks approve, then a double-confirmation dialog appears: "Ovo će biti poslato 500+ kontakata. Da li ste sigurni?"

**Phase 5: Learning**

- [ ] AC-5.1: Given the user rejected a proposal about "Market X Expansion" with reason "Too risky", when the brain's next heartbeat scans the same canvas block, then it does NOT re-propose Market X Expansion unless new data materially changes the picture.
- [ ] AC-5.2: Given it's Friday 5 PM, when the weekly retro cron fires, then the brain reviews the week's activity and creates a "correction" type proposal if any past recommendation contradicts new evidence.

---

## Additional Context

### Dependencies

**External Services:**
- OpenClaw server on Hetzner CX32 (91.98.231.87) — must be running and accessible
- OpenRouter API — for MiniMax M1 model access
- Qdrant — for semantic search (embeddings)
- Neon PostgreSQL — for persistent state
- ClawHub — for skill installation (one-time setup)
- ClawTeam fork — `pip install` from `win4r/ClawTeam-OpenClaw`

**Internal Dependencies (task ordering):**
- Task 1.1 (schema) must complete before Task 1.3-1.5 (bridge API)
- Task 1.2 (types) must complete before Task 1.3 (bridge controller)
- Task 1.6 (gateway) can run in parallel with Task 1.3-1.5
- Task 1.8-1.10 (OpenClaw files) can run in parallel with all backend tasks
- Phase 2 depends on Phase 1 completion
- Phase 3 depends on Phase 2 tasks 2.2-2.3
- Phase 4 depends on Phase 3 tasks 3.1-3.2
- Phase 5 runs parallel from Phase 2 onward

**NPM packages (no new deps expected):**
- Prisma (existing), Socket.io (existing), SSH2 (existing)
- No new npm packages required — all functionality built on existing stack

### Testing Strategy

**Unit Tests:**
- `bridge.service.spec.ts`: Test all state operations (create proposal, approve, reject, expire). Mock Prisma + WebSocket gateway.
- `brain-state.service.spec.ts`: Test canvas block tracking, staleness detection, status transitions.
- `notes.service.spec.ts`: Extend existing tests for enriched `agentEnrichments` structure (files, actions, metrics).

**Integration Tests:**
- Bridge API endpoint tests: HTTP requests → DB state → WebSocket emission verification.
- File proxy: Test path traversal prevention, tenant isolation, MIME type detection.
- Proposal lifecycle: pending → approved → task created → execution → completed.

**Manual Testing:**
- End-to-end: Send chat message → verify OpenClaw responds via simplified gateway → verify no NestJS LLM calls.
- Heartbeat: Trigger brain scan → verify proposal appears in Task Hub → approve → verify execution starts.
- Deliverables: Complete task with files → verify download works → verify action execution.
- Multi-tenant: Verify tenant A cannot see tenant B's proposals, concepts, or files.

**Not Tested (accepted risk):**
- OpenClaw agent behavior (external system — tested via SOUL.md iteration and manual observation)
- ClawTeam orchestration (external system — tested via manual team spawning)
- ClawHub skill functionality (third-party — trusted from curated list)

### Notes

**High-Risk Items:**
1. **Gateway simplification is high-impact.** Removing 2500 lines from a 4786-line file risks breaking existing functionality. Mitigation: feature flag to toggle between old (enriched) and new (relay) gateway behavior during transition.
2. **OpenClaw session continuity.** If OpenClaw server restarts, session history may be lost. Mitigation: critical context stored in USER.md (persistent in workspace), not just session memory.
3. **Bridge API as single point of failure.** If NestJS is down, OpenClaw can't read/write state. Mitigation: OpenClaw continues thinking in session memory, queues bridge calls, retries on recovery.
4. **32GB RAM budget on Hetzner.** 8 agents + ClawTeam + cron heartbeats may exceed memory. Mitigation: monitor with `htop`, ClawTeam cleans up teams after completion, heartbeat runs in isolated (short-lived) sessions.

**Known Limitations:**
- Phase 1-2 produces text-only deliverables (no files). File production requires Phase 3 skill installation.
- External actions (publish, send) require API keys for each service (Ghost, ConvertKit, etc.) — tenant must configure these.
- Brain quality depends on SOUL.md iteration — expect 3-5 revisions before the brain behaves optimally.

**Future Considerations (Out of Scope):**
- Business Model Canvas as primary dashboard (Sally's 9-block live view)
- Mobile push notifications for proposals
- Multi-tenant OpenClaw instances (one OpenClaw per tenant for full isolation)
- Brain-to-brain knowledge sharing across tenants (anonymized insights)
- Voice interface via ElevenLabs skill
