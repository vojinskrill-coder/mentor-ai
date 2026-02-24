import {
  HttpInterceptorFn,
  HttpRequest,
  HttpHandlerFn,
  HttpErrorResponse,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs';

const STORAGE_KEY = 'mentor_ai_token';

/**
 * HTTP Interceptor to add Authorization header with stored JWT token.
 * Also handles 401 responses by clearing stale tokens and redirecting to login.
 */
export const authInterceptor: HttpInterceptorFn = (
  req: HttpRequest<unknown>,
  next: HttpHandlerFn
) => {
  const router = inject(Router);

  // Skip auth for public endpoints
  const publicEndpoints = [
    '/api/health',
    '/api/registration',
    '/api/invitations/validate',
    '/api/auth/google/callback',
  ];

  const isPublic = publicEndpoints.some((endpoint) => req.url.includes(endpoint));

  if (isPublic) {
    return next(req);
  }

  const token = localStorage.getItem(STORAGE_KEY);
  const request = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;

  return next(request).pipe(
    tap({
      error: (error: HttpErrorResponse) => {
        if (error.status === 401) {
          // Clear stale auth data and redirect to login
          localStorage.removeItem('mentor_ai_token');
          localStorage.removeItem('mentor_ai_user');
          localStorage.removeItem('mentor_ai_google_user');
          router.navigate(['/login']);
        }
      },
    })
  );
};
