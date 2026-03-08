import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  InvitationService,
  ValidateTokenResponse,
} from '../team/services/invitation.service';
import { AuthService } from '../core/auth/auth.service';

type PageState = 'loading' | 'valid' | 'accepting' | 'accepted' | 'error';

@Component({
  selector: 'app-invite-accept',
  standalone: true,
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
        max-width: 420px;
      }

      /* Loading */
      .loading-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 48px 0;
      }
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      .spinner {
        width: 40px;
        height: 40px;
        border: 3px solid #2a2a2a;
        border-top-color: #3b82f6;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        margin-bottom: 16px;
      }
      .loading-text {
        color: #9e9e9e;
        font-size: 14px;
      }

      /* Card */
      .card {
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 12px;
        padding: 32px;
        text-align: center;
      }
      .card-icon {
        width: 48px;
        height: 48px;
        margin: 0 auto 20px;
      }
      .card-icon.primary { color: #3b82f6; }
      .card-icon.success { color: #4ade80; }
      .card-icon.error { color: #ef4444; }

      h1 {
        font-size: 24px;
        font-weight: 700;
        margin-bottom: 8px;
      }
      .card-subtitle {
        font-size: 15px;
        color: #9e9e9e;
        line-height: 1.5;
        margin-bottom: 24px;
      }
      .card-subtitle .tenant-name {
        font-weight: 600;
        color: #fafafa;
      }

      /* Details box */
      .details-box {
        padding: 16px;
        border-radius: 8px;
        background: #242424;
        text-align: left;
        margin-bottom: 24px;
      }
      .detail-row {
        display: flex;
        justify-content: space-between;
        font-size: 14px;
        padding: 4px 0;
      }
      .detail-row + .detail-row {
        margin-top: 8px;
      }
      .detail-label {
        color: #9e9e9e;
      }
      .detail-value {
        font-weight: 500;
      }

      /* Auth hint */
      .auth-hint {
        font-size: 14px;
        color: #9e9e9e;
        margin-bottom: 12px;
      }

      /* Buttons */
      .btn-primary {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        width: 100%;
        padding: 12px 16px;
        border-radius: 8px;
        border: none;
        background: #3b82f6;
        color: white;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        font-family: inherit;
        transition: background 0.15s;
      }
      .btn-primary:hover:not(:disabled) {
        background: #2563eb;
      }
      .btn-primary:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .btn-spinner {
        width: 16px;
        height: 16px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-top-color: white;
        border-radius: 50%;
        animation: spin 0.6s linear infinite;
      }

      /* Bottom text */
      .bottom-text {
        font-size: 14px;
        color: #9e9e9e;
        margin-top: 16px;
        line-height: 1.5;
      }
    `,
  ],
  template: `
    <div class="container">
      @if (state$() === 'loading') {
        <div class="loading-state">
          <div class="spinner"></div>
          <p class="loading-text">Provera poziva...</p>
        </div>
      }

      @if (state$() === 'valid' && invitation$()) {
        <div class="card">
          <svg class="card-icon primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
          </svg>
          <h1>Pozvani ste!</h1>
          <p class="card-subtitle">
            Pozvani ste da se pridružite timu <span class="tenant-name">{{ invitation$()!.tenantName }}</span>
          </p>

          <div class="details-box">
            <div class="detail-row">
              <span class="detail-label">Odeljenje</span>
              <span class="detail-value">{{ invitation$()!.department }}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">Uloga</span>
              <span class="detail-value">Član tima</span>
            </div>
          </div>

          @if (!isAuthenticated$()) {
            <p class="auth-hint">Morate se prijaviti da biste prihvatili poziv.</p>
            <button class="btn-primary" (click)="login()">Prijavite se i prihvatite</button>
          } @else {
            <button class="btn-primary" (click)="acceptInvitation()" [disabled]="state$() === 'accepting'">
              @if (state$() === 'accepting') {
                <span class="btn-spinner"></span>
                Pridruživanje...
              } @else {
                Prihvati i pridruži se
              }
            </button>
          }
        </div>
      }

      @if (state$() === 'accepted') {
        <div class="card">
          <svg class="card-icon success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h1>Dobrodošli!</h1>
          <p class="card-subtitle">Uspešno ste se pridružili timu. Preusmeravanje na kontrolnu tablu...</p>
        </div>
      }

      @if (state$() === 'error') {
        <div class="card">
          <svg class="card-icon error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h1>Nevažeći poziv</h1>
          <p class="card-subtitle">{{ errorMessage$() }}</p>
          <p class="bottom-text">Zatražite novi poziv od administratora vašeg tima.</p>
        </div>
      }
    </div>
  `,
})
export class InviteAcceptComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly invitationService = inject(InvitationService);
  private readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly state$ = signal<PageState>('loading');
  readonly invitation$ = signal<ValidateTokenResponse | null>(null);
  readonly errorMessage$ = signal('Ovaj poziv više nije važeći.');
  readonly isAuthenticated$ = this.authService.isAuthenticated$;

  private token = '';

  ngOnInit(): void {
    this.token = this.route.snapshot.paramMap.get('token') ?? '';
    if (!this.token) {
      this.state$.set('error');
      this.errorMessage$.set('Nije obezbeđen token poziva.');
      return;
    }
    this.validateToken();
  }

  private validateToken(): void {
    this.invitationService
      .validateToken(this.token)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.invitation$.set(response.data);
          this.state$.set('valid');
        },
        error: (error: Error) => {
          this.state$.set('error');
          this.errorMessage$.set(
            error.message || 'Ovaj poziv je istekao. Zatražite novi poziv.'
          );
        },
      });
  }

  login(): void {
    this.authService.login(`/invite/${this.token}`);
  }

  acceptInvitation(): void {
    this.state$.set('accepting');
    this.invitationService
      .acceptInvitation(this.token)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.state$.set('accepted');
          setTimeout(() => {
            this.router.navigate(['/dashboard']);
          }, 2000);
        },
        error: (error: Error) => {
          this.state$.set('error');
          this.errorMessage$.set(error.message);
        },
      });
  }
}
