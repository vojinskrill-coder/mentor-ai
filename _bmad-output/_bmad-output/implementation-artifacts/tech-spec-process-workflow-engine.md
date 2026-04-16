---
title: 'Process Workflow Engine — Autonomous Business Process Execution'
slug: 'process-workflow-engine'
created: '2026-03-29'
status: 'implementation-complete'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['Angular 21 (note: project-context.md says 20.x but package.json is 21.1.0 — trust package.json)', 'NestJS', 'PostgreSQL/Prisma 5.x', 'OpenClaw 2026.3.24', 'Socket.io', 'Qdrant', 'class-validator', 'class-transformer', 'ajv', 'cron-parser']
files_to_modify:
  - 'apps/api/prisma/schema.prisma'
  - 'apps/api/src/app/bridge/bridge.service.ts'
  - 'apps/api/src/app/conversation/conversation.gateway.ts'
  - 'apps/web/src/app/app.routes.ts'
  - 'apps/web/src/app/core/layout/app-shell.component.ts'
  - 'apps/web/src/app/features/chat/services/chat-websocket.service.ts'
  - 'shared/types/src/lib/types.ts'
  - 'shared/types/src/index.ts'
  - '_bmad-output/planning-artifacts/project-context.md'
code_patterns:
  - 'ID prefix convention: proc_, pstep_, prun_, psres_ (ADD to project-context.md ID table)'
  - 'BRIDGE_EVENTS constant + AppEventBus.emit() + Gateway Object.values() loop auto-broadcasts'
  - 'resolveTenantId() for server-side tenant override'
  - 'Lazy-load routes: loadComponent with .then(m => m.Component)'
  - 'Nav items: routerLink + routerLinkActive + inline SVG'
  - 'Controller: @Controller(v1/X) + @UseGuards(JwtAuthGuard) + @CurrentUser()'
  - 'DTO: class-validator decorators + @Type(() => Number) for transforms'
  - 'Module: TenantModule + ConfigModule + forwardRef for circular deps'
  - 'WS callbacks: private XXXCallbacks array + onXXX() returns unsubscribe fn'
  - 'Activity panel: panel.addEntry(type, title, status, detail?) returns ID'
  - 'RFC 7807 ProblemDetails for all error responses'
  - 'Pagination: meta { page, pageSize, total } on all list endpoints'
test_patterns:
  - 'Jest for unit tests'
  - 'Playwright for E2E'
  - 'Spec files co-located: service.spec.ts, controller.spec.ts'
adversarial_review: '20 findings, 19 valid — all addressed in this revision'
---

# Tech-Spec: Process Workflow Engine — Autonomous Business Process Execution

**Created:** 2026-03-29
**Adversarial Review:** 19 findings addressed (F1-F20, F14 dismissed as noise)

## Overview

### Problem Statement

OpenClaw agents currently work ad-hoc — they receive tasks and improvise execution with no defined process, no step validation, no format guarantees, and no structured output for the UI. This results in:

- Inconsistent deliverables (.md files instead of real outputs like Excel, PDF, HTML)
- Hallucinated data (fake emails, invented companies) with no verification
- No way for the business owner to configure or monitor HOW processes run
- Agents cannot follow multi-step business processes reliably
- Output format is unpredictable — frontend cannot render structured data
- No feedback loop for process improvement over time

### Solution

A Process Workflow Engine where:

1. **Process Definitions** — Business processes are defined as step-by-step workflows with JSON Schema-validated inputs/outputs per step
2. **Server-Side Orchestration** — ProcessExecutorService orchestrates steps, validates between them, retries with corrective feedback
3. **Agent Execution** — OpenClaw agents execute individual steps following SKILL.md with inline schemas, return structured JSON
4. **Verification Layer** — Schema check → data verification (DNS/URL) → LLM semantic quality check
5. **Two New UI Pages** — Process Builder (visual editor + SKILL.md) and Process Results (tabbed interactive data)
6. **Real-Time Feedback** — Bridge events for process lifecycle through existing WebSocket pipeline
7. **Auto-Improve** — Each run records metrics/errors. Agent reads history before next run.
8. **Three Agent Modes** — Chat (conversation), Ad-hoc (deliverables on demand), Processes (cron, configured once)

