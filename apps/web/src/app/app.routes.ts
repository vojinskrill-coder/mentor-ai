import { Route } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { rolesGuard } from './core/auth/roles.guard';
import { onboardingGuard, onboardingPageGuard } from './onboarding/onboarding.guard';

export const appRoutes: Route[] = [
  // Public routes
  {
    path: 'login',
    loadComponent: () =>
      import('./login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'callback',
    loadComponent: () =>
      import('./login/callback.component').then((m) => m.CallbackComponent),
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./registration/registration.component').then(
        (m) => m.RegistrationComponent
      ),
  },
  {
    path: 'oauth-pending',
    loadComponent: () =>
      import('./registration/oauth-pending.component').then(
        (m) => m.OAuthPendingComponent
      ),
  },
  {
    path: 'invite/:token',
    loadComponent: () =>
      import('./invite/invite-accept.component').then(
        (m) => m.InviteAcceptComponent
      ),
  },
  // 2FA routes (require authentication but not MFA completion)
  {
    path: '2fa-setup',
    loadComponent: () =>
      import('./two-factor/setup.component').then(
        (m) => m.TwoFactorSetupComponent
      ),
    canActivate: [authGuard],
  },
  {
    path: 'verify-2fa',
    loadComponent: () =>
      import('./two-factor/verify.component').then(
        (m) => m.TwoFactorVerifyComponent
      ),
  },
  // Onboarding route (requires auth)
  {
    path: 'onboarding',
    loadComponent: () =>
      import('./onboarding/onboarding-wizard.component').then(
        (m) => m.OnboardingWizardComponent
      ),
    canActivate: [authGuard, onboardingPageGuard],
  },
  // Protected routes (require auth + completed onboarding)
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./dashboard/dashboard.component').then(
        (m) => m.DashboardComponent
      ),
    canActivate: [authGuard, onboardingGuard],
  },
  {
    path: 'team',
    loadComponent: () =>
      import('./team/team.component').then((m) => m.TeamComponent),
    canActivate: [authGuard, rolesGuard(['TENANT_OWNER', 'ADMIN'])],
  },
  {
    path: 'account-settings',
    loadComponent: () =>
      import('./account-settings/account-settings.component').then(
        (m) => m.AccountSettingsComponent
      ),
    canActivate: [authGuard, rolesGuard(['TENANT_OWNER'])],
  },
  {
    path: 'profile-settings',
    loadComponent: () =>
      import('./profile-settings/profile-settings.component').then(
        (m) => m.ProfileSettingsComponent
      ),
    canActivate: [authGuard],
  },
  // Platform admin routes
  {
    path: 'admin/llm-config',
    loadComponent: () =>
      import('./platform-admin/llm-config/llm-config.component').then(
        (m) => m.LlmConfigComponent
      ),
    canActivate: [authGuard, rolesGuard(['PLATFORM_OWNER'])],
  },
  // Chat routes
  {
    path: 'chat',
    loadComponent: () =>
      import('./features/chat/chat.component').then((m) => m.ChatComponent),
    canActivate: [authGuard, onboardingGuard],
  },
  {
    path: 'chat/:conversationId',
    loadComponent: () =>
      import('./features/chat/chat.component').then((m) => m.ChatComponent),
    canActivate: [authGuard, onboardingGuard],
  },
  // Default route
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },
];
