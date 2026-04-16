---
stepsCompleted: ['step-01-validate-prerequisites', 'step-02-design-epics', 'step-03-create-stories', 'step-04-final-validation']
status: 'complete'
totalEpics: 9
totalStories: 38
frCoverage: '23/23'
inputDocuments:
  - "_bmad-output/planning-artifacts/prd.md"
  - "_bmad-output/planning-artifacts/prd-v2-autonomous-brain-architecture.md"
  - "_bmad-output/planning-artifacts/architecture.md"
  - "_bmad-output/planning-artifacts/autonomous-business-brain-architecture.md"
  - "_bmad-output/planning-artifacts/ux-design-specification.md"
  - "_bmad-output/planning-artifacts/project-context.md"
workflowType: 'epics'
project_name: 'Neuron OS'
date: '2026-04-12'
author: 'Tanjav'
documentCounts:
  prd: 2
  architecture: 2
  ux: 1
  projectContext: 1
  codebaseScan: 1
---

# Neuron OS v2 - Epic Breakdown (Autonomous Brain Architecture)

## Overview

This document provides the complete epic and story breakdown for the Neuron OS v2 architectural evolution, decomposing requirements from PRD v2 (Autonomous Brain Architecture), the original PRD, Architecture docs, UX Design, and a comprehensive codebase scan into implementable stories.

**Key context:** This is a BROWNFIELD project with 43 backend services, 51 DB models, 13 OpenClaw agents, and 39+ frontend components already built. Epics distinguish between new development, evolution of existing code, and technical debt resolution.

**Demo deadline:** April 18, 2026

## Requirements Inventory

### Functional Requirements

FR1: Skill Builder wizard must guide users through tool selection, operation selection, input fields, pipeline preview, and confirmation — producing precise agent definitions (SOUL.md) with step-by-step JSON specs, validation gates, and MCP call patterns
FR2: Prompt Enricher must invisibly rewrite user messages before they reach AI agents — injecting business context (ICP, industry, products), quality standards, format rules, historical context, and scoring criteria from the tenant's Obsidian vault
FR3: Every spawned per-process agent must receive a comprehensive SOUL.md containing: identity, step-by-step execution plan, MCP gateway curl patterns, validation gates per step, self-correction rules, data chaining instructions, business context, and hard output rules
FR4: Qdrant must store all agent outputs, memories, and process results with rich metadata: tenantId, userId, departmentTags[], conceptId, source, confidence, lastReinforced, tier
FR5: Per-tenant Obsidian vault must be created during onboarding following Karpathy LLM Wiki pattern: raw/ (immutable sources), wiki/ (living concepts), skills/ (hidden), instructions/ (hidden), index.md, log.md, SCHEMA.md
FR6: Agents must self-validate every execution step and self-correct before returning results
FR7: Every piece of data must have department metatags. Backend filters based on user's role/department.
FR8: Agents must know the user's role and tailor responses accordingly (double filtering)
FR9: Dedicated agents per mode must proactively suggest next steps rendered as interactive cards
FR10: Agents must detect MCP API changes, adapt, and report _specDrift back to backend
FR11: Automated brain maintenance: dedup, staleness detection, contradiction finding, orphan linking, consolidation
FR12: Onboarding agents must research and rewrite each base concept specifically for the tenant's business
FR13: Initial concept relationships (3658+ edges) must be preserved during onboarding
FR14: New relationships must be created as the brain grows
FR15: All concept notes must be in English with proper markdown, YAML frontmatter, minimum 200 words
FR16: Graph view must show ONLY the business-specific brain, not seed templates
FR17: Process Designer must generate phase-based pipelines (3-5 steps max)
FR18: Process Builder must work end-to-end reliably: wizard → deploy → agent execution → verified results returned to user. Existing code (wizard service, IR compiler, n8n emitter, deploy service, SOUL.md emitter) is reusable but needs significant rework — n8n deactivate-update-reactivate pattern exists but full flow is broken. Backend retry loops must be removed; agent must own execution autonomy.
FR19: Process Builder must generate unique identifiers per session and never reuse stale workflows from previous sessions. Slug collision fix exists in code but the overall deploy-test-publish pipeline needs redesign around agent autonomy.
FR20: Backend must accept spec drift updates via callback handler
FR21: Conversation insights must crystallize back into Obsidian vault
FR22: Process results must be stored in Qdrant with department tags
FR23: Platform owner must have real-time monitoring dashboards per feature: agent executions, MCP calls, brain operations, process runs, and system-wide health indicators

### Non-Functional Requirements

NFR1: Agent self-validation clean results on 90%+ of runs
NFR2: Onboarding brain creation < 10 minutes
NFR3: Wizard card response < 1 second
NFR4: Qdrant filtered queries < 100ms
NFR5: Per-process agent timeout 30 min max, 10 min per step
NFR6: MCP calls 5-retry with exponential backoff
NFR7: Brain lint < 5 minutes for < 1000 notes
NFR8: Concept notes minimum 200 words with real data
NFR9: Prompt enrichment < 500ms latency
NFR10: Multi-department tagging (N tags per item)
NFR11: Demo deadline April 18, 2026

### Additional Requirements

From Architecture:
- Multi-tenant with physical data isolation (TenantPrismaService)
- Angular 21 standalone components with Signals
- NestJS with strict TypeScript, RFC 7807 errors
- Entity ID prefixes mandatory (usr_, tnt_, proc_, etc.)
- LLM calls through TenantContextBuilder
- WebSocket events domain:action format

From existing codebase (43 services, 51 models, 13 agents):
- DepartmentGuard + department-categories.ts (role access at API level)
- Memory embedding stores vectors with userId, type (missing: departmentTags)
- Concept classifier auto-classifies conversations
- YoloScheduler runs autonomous tasks
- Process executor with error categorization
- n8n IR compiler → emitter → deploy pipeline
- Wizard card stream parser (SSE)
- MCP gateway with 8 tools configured

### FR Coverage Map

