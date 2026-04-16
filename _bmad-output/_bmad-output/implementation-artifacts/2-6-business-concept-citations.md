# Story 2.6: Business Concept Citations

Status: done

## Critical Dependency Warning

> **BLOCKING DEPENDENCY**: This story requires Story 3.1 (Business Concepts Data Model and Seeding) to be completed first.
>
> Story 2.6 cannot be implemented without:
> - `Concept` model in Platform DB (cpt_ prefix entities)
> - Concept embeddings in Qdrant vector database
> - At least a seed set of business concepts to cite
>
> **Options:**
> 1. Implement Story 3.1 first (recommended)
> 2. Create a minimal stub concept infrastructure in this story
> 3. Defer Story 2.6 until Epic 3 begins

## Story

As a **user**,
I want AI responses to cite specific business concepts,
so that I can learn and explore the underlying frameworks.

## Acceptance Criteria

1. **AC1: Concept Citation Display**
   - **Given** the AI generates a response
   - **When** the response references a business concept from the knowledge base
   - **Then** the concept name appears as a clickable link/badge
   - **And** multiple concepts can be cited in a single response

2. **AC2: Concept Side Panel**
   - **Given** a user clicks a concept citation
   - **When** the concept exists in the knowledge base
   - **Then** a side panel opens showing:
     - Concept name and category
     - Brief definition (2-3 sentences)
     - "Learn More" link to full concept page

3. **AC3: Inline Citations**
   - **Given** a response is generated
   - **When** concepts are cited
   - **Then** citations appear inline with the text (not just at the end)
   - **And** the visual style distinguishes concepts from regular links
   - **And** up to 5 concepts are cited per response (avoid overwhelming)

4. **AC4: Graceful Absence**
   - **Given** no relevant concepts apply
   - **When** the AI generates a response
   - **Then** no concept citations are shown
   - **And** the response is still complete and useful

## Tasks / Subtasks

- [x] **Task 0: Dependency Resolution** (BLOCKING)
  - [x] 0.1 Verify Story 3.1 is complete OR implement minimal concept stub
  - [x] 0.2 Verify Qdrant connection is configured (stubbed, fallback to keyword matching)
  - [x] 0.3 Verify at least 10 seed concepts exist for testing (6 seed files with ~10 concepts each)

- [x] **Task 1: Backend - ConceptCitation entity** (AC: 1,2)
  - [x] 1.1 Add `Concept` model to Platform DB schema (if not from 3.1)
  - [x] 1.2 Add `ConceptCitation` model linking messages to concepts
  - [x] 1.3 Run `prisma generate` and `prisma migrate`
  - [x] 1.4 Add `ConceptCitation` interface to shared types

- [x] **Task 2: Backend - Concept matching service** (AC: 1,3,4)
  - [x] 2.1 Create `apps/api/src/app/knowledge/` module structure
  - [x] 2.2 Create `ConceptMatchingService` for semantic search
  - [x] 2.3 Implement `findRelevantConcepts(response, limit=5)` method
  - [x] 2.4 Integrate with Qdrant for vector similarity search (stubbed with fallback)
  - [x] 2.5 Implement score threshold (>0.7 similarity) for citations

- [x] **Task 3: Backend - Citation injection** (AC: 1,3)
  - [x] 3.1 Create `CitationInjectorService` to insert citations into responses
  - [x] 3.2 Implement inline citation format: `[[Concept Name]]`
  - [x] 3.3 Store citations with message in ConversationService
  - [x] 3.4 Limit to 5 most relevant concepts per response

- [x] **Task 4: Backend - Citation API endpoints** (AC: 2)
  - [x] 4.1 Create `GET /api/v1/knowledge/concepts/:id/summary` endpoint
  - [x] 4.2 Return concept summary for side panel display
  - [x] 4.3 Create `GET /api/v1/knowledge/messages/:id/citations` endpoint
  - [x] 4.4 Add structured logging for citation analytics

- [x] **Task 5: Frontend - Citation component** (AC: 1,2,3)
  - [x] 5.1 Create `apps/web/src/app/features/chat/components/concept-citation/` folder
  - [x] 5.2 Create `concept-citation.component.ts` (standalone, signals)
  - [x] 5.3 Parse message content for `[[Concept Name]]` patterns
  - [x] 5.4 Render as clickable badges with distinct styling (category-specific colors)

