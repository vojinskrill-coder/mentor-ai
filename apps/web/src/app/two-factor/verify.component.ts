import { Component, inject, signal, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../core/auth/auth.service';

@Component({
  selector: 'app-two-factor-verify',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  styles: [
    `
      :host {
        display: block;
      }
      .page {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #0d0d0d;
        padding: 16px;
        font-family: 'Inter', system-ui, sans-serif;
        color: #fafafa;
      }
      .container {
        width: 100%;
        max-width: 440px;
      }
      .header {
        text-align: center;
        margin-bottom: 32px;
      }
      .header-icon {
        width: 48px;
        height: 48px;
        margin: 0 auto 16px;
        color: #3b82f6;
      }
      .header h1 {
        font-size: 24px;
        font-weight: 700;
        margin-bottom: 8px;
      }
      .header p {
        font-size: 15px;
        color: #a1a1a1;
      }
      .error-box {
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.2);
        border-radius: 8px;
        padding: 12px 16px;
        margin-bottom: 16px;
        font-size: 13px;
        color: #ef4444;
      }
      .locked-box {
        background: rgba(245, 158, 11, 0.1);
        border: 1px solid rgba(245, 158, 11, 0.2);
        border-radius: 8px;
        padding: 12px 16px;
        margin-bottom: 16px;
      }
      .locked-box p {
        font-size: 14px;
        font-weight: 500;
        color: #f59e0b;
      }
      .locked-box .sub {
        font-size: 12px;
        color: #fbbf24;
        margin-top: 4px;
      }
      .code-input {
        width: 100%;
        border-radius: 8px;
        border: 1px solid #2a2a2a;
        background: #1a1a1a;
        padding: 14px;
        text-align: center;
        font-size: 28px;
        letter-spacing: 0.5em;
        font-family: monospace;
        color: #fafafa;
        outline: none;
        transition: border-color 0.2s;
      }
      .code-input:focus {
        border-color: #3b82f6;
      }
      .code-input:disabled {
        opacity: 0.5;
      }
      .attempts-warn {
        font-size: 13px;
        color: #f59e0b;
        margin-top: 8px;
        text-align: center;
      }
      .submit-btn {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        margin-top: 24px;
        padding: 12px;
        background: #3b82f6;
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 15px;
        font-weight: 500;
        cursor: pointer;
        font-family: inherit;
      }
      .submit-btn:hover:not(:disabled) {
        background: #2563eb;
      }
      .submit-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      @keyframes spin {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }
      .btn-spinner {
        width: 16px;
        height: 16px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-top-color: white;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
      .recovery-link {
        display: block;
        text-align: center;
        margin-top: 16px;
        font-size: 13px;
        color: #3b82f6;
        background: none;
        border: none;
        cursor: pointer;
        font-family: inherit;
      }
      .recovery-link:hover {
        text-decoration: underline;
      }
      .recovery-card {
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 12px;
        padding: 20px;
        margin-top: 16px;
      }
      .recovery-card h3 {
        font-size: 15px;
        font-weight: 500;
        margin-bottom: 16px;
      }
      .recovery-input {
        width: 100%;
        border-radius: 8px;
        border: 1px solid #2a2a2a;
        background: #0d0d0d;
        padding: 10px;
        text-align: center;
        font-family: monospace;
        text-transform: uppercase;
        color: #fafafa;
        font-size: 15px;
        outline: none;
      }
      .recovery-input:focus {
        border-color: #3b82f6;
      }
      .cancel-btn {
        width: 100%;
        margin-top: 12px;
        background: none;
        border: none;
        color: #9e9e9e;
        font-size: 13px;
        cursor: pointer;
        font-family: inherit;
        padding: 8px;
      }
      .cancel-btn:hover {
        color: #fafafa;
      }
    `,
  ],
  template: `
    <div class="page">
      <div class="container">
        <div class="header">
          <svg class="header-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
            />
          </svg>
          <h1>Two-Factor Authentication</h1>
          <p>Enter the 6-digit code from your authenticator app</p>
        </div>

        @if (error()) {
          <div class="error-box">{{ error() }}</div>
        }

        @if (isLocked()) {
          <div class="locked-box">
            <p>Account Temporarily Locked</p>
            <p class="sub">
              Too many failed attempts. Please try again later or use a recovery code.
            </p>
          </div>
        }

        <form [formGroup]="form" (ngSubmit)="verify()">
          <input
            type="text"
            class="code-input"
            formControlName="code"
            maxlength="6"
            [disabled]="isLocked()"
            placeholder="------"
            inputmode="numeric"
            pattern="[0-9]*"
            autocomplete="one-time-code"
          />
          @if (attemptsRemaining() !== null && attemptsRemaining()! < 5) {
            <p class="attempts-warn">{{ attemptsRemaining() }} attempts remaining</p>
          }
          <button
            type="submit"
            class="submit-btn"
            [disabled]="isVerifying() || form.invalid || isLocked()"
          >
            @if (isVerifying()) {
              <span class="btn-spinner"></span> Verifying...
            } @else {
              Verify
            }
          </button>
        </form>

        <button type="button" class="recovery-link" (click)="showRecovery.set(true)">
          Use a recovery code instead
        </button>

        @if (showRecovery()) {
          <div class="recovery-card">
            <h3>Enter Recovery Code</h3>
            <form [formGroup]="recoveryForm" (ngSubmit)="verifyRecovery()">
              <input
                type="text"
                class="recovery-input"
                formControlName="recoveryCode"
                maxlength="10"
                placeholder="XXXXXXXXXX"
              />
              <button
                type="submit"
                class="submit-btn"
                [disabled]="isVerifying() || recoveryForm.invalid"
              >
                @if (isVerifying()) {
                  <span class="btn-spinner"></span> Verifying...
                } @else {
                  Use Recovery Code
                }
              </button>
            </form>
            <button type="button" class="cancel-btn" (click)="showRecovery.set(false)">
              Cancel
            </button>
          </div>
        }
      </div>
    </div>
  `,
})
export class TwoFactorVerifyComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly isVerifying = signal(false);
  readonly error = signal<string | null>(null);
  readonly isLocked = signal(false);
  readonly attemptsRemaining = signal<number | null>(null);
  readonly showRecovery = signal(false);

  readonly form = this.fb.group({
    code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
  });

  readonly recoveryForm = this.fb.group({
    recoveryCode: ['', [Validators.required, Validators.pattern(/^[A-Z0-9]{10}$/)]],
  });

  verify(): void {
    if (this.form.invalid || this.isLocked()) return;

    this.isVerifying.set(true);
    this.error.set(null);

    const code = this.form.value.code!;

    this.authService
      .verifyLoginTotp(code)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isVerifying.set(false);
          const returnUrl = sessionStorage.getItem('returnUrl') || '/dashboard';
          sessionStorage.removeItem('returnUrl');
          this.router.navigate([returnUrl]);
        },
        error: (err) => {
          this.isVerifying.set(false);
          this.error.set(err?.error?.detail || 'Invalid verification code');

          if (err?.error?.locked) {
            this.isLocked.set(true);
          }

          if (err?.error?.attemptsRemaining !== undefined) {
            this.attemptsRemaining.set(err.error.attemptsRemaining);
          }

          this.form.reset();
        },
      });
  }

  verifyRecovery(): void {
    if (this.recoveryForm.invalid) return;

    this.isVerifying.set(true);
    this.error.set(null);

    const recoveryCode = this.recoveryForm.value.recoveryCode!.toUpperCase();

    this.authService
      .verifyRecoveryCode(recoveryCode)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isVerifying.set(false);
          const returnUrl = sessionStorage.getItem('returnUrl') || '/dashboard';
          sessionStorage.removeItem('returnUrl');
          this.router.navigate([returnUrl]);
        },
        error: (err) => {
          this.isVerifying.set(false);
          this.error.set(err?.error?.detail || 'Invalid recovery code');
          this.recoveryForm.reset();
        },
      });
  }
}