| FR | Epic | Description |
|----|------|-------------|
| FR1 | Epic 3 | Skill Builder wizard flow |
| FR2 | Epic 2 | Prompt enrichment |
| FR3 | Epic 3 | Detailed agent SOUL.md instructions |
| FR4 | Epic 5 | Qdrant rich metadata |
| FR5 | Epic 1 | Obsidian vault creation (Karpathy pattern) |
| FR6 | Epic 4 | Agent self-validation and self-healing |
| FR7 | Epic 5 | Department metatags on all data |
| FR8 | Epic 2 | Agent role-aware response filtering |
| FR9 | Epic 6 | Smart recommendation cards |
| FR10 | Epic 4 + 7 | MCP spec drift detection and adaptation |
| FR11 | Epic 8 | Brain maintenance (lint, dedup, staleness) |
| FR12 | Epic 1 | Onboarding concept research and enrichment |
| FR13 | Epic 1 | Initial relationship preservation |
| FR14 | Epic 1 + 8 | Evolving relationships |
| FR15 | Epic 1 | Concept note quality standards |
| FR16 | Epic 1 | Graph view shows business brain only |
| FR17 | Epic 3 | Phase-based pipeline generation |
| FR18 | Epic 3 | Process Builder E2E reliability |
| FR19 | Epic 3 | Unique session identifiers |
| FR20 | Epic 7 | Backend accepts spec drift updates |
| FR21 | Epic 2 + 8 | Conversation crystallization to vault |
| FR22 | Epic 5 | Process results with department tags |
| FR23 | Epic 9 | Monitoring dashboards per feature |

Coverage: 22/22 FRs mapped. Zero gaps.

### Source Vault Reference
- Published vault: https://publish.obsidian.md/hadzi-vojin
- 445 published pages, 22 numbered categories under Poslovanje/
- 921 concepts in DB (445 Obsidian + AI-discovered), 9817 relationships
- EXCLUDE: "Kako koristiti Mentor AI?" and "Promptovi" — not business concepts
- Notes: Serbian, H3 content sections, H2 References, [[wikilinks]] throughout

## Epic List

### Epic 1: Business Brain Creation (Onboarding)
Users get a fully populated business brain — concepts researched and rewritten for THEIR business, with relationships, department tags, and professional formatting. Graph view shows their brain.
**FRs covered:** FR5, FR12, FR13, FR14, FR15, FR16

### Epic 2: Prompt Enrichment and Intelligent Conversations
Users type natural language and get expert-quality responses. System invisibly enriches messages with business context. Valuable insights crystallize back into the brain.
**FRs covered:** FR2, FR8, FR21

### Epic 3: Process Builder and Skill Generation
Users describe what they want to automate and the wizard guides them through to a fully deployable process with precise agent instructions.
**FRs covered:** FR1, FR3, FR17, FR18, FR19

### Epic 4: Autonomous Agent Execution and Self-Healing
Processes run autonomously. Agent self-validates every step, retries MCP calls, adapts parameters, returns verified clean results. User never sees raw errors.
**FRs covered:** FR6, FR10

### Epic 5: Role-Based Data Access and Security
Marketing sees marketing. Finance sees finance. Owner sees everything. Every piece of data filtered by role.
**FRs covered:** FR4, FR7, FR22

### Epic 6: Smart Recommendations and Interactive Cards
System proactively suggests what to do next — tools to connect, processes to build, tasks to tackle — rendered as interactive cards.
**FRs covered:** FR9

### Epic 7: MCP Tool Integration and Evolution
External tools stay current automatically. When APIs change, agents adapt and update the platform.
**FRs covered:** FR10, FR20

### Epic 8: Brain Maintenance and Knowledge Evolution
Brain stays healthy over time. Duplicates merged, stale info flagged, contradictions detected, new knowledge integrated.
**FRs covered:** FR11, FR14, FR21

---

## Epic 1: Business Brain Creation (Onboarding)

Users get a fully populated business brain — 445 concepts from the proven Obsidian curriculum (publish.obsidian.md/hadzi-vojin), rewritten specifically for their business by MiniMax agents. Top 100 concepts enriched during onboarding, remaining populated via AI recommended tasks. Graph view shows their brain with relationships mirroring the source vault.

### Story 1.1: Tenant Obsidian Vault Creation

As a new business owner onboarding to Neuron OS,
I want the system to create a dedicated knowledge vault for my business,
So that my AI agents have a structured knowledge base that mirrors the proven Obsidian curriculum.

**Acceptance Criteria:**

**Given** a new tenant has completed the business profile step of onboarding
**When** the system initializes the brain for this tenant
**Then** a new Obsidian vault instance is created for this tenant with the same folder structure as the source vault (publish.obsidian.md/hadzi-vojin)
**And** the structure includes all 22 categories under Poslovanje/ (Uvod u Poslovanje, Vrednost, Marketing, Kognitivne Sklonosti, Odredjivanje Cene, Prodaja, Razvoj Poslovanja, Finansije, Operacije i Proizvodnja, Menadzment, Ljudski Resursi, Rad sa Ljudima, Upravljanje Svojim Radom, Isporuka Vrednosti, Sistemi, Poslovni Modeli, Kompanijska Struktura, Tipovi Kompanija, Kupovina i Prodaja Poslovanja, Startup, Upravljanje Podacima, plus root-level notes Tok Vrednosti and Stvaranje Barijera za Konkurente)
**And** "Kako koristiti Mentor AI?" and "Promptovi" are NOT included in the vault, file structure, or tree view
**And** the vault includes hidden infrastructure: skills/, instructions/, index.md, log.md, SCHEMA.md (not visible to users)
**And** the vault is isolated to the tenant (no cross-tenant access)
**And** all 445 concept note files are created as placeholders in their correct category folders (ready for enrichment)

### Story 1.2: Business-Specific Concept Rewrite and Enrichment

As a new business owner,
I want each business concept to be rewritten specifically for MY business while preserving the original teaching style,
So that my brain contains deep, authoritative knowledge that feels like it was written for my industry.

**Acceptance Criteria:**

