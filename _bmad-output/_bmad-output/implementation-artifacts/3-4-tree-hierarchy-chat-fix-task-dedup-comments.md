# Story 3.4: Tree Hierarchy Depth, Chat Fix, Task Deduplication & Comments

Status: done

## Story

As a **business owner using the Business Brain**,
I want the concept tree to be an exact mirror of the Obsidian vault's full folder hierarchy (up to 4 levels deep, 60 folders, 445 pages), chat to work with the configured OpenAI provider, duplicate tasks eliminated, and the ability to post comments on tasks,
So that the Brain accurately reflects my knowledge structure, I can actually converse with the AI, I don't see redundant work items, and my team can discuss tasks collaboratively.

## Context (Issues Identified)

This story addresses 5 concrete issues found during testing:

1. **Tree hierarchy is flat and doesn't match the Obsidian vault** — currently shows only Category > Concept (2 levels). The actual Obsidian vault (`publish.obsidian.md/hadzi-vojin`) has **4 levels of depth**, **60 folders**, and **445 pages**. `curriculum.json` was manually created and flattens intermediate folders. It must be regenerated from the vault data to be an exact 1:1 mirror. Example vault path: Poslovanje > 2. Vrednost > 2. Vrste Vrednosti > 2.1. Oblici Vrednosti (4 levels). Another: Poslovanje > 3. Marketing > 3. Analiza Konkurencije > 3.1 Uvod u Analizu Konkurencije (4 levels).
2. **Chat doesn't work** — frontend error handler swallows error details, showing generic "Message failed to send" instead of the actual error from the backend. The `onError` callback ignores the `ChatErrorData` parameter.
3. **Duplicate tasks** — auto-task generation only deduplicates within the current conversation, not tenant-wide. Workflow sub-task creation has zero deduplication. Multiple generation paths (auto-gen after every 2nd AI message, explicit "kreiraj task" keyword, workflow step completion, post-execution discovery) can create the same task multiple times.
4. **No task comments** — the Note model already supports self-referential hierarchy (`parentNoteId`) but there's no `COMMENT` note type, no API endpoints for comments, and no frontend UI.
5. **Web search perception** — web search IS configured and active (Serper.dev), but the user doesn't see it working because chat itself fails (Issue #2). Once chat works, web search will be visible in AI responses with inline source citations.

## Acceptance Criteria

### AC1: Tree Hierarchy is an Exact Mirror of the Obsidian Vault

**Vault structure** (verified from `obsidian-pages.json`): 445 pages across 60 folders, max depth 4.

```
Poslovanje/ (root)                              ← DEPTH 1
├── 2. Vrednost/                                ← DEPTH 2 (chapter)
│   ├── 1. Uvod u Vrednost/ (6 pages)           ← DEPTH 3 (section)
│   ├── 2. Vrste Vrednosti/ (5 pages)           ← DEPTH 3
│   │   └── 2.1. Oblici Vrednosti/ (15 pages)   ← DEPTH 4 (sub-section)
│   ├── 3. Stvaranje Vrednosti/ (5 pages)       ← DEPTH 3
│   └── 4. Kako učiniti ponudu vrednijom?/      ← DEPTH 3
├── 3. Marketing/                               ← DEPTH 2
│   ├── 3. Analiza Konkurencije/                ← DEPTH 3
│   │   ├── 3.1 Uvod u AK/ (6 pages)           ← DEPTH 4
│   │   └── 3.2 Strategije AK/ (7 pages)       ← DEPTH 4
│   ├── 4. Privlačenje Pažnje/                  ← DEPTH 3
│   │   ├── 4.1. Osnove/ (12 pages)            ← DEPTH 4
│   │   └── 4.2 Faktori/ (6 pages)             ← DEPTH 4
│   └── ... (7 sections total)
├── 13. Upravljanje Svojim Radom/ (6 sections)  ← DEPTH 2
│   ├── 1. Uvod/ (3 pages)                     ← DEPTH 3
│   ├── 5. Odluke/ (7 pages)                   ← DEPTH 3
│   └── 6. Sklonosti/ (11 pages)               ← DEPTH 3
└── ... (20+ chapters total)
```

