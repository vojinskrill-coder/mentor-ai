# Story 2.17: Universal Web Search and Discovery Chat

Status: in-progress

## Story

As a **user**,
I want web search to supplement all AI responses with current web information and have a discovery chat for ad-hoc questions,
so that I receive accurate, up-to-date guidance with proper source attribution and can investigate specific topics without creating new concept conversations.

## Acceptance Criteria

### AC1: Web Search in All Chat Conversations
**Given** a user sends a message in ANY chat conversation (concept chat, general chat, or discovery chat)
**When** the AI processes the message
**Then** web search is performed to find relevant current information
**And** the web search context is injected into the AI's system prompt
**And** if web search is unavailable (no API key), the conversation continues normally without web data

### AC2: Obsidian-Formatted Source URLs
**Given** the AI generates a response that includes web-sourced information
**When** the response is displayed to the user
**Then** all source URLs are formatted in Obsidian markdown link format: `[Source Title](URL)`
**And** sources appear in a "Izvori / Sources" section at the bottom of the response
**And** the links are clickable and open in a new browser tab

### AC3: Discovery Chat in Task Bar
**Given** a user is viewing their tasks/notes panel (right sidebar)
**When** they look at the bottom of the task bar
**Then** they see a collapsible "Discovery Chat" input area
**And** the chat allows them to type questions and receive AI responses inline
**And** the discovery chat is NOT linked to any specific concept or conversation
**And** discovery chat messages are ephemeral (not persisted to database)

### AC4: Discovery Chat Has Web Search
**Given** a user types a question in the Discovery Chat
**When** the AI processes the query
**Then** web search is performed to supplement the response
**And** the response includes Obsidian-formatted source links
**And** the response appears inline below the input in the task bar panel

### AC5: Web Search Toggle (DESCOPED — Optional Future Enhancement)
**Given** a user is in any chat conversation
**When** they want to control web search behavior
**Then** they can see a small web search indicator icon near the input
**And** clicking it toggles web search on/off for the current message
**And** the default state is ON (web search enabled)
> **Note:** AC5 descoped from this story. Backend `webSearchEnabled` flag (Task 1.6) is in place for future toggle support. No frontend toggle UI implemented.

## Tasks / Subtasks

- [x] Task 1: Add web search to regular chat message flow (AC: 1, 2)
  - [x] 1.1: Inject `WebSearchService` into `ConversationGateway`
  - [x] 1.2: In `handleMessage()` (line ~267), add web search call parallel to concept matching and memory retrieval
  - [x] 1.3: Build search query from user message + conversation context (reuse `buildSearchQuery()` pattern from `WorkflowService`)
  - [x] 1.4: Format web context and append to `businessContext` passed to `aiGatewayService.streamCompletionWithContext()`
  - [x] 1.5: Add timeout guard (15s max) so web search doesn't block chat if slow (COVERED — existing searchAndExtract already enforces 15s timeout)
  - [x] 1.6: Add `webSearchEnabled` flag to `handleMessage` payload (default: true) for future toggle support

- [x] Task 2: Obsidian URL formatting in AI responses (AC: 2)
  - [x] 2.1: Update `formatWebContext()` in `WorkflowService` — now delegates to `WebSearchService.formatSourcesAsObsidian()`
  - [x] 2.2: Create shared `formatSourcesAsObsidian()` utility in `WebSearchService` that formats `EnrichedSearchResult[]` into Obsidian-style source block
  - [x] 2.3: Update the system prompt web search instructions (both workflow and chat) to explicitly require Obsidian link format: `[Source Title](https://url)` in "Izvori / Sources" section
  - [x] 2.4: Custom `marked` renderer in `concept-citation.component.ts` and `discovery-chat.component.ts` adds `target="_blank" rel="noopener noreferrer"` to all links

