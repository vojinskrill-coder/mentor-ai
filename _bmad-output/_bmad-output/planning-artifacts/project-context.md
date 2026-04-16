---
project_name: 'Mentor AI + Autonomous Business Brain'
user_name: 'Tanjav'
date: '2026-02-06'
sections_completed: ['technology_stack', 'language_rules', 'framework_rules', 'testing_rules', 'code_quality_rules', 'workflow_rules', 'critical_rules', 'usage_guidelines', 'extension_rules']
status: 'complete'
rule_count: 105
existing_patterns_found: 32
party_mode_enhancements: 12
extension_rules_added: 20
optimized_for_llm: true
source_documents:
  - "_bmad-output/planning-artifacts/architecture.md"
  - "_bmad-output/planning-artifacts/prd.md"
  - "_bmad-output/planning-artifacts/ux-design-specification.md"
  - "_bmad-output/planning-artifacts/autonomous-business-brain-architecture.md"
---

# Project Context for AI Agents

_This file contains critical rules and patterns that AI agents must follow when implementing code in this project. Focus on unobvious details that agents might otherwise miss._

---

## Technology Stack & Versions

| Category | Technology | Version | Notes |
|----------|------------|---------|-------|
| **Language** | TypeScript | 5.x | Strict mode enabled |
| **Runtime** | Node.js | 20 LTS | Backend runtime |
| **Frontend** | Angular | 21.x | Standalone components, Signals |
| **Backend** | NestJS | Latest | Modular monolith |
| **Database** | PostgreSQL | 16.x | Physical tenant isolation |
| **ORM** | Prisma | 5.x | Type-safe, multi-datasource |
| **Cache** | Upstash Redis | 7.x | Serverless, pub/sub |
| **Vector DB** | Qdrant | 1.x | BGE-M3 embeddings |
| **Build** | Nx | Latest | Monorepo, affected builds |
| **Styling** | Tailwind CSS | v4 | JIT compilation |
| **Components** | Native HTML + CSS | N/A | ADR-001: Spartan UI abandoned |
| **Auth** | Auth0 | Latest | SOC 2 certified |
| **Real-time** | Socket.io | Latest | Redis adapter |
| **Testing** | Jest + Playwright | Latest | Unit + E2E |

---

## Critical Implementation Rules

### TypeScript Rules

**Configuration:**
- `strict: true` is mandatory in all tsconfig files
- Enable `strictNullChecks`, `noImplicitAny`, `noImplicitReturns`
- Use `@ts-expect-error` over `@ts-ignore` (requires explanation)

**Import/Export:**
- Use barrel exports (`index.ts`) for all shared libraries
- Import shared types ONLY from `@mentor-ai/shared/types` - never duplicate
- Use type-only imports: `import type { User } from '@mentor-ai/shared/types'`
- Path aliases: `@mentor-ai/shared/*` maps to `libs/shared/*/src`

