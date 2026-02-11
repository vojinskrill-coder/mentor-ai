import { Component, inject, OnInit, signal, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BrnButton } from '@spartan-ng/brain/button';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideLoader2, lucideCopy, lucideDownload, lucideCheck } from '@ng-icons/lucide';
import { AuthService } from '../core/auth/auth.service';

@Component({
  selector: 'app-two-factor-setup',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, BrnButton, NgIcon],
  providers: [provideIcons({ lucideLoader2, lucideCopy, lucideDownload, lucideCheck })],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-background p-4">
      <div class="w-full max-w-lg space-y-8">
        <div class="text-center">
          <h1 class="text-2xl font-bold text-foreground">Set up Two-Factor Authentication</h1>
          <p class="mt-2 text-muted-foreground">
            Secure your account with an authenticator app
          </p>
        </div>

        @if (error()) {
          <div class="rounded-md bg-destructive/10 p-4 text-destructive text-sm">
            {{ error() }}
          </div>
        }

        @if (isLoading()) {
          <div class="text-center py-8">
            <ng-icon name="lucideLoader2" class="h-8 w-8 animate-spin text-primary mx-auto" />
            <p class="mt-2 text-muted-foreground">Loading 2FA setup...</p>
          </div>
        } @else if (step() === 'qr') {
          <!-- Step 1: Scan QR Code -->
          <div class="space-y-6">
            <div class="rounded-lg border p-6 bg-card">
              <h2 class="font-semibold text-lg mb-4">Step 1: Scan QR Code</h2>
              <p class="text-sm text-muted-foreground mb-4">
                Open your authenticator app (Google Authenticator, Authy, etc.) and scan this QR code:
              </p>

              <div class="flex justify-center p-4 bg-white rounded-lg">
                <!-- QR Code placeholder - in production, render actual QR -->
                <div class="w-48 h-48 border-2 border-dashed border-gray-300 flex items-center justify-center text-center text-sm text-gray-500">
                  <div>
                    <p class="font-mono text-xs break-all">{{ secret() }}</p>
                    <p class="mt-2">Scan with authenticator app</p>
                  </div>
                </div>
              </div>

              <p class="text-xs text-muted-foreground mt-4 text-center">
                Manual entry code: <code class="bg-muted px-2 py-1 rounded">{{ secret() }}</code>
              </p>
            </div>

            <div class="rounded-lg border p-6 bg-card">
              <h2 class="font-semibold text-lg mb-4">Step 2: Enter Verification Code</h2>
              <form [formGroup]="verifyForm" (ngSubmit)="verifyCode()" class="space-y-4">
                <div>
                  <label class="text-sm font-medium text-foreground">6-digit code</label>
                  <input
                    type="text"
                    formControlName="code"
                    maxlength="6"
                    class="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-center text-2xl tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="000000"
                    inputmode="numeric"
                    pattern="[0-9]*"
                  />
                  @if (verifyForm.controls.code.touched && verifyForm.controls.code.errors) {
                    <p class="text-sm text-destructive mt-1">
                      Please enter a valid 6-digit code
                    </p>
                  }
                </div>

                <button
                  brnButton
                  type="submit"
                  [disabled]="isVerifying() || verifyForm.invalid"
                  class="w-full inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                >
                  @if (isVerifying()) {
                    <ng-icon name="lucideLoader2" class="mr-2 h-4 w-4 animate-spin" />
                    Verifying...
                  } @else {
                    Verify and Enable 2FA
                  }
                </button>
              </form>
            </div>
          </div>
        } @else if (step() === 'recovery') {
          <!-- Step 3: Save Recovery Codes -->
          <div class="rounded-lg border p-6 bg-card space-y-6">
            <div class="flex items-center gap-2 text-green-600">
              <ng-icon name="lucideCheck" class="h-5 w-5" />
              <h2 class="font-semibold text-lg">2FA Enabled Successfully!</h2>
            </div>

            <div class="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p class="text-sm text-amber-800 font-medium mb-2">
                Save your recovery codes
              </p>
              <p class="text-xs text-amber-700">
                If you lose access to your authenticator app, you can use these codes to access your account.
                Each code can only be used once.
              </p>
            </div>

            <div class="grid grid-cols-2 gap-2">
              @for (code of recoveryCodes(); track code) {
                <div class="font-mono text-sm bg-muted px-3 py-2 rounded text-center">
                  {{ code }}
                </div>
              }
            </div>

            <div class="flex gap-2">
              <button
                brnButton
                type="button"
                (click)="copyRecoveryCodes()"
                class="flex-1 inline-flex items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
              >
                @if (copied()) {
                  <ng-icon name="lucideCheck" class="h-4 w-4 text-green-600" />
                  Copied!
                } @else {
                  <ng-icon name="lucideCopy" class="h-4 w-4" />
                  Copy Codes
                }
              </button>
              <button
                brnButton
                type="button"
                (click)="downloadRecoveryCodes()"
                class="flex-1 inline-flex items-center justify-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent"
              >
                <ng-icon name="lucideDownload" class="h-4 w-4" />
                Download
              </button>
            </div>

            <button
              brnButton
              type="button"
              (click)="complete()"
              class="w-full inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
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
    const blob = new Blob([`Mentor AI Recovery Codes\n\n${codes}\n\nStore these codes safely. Each code can only be used once.`], {
      type: 'text/plain',
    });
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
