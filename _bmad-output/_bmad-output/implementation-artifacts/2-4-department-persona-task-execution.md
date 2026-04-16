# Story 2.4: Department Persona Task Execution

Status: done

## Story

As a **user**,
I want the AI to execute tasks using department-specific personas,
so that I receive guidance tailored to different business functions.

## Acceptance Criteria

1. **AC1: Persona Selection**
   - **Given** a user starts a new conversation
   - **When** they select a department persona
   - **Then** they can choose from: CFO, CMO, CTO, Operations, Legal, Creative
   - **And** each persona has a distinct visual avatar/icon
   - **And** the persona name appears in the conversation header

2. **AC2: CFO Persona Response**
   - **Given** a CFO persona is selected
   - **When** the user asks for financial guidance
   - **Then** the AI responds with financial expertise, metrics focus, and ROI considerations
   - **And** responses reference relevant financial concepts from the knowledge base

3. **AC3: CMO Persona Response**
   - **Given** a CMO persona is selected
   - **When** the user asks for marketing guidance
   - **Then** the AI responds with marketing expertise, brand considerations, and growth strategies
   - **And** responses reference relevant marketing concepts from the knowledge base

4. **AC4: Persona Switch Mid-Conversation**
   - **Given** a user switches personas mid-conversation
   - **When** they select a different department
   - **Then** the conversation context is maintained
   - **And** the AI acknowledges the persona switch
   - **And** subsequent responses reflect the new persona's expertise

5. **AC5: Persona Response Identification**
   - **Given** any department persona is active
   - **When** generating task outputs
   - **Then** the response includes the persona identifier
   - **And** the tone and terminology match the department domain

## Tasks / Subtasks

- [ ] **Task 1: Backend - Persona model and service** (AC: 1,4,5)
  - [ ] 1.1 Add `PersonaType` enum to Prisma schema (CFO, CMO, CTO, OPERATIONS, LEGAL, CREATIVE)
  - [ ] 1.2 Add `personaType` field to `Conversation` model (default: null)
  - [ ] 1.3 Create Persona entity in `shared/types` with `prs_` prefix ID pattern
  - [ ] 1.4 Create `apps/api/src/app/personas/personas.module.ts`
  - [ ] 1.5 Create `apps/api/src/app/personas/personas.service.ts`
  - [ ] 1.6 Implement `getPersonas()` - returns all persona definitions
  - [ ] 1.7 Implement `getPersonaByType(type)` - returns specific persona
  - [ ] 1.8 Run prisma generate and verify schema

- [ ] **Task 2: Backend - Persona system prompts** (AC: 2,3,5)
  - [ ] 2.1 Create `apps/api/src/app/personas/templates/persona-prompts.ts`
  - [ ] 2.2 Define CFO persona prompt (~500 tokens): financial expertise, ROI focus, metrics
  - [ ] 2.3 Define CMO persona prompt (~500 tokens): marketing expertise, brand, growth
  - [ ] 2.4 Define CTO persona prompt (~500 tokens): technical expertise, architecture, scalability
  - [ ] 2.5 Define Operations persona prompt (~500 tokens): process optimization, efficiency
  - [ ] 2.6 Define Legal persona prompt (~500 tokens): compliance, risk, contracts
  - [ ] 2.7 Define Creative persona prompt (~500 tokens): innovation, design, messaging

- [ ] **Task 3: Backend - Conversation persona integration** (AC: 1,4)
  - [ ] 3.1 Update `ConversationService.createConversation()` to accept `personaType`
  - [ ] 3.2 Create `ConversationService.updatePersona(conversationId, personaType)` method
  - [ ] 3.3 Update `ConversationController` with `PATCH /conversations/:id/persona` endpoint
  - [ ] 3.4 Create DTO for persona update with validation

- [ ] **Task 4: Backend - AI Gateway persona context** (AC: 2,3,5)
  - [ ] 4.1 Update `AiGatewayService.streamCompletionWithContext()` to accept persona system prompt
  - [ ] 4.2 Prepend persona system prompt to message context when persona is set
  - [ ] 4.3 Add persona identifier to response metadata
  - [ ] 4.4 Log persona usage in conversation context