### Scope

**In Scope:**
- Prisma models: ProcessWorkflow, ProcessStep, ProcessRun, ProcessStepResult (all 3 enums)
- ProcessExecutorService, ProcessSchedulerService, SchemaValidatorService
- DTOs for all 12 endpoints with class-validator
- 5 new Bridge events for process lifecycle
- RFC 7807 error handling for all new endpoints
- Pagination on all list endpoints
- RBAC: Process Builder = TENANT_OWNER only, Process Results = all authenticated users
- Process Builder page: visual step editor, SKILL.md editor, schema config
- Process Results page: tabbed (Leads, Content) with interactive components
- Lead Discovery as first fully implemented process (6 steps)
- Content Pipeline as second process (7 steps, fully specified)
- OpenClaw SKILL.md per process with inline schemas
- Cancellation support for running processes
- Auto-improve integration

**Out of Scope:**
- Mobile UI, process marketplace, payment/billing
- Processes 3-5 (Project Proposal, Client Nurture, Supplier Sourcing) — future sprints

## Context for Development

### Codebase Patterns

- **Angular 21.1.0** standalone components with Signals, pure CSS in `styles` block. NOTE: project-context.md says 20.x — trust package.json, update project-context (F1).
- Design tokens: #0D0D0D, #1A1A1A, #242424, #2A2A2A, #FAFAFA, #3B82F6, #C9A96E
- NestJS modular monolith, PlatformPrismaService for DB access
- **Multi-tenancy decision (F2):** Process models use platform DB with tenantId FK (same pattern as BrainProposal, Note, Execution). In dev mode all tenants share one DB. For prod SOC 2 compliance, these tables will need migration to tenant DBs — but that's a cross-cutting concern affecting ALL existing models equally, not specific to this feature. Follow existing pattern for now.
- Bridge pattern: controller resolveTenantId() → service emits → gateway `Object.values(BRIDGE_EVENTS)` loop broadcasts → WS → frontend (F14: verified — gateway uses iteration, not fixed list)
- ID prefixes: note_, prop_, cpt_ → new: proc_, pstep_, prun_, psres_
- Prisma: `@map("snake_case")`, `@default(now())`, `@@index`, `@@map("table_name")`
- **Prisma Json defaults (F15):** Use `@default("{}") @map(...)` pattern from existing Execution model. Test migration before deploying.
- Routes: lazy-loaded with `loadComponent`, auth guards at shell level
- Nav: `routerLink` + `routerLinkActive="active"` + inline SVG icons
- WS: `socket.on('event:name')` → `safe(callbacks, data)` → `onEventName()` returns unsubscribe
- Activity: `panel.addEntry(type, title, status, detail?)` → returns ID for tracking
- **Shared types (F19):** All new interfaces in `shared/types/src/lib/types.ts`, exported via barrel at `shared/types/src/index.ts`, imported as `@mentor-ai/shared/types` everywhere.
- **Correlation IDs (F12):** Add `correlationId` field to ProcessRun. Propagate X-Correlation-Id header from HTTP request into run record and all downstream events.

### Files to Reference

| File | Purpose |
| ---- | ------- |
| `apps/api/src/app/bridge/bridge.service.ts` | Event emission, BRIDGE_EVENTS (gateway iterates Object.values) |
| `apps/api/src/app/bridge/bridge.controller.ts` | resolveTenantId(), RFC 7807 error pattern |
| `apps/api/src/app/bridge/bridge.module.ts` | Module structure with TenantModule, forwardRef |
| `apps/api/src/app/bridge/dto/bridge.dto.ts` | DTO pattern with class-validator |
| `apps/api/src/app/maturity/maturity-engine.service.ts` | Wave execution, concurrency, state machine |
| `apps/api/src/app/maturity/headless-executor.service.ts` | Job orchestration, progress events |
| `apps/api/src/app/events/app-event-bus.service.ts` | emit(), on(), APP_EVENTS |
| `apps/api/src/app/conversation/conversation.gateway.ts` | Bridge event loop → WS broadcast |
| `apps/web/src/app/core/layout/app-shell.component.ts` | Activity panel, nav items |
| `apps/web/src/app/features/chat/services/chat-websocket.service.ts` | WS callback pattern |
| `apps/web/src/app/app.routes.ts` | Lazy-load route pattern |
| `apps/api/prisma/schema.prisma` | Model conventions, existing enums |

