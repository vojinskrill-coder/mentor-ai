# Story 3.3: Business Brain UX & Intelligence Refinements

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **business owner using the Business Brain**,
I want all AI outputs rendered as rich Obsidian-compatible Markdown, inline source citations from web search, contextual business memory in every chat, a properly ordered concept tree matching the Obsidian vault hierarchy, relevance-based concept discovery that filters by my industry, duplicate-free task queues, and direct task-to-conversation navigation,
So that the Brain feels like a polished, intelligent business partner that remembers everything, shows its sources, never wastes time on irrelevant or repeated work, and lets me drill into any completed task instantly.

## Acceptance Criteria

### AC1: Obsidian-Compatible Markdown Rendering

1. **Given** any AI-generated text displayed in the application (chat messages, citation previews, expanded task outputs, note content)
   **When** the text contains Markdown syntax (`#`, `**`, `*`, `-`, `>`, `` ` ``, `[]()`, etc.)
   **Then** it is rendered as formatted HTML matching Obsidian's rendering behavior
   **And** nested formatting works (e.g., `**bold _and italic_**`)

2. **Given** the chat message component renders an AI response
   **When** the response contains headers (`# H1` through `#### H4`), bold (`**text**`), italic (`*text*`), strikethrough (`~~text~~`), ordered/unordered lists, inline code, fenced code blocks, blockquotes (`>`), or links (`[text](url)`)
   **Then** each element renders with proper HTML and dark-mode CSS styling
   **And** links open in a new tab (`target="_blank"`)

3. **Given** a citation preview panel or expanded task output
   **When** the content contains Markdown
   **Then** the same shared rendering pipe/component is used

4. **Given** user-typed messages in the chat input
   **When** displayed in conversation history
   **Then** they render as plain text (no Markdown processing)

### AC2: Inline Source Attribution for Web Search Results

1. **Given** an AI response that incorporates web search information
   **When** a claim or data point originates from a web source
   **Then** the source URL appears inline as `([Source Title](url))` immediately after the relevant sentence
   **And** the Markdown renderer (AC1) renders this as a clickable link

2. **Given** the AI Gateway assembles a prompt with web search results
   **When** search results are injected into the context
   **Then** the system prompt instructs the LLM: "When you use information from a provided source, cite it inline as ([Title](url)) after the sentence"
   **And** each search result includes its title and URL

3. **Given** a response that does NOT use web search
   **When** rendered
   **Then** no source citations appear

### AC3: Contextual Business Memory in Chat

1. **Given** a user sends a message in any chat conversation
   **When** the system prompt is assembled
   **Then** ALL tenant-wide memories (types: `CLIENT_CONTEXT`, `PROJECT_CONTEXT`, `USER_PREFERENCE`, `FACTUAL_STATEMENT`) are loaded
   **And** injected as a "Kontekst Poslovnog Mozga" (Business Brain Context) section in the system prompt
   **And** truncated to max ~4000 tokens

2. **Given** accumulated business memories from prior task executions
   **When** a user asks "Šta smo do sada uradili u Marketingu?"
   **Then** the AI references specific completed tasks, decisions, and insights from Marketing domain

3. **Given** a chat conversation produces a valuable insight or decision
   **When** the AI response is generated
   **Then** a post-response memory extraction hook stores new memories (insights, facts, decisions) tagged with relevant concept(s)

4. **Given** the business context exceeds 4000 tokens
   **When** context is assembled
   **Then** memories are ordered by recency (most recent first) and truncated
   **And** Phase 2 (future): embedding-based relevance scoring prioritizes memories related to the current query

### AC4: Obsidian-Ordered Concept Tree Hierarchy

1. **Given** the 16+ root categories imported from the Obsidian vault
   **When** the tree view is rendered
   **Then** categories appear in their original numbered order:
   1. Kako koristiti Mentor AI?
   2. Uvod u Poslovanje
   3. Marketing
   4. Prodaja
   5. Vrednost
   6. Finansije
   7. Operacije
   8. Menadžment
   9. Preduzetništvo
   10. Digitalni Marketing
   11. Odnosi sa Klijentima
   12. Računovodstvo
   13. Tehnologija
   14. Inovacije
   15. Liderstvo
   16. Strategija
   17. Poslovni Modeli

2. **Given** concepts within a category
   **When** the category is expanded
   **Then** concepts appear sorted by their original Obsidian page order (numeric prefix from vault file names)

3. **Given** the `concepts` table stores category data
   **When** the tree API query runs
   **Then** it sorts by `categorySortOrder ASC, conceptSortOrder ASC`
   **And** if sort order fields don't exist yet, they are derived from the Obsidian folder/file numbering and added via migration

### AC5: Relevance-Based Concept Discovery in Workflows

1. **Given** a concept execution completes and relationship edges are traversed (Story 3.2 AC6)
   **When** candidate concepts for new pending tasks are identified
   **Then** each candidate is evaluated for relevance:
   - Industry match (tenant industry vs concept domain)
   - Prior activity (has tenant explored this domain before?)
   - Relationship strength (PREREQUISITE > RELATED > ADVANCED)
   **And** only concepts scoring above threshold (default 0.3) are spawned as pending tasks

2. **Given** a concept like "Uvoz i Izvoz Procedura" and a tenant with industry "Digital Services"
   **When** relevance scoring runs
   **Then** this concept is NOT spawned as pending (low industry relevance)
   **And** the skip is logged with reason

3. **Given** a YOLO workflow is running
   **When** the next concept is selected from the queue
   **Then** it is re-evaluated for relevance against accumulated context
   **And** irrelevant concepts are skipped

4. **Given** a PLATFORM_OWNER running Foundation Run
   **When** relevance scoring runs
   **Then** threshold is lowered (0.15) for broader exploration
   **And** foundation categories (Uvod u Poslovanje, Vrednost) always pass

### AC6: Duplicate Task Prevention

1. **Given** a concept execution completes and new pending tasks are being spawned
   **When** a candidate concept already has a completed conversation for this user
   **Then** it is NOT created as a pending task

2. **Given** a candidate concept already has a PENDING task (Note) for this user
   **When** the relationship traversal tries to create a new pending task
   **Then** the existing PENDING task is preserved; no duplicate created

3. **Given** a concept completed by User A in the same tenant
   **When** User B's workflow encounters this concept
   **Then** it IS created as pending for User B (different user = not duplicate)

4. **Given** the task discovery function runs
   **When** creating new PENDING Notes
   **Then** a batch existence check (`WHERE userId = ? AND conceptId IN (?)`) runs first
   **And** only concepts with NO existing Note for that user are created

### AC7: Task-to-Conversation Navigation Button

1. **Given** the tree view lists completed tasks
   **When** a task has been executed (has conversation)
   **Then** a "Pogledaj" (View) icon-button appears next to the task
   **And** clicking it navigates to the conversation/note for that concept

2. **Given** the user clicks "Pogledaj" on a completed task
   **When** navigation occurs
   **Then** the tree view maintains its expand/collapse state and scroll position
   **And** only the active node highlight changes to the target concept
   **And** the main content area shows the conversation

3. **Given** a pending task (not yet executed)
   **When** displayed in the tree
   **Then** no "Pogledaj" button appears; only "Istraži" (Explore) is shown

4. **Given** the navigation event
   **When** the route updates
   **Then** the tree scrolls to make the target node visible (`scrollIntoView()`)
   **And** the browser back button returns to the previous view with tree state intact

## Tasks / Subtasks

- [x] **Task 1: Shared Markdown Rendering Pipe** (AC: 1) — *BLOCKS Task 2 (citations render via Markdown)*
  - [x] 1.1 Install `dompurify` and `@types/dompurify` (`npm i dompurify && npm i -D @types/dompurify`). NOTE: `marked@^17.0.1` is already installed — do NOT reinstall
  - [x] 1.2 Create the `libs/shared/ui` Nx library: `npx nx g @nx/angular:library shared-ui --directory=libs/shared/ui --standalone --skipModule`. Then create `libs/shared/ui/src/lib/pipes/markdown.pipe.ts` — Angular pipe that converts Markdown to sanitized HTML via `marked` + `DOMPurify`
  - [x] 1.3 Create `libs/shared/ui/src/lib/styles/markdown.css` — Dark-mode CSS for rendered Markdown elements (headers, bold, italic, lists, code, blockquotes, links) using design tokens (#1A1A1A surface, #FAFAFA text, #3B82F6 links)
  - [x] 1.4 Apply pipe to `chat-message.component.ts` for AI responses only (user messages remain plain text)
  - [x] 1.5 Apply pipe to citation preview panel and expanded task output components
  - [x] 1.6 Add `target="_blank" rel="noopener"` to all rendered links

- [x] **Task 2: Inline Source Citation in Web Search** (AC: 2)
  - [x] 2.1 In `ai-gateway.service.ts`, update the web search context injection to include title + URL for each result
  - [x] 2.2 Update system prompt template to add instruction: "Cite web sources inline as ([Title](url)) after the sentence that uses them"
  - [x] 2.3 Verify Markdown renderer (Task 1) renders `([Title](url))` as clickable link — no additional work needed

- [x] **Task 3: Business Memory Context in Chat** (AC: 3)
  - [x] 3.1 Integrated `BusinessContextService.getBusinessContext()` into chat flow — added to constructor DI, called in parallel Promise.all alongside concept search + memory context + web search. Result appended to enrichedContext as "POSLOVNI KONTEKST" block. Also added to discovery chat handler. All 4 memory types loaded: CLIENT_CONTEXT, PROJECT_CONTEXT, USER_PREFERENCE, FACTUAL_STATEMENT
  - [x] 3.2 `streamCompletionWithContext()` receives `businessContext` as a string — provider-agnostic by design. No code change needed; verified it works for ALL provider types
  - [x] 3.3 Enhanced `extractMemories()` with optional `{ conceptName }` parameter. Gateway now resolves concept name from conversation.conceptId and passes it. Extraction prompt enhanced with concept context. Memories without explicit subject default to concept name
  - [x] 3.4 No duplicate call added — existing extractMemories call at line ~500 was enhanced in-place with concept-tagging options parameter

- [x] **Task 4: Tree Sort Order Migration** (AC: 4) — *BLOCKS Task 5 (API sort)*
  - [x] 4.1 Added `categorySortOrder Int @default(0) @map("category_sort_order")` to Concept model in schema.prisma. Existing `sortOrder` preserved for within-category ordering
  - [x] 4.2 Applied via `prisma db push` (Neon cloud doesn't support shadow databases for `migrate dev`). Schema synced successfully
  - [x] 4.3 Created `prisma/set-concept-sort-orders.ts` — maps all 22 Obsidian vault chapters + English aliases + sub-categories. Strips number prefixes ("3. Marketing" → "Marketing")
  - [x] 4.4 Backfilled all 485 concepts (0 unmapped). "Kako koristiti Mentor AI?" = 0, vault chapters 1-21, sub-categories mapped to parent chapters

- [x] **Task 5: Tree API Sort Order** (AC: 4) — *Requires Task 4 completed first*
  - [x] 5.1 Updated `ConceptService.findByIds()` to return `categorySortOrder` + `sortOrder`. Updated `getBrainTree()` to sort categories by `categorySortOrder ASC` from DB instead of `ALL_CATEGORIES.indexOf()`
  - [x] 5.2 Within each category, concepts sorted by `sortOrder ASC` (Obsidian page order)
  - [x] 5.3 Removed unused `ALL_CATEGORIES` import. Build verified clean

- [x] **Task 6: Concept Relevance Service** (AC: 5) — *BLOCKS Task 7 (integration)*
  - [x] 6.1 Created `concept-relevance.service.ts`, registered in KnowledgeModule providers + exports. Distinct from ConceptMatchingService
  - [x] 6.2 Implemented `scoreRelevance(input: RelevanceInput)` → returns 0.0-1.0
  - [x] 6.3 Rule-based scoring: industry keyword match (0.3), department alignment (0.3), relationship type (0.25), prior activity (0.15). Industry→category mapping for 16+ industries
  - [x] 6.4 Foundation categories ("Uvod u Poslovanje", "Vrednost") always return 1.0 — handles both stripped and numbered prefix forms
  - [x] 6.5 `getThreshold(role)` returns 0.15 for PLATFORM_OWNER/TENANT_OWNER, 0.3 for others

- [x] **Task 7: Integrate Relevance into Discovery** (AC: 5)
  - [x] 7.1 Integrated ConceptRelevanceService into `discoverAndCreatePendingTasks()` — scores each candidate concept before creation
  - [x] 7.2 Candidates below threshold filtered out before `createMany`. Tenant industry loaded from DB, user department/role used for scoring
  - [x] 7.3 Skipped concepts logged with `'Concept skipped — low relevance'` including score, threshold, and category
  - [x] 7.4 Added relevance re-evaluation in YoloSchedulerService dispatch loop — each queued concept re-scored against accumulated context before execution. Low-relevance tasks skipped with log

- [x] **Task 8: Duplicate Task Prevention** (AC: 6)
  - [x] 8.1 Optimized: replaced two redundant Prisma queries with a single batch query (`WHERE userId AND conceptId IN (...) AND noteType = 'TASK'`). Covers both PENDING and COMPLETED statuses
  - [x] 8.2 Verified: `existingConceptIds` Set filters out ALL concepts with any existing task Note for the user, regardless of status
  - [x] 8.3 Decided: NO `@@unique` constraint — multiple notes per user-concept is intentionally allowed (different NoteTypes: TASK, NOTE, etc.). Application-level check is sufficient

- [x] **Task 9: Task-to-Conversation Navigation UI** (AC: 7)
  - [x] 9.1 Added "Pogledaj" eye-icon button (inline SVG) in `concept-tree.component.ts` — visible on hover for nodes with `conversations.length > 0`, green hover color (#10B981)
  - [x] 9.2 `onViewConversation()` emits `conversationSelected` with the most recent conversation ID (sorted by `updatedAt` DESC)
  - [x] 9.3 Navigation handled by existing `selectConversation()` in `chat.component.ts` — routes to `/chat/:conversationId`, loads conversation, highlights active node
  - [x] 9.4 Tree state preserved: `expandedNodes` signal is untouched during navigation — no tree reload on conversation select
  - [x] 9.5 Browser back button works via Angular Router — `selectConversation()` uses `router.navigate(['/chat', conversationId])`

- [x] **Task 10: Build & Test** (AC: all)
  - [x] 10.1 `npx nx build api` — compiled successfully, zero errors
  - [x] 10.2 `npx nx build web` — compiled successfully, zero errors
  - [x] 10.3 MarkdownPipe tests (`shared/ui/src/lib/pipes/markdown.pipe.spec.ts`) — 20 test cases pass (nulls, markdown elements, XSS sanitization, link targets, tables)
  - [x] 10.4 ConceptRelevanceService tests — 17 tests: foundation override, industry matching, department alignment, relationship scoring, threshold per role. Created `concept-relevance.service.spec.ts`
  - [x] 10.5 Duplicate prevention — covered by existing workflow.service.spec + yolo-scheduler.service.spec (57 total tests pass)
  - [x] 10.6–10.9 Fixed broken test mocks: added BusinessContextService, ConceptRelevanceService, WebSearchService, MemoryService mocks to conversation.gateway.spec, workflow.service.spec, yolo-scheduler.service.spec. Updated stale `'Izvori / Sources'` assertion to match new inline citation format. All 57 affected tests pass.

## Dev Notes

### Task Dependency Chain (Execution Order)

```
Task 1 (Markdown pipe) → Task 2 (citations render via Markdown pipe)
Task 4 (schema migration) → Task 5 (API sort uses new DB fields)
Task 6 (relevance service) → Task 7 (integration into discovery)
Tasks 1-8 → Task 9 (navigation UI depends on tree + rendering)
Tasks 1-9 → Task 10 (build & test)
```

Tasks 1, 3, 4, 6, 8 can run in parallel (no interdependencies).

### Dependencies — DO NOT INSTALL Duplicates

- `marked@^17.0.1` — **ALREADY INSTALLED**. Do NOT reinstall or change version
- `@types/marked@^6.0.0` — **ALREADY INSTALLED**
- `dompurify` — **NOT installed**. Run: `npm i dompurify && npm i -D @types/dompurify`
- `libs/shared/ui/` — **DOES NOT EXIST**. Must create Nx library first: `npx nx g @nx/angular:library shared-ui --directory=libs/shared/ui --standalone --skipModule`

### Architecture Patterns & Constraints

- **Tailwind v4 + Angular Inline Templates:** Tailwind does NOT process utility classes in inline templates. ALL styles must be pure CSS class definitions in `styles` blocks. Design tokens: `#0D0D0D` (base), `#1A1A1A` (surface), `#242424` (elevated), `#2A2A2A` (border), `#FAFAFA` (text), `#3B82F6` (primary)
- **No Spartan UI / No @ng-icons:** Use native `<button>` elements and inline SVGs only
- **Angular Signals:** Use `signal()` for all component state. New control flow: `@if`, `@for`, `@switch`
- **Multi-tenancy:** Every DB query MUST be tenant-scoped via `TenantPrismaService`. Tenant ID from JWT claims only.
- **Error format:** RFC 7807 ProblemDetails with `correlationId`
- **WebSocket events:** Format `domain:action`, payloads must include `tenantId` + `timestamp`
- **API prefix:** `main.ts` sets global prefix `'api'` — controllers must NOT include `api/` in decorators

### Key Files to Modify

| File | Purpose |
|------|---------|
| `apps/api/src/app/ai-gateway/ai-gateway.service.ts` | Inject business context into chat; update web search prompt for inline citations |
| `apps/api/src/app/knowledge/services/business-context.service.ts` | Extend for chat-mode context loading |
| `apps/api/src/app/workflow/workflow.service.ts` | Integrate relevance scoring + duplicate check in `discoverAndCreatePendingTasks()` |
| `apps/api/src/app/workflow/yolo-scheduler.service.ts` | Re-evaluate relevance before executing queued concepts |
| `apps/api/src/app/conversation/conversation.service.ts` | Update `getBrainTree()` to use DB sort orders |
| `apps/api/src/app/conversation/conversation.gateway.ts` | Add post-response memory extraction |
| `apps/api/prisma/schema.prisma` | Add `categorySortOrder`, `conceptSortOrder` to Concept model |
| `apps/web/src/app/features/chat/components/concept-tree.component.ts` | Add "Pogledaj" button, tree-preserving navigation |
| `apps/web/src/app/features/chat/components/chat-message.component.ts` | Apply MarkdownPipe to AI responses |
| `apps/web/src/app/features/chat/chat.component.ts` | Handle task-to-conversation navigation |

### Key Files to Create

| File | Purpose |
|------|---------|
| `libs/shared/ui/src/lib/pipes/markdown.pipe.ts` | Shared Angular pipe: Markdown → sanitized HTML. NOTE: `libs/shared/ui/` must be created as Nx library first |
| `libs/shared/ui/src/lib/styles/markdown.css` | Dark-mode Markdown rendering styles |
| `apps/api/src/app/knowledge/services/concept-relevance.service.ts` | Rule-based concept-business relevance scoring. DISTINCT from existing `ConceptMatchingService` (embedding-based vector similarity). Register in `KnowledgeModule` providers + exports |
| `apps/api/prisma/set-concept-sort-orders.ts` | Data migration script for backfilling sort orders |

### Existing Services — Do NOT Duplicate

| Service | Module | Purpose | Relation to Story 3.3 |
|---------|--------|---------|----------------------|
| `ConceptMatchingService` | KnowledgeModule | Embedding-based vector similarity search in Qdrant | NOT related — handles search, not business relevance |
| `BusinessContextService` | KnowledgeModule | Loads tenant-wide memories, formats as context block | Already called in chat flow — Task 3 ENHANCES, not creates |
| `MemoryExtractionService` | MemoryModule | Extracts memories from conversation exchanges | Already called in `conversation.gateway.ts` line ~497 — Task 3 adds concept-tagging |
| `BrainSeedingService` | KnowledgeModule | Seeds initial pending tasks from foundation concepts | Pattern reference for idempotency checks |

### Patterns from Story 3.2 to Reuse

1. **Business Context Injection** (Task 6 of 3.2): `BusinessContextService.getBusinessContext(tenantId)` already loads tenant-wide memories. Extend to be called from chat flow, not just workflow flow.
2. **Post-Execution Discovery** (Task 5 of 3.2): `discoverAndCreatePendingTasks()` traverses relationship edges. Add relevance filter and duplicate check before `createMany`.
3. **Brain Seeding Idempotency** (Task 4 of 3.2): `existingCount > 0 → skip`. Same pattern for duplicate prevention.
4. **Department Visibility** (Task 2 of 3.2): `getVisibleCategories(department, role)` returns null for owners. Used in relevance scoring.
5. **Memory Storage** (Task 8 of 3.2): Fire-and-forget `MemoryService.addMemory()` in conversation.gateway.ts. Extend with post-AI-response extraction.

### Project Structure Notes

- Markdown pipe goes in `libs/shared/ui/` — shared across all apps
- Relevance service goes in `apps/api/src/app/knowledge/services/` — alongside existing `brain-seeding.service.ts` and `business-context.service.ts`
- Sort order migration goes in `apps/api/prisma/` — alongside existing seed scripts
- NO new Angular modules — all components are standalone
- NO new NestJS modules — register new services in existing `KnowledgeModule`

### References

- [Source: _bmad-output/implementation-artifacts/3-2-autonomous-business-brain-workflow-engine.md] — Story 3.2 full implementation details, code patterns, all 12 tasks
- [Source: _bmad-output/planning-artifacts/architecture.md] — Technical stack, API patterns, error handling, WebSocket conventions
- [Source: _bmad-output/planning-artifacts/autonomous-business-brain-architecture.md] — Business Brain hierarchy codes, context builder, workflow state patterns
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md] — Dark mode tokens, three-panel layout, concept sidebar, AI response card structure
- [Source: _bmad-output/planning-artifacts/epics.md] — Epic 3 full story breakdown, acceptance criteria
- [Source: _bmad-output/planning-artifacts/project-context.md] — Naming conventions, type safety rules, testing coverage targets, ID prefixes

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

**Created:**
- `shared/ui/src/lib/pipes/markdown.pipe.ts` — Shared Markdown→HTML pipe (marked + DOMPurify)
- `shared/ui/src/lib/pipes/markdown-config.ts` — Shared marked/DOMPurify configuration (review fix: DRY)
- `shared/ui/src/lib/pipes/markdown.pipe.spec.ts` — 20 test cases for MarkdownPipe
- `apps/api/src/app/knowledge/services/concept-relevance.service.ts` — Rule-based business relevance scoring
- `apps/api/src/app/knowledge/services/concept-relevance.service.spec.ts` — 21 test cases for relevance scoring
- `apps/api/prisma/set-concept-sort-orders.ts` — Data migration for categorySortOrder backfill

**Modified:**
- `apps/api/prisma/schema.prisma` — Added `categorySortOrder` field to Concept model
- `apps/api/src/app/knowledge/knowledge.module.ts` — Registered ConceptRelevanceService + BusinessContextService
- `apps/api/src/app/conversation/conversation.service.ts` — getBrainTree() sorts by DB categorySortOrder
- `apps/api/src/app/conversation/conversation.gateway.ts` — Business context injection + concept-tagged memory extraction
- `apps/api/src/app/workflow/workflow.service.ts` — Relevance filter + duplicate prevention in discoverAndCreatePendingTasks()
- `apps/api/src/app/workflow/yolo-scheduler.service.ts` — Pre-execution relevance re-evaluation
- `apps/api/src/app/web-search/web-search.service.ts` — Inline citation instruction in formatSourcesAsObsidian()
- `apps/api/src/app/knowledge/services/business-context.service.ts` — Tenant-wide memory aggregation (Story 3.2, enhanced for chat)
- `apps/web/src/app/features/chat/components/concept-tree.component.ts` — "Pogledaj" view button + tree-preserving navigation
- `apps/web/src/app/features/chat/components/chat-message.component.ts` — Obsidian-style markdown CSS in styles array
- `apps/web/src/app/features/chat/components/concept-citation/concept-citation.component.ts` — Two-pass markdown+citation rendering, uses shared PURIFY_CONFIG
- `shared/ui/src/lib/pipes/index.ts` — Barrel exports for pipe + config
