# Story 1.8: Team Member Removal

Status: done

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **Tenant Owner**,
I want to remove team members from my workspace,
So that I can manage access when employees leave or roles change.

## Acceptance Criteria

### AC1: Removal Confirmation Modal

**Given** a Tenant Owner viewing the team list
**When** they click "Remove" on a Team Member
**Then** a confirmation modal appears with:
- Member name and email
- Warning about data reassignment
- Option to "Reassign to me" or "Archive data"

### AC2: Removal with Data Reassignment

**Given** the Tenant Owner confirms removal with "Reassign to me"
**When** the removal is processed
**Then** the member's notes and saved outputs are transferred to the Owner
**And** the member's conversations are archived (not deleted)
**And** the member loses access immediately (soft delete)
**And** an email notification is sent to the removed member

### AC3: Removal with Data Archival

**Given** the Tenant Owner confirms removal with "Archive data"
**When** the removal is processed
**Then** the member's data is archived but retained
**And** the member loses access immediately (soft delete)

### AC4: Self-Removal Prevention

**Given** a Tenant Owner tries to remove themselves
**When** they are the only Owner
**Then** display error: "You cannot remove yourself. Designate a backup Owner first."

## Tasks / Subtasks

### 1. Prisma Schema - User Soft Delete Fields (AC: 1, 2, 3)

- [x] 1.1 Add soft delete fields to `User` model in `schema.prisma`:
  - `isActive` (Boolean @default(true))
  - `removedAt` (DateTime? @map("removed_at"))
  - `removedById` (String? @map("removed_by_id"))
  - `removalReason` (String? @map("removal_reason") - stores "REASSIGNED" or "ARCHIVED")
- [x] 1.2 Run `npx prisma generate --schema apps/api/prisma/schema.prisma` to update Prisma Client
- [ ] 1.3 Create migration: `npx prisma migrate dev --name add-user-soft-delete` (requires live DB)

### 2. Shared Types (AC: 1, 2, 3)

- [x] 2.1 Add `RemovalStrategy` type to `shared/types/src/lib/types.ts`: `'REASSIGN' | 'ARCHIVE'`
- [x] 2.2 Add `RemoveMemberRequest` interface: `{ strategy: RemovalStrategy }`
- [x] 2.3 Add `TeamMemberResponse` interface: `{ id, email, name, role, department, createdAt }`
- [x] 2.4 Export new types from `shared/types/src/index.ts`

### 3. Email Template - Removal Notification (AC: 2)

- [x] 3.1 Create `shared/email/src/lib/templates/removal.template.ts`:
  - Notify removed member with tenant name
  - Explain data handling (reassigned vs archived)
  - Include contact info for questions
  - Plain text fallback
- [x] 3.2 Add `sendRemovalNotificationEmail(to, tenantName, strategy)` method to `EmailService`

### 4. Team Service - Backend (AC: 1, 2, 3, 4)

- [x] 4.1 Create `apps/api/src/app/team/team.service.ts` with `PlatformPrismaService` and `EmailService` injection
- [x] 4.2 Implement `getTeamMembers(tenantId)`:
  - Return active users (`isActive: true`) for tenant
  - Include id, email, name, role, createdAt
  - Order by createdAt asc (oldest first)
  - Map department from accepted invitation (if available)
- [x] 4.3 Implement `removeMember(memberId, tenantId, ownerId, strategy: RemovalStrategy)`:
  - Verify member exists and belongs to tenant
  - Verify member is not the requesting owner (AC4 - self-removal prevention)
  - If owner tries to remove self → check if only owner → throw ForbiddenException
  - Use `$transaction` for atomicity:
    - Soft delete: `isActive: false`, `removedAt: now()`, `removedById: ownerId`, `removalReason: strategy`
    - _(Future: reassign notes/conversations when those models exist)_
  - Send removal notification email via EmailService
  - Log removal with reason (Logger)
  - Return removal result