### Technical Decisions

- **Server-side orchestration**: ProcessExecutor controls flow, agent executes ONE step. Concurrency guard: `@@unique([runId, stepId])` on ProcessStepResult prevents duplicate step executions (F13).
- **Schema as contract**: JSON Schema (draft-07 via ajv) defines input/output for every step.
- **Component registry for UI**: outputType → Angular component mapping. Shared shell, specific cards.
- **Processes configured once**: Builder for setup, cron for execution.
- **Three validation levels**: Schema (ajv, instant) → Verification (DNS/URL, async) → Semantic (LLM quality check using Gemini Flash with ~100 output tokens, cost ~$0.001/check, runs on sample of 20% of fields) (F9).
- **RBAC (F10):** Process Builder restricted to TENANT_OWNER via `rolesGuard(['TENANT_OWNER'])`. Process Results accessible to all authenticated users. Process API endpoints use `@UseGuards(JwtAuthGuard)`.
- **Cancellation (F16):** `ProcessRunStatus` includes CANCELLED. Cancel endpoint kills current OpenClaw relay and marks run CANCELLED.

## Implementation Plan

### Sprint 1: Process Engine Foundation

- [x] **Task 1.0: Update project-context.md (F1, F18)**
  - File: `_bmad-output/planning-artifacts/project-context.md`
  - Action: Update Angular version to 21.x. Add ID prefixes proc_, pstep_, prun_, psres_ to ID table.

- [x] **Task 1.1: Prisma Models (F2, F4, F8, F13, F15, F16)**
  - File: `apps/api/prisma/schema.prisma`
  - Action: Add 4 models + 3 enums. Key fixes from review:
  ```prisma
  enum ProcessStepType {
    AUTOMATIC
    APPROVAL
    MANUAL
  }

  enum ProcessRunStatus {
    IDLE
    RUNNING
    WAITING_APPROVAL
    COMPLETED
    FAILED
    CANCELLED
  }

  enum ProcessStepResultStatus {
    PENDING
    RUNNING
    COMPLETED
    FAILED
    APPROVED
    REJECTED
  }

  model ProcessWorkflow {
    id            String   @id @map("id")
    tenantId      String   @map("tenant_id")
    name          String
    description   String?  @db.Text
    slug          String
    steps         ProcessStep[]
    runs          ProcessRun[]
    isActive      Boolean  @default(true) @map("is_active")
    cronSchedule  String?  @map("cron_schedule")
    skillMd       String?  @db.Text @map("skill_md")
    createdAt     DateTime @default(now()) @map("created_at")
    updatedAt     DateTime @updatedAt @map("updated_at")
    tenant        Tenant   @relation(fields: [tenantId], references: [id])
    @@index([tenantId])
    @@unique([tenantId, slug])
    @@map("process_workflows")
  }

  model ProcessStep {
    id              String          @id @map("id")
    workflowId      String          @map("workflow_id")
    order           Int
    name            String
    description     String?         @db.Text
    stepType        ProcessStepType @map("step_type")
    agentType       String          @map("agent_type")
    toolSkill       String          @map("tool_skill")  // REQUIRED for AUTOMATIC (F20)
    inputSchema     Json            @map("input_schema")
    outputSchema    Json            @map("output_schema")
    skillMdSection  String?         @db.Text @map("skill_md_section")
    retryPolicy     Json            @default("{}") @map("retry_policy")  // Safe default (F15)
    verifyRules     Json?           @map("verify_rules")
    createdAt       DateTime        @default(now()) @map("created_at")  // (F8)
    updatedAt       DateTime        @updatedAt @map("updated_at")       // (F8)
    results         ProcessStepResult[]
    workflow        ProcessWorkflow @relation(fields: [workflowId], references: [id], onDelete: Cascade)
    @@index([workflowId])
    @@map("process_steps")
  }

  model ProcessRun {
    id               String           @id @map("id")
    workflowId       String           @map("workflow_id")
    tenantId         String           @map("tenant_id")
    status           ProcessRunStatus @default(IDLE)
    currentStepOrder Int?             @map("current_step_order")
    correlationId    String?          @map("correlation_id")  // (F12)
    input            Json?
    finalOutput      Json?            @map("final_output")
    metrics          Json?
    error            String?
    startedAt        DateTime?        @map("started_at")
    completedAt      DateTime?        @map("completed_at")
    createdAt        DateTime         @default(now()) @map("created_at")
    stepResults      ProcessStepResult[]
    workflow         ProcessWorkflow  @relation(fields: [workflowId], references: [id])
    tenant           Tenant           @relation(fields: [tenantId], references: [id])
    @@index([tenantId, status])
    @@index([workflowId])
    @@map("process_runs")
  }

  model ProcessStepResult {
    id          String                  @id @map("id")
    runId       String                  @map("run_id")
    stepId      String                  @map("step_id")
    status      ProcessStepResultStatus @default(PENDING)  // Proper enum (F4)
    input       Json?
    output      Json?
    rawOutput   String?                 @db.Text @map("raw_output")
    retries     Int                     @default(0)
    error       String?
    approvedBy  String?                 @map("approved_by")
    approvedAt  DateTime?               @map("approved_at")
    startedAt   DateTime?               @map("started_at")
    completedAt DateTime?               @map("completed_at")
    run         ProcessRun              @relation(fields: [runId], references: [id], onDelete: Cascade)
    step        ProcessStep             @relation(fields: [stepId], references: [id])
    @@unique([runId, stepId])  // Prevents duplicate step results (F13)
    @@index([runId])
    @@index([stepId])
    @@map("process_step_results")
  }
  ```
  - Notes: Add ProcessWorkflow and ProcessRun relations to Tenant model. `toolSkill` is required (non-nullable) — executor validates non-null for AUTOMATIC steps at runtime (F20). `retryPolicy` default is `"{}"` — service applies programmatic defaults (F15). Run `npx prisma migrate dev`.

