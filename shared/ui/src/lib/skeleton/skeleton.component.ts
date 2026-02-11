import { Component, computed, input } from '@angular/core';
import { CommonModule } from '@angular/common';

export type SkeletonVariant = 'text' | 'circle' | 'rectangle';

@Component({
  selector: 'ui-skeleton',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div
      [class]="skeletonClasses()"
      [style.width]="width()"
      [style.height]="height()"
      role="status"
      aria-label="Loading..."
    >
      <span class="sr-only">Loading...</span>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border-width: 0;
    }

    @keyframes pulse {
      0%, 100% {
        opacity: 1;
      }
      50% {
        opacity: 0.5;
      }
    }

    .animate-pulse {
      animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
    }
  `],
})
export class SkeletonComponent {
  readonly variant = input<SkeletonVariant>('rectangle');
  readonly width = input<string>('100%');
  readonly height = input<string>('1rem');
  readonly rounded = input(true);

  readonly skeletonClasses = computed(() => {
    const base = 'bg-muted animate-pulse';

    const variants: Record<SkeletonVariant, string> = {
      text: 'h-4',
      circle: 'rounded-full aspect-square',
      rectangle: '',
    };

    const roundedClass = this.variant() !== 'circle' && this.rounded() ? 'rounded-md' : '';

    return `${base} ${variants[this.variant()]} ${roundedClass}`.trim();
  });
}

// Convenience components for common skeleton patterns
@Component({
  selector: 'ui-skeleton-text',
  standalone: true,
  imports: [SkeletonComponent],
  template: `
    <ui-skeleton variant="text" [width]="width()" height="1rem" />
  `,
})
export class SkeletonTextComponent {
  readonly width = input<string>('100%');
}

@Component({
  selector: 'ui-skeleton-avatar',
  standalone: true,
  imports: [SkeletonComponent],
  template: `
    <ui-skeleton variant="circle" [width]="size()" [height]="size()" />
  `,
})
export class SkeletonAvatarComponent {
  readonly size = input<string>('2.5rem');
}

@Component({
  selector: 'ui-skeleton-card',
  standalone: true,
  imports: [SkeletonComponent],
  template: `
    <div class="flex flex-col gap-3">
      <ui-skeleton variant="rectangle" width="100%" height="12rem" />
      <div class="flex flex-col gap-2">
        <ui-skeleton variant="text" width="80%" />
        <ui-skeleton variant="text" width="60%" />
      </div>
    </div>
  `,
})
export class SkeletonCardComponent {}

@Component({
  selector: 'ui-skeleton-list-item',
  standalone: true,
  imports: [SkeletonComponent],
  template: `
    <div class="flex items-center gap-4">
      <ui-skeleton variant="circle" width="2.5rem" height="2.5rem" />
      <div class="flex flex-col gap-2 flex-1">
        <ui-skeleton variant="text" width="40%" />
        <ui-skeleton variant="text" width="70%" />
      </div>
    </div>
  `,
})
export class SkeletonListItemComponent {}