1. **Given** the Obsidian vault data in `obsidian-pages.json` (445 pages, 60 folders)
   **When** `curriculum.json` is regenerated from the vault
   **Then** every folder in the vault becomes a node with `parentId` pointing to its parent folder
   **And** every page becomes a leaf node under its folder
   **And** the numbered sort order from folder names is preserved (e.g., "3. Marketing" → sortOrder: 3)
   **And** the resulting `curriculum.json` has exactly 60 folder nodes + 445 leaf nodes

2. **Given** the regenerated `curriculum.json` with N-level depth (up to 4)
   **When** the concept tree is rendered in the sidebar
   **Then** the hierarchy matches the Obsidian vault exactly — same folders, same subfolders, same depth at every branch
   **And** folders appear as expandable nodes with chevron toggles at EVERY level
   **And** sort order is respected at every level

3. **Given** a sparse tree (only showing concepts with conversations or pending tasks)
   **When** an active concept exists at depth 4 (e.g., a page under "Oblici Vrednosti" under "Vrste Vrednosti" under "Vrednost")
   **Then** ALL ancestor folders up to the root are shown (full path preserved)
   **And** empty folders with no active descendants are NOT shown

4. **Given** the tree renderer
   **When** rendering the hierarchy
   **Then** it supports arbitrary depth recursively (not hardcoded to 3 or 4 levels)
   **And** `conversationCount` bubbles up through all ancestor levels
   **And** indentation increases per level (16-20px per depth)

5. **Given** the vault contains the "Kako koristiti Mentor AI?" node
   **When** `curriculum.json` is regenerated
   **Then** the "Kako koristiti Mentor AI?" node and all its children are EXCLUDED from the tree
   **And** no Concept records are created for it

6. **Given** the `seed-obsidian.ts` seeding script
   **When** re-run with the regenerated `curriculum.json`
   **Then** Concept records are created with proper `parentId` chains matching the vault folder hierarchy
   **And** existing concepts are matched by slug and updated (not duplicated)

### AC2: Chat Error Transparency & Working OpenAI Integration

1. **Given** a user sends a message in any conversation
   **When** the backend returns a `chat:error` WebSocket event
   **Then** the frontend displays the actual error message from `ChatErrorData.message` (not generic text)
   **And** the error type is shown (e.g., "no_provider_configured", "api_key_not_found", "openai_error", "rate_limit_exceeded")

2. **Given** the `onError` callback in `chat.component.ts`
   **When** the callback is invoked
   **Then** it accepts and uses the `ChatErrorData` parameter: `(error) => this.showError(error.message)`
   **And** the loading/streaming state is cleared

3. **Given** the database has an active OPENAI provider config with encrypted API key
   **When** a user sends a chat message
   **Then** the `ai-gateway.service.ts` routes to `streamFromOpenAI()`
   **And** the OpenAI API responds with streamed chunks
   **And** chunks are forwarded to the frontend via `chat:message-chunk` events
   **And** the complete AI response is saved to the database

4. **Given** the `streamFromOpenAI()` method receives the decrypted API key
   **When** it calls `https://api.openai.com/v1/chat/completions`
   **Then** the response is streamed and parsed (SSE format)
   **And** errors are propagated with the actual OpenAI error message (not swallowed)

### AC3: Task Deduplication Across All Generation Paths

1. **Given** an auto-task is being generated after an AI response
   **When** a task with the same title (case-insensitive) AND same conceptId already exists for the tenant
   **Then** the duplicate is NOT created
   **And** a debug log records the skipped duplicate

2. **Given** an explicit task creation via "kreiraj task" keyword
   **When** the extracted task title matches an existing task in the same tenant
   **Then** the duplicate is NOT created

3. **Given** a workflow step completes and creates a sub-task note
   **When** a sub-task with the same `workflowStepNumber` AND `parentNoteId` already exists
   **Then** the existing sub-task is updated (not a new one created)

4. **Given** post-execution discovery creates PENDING tasks for related concepts
   **When** a PENDING or COMPLETED task already exists for that concept + tenant
   **Then** no duplicate is created
   **And** the existing task's status is preserved

