import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Guard to protect routes that require authentication.
 */
export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated$()) {
    return true;
  }

  // Store the attempted URL for redirecting after login
  sessionStorage.setItem('returnUrl', state.url);
  router.navigate(['/login']);
  return false;
};