- [x] **Task 1.2: Enum + Type Exports (F11, F19)**
  - File: `shared/types/src/lib/types.ts`
  - Action: Add interfaces, exported via barrel at `shared/types/src/index.ts`, imported as `@mentor-ai/shared/types`:
  ```typescript
  export interface ProcessRunStartedPayload {
    tenantId: string;
    runId: string;
    workflowName: string;
    totalSteps: number;
    correlationId?: string;
  }
  export interface ProcessStepPayload {
    tenantId: string;
    runId: string;
    stepName: string;
    stepOrder: number;
    totalSteps: number;
    agentType: string;
    status: 'started' | 'output' | 'failed';
    output?: unknown;
    error?: string;
    correlationId?: string;
  }
  export interface ProcessCompletePayload {
    tenantId: string;
    runId: string;
    workflowName: string;
    success: boolean;
    metrics?: Record<string, number>;
    correlationId?: string;
  }
  ```
  - Note: Do NOT add exports to `shared/prisma/src/lib/prisma.ts` — the actual import path used by services is `@mentor-ai/shared/tenant-context` for Prisma services. Add new enums to re-exports where Prisma enums are already exported (F11).

- [x] **Task 1.3: DTO Classes (F3)**
  - File: `apps/api/src/app/process/dto/process.dto.ts` (NEW)
  - Action: Define all DTOs with class-validator decorators:
  ```typescript
  export class CreateWorkflowDto {
    @IsString() @MaxLength(200) name!: string;
    @IsString() @MaxLength(100) slug!: string;
    @IsOptional() @IsString() description?: string;
    @IsOptional() @IsString() cronSchedule?: string;
    @IsOptional() @IsString() skillMd?: string;
  }
  export class UpdateWorkflowDto {
    @IsOptional() @IsString() @MaxLength(200) name?: string;
    @IsOptional() @IsString() description?: string;
    @IsOptional() @IsString() cronSchedule?: string;
    @IsOptional() @IsString() skillMd?: string;
    @IsOptional() @IsBoolean() isActive?: boolean;
  }
  export class CreateStepDto {
    @IsInt() @Min(1) order!: number;
    @IsString() @MaxLength(200) name!: string;
    @IsOptional() @IsString() description?: string;
    @IsString() stepType!: string; // Validated against ProcessStepType enum
    @IsString() agentType!: string;
    @IsString() toolSkill!: string;
    @IsObject() inputSchema!: Record<string, unknown>;
    @IsObject() outputSchema!: Record<string, unknown>;
    @IsOptional() @IsString() skillMdSection?: string;
    @IsOptional() @IsObject() retryPolicy?: Record<string, unknown>;
    @IsOptional() @IsObject() verifyRules?: Record<string, unknown>;
  }
  export class UpdateStepDto extends PartialType(CreateStepDto) {}
  export class TriggerRunDto {
    @IsOptional() @IsObject() input?: Record<string, unknown>;
  }
  export class ApproveStepDto {
    @IsBoolean() approved!: boolean;
    @IsOptional() @IsObject() modifiedOutput?: Record<string, unknown>;
  }
  export class ListRunsQueryDto {
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
    @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
    @IsOptional() @IsString() status?: string;
  }
  ```

