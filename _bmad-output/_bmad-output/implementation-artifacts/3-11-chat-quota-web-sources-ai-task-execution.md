# Story 3.11: Chat Quota Fix, Web Search Sources, AI Task Execution

## Story

**As a** business owner using the platform,
**I want** reliable chat without false quota errors, visible web search source URLs, and an AI execute button for tasks,
**So that** I can trust the AI responses are properly sourced and have tasks completed automatically.

**Status:** done
**Epic:** 3 — Autonomous Business Brain
**Priority:** High
**Story Points:** 5

## Context

Three issues found during production testing:
1. Chat shows quota error — tenant used 1.18M tokens against 1M default quota
2. Web search sources not shown — metadata not passed to frontend
3. "Execute Task" button triggers full workflow engine instead of direct AI execution

## Acceptance Criteria

- [x] AC1: Default token quota increased from 1M to 10M across schema, seed, cleanup script, and QuotaService fallback
- [x] AC2: Existing tenant quotas updated in DB to 10M
- [x] AC3: `WebSearchSource` interface added to shared types; `webSearchSources` field on `Message`
- [x] AC4: Backend passes `webSearchSources` in `chat:complete` metadata
- [x] AC5: Frontend `onComplete` handler extracts `citations`, `memoryAttributions`, AND `webSearchSources` from metadata
- [x] AC6: Chat messages render "Web izvori" section with clickable source links
- [x] AC7: New `task:execute-ai` WebSocket handler streams direct AI response, saves message, marks task COMPLETED
- [x] AC8: Frontend "Izvrši" button emits `task:execute-ai` with streaming feedback via `task:ai-chunk`
- [x] AC9: Task completion reloads notes and conversation
- [x] AC10: Both `nx build api` and `nx build web` pass

## Tasks / Subtasks

### 1. Quota Fix (backend)
- [x] Change `tokenQuota` default from 1M to 10M in `schema.prisma`
- [x] Update `seed.ts` and `cleanup-and-configure.ts` dev workspace quota
- [x] Change QuotaService fallback default to 10M
- [x] Update existing tenant quotas in DB via `prisma db push`

### 2. Web Search Sources (shared types)
- [x] Add `WebSearchSource` interface to `types.ts`
- [x] Add `webSearchSources?: WebSearchSource[]` to `Message` interface

### 3. Web Search Sources (backend)
- [x] Add `webSearchSources` mapping to `chat:complete` metadata in `conversation.gateway.ts`

### 4. Web Search Sources (frontend)
- [x] Fix `onComplete` handler to extract `citations`, `memoryAttributions`, `webSearchSources` from metadata
- [x] Add `hasWebSearchSources$` computed to `chat-message.component.ts`
- [x] Add "Web izvori" section with globe icon and clickable links (blue tint styling)

### 5. AI Task Execution (backend)
- [x] Add `@SubscribeMessage('task:execute-ai')` handler in `conversation.gateway.ts`
- [x] Load task note, conversation context (last 6 messages), business context
- [x] Stream response via `task:ai-chunk` events
- [x] Save AI message to conversation, mark task COMPLETED with userReport
- [x] Add truncation warning log when userReport exceeds 10K chars

### 6. AI Task Execution (frontend WS service)
- [x] Add `TaskAiChunk`, `TaskAiComplete`, `TaskAiError` callback types
- [x] Add `emitExecuteTaskAi(taskId, conversationId)` method
- [x] Add `onTaskAiChunk`, `onTaskAiComplete`, `onTaskAiError` registration methods
- [x] Add cleanup in `clearCallbacks()`

### 7. AI Task Execution (frontend chat component)
- [x] Rewire `onExecuteSingleTask()` to emit `task:execute-ai` with streaming state
- [x] Wire `onTaskAiChunk` handler to append to `streamingContent$`
- [x] Wire `onTaskAiComplete` handler to clear state, reload notes + conversation
- [x] Wire `onTaskAiError` handler to clear state + show error
- [x] Fix `executingTaskId` binding — remove `isGeneratingPlan$()` guard
- [x] Use shared `WebSearchSource` type (not inline anonymous type)

### 8. UI Text Updates (frontend)
- [x] Update button text: "Izvrši" / "AI radi..." during execution

### Review Follow-ups (AI)
- [ ] [AI-Review][HIGH] Add co-located tests for new functionality (gateway handler, WS service, chat-message sources)
- [ ] [AI-Review][LOW] Inline event string literals (`task:execute-ai`, etc.) — codebase-wide pattern

## Dev Agent Record

### File List
- `apps/api/prisma/schema.prisma` — tokenQuota default changed to 10M
- `apps/api/prisma/seed.ts` — dev workspace tokenQuota updated
- `apps/api/prisma/cleanup-and-configure.ts` — dev workspace tokenQuota updated
- `apps/api/src/app/ai-gateway/quota.service.ts` — fallback default to 10M, warning log
- `shared/types/src/lib/types.ts` — WebSearchSource interface, Message.webSearchSources field
- `apps/api/src/app/conversation/conversation.gateway.ts` — webSearchSources in metadata, task:execute-ai handler, truncation warning
- `apps/web/src/app/features/chat/services/chat-websocket.service.ts` — TaskAi event types, callbacks, emitter
- `apps/web/src/app/features/chat/chat.component.ts` — onExecuteSingleTask rewired, onTaskAiChunk/Complete/Error handlers, WebSearchSource import
- `apps/web/src/app/features/chat/components/chat-message.component.ts` — hasWebSearchSources$ computed, sources-section template+styles
- `apps/web/src/app/features/chat/components/conversation-notes.component.ts` — button text "Izvrši" / "AI radi..."

### Change Log
| Date | Change | Author |
|------|--------|--------|
| 2026-02-24 | Story implemented | Claude Opus 4.6 |
| 2026-02-24 | Code review fixes: streaming chunk handler, shared type import, truncation log | Claude Opus 4.6 |
