import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../core/auth/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, RouterLink],
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
        padding: 16px;
        background: #0d0d0d;
        font-family: 'Inter', system-ui, sans-serif;
        color: #fafafa;
      }
      .container {
        width: 100%;
        max-width: 400px;
      }

      /* Brand */
      .brand {
        text-align: center;
        margin-bottom: 32px;
      }
      .brand-icon {
        width: 64px;
        height: 64px;
        margin: 0 auto 16px;
        border-radius: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #1a1a1a;
      }
      .brand-icon svg {
        width: 32px;
        height: 32px;
        color: #3b82f6;
      }
      .brand h1 {
        font-size: 24px;
        font-weight: 600;
      }
      .brand p {
        margin-top: 8px;
        font-size: 15px;
        color: #a1a1a1;
      }

      /* Card */
      .login-card {
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 12px;
        padding: 24px;
      }

      /* Error */
      .error-box {
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.2);
        border-radius: 8px;
        padding: 12px 16px;
        margin-bottom: 16px;
        display: flex;
        align-items: flex-start;
        gap: 12px;
      }
      .error-box svg {
        width: 20px;
        height: 20px;
        color: #ef4444;
        flex-shrink: 0;
      }
      .error-box span {
        font-size: 13px;
        color: #ef4444;
      }

      /* Google Button */
      .google-btn {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 12px;
        padding: 12px 16px;
        background: #242424;
        border: 1px solid #2a2a2a;
        border-radius: 8px;
        color: #fafafa;
        font-size: 15px;
        font-weight: 500;
        cursor: pointer;
        font-family: inherit;
        transition: opacity 0.15s;
      }
      .google-btn:hover:not(:disabled) {
        opacity: 0.9;
      }
      .google-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .google-btn svg {
        width: 20px;
        height: 20px;
        flex-shrink: 0;
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
        width: 20px;
        height: 20px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-top-color: white;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }

      /* Divider */
      .divider {
        margin-top: 16px;
        padding-top: 16px;
        border-top: 1px solid #2a2a2a;
      }

      /* Dev mode link */
      .dev-link {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 12px 16px;
        background: #3b82f6;
        border-radius: 8px;
        color: white;
        font-size: 15px;
        font-weight: 500;
        text-decoration: none;
        transition: opacity 0.15s;
      }
      .dev-link:hover {
        opacity: 0.9;
      }
      .dev-link svg {
        width: 20px;
        height: 20px;
      }

      /* Footer */
      .footer {
        text-align: center;
        margin-top: 24px;
        font-size: 13px;
        color: #9e9e9e;
      }
      .footer a {
        color: #3b82f6;
        font-weight: 500;
        text-decoration: none;
        margin-left: 4px;
      }
      .footer a:hover {
        text-decoration: underline;
      }
    `,
  ],
  template: `
    <div class="page">
      <div class="container">
        <div class="brand">
          <div class="brand-icon">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="1.5"
                d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
              />
            </svg>
          </div>
          <h1>Dobrodošli u Mentor AI</h1>
          <p>Prijavite se da pristupite vašem AI poslovnom partneru</p>
        </div>

        <div class="login-card">
          @if (error()) {
            <div class="error-box">
              <svg fill="currentColor" viewBox="0 0 20 20">
                <path
                  fill-rule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                  clip-rule="evenodd"
                />
              </svg>
              <span>{{ error() }}</span>
            </div>
          }

          <button
            type="button"
            class="google-btn"
            (click)="signInWithGoogle()"
            [disabled]="isLoading()"
          >
            @if (isLoading()) {
              <span class="btn-spinner"></span>
              <span>Prijavljivanje...</span>
            } @else {
              <svg viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
              <span>Nastavi sa Google</span>
            }
          </button>

          <div class="divider">
            <button type="button" class="dev-link" (click)="devLogin()">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
              Nastavi (Dev režim)
            </button>
          </div>
        </div>

        <p class="footer">
          Nemate nalog?
          <a routerLink="/register">Kreirajte radni prostor</a>
        </p>
      </div>
    </div>
  `,
})
export class LoginComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly isLoading = signal(false);
  readonly error = signal<string | null>(null);

  signInWithGoogle(): void {
    this.isLoading.set(true);
    this.error.set(null);
    this.authService.login();
  }

  devLogin(): void {
    this.authService.devLogin();
    this.router.navigate(['/chat']);
  }
}
