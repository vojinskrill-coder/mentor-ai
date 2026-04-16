# Story 2.2: AI Gateway Service with Streaming

Status: done

## Story

As a **system**,
I want a centralized AI Gateway service handling all LLM requests,
So that I can manage rate limiting, cost tracking, and provider failover.

## Acceptance Criteria

1. **AC1: Request Validation and Routing**
   - **Given** a conversation request is initiated
   - **When** the AI Gateway receives the request
   - **Then** it validates the request against rate limits
   - **And** routes to the configured LLM provider
   - **And** tracks token consumption per user/tenant
   - **And** returns a streaming response via WebSocket

2. **AC2: Provider Failover**
   - **Given** the primary LLM provider fails
   - **When** the request times out (> 30 seconds) or returns error
   - **Then** the Gateway automatically retries with fallback provider
   - **And** the failover is logged for monitoring
   - **And** the user experience is uninterrupted

3. **AC3: Token Quota Enforcement**
   - **Given** a tenant exceeds their token quota
   - **When** they attempt a new conversation
   - **Then** a clear error message is returned: "Token limit reached"
   - **And** the request is not sent to the LLM provider
   - **And** upgrade options are presented

4. **AC4: Request Queue with Priority**
   - **Given** multiple concurrent requests from a tenant
   - **When** rate limits are approached
   - **Then** requests are queued with priority (Owner > Team Member)
   - **And** queue position is communicated to the user
   - **And** requests timeout after 2 minutes in queue

5. **AC5: Performance Under Load**
   - **Given** the system is under load
   - **When** 100 concurrent users send requests
   - **Then** P95 response time remains < 2 seconds
   - **And** no requests are dropped (queued if necessary)
   - **And** circuit breaker activates only after 5 consecutive failures

## Tasks / Subtasks

- [x] **Task 1: Add Upstash Redis integration** (AC: 1,3,4)
  - [x] 1.1 Install `@upstash/redis` and `@upstash/ratelimit` packages
  - [x] 1.2 Add UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN to environment
  - [x] 1.3 Create `apps/api/src/app/ai-gateway/redis.service.ts` for Redis client wrapper
  - [x] 1.4 Add RedisService to AiGatewayModule providers

