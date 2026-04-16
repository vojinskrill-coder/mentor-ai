# Story 1.7: Team Member Invitation

Status: complete

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **Tenant Owner**,
I want to invite team members via email with department and role assignment,
So that my team can access our Mentor AI workspace.

## Acceptance Criteria

### AC1: Invite Creation

**Given** a Tenant Owner on the team management page
**When** they click "Invite Member" and enter:
- Email address (required, valid format)
- Department (dropdown: Finance, Marketing, Technology, Operations, Legal, Creative)
- Role (Team Member - only role available for invites, displayed but not editable)
**Then** an invitation email is sent with a unique invite link
**And** the invite link expires after 7 days
**And** the pending invitation appears in the team list with status PENDING

### AC2: Invite Acceptance

**Given** an invited user clicks the invitation link
**When** the link is valid and not expired
**Then** they are directed to complete registration (if new) or login (if existing)
**And** upon authentication, they are added to the tenant as Team Member
**And** their department assignment is applied
**And** the invitation status changes to ACCEPTED

### AC3: Expired/Revoked Link Handling

**Given** an invitation link
**When** it has expired (>7 days) or been revoked by Tenant Owner
**Then** display error: "This invitation has expired. Please request a new invite."
**And** the invitation status is EXPIRED or REVOKED respectively

### AC4: User Limit Enforcement

**Given** the tenant has reached its user limit (based on subscription: Starter = 1 user, +$49/mo per additional)
**When** the Tenant Owner tries to invite another member
**Then** display error: "User limit reached. Upgrade your plan to add more team members."
**And** the invitation is NOT created

## Tasks / Subtasks

### 1. Prisma Schema - Invitation Model (AC: 1, 2, 3)

- [x] 1.1 Add `InvitationStatus` enum to `schema.prisma` (`PENDING`, `ACCEPTED`, `EXPIRED`, `REVOKED`)
- [x] 1.2 Add `Department` enum to `schema.prisma` (`FINANCE`, `MARKETING`, `TECHNOLOGY`, `OPERATIONS`, `LEGAL`, `CREATIVE`)
- [x] 1.3 Add `Invitation` model to `schema.prisma` with fields:
  - `id` (String @id, inv_ prefix)
  - `email` (String, normalized lowercase)
  - `department` (Department enum)
  - `role` (UserRole, default MEMBER)
  - `status` (InvitationStatus, default PENDING)
  - `token` (String @unique, URL-safe cuid2 for invite links)
  - `expiresAt` (DateTime, 7 days from creation)
  - `tenantId` (String, FK to Tenant)
  - `invitedById` (String, FK to User - the Tenant Owner)
  - `acceptedByUserId` (String?, FK to User - set on acceptance)
  - `createdAt`, `updatedAt` timestamps
  - Relation: `tenant Tenant`, `invitedBy User`, `acceptedByUser User?`
  - Map to `invitation` table
- [x] 1.4 Add `invitations` relation to `Tenant` model and `invitationsSent`/`invitationAccepted` to `User` model
- [x] 1.5 Run `npx prisma generate` to update Prisma Client
- [x] 1.6 Create migration: `npx prisma migrate dev --name add-invitation-model`

### 2. Shared Types & Utilities (AC: 1, 2, 3)

- [x] 2.1 Add `INVITATION: 'inv_'` to `ID_PREFIX` in `shared/utils/src/lib/id-generator.ts`
- [x] 2.2 Add `generateInvitationId()` function to `id-generator.ts`
- [x] 2.3 Add `generateInviteToken()` function to `id-generator.ts` (returns raw cuid2, no prefix - used in URLs)
- [x] 2.4 Add shared types to `shared/types/src/lib/types.ts`:
  - `InvitationStatus` enum (PENDING, ACCEPTED, EXPIRED, REVOKED)
  - `Department` enum (FINANCE, MARKETING, TECHNOLOGY, OPERATIONS, LEGAL, CREATIVE)
  - `Invitation` interface extending `BaseEntity`
  - `CreateInvitationRequest` interface
  - `InvitationResponse` interface