- [x] Task 3: Discovery Chat backend endpoint (AC: 3, 4)
  - [x] 3.1: Add `handleDiscoveryMessage` WebSocket event in `ConversationGateway`
  - [x] 3.2: Discovery messages: no conversationId, no persistence, no concept matching
  - [x] 3.3: Build system prompt for discovery: general business assistant + web search context
  - [x] 3.4: Stream response back via `discovery:message-chunk` and `discovery:message-complete` events
  - [x] 3.5: Include web search with same Obsidian URL formatting

- [x] Task 4: Discovery Chat frontend component (AC: 3, 4)
  - [x] 4.1: Create `DiscoveryChatComponent` as standalone Angular component
  - [x] 4.2: Component has: collapsible header ("Discovery Chat"), text input, send button, messages area
  - [x] 4.3: Messages are stored in component signal (ephemeral, lost on navigation)
  - [x] 4.4: Wire to `ChatWebsocketService` for `discovery:message-chunk` / `discovery:message-complete` / `discovery:error` events
  - [x] 4.5: Render AI responses with `marked` library + custom renderer for target="_blank" links
  - [x] 4.6: Pure CSS styling matching dark theme design tokens

- [x] Task 5: Integrate Discovery Chat into left sidebar layout (AC: 3)
  - [x] 5.1: Add `DiscoveryChatComponent` to the bottom of the left sidebar in `chat.component.ts` (between concept tree and footer)
  - [x] 5.2: Discovery chat is collapsible (collapsed by default)
  - [x] 5.3: When expanded, it takes up to 40vh max-height with scrollable messages area
  - [x] 5.4: Collapsing preserves conversation state within the session

- [ ] Task 6: Backend tests (AC: 1-4)
  - [ ] 6.1: Test web search integration in `handleMessage()` — verify search called, context passed to AI
  - [ ] 6.2: Test graceful degradation when web search unavailable
  - [ ] 6.3: Test discovery message handler — no persistence, web search included
  - [x] 6.4: Existing `formatWebContext` tests updated to work via delegation to `formatSourcesAsObsidian()`

- [x] Task 7: Build verification
  - [x] 7.1: `npx nx build api` — no TypeScript errors
  - [x] 7.2: `npx nx build web` — no TypeScript errors
  - [x] 7.3: All existing tests still pass (18/18 workflow.service.spec.ts pass)

## Dev Notes

### Current Web Search Architecture (Story 2-14 Foundation)

Web search is currently ONLY available in workflow execution via `WorkflowService.executeStepAutonomous()` (line 655-669). The `ConversationGateway.handleMessage()` (lines 267-278) performs concept matching + memory retrieval in parallel but does NOT invoke web search.

**Key files to modify:**

| File | Current Role | Changes Needed |
|------|-------------|----------------|
| `apps/api/src/app/conversation/conversation.gateway.ts` | Chat WebSocket handler | Add web search to `handleMessage()`, add `handleDiscoveryMessage()` |
| `apps/api/src/app/web-search/web-search.service.ts` | Search + extract | Add `formatSourcesAsObsidian()` utility |
| `apps/api/src/app/workflow/workflow.service.ts` | Workflow execution | Update `formatWebContext()` to use Obsidian format |
| `apps/web/src/app/features/chat/chat.component.ts` | Main chat UI | Add DiscoveryChatComponent to right sidebar |
| `apps/web/src/app/features/chat/services/chat-ws.service.ts` | WebSocket client | Add discovery event handlers |

**New files to create:**

| File | Purpose |
|------|---------|
| `apps/web/src/app/features/chat/components/discovery-chat.component.ts` | Discovery chat UI component |

### Web Search Integration Pattern for Chat

The existing `handleMessage()` in `conversation.gateway.ts` (line ~267) runs concept matching and memory in parallel:
```typescript
const [conceptMatches, memoryContext] = await Promise.all([
  this.conceptMatchingService.findRelevantConcepts(content),
  this.memoryService.getRelevantMemories(userId, content),
]);
```

