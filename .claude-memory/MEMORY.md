# Mentor AI Project - Key Learnings

## Autonomous Delivery Mode (2026-04-15 — CRITICAL)
- See: [feedback_autonomous_delivery.md](feedback_autonomous_delivery.md)
- Do NOT ask user to review pieces. Run full cycle autonomously: plan->implement->test->validate->fix
- Use BMAD agents as internal reviewers — Architect, Dev, TEA, PM cross-check everything
- Only return to user with COMPLETE report (investor-presentation grade)
- "No more vibe coding" — every change cross-referenced, tested, verified by 2+ roles

## Agent Autonomy Architecture (2026-04-11 — paradigm shift)
- See: [project_agent_autonomy_spec.md](project_agent_autonomy_spec.md) — complete spec from user conversation + 3 team reviews
- 8 principles: backend defines rules only, agent autonomous at runtime, self-validates, self-corrects
- Retry loops belong IN the agent (SOUL.md), NOT in backend wizard
- Spec drift: agent discovers MCP API changes → sends updated spec to backend
- Role-based Qdrant tagging needed for team isolation

## Process Designer Architecture (2026-04-11 — critical decisions)
- See: [project_process_designer_architecture.md](project_process_designer_architecture.md) — implementation details
- **Core principle**: Backend ONLY defines rules. Agent is AUTONOMOUS at runtime.
- Backend wizard: show MCP options → user picks → generate step defs → deploy ONCE → done
- Agent: self-validates every step, self-corrects MCP failures, retries internally
- No backend retry loops, no backend polling, no backend test validation
- SOUL.md now has self-validation rules (validation gates, self-correction table, 5 retries per step)
- All n8n steps are brain calls (no more MCP HTTP nodes — broken double-stringify bug found)
- Pipeline is phase-based: Search → Enrich → Score → Review → Save (3-5 steps, not 8+)
- n8n workflow update requires deactivate → update → reactivate (was silently failing)
- Unique slug per wizard session (prevents reusing stale workflows)
- **NEXT**: Simplify handleConfirm (remove retry loop), spec drift endpoint, prompt augmentation service

## MCP Framework (2026-04-10)
- See: [project_mcp_framework.md](project_mcp_framework.md) — full status, done/pending, key files
- Generic MCP gateway: POST /mcp/:toolSlug/:operationId — any tool, any operation
- McpToolCatalog with 8 tools (Apollo, Notion, Gmail, Sheets, HTTP, LinkedIn, Brave, FAL.ai)
- n8n workflows update via deactivate → PUT → reactivate (fixed silent failure bug)
- n8n nodes have continueOnFail for error resilience
- Apollo key: APOLLO_KEY_REDACTED (5/5 ops verified)

## Communication: English Only
- See: [feedback_communication_language.md](feedback_communication_language.md)
- Always respond in English even when user writes in Serbian

## Pending: Responsive Layout + Resizable Panels
- See: [feedback_responsive_layout.md](feedback_responsive_layout.md)
- App too small on large screens, needs fluid layout and resizable panels

## Critical: Tailwind CSS v4 + Angular Inline Templates
- **Tailwind v4 does NOT process utility classes in Angular inline templates** (styles/template inside `@Component`)
- ALL components must use **pure CSS class definitions** in the `styles` block
- Design tokens: #0D0D0D (base), #1A1A1A (surface), #242424 (elevated), #2A2A2A (border), #FAFAFA (text), #3B82F6 (primary)
- `BrnButton` from `@spartan-ng/brain/button` and `NgIcon` from `@ng-icons/core` also don't render - must use native `<button>` and inline SVGs

## API Route Prefixes
- `main.ts` sets global prefix `'api'` - controllers must NOT include `api/` in their decorators
- Frontend service URLs must match actual backend routes (e.g., `/api/admin/llm-config` not `/api/v1/admin/llm-config`)