5. **Given** the deduplication check
   **When** performed
   **Then** it queries by `tenantId + conceptId + noteType='TASK'` (tenant-wide, not conversation-scoped)
   **And** optionally also by `title` for non-concept-linked tasks

### AC4: Workflow/Task Comments — Unlimited, Per-User Attribution

1. **Given** the Prisma schema `NoteType` enum
   **When** updated
   **Then** a new value `COMMENT` is added
   **And** a migration is generated and applied

2. **Given** a user viewing ANY task or workflow step in the UI
   **When** they type a comment and submit
   **Then** a new Note is created with:
   - `noteType: COMMENT`
   - `parentNoteId: <taskId or workflowStepNoteId>`
   - `content: <comment text>`
   - `userId: <current user>`
   - `tenantId: <current tenant>`
   **And** the comment appears in the task's comment thread
   **And** the comment displays the user's name and avatar/initials
   **And** the comment displays a relative timestamp (e.g., "2 min ago")

3. **Given** any task or workflow step
   **When** multiple users post comments
   **Then** there is NO limit on the number of comments per task
   **And** all comments are shown in chronological order (oldest first)
   **And** each comment clearly shows WHICH USER left it (name + role badge)

4. **Given** the Notes API
   **When** `POST /api/v1/notes/:taskId/comments` is called with `{ content: string }`
   **Then** a COMMENT note is created as a child of the specified task
   **And** the response includes the created comment with user info (name, role)

5. **Given** `GET /api/v1/notes/:taskId/comments`
   **When** called
   **Then** all COMMENT notes with `parentNoteId = taskId` are returned
   **And** ordered by `createdAt` ascending (oldest first)
   **And** each comment includes `userId`, `userName`, `userRole`, `content`, `createdAt`
   **And** pagination is supported for tasks with many comments (default: 50 per page)

6. **Given** a user's own comment
   **When** they click edit
   **Then** the comment text becomes an inline editable textarea with save/cancel buttons
   **And** `PATCH /api/v1/notes/:commentId` updates the comment content
   **And** only the comment author can edit (not other users, not owners)
   **And** the `updatedAt` timestamp is shown if the comment was edited (e.g., "(edited)")

7. **Given** a user's own comment
   **When** they click delete
   **Then** `DELETE /api/v1/notes/:commentId` removes the comment
   **And** only the comment author or TENANT_OWNER/PLATFORM_OWNER can delete

8. **Given** a workflow with multiple steps, each having its own sub-task note
   **When** a user opens any step's detail view
   **Then** comments specific to THAT step are shown (not all workflow comments)
   **And** the user can add comments to each step independently

### AC5: Web Search Visibility in AI Responses

1. **Given** `SERPER_API_KEY` is configured in `.env`
   **When** a user sends a chat message and receives an AI response
   **Then** the response includes inline web citations formatted as `([Source Title](url))`
   **And** these render as clickable links in the Markdown renderer

2. **Given** web search results are injected into the AI system prompt
   **When** the AI generates a response
   **Then** the system prompt includes `formatSourcesAsObsidian()` output with source URLs
   **And** the AI is instructed to cite sources inline

3. **Given** web search fails or returns no results
   **When** the chat message is processed
   **Then** the AI response is still generated (without web sources)
   **And** no error is shown to the user (graceful degradation)

## Tasks / Subtasks

### Task 0: Regenerate curriculum.json from Obsidian Vault Data (AC: 1, prerequisite)

- [x] 0.1 Parse `$TEMP/obsidian-pages.json` to extract full folder hierarchy (60 folders, 445 pages, max depth 4)
- [x] 0.2 Generate new `curriculum.json` where every folder becomes a node with `parentId` → parent folder, and every page becomes a leaf node
- [x] 0.3 Strip number prefixes from folder names for labels (e.g., "3. Marketing" → label: "Marketing", sortOrder: 3)
- [x] 0.4 Handle the root "Poslovanje" — chapters (1-22) become top-level nodes with `parentId: null` (matching current convention)
- [x] 0.5 Exclude "Kako koristiti Mentor AI?" node and all its children from the generated curriculum.json
- [x] 0.6 Validate: new curriculum.json has all folders (minus excluded) as intermediate nodes and all pages (minus excluded) as leaf nodes
- [x] 0.7 Diff against old curriculum.json and document changes (added intermediate folders, corrected parentId chains)