**Import Order (ESLint enforced):**
1. Angular/Node built-ins
2. Third-party (@angular, @nestjs)
3. Workspace libs (@mentor-ai/*)
4. Relative imports (./*)

**Async Patterns:**
- Always use `async/await` over raw Promises
- Never use `.then()/.catch()` chains - use try/catch
- Use `Promise.all()` for parallel operations, not sequential awaits
- Handle all promise rejections - no floating promises

**Nullability:**
- Use `null` for intentional absence (API responses, DB fields)
- Use `undefined` for unset/optional values
- Always use optional chaining `?.` over manual null checks
- Prefer nullish coalescing `??` over logical OR `||`

**Environment Variables:**
- NEVER hardcode API URLs, keys, or secrets
- Use `environment.ts` for Angular, `ConfigService` for NestJS
- All env vars must be in `.env.example` with descriptions

---

### Angular Rules

**State Management (Signals):**
- Use `signal()` for all component state - NO BehaviorSubjects
- Name signals with `$` suffix: `messages$`, `isLoading$`
- Private signals use underscore: `private readonly _sessions = signal([])`
- Use `computed()` for derived state - never manual updates
- Use `.asReadonly()` for public exposure of private signals
- Use `effect()` for side effects - NEVER subscribe in constructor
- Cleanup with `DestroyRef.onDestroy()` for manual subscriptions
- Use `linkedSignal()` for two-way binding scenarios

**Components:**
- ALL components must be standalone: `standalone: true`
- NO NgModules - use providers array in routes or component
- Use `inject()` function over constructor injection
- Selector format: `app-kebab-case` (e.g., `app-chat-message`)

**Control Flow:**
- Use new Angular control flow syntax: `@if`, `@for`, `@switch`
- NO `*ngIf`, `*ngFor`, `*ngSwitch` directives
- Track by function required for `@for`: `@for (item of items; track item.id)`

**HTTP:**
- Use interceptors for auth headers - never add manually
- All API calls go through typed services, not components
- Use `inject(HttpClient)` - never constructor injection

---

### NestJS Rules

**Module Structure:**
- One module per feature: `chat.module.ts` contains ChatController, ChatService
- Register modules in `app.module.ts` imports array
- Use `@Module({ imports: [...], controllers: [...], providers: [...], exports: [...] })`

**Dependency Injection:**
- Services must be `@Injectable()` decorated
- Export services that other modules need in `exports: []`
- Use `forRoot()` / `forRootAsync()` for configurable modules

**Guards & Interceptors:**
- Global guards registered in `main.ts` with `app.useGlobalGuards()`
- Feature guards use `@UseGuards()` decorator on controller/method
- Interceptor order matters: Correlation → Auth → Tenant → Logging

**DTOs:**
- All request bodies must have corresponding DTO class
- Use `class-validator` decorators: `@IsString()`, `@IsNotEmpty()`, etc.
- Enable validation pipe globally in `main.ts`

**Correlation IDs:**
- Every HTTP request MUST have `X-Correlation-Id` header
- Propagate to all downstream services and logs
- Generate UUID if not present in incoming request

---

### Testing Rules

**File Location:**
- Tests co-located with source: `chat.service.spec.ts` next to `chat.service.ts`
- E2E tests in `__tests__/` folder within the module
- Mock factories in `libs/shared/testing/src/factories/`

**Test Naming:**
- Pattern: `describe('ClassName')` → `describe('methodName')` → `it('should...')`
- Use present tense: "should return user" not "should have returned user"

**Coverage Thresholds (Risk-Based):**

| Service Type | Coverage | Rationale |
|--------------|----------|-----------|
| AI Gateway services | 90% | High cost impact |
| Auth/Tenant services | 85% | Security critical |
| Feature services | 80% | Standard |
| UI components | 70% | Lower risk |

**Mocking:**
- Use factories from `@mentor-ai/shared/testing`: `createMockUser()`
- Mock Prisma with `@mentor-ai/shared/testing/mocks/prisma.mock`
- Mock external services, not internal module dependencies

**Integration Test Boundaries:**
- Use test database (not mocks) for data layer tests
- Mock external APIs (Auth0, Stripe, OpenAI)
- Run in isolated Docker containers in CI

**Flaky Test Policy:**
- Flaky tests are P1 bugs - fix within 24 hours or disable
- Use `test.retry(2)` only for known external dependencies
- Never retry unit tests - flakiness indicates design issue

**Assertions:**
- Use `expect().toEqual()` for objects, `toBe()` for primitives
- Test both success and error paths
- Minimum one assertion per test

---

### Code Quality & Style Rules

**Naming Conventions:**

| Element | Pattern | Example |
|---------|---------|---------|
| Files | kebab-case | `chat-message.component.ts` |
| Classes | PascalCase | `ChatMessageComponent` |
| Interfaces | PascalCase (no I prefix) | `User`, `ChatSession` |
| Functions | camelCase | `formatMessage()` |
| Constants | SCREAMING_SNAKE | `MAX_MESSAGE_LENGTH` |
| Signals | camelCase + $ | `messages$` |
| Prisma models | PascalCase | `ChatSession` |
| DB columns | camelCase | `createdAt`, `userId` |
| API endpoints | kebab-case plural | `/chat-sessions` |
| Route params | camelCase | `:sessionId` |

**ID Prefixes (MANDATORY):**

| Entity | Prefix | Example |
|--------|--------|---------|
| User | `usr_` | `usr_cuid123` |
| Tenant | `tnt_` | `tnt_cuid456` |
| Session | `sess_` | `sess_cuid789` |
| Message | `msg_` | `msg_cuidabc` |
| Concept | `cpt_` | `cpt_cuiddef` |
| Persona | `prs_` | `prs_cuidghi` |
| ProcessWorkflow | `proc_` | `proc_cuid123` |
| ProcessStep | `pstep_` | `pstep_cuid456` |
| ProcessRun | `prun_` | `prun_cuid789` |
| ProcessStepResult | `psres_` | `psres_cuidabc` |

**Shared Types Boundary:**
- **Shared types include:** Entity interfaces, DTOs, Enums, API response wrappers
- **NOT shared:** Component props, internal service types, test fixtures

**File Organization:**
- One class per file (components, services, controllers)
- Co-locate related files: `chat-input.component.ts`, `.html`, `.spec.ts`
- Barrel exports in each library's `src/index.ts`

---

### Development Workflow Rules

**Branch Naming:**
- Feature: `feature/MENTOR-123-add-chat-history`
- Bugfix: `fix/MENTOR-456-null-pointer-chat`
- Refactor: `refactor/MENTOR-789-simplify-auth`

**Commit Messages:**
- Format: `type(scope): description`
- Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`
- Example: `feat(chat): add streaming message component`
- Keep under 72 characters

**PR Requirements:**
- [ ] All tests pass (`nx affected:test`)
- [ ] Lint passes (`nx affected:lint`)
- [ ] Types from `@mentor-ai/shared/types` used
- [ ] No console.log statements
- [ ] Co-located tests added for new code
- [ ] Link to story file included
- [ ] Screenshots for UI changes

**Story Completion Checklist:**
Before marking task complete, developer MUST verify:
- ☐ Types from `@mentor-ai/shared/types` used (no duplicates)
- ☐ ID prefixes applied (usr_, tnt_, sess_, etc.)
- ☐ Co-located tests added and passing
- ☐ No console.log or debugger statements
- ☐ RFC 7807 error format for all error responses

**Nx Commands:**
- Build: `nx affected:build --configuration=production`
- Test: `nx affected:test`
- Lint: `nx affected:lint`
- Serve API: `nx serve api`
- Serve Web: `nx serve web`

---

### Critical Don't-Miss Rules

#### ❌ NEVER Do These

1. **Duplicate types** - ALWAYS use `@mentor-ai/shared/types`
   ```typescript
   // ❌ BAD: Creating local interface
   interface User { id: string; name: string; }

   // ✅ GOOD: Import shared type
   import type { User } from '@mentor-ai/shared/types';
   ```

2. **BehaviorSubjects for state** - Use Signals
   ```typescript
   // ❌ BAD
   private sessions$ = new BehaviorSubject<Session[]>([]);

   // ✅ GOOD
   private readonly _sessions = signal<Session[]>([]);
   ```

3. **Raw error responses** - Use RFC 7807 ProblemDetails
   ```typescript
   // ❌ BAD
   throw new Error('User not found');

   // ✅ GOOD
   throw new NotFoundException({
     type: 'user_not_found',
     title: 'User Not Found',
     status: 404,
   });
   ```

4. **IDs without prefix** - All entity IDs must have type prefix
   ```typescript
   // ❌ BAD: id: 'cuid123'
   // ✅ GOOD: id: 'usr_cuid123'
   ```

5. **Direct DB access in controllers** - Use services
   ```typescript
   // ❌ BAD: this.prisma.user.findMany() in controller
   // ✅ GOOD: this.usersService.findAll()
   ```

6. **NgModules** - Use standalone components only
   ```typescript
   // ❌ BAD: @NgModule({ declarations: [...] })
   // ✅ GOOD: @Component({ standalone: true, imports: [...] })
   ```

7. **Tenant ID in application code** - Use middleware/decorators
   ```typescript
   // ❌ BAD: const tenantId = req.headers['x-tenant-id'];
   // ✅ GOOD: @TenantId() tenantId: string (decorator)
   ```

---

#### Multi-Tenancy Rules

- **EVERY** database query must be tenant-scoped
- Use `TenantPrismaService.getClient(tenantId)` - never direct Prisma
- Tenant ID comes from JWT claims, not request headers
- Platform Owner operations use Platform DB, not Tenant DBs
- NEVER query across tenant databases

**Connection Pooling Limits:**
- Max 10 connections per tenant pool
- Idle timeout: 30 seconds
- Connection acquisition timeout: 5 seconds

---

#### API Response Format

**Success Response:**
```typescript
{
  "data": { /* typed payload */ },
  "meta": { "page": 1, "pageSize": 20, "total": 100 }
}
```

**Error Response (RFC 7807):**
```typescript
{
  "type": "rate_limit_exceeded",
  "title": "Too Many Requests",
  "status": 429,
  "detail": "You exceeded 100 requests per minute",
  "correlationId": "corr_abc123"
}
```

---

#### WebSocket Events

- Event format: `domain:action` (kebab-case)
- Examples: `chat:message-send`, `chat:message-chunk`
- Define events in `libs/shared/events/` - never inline strings
- All payloads must be typed with interfaces

---

#### Deviation Policy

When rules must be broken:
1. Comment in code explaining WHY
2. Tech lead approval in PR review
3. Update to project-context.md if pattern changes permanently

---

## Usage Guidelines

**For AI Agents:**
- Read this file before implementing any code
- Follow ALL rules exactly as documented
- When in doubt, prefer the more restrictive option
- Reference architecture.md for detailed patterns and examples

**For Humans:**
- Keep this file lean and focused on agent needs
- Update when technology stack changes
- Review quarterly for outdated rules
- Remove rules that become obvious over time

---

**Last Updated:** 2026-02-06

_Generated by BMAD Method with Party Mode enhancements from Winston (Architect), Amelia (Developer), Murat (Test Architect), and Bob (Scrum Master)._

---

## Autonomous Business Brain Extension Rules

_Rules specific to the new workflow, signal, and knowledge base capabilities. These extend the base Mentor AI rules._

### LLM Tenant Isolation

**TenantContextBuilder Pattern:**
- ALL LLM calls MUST go through `TenantContextBuilder.build(tenantId, ...)`
- NEVER pass raw context to LLM - always use builder
- Every LLM call MUST include `correlationId` for tracing
- Audit every call: `{ correlationId, tenantId, contextHash, tokenCount, modelId }`

```typescript
// ❌ BAD: Direct LLM context
await this.llm.generate({ context: userContext });

