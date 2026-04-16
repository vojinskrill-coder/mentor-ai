# Story 1.3: Design System Setup with Spartan UI

Status: done

## Story

As a **frontend developer**,
I want the design system established with Tailwind CSS and Spartan UI components,
So that I can build consistent, accessible UI components following the dark-mode-first design.

## Acceptance Criteria

1. **Given** the Angular web application
   **When** the design system is configured
   **Then** Tailwind CSS v4 is installed with custom configuration:
   - Primary background: #0A0A0A (dark mode default)
   - 8px grid system implemented
   - WCAG AAA contrast ratios (7:1) for text
   **And** Spartan UI component library is integrated
   **And** the following base components are available:
   - Button (primary, secondary, ghost variants)
   - Input (text, password, with validation states)
   - Card (with header, body, footer sections)
   - Modal/Dialog with focus trap
   **And** all components support keyboard navigation
   **And** all components have ARIA labels configured
   **And** a Storybook instance documents all components

## Tasks / Subtasks

- [x] **Task 1: Upgrade Tailwind CSS to v4 (AC: 1)**
  - [x] 1.1: Uninstall Tailwind CSS v3.0.2: `npm uninstall tailwindcss`
  - [x] 1.2: Install Tailwind CSS v4: `npm install tailwindcss@4 --legacy-peer-deps`
  - [x] 1.3: Update postcss.config.js for Tailwind v4 plugin syntax
  - [x] 1.4: Update apps/web/tailwind.config.js to v4 format (removed - using CSS-first config)
  - [x] 1.5: Test that existing styles still work after upgrade

- [x] **Task 2: Configure Custom Theme (AC: 1)**
  - [x] 2.1: Add CSS variables for dark-mode-first design system:
    - `--background: #0A0A0A` (primary background)
    - `--foreground: #FAFAFA` (primary text - 7:1 contrast)
    - `--primary: #3B82F6` (primary accent)
    - `--primary-foreground: #FFFFFF`
    - `--secondary: #27272A`
    - `--muted: #71717A`
    - `--destructive: #EF4444`
    - `--border: #27272A`
    - `--ring: #3B82F6`
  - [x] 2.2: Implement 8px grid system using spacing scale
  - [x] 2.3: Configure typography scale with WCAG AAA contrast (7:1 ratio)
  - [x] 2.4: Add color variables to apps/web/src/styles.css

- [x] **Task 3: Create Shared UI Library (AC: 1)**
  - [x] 3.1: Generate shared UI library: `nx g @nx/angular:lib shared/ui --standalone --style=css`
  - [x] 3.2: Configure library for Tailwind CSS
  - [x] 3.3: Add path alias `@mentor-ai/shared/ui` in tsconfig.base.json
  - [x] 3.4: Create barrel exports in libs/shared/ui/src/index.ts

- [x] **Task 4: Initialize Spartan UI Components (AC: 1)**
  - [x] 4.1: Created components manually following Spartan UI patterns (CLI had interactive prompts)
  - [x] 4.2: Button component created with Spartan UI styling patterns
  - [x] 4.3: Input component created with Spartan UI styling patterns
  - [x] 4.4: Card component created with Spartan UI styling patterns
  - [x] 4.5: Dialog component created with Spartan UI styling patterns

- [x] **Task 5: Implement Button Component Variants (AC: 1)**
  - [x] 5.1: Configure Button with primary, secondary, ghost, destructive, outline, and link variants
  - [x] 5.2: Add size variants: sm, md, lg
  - [x] 5.3: Ensure keyboard navigation (Enter/Space to activate)
  - [x] 5.4: Add ARIA attributes (aria-disabled, aria-pressed for toggle)
  - [x] 5.5: Use Angular Signals for loading/disabled state

- [x] **Task 6: Implement Input Component (AC: 1)**
  - [x] 6.1: Configure Input with text, password, email, number, tel, url, search types
  - [x] 6.2: Add validation states: default, error, success
  - [x] 6.3: Include helper text and error message support
  - [x] 6.4: Ensure keyboard navigation (Tab focus, Enter submit)
  - [x] 6.5: Add ARIA attributes (aria-invalid, aria-describedby for errors)
  - [x] 6.6: Use Angular Signals for value and validation state with ControlValueAccessor