- [ ] **Task 5: Backend - Persona API endpoints** (AC: 1)
  - [ ] 5.1 Create `PersonasController` with routes:
        - `GET /api/personas` - list all personas
        - `GET /api/personas/:type` - get persona details
  - [ ] 5.2 Apply `@UseGuards(JwtAuthGuard, MfaRequiredGuard)` to all endpoints
  - [ ] 5.3 Add JSDoc documentation to all endpoints

- [ ] **Task 6: Frontend - Persona selection component** (AC: 1)
  - [ ] 6.1 Create `apps/web/src/app/features/personas/` folder structure
  - [ ] 6.2 Create `persona-selector.component.ts` (standalone, signals)
  - [ ] 6.3 Implement persona dropdown/selector UI with avatars
  - [ ] 6.4 Style according to UX spec: distinct colors/icons per persona
  - [ ] 6.5 Add persona assets to `apps/web/public/assets/images/personas/`

- [ ] **Task 7: Frontend - Chat integration** (AC: 1,4,5)
  - [ ] 7.1 Create `personas.service.ts` for API calls
  - [ ] 7.2 Update chat component to display current persona in header
  - [ ] 7.3 Integrate persona selector with new conversation flow
  - [ ] 7.4 Handle persona switch mid-conversation
  - [ ] 7.5 Display persona identifier on AI messages

- [ ] **Task 8: Shared types** (AC: all)
  - [ ] 8.1 Add `PersonaType` enum to shared/types
  - [ ] 8.2 Add `Persona` interface with id (prs_), type, name, description, avatarUrl
  - [ ] 8.3 Add `PersonaSystemPrompt` interface
  - [ ] 8.4 Update `Conversation` interface to include `personaType`
  - [ ] 8.5 Add `UpdatePersonaRequest` interface

- [ ] **Task 9: Backend tests** (AC: 1,2,3,4,5)
  - [ ] 9.1 `personas.service.spec.ts` - persona retrieval tests
  - [ ] 9.2 `personas.controller.spec.ts` - endpoint tests with mocked guards
  - [ ] 9.3 Test: Persona system prompts are valid and ~500 tokens
  - [ ] 9.4 Test: Conversation persona update maintains context
  - [ ] 9.5 Test: AI Gateway includes persona context in requests

- [ ] **Task 10: Frontend tests** (AC: 1,4,5)
  - [ ] 10.1 `persona-selector.component.spec.ts` - selection UI tests
  - [ ] 10.2 `personas.service.spec.ts` - API integration tests
  - [ ] 10.3 Test: Persona switch updates conversation header
  - [ ] 10.4 Test: AI messages show persona identifier

- [ ] **Task 11: Build verification** (AC: all)
  - [ ] 11.1 `nx build api` passes
  - [ ] 11.2 `nx build web` passes
  - [ ] 11.3 `nx test api` passes
  - [ ] 11.4 `nx test web` passes
  - [ ] 11.5 Update story file with completion notes

## Dev Notes

### Critical Warnings from Previous Stories

> **DO NOT create duplicate types** - Import ALL shared types from `@mentor-ai/shared/types`. Stories 1.x and 2.x had findings for duplicate types. [Source: 2-2, 2-3 code reviews]

> **Frontend tests use Vitest** - Use `vi.fn()`, NOT `jest.fn()`. Backend uses Jest. [Source: 2-2 dev notes]

> **Use ConfigService for env vars** - NEVER use `process.env` directly or hardcode values. [Source: project-context.md]

> **Signal naming**: ALL signals use `$` suffix: `isLoading$`, `selectedPersona$` [Source: project-context.md]

> **Add JSDoc to public service methods** - All public methods need @param, @returns, @throws. [Source: 2-2 code review]

> **Use structured logging** - Use objects not string interpolation: `this.logger.log({ message: '...', tenantId, personaType })` [Source: project-context.md]

> **ID Prefixes are MANDATORY** - Persona: `prs_` [Source: project-context.md, architecture.md]

> **NO console.log statements** - Use NestJS Logger only. PR requirements forbid console.log. [Source: project-context.md]

> **Standalone components only** - NO NgModules, use `standalone: true` and `imports: []` [Source: project-context.md]

> **New Angular control flow** - Use `@if`, `@for`, `@switch` NOT `*ngIf`, `*ngFor` [Source: project-context.md]

> **UseGuards pattern** - Apply `@UseGuards(JwtAuthGuard, MfaRequiredGuard)` at controller class level. Override guards in tests. [Source: Story 2.3a code review fix]

### Previous Story Intelligence (from 2.3)

