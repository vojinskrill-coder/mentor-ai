import { Component, signal } from '@angular/core';
import { BrnButton } from '@spartan-ng/brain/button';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideCheck, lucideX } from '@ng-icons/lucide';

/**
 * Test component to verify Spartan UI integration
 * Uses Spartan brain button directive and ng-icons
 */
@Component({
  selector: 'app-spartan-test',
  standalone: true,
  imports: [BrnButton, NgIcon],
  providers: [provideIcons({ lucideCheck, lucideX })],
  template: `
    <div class="p-4 space-y-4">
      <h2 class="text-xl font-bold text-foreground">Spartan UI Test</h2>

      <div class="flex gap-2">
        <button
          brnButton
          class="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          (click)="increment()"
        >
          <ng-icon name="lucideCheck" class="mr-2 h-4 w-4" />
          Count: {{ count$() }}
        </button>

        <button
          brnButton
          class="inline-flex items-center justify-center rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
          (click)="reset()"
        >
          <ng-icon name="lucideX" class="mr-2 h-4 w-4" />
          Reset
        </button>
      </div>

      <p class="text-muted-foreground">
        If you see styled buttons with icons above, Spartan UI is working!
      </p>
    </div>
  `,
})
export class SpartanTest {
  count$ = signal(0);

  increment(): void {
    this.count$.update((c) => c + 1);
  }

  reset(): void {
    this.count$.set(0);
  }
}