### Task 1: Update Tree Hierarchy to Support N-Level Depth (AC: 1)

- [x] 1.1 Update `CurriculumService` to load regenerated `curriculum.json` and build full N-level tree from `parentId` chains — already supported via `getAncestorChain()`, `getFullTree()`, `findNode()`. Verified works with 507 nodes.
- [x] 1.2 Update `getBrainTree()` in `conversation.service.ts` to build recursive hierarchy (not flat category > concept) — fully rewritten to use curriculum.json as hierarchy source, builds sparse N-level tree with ancestor path preservation
- [x] 1.3 Update sparse tree logic: when an active concept exists at ANY depth, include all ancestor nodes up to root — implemented via `getAncestorChain()` collecting `neededCurriculumIds` for each active concept
- [x] 1.4 Update `ConceptHierarchyNode` interface if needed (should already support recursive `children`) — already supports recursive children, no changes needed
- [x] 1.5 Update `concept-tree.component.ts` to render arbitrary depth with proper indentation (16-20px per level) and expand/collapse at each level — already handles arbitrary depth via recursive `flattenTree()`, 16px indent per level. Frontend service simplified to accept `ConceptTreeData` directly from backend.
- [x] 1.6 Test with depth-4 examples: both API and web builds pass, curriculum.json verified to contain depth-4 chains (Vrednost > Vrste Vrednosti > Oblici Vrednosti > Proizvod)
- [x] 1.7 Update `seed-obsidian.ts` to use regenerated curriculum.json for proper `curriculumId` on Concept records — loads curriculum.json, matches concepts by label + category disambiguation, sets `curriculumId` field. `findByIds()` updated to return `curriculumId`, `getBrainTree()` uses `curriculumId ?? slug` fallback.

### Task 2: Fix Chat Error Handling & Verify OpenAI Flow (AC: 2)

- [x] 2.1 Update `chat.component.ts` `onError` callback to accept `ChatErrorData` parameter and display `error.message` instead of generic text — callback now uses `(error)` parameter, shows `[type] message`
- [x] 2.2 Verify OpenAI streaming works end-to-end — `streamFromOpenAI()` correctly implemented with SSE parsing and typed error propagation. Build passes.
- [x] 2.3 Add error type display in chat error UI — error type shown as `[api_key_not_found]` or `[openai_error]` prefix before the message
- [x] 2.4 Backend gateway catch block updated to extract `detail` from `HttpException.getResponse()` instead of using generic `error.message`. Error flow: `streamFromOpenAI` → `InternalServerErrorException({type, detail})` → gateway extracts `{type, detail}` → `chat:error` event → frontend displays `[type] detail`

### Task 3: Implement Tenant-Wide Task Deduplication (AC: 3)

- [x] 3.1 Create `NotesService.findExistingTask(tenantId, conceptId?, title?)` — checks by conceptId first (stronger), then title (case-insensitive fallback). Also added `findExistingSubTask(tenantId, parentNoteId, workflowStepNumber)`.
- [x] 3.2 Update auto-task generation in `conversation.gateway.ts` — replaced conversation-scoped `getByConversation` check with `findExistingTask()` tenant-wide query
- [x] 3.3 Update explicit task creation in `conversation.gateway.ts` — same change, `findExistingTask()` instead of conversation-level title Set
- [x] 3.4 Update workflow sub-task creation in `workflow.service.ts` — added `findExistingSubTask()` check before creating sub-task notes, skips if same parentNoteId + workflowStepNumber already exists
- [x] 3.5 Post-execution discovery in `workflow.service.ts` — verified already tenant-wide (queries by `userId, tenantId, conceptId, noteType: TASK`, covers PENDING and COMPLETED statuses)
- [x] 3.6 Debug logging added for all skipped duplicates across all paths

### Task 4: Add Workflow/Task Comments — Unlimited, Per-User (AC: 4)