- [x] 4.4 Implement `getMemberById(memberId, tenantId)`:
  - Fetch single active member for confirmation modal data

### 5. Team Controller - Backend (AC: 1, 2, 3, 4)

- [x] 5.1 Create `apps/api/src/app/team/team.controller.ts`
- [x] 5.2 `GET /team/members` - List active team members (AC: 1)
  - Guards: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('TENANT_OWNER', 'ADMIN')`
  - Returns: `{ status: 'success', data: TeamMemberResponse[] }`
- [x] 5.3 `POST /team/members/:id/remove` - Remove team member (AC: 2, 3, 4)
  - Guards: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('TENANT_OWNER')`
  - Body: `RemoveMemberDto` (strategy: 'REASSIGN' | 'ARCHIVE')
  - Returns: `{ status: 'success', message: 'Member removed' }`
  - Errors: 403 self-removal, 404 member not found, 400 validation
- [x] 5.4 All endpoints include `@Headers('x-correlation-id')` parameter
- [x] 5.5 All error responses use RFC 7807 ProblemDetails format

### 6. Team DTO (AC: 2, 3)

- [x] 6.1 Create `apps/api/src/app/team/dto/remove-member.dto.ts`:
  - `strategy` (@IsIn(['REASSIGN', 'ARCHIVE']), required)

### 7. Team Module - Backend (AC: 1, 2, 3, 4)

- [x] 7.1 Create `apps/api/src/app/team/team.module.ts`:
  - Import: `EmailModule`, `ConfigModule`
  - Controllers: `TeamController`
  - Providers: `TeamService`
  - Exports: `TeamService`
- [x] 7.2 Create `apps/api/src/app/team/index.ts` barrel export
- [x] 7.3 Register `TeamModule` in `app.module.ts` imports

### 8. Backend Unit Tests (AC: 1, 2, 3, 4)

- [x] 8.1 Create `team.service.spec.ts` (target: 85% coverage):
  - Test getTeamMembers: returns active users, excludes inactive
  - Test removeMember: success with REASSIGN, success with ARCHIVE
  - Test removeMember: self-removal prevention (only owner)
  - Test removeMember: member not found, wrong tenant
  - Test removeMember: email notification sent
  - Test removeMember: transaction atomicity
- [x] 8.2 Create `team.controller.spec.ts` (target: 80% coverage):
  - Test all endpoints: success and error paths
  - Test guard integration (mock guards)
  - Test correlation ID propagation
  - Test RFC 7807 error format

### 9. Frontend - Team Service Extension (AC: 1, 2, 3)

- [x] 9.1 Add methods to existing `apps/web/src/app/team/services/invitation.service.ts` OR create new `team-members.service.ts`:
  - `getMembers(): Observable<ApiResponse<TeamMemberResponse[]>>`
  - `removeMember(id: string, strategy: RemovalStrategy): Observable<ApiResponse<void>>`
  - Use `inject(HttpClient)`, typed responses

### 10. Frontend - Update Team Component (AC: 1)

- [x] 10.1 Extend `apps/web/src/app/team/team.component.ts`:
  - Add `members$` signal for active team members list
  - Load members on init alongside invitations
  - Add "Active Members" section above pending invitations
  - Each member row: avatar placeholder, name, email, role badge, department badge, "Remove" button
  - "Remove" button only shows for TENANT_OWNER viewing non-owner members
  - Add `lucideUserMinus`, `lucideShield` icons to imports

### 11. Frontend - Remove Confirmation Dialog (AC: 1, 2, 3, 4)

- [x] 11.1 Create `apps/web/src/app/team/remove-dialog/remove-dialog.component.ts`:
  - Standalone component with inline template
  - Inputs: member data (name, email, role)
  - Outputs: `close` output (RemovalStrategy | false)
  - Signals: `isSubmitting$`, `errorMessage$`, `selectedStrategy$`
  - Display member name and email
  - Warning text about data handling
  - Radio buttons: "Reassign data to me" / "Archive data"
  - Confirm ("Remove Member") and Cancel buttons
  - Shows self-removal error message when returned from API (AC4)