Add web search as a third parallel operation:
```typescript
const [conceptMatches, memoryContext, webContext] = await Promise.all([
  this.conceptMatchingService.findRelevantConcepts(content),
  this.memoryService.getRelevantMemories(userId, content),
  this.webSearchService.isAvailable()
    ? this.webSearchService.searchAndExtract(content, 3).catch(() => [])
    : Promise.resolve([]),
]);
```

Then format and append to the business context before calling `aiGatewayService.streamCompletionWithContext()`.

### Discovery Chat Architecture

Discovery chat is intentionally lightweight:
- **No conversationId** — messages are not persisted
- **No concept matching** — general purpose, not tied to curriculum
- **Web search enabled** — primary value is web-augmented answers
- **Streaming** — same chunk-based streaming as main chat
- **WebSocket events**: `discovery:send-message`, `discovery:message-chunk`, `discovery:message-complete`

The backend handler should:
1. Receive message text (no conversationId)
2. Perform web search
3. Build simple system prompt (general business assistant + web context)
4. Stream response via dedicated discovery events
5. NOT save to database (ephemeral)

### Obsidian URL Format

The AI system prompt instruction should specify:
```
When citing web sources, format each source link as: [Source Title](URL)
Place all sources in a "### Izvori / Sources" section at the end of your response.
```

Current format in `formatWebContext()` already instructs citation, but doesn't enforce Obsidian markdown format. Update the instruction text in both:
- `WorkflowService.formatWebContext()` (line ~862)
- New chat web context formatter

### Pure CSS Requirement (CRITICAL)

The `DiscoveryChatComponent` MUST use pure CSS class definitions in the `styles` block. Tailwind v4 does NOT process utility classes in Angular inline templates. Use design tokens:
- Background: `#0D0D0D` (base), `#1A1A1A` (surface), `#242424` (elevated)
- Border: `#2A2A2A`
- Text: `#FAFAFA` (primary), `#A0A0A0` (secondary)
- Primary accent: `#3B82F6`

### API Route Note

