import { Route } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { rolesGuard } from './core/auth/roles.guard';
import { onboardingGuard, onboardingPageGuard } from './onboarding/onboarding.guard';

export const appRoutes: Route[] = [
  // Public routes (no shell)
  {
    path: 'login',
    loadComponent: () => import('./login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'callback',
    loadComponent: () => import('./login/callback.component').then((m) => m.CallbackComponent),
  },
  {
    path: 'register',
    loadComponent: () =>
      import('./registration/registration.component').then((m) => m.RegistrationComponent),
  },
  {
    path: 'oauth-pending',
    loadComponent: () =>
      import('./registration/oauth-pending.component').then((m) => m.OAuthPendingComponent),
  },
  {
    path: 'invite/:token',
    loadComponent: () =>
      import('./invite/invite-accept.component').then((m) => m.InviteAcceptComponent),
  },
  // 2FA routes (require authentication but not MFA completion)
  {
    path: '2fa-setup',
    loadComponent: () =>
      import('./two-factor/setup.component').then((m) => m.TwoFactorSetupComponent),
    canActivate: [authGuard],
  },
  {
    path: 'verify-2fa',
    loadComponent: () =>
      import('./two-factor/verify.component').then((m) => m.TwoFactorVerifyComponent),
  },
  // Onboarding route (requires auth, no shell)
  {
    path: 'onboarding',
    loadComponent: () =>
      import('./onboarding/onboarding-wizard.component').then((m) => m.OnboardingWizardComponent),
    canActivate: [authGuard, onboardingPageGuard],
  },
  // Protected routes wrapped in App Shell
  {
    path: '',
    loadComponent: () =>
      import('./core/layout/app-shell.component').then((m) => m.AppShellComponent),
    canActivate: [authGuard, onboardingGuard],
    children: [
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'chat',
        loadComponent: () =>
          import('./features/chat/chat.component').then((m) => m.ChatComponent),
      },
      {
        path: 'chat/:conversationId',
        loadComponent: () =>
          import('./features/chat/chat.component').then((m) => m.ChatComponent),
      },
      {
        path: 'tasks',
        loadComponent: () =>
          import('./features/tasks/task-hub.component').then((m) => m.TaskHubComponent),
      },
      {
        path: 'team',
        loadComponent: () => import('./team/team.component').then((m) => m.TeamComponent),
        canActivate: [rolesGuard(['TENANT_OWNER', 'ADMIN'])],
      },
      {
        path: 'account-settings',
        loadComponent: () =>
          import('./account-settings/account-settings.component').then(
            (m) => m.AccountSettingsComponent
          ),
        canActivate: [rolesGuard(['TENANT_OWNER'])],
      },
      {
        path: 'profile-settings',
        loadComponent: () =>
          import('./profile-settings/profile-settings.component').then(
            (m) => m.ProfileSettingsComponent
          ),
      },
      // Platform admin routes
      {
        path: 'admin/llm-config',
        loadComponent: () =>
          import('./platform-admin/llm-config/llm-config.component').then(
            (m) => m.LlmConfigComponent
          ),
        canActivate: [rolesGuard(['PLATFORM_OWNER'])],
      },
      // Default redirect within shell
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full',
      },
    ],
  },
  // Catch-all: redirect unknown routes to dashboard
  {
    path: '**',
    redirectTo: 'dashboard',
  },
];
