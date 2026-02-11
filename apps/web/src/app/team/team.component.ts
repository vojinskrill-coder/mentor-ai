import { Component, DestroyRef, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { BrnButton } from '@spartan-ng/brain/button';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideUserPlus,
  lucideLoader2,
  lucideUsers,
  lucideClock,
  lucideMail,
  lucideUserMinus,
  lucideShield,
  lucideSettings,
} from '@ng-icons/lucide';
import { InvitationService, InvitationResponse } from './services/invitation.service';
import { TeamMembersService, TeamMemberResponse, RemovalStrategy } from './services/team-members.service';
import { InviteDialogComponent } from './invite-dialog/invite-dialog.component';
import { RemoveDialogComponent } from './remove-dialog/remove-dialog.component';
import { AuthService } from '../core/auth/auth.service';

@Component({
  selector: 'app-team',
  standalone: true,
  imports: [CommonModule, RouterLink, BrnButton, NgIcon, InviteDialogComponent, RemoveDialogComponent],
  providers: [
    provideIcons({ lucideUserPlus, lucideLoader2, lucideUsers, lucideClock, lucideMail, lucideUserMinus, lucideShield, lucideSettings }),
  ],
  template: `
    <div class="min-h-screen bg-background">
      <header class="border-b border-border bg-card">
        <div class="container mx-auto px-4 py-4 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <ng-icon name="lucideUsers" class="h-6 w-6 text-primary" />
            <h1 class="text-xl font-semibold text-foreground">Team Management</h1>
          </div>
          <div class="flex items-center gap-2">
            @if (authService.currentUser()?.role === 'TENANT_OWNER') {
              <a
                routerLink="/account-settings"
                class="inline-flex items-center justify-center gap-2 rounded-md border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
              >
                <ng-icon name="lucideSettings" class="h-4 w-4" />
                Account Settings
              </a>
            }
            <button
              brnButton
              (click)="showInviteDialog$.set(true)"
              class="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              <ng-icon name="lucideUserPlus" class="h-4 w-4" />
              Invite Member
            </button>
          </div>
        </div>
      </header>

      <main class="container mx-auto px-4 py-8 space-y-8">
        @if (isLoading$()) {
          <div class="flex items-center justify-center py-12">
            <ng-icon name="lucideLoader2" class="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        } @else {
          <!-- Active Members -->
          @if (members$().length > 0) {
            <section>
              <h2 class="text-lg font-semibold text-foreground mb-4">
                Active Members ({{ members$().length }})
              </h2>
              <div class="space-y-3">
                @for (member of members$(); track member.id) {
                  <div class="flex items-center justify-between rounded-lg border bg-card p-4">
                    <div class="flex items-center gap-4">
                      <div class="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <span class="text-sm font-semibold">{{ getInitials(member.name, member.email) }}</span>
                      </div>
                      <div>
                        <p class="font-medium text-foreground">{{ member.name || member.email }}</p>
                        <div class="flex items-center gap-2 text-sm text-muted-foreground">
                          <span class="flex items-center gap-1">
                            {{ member.email }}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div class="flex items-center gap-3">
                      <span [class]="getRoleBadgeClasses(member.role)">
                        @if (member.role === 'TENANT_OWNER') {
                          <ng-icon name="lucideShield" class="h-3 w-3 mr-1" />
                        }
                        {{ formatRole(member.role) }}
                      </span>
                      @if (member.department) {
                        <span class="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
                          {{ member.department }}
                        </span>
                      }
                      @if (canRemoveMember(member)) {
                        <button
                          brnButton
                          (click)="openRemoveDialog(member)"
                          class="inline-flex items-center justify-center gap-1 rounded-md bg-destructive/10 px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/20"
                        >
                          <ng-icon name="lucideUserMinus" class="h-3.5 w-3.5" />
                          Remove
                        </button>
                      }
                    </div>
                  </div>
                }
              </div>
            </section>
          }

          <!-- Pending Invitations -->
          @if (pendingInvitations$().length > 0) {
            <section>
              <h2 class="text-lg font-semibold text-foreground mb-4">
                Pending Invitations ({{ pendingInvitations$().length }})
              </h2>
              <div class="space-y-3">
                @for (invitation of pendingInvitations$(); track invitation.id) {
                  <div class="flex items-center justify-between rounded-lg border bg-card p-4">
                    <div class="flex items-center gap-4">
                      <div class="flex h-10 w-10 items-center justify-center rounded-full bg-amber-100 text-amber-600">
                        <ng-icon name="lucideMail" class="h-5 w-5" />
                      </div>
                      <div>
                        <p class="font-medium text-foreground">{{ invitation.email }}</p>
                        <div class="flex items-center gap-2 text-sm text-muted-foreground">
                          <span class="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
                            {{ invitation.department }}
                          </span>
                          <span class="flex items-center gap-1">
                            <ng-icon name="lucideClock" class="h-3 w-3" />
                            Expires {{ formatExpiry(invitation.expiresAt) }}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button
                      brnButton
                      (click)="revokeInvitation(invitation.id)"
                      class="inline-flex items-center justify-center rounded-md bg-destructive/10 px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/20"
                    >
                      Revoke
                    </button>
                  </div>
                }
              </div>
            </section>
          }

          <!-- All Invitations History -->
          @if (allInvitations$().length > 0) {
            <section>
              <h2 class="text-lg font-semibold text-foreground mb-4">
                Invitation History
              </h2>
              <div class="rounded-lg border bg-card overflow-hidden">
                <table class="w-full text-sm">
                  <thead>
                    <tr class="border-b bg-muted/50">
                      <th class="px-4 py-3 text-left font-medium text-muted-foreground">Email</th>
                      <th class="px-4 py-3 text-left font-medium text-muted-foreground">Department</th>
                      <th class="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                      <th class="px-4 py-3 text-left font-medium text-muted-foreground">Sent</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (invitation of allInvitations$(); track invitation.id) {
                      <tr class="border-b last:border-0">
                        <td class="px-4 py-3 text-foreground">{{ invitation.email }}</td>
                        <td class="px-4 py-3">
                          <span class="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
                            {{ invitation.department }}
                          </span>
                        </td>
                        <td class="px-4 py-3">
                          <span [class]="getStatusClasses(invitation.status)">
                            {{ invitation.status }}
                          </span>
                        </td>
                        <td class="px-4 py-3 text-muted-foreground">
                          {{ formatDate(invitation.createdAt) }}
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </section>
          }

          <!-- Empty State -->
          @if (members$().length === 0 && allInvitations$().length === 0) {
            <div class="flex flex-col items-center justify-center py-16 text-center">
              <ng-icon name="lucideUsers" class="h-12 w-12 text-muted-foreground/50 mb-4" />
              <h3 class="text-lg font-semibold text-foreground mb-2">No team members yet</h3>
              <p class="text-muted-foreground mb-6">
                Invite your first team member to get started.
              </p>
              <button
                brnButton
                (click)="showInviteDialog$.set(true)"
                class="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                <ng-icon name="lucideUserPlus" class="h-4 w-4" />
                Invite Member
              </button>
            </div>
          }
        }
      </main>
    </div>

    @if (showInviteDialog$()) {
      <app-invite-dialog
        (close)="onInviteDialogClose($event)"
      />
    }

    @if (memberToRemove$()) {
      <app-remove-dialog
        [memberName]="memberToRemove$()!.name || memberToRemove$()!.email"
        [memberEmail]="memberToRemove$()!.email"
        [memberRole]="memberToRemove$()!.role"
        [error]="removalError$()"
        (close)="onRemoveDialogClose($event)"
      />
    }
  `,
})
export class TeamComponent implements OnInit {
  private readonly invitationService = inject(InvitationService);
  private readonly teamMembersService = inject(TeamMembersService);
  protected readonly authService = inject(AuthService);
  private readonly destroyRef = inject(DestroyRef);

