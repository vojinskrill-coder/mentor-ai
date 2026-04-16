# Story 2.1: Basic Text Conversation Interface

Status: done

## Story

As a **user**,
I want to interact with the AI assistant through a text chat interface,
So that I can request business task execution and receive guidance.

## Acceptance Criteria

1. **AC1: Chat Interface Display**
   - **Given** an authenticated user on the main dashboard
   - **When** they navigate to "New Conversation"
   - **Then** a chat interface is displayed with:
     - Message input area with send button
     - Conversation history panel
     - Clear visual distinction between user and AI messages
   - **And** the interface follows dark mode design (#0A0A0A background)

2. **AC2: Message Submission and Streaming**
   - **Given** a user types a message and clicks send
   - **When** the message is submitted
   - **Then** the message appears in the conversation history immediately
   - **And** a typing indicator shows while AI processes
   - **And** the AI response streams in real-time (not all at once)

3. **AC3: Conversation Context Persistence (Session)**
   - **Given** a conversation is in progress
   - **When** the user sends multiple messages
   - **Then** conversation context is maintained within the session
   - **And** previous messages are visible with timestamps
   - **And** the conversation can be scrolled to review history

4. **AC4: Conversation Persistence (Cross-Session)**
   - **Given** a user closes the browser
   - **When** they return and open the same conversation
   - **Then** the full conversation history is preserved
   - **And** they can continue the conversation

## Tasks / Subtasks

- [x] **Task 1: Database schema for conversations** (AC: 3,4)
  - [x] 1.1 Add `Conversation` model to tenant schema (id with `sess_` prefix, userId, title, createdAt, updatedAt)
  - [x] 1.2 Add `Message` model to tenant schema (id with `msg_` prefix, conversationId, role: USER|ASSISTANT, content, createdAt)
  - [x] 1.3 Add shared types: `Conversation`, `Message`, `MessageRole` to `shared/types/src/lib/types.ts`
  - [x] 1.4 Run `npx prisma generate` to update client types

- [x] **Task 2: Shared types for conversations** (AC: 1,2,3,4)
  - [x] 2.1 Add `Conversation` interface with id, userId, title, createdAt, updatedAt
  - [x] 2.2 Add `Message` interface with id, conversationId, role, content, createdAt
  - [x] 2.3 Add `MessageRole` enum: `USER`, `ASSISTANT`
  - [x] 2.4 Add `CreateMessageRequest`, `ConversationResponse` interfaces
  - [x] 2.5 Add WebSocket event types: `ChatMessageSend`, `ChatMessageChunk`, `ChatComplete`

- [x] **Task 3: Backend — ConversationModule scaffold** (AC: 1,2,3,4)
  - [x] 3.1 Create `apps/api/src/app/conversation/conversation.module.ts`
  - [x] 3.2 Create `apps/api/src/app/conversation/conversation.service.ts`
  - [x] 3.3 Create `apps/api/src/app/conversation/conversation.controller.ts`
  - [x] 3.4 Create DTOs: `create-conversation.dto.ts`, `send-message.dto.ts`
  - [x] 3.5 Register `ConversationModule` in `app.module.ts`

- [x] **Task 4: Backend — Conversation CRUD endpoints** (AC: 1,3,4)
  - [x] 4.1 `POST /api/v1/conversations` — Create new conversation
  - [x] 4.2 `GET /api/v1/conversations` — List user's conversations
  - [x] 4.3 `GET /api/v1/conversations/:id` — Get conversation with messages
  - [x] 4.4 `DELETE /api/v1/conversations/:id` — Delete conversation
  - [x] 4.5 Use `TenantPrismaService.getClient(tenantId)` for all DB operations

- [x] **Task 5: Backend — WebSocket Gateway for streaming** (AC: 2)
  - [x] 5.1 Create `apps/api/src/app/conversation/conversation.gateway.ts`
  - [x] 5.2 Implement Socket.io gateway with `@WebSocketGateway()` decorator
  - [x] 5.3 Implement `handleMessage` event for receiving user messages
  - [x] 5.4 Emit `chat:message-chunk` events for streaming response
  - [x] 5.5 Emit `chat:complete` when response is finished
  - [x] 5.6 Integrate with LlmConfigService to get provider configuration

- [x] **Task 6: Backend — AI Gateway integration** (AC: 2)
  - [x] 6.1 Create `apps/api/src/app/ai-gateway/ai-gateway.module.ts`
  - [x] 6.2 Create `apps/api/src/app/ai-gateway/ai-gateway.service.ts`
  - [x] 6.3 Implement `streamCompletion(messages, onChunk)` method
  - [x] 6.4 Use LlmConfigService to get active provider and API key
  - [x] 6.5 Handle streaming responses from OpenRouter/Local Llama

- [x] **Task 7: Frontend — Chat page component** (AC: 1)
  - [x] 7.1 Create `apps/web/src/app/features/chat/chat.component.ts`
  - [x] 7.2 Create conversation sidebar with conversation list
  - [x] 7.3 Create main chat area with message history
  - [x] 7.4 Add dark mode styling (#0A0A0A background)
  - [x] 7.5 Add route `/chat` and `/chat/:conversationId`

- [x] **Task 8: Frontend — Message components** (AC: 1,2)
  - [x] 8.1 Create `chat-message.component.ts` for message display
  - [x] 8.2 Style user messages (right-aligned, different background)
  - [x] 8.3 Style AI messages (left-aligned, with avatar)
  - [x] 8.4 Add timestamp display for messages
  - [x] 8.5 Implement markdown rendering for AI responses

- [x] **Task 9: Frontend — Chat input component** (AC: 2)
  - [x] 9.1 Create `chat-input.component.ts` with textarea input
  - [x] 9.2 Add send button with loading state
  - [x] 9.3 Add Enter key submit (Shift+Enter for newline)
  - [x] 9.4 Add typing indicator component
  - [x] 9.5 Disable input while AI is responding

- [x] **Task 10: Frontend — WebSocket service** (AC: 2)
  - [x] 10.1 Create `apps/web/src/app/core/services/websocket.service.ts`
  - [x] 10.2 Create `apps/web/src/app/features/chat/services/chat-websocket.service.ts`
  - [x] 10.3 Implement Socket.io client connection
  - [x] 10.4 Handle `chat:message-chunk` events with Signals
  - [x] 10.5 Handle `chat:complete` events
  - [x] 10.6 Implement reconnection logic

- [x] **Task 11: Frontend — Conversation service** (AC: 1,3,4)
  - [x] 11.1 Create `apps/web/src/app/features/chat/services/conversation.service.ts`
  - [x] 11.2 `createConversation()` — Create new conversation
  - [x] 11.3 `getConversations()` — List conversations
  - [x] 11.4 `getConversation(id)` — Get with messages
  - [x] 11.5 `deleteConversation(id)` — Delete conversation

- [x] **Task 12: Backend tests** (AC: 1,2,3,4)
  - [x] 12.1 `conversation.service.spec.ts` — unit tests for CRUD
  - [x] 12.2 `conversation.controller.spec.ts` — endpoint tests
  - [x] 12.3 `conversation.gateway.spec.ts` — WebSocket tests
  - [x] 12.4 `ai-gateway.service.spec.ts` — streaming tests
  - [x] 12.5 Test: Message persistence in tenant DB
  - [x] 12.6 Test: Conversation retrieval with messages

- [x] **Task 13: Frontend tests** (AC: 1,2,3)
  - [x] 13.1 `chat.component.spec.ts` — component tests
  - [x] 13.2 `chat-message.component.spec.ts` — message rendering
  - [x] 13.3 `chat-input.component.spec.ts` — input behavior
  - [x] 13.4 `conversation.service.spec.ts` — HTTP service tests
  - [x] 13.5 `chat-websocket.service.spec.ts` — WebSocket tests

- [x] **Task 14: Build verification + story update** (AC: all)
  - [x] 14.1 `nx build api` passes
  - [x] 14.2 `nx build web` passes
  - [x] 14.3 All tests pass
  - [x] 14.4 Update story file with completion notes and file list

## Dev Notes

### Critical Warnings from Previous Stories

> **DO NOT create duplicate types** — Import ALL shared types from `@mentor-ai/shared/types`. Stories 1.9, 1.10, 1.11, 1.12 had findings for duplicate types. [Source: 1-9, 1-10, 1-11, 1-12 code reviews]

> **Frontend tests use Vitest** — Use `vi.fn()`, NOT `jest.fn()`. Backend uses Jest. [Source: 1-9, 1-10, 1-11, 1-12 dev notes]

> **Use ConfigService for env vars** — NEVER use `process.env` directly or hardcode values. [Source: 1-10, 1-11 code reviews]

> **Signal naming**: ALL signals use `$` suffix: `isLoading$`, `messages$`, `conversation$` [Source: project-context.md]

> **Use `output()` function** for component outputs, NOT `@Output()` decorator. [Source: 1-9 dev notes]

> **Add JSDoc to public service methods** — Story 1-11, 1-12 added JSDoc with @param, @returns, @throws. [Source: 1-11, 1-12 code reviews]

> **Use structured logging** — Use objects not string interpolation: `this.logger.log({ message: '...', conversationId, userId })` [Source: 1-11 code review]

> **ID Prefixes are MANDATORY** — Session: `sess_`, Message: `msg_` [Source: project-context.md]

> **Tenant DB isolation** — Use `TenantPrismaService.getClient(tenantId)` for all conversation/message operations [Source: project-context.md]

### Architecture Compliance

**This story implements core patterns from Architecture:**

1. **Streaming Response Pattern** — Per architecture.md:
   - HTTP POST to initiate request → Returns `{ streamId: "uuid" }`
   - Client connects to WebSocket `ws://*/ws/chat?streamId=uuid`
   - Server streams chunks: `{ type: "chunk", content: "..." }`
   - Final message: `{ type: "complete", metadata: {...} }`
   - Graceful fallback to HTTP polling if WebSocket fails

2. **WebSocket Events** — Per project-context.md:
   - Event format: `domain:action` (kebab-case)
   - Examples: `chat:message-send`, `chat:message-chunk`, `chat:complete`
   - Define events in `libs/shared/events/` - never inline strings
   - All payloads must be typed with interfaces

3. **Socket.io Configuration** — Per architecture.md:
   - Use Redis Adapter for horizontal scaling
   - Rooms for tenant isolation
   - Connection authenticated via JWT

4. **File Structure** per architecture:
```
apps/api/src/app/conversation/
├── conversation.module.ts
├── conversation.service.ts
├── conversation.service.spec.ts
├── conversation.controller.ts
├── conversation.controller.spec.ts
├── conversation.gateway.ts
├── conversation.gateway.spec.ts
└── dto/
    ├── create-conversation.dto.ts
    └── send-message.dto.ts

apps/api/src/app/ai-gateway/
├── ai-gateway.module.ts
├── ai-gateway.service.ts
└── ai-gateway.service.spec.ts

apps/web/src/app/features/chat/
├── chat.component.ts
├── chat.component.spec.ts
├── components/
│   ├── chat-message.component.ts
│   ├── chat-message.component.spec.ts
│   ├── chat-input.component.ts
│   ├── chat-input.component.spec.ts
│   └── typing-indicator.component.ts
└── services/
    ├── conversation.service.ts
    ├── conversation.service.spec.ts
    ├── chat-websocket.service.ts
    └── chat-websocket.service.spec.ts

apps/web/src/app/core/services/
└── websocket.service.ts

libs/shared/events/src/
├── chat.events.ts
└── index.ts
```

### API Endpoints

| Method | Path | Guards | Description |
|--------|------|--------|-------------|
| `POST` | `/api/v1/conversations` | JwtAuth, Tenant | Create new conversation |
| `GET` | `/api/v1/conversations` | JwtAuth, Tenant | List user's conversations |
| `GET` | `/api/v1/conversations/:id` | JwtAuth, Tenant | Get conversation with messages |
| `DELETE` | `/api/v1/conversations/:id` | JwtAuth, Tenant | Delete conversation |

**WebSocket Events:**

| Event | Direction | Payload |
|-------|-----------|---------|
| `chat:message-send` | Client → Server | `{ conversationId, content }` |
| `chat:message-chunk` | Server → Client | `{ content, index }` |
| `chat:complete` | Server → Client | `{ messageId, fullContent, metadata }` |

### Prisma Schema Changes (Tenant DB)

```prisma
// Add to tenant schema (apps/api/prisma/tenant-schema.prisma)

enum MessageRole {
  USER
  ASSISTANT
}

model Conversation {
  id        String    @id @map("id") // Must have sess_ prefix
  userId    String    @map("user_id")
  title     String?
  messages  Message[]
  createdAt DateTime  @default(now()) @map("created_at")
  updatedAt DateTime  @updatedAt @map("updated_at")

  @@index([userId])
  @@map("conversations")
}

model Message {
  id             String       @id @map("id") // Must have msg_ prefix
  conversationId String       @map("conversation_id")
  conversation   Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  role           MessageRole
  content        String       @db.Text
  createdAt      DateTime     @default(now()) @map("created_at")

  @@index([conversationId])
  @@map("messages")
}
```

### WebSocket Gateway Pattern

```typescript
// conversation.gateway.ts
@WebSocketGateway({
  namespace: '/ws/chat',
  cors: { origin: '*' }
})
export class ConversationGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  async handleConnection(client: Socket) {
    // Validate JWT from query params or headers
    // Join room for tenant isolation: client.join(`tenant:${tenantId}`)
  }

  @SubscribeMessage('chat:message-send')
  async handleMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: ChatMessageSend
  ) {
    // Save user message to DB
    // Stream AI response via chat:message-chunk
    // Emit chat:complete when done
  }
}
```

### Frontend Signal State Pattern

```typescript
// chat.component.ts
export class ChatComponent {
  private readonly conversationService = inject(ConversationService);
  private readonly chatWsService = inject(ChatWebsocketService);

  readonly conversations$ = signal<Conversation[]>([]);
  readonly activeConversation$ = signal<Conversation | null>(null);
  readonly messages$ = signal<Message[]>([]);
  readonly isLoading$ = signal(false);
  readonly isStreaming$ = signal(false);
  readonly streamingContent$ = signal('');
}
```

### UX Design Requirements

**Dark Mode Styling (from UX Spec):**
- Background: `#0A0A0A` (near-black)
- Card background: `#1A1A1A`
- Text: `#FFFFFF` (primary), `#A0A0A0` (secondary)
- Accent: Primary color for send button, links

**Chat Layout (from UX Spec):**
- Sidebar: Conversation list (left)
- Main area: Message history + input (center/right)
- Responsive: Sidebar collapses on mobile

**Message Styling:**
- User messages: Right-aligned, accent background
- AI messages: Left-aligned, with avatar icon
- Timestamps: Subtle, relative time format ("2m ago")

**Input Area:**
- Multiline textarea (auto-expand)
- Send button (right side)
- Enter to send, Shift+Enter for newline
- Character count (optional)

### Testing Standards

**Backend (Jest):**
- `conversation.service.spec.ts` — 80% coverage
- `conversation.controller.spec.ts` — 80% coverage
- `conversation.gateway.spec.ts` — 70% coverage (WebSocket testing)
- `ai-gateway.service.spec.ts` — 90% coverage (AI Gateway is high-risk)

**Frontend (Vitest):**
- `chat.component.spec.ts` — 70% coverage
- `chat-message.component.spec.ts` — 70% coverage
- `conversation.service.spec.ts` — 70% coverage

**Key test scenarios:**
- Message creation and retrieval
- Conversation persistence across sessions
- WebSocket connection and streaming
- AI Gateway integration with LLM provider
- Error handling (connection loss, AI timeout)
- Tenant isolation (can't access other tenant's conversations)

### Existing Patterns to Reuse

| Pattern | Source | Reuse in 2.1 |
|---------|--------|---------------|
| TenantPrismaService | `tenant-context` lib | All DB operations |
| ConfigService for env vars | `llm-config.service.ts` | AI Gateway configuration |
| Structured logging | `tenant-deletion.service.ts` | All service methods |
| JSDoc documentation | `llm-config.service.ts` | All public methods |
| Signal-based state | `llm-config.component.ts` | Chat component |
| RFC 7807 errors | `llm-config.service.ts` | Error responses |
| ID prefix generation | Previous stories | `sess_` and `msg_` prefixes |

### Dependencies

**Story Dependencies:**
- Story 1-12 (LLM Provider Configuration) — DONE — Provides AI provider configuration

**Library Dependencies (already installed):**
- `socket.io` — WebSocket server (NestJS)
- `socket.io-client` — WebSocket client (Angular)
- `@socket.io/redis-adapter` — Redis adapter for scaling (optional for MVP)
- `marked` or `ngx-markdown` — Markdown rendering in chat

**New Shared Library:**
- Create `libs/shared/events/` for WebSocket event definitions if not exists

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-2.1]
- [Source: _bmad-output/planning-artifacts/architecture.md#Streaming-Response-Pattern]
- [Source: _bmad-output/planning-artifacts/architecture.md#API-Endpoints]
- [Source: _bmad-output/planning-artifacts/architecture.md#Frontend-Architecture]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Chat-Interface]
- [Source: _bmad-output/planning-artifacts/project-context.md#WebSocket-Events]
- [Source: _bmad-output/implementation-artifacts/1-12-llm-provider-configuration.md#Dev-Notes]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

None

### Completion Notes List

1. **Database Schema**: Added `Conversation` and `Message` models to Prisma schema with proper relations and ID prefixes (`sess_` and `msg_`). Added `MessageRole` enum (USER, ASSISTANT).

2. **Shared Types**: Extended `shared/types/src/lib/types.ts` with `Conversation`, `Message`, `MessageRole`, `ConversationWithMessages`, `ChatMessageSend`, `ChatMessageChunk`, `ChatComplete`, and `ChatError` interfaces.

3. **Socket.io Packages**: Installed `@nestjs/websockets`, `@nestjs/platform-socket.io`, `socket.io`, and `socket.io-client` for WebSocket support.

4. **WebSocket Gateway**: Implemented JWT validation using `jwks-rsa` for WebSocket connections. Gateway validates tokens against Auth0 JWKS endpoint.

5. **AI Gateway Service**: Created with primary/fallback provider pattern and streaming support. Integrates with `LlmConfigService` to get active provider configuration.

6. **Frontend State Management**: Used Angular Signals with `$` suffix convention (`conversations$`, `messages$`, `isStreaming$`, etc.).

7. **Type Safety Fix**: Fixed `MessageRole` enum usage - must import value (not just type) and use `MessageRole.USER` instead of string literal `'USER'` due to TypeScript's type-only import behavior.

8. **Test Results**:
   - API: 39 test suites, 364 tests passing
   - Web: 22 test suites, 203 tests passing

9. **Build Status**: Both `nx build api` and `nx build web` pass successfully.

### File List

**Backend - Conversation Module**
- `apps/api/src/app/conversation/conversation.module.ts`
- `apps/api/src/app/conversation/conversation.service.ts`
- `apps/api/src/app/conversation/conversation.service.spec.ts`
- `apps/api/src/app/conversation/conversation.controller.ts`
- `apps/api/src/app/conversation/conversation.controller.spec.ts`
- `apps/api/src/app/conversation/conversation.gateway.ts`
- `apps/api/src/app/conversation/conversation.gateway.spec.ts`
- `apps/api/src/app/conversation/dto/create-conversation.dto.ts`
- `apps/api/src/app/conversation/dto/send-message.dto.ts`

**Backend - AI Gateway Module**
- `apps/api/src/app/ai-gateway/ai-gateway.module.ts`
- `apps/api/src/app/ai-gateway/ai-gateway.service.ts`
- `apps/api/src/app/ai-gateway/ai-gateway.service.spec.ts`

**Backend - Modified**
- `apps/api/src/app/app.module.ts` (registered ConversationModule and AiGatewayModule)
- `apps/api/prisma/schema.prisma` (added Conversation, Message models and MessageRole enum)

**Frontend - Chat Feature**
- `apps/web/src/app/features/chat/chat.component.ts`
- `apps/web/src/app/features/chat/chat.component.spec.ts`
- `apps/web/src/app/features/chat/components/chat-message.component.ts`
- `apps/web/src/app/features/chat/components/chat-message.component.spec.ts`
- `apps/web/src/app/features/chat/components/chat-input.component.ts`
- `apps/web/src/app/features/chat/components/chat-input.component.spec.ts`
- `apps/web/src/app/features/chat/components/typing-indicator.component.ts`
- `apps/web/src/app/features/chat/services/conversation.service.ts`
- `apps/web/src/app/features/chat/services/conversation.service.spec.ts`
- `apps/web/src/app/features/chat/services/chat-websocket.service.ts`
- `apps/web/src/app/features/chat/services/chat-websocket.service.spec.ts`

**Frontend - Core Services**
- `apps/web/src/app/core/services/websocket.service.ts`

**Frontend - Modified**
- `apps/web/src/app/app.routes.ts` (added /chat routes)

**Shared Types**
- `shared/types/src/lib/types.ts` (added Conversation, Message, MessageRole and WebSocket event types)