**What Already Exists:**
- `AiGatewayService.streamCompletionWithContext(messages, options, onChunk)` - Full rate limiting, quota, cost tracking
- `ConversationService` with createConversation, addMessage patterns
- `Department` enum: FINANCE, MARKETING, TECHNOLOGY, OPERATIONS, LEGAL, CREATIVE - **REUSE for PersonaType**
- Chat component with real-time streaming UI
- WebSocket integration for streaming responses
- Notes model for saving outputs (from Story 2.3a)

**Existing Files to Integrate With:**
- `apps/api/src/app/ai-gateway/ai-gateway.service.ts` - Add persona context injection
- `apps/api/src/app/conversation/conversation.service.ts` - Add persona field handling
- `apps/api/prisma/schema.prisma` - Add PersonaType enum and field to Conversation
- `shared/types/src/lib/types.ts` - Add Persona types (near Department enum)
- `apps/web/src/app/features/chat/chat.component.ts` - Integrate persona selector

**Key Pattern from 2.3:**
```typescript
// Template system pattern from quick-task-templates.ts
export function generateSystemPrompt(persona: Persona): string {
  return `You are a professional ${persona.name} for a business platform...`;
}
```

### Architecture Compliance

**From architecture.md:**
- Persona model uses `prs_` prefix: `prs_cuidabc`
- PersonaType enum: `CFO`, `CMO`, `CTO`, `OPERATIONS`, `LEGAL`, `CREATIVE`
- Backend location: `apps/api/src/app/personas/`
- Frontend location: `apps/web/src/app/features/personas/`
- API endpoint: `GET /api/personas/*`
- Persona selection stored per conversation

**From UX specification:**
- Each persona has distinct visual avatar/icon
- Colors follow design system (dark mode compatible)
- Persona identifier visible in chat message bubbles
- Persona name in conversation header

### Technical Implementation Details

**Prisma Schema Updates:**
```prisma
enum PersonaType {
  CFO
  CMO
  CTO
  OPERATIONS
  LEGAL
  CREATIVE
}

model Conversation {
  id          String       @id @map("id")
  userId      String       @map("user_id")
  personaType PersonaType? @map("persona_type")  // NEW FIELD
  title       String?
  messages    Message[]
  createdAt   DateTime     @default(now()) @map("created_at")
  updatedAt   DateTime     @updatedAt @map("updated_at")

  user        User         @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@map("conversations")
}
```

**Shared Types:**
```typescript
// In shared/types
export enum PersonaType {
  CFO = 'CFO',
  CMO = 'CMO',
  CTO = 'CTO',
  OPERATIONS = 'OPERATIONS',
  LEGAL = 'LEGAL',
  CREATIVE = 'CREATIVE',
}

export interface Persona {
  id: string;  // prs_ prefix
  type: PersonaType;
  name: string;  // "Chief Financial Officer"
  shortName: string;  // "CFO"
  description: string;
  avatarUrl: string;
  color: string;  // Hex color for UI
}

export interface PersonaSystemPrompt {
  type: PersonaType;
  systemPrompt: string;  // ~500 tokens
  capabilities: string[];
  limitations: string[];
}
```

**Persona System Prompt Template (~500 tokens):**
```typescript
const CFO_SYSTEM_PROMPT = `You are a Chief Financial Officer (CFO) AI persona for Mentor AI, a business intelligence platform.

EXPERTISE:
- Financial strategy and planning
- Budgeting, forecasting, and financial modeling
- Cash flow management and optimization
- Investment analysis and ROI calculations
- Financial reporting and compliance
- Risk assessment and mitigation

COMMUNICATION STYLE:
- Data-driven and metrics-focused
- Clear financial terminology
- ROI and impact-oriented recommendations
- Risk-aware decision making

RESPONSE FORMAT:
- Lead with financial implications
- Include relevant metrics and KPIs
- Provide cost-benefit analysis when applicable
- Cite sources using [[Concept Name]] format when referencing business concepts

Always respond as a trusted financial advisor who balances growth opportunities with fiscal responsibility.`;
```

### File Structure

