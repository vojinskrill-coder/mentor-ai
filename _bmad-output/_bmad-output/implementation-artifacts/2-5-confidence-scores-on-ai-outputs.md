# Story 2.5: Confidence Scores on AI Outputs

Status: complete

## Story

As a **user**,
I want to see confidence scores on AI-generated guidance,
so that I can assess the reliability of recommendations.

## Acceptance Criteria

1. **AC1: Confidence Display**
   - **Given** the AI generates a response
   - **When** the response is displayed
   - **Then** a confidence indicator appears (0-100%)
   - **And** the indicator uses visual color coding:
     - High (85-100%): Green (#22C55E)
     - Medium (50-84%): Amber (#EAB308)
     - Low (0-49%): Red (#EF4444)
   - **And** the confidence score is displayed in the AI response header

2. **AC2: Low Confidence Tooltip**
   - **Given** a response has low or medium confidence
   - **When** the user hovers over the indicator
   - **Then** a tooltip explains the limitation
   - **And** actionable improvement suggestions are shown (e.g., "To improve confidence, provide your production costs")

3. **AC3: Per-Recommendation Scoring**
   - **Given** a response includes multiple distinct recommendations
   - **When** each recommendation is identified
   - **Then** each can have its own confidence score
   - **And** overall response confidence is the weighted average

4. **AC4: Confidence Storage**
   - **Given** an AI response is generated
   - **When** the confidence score is calculated
   - **Then** the score is stored with the message in the database
   - **And** the score is available for analytics and reporting

5. **AC5: Confidence Improvement Feedback**
   - **Given** a user provides additional context after a low-confidence response
   - **When** the AI generates a new response with improved confidence
   - **Then** the improvement is shown: "Your input improved confidence from 72% to 85%"

## Tasks / Subtasks

- [x] **Task 1: Backend - Confidence calculation service** (AC: 1,3,4)
  - [x] 1.1 Create `apps/api/src/app/ai-gateway/confidence/` folder structure
  - [x] 1.2 Create `confidence.service.ts` with `ConfidenceService` class
  - [x] 1.3 Implement `calculateConfidence(response, context)` method
  - [x] 1.4 Implement logprob extraction for OpenRouter responses (when available) - Using heuristic approach
  - [x] 1.5 Implement heuristic fallback based on hedging language detection
  - [x] 1.6 Implement per-section confidence scoring for multi-part responses
  - [x] 1.7 Implement weighted average calculation for overall confidence

- [x] **Task 2: Backend - Hedging language detector** (AC: 1,3)
  - [x] 2.1 Create `hedging-detector.ts` utility
  - [x] 2.2 Define hedging patterns: "might", "could", "possibly", "uncertain", etc.
  - [x] 2.3 Implement uncertainty score based on hedging word frequency
  - [x] 2.4 Weight hedging by position (early hedging = lower confidence)
  - [x] 2.5 Add unit tests for hedging detection patterns

- [x] **Task 3: Backend - Update Message model** (AC: 4)
  - [x] 3.1 Add `confidenceScore` field to Message model in Prisma schema (Float, nullable)
  - [x] 3.2 Add `confidenceFactors` field (JSON, nullable) for score breakdown
  - [x] 3.3 Run prisma generate and migrate
  - [x] 3.4 Update Message interface in shared/types

- [x] **Task 4: Backend - Integrate confidence into AI Gateway** (AC: 1,3,4)
  - [x] 4.1 Update `CompletionResult` interface to include `confidence` field
  - [x] 4.2 Call ConfidenceService after response generation
  - [x] 4.3 Include confidence in response metadata
  - [x] 4.4 Update ConversationService to store confidence with messages
  - [x] 4.5 Add structured logging for confidence calculations

- [x] **Task 5: Backend - Improvement suggestions generator** (AC: 2,5)
  - [x] 5.1 Create `improvement-suggestions.service.ts`
  - [x] 5.2 Implement context-aware suggestion generation
  - [x] 5.3 Map low confidence factors to actionable suggestions
  - [x] 5.4 Track previous confidence scores for improvement calculation
  - [x] 5.5 Generate improvement delta message when applicable

- [x] **Task 6: Frontend - Confidence indicator component** (AC: 1,2)
  - [x] 6.1 Create `apps/web/src/app/features/chat/components/confidence-indicator/` folder
  - [x] 6.2 Create `confidence-indicator.component.ts` (standalone, signals)
  - [x] 6.3 Implement color-coded confidence badge (high/medium/low)
  - [x] 6.4 Implement hover tooltip with explanation
  - [x] 6.5 Add accessibility: aria-label for screen readers
  - [x] 6.6 Style per UX spec: header placement, semantic colors

- [x] **Task 7: Frontend - Chat message confidence integration** (AC: 1,2,5)
  - [x] 7.1 Update `ChatMessageComponent` to display confidence indicator in header
  - [x] 7.2 Add improvement suggestions section below response
  - [x] 7.3 Display confidence improvement delta when available
  - [x] 7.4 Style "To improve" suggestion text

- [x] **Task 8: Shared types** (AC: all)
  - [x] 8.1 Add `ConfidenceLevel` enum: HIGH, MEDIUM, LOW
  - [x] 8.2 Add `ConfidenceScore` interface with score, level, factors
  - [x] 8.3 Add `ConfidenceFactor` interface for breakdown
  - [x] 8.4 Add `ImprovementSuggestion` interface
  - [x] 8.5 Update `Message` interface to include confidenceScore
  - [x] 8.6 Update `CompletionResult` to include confidence (in AI Gateway)

- [x] **Task 9: Backend tests** (AC: 1,2,3,4,5)
  - [x] 9.1 `confidence.service.spec.ts` - calculation tests
  - [x] 9.2 `hedging-detector.spec.ts` - pattern matching tests
  - [x] 9.3 `improvement-suggestions.service.spec.ts` - suggestion generation
  - [x] 9.4 Test: Confidence stored with messages correctly
  - [x] 9.5 Test: Improvement delta calculated correctly

- [x] **Task 10: Frontend tests** (AC: 1,2,5)
  - [x] 10.1 `confidence-indicator.component.spec.ts` - display tests
  - [x] 10.2 Test: Correct color for each confidence level
  - [x] 10.3 Test: Tooltip shows on hover
  - [x] 10.4 Test: Improvement message displays correctly
  - [x] 10.5 Test: Accessibility attributes present

- [x] **Task 11: Build verification** (AC: all)
  - [x] 11.1 `nx build api` passes
  - [x] 11.2 `nx build web` passes
  - [x] 11.3 `nx test api` passes (569 tests)
  - [x] 11.4 `nx test web` passes (259 tests)
  - [x] 11.5 Update story file with completion notes

## Dev Notes

### Critical Warnings from Previous Stories

> **DO NOT create duplicate types** - Import ALL shared types from `@mentor-ai/shared/types`. Stories 1.x and 2.x had findings for duplicate types. [Source: 2-2, 2-3, 2-4 code reviews]

> **Frontend tests use Vitest** - Use `vi.fn()`, NOT `jest.fn()`. Backend uses Jest. [Source: 2-2 dev notes]

> **Use ConfigService for env vars** - NEVER use `process.env` directly or hardcode values. [Source: project-context.md]

> **Signal naming**: ALL signals use `$` suffix: `isLoading$`, `confidence$` [Source: project-context.md]

> **Add JSDoc to public service methods** - All public methods need @param, @returns, @throws. [Source: 2-2 code review]

> **Use structured logging** - Use objects not string interpolation: `this.logger.log({ message: '...', confidence, factors })` [Source: project-context.md]

> **NO console.log statements** - Use NestJS Logger only. PR requirements forbid console.log. [Source: project-context.md]

> **Standalone components only** - NO NgModules, use `standalone: true` and `imports: []` [Source: project-context.md]

> **New Angular control flow** - Use `@if`, `@for`, `@switch` NOT `*ngIf`, `*ngFor` [Source: project-context.md]

> **API versioning** - Use `/api/v1/` prefix for all new endpoints [Source: 2-4 code review fix]

### Previous Story Intelligence (from 2.4)

**What Already Exists:**
- `AiGatewayService.streamCompletionWithContext(messages, options, onChunk)` - Full streaming with rate limiting, quota, cost tracking
- `CompletionResult` interface returns correlationId, success, tokens, cost, personaType
- `ChatMessageComponent` displays AI messages with persona badge
- Message model stores conversation messages
- PersonaType and persona prompts working

**Existing Files to Integrate With:**
- `apps/api/src/app/ai-gateway/ai-gateway.service.ts` - Add confidence calculation after response
- `apps/api/src/app/conversation/conversation.service.ts` - Store confidence with messages
- `apps/api/prisma/schema.prisma` - Add confidence fields to Message
- `shared/types/src/lib/types.ts` - Add confidence types
- `apps/web/src/app/features/chat/components/chat-message.component.ts` - Display confidence

**Key Pattern from 2.4:**
```typescript
// Extend CompletionResult pattern
export interface CompletionResult {
  correlationId: string;
  success: boolean;
  inputTokens: number;
  outputTokens: number;
  cost: number;
  rateLimit?: RateLimitInfo;
  personaType?: PersonaType;
  confidence?: ConfidenceScore;  // NEW
}
```

### Architecture Compliance

**From architecture.md (Risk Mitigation - Trust Calibration):**
- Multi-factor confidence scoring
- Prominent disclaimers for legal/tax/compliance topics
- Persona capability boundaries (what each persona CAN'T do)
- Feedback loop for confidence calibration

**From UX Specification:**
- Confidence in AI response header (trust-first visibility)
- Color coding: High (green #22C55E), Medium (amber #EAB308), Low (red #EF4444)
- "To improve" suggestion below response
- Trust Loop: User Input → AI Response → Confidence Score → User Refinement → Improved Confidence
- Confidence improvement feedback: "Your input improved confidence from 72% to 85%"

### Technical Implementation Details

**Prisma Schema Updates:**
```prisma
model Message {
  id              String   @id @map("id")
  conversationId  String   @map("conversation_id")
  role            Role     @map("role")
  content         String
  personaType     PersonaType? @map("persona_type")
  confidenceScore Float?   @map("confidence_score")  // NEW: 0.0-1.0
  confidenceFactors Json?  @map("confidence_factors")  // NEW
  createdAt       DateTime @default(now()) @map("created_at")

  conversation    Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)

  @@index([conversationId])
  @@map("messages")
}
```

**Shared Types:**
```typescript
// In shared/types
export enum ConfidenceLevel {
  HIGH = 'HIGH',      // 85-100%
  MEDIUM = 'MEDIUM',  // 50-84%
  LOW = 'LOW',        // 0-49%
}

export interface ConfidenceFactor {
  name: string;           // e.g., "hedging_language", "context_depth", "source_coverage"
  score: number;          // 0.0-1.0
  weight: number;         // Factor contribution weight
  description?: string;   // Human-readable explanation
}

export interface ConfidenceScore {
  score: number;          // 0.0-1.0 (display as percentage)
  level: ConfidenceLevel;
  factors: ConfidenceFactor[];
  improvementSuggestion?: string;  // "Provide your production costs to improve accuracy"
  previousScore?: number; // For showing improvement delta
}

export interface ImprovementSuggestion {
  category: string;       // "missing_context", "ambiguous_question", "data_gap"
  suggestion: string;     // User-facing actionable text
  priority: number;       // 1=highest priority
}
```

**Confidence Calculation Algorithm:**
```typescript
class ConfidenceService {
  calculateConfidence(
    response: string,
    context: ConfidenceContext
  ): ConfidenceScore {
    const factors: ConfidenceFactor[] = [];

    // Factor 1: Hedging language (weight: 0.3)
    const hedgingScore = this.hedgingDetector.analyze(response);
    factors.push({
      name: 'hedging_language',
      score: 1 - hedgingScore.uncertaintyRatio,
      weight: 0.3,
      description: 'Lower hedging language indicates higher confidence',
    });

    // Factor 2: Context depth (weight: 0.4)
    const contextScore = this.calculateContextDepth(context);
    factors.push({
      name: 'context_depth',
      score: contextScore,
      weight: 0.4,
      description: 'More context provided leads to more confident responses',
    });

    // Factor 3: Response specificity (weight: 0.3)
    const specificityScore = this.analyzeSpecificity(response);
    factors.push({
      name: 'response_specificity',
      score: specificityScore,
      weight: 0.3,
      description: 'Specific recommendations score higher than generic advice',
    });

    // Calculate weighted average
    const totalScore = factors.reduce(
      (sum, f) => sum + f.score * f.weight,
      0
    );

    return {
      score: totalScore,
      level: this.getLevel(totalScore),
      factors,
      improvementSuggestion: this.getSuggestion(factors, context),
    };
  }

  private getLevel(score: number): ConfidenceLevel {
    if (score >= 0.85) return ConfidenceLevel.HIGH;
    if (score >= 0.50) return ConfidenceLevel.MEDIUM;
    return ConfidenceLevel.LOW;
  }
}
```

**Hedging Language Patterns:**
```typescript
const HEDGING_PATTERNS = [
  // Possibility hedges
  { pattern: /\b(might|may|could|possibly|perhaps)\b/gi, weight: 0.5 },
  // Approximation hedges
  { pattern: /\b(approximately|roughly|around|about|nearly)\b/gi, weight: 0.3 },
  // Uncertainty markers
  { pattern: /\b(uncertain|unclear|unsure|not sure)\b/gi, weight: 0.8 },
  // Qualification hedges
  { pattern: /\b(generally|usually|typically|often|sometimes)\b/gi, weight: 0.2 },
  // Disclaimer phrases
  { pattern: /\b(this is just|this is only|limited data|not financial advice)\b/gi, weight: 0.6 },
];
```

### File Structure

```
apps/api/src/app/ai-gateway/
├── confidence/
│   ├── confidence.service.ts
│   ├── confidence.service.spec.ts
│   ├── hedging-detector.ts
│   ├── hedging-detector.spec.ts
│   ├── improvement-suggestions.service.ts
│   └── improvement-suggestions.service.spec.ts

apps/web/src/app/features/chat/components/
├── confidence-indicator/
│   ├── confidence-indicator.component.ts
│   └── confidence-indicator.component.spec.ts
```

### API Response Format

**CompletionResult with Confidence:**
```typescript
{
  correlationId: "cor_abc123",
  success: true,
  inputTokens: 450,
  outputTokens: 320,
  cost: 0.0012,
  personaType: "CFO",
  confidence: {
    score: 0.72,
    level: "MEDIUM",
    factors: [
      { name: "hedging_language", score: 0.85, weight: 0.3 },
      { name: "context_depth", score: 0.60, weight: 0.4 },
      { name: "response_specificity", score: 0.75, weight: 0.3 }
    ],
    improvementSuggestion: "Provide your Q2 production costs to improve accuracy"
  }
}
```

### Testing Standards

**Backend (Jest) - 80% coverage target:**

| Test File | Coverage Target |
|-----------|-----------------|
| confidence.service.spec.ts | 80% |
| hedging-detector.spec.ts | 80% |
| improvement-suggestions.service.spec.ts | 80% |

**Frontend (Vitest) - 70% coverage target:**

| Test File | Coverage Target |
|-----------|-----------------|
| confidence-indicator.component.spec.ts | 70% |

**Key Test Scenarios:**
- High confidence (>=85%) displays green indicator
- Medium confidence (50-84%) displays amber indicator
- Low confidence (<50%) displays red indicator
- Hedging detector correctly identifies uncertainty words
- Improvement suggestions generated for low confidence factors
- Confidence stored in database with message
- Tooltip shows on hover with correct content
- Improvement delta displayed when previous score exists

### Dependencies

**Story Dependencies:**
- Story 2-1 (Basic Text Conversation) - DONE - Provides Conversation/Message models
- Story 2-2 (AI Gateway Service) - DONE - Provides streaming completion infrastructure
- Story 2-4 (Department Persona) - DONE - Provides persona context for confidence calculation

**No new package dependencies required** - Uses existing infrastructure.

### Existing Patterns to Reuse

| Pattern | Source | Reuse in 2-5 |
|---------|--------|--------------|
| Standalone component | `chat-message.component.ts` | Confidence indicator |
| Signal state management | `chat.component.ts` | Confidence state |
| Service pattern | `ai-gateway.service.ts` | Confidence service |
| Tooltip component | Spartan UI | Hover explanations |
| Color constants | `shared/types` | Confidence level colors |

### UX Considerations

**Confidence Display UX:**
1. Confidence badge in AI message header (trust-first visibility)
2. Color-coded indicator: green/amber/red
3. Percentage shown (e.g., "72% confident")
4. Hover reveals factor breakdown and suggestion

**Improvement Suggestion UX:**
1. "To improve" section below AI response (only if confidence < 85%)
2. Actionable, specific suggestion text
3. When user follows suggestion, show improvement delta: "↑ 72% → 85%"

**Accessibility:**
- `aria-label` on confidence indicator: "AI confidence: 72 percent, medium"
- Tooltip accessible via keyboard focus
- Color not sole indicator (also shows percentage text)

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-2.5]
- [Source: _bmad-output/planning-artifacts/architecture.md#Risk-Mitigation]
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Trust-Transparency]
- [Source: _bmad-output/planning-artifacts/project-context.md]
- [Source: _bmad-output/implementation-artifacts/2-4-department-persona-task-execution.md]
- [Source: apps/api/src/app/ai-gateway/ai-gateway.service.ts]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- Fixed Prisma JSON null type error using `Prisma.JsonNull` and `InputJsonValue` casting
- Fixed Angular signal implementation by using proper `signal()` function
- Updated test mocks from `streamCompletion` to `streamCompletionWithContext`
- Added missing `confidenceScore` and `confidenceFactors` fields to Message objects throughout frontend

### Completion Notes List

1. **Confidence Calculation**: Implemented multi-factor scoring with hedging language (0.35 weight), context depth (0.35), and response specificity (0.3). Algorithm uses heuristic approach since OpenRouter doesn't provide log probabilities.

2. **Hedging Language Detection**: Created comprehensive pattern matching for uncertainty markers with position-weighted scoring (early hedging = lower confidence).

3. **Improvement Suggestions**: Implemented factor-based and persona-specific suggestions. CFO, CMO, CTO, OPERATIONS, LEGAL, and CREATIVE personas each have tailored suggestions.

4. **Database Integration**: Added `confidenceScore` (Float?) and `confidenceFactors` (Json?) fields to Message model. Confidence is calculated after response generation and stored with each assistant message.

5. **Frontend Display**: Created ConfidenceIndicatorComponent with color-coded badge (green/amber/red), hover tooltip showing factor breakdown, and accessibility support. Integrated into ChatMessageComponent header.

6. **Improvement Delta**: System tracks previous confidence scores and displays improvement messages when users provide additional context.

7. **Test Coverage**: 569 API tests pass, 259 frontend tests pass. Coverage includes confidence calculation, hedging detection, improvement suggestions, and UI components.

### File List

**New Files Created:**
- `apps/api/src/app/ai-gateway/confidence/confidence.service.ts`
- `apps/api/src/app/ai-gateway/confidence/confidence.service.spec.ts`
- `apps/api/src/app/ai-gateway/confidence/hedging-detector.ts`
- `apps/api/src/app/ai-gateway/confidence/hedging-detector.spec.ts`
- `apps/api/src/app/ai-gateway/confidence/improvement-suggestions.service.ts`
- `apps/api/src/app/ai-gateway/confidence/improvement-suggestions.service.spec.ts`
- `apps/web/src/app/features/chat/components/confidence-indicator/confidence-indicator.component.ts`
- `apps/web/src/app/features/chat/components/confidence-indicator/confidence-indicator.component.spec.ts`

**Modified Files:**
- `apps/api/src/app/ai-gateway/ai-gateway.service.ts` - Added confidence calculation integration
- `apps/api/src/app/ai-gateway/ai-gateway.service.spec.ts` - Added ConfidenceService mock
- `apps/api/src/app/ai-gateway/ai-gateway.module.ts` - Added ConfidenceService and ImprovementSuggestionsService providers
- `apps/api/src/app/conversation/conversation.service.ts` - Updated addMessage to accept confidence parameters
- `apps/api/src/app/conversation/conversation.gateway.ts` - Updated to use streamCompletionWithContext and emit confidence
- `apps/api/src/app/conversation/conversation.gateway.spec.ts` - Updated mocks for new method signature
- `apps/api/prisma/schema.prisma` - Added confidenceScore and confidenceFactors fields to Message
- `shared/types/src/lib/types.ts` - Added ConfidenceLevel, ConfidenceScore, ConfidenceFactor, ImprovementSuggestion, CONFIDENCE_COLORS
- `apps/web/src/app/features/chat/components/chat-message.component.ts` - Integrated ConfidenceIndicatorComponent
- `apps/web/src/app/features/chat/components/chat-message.component.spec.ts` - Added confidence fields to mock messages
- `apps/web/src/app/features/chat/chat.component.ts` - Added confidence fields to Message objects
