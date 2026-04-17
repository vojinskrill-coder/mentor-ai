import { Component, DestroyRef, inject, signal, OnInit } from '@angular/core';
import { DatePipe } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { BackupOwnerService } from './services/backup-owner.service';
import { TenantDeletionService } from './services/tenant-deletion.service';
import { DesignateDialogComponent } from './designate-dialog/designate-dialog.component';
import { DeleteWorkspaceDialogComponent } from './delete-workspace-dialog/delete-workspace-dialog.component';
import { ToastService } from '../core/services/toast.service';
import type {
  BackupOwnerResponse,
  BackupOwnerStatus,
  TenantDeletionStatusResponse,
} from '@mentor-ai/shared/types';

@Component({
  selector: 'app-account-settings',
  standalone: true,
  imports: [DatePipe, DesignateDialogComponent, DeleteWorkspaceDialogComponent],
  styles: [
    `
      :host {
        display: block;
      }
      .page-content {
        max-width: 640px;
        margin: 0 auto;
        padding: 32px 24px;
      }
      .page-title {
        font-size: 20px;
        font-weight: 600;
        margin-bottom: 32px;
      }

      /* Skeleton */
      .skeleton-block {
        background: #161B22;
        border: 1px solid #21262D;
        border-radius: 12px;
        padding: 24px;
        margin-bottom: 24px;
      }
      .skeleton-line {
        height: 14px;
        background: #1C2128;
        border-radius: 4px;
        margin-bottom: 12px;
      }
      .skeleton-line.w60 { width: 60%; }
      .skeleton-line.w80 { width: 80%; }
      .skeleton-line.w40 { width: 40%; }
      @keyframes shimmer {
        0% { opacity: 0.5; }
        50% { opacity: 1; }
        100% { opacity: 0.5; }
      }
      .skeleton-line {
        animation: shimmer 1.5s ease-in-out infinite;
      }

      /* Warning banner */
      .warning-banner {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 16px;
        border-radius: 8px;
        background: rgba(245, 158, 11, 0.1);
        border: 1px solid rgba(245, 158, 11, 0.2);
        margin-bottom: 24px;
      }
      .warning-banner svg {
        width: 20px;
        height: 20px;
        color: #f59e0b;
        flex-shrink: 0;
        margin-top: 2px;
      }
      .warning-content {
        flex: 1;
      }
      .warning-title {
        font-size: 14px;
        font-weight: 500;
        color: #fbbf24;
        margin-bottom: 4px;
      }
      .warning-desc {
        font-size: 12px;
        color: #d97706;
      }
      .warning-btn {
        padding: 6px 14px;
        border-radius: 6px;
        border: none;
        background: #d97706;
        color: white;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        font-family: inherit;
        white-space: nowrap;
        align-self: center;
      }
      .warning-btn:hover {
        background: #b45309;
      }

      /* Section card */
      .section-card {
        background: #161B22;
        border: 1px solid #21262D;
        border-radius: 12px;
        padding: 24px;
        margin-bottom: 24px;
      }
      .section-card.danger {
        border-color: rgba(239, 68, 68, 0.3);
      }
      .section-header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 8px;
      }
      .section-header svg {
        width: 20px;
        height: 20px;
        flex-shrink: 0;
      }
      .section-header .icon-primary {
        color: #58A6FF;
      }
      .section-header .icon-danger {
        color: #ef4444;
      }
      .section-title {
        font-size: 16px;
        font-weight: 600;
      }
      .section-title.danger {
        color: #ef4444;
      }
      .section-desc {
        font-size: 14px;
        color: #9e9e9e;
        line-height: 1.5;
        margin-bottom: 20px;
      }

      /* Current backup owner card */
      .owner-card {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 16px;
        border-radius: 8px;
        border: 1px solid #21262D;
        background: #0D1117;
      }
      .owner-left {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .owner-avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(59, 130, 246, 0.1);
        color: #58A6FF;
        flex-shrink: 0;
      }
      .owner-avatar svg {
        width: 20px;
        height: 20px;
      }
      .owner-name {
        font-size: 14px;
        font-weight: 500;
      }
      .owner-email {
        font-size: 13px;
        color: #9e9e9e;
        margin-top: 2px;
      }
      .owner-date {
        font-size: 12px;
        color: #9e9e9e;
        margin-top: 2px;
      }
      .owner-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      /* Empty owner state */
      .empty-owner {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        padding: 32px 16px;
        border-radius: 8px;
        border: 1px dashed #21262D;
      }
      .empty-owner svg {
        width: 40px;
        height: 40px;
        color: rgba(158, 158, 158, 0.3);
        margin-bottom: 12px;
      }
      .empty-owner-title {
        font-size: 14px;
        font-weight: 500;
        margin-bottom: 4px;
      }
      .empty-owner-desc {
        font-size: 12px;
        color: #9e9e9e;
        margin-bottom: 16px;
      }

      /* Buttons */
      .btn-primary {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 10px 20px;
        border-radius: 8px;
        border: none;
        background: #58A6FF;
        color: white;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        font-family: inherit;
        transition: background 0.15s;
      }
      .btn-primary:hover:not(:disabled) {
        background: #2563eb;
      }
      .btn-primary:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .btn-primary svg {
        width: 16px;
        height: 16px;
      }
      .btn-outline {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 6px 14px;
        border-radius: 6px;
        border: 1px solid #21262D;
        background: transparent;
        color: #E6EDF3;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        font-family: inherit;
      }
      .btn-outline:hover {
        background: #1C2128;
      }
      .btn-danger {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 10px 20px;
        border-radius: 8px;
        border: none;
        background: #ef4444;
        color: white;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        font-family: inherit;
      }
      .btn-danger:hover:not(:disabled) {
        background: #dc2626;
      }
      .btn-danger:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .btn-danger svg {
        width: 16px;
        height: 16px;
      }
      .btn-danger-outline {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 6px 14px;
        border-radius: 6px;
        border: none;
        background: rgba(239, 68, 68, 0.1);
        color: #ef4444;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        font-family: inherit;
      }
      .btn-danger-outline:hover:not(:disabled) {
        background: rgba(239, 68, 68, 0.2);
      }
      .btn-danger-outline:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      /* Confirm row */
      .confirm-row {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .confirm-label {
        font-size: 13px;
        color: #ef4444;
      }

      /* Deletion banner */
      .deletion-banner {
        padding: 16px;
        border-radius: 8px;
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.3);
      }
      .deletion-banner-content {
        display: flex;
        align-items: flex-start;
        gap: 12px;
      }
      .deletion-banner svg {
        width: 20px;
        height: 20px;
        color: #ef4444;
        flex-shrink: 0;
        margin-top: 2px;
      }
      .deletion-title {
        font-size: 14px;
        font-weight: 500;
        color: #f87171;
      }
      .deletion-date {
        font-size: 13px;
        color: rgba(248, 113, 113, 0.8);
        margin-top: 4px;
      }
      .deletion-hint {
        font-size: 12px;
        color: #9e9e9e;
        margin-top: 8px;
      }
      .deletion-actions {
        display: flex;
        justify-content: flex-end;
        margin-top: 16px;
      }
      .cancel-delete-btn {
        padding: 8px 16px;
        border-radius: 6px;
        border: 1px solid #ef4444;
        background: transparent;
        color: #ef4444;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        font-family: inherit;
      }
      .cancel-delete-btn:hover:not(:disabled) {
        background: rgba(239, 68, 68, 0.1);
      }
      .cancel-delete-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      /* Error */
      .error-banner {
        margin-top: 16px;
        padding: 12px;
        border-radius: 8px;
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.2);
        color: #f87171;
        font-size: 13px;
      }

      @media (max-width: 640px) {
        .owner-card {
          flex-direction: column;
          gap: 12px;
          align-items: flex-start;
        }
        .warning-banner {
          flex-direction: column;
        }
      }
    `,
  ],
  template: `
    <div class="page-content">
      <h1 class="page-title">Account Settings</h1>

      @if (isLoading$()) {
        <!-- Skeleton loading -->
        <div class="skeleton-block">
          <div class="skeleton-line w60"></div>
          <div class="skeleton-line w80"></div>
          <div class="skeleton-line w40"></div>
        </div>
        <div class="skeleton-block">
          <div class="skeleton-line w40"></div>
          <div class="skeleton-line w80"></div>
        </div>
      } @else {
        <!-- Warning Banner -->
        @if (backupOwnerStatus$()?.showWarning) {
          <div class="warning-banner">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div class="warning-content">
              <div class="warning-title">Designate a backup owner to prevent account lockout</div>
              <div class="warning-desc">
                Your workspace has been active for {{ backupOwnerStatus$()?.tenantAgeDays }} days without a backup owner.
              </div>
            </div>
            <button class="warning-btn" (click)="showDesignateDialog$.set(true)">Designate now</button>
          </div>
        }

        <!-- Backup Owner Section -->
        <section class="section-card">
          <div class="section-header">
            <svg class="icon-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
            <h2 class="section-title">Backup Owner</h2>
          </div>
          <p class="section-desc">
            A backup owner can recover your account if you lose access (e.g., lost 2FA device).
            They can reset two-factor authentication so you can sign in again.
          </p>

          @if (backupOwner$()) {
            <div class="owner-card">
              <div class="owner-left">
                <div class="owner-avatar">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div>
                  <div class="owner-name">{{ backupOwner$()!.name || backupOwner$()!.email }}</div>
                  <div class="owner-email">{{ backupOwner$()!.email }}</div>
                  <div class="owner-date">Designated {{ formatDate(backupOwner$()!.designatedAt) }}</div>
                </div>
              </div>
              <div class="owner-actions">
                @if (showRemoveConfirm$()) {
                  <div class="confirm-row">
                    <span class="confirm-label">Remove backup owner?</span>
                    <button class="btn-danger" (click)="onRemoveBackupOwner()" [disabled]="isRemoving$()" style="padding: 6px 14px; font-size: 13px;">
                      {{ isRemoving$() ? 'Removing...' : 'Confirm' }}
                    </button>
                    <button class="btn-outline" (click)="showRemoveConfirm$.set(false)">Cancel</button>
                  </div>
                } @else {
                  <button class="btn-outline" (click)="showDesignateDialog$.set(true)">Change</button>
                  <button class="btn-danger-outline" (click)="showRemoveConfirm$.set(true)">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" style="width:14px;height:14px;">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                        d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6" />
                    </svg>
                    Remove
                  </button>
                }
              </div>
            </div>
          } @else {
            <div class="empty-owner">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
              <div class="empty-owner-title">No backup owner designated</div>
              <div class="empty-owner-desc">Choose a team member who can recover your account if needed.</div>
              <button class="btn-primary" (click)="showDesignateDialog$.set(true)">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                Designate backup owner
              </button>
            </div>
          }

          @if (errorMessage$()) {
            <div class="error-banner">{{ errorMessage$() }}</div>
          }
        </section>

        <!-- Danger Zone -->
        <section class="section-card danger">
          <div class="section-header">
            <svg class="icon-danger" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            <h2 class="section-title danger">Danger Zone</h2>
          </div>

          @if (deletionStatus$()?.status === 'PENDING_DELETION') {
            <div class="deletion-banner">
              <div class="deletion-banner-content">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <div>
                  <div class="deletion-title">Workspace is scheduled for deletion</div>
                  <div class="deletion-date">
                    Deletion will occur {{ deletionStatus$()?.gracePeriodEndsAt | date:'medium' }}
                  </div>
                  <div class="deletion-hint">You can cancel within 7 days.</div>
                </div>
              </div>
              <div class="deletion-actions">
                <button class="cancel-delete-btn" (click)="onCancelDeletion()" [disabled]="isCancellingDeletion$()">
                  {{ isCancellingDeletion$() ? 'Cancelling...' : 'Cancel deletion' }}
                </button>
              </div>
            </div>
          } @else {
            <p class="section-desc">
              When you delete a workspace, all data will be permanently removed within 30 days.
              This action cannot be undone after the 7-day grace period.
            </p>
            <button class="btn-danger" (click)="showDeleteDialog$.set(true)">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              Delete workspace
            </button>
          }

          @if (deletionErrorMessage$()) {
            <div class="error-banner">{{ deletionErrorMessage$() }}</div>
          }
        </section>
      }
    </div>

    @if (showDesignateDialog$()) {
      <app-designate-dialog (close)="onDesignateDialogClose($event)" />
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
  private readonly toastService = inject(ToastService);
  private readonly destroyRef = inject(DestroyRef);

  readonly isLoading$ = signal(true);
  readonly backupOwner$ = signal<BackupOwnerResponse | null>(null);
  readonly backupOwnerStatus$ = signal<BackupOwnerStatus | null>(null);
  readonly showDesignateDialog$ = signal(false);
  readonly isRemoving$ = signal(false);
  readonly showRemoveConfirm$ = signal(false);
  readonly errorMessage$ = signal('');

  readonly deletionStatus$ = signal<TenantDeletionStatusResponse | null>(null);
  readonly showDeleteDialog$ = signal(false);
  readonly isCancellingDeletion$ = signal(false);
  readonly deletionErrorMessage$ = signal('');

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
      this.toastService.success('Backup owner designated');
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
          this.toastService.success('Backup owner removed');
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
          this.toastService.success('Deletion cancelled');
        },
        error: (err: Error) => {
          this.deletionErrorMessage$.set(err.message || 'Error cancelling deletion');
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