// ✅ GOOD: Through TenantContextBuilder
const isolatedContext = await this.tenantContextBuilder.build(tenantId, userContext);
await this.llm.generate({ context: isolatedContext, correlationId });
```

### Workflow State Rules

**JSON State Keys:** Always camelCase (matches TypeScript interfaces)
```typescript
// ✅ GOOD
{ currentStep: "risk-assessment", completedSteps: ["validation"], lastCheckpoint: "2026-02-06T10:00:00.000Z" }

// ❌ BAD: Mixed naming
{ current_step: "...", completedSteps: [...] }
```

**WorkflowState Interface (mandatory):**
```typescript
interface WorkflowState {
  currentStep: string;
  completedSteps: string[];
  variables: Record<string, unknown>;
  lastCheckpoint: Date;  // ISO 8601 string in JSON
}
```

### Risk Classification Rules

**RiskLevel Enum (mandatory):**
```typescript
enum RiskLevel {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  REQUIRES_APPROVAL = 'REQUIRES_APPROVAL'
}

// ❌ BAD: if (risk === 'high') { ... }
// ✅ GOOD: if (risk === RiskLevel.HIGH) { ... }
```

**Classification Flow:** Rules-first, AI bumps up only (never decreases)

### Signal Source Rules

**SignalCategory Enum:**
```typescript
enum SignalCategory {
  INDUSTRY_NEWS = 'INDUSTRY_NEWS',
  COMPETITOR = 'COMPETITOR',
  MARKET_DATA = 'MARKET_DATA',
  REGULATORY = 'REGULATORY',
  CUSTOM = 'CUSTOM'  // Requires customCategoryLabel
}
```

**Circuit Breaker:** 3 failures → auto-disable, success → reset count

### Concept Hierarchy Rules

**Hierarchy Code Validation (mandatory):**
```typescript
const HIERARCHY_CODE_PATTERN = /^(\d+\.)*\d+$/;
// Valid: "1", "1.1", "2.1.1", "4.1.10"
```

### WebSocket Events (Extension)

**Naming:** Dot notation for all extension events
- `workflow.task.created`, `workflow.task.updated`, `workflow.task.completed`, `workflow.task.failed`
- `signal.received`, `signal.source.disabled`
- `concept.staleness.detected`

**Payload:** MUST include `tenantId` and `timestamp` (ISO 8601)

### ID Prefixes (Extension)

| Entity | Prefix | Example |
|--------|--------|---------|
| Workflow | `wfl_` | `wfl_cuid123` |
| WorkflowTask | `tsk_` | `tsk_cuid456` |
| SignalSource | `sig_` | `sig_cuid789` |

### Extension Anti-Patterns

```typescript
// ❌ NEVER: LLM context without tenant isolation
// ❌ NEVER: Workflow state with snake_case keys
// ❌ NEVER: Risk level as magic string
// ❌ NEVER: Timestamps without timezone
// ❌ NEVER: WebSocket events without tenantId
// ❌ NEVER: Hierarchy codes without validation
```

---

_Extension rules added: 2026-02-06_
_Source: autonomous-business-brain-architecture.md_
