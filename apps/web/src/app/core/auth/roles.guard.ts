import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService as AppAuthService } from './auth.service';

/**
 * Guard to enforce role-based access control on frontend routes.
 * Usage in route config:
 *   canActivate: [rolesGuard(['PLATFORM_OWNER', 'TENANT_OWNER'])]
 */
export function rolesGuard(allowedRoles: string[]): CanActivateFn {
  return (route, state) => {
    const authService = inject(AppAuthService);
    const router = inject(Router);

    const currentUser = authService.currentUser();

    if (!currentUser) {
      router.navigate(['/login']);
      return false;
    }

    if (!allowedRoles.includes(currentUser.role)) {
      router.navigate(['/dashboard']);
      return false;
    }

    return true;
  };
}