- [x] **Task 2: Implement rate limiting** (AC: 1,4)
  - [x] 2.1 Create `apps/api/src/app/ai-gateway/rate-limiter.service.ts`
  - [x] 2.2 Implement per-tenant rate limits (configurable, default 60 req/min)
  - [x] 2.3 Implement per-user rate limits within tenant (configurable, default 20 req/min)
  - [x] 2.4 Add rate limit headers to responses: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`
  - [x] 2.5 Return RFC 7807 error when rate limit exceeded

- [x] **Task 3: Implement token tracking** (AC: 1,3)
  - [x] 3.1 Create `TokenUsage` model in Prisma schema (id: `tku_`, tenantId, userId, tokens, cost, createdAt)
  - [x] 3.2 Create `apps/api/src/app/ai-gateway/token-tracker.service.ts`
  - [x] 3.3 Implement `trackUsage(tenantId, userId, inputTokens, outputTokens, cost)` method
  - [x] 3.4 Implement `getUsage(tenantId, period)` for tenant usage queries
  - [x] 3.5 Implement `getUserUsage(tenantId, userId, period)` for user usage queries
  - [x] 3.6 Store token counts per request in TokenUsage table

- [x] **Task 4: Implement token quota enforcement** (AC: 3)
  - [x] 4.1 Add `tokenQuota` field to Tenant model (default: 1,000,000 tokens/month)
  - [x] 4.2 Create `apps/api/src/app/ai-gateway/quota.service.ts`
  - [x] 4.3 Implement `checkQuota(tenantId)` returns { allowed: boolean, remaining: number }
  - [x] 4.4 Add pre-request quota check in AiGatewayService
  - [x] 4.5 Return RFC 7807 `quota_exceeded` error with upgrade_url field

- [x] **Task 5: Implement request queue** (AC: 4)
  - [x] 5.1 Create `apps/api/src/app/ai-gateway/request-queue.service.ts`
  - [x] 5.2 Implement Redis-based priority queue (Owner=3, Admin=2, Member=1)
  - [x] 5.3 Implement queue position tracking with WebSocket events
  - [x] 5.4 Add 2-minute queue timeout with graceful error
  - [x] 5.5 Add `chat:queue-position` WebSocket event type to shared/types

- [x] **Task 6: Implement circuit breaker** (AC: 2,5)
  - [x] 6.1 Create `apps/api/src/app/ai-gateway/circuit-breaker.service.ts`
  - [x] 6.2 Implement circuit breaker states: CLOSED → OPEN → HALF_OPEN
  - [x] 6.3 Open circuit after 5 consecutive failures
  - [x] 6.4 Half-open after 30 seconds, allow 1 test request
  - [x] 6.5 Log all state transitions with correlation ID
  - [x] 6.6 Emit `system:circuit-breaker` event for monitoring

- [x] **Task 7: Implement cost metering** (AC: 1)
  - [x] 7.1 Create `apps/api/src/app/ai-gateway/cost-calculator.service.ts`
  - [x] 7.2 Add provider pricing config (OpenRouter model pricing)
  - [x] 7.3 Calculate cost per request based on input/output tokens
  - [x] 7.4 Store cost in TokenUsage record
  - [x] 7.5 Add cost summary to conversation metadata

- [x] **Task 8: Enhance AiGatewayService** (AC: 1,2,3,4,5)
  - [x] 8.1 Add 30-second timeout for primary provider requests
  - [x] 8.2 Integrate RateLimiterService check before processing
  - [x] 8.3 Integrate QuotaService check before processing
  - [x] 8.4 Integrate CircuitBreakerService for failover logic
  - [x] 8.5 Integrate TokenTrackerService after successful completion
  - [x] 8.6 Integrate CostCalculatorService for cost tracking
  - [x] 8.7 Add correlation ID to all log entries

- [x] **Task 9: Add shared types** (AC: 1,3,4)
  - [x] 9.1 Add `TokenUsage` interface to shared/types
  - [x] 9.2 Add `RateLimitInfo` interface to shared/types
  - [x] 9.3 Add `QuotaStatus` interface to shared/types
  - [x] 9.4 Add `ChatQueuePosition` WebSocket event type
  - [x] 9.5 Add `CircuitBreakerState` enum to shared/types

- [x] **Task 10: Backend tests** (AC: 1,2,3,4,5)
  - [x] 10.1 `rate-limiter.service.spec.ts` — rate limit enforcement tests
  - [x] 10.2 `token-tracker.service.spec.ts` — token tracking tests
  - [x] 10.3 `quota.service.spec.ts` — quota enforcement tests
  - [x] 10.4 `request-queue.service.spec.ts` — queue priority tests
  - [x] 10.5 `circuit-breaker.service.spec.ts` — circuit breaker state tests
  - [x] 10.6 `cost-calculator.service.spec.ts` — cost calculation tests
  - [x] 10.7 `ai-gateway.service.spec.ts` — integration tests with all services
  - [x] 10.8 Test: Rate limit headers in responses
  - [x] 10.9 Test: Quota exceeded error format
  - [x] 10.10 Test: Circuit breaker failover

- [x] **Task 11: Build verification + story update** (AC: all)
  - [x] 11.1 `nx build api` passes
  - [x] 11.2 `nx test api` passes (all tests)
  - [x] 11.3 Update story file with completion notes and file list

## Dev Notes

### Critical Warnings from Previous Stories

> **DO NOT create duplicate types** — Import ALL shared types from `@mentor-ai/shared/types`. Stories 1.9, 1.10, 1.11, 1.12 had findings for duplicate types. [Source: 1-9, 1-10, 1-11, 1-12 code reviews]

> **Frontend tests use Vitest** — Use `vi.fn()`, NOT `jest.fn()`. Backend uses Jest. [Source: 1-9, 1-10, 1-11, 1-12 dev notes]

> **Use ConfigService for env vars** — NEVER use `process.env` directly or hardcode values. [Source: 1-10, 1-11 code reviews]

> **Signal naming**: ALL signals use `$` suffix: `isLoading$`, `messages$`, `conversation$` [Source: project-context.md]

> **Add JSDoc to public service methods** — Story 1-11, 1-12 added JSDoc with @param, @returns, @throws. [Source: 1-11, 1-12 code reviews]

> **Use structured logging** — Use objects not string interpolation: `this.logger.log({ message: '...', conversationId, userId })` [Source: 1-11 code review]

> **ID Prefixes are MANDATORY** — TokenUsage: `tku_` [Source: project-context.md]

> **Tenant DB isolation** — Use `TenantPrismaService.getClient(tenantId)` for all tenant-scoped operations [Source: project-context.md]

> **NO console.log statements** — Use NestJS Logger only. PR requirements forbid console.log. [Source: project-context.md, 2-1 code review]

> **Type Safety Fix from 2-1**: Must import enums as values (not just types) when using as runtime values. Use `MessageRole.USER` not `'USER' as MessageRole`. [Source: 2-1 completion notes]

### Previous Story Intelligence (from 2-1)

**What Already Exists:**
- `AiGatewayService` at `apps/api/src/app/ai-gateway/ai-gateway.service.ts`
- `AiGatewayModule` at `apps/api/src/app/ai-gateway/ai-gateway.module.ts`
- `streamCompletion(messages, onChunk)` method with primary/fallback logic
- OpenRouter and Local Llama provider support
- Basic error handling with RFC 7807 format
- Integration with `LlmConfigService` for provider configuration

**Code Patterns Established:**
```typescript
// Provider switching pattern (from 2-1)
try {
  await this.streamFromOpenRouter(messages, modelId, onChunk);
} catch (error) {
  if (config.fallbackProvider) {
    await this.streamWithFallback(config.fallbackProvider, messages, onChunk);
  }
}
```

**Files from Story 2-1 to extend:**
- `ai-gateway.service.ts` — Add rate limiting, quota, circuit breaker integration
- `ai-gateway.module.ts` — Register new services
- `shared/types/src/lib/types.ts` — Add new interfaces

### Architecture Compliance

**AI Gateway Pattern (from architecture.md):**

The AI Gateway is the centralized service handling all AI operations with:
- Request queuing and backpressure management
- Provider abstraction (local Llama ↔ cloud fallback)
- Cost metering per tenant/request
- Circuit breaker for latency-based failover

**Circuit Breaker Pattern:**
```
CLOSED (normal) → 5 failures → OPEN (reject all)
                                    ↓ 30s
                              HALF_OPEN (test 1)
                                    ↓
                              success → CLOSED
                              failure → OPEN