- [x] **Task 1.4: SchemaValidatorService (F9 — semantic level defined)**
  - File: `apps/api/src/app/process/schema-validator.service.ts` (NEW)
  - Action: Three validation levels:
    - `validateSchema(data: unknown, schema: JsonSchema): ValidationResult` — ajv draft-07
    - `verifyData(data: unknown, rules: VerifyRule[]): VerificationResult` — DNS lookup (node `dns.resolve`), URL HEAD request, enum membership, regex match
    - `semanticCheck(data: unknown, schema: JsonSchema, sampleRate: number): SemanticResult` — Uses Gemini Flash (useFallback: true) with prompt: "Check if this data looks real and consistent. Flag any fields that appear hallucinated." Runs on 20% of records by default. Cost: ~$0.001/check. Returns `{ passed: boolean, flags: string[] }`.
    - `buildCorrectionPrompt(errors: ValidationError[], rawOutput: string): string` — generates retry prompt with specific field-level feedback
  - Notes: Install `ajv@8` + `ajv-formats`. Semantic check is opt-in per step via verifyRules.

- [x] **Task 1.5: ProcessExecutorService (F13 — concurrency, F16 — cancel)**
  - File: `apps/api/src/app/process/process-executor.service.ts` (NEW)
  - Action: Core orchestration service:
    - `startRun(workflowId, tenantId, input?, correlationId?)` — creates run, starts step 1
    - `executeStep(run, step)` — sends to OpenClaw, validates (3 levels), retries with correction
    - `advanceToNextStep(run)` — validates output, moves to next or pauses at APPROVAL
    - `handleApproval(resultId, approved, userId, modifiedOutput?)` — processes approval, resumes
    - `cancelRun(runId)` — sets CANCELLED, kills current OpenClaw relay if active
    - `completeRun(run)` — finalizes, records metrics, emits events
  - Concurrency: Uses `@@unique([runId, stepId])` constraint + optimistic locking on `ProcessRun.currentStepOrder` — if two advanceToNextStep fire simultaneously, one gets DB unique constraint error and backs off (F13).
  - Each step prompt dynamically generated from skillMdSection + input/outputSchema inline.

- [x] **Task 1.6: ProcessSchedulerService**
  - File: `apps/api/src/app/process/process-scheduler.service.ts` (NEW)
  - Action: Cron-based triggering with overlap protection. Uses `cron-parser` to evaluate next run time. On module init: loads active workflows, registers intervals. Before start: verifies no RUNNING/WAITING_APPROVAL run exists for same workflow.

- [x] **Task 1.7: Bridge Events for Process Lifecycle**
  - File: `apps/api/src/app/bridge/bridge.service.ts`
  - Action: Add 5 events to BRIDGE_EVENTS constant. Gateway already iterates `Object.values(BRIDGE_EVENTS)` so these auto-broadcast (verified F14).

- [x] **Task 1.8: WebSocket Frontend Listeners**
  - File: `apps/web/src/app/features/chat/services/chat-websocket.service.ts`
  - Action: 5 new callback arrays + socket.on + onXXX() methods. Same safe() pattern. Add to clearCallbacks().

