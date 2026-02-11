import { Component, DestroyRef, inject, signal, OnInit } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { BrnButton } from '@spartan-ng/brain/button';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideSettings,
  lucideLoader2,
  lucideShieldCheck,
  lucideAlertTriangle,
  lucideUserMinus,
  lucideArrowLeft,
  lucideTrash2,
} from '@ng-icons/lucide';
import { BackupOwnerService } from './services/backup-owner.service';
import { TenantDeletionService } from './services/tenant-deletion.service';
import { DesignateDialogComponent } from './designate-dialog/designate-dialog.component';
import { DeleteWorkspaceDialogComponent } from './delete-workspace-dialog/delete-workspace-dialog.component';
import type {
  BackupOwnerResponse,
  BackupOwnerStatus,
  TenantDeletionStatusResponse,
  TenantStatus,
} from '@mentor-ai/shared/types';

@Component({
  selector: 'app-account-settings',
  standalone: true,
  imports: [CommonModule, RouterLink, BrnButton, NgIcon, DatePipe, DesignateDialogComponent, DeleteWorkspaceDialogComponent],
  providers: [
    provideIcons({
      lucideSettings,
      lucideLoader2,
      lucideShieldCheck,
      lucideAlertTriangle,
      lucideUserMinus,
      lucideArrowLeft,
      lucideTrash2,
    }),
  ],
  template: `
    <div class="min-h-screen bg-background">
      <header class="border-b border-border bg-card">
        <div class="container mx-auto px-4 py-4 flex items-center gap-3">
          <a routerLink="/team" class="text-muted-foreground hover:text-foreground">
            <ng-icon name="lucideArrowLeft" class="h-5 w-5" />
          </a>
          <ng-icon name="lucideSettings" class="h-6 w-6 text-primary" />
          <h1 class="text-xl font-semibold text-foreground">Account Settings</h1>
        </div>
      </header>

      <main class="container mx-auto px-4 py-8 max-w-2xl space-y-8">
        @if (isLoading$()) {
          <div class="flex items-center justify-center py-12">
            <ng-icon name="lucideLoader2" class="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        } @else {
          <!-- Warning Banner (AC4) -->
          @if (backupOwnerStatus$()?.showWarning) {
            <div class="flex items-start gap-3 rounded-lg bg-amber-50 border border-amber-200 p-4">
              <ng-icon name="lucideAlertTriangle" class="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
              <div class="flex-1">
                <p class="text-sm font-medium text-amber-800">
                  Designate a backup Owner to prevent account lockout
                </p>
                <p class="text-xs text-amber-700 mt-1">
                  Your workspace has been active for {{ backupOwnerStatus$()?.tenantAgeDays }} days without a backup owner.
                </p>
              </div>
              <button
                brnButton
                (click)="showDesignateDialog$.set(true)"
                class="inline-flex items-center justify-center rounded-md bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700"
              >
                Designate Now
              </button>
            </div>
          }

          <!-- Backup Owner Section -->
          <section class="rounded-lg border bg-card p-6">
            <div class="flex items-center gap-2 mb-4">
              <ng-icon name="lucideShieldCheck" class="h-5 w-5 text-primary" />
              <h2 class="text-lg font-semibold text-foreground">Backup Owner</h2>
            </div>

            <p class="text-sm text-muted-foreground mb-6">
              A backup owner can recover your account if you lose access (e.g., lost 2FA device).
              They can reset your two-factor authentication so you can log back in.
            </p>

            @if (backupOwner$()) {
              <!-- Current Backup Owner -->
              <div class="flex items-center justify-between rounded-md border p-4">
                <div class="flex items-center gap-3">
                  <div class="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <ng-icon name="lucideShieldCheck" class="h-5 w-5" />
                  </div>
                  <div>
                    <p class="font-medium text-foreground">{{ backupOwner$()!.name || backupOwner$()!.email }}</p>
                    <p class="text-sm text-muted-foreground">{{ backupOwner$()!.email }}</p>
                    <p class="text-xs text-muted-foreground mt-0.5">
                      Designated {{ formatDate(backupOwner$()!.designatedAt) }}
                    </p>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  @if (showRemoveConfirm$()) {
                    <span class="text-sm text-destructive mr-1">Remove backup owner?</span>
                    <button
                      brnButton
                      (click)="onRemoveBackupOwner()"
                      [disabled]="isRemoving$()"
                      class="inline-flex items-center justify-center rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-white hover:bg-destructive/90 disabled:opacity-50"
                    >
                      {{ isRemoving$() ? 'Removing...' : 'Confirm' }}
                    </button>
                    <button
                      brnButton
                      (click)="showRemoveConfirm$.set(false)"
                      class="inline-flex items-center justify-center rounded-md border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
                    >
                      Cancel
                    </button>
                  } @else {
                    <button
                      brnButton
                      (click)="showDesignateDialog$.set(true)"
                      class="inline-flex items-center justify-center rounded-md border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
                    >
                      Change
                    </button>
                    <button
                      brnButton
                      (click)="showRemoveConfirm$.set(true)"
                      class="inline-flex items-center justify-center gap-1 rounded-md bg-destructive/10 px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/20"
                    >
                      <ng-icon name="lucideUserMinus" class="h-3.5 w-3.5" />
                      Remove
                    </button>
                  }
                </div>
              </div>
            } @else {
              <!-- No Backup Owner -->
              <div class="flex flex-col items-center justify-center py-8 text-center rounded-md border border-dashed">
                <ng-icon name="lucideShieldCheck" class="h-10 w-10 text-muted-foreground/50 mb-3" />
                <p class="text-sm font-medium text-foreground mb-1">No backup owner designated</p>
                <p class="text-xs text-muted-foreground mb-4">
                  Choose a team member who can recover your account if needed.
                </p>
                <button
                  brnButton
                  (click)="showDesignateDialog$.set(true)"
                  class="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  <ng-icon name="lucideShieldCheck" class="h-4 w-4" />
                  Designate Backup Owner
                </button>
              </div>
            }

            <!-- Error Message -->
            @if (errorMessage$()) {
              <div class="mt-4 rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                {{ errorMessage$() }}
              </div>
            }
          </section>

          <!-- Danger Zone Section -->
          <section class="rounded-lg border border-destructive/30 bg-card p-6">
            <div class="flex items-center gap-2 mb-4">
              <ng-icon name="lucideTrash2" class="h-5 w-5 text-destructive" />
              <h2 class="text-lg font-semibold text-destructive">Danger Zone</h2>
            </div>

            @if (deletionStatus$()?.status === 'PENDING_DELETION') {
              <!-- Pending Deletion Banner -->
              <div class="rounded-md bg-destructive/10 border border-destructive/30 p-4">
                <div class="flex items-start gap-3">
                  <ng-icon name="lucideAlertTriangle" class="h-5 w-5 text-destructive mt-0.5 flex-shrink-0" />
                  <div class="flex-1">
                    <p class="font-medium text-destructive">Workspace scheduled for deletion</p>
                    <p class="text-sm text-destructive/80 mt-1">
                      Deletion will occur on {{ deletionStatus$()?.gracePeriodEndsAt | date:'medium' }}
                    </p>
                    <p class="text-xs text-muted-foreground mt-2">
                      You can cancel this within the 7-day grace period.
                    </p>
                  </div>
                </div>
                <div class="mt-4 flex justify-end">
                  <button
                    brnButton
                    (click)="onCancelDeletion()"
                    [disabled]="isCancellingDeletion$()"
                    class="inline-flex items-center justify-center rounded-md border border-destructive px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10 disabled:opacity-50"
                  >
                    {{ isCancellingDeletion$() ? 'Cancelling...' : 'Cancel Deletion' }}
                  </button>
                </div>
              </div>
            } @else {
              <!-- Delete Workspace Button -->
              <p class="text-sm text-muted-foreground mb-4">
                Once you delete your workspace, all data will be permanently removed within 30 days.
                This action cannot be undone after the 7-day grace period.
              </p>
              <button
                brnButton
                (click)="showDeleteDialog$.set(true)"
                class="inline-flex items-center justify-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90"
              >
                <ng-icon name="lucideTrash2" class="h-4 w-4" />
                Delete Workspace
              </button>
            }

            <!-- Deletion Error Message -->
            @if (deletionErrorMessage$()) {
              <div class="mt-4 rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                {{ deletionErrorMessage$() }}
              </div>
            }
          </section>
        }
      </main>
    </div>

    @if (showDesignateDialog$()) {
      <app-designate-dialog
        (close)="onDesignateDialogClose($event)"
      />
    }

    @if (showDeleteDialog$()) {
      <app-delete-workspace-dialog
        [tenantName]="tenantName$"
        [memberCount]="memberCount$"
        (close)="onDeleteDialogClose($event)"
      />
    }
  `,
})
export class AccountSettingsComponent implements OnInit {
  private readonly backupOwnerService = inject(BackupOwnerService);
  private readonly tenantDeletionService = inject(TenantDeletionService);
  private readonly destroyRef = inject(DestroyRef);

