import { Component, computed, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'ui-card',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      [class]="cardClasses()"
      [attr.role]="clickable() ? 'button' : null"
      [attr.tabindex]="clickable() ? 0 : null"
      [attr.aria-label]="ariaLabel()"
      (click)="handleClick($event)"
      (keydown.enter)="handleKeydown($event)"
      (keydown.space)="handleKeydown($event)"
    >
      <ng-content />
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
      }
    `,
  ],
})
export class CardComponent {
  readonly clickable = input(false);
  readonly selected = input(false);
  readonly ariaLabel = input<string | undefined>(undefined);

  readonly cardClick = output<Event>();

  readonly cardClasses = computed(() => {
    const base = [
      'rounded-lg',
      'border',
      'border-border',
      'bg-card',
      'text-card-foreground',
      'shadow-sm',
    ].join(' ');

    const clickableClasses = this.clickable()
      ? 'cursor-pointer transition-colors hover:bg-secondary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2'
      : '';

    const selectedClasses = this.selected() ? 'ring-2 ring-primary' : '';

    return `${base} ${clickableClasses} ${selectedClasses}`.trim();
  });

  handleClick(event: MouseEvent): void {
    if (this.clickable()) {
      this.cardClick.emit(event);
    }
  }

  handleKeydown(event: Event): void {
    if (this.clickable()) {
      event.preventDefault();
      this.cardClick.emit(event);
    }
  }
}

@Component({
  selector: 'ui-card-header',
  standalone: true,
  template: `
    <div class="flex flex-col gap-1.5 p-6">
      <ng-content />
    </div>
  `,
})
export class CardHeaderComponent {}

@Component({
  selector: 'ui-card-title',
  standalone: true,
  template: `
    <h3 class="text-2xl font-semibold leading-none tracking-tight">
      <ng-content />
    </h3>
  `,
})
export class CardTitleComponent {}

@Component({
  selector: 'ui-card-description',
  standalone: true,
  template: `
    <p class="text-sm text-muted-foreground">
      <ng-content />
    </p>
  `,
})
export class CardDescriptionComponent {}

@Component({
  selector: 'ui-card-content',
  standalone: true,
  template: `
    <div class="p-6 pt-0">
      <ng-content />
    </div>
  `,
})
export class CardContentComponent {}

@Component({
  selector: 'ui-card-footer',
  standalone: true,
  template: `
    <div class="flex items-center p-6 pt-0">
      <ng-content />
    </div>
  `,
})
export class CardFooterComponent {}