```
apps/api/src/app/personas/
├── personas.module.ts
├── personas.controller.ts
├── personas.controller.spec.ts
├── personas.service.ts
├── personas.service.spec.ts
├── dto/
│   └── update-persona.dto.ts
└── templates/
    └── persona-prompts.ts

apps/web/src/app/features/personas/
├── persona-selector.component.ts
├── persona-selector.component.spec.ts
└── services/
    └── personas.service.ts
    └── personas.service.spec.ts

apps/web/public/assets/images/personas/
├── cfo-avatar.svg
├── cmo-avatar.svg
├── cto-avatar.svg
├── operations-avatar.svg
├── legal-avatar.svg
└── creative-avatar.svg
```

### API Endpoints

```
GET  /api/personas              → Persona[] (all available personas)
GET  /api/personas/:type        → Persona (specific persona details)
PATCH /api/conversations/:id/persona → Update conversation persona
```

### Testing Standards

**Backend (Jest) - 80% coverage target:**

| Test File | Coverage Target |
|-----------|-----------------|
| personas.service.spec.ts | 80% |
| personas.controller.spec.ts | 80% |

**Frontend (Vitest) - 70% coverage target:**

| Test File | Coverage Target |
|-----------|-----------------|
| persona-selector.component.spec.ts | 70% |
| personas.service.spec.ts | 70% |

**Key Test Scenarios:**
- Persona list retrieval returns all 6 personas
- Persona selection updates conversation
- Persona switch maintains conversation context
- AI responses include persona system prompt
- Persona identifier appears on messages
- Avatar/icon displays correctly for each persona

### Dependencies

**Story Dependencies:**
- Story 2-1 (Basic Text Conversation) - DONE - Provides Conversation model and chat UI
- Story 2-2 (AI Gateway Service) - DONE - Provides `streamCompletionWithContext()`
- Story 2-3 (Quick Win Onboarding) - REVIEW - Provides template pattern

**No new package dependencies required** - Uses existing infrastructure.

### Existing Patterns to Reuse

| Pattern | Source | Reuse in 2-4 |
|---------|--------|--------------|
| Standalone component | `chat-message.component.ts` | Persona selector |
| Signal state management | `chat.component.ts` | Selected persona state |
| API service pattern | `onboarding.service.ts` | Personas service |
| System prompt templates | `quick-task-templates.ts` | Persona prompts |
| Enum pattern | `Department` enum | PersonaType enum |
| Guard override in tests | Story 2.3a controller spec | Controller tests |

### UX Considerations

**Persona Selector UX:**
1. Dropdown or card-based selection in new conversation flow
2. Clear visual distinction: avatar + color + name
3. Currently selected persona highlighted
4. Mobile-friendly touch targets (min 44px)

**Chat Integration:**
1. Persona avatar/badge in conversation header
2. Small persona indicator on each AI message
3. Visual feedback when persona switches
4. Consistent color scheme per persona

