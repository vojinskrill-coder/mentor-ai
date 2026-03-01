import { Component, effect, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { RemovalStrategy } from '../services/team-members.service';

@Component({
  selector: 'app-remove-dialog',
  standalone: true,
  imports: [CommonModule],
  styles: [
    `
      :host {
        display: block;
      }
      .overlay {
        position: fixed;
        inset: 0;
        z-index: 50;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
      }
      .backdrop {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
      }
      .dialog {
        position: relative;
        z-index: 10;
        width: 100%;
        max-width: 440px;
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 12px;
        padding: 24px;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        color: #fafafa;
        font-family: 'Inter', system-ui, sans-serif;
      }
      .dialog-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 16px;
      }
      .dialog-header h2 {
        font-size: 18px;
        font-weight: 600;
      }
      .close-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 6px;
        border: none;
        background: transparent;
        color: #9e9e9e;
        cursor: pointer;
      }
      .close-btn:hover {
        background: #242424;
        color: #fafafa;
      }
      .close-btn svg {
        width: 20px;
        height: 20px;
      }

      /* Warning */
      .warn-box {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        margin-bottom: 16px;
        border-radius: 8px;
        background: rgba(245, 158, 11, 0.1);
        border: 1px solid rgba(245, 158, 11, 0.2);
        padding: 12px;
      }
      .warn-icon {
        width: 20px;
        height: 20px;
        color: #fbbf24;
        flex-shrink: 0;
        margin-top: 2px;
      }
      .warn-text {
        font-size: 13px;
        color: #fbbf24;
      }
      .warn-text strong {
        font-weight: 600;
      }
      .warn-text p {
        margin-top: 4px;
      }

      /* Strategy */
      .strategy-section {
        margin-bottom: 24px;
      }
      .strategy-label {
        font-size: 13px;
        font-weight: 500;
        margin-bottom: 12px;
      }
      .strategy-options {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .strategy-option {
        display: flex;
        align-items: flex-start;
        gap: 12px;
        padding: 12px;
        border-radius: 8px;
        border: 1px solid #2a2a2a;
        background: transparent;
        cursor: pointer;
        transition:
          border-color 0.2s,
          background 0.2s;
      }
      .strategy-option:hover {
        background: rgba(255, 255, 255, 0.02);
      }
      .strategy-option.selected {
        border-color: #3b82f6;
        background: rgba(59, 130, 246, 0.05);
      }
      .strategy-option input[type='radio'] {
        margin-top: 2px;
        accent-color: #3b82f6;
      }
      .strategy-option-title {
        font-size: 13px;
        font-weight: 500;
      }
      .strategy-option-desc {
        font-size: 12px;
        color: #9e9e9e;
        margin-top: 4px;
      }

      /* Error */
      .error-box {
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.2);
        border-radius: 8px;
        padding: 12px;
        margin-bottom: 16px;
        font-size: 13px;
        color: #ef4444;
      }

      /* Actions */
      .actions {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
      }
      .cancel-btn {
        padding: 10px 20px;
        border-radius: 8px;
        border: 1px solid #2a2a2a;
        background: transparent;
        color: #fafafa;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        font-family: inherit;
      }
      .cancel-btn:hover {
        background: #242424;
      }
      .remove-btn {
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
      .remove-btn:hover:not(:disabled) {
        background: #dc2626;
      }
      .remove-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    `,
  ],
  template: `
    <div class="overlay">
      <div class="backdrop" (click)="onCancel()"></div>
      <div class="dialog">
        <div class="dialog-header">
          <h2>Ukloni člana tima</h2>
          <button class="close-btn" (click)="onCancel()">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div class="warn-box">
          <svg class="warn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z"
            />
          </svg>
          <div class="warn-text">
            <strong>Ova radnja se ne može poništiti.</strong>
            <p>
              <strong>{{ memberName() }}</strong> ({{ memberEmail() }}) će odmah izgubiti pristup
              radnom prostoru.
            </p>
          </div>
        </div>

        <div class="strategy-section">
          <p class="strategy-label">Šta treba da se desi sa njihovim podacima?</p>
          <div class="strategy-options">
            <label class="strategy-option" [class.selected]="selectedStrategy$() === 'REASSIGN'">
              <input
                type="radio"
                name="strategy"
                value="REASSIGN"
                [checked]="selectedStrategy$() === 'REASSIGN'"
                (change)="selectedStrategy$.set('REASSIGN')"
              />
              <div>
                <div class="strategy-option-title">Dodeli podatke meni</div>
                <div class="strategy-option-desc">
                  Njihove beleške i sačuvani rezultati će biti prebačeni na vas. Razgovori će biti
                  arhivirani.
                </div>
              </div>
            </label>
            <label class="strategy-option" [class.selected]="selectedStrategy$() === 'ARCHIVE'">
              <input
                type="radio"
                name="strategy"
                value="ARCHIVE"
                [checked]="selectedStrategy$() === 'ARCHIVE'"
                (change)="selectedStrategy$.set('ARCHIVE')"
              />
              <div>
                <div class="strategy-option-title">Arhiviraj podatke</div>
                <div class="strategy-option-desc">
                  Njihovi podaci će biti arhivirani i bezbedno sačuvani.
                </div>
              </div>
            </label>
          </div>
        </div>

        @if (errorMessage$()) {
          <div class="error-box">{{ errorMessage$() }}</div>
        }

        <div class="actions">
          <button class="cancel-btn" (click)="onCancel()">Otkaži</button>
          <button class="remove-btn" (click)="onConfirm()" [disabled]="isSubmitting$()">
            {{ isSubmitting$() ? 'Uklanjanje...' : 'Ukloni člana' }}
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