- [x] **Task 1.9: Activity Panel Process Handlers**
  - File: `apps/web/src/app/core/layout/app-shell.component.ts`
  - Action: Add in `setupActivityFeedSubscriptions()`. Track process run entries via entryMap with key `process-run-{runId}`.

- [x] **Task 1.10: Process Module + Controller (F3, F6, F7, F10)**
  - File: `apps/api/src/app/process/process.module.ts` (NEW)
  - File: `apps/api/src/app/process/process.controller.ts` (NEW)
  - Action: 12 endpoints with:
    - All DTOs from Task 1.3 applied
    - `@UseGuards(JwtAuthGuard)` on class level
    - Pagination with `meta: { page, pageSize, total }` on list endpoints (F7)
    - RFC 7807 errors: 404 NotFound (workflow/run/step not found), 409 Conflict (run already active), 400 BadRequest (invalid cron, invalid schema), 422 UnprocessableEntity (schema validation failed) (F6)
    - RBAC: `@UseGuards(JwtAuthGuard, RolesGuard)` with `@Roles('TENANT_OWNER')` on mutation endpoints (create/update/delete workflow, create/update steps). Read endpoints + run/approve available to all authenticated users (F10).
    - Cancel endpoint: `POST /v1/processes/runs/:runId/cancel`

- [x] **Task 1.11: Register Module**
  - File: `apps/api/src/app/app.module.ts`
  - Action: Import `ProcessModule`.

### Sprint 2: Lead Discovery — First Process

- [x] **Task 2.1: Lead Discovery SKILL.md**
  - File: Deploy to Hetzner `/root/.openclaw/workspace/skills/lsa-lead-discovery/SKILL.md`
  - Action: 6-step SKILL.md. Each step has inline JSON output schema, verification rules, exact tool commands.

- [x] **Task 2.2: Seed Lead Discovery Workflow**
  - File: `apps/api/prisma/seed-processes.ts` (NEW)
  - Action: Creates ProcessWorkflow + 6 ProcessSteps with full JSON schemas. Run: `npx ts-node prisma/seed-processes.ts`.

- [x] **Task 2.3: LeadCard Component**
  - File: `apps/web/src/app/features/process-results/components/lead-card.component.ts` (NEW)
  - Action: Standalone component with: name/company/role, score badge (1-10, color-coded), contact info (email with verified/unverified badge, LinkedIn link), expandable personalized message, action buttons (Approve/Edit/Skip), status pipeline indicator. Pure CSS, dark theme.

- [x] **Task 2.4: Process Results Page**
  - File: `apps/web/src/app/features/process-results/process-results.component.ts` (NEW)
  - Action: Tabbed page. Tab bar: [Leads] [Sadržaj]. Left sidebar: run progress (step progress bar via WS). Main area: component per tab. Top: stats (this run vs previous). Bottom: batch approve/reject. Filters.

- [x] **Task 2.5: Routes + Nav**
  - File: `apps/web/src/app/app.routes.ts` — lazy-load `/process-results`
  - File: `apps/web/src/app/core/layout/app-shell.component.ts` — "Procesi" nav item after Materijali

- [x] **Task 2.6: Approval Flow**
  - Approve/reject per card → `POST /v1/processes/runs/:runId/approve/:stepResultId`. WS refresh. Approved subset proceeds to next step.

### Sprint 3: Process Builder UI

- [x] **Task 3.1: Process Builder Page**
  - File: `apps/web/src/app/features/process-builder/process-builder.component.ts` (NEW)
  - Action: Left sidebar (process list), main area (visual step flow with boxes/arrows), click-to-edit.
  - Route: `/process-builder`, guarded with `rolesGuard(['TENANT_OWNER'])` (F10)

- [x] **Task 3.2: Step Editor Panel**
  - Side panel: name, type dropdown, agent dropdown, tool input, schema editors, SKILL.md editor, retry policy, verify rules, save/cancel.

- [x] **Task 3.3: Schema Visual Editor**
  - Add fields visually: name, type, required, format (email/url/enum), min/max. Generates valid JSON Schema draft-07. Preview panel.