**Given** a tenant vault exists with 445 placeholder concept notes and the user's business profile is available
**When** the onboarding enrichment process runs
**Then** the Main agent identifies the top 100 concepts most relevant to this specific business and queues them for enrichment first
**And** a MiniMax agent rewrites each concept SEQUENTIALLY (not in parallel) to avoid duplicate information across concepts
**And** each rewritten concept preserves the TONE and STYLE of the original Serbian note but translates/adapts it to the specific business being onboarded
**And** each concept is minimum 5000 words with: detailed analysis, industry-specific strategies, competitor references, market data, actionable recommendations
**And** each concept includes hyperlinks and URLs to real sources that confirm the research (websites, articles, reports, data)
**And** all internal [[wikilinks]] between concepts are preserved (pointing to the tenant's own concept notes, not the template vault)
**And** YAML frontmatter includes: title, departmentTags, sectionTags (per H2/H3 section), confidence (0.7 initial), lastReinforced, tier (semantic)
**And** the initial 100 concepts complete during onboarding (background processing acceptable)
**And** the remaining 345 concepts are NOT enriched during onboarding — they are populated later via AI recommended tasks as the system discovers they are relevant to the business

### Story 1.3: Relationship Replication from Source Vault

As a business owner viewing my brain graph,
I want to see the same meaningful connections between concepts as in the proven source curriculum,
So that I understand how different aspects of my business relate to each other.

**Acceptance Criteria:**

**Given** the source vault at publish.obsidian.md/hadzi-vojin has 445 concepts with defined relationships (PREREQUISITE, RELATED, ADVANCED based on chapter ordering and [[wikilinks]])
**When** the tenant brain is created
**Then** ALL relationships from the source vault are replicated in the new tenant vault, mapped to the tenant's concept IDs
**And** relationship types follow the source vault convention: earlier chapter to PREREQUISITE, same chapter to RELATED, later chapter to ADVANCED
**And** [[wikilinks]] within concept content are preserved and point to the tenant's own notes
**And** the References section at the bottom of each note is maintained with correct links
**And** the relationship graph is identical in structure to the source vault (same edges, same directions)
**And** new relationships can be added over time as the brain grows (new concepts get linked by agents)

### Story 1.4: Section-Level Department Tagging

As a business owner with a multi-department team,
I want individual SECTIONS within each concept to be tagged by department,
So that team members see only the sections relevant to their role — not the entire concept hidden or shown as a block.

**Acceptance Criteria:**

**Given** a concept like "Finansijski Plan" has H2/H3 sections covering different departmental concerns
**When** the MiniMax agent rewrites the concept during onboarding
**Then** each H2/H3 section within the concept is tagged with one or more department identifiers (via sectionTags in frontmatter or inline markers)
**And** when a marketing user views this concept in the tree view, they see ONLY the sections tagged for marketing (plus any sections tagged for all departments)
**And** when the tenant owner views it, they see ALL sections
**And** the backend API parses the markdown, filters sections by the requesting user's role, and returns only the allowed sections
**And** the UI renders filtered sections seamlessly — no visible gaps, no access denied placeholders, no indication that hidden sections exist
**And** the graph view shows the concept node for ALL users (concepts are not hidden at graph level) — only the tree view content is filtered by section

### Story 1.5: Business Brain Graph View

As a business owner,
I want to see my business brain as an interactive graph of connected concepts,
So that I can explore how different areas of my business relate and find knowledge.

**Acceptance Criteria:**

**Given** the tenant has an enriched brain with concepts and relationships from the new Obsidian vault
**When** the user navigates to the graph view
**Then** the graph displays concepts from the tenant's NEW vault (not the source template vault)
**And** ALL concepts are shown in the graph EXCEPT those that are fully blocked for the user's role (no section-level filtering in graph — that is tree view only)
**And** concepts are colored/grouped by their category (matching the Poslovanje categories)
**And** relationships are shown as edges with correct directionality
**And** clicking a concept navigates to the tree view where section-level filtering applies
**And** the graph grows over time as new concepts are discovered and enriched by AI recommended tasks
**And** the graph structure starts identical to the source vault and evolves as the brain evolves

---

## Epic 2: Prompt Enrichment and Intelligent Conversations

Users type natural language and get expert-quality responses. System invisibly enriches messages with business context, industry research, and role-appropriate filtering. Valuable insights crystallize back into the brain. Brain index enables fast concept lookup.

### Story 2.1: Prompt Enrichment Service

As a business owner typing a question in chat,
I want the system to invisibly enrich my message with business context and industry research before the AI processes it,
So that I get expert-quality responses backed by real data without needing to write detailed prompts.

**Acceptance Criteria:**

**Given** a user sends a message like "how should I price my new product?"
**When** the message reaches the backend before being sent to the AI agent
**Then** the PromptEnrichmentService enriches it with:
  - Business context from the tenant's Obsidian vault (industry, products, ICP, competitors)
  - Relevant concept content (the system identifies "Odredjivanje Cene" as the relevant concept via the brain index and injects key points)
  - Industry research: current market data, pricing benchmarks, relevant statistics with source URLs
  - Best practices: proven frameworks and methodologies for the identified topic, with references
  - Quality standards (expected response format, depth, minimum detail level)
  - Historical context (what similar questions were asked before, what worked)
  - The user's role/department (so the agent knows what perspective to take)
**And** the enriched prompt instructs the agent to include real numbers, URLs, and references in its response — not generic advice
**And** the enrichment adds < 500ms latency to message processing
**And** the user never sees the enriched prompt — only their original message appears in the chat UI
**And** the enriched prompt is logged for debugging but not stored in conversation history

### Story 2.2: Role-Aware Agent Response Filtering

As a marketing team member,
I want AI responses to focus on marketing-relevant information,
So that I don't get overwhelmed with finance or legal details that aren't my responsibility.

**Acceptance Criteria:**

**Given** a marketing user asks "what should our Q3 strategy look like?"
**When** the AI agent generates a response
**Then** the agent's instructions (via SOUL.md or system prompt) include the user's department and role
**And** the response emphasizes marketing-relevant aspects (campaigns, channels, content, brand)
**And** the response does NOT expose raw financial data (P&L, cash flow) unless the user is finance or owner
**And** cross-functional information (e.g., marketing budget) is included but framed from the marketing perspective
**And** if the user is TENANT_OWNER, the response includes ALL perspectives without filtering
**And** this filtering is complementary to the backend section-level filtering — the agent filters proactively, the backend filters defensively

### Story 2.3: Conversation Insight Crystallization

As a business owner who just had a valuable conversation with the AI,
I want key insights to be automatically saved back into my brain,
So that knowledge compounds over time and isn't lost in chat history.

**Acceptance Criteria:**

**Given** a conversation produces a substantive analysis (not a simple Q&A — e.g., a pricing strategy discussion, a competitor analysis, a marketing plan review)
**When** the conversation ends or reaches a natural conclusion
**Then** the system identifies high-value insights using quality scoring (length, specificity, actionability)
**And** qualifying insights are filed back into the relevant concept note in the Obsidian vault as a new section (e.g., "## Insights from Conversation on 2026-04-12")
**And** the concept's lastReinforced timestamp is updated
**And** the concept's confidence score is incremented (more conversations = higher confidence)
**And** if the insight relates to a concept that doesn't exist yet, a new concept note is created and linked to the nearest related concept
**And** the brain index (index.md) is updated with the new or modified concept entry
**And** the crystallization happens asynchronously — it does not block the chat experience
**And** the operation is logged in the vault's log.md

### Story 2.4: Brain Index for Fast Concept Lookup

As an AI agent processing a user's message,
I want a maintained index of all concepts in the brain with one-line summaries and category tags,
So that I can quickly identify which concepts are relevant without scanning all 445 notes.

**Acceptance Criteria:**

**Given** a tenant's Obsidian vault has enriched concepts
**When** the index is generated (during onboarding and updated after each concept change)
**Then** an index.md file is created in the vault root containing every concept with: name, category, one-line summary (max 150 chars), department tags, and confidence score
**And** the index is organized by category (matching the 22 Poslovanje categories)
**And** the index is loaded by agents as their FIRST action when they need brain context — before any vector search or full-note reading
**And** for vaults under 500 concepts, the index alone is sufficient for concept identification (no vector search needed for navigation)
**And** when a concept is added, enriched, or updated, the index entry is updated automatically
**And** the index includes a lastUpdated timestamp so agents know if their cached version is stale
**And** the index is hidden from users (infrastructure file, not a concept)
**And** a log.md is maintained alongside the index as an append-only chronological record of all vault operations (ingest, update, lint) with timestamps and operation type

---

## Epic 3: Process Builder and Skill Generation

Users describe what they want to automate in one sentence and the wizard guides them through tool selection, operations, inputs, pipeline design, and confirmation — producing a fully deployable process with precise agent instructions that work autonomously.

### Story 3.1: Deterministic Wizard Card Flow

As a business owner who wants to automate a process,
I want a step-by-step wizard that guides me through tool selection, operations, inputs, and pipeline design,
So that I can build a process without understanding the technical details.

**Acceptance Criteria:**

**Given** the user navigates to the Process Designer page and types a process description
**When** the description is submitted in "Guided wizard" mode
**Then** the backend returns a tool_select card within 1 second showing all connected MCP tools with their status (connected, verified, operation count)
**And** after tool selection, an operation_select card shows ONLY operations for the selected tool (not all tools)
**And** after operation selection, an input_fields card suggests relevant input parameters based on the description and selected operations
**And** after input confirmation, a pipeline_preview card shows a phase-based pipeline (max 3-5 phases: Search and Gather, Enrich and Qualify, Score and Rank, Review, Save)
**And** after pipeline approval, a confirm card shows the complete summary
**And** each card responds within 1 second (all backend logic, no AI delay)
**And** the wizard generates a unique slug per session (no reuse of stale workflows)
**And** contextual button labels are shown per card type (Select tool, Confirm operations, Set inputs, Approve pipeline, Confirm and Build)

### Story 3.2: Rich SOUL.md Generation for Per-Process Agents

As the platform deploying a new process,
I want the generated agent instructions to be comprehensive and precise,
So that the per-process agent can execute its entire pipeline autonomously without backend intervention.

**Acceptance Criteria:**

**Given** the user has confirmed a process design through the wizard
**When** the backend generates the per-process agent's SOUL.md
**Then** the SOUL.md contains:
  - Agent identity and purpose (one paragraph, specific to this process)
  - Complete step-by-step execution plan with JSON specs for each phase
  - MCP gateway call patterns with exact exec curl commands, URLs, auth headers, and body formats
  - API-specific parameter rules (e.g., Apollo: locations MUST be arrays, per_page is a number)
  - Data chaining instructions (how to extract IDs/domains from step N output for step N+1 input)
  - Validation gates per step (expected output schema, minimum item count, error object detection)
  - Self-correction rules table (parameter format to fix and retry, timeout to retry, auth to stop, rate limit to wait)
  - End-of-execution validation (filter errors, verify count > 0, verify fields, deduplicate)
  - Business context from the tenant's Obsidian vault (ICP, industry, products)
  - Hard rules (JSON only, no invented data, no prose, self-validate every step)
  - MCP gateway reference section with tool-specific documentation (Apollo field rules, Notion property format)
**And** the SOUL.md is sufficient for the agent to run the entire pipeline without any backend calls during execution

### Story 3.3: Simplified Deploy-Once Pipeline

As the platform deploying a new process,
I want the build step to deploy once and trust the agent,
So that the system doesn't waste time with backend retry loops.

**Acceptance Criteria:**

**Given** the user clicks "Confirm and Build" in the wizard
**When** the backend handles the confirmation
**Then** the flow is: generate design, save draft, validate against business rules, deploy infrastructure (n8n workflow + per-process agent registration + storage if needed), trigger ONE test run, poll for results (up to 30 minutes), accept if agent returns valid items, publish
**And** there is NO backend retry loop — if the test fails, the agent is responsible for self-healing during its single execution
**And** the backend only checks for catastrophic failures: null response, status=failed, zero usable items (items with parseError/error/statusCode are filtered)
**And** if the agent returns valid items (even partial — some items good, some filtered out), the process is published
**And** n8n workflow updates use the deactivate, PUT, reactivate pattern (never PUT on active workflow)
**And** per-process agent registration on the OpenClaw relay includes a 10-second wait for gateway restart before triggering the test

### Story 3.4: Phase-Based Pipeline Generation

As a business owner building a process,
I want the pipeline to show logical phases — not individual API operations,
So that the process looks simple and understandable (3-5 steps, not 8+).

**Acceptance Criteria:**

**Given** the user selected multiple operations (e.g., search_organizations, enrich_organization, save_contact from Apollo)
**When** the pipeline preview is generated
**Then** operations are grouped into logical phases:
  - All search operations become one "Search and Gather" phase (one brain call — agent calls the MCP operations internally)
  - All read/enrich operations become one "Enrich and Qualify" phase (one brain call)
  - Scoring/ranking becomes one "Score and Rank" phase (if description mentions scoring/ranking/fit/match)
  - Approval becomes one "Review Results" phase (always present)
  - All write operations become one "Save Results" phase (one brain call)
**And** each phase becomes ONE brain call in the n8n workflow (agent handles multiple MCP operations within a single call)
**And** the total pipeline is 3-5 phases maximum
**And** the n8n workflow structure is: Webhook, Ack, [BrainCall, Parse] x N, Callback (where N = number of phases)

### Story 3.5: Non-Blocking Build Experience

As a business owner who just confirmed a process build,
I want to see progress while the build runs without being stuck on a spinner,
So that I know what's happening and can continue using the app if it takes time.

**Acceptance Criteria:**

**Given** the user clicks "Confirm and Build"
**When** the build process starts (deploy + test run)
**Then** the UI shows a Build Status card in the chat with: current phase label (Deploying infrastructure / Running test / Validating results), elapsed time, and estimated duration range
**And** the chat input is re-enabled — the user can start designing another process, browse existing ones in the sidebar, or navigate away
**And** if the user navigates away and returns, the Build Status card shows the current state
**And** on success, the card transforms to: "Process verified and published. Test run produced N real results." with actions: View Results, Build Another
**And** on failure, the card shows a human-readable error with suggested actions: Retry, Edit Process, View Details
**And** no raw error strings, stack traces, or technical messages are ever shown to the user
**And** before the process is published, the system verifies the SOUL.md was saved correctly on the OpenClaw relay (both default and tenant profile directories)
**And** the per-process agent's SOUL.md contains ALL MCP communication rules generated by the Process Builder — the agent is the ONLY entity that calls MCP tools, using the exact patterns from its instructions
**And** if the SOUL.md registration fails (relay unreachable, gateway restart timeout), the system retries registration up to 3 times before reporting failure
**And** the agent's instructions are immutable once published — the per-process agent follows the same rules every time it runs, ensuring consistent behavior across executions
**And** MCP tool calls are NEVER made directly by n8n nodes or backend services during process execution — ALL MCP communication goes through the dedicated per-process agent using the rules that the Process Builder generated in the SOUL.md

**Story 3.1 Additional Note:** Wizard card flows are a UNIVERSAL interaction pattern — not just Process Builder. Chat, AI recommended tasks, and Process Builder all use interactive cards. Each mode has a dedicated agent that generates card content appropriate to that context. The card rendering infrastructure is shared across all modes.

**Story 3.3 Additional Note:** Deployment is ONLY triggered after the user completes the full wizard flow (tool_select, operation_select, input_fields, pipeline_preview, confirm). There is no API path that deploys without wizard confirmation.

---

## Epic 4: Autonomous Agent Execution and Self-Healing

Processes run autonomously. The per-process agent self-validates every step, retries MCP calls, adapts parameters, and returns verified clean results. The user never sees raw errors. The backend triggers once and waits.

### Story 4.1: Agent Step-by-Step Validation Gates

As the platform running a process,
I want the per-process agent to validate its own output at every step before proceeding,
So that bad data never flows downstream and the final result is always clean.

**Acceptance Criteria:**

**Given** a process has been fully validated and deployed by the Process Builder (wizard flow completed, SOUL.md verified on relay, n8n workflow active)
**When** the per-process agent executes a pipeline run
**Then** the agent validates its output at every step BEFORE proceeding:
  - Output is valid JSON (parseable, starts with [, ends with ])
  - Array has > 0 items (empty = step failed)
  - No items contain error, parseError, or statusCode fields
  - Items contain the key fields expected for that step
**And** validation failures trigger the self-correction rules (Story 4.2) — the agent fixes the problem, not the backend
**And** this is RUNTIME validation — separate from the BUILD-TIME validation that the Process Builder already completed
**And** the process was already proven to work during the build test run — runtime self-healing handles TRANSIENT issues (API timeouts, rate limits, data changes) not structural issues (wrong tool, missing credentials)

### Story 4.2: Agent Self-Correction on MCP Failures

As the per-process agent calling external tools,
I want to diagnose and fix MCP call failures myself,
So that transient issues don't kill the entire process run.

**Acceptance Criteria:**

**Given** an MCP gateway call (via exec curl) returns an error
**When** the agent diagnoses the error type
**Then** the agent applies the correct fix and retries (max 5 retries per step):

  - Parameter format (response says "must be array" or "invalid type"): Fix parameter and retry
  - Empty results (API returns [] or empty): Broaden search params, fewer filters, retry
  - Timeout / ECONNABORTED: Retry the same call (transient)
  - Auth failure (401/403): STOP retrying this step. Include auth error in output.
  - Rate limit (429): Wait 10 seconds, then retry
  - Server error (5xx): Retry up to 3 times with 5-second gaps
  - Malformed response (HTML or garbage): Try parsing for embedded JSON, retry if unparseable

**And** after 5 retries on the same step with no success, the agent proceeds to the next step with whatever data it has (graceful degradation, not hard failure)
**And** the agent logs each retry attempt in its output for debugging
**And** the self-correction rules are in the SOUL.md — the backend does not intervene

### Story 4.3: End-of-Execution Validation and Clean Output

As a business owner waiting for process results,
I want the agent to return only verified, clean data,
So that I never see error objects, duplicates, or garbage in my results.

**Acceptance Criteria:**

**Given** the agent has completed all pipeline steps
**When** the agent prepares its final output
**Then** the agent performs end-of-execution validation:
  1. Filter — removes any items with error, parseError, or statusCode fields
  2. Verify count — the filtered array must have > 0 items. If 0 survive filtering, returns a clean error object
  3. Verify fields — spot-checks that items have expected fields. Missing fields get "not found" value
  4. Deduplicate — removes duplicate items by the most natural key (domain, name, ID)
**And** the final output is a clean JSON array — no prose, no markdown fences, no error objects mixed with real data
**And** the callback sends this clean output to the backend
**And** the backend accepts the output and publishes the results without re-validating (trusts the agent)

### Story 4.4: MCP Spec Drift Detection During Execution

As the platform evolving with external tool changes,
I want agents to detect when an MCP API has changed and fix it — there is no option to fail.

**Acceptance Criteria:**

**Given** a per-process agent calls the MCP gateway with parameters that used to work
**When** the API returns an error indicating a change (field renamed, endpoint deprecated, new required parameter)
**Then** the agent:
  1. Reads the error message for clues about the change
  2. Tries alternative field names or parameter formats
  3. Keeps trying variations until it finds the format that works — there is no option to fail. The agent iterates through: error message parsing, common field name patterns, API documentation hints, broader/simpler parameter sets
  4. Once it succeeds (and it MUST succeed), completes its task with the corrected parameters
  5. Appends a _specDrift object to its output with the OLD and NEW field names/configuration
**And** the backend callback handler extracts _specDrift objects from the agent's output
**And** the backend updates the McpToolCatalog with the corrected field/endpoint information
**And** the backend updates ALL existing SOUL.md files for processes using this tool with the new field names
**And** all future SOUL.md generations include the corrected information automatically
**And** the spec drift is logged for audit with: tool, operation, old config, new config, timestamp, which agent discovered it

---

## Epic 5: Role-Based Data Access and Security

Marketing sees marketing. Finance sees finance. Owner sees everything. Every piece of data — conversations, process results, brain concepts, recommendations — is filtered by the user's role. No one sees data they shouldn't.

### Story 5.1: Department Metatags on Qdrant Vectors

As a platform ensuring data isolation between departments,
I want every vector stored in Qdrant to carry department tags,
So that queries can be filtered by the requesting user's role at the vector level.

**Acceptance Criteria:**

**Given** any data is stored as a vector in Qdrant (memory, process result, concept embedding, conversation insight)
**When** the vector is upserted
**Then** the Qdrant payload includes departmentTags: string[] alongside existing fields (tenantId, userId, type, subject)
**And** departmentTags is an array supporting multiple departments per vector (cross-functional data)
**And** existing vectors without departmentTags are treated as visible to all departments (backward compatible)
**And** the memory-embedding.service.ts generateAndStoreEmbedding() method accepts and stores departmentTags
**And** all code paths that create vectors are updated to pass departmentTags: memory creation, concept embedding, process result storage, conversation insight crystallization

### Story 5.2: Filtered Qdrant Queries by User Role

As a marketing team member querying the system,
I want search results to only return data tagged for my department,
So that I never see finance, legal, or other departments' confidential information.

**Acceptance Criteria:**

**Given** a user with role=TEAM_MEMBER and department=MARKETING queries the system (chat context, memory search, concept lookup)
**When** the backend performs a Qdrant vector search
**Then** the query includes a filter: departmentTags CONTAINS user.department OR departmentTags IS EMPTY (backward compat)
**And** the filter is applied at the Qdrant query level (not post-query in application code) for < 100ms performance
**And** PLATFORM_OWNER and TENANT_OWNER bypass the department filter entirely (see all data)
**And** the memory-context-builder.service.ts buildContext() applies department filtering before injecting context into prompts
**And** no filtered-out data leaks into agent prompts, conversation context, or UI responses

### Story 5.3: Process Result Tagging and Filtering

As a business owner running processes for different teams,
I want process results to be tagged with the department that owns them,
So that team members only see results from their department's processes.

**Acceptance Criteria:**

**Given** a process produces results (e.g., lead discovery for sales, content ideation for marketing)
**When** the callback stores the results
**Then** results are tagged with the department(s) of the process (derived from the process's category or the creating user's department)
**And** when results are stored in Qdrant for dedup/retrieval, they carry departmentTags
**And** the ProcessRun and ProcessStepResult records include a departmentTags field
**And** the Processes results page filters results by the viewing user's department
**And** the builder-results.component.ts respects department filtering when displaying approved items

### Story 5.4: Conversation Department Scoping

As a team member chatting with the AI,
I want my conversation context to be scoped to my department,
So that the AI draws on relevant knowledge and previous conversations from my team — not all teams.

**Acceptance Criteria:**

**Given** a marketing user starts a conversation
**When** the system builds conversation context (memories, previous conversations, concept references)
**Then** the context includes only memories and insights tagged for the marketing department (plus foundation/all-department content)
**And** the conversation itself is tagged with the user's department upon creation
**And** when other marketing users search conversation history, they can find this conversation
**And** finance users searching conversation history do NOT see marketing conversations
**And** TENANT_OWNER sees all conversations across all departments
**And** the conversation.service.ts creates conversations with departmentTags from the creating user's profile

---

## Epic 6: Smart Recommendations and Interactive Cards

The system proactively suggests what the user should do next — which tools to connect, what processes to build, what tasks to tackle, what concepts to explore — all rendered as interactive cards the user can act on with one click. Dedicated agents per mode generate contextually appropriate recommendations.

### Story 6.1: MCP Configuration Recommendation Cards

As a new business owner who just onboarded,
I want the system to suggest which tools I should connect and guide me through configuration,
So that I can start automating processes without figuring out integrations myself.

**Acceptance Criteria:**

**Given** a tenant has completed onboarding but has not connected any MCP tools (or has connected some but not all relevant ones)
**When** the user opens the chat or dashboard
**Then** the system presents recommendation cards for unconnected tools that are relevant to their business:
  - Card shows: tool name, icon, one-line benefit statement, "Connect" action button
  - Cards are prioritized by relevance to the tenant's industry
  - Connected tools show a "Connected" badge instead of "Connect" button
**And** clicking "Connect" navigates to Settings with the tool's configuration panel pre-opened
**And** after connecting a tool, the card updates to suggest the NEXT action: "Apollo connected. Build a lead discovery process?" with a "Build Process" button
**And** recommendations are generated by a dedicated recommendation agent that reads the tenant's brain index + connected tools

### Story 6.2: AI Recommended Task Cards

As a business owner exploring my brain,
I want the system to suggest specific tasks I should work on based on what I've done and what I haven't,
So that I always know what the most impactful next step is.

**Acceptance Criteria:**

**Given** a tenant has an enriched brain with concepts at varying levels of exploration
**When** the user opens the AI Recommended Tasks view or the dashboard
**Then** the system presents task recommendation cards, each containing:
  - Task title (action-oriented: "Review your pricing strategy", "Analyze competitor positioning")
  - Related concept (linked to the brain concept this task addresses)
  - Priority indicator (High/Medium/Low based on business impact and concept staleness)
  - Estimated effort (Quick 5-min / Deep 30-min)
  - Action buttons: Start (opens conversation about this concept), Dismiss, Later
**And** tasks are generated by analyzing: which concepts have never been discussed, which concepts have stale data (low confidence, old lastReinforced), which concepts are prerequisites for the user's stated goals
**And** clicking "Start" opens a chat conversation pre-loaded with context from the relevant concept
**And** dismissed tasks don't reappear for 7 days
**And** completed tasks trigger the brain to check for NEW recommended tasks (concepts discovered as relevant via relationships)
**And** the remaining 345 unenriched concepts (from onboarding Story 1.2) are surfaced here as tasks when the system discovers they are relevant to the business

### Story 6.3: Process Suggestion Cards in Chat

As a business owner having a conversation with the AI,
I want the AI to suggest relevant processes I could automate when it detects an opportunity,
So that I discover automation possibilities naturally during conversations.

**Acceptance Criteria:**

**Given** a user is chatting about a topic that maps to an automatable workflow
**When** the AI detects an automation opportunity
**Then** a suggestion card appears inline in the chat:
  - Card shows: process name suggestion, one-line description, which connected MCP tools it would use, "Build This Process" button
  - Suggestions are based on: connected MCP tools + topic being discussed + what the user's business needs
**And** clicking "Build This Process" navigates to the Process Designer with the description pre-filled
**And** every process is built NEW through the Process Builder wizard — there are no pre-built templates
**And** suggestions appear at natural conversation pauses (not mid-response)
**And** the same suggestion is not repeated if the user dismissed it previously
**And** if the user already has a similar process built (matching slug/description), the card shows "You already have [process name] — Run it?" instead

### Story 6.4: Next-Step Cards After Process Completion

As a business owner who just received process results,
I want the system to suggest what to do next with those results,
So that I maintain momentum and don't have to figure out the next action myself.

**Acceptance Criteria:**

**Given** a process run has completed and the user is viewing the results
**When** the results are displayed
**Then** a next-step card appears below the results suggesting logical follow-up actions:
  - "Send outreach emails to the top 5 leads" (if Gmail connected)
  - "Enrich these leads with LinkedIn data" (if LinkedIn connected)
  - "Save these to your CRM" (export/save action)
  - "Schedule this process to run weekly" (cron configuration)
**And** suggestions are contextual — they depend on what MCP tools are connected and what the results contain
**And** each card has a single action button (one clear next step per card)
**And** cards are generated by the recommendation agent reading: process results shape, connected tools, existing processes

---

## Epic 7: MCP Tool Integration and Evolution

External tools stay current automatically. Users connect tools easily, the platform verifies what works, and when APIs change, agents adapt and update the platform so nothing breaks.

### Story 7.1: MCP Tool Connection and Verification

As a business owner setting up my tools,
I want to connect external tools and verify they work before using them in processes,
So that I know which tools and operations are available and reliable.

**Acceptance Criteria:**

**Given** the user navigates to Settings and selects a tool to connect
**When** the user provides their API credentials
**Then** the system stores the credentials securely in TenantCredential
**And** the system runs a verification probe against EACH operation of the tool
**And** operations that respond successfully are stored in verifiedOperations[]
**And** operations that return 401/403/error are stored in failedOperations[] with the error reason
**And** the UI shows a clear status per operation: verified (green), failed (red with reason), not tested (grey)
**And** only verified operations appear as selectable in the Process Builder wizard
**And** the verification can be re-run at any time via a "Re-verify" button

### Story 7.2: Spec Drift Detection and Self-Healing

As the platform receiving agent execution results,
I want agents to detect MCP API changes, fix them autonomously, and report what changed,
So that API changes are applied platform-wide automatically.

**Acceptance Criteria:**

**Given** a per-process agent calls the MCP gateway during execution and encounters a field/endpoint change
**When** the agent detects the API has changed
**Then** the agent self-heals: it iterates field name variations, reads error messages for clues, tries alternative parameter formats until it finds what works — there is no option to fail
**And** once the agent succeeds with the corrected format, it appends a _specDrift object to its execution output containing: tool, operation, old field names/config, new field names/config, timestamp
**And** the backend callback handler extracts ALL _specDrift objects
**And** for each drift report, the backend:
  1. Updates the McpToolCatalog operation definitions with corrected field names/formats
  2. Logs the change in a mcp_spec_drift_log table (tool, operation, old config, new config, discoveredBy, timestamp)
  3. Triggers Story 7.3 (catalog refresh + process update)
**And** the _specDrift objects are stripped from the output before storing results (user never sees them)
**And** the agent's skill definition (SOUL.md) drives all MCP communication — the agent follows its rules for self-validation and self-healing

### Story 7.3: MCP Catalog Auto-Refresh and Existing Process Update

As the platform staying current with tool capabilities,
I want the MCP catalog to reflect the latest state and all existing processes to be updated automatically,
So that nothing breaks when an API changes.

**Acceptance Criteria:**

**Given** the McpToolCatalog has been updated (via spec drift, re-verification, or scheduled health check)
**When** the catalog update is processed
**Then** the affected tool's catalog entry is updated with current operation list, updated field names, and parameter formats
**And** the Process Builder wizard immediately reflects the updated catalog
**And** ALL existing published processes that use the affected tool/operation are automatically updated:
  1. Their design.json is patched with the corrected field names/parameters
  2. Their SOUL.md is regenerated with the updated MCP call patterns
  3. The updated SOUL.md is deployed to the OpenClaw relay (both default and tenant profile directories)
  4. Their n8n workflow is redeployed (deactivate, update, reactivate) with updated brain call instructions
**And** process owners are notified: "[Process Name] was automatically updated because [Tool Name] changed its API. No action needed."
**And** if the auto-update fails for any process, it is flagged for manual review (not silently broken)
**And** the catalog update is atomic — partial updates don't leave the catalog in an inconsistent state

---

## Epic 8: Brain Maintenance and Knowledge Evolution

The brain stays healthy and gets smarter over time. A dedicated agent checks for problems, merges duplicates, detects contradictions, discovers new concepts, and promotes validated knowledge — all autonomously.

### Story 8.1: Brain Lint — Agent-Driven Health Check

As the platform maintaining brain quality,
I want a dedicated agent that checks the brain for problems on a regular schedule,
So that knowledge stays clean and reliable without manual curation or backend batch jobs.

**Acceptance Criteria:**

**Given** a tenant has an Obsidian vault with enriched concepts
**When** the brain lint agent is triggered (daily for active tenants via scheduled task)
**Then** the agent reads the brain index and systematically checks for:
  - Orphan concepts: notes with zero relationships — agent creates appropriate relationship edges to nearest related concepts
  - Stale concepts: lastReinforced older than 90 days — agent re-researches and refreshes the content with current data
  - Low confidence: confidence below 0.3 — agent enriches with additional research, URLs, and data to raise confidence
  - Missing fields: concepts without required frontmatter — agent populates with correct values
  - Broken links: wikilinks pointing to non-existent concepts — agent either creates the missing concept or corrects the link
**And** the agent self-validates every fix before moving to the next issue (same validation gates as process execution)
**And** the agent completes the lint in < 5 minutes for vaults with < 1000 notes
**And** the agent updates the brain index after all fixes
**And** the agent appends a lint summary to log.md with timestamp, findings count, and actions taken
**And** remaining issues the agent could not auto-fix are surfaced as AI recommended task cards (Story 6.2) for the tenant owner
**And** the backend only triggers the agent — all lint logic, fixes, and validation happen within the agent autonomously

### Story 8.2: Concept Deduplication and Merging

As the platform preventing brain clutter,
I want duplicate concepts to be detected and merged automatically,
So that the brain doesn't accumulate redundant notes covering the same topic.

**Acceptance Criteria:**

**Given** the brain has grown through conversations, process results, and AI discovery
**When** the dedup check runs (as part of brain lint or triggered by new concept creation)
**Then** the system identifies potential duplicates using:
  - Semantic similarity via Qdrant vector search (cosine similarity > 0.92)
  - Title/name similarity (fuzzy match on concept names after normalization)
  - Category overlap (same category = higher likelihood of duplication)
**And** for each duplicate pair, the system:
  1. Determines the authoritative version (higher confidence, more recently reinforced, more relationships)
  2. Merges unique content from the secondary into the authoritative version
  3. Redirects all relationships from the secondary to the authoritative concept
  4. Updates all wikilinks across the vault that pointed to the secondary
  5. Archives the secondary (moves to _archived/ folder, not deleted)
**And** the merge preserves the highest confidence score and most recent lastReinforced date
**And** the brain index is updated after merges
**And** the operation is logged in log.md

### Story 8.3: New Concept Discovery and Relationship Building

As a business owner whose brain grows with every interaction,
I want new concepts discovered through conversations and processes to be automatically placed in the right location with proper relationships,
So that my brain organically expands without manual curation.

**Acceptance Criteria:**

**Given** a conversation or process run produces insights about a topic that doesn't match any existing concept
**When** the concept classifier identifies this as a genuinely new concept (not a duplicate of existing)
**Then** the system:
  1. Creates a new concept note in the appropriate category folder (determined by concept classifier)
  2. Generates initial content (minimum 5000 words following the established style and tone)
  3. Adds department tags based on the category and the context in which it was discovered
  4. Adds section-level tags for cross-departmental relevance
  5. Creates relationship edges to the nearest related existing concepts (determined by semantic similarity + category proximity)
  6. Agent determines relationship types: PREREQUISITE, RELATED, ADVANCED, DEPENDS_ON, CONTRADICTS
  7. Updates the brain index with the new concept entry
**And** the new concept appears in the graph view with its relationship edges
**And** the new concept is queued for AI recommended tasks (Story 6.2) so the user can explore it
**And** the operation is logged in log.md

### Story 8.4: Knowledge Consolidation and Tier Promotion

As the platform managing knowledge lifecycle,
I want frequently reinforced knowledge to be promoted to higher tiers while rarely accessed knowledge decays,
So that the brain prioritizes what matters most to this business.

**Acceptance Criteria:**

**Given** concepts have a tier field (working / episodic / semantic / procedural) and a confidence score
**When** the consolidation job runs (weekly, as part of brain maintenance)
**Then** the system evaluates each concept:
  - Promotion: Concepts reinforced 5+ times in 30 days with confidence > 0.8 are promoted (working to episodic to semantic to procedural)
  - Decay: Concepts not accessed or reinforced in 90+ days have their confidence reduced by 0.1 (minimum 0.1)
  - Staleness alert: Concepts that were previously high-confidence (> 0.8) but have decayed below 0.5 are flagged as "needs re-research"
**And** procedural tier concepts (proven workflows, validated strategies) are given priority in prompt enrichment (Story 2.1) — they appear first in agent context
**And** working tier concepts (recent observations, unvalidated) are clearly marked as preliminary when shown to users
**And** tier changes are logged in log.md with reason (promotion via reinforcement / decay via inactivity)
**And** the brain index is updated with current tier and confidence values

---

## Epic 9: Monitoring and Observability Dashboard

Every action the platform takes is tracked and visible. The owner can see exactly what's happening: processes running, agents executing, MCP calls, Qdrant queries, Obsidian updates, brain lint operations, AI calls, token usage — all in real-time dashboards per feature.

### Story 9.1: Agent Execution Monitor

As a platform owner,
I want to see every agent execution in real-time with status, duration, and outcome,
So that I can verify agents are working correctly and diagnose issues.

**Acceptance Criteria:**

**Given** any agent executes (per-process agent, brain lint agent, onboarding enrichment agent, recommendation agent)
**When** the execution starts, progresses, and completes
**Then** the monitoring dashboard shows: agent ID, tenant, start time, duration, status (running/completed/failed), step progress, token usage, retry count
**And** clicking an execution shows the detailed log: each step with input/output size, MCP calls made, validation gates passed/failed, self-corrections applied
**And** failed executions are highlighted with the error category and whether self-healing was attempted
**And** the dashboard updates in real-time via WebSocket

### Story 9.2: MCP Gateway Call Monitor

As a platform owner,
I want to see every MCP gateway call with request/response details,
So that I can verify tool integrations are working and catch API issues early.

**Acceptance Criteria:**

**Given** any MCP gateway call is made (by an agent via exec curl)
**When** the call passes through the MCP gateway service
**Then** the monitor logs: tool slug, operation ID, tenant, requesting agent, HTTP status, response time, request body size, response body size
**And** failed calls (4xx/5xx) are highlighted with the error response
**And** spec drift events are highlighted separately with old/new config
**And** the dashboard shows: calls per tool per day, average response time, error rate, most-used operations
**And** rate limit events (429s) are tracked per tool per tenant

### Story 9.3: Brain Activity Monitor

As a platform owner,
I want to see all Obsidian vault operations — concept enrichments, relationship changes, lint fixes, crystallizations,
So that I can verify the brain is evolving correctly.

**Acceptance Criteria:**

**Given** any brain operation occurs (concept enrichment, new concept creation, relationship added, lint fix, dedup merge, tier promotion, crystallization from conversation)
**When** the operation completes
**Then** the monitor shows: operation type, tenant, concept affected, timestamp, agent that performed it, before/after summary
**And** the dashboard shows: operations per day by type, concepts enriched this week, relationships added, lint findings resolved
**And** the vault's log.md entries are surfaced in the dashboard (parsed and rendered, not raw text)
**And** confidence score trends are visualized per concept category (are concepts getting more confident over time?)

### Story 9.4: Process Execution Monitor

As a platform owner,
I want to see every process run with step-by-step progress, results, and approval status,
So that I can verify processes are producing good results.

**Acceptance Criteria:**

**Given** any process runs (scheduled or manual)
**When** the process executes
**Then** the monitor shows: process name, tenant, trigger type (manual/scheduled/test), start time, duration, step progress, items produced, approval status
**And** each step shows: brain call duration, MCP calls made, items in/out, validation result
**And** test runs (from Process Builder) are distinguished from production runs
**And** the dashboard shows: runs per process per day, success rate, average items produced, average duration

### Story 9.5: System-Wide Health Dashboard

As a platform owner,
I want a single dashboard showing the health of all system components,
So that I can see at a glance if everything is working.

**Acceptance Criteria:**

**Given** the platform is running
**When** the owner opens the monitoring dashboard
**Then** the dashboard shows health indicators for:
  - AI Agents: total executions today, success rate, average duration, token usage
  - MCP Tools: per-tool status (healthy/degraded/down), call count, error rate
  - Brain: concepts enriched, relationships added, lint issues found/fixed, avg confidence
  - Processes: runs today, success rate, items produced, pending approvals
  - Qdrant: query count, average latency, collection sizes per tenant
  - Conversations: messages today, prompt enrichment hit rate, crystallizations filed
  - Recommendations: cards shown, cards acted on, cards dismissed
**And** each section is clickable to drill into the detailed monitor for that feature
**And** alerts are shown for: agent failure rate > 10%, MCP error rate > 5%, brain lint finding orphan concepts, Qdrant latency > 200ms
**And** the dashboard auto-refreshes every 30 seconds