- [x] **Task 6: Frontend - Concept side panel** (AC: 2)
  - [x] 6.1 Create `apps/web/src/app/features/knowledge/` module structure
  - [x] 6.2 Create `concept-panel.component.ts` for side panel
  - [x] 6.3 Implement slide-in animation from right edge
  - [x] 6.4 Fetch and display concept details on citation click
  - [x] 6.5 Add "Learn More" link (placeholder until Epic 3 completes)

- [x] **Task 7: Frontend - Chat integration** (AC: 1,2,3,4)
  - [x] 7.1 Update `ChatMessageComponent` to use ConceptCitationComponent
  - [x] 7.2 Handle citation clicks to open side panel
  - [x] 7.3 Style citations per UX spec (distinct from regular links)

- [x] **Task 8: Shared types** (AC: all)
  - [x] 8.1 Add `Concept` interface (id, name, category, definition, extendedDescription)
  - [x] 8.2 Add `ConceptCitation` interface (messageId, conceptId, position, score)
  - [x] 8.3 Add `ConceptSummary` interface for side panel display
  - [x] 8.4 Update Message interface to include citations array

- [x] **Task 9: Backend tests** (AC: 1,2,3,4)
  - [x] 9.1 Updated knowledge.controller.spec.ts with CitationService mock
  - [x] 9.2 All 606 API tests pass
  - [x] 9.3 Test: Citations stored with messages correctly
  - [x] 9.4 Test: Maximum 5 citations enforced
  - [x] 9.5 Test: No citations when no relevant concepts

- [x] **Task 10: Frontend tests** (AC: 1,2,3)
  - [x] 10.1 All 259 web tests pass
  - [x] 10.2 Existing ChatMessageComponent tests still passing
  - [x] 10.3 Test: Citation click opens panel
  - [x] 10.4 Test: Panel displays concept details correctly

- [x] **Task 11: Build verification** (AC: all)
  - [x] 11.1 `nx build api` passes
  - [x] 11.2 `nx build web` passes
  - [x] 11.3 `nx test api` passes (636 tests)
  - [x] 11.4 `nx test web` passes (296 tests)
  - [x] 11.5 Update story file with completion notes

## Dev Notes

### Critical Warnings from Previous Stories

> **DO NOT create duplicate types** - Import ALL shared types from `@mentor-ai/shared/types`. Stories 1.x and 2.x had findings for duplicate types. [Source: 2-2, 2-3, 2-4, 2-5 code reviews]

> **Frontend tests use Vitest** - Use `vi.fn()`, NOT `jest.fn()`. Backend uses Jest. [Source: 2-2 dev notes]

> **Use ConfigService for env vars** - NEVER use `process.env` directly or hardcode values. [Source: project-context.md]

> **Signal naming**: ALL signals use `$` suffix: `isLoading$`, `concepts$` [Source: project-context.md]

> **Add JSDoc to public service methods** - All public methods need @param, @returns, @throws. [Source: 2-2 code review]

> **Use structured logging** - Use objects not string interpolation: `this.logger.log({ message: '...', conceptId, score })` [Source: project-context.md]

> **NO console.log statements** - Use NestJS Logger only. PR requirements forbid console.log. [Source: project-context.md]

> **Standalone components only** - NO NgModules, use `standalone: true` and `imports: []` [Source: project-context.md]

> **New Angular control flow** - Use `@if`, `@for`, `@switch` NOT `*ngIf`, `*ngFor` [Source: project-context.md]

> **API versioning** - Use `/api/v1/` prefix for all new endpoints [Source: 2-4 code review fix]

### Previous Story Intelligence (from 2.5)

**What Already Exists:**
- `AiGatewayService.streamCompletionWithContext(messages, options, onChunk)` - Full streaming with confidence
- `ConfidenceService.calculateConfidence(response, context)` - Multi-factor confidence scoring
- `ChatMessageComponent` displays AI messages with persona badge and confidence indicator
- Message model stores conversation messages with confidenceScore and confidenceFactors
- PersonaType and persona prompts working

**Learnings from 2.5 Implementation:**
- Prisma JSON fields require `Prisma.JsonNull` for null values, not `null`
- Angular signals use `signal()` function, not custom objects with `.set()` methods
- Always add new fields (like `confidenceScore`) to ALL Message object creations in frontend
- Test mock methods must match actual service method names exactly

**Files to Reference/Extend:**
- `apps/api/src/app/ai-gateway/ai-gateway.service.ts` - Add concept matching after response
- `apps/api/src/app/conversation/conversation.service.ts` - Store citations with messages
- `apps/api/prisma/schema.prisma` - Add Concept and ConceptCitation models
- `shared/types/src/lib/types.ts` - Add concept types
- `apps/web/src/app/features/chat/components/chat-message.component.ts` - Display citations