```

**Rate Limiting Strategy:**
- Per-tenant: 60 requests/minute (configurable)
- Per-user within tenant: 20 requests/minute (configurable)
- Use sliding window algorithm via @upstash/ratelimit
- Headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`

**Request Queue Priority:**
```
Priority 3: Tenant Owner
Priority 2: Admin
Priority 1: Team Member
```

### Technical Implementation Details

**Upstash Redis Setup:**
```typescript
// redis.service.ts
import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';

@Injectable()
export class RedisService {
  private readonly redis: Redis;

  constructor(private configService: ConfigService) {
    this.redis = new Redis({
      url: this.configService.get('UPSTASH_REDIS_REST_URL'),
      token: this.configService.get('UPSTASH_REDIS_REST_TOKEN'),
    });
  }

  getRateLimiter(identifier: string, limit: number, window: string) {
    return new Ratelimit({
      redis: this.redis,
      limiter: Ratelimit.slidingWindow(limit, window),
      prefix: `ratelimit:${identifier}`,
    });
  }
}
```

**Token Usage Schema:**
```prisma
model TokenUsage {
  id             String   @id @map("id") // Must have tku_ prefix
  tenantId       String   @map("tenant_id")
  userId         String   @map("user_id")
  conversationId String?  @map("conversation_id")
  inputTokens    Int      @map("input_tokens")
  outputTokens   Int      @map("output_tokens")
  totalTokens    Int      @map("total_tokens")
  cost           Decimal  @db.Decimal(10, 6)
  modelId        String   @map("model_id")
  createdAt      DateTime @default(now()) @map("created_at")

  @@index([tenantId, createdAt])
  @@index([userId, createdAt])
  @@map("token_usage")
}
```

**Provider Pricing Config:**
```typescript
// cost-calculator.service.ts
const PRICING: Record<string, { input: number; output: number }> = {
  'openrouter/auto': { input: 0.001, output: 0.002 }, // per 1K tokens
  'meta-llama/llama-3.1-70b-instruct': { input: 0.0008, output: 0.0008 },
  'anthropic/claude-3.5-sonnet': { input: 0.003, output: 0.015 },
  // Add more as needed
};
```

**Queue Position WebSocket Event:**
```typescript
// In conversation.gateway.ts
client.emit('chat:queue-position', {
  position: 3,
  estimatedWait: 15, // seconds
});
```

### File Structure

```
apps/api/src/app/ai-gateway/
├── ai-gateway.module.ts          # Extend with new services
├── ai-gateway.service.ts         # Extend with integration
├── ai-gateway.service.spec.ts    # Extend with integration tests
├── redis.service.ts              # NEW: Upstash Redis client
├── redis.service.spec.ts         # NEW
├── rate-limiter.service.ts       # NEW: Rate limiting logic
├── rate-limiter.service.spec.ts  # NEW
├── token-tracker.service.ts      # NEW: Token tracking
├── token-tracker.service.spec.ts # NEW
├── quota.service.ts              # NEW: Quota enforcement
├── quota.service.spec.ts         # NEW
├── request-queue.service.ts      # NEW: Priority queue
├── request-queue.service.spec.ts # NEW
├── circuit-breaker.service.ts    # NEW: Circuit breaker
├── circuit-breaker.service.spec.ts # NEW
├── cost-calculator.service.ts    # NEW: Cost calculation
└── cost-calculator.service.spec.ts # NEW

apps/api/prisma/
└── schema.prisma                 # Add TokenUsage model

shared/types/src/lib/
└── types.ts                      # Add new interfaces
```

