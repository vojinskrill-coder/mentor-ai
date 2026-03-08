import { Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { TenantDeletionService } from '../services/tenant-deletion.service';
import type { TenantDeletionStatusResponse } from '@mentor-ai/shared/types';

@Component({
  selector: 'app-delete-workspace-dialog',
  standalone: true,
  imports: [FormsModule],
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
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
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
        color: #ef4444;
      }
      .dialog-title {
        font-size: 16px;
        font-weight: 600;
        color: #ef4444;
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
        color: #fafafa;
        background: #242424;
      }
      .close-btn svg {
        width: 20px;
        height: 20px;
      }

      /* Warning box */
      .warning-box {
        padding: 16px;
        border-radius: 8px;
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.2);
        margin-bottom: 16px;
      }
      .warning-box-title {
        font-size: 14px;
        font-weight: 500;
        color: #f87171;
        margin-bottom: 8px;
      }
      .warning-list {
        list-style: disc;
        padding-left: 20px;
        font-size: 13px;
        color: #f87171;
      }
      .warning-list li {
        margin-bottom: 4px;
      }

      .info-text {
        font-size: 13px;
        color: #9e9e9e;
        margin-bottom: 16px;
        line-height: 1.5;
      }
      .info-text strong {
        color: #fafafa;
      }

      /* Confirm input */
      .confirm-section {
        margin-bottom: 20px;
      }
      .confirm-label {
        display: block;
        font-size: 14px;
        font-weight: 500;
        margin-bottom: 8px;
      }
      .confirm-label .highlight {
        font-weight: 700;
      }
      .confirm-input {
        width: 100%;
        padding: 10px 12px;
        border-radius: 8px;
        border: 1px solid #2a2a2a;
        background: #0d0d0d;
        color: #fafafa;
        font-size: 14px;
        font-family: inherit;
        box-sizing: border-box;
      }
      .confirm-input:focus {
        outline: none;
        border-color: #3b82f6;
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
        border: 1px solid #2a2a2a;
        background: transparent;
        color: #fafafa;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        font-family: inherit;
      }
      .btn-cancel:hover {
        background: #242424;
      }
      .btn-delete {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 8px 16px;
        border-radius: 6px;
        border: none;
        background: #ef4444;
        color: white;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        font-family: inherit;
      }
      .btn-delete:hover:not(:disabled) {
        background: #dc2626;
      }
      .btn-delete:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      .btn-spinner {
        width: 16px;
        height: 16px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-top-color: white;
        border-radius: 50%;
        animation: spin 0.6s linear infinite;
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
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h2 class="dialog-title">Obriši radni prostor</h2>
        </div>
        <button class="close-btn" (click)="onCancel()">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <div class="warning-box">
        <div class="warning-box-title">Ova radnja će:</div>
        <ul class="warning-list">
          <li>Trajno obrisati sve podatke radnog prostora</li>
          <li>Ukloniti pristup za svih {{ memberCount$() }} članova tima</li>
          <li>Ne može se poništiti nakon 7-dnevnog roka</li>
          <li>Završiti u roku od 30 dana (GDPR usklađenost)</li>
        </ul>
      </div>

      <div class="info-text">
        <p><strong>Rok za otkazivanje:</strong> 7 dana</p>
        <p><strong>Ukupno vreme obrade:</strong> Do 30 dana</p>
      </div>

      <div class="confirm-section">
        <label class="confirm-label">
          Unesite "<span class="highlight">{{ tenantName$() }}</span>" za potvrdu:
        </label>
        <input type="text" class="confirm-input" [(ngModel)]="confirmationInput"
          placeholder="Naziv radnog prostora" autocomplete="off"
          [attr.aria-invalid]="errorMessage$() ? 'true' : null" />
      </div>

      @if (errorMessage$()) {
        <div class="error-banner">{{ errorMessage$() }}</div>
      }

      <div class="dialog-actions">
        <button class="btn-cancel" (click)="onCancel()">Otkaži</button>
        <button class="btn-delete" (click)="onConfirm()"
          [disabled]="isSubmitting$() || confirmationInput !== tenantName$()">
          @if (isSubmitting$()) {
            <span class="btn-spinner"></span>
            Brisanje...
          } @else {
            Obriši radni prostor
          }
        </button>
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
      this.errorMessage$.set('Naziv radnog prostora se ne poklapa.');
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
          this.errorMessage$.set(err.message || 'Greška pri pokretanju brisanja radnog prostora');
          this.isSubmitting$.set(false);
        },
      });
  }

  onCancel(): void {
    this.close.emit(false);
  }
}