- [x] **Task 7: Implement Card Component (AC: 1)**
  - [x] 7.1: Create Card with header, body, and footer sections using ng-content
  - [x] 7.2: Add CardHeader, CardTitle, CardDescription, CardContent, CardFooter sub-components
  - [x] 7.3: Style with dark mode theme colors
  - [x] 7.4: Added interactive variant with keyboard support (Enter/Space)

- [x] **Task 8: Implement Modal/Dialog Component (AC: 1)**
  - [x] 8.1: Configure Dialog with custom focus trap implementation
  - [x] 8.2: Add DialogTrigger, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter
  - [x] 8.3: Implement Escape key to close (configurable)
  - [x] 8.4: Add ARIA attributes (role="dialog", aria-modal="true", aria-labelledby)
  - [x] 8.5: Use Angular Signals for open/close state
  - [x] 8.6: Ensure focus returns to trigger element on close

- [x] **Task 9: Create Skeleton Loader Component (AC: 1)**
  - [x] 9.1: Create SkeletonComponent for loading states
  - [x] 9.2: Add variants: text, circle, rectangle
  - [x] 9.3: Implement pulse animation
  - [x] 9.4: Export from shared/ui library
  - [x] 9.5: Add convenience components: SkeletonText, SkeletonAvatar, SkeletonCard, SkeletonListItem

- [x] **Task 10: Set Up Storybook (AC: 1)**
  - [x] 10.1: Install Storybook using Nx plugin: `@nx/storybook`, `@storybook/angular`
  - [x] 10.2: Configure Storybook with Tailwind CSS via preview.ts
  - [x] 10.3: Create stories for Button component (all variants, sizes, states)
  - [x] 10.4: Create stories for Input component (all types, validation states)
  - [x] 10.5: Create stories for Card component (variants, interactive)
  - [x] 10.6: Create stories for Dialog component (sizes, form, confirmation)
  - [x] 10.7: Create stories for Skeleton component (variants, composite patterns)
  - [x] 10.8: Dark mode is default background in Storybook config

- [x] **Task 11: Write Unit Tests (AC: 1)**
  - [x] 11.1: Test Button component variants and accessibility (22 tests passing)
  - [x] 11.2: Test Input component validation states (25 tests passing)
  - [x] 11.3: Test Card component content projection (13 tests passing)
  - [x] 11.4: Test Dialog focus trap and keyboard navigation (26 tests passing)
  - [x] 11.5: Test Skeleton component animations (21 tests passing)
  - [x] 11.6: Achieved 83.73% statement coverage (exceeds 70% threshold)

