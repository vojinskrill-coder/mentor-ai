import { Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BrnButton } from '@spartan-ng/brain/button';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideX, lucideLoader2, lucideAlertTriangle } from '@ng-icons/lucide';
import { TenantDeletionService } from '../services/tenant-deletion.service';
import type { TenantDeletionStatusResponse } from '@mentor-ai/shared/types';

@Component({
  selector: 'app-delete-workspace-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, BrnButton, NgIcon],
  providers: [provideIcons({ lucideX, lucideLoader2, lucideAlertTriangle })],
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
          <div class="flex items-center gap-2">
            <ng-icon name="lucideAlertTriangle" class="h-5 w-5 text-destructive" />
            <h2 class="text-lg font-semibold text-destructive">Delete Workspace</h2>
          </div>
          <button
            brnButton
            (click)="onCancel()"
            class="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <ng-icon name="lucideX" class="h-5 w-5" />
          </button>
        </div>

        <!-- Warning Content -->
        <div class="rounded-md bg-destructive/10 border border-destructive/20 p-4 mb-4">
          <p class="text-sm font-medium text-destructive mb-2">This action will:</p>
          <ul class="list-disc list-inside text-sm text-destructive space-y-1">
            <li>Permanently delete all workspace data</li>
            <li>Remove access for all {{ memberCount$() }} team members</li>
            <li>Cannot be undone after the 7-day grace period</li>
            <li>Complete within 30 days (GDPR compliance)</li>
          </ul>
        </div>

        <div class="text-sm text-muted-foreground mb-4">
          <p><strong>Grace period:</strong> 7 days to cancel deletion</p>
          <p><strong>Total processing time:</strong> Up to 30 days</p>
        </div>

        <!-- Type-to-confirm -->
        <div class="mb-6">
          <label class="block text-sm font-medium text-foreground mb-2">
            Type "<span class="font-bold">{{ tenantName$() }}</span>" to confirm:
          </label>
          <input
            type="text"
            [(ngModel)]="confirmationInput"
            class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            placeholder="Workspace name"
            [attr.aria-invalid]="errorMessage$() ? 'true' : null"
          />
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
            [disabled]="isSubmitting$() || confirmationInput !== tenantName$()"
            class="inline-flex items-center justify-center rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            @if (isSubmitting$()) {
              <ng-icon name="lucideLoader2" class="h-4 w-4 animate-spin mr-2" />
              Deleting...
            } @else {
              Delete Workspace
            }
          </button>
        </div>
      </div>
    </div>
  `,
})
export class DeleteWorkspaceDialogComponent {
  private readonly tenantDeletionService = inject(TenantDeletionService);
  private readonly destroyRef = inject(DestroyRef);

  readonly tenantName$ = input.required<string>({ alias: 'tenantName' });
  readonly memberCount$ = input<number>(0, { alias: 'memberCount' });

  readonly close = output<TenantDeletionStatusResponse | false>();

  readonly isSubmitting$ = signal(false);
  readonly errorMessage$ = signal('');

  confirmationInput = '';

  onConfirm(): void {
    const tenantName = this.tenantName$();
    if (this.confirmationInput !== tenantName) {
      this.errorMessage$.set('Workspace name does not match.');
      return;
    }

    this.isSubmitting$.set(true);
    this.errorMessage$.set('');

    this.tenantDeletionService
      .requestDeletion(tenantName)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.close.emit(response.data);
        },
        error: (err: Error) => {
          this.errorMessage$.set(err.message || 'Failed to initiate workspace deletion');
          this.isSubmitting$.set(false);
        },
      });
  }

  onCancel(): void {
    this.close.emit(false);
  }
}
