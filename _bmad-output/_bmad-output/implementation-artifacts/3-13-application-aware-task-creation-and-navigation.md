# Story 3.13: Application-Aware Task Creation & Task-Conversation Navigation

Status: ready-for-dev

## Story

As a business owner using the Business Brain,
I want the AI to automatically place tasks in the correct concept folder and give each task its own conversation thread,
so that my tasks are organized where they belong and I can drill into any task to read details or ask follow-up questions.

## Context

Currently, tasks inherit the `conversationId` and `conceptId` from the active conversation where they are generated. This means:
1. Tasks land in whichever concept the user happens to be chatting about, not necessarily where they belong
2. Clicking a task has no way to open a focused discussion — the task's conversation is the general chat where it was born
3. Multiple tasks share the same conversation, making it impossible to have a dedicated thread per task

This story makes the AI **application-aware**: it understands the concept tree structure (16 categories, 443 concepts) and intelligently routes tasks to the correct folder. Each task gets its own dedicated conversation, turning tasks from passive checkboxes into **living knowledge nodes** the user can explore.

## Acceptance Criteria

1. **AC1: Smart concept auto-assignment** — When the AI generates a task (auto or explicit), it resolves the best-matching concept from the full concept tree using keyword/semantic matching. If confidence > 0.7, auto-assign silently. If no concept scores above threshold, assign to the closest category root node. No user confirmation dialog.

2. **AC2: Dedicated conversation per task** — Each newly created task gets its own `Conversation` record (type = `'task'`). The task's `conversationId` points to this dedicated conversation, not the parent chat. The dedicated conversation is seeded with an initial context message containing the task description and expected outcome.

3. **AC3: Task click opens dedicated conversation** — When the user clicks a task in the concept tree's task tab, the frontend loads that task's dedicated conversation. The user sees the task context and can continue chatting (asking follow-up questions, getting more details) within that scoped thread.

