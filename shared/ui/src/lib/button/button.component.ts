import { Component, computed, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'destructive' | 'outline' | 'link';
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon';

@Component({
  selector: 'ui-button',
  standalone: true,
  imports: [CommonModule],
  template: `
    <button
      [type]="type()"
      [class]="buttonClasses()"
      [disabled]="disabled() || loading()"
      [attr.aria-disabled]="disabled() || loading()"
      [attr.aria-pressed]="pressed()"
      [attr.aria-label]="ariaLabel()"
      (click)="handleClick($event)"
      (keydown.enter)="handleKeydown($event)"
      (keydown.space)="handleKeydown($event)"
    >
      @if (loading()) {
        <svg
          class="mr-2 h-4 w-4 animate-spin"
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            class="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            stroke-width="4"
          ></circle>
          <path
            class="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
      }
      <ng-content />
    </button>
  `,
  styles: [
    `
      :host {
        display: inline-block;
      }
    `,
  ],
})
export class ButtonComponent {
  // Inputs using Angular Signals
  readonly variant = input<ButtonVariant>('primary');
  readonly size = input<ButtonSize>('md');
  readonly disabled = input(false);
  readonly loading = input(false);
  readonly pressed = input<boolean | undefined>(undefined);
  readonly type = input<'button' | 'submit' | 'reset'>('button');
  readonly ariaLabel = input<string | undefined>(undefined);

  // Outputs
  readonly buttonClick = output<MouseEvent>();

  // Computed classes using Tailwind v4 theme variables
  readonly buttonClasses = computed(() => {
    const base = [
      'inline-flex',
      'items-center',
      'justify-center',
      'gap-2',
      'whitespace-nowrap',
      'rounded-lg',
      'font-medium',
      'transition-colors',
      'focus-visible:outline-none',
      'focus-visible:ring-2',
      'focus-visible:ring-ring',
      'focus-visible:ring-offset-2',
      'focus-visible:ring-offset-background',
      'disabled:pointer-events-none',
      'disabled:opacity-50',
    ].join(' ');

    const variants: Record<ButtonVariant, string> = {
      primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
      secondary: 'bg-secondary text-secondary-foreground hover:bg-secondary/80',
      ghost: 'hover:bg-secondary hover:text-secondary-foreground',
      destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
      outline:
        'border border-border bg-transparent hover:bg-secondary hover:text-secondary-foreground',
      link: 'text-primary underline-offset-4 hover:underline',
    };

    const sizes: Record<ButtonSize, string> = {
      sm: 'h-9 px-3 text-sm',
      md: 'h-10 px-4 text-sm',
      lg: 'h-11 px-8 text-base',
      icon: 'h-10 w-10',
    };

    return `${base} ${variants[this.variant()]} ${sizes[this.size()]}`;
  });

  handleClick(event: MouseEvent): void {
    if (!this.disabled() && !this.loading()) {
      this.buttonClick.emit(event);
    }
  }

  handleKeydown(event: Event): void {
    // Button element handles Enter/Space natively, but ensure it works when disabled
    if (this.disabled() || this.loading()) {
      event.preventDefault();
    }
  }
}
