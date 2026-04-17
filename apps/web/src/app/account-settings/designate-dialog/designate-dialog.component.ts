import { Component, DestroyRef, inject, output, signal, OnInit } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BackupOwnerService } from '../services/backup-owner.service';
import type { TeamMemberResponse } from '@mentor-ai/shared/types';

@Component({
  selector: 'app-designate-dialog',
  standalone: true,
  styles: [
    `
      .backdrop {
        position: fixed;
        inset: 0;
        z-index: 50;
        background: rgba(0, 0, 0, 0.6);
      }
      .dialog {
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        z-index: 51;
        width: 90%;
        max-width: 440px;
        background: #161B22;
        border: 1px solid #21262D;
        border-radius: 12px;
        padding: 24px;
      }
      .dialog-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
      }
      .dialog-header-left {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .dialog-header svg {
        width: 20px;
        height: 20px;
        color: #58A6FF;
      }
      .dialog-title {
        font-size: 16px;
        font-weight: 600;
      }
      .close-btn {
        padding: 4px;
        border: none;
        background: transparent;
        color: #9e9e9e;
        cursor: pointer;
        border-radius: 4px;
      }
      .close-btn:hover {
        color: #E6EDF3;
        background: #1C2128;
      }
      .close-btn svg {
        width: 20px;
        height: 20px;
      }
      .dialog-desc {
        font-size: 14px;
        color: #9e9e9e;
        line-height: 1.5;
        margin-bottom: 16px;
      }

      /* Loading */
      .loading-center {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 32px 0;
      }
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      .spinner {
        width: 24px;
        height: 24px;
        border: 3px solid #21262D;
        border-top-color: #58A6FF;
        border-radius: 50%;
        animation: spin 0.6s linear infinite;
      }

      /* Empty */
      .empty-text {
        text-align: center;
        padding: 32px 0;
        font-size: 14px;
        color: #9e9e9e;
      }
      .empty-text p {
        margin: 4px 0;
      }

      /* Member list */
      .member-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
        margin-bottom: 20px;
        max-height: 256px;
        overflow-y: auto;
      }
      .member-option {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px;
        border-radius: 8px;
        border: 1px solid #21262D;
        cursor: pointer;
        transition: border-color 0.15s, background 0.15s;
      }
      .member-option:hover {
        background: rgba(59, 130, 246, 0.05);
      }
      .member-option.selected {
        border-color: #58A6FF;
        background: rgba(59, 130, 246, 0.08);
      }
      .member-option input[type="radio"] {
        accent-color: #58A6FF;
        margin-top: 2px;
      }
      .member-option-name {
        font-size: 14px;
        font-weight: 500;
      }
      .member-option-meta {
        font-size: 12px;
        color: #9e9e9e;
        margin-top: 2px;
      }

      /* Error */
      .error-banner {
        margin-bottom: 16px;
        padding: 12px;
        border-radius: 8px;
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.2);
        color: #f87171;
        font-size: 13px;
      }

      /* Actions */
      .dialog-actions {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
      }
      .btn-cancel {
        padding: 8px 16px;
        border-radius: 6px;
        border: 1px solid #21262D;
        background: transparent;
        color: #E6EDF3;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        font-family: inherit;
      }
      .btn-cancel:hover {
        background: #1C2128;
      }
      .btn-confirm {
        padding: 8px 16px;
        border-radius: 6px;
        border: none;
        background: #58A6FF;
        color: white;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        font-family: inherit;
      }
      .btn-confirm:hover:not(:disabled) {
        background: #2563eb;
      }
      .btn-confirm:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    `,
  ],
  template: `
    <div class="backdrop" (click)="onCancel()"></div>
    <div class="dialog">
      <div class="dialog-header">
        <div class="dialog-header-left">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <h2 class="dialog-title">Odredi rezervnog vlasnika</h2>
        </div>
        <button class="close-btn" (click)="onCancel()">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <p class="dialog-desc">
        Izaberite člana tima koji može povratiti vaš nalog ako izgubite pristup.
        Moći će da resetuje vašu dvofaktorsku autentifikaciju.
      </p>

      @if (isLoadingMembers$()) {
        <div class="loading-center"><div class="spinner"></div></div>
      } @else if (eligibleMembers$().length === 0) {
        <div class="empty-text">
          <p>Nema dostupnih članova tima.</p>
          <p>Prvo pozovite administratora ili člana u vaš radni prostor.</p>
        </div>
      } @else {
        <div class="member-list">
          @for (member of eligibleMembers$(); track member.id) {
            <label class="member-option" [class.selected]="selectedMemberId$() === member.id">
              <input type="radio" name="backupOwner" [value]="member.id"
                [checked]="selectedMemberId$() === member.id"
                (change)="selectedMemberId$.set(member.id)" />
              <div>
                <div class="member-option-name">{{ member.name || member.email }}</div>
                <div class="member-option-meta">{{ member.email }} · {{ formatRole(member.role) }}</div>
              </div>
            </label>
          }
        </div>
      }

      @if (errorMessage$()) {
        <div class="error-banner">{{ errorMessage$() }}</div>
      }

      <div class="dialog-actions">
        <button class="btn-cancel" (click)="onCancel()">Otkaži</button>
        <button class="btn-confirm" (click)="onConfirm()"
          [disabled]="isSubmitting$() || !selectedMemberId$()">
          {{ isSubmitting$() ? 'Određivanje...' : 'Odredi' }}
        </button>
      </div>
    </div>
  `,
})
export class DesignateDialogComponent implements OnInit {
  private readonly backupOwnerService = inject(BackupOwnerService);
  private readonly destroyRef = inject(DestroyRef);

  readonly close = output<string | false>();

  readonly eligibleMembers$ = signal<TeamMemberResponse[]>([]);
  readonly selectedMemberId$ = signal<string>('');
  readonly isLoadingMembers$ = signal(true);
  readonly isSubmitting$ = signal(false);
  readonly errorMessage$ = signal('');

  ngOnInit(): void {
    this.loadEligibleMembers();
  }

  private loadEligibleMembers(): void {
    this.backupOwnerService
      .getEligibleMembers()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.eligibleMembers$.set(response.data);
          this.isLoadingMembers$.set(false);
        },
        error: (err: Error) => {
          this.errorMessage$.set(err.message);
          this.isLoadingMembers$.set(false);
        },
      });
  }

  onConfirm(): void {
    const memberId = this.selectedMemberId$();
    if (!memberId) return;

    this.isSubmitting$.set(true);
    this.errorMessage$.set('');

    this.backupOwnerService
      .designateBackupOwner(memberId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.close.emit(memberId);
        },
        error: (err: Error) => {
          this.errorMessage$.set(err.message);
          this.isSubmitting$.set(false);
        },
      });
  }

  onCancel(): void {
    this.close.emit(false);
  }

  formatRole(role: string): string {
    switch (role) {
      case 'ADMIN':
        return 'Admin';
      case 'MEMBER':
        return 'Član';
      default:
        return role;
    }
  }
}