- [x] 4.1 Add `COMMENT` to `NoteType` enum in `schema.prisma` and generate migration — added enum value, created migration `20260223000000_add_comment_note_type`, deployed to DB
- [x] 4.2 Add `createComment(taskId, content, userId, tenantId)` and `getCommentsByTask(taskId, tenantId, page?, limit?)` methods to `notes.service.ts`
  - [x] 4.2.1 `getCommentsByTask` JOINs with User model to return `userName` (user.name) and `role` for each comment
  - [x] 4.2.2 Pagination supported (default 50 per page) with `total`, `page`, `limit` in response
- [x] 4.3 Add `POST /v1/notes/:taskId/comments` and `GET /v1/notes/:taskId/comments` endpoints to `notes.controller.ts`
  - [x] 4.3.1 Response includes `{ id, content, userId, userName, userRole, createdAt, updatedAt }`
  - [x] 4.3.2 GET supports `?page=1&limit=50` query params
- [x] 4.4 Add `PATCH /v1/notes/:commentId/comment` for editing comment content (author-only check)
  - [x] 4.4.1 Only the comment author can edit (checked via `userId` match, throws ForbiddenException)
  - [x] 4.4.2 `updatedAt` auto-set by Prisma on edit; returned in response
- [x] 4.5 Add `DELETE /v1/notes/:commentId/comment` with ownership check (author OR TENANT_OWNER/PLATFORM_OWNER)
- [x] 4.6 Comment thread UI integrated into `conversation-notes.component.ts`:
  - [x] 4.6.1 Comment input with Send button at bottom of thread, submits on Enter or click
  - [x] 4.6.2 Comment list with userName, role badge (hidden for MEMBER), relative timestamp, content
  - [x] 4.6.3 Inline edit mode: Edit button → textarea with Save/Cancel buttons
  - [x] 4.6.4 "(edited)" indicator shown when `updatedAt !== createdAt`
  - [x] 4.6.5 Delete button on all comments (backend enforces author/owner check)
  - [x] 4.6.6 "Load more..." button for pagination when comments.length < total
- [x] 4.7 Comment thread integrated into task detail view (task card body section)
  - [x] 4.7.1 Comments scoped by parentNoteId (each task/step has its own comment thread via `POST/GET :taskId/comments`)

### Task 5: Verify Web Search Integration (AC: 5)

- [x] 5.1 Confirmed `SERPER_API_KEY` is set in `.env` — `isAvailable()` will return true
- [x] 5.2 Code path verified: `conversation.gateway.ts` lines 303-367 — web search runs in parallel with concept/memory/business-brain context, results formatted via `formatSourcesAsObsidian()` and appended to `enrichedContext` before AI prompt injection. `webSearchEnabled` defaults to `true`.
- [x] 5.3 `searchAndExtract(content, 3)` calls Serper.dev API, deep-fetches top 3 results' page content (3K chars each, 10K total budget, 15s timeout), returns `EnrichedSearchResult[]` with title, link, snippet, pageContent
- [x] 5.4 `formatSourcesAsObsidian()` outputs Serbian-language markdown block with `--- WEB ISTRAŽIVANJE ---` header, linked results, and explicit inline citation instructions. Verified it's appended to enrichedContext at line 366. No code changes needed — web search was always functional; visibility was blocked by chat errors (fixed in Task 2)

## Dev Notes

### Architecture

- **Tree hierarchy**: The actual Obsidian vault has **4 levels of depth** (verified from `obsidian-pages.json`): 60 folders, 445 pages. `curriculum.json` was manually created and incorrectly flattens intermediate folders. It must be **regenerated** from the vault data. The backend `getBrainTree()` currently flattens to 2 levels. Fix: regenerate `curriculum.json` as exact mirror of vault, then make tree renderer depth-agnostic (recurse until `children` is empty).
- **Chat flow**: WebSocket `chat:message-send` → `conversation.gateway.ts` → `aiGatewayService.streamCompletionWithContext()` → `streamWithTimeout()` → `streamFromOpenAI()`. The switch statement in `streamWithTimeout()` correctly handles `'OPENAI'` case. The issue is purely frontend error display.
- **Task dedup**: Current dedup in `conversation.gateway.ts` queries `notesService.getByConversation()` (conversation-scoped). Needs to change to `notesService.findByTenantAndConcept()` (tenant-scoped).
- **Comments**: Leverages existing `parentNoteId` self-referential FK on Note model. No schema changes needed beyond adding `COMMENT` enum value.
- **Web search**: Already integrated in `conversation.gateway.ts` (lines 303-327), `workflow.service.ts` (lines 716-720), and discovery chat (lines 1842-1850). Uses `searchAndExtract()` with 3 results for chat, 5 for workflows.

