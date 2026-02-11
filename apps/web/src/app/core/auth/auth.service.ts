import { Injectable, inject, signal, computed } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { Observable, of, tap, catchError } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface GoogleUser {
  email: string;
  name: string;
  picture: string;
  sub: string;
}

export interface AuthCallbackResponse {
  status: 'success';
  message: string;
  user: {
    userId: string;
    email: string;
    tenantId: string;
    role: string;
  };
  token: string;
  requiresMfaSetup: boolean;
}

export interface MfaStatus {
  enabled: boolean;
  enrolledAt?: string;
}

const STORAGE_KEYS = {
  TOKEN: 'mentor_ai_token',
  USER: 'mentor_ai_user',
  GOOGLE_USER: 'mentor_ai_google_user',
  CODE_VERIFIER: 'mentor_ai_code_verifier',
} as const;

@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);

  // Auth state signals
  private readonly _isAuthenticated = signal(this.hasStoredToken());
  private readonly _isLoading = signal(false);
  private readonly _currentUser = signal<AuthCallbackResponse['user'] | null>(
    this.getStoredUser()
  );
  private readonly _googleUser = signal<GoogleUser | null>(
    this.getStoredGoogleUser()
  );

  // MFA state
  private readonly _mfaRequired = signal(false);
  private readonly _mfaStatus = signal<MfaStatus | null>(null);

  // Public readonly signals
  readonly isAuthenticated$ = this._isAuthenticated.asReadonly();
  readonly isLoading$ = this._isLoading.asReadonly();
  readonly user$ = this._googleUser.asReadonly();
  readonly currentUser = this._currentUser.asReadonly();
  readonly mfaRequired = this._mfaRequired.asReadonly();
  readonly mfaStatus = this._mfaStatus.asReadonly();

  /**
   * Initiate Google OAuth login via redirect
   */
  login(returnTo?: string): void {
    if (returnTo) {
      sessionStorage.setItem('returnUrl', returnTo);
    }

    // Generate PKCE code verifier and challenge
    const codeVerifier = this.generateCodeVerifier();
    localStorage.setItem(STORAGE_KEYS.CODE_VERIFIER, codeVerifier);

    this.generateCodeChallenge(codeVerifier).then((codeChallenge) => {
      const params = new URLSearchParams({
        client_id: environment.google.clientId,
        redirect_uri: environment.google.redirectUri,
        response_type: 'code',
        scope: 'openid email profile',
        access_type: 'offline',
        prompt: 'consent',
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
      });

      window.location.href = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
    });
  }

  /**
   * Handle the Google OAuth callback - exchange code for tokens via backend
   */
  handleCallback(code: string): Observable<AuthCallbackResponse> {
    this._isLoading.set(true);
    const codeVerifier =
      localStorage.getItem(STORAGE_KEYS.CODE_VERIFIER) || '';

    return this.http
      .post<AuthCallbackResponse>('/api/auth/google/callback', {
        code,
        redirectUri: environment.google.redirectUri,
        codeVerifier,
      })
      .pipe(
        tap((response) => {
          // Clean up code verifier
          localStorage.removeItem(STORAGE_KEYS.CODE_VERIFIER);

          // Store auth data
          if (response.token) {
            localStorage.setItem(STORAGE_KEYS.TOKEN, response.token);
          }
          if (response.user) {
            localStorage.setItem(
              STORAGE_KEYS.USER,
              JSON.stringify(response.user)
            );
            this._currentUser.set(response.user);
          }

          this._isAuthenticated.set(true);
          this._isLoading.set(false);
          this._mfaRequired.set(response.requiresMfaSetup);
        }),
        catchError((error) => {
          this._isLoading.set(false);
          localStorage.removeItem(STORAGE_KEYS.CODE_VERIFIER);
          throw error;
        })
      );
  }

  /**
   * Logout and clear session
   */
  logout(): void {
    localStorage.removeItem(STORAGE_KEYS.TOKEN);
    localStorage.removeItem(STORAGE_KEYS.USER);
    localStorage.removeItem(STORAGE_KEYS.GOOGLE_USER);
    localStorage.removeItem(STORAGE_KEYS.CODE_VERIFIER);
    this._isAuthenticated.set(false);
    this._currentUser.set(null);
    this._googleUser.set(null);
    this._mfaStatus.set(null);
    this._mfaRequired.set(false);
    this.router.navigate(['/login']);
  }

  /**
   * Get stored access token
   */
  getAccessToken(): string | null {
    return localStorage.getItem(STORAGE_KEYS.TOKEN);
  }

  /**
   * Check MFA status for current user
   */
  checkMfaStatus(): Observable<MfaStatus> {
    return this.http.get<MfaStatus>('/api/auth/2fa/status').pipe(
      tap((status) => {
        this._mfaStatus.set(status);
        this._mfaRequired.set(!status.enabled);
      })
    );
  }

  /**
   * Initiate MFA enrollment
   */
  enrollMfa(): Observable<{
    qrCodeDataUrl: string;
    secret: string;
    recoveryCodes: string[];
  }> {
    return this.http.post<{
      status: string;
      qrCodeDataUrl: string;
      secret: string;
      recoveryCodes: string[];
    }>('/api/auth/2fa/enroll', {});
  }

  /**
   * Verify TOTP code and complete MFA enrollment
   */
  verifyMfaEnrollment(
    code: string
  ): Observable<{ status: string; message: string }> {
    return this.http
      .post<{ status: string; message: string }>('/api/auth/2fa/verify', {
        code,
      })
      .pipe(
        tap(() => {
          this._mfaRequired.set(false);
          this._mfaStatus.set({ enabled: true });
        })
      );
  }

  /**
   * Verify TOTP code during login
   */
  verifyLoginTotp(
    code: string
  ): Observable<{ status: string; message: string }> {
    return this.http.post<{ status: string; message: string }>(
      '/api/auth/2fa/verify-login',
      { code }
    );
  }

  /**
   * Verify recovery code
   */
  verifyRecoveryCode(
    recoveryCode: string
  ): Observable<{ status: string; message: string }> {
    return this.http.post<{ status: string; message: string }>(
      '/api/auth/2fa/recovery',
      { recoveryCode }
    );
  }

  /**
   * Dev mode login - sets fake auth state for local development.
   * The backend DEV_MODE=true bypasses JWT validation so any token works.
   */
  devLogin(): void {
    const devToken = 'dev-mode-token';
    const devUser = {
      userId: 'dev-user-001',
      email: 'dev@mentor-ai.local',
      tenantId: 'dev-tenant-001',
      role: 'PLATFORM_OWNER',
    };
    localStorage.setItem(STORAGE_KEYS.TOKEN, devToken);
    localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(devUser));
    this._isAuthenticated.set(true);
    this._currentUser.set(devUser);
    this._mfaRequired.set(false);
  }

  // --- Private helpers ---

  private hasStoredToken(): boolean {
    return !!localStorage.getItem(STORAGE_KEYS.TOKEN);
  }

  private getStoredUser(): AuthCallbackResponse['user'] | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.USER);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  private getStoredGoogleUser(): GoogleUser | null {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.GOOGLE_USER);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  private generateCodeVerifier(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return this.base64UrlEncode(array);
  }

  private async generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return this.base64UrlEncode(new Uint8Array(digest));
  }

  private base64UrlEncode(bytes: Uint8Array): string {
    let binary = '';
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
}