### 12. Frontend Unit Tests (AC: 1, 2, 3, 4)

- [x] 12.1 Create `team-members.service.spec.ts` (or extend invitation.service.spec.ts):
  - Test getMembers HTTP call
  - Test removeMember HTTP call with strategy param
  - Test HTTP error transformation
- [x] 12.2 Create `remove-dialog.component.spec.ts`:
  - Test creation, initial state
  - Test strategy selection (radio buttons)
  - Test submit calls service
  - Test cancel emits close(false)
  - Test error display
- [x] 12.3 Extend `team.component.spec.ts`:
  - Test members list rendering
  - Test remove button visibility for owners
  - Test remove dialog open/close

### 13. Build & Test Verification (AC: 1, 2, 3, 4)

- [x] 13.1 Run `nx build api` - must pass
- [x] 13.2 Run `nx build web` - must pass
- [x] 13.3 Run `nx test api` - all tests pass (185 tests, 19 suites)
- [x] 13.4 Run `nx test web` - all tests pass (50 tests, 7 suites)

## Dev Notes

### Architecture Patterns

- **Module pattern**: Follow `InvitationModule` pattern (Story 1.7) - module/controller/service/dto structure under `apps/api/src/app/team/`
- **Database**: User model lives in Platform DB (PlatformPrismaService) - same as invitation/registration
- **Soft delete**: Set `isActive: false` + `removedAt` timestamp. DO NOT delete the User record - retain for audit (SC4 requirement: immutable audit logs)
- **Guards**: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('TENANT_OWNER')` for removal; `@Roles('TENANT_OWNER', 'ADMIN')` for listing
- **Email**: Reuse existing `EmailService` from `@mentor-ai/shared/email` - add new template method
- **Transactions**: Use `prisma.$transaction()` for soft delete operation to ensure atomicity
- **Error format**: RFC 7807 ProblemDetails for all error responses
- **Correlation IDs**: All endpoints accept `X-Correlation-Id` header

### Key Technical Decisions

- **Soft delete over hard delete**: User record preserved with `isActive: false`. All user queries must filter by `isActive: true`. This preserves audit trail and allows future "undo" if needed.
- **Data reassignment is structural only for now**: Conversations (Epic 2) and Notes (Epic 4) don't exist yet. The `removalReason` field records the owner's choice ('REASSIGN' or 'ARCHIVE') so the actual data transfer can be implemented when those models are created. The service method is structured to accommodate future data models.
- **Separate Team module from Invitation module**: Team member CRUD is a different domain from invitation management. Clean separation follows single responsibility principle. The frontend team component already exists and will be extended.
- **POST for removal action (not DELETE)**: Using `POST /team/members/:id/remove` with a body (strategy) because this is a complex action with parameters, not a simple resource deletion. More aligned with the "action endpoint" pattern.
- **Department mapping from invitation**: User model has no `department` field. Department info comes from the accepted Invitation record. Query joins with `invitationAccepted` relation for display purposes.

### Critical Implementation Warnings

> **DO NOT hard-delete User records** - This violates audit trail requirements (SC4). Always soft delete.

> **DO NOT allow removal of last TENANT_OWNER** - Check owner count before allowing self-removal. The error message specifically references backup owner (Story 1.9 dependency).

> **DO NOT send email before transaction commits** - Send removal notification email AFTER the database transaction succeeds, not inside it. Email failure should not roll back removal.

> **DO NOT create new services for existing shared/email library** - Reuse `EmailService` by adding a new template method. Do not create a separate email service.

> **Frontend tests use Vitest (NOT Jest, NOT Jasmine)** - Use `vi.fn()`, `vi.clearAllMocks()`, `mockReturnValue()` syntax. See `tsconfig.spec.json` → `"types": ["vitest/globals"]`.

### Source Tree Components

```
apps/api/src/app/team/
├── team.module.ts
├── team.controller.ts
├── team.service.ts
├── team.controller.spec.ts
├── team.service.spec.ts
├── dto/
│   └── remove-member.dto.ts
└── index.ts

