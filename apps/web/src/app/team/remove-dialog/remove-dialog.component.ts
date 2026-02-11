import { Component, effect, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { BrnButton } from '@spartan-ng/brain/button';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideX, lucideAlertTriangle } from '@ng-icons/lucide';
import type { RemovalStrategy } from '../services/team-members.service';

@Component({
  selector: 'app-remove-dialog',
  standalone: true,
  imports: [CommonModule, BrnButton, NgIcon],
  providers: [provideIcons({ lucideX, lucideAlertTriangle })],
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center">
      <!-- Backdrop -->
      <div
        class="absolute inset-0 bg-black/50"
        (click)="onCancel()"
      ></div>

      <!-- Dialog -->
      <div class="relative z-10 w-full max-w-md rounded-lg bg-card p-6 shadow-lg">
        <!-- Header -->
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold text-foreground">Remove Team Member</h2>
          <button
            brnButton
            (click)="onCancel()"
            class="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <ng-icon name="lucideX" class="h-5 w-5" />
          </button>
        </div>

        <!-- Warning -->
        <div class="flex items-start gap-3 mb-4 rounded-md bg-amber-50 border border-amber-200 p-3">
          <ng-icon name="lucideAlertTriangle" class="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
          <div class="text-sm text-amber-800">
            <p class="font-medium">This action cannot be undone.</p>
            <p class="mt-1">
              <strong>{{ memberName() }}</strong> ({{ memberEmail() }}) will immediately lose access to the workspace.
            </p>
          </div>
        </div>

        <!-- Strategy Selection -->
        <div class="space-y-3 mb-6">
          <p class="text-sm font-medium text-foreground">What should happen to their data?</p>
          <label class="flex items-start gap-3 p-3 rounded-md border cursor-pointer hover:bg-muted/50"
                 [class.border-primary]="selectedStrategy$() === 'REASSIGN'"
                 [class.bg-primary/5]="selectedStrategy$() === 'REASSIGN'"
          >
            <input
              type="radio"
              name="strategy"
              value="REASSIGN"
              [checked]="selectedStrategy$() === 'REASSIGN'"
              (change)="selectedStrategy$.set('REASSIGN')"
              class="mt-0.5"
            />
            <div>
              <p class="text-sm font-medium text-foreground">Reassign data to me</p>
              <p class="text-xs text-muted-foreground mt-0.5">
                Their notes and saved outputs will be transferred to you. Conversations will be archived.
              </p>
            </div>
          </label>
          <label class="flex items-start gap-3 p-3 rounded-md border cursor-pointer hover:bg-muted/50"
                 [class.border-primary]="selectedStrategy$() === 'ARCHIVE'"
                 [class.bg-primary/5]="selectedStrategy$() === 'ARCHIVE'"
          >
            <input
              type="radio"
              name="strategy"
              value="ARCHIVE"
              [checked]="selectedStrategy$() === 'ARCHIVE'"
              (change)="selectedStrategy$.set('ARCHIVE')"
              class="mt-0.5"
            />
            <div>
              <p class="text-sm font-medium text-foreground">Archive data</p>
              <p class="text-xs text-muted-foreground mt-0.5">
                Their data will be archived but retained securely.
              </p>
            </div>
          </label>
        </div>

        <!-- Error Message -->
        @if (errorMessage$()) {
          <div class="mb-4 rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
            {{ errorMessage$() }}
          </div>
        }

        <!-- Actions -->
        <div class="flex justify-end gap-3">
          <button
            brnButton
            (click)="onCancel()"
            class="inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            brnButton
            (click)="onConfirm()"
            [disabled]="isSubmitting$()"
            class="inline-flex items-center justify-center rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
          >
            {{ isSubmitting$() ? 'Removing...' : 'Remove Member' }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class RemoveDialogComponent {
  readonly memberName = input.required<string>();
  readonly memberEmail = input.required<string>();
  readonly memberRole = input.required<string>();
  readonly error = input<string>('');

  readonly close = output<RemovalStrategy | false>();

  readonly selectedStrategy$ = signal<RemovalStrategy>('REASSIGN');
  readonly isSubmitting$ = signal(false);
  readonly errorMessage$ = signal('');

  constructor() {
    effect(() => {
      const err = this.error();
      if (err) {
        this.errorMessage$.set(err);
        this.isSubmitting$.set(false);
      }
    });
  }

  onConfirm(): void {
    this.isSubmitting$.set(true);
    this.errorMessage$.set('');
    this.close.emit(this.selectedStrategy$());
  }

  onCancel(): void {
    this.close.emit(false);
  }
}