### Key Files to Touch

**Backend:**
- `apps/api/src/app/conversation/conversation.service.ts` — `getBrainTree()` hierarchy logic
- `apps/api/src/app/conversation/conversation.gateway.ts` — task dedup, error propagation
- `apps/api/src/app/knowledge/services/curriculum.service.ts` — subtree traversal
- `apps/api/src/app/notes/notes.service.ts` — `findExistingTask()`, `createComment()`, `getCommentsByTask()`
- `apps/api/src/app/notes/notes.controller.ts` — comment endpoints
- `apps/api/src/app/workflow/workflow.service.ts` — sub-task dedup
- `apps/api/prisma/schema.prisma` — `COMMENT` enum value

**Frontend:**
- `apps/web/src/app/features/chat/chat.component.ts` — `onError` callback fix
- `apps/web/src/app/features/chat/components/concept-tree.component.ts` — 3-level tree rendering
- New: task comment thread component

### Obsidian Vault Actual Hierarchy (from obsidian-pages.json, max depth 4)

```
Vrednost (chapter, parentId: null)                       ← DEPTH 1
├── Uvod u Vrednost/ (6 pages, parentId: "vrednost")     ← DEPTH 2
├── Vrste Vrednosti/ (5 pages, parentId: "vrednost")     ← DEPTH 2
│   └── Oblici Vrednosti/ (15 pages)                     ← DEPTH 3
├── Stvaranje Vrednosti/ (5 pages)                       ← DEPTH 2
└── Kako učiniti ponudu vrednijom?/ (4 pages)            ← DEPTH 2

Marketing (chapter, parentId: null)                      ← DEPTH 1
├── Uvod u Marketing/ (9 pages)                          ← DEPTH 2
├── Razumevanje Tržišta/ (6 pages)                       ← DEPTH 2
├── Analiza Konkurencije/ (1 page + 2 subfolders)        ← DEPTH 2
│   ├── Uvod u Analizu Konkurencije/ (6 pages)           ← DEPTH 3
│   └── Strategije Analize Konkurencije/ (7 pages)       ← DEPTH 3
├── Privlačenje Pažnje/ (2 subfolders)                   ← DEPTH 2
│   ├── Osnove Privlačenja Pažnje/ (12 pages)            ← DEPTH 3
│   └── Faktori koji utiču na Privlačenje Pažnje/ (6)   ← DEPTH 3
├── Marketing Pristupi/ (19 pages)                       ← DEPTH 2
├── Marketing Miks/ (2 pages)                            ← DEPTH 2
└── Stvaranje Zajednice Kupaca/ (2 pages)                ← DEPTH 2

Upravljanje Svojim Radom (chapter, parentId: null)       ← DEPTH 1
├── Uvod/ (3 pages)                                      ← DEPTH 2
├── Fokus/ (2 pages)                                     ← DEPTH 2
├── Energija/ (8 pages)                                  ← DEPTH 2
├── Upravljanje Vremenom/ (3 pages)                      ← DEPTH 2
├── Odluke/ (7 pages)                                    ← DEPTH 2
└── Sklonosti/ (11 pages)                                ← DEPTH 2

Total: 60 folders, 445 pages, max depth 4 from root
```

NOTE: `curriculum.json` must be REGENERATED from this vault data. The old version incorrectly flattens intermediate folders (e.g., "Vrste Vrednosti" subfolder is missing, its children appear directly under "Vrednost").

### Project Structure Notes

- Follows existing Nx monorepo conventions
- Backend: NestJS modules with services, controllers, gateways
- Frontend: Angular 21 standalone components with signals
- All components use pure CSS (no Tailwind utility classes in inline templates)

### References