4. **AC4: Incremental task accumulation** — Multiple tasks can exist under the same concept. New tasks append to the concept's task list. Smart deduplication prevents near-duplicates:
   - Similarity > 0.90 to a PENDING/IN_PROGRESS task → skip creation, optionally add context to existing task's conversation
   - Similarity > 0.90 to a COMPLETED task → create new (it's a next iteration)
   - Similarity 0.60-0.90 → create but log relationship to similar task
   - Similarity < 0.60 → create normally

5. **AC5: Task conversations excluded from sidebar** — Task-type conversations do not appear in the main conversation list/sidebar. They are only accessible through the concept tree → task card click.

6. **AC6: Both `nx build api` and `nx build web` pass** — No compilation errors.

## Tasks / Subtasks

### Task 1: Add `conversationType` Field to Schema (AC2, AC5)

**Prisma schema** — `apps/api/prisma/schema.prisma`:
- [ ] Add `ConversationType` enum: `CHAT`, `TASK`
- [ ] Add `conversationType` field to `Conversation` model with default `CHAT`
- [ ] Run `npx prisma db push` to apply

**Shared types** — `shared/types/src/lib/types.ts`:
- [ ] Add `ConversationType` enum: `CHAT = 'CHAT'`, `TASK = 'TASK'`
- [ ] Add `conversationType` field to `Conversation` interface

### Task 2: Implement Intent-to-Concept Resolver (AC1)

**New file** — `apps/api/src/app/knowledge/services/concept-matcher.service.ts`:
- [ ] Create `ConceptMatcherService` injectable service
- [ ] Method `resolveConceptForTask(taskTitle: string, taskContent: string, tenantId: string): Promise<{ conceptId: string; categoryName: string; confidence: number }>`
- [ ] Query all concepts for the tenant's accessible categories (respect department isolation)
- [ ] Score each concept against task text using keyword matching:
  - Exact concept name match in task text → 1.0
  - Category name match → 0.8
  - Keyword overlap (concept description words vs task words) → proportional score
- [ ] Return highest-scoring concept if score > 0.7
- [ ] Fallback: return category root node with closest keyword match
- [ ] Register in `KnowledgeModule` providers

### Task 3: Create Dedicated Task Conversations (AC2)

**Backend** — `apps/api/src/app/conversation/conversation.gateway.ts`:

**In `generateAutoTasks()` (lines 819-830):**
- [ ] Before `notesService.createNote()`, create a new `Conversation` record:
  ```
  id: generateId('sess'),
  userId, title: task.title,
  conceptId: resolvedConceptId,
  conversationType: 'TASK'
  ```
- [ ] Seed the new conversation with an initial `Message` containing: task title, content, expected outcome
- [ ] Pass the NEW `conversationId` (not the parent) to `createNote()`
- [ ] Use `ConceptMatcherService.resolveConceptForTask()` instead of inheriting parent conversation's conceptId

**In `detectAndCreateExplicitTasks()` (lines 993-1003):**
- [ ] Same pattern: create dedicated Conversation per task
- [ ] Use `ConceptMatcherService` for concept resolution
- [ ] Pass dedicated `conversationId` to `createNote()`

### Task 4: Smart Deduplication with Similarity (AC4)

**Backend** — `apps/api/src/app/notes/notes.service.ts`:
- [ ] Add method `findSimilarTasks(tenantId: string, conceptId: string, title: string): Promise<{ note: Note; similarity: number }[]>`
- [ ] Load all TASK notes for the concept
- [ ] Calculate title similarity using normalized Levenshtein distance or trigram overlap
- [ ] Return sorted by similarity descending

**Backend** — `apps/api/src/app/conversation/conversation.gateway.ts`:
- [ ] In both task creation methods, replace `findExistingTask()` with `findSimilarTasks()`
- [ ] Apply dedup rules:
  - similarity > 0.90 + status PENDING/IN_PROGRESS → skip, log "duplicate skipped"
  - similarity > 0.90 + status COMPLETED → create new (next iteration)
  - similarity 0.60-0.90 → create normally, log relationship
  - similarity < 0.60 → create normally

### Task 5: Filter Task Conversations from Sidebar (AC5)

**Backend** — `apps/api/src/app/conversation/conversation.service.ts`:
- [ ] In `getConversations()` / `findAll()` query: add `WHERE conversationType = 'CHAT'` (or `conversationType != 'TASK'`)
- [ ] Ensure task conversations are excluded from the main list endpoint

**Frontend** — No changes needed if backend filters correctly. Task conversations are loaded on-demand when clicking a task.

### Task 6: Task Click → Load Dedicated Conversation (AC3)

**Frontend** — `apps/web/src/app/features/chat/components/conversation-notes.component.ts`:
- [ ] Make task card title/header clickable
- [ ] On click: emit new output event `openTaskConversation` with `{ conversationId, taskNoteId, conceptId }`
- [ ] Add CSS: cursor pointer on task title, hover underline effect
- [ ] Add visual indicator (arrow/link icon) showing the task is navigable

**Frontend** — `apps/web/src/app/features/chat/chat.component.ts`:
- [ ] Handle `openTaskConversation` event from conversation-notes component
- [ ] Call existing `loadConversation(conversationId)` to switch to the task's dedicated conversation
- [ ] Set active concept context to the task's concept
- [ ] User can now chat within the task's conversation thread (ask questions, get details)

**Frontend** — `apps/web/src/app/features/chat/services/chat-websocket.service.ts`:
- [ ] No changes needed — existing `joinConversation()` handles switching

### Task 7: Build Verification (AC6)
- [ ] `nx build api` passes
- [ ] `nx build web` passes
- [ ] Manual test: generate tasks, verify they appear under correct concept folders
- [ ] Manual test: click a task, verify dedicated conversation loads with task context
- [ ] Manual test: send multiple messages, verify new tasks accumulate without duplicates
- [ ] Manual test: verify task conversations don't appear in sidebar conversation list

## Dev Notes

### Architecture Patterns
- WebSocket events follow pattern: `namespace:action` (e.g., `task:ai-start`, `chat:notes-updated`)
- Frontend uses Angular signals (`signal()`, `computed()`) for reactive state
- All components use pure CSS (no Tailwind utility classes in inline templates)
- Design tokens: #0D0D0D (base), #1A1A1A (surface), #242424 (elevated), #2A2A2A (border), #FAFAFA (text), #3B82F6 (primary)

### Critical File Locations
- **Backend gateway**: `apps/api/src/app/conversation/conversation.gateway.ts` — task creation at lines 745-851 (auto) and 932-1031 (explicit)
- **Notes service**: `apps/api/src/app/notes/notes.service.ts` — `createNote()`, `findExistingTask()`
- **Concept relevance**: `apps/api/src/app/knowledge/services/concept-relevance.service.ts` — `scoreRelevance()` with industry/dept/relationship weights
- **Frontend notes**: `apps/web/src/app/features/chat/components/conversation-notes.component.ts` — task card rendering lines 487-795
- **Frontend chat**: `apps/web/src/app/features/chat/chat.component.ts` — orchestrator
- **Shared types**: `shared/types/src/lib/types.ts` — NoteItem (lines 1323-1343), Conversation (lines 358-368)
- **Prisma schema**: `apps/api/prisma/schema.prisma` — Note model (lines 400-438), Conversation (lines 288-302)

### Current Concept Assignment (What Changes)
Currently `generateAutoTasks()` at line 804 uses:
```
const effectiveConceptId = conversation.conceptId ?? relevantConcepts?.[0]?.conceptId ?? null;
```
This inherits from the active conversation. Story 3.13 replaces this with `ConceptMatcherService.resolveConceptForTask()` which analyzes the task text against all concepts to find the best match.

### Current Dedup (What Changes)
Currently `findExistingTask(tenantId, { conceptId, title })` does exact title match. Story 3.13 replaces this with similarity-based matching that handles near-duplicates and respects task status (PENDING vs COMPLETED).

### Task Conversation Lifecycle
```
User chats in general conversation (type: CHAT)
  → AI generates task "Potreba za Statusom"
    → ConceptMatcherService resolves → concept "Status" in category "Poslovanje"
    → New Conversation created (type: TASK, title: "Potreba za Statusom", conceptId: ...)
    → Initial message seeded with task description
    → Note created with new conversationId
  → User clicks task in concept tree
    → Frontend loads task's dedicated conversation
    → User can ask follow-up questions in scoped context
```

### Concept Tree Structure (16 Categories)
Poslovanje, Vrednost, Marketing, Prodaja, Finansije, Organizacija, Tehnologija, Ljudski Resursi, Pravni Aspekti, Inovacije, Strategija, Kvalitet, Logistika, Komunikacija, Liderstvo, Partnerstva

### Testing Approach
1. Start API + Web dev servers
2. Open a conversation, send messages that trigger auto-tasks
3. Verify tasks appear under the correct concept folder (not just the active conversation's concept)
4. Click a task → verify dedicated conversation loads
5. Chat within the task conversation → verify messages stay scoped
6. Generate similar tasks → verify dedup prevents near-duplicates
7. Check sidebar → verify task conversations are hidden

### References
- [Source: conversation.gateway.ts — generateAutoTasks lines 745-851]
- [Source: conversation.gateway.ts — detectAndCreateExplicitTasks lines 932-1031]
- [Source: concept-relevance.service.ts — scoreRelevance lines 83-123]
- [Source: conversation-notes.component.ts — task card rendering lines 487-795]
- [Source: schema.prisma — Note model lines 400-438, Conversation model lines 288-302]
- [Source: types.ts — NoteItem lines 1323-1343, Conversation lines 358-368]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