  readonly isLoading$ = signal(true);
  readonly members$ = signal<TeamMemberResponse[]>([]);
  readonly allInvitations$ = signal<InvitationResponse[]>([]);
  readonly pendingInvitations$ = signal<InvitationResponse[]>([]);
  readonly showInviteDialog$ = signal(false);
  readonly memberToRemove$ = signal<TeamMemberResponse | null>(null);
  readonly removalError$ = signal('');

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.isLoading$.set(true);
    forkJoin([
      this.teamMembersService.getMembers(),
      this.invitationService.getInvitations(),
    ])
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ([membersRes, invitationsRes]) => {
          this.members$.set(membersRes.data);
          this.allInvitations$.set(invitationsRes.data);
          this.pendingInvitations$.set(
            invitationsRes.data.filter((inv) => inv.status === 'PENDING')
          );
          this.isLoading$.set(false);
        },
        error: () => {
          this.isLoading$.set(false);
        },
      });
  }

  loadMembers(): void {
    this.teamMembersService
      .getMembers()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.members$.set(response.data);
        },
      });
  }

  loadInvitations(): void {
    this.invitationService
      .getInvitations()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.allInvitations$.set(response.data);
          this.pendingInvitations$.set(
            response.data.filter((inv) => inv.status === 'PENDING')
          );
        },
      });
  }

  revokeInvitation(id: string): void {
    this.invitationService
      .revokeInvitation(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.loadInvitations();
        },
      });
  }

  openRemoveDialog(member: TeamMemberResponse): void {
    this.removalError$.set('');
    this.memberToRemove$.set(member);
  }

  onRemoveDialogClose(strategy: RemovalStrategy | false): void {
    if (strategy && this.memberToRemove$()) {
      const member = this.memberToRemove$()!;
      this.removalError$.set('');
      this.teamMembersService
        .removeMember(member.id, strategy)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            this.memberToRemove$.set(null);
            this.removalError$.set('');
            this.loadMembers();
          },
          error: (err: Error) => {
            this.removalError$.set(err.message);
          },
        });
    } else {
      this.memberToRemove$.set(null);
      this.removalError$.set('');
    }
  }

  onInviteDialogClose(created: boolean): void {
    this.showInviteDialog$.set(false);
    if (created) {
      this.loadInvitations();
    }
  }

  canRemoveMember(member: TeamMemberResponse): boolean {
    const currentUser = this.authService.currentUser();
    if (!currentUser || currentUser.role !== 'TENANT_OWNER') {
      return false;
    }
    return member.role !== 'TENANT_OWNER';
  }

  getInitials(name: string | null, email: string): string {
    if (name) {
      return name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    return email[0]?.toUpperCase() ?? '?';
  }

  formatRole(role: string): string {
    switch (role) {
      case 'TENANT_OWNER':
        return 'Owner';
      case 'ADMIN':
        return 'Admin';
      case 'MEMBER':
        return 'Member';
      default:
        return role;
    }
  }

  getRoleBadgeClasses(role: string): string {
    const base = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium';
    switch (role) {
      case 'TENANT_OWNER':
        return `${base} bg-purple-100 text-purple-700`;
      case 'ADMIN':
        return `${base} bg-blue-100 text-blue-700`;
      default:
        return `${base} bg-secondary text-secondary-foreground`;
    }
  }

  formatExpiry(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return 'expired';
    if (diffDays === 1) return 'in 1 day';
    return `in ${diffDays} days`;
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  getStatusClasses(status: string): string {
    const base = 'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium';
    switch (status) {
      case 'PENDING':
        return `${base} bg-amber-100 text-amber-700`;
      case 'ACCEPTED':
        return `${base} bg-green-100 text-green-700`;
      case 'EXPIRED':
        return `${base} bg-gray-100 text-gray-600`;
      case 'REVOKED':
        return `${base} bg-red-100 text-red-700`;
      default:
        return `${base} bg-secondary text-secondary-foreground`;
    }
  }
}