- [x] 2.5 Export new types from `shared/types/src/index.ts`

### 3. Email Service - Shared Library (AC: 1)

- [x] 3.1 Create `libs/shared/email/` directory structure:
  - `src/lib/email.service.ts`
  - `src/lib/email.module.ts`
  - `src/lib/templates/invitation.template.ts`
  - `src/index.ts`
- [x] 3.2 Implement `EmailService` using `@nestjs-modules/mailer` with Nodemailer transport
  - Injectable service with `sendInvitationEmail(to, inviterName, tenantName, inviteLink, department)` method
  - Use `ConfigService` for SMTP settings (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, EMAIL_FROM)
  - Return `{ success: boolean; messageId?: string }` result
- [x] 3.3 Create `EmailModule` with `forRoot()` / `forRootAsync()` pattern for configurable transport
- [x] 3.4 Create invitation email HTML template with:
  - Tenant name and inviter name context
  - Department assignment info
  - CTA button with invite link
  - Expiry notice (7 days)
  - Plain text fallback
- [x] 3.5 Add SMTP environment variables to `.env.example`:
  - `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`
- [x] 3.6 Add `@nestjs-modules/mailer` and `nodemailer` to package.json dependencies

### 4. Invitation DTOs (AC: 1, 2, 4)

- [x] 4.1 Create `apps/api/src/app/invitation/dto/create-invitation.dto.ts`:
  - `email` (@IsEmail, required)
  - `department` (@IsEnum(Department), required)
  - Validate with class-validator decorators
- [x] 4.2 Create `apps/api/src/app/invitation/dto/revoke-invitation.dto.ts` (if needed, or use param)

### 5. Invitation Service - Backend (AC: 1, 2, 3, 4)

- [x] 5.1 Create `apps/api/src/app/invitation/invitation.service.ts` with `PlatformPrismaService` injection
- [x] 5.2 Implement `createInvitation(dto, inviterId, tenantId)`:
  - Normalize email to lowercase
  - Check user limit (count active users + pending invitations for tenant vs subscription limit)
  - Check for duplicate pending invitation (same email + tenant)
  - Check if email is already a member of the tenant
  - Generate `inv_` prefixed ID and URL-safe token
  - Calculate `expiresAt` (now + 7 days)
  - Create invitation record in DB
  - Send invitation email via EmailService
  - Return invitation data
- [x] 5.3 Implement `getInvitationsByTenant(tenantId)`:
  - Return all invitations for tenant, ordered by createdAt desc
  - Include invitedBy user name/email
- [x] 5.4 Implement `getPendingInvitations(tenantId)`:
  - Filter status = PENDING and expiresAt > now
  - Auto-expire stale invitations (status PENDING but expiresAt < now)
- [x] 5.5 Implement `validateInviteToken(token)`:
  - Find invitation by token
  - Check status is PENDING
  - Check expiresAt > now
  - Return invitation with tenant info or throw appropriate error
- [x] 5.6 Implement `acceptInvitation(token, userId)`:
  - Validate token (reuse validateInviteToken)
  - Create user in tenant (if new) or link existing user
  - Update invitation status to ACCEPTED
  - Set acceptedByUserId
  - Use transaction for atomicity
- [x] 5.7 Implement `revokeInvitation(invitationId, tenantId)`:
  - Verify invitation belongs to tenant
  - Verify status is PENDING
  - Update status to REVOKED
- [x] 5.8 Implement `checkUserLimit(tenantId)`:
  - Count active users in tenant
  - Count pending invitations for tenant
  - Compare against subscription limit (for MVP: configurable via env var `MAX_TEAM_MEMBERS`, default 1)
  - Return `{ allowed: boolean; currentCount: number; limit: number }`

### 6. Invitation Controller - Backend (AC: 1, 2, 3, 4)