### Architecture Compliance

**From architecture.md (Knowledge Base):**
- 600 proprietary business concepts in vector DB with graph relationships
- Qdrant for vector database with BGE-M3 embeddings
- Concept Graph Pattern: Hierarchical embeddings with hybrid retrieval (vector + BM25)
- Concept prefix: `cpt_` for all concept entity IDs
- Citation prefix: `cit_` for all citation entity IDs

**From UX Specification:**
- `[[concept]]` links open knowledge graph exploration with focus node
- Source deep-linking navigates to specific concept page
- Citations appear inline with response text
- Distinct visual style for concept links (not regular hyperlinks)
- Side panel for quick concept preview

### Technical Implementation Details

**Prisma Schema Additions:**
```prisma
// Platform DB - Shared concepts (read-only for tenants)
model Concept {
  id                String   @id @map("id") // Must have cpt_ prefix
  name              String   @unique
  category          String   // Finance, Marketing, Technology, Operations, Legal, Creative
  definition        String   @db.Text // 2-3 sentences
  extendedDescription String? @db.Text
  relatedConceptIds String[] @map("related_concept_ids")
  departmentTags    String[] @map("department_tags")
  embeddingVector   String?  @map("embedding_vector") // Qdrant ID reference
  createdAt         DateTime @default(now()) @map("created_at")
  updatedAt         DateTime @updatedAt @map("updated_at")

  citations ConceptCitation[]

  @@map("concepts")
}

model ConceptCitation {
  id            String   @id @map("id") // Must have cit_ prefix
  messageId     String   @map("message_id")
  conceptId     String   @map("concept_id")
  position      Int      // Character position in message where cited
  score         Float    // Semantic similarity score (0.0-1.0)
  createdAt     DateTime @default(now()) @map("created_at")

  concept Concept @relation(fields: [conceptId], references: [id])

  @@index([messageId])
  @@index([conceptId])
  @@map("concept_citations")
}
```

**Shared Types:**
```typescript
// In shared/types
export interface Concept {
  id: string;           // cpt_ prefix
  name: string;
  category: string;     // Finance, Marketing, etc.
  definition: string;   // 2-3 sentences
  extendedDescription?: string;
  relatedConceptIds: string[];
  departmentTags: string[];
}

export interface ConceptCitation {
  id: string;           // cit_ prefix
  messageId: string;
  conceptId: string;
  conceptName: string;  // Denormalized for display
  position: number;     // Character position in message
  score: number;        // Semantic similarity (0.0-1.0)
}

export interface ConceptSummary {
  id: string;
  name: string;
  category: string;
  definition: string;
  relatedConcepts: Array<{ id: string; name: string }>;
}
```

**Concept Matching Algorithm:**
```typescript
class ConceptMatchingService {
  private readonly SIMILARITY_THRESHOLD = 0.7;
  private readonly MAX_CITATIONS = 5;

  async findRelevantConcepts(
    response: string,
    personaType?: PersonaType
  ): Promise<ConceptMatch[]> {
    // 1. Generate embedding for response text
    const responseEmbedding = await this.embeddingService.embed(response);

    // 2. Query Qdrant for similar concepts
    const matches = await this.qdrantClient.search('concepts', {
      vector: responseEmbedding,
      limit: this.MAX_CITATIONS * 2, // Get more, filter later
      filter: personaType ? { department: personaType } : undefined,
    });

    // 3. Filter by threshold and limit
    return matches
      .filter(m => m.score >= this.SIMILARITY_THRESHOLD)
      .slice(0, this.MAX_CITATIONS)
      .map(m => ({
        conceptId: m.id,
        conceptName: m.payload.name,
        score: m.score,
      }));
  }
}
```

**Citation Injection Pattern:**
```typescript
class CitationInjectorService {
  injectCitations(
    response: string,
    concepts: ConceptMatch[]
  ): { content: string; citations: ConceptCitation[] } {
    let content = response;
    const citations: ConceptCitation[] = [];

    // Sort by relevance (highest first)
    const sorted = [...concepts].sort((a, b) => b.score - a.score);

    for (const concept of sorted) {
      // Find natural insertion point (end of sentence mentioning related terms)
      const position = this.findInsertionPoint(content, concept.conceptName);
      if (position !== -1) {
        const citation = `[[${concept.conceptName}]]`;
        content = content.slice(0, position) + ' ' + citation + content.slice(position);
        citations.push({
          id: this.generateId('cit_'),
          messageId: '', // Set by caller
          conceptId: concept.conceptId,
          conceptName: concept.conceptName,
          position,
          score: concept.score,
        });
      }
    }

    return { content, citations };
  }
}
```

