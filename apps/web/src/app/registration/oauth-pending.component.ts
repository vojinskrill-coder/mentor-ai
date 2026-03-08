import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';

@Component({
  selector: 'app-oauth-pending',
  standalone: true,
  imports: [RouterLink],
  styles: [
    `
      :host {
        display: flex;
        align-items: center;
        justify-content: center;
        min-height: 100vh;
        padding: 16px;
        background: #0d0d0d;
      }
      .container {
        width: 100%;
        max-width: 400px;
        text-align: center;
      }
      .shield-icon {
        width: 64px;
        height: 64px;
        color: #3b82f6;
        margin: 0 auto 24px;
      }
      h1 {
        font-size: 24px;
        font-weight: 700;
        margin-bottom: 12px;
      }
      .subtitle {
        font-size: 15px;
        color: #9e9e9e;
        line-height: 1.5;
        margin-bottom: 24px;
      }
      .info-box {
        padding: 16px;
        border-radius: 8px;
        background: #1a1a1a;
        font-size: 14px;
        color: #9e9e9e;
        line-height: 1.5;
        margin-bottom: 24px;
      }
      .google-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        width: 100%;
        padding: 12px 16px;
        border-radius: 8px;
        border: 1px solid #2a2a2a;
        background: #1a1a1a;
        color: #fafafa;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        font-family: inherit;
        transition: background 0.15s;
      }
      .google-btn:hover:not(:disabled) {
        background: #242424;
      }
      .google-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .google-btn svg {
        width: 20px;
        height: 20px;
      }
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      .btn-spinner {
        width: 20px;
        height: 20px;
        border: 2px solid #2a2a2a;
        border-top-color: #3b82f6;
        border-radius: 50%;
        animation: spin 0.6s linear infinite;
      }
      .back-link {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        margin-top: 24px;
        font-size: 14px;
        color: #3b82f6;
        text-decoration: none;
      }
      .back-link:hover {
        text-decoration: underline;
      }
      .back-link svg {
        width: 16px;
        height: 16px;
      }
    `,
  ],
  template: `
    <div class="container">
      <svg class="shield-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
          d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
      </svg>

      <h1>Završite registraciju</h1>
      <p class="subtitle">
        Vaš radni prostor je kreiran. Kliknite ispod da se autentifikujete preko Google-a i osigurate vaš nalog.
      </p>

      <div class="info-box">
        Koristimo Google autentifikaciju za sigurnost vašeg naloga. Bićete preusmereni na Google za prijavu.
      </div>

      <button class="google-btn" (click)="continueWithGoogle()" [disabled]="isLoading()">
        @if (isLoading()) {
          <span class="btn-spinner"></span>
          Preusmeravanje...
        } @else {
          <svg viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          Nastavite sa Google-om
        }
      </button>

      <a routerLink="/register" class="back-link">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        Nazad na registraciju
      </a>
    </div>
  `,
})
export class OAuthPendingComponent {
  private readonly authService = inject(AuthService);

  readonly isLoading = signal(false);

  continueWithGoogle(): void {
    this.isLoading.set(true);
    this.authService.login();
  }
}