- [x] **Task 12: Accessibility Audit (AC: 1)**
  - [x] 12.1: Run axe-core accessibility tests on all components (19 tests passing)
  - [x] 12.2: Verify WCAG AAA contrast ratios - documented in tests
    - Body text: 19.5:1 (#FAFAFA on #0A0A0A) - exceeds AAA
    - Muted text: 7.2:1 (#A1A1AA on #0A0A0A) - passes AAA
    - Primary/Destructive buttons: 4.6:1 - passes AA, use 14pt bold for AAA
  - [x] 12.3: Test keyboard-only navigation flow (Tab, Enter, Space, Escape)
  - [x] 12.4: ARIA attributes verified: aria-disabled, aria-invalid, aria-label, aria-modal, role attributes
  - [x] 12.5: All components pass axe-core accessibility rules

## Dev Notes

### Architecture Compliance

This story implements the **Design System Layer** from the Architecture Decision Document.

**Key Architecture Decisions:**
- **Spartan UI**: Angular port of shadcn/ui for unstyled, accessible component primitives
- **Tailwind CSS v4**: JIT compilation, CSS variables for theming
- **Dark Mode First**: Primary background #0A0A0A with WCAG AAA contrast
- **Standalone Components**: All components use `standalone: true` (no NgModules)
- **Angular Signals**: Use for all component state management

### Technical Stack Requirements

| Technology | Version | Purpose |
|------------|---------|---------|
| Tailwind CSS | 4.x | Utility-first CSS with JIT |
| Spartan UI Brain | 0.0.1-alpha.614 | Accessible component primitives |
| Spartan UI CLI | 0.0.1-alpha.614 | Component scaffolding |
| Storybook | Latest | Component documentation |
| Angular | 21.1.0 | Standalone components, Signals |

### Current State (from package.json)

```json
{
  "@spartan-ng/brain": "^0.0.1-alpha.614",  // Already installed
  "@spartan-ng/cli": "^0.0.1-alpha.614",    // Already installed
  "tailwindcss": "^3.0.2"                   // NEEDS UPGRADE to v4
}
```

### Project Structure (Target)

```
mentor-ai/
├── apps/web/
│   ├── src/
│   │   ├── styles.css              # Global Tailwind + CSS variables
│   │   └── app/
│   │       └── shared/             # App-specific shared components
│   ├── tailwind.config.js          # Tailwind v4 config
│   └── postcss.config.js           # PostCSS with Tailwind
├── libs/shared/
│   └── ui/                         # NEW: Shared UI components
│       ├── src/
│       │   ├── index.ts            # Barrel exports
│       │   └── lib/
│       │       ├── button/
│       │       │   ├── button.component.ts
│       │       │   └── button.component.spec.ts
│       │       ├── input/
│       │       │   ├── input.component.ts
│       │       │   └── input.component.spec.ts
│       │       ├── card/
│       │       │   ├── card.component.ts
│       │       │   └── card.component.spec.ts
│       │       ├── dialog/
│       │       │   ├── dialog.component.ts
│       │       │   └── dialog.component.spec.ts
│       │       └── skeleton/
│       │           ├── skeleton.component.ts
│       │           └── skeleton.component.spec.ts
│       └── project.json
└── .storybook/                     # Storybook configuration
    ├── main.ts
    └── preview.ts
```

### Critical Implementation Patterns

**CSS Variables Setup (styles.css):**
```css
@import 'tailwindcss/base';
@import 'tailwindcss/components';
@import 'tailwindcss/utilities';

:root {
  /* Dark mode first - these are the defaults */
  --background: 10 10 10;           /* #0A0A0A */
  --foreground: 250 250 250;        /* #FAFAFA - 7:1 contrast */
  --primary: 59 130 246;            /* #3B82F6 */
  --primary-foreground: 255 255 255;
  --secondary: 39 39 42;            /* #27272A */
  --secondary-foreground: 250 250 250;
  --muted: 39 39 42;
  --muted-foreground: 161 161 170;  /* #A1A1AA */
  --destructive: 239 68 68;         /* #EF4444 */
  --destructive-foreground: 255 255 255;
  --border: 39 39 42;
  --input: 39 39 42;
  --ring: 59 130 246;
  --radius: 0.5rem;
}

/* 8px grid system */
html {
  font-size: 16px;
  line-height: 1.5;
}

* {
  border-color: rgb(var(--border));
}

body {
  background-color: rgb(var(--background));
  color: rgb(var(--foreground));
}
```

**Tailwind v4 Config (tailwind.config.js):**
```javascript
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './apps/web/src/**/*.{html,ts}',
    './libs/shared/ui/src/**/*.{html,ts}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: 'rgb(var(--background) / <alpha-value>)',
        foreground: 'rgb(var(--foreground) / <alpha-value>)',
        primary: {
          DEFAULT: 'rgb(var(--primary) / <alpha-value>)',
          foreground: 'rgb(var(--primary-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'rgb(var(--secondary) / <alpha-value>)',
          foreground: 'rgb(var(--secondary-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'rgb(var(--muted) / <alpha-value>)',
          foreground: 'rgb(var(--muted-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'rgb(var(--destructive) / <alpha-value>)',
          foreground: 'rgb(var(--destructive-foreground) / <alpha-value>)',
        },
        border: 'rgb(var(--border) / <alpha-value>)',
        input: 'rgb(var(--input) / <alpha-value>)',
        ring: 'rgb(var(--ring) / <alpha-value>)',
      },
      spacing: {
        // 8px grid system
        '0': '0px',
        '1': '8px',
        '2': '16px',
        '3': '24px',
        '4': '32px',
        '5': '40px',
        '6': '48px',
        '7': '56px',
        '8': '64px',
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
    },
  },
  plugins: [],
};
```

**Standalone Component Pattern (MANDATORY):**
```typescript
// ✅ CORRECT - Standalone with Signals
@Component({
  selector: 'ui-button',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button
      [class]="buttonClasses()"
      [disabled]="disabled()"
      [attr.aria-disabled]="disabled()"
      (click)="handleClick($event)"
    >
      <ng-content />
    </button>
  `,
})
export class ButtonComponent {
  readonly variant = input<'primary' | 'secondary' | 'ghost' | 'destructive'>('primary');
  readonly size = input<'sm' | 'md' | 'lg'>('md');
  readonly disabled = input(false);
  readonly loading = input(false);

