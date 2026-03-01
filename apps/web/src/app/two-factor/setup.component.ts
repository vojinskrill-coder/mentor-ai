import { Component, inject, OnInit, signal, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../core/auth/auth.service';

@Component({
  selector: 'app-two-factor-setup',
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
        max-width: 520px;
      }
      .header {
        text-align: center;
        margin-bottom: 32px;
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
      .loading-state {
        text-align: center;
        padding: 32px 0;
      }
      @keyframes spin {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }
      .load-spinner {
        width: 32px;
        height: 32px;
        border: 3px solid #2a2a2a;
        border-top-color: #3b82f6;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        margin: 0 auto 12px;
      }
      .load-text {
        font-size: 14px;
        color: #a1a1a1;
      }
      .card {
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 12px;
        padding: 24px;
        margin-bottom: 16px;
      }
      .card h2 {
        font-size: 16px;
        font-weight: 600;
        margin-bottom: 16px;
      }
      .card-desc {
        font-size: 13px;
        color: #a1a1a1;
        margin-bottom: 16px;
        line-height: 1.5;
      }
      .qr-container {
        display: flex;
        justify-content: center;
        padding: 16px;
        background: white;
        border-radius: 8px;
        margin-bottom: 16px;
      }
      .qr-placeholder {
        width: 192px;
        height: 192px;
        border: 2px dashed #d1d5db;
        display: flex;
        align-items: center;
        justify-content: center;
        text-align: center;
      }
      .qr-placeholder p {
        font-family: monospace;
        font-size: 11px;
        color: #666;
        word-break: break-all;
      }
      .qr-placeholder .hint {
        margin-top: 8px;
        font-family: inherit;
      }
      .manual-code {
        text-align: center;
        font-size: 12px;
        color: #9e9e9e;
      }
      .manual-code code {
        background: #242424;
        padding: 2px 8px;
        border-radius: 4px;
        font-family: monospace;
      }
      .field-label {
        font-size: 13px;
        font-weight: 500;
        margin-bottom: 8px;
        display: block;
      }
      .code-input {
        width: 100%;
        border-radius: 8px;
        border: 1px solid #2a2a2a;
        background: #0d0d0d;
        padding: 10px;
        text-align: center;
        font-size: 22px;
        letter-spacing: 0.3em;
        font-family: monospace;
        color: #fafafa;
        outline: none;
      }
      .code-input:focus {
        border-color: #3b82f6;
      }
      .field-error {
        font-size: 12px;
        color: #ef4444;
        margin-top: 4px;
      }
      .submit-btn {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        margin-top: 16px;
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
      .btn-spinner {
        width: 16px;
        height: 16px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-top-color: white;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
      .success-header {
        display: flex;
        align-items: center;
        gap: 8px;
        color: #22c55e;
        margin-bottom: 16px;
      }
      .success-header svg {
        width: 20px;
        height: 20px;
      }
      .success-header h2 {
        font-size: 16px;
        font-weight: 600;
      }
      .warn-box {
        background: rgba(245, 158, 11, 0.1);
        border: 1px solid rgba(245, 158, 11, 0.2);
        border-radius: 8px;
        padding: 12px 16px;
        margin-bottom: 16px;
      }
      .warn-box p {
        font-size: 13px;
        font-weight: 500;
        color: #f59e0b;
      }
      .warn-box .sub {
        font-size: 12px;
        color: #fbbf24;
        margin-top: 4px;
        font-weight: 400;
      }
      .codes-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
        margin-bottom: 16px;
      }
      .code-box {
        font-family: monospace;
        font-size: 13px;
        background: #242424;
        padding: 8px 12px;
        border-radius: 6px;
        text-align: center;
      }
      .action-row {
        display: flex;
        gap: 8px;
        margin-bottom: 16px;
      }
      .action-btn {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 10px;
        background: #242424;
        border: 1px solid #2a2a2a;
        border-radius: 8px;
        color: #fafafa;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        font-family: inherit;
      }
      .action-btn:hover {
        background: #2a2a2a;
      }
      .action-btn svg {
        width: 16px;
        height: 16px;
      }
      .action-btn .check-icon {
        color: #22c55e;
      }
    `,
  ],
  template: `
    <div class="page">
      <div class="container">
        <div class="header">
          <h1>Set up Two-Factor Authentication</h1>
          <p>Secure your account with an authenticator app</p>
        </div>

        @if (error()) {
          <div class="error-box">{{ error() }}</div>
        }

        @if (isLoading()) {
          <div class="loading-state">
            <div class="load-spinner"></div>
            <p class="load-text">Loading 2FA setup...</p>
          </div>
        } @else if (step() === 'qr') {
          <div class="card">
            <h2>Step 1: Scan QR Code</h2>
            <p class="card-desc">
              Open your authenticator app (Google Authenticator, Authy, etc.) and scan this QR code:
            </p>
            <div class="qr-container">
              <div class="qr-placeholder">
                <div>
                  <p>{{ secret() }}</p>
                  <p class="hint">Scan with authenticator app</p>
                </div>
              </div>
            </div>
            <p class="manual-code">
              Manual entry code: <code>{{ secret() }}</code>
            </p>
          </div>

          <div class="card">
            <h2>Step 2: Enter Verification Code</h2>
            <form [formGroup]="verifyForm" (ngSubmit)="verifyCode()">
              <label class="field-label">6-digit code</label>
              <input
                type="text"
                class="code-input"
                formControlName="code"
                maxlength="6"
                placeholder="000000"
                inputmode="numeric"
                pattern="[0-9]*"
              />
              @if (verifyForm.controls.code.touched && verifyForm.controls.code.errors) {
                <p class="field-error">Please enter a valid 6-digit code</p>
              }
              <button
                type="submit"
                class="submit-btn"
                [disabled]="isVerifying() || verifyForm.invalid"
              >
                @if (isVerifying()) {
                  <span class="btn-spinner"></span> Verifying...
                } @else {
                  Verify and Enable 2FA
                }
              </button>
            </form>
          </div>
        } @else if (step() === 'recovery') {
          <div class="card">
            <div class="success-header">
              <svg fill="currentColor" viewBox="0 0 20 20">
                <path
                  fill-rule="evenodd"
                  d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                  clip-rule="evenodd"
                />
              </svg>
              <h2>2FA Enabled Successfully!</h2>
            </div>

            <div class="warn-box">
              <p>Save your recovery codes</p>
              <p class="sub">
                If you lose access to your authenticator app, you can use these codes. Each code can
                only be used once.
              </p>
            </div>

            <div class="codes-grid">
              @for (code of recoveryCodes(); track code) {
                <div class="code-box">{{ code }}</div>
              }
            </div>

            <div class="action-row">
              <button type="button" class="action-btn" (click)="copyRecoveryCodes()">
                @if (copied()) {
                  <svg class="check-icon" fill="currentColor" viewBox="0 0 20 20">
                    <path
                      fill-rule="evenodd"
                      d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                      clip-rule="evenodd"
                    />
                  </svg>
                  Copied!
                } @else {
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                  Copy Codes
                }
              </button>
              <button type="button" class="action-btn" (click)="downloadRecoveryCodes()">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                  />
                </svg>
                Download
              </button>
            </div>

            <button type="button" class="submit-btn" (click)="complete()">
              Continue to Dashboard
            </button>
          </div>
        }
      </div>
    </div>
  `,
})
export class TwoFactorSetupComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly isLoading = signal(true);
  readonly isVerifying = signal(false);
  readonly error = signal<string | null>(null);
  readonly step = signal<'qr' | 'recovery'>('qr');
  readonly secret = signal('');
  readonly recoveryCodes = signal<string[]>([]);
  readonly copied = signal(false);

  readonly verifyForm = this.fb.group({
    code: ['', [Validators.required, Validators.pattern(/^\d{6}$/)]],
  });

  ngOnInit(): void {
    this.enrollMfa();
  }

  enrollMfa(): void {
    this.isLoading.set(true);
    this.error.set(null);

    this.authService
      .enrollMfa()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.secret.set(response.secret);
          this.recoveryCodes.set(response.recoveryCodes);
          this.isLoading.set(false);
        },
        error: (err) => {
          this.error.set(err?.error?.detail || 'Failed to initialize 2FA setup');
          this.isLoading.set(false);
        },
      });
  }

  verifyCode(): void {
    if (this.verifyForm.invalid) return;

    this.isVerifying.set(true);
    this.error.set(null);

    const code = this.verifyForm.value.code!;

    this.authService
      .verifyMfaEnrollment(code)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isVerifying.set(false);
          this.step.set('recovery');
        },
        error: (err) => {
          this.error.set(err?.error?.detail || 'Invalid verification code');
          this.isVerifying.set(false);
        },
      });
  }

  copyRecoveryCodes(): void {
    const codes = this.recoveryCodes().join('\n');
    navigator.clipboard.writeText(codes).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }

  downloadRecoveryCodes(): void {
    const codes = this.recoveryCodes().join('\n');
    const blob = new Blob(
      [
        `Mentor AI Recovery Codes\n\n${codes}\n\nStore these codes safely. Each code can only be used once.`,
      ],
      {
        type: 'text/plain',
      }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'mentor-ai-recovery-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  complete(): void {
    const returnUrl = sessionStorage.getItem('returnUrl') || '/dashboard';
    sessionStorage.removeItem('returnUrl');
    this.router.navigate([returnUrl]);
  }
}
