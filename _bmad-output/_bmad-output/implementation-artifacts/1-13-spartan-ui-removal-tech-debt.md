# Story 1.13: Remove Spartan UI Dependencies (Tech Debt)

Status: **ready-for-dev**

## Story

- As a **developer**, I need to **remove all remaining @spartan-ng/brain imports** so that **all components render correctly per ADR-001 (Native HTML + Pure CSS)**.

## Background

ADR-001 established that Spartan UI was abandoned in favor of native HTML elements with pure CSS classes. Several components were rewritten (chat, dashboard, login, onboarding-wizard, llm-config), but 13 files still import `BrnButton` from `@spartan-ng/brain/button`. These components compile but the `brnButton` directive does not render properly at runtime, resulting in broken button styling.

## Acceptance Criteria

- [ ] **AC1**: All `@spartan-ng/brain/button` imports removed from source code
- [ ] **AC2**: All `brnButton` directive usages replaced with native `<button>` elements
- [ ] **AC3**: All `@ng-icons/core` / `@ng-icons/lucide` imports replaced with inline SVGs
- [ ] **AC4**: All Tailwind utility classes in templates replaced with pure CSS class definitions in `styles` block
- [ ] **AC5**: `@spartan-ng/brain` and `@spartan-ng/cli` removed from package.json dependencies
- [ ] **AC6**: `@ng-icons/core` and `@ng-icons/lucide` removed from package.json dependencies
- [ ] **AC7**: All affected components render correctly in dev mode
- [ ] **AC8**: Existing tests continue to pass

## Affected Files (13 components)

### Account Settings (3 files)
- [ ] `apps/web/src/app/account-settings/account-settings.component.ts`
- [ ] `apps/web/src/app/account-settings/designate-dialog/designate-dialog.component.ts`
- [ ] `apps/web/src/app/account-settings/delete-workspace-dialog/delete-workspace-dialog.component.ts`

### Team Management (3 files)
- [ ] `apps/web/src/app/team/team.component.ts`
- [ ] `apps/web/src/app/team/invite-dialog/invite-dialog.component.ts`
- [ ] `apps/web/src/app/team/remove-dialog/remove-dialog.component.ts`

### Registration (2 files)
- [ ] `apps/web/src/app/registration/registration.component.ts`
- [ ] `apps/web/src/app/registration/oauth-pending.component.ts`

### Two-Factor Auth (2 files)
- [ ] `apps/web/src/app/two-factor/setup.component.ts`
- [ ] `apps/web/src/app/two-factor/verify.component.ts`

### Other (3 files)
- [ ] `apps/web/src/app/invite/invite-accept.component.ts`
- [ ] `apps/web/src/app/profile-settings/export-section/export-section.component.ts`
- [ ] `apps/web/src/app/spartan-test.ts` (delete entirely — test file for abandoned library)

## Implementation Pattern

Follow the established pattern from already-rewritten components (chat, dashboard, login):

1. Remove `BrnButton` import and `brnButton` directive usage
2. Replace `<button brnButton ...>` with `<button class="btn-primary" ...>` (or similar)
3. Remove `NgIcon` / `provideIcons` imports
4. Replace `<ng-icon name="lucideXxx" />` with inline `<svg>` elements
5. Move Tailwind utility classes from template to CSS class definitions in `styles` block
6. Use design tokens: #0D0D0D (base), #1A1A1A (surface), #242424 (elevated), #2A2A2A (border), #FAFAFA (text), #3B82F6 (primary)

## Dev Notes

- Reference `dashboard.component.ts` or `login.component.ts` for the target pattern
- Each component is self-contained — can be done file by file
- After all 13 files are done, run `npm uninstall @spartan-ng/brain @spartan-ng/cli @ng-icons/core @ng-icons/lucide`
- Run `npm test` to verify no regressions
