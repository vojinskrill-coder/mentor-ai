---
stepsCompleted: ['step-01-init', 'step-02-context', 'step-03-starter', 'step-04-decisions', 'step-05-patterns', 'step-06-structure', 'step-07-validation', 'step-08-complete']
workflowStatus: 'complete'
completedAt: '2026-02-04'
inputDocuments:
  - "_bmad-output/planning-artifacts/prd.md"
  - "_bmad-output/planning-artifacts/prd-validation-report.md"
  - "_bmad-output/planning-artifacts/ux-design-specification.md"
  - "_bmad-output/planning-artifacts/product-brief-Mentor AI-2026-02-03.md"
workflowType: 'architecture'
project_name: 'Mentor AI'
user_name: 'Tanjav'
date: '2026-02-04'
---

# Architecture Decision Document - Mentor AI

_This document builds collaboratively through step-by-step discovery. Sections are appended as we work through each architectural decision together._

## Project Context Analysis

### Requirements Overview

**Functional Requirements:**

The PRD defines a comprehensive AI business partner platform with these core capabilities:

| Category | Key Requirements |
|----------|------------------|
| **AI Orchestration** | 6 department personas (CFO/CMO/CTO/Operations/Legal/Creative) with guardrails |
| **Knowledge Base** | 600 proprietary business concepts in vector DB with graph relationships |
| **Memory System** | Client/project-specific context that persists and compounds |
| **Multimodal I/O** | Text chat + Voice (Whisper STT, Azure TTS) + Image generation (DALL-E) |
| **Integrations** | HubSpot, Google Analytics, Figma, Slack workflow embeds |
| **Value Tracking** | Time saved, cost avoided, confidence scores on all guidance |

**Non-Functional Requirements:**

| NFR | Requirement | Architectural Impact |
|-----|-------------|---------------------|
| **Security** | SOC 2 compliance, physical data isolation | Separate DB instances per tenant, audit logging, encryption |
| **Performance** | Sub-5-min first value, streaming responses | Edge caching, optimistic UI, chunked streaming |
| **Scalability** | Teams of 8+ users, growing concept base | Horizontal scaling, connection pooling, lazy loading |
| **Availability** | 99.9% uptime target | Hybrid local/cloud, circuit breakers, health checks |
| **Accessibility** | WCAG 2.1 Level AA | Semantic HTML, ARIA, keyboard nav, screen reader support |
| **Cost Control** | Per-tenant usage tracking | Metering middleware, budget alerts, rate limiting |

**Scale & Complexity:**

- Primary domain: Full-stack web application with AI backend services
- Complexity level: **High** (enterprise SaaS with compliance requirements)
- Estimated architectural components: 15-20 major services/modules

### Technical Constraints & Dependencies

**Platform Constraints (from UX Spec):**
- Frontend: Angular 21 (user requirement), Tailwind CSS v4, Native HTML components (ADR-001: Spartan UI abandoned)
- Graph: Sigma.js (WebGL) for 60fps knowledge visualization
- Voice: Whisper (local STT), Azure TTS (streaming output)
- Images: DALL-E 3 API with cost controls

**Infrastructure Constraints (from PRD):**
- LLM: Llama 3.1 locally (8B for speed, 70B for complexity) + cloud fallback
- Vector DB: Pinecone/Qdrant/Weaviate with BGE-M3 embeddings
- Data: Physical tenant isolation (separate DB instances)
- Compliance: SOC 2 certification required before launch

**Integration Dependencies:**
- Authentication: SSO provider (likely Auth0/Clerk for SOC 2)
- Payments: Stripe for subscriptions
- CRM: HubSpot API
- Analytics: Google Analytics API
- Design: Figma API
- Communication: Slack API

### Cross-Cutting Concerns Identified

| Concern | Scope | Approach Needed |
|---------|-------|-----------------|
| **Authentication/Authorization** | All services | Multi-tenant identity with role-based access (Owner/Team Member) |
| **Audit Logging** | All mutations | Immutable audit trail for SOC 2 compliance |
| **Rate Limiting** | API gateway | Per-tenant limits, LLM token quotas, cost caps |
| **Error Handling** | All layers | Graceful degradation, user-friendly messages, retry logic |
| **Observability** | All services | Structured logging, distributed tracing, metrics |
| **Cost Tracking** | AI services | Per-request metering for LLM, TTS, image generation |
| **Caching** | Read-heavy paths | Vector search results, LLM context, session state |
| **Multi-tenancy** | Data layer | Physical isolation with tenant ID propagation |

### Architectural Decisions (from ADR Analysis)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Backend Architecture** | Modular Monolith + AI Gateway | Balance simplicity with extraction path; AI Gateway enables independent scaling and provider switching |
| **Multi-Tenancy** | Separate tenant DBs + Shared platform DB | SOC 2 physical isolation requirement; shared concepts are read-only |
| **LLM Orchestration** | Custom AI Gateway with queues | Avoid framework lock-in; enables cost tracking, circuit breakers, provider switching |
| **Frontend State** | Angular Signals + WebSocket | Native Angular 17+ reactivity; WebSocket for streaming AI responses |
| **Vector Search** | Hierarchical embeddings + Hybrid search | Enables deep-linking; combines semantic + keyword matching |
| **UI Components** | Native HTML + Tailwind CSS (ADR-001) | Spartan UI incompatible with Tailwind v4 inline templates; native approach is reliable and accessible |
| **Error Handling** | Global AllExceptionsFilter + RFC 7807 | Centralized error formatting, correlation ID propagation, consistent ProblemDetails shape |

### Key Architectural Patterns Identified

**1. AI Gateway Pattern:** Centralized service handling all AI operations (LLM, TTS, image gen) with:
- Request queuing and backpressure management
- Provider abstraction (local Llama ↔ cloud fallback)
- Cost metering per tenant/request
- Circuit breaker for latency-based failover

**2. Tenant Isolation Pattern:** Physical separation with routing:
- JWT contains tenant_id
- Middleware routes to correct DB connection
- Shared read-only concept store (not tenant-specific)
- Platform DB for cross-tenant admin operations

**3. Streaming Response Pattern:** Real-time AI interaction:
- HTTP POST to initiate request
- WebSocket stream for response chunks
- Frontend Signals for reactive updates
- Graceful degradation if WebSocket fails

**4. Concept Graph Pattern:** Knowledge architecture:
- Hierarchical embeddings (doc → section → sentence)
- Hybrid retrieval (vector + BM25)
- IndexedDB cache for offline graph rendering
- 2-degree lazy loading from focus node

### Risk Mitigation (from Pre-mortem Analysis)

**Critical Risks Identified:**

| Risk Category | Failure Mode | Mitigation | Priority |
|---------------|--------------|------------|----------|
| **Cost** | LLM/TTS costs exceed revenue | Per-request metering, tenant caps, lazy TTS | P0 |
| **Security** | Cross-tenant data leak | Server-side tenant validation, separate connection pools | P0 |
| **Performance** | 15-30s response times | Semantic caching, async re-ranking, latency tracing | P0 |
| **Trust** | Confident but wrong advice | Multi-factor confidence, mandatory disclaimers, feedback loop | P1 |
| **Complexity** | Team can't maintain system | Modular monolith, managed services, team-sized architecture | P1 |

**Architectural Safeguards:**

**1. Cost Control Layer:**
- Every AI call logged with cost
- Real-time cost dashboard for Platform Owner
- Per-tenant budget caps with hard stops
- Lazy TTS (generate on play, not on response)

**2. Security Hardening:**
- Server-side tenant validation on every request
- Tenant-scoped database connection pools
- Anomaly detection for cross-tenant access attempts
- Pre-launch penetration testing

**3. Performance Guardrails:**
- Semantic query caching (1-hour TTL)
- Latency breakdown tracing for every request
- Circuit breaker with graduated response (queue → warn → fallback)
- Warm worker pools during business hours