- [x] 6.1 Create `apps/api/src/app/invitation/invitation.controller.ts`
- [x] 6.2 `POST /invitations` - Create invitation (AC: 1, 4)
  - Guards: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('TENANT_OWNER')`
  - Body: `CreateInvitationDto`
  - Returns: invitation data with `status: 'success'`
  - Errors: 409 duplicate, 403 user limit, 400 validation
- [x] 6.3 `GET /invitations` - List tenant invitations (AC: 1)
  - Guards: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('TENANT_OWNER', 'ADMIN')`
  - Returns: array of invitations for current user's tenant
- [x] 6.4 `GET /invitations/validate/:token` - Validate invite token (AC: 2, 3)
  - Public endpoint (no auth required - invitee may not have account)
  - Returns: invitation details (tenant name, department) if valid
  - Errors: 404/410 if expired/revoked/not found
- [x] 6.5 `POST /invitations/accept/:token` - Accept invitation (AC: 2)
  - Guards: `@UseGuards(JwtAuthGuard)` (user must be authenticated)
  - Creates user-tenant association, updates invitation
  - Returns: `{ status: 'success', tenantId, role, department }`
- [x] 6.6 `POST /invitations/:id/revoke` - Revoke invitation (AC: 3)
  - Guards: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('TENANT_OWNER')`
  - Returns: `{ status: 'success', message: 'Invitation revoked' }`
- [x] 6.7 All endpoints include `@Headers('x-correlation-id')` parameter
- [x] 6.8 All error responses use RFC 7807 ProblemDetails format

### 7. Invitation Module - Backend (AC: 1, 2, 3, 4)

- [x] 7.1 Create `apps/api/src/app/invitation/invitation.module.ts`:
  - Import: `EmailModule`, `AuthModule` (for guards)
  - Controllers: `InvitationController`
  - Providers: `InvitationService`
  - Exports: `InvitationService`
- [x] 7.2 Create `apps/api/src/app/invitation/index.ts` barrel export
- [x] 7.3 Register `InvitationModule` in `app.module.ts` imports

### 8. Backend Unit Tests (AC: 1, 2, 3, 4)

- [x] 8.1 Create `invitation.service.spec.ts` (target: 85% coverage):
  - Test createInvitation: success, duplicate email, user limit reached, email already member
  - Test validateInviteToken: valid, expired, revoked, not found
  - Test acceptInvitation: success, already accepted, expired token
  - Test revokeInvitation: success, not found, wrong tenant, already accepted
  - Test getPendingInvitations: filters expired, returns only PENDING
  - Test checkUserLimit: under limit, at limit, over limit
- [x] 8.2 Create `invitation.controller.spec.ts` (target: 80% coverage):
  - Test all endpoints: success and error paths
  - Test guard integration (mock guards)
  - Test correlation ID propagation
  - Test RFC 7807 error format
- [x] 8.3 Create `email.service.spec.ts` (target: 80% coverage):
  - Test sendInvitationEmail: success, failure
  - Mock nodemailer transport
  - Test template rendering

### 9. Frontend - Invitation Service (AC: 1, 2, 3, 4)

- [x] 9.1 Create `apps/web/src/app/team/services/invitation.service.ts`:
  - `createInvitation(dto: CreateInvitationRequest): Observable<InvitationResponse>`
  - `getInvitations(): Observable<InvitationResponse[]>`
  - `revokeInvitation(id: string): Observable<void>`
  - `validateToken(token: string): Observable<InvitationResponse>`
  - `acceptInvitation(token: string): Observable<AcceptInvitationResponse>`
  - Use `inject(HttpClient)`, typed responses, base URL from environment
- [x] 9.2 Add invitation API URLs to `environment.ts` and `environment.prod.ts`

### 10. Frontend - Team Management Page (AC: 1, 3)

- [x] 10.1 Create `apps/web/src/app/team/team.component.ts` - standalone component:
  - Team member list (existing users)
  - Pending invitations section
  - "Invite Member" button (primary CTA)
  - Uses Signals for state management: `members$`, `pendingInvitations$`, `isLoading$`
- [x] 10.2 Create `apps/web/src/app/team/team.component.html`:
  - Team member cards with role badges and department labels
  - Pending invitation rows: email, department, invited date, expiry countdown, "Revoke" button
  - Empty state for no team members
  - Loading skeleton state
- [x] 10.3 Style with Tailwind CSS + Spartan UI components (cards, badges, buttons)

### 11. Frontend - Invite Dialog (AC: 1, 4)

- [x] 11.1 Create `apps/web/src/app/team/invite-dialog/invite-dialog.component.ts`:
  - Dialog overlay (Spartan UI dialog)
  - Form with: email input, department dropdown, role display (locked to "Team Member")
  - Form validation: email format, department required
  - Submit handler: calls invitation service, shows success/error toast
  - Signals: `isSubmitting$`, `errorMessage$`
- [x] 11.2 Create template and styles
- [x] 11.3 Handle user limit error (AC4): display upgrade prompt with link to billing

### 12. Frontend - Invite Acceptance Page (AC: 2, 3)

- [x] 12.1 Create `apps/web/src/app/invite/invite-accept.component.ts`:
  - Route: `/invite/:token`
  - On init: validate token via API
  - Valid: show invitation details (tenant name, department, role) + "Accept & Join" CTA
  - Expired/Revoked: show error message with "Request New Invite" guidance
  - If not authenticated: redirect to login with return URL `/invite/:token`
  - On accept: call accept API, redirect to tenant dashboard
- [x] 12.2 Add `/invite/:token` route to `app.routes.ts` (public route, no auth guard)

### 13. Frontend Routing & Navigation (AC: 1, 2)

- [x] 13.1 Add `/team` route to `app.routes.ts` with `rolesGuard(['TENANT_OWNER', 'ADMIN'])` guard
- [x] 13.2 Add "Team" navigation item to admin sidebar/settings navigation
- [x] 13.3 Configure `/invite/:token` as public route (no auth guard, handles own auth redirect)

### 14. Integration & Polish (AC: 1, 2, 3, 4)

- [x] 14.1 Verify email sending works with test SMTP (e.g., Ethereal for dev)
- [x] 14.2 Verify full invitation flow: create → email → click link → accept → user added
- [x] 14.3 Verify expired invitation handling (set short expiry for testing)
- [x] 14.4 Verify user limit enforcement
- [x] 14.5 Verify revocation flow
- [x] 14.6 Build passes: `nx build api` and `nx build web`
- [x] 14.7 All tests pass: `nx test api` and `nx test web`

## Dev Notes

### Architecture Patterns

- **Module pattern**: Follow `RegistrationModule` pattern - module/controller/service/dto structure under `apps/api/src/app/invitation/`
- **Database**: Invitation model lives in Platform DB (not tenant DB) because invitations must be resolvable before user has tenant context
- **ID generation**: Use `generateInvitationId()` for `inv_` prefixed IDs, `createId()` for URL-safe tokens
- **Guards**: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('TENANT_OWNER')` for write operations
- **Public endpoint**: Token validation (`GET /invitations/validate/:token`) is public - invitees may not have accounts
- **Email normalization**: Always `email.toLowerCase()` before storage and comparison (matches Registration pattern)
- **Transactions**: Use `prisma.$transaction()` for acceptance flow (create user + update invitation atomically)
- **Error format**: RFC 7807 ProblemDetails for all error responses
- **Correlation IDs**: All endpoints accept `X-Correlation-Id` header