- [x] **Task 3.4: Routes + Nav**
  - `/process-builder` route. "Podešavanja procesa" nav item in settings section, TENANT_OWNER only.

- [x] **Task 3.5: SKILL.md Deploy**
  - On save: generate combined SKILL.md from steps, SSH deploy to Hetzner. Pattern: OpenClawTenantService.sshExec().

### Sprint 4: Content Pipeline — Second Process (F17 — fully specified)

- [x] **Task 4.1: Content Pipeline SKILL.md**
  - File: Deploy to Hetzner `/root/.openclaw/workspace/skills/lsa-content-pipeline/SKILL.md`
  - 7 steps:
    1. **Topic Selection** [AUTO, research agent, brave-search] — Analyze SEO gaps, trending topics in luxury/architecture, select topic aligned with LSA strategy. Output: `{ topic, keywords[], targetChannel, reasoning }`.
    2. **Research** [AUTO, research agent, brave-search + tavily] — Deep research on topic, competitor content analysis, source collection. Output: `{ sources[], keyPoints[], competitorAnalysis, uniqueAngle }`.
    3. **Writing** [AUTO, content agent, seo-content-writer + humanize-ai-text] — Write draft in LSA brand voice (gallery curator tone). Output: `{ title, body (rich HTML), metaDescription, keywords[], wordCount, readabilityScore }`.
    4. **Visual Generation** [AUTO, designer agent, openart-image] — Generate 2-3 visuals matching content theme in LSA aesthetic (dark, dramatic, gold accents). Output: `{ images[]: { url, alt, placement } }`.
    5. **Formatting** [AUTO, content agent] — Combine text + visuals into channel-specific formats. Output: `{ blog: { html, seoScore }, instagram: { caption, hashtags }, linkedin: { post } }`.
    6. **Review** [APPROVAL] — Owner previews rich HTML, SEO score, channel variants. Can edit text, swap visuals, approve/reject.
    7. **Publishing** [AUTO after approval, content agent, ghost-cms] — Publish to selected channels. Output: `{ publishedUrls[], scheduledPosts[] }`.

- [x] **Task 4.2: Seed Content Pipeline Workflow**
  - File: `apps/api/prisma/seed-processes.ts` (append)
  - Action: 7 ProcessSteps with full JSON schemas for each step input/output.

- [x] **Task 4.3: ContentPreview Component**
  - File: `apps/web/src/app/features/process-results/components/content-preview.component.ts` (NEW)
  - Action: Rich HTML preview with LSA dark theme. Tab toggle: Blog / Instagram / LinkedIn. SEO metrics panel (keyword density, readability, meta preview). Image gallery with swap/regenerate buttons. Edit button opens inline rich text editor. Publish button.

- [x] **Task 4.4: Content Calendar View**
  - File: `apps/web/src/app/features/process-results/components/content-calendar.component.ts` (NEW)
  - Action: Monthly calendar grid. Dots for: scheduled (yellow), published (green), draft (gray). Click day → shows content items. Drag to reschedule.

- [x] **Task 4.5: Add Content Tab to Process Results**
  - Adds "Sadržaj" tab rendering ContentPreview + Calendar toggle.

### Acceptance Criteria

**Process Engine (Sprint 1):**
- [ ] AC1: Given a seeded 3-step AUTOMATIC workflow, when `POST /v1/processes/:id/run` is called, then all 3 steps execute sequentially with schema validation between each.
- [ ] AC2: Given a step returns invalid JSON, when SchemaValidator rejects it, then corrective feedback is sent and agent retries up to maxRetries. Each retry includes specific field-level error messages.
- [ ] AC3: Given an APPROVAL step is ready, when output passes validation, then run status → WAITING_APPROVAL and execution halts until `POST .../approve` is called.
- [ ] AC4: Given each step lifecycle event, when emitted by ProcessExecutor, then WebSocket events `process:step-started`, `process:step-output`, `process:step-failed` appear in activity panel within 1s.
- [ ] AC5: Given cronSchedule "0 9 * * 1" and no active run, when cron fires, then new run starts.
- [ ] AC6: Given active run exists, when cron fires, then no new run starts (logged as skipped).
- [ ] AC7: Given a running process, when `POST .../cancel` is called, then status → CANCELLED and no further steps execute.
- [ ] AC8: Given `POST /v1/processes` without required DTO fields, then 400 RFC 7807 response with field-level errors.
- [ ] AC9: Given `GET /v1/processes/:id/runs?page=2&limit=10`, then response includes `meta: { page: 2, pageSize: 10, total: N }`.