### Testing Standards

**Backend (Jest) — 90% coverage target for AI Gateway (high cost impact):**

| Test File | Coverage Target |
|-----------|-----------------|
| rate-limiter.service.spec.ts | 90% |
| token-tracker.service.spec.ts | 90% |
| quota.service.spec.ts | 90% |
| request-queue.service.spec.ts | 90% |
| circuit-breaker.service.spec.ts | 90% |
| cost-calculator.service.spec.ts | 90% |
| ai-gateway.service.spec.ts | 90% |

**Key Test Scenarios:**
- Rate limit enforcement at tenant and user levels
- Token counting accuracy
- Quota blocking when exceeded
- Queue priority ordering (Owner > Admin > Member)
- Circuit breaker state transitions
- Cost calculation accuracy
- Failover behavior on provider failure
- Timeout handling (30s primary, 2min queue)

### Environment Variables

Add to `.env.example`:
```
# Upstash Redis
UPSTASH_REDIS_REST_URL=https://your-instance.upstash.io
UPSTASH_REDIS_REST_TOKEN=your-token

# Rate Limits (optional, has defaults)
RATE_LIMIT_TENANT_PER_MINUTE=60
RATE_LIMIT_USER_PER_MINUTE=20

# Token Quotas (optional, has defaults)
DEFAULT_TENANT_TOKEN_QUOTA=1000000
```

### Dependencies

**Story Dependencies:**
- Story 2-1 (Basic Text Conversation Interface) — DONE — Provides base AI Gateway
- Story 1-12 (LLM Provider Configuration) — DONE — Provides LlmConfigService

**Library Dependencies to Install:**
```bash
npm install @upstash/redis @upstash/ratelimit
```

### Existing Patterns to Reuse