### File Structure

```
apps/api/src/app/knowledge/
├── knowledge.module.ts
├── knowledge.controller.ts
├── services/
│   ├── concept.service.ts
│   ├── concept.service.spec.ts
│   ├── concept-matching.service.ts
│   ├── concept-matching.service.spec.ts
│   ├── citation-injector.service.ts
│   └── citation-injector.service.spec.ts

apps/web/src/app/features/chat/components/
├── concept-citation/
│   ├── concept-citation.component.ts
│   └── concept-citation.component.spec.ts

apps/web/src/app/features/knowledge/
├── concept-panel/
│   ├── concept-panel.component.ts
│   └── concept-panel.component.spec.ts
```

### API Endpoints

**GET /api/v1/knowledge/concepts/:id**
```typescript
{
  "data": {
    "id": "cpt_abc123",
    "name": "Value-Based Pricing",
    "category": "Finance",
    "definition": "A pricing strategy that sets prices based on customer perceived value rather than production costs.",
    "relatedConcepts": [
      { "id": "cpt_def456", "name": "Price Elasticity" },
      { "id": "cpt_ghi789", "name": "Cost-Plus Pricing" }
    ]
  }
}
```

**GET /api/v1/messages/:id/citations**
```typescript
{
  "data": [
    {
      "id": "cit_xyz123",
      "conceptId": "cpt_abc123",
      "conceptName": "Value-Based Pricing",
      "score": 0.87,
      "position": 234
    }
  ]
}
```

### Testing Standards

**Backend (Jest) - 80% coverage target:**

| Test File | Coverage Target |
|-----------|-----------------|
| concept.service.spec.ts | 80% |
| concept-matching.service.spec.ts | 80% |
| citation-injector.service.spec.ts | 80% |

**Frontend (Vitest) - 70% coverage target:**

| Test File | Coverage Target |
|-----------|-----------------|
| concept-citation.component.spec.ts | 70% |
| concept-panel.component.spec.ts | 70% |

**Key Test Scenarios:**
- Citations correctly parsed from `[[Concept Name]]` format
- Side panel opens on citation click
- Maximum 5 citations per response enforced
- No citations shown when no relevant concepts
- Citations stored in database with message
- Semantic search returns concepts above threshold only

### Dependencies

**Story Dependencies:**
- Story 2-1 (Basic Text Conversation) - DONE - Provides Conversation/Message models
- Story 2-2 (AI Gateway Service) - DONE - Provides streaming completion infrastructure
- Story 2-4 (Department Persona) - DONE - Provides persona context for concept filtering
- Story 2-5 (Confidence Scores) - DONE - Pattern for extending CompletionResult
- **Story 3-1 (Business Concepts Data Model) - REQUIRED - Provides Concept entities and embeddings**

**External Dependencies:**
- Qdrant vector database connection
- Embedding generation (via OpenRouter or local model)

### Existing Patterns to Reuse

| Pattern | Source | Reuse in 2-6 |
|---------|--------|--------------|
| Standalone component | `confidence-indicator.component.ts` | Concept citation component |
| Signal state management | `chat.component.ts` | Concept panel state |
| Service pattern | `confidence.service.ts` | Concept matching service |
| Tooltip/hover component | `confidence-indicator.component.ts` | Citation preview |
| Side panel pattern | Spartan UI sheet | Concept detail panel |

### UX Considerations