**Lead Discovery (Sprint 2):**
- [ ] AC10: Given step 1 output, then array contains min 20 leads with name, company, web, location — all validated against outputSchema.
- [ ] AC11: Given step 2 enrichment, then each lead.email is DNS-verified or null. Never hallucinated.
- [ ] AC12: Given step 5 APPROVAL, then Process Results Leads tab shows LeadCard components with approve/edit/skip per lead.
- [ ] AC13: Given 5 of 20 approved, then only those 5 proceed to step 6.

**Process Builder (Sprint 3):**
- [ ] AC14: Given step click in visual flow, then editor shows current values including SKILL.md.
- [ ] AC15: Given SKILL.md edit + save, then file deployed to Hetzner via SSH.
- [ ] AC16: Given schema editor field with format "email", then JSON Schema output is valid draft-07.
- [ ] AC17: Given non-TENANT_OWNER user navigates to /process-builder, then redirected (403).

**Content Pipeline (Sprint 4):**
- [ ] AC18: Given Content Pipeline run, then Content tab shows rich HTML preview with LSA branding.
- [ ] AC19: Given channel toggle, then blog/instagram/linkedin variants display correctly.
- [ ] AC20: Given publish approval, then content published to configured channel with URL returned.

## Additional Context

### Dependencies

| Dependency | Purpose | Status |
|-----------|---------|--------|
| `ajv@8` + `ajv-formats` | JSON Schema validation draft-07 | NEW — install |
| `cron-parser` | Parse cron expressions | NEW — install |
| Bridge API + AppEventBus | Event pipeline | Existing |
| Socket.io WebSocket | Real-time updates | Existing |
| OpenClawClientService | Agent relay | Existing |
| OpenClawTenantService | SSH deploy | Existing |
| PlatformPrismaService | DB access | Existing |
| Gemini Flash (via AiGateway) | Semantic validation checks | Existing |

### Testing Strategy

**Unit Tests (Jest):**
- `schema-validator.service.spec.ts` — all 3 levels + correction prompt generation
- `process-executor.service.spec.ts` — step transitions, retry, approval gates, cancellation, concurrency (unique constraint)
- `process-scheduler.service.spec.ts` — cron parsing, overlap detection, schedule/unschedule
- `process.controller.spec.ts` — DTO validation, auth guards, RBAC, pagination, RFC 7807 errors

**Integration Tests:**
- Full run: seed → start → mock OpenClaw → verify transitions → verify final output
- Approval: run to APPROVAL → verify halt → approve subset → verify resume with subset
- Retry: mock invalid JSON → verify corrective prompt → verify eventual success/failure
- Cancel: start run → cancel mid-step → verify CANCELLED status
- Concurrent: trigger two advanceToNextStep → verify unique constraint prevents duplicate

**E2E Tests (Playwright):**
- Process Builder: create workflow, add steps, edit schemas, save, verify SSH deploy
- Process Results: view leads, approve/reject, verify status updates
- Activity panel: verify real-time step progress
- RBAC: non-owner cannot access builder

### Notes

**High-Risk Items:**
- Agent JSON compliance: 3-level validation + 2 retries + correction feedback
- Hallucinated contacts: DNS verify every email, URL existence check, null > fake
- State corruption: step results persisted immediately, resume from last complete
- OpenClaw timeout: configurable per-step, FAILED on timeout

**Platform Architecture:**
- Process definitions are DATA. New processes = new DB rows.
- Component registry: outputType → Angular component.
- Engine is tenant-agnostic.
- Auto-improve .antigravity.md accumulates per process.

**Future Considerations:**
- Process marketplace (share templates between tenants)
- Conditional branching (if score > 7 → path A)
- Process versioning (track definition changes)
- Analytics dashboard (efficiency metrics)
- SOC 2 tenant isolation (migrate process tables to tenant DBs)
