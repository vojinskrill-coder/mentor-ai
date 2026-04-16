# Story 1.9: Backup Owner Designation

Status: review

<!-- Note: Validation is optional. Run validate-create-story for quality check before dev-story. -->

## Story

As a **Tenant Owner**,
I want to designate a backup Owner for account recovery,
So that the workspace remains accessible if I lose access to my account.

## Acceptance Criteria

### AC1: Viewing Eligible Members

**Given** a Tenant Owner on account settings
**When** they navigate to "Backup Owner" section
**Then** they see a list of current Team Members eligible for backup designation

### AC2: Designating Backup Owner

**Given** the Tenant Owner selects a Team Member as backup
**When** they confirm the designation
**Then** the selected member receives an email notification
**And** the backup Owner can initiate account recovery if needed
**And** the backup designation is recorded in audit log

### AC3: Account Recovery Flow

**Given** the primary Owner is locked out (failed 2FA, lost access)
**When** the backup Owner initiates recovery
**Then** they must verify via their own 2FA
**And** they can reset the primary Owner's 2FA
**And** an email is sent to the primary Owner notifying of recovery action

### AC4: Warning for Missing Backup

**Given** no backup Owner is designated
**When** the tenant has been active for 30+ days
**Then** display a warning banner: "Designate a backup Owner to prevent account lockout"

## Tasks / Subtasks

### 1. Prisma Schema - Tenant Backup Owner Fields (AC: 1, 2)

- [ ] 1.1 Add backup owner fields to `Tenant` model in `schema.prisma`:
  - `backupOwnerId` (String? @map("backup_owner_id"))
  - `backupOwnerDesignatedAt` (DateTime? @map("backup_owner_designated_at"))
  - Relation: `backupOwner User? @relation("BackupOwner", fields: [backupOwnerId], references: [id])`
- [ ] 1.2 Add inverse relation on `User` model:
  - `backupOwnerOf Tenant? @relation("BackupOwner")`
- [ ] 1.3 Run `npx prisma generate --schema apps/api/prisma/schema.prisma` to update Prisma Client
- [ ] 1.4 Create migration: `npx prisma migrate dev --name add-tenant-backup-owner` (requires live DB)

### 2. Shared Types (AC: 1, 2, 3)

- [ ] 2.1 Add `BackupOwnerResponse` interface to `shared/types/src/lib/types.ts`:
  ```typescript
  export interface BackupOwnerResponse {
    id: string;
    email: string;
    name: string | null;
    designatedAt: string;
  }
  ```
- [ ] 2.2 Add `DesignateBackupOwnerRequest` interface:
  ```typescript
  export interface DesignateBackupOwnerRequest {
    backupOwnerId: string;
  }
  ```
- [ ] 2.3 Export new types from `shared/types/src/index.ts`

### 3. Email Template - Backup Owner Designation (AC: 2)

- [ ] 3.1 Create `shared/email/src/lib/templates/backup-owner-designation.template.ts`:
  - Notify designated member they are now backup owner
  - Explain what backup ownership means (can initiate recovery)
  - Include tenant name and who designated them
  - Plain text fallback
- [ ] 3.2 Add `sendBackupOwnerDesignationEmail(params)` method to `EmailService`:
  - `params: { to: string; tenantName: string; designatedBy: string }`

### 4. Email Template - Recovery Notification (AC: 3)

- [ ] 4.1 Create `shared/email/src/lib/templates/recovery-notification.template.ts`:
  - Notify primary owner that their 2FA was reset by backup owner
  - Include backup owner name, timestamp, and IP address
  - Instruct primary owner to set up new 2FA on next login
  - Plain text fallback
- [ ] 4.2 Add `sendRecoveryNotificationEmail(params)` method to `EmailService`:
  - `params: { to: string; tenantName: string; backupOwnerName: string; recoveryTimestamp: Date; ipAddress: string }`

### 5. Backend Service - Backup Owner Management (AC: 1, 2, 3, 4)

