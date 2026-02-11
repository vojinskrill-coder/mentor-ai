import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { OnboardingService } from './services/onboarding.service';
import { TenantStatus } from '@mentor-ai/shared/types';

/**
 * Guard that redirects users with DRAFT or ONBOARDING tenant status to the onboarding wizard.
 * Active tenants are allowed to proceed normally.
 */
export const onboardingGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const onboardingService = inject(OnboardingService);

  try {
    const status = await onboardingService.getStatus();

    if (
      status.tenantStatus === TenantStatus.ACTIVE ||
      status.tenantStatus === TenantStatus.SUSPENDED ||
      status.tenantStatus === TenantStatus.PENDING_DELETION
    ) {
      return true;
    }

    if (
      status.tenantStatus === TenantStatus.DRAFT ||
      status.tenantStatus === TenantStatus.ONBOARDING
    ) {
      return router.createUrlTree(['/onboarding']);
    }

    return true;
  } catch {
    // If status check fails, assume onboarding is needed
    return router.createUrlTree(['/onboarding']);
  }
};

/**
 * Guard that prevents completed users from accessing the onboarding page.
 * Redirects to chat if already completed.
 */
export const onboardingPageGuard: CanActivateFn = async () => {
  const router = inject(Router);
  const onboardingService = inject(OnboardingService);

  try {
    const status = await onboardingService.getStatus();

    if (status.currentStep === 'complete') {
      return router.createUrlTree(['/chat']);
    }

    if (status.tenantStatus === TenantStatus.ACTIVE) {
      return router.createUrlTree(['/chat']);
    }

    return true;
  } catch {
    return true;
  }
};
