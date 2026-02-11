import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BrnButton } from '@spartan-ng/brain/button';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideLoader2,
  lucideCheckCircle,
  lucideXCircle,
  lucideBuilding2,
} from '@ng-icons/lucide';
import {
  InvitationService,
  ValidateTokenResponse,
} from '../team/services/invitation.service';
import { AuthService } from '../core/auth/auth.service';

type PageState = 'loading' | 'valid' | 'accepting' | 'accepted' | 'error';

@Component({
  selector: 'app-invite-accept',
  standalone: true,
  imports: [CommonModule, BrnButton, NgIcon],
  providers: [
    provideIcons({ lucideLoader2, lucideCheckCircle, lucideXCircle, lucideBuilding2 }),
  ],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-background p-4">
      <div class="w-full max-w-md space-y-6">
        <!-- Loading State -->
        @if (state$() === 'loading') {
          <div class="flex flex-col items-center justify-center py-12">
            <ng-icon name="lucideLoader2" class="h-10 w-10 animate-spin text-primary mb-4" />
            <p class="text-muted-foreground">Validating invitation...</p>
          </div>
        }

        <!-- Valid Invitation -->
        @if (state$() === 'valid' && invitation$()) {
          <div class="rounded-lg border bg-card p-8 text-center space-y-6">
            <ng-icon name="lucideBuilding2" class="mx-auto h-12 w-12 text-primary" />
            <div>
              <h1 class="text-2xl font-bold text-foreground mb-2">
                You've been invited!
              </h1>
              <p class="text-muted-foreground">
                You're invited to join <span class="font-semibold text-foreground">{{ invitation$()!.tenantName }}</span>
              </p>
            </div>

            <div class="rounded-md bg-muted p-4 text-left space-y-2">
              <div class="flex justify-between text-sm">
                <span class="text-muted-foreground">Department</span>
                <span class="font-medium text-foreground">{{ invitation$()!.department }}</span>
              </div>
              <div class="flex justify-between text-sm">
                <span class="text-muted-foreground">Role</span>
                <span class="font-medium text-foreground">Team Member</span>
              </div>
            </div>

            @if (!isAuthenticated$()) {
              <div class="space-y-3">
                <p class="text-sm text-muted-foreground">
                  You need to sign in to accept this invitation.
                </p>
                <button
                  brnButton
                  (click)="login()"
                  class="w-full inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Sign in to Accept
                </button>
              </div>
            } @else {
              <button
                brnButton
                (click)="acceptInvitation()"
                [disabled]="state$() === 'accepting'"
                class="w-full inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                @if (state$() === 'accepting') {
                  <ng-icon name="lucideLoader2" class="mr-2 h-4 w-4 animate-spin" />
                  Joining...
                } @else {
                  Accept & Join
                }
              </button>
            }
          </div>
        }

        <!-- Accepted -->
        @if (state$() === 'accepted') {
          <div class="rounded-lg border bg-card p-8 text-center space-y-4">
            <ng-icon name="lucideCheckCircle" class="mx-auto h-12 w-12 text-green-500" />
            <h1 class="text-2xl font-bold text-foreground">Welcome aboard!</h1>
            <p class="text-muted-foreground">
              You've successfully joined the team. Redirecting to dashboard...
            </p>
          </div>
        }

        <!-- Error State -->
        @if (state$() === 'error') {
          <div class="rounded-lg border bg-card p-8 text-center space-y-4">
            <ng-icon name="lucideXCircle" class="mx-auto h-12 w-12 text-destructive" />
            <h1 class="text-2xl font-bold text-foreground">Invalid Invitation</h1>
            <p class="text-muted-foreground">{{ errorMessage$() }}</p>
            <p class="text-sm text-muted-foreground">
              Please request a new invitation from your team administrator.
            </p>
          </div>
        }
      </div>
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
  readonly errorMessage$ = signal('This invitation is no longer valid.');
  readonly isAuthenticated$ = this.authService.isAuthenticated$;

  private token = '';

  ngOnInit(): void {
    this.token = this.route.snapshot.paramMap.get('token') ?? '';
    if (!this.token) {
      this.state$.set('error');
      this.errorMessage$.set('No invitation token provided.');
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
            error.message || 'This invitation has expired. Please request a new invite.'
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