## Dev Mode Bypass Chain
- `DEV_MODE=true` in `apps/api/.env` enables: JWT bypass, MFA bypass, tenant auto-injection, WebSocket auth skip
- Frontend detects dev mode via: `!environment.production && environment.auth0.domain.includes('placeholder')`
- Dev user: `dev-user-001`, tenant: `dev-tenant-001`, role: `PLATFORM_OWNER`

## DB Cleanup: Concepts + Qdrant Must Stay In Sync
- **NEVER truncate `concepts` or `concept_relationships`** — platform data, not user data
- If concepts get deleted, Qdrant embeddings become orphaned (old IDs won't match new DB records)
- To re-seed: (1) `npx ts-node prisma/seed-concepts.ts --clear` from `apps/api/`, (2) delete+recreate Qdrant collection via REST API, (3) run embedding script
- Safe user-data tables: `memories, concept_citations, notes, token_usage, onboarding_metrics, messages, conversations, data_exports, invitation, "user", tenant, tenant_registry, execution_events, executions, agent_executions, agent_jobs, agent_daily_budgets, attachments`
- **`tenant_registry` MUST be cleaned with `tenant`** — has unique constraint on `name`, will block re-registration if stale entries remain
- Preserve: `platform, llm_provider_configs, llm_config_audit_logs, concepts, concept_relationships, concept_workflows`
- **`concept_workflows` is platform data** — cached LLM-generated workflow steps per concept, expensive to regenerate (10+ serial LLM calls). NEVER delete.
- Prisma `@@map()` table names: `User`→`user`, `Tenant`→`tenant`, `Concept`→`concepts`, `embeddingId`→`embedding_id`

## Components Rewritten (Pure CSS)
- chat.component.ts, chat-input.component.ts, chat-message.component.ts
- llm-config.component.ts, onboarding-wizard.component.ts
- dashboard.component.ts, login.component.ts

## Obsidian Vault Concepts (Replaced Old Seeds)
- 548 total concepts (443 Obsidian + 105 AI-discovered), 3658+ relationships
- Seeded via `prisma/seed-obsidian.ts --clear` (reads from $TEMP/obsidian-pages.json + obsidian-real.json)
- **Two category formats in DB**: numbered "6. Prodaja" (Obsidian) + unnumbered "Prodaja" (AI-discovered) — use `contains` matching
- Relationships: earlier chapter → PREREQUISITE, same chapter → RELATED, later chapter → ADVANCED
- **Qdrant embeddings ARE populated**: 443/548 have embeddingId, Qdrant collection synced (OpenAI text-embedding-3-small, 1536-dim)
- Re-embed script: `apps/api/prisma/reembed-openai.ts`

## Concept Classification (ConceptClassifierService)
- `autoClassifyConversation` uses LLM classifier to determine intent → category → concept
- Solves: "prodajni plan" was matched to "Proizvod" instead of "Prodaja" by pure keyword/semantic search
- Fast LLM call (useFallback: true), ~100 output tokens, falls back to ConceptMatchingService on failure
- File: `apps/api/src/app/knowledge/services/concept-classifier.service.ts`

## Business Brain Architecture (Story 3.2)
- **NOT educational** — autonomous Business Brain that thinks for the owner
- Tree shows ONLY concepts with conversations or pending tasks (not all 443)
- Root nodes = 16 categories as cognitive domains
- Strict dept isolation: users see only their dept + foundation (Poslovanje, Vrednost)
- PLATFORM_OWNER sees everything, no filter
- Every completed concept spawns new pending tasks via relationship edges
- Business Context Layer: all memories (tenant-wide) injected into every LLM prompt
- Story file: `_bmad-output/implementation-artifacts/3-2-autonomous-business-brain-workflow-engine.md`

## Architecture
- Angular 21 + Nx Monorepo, NestJS backend, PostgreSQL on Neon cloud
- Multi-tenant with TenantPrismaService (dev mode uses single platform DB)
- Auth0 for OAuth (placeholder config in dev), WebSocket via socket.io at `/ws/chat`

## OpenClaw Business Brain (Architecture Inversion — 2026-03-28 updated)
- See: [brain-architecture-implementation.md](brain-architecture-implementation.md) — FULL status, gaps, key files
- **Critical gap**: OpenClaw never calls task-complete. Auto-scan safety net works on manual complete.
- **Next**: Need timeout mechanism to auto-complete tasks after inactivity
- Server-side tenantId override via OPENCLAW_DEFAULT_TENANT_ID env var
- 8 superior SOUL.md files with full LSA branding, 34+ skills, semantic concept search

## Process Workflow Engine (2026-03-29)
- Full process engine: ProcessWorkflow, ProcessStep, ProcessRun, ProcessStepResult, ApprovedLead, ApprovedContent
- Lead Discovery (6 steps) + Instagram Content (3 steps) processes seeded
- FAL.ai Kontext compositing with Prompt Optimizer AI for image generation
- Reference sculpture images on Hetzner (port 8003): Eterna Harmonia, Nebeski Uzlazak, Golden Flux
- Qdrant process-leads collection for dedup across runs
- Production deploy: https://mentor-ai-app-production.up.railway.app
- Railway project: ffcc2ecc-d975-49e6-b03b-51dd73c814e0, Service: df9132b6-3eab-4b28-8f98-a49825a6a751
- OpenClaw relay on Hetzner 91.98.231.87:3100 (0.0.0.0 binding, auth token required)
- Google OAuth Client ID: 437825281484-96v5si7k5ghkqvoq8mo5kbhfkv16pbol.apps.googleusercontent.com

## Figma Brochure Generation (2026-03-31 — planning complete)
- See: [project_figma_brochure.md](project_figma_brochure.md)
- 6-step process: Ideje → Layout → Tekst → Slike → Preview → Export
- Figma OAuth + BrandDesignProfile extraction from any Figma file
- Component-level approval with feedback-driven regeneration
- BrochurePageViewer — mini-Figma visual editor in our app
- Export: PDF (Puppeteer) + Figma Plugin (editable native design)

## Brochure Quality Feedback (2026-04-01)
- See: [feedback_brochure_quality.md](feedback_brochure_quality.md)
- Text overflow: need flexible layout not fixed absolute positioning
- Must use REAL sculptures via Kontext compositing, not generic AI images
- Images must be contextual to page topic (Vision page = sketches/planning, not generic statue)
- Quote font too small (10pt → 14-16pt), body text needs more content
- Prompt Optimizer must understand page context for image generation

## Neuron OS — VC Pitch (2026-04-01)
- See: [project_neuron_os_pitch.md](project_neuron_os_pitch.md) — full pitch framework, pricing, investment ask
- Product renamed from mentor-ai to Neuron OS
- Positioning: digital operating system that learns your business and accelerates everything

## n8n Integration — Process Execution Layer (2026-04-01)
- See: [project_n8n_integration.md](project_n8n_integration.md) — OpenClaw designs/executes/discovers processes via n8n
- n8n is infrastructure, not competitor. 400+ integrations available immediately.

## Claude Code Architecture Patterns (2026-04-01)
- See: [reference_claude_code_patterns.md](reference_claude_code_patterns.md) — 11 production patterns from Anthropic's CLI
- Key: async generator agentic loop, 5-layer error recovery, SSE resumption, split transport, compaction

## Pipeline Optimization Analysis (2026-03-17)
- See full analysis: [prompt-optimization-analysis.md](prompt-optimization-analysis.md)
- 20 problems identified, top: 3x rewrite, prompt-for-prompt, mandatory images/emails
- Proposed new pipeline: ~25K tokens (from 47K), ~4-6 min (from 10-15)
- Key: pre-check domain master knowledge, direct planner instructions, single synthesis+score