**Citation Display UX:**
1. `[[Concept Name]]` rendered as inline badge/chip
2. Distinct styling: subtle background (#1A1A1A), border-radius, slightly smaller font
3. Hover shows brief definition tooltip
4. Click opens side panel with full details

**Side Panel UX:**
1. Slides in from right edge (280px width)
2. Shows concept name, category badge, definition
3. "Learn More" button (links to future knowledge graph page)
4. Related concepts as clickable chips
5. Close button in header + click outside to close

**Accessibility:**
- `role="button"` and `aria-label` on citation badges
- Side panel with `role="dialog"` and focus trap
- Keyboard navigation for citations
- Screen reader announces: "Concept: Value-Based Pricing. Click to learn more."

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-2.6]
- [Source: _bmad-output/planning-artifacts/architecture.md#Knowledge-Base]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Citations]
- [Source: _bmad-output/planning-artifacts/project-context.md]
- [Source: _bmad-output/implementation-artifacts/2-5-confidence-scores-on-ai-outputs.md]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- Fixed TypeScript errors in `citation-injector.service.ts` (lines 211, 249) - string indexing and regex match groups
- Fixed TypeScript errors in `concept-citation.component.ts` - regex match group undefined check
- Updated `knowledge.controller.spec.ts` to include CitationService mock

### Code Review Fixes (Adversarial Review)

**Issues Fixed:**

1. **CRITICAL: Missing backend service tests** - Created comprehensive test files:
   - `citation-injector.service.spec.ts` - Tests for inject, parse, strip citation methods
   - `concept-matching.service.spec.ts` - Tests for semantic/keyword matching, filtering, limits
   - `citation.service.spec.ts` - Tests for store, get, delete citation operations

2. **CRITICAL: Missing frontend component tests** - Created test files:
   - `concept-citation.component.spec.ts` - Tests for rendering, parsing, interactions, accessibility
   - `concept-panel.component.spec.ts` - Tests for rendering, category styling, API integration, interactions, accessibility

3. **HIGH: console.warn in chat.component.ts:330** - Removed console.warn, replaced with silent return when citation data unavailable

4. **HIGH: Deprecated .toPromise() in concept-panel.component.ts** - Replaced with `firstValueFrom()` from rxjs

5. **MEDIUM: Silent error swallowing** - Added error message details to catch block: `Failed to load concept details: ${errorMessage}`

6. **TypeScript strict null checks** - Added optional chaining (`?.`) to array element access in test assertions

### Completion Notes List

1. **Concept model already existed from Story 3.1** - Reused existing Concept and ConceptRelationship models
2. **Added ConceptCitation model** to Prisma schema with proper relations and indexes
3. **Created comprehensive backend services:**
   - `ConceptMatchingService` - Semantic search with keyword fallback when Qdrant unavailable
   - `CitationInjectorService` - Injects `[[Concept Name]]` markers at natural insertion points
   - `CitationService` - Stores and retrieves citations from database
   - `EmbeddingService` - Stub implementation for future Qdrant integration
4. **Created frontend components:**
   - `ConceptCitationComponent` - Parses and renders inline citations as clickable badges with category-specific colors
   - `ConceptPanelComponent` - Slide-in side panel showing concept details and related concepts
5. **Integrated with ChatMessageComponent** - Citations display inline in AI responses, clicking opens side panel
6. **All builds pass** - nx build api, nx build web
7. **All tests pass** - 636 API tests (30 new), 296 web tests (37 new)

### File List

**New Files Created:**
- `apps/api/src/app/knowledge/services/concept-matching.service.ts`
- `apps/api/src/app/knowledge/services/concept-matching.service.spec.ts`
- `apps/api/src/app/knowledge/services/citation-injector.service.ts`
- `apps/api/src/app/knowledge/services/citation-injector.service.spec.ts`
- `apps/api/src/app/knowledge/services/citation.service.ts`
- `apps/api/src/app/knowledge/services/citation.service.spec.ts`
- `apps/api/src/app/knowledge/services/embedding.service.ts`
- `apps/web/src/app/features/chat/components/concept-citation/concept-citation.component.ts`
- `apps/web/src/app/features/chat/components/concept-citation/concept-citation.component.spec.ts`
- `apps/web/src/app/features/knowledge/concept-panel/concept-panel.component.ts`
- `apps/web/src/app/features/knowledge/concept-panel/concept-panel.component.spec.ts`

**Modified Files:**
- `apps/api/prisma/schema.prisma` - Added ConceptCitation model
- `apps/api/src/app/knowledge/knowledge.module.ts` - Added new providers and exports
- `apps/api/src/app/knowledge/knowledge.controller.ts` - Added citation API endpoints
- `apps/api/src/app/knowledge/knowledge.controller.spec.ts` - Added CitationService mock
- `apps/web/src/app/features/chat/components/chat-message.component.ts` - Integrated ConceptCitationComponent
- `apps/web/src/app/features/chat/chat.component.ts` - Added ConceptPanelComponent and citationClick handling
- `shared/types/src/lib/types.ts` - Added citation types (ConceptCitation, ConceptMatch, CitationInjectionResult, ConceptCitationSummary)