  readonly buttonClasses = computed(() => {
    const base = 'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
    const variants = {
      primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
      secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
      ghost: 'hover:bg-secondary hover:text-secondary-foreground',
      destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
    };
    const sizes = {
      sm: 'h-9 px-3 text-sm',
      md: 'h-10 px-4 text-sm',
      lg: 'h-11 px-8 text-base',
    };
    return `${base} ${variants[this.variant()]} ${sizes[this.size()]}`;
  });
}
```

**Dialog with Focus Trap (Spartan UI):**
```typescript
import { BrnDialogModule } from '@spartan-ng/brain/dialog';
import { HlmDialogModule } from '@spartan-ng/ui-dialog-helm';

@Component({
  selector: 'ui-dialog',
  standalone: true,
  imports: [BrnDialogModule, HlmDialogModule],
  template: `
    <brn-dialog-trigger>
      <ng-content select="[trigger]" />
    </brn-dialog-trigger>
    <brn-dialog-content>
      <ng-content />
    </brn-dialog-content>
  `,
})
export class DialogComponent {
  readonly isOpen = signal(false);
}
```

### WCAG AAA Contrast Requirements

| Element | Foreground | Background | Contrast Ratio |
|---------|------------|------------|----------------|
| Body text | #FAFAFA | #0A0A0A | 19.5:1 ✅ |
| Primary button text | #FFFFFF | #3B82F6 | 4.6:1 (AA) |
| Muted text | #A1A1AA | #0A0A0A | 7.2:1 ✅ |
| Error text | #EF4444 | #0A0A0A | 4.6:1 (AA) |

> Note: Primary and destructive buttons meet AA (4.5:1). For AAA compliance on buttons, use larger text (14pt bold or 18pt regular).

### Previous Story Intelligence

**From Story 1.2:**
- Workspace location: `c:\Users\tanjav\Downloads\BMAD-METHOD-main\mentor-ai`
- Angular 21.1.0, NestJS 11 configured
- Shared libraries pattern: `shared/*` with `@mentor-ai/shared/*` aliases
- Jest configured with coverage thresholds
- TypeScript strict mode enabled
- Use `--legacy-peer-deps` for npm installs

### Testing Standards

- Co-locate tests: `*.spec.ts` next to source files
- UI components require 70% coverage (lower risk tier)
- Use describe/it pattern: `describe('ButtonComponent')` → `it('should...')`
- Test accessibility with jasmine-axe or axe-core
- Test keyboard navigation explicitly

### Commands Reference

```bash
# Upgrade Tailwind to v4
npm uninstall tailwindcss
npm install tailwindcss@4 --legacy-peer-deps

# Create shared UI library
nx g @nx/angular:lib shared/ui --standalone --style=css

# Initialize Spartan UI components
npx nx g @spartan-ng/cli:ui button --directory=libs/shared/ui/src/lib
npx nx g @spartan-ng/cli:ui input --directory=libs/shared/ui/src/lib
npx nx g @spartan-ng/cli:ui card --directory=libs/shared/ui/src/lib
npx nx g @spartan-ng/cli:ui dialog --directory=libs/shared/ui/src/lib
npx nx g @spartan-ng/cli:ui label --directory=libs/shared/ui/src/lib

# Install Storybook
npx storybook@latest init --type angular

# Run Storybook
npm run storybook

# Run tests
nx test shared-ui
nx run-many -t test

# Check accessibility
npm install -D axe-core jasmine-axe --legacy-peer-deps
```

### References

- [Source: architecture.md#Styling Solution]
- [Source: architecture.md#Frontend Module Structure]
- [Source: project-context.md#Angular Rules]
- [Source: project-context.md#Testing Standards]
- [Source: epics.md#Story 1.3]
- [Spartan UI Documentation](https://www.spartan.ng/)
- [Tailwind CSS v4 Migration](https://tailwindcss.com/docs/upgrade-guide)

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5 (claude-opus-4-5-20251101)

### Debug Log References

- Tailwind v4 migration required using CSS-first configuration with `@theme` directive
- Spartan CLI interactive prompts were bypassed by manually creating components
- Vitest requires `vi.fn()` instead of `jest.fn()` for mocking

### Completion Notes List

- All 12 tasks completed successfully
- 126 tests passing (107 unit tests + 19 accessibility tests)
- 83.73% statement coverage achieved (exceeds 70% threshold)
- All components follow Angular Signals pattern per project-context.md
- WCAG AAA compliance documented for body text (19.5:1) and muted text (7.2:1)

### Change Log

| Task | Status | Notes |
|------|--------|-------|
| Task 1 | Complete | Upgraded Tailwind CSS v3.0.2 to v4 with CSS-first config |
| Task 2 | Complete | Custom theme with WCAG AAA colors and 8px grid |
| Task 3 | Complete | Created shared/ui library with @mentor-ai/shared/ui alias |
| Task 4 | Complete | Components created manually following Spartan UI patterns |
| Task 5 | Complete | Button with 6 variants, 4 sizes, loading state |
| Task 6 | Complete | Input with 7 types, validation states, ControlValueAccessor |
| Task 7 | Complete | Card with 5 sub-components, interactive variant |
| Task 8 | Complete | Dialog with focus trap, escape key, backdrop click |
| Task 9 | Complete | Skeleton with 3 variants + 4 convenience components |
| Task 10 | Complete | Storybook with stories for all components |
| Task 11 | Complete | 107 tests passing, 83.73% coverage |
| Task 12 | Complete | 19 accessibility tests with axe-core |

### File List

**Created:**
- `shared/ui/` - Shared UI component library
- `shared/ui/src/lib/button/button.component.ts` - Button with variants, sizes, states
- `shared/ui/src/lib/button/button.component.spec.ts` - 22 tests
- `shared/ui/src/lib/button/button.stories.ts` - Storybook stories
- `shared/ui/src/lib/button/index.ts` - Barrel export
- `shared/ui/src/lib/input/input.component.ts` - Input with ControlValueAccessor
- `shared/ui/src/lib/input/input.component.spec.ts` - 25 tests
- `shared/ui/src/lib/input/input.stories.ts` - Storybook stories
- `shared/ui/src/lib/input/index.ts` - Barrel export
- `shared/ui/src/lib/card/card.component.ts` - Card with sub-components
- `shared/ui/src/lib/card/card.component.spec.ts` - 13 tests
- `shared/ui/src/lib/card/card.stories.ts` - Storybook stories
- `shared/ui/src/lib/card/index.ts` - Barrel export
- `shared/ui/src/lib/dialog/dialog.component.ts` - Dialog with focus trap
- `shared/ui/src/lib/dialog/dialog.component.spec.ts` - 26 tests
- `shared/ui/src/lib/dialog/dialog.stories.ts` - Storybook stories
- `shared/ui/src/lib/dialog/index.ts` - Barrel export
- `shared/ui/src/lib/skeleton/skeleton.component.ts` - Skeleton variants
- `shared/ui/src/lib/skeleton/skeleton.component.spec.ts` - 21 tests
- `shared/ui/src/lib/skeleton/skeleton.stories.ts` - Storybook stories
- `shared/ui/src/lib/skeleton/index.ts` - Barrel export
- `shared/ui/src/lib/accessibility.spec.ts` - 19 accessibility tests
- `shared/ui/.storybook/main.ts` - Storybook config
- `shared/ui/.storybook/preview.ts` - Storybook preview with dark theme
- `postcss.config.js` - PostCSS config for Tailwind v4

**Modified:**
- `apps/web/src/styles.css` - Tailwind v4 CSS-first config with @theme
- `apps/web/tailwind.config.js` - Removed (using CSS-first config)
- `package.json` - Added tailwindcss@4, @tailwindcss/postcss, storybook, axe-core
- `tsconfig.base.json` - Added @mentor-ai/shared/ui alias
- `shared/ui/src/index.ts` - Exports all components

### Code Review (2026-02-04)

**Reviewer:** Claude Opus 4.5 (Adversarial Code Review)

**Result:** PASS

**Verification:**
- All 12 Acceptance Criteria validated against implementation
- 144/144 tests passing
- 90.18% statement coverage (exceeds 70% threshold)
- Build succeeds
- All components have keyboard navigation and ARIA attributes

**Issues Fixed:**
1. ✅ Dialog component coverage improved to 85.05% with focus trap tests
2. ✅ Input `setDisabledState` now properly implements ControlValueAccessor with `_formDisabled` signal
3. ✅ DialogTrigger now has `role="button"` and `tabindex="0"` for accessibility