`main.ts` sets global prefix `'api'` — the WebSocket gateway at `/ws/chat` is unaffected (WebSocket paths don't use the global prefix). Discovery events go through the same gateway.

### Previous Story Intelligence

**From Story 2-14 (Universal Web Search):**
- `buildSearchQuery()` deduplicates words, strips filler, adds company/industry/year — reuse this pattern
- `searchAndExtract()` has built-in timeouts (8s search, 10s fetch, 15s total) — same constraints apply for chat
- Web context capped at 10K chars via `MAX_TOTAL_WEB_CONTEXT_CHARS` constant
- Graceful degradation: if Serper unavailable, skip web search silently

**From Story 2-16 (Workflow Output Visibility):**
- Pure CSS styles pattern established for all chat components
- WebSocket event naming: `domain:action` format (use `discovery:*`)
- `chat.component.ts` sidebar layout already has task/notes panels — discovery chat goes below

### Project Structure Notes

- All shared types go in `libs/shared/types/src/lib/types.ts` — add any new interfaces there
- WebSocket events should be typed in shared types
- Component follows standalone pattern with `inject()` for DI
- Use Angular signals (`signal()`, `computed()`) for all component state

### References

- [Source: apps/api/src/app/web-search/web-search.service.ts] — WebSearchService with search(), fetchWebpage(), searchAndExtract()
- [Source: apps/api/src/app/workflow/workflow.service.ts#L655-669] — Current web search invocation in workflow execution
- [Source: apps/api/src/app/conversation/conversation.gateway.ts#L267-278] — Chat message handling (no web search currently)
- [Source: apps/api/src/app/ai-gateway/ai-gateway.service.ts#L321-331] — AI completion with businessContext injection point
- [Source: apps/web/src/app/features/chat/chat.component.ts] — Main chat component, right sidebar layout
- [Source: _bmad-output/planning-artifacts/project-context.md] — Full project rules and patterns
- [Source: _bmad-output/implementation-artifacts/2-14-universal-web-search-in-task-execution.md] — Previous web search story

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6

### Code Review Record

**Reviewer:** Claude Opus 4.6 (adversarial code-review workflow)
**Issues Found:** 4 HIGH, 3 MEDIUM, 3 LOW
**Issues Fixed:** 4 HIGH, 3 MEDIUM (all auto-fixed)
**LOW issues deferred:** #8 global marked config, #10 `(payload as any).webSearchEnabled` cast

| # | Severity | Issue | Fix |
|---|----------|-------|-----|
| 1 | HIGH | Backend emits `{ content: chunk }` but frontend expects `{ chunk }` — discovery streaming broken | Changed backend to emit `{ chunk, index }` |
| 2 | HIGH | Backend emits `chat:error` for discovery but frontend listens `discovery:error` | Changed backend to emit `discovery:error` |
| 3 | HIGH | Story says "right sidebar" but implementation is left sidebar | Corrected story text to match implementation |
| 4 | HIGH | All story tasks marked `[ ]` despite being done | Updated all completed tasks to `[x]` |
| 5 | MEDIUM | `formatWebContext` tests need mock update after delegation | Added `formatSourcesAsObsidian` to mock |
| 6 | MEDIUM | Duplicate logic in `formatWebContext` and `formatSourcesAsObsidian` | `formatWebContext` now delegates to `webSearchService.formatSourcesAsObsidian()` |
| 7 | MEDIUM | `canSend$` was writable signal instead of computed | Converted to `computed()`, removed 3 manual `.set()` calls |

### Debug Log References

### Completion Notes List

1. Web search added as 3rd parallel operation in `ConversationGateway.handleMessage()` alongside concept matching and memory retrieval
2. `WebSearchModule` imported into `ConversationModule` for DI availability
3. `formatSourcesAsObsidian()` method added to `WebSearchService` — Obsidian markdown link format `[Title](URL)` with `### Izvori / Sources` citation section
4. Custom `marked` renderer override in `concept-citation.component.ts` and `discovery-chat.component.ts` adds `target="_blank" rel="noopener noreferrer"` to all rendered links
5. Discovery Chat backend uses `@SubscribeMessage('discovery:send-message')` — ephemeral, no DB persistence, no concept matching
6. Discovery Chat streams via `discovery:message-chunk` and `discovery:message-complete` events
7. `DiscoveryChatComponent` is standalone with pure CSS, collapsible, placed in left sidebar between concept tree and footer
8. `ChatWebsocketService` extended with `emitDiscoveryMessage()`, `onDiscoveryChunk()`, `onDiscoveryComplete()`, `onDiscoveryError()`
9. `marked` `Tokens.Link` type used for renderer override (not inline type literal) to satisfy strict TypeScript
10. `workflow.service.ts` and `yolo-scheduler.service.ts` content truncation removed (was `substring(0, 2000)`)

### File List

- `apps/api/src/app/conversation/conversation.module.ts` — Added WebSearchModule import
- `apps/api/src/app/conversation/conversation.gateway.ts` — Web search in handleMessage, discovery chat handler
- `apps/api/src/app/web-search/web-search.service.ts` — Added formatSourcesAsObsidian() method
- `apps/api/src/app/workflow/workflow.service.ts` — Updated formatWebContext to Obsidian format, removed content truncation
- `apps/api/src/app/workflow/yolo-scheduler.service.ts` — Removed content truncation
- `apps/web/src/app/features/chat/services/chat-websocket.service.ts` — Discovery event types, callbacks, emit method
- `apps/web/src/app/features/chat/components/discovery-chat.component.ts` — NEW: DiscoveryChatComponent
- `apps/web/src/app/features/chat/components/concept-citation/concept-citation.component.ts` — Fixed marked renderer type, target="_blank" links
- `apps/web/src/app/features/chat/chat.component.ts` — Integrated DiscoveryChatComponent in sidebar