- [ ] 5.1 Add backup owner methods to existing `TeamService` in `apps/api/src/app/team/team.service.ts`:

- [ ] 5.2 Implement `getBackupOwner(tenantId: string)`:
  - Query Tenant with backup owner relation included
  - Return BackupOwnerResponse or null
  - Only return if backupOwner user is still active (`isActive: true`)

- [ ] 5.3 Implement `getEligibleBackupOwners(tenantId: string)`:
  - Return active team members (NOT TENANT_OWNER) eligible for designation
  - Exclude the current backup owner if one exists
  - Exclude inactive users
  - Order by name asc

- [ ] 5.4 Implement `designateBackupOwner(tenantId: string, backupOwnerId: string, designatedById: string)`:
  - Verify candidate exists, is active, and belongs to tenant
  - Verify candidate is NOT a TENANT_OWNER (owners shouldn't be backup of themselves)
  - Update Tenant: set `backupOwnerId` and `backupOwnerDesignatedAt`
  - Send email notification to designated member
  - Log designation with `Logger`
  - Return updated BackupOwnerResponse

- [ ] 5.5 Implement `removeBackupDesignation(tenantId: string)`:
  - Clear `backupOwnerId` and `backupOwnerDesignatedAt` on Tenant
  - Log removal

- [ ] 5.6 Implement `initiateRecovery(tenantId: string, backupOwnerId: string, ipAddress: string)`:
  - Verify caller IS the designated backup owner for this tenant
  - Find the primary owner (TENANT_OWNER role) for the tenant
  - Reset primary owner's 2FA: `mfaEnabled: false`, `mfaSecret: null`, `failedLoginAttempts: 0`, `lockoutUntil: null`
  - Send recovery notification email to primary owner
  - Log recovery action with IP and timestamp via `Logger`
  - Return `{ recoveredUserId: string; message: string }`

- [ ] 5.7 Implement `getTenantAge(tenantId: string)`:
  - Return days since tenant creation (for AC4 warning check)
  - Used by frontend to decide whether to show warning banner

### 6. Backend Controller - Backup Owner Endpoints (AC: 1, 2, 3, 4)

- [ ] 6.1 Add backup owner endpoints to `apps/api/src/app/team/team.controller.ts`:

- [ ] 6.2 `GET /team/backup-owner` - Get current backup owner (AC: 1)
  - Guards: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('TENANT_OWNER')`
  - Returns: `{ status: 'success', data: BackupOwnerResponse | null }`

- [ ] 6.3 `GET /team/backup-owner/eligible` - List eligible members (AC: 1)
  - Guards: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('TENANT_OWNER')`
  - Returns: `{ status: 'success', data: TeamMemberResult[] }`

- [ ] 6.4 `POST /team/backup-owner` - Designate backup owner (AC: 2)
  - Guards: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('TENANT_OWNER')`
  - Body: `DesignateBackupOwnerDto` (`backupOwnerId: string`)
  - Returns: `{ status: 'success', data: BackupOwnerResponse, message: 'Backup owner designated' }`
  - Errors: 404 member not found, 400 invalid candidate, 403 forbidden

- [ ] 6.5 `DELETE /team/backup-owner` - Remove backup designation (AC: 2)
  - Guards: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('TENANT_OWNER')`
  - Returns: `{ status: 'success', data: null, message: 'Backup owner removed' }`

- [ ] 6.6 `POST /team/backup-owner/recovery` - Initiate recovery (AC: 3)
  - Guards: `@UseGuards(JwtAuthGuard)` (NO RolesGuard - backup owner may be ADMIN or MEMBER)
  - Custom validation: verify caller is backup owner for the tenant
  - Extracts IP from request headers (`x-forwarded-for` or `req.ip`)
  - Returns: `{ status: 'success', data: { recoveredUserId: string }, message: 'Recovery completed' }`
  - Errors: 403 if caller is not the designated backup owner

- [ ] 6.7 `GET /team/backup-owner/status` - Get backup owner status + tenant age (AC: 4)
  - Guards: `@UseGuards(JwtAuthGuard, RolesGuard)` + `@Roles('TENANT_OWNER', 'ADMIN')`
  - Returns: `{ status: 'success', data: { hasBackupOwner: boolean; tenantAgeDays: number; showWarning: boolean } }`

- [ ] 6.8 All endpoints include `@Headers('x-correlation-id')` parameter

### 7. Backend DTO (AC: 2)

- [ ] 7.1 Create `apps/api/src/app/team/dto/designate-backup-owner.dto.ts`:
  - `backupOwnerId` (@IsString(), @IsNotEmpty(), required)

### 8. Backend Unit Tests (AC: 1, 2, 3, 4)

- [ ] 8.1 Extend `team.service.spec.ts` with backup owner tests (target: 85% coverage):
  - Test getBackupOwner: returns current backup owner, returns null when none
  - Test getBackupOwner: excludes inactive backup owner
  - Test getEligibleBackupOwners: returns active non-owner members
  - Test getEligibleBackupOwners: excludes current backup owner
  - Test designateBackupOwner: success path with email notification
  - Test designateBackupOwner: reject TENANT_OWNER as candidate
  - Test designateBackupOwner: reject inactive user
  - Test designateBackupOwner: reject user from different tenant
  - Test removeBackupDesignation: clears fields
  - Test initiateRecovery: success path (resets 2FA, sends email)
  - Test initiateRecovery: reject if caller is not backup owner
  - Test getTenantAge: correct calculation

- [ ] 8.2 Extend `team.controller.spec.ts` with backup owner endpoint tests:
  - Test all 6 new endpoints: success and error paths
  - Test guard/role configuration
  - Test recovery endpoint IP extraction
  - Test correlation ID propagation

### 9. Frontend - Account Settings Route & Component (AC: 1, 4)

- [ ] 9.1 Create `apps/web/src/app/account-settings/account-settings.component.ts`:
  - Standalone component with inline template
  - Load backup owner status on init
  - Display "Backup Owner" section
  - Show current backup owner or "No backup owner designated" state
  - Show warning banner if tenant active 30+ days and no backup owner (AC4)
  - "Designate Backup Owner" button opens dialog
  - "Change" / "Remove" buttons for existing backup owner
  - Guard: `canActivate: [authGuard, mfaGuard, rolesGuard(['TENANT_OWNER'])]`

- [ ] 9.2 Add route to `apps/web/src/app/app.routes.ts`:
  ```typescript
  {
    path: 'account-settings',
    loadComponent: () => import('./account-settings/account-settings.component').then(m => m.AccountSettingsComponent),
    canActivate: [authGuard, mfaGuard, rolesGuard(['TENANT_OWNER'])],
  }
  ```

- [ ] 9.3 Add "Account Settings" navigation link to team page header or dashboard

### 10. Frontend - Backup Owner Service (AC: 1, 2, 3)

- [ ] 10.1 Create `apps/web/src/app/account-settings/services/backup-owner.service.ts`:
  - `getBackupOwner(): Observable<ApiSuccessResponse<BackupOwnerResponse | null>>`
  - `getEligibleMembers(): Observable<ApiSuccessResponse<TeamMemberResponse[]>>`
  - `designateBackupOwner(backupOwnerId: string): Observable<ApiSuccessResponse<BackupOwnerResponse>>`
  - `removeBackupOwner(): Observable<ApiSuccessResponse<void>>`
  - `getBackupOwnerStatus(): Observable<ApiSuccessResponse<BackupOwnerStatus>>`
  - Use `inject(HttpClient)`, typed responses
  - Import `ApiSuccessResponse` from `invitation.service` (consolidated type)
  - Error handling with `catchError` + RFC 7807 parsing

### 11. Frontend - Designate Backup Owner Dialog (AC: 1, 2)

- [ ] 11.1 Create `apps/web/src/app/account-settings/designate-dialog/designate-dialog.component.ts`:
  - Standalone component with inline template
  - Load eligible members on init
  - Display list of eligible members with name, email, role
  - Radio/select to choose one member
  - Confirm and Cancel buttons
  - Inputs: none (loads own data)
  - Outputs: `close` output (string | false) - emits selected member ID or false on cancel
  - Signals: `eligibleMembers$`, `selectedMemberId$`, `isLoading$`, `isSubmitting$`, `errorMessage$`
  - Show loading state while fetching eligible members
  - Show error message if designation fails

### 12. Frontend - Recovery Section (AC: 3)

- [ ] 12.1 Add recovery section to team page (visible only to backup owner):
  - Check if `currentUser.id === tenant.backupOwnerId`
  - Display "Account Recovery" section with explanation
  - "Reset Owner's 2FA" button with confirmation dialog
  - OR: Create separate `apps/web/src/app/account-settings/recovery/recovery.component.ts`
  - Note: Backup owner accesses this via normal login (they have their own credentials)
  - After recovery: show success message, note that primary owner will need to re-setup 2FA

- [ ] 12.2 Alternative simpler approach: Add recovery endpoint to backend only for now
  - Recovery UI can be added later when the full admin panel (Epic 5) is built
  - Backend recovery endpoint must be functional and tested
  - Document the API endpoint for future frontend integration

### 13. Frontend - Warning Banner (AC: 4)

- [ ] 13.1 Add warning check to account settings page:
  - Call `getBackupOwnerStatus()` on page load
  - If `showWarning === true` → display banner:
    > "Designate a backup Owner to prevent account lockout"
  - Banner style: amber/warning background with icon
  - Include "Designate Now" action button in banner

- [ ] 13.2 Optionally add warning to team page header:
  - If TENANT_OWNER and no backup owner and tenant age > 30 days
  - Show subtle warning indicator linking to account settings

### 14. Frontend Unit Tests (AC: 1, 2, 3, 4)

- [ ] 14.1 Create `backup-owner.service.spec.ts`:
  - Test all HTTP calls (getBackupOwner, getEligible, designate, remove, getStatus)
  - Test error transformation
  - Use Vitest (vi.fn(), vi.clearAllMocks())

- [ ] 14.2 Create `account-settings.component.spec.ts`:
  - Test component creation
  - Test backup owner display (with and without backup owner)
  - Test warning banner visibility (30+ days, no backup)
  - Test warning banner hidden (backup owner exists)
  - Test designate dialog open/close
  - Test remove backup owner

- [ ] 14.3 Create `designate-dialog.component.spec.ts`:
  - Test eligible members loading
  - Test member selection
  - Test confirm emits selected ID
  - Test cancel emits false
  - Test error display

### 15. Build & Test Verification (AC: 1, 2, 3, 4)

- [ ] 15.1 Run `nx build api` - must pass
- [ ] 15.2 Run `nx build web` - must pass
- [ ] 15.3 Run `nx test api` - all tests pass
- [ ] 15.4 Run `nx test web` - all tests pass

## Dev Notes

### Architecture Patterns

- **Module extension**: Extend existing `TeamModule` with backup owner endpoints (same domain: team/tenant management)
- **Database**: Tenant model lives in Platform DB (`PlatformPrismaService`). Backup owner is a FK relation from Tenant → User.
- **Soft delete awareness**: When checking backup owner validity, verify the user is still `isActive: true`. If the backup owner was removed (Story 1.8), the backup owner should be treated as "not designated."
- **Guards**:
  - Designation endpoints: `@Roles('TENANT_OWNER')` only
  - Recovery endpoint: `@UseGuards(JwtAuthGuard)` without RolesGuard (backup owner may be ADMIN/MEMBER) + custom backup owner check
  - Status endpoint: `@Roles('TENANT_OWNER', 'ADMIN')` for dashboard warning visibility
- **Email**: Reuse existing `EmailService` from `@mentor-ai/shared/email` - add 2 new template methods
- **Error format**: RFC 7807 ProblemDetails for all error responses
- **Correlation IDs**: All endpoints accept `X-Correlation-Id` header

### Key Technical Decisions

- **Extend TeamModule vs new module**: Add to TeamModule since backup owner management is part of team/tenant management. The controller already handles team members and the service already has PlatformPrismaService injection. Avoids module proliferation.
- **Backup owner eligibility**: Only non-TENANT_OWNER active users can be designated. This prevents circular ownership (owner backing up themselves). Both ADMIN and MEMBER roles are eligible.
- **Recovery = 2FA reset only**: The recovery action resets the primary owner's 2FA (mfaEnabled=false, mfaSecret=null, lockout cleared). It does NOT change passwords or grant full admin access. The primary owner must then log in and set up new 2FA.
- **Recovery authorization**: The recovery endpoint uses JwtAuthGuard (the backup owner logs in normally) but NOT RolesGuard. Instead, the service verifies `caller.userId === tenant.backupOwnerId`. This is a custom authorization check since "backup owner" is not a role — it's a tenant-level designation.
- **IP address logging**: Recovery actions extract IP from `x-forwarded-for` header (proxy) or `request.ip` (direct). This satisfies the audit requirement for recovery actions.
- **Tenant age check**: A simple `GET /team/backup-owner/status` returns `{ hasBackupOwner, tenantAgeDays, showWarning }` where `showWarning = !hasBackupOwner && tenantAgeDays >= 30`. This avoids frontend date calculations and centralizes business logic.
- **Account settings as new page**: Per UX Journey 5, tenant settings are a separate section from team management. Creating a `/account-settings` route provides a clean home for backup owner and future settings (branding, defaults, data export).
- **Recovery UI deferral option**: AC3 requires the recovery flow to work. The backend MUST be fully implemented and tested. The frontend recovery UI can be minimal (button + confirmation) since the backup owner's primary action is a single API call. Full recovery UX can be enhanced when Epic 5 admin panel is built.

### Critical Implementation Warnings

> **DO NOT allow TENANT_OWNER to designate themselves as backup** - Check role before accepting designation. The backup owner must be a different person (ADMIN or MEMBER).

> **DO NOT skip backup owner validation on recovery** - The recovery endpoint MUST verify the caller is the currently designated backup owner. Use the Tenant relation, not just any user.

> **DO NOT reset backup owner field when user is soft-deleted** - If the backup owner is removed (Story 1.8), the `backupOwnerId` FK still points to the inactive user. The `getBackupOwner()` method must check `isActive: true` and return null if the backup owner was deactivated. The frontend should then show "no backup owner" state.

> **DO NOT send email before database update** - Designate in DB first, then send email. Email failure should be logged but NOT roll back the designation (same pattern as Story 1.8 removal).

> **Frontend tests use Vitest (NOT Jest, NOT Jasmine)** - Use `vi.fn()`, `vi.clearAllMocks()`, `mockReturnValue()` syntax. See `tsconfig.spec.json` → `"types": ["vitest/globals"]`.

> **Import shared types from `@mentor-ai/shared/types`** - DO NOT duplicate BackupOwnerResponse or TeamMemberResponse. Use shared types library.

> **All signals use $ suffix** - `backupOwner$`, `isLoading$`, `showWarning$`, etc.

> **Use `output()` function, NOT `@Output()`** - For dialog component close events.

> **Use `input.required()` for required inputs, `input()` for optional** - Follow Story 1.8 pattern.

### Source Tree Components

```
apps/api/src/app/team/
├── team.module.ts                (MODIFIED - no changes needed if extending)
├── team.controller.ts            (MODIFIED - add backup owner endpoints)
├── team.service.ts               (MODIFIED - add backup owner methods)
├── team.controller.spec.ts       (MODIFIED - add backup owner endpoint tests)
├── team.service.spec.ts          (MODIFIED - add backup owner service tests)
├── dto/
│   ├── remove-member.dto.ts      (existing)
│   └── designate-backup-owner.dto.ts  (NEW)
└── index.ts                      (existing)

shared/email/src/lib/
├── email.service.ts              (MODIFIED - add 2 new email methods)
└── templates/
    ├── invitation.template.ts    (existing)
    ├── removal.template.ts       (existing)
    ├── backup-owner-designation.template.ts  (NEW)
    └── recovery-notification.template.ts     (NEW)

shared/types/src/lib/types.ts     (MODIFIED - add BackupOwnerResponse, DesignateBackupOwnerRequest)

apps/web/src/app/
├── app.routes.ts                 (MODIFIED - add account-settings route)
├── account-settings/
│   ├── account-settings.component.ts       (NEW)
│   ├── account-settings.component.spec.ts  (NEW)
│   ├── services/
│   │   ├── backup-owner.service.ts         (NEW)
│   │   └── backup-owner.service.spec.ts    (NEW)
│   └── designate-dialog/
│       ├── designate-dialog.component.ts      (NEW)
│       └── designate-dialog.component.spec.ts (NEW)
└── team/
    └── team.component.ts         (MODIFIED - add link to account settings)

apps/api/prisma/schema.prisma     (MODIFIED - add backup owner fields to Tenant)
```

### Testing Standards

| Component | Target Coverage | Rationale |
|-----------|----------------|-----------|
| team.service.ts (backup methods) | 85% | Security critical (recovery, access control) |
| team.controller.ts (backup endpoints) | 80% | Standard feature controller |
| backup-owner.service.ts (frontend) | 70% | HTTP client wrapper |
| Frontend components | 70% | Lower risk UI |

### Project Structure Notes

- Backup owner endpoints added to existing `TeamController` / `TeamService` (not a new module)
- New `account-settings/` directory in frontend for the settings page
- Email templates added to existing `shared/email/` library
- Shared types added to existing `shared/types/` — not duplicated
- Frontend route guarded by `rolesGuard(['TENANT_OWNER'])` since only owners can manage backup designation

### Previous Story (1.8) Learnings - CRITICAL

These issues were found in Story 1.8 code review. **Prevent them here:**

1. **H1: Duplicate RemovalStrategy type** → Import ALL shared types from `@mentor-ai/shared/types`. DO NOT create local duplicates of BackupOwnerResponse.
2. **H2: Errors silently swallowed** → Display all API errors to user. Use the `error` input + `effect()` pattern from 1.8 review fix for any dialogs.
3. **H3: Schema comment mismatch** → Ensure Prisma comments match actual stored values.
4. **M1: Duplicate ApiSuccessResponse** → Import `ApiSuccessResponse` from `invitation.service.ts` (already consolidated in 1.8 review). Do NOT create another copy.
5. **M2: Race condition in loadData** → Use `forkJoin` when loading multiple data sources simultaneously.
6. **M3: canRemoveMember missing role check** → For any UI element gated by role, check `authService.currentUser().role` on the frontend AND use `@Roles()` guard on backend.
7. **M4: Missing data field in response** → All controller responses MUST include `data` field (even `data: null` for void responses).
8. **L1: Missing edge case test** → Think about edge cases: what if backup owner was removed? What if tenant has no members? What if backup owner tries to recover when they ARE the owner?
9. **Frontend uses Vitest** → Use `vi.fn()`, NOT `jest.fn()`.
10. **Signals with $ suffix** → ALL signals must use `$` suffix.
11. **Use `output()` not `@Output()`** → Component outputs use the function API.
12. **Email after DB commit** → Send notification AFTER successful database operation, not inside transaction.

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story 1.9] - Story requirements, AC, technical notes
- [Source: _bmad-output/planning-artifacts/prd.md#FR6] - Backup Owner for account recovery
- [Source: _bmad-output/planning-artifacts/prd.md#SC3] - 2FA recovery enhanced requirements
- [Source: _bmad-output/planning-artifacts/ux-design-specification.md#Journey 5] - Tenant Owner Administration (settings gear → admin panel)
- [Source: _bmad-output/planning-artifacts/architecture.md] - RBAC hierarchy, API patterns, Auth0 + JWT
- [Source: _bmad-output/planning-artifacts/project-context.md] - Coding conventions, testing rules, ID prefixes
- [Source: _bmad-output/implementation-artifacts/1-8-team-member-removal.md] - Previous story patterns, learnings, code review fixes
- [Source: apps/api/src/app/team/team.service.ts:119-140] - Self-removal prevention references "Designate a backup Owner first"
- [Source: apps/api/prisma/schema.prisma] - Current Tenant model (needs backup owner fields)
- [Source: apps/api/src/app/auth/strategies/jwt.strategy.ts:20-26] - CurrentUserPayload interface
- [Source: apps/web/src/app/core/auth/auth.service.ts] - Frontend AuthService with currentUser signal
- [Source: apps/web/src/app/core/auth/roles.guard.ts] - Frontend rolesGuard function
- [Source: shared/email/src/lib/email.service.ts] - Email service pattern (sendInvitationEmail, sendRemovalNotificationEmail)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- Prisma schema validation error: one-to-one relation requires `@unique` on `backupOwnerId` — fixed by adding `@unique`
- team.service.spec.ts TS2532 "Object is possibly undefined" — fixed with non-null assertion `result[0]!`
- team.component.spec.ts NG0201 "No provider for ActivatedRoute" — fixed by adding `provideRouter([])` after `RouterLink` import was added

### Completion Notes List

- All 15 task groups completed
- Backend: 6 new service methods, 6 new controller endpoints, 1 new DTO
- Frontend: account-settings page, backup-owner service, designate dialog, warning banner
- Email: 2 new templates (designation, recovery notification)
- Recovery endpoint: backend fully implemented (POST /team/backup-owner/recovery), frontend recovery UI deferred to Epic 5 admin panel
- Test totals: API 215 (19 suites), Web 80 (10 suites), Email 3 (1 suite) = 298 total
- Both builds pass (`nx build api`, `nx build web`)

### Code Review Fixes Applied

| # | Severity | Fix | Files Changed |
|---|----------|-----|---------------|
| H1 | HIGH | Added `isActive` check to `initiateRecovery` — deactivated backup owner can no longer reset 2FA | team.service.ts, team.service.spec.ts |
| H2 | HIGH | Added `MfaRequiredGuard` to recovery endpoint — backup owner must have MFA enabled (AC3) | team.controller.ts, team.module.ts |
| H3 | HIGH | Removed duplicate `BackupOwnerStatusResult`, now imports `BackupOwnerStatus` from shared types | team.service.ts |
| M1 | MEDIUM | Added `escapeHtml()` to both email templates — prevents XSS in email HTML | backup-owner-designation.template.ts, recovery-notification.template.ts |
| M2 | MEDIUM | Added inline confirmation step before removing backup owner | account-settings.component.ts |
| M3 | MEDIUM | Wrapped `designateBackupOwner` validation + update in `$transaction` to prevent TOCTOU race | team.service.ts, team.service.spec.ts |
| M4 | MEDIUM | Added test: "should complete recovery even when notification email fails" | team.service.spec.ts |
| L1 | LOW | Documented: AC2 audit log uses NestJS Logger (stdout). Persistent audit trail deferred to Epic 5 | 1-9-backup-owner-designation.md |

### Known Limitations

- **AC2 audit log**: Designation and recovery actions are logged via NestJS `Logger` (stdout/stderr). This is not a persistent, queryable audit trail. When the audit log infrastructure is built (Epic 5 admin panel), these Logger calls should be migrated to persistent audit records.
- **AC3 frontend recovery UI**: Backend recovery endpoint is fully implemented and tested. Frontend recovery UI is deferred to Epic 5 admin panel.

### Change Log

| Change | File(s) | Reason |
|--------|---------|--------|
| Add backup owner fields to Tenant model | apps/api/prisma/schema.prisma | AC1, AC2: Store backup owner FK and designation timestamp |
| Add inverse relation on User model | apps/api/prisma/schema.prisma | Prisma one-to-one relation requirement |
| Add shared types | shared/types/src/lib/types.ts | AC1-4: BackupOwnerResponse, DesignateBackupOwnerRequest, BackupOwnerStatus, RecoveryResult |
| Create designation email template | shared/email/src/lib/templates/backup-owner-designation.template.ts | AC2: Notify designated backup owner |
| Create recovery notification template | shared/email/src/lib/templates/recovery-notification.template.ts | AC3: Notify owner of 2FA reset |
| Add email methods to EmailService | shared/email/src/lib/email.service.ts | AC2, AC3: sendBackupOwnerDesignationEmail, sendRecoveryNotificationEmail |
| Add backup owner methods to TeamService | apps/api/src/app/team/team.service.ts | AC1-4: getBackupOwner, getEligible, designate, remove, recovery, status |
| Add backup owner endpoints | apps/api/src/app/team/team.controller.ts | AC1-4: 6 new endpoints under /team/backup-owner |
| Create DesignateBackupOwnerDto | apps/api/src/app/team/dto/designate-backup-owner.dto.ts | AC2: Validation for designation request |
| Add backend unit tests | apps/api/src/app/team/team.service.spec.ts, team.controller.spec.ts | AC1-4: 31 new tests covering all backup owner methods |
| Create account settings page | apps/web/src/app/account-settings/account-settings.component.ts | AC1, AC4: Backup owner section + warning banner |
| Add account-settings route | apps/web/src/app/app.routes.ts | AC1: Protected route for TENANT_OWNER |
| Create backup owner service | apps/web/src/app/account-settings/services/backup-owner.service.ts | AC1-3: HTTP client for backup owner endpoints |
| Create designate dialog | apps/web/src/app/account-settings/designate-dialog/designate-dialog.component.ts | AC1, AC2: Dialog to select and designate backup owner |
| Add Account Settings link | apps/web/src/app/team/team.component.ts | AC1: Navigation from team page to settings |
| Add team.component.spec.ts fix | apps/web/src/app/team/team.component.spec.ts | Fix: Add provideRouter for RouterLink |
| Create frontend unit tests | apps/web/src/app/account-settings/**/*.spec.ts | AC1-4: 27 new frontend tests |

### File List

- apps/api/prisma/schema.prisma (MODIFIED)
- shared/types/src/lib/types.ts (MODIFIED)
- shared/email/src/lib/email.service.ts (MODIFIED)
- shared/email/src/lib/templates/backup-owner-designation.template.ts (NEW)
- shared/email/src/lib/templates/recovery-notification.template.ts (NEW)
- apps/api/src/app/team/team.service.ts (MODIFIED)
- apps/api/src/app/team/team.controller.ts (MODIFIED)
- apps/api/src/app/team/team.module.ts (MODIFIED)
- apps/api/src/app/team/dto/designate-backup-owner.dto.ts (NEW)
- apps/api/src/app/team/team.service.spec.ts (MODIFIED)
- apps/api/src/app/team/team.controller.spec.ts (MODIFIED)
- apps/web/src/app/app.routes.ts (MODIFIED)
- apps/web/src/app/team/team.component.ts (MODIFIED)
- apps/web/src/app/team/team.component.spec.ts (MODIFIED)
- apps/web/src/app/account-settings/account-settings.component.ts (NEW)
- apps/web/src/app/account-settings/account-settings.component.spec.ts (NEW)
- apps/web/src/app/account-settings/services/backup-owner.service.ts (NEW)
- apps/web/src/app/account-settings/services/backup-owner.service.spec.ts (NEW)
- apps/web/src/app/account-settings/designate-dialog/designate-dialog.component.ts (NEW)
- apps/web/src/app/account-settings/designate-dialog/designate-dialog.component.spec.ts (NEW)