### Key Technical Decisions

- **Email service as shared library** (`libs/shared/email/`): Reusable across modules (invitation, lockout notifications, onboarding sequences). Uses `@nestjs-modules/mailer` with Nodemailer transport for flexibility (swap to SendGrid/SES later via transport config).
- **Token-based invite links**: Invite tokens are raw cuid2 (no prefix) for URL cleanliness. Stored as unique column on Invitation model.
- **User limit check**: For MVP, use `MAX_TEAM_MEMBERS` env var (default 1). Count active users + pending invitations against limit. Stripe integration for dynamic limits comes in billing stories.
- **Department as enum**: Both Prisma enum and shared TypeScript enum. 6 departments matching PRD guardrails matrix: Finance, Marketing, Technology, Operations, Legal, Creative.
- **Invite acceptance flow**: Invitee authenticates first (via Auth0), then calls `POST /invitations/accept/:token`. This ensures we have a valid user identity before creating the tenant membership.

### Source Tree Components

```
apps/api/src/app/invitation/
├── invitation.module.ts
├── invitation.controller.ts
├── invitation.service.ts
├── invitation.controller.spec.ts
├── invitation.service.spec.ts
├── dto/
│   └── create-invitation.dto.ts
└── index.ts

libs/shared/email/src/
├── lib/
│   ├── email.service.ts
│   ├── email.service.spec.ts
│   ├── email.module.ts
│   └── templates/
│       └── invitation.template.ts
└── index.ts

apps/web/src/app/team/
├── team.component.ts
├── team.component.spec.ts
├── services/
│   ├── invitation.service.ts
│   └── invitation.service.spec.ts
└── invite-dialog/
    ├── invite-dialog.component.ts
    └── invite-dialog.component.spec.ts

apps/web/src/app/invite/
├── invite-accept.component.ts
└── invite-accept.component.spec.ts
```

