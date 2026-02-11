import { Component, inject, signal, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BrnButton } from '@spartan-ng/brain/button';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideLoader2, lucideShieldAlert } from '@ng-icons/lucide';
import { AuthService } from '../core/auth/auth.service';

@Component({
  selector: 'app-two-factor-verify',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, BrnButton, NgIcon],
  providers: [provideIcons({ lucideLoader2, lucideShieldAlert })],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-background p-4">
      <div class="w-full max-w-md space-y-8">
        <div class="text-center">
          <ng-icon name="lucideShieldAlert" class="h-12 w-12 text-primary mx-auto" />
          <h1 class="mt-4 text-2xl font-bold text-foreground">Two-Factor Authentication</h1>
          <p class="mt-2 text-muted-foreground">
            Enter the 6-digit code from your authenticator app
          </p>
        </div>

        @if (error()) {
          <div class="rounded-md bg-destructive/10 p-4 text-destructive text-sm">
            {{ error() }}
          </div>
        }

        @if (isLocked()) {
          <div class="rounded-md bg-amber-50 border border-amber-200 p-4">
            <p class="text-amber-800 font-medium">Account Temporarily Locked</p>
            <p class="text-sm text-amber-700 mt-1">
              Too many failed attempts. Please try again later or use a recovery code.
            </p>
          </div>
        }

        <form [formGroup]="form" (ngSubmit)="verify()" class="space-y-6">
          <div>
            <input
              type="text"
              formControlName="code"
              maxlength="6"
              [disabled]="isLocked()"
              class="w-full rounded-md border border-input bg-background px-3 py-4 text-center text-3xl tracking-[0.5em] font-mono focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
              placeholder="------"
              inputmode="numeric"
              pattern="[0-9]*"
              autocomplete="one-time-code"
            />
            @if (attemptsRemaining() !== null && attemptsRemaining()! < 5) {
              <p class="text-sm text-amber-600 mt-2 text-center">
                {{ attemptsRemaining() }} attempts remaining
              </p>
            }
          </div>

          <button
            brnButton
            type="submit"
            [disabled]="isVerifying() || form.invalid || isLocked()"
            class="w-full inline-flex items-center justify-center rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            @if (isVerifying()) {
              <ng-icon name="lucideLoader2" class="mr-2 h-4 w-4 animate-spin" />
              Verifying...
            } @else {
              Verify
            }
          </button>
        </form>

        <div class="text-center">
          <button
            type="button"
            (click)="showRecovery.set(true)"
            class="text-sm text-primary hover:underline"
          >
            Use a recovery code instead
          </button>
        </div>

        @if (showRecovery()) {
          <div class="rounded-lg border p-6 bg-card space-y-4">
            <h3 class="font-medium">Enter Recovery Code</h3>
            <form [formGroup]="recoveryForm" (ngSubmit)="verifyRecovery()" class="space-y-4">
              <input
                type="text"
                formControlName="recoveryCode"
                maxlength="10"
                class="w-full rounded-md border border-input bg-background px-3 py-2 text-center font-mono uppercase focus:outline-none focus:ring-2 focus:ring-ring"
                placeholder="XXXXXXXXXX"
              />
              <button
                brnButton
                type="submit"
                [disabled]="isVerifying() || recoveryForm.invalid"
                class="w-full inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                @if (isVerifying()) {
                  <ng-icon name="lucideLoader2" class="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                } @else {
                  Use Recovery Code
                }
              </button>
            </form>
            <button
              type="button"
              (click)="showRecovery.set(false)"
              class="w-full text-sm text-muted-foreground hover:text-foreground"
            >
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

          // Clear the input for retry
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