  readonly isLoading$ = signal(true);
  readonly backupOwner$ = signal<BackupOwnerResponse | null>(null);
  readonly backupOwnerStatus$ = signal<BackupOwnerStatus | null>(null);
  readonly showDesignateDialog$ = signal(false);
  readonly isRemoving$ = signal(false);
  readonly showRemoveConfirm$ = signal(false);
  readonly errorMessage$ = signal('');

  // Deletion-related signals
  readonly deletionStatus$ = signal<TenantDeletionStatusResponse | null>(null);
  readonly showDeleteDialog$ = signal(false);
  readonly isCancellingDeletion$ = signal(false);
  readonly deletionErrorMessage$ = signal('');

  // Computed from deletion status - populated from API
  get tenantName$() {
    return this.deletionStatus$()?.tenantName ?? 'My Workspace';
  }
  get memberCount$() {
    return this.deletionStatus$()?.memberCount ?? 0;
  }

  ngOnInit(): void {
    this.loadData();
  }

  private loadData(): void {
    this.isLoading$.set(true);
    forkJoin([
      this.backupOwnerService.getBackupOwner(),
      this.backupOwnerService.getBackupOwnerStatus(),
      this.tenantDeletionService.getDeletionStatus(),
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ([backupOwnerRes, statusRes, deletionStatusRes]) => {
          this.backupOwner$.set(backupOwnerRes.data);
          this.backupOwnerStatus$.set(statusRes.data);
          this.deletionStatus$.set(deletionStatusRes.data);
          this.isLoading$.set(false);
        },
        error: (err: Error) => {
          this.errorMessage$.set(err.message);
          this.isLoading$.set(false);
        },
      });
  }

  onDesignateDialogClose(result: string | false): void {
    this.showDesignateDialog$.set(false);
    if (result) {
      this.loadData();
    }
  }

  onRemoveBackupOwner(): void {
    this.isRemoving$.set(true);
    this.errorMessage$.set('');

    this.backupOwnerService
      .removeBackupOwner()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isRemoving$.set(false);
          this.showRemoveConfirm$.set(false);
          this.loadData();
        },
        error: (err: Error) => {
          this.errorMessage$.set(err.message);
          this.isRemoving$.set(false);
          this.showRemoveConfirm$.set(false);
        },
      });
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  onCancelDeletion(): void {
    this.isCancellingDeletion$.set(true);
    this.deletionErrorMessage$.set('');

    this.tenantDeletionService
      .cancelDeletion()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.deletionStatus$.set(response.data);
          this.isCancellingDeletion$.set(false);
        },
        error: (err: Error) => {
          this.deletionErrorMessage$.set(err.message || 'Failed to cancel deletion');
          this.isCancellingDeletion$.set(false);
        },
      });
  }

  onDeleteDialogClose(result: TenantDeletionStatusResponse | false): void {
    this.showDeleteDialog$.set(false);
    if (result) {
      this.deletionStatus$.set(result);
    }
  }
}