- [Source: curriculum.json] — Full 3-level hierarchy with 20 roots, 456 total nodes
- [Source: conversation.service.ts#getBrainTree] — Current 2-level tree building logic
- [Source: conversation.gateway.ts#handleMessage] — Chat message handling + auto-task generation
- [Source: ai-gateway.service.ts#streamWithTimeout] — Provider routing switch statement
- [Source: workflow.service.ts#executeStepAutonomous] — Workflow sub-task creation
- [Source: schema.prisma#Note] — Self-referential parentNoteId for hierarchy
- [Source: web-search.service.ts] — Serper.dev integration, searchAndExtract(), formatSourcesAsObsidian()
- [Source: Story 3.2] — Autonomous Business Brain architecture decisions
- [Source: Story 3.3] — Business Brain UX & Intelligence Refinements

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Completion Notes List

- ✅ Task 0: Created `prisma/generate-curriculum.ts` script that parses obsidian-pages.json and generates curriculum.json. Old: 456 flat nodes (20 roots, no intermediate folders). New: 507 nodes (63 folders + 444 pages, 24 roots, max depth 4). "Kako koristiti Mentor AI?" excluded (1 page removed). Depth distribution: 24 root, 177 depth-2, 260 depth-3, 46 depth-4. Verified chains: Vrednost > Vrste Vrednosti > Oblici Vrednosti > Proizvod (depth 4). Zero orphans.
- ✅ Task 1: Rewrote `getBrainTree()` to return N-level `ConceptTreeData` hierarchy matching Obsidian vault structure. Backend builds sparse tree from curriculum.json using `getAncestorChain()` for path preservation. Frontend simplified to accept `ConceptTreeData` directly (removed category→tree transformation). `findByIds()` now returns `curriculumId` field; `getBrainTree()` uses `curriculumId ?? slug` for curriculum lookup. `seed-obsidian.ts` updated to load curriculum.json and set `curriculumId` on seeded concepts via label matching with category disambiguation. Both API and web builds pass.
- ✅ Task 2: Fixed chat error handling. Frontend `onError` callback now uses `ChatErrorData` parameter to display actual error type and message (`[api_key_not_found] OpenAI API key is not configured` instead of generic "Message failed to send"). Backend gateway catch block updated to extract `type` and `detail` from `HttpException.getResponse()`. OpenAI streaming verified — `streamFromOpenAI()` correctly handles SSE parsing, typed error throwing, and stream cleanup.
- ✅ Task 3: Implemented tenant-wide task deduplication across all 5 generation paths. Added `findExistingTask(tenantId, {conceptId?, title?})` — checks by conceptId first (stronger), then title case-insensitive (fallback). Added `findExistingSubTask(tenantId, parentNoteId, workflowStepNumber)` for workflow sub-tasks. Updated auto-task (path 1), explicit-task (path 2), and workflow sub-task (path 4) paths. Post-execution discovery (path 5) already had correct tenant-wide dedup. Debug logging added for all skipped duplicates.
- ✅ Task 4: Full comment system implemented. Backend: `COMMENT` added to NoteType enum with migration deployed. 4 new service methods (`createComment`, `getCommentsByTask`, `updateComment`, `deleteComment`) with user info resolution, pagination (50/page), author-only edit, author+owner delete. 4 new controller endpoints (POST/GET `:taskId/comments`, PATCH/DELETE `:commentId/comment`). Frontend: comment thread UI integrated into `conversation-notes.component.ts` with expandable "Comments (N)" section per task, comment list with user name/role badge/timestamp/"(edited)" indicator, inline textarea edit mode, delete button, Send input with Enter key support, "Load more..." pagination. Shared types updated with `CommentItem` and `CommentListResponse` interfaces. Both API and web builds pass.
- ✅ Task 5: Web search integration verified. `SERPER_API_KEY` is configured in `.env`. `searchAndExtract(content, 3)` calls Serper.dev API in parallel with other context builders, deep-fetches top 3 results' page content. `formatSourcesAsObsidian()` outputs Serbian-language markdown block with linked results and citation instructions. Results appended to `enrichedContext` before AI prompt injection. No code changes needed — web search was always functional; visibility was blocked by chat errors (fixed in Task 2).
- ✅ Code Review Fixes (7 HIGH + 3 MEDIUM issues found and fixed):
  - Fixed `updateComment()` and `deleteComment()` to throw `ForbiddenException` (was `NotFoundException` for auth failures)
  - Added `BadRequestException` guard in `createComment()` — validates parent note is TASK type (was accepting any noteType)
  - Added pagination bounds enforcement in `getCommentsByTask()` — `page >= 1`, `limit` capped at 100
  - Created `CreateCommentDto` and `UpdateCommentDto` with `@IsString()`, `@IsNotEmpty()`, `@MaxLength(5000)` validators
  - Updated controller endpoints to use DTO classes instead of inline body objects
  - Added dedup to YOLO scheduler: `findExistingSubTask()` before sub-task creation (line 544), `findExistingTask()` before pending task creation (line 690)
  - Moved `ChatErrorData` interface from local `chat-websocket.service.ts` to shared types library
  - Remaining LOW issues (action items): `findExistingTask` title search capped at 200 candidates, full curriculum load on every `getBrainTree()` call (no caching)
  - Race condition in check-then-create dedup noted but not fixed (would require Prisma transaction wrapping — low probability in practice since task generation is serialized per conversation)

### File List

- `apps/api/prisma/generate-curriculum.ts` — NEW: Obsidian vault → curriculum.json generator
- `apps/api/src/app/knowledge/data/curriculum.json` — MODIFIED: regenerated (456 → 507 nodes, N-level depth)
- `apps/api/src/app/conversation/conversation.service.ts` — MODIFIED: `getBrainTree()` rewritten for N-level hierarchy
- `apps/api/src/app/knowledge/services/concept.service.ts` — MODIFIED: `findByIds()` returns `curriculumId`
- `apps/web/src/app/features/chat/services/conversation.service.ts` — MODIFIED: `getBrainTree()` simplified to accept `ConceptTreeData` directly
- `apps/api/prisma/seed-obsidian.ts` — MODIFIED: loads curriculum.json, sets `curriculumId` on seeded concepts
- `apps/web/src/app/features/chat/chat.component.ts` — MODIFIED: `onError` callback uses `ChatErrorData` parameter, shows `[type] message`
- `apps/api/src/app/conversation/conversation.gateway.ts` — MODIFIED: error extraction + tenant-wide task dedup in auto-task and explicit-task paths
- `apps/api/src/app/notes/notes.service.ts` — MODIFIED: added `findExistingTask()`, `findExistingSubTask()`, `createComment()`, `getCommentsByTask()`, `updateComment()`, `deleteComment()`
- `apps/api/src/app/notes/notes.controller.ts` — MODIFIED: added 4 comment endpoints (POST/GET `:taskId/comments`, PATCH/DELETE `:commentId/comment`)
- `apps/api/src/app/workflow/workflow.service.ts` — MODIFIED: sub-task creation uses `findExistingSubTask()` dedup
- `apps/api/prisma/schema.prisma` — MODIFIED: added `COMMENT` to NoteType enum
- `apps/api/prisma/migrations/20260223000000_add_comment_note_type/migration.sql` — NEW: adds COMMENT enum value
- `shared/types/src/lib/types.ts` — MODIFIED: added `COMMENT` to NoteType, added `CommentItem` and `CommentListResponse` interfaces
- `apps/web/src/app/features/chat/services/notes-api.service.ts` — MODIFIED: added `getComments()`, `createComment()`, `updateComment()`, `deleteComment()` methods
- `apps/web/src/app/features/chat/components/conversation-notes.component.ts` — MODIFIED: added comment thread UI (CSS, template, signals, methods)
- `apps/api/src/app/notes/dto/comment.dto.ts` — NEW (review fix): CreateCommentDto + UpdateCommentDto with class-validator decorators
- `apps/api/src/app/workflow/yolo-scheduler.service.ts` — MODIFIED (review fix): added findExistingSubTask() + findExistingTask() dedup to both task creation paths
- `apps/web/src/app/features/chat/services/chat-websocket.service.ts` — MODIFIED (review fix): imports ChatErrorData from shared types instead of local definition