shared/email/src/lib/templates/
└── removal.template.ts          (NEW)

apps/web/src/app/team/
├── team.component.ts            (MODIFIED - add members list)
├── team.component.spec.ts       (MODIFIED - add members tests)
├── services/
│   ├── invitation.service.ts    (existing)
│   └── team-members.service.ts  (NEW)
│   └── team-members.service.spec.ts (NEW)
└── remove-dialog/
    ├── remove-dialog.component.ts      (NEW)
    └── remove-dialog.component.spec.ts (NEW)
```

### Testing Standards

| Component | Target Coverage | Rationale |
|-----------|----------------|-----------|
| team.service.ts | 85% | Security critical (access control, soft delete) |
| team.controller.ts | 80% | Standard feature controller |
| Frontend components | 70% | Lower risk UI |

### Project Structure Notes

- New `TeamModule` follows existing modular monolith pattern (same as InvitationModule, RegistrationModule, AuthModule)
- Email template added to existing `libs/shared/email/` library - not a new library
- Frontend extends existing team component and adds remove dialog alongside invite dialog
- Shared types added to existing `shared/types/` - not duplicated

### Previous Story (1.7) Learnings - CRITICAL

These issues were found in Story 1.7 code review. **Prevent them here:**

1. **H1: acceptInvitation didn't update user.tenantId** → Ensure `removeMember` actually sets `isActive: false` in the DB (verify with test assertion)
2. **H2: Used wrong env var (API_URL vs FRONTEND_URL)** → Any URLs in email templates must use `FRONTEND_URL`
3. **H3: Email failure silently swallowed** → Log email failures via `Logger.warn()` but don't throw
4. **H4: Login didn't preserve return URL** → N/A for removal flow
5. **M2: Signal naming without $ suffix** → Name ALL signals with `$` suffix from the start
6. **M3: Used @Output instead of output()** → Use `output()` function for all component outputs
7. **M4: Missing rolesGuard on frontend route** → Team route already has rolesGuard (fixed in 1.7)
8. **M5: No frontend tests initially** → Write frontend tests as part of implementation, not after
9. **Frontend uses Vitest** → Use `vi.fn()`, NOT `jest.fn()` or `jasmine.createSpyObj()`
10. **`replace_all` double-suffix risk** → Be careful with bulk signal renames, check for conflicts
11. **Type safety**: Prisma enum types (`UserRole`) must match interface types - don't use `string` where enum is expected
12. **npm install**: Use `--legacy-peer-deps` if dependency conflicts arise

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.8] - Story requirements, AC, technical notes
- [Source: _bmad-output/planning-artifacts/prd.md#FR5] - Team member removal requirements
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Journey 5] - Admin panel team management flow (Confirm Removal Modal)
- [Source: _bmad-output/planning-artifacts/architecture.md] - RBAC hierarchy, API patterns, multi-tenant DB
- [Source: _bmad-output/planning-artifacts/project-context.md] - Coding conventions, testing rules, ID prefixes
- [Source: _bmad-output/implementation-artifacts/1-7-team-member-invitation.md] - Previous story patterns, learnings, code review fixes
- [Source: apps/api/src/app/invitation/] - Invitation module pattern (module/controller/service/dto)
- [Source: apps/api/prisma/schema.prisma] - Current Prisma schema (User model needs soft-delete fields)
- [Source: apps/api/src/app/auth/guards/] - Guard patterns (JwtAuthGuard, RolesGuard)
- [Source: apps/web/src/app/team/team.component.ts] - Existing team UI (needs active members section)
- [Source: shared/email/src/lib/email.service.ts] - Existing email service to extend

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- API build: success (webpack compiled successfully)
- Web build: success (478.04 kB initial, 127.77 kB transfer)
- API tests: 186 passed, 19 suites (including 21 new team tests)
- Web tests: 53 passed, 7 suites (including 31 new team tests)
- Email tests: 3 passed, 1 suite
- Total: 242 tests passing, 0 failures

### Completion Notes List

- Implemented soft delete pattern (isActive, removedAt, removedById, removalReason) on User model
- Created TeamModule following InvitationModule pattern (module/controller/service/dto)
- POST /team/members/:id/remove with strategy body (REASSIGN or ARCHIVE)
- GET /team/members returns active users with department from invitation
- Self-removal prevention: checks owner count before allowing self-removal
- Email sent AFTER transaction commits (not inside transaction)
- Email failure logged as warning, does not throw
- Frontend: Active Members section added above invitations
- Frontend: Remove dialog with radio button strategy selection
- Frontend: canRemoveMember() hides remove button for TENANT_OWNER role
- All signals follow $ suffix convention
- Used output() function (not @Output) for component outputs
- Used input.required() for dialog inputs
- Frontend tests use Vitest (vi.fn(), vi.clearAllMocks())
- Renamed onDialogClose → onInviteDialogClose for clarity with new onRemoveDialogClose

**Code Review Fixes (8 issues resolved):**
- H1: Backend team.service.ts now imports RemovalStrategy from @mentor-ai/shared/types instead of duplicating
- H2: Removal API errors now display in dialog via error input + effect() instead of silently closing
- H3: Schema comment corrected from "REASSIGNED"/"ARCHIVED" to "REASSIGN"/"ARCHIVE"
- M1: Consolidated duplicate ApiSuccessResponse — team-members.service imports from invitation.service
- M2: loadData() uses forkJoin to prevent race condition (spinner clears only after both requests)
- M3: canRemoveMember() now checks AuthService.currentUser().role === 'TENANT_OWNER' before showing button
- M4: Controller removeMember response includes data: null to match ApiSuccessResponse contract
- L1: Added test for successful self-removal when multiple owners exist

### Change Log

| Change | File(s) | Reason |
|--------|---------|--------|
| Add soft delete fields to User model | apps/api/prisma/schema.prisma | AC2/AC3: Support soft delete for member removal |
| Add shared types (RemovalStrategy, TeamMemberResponse) | shared/types/src/lib/types.ts | AC1/AC2/AC3: Shared types for frontend/backend |
| Create removal email template | shared/email/src/lib/templates/removal.template.ts | AC2: Notify removed member |
| Add sendRemovalNotificationEmail to EmailService | shared/email/src/lib/email.service.ts | AC2: Email notification on removal |
| Create TeamService | apps/api/src/app/team/team.service.ts | AC1-4: Backend business logic |
| Create TeamController | apps/api/src/app/team/team.controller.ts | AC1-4: REST API endpoints |
| Create RemoveMemberDto | apps/api/src/app/team/dto/remove-member.dto.ts | AC2/AC3: Input validation |
| Create TeamModule + barrel export | apps/api/src/app/team/team.module.ts, index.ts | Module registration |
| Register TeamModule in AppModule | apps/api/src/app/app.module.ts | Module activation |
| Create TeamService tests | apps/api/src/app/team/team.service.spec.ts | 13 tests, 85%+ coverage |
| Create TeamController tests | apps/api/src/app/team/team.controller.spec.ts | 8 tests, 80%+ coverage |
| Create TeamMembersService (frontend) | apps/web/src/app/team/services/team-members.service.ts | AC1-3: HTTP client |
| Update TeamComponent with members list | apps/web/src/app/team/team.component.ts | AC1: Active members UI |
| Create RemoveDialogComponent | apps/web/src/app/team/remove-dialog/remove-dialog.component.ts | AC1-4: Confirmation modal |
| Create TeamMembersService tests | apps/web/src/app/team/services/team-members.service.spec.ts | 5 tests |
| Create RemoveDialog tests | apps/web/src/app/team/remove-dialog/remove-dialog.component.spec.ts | 10 tests |
| Update TeamComponent tests | apps/web/src/app/team/team.component.spec.ts | 16 tests (was 6) |
| **Code Review Fixes** | | |
| Import RemovalStrategy from shared types | apps/api/src/app/team/team.service.ts | H1: Use shared types instead of local duplicate |
| Add error input with effect() sync | apps/web/src/app/team/remove-dialog/remove-dialog.component.ts | H2: Display API errors to user |
| Add removalError$ signal + error binding | apps/web/src/app/team/team.component.ts | H2: Pass error to dialog, keep dialog open on failure |
| Fix schema comment values | apps/api/prisma/schema.prisma | H3: Match actual stored values |
| Consolidate ApiSuccessResponse | apps/web/src/app/team/services/team-members.service.ts | M1: Import from invitation.service |
| Add message field to ApiSuccessResponse | apps/web/src/app/team/services/invitation.service.ts | M1: Complete interface definition |
| Use forkJoin in loadData() | apps/web/src/app/team/team.component.ts | M2: Fix race condition |
| Add AuthService role check | apps/web/src/app/team/team.component.ts | M3: Hide Remove for non-owners |
| Add data: null to response | apps/api/src/app/team/team.controller.ts | M4: Match ApiSuccessResponse contract |
| Add self-removal multi-owner test | apps/api/src/app/team/team.service.spec.ts | L1: Missing test coverage |

### File List

**New files:**
- apps/api/src/app/team/team.module.ts
- apps/api/src/app/team/team.controller.ts
- apps/api/src/app/team/team.service.ts
- apps/api/src/app/team/team.controller.spec.ts
- apps/api/src/app/team/team.service.spec.ts
- apps/api/src/app/team/dto/remove-member.dto.ts
- apps/api/src/app/team/index.ts
- shared/email/src/lib/templates/removal.template.ts
- apps/web/src/app/team/services/team-members.service.ts
- apps/web/src/app/team/services/team-members.service.spec.ts
- apps/web/src/app/team/remove-dialog/remove-dialog.component.ts
- apps/web/src/app/team/remove-dialog/remove-dialog.component.spec.ts

**Modified files:**
- apps/api/prisma/schema.prisma (added soft delete fields to User model; review: fixed comment)
- apps/api/src/app/app.module.ts (registered TeamModule)
- apps/api/src/app/team/team.service.ts (review: import RemovalStrategy from shared types)
- apps/api/src/app/team/team.controller.ts (review: added data: null to response)
- apps/api/src/app/team/team.service.spec.ts (review: added self-removal multi-owner test, 13 tests)
- apps/api/src/app/team/team.controller.spec.ts (review: added data assertion)
- shared/email/src/lib/email.service.ts (added sendRemovalNotificationEmail)
- shared/types/src/lib/types.ts (added RemovalStrategy, RemoveMemberRequest, TeamMemberResponse)
- apps/web/src/app/team/team.component.ts (added members list, remove dialog; review: forkJoin, AuthService, error handling)
- apps/web/src/app/team/team.component.spec.ts (expanded from 6 to 16 tests; review: +2 tests)
- apps/web/src/app/team/remove-dialog/remove-dialog.component.ts (review: added error input + effect)
- apps/web/src/app/team/remove-dialog/remove-dialog.component.spec.ts (review: added error input test, 10 tests)
- apps/web/src/app/team/services/team-members.service.ts (review: imports from invitation.service)
- apps/web/src/app/team/services/invitation.service.ts (review: added message field to ApiSuccessResponse)