| Pattern | Source | Reuse in 2-2 |
|---------|--------|---------------|
| TenantPrismaService | `tenant-context` lib | TokenUsage storage |
| ConfigService for env vars | `llm-config.service.ts` | Redis and rate limit config |
| Structured logging | `tenant-deletion.service.ts` | All service methods |
| JSDoc documentation | `llm-config.service.ts` | All public methods |
| RFC 7807 errors | `llm-config.service.ts` | Rate limit, quota errors |
| ID prefix generation | Previous stories | `tku_` for TokenUsage |
| Primary/fallback pattern | `ai-gateway.service.ts` | Extend with circuit breaker |

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-2.2]
- [Source: _bmad-output/planning-artifacts/architecture.md#AI-Gateway-Pattern]
- [Source: _bmad-output/planning-artifacts/architecture.md#Rate-Limiting]
- [Source: _bmad-output/planning-artifacts/project-context.md#ID-Prefixes]
- [Source: _bmad-output/implementation-artifacts/2-1-basic-text-conversation-interface.md#Dev-Notes]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

N/A

### Completion Notes List

1. **Upstash Redis Integration**: Added `@upstash/redis` and `@upstash/ratelimit` packages. RedisService handles graceful degradation when Redis is not configured (rate limiting disabled but requests still allowed).

2. **Rate Limiting Pattern**: Implemented sliding window algorithm via `@upstash/ratelimit`. Per-tenant (60/min) and per-user (20/min) limits are configurable via environment variables.

3. **Token Tracking**: Uses `PlatformPrismaService` for storing token usage records in platform database. All usage records get `tku_` prefix for type identification.

4. **Quota Enforcement**: QuotaService checks monthly token usage against tenant's `tokenQuota` field. Returns RFC 7807 error with `upgrade_url` when exceeded.

5. **Request Queue**: Implemented Redis-based priority queue using sorted sets. Priority: TENANT_OWNER=3, ADMIN=2, MEMBER=1. FIFO ordering within same priority.

6. **Circuit Breaker**: Full state machine implementation (CLOSED → OPEN → HALF_OPEN). Opens after 5 consecutive failures, half-opens after 30 seconds. State persisted in Redis with local fallback.

7. **Cost Calculator**: Comprehensive pricing for 20+ models including OpenAI, Anthropic, Meta, Mistral, Google. Local models return $0 cost. Unknown models use conservative default pricing.

8. **AiGatewayService Enhancement**: New `streamCompletionWithContext` method with full rate limiting, quota checks, circuit breaker, and token tracking. Legacy `streamCompletion` preserved for backward compatibility. 30-second timeout with AbortController.

9. **Shared Types**: Added `TokenUsage`, `RateLimitInfo`, `QuotaStatus`, `CircuitBreakerState`, `ChatQueuePosition`, and `SystemCircuitBreaker` to shared/types.

10. **Prisma Schema**: Added `TokenUsage` model with proper indexes and `tokenQuota` field to `Tenant` model.

### File List

**Backend - AI Gateway Services**
- `apps/api/src/app/ai-gateway/ai-gateway.module.ts`
- `apps/api/src/app/ai-gateway/ai-gateway.service.ts`
- `apps/api/src/app/ai-gateway/redis.service.ts`
- `apps/api/src/app/ai-gateway/rate-limiter.service.ts`
- `apps/api/src/app/ai-gateway/token-tracker.service.ts`
- `apps/api/src/app/ai-gateway/quota.service.ts`
- `apps/api/src/app/ai-gateway/request-queue.service.ts`
- `apps/api/src/app/ai-gateway/circuit-breaker.service.ts`
- `apps/api/src/app/ai-gateway/cost-calculator.service.ts`

**Backend - Tests**
- `apps/api/src/app/ai-gateway/ai-gateway.service.spec.ts`
- `apps/api/src/app/ai-gateway/redis.service.spec.ts`
- `apps/api/src/app/ai-gateway/rate-limiter.service.spec.ts`
- `apps/api/src/app/ai-gateway/token-tracker.service.spec.ts`
- `apps/api/src/app/ai-gateway/quota.service.spec.ts`
- `apps/api/src/app/ai-gateway/request-queue.service.spec.ts`
- `apps/api/src/app/ai-gateway/circuit-breaker.service.spec.ts`
- `apps/api/src/app/ai-gateway/cost-calculator.service.spec.ts`

**Schema & Types**
- `apps/api/prisma/schema.prisma` (TokenUsage model, Tenant.tokenQuota)
- `shared/types/src/lib/types.ts` (AI Gateway types)

**Configuration**
- `.env.example` (Upstash Redis and rate limit settings)

### Code Review Fixes Applied

**Review Date:** 2026-02-06
**Reviewer Model:** Claude Opus 4.5

**Issues Found & Fixed:**

1. **HIGH - Duplicate ChatMessage Interface** (ai-gateway.service.ts)
   - Removed local `ChatMessage` interface
   - Now imports `ChatMessage` from `@mentor-ai/shared/types`

2. **HIGH - Duplicate Types Across Services**
   - All services now import from `@mentor-ai/shared/types` instead of defining local duplicates
   - Added new shared types: `ChatMessage`, `UsagePeriod`, `RateLimitHeaders`, `ModelPricing`, `CostCalculation`, `CircuitBreakerStatus`, `CircuitBreakerEvent`
   - Added `correlationId` to `SystemCircuitBreaker` type

3. **MEDIUM - TokenTrackerService** (token-tracker.service.ts)
   - Imports `UsageSummary` and `UsagePeriod` from shared types
   - `TokenUsageRecord` kept local with comment explaining Date vs string difference for Prisma

4. **MEDIUM - QuotaService** (quota.service.ts)
   - Imports `QuotaStatus` from shared types
   - `QuotaCheckResult` is now a type alias for backward compatibility

5. **MEDIUM - RateLimiterService** (rate-limiter.service.ts)
   - Imports `RateLimitInfo` and `RateLimitHeaders` from shared types
   - `RateLimitResult` is now a type alias for backward compatibility

6. **MEDIUM - CircuitBreakerService** (circuit-breaker.service.ts)
   - Imports `CircuitBreakerState`, `CircuitBreakerStatus`, `CircuitBreakerEvent` from shared types
   - Re-exports for backward compatibility

7. **MEDIUM - CostCalculatorService** (cost-calculator.service.ts)
   - Imports `ModelPricing` and `CostCalculation` from shared types

8. **LOW - Module Dependency** (ai-gateway.module.ts)
   - Added explicit `TenantModule` import for `PlatformPrismaService` dependency

**Remaining LOW Issues (Not Fixed - Acceptable):**
- Token estimation uses rough approximation (would need tokenizer library)
- No integration tests for actual Redis operations (unit tests sufficient for now)
- OpenRouterResponse interface is internal (documented with comment)