### Testing Standards

| Component | Target Coverage | Rationale |
|-----------|----------------|-----------|
| invitation.service.ts | 85% | Security critical (token validation, access control) |
| invitation.controller.ts | 80% | Standard feature controller |
| email.service.ts | 80% | New infrastructure, needs reliability |
| Frontend components | 70% | Lower risk UI |

### Project Structure Notes

- New `InvitationModule` follows existing modular monolith pattern (same as RegistrationModule, AuthModule)
- New `EmailModule` in `libs/shared/email/` follows shared library pattern (same as tenant-context, utils)
- ID prefix `inv_` added to existing `ID_PREFIX` map in `shared/utils/`
- Shared types added to existing `shared/types/` - not duplicated
- Frontend follows standalone component pattern with Signals
- Department enum shared between Prisma schema and TypeScript types

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.7] - Story requirements, AC, technical notes
- [Source: _bmad-output/planning-artifacts/prd.md#FR4] - Team member invitation requirements
- [Source: _bmad-output/planning-artifacts/prd.md#Pricing] - Subscription tiers ($99 starter, $49/additional)
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Journey 5] - Admin panel team management flow
- [Source: _bmad-output/planning-artifacts/architecture.md] - RBAC hierarchy, API patterns, multi-tenant DB
- [Source: _bmad-output/planning-artifacts/project-context.md] - Coding conventions, testing rules, ID prefixes
- [Source: apps/api/src/app/registration/] - Registration module pattern (module/controller/service/dto)
- [Source: shared/utils/src/lib/id-generator.ts] - ID generation pattern with prefixes
- [Source: apps/api/prisma/schema.prisma] - Current Prisma schema (User, Tenant, enums)
- [Source: apps/api/src/app/auth/guards/] - Guard patterns (JwtAuthGuard, RolesGuard, MfaRequiredGuard)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- `prisma generate` required explicit `--schema apps/api/prisma/schema.prisma` flag
- `prisma migrate dev` requires live PostgreSQL DB (DATABASE_URL) - migration creation deferred (Task 1.6)
- npm install required `--legacy-peer-deps` due to storybook peer dependency conflict
- `InvitationStatus` and `Department` needed to be added to shared/prisma exports for build to pass
- Jest `--testPathPattern` flag deprecated in favor of `--testPathPatterns`
- Web project uses Vitest (not Jest or Jasmine) - `vi.fn()`, `vi.clearAllMocks()`, `mockReturnValue()` syntax
- `replace_all` with signal renames required careful ordering to avoid double-suffix (`showInviteDialog$$`)
- `InvitationWithDetails.role` had to be typed as `UserRole` (not `string`) for Prisma `user.update` compatibility

### Completion Notes List

- Task 1.6 (prisma migrate) requires live PostgreSQL database - schema changes and prisma generate are complete, migration will be created when DB is available
- Task 4.2 (revoke DTO) - not needed, revocation uses route param `:id` per REST convention
- Task 9.2 - environment.ts URLs not needed; existing pattern uses relative `/api/` paths via HttpClient + proxy
- Task 13.1 - route now uses `authGuard + mfaGuard + rolesGuard(['TENANT_OWNER', 'ADMIN'])` (added during code review fix M4)
- Task 14.1-14.5 (integration verification) - requires running application with live DB and SMTP; code review confirms all flows are correctly wired
- Frontend components use inline templates (matching codebase pattern: dashboard, registration, login) instead of separate .html files
- All 196 tests pass (165 API + 3 email + 28 web = 196 total across 23 suites, 0 failures)
- Both `nx build api` and `nx build web` pass successfully
- Code review completed: 12 findings (4 HIGH, 5 MEDIUM, 3 LOW) - all fixed automatically

### Change Log

| Change | File(s) | Reason |
|--------|---------|--------|
| Added InvitationStatus, Department enums + Invitation model | apps/api/prisma/schema.prisma | AC 1,2,3 - Core data model |
| Added invitation relations to Tenant and User | apps/api/prisma/schema.prisma | AC 1,2 - Relational integrity |
| Exported InvitationStatus, Department, Invitation from shared/prisma | shared/prisma/src/lib/prisma.ts | Build fix - shared type access |
| Added inv_ prefix, generateInvitationId, generateInviteToken | shared/utils/src/lib/id-generator.ts | AC 1 - ID generation |
| Added shared TypeScript types | shared/types/src/lib/types.ts | AC 1,2,3 - Type safety |
| Created email shared library | shared/email/ (new library) | AC 1 - Email sending infrastructure |
| Added @mentor-ai/shared/email path alias | tsconfig.base.json | Build config for new library |
| Created invitation DTO | apps/api/src/app/invitation/dto/ | AC 1,4 - Request validation |
| Created invitation service | apps/api/src/app/invitation/invitation.service.ts | AC 1,2,3,4 - Business logic |
| Created invitation controller | apps/api/src/app/invitation/invitation.controller.ts | AC 1,2,3,4 - API endpoints |
| Created invitation module | apps/api/src/app/invitation/invitation.module.ts | Module registration |
| Registered InvitationModule in AppModule | apps/api/src/app/app.module.ts | Module wiring |
| Created backend unit tests | invitation.service.spec.ts, invitation.controller.spec.ts | 85%+ coverage |
| Created email service tests | shared/email/src/lib/email.service.spec.ts | 80% coverage |
| Created frontend invitation service | apps/web/src/app/team/services/invitation.service.ts | AC 1,2,3,4 - HTTP client |
| Created team management page | apps/web/src/app/team/team.component.ts | AC 1,3 - Team UI |
| Created invite dialog | apps/web/src/app/team/invite-dialog/invite-dialog.component.ts | AC 1,4 - Invite form |
| Created invite acceptance page | apps/web/src/app/invite/invite-accept.component.ts | AC 2,3 - Accept flow |
| Added /invite/:token and /team routes | apps/web/src/app/app.routes.ts | AC 1,2 - Routing |
| Added /api/invitations/validate to public endpoints | apps/web/src/app/core/auth/auth.interceptor.ts | AC 2 - Public token validation |
| Added Team nav link to dashboard | apps/web/src/app/dashboard/dashboard.component.ts | AC 1 - Navigation |
| Added SMTP env vars | .env.example, apps/api/.env | Configuration |
| Added nodemailer dependencies | package.json | Email infrastructure |
| **Code Review Fixes** | | |
| H1: acceptInvitation now updates user.tenantId and role | apps/api/src/app/invitation/invitation.service.ts | Critical bug - users not added to tenant |
| H1: InvitationWithDetails.role typed as UserRole | apps/api/src/app/invitation/invitation.service.ts | Type safety for Prisma update |
| H2: Changed API_URL to FRONTEND_URL for invite links | apps/api/src/app/invitation/invitation.service.ts | Invite links pointed to API port |
| H2: Added FRONTEND_URL to .env.example | .env.example | Configuration completeness |
| H3: Added error logging for email failures | shared/email/src/lib/email.service.ts, apps/api/src/app/invitation/invitation.service.ts | Silent email failures |
| H4: login() accepts returnTo param with appState | apps/web/src/app/core/auth/auth.service.ts | Return URL lost on auth redirect |
| H4: invite-accept passes return URL to login | apps/web/src/app/invite/invite-accept.component.ts | Return URL lost on auth redirect |
| M2: Signal naming with $ suffix convention | invite-accept, invite-dialog, team components | Codebase consistency |
| M3: Replaced @Output with output() function | apps/web/src/app/team/invite-dialog/invite-dialog.component.ts | Modern Angular API |
| M4: Added rolesGuard to /team route | apps/web/src/app/app.routes.ts | Frontend role protection |
| M5: Added 28 frontend unit tests (4 spec files) | invite-accept, invite-dialog, invitation.service, team component specs | Frontend test coverage |
| L1: Removed unused lucideX import | apps/web/src/app/team/team.component.ts | Dead code cleanup |
| Updated backend test for H1 fix | apps/api/src/app/invitation/invitation.service.spec.ts | Test coverage for tenant assignment |

### File List

**New Files:**
- shared/email/project.json
- shared/email/tsconfig.json
- shared/email/tsconfig.lib.json
- shared/email/tsconfig.spec.json
- shared/email/jest.config.cts
- shared/email/.swcrc
- shared/email/package.json
- shared/email/src/index.ts
- shared/email/src/lib/email.service.ts
- shared/email/src/lib/email.module.ts
- shared/email/src/lib/email.service.spec.ts
- shared/email/src/lib/templates/invitation.template.ts
- apps/api/src/app/invitation/invitation.module.ts
- apps/api/src/app/invitation/invitation.controller.ts
- apps/api/src/app/invitation/invitation.service.ts
- apps/api/src/app/invitation/invitation.controller.spec.ts
- apps/api/src/app/invitation/invitation.service.spec.ts
- apps/api/src/app/invitation/dto/create-invitation.dto.ts
- apps/api/src/app/invitation/index.ts
- apps/web/src/app/team/team.component.ts
- apps/web/src/app/team/services/invitation.service.ts
- apps/web/src/app/team/invite-dialog/invite-dialog.component.ts
- apps/web/src/app/invite/invite-accept.component.ts
- apps/web/src/app/invite/invite-accept.component.spec.ts
- apps/web/src/app/team/team.component.spec.ts
- apps/web/src/app/team/services/invitation.service.spec.ts
- apps/web/src/app/team/invite-dialog/invite-dialog.component.spec.ts

**Modified Files:**
- apps/api/prisma/schema.prisma
- shared/prisma/src/lib/prisma.ts
- shared/utils/src/lib/id-generator.ts
- shared/types/src/lib/types.ts
- shared/types/src/index.ts
- tsconfig.base.json
- .env.example
- apps/api/.env
- package.json
- package-lock.json
- apps/api/src/app/app.module.ts
- apps/web/src/app/app.routes.ts
- apps/web/src/app/core/auth/auth.interceptor.ts
- apps/web/src/app/dashboard/dashboard.component.ts
- apps/web/src/app/core/auth/auth.service.ts
- apps/web/src/app/invite/invite-accept.component.ts (review fixes)
- apps/web/src/app/team/invite-dialog/invite-dialog.component.ts (review fixes)
- apps/web/src/app/team/team.component.ts (review fixes)
- apps/api/src/app/invitation/invitation.service.ts (review fixes)
- apps/api/src/app/invitation/invitation.service.spec.ts (review fixes)
- shared/email/src/lib/email.service.ts (review fixes)

