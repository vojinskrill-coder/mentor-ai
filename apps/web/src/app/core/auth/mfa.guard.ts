import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Guard to enforce MFA setup before accessing protected routes.
 */
export const mfaGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.mfaRequired()) {
    router.navigate(['/2fa-setup']);
    return false;
  }

  return true;
};