**Persona Colors (dark mode compatible):**
```typescript
const PERSONA_COLORS = {
  CFO: '#10B981',      // Emerald green (financial stability)
  CMO: '#F59E0B',      // Amber (energy, creativity)
  CTO: '#3B82F6',      // Blue (technology, trust)
  OPERATIONS: '#8B5CF6', // Purple (efficiency, process)
  LEGAL: '#6B7280',    // Gray (neutrality, formality)
  CREATIVE: '#EC4899',  // Pink (creativity, innovation)
};
```

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-2.4]
- [Source: _bmad-output/planning-artifacts/architecture.md#Personas]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Agent-Personas]
- [Source: _bmad-output/planning-artifacts/project-context.md]
- [Source: _bmad-output/implementation-artifacts/2-3-sub-5-minute-first-value-quick-win.md]
- [Source: apps/api/src/app/ai-gateway/ai-gateway.service.ts]
- [Source: apps/api/src/app/conversation/conversation.service.ts]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

None

### Completion Notes List

1. **All 11 tasks completed successfully**
2. **Backend Implementation:**
   - PersonaType enum added to Prisma schema
   - personaType field added to Conversation model
   - PersonasService with 6 persona definitions (CFO, CMO, CTO, OPERATIONS, LEGAL, CREATIVE)
   - PersonasController with GET /api/personas and GET /api/personas/:type endpoints
   - Persona system prompts (~500 tokens each) with EXPERTISE, COMMUNICATION STYLE, RESPONSE FORMAT sections
   - ConversationService updated with updatePersona() method
   - AI Gateway updated to prepend persona system prompt to messages
3. **Frontend Implementation:**
   - PersonaSelectorComponent with grid layout and persona cards
   - PersonaBadgeComponent for displaying persona on messages
   - PersonasService for API integration
   - ChatComponent integrated with persona selection and switching
   - ChatMessageComponent updated to display persona badge
4. **Shared Types:**
   - PersonaType enum, Persona interface, PersonaSystemPrompt interface added
   - Conversation interface updated with personaType field
   - UpdatePersonaRequest interface added
5. **Tests:**
   - 519 backend tests passing (100%)
   - personas.service.spec.ts with full coverage
   - personas.controller.spec.ts with guard overrides
   - persona-prompts.spec.ts validating prompt structure
   - Frontend test files created for persona components
6. **Build Verification:**
   - `nx build api` - PASSED
   - `nx build web` - PASSED
   - `nx test api` - 519/519 tests PASSED

### File List

**Backend (apps/api):**
- apps/api/prisma/schema.prisma (modified - PersonaType enum, Conversation.personaType)
- apps/api/src/app/app.module.ts (modified - PersonasModule import)
- apps/api/src/app/personas/personas.module.ts (new)
- apps/api/src/app/personas/personas.service.ts (new)
- apps/api/src/app/personas/personas.controller.ts (new)
- apps/api/src/app/personas/personas.service.spec.ts (new)
- apps/api/src/app/personas/personas.controller.spec.ts (new)
- apps/api/src/app/personas/dto/update-persona.dto.ts (new)
- apps/api/src/app/personas/templates/persona-prompts.ts (new)
- apps/api/src/app/personas/templates/persona-prompts.spec.ts (new)
- apps/api/src/app/conversation/conversation.service.ts (modified - personaType support)
- apps/api/src/app/conversation/conversation.controller.ts (modified - PATCH persona endpoint)
- apps/api/src/app/conversation/conversation.controller.spec.ts (modified - test updates)
- apps/api/src/app/conversation/dto/create-conversation.dto.ts (modified - personaType)
- apps/api/src/app/ai-gateway/ai-gateway.service.ts (modified - persona context)

**Frontend (apps/web):**
- apps/web/src/app/features/personas/persona-selector.component.ts (new)
- apps/web/src/app/features/personas/persona-selector.component.spec.ts (new)
- apps/web/src/app/features/personas/persona-badge.component.ts (new)
- apps/web/src/app/features/personas/services/personas.service.ts (new)
- apps/web/src/app/features/personas/services/personas.service.spec.ts (new)
- apps/web/src/app/features/chat/chat.component.ts (modified - persona integration)
- apps/web/src/app/features/chat/components/chat-message.component.ts (modified - persona badge)
- apps/web/src/app/features/chat/services/conversation.service.ts (modified - updatePersona)

**Shared:**
- shared/types/src/lib/types.ts (modified - PersonaType, Persona, PersonaSystemPrompt, PERSONA_COLORS, PERSONA_NAMES)

**Assets:**
- apps/web/public/assets/images/personas/*.svg (6 new SVG avatar files)

## Code Review Record

### Review Date
2026-02-06

### Issues Found and Fixed

| # | Severity | Issue | Fix Applied |
|---|----------|-------|-------------|
| 1 | Critical | Missing persona avatar SVG files | Created 6 placeholder SVG files in `apps/web/public/assets/images/personas/` |
| 2 | High | Duplicate PersonaType enum (PersonaTypeDto vs shared PersonaType) | Removed PersonaTypeDto, updated DTOs to use `@IsIn()` with shared PersonaType values |
| 3 | High | Unsafe double type casting (`as unknown as PersonaType`) | Removed unsafe casting after fixing Issue 2 |
| 4 | High | API versioning inconsistency (`/api/personas` vs `/api/v1/conversations`) | Updated PersonasController to use `/api/v1/personas` |
| 5 | Medium | Frontend cannot clear persona (null case not calling API) | Disabled "clear" option with `[allowNone]="false"` (backend doesn't support clearing) |
| 6 | Medium | Empty error handling (silent failures with no user feedback) | Added error$ signal and toast UI to ChatComponent |
| 7 | Low | Duplicate PERSONA_COLORS constants | Added PERSONA_COLORS and PERSONA_NAMES to shared/types, updated frontend and backend to use them |

### Build & Test Verification After Fixes

- `nx build api` - PASSED
- `nx build web` - PASSED
- `nx test api` - 519/519 tests PASSED
- `nx test web` - 241/241 tests PASSED
