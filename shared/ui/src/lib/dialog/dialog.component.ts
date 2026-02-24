import {
  Component,
  computed,
  input,
  output,
  signal,
  effect,
  ElementRef,
  ViewChild,
  AfterViewInit,
  OnDestroy,
  HostListener,
} from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'ui-dialog',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (isOpen()) {
      <!-- Backdrop -->
      <div
        class="fixed inset-0 z-50 bg-black/80 animate-in"
        (click)="handleBackdropClick($event)"
        aria-hidden="true"
      ></div>

      <!-- Dialog -->
      <div
        #dialogElement
        role="dialog"
        aria-modal="true"
        [attr.aria-labelledby]="titleId()"
        [attr.aria-describedby]="descriptionId()"
        class="fixed left-1/2 top-1/2 z-50 grid w-full max-w-lg -translate-x-1/2 -translate-y-1/2 gap-4 border border-border bg-card p-6 shadow-lg animate-in sm:rounded-lg"
        (keydown.escape)="handleEscape($event)"
      >
        <ng-content />

        <!-- Close button -->
        @if (showCloseButton()) {
          <button
            type="button"
            class="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
            (click)="close()"
            aria-label="Close dialog"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        }
      </div>
    }
  `,
  styles: [
    `
      :host {
        display: contents;
      }

      .animate-in {
        animation: fadeIn 150ms ease-out;
      }

      @keyframes fadeIn {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }
    `,
  ],
})
export class DialogComponent implements AfterViewInit, OnDestroy {
  private static idCounter = 0;

  @ViewChild('dialogElement') dialogElement?: ElementRef<HTMLDivElement>;

  // Inputs
  readonly open = input(false);
  readonly showCloseButton = input(true);
  readonly closeOnBackdropClick = input(true);
  readonly closeOnEscape = input(true);

  // Internal state
  readonly isOpen = signal(false);
  private triggerElement: HTMLElement | null = null;
  private focusableElements: HTMLElement[] = [];

  // IDs for accessibility
  readonly dialogId = signal(`ui-dialog-${++DialogComponent.idCounter}`);
  readonly titleId = computed(() => `${this.dialogId()}-title`);
  readonly descriptionId = computed(() => `${this.dialogId()}-description`);

  // Outputs
  readonly openChange = output<boolean>();
  readonly closed = output<void>();

  constructor() {
    // Sync open input with internal state
    effect(() => {
      const openValue = this.open();
      if (openValue !== this.isOpen()) {
        if (openValue) {
          this.openDialog();
        } else {
          this.closeDialog();
        }
      }
    });
  }

  ngAfterViewInit(): void {
    if (this.isOpen()) {
      this.setupFocusTrap();
    }
  }

  ngOnDestroy(): void {
    this.restoreBodyScroll();
  }

  openDialog(): void {
    // Store trigger element for focus restoration
    this.triggerElement = document.activeElement as HTMLElement;

    this.isOpen.set(true);
    this.openChange.emit(true);

    // Prevent body scroll
    document.body.style.overflow = 'hidden';

    // Setup focus trap after dialog renders
    setTimeout(() => {
      this.setupFocusTrap();
      this.focusFirstElement();
    }, 0);
  }

  close(): void {
    this.closeDialog();
  }

  private closeDialog(): void {
    this.isOpen.set(false);
    this.openChange.emit(false);
    this.closed.emit();

    // Restore body scroll
    this.restoreBodyScroll();

    // Return focus to trigger element
    if (this.triggerElement) {
      this.triggerElement.focus();
      this.triggerElement = null;
    }
  }

  private restoreBodyScroll(): void {
    document.body.style.overflow = '';
  }

  handleBackdropClick(_event: MouseEvent): void {
    if (this.closeOnBackdropClick()) {
      this.close();
    }
  }

  handleEscape(event: Event): void {
    if (this.closeOnEscape()) {
      event.preventDefault();
      this.close();
    }
  }

  @HostListener('document:keydown', ['$event'])
  handleTabKey(event: KeyboardEvent): void {
    if (!this.isOpen() || event.key !== 'Tab') {
      return;
    }

    this.updateFocusableElements();

    if (this.focusableElements.length === 0) {
      return;
    }

    const firstElement = this.focusableElements[0];
    const lastElement = this.focusableElements[this.focusableElements.length - 1];

    if (event.shiftKey) {
      // Shift + Tab
      if (document.activeElement === firstElement) {
        event.preventDefault();
        lastElement?.focus();
      }
    } else {
      // Tab
      if (document.activeElement === lastElement) {
        event.preventDefault();
        firstElement?.focus();
      }
    }
  }

  private setupFocusTrap(): void {
    this.updateFocusableElements();
  }

  private updateFocusableElements(): void {
    if (!this.dialogElement) {
      return;
    }

    const selector = [
      'button:not([disabled])',
      'input:not([disabled])',
      'select:not([disabled])',
      'textarea:not([disabled])',
      'a[href]',
      '[tabindex]:not([tabindex="-1"])',
    ].join(', ');

    this.focusableElements = Array.from(
      this.dialogElement.nativeElement.querySelectorAll<HTMLElement>(selector)
    );
  }

  private focusFirstElement(): void {
    if (this.focusableElements.length > 0) {
      this.focusableElements[0]?.focus();
    } else if (this.dialogElement) {
      // If no focusable elements, focus the dialog itself
      this.dialogElement.nativeElement.focus();
    }
  }
}

@Component({
  selector: 'ui-dialog-header',
  standalone: true,
  template: `
    <div class="flex flex-col gap-1.5 text-center sm:text-left">
      <ng-content />
    </div>
  `,
})
export class DialogHeaderComponent {}

@Component({
  selector: 'ui-dialog-title',
  standalone: true,
  template: `
    <h2 class="text-lg font-semibold leading-none tracking-tight">
      <ng-content />
    </h2>
  `,
})
export class DialogTitleComponent {}

@Component({
  selector: 'ui-dialog-description',
  standalone: true,
  template: `
    <p class="text-sm text-muted-foreground">
      <ng-content />
    </p>
  `,
})
export class DialogDescriptionComponent {}

@Component({
  selector: 'ui-dialog-content',
  standalone: true,
  template: `
    <div class="py-4">
      <ng-content />
    </div>
  `,
})
export class DialogContentComponent {}

@Component({
  selector: 'ui-dialog-footer',
  standalone: true,
  template: `
    <div class="flex flex-col-reverse sm:flex-row sm:justify-end sm:gap-2">
      <ng-content />
    </div>
  `,
})
export class DialogFooterComponent {}

@Component({
  selector: 'ui-dialog-trigger',
  standalone: true,
  template: `
    <span
      role="button"
      tabindex="0"
      (click)="handleClick()"
      (keydown.enter)="handleKeydown()"
      (keydown.space)="handleKeydown()"
    >
      <ng-content />
    </span>
  `,
})
export class DialogTriggerComponent {
  readonly dialogRef = input.required<DialogComponent>();

  handleClick(): void {
    const dialog = this.dialogRef();
    if (dialog) {
      dialog.openDialog();
    }
  }

  handleKeydown(): void {
    this.handleClick();
  }
}