**4. Trust Calibration:**
- Multi-factor confidence scoring
- Prominent disclaimers for legal/tax/compliance topics
- Persona capability boundaries (what each persona CAN'T do)
- Feedback loop for confidence calibration

**5. Complexity Management:**
- Team-sized architecture (3 engineers = 3 services max)
- One-click deploy pipeline from day 1
- Managed services over self-hosted
- Correlation IDs in all logs

## Starter Template Evaluation

### Primary Technology Domain

**Full-stack web application** with AI backend services, based on project requirements analysis.

- Frontend: Angular 21 with standalone components and Signals
- Backend: NestJS modular monolith
- Shared: TypeScript monorepo with unified type safety

### Starter Options Considered

| Option | Pros | Cons | Verdict |
|--------|------|------|---------|
| **Nx Monorepo** | Shared types, affected builds, generators | Learning curve | ✅ Selected |
| **Turborepo** | Fast builds, simpler config | Less Angular-native tooling | ❌ |
| **Lerna** | Mature, flexible | Less integrated, maintenance mode | ❌ |
| **Manual Monorepo** | Full control | Too much boilerplate | ❌ |

### Selected Starter: Nx Monorepo with Angular + NestJS

**Rationale for Selection:**

1. **Type Safety:** Shared TypeScript types between frontend and backend eliminate contract drift
2. **Affected Builds:** Only rebuild/test what changed—critical for CI/CD efficiency
3. **Angular-Native:** First-class Angular support with generators and schematics
4. **NestJS Integration:** Seamless NestJS support with shared decorators and DTOs
5. **Scalability:** Clear extraction path when services need to be separated

**Party Mode Consensus:** Unanimous approval from Winston (Architect), Amelia (Developer), Barry (Quick Flow), and Bob (Scrum Master).

**Initialization Command:**

```bash
# Create Nx workspace with NestJS
npx create-nx-workspace@latest mentor-ai --preset=nest --appName=api --nxCloud=skip

# Add Angular
npm i -D @nx/angular
nx g @nx/angular:app web --style=css --routing=true --standalone=true

# Setup Tailwind CSS v4
nx g @nx/angular:setup-tailwind web

# Initialize Spartan UI (pin version for stability)
npx nx g @spartan-ng/cli:init

# Create shared libraries
nx g @nx/js:lib shared/types --bundler=swc
nx g @nx/js:lib shared/ai-gateway --bundler=swc
nx g @nx/nest:lib shared/tenant-context --buildable
nx g @nx/angular:lib shared/ui --standalone --style=css
nx g @nx/nest:lib shared/events --buildable
nx g @nx/js:lib shared/testing --bundler=swc
```

### Architectural Decisions Provided by Starter

**Language & Runtime:**
- TypeScript 5.x with strict mode enabled
- Node.js 20 LTS for backend
- Angular 21 with standalone components (no NgModules)

**Styling Solution:**
- Tailwind CSS v4 with JIT compilation
- Native HTML + Tailwind CSS utility classes for all components (ADR-001)
- CSS variables for theming (dark mode support)
- Note: Spartan UI was originally planned but abandoned — Tailwind v4 does not process utility classes in Angular inline templates, making Spartan's `@spartan-ng/brain` + `@spartan-ng/ui` components non-functional

**Build Tooling:**
- Nx with esbuild for fast builds
- SWC for TypeScript compilation in libraries
- Vite for Angular development server

**Testing Framework:**
- Jest for unit tests (both Angular and NestJS)
- Playwright for E2E tests (to be added)
- Nx affected commands for targeted testing

**Code Organization:**
```
mentor-ai/
├── apps/
│   ├── web/                 # Angular frontend
│   └── api/                 # NestJS backend
├── libs/
│   └── shared/
│       ├── types/           # Shared TypeScript interfaces
│       ├── ai-gateway/      # AI service abstractions
│       ├── tenant-context/  # Multi-tenancy middleware
│       ├── ui/              # Shared Angular components
│       ├── events/          # WebSocket event definitions
│       └── testing/         # Mock factories, test utils
├── nx.json
├── tsconfig.base.json
└── package.json
```

**Development Experience:**
- Hot module reloading for both apps
- Nx Console VS Code extension for generators
- Type-safe imports across workspace
- Integrated debugging configuration

**Note:** Project initialization using this command should be the first implementation story.

## Core Architectural Decisions

### Decision Priority Analysis

**Critical Decisions (Block Implementation):**
- Database: PostgreSQL with physical tenant isolation
- ORM: Prisma with shared types and connection pooling
- Auth: Auth0 for SOC 2 compliance
- API: REST + OpenAPI for external, WebSocket for streaming

**Important Decisions (Shape Architecture):**
- Caching: Upstash Redis (serverless) with pub/sub for WebSocket scaling
- Authorization: RBAC (Platform Owner → Tenant Owner → Team Member)
- Hosting: Railway (SOC 2 Type I) with AWS migration path
- CI/CD: GitHub Actions with Nx affected commands

**Deferred Decisions (Post-MVP):**
- CDN configuration (evaluate after traffic patterns emerge)
- Read replicas (when query load justifies)
- Multi-region deployment (when user base expands)

### Data Architecture

| Decision | Choice | Version | Rationale |
|----------|--------|---------|-----------|
| **Primary Database** | PostgreSQL | 16.x | JSONB flexibility, mature ecosystem, excellent NestJS/Prisma support |
| **ORM** | Prisma | 5.x | Type-safe queries, auto-generated types for shared/types lib, declarative migrations |
| **Connection Pooling** | Prisma Accelerate or PgBouncer | - | Required for multi-tenant DB routing at scale |
| **Caching Layer** | Upstash Redis | 7.x | Serverless, zero-ops for MVP, pub/sub for WebSocket scaling |
| **Vector Database** | Qdrant | 1.x | Self-hostable, excellent performance, tenant-scoped but shared engine |
| **Migrations** | Prisma Migrate | - | Schema-first, version-controlled, supports multiple databases |

**Connection Pooling Strategy (Party Enhancement):**
```typescript
// libs/shared/tenant-context/src/tenant-prisma.service.ts
@Injectable()
export class TenantPrismaService {
  private clients = new Map<string, PrismaClient>();

  getClient(tenantId: string): PrismaClient {
    if (!this.clients.has(tenantId)) {
      this.clients.set(tenantId, new PrismaClient({
        datasources: { db: { url: this.getTenantDbUrl(tenantId) } }
      }));
    }
    return this.clients.get(tenantId);
  }
}
```

**Data Flow Pattern:**
```
Request → Tenant Middleware → Connection Pool Router → Tenant DB
                ↓
        Platform DB (shared concepts, billing)
                ↓
        Vector DB (embeddings, semantic search)
                ↓
        Redis (cache, sessions, pub/sub)
```

### Authentication & Security

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Auth Provider** | Auth0 | SOC 2 Type II certified, enterprise SSO, MFA, audit logs |
| **Token Strategy** | JWT with refresh tokens | Stateless verification, tenant_id in claims, 15min access tokens |
| **Authorization** | RBAC | Three roles align with UX: Platform Owner, Tenant Owner, Team Member |
| **Session Storage** | Redis | Centralized session management, horizontal scaling |
| **API Security** | Rate limiting + API keys | Per-tenant limits, separate keys for integrations |
| **Login UX** | Custom Auth0 Universal Login | Branded experience per Party recommendation |

**Role Hierarchy:**
```
Platform Owner (Tanjav)
├── Full system access
├── Tenant management
├── Platform configuration (LLM, Vector DB, TTS, etc.)
└── Cost monitoring

Tenant Owner (Business Owner)
├── Tenant settings
├── Team management
├── Billing & usage
└── All AI features

Team Member
├── AI chat & personas
├── Knowledge base access
└── Personal preferences
```

**Security Middleware Stack:**
1. Rate Limiter (per-tenant, per-endpoint)
2. Auth0 JWT Verification
3. Tenant Context Injection
4. RBAC Guard
5. Correlation ID Interceptor (Party addition)
6. Audit Logger

**Graceful Degradation (Party Enhancement):**
- Auth0 outage: Cache validated JWTs for 5min, show "limited mode" banner
- Redis outage: Fall back to in-memory session (single instance only)

### API & Communication Patterns

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **API Style** | REST + OpenAPI 3.1 | Standard for integrations, excellent tooling, cacheable |
| **Documentation** | Swagger/NestJS OpenAPI | Auto-generated from decorators, interactive testing |
| **Real-time** | Socket.io + Redis Adapter | Rooms for tenant isolation, horizontal scaling |
| **Error Format** | RFC 7807 Problem Details | Standard error format, machine-readable |
| **Error Translation** | Frontend error service | RFC 7807 → user-friendly messages (Party addition) |
| **Validation** | class-validator + Zod | NestJS decorators + runtime validation |
| **Correlation** | x-correlation-id header | Request tracing across services (Party addition) |

**API Structure:**

Note: `main.ts` sets global prefix `api`. Controllers use `v1/` prefix for versioned business APIs. Infrastructure routes (auth, registration, onboarding) omit `v1/`.

```
/api
├── /auth                    # Auth0 callbacks, token refresh (no v1)
├── /registration            # Tenant registration (no v1)
├── /onboarding              # Quick-win onboarding (no v1)
├── /v1/conversations        # AI conversation endpoints
├── /v1/personas             # AI persona selection
├── /v1/knowledge            # Concept graph queries
├── /v1/memory               # Persistent memory
├── /v1/notes                # Structured notes
├── /v1/admin                # Platform admin (data-integrity)
├── /admin/llm-config        # LLM provider configuration
├── /health                  # Health check (NestJS Terminus)
└── /integrations            # HubSpot, Slack, etc.

/ws
├── /chat                    # Streaming AI responses
└── /notifications   # Real-time alerts
```

**Health Check Endpoint (Party Addition):**
```typescript
// apps/api/src/health/health.controller.ts
@Controller('health')
export class HealthController {
  constructor(private health: HealthCheckService) {}

  @Get()
  check() {
    return this.health.check([
      () => this.db.pingCheck('database'),
      () => this.redis.pingCheck('redis'),
    ]);
  }
}
```

**Streaming Response Flow:**
1. `POST /api/v1/conversations/:id/messages` → Returns `{ streamId: "uuid" }`
2. Client connects to `ws://*/ws/chat?streamId=uuid`
3. Server streams chunks: `{ type: "chunk", content: "..." }`
4. Final message: `{ type: "complete", metadata: {...} }`
5. Graceful fallback to HTTP polling if WebSocket fails

### Frontend Architecture

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **State Management** | Angular Signals | Native reactivity, fine-grained updates, no external dependency |
| **Complex State** | @ngrx/signals (if needed) | Signal-based store for complex cross-component state |
| **HTTP Client** | Angular HttpClient + interceptors | Tenant header injection, correlation IDs, retry logic |
| **Routing** | Angular Router standalone | Lazy loading per feature, route guards for auth |
| **Forms** | Reactive Forms + Native HTML | Type-safe forms, accessible native components |
| **Error Display** | Error translation service | RFC 7807 → user-friendly messages |

**Frontend Module Structure:**
```
apps/web/src/app/
├── core/                    # Singleton services, guards, interceptors
│   ├── auth/               # Auth0 integration
│   ├── tenant/             # Tenant context
│   ├── api/                # HTTP client, error handling
│   └── error/              # Error translation service
├── features/
│   ├── chat/               # AI conversation UI
│   ├── knowledge-graph/    # Sigma.js visualization
│   ├── personas/           # Department persona selection
│   ├── admin/              # Tenant/Platform admin
│   └── settings/           # User preferences
├── shared/
│   └── ui/                 # → imports from libs/shared/ui
└── app.routes.ts
```

**Error Translation Service (Party Enhancement):**
```typescript
// apps/web/src/app/core/error/error-translator.service.ts
@Injectable({ providedIn: 'root' })
export class ErrorTranslatorService {
  translate(error: ProblemDetails): string {
    const messages: Record<string, string> = {
      'tenant_context_missing': 'Please log in again to continue',
      'rate_limit_exceeded': 'You\'ve made too many requests. Please wait a moment.',
      'ai_service_unavailable': 'Our AI service is temporarily busy. Retrying...',
    };
    return messages[error.type] || 'Something went wrong. Please try again.';
  }
}
```

### Infrastructure & Deployment

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Hosting (MVP)** | Railway | SOC 2 Type I, simple deploys, managed PostgreSQL, good DX |
| **Hosting (Enterprise)** | AWS ECS/Fargate | Migration path for SOC 2 Type II, more control |
| **CI/CD** | GitHub Actions | Native integration, Nx affected commands, parallel jobs |
| **Containers** | Docker | Consistent environments, Railway-native |
| **Secrets** | Railway Variables + GitHub Secrets | Environment-specific, encrypted at rest |
| **Monitoring** | Railway Metrics + Sentry | Error tracking, performance monitoring |
| **Redis** | Upstash | Serverless, zero-ops, pay-per-request |

**Deployment Pipeline:**
```
Push to main
    ↓
GitHub Actions
    ├── nx affected:lint
    ├── nx affected:test
    ├── nx affected:build
    └── Deploy (if main)
         ├── Railway: api (NestJS)
         ├── Railway: web (Angular)
         └── Managed: Upstash Redis, Railway PostgreSQL
```

**Environment Strategy:**
- `development` → Local Docker Compose
- `staging` → Railway (staging project)
- `production` → Railway (production) → AWS (enterprise migration)

### Day 1 Infrastructure Checklist (Party Addition)

- [ ] Auth0 tenant created with custom Universal Login branding
- [ ] Auth0 callback URLs configured for all environments
- [ ] Railway project created (staging + production)
- [ ] Railway PostgreSQL provisioned (Platform DB)
- [ ] Upstash Redis provisioned
- [ ] GitHub Actions secrets configured
- [ ] Sentry project created
- [ ] Test user created and login flow verified

### Decision Impact Analysis

**Implementation Sequence:**
1. **Sprint 0:** Nx workspace init, Auth0 setup, Railway project, Day 1 checklist
2. **Sprint 1:** PostgreSQL + Prisma schema, tenant isolation middleware, health checks
3. **Sprint 2:** Auth flow, RBAC guards, correlation IDs, basic API structure
4. **Sprint 3:** Socket.io setup, AI Gateway integration, streaming responses
5. **Sprint 4:** Frontend shell, routing, Native HTML components, error translation

**Cross-Component Dependencies:**
```
Auth0 JWT → Tenant Middleware → All API Routes
     ↓
Redis Sessions → WebSocket Scaling (Socket.io Adapter)
     ↓
Prisma Client → Tenant DB Routing (Connection Pool)
     ↓
AI Gateway → LLM/TTS/Image providers
     ↓
Correlation IDs → Distributed Tracing → Observability
```

**Rollback Procedures:**
- **Prisma multi-DB too complex:** Fall back to schema-based isolation (tenant_id column)
- **Auth0 issues:** Evaluate Clerk as alternative (similar integration pattern)
- **Railway scaling limits:** Execute AWS migration playbook

**Party Mode Consensus:** All decisions approved with enhancements for connection pooling, health checks, correlation IDs, error translation, graceful degradation, and Day 1 checklist.

## Implementation Patterns & Consistency Rules

### Pattern Categories Defined

**Critical Conflict Points Identified:** 32 areas where AI agents could make different choices, now standardized.

### Naming Patterns

**Database Naming Conventions (Prisma):**

| Element | Convention | Example |
|---------|------------|---------|
| Tables | PascalCase (Prisma model) | `User`, `ChatSession`, `TenantConfig` |
| Columns | camelCase | `userId`, `createdAt`, `isActive` |
| Foreign keys | `{relation}Id` | `tenantId`, `ownerId`, `createdById` |
| Indexes | `{table}_{column}_idx` | `User_email_idx` |
| Enums | PascalCase | `UserRole`, `PersonaType` |

```prisma
// ✅ Good
model ChatSession {
  id          String   @id @default(cuid())
  tenantId    String
  userId      String
  personaType PersonaType
  createdAt   DateTime @default(now())

  tenant      Tenant   @relation(fields: [tenantId], references: [id])
  user        User     @relation(fields: [userId], references: [id])

  @@index([tenantId, userId])
}

// ❌ Bad
model chat_session {
  ID          String
  tenant_id   String
  user_ID     String
}
```

**API Naming Conventions (NestJS):**

| Element | Convention | Example |
|---------|------------|---------|
| Endpoints | Plural nouns, kebab-case | `/chat-sessions` (global `/api` prefix applied in main.ts) |
| Route params | camelCase | `:sessionId`, `:tenantId` |
| Query params | camelCase | `?pageSize=10&sortBy=createdAt` |
| Headers | X-Custom-Name | `X-Tenant-Id`, `X-Correlation-Id` |
| Controllers | `{Resource}Controller` | `ChatSessionsController` |
| Services | `{Resource}Service` | `ChatSessionsService` |

```typescript
// ✅ Good
@Controller('chat-sessions')
export class ChatSessionsController {
  @Get(':sessionId/messages')
  getMessages(@Param('sessionId') sessionId: string) {}
}

// ❌ Bad
@Controller('chatSession')
export class ChatSessionController {
  @Get(':session_id/Messages')
  getMessages(@Param('session_id') session_id: string) {}
}
```

**Code Naming Conventions (Angular + NestJS):**

| Element | Convention | Example |
|---------|------------|---------|
| Components | PascalCase | `ChatMessageComponent` |
| Component files | kebab-case | `chat-message.component.ts` |
| Services | PascalCase + Service | `ChatService`, `TenantService` |
| Interfaces | PascalCase (no I prefix) | `User`, `ChatMessage` |
| Types | PascalCase | `PersonaType`, `MessageStatus` |
| Constants | SCREAMING_SNAKE_CASE | `MAX_MESSAGE_LENGTH`, `DEFAULT_PAGE_SIZE` |
| Functions | camelCase | `formatMessage()`, `validateTenant()` |
| Signals | camelCase + $ suffix | `messages$`, `isLoading$`, `currentUser$` |

```typescript
// ✅ Good - Angular
@Component({
  selector: 'app-chat-message',
  standalone: true,
})
export class ChatMessageComponent {
  messages$ = signal<ChatMessage[]>([]);
  isLoading$ = signal(false);
}

// ✅ Good - NestJS
@Injectable()
export class ChatSessionsService {
  private readonly MAX_SESSIONS_PER_USER = 10;

  async createSession(dto: CreateSessionDto): Promise<ChatSession> {}
}
```

### Structure Patterns

**Project Organization (Nx Monorepo):**

```
mentor-ai/
├── apps/
│   ├── api/                          # NestJS backend
│   │   └── src/
│   │       ├── main.ts
│   │       ├── app.module.ts
│   │       └── modules/              # Feature modules
│   │           ├── auth/
│   │           ├── chat/
│   │           ├── knowledge/
│   │           └── admin/
│   └── web/                          # Angular frontend
│       └── src/
│           └── app/
│               ├── core/             # Singleton services
│               ├── features/         # Lazy-loaded feature modules
│               ├── shared/           # Shared within app only
│               └── app.routes.ts
├── libs/
│   └── shared/
│       ├── types/                    # Shared TypeScript interfaces
│       ├── ai-gateway/               # AI service abstractions
│       ├── tenant-context/           # Multi-tenancy (NestJS)
│       ├── ui/                       # Shared Angular components
│       ├── events/                   # WebSocket event definitions
│       └── testing/                  # Mock factories
└── tools/                            # Nx generators, scripts
```

**Test Organization (Co-located):**

```
// Tests live next to the code they test
modules/chat/
├── chat.controller.ts
├── chat.controller.spec.ts        # Unit test
├── chat.service.ts
├── chat.service.spec.ts           # Unit test
├── dto/
│   ├── create-message.dto.ts
│   └── create-message.dto.spec.ts
└── __tests__/
    └── chat.e2e-spec.ts           # E2E tests in __tests__ folder

// Angular components
features/chat/
├── chat-message/
│   ├── chat-message.component.ts
│   ├── chat-message.component.spec.ts
│   └── chat-message.component.html
```

**File Naming Patterns:**

| Type | Pattern | Example |
|------|---------|---------|
| NestJS Module | `{feature}.module.ts` | `chat.module.ts` |
| NestJS Controller | `{feature}.controller.ts` | `chat.controller.ts` |
| NestJS Service | `{feature}.service.ts` | `chat.service.ts` |
| NestJS DTO | `{action}-{entity}.dto.ts` | `create-message.dto.ts` |
| Angular Component | `{name}.component.ts` | `chat-message.component.ts` |
| Angular Service | `{name}.service.ts` | `chat.service.ts` |
| Angular Guard | `{name}.guard.ts` | `auth.guard.ts` |
| Shared Types | `{entity}.types.ts` | `chat.types.ts` |
| Constants | `{domain}.constants.ts` | `chat.constants.ts` |

### Format Patterns

**API Response Formats:**

```typescript
// Success Response (libs/shared/types/api-response.types.ts)
interface ApiResponse<T> {
  data: T;
  meta?: {
    page?: number;
    pageSize?: number;
    total?: number;
    hasMore?: boolean;
  };
}

// ✅ Good
{
  "data": {
    "id": "sess_123",
    "messages": [...]
  },
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 45,
    "hasMore": true
  }
}

// Error Response (RFC 7807)
interface ProblemDetails {
  type: string;           // Error type identifier
  title: string;          // Human-readable summary
  status: number;         // HTTP status code
  detail?: string;        // Detailed explanation
  instance?: string;      // URI of the specific occurrence
  correlationId: string;  // For tracing
}

// ✅ Good
{
  "type": "rate_limit_exceeded",
  "title": "Too Many Requests",
  "status": 429,
  "detail": "You have exceeded 100 requests per minute",
  "correlationId": "corr_abc123"
}
```

**Data Exchange Formats:**

| Format | Convention | Example |
|--------|------------|---------|
| JSON fields | camelCase | `userId`, `createdAt` |
| Dates | ISO 8601 strings | `"2026-02-04T12:00:00Z"` |
| IDs | Prefixed CUIDs | `usr_abc123`, `sess_xyz789` |
| Booleans | true/false | `"isActive": true` |
| Nulls | Explicit null, not omitted | `"deletedAt": null` |
| Empty arrays | Empty array, not null | `"tags": []` |

**ID Prefix Convention:**

| Entity | Prefix | Example |
|--------|--------|---------|
| User | `usr_` | `usr_cuid123` |
| Tenant | `tnt_` | `tnt_cuid456` |
| Chat Session | `sess_` | `sess_cuid789` |
| Message | `msg_` | `msg_cuidabc` |
| Concept | `cpt_` | `cpt_cuiddef` |
| Persona | `prs_` | `prs_cuidghi` |

### Communication Patterns

**WebSocket Event Naming (Socket.io):**

```typescript
// libs/shared/events/chat.events.ts

// Event names: domain:action (kebab-case)
export const CHAT_EVENTS = {
  // Client → Server
  MESSAGE_SEND: 'chat:message-send',
  SESSION_JOIN: 'chat:session-join',
  SESSION_LEAVE: 'chat:session-leave',
  TYPING_START: 'chat:typing-start',
  TYPING_STOP: 'chat:typing-stop',

  // Server → Client
  MESSAGE_CHUNK: 'chat:message-chunk',
  MESSAGE_COMPLETE: 'chat:message-complete',
  MESSAGE_ERROR: 'chat:message-error',
  TYPING_INDICATOR: 'chat:typing-indicator',
} as const;

// Event payload structure
interface ChatMessageChunkEvent {
  sessionId: string;
  messageId: string;
  chunk: string;
  index: number;
  isComplete: boolean;
}
```

**State Management (Angular Signals):**

```typescript
// ✅ Good - Signal naming and structure
@Injectable({ providedIn: 'root' })
export class ChatStore {
  // State signals (private, mutable)
  private readonly _sessions = signal<ChatSession[]>([]);
  private readonly _currentSessionId = signal<string | null>(null);
  private readonly _isLoading = signal(false);
  private readonly _error = signal<string | null>(null);

  // Public computed signals (read-only)
  readonly sessions = this._sessions.asReadonly();
  readonly currentSession = computed(() =>
    this._sessions().find(s => s.id === this._currentSessionId())
  );
  readonly isLoading = this._isLoading.asReadonly();
  readonly error = this._error.asReadonly();

  // Actions (methods that update state)
  setCurrentSession(sessionId: string): void {
    this._currentSessionId.set(sessionId);
  }

  addMessage(sessionId: string, message: ChatMessage): void {
    this._sessions.update(sessions =>
      sessions.map(s =>
        s.id === sessionId
          ? { ...s, messages: [...s.messages, message] }
          : s
      )
    );
  }
}
```

### Process Patterns

**Error Handling:**

```typescript
// NestJS Global Exception Filter
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const problemDetails: ProblemDetails = {
      type: this.getErrorType(exception),
      title: this.getErrorTitle(exception),
      status: this.getStatusCode(exception),
      detail: this.getErrorDetail(exception),
      correlationId: request.headers['x-correlation-id'] as string,
    };

    response.status(problemDetails.status).json(problemDetails);
  }
}

// Angular Error Interceptor
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      const errorService = inject(ErrorTranslatorService);
      const toastService = inject(ToastService);

      const userMessage = errorService.translate(error.error);
      toastService.error(userMessage);

      return throwError(() => error);
    })
  );
};
```

**Loading State Pattern:**

```typescript
// ✅ Good - Consistent loading state handling
@Component({
  template: `
    @if (store.isLoading()) {
      <app-skeleton-loader />
    } @else if (store.error()) {
      <app-error-message [message]="store.error()" />
    } @else {
      <app-chat-messages [messages]="store.messages()" />
    }
  `
})
export class ChatComponent {
  readonly store = inject(ChatStore);
}

// Loading state naming convention
interface LoadingState {
  isLoading: boolean;           // For simple boolean
  loadingState: 'idle' | 'loading' | 'success' | 'error';  // For complex flows
  loadingMessage?: string;      // Optional user-facing message
}
```

**Validation Pattern:**

```typescript
// NestJS DTO with class-validator (shared validation)
// libs/shared/types/dto/create-message.dto.ts
export class CreateMessageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(10000)
  content: string;

  @IsEnum(PersonaType)
  personaType: PersonaType;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  attachmentIds?: string[];
}

// Angular form with same validation
// apps/web/src/app/features/chat/chat-input.component.ts
export class ChatInputComponent {
  readonly form = new FormGroup({
    content: new FormControl('', [
      Validators.required,
      Validators.maxLength(10000),
    ]),
    personaType: new FormControl<PersonaType>(PersonaType.GENERAL, [
      Validators.required,
    ]),
  });
}
```

### Enforcement Guidelines

**All AI Agents MUST:**

1. **Follow naming conventions exactly** - No variations on casing or prefixes
2. **Use shared types from `libs/shared/types`** - Never duplicate type definitions
3. **Implement error handling using ProblemDetails** - No custom error formats
4. **Co-locate tests with source files** - No separate test directories (except e2e)
5. **Use prefixed IDs** - Every entity ID must have its prefix
6. **Return `ApiResponse<T>` wrapper** - All API endpoints use consistent format
7. **Name WebSocket events using `domain:action` format** - No variations
8. **Use Angular Signals** - No RxJS BehaviorSubjects for component state

**Pattern Enforcement:**

| Mechanism | What It Catches | When |
|-----------|-----------------|------|
| ESLint rules | Naming conventions, unused imports | Pre-commit |
| Prisma schema validation | Database naming | Migration |
| TypeScript strict mode | Type mismatches | Build |
| OpenAPI validation | API response format | CI |
| PR review checklist | Pattern compliance | Review |

**Pattern Violation Process:**

1. Identify violation in PR review
2. Reference this document section
3. Request change with concrete example
4. Update pattern if consensus is that pattern should change

### Pattern Examples

**Good Examples:**

```typescript
// ✅ Complete feature following all patterns
// apps/api/src/modules/chat/chat-sessions.controller.ts
@Controller('chat-sessions')
export class ChatSessionsController {
  constructor(private readonly chatSessionsService: ChatSessionsService) {}

  @Get()
  async getSessions(
    @Query('pageSize') pageSize = 20,
    @TenantId() tenantId: string,
  ): Promise<ApiResponse<ChatSession[]>> {
    const sessions = await this.chatSessionsService.findAll(tenantId, pageSize);
    return { data: sessions, meta: { pageSize } };
  }

  @Get(':sessionId')
  async getSession(
    @Param('sessionId') sessionId: string,
  ): Promise<ApiResponse<ChatSession>> {
    const session = await this.chatSessionsService.findOne(sessionId);
    return { data: session };
  }
}
```

**Anti-Patterns:**

```typescript
// ❌ Wrong naming conventions
@Controller('chatSession')  // Should be 'chat-sessions' (plural, kebab)
export class chatController {  // Should be ChatSessionsController

  @Get(':session_id')  // Should be :sessionId (camelCase)
  getSession(@Param('session_id') id) {  // Missing type, wrong param name
    return this.service.get(id);  // Should wrap in ApiResponse
  }
}

// ❌ Wrong state management
export class ChatComponent {
  sessions$ = new BehaviorSubject([]);  // Should use signal()
  loading = false;  // Should use signal(false)
}

// ❌ Wrong error format
throw new Error('Session not found');  // Should throw with ProblemDetails
```

## Project Structure & Boundaries

### Complete Project Directory Structure

```
mentor-ai/
├── .github/
│   └── workflows/
│       ├── ci.yml                           # Lint, test, build (Nx affected)
│       ├── deploy-staging.yml               # Deploy to Railway staging
│       └── deploy-production.yml            # Deploy to Railway production
├── .vscode/
│   ├── extensions.json                      # Recommended extensions (Nx Console)
│   ├── launch.json                          # Debug configurations
│   └── settings.json                        # Workspace settings
├── apps/
│   ├── api/                                 # NestJS Backend
│   │   ├── src/
│   │   │   ├── main.ts                      # Application entry point
│   │   │   ├── app.module.ts                # Root module
│   │   │   ├── config/
│   │   │   │   ├── config.module.ts
│   │   │   │   ├── env.schema.ts            # Environment validation
│   │   │   │   ├── database.config.ts
│   │   │   │   ├── auth.config.ts
│   │   │   │   └── redis.config.ts
│   │   │   ├── common/
│   │   │   │   ├── decorators/
│   │   │   │   │   ├── tenant-id.decorator.ts
│   │   │   │   │   └── current-user.decorator.ts
│   │   │   │   ├── guards/
│   │   │   │   │   ├── auth.guard.ts
│   │   │   │   │   ├── rbac.guard.ts
│   │   │   │   │   └── tenant.guard.ts
│   │   │   │   ├── interceptors/
│   │   │   │   │   ├── correlation-id.interceptor.ts
│   │   │   │   │   ├── logging.interceptor.ts
│   │   │   │   │   └── transform.interceptor.ts
│   │   │   │   ├── filters/
│   │   │   │   │   └── global-exception.filter.ts
│   │   │   │   ├── pipes/
│   │   │   │   │   └── validation.pipe.ts
│   │   │   │   └── middleware/
│   │   │   │       ├── tenant.middleware.ts
│   │   │   │       └── rate-limit.middleware.ts
│   │   │   ├── modules/
│   │   │   │   ├── auth/
│   │   │   │   │   ├── auth.module.ts
│   │   │   │   │   ├── auth.controller.ts
│   │   │   │   │   ├── auth.controller.spec.ts
│   │   │   │   │   ├── auth.service.ts
│   │   │   │   │   ├── auth.service.spec.ts
│   │   │   │   │   ├── strategies/
│   │   │   │   │   │   └── jwt.strategy.ts
│   │   │   │   │   └── dto/
│   │   │   │   │       └── auth-callback.dto.ts
│   │   │   │   ├── users/
│   │   │   │   │   ├── users.module.ts
│   │   │   │   │   ├── users.controller.ts
│   │   │   │   │   ├── users.controller.spec.ts
│   │   │   │   │   ├── users.service.ts
│   │   │   │   │   ├── users.service.spec.ts
│   │   │   │   │   └── dto/
│   │   │   │   │       ├── create-user.dto.ts
│   │   │   │   │       └── update-user.dto.ts
│   │   │   │   ├── tenants/
│   │   │   │   │   ├── tenants.module.ts
│   │   │   │   │   ├── tenants.controller.ts
│   │   │   │   │   ├── tenants.service.ts
│   │   │   │   │   └── dto/
│   │   │   │   │       ├── create-tenant.dto.ts
│   │   │   │   │       └── update-tenant.dto.ts
│   │   │   │   ├── chat/
│   │   │   │   │   ├── chat.module.ts
│   │   │   │   │   ├── chat.controller.ts
│   │   │   │   │   ├── chat.controller.spec.ts
│   │   │   │   │   ├── chat.service.ts
│   │   │   │   │   ├── chat.service.spec.ts
│   │   │   │   │   ├── chat.gateway.ts              # Socket.io gateway
│   │   │   │   │   ├── chat.gateway.spec.ts
│   │   │   │   │   └── dto/
│   │   │   │   │       ├── create-session.dto.ts
│   │   │   │   │       ├── send-message.dto.ts
│   │   │   │   │       └── chat-response.dto.ts
│   │   │   │   ├── personas/
│   │   │   │   │   ├── personas.module.ts
│   │   │   │   │   ├── personas.controller.ts
│   │   │   │   │   ├── personas.service.ts
│   │   │   │   │   └── dto/
│   │   │   │   │       └── persona-selection.dto.ts
│   │   │   │   ├── knowledge/
│   │   │   │   │   ├── knowledge.module.ts
│   │   │   │   │   ├── knowledge.controller.ts
│   │   │   │   │   ├── knowledge.service.ts
│   │   │   │   │   ├── vector-search.service.ts
│   │   │   │   │   └── dto/
│   │   │   │   │       ├── search-concepts.dto.ts
│   │   │   │   │       └── concept-graph.dto.ts
│   │   │   │   ├── integrations/
│   │   │   │   │   ├── integrations.module.ts
│   │   │   │   │   ├── hubspot/
│   │   │   │   │   │   ├── hubspot.service.ts
│   │   │   │   │   │   └── hubspot.service.spec.ts
│   │   │   │   │   ├── slack/
│   │   │   │   │   │   └── slack.service.ts
│   │   │   │   │   └── stripe/
│   │   │   │   │       └── stripe.service.ts
│   │   │   │   ├── admin/
│   │   │   │   │   ├── admin.module.ts
│   │   │   │   │   ├── platform-config.controller.ts
│   │   │   │   │   ├── platform-config.service.ts
│   │   │   │   │   ├── cost-tracking.controller.ts
│   │   │   │   │   └── cost-tracking.service.ts
│   │   │   │   └── health/
│   │   │   │       ├── health.module.ts
│   │   │   │       └── health.controller.ts
│   │   │   └── prisma/
│   │   │       ├── prisma.module.ts
│   │   │       └── prisma.service.ts
│   │   ├── prisma/
│   │   │   ├── schema.prisma                 # Platform DB schema
│   │   │   ├── tenant-schema.prisma          # Tenant DB schema
│   │   │   └── migrations/
│   │   ├── Dockerfile
│   │   ├── project.json                      # Nx project config
│   │   └── tsconfig.app.json
│   │
│   └── web/                                  # Angular Frontend
│       ├── src/
│       │   ├── main.ts                       # Application bootstrap
│       │   ├── index.html
│       │   ├── styles.css                    # Global Tailwind imports
│       │   └── app/
│       │       ├── app.component.ts
│       │       ├── app.config.ts             # Application config
│       │       ├── app.routes.ts             # Root routes
│       │       ├── core/
│       │       │   ├── auth/
│       │       │   │   ├── auth.service.ts
│       │       │   │   ├── auth.guard.ts
│       │       │   │   └── auth.interceptor.ts
│       │       │   ├── tenant/
│       │       │   │   ├── tenant.service.ts
│       │       │   │   └── tenant.interceptor.ts
│       │       │   ├── api/
│       │       │   │   ├── api.service.ts
│       │       │   │   └── retry.interceptor.ts
│       │       │   ├── error/
│       │       │   │   ├── error-translator.service.ts
│       │       │   │   └── error.interceptor.ts
│       │       │   ├── websocket/
│       │       │   │   └── websocket.service.ts
│       │       │   └── stores/
│       │       │       ├── auth.store.ts
│       │       │       └── tenant.store.ts
│       │       ├── features/
│       │       │   ├── chat/
│       │       │   │   ├── chat.routes.ts
│       │       │   │   ├── chat.store.ts
│       │       │   │   ├── pages/
│       │       │   │   │   ├── chat-page/
│       │       │   │   │   │   ├── chat-page.component.ts
│       │       │   │   │   │   ├── chat-page.component.spec.ts
│       │       │   │   │   │   └── chat-page.component.html
│       │       │   │   │   └── session-list-page/
│       │       │   │   │       └── session-list-page.component.ts
│       │       │   │   └── components/
│       │       │   │       ├── chat-input/
│       │       │   │       │   ├── chat-input.component.ts
│       │       │   │       │   └── chat-input.component.spec.ts
│       │       │   │       ├── chat-message/
│       │       │   │       │   └── chat-message.component.ts
│       │       │   │       ├── streaming-message/
│       │       │   │       │   └── streaming-message.component.ts
│       │       │   │       └── persona-selector/
│       │       │   │           └── persona-selector.component.ts
│       │       │   ├── knowledge-graph/
│       │       │   │   ├── knowledge-graph.routes.ts
│       │       │   │   ├── knowledge.store.ts
│       │       │   │   ├── pages/
│       │       │   │   │   └── graph-explorer-page/
│       │       │   │   │       └── graph-explorer-page.component.ts
│       │       │   │   └── components/
│       │       │   │       ├── sigma-graph/
│       │       │   │       │   └── sigma-graph.component.ts
│       │       │   │       ├── concept-panel/
│       │       │   │       │   └── concept-panel.component.ts
│       │       │   │       └── search-bar/
│       │       │   │           └── search-bar.component.ts
│       │       │   ├── personas/
│       │       │   │   ├── personas.routes.ts
│       │       │   │   └── pages/
│       │       │   │       └── persona-selection-page/
│       │       │   │           └── persona-selection-page.component.ts
│       │       │   ├── admin/
│       │       │   │   ├── admin.routes.ts
│       │       │   │   ├── tenant-admin/
│       │       │   │   │   ├── pages/
│       │       │   │   │   │   ├── team-management/
│       │       │   │   │   │   ├── billing/
│       │       │   │   │   │   └── settings/
│       │       │   │   │   └── tenant-admin.routes.ts
│       │       │   │   └── platform-admin/
│       │       │   │       ├── pages/
│       │       │   │       │   ├── tenant-management/
│       │       │   │       │   ├── platform-config/
│       │       │   │       │   │   ├── llm-config/
│       │       │   │       │   │   ├── vector-db-config/
│       │       │   │       │   │   ├── voice-config/
│       │       │   │       │   │   └── api-keys/
│       │       │   │       │   └── cost-dashboard/
│       │       │   │       └── platform-admin.routes.ts
│       │       │   └── settings/
│       │       │       ├── settings.routes.ts
│       │       │       └── pages/
│       │       │           └── user-settings-page/
│       │       │               └── user-settings-page.component.ts
│       │       └── shared/
│       │           └── components/
│       │               ├── layout/
│       │               │   ├── sidebar/
│       │               │   ├── header/
│       │               │   └── main-layout/
│       │               ├── loading/
│       │               │   ├── skeleton-loader/
│       │               │   └── spinner/
│       │               └── feedback/
│       │                   ├── toast/
│       │                   └── error-message/
│       ├── public/
│       │   ├── favicon.ico
│       │   └── assets/
│       │       ├── images/
│       │       │   └── personas/             # Persona avatar images
│       │       └── icons/
│       ├── Dockerfile
│       ├── project.json
│       └── tsconfig.app.json
│
├── libs/
│   └── shared/
│       ├── types/                            # Shared TypeScript interfaces
│       │   ├── src/
│       │   │   ├── index.ts                  # Public API
│       │   │   ├── api/
│       │   │   │   ├── api-response.types.ts
│       │   │   │   ├── problem-details.types.ts
│       │   │   │   └── pagination.types.ts
│       │   │   ├── entities/
│       │   │   │   ├── user.types.ts
│       │   │   │   ├── tenant.types.ts
│       │   │   │   ├── chat.types.ts
│       │   │   │   ├── persona.types.ts
│       │   │   │   └── concept.types.ts
│       │   │   ├── dto/
│       │   │   │   ├── create-message.dto.ts
│       │   │   │   └── create-session.dto.ts
│       │   │   └── enums/
│       │   │       ├── user-role.enum.ts
│       │   │       ├── persona-type.enum.ts
│       │   │       └── message-status.enum.ts
│       │   └── project.json
│       │
│       ├── ai-gateway/                       # AI Service Abstractions
│       │   ├── src/
│       │   │   ├── index.ts
│       │   │   ├── ai-gateway.service.ts
│       │   │   ├── ai-gateway.module.ts
│       │   │   ├── providers/
│       │   │   │   ├── llm/
│       │   │   │   │   ├── llm-provider.interface.ts
│       │   │   │   │   ├── llama.provider.ts
│       │   │   │   │   └── openai.provider.ts
│       │   │   │   ├── tts/
│       │   │   │   │   ├── tts-provider.interface.ts
│       │   │   │   │   └── azure-tts.provider.ts
│       │   │   │   └── image/
│       │   │   │       ├── image-provider.interface.ts
│       │   │   │       └── dalle.provider.ts
│       │   │   ├── queue/
│       │   │   │   ├── request-queue.service.ts
│       │   │   │   └── cost-tracker.service.ts
│       │   │   └── circuit-breaker/
│       │   │       └── circuit-breaker.service.ts
│       │   └── project.json
│       │
│       ├── tenant-context/                   # Multi-tenancy (NestJS)
│       │   ├── src/
│       │   │   ├── index.ts
│       │   │   ├── tenant-context.module.ts
│       │   │   ├── tenant-prisma.service.ts
│       │   │   ├── tenant.middleware.ts
│       │   │   └── decorators/
│       │   │       └── tenant-id.decorator.ts
│       │   └── project.json
│       │
│       ├── ui/                               # Shared Angular Components
│       │   ├── src/
│       │   │   ├── index.ts
│       │   │   ├── button/
│       │   │   │   └── button.component.ts
│       │   │   ├── input/
│       │   │   │   └── input.component.ts
│       │   │   ├── card/
│       │   │   │   └── card.component.ts
│       │   │   ├── modal/
│       │   │   │   └── modal.component.ts
│       │   │   └── avatar/
│       │   │       └── avatar.component.ts
│       │   └── project.json
│       │
│       ├── events/                           # WebSocket Event Definitions
│       │   ├── src/
│       │   │   ├── index.ts
│       │   │   ├── chat.events.ts
│       │   │   ├── notification.events.ts
│       │   │   └── types/
│       │   │       ├── chat-event.types.ts
│       │   │       └── notification-event.types.ts
│       │   └── project.json
│       │
│       └── testing/                          # Mock Factories & Test Utils
│           ├── src/
│           │   ├── index.ts
│           │   ├── factories/
│           │   │   ├── user.factory.ts
│           │   │   ├── tenant.factory.ts
│           │   │   ├── chat-session.factory.ts
│           │   │   └── message.factory.ts
│           │   └── mocks/
│           │       ├── prisma.mock.ts
│           │       └── auth.mock.ts
│           └── project.json
│
├── tools/
│   ├── generators/                           # Custom Nx generators
│   └── scripts/
│       ├── seed-concepts.ts                  # Seed 600 business concepts
│       └── create-tenant-db.ts               # Provision new tenant DB
│
├── docker/
│   ├── docker-compose.yml                    # Local development
│   ├── docker-compose.test.yml               # CI testing
│   └── nginx/
│       └── nginx.conf                        # Reverse proxy config
│
├── docs/
│   ├── architecture/
│   │   └── decisions/                        # ADR files
│   ├── api/
│   │   └── openapi.yaml                      # OpenAPI spec (auto-generated)
│   └── onboarding/
│       └── getting-started.md
│
├── .env.example                              # Example environment variables
├── .eslintrc.json                            # ESLint configuration
├── .prettierrc                               # Prettier configuration
├── nx.json                                   # Nx workspace configuration
├── package.json                              # Root package.json
├── tsconfig.base.json                        # Base TypeScript config
└── README.md
```

### Architectural Boundaries

**API Boundaries:**

| Boundary | Scope | Access Control |
|----------|-------|----------------|
| `/api/auth/*` | Auth0 callbacks, token refresh | Public |
| `/api/registration/*` | Tenant registration | Public |
| `/api/onboarding/*` | Quick-win onboarding | Authenticated users |
| `/api/v1/conversations/*` | AI conversations | Authenticated users |
| `/api/v1/personas/*` | Persona selection | Authenticated users |
| `/api/v1/knowledge/*` | Concept graph queries | Authenticated users |
| `/api/v1/memory/*` | Persistent memory | Authenticated users |
| `/api/v1/notes/*` | Structured notes | Authenticated users |
| `/api/admin/llm-config/*` | LLM provider configuration | Platform Owner only |
| `/api/v1/admin/*` | Data integrity, platform admin | Platform Owner only |
| `/api/health` | Health checks | Public |
| `/ws/chat` | Streaming AI responses | Authenticated users |

**Component Boundaries (Frontend):**

```
┌─────────────────────────────────────────────────────────────┐
│                        App Shell                             │
│  ┌─────────────┐ ┌─────────────────────────────────────────┐│
│  │   Sidebar   │ │              Router Outlet               ││
│  │  (Global)   │ │  ┌─────────────────────────────────────┐ ││
│  │             │ │  │         Feature Module              │ ││
│  │  - Chat     │ │  │  ┌───────────┐  ┌───────────────┐  │ ││
│  │  - Graph    │ │  │  │   Pages   │  │  Components   │  │ ││
│  │  - Admin    │ │  │  │ (routed)  │  │(presentational)│  │ ││
│  │  - Settings │ │  │  └───────────┘  └───────────────┘  │ ││
│  │             │ │  │                                     │ ││
│  └─────────────┘ │  │  ┌───────────┐  ┌───────────────┐  │ ││
│                  │  │  │   Store   │  │   Services    │  │ ││
│                  │  │  │ (signals) │  │    (API)      │  │ ││
│                  │  │  └───────────┘  └───────────────┘  │ ││
│                  │  └─────────────────────────────────────┘ ││
│                  └─────────────────────────────────────────┘│
│  ┌──────────────────────────────────────────────────────────┐│
│  │                    Core Services                          ││
│  │  Auth | Tenant | WebSocket | Error | API Interceptors    ││
│  └──────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

**Service Boundaries (Backend):**

```
┌──────────────────────────────────────────────────────────────┐
│                      NestJS API Gateway                       │
│  ┌────────────────────────────────────────────────────────┐  │
│  │              Common (Guards, Interceptors)              │  │
│  └────────────────────────────────────────────────────────┘  │
│                              │                                │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────────────┐│
│  │   Auth   │ │   Chat   │ │Knowledge │ │      Admin       ││
│  │  Module  │ │  Module  │ │  Module  │ │      Module      ││
│  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────────┬─────────┘│
│       │            │            │                │           │
│  ┌────▼────────────▼────────────▼────────────────▼─────────┐│
│  │              libs/shared/tenant-context                  ││
│  │         (Tenant-aware Prisma, Middleware)                ││
│  └──────────────────────────────────────────────────────────┘│
│                              │                                │
│  ┌──────────────────────────────────────────────────────────┐│
│  │                  libs/shared/ai-gateway                   ││
│  │    (LLM, TTS, Image providers with queue & metering)     ││
│  └──────────────────────────────────────────────────────────┘│
└──────────────────────────────────────────────────────────────┘
                               │
        ┌──────────────────────┼──────────────────────┐
        ▼                      ▼                      ▼
┌──────────────┐      ┌──────────────┐      ┌──────────────┐
│  Tenant DB   │      │ Platform DB  │      │   Qdrant     │
│ (per tenant) │      │   (shared)   │      │ (Vector DB)  │
└──────────────┘      └──────────────┘      └──────────────┘
```

**Data Boundaries:**

| Database | Contains | Access Pattern |
|----------|----------|----------------|
| **Platform DB** | Tenants, Platform Config, Billing, Shared Concepts | Platform-wide queries |
| **Tenant DB** (per tenant) | Users, Chat Sessions, Messages, Client Memory | Tenant-scoped via middleware |
| **Qdrant** | Concept embeddings, Query embeddings | Tenant-scoped collections |
| **Upstash Redis** | Sessions, Cache, WebSocket pub/sub | Key prefixed by tenant |

### Requirements to Structure Mapping

**Feature Mapping:**

| Feature/Epic | Backend Location | Frontend Location |
|--------------|------------------|-------------------|
| **AI Chat** | `apps/api/src/modules/chat/` | `apps/web/src/app/features/chat/` |
| **Knowledge Graph** | `apps/api/src/modules/knowledge/` | `apps/web/src/app/features/knowledge-graph/` |
| **Personas** | `apps/api/src/modules/personas/` | `apps/web/src/app/features/personas/` |
| **Team Management** | `apps/api/src/modules/users/` | `apps/web/src/app/features/admin/tenant-admin/` |
| **Platform Config** | `apps/api/src/modules/admin/` | `apps/web/src/app/features/admin/platform-admin/` |
| **Integrations** | `apps/api/src/modules/integrations/` | `apps/web/src/app/features/settings/` |
| **Voice I/O** | `libs/shared/ai-gateway/providers/tts/` | `apps/web/src/app/features/chat/components/` |
| **Image Gen** | `libs/shared/ai-gateway/providers/image/` | `apps/web/src/app/features/chat/components/` |

**Cross-Cutting Concerns Mapping:**

| Concern | Backend Location | Frontend Location |
|---------|------------------|-------------------|
| **Authentication** | `apps/api/src/modules/auth/` | `apps/web/src/app/core/auth/` |
| **Multi-tenancy** | `libs/shared/tenant-context/` | `apps/web/src/app/core/tenant/` |
| **Error Handling** | `apps/api/src/common/filters/` | `apps/web/src/app/core/error/` |
| **Logging** | `apps/api/src/common/interceptors/` | Console + Sentry |
| **WebSocket** | `apps/api/src/modules/chat/chat.gateway.ts` | `apps/web/src/app/core/websocket/` |
| **Shared Types** | `libs/shared/types/` | `libs/shared/types/` |
| **UI Components** | N/A | `libs/shared/ui/` |

### Integration Points

**Internal Communication:**

```
Frontend ──HTTP──▶ NestJS Controllers ──▶ Services ──▶ Prisma ──▶ PostgreSQL
    │                                        │
    └──WebSocket──▶ Chat Gateway ◀───────────┘
                         │
                         ▼
                libs/shared/ai-gateway
                    │         │
          ┌─────────┘         └─────────┐
          ▼                             ▼
    Local Llama                   Cloud Fallback
   (8B/70B models)               (OpenAI/Anthropic)
```

**External Integrations:**

| Integration | Service Location | Trigger |
|-------------|------------------|---------|
| **Auth0** | `apps/api/src/modules/auth/` | Login/logout, token refresh |
| **Stripe** | `apps/api/src/modules/integrations/stripe/` | Subscription events |
| **HubSpot** | `apps/api/src/modules/integrations/hubspot/` | CRM sync, contact updates |
| **Slack** | `apps/api/src/modules/integrations/slack/` | Workflow embeds |
| **Azure TTS** | `libs/shared/ai-gateway/providers/tts/` | Voice output requests |
| **DALL-E** | `libs/shared/ai-gateway/providers/image/` | Image generation requests |
| **Qdrant** | `apps/api/src/modules/knowledge/` | Vector search queries |
| **Sentry** | Global (both apps) | Error reporting |

**Data Flow:**

```
User Input
    │
    ▼
┌─────────────────┐
│ Angular Web App │
│  (chat-input)   │
└────────┬────────┘
         │ POST /api/v1/conversations/:id/messages
         ▼
┌─────────────────┐
│  Chat Controller│
│  + Tenant Guard │
└────────┬────────┘
         │
         ▼
┌─────────────────┐     ┌─────────────────┐
│  Chat Service   │────▶│ Knowledge Service│
└────────┬────────┘     │ (Vector Search)  │
         │              └─────────┬────────┘
         │                        │ Relevant concepts
         ▼                        ▼
┌─────────────────────────────────────────┐
│           libs/shared/ai-gateway         │
│  ┌─────────────┐  ┌─────────────────┐   │
│  │ Cost Tracker│  │ Circuit Breaker │   │
│  └─────────────┘  └─────────────────┘   │
│                                          │
│  ┌─────────────────────────────────┐    │
│  │         Request Queue           │    │
│  └─────────────┬───────────────────┘    │
│                │                         │
│    ┌───────────┴───────────┐            │
│    ▼                       ▼            │
│  Local Llama         Cloud Fallback     │
│  (primary)           (if timeout)       │
└────────────────────────┬────────────────┘
                         │ Streaming response
                         ▼
┌─────────────────────────────────────────┐
│           Chat Gateway (Socket.io)       │
│  emit('chat:message-chunk', { ... })    │
└────────────────────────┬────────────────┘
                         │ WebSocket
                         ▼
┌─────────────────────────────────────────┐
│         Angular Web App                  │
│  streaming-message.component.ts          │
│  (real-time display)                     │
└─────────────────────────────────────────┘
```

### Development Workflow Integration

**Local Development:**

```bash
# Start all services
docker compose up -d postgres redis qdrant

# Run API in watch mode
nx serve api

# Run Web in watch mode (separate terminal)
nx serve web

# Access:
# - Web: http://localhost:4200
# - API: http://localhost:3000
# - API Docs: http://localhost:3000/api/docs
```

**Build Process:**

```bash
# Lint affected
nx affected:lint

# Test affected
nx affected:test

# Build affected (production)
nx affected:build --configuration=production

# Build outputs:
# - apps/api → dist/apps/api/
# - apps/web → dist/apps/web/
```

**Deployment:**

```bash
# Railway deploys from Dockerfiles:
# - apps/api/Dockerfile → api service
# - apps/web/Dockerfile → web service

# Environment variables set in Railway dashboard
# Secrets reference GitHub Secrets for CI
```

## Architecture Validation Results

### Coherence Validation ✅

**Decision Compatibility:**

| Decision Pair | Compatibility | Notes |
|---------------|---------------|-------|
| Angular 21 + NestJS | ✅ Excellent | Both TypeScript, shared types via Nx |
| Prisma + PostgreSQL | ✅ Excellent | First-class support, type-safe queries |
| Socket.io + Redis | ✅ Excellent | Redis adapter for horizontal scaling |
| Auth0 + JWT | ✅ Excellent | Standard integration pattern |
| Nx + Railway | ✅ Good | Docker builds from Nx output |
| Native HTML + Tailwind CSS | ✅ Good | ADR-001: Spartan UI abandoned, native HTML with pure CSS classes |

All technology versions are compatible. No conflicts detected.

**Pattern Consistency:**

- ✅ Naming conventions align with Angular/NestJS style guides
- ✅ API patterns (REST + WebSocket) supported by chosen tech
- ✅ State management (Signals) is native to Angular 21
- ✅ Error handling (RFC 7807) supported by NestJS interceptors
- ✅ Multi-tenancy pattern supported by Prisma's multi-datasource capability

**Structure Alignment:**

- ✅ Nx monorepo structure supports all shared libraries
- ✅ Feature-based organization matches both Angular and NestJS patterns
- ✅ Test co-location follows Nx conventions
- ✅ Integration boundaries clearly defined between modules

### Requirements Coverage Validation ✅

**Functional Requirements Coverage:**

| PRD Requirement | Architectural Support |
|-----------------|----------------------|
| **6 AI Personas** | `apps/api/src/modules/personas/` + AI Gateway with persona configuration |
| **600 Concepts KB** | `libs/shared/ai-gateway/` + Qdrant + hierarchical embeddings |
| **Client Memory** | Tenant DB schema with `ChatSession` + `ClientMemory` models |
| **Voice I/O** | `libs/shared/ai-gateway/providers/tts/` (Whisper STT, Azure TTS) |
| **Image Generation** | `libs/shared/ai-gateway/providers/image/` (DALL-E) |
| **HubSpot Integration** | `apps/api/src/modules/integrations/hubspot/` |
| **Slack Embed** | `apps/api/src/modules/integrations/slack/` |
| **Value Tracking** | Cost tracker in AI Gateway + analytics endpoints |

**Non-Functional Requirements Coverage:**

| NFR | Architectural Support |
|-----|----------------------|
| **SOC 2 Compliance** | Auth0 (certified), physical tenant isolation, audit logging |
| **Sub-5-min First Value** | Streaming responses, optimistic UI, edge caching |
| **99.9% Availability** | Health checks, circuit breakers, Redis failover |
| **WCAG 2.1 AA** | Native HTML semantic elements, ARIA attributes, Angular a11y features |
| **Per-Tenant Cost Control** | Cost tracker service, budget caps, rate limiting |
| **Physical Data Isolation** | Separate PostgreSQL databases per tenant |

**UX Specification Coverage:**

| UX Journey | Architectural Support |
|------------|----------------------|
| **First-Time User** | Onboarding flow in `apps/web/src/app/features/personas/` |
| **Returning User** | Session persistence in Redis, chat history in Tenant DB |
| **Knowledge Explorer** | `apps/web/src/app/features/knowledge-graph/` with Sigma.js |
| **Tenant Owner Admin** | `apps/web/src/app/features/admin/tenant-admin/` |
| **Platform Owner Admin** | `apps/web/src/app/features/admin/platform-admin/` |

### Implementation Readiness Validation ✅

**Decision Completeness:**

| Aspect | Status | Notes |
|--------|--------|-------|
| Technology versions | ✅ Complete | All versions specified (PostgreSQL 16.x, Prisma 5.x, etc.) |
| API design | ✅ Complete | REST endpoints, WebSocket events, error formats defined |
| Data models | ✅ Complete | Prisma schema structure, ID prefixes, relationships |
| Auth flow | ✅ Complete | Auth0 integration, JWT claims, RBAC roles |
| Deployment | ✅ Complete | Railway + GitHub Actions pipeline defined |

**Structure Completeness:**

| Aspect | Status | Notes |
|--------|--------|-------|
| Directory structure | ✅ Complete | 150+ files/directories specified |
| Module boundaries | ✅ Complete | Clear separation between features |
| Shared libraries | ✅ Complete | 6 libs defined with public APIs |
| Test organization | ✅ Complete | Co-located tests with e2e in `__tests__/` |

**Pattern Completeness:**

| Aspect | Status | Notes |
|--------|--------|-------|
| Naming conventions | ✅ Complete | 32 conflict points standardized |
| API response format | ✅ Complete | `ApiResponse<T>` + RFC 7807 errors |
| State management | ✅ Complete | Signal patterns with examples |
| Error handling | ✅ Complete | Global filters + interceptors |
| WebSocket events | ✅ Complete | Event constants with typed payloads |

### Gap Analysis Results

**Critical Gaps:** None identified ✅

**Important Gaps (Addressed in Architecture):**

| Gap | Resolution |
|-----|------------|
| Connection pooling for multi-tenant | Documented TenantPrismaService pattern |
| Auth0 fallback | Graceful degradation with cached JWTs |
| Health checks | NestJS Terminus endpoint defined |
| Correlation IDs | Interceptor pattern documented |

**Nice-to-Have Gaps (Future Enhancement):**

| Gap | Recommendation |
|-----|----------------|
| API versioning strategy | Add `/v2` prefix when breaking changes needed |
| Feature flags | Consider LaunchDarkly or custom flags post-MVP |
| A/B testing | Implement after user base grows |
| CDN for static assets | Evaluate Cloudflare after traffic patterns known |

### Validation Issues Addressed

No critical validation issues were found. The architecture was built collaboratively with:

- **ADR Analysis:** 5 key architectural decisions validated by 3 architect personas
- **Pre-mortem Analysis:** 5 failure scenarios identified with mitigations
- **Party Mode Reviews:** Starter template and architectural decisions reviewed by 4-5 agents

### Architecture Completeness Checklist

**✅ Requirements Analysis**

- [x] Project context thoroughly analyzed (PRD, UX Spec, Product Brief)
- [x] Scale and complexity assessed (High - enterprise SaaS)
- [x] Technical constraints identified (SOC 2, Angular, multi-tenancy)
- [x] Cross-cutting concerns mapped (8 concerns documented)

**✅ Architectural Decisions**

- [x] Critical decisions documented with versions
- [x] Technology stack fully specified (Angular 21, NestJS, PostgreSQL, Prisma)
- [x] Integration patterns defined (Auth0, Stripe, HubSpot, Slack)
- [x] Performance considerations addressed (caching, streaming, lazy loading)

**✅ Implementation Patterns**

- [x] Naming conventions established (32 patterns)
- [x] Structure patterns defined (co-located tests, feature modules)
- [x] Communication patterns specified (WebSocket events, API responses)
- [x] Process patterns documented (error handling, loading states, validation)

**✅ Project Structure**

- [x] Complete directory structure defined (150+ files)
- [x] Component boundaries established (API boundaries table)
- [x] Integration points mapped (internal + external)
- [x] Requirements to structure mapping complete

### Architecture Readiness Assessment

**Overall Status:** ✅ READY FOR IMPLEMENTATION

**Confidence Level:** HIGH

- All decisions validated for compatibility
- All PRD/UX requirements have architectural support
- Comprehensive patterns prevent AI agent conflicts
- Project structure is specific and complete

**Key Strengths:**

1. **Type Safety End-to-End:** Shared types in `libs/shared/types/` prevent contract drift
2. **Scalable Multi-Tenancy:** Physical isolation pattern with clear routing
3. **AI-First Design:** Dedicated AI Gateway with cost tracking and circuit breakers
4. **Developer Experience:** Nx affected builds, hot reload, co-located tests
5. **Compliance Ready:** SOC 2 considerations built into architecture

**Areas for Future Enhancement:**

1. **Observability:** Add OpenTelemetry for distributed tracing post-MVP
2. **Caching Strategy:** Implement semantic query caching after usage patterns emerge
3. **Read Replicas:** Add when query load justifies the complexity
4. **Multi-Region:** Plan when user base expands geographically

### Implementation Handoff

**AI Agent Guidelines:**

1. **ALWAYS** use types from `libs/shared/types/` - never create duplicate interfaces
2. **ALWAYS** follow naming conventions in this document - no exceptions
3. **ALWAYS** use `ApiResponse<T>` wrapper for API endpoints
4. **ALWAYS** implement error handling with RFC 7807 ProblemDetails
5. **ALWAYS** use Angular Signals for component state - no BehaviorSubjects
6. **ALWAYS** co-locate tests with source files
7. **ALWAYS** use prefixed IDs (usr_, tnt_, sess_, msg_, cpt_, prs_)

**First Implementation Priority:**

```bash
# Sprint 0: Initialize workspace
npx create-nx-workspace@latest mentor-ai --preset=nest --appName=api --nxCloud=skip
npm i -D @nx/angular
nx g @nx/angular:app web --style=css --routing=true --standalone=true
nx g @nx/angular:setup-tailwind web
# Spartan UI removed (see ADR-001) — using native HTML + Tailwind CSS
nx g @nx/js:lib shared/types --bundler=swc
nx g @nx/js:lib shared/ai-gateway --bundler=swc
nx g @nx/nest:lib shared/tenant-context --buildable
nx g @nx/angular:lib shared/ui --standalone --style=css
nx g @nx/nest:lib shared/events --buildable
nx g @nx/js:lib shared/testing --bundler=swc
```

**Verification Command:**

```bash
# After initialization, verify:
nx serve api  # Should start on port 3000
nx serve web  # Should start on port 4200
nx run-many --target=test --all  # All tests should pass
```

## Architecture Completion Summary

### Workflow Completion

**Architecture Decision Workflow:** COMPLETED ✅
**Total Steps Completed:** 8
**Date Completed:** 2026-02-04
**Document Location:** `_bmad-output/planning-artifacts/architecture.md`

### Final Architecture Deliverables

**📋 Complete Architecture Document**

- All architectural decisions documented with specific versions
- Implementation patterns ensuring AI agent consistency
- Complete project structure with all files and directories
- Requirements to architecture mapping
- Validation confirming coherence and completeness

**🏗️ Implementation Ready Foundation**

- 25+ architectural decisions made
- 32 implementation patterns defined
- 150+ files/directories specified
- 100% requirements coverage

**📚 AI Agent Implementation Guide**

- Technology stack with verified versions
- Consistency rules that prevent implementation conflicts
- Project structure with clear boundaries
- Integration patterns and communication standards

### Quality Assurance Checklist

**✅ Architecture Coherence**

- [x] All decisions work together without conflicts
- [x] Technology choices are compatible
- [x] Patterns support the architectural decisions
- [x] Structure aligns with all choices

**✅ Requirements Coverage**

- [x] All functional requirements are supported
- [x] All non-functional requirements are addressed
- [x] Cross-cutting concerns are handled
- [x] Integration points are defined

**✅ Implementation Readiness**

- [x] Decisions are specific and actionable
- [x] Patterns prevent agent conflicts
- [x] Structure is complete and unambiguous
- [x] Examples are provided for clarity

### Project Success Factors

**🎯 Clear Decision Framework**
Every technology choice was made collaboratively with clear rationale, ensuring all stakeholders understand the architectural direction.

**🔧 Consistency Guarantee**
Implementation patterns and rules ensure that multiple AI agents will produce compatible, consistent code that works together seamlessly.

**📋 Complete Coverage**
All project requirements are architecturally supported, with clear mapping from business needs to technical implementation.

**🏗️ Solid Foundation**
The chosen starter template and architectural patterns provide a production-ready foundation following current best practices.

---

## Appendix: Architecture Decision Records (ADRs)

### ADR-001: Replace Spartan UI with Native HTML + Tailwind CSS

**Date:** 2026-02-09
**Status:** Accepted
**Deciders:** Development team via BMAD Party Mode review

**Context:**
The original architecture specified Spartan UI (@spartan-ng/ui + @spartan-ng/brain) as the component library — an Angular port of shadcn/ui. During implementation, we discovered that **Tailwind CSS v4 does not process utility classes inside Angular inline templates** (components using `template:` and `styles:` in the `@Component` decorator). Since Spartan UI components rely on Tailwind utility classes applied via Angular templates, they render as unstyled HTML.

**Decision:**
Replace Spartan UI with native HTML elements styled using pure CSS class definitions in component `styles` blocks, with Tailwind's design token values applied manually via CSS custom properties.

**Consequences:**
- All components use native `<button>`, `<input>`, `<div>` etc. instead of `<brn-button>`, `<hlm-input>`
- Design tokens (#0D0D0D base, #1A1A1A surface, #3B82F6 primary, etc.) applied via CSS classes, not Tailwind utilities
- `@ng-icons/core` NgIcon component also abandoned in favor of inline SVGs
- WCAG 2.1 AA accessibility must be manually ensured (no Spartan a11y primitives)
- Smaller bundle size (no Spartan dependencies)

**Alternatives Considered:**
1. Move all components to external template files — rejected (major refactor, Angular standalone pattern prefers inline)
2. Wait for Tailwind v4 fix — rejected (no timeline from Tailwind team for Angular inline template support)
3. Use CSS Modules — rejected (not natively supported in Angular standalone components)

### ADR-002: Global Exception Filter with RFC 7807 ProblemDetails

**Date:** 2026-02-09
**Status:** Accepted
**Deciders:** Development team via BMAD Party Mode review

**Context:**
Controllers handled errors ad-hoc with inconsistent response shapes. Some used RFC 7807-like objects, some returned raw NestJS exceptions, some used custom shapes. Correlation IDs were manually extracted in every controller method.

**Decision:**
Register a global `AllExceptionsFilter` in `main.ts` that catches all exceptions and formats them as RFC 7807 ProblemDetails with automatic `correlationId` extraction from `X-Correlation-Id` request header.

**Consequences:**
- All error responses are now `application/problem+json` with `{ type, title, status, detail, instance, correlationId? }`
- Controllers that already threw RFC 7807 shape are preserved (filter detects and passes through)
- ValidationPipe errors automatically formatted with `errors[]` array containing field-level details
- 500 errors logged with full stack trace; 4xx errors logged at warn level
- Zero changes required in existing controllers — filter is purely additive

---

**Architecture Status:** READY FOR IMPLEMENTATION ✅

**Next Phase:** Begin implementation using the architectural decisions and patterns documented herein.

**Document Maintenance:** Update this architecture when major technical decisions are made during implementation.

