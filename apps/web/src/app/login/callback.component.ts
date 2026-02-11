import { Component, inject, OnInit, signal, DestroyRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, ActivatedRoute } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AuthService } from '../core/auth/auth.service';

@Component({
  selector: 'app-callback',
  standalone: true,
  imports: [CommonModule],
  styles: [`
    :host { display: block; }
    .page {
      min-height: 100vh; display: flex; align-items: center; justify-content: center;
      background: #0D0D0D; padding: 16px; font-family: 'Inter', system-ui, sans-serif; color: #FAFAFA;
    }
    .content { text-align: center; }
    .error-box {
      background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.2);
      border-radius: 8px; padding: 24px; max-width: 400px;
    }
    .error-box h2 { font-size: 18px; font-weight: 600; color: #EF4444; margin-bottom: 8px; }
    .error-box p { font-size: 14px; color: #EF4444; margin-bottom: 16px; }
    .retry-btn {
      padding: 8px 20px; background: #3B82F6; color: white; border: none;
      border-radius: 6px; font-size: 14px; font-weight: 500; cursor: pointer;
      font-family: inherit;
    }
    .retry-btn:hover { opacity: 0.9; }
    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .spinner {
      width: 32px; height: 32px; border: 3px solid #2A2A2A;
      border-top-color: #3B82F6; border-radius: 50%;
      animation: spin 0.8s linear infinite; margin: 0 auto 16px;
    }
    .loading-text { font-size: 15px; color: #A1A1A1; }
  `],
  template: `
    <div class="page">
      <div class="content">
        @if (error()) {
          <div class="error-box">
            <h2>Authentication Failed</h2>
            <p>{{ error() }}</p>
            <button class="retry-btn" (click)="retry()">Try Again</button>
          </div>
        } @else {
          <div class="spinner"></div>
          <p class="loading-text">Completing authentication...</p>
        }
      </div>
    </div>
  `,
})
export class CallbackComponent implements OnInit {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);

  readonly error = signal<string | null>(null);

  ngOnInit(): void {
    const code = this.route.snapshot.queryParamMap.get('code');
    const errorParam = this.route.snapshot.queryParamMap.get('error');

    if (errorParam) {
      const errorDesc = this.route.snapshot.queryParamMap.get('error_description');
      this.error.set(errorDesc || 'Google authentication was denied.');
      return;
    }

    if (!code) {
      this.error.set('No authorization code received from Google.');
      return;
    }

    this.handleCallback(code);
  }

  handleCallback(code: string): void {
    this.error.set(null);

    this.authService
      .handleCallback(code)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          const returnUrl = sessionStorage.getItem('returnUrl') || '/chat';
          sessionStorage.removeItem('returnUrl');
          this.router.navigate([returnUrl]);
        },
        error: (err) => {
          this.error.set(
            err?.error?.detail || err?.error?.message || 'Authentication failed. Please try again.'
          );
        },
      });
  }

  retry(): void {
    this.authService.login();
  }
}
