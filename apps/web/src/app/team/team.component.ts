import { Component, DestroyRef, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { forkJoin } from 'rxjs';
import { InvitationService, InvitationResponse } from './services/invitation.service';
import {
  TeamMembersService,
  TeamMemberResponse,
  RemovalStrategy,
} from './services/team-members.service';
import { InviteDialogComponent } from './invite-dialog/invite-dialog.component';
import { RemoveDialogComponent } from './remove-dialog/remove-dialog.component';
import { AuthService } from '../core/auth/auth.service';

@Component({
  selector: 'app-team',
  standalone: true,
  imports: [CommonModule, RouterLink, InviteDialogComponent, RemoveDialogComponent],
  styles: [
    `
      :host {
        display: block;
      }
      .page {
        min-height: 100vh;
        background: #0d0d0d;
        color: #fafafa;
        font-family: 'Inter', system-ui, sans-serif;
      }

      /* Header */
      .top-header {
        border-bottom: 1px solid #2a2a2a;
        background: #1a1a1a;
      }
      .header-inner {
        max-width: 1024px;
        margin: 0 auto;
        padding: 16px;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .header-left {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .header-left h1 {
        font-size: 18px;
        font-weight: 600;
      }
      .header-left svg {
        width: 24px;
        height: 24px;
        color: #3b82f6;
      }
      .header-actions {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .settings-link {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        border-radius: 6px;
        border: 1px solid #2a2a2a;
        background: transparent;
        color: #fafafa;
        font-size: 13px;
        font-weight: 500;
        text-decoration: none;
        font-family: inherit;
        cursor: pointer;
      }
      .settings-link:hover {
        background: #242424;
      }
      .settings-link svg {
        width: 16px;
        height: 16px;
      }
      .invite-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        border-radius: 6px;
        border: none;
        background: #3b82f6;
        color: white;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        font-family: inherit;
      }
      .invite-btn:hover {
        background: #2563eb;
      }
      .invite-btn svg {
        width: 16px;
        height: 16px;
      }

      /* Main */
      .main-content {
        max-width: 1024px;
        margin: 0 auto;
        padding: 32px 16px;
      }

      /* Loading */
      .loading-state {
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 48px 0;
      }
      @keyframes spin {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }
      .load-spinner {
        width: 32px;
        height: 32px;
        border: 3px solid #2a2a2a;
        border-top-color: #3b82f6;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }

      /* Section */
      .section {
        margin-bottom: 32px;
      }
      .section-title {
        font-size: 16px;
        font-weight: 600;
        margin-bottom: 16px;
      }
      .member-list {
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      /* Member Card */
      .member-card {
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-radius: 8px;
        border: 1px solid #2a2a2a;
        background: #1a1a1a;
        padding: 16px;
      }
      .member-left {
        display: flex;
        align-items: center;
        gap: 16px;
      }
      .member-avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(59, 130, 246, 0.1);
        color: #3b82f6;
        font-size: 13px;
        font-weight: 600;
        flex-shrink: 0;
      }
      .member-name {
        font-size: 14px;
        font-weight: 500;
      }
      .member-email {
        font-size: 13px;
        color: #9e9e9e;
        margin-top: 2px;
      }
      .member-right {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      /* Badges */
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 10px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 500;
      }
      .badge svg {
        width: 12px;
        height: 12px;
      }
      .badge-owner {
        background: rgba(139, 92, 246, 0.15);
        color: #a78bfa;
      }
      .badge-admin {
        background: rgba(59, 130, 246, 0.15);
        color: #60a5fa;
      }
      .badge-member {
        background: #242424;
        color: #9e9e9e;
      }
      .badge-dept {
        background: #242424;
        color: #9e9e9e;
      }

      /* Status badges */
      .badge-pending {
        background: rgba(245, 158, 11, 0.15);
        color: #fbbf24;
      }
      .badge-accepted {
        background: rgba(34, 197, 94, 0.15);
        color: #4ade80;
      }
      .badge-expired {
        background: #242424;
        color: #9e9e9e;
      }
      .badge-revoked {
        background: rgba(239, 68, 68, 0.15);
        color: #f87171;
      }

      /* Remove / Revoke button */
      .remove-btn {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 6px 12px;
        border-radius: 6px;
        border: none;
        background: rgba(239, 68, 68, 0.1);
        color: #ef4444;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        font-family: inherit;
      }
      .remove-btn:hover {
        background: rgba(239, 68, 68, 0.2);
      }
      .remove-btn svg {
        width: 14px;
        height: 14px;
      }

      /* Invitation card (pending) */
      .invite-avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(245, 158, 11, 0.15);
        color: #fbbf24;
        flex-shrink: 0;
      }
      .invite-avatar svg {
        width: 20px;
        height: 20px;
      }
      .invite-meta {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 4px;
        font-size: 13px;
        color: #9e9e9e;
      }
      .invite-meta svg {
        width: 12px;
        height: 12px;
      }
      .invite-meta-item {
        display: flex;
        align-items: center;
        gap: 4px;
      }

      /* Table */
      .table-container {
        border-radius: 8px;
        border: 1px solid #2a2a2a;
        background: #1a1a1a;
        overflow: hidden;
      }
      .data-table {
        width: 100%;
        font-size: 13px;
        border-collapse: collapse;
      }
      .data-table thead tr {
        border-bottom: 1px solid #2a2a2a;
        background: rgba(36, 36, 36, 0.5);
      }
      .data-table th {
        padding: 12px 16px;
        text-align: left;
        font-weight: 500;
        color: #9e9e9e;
      }
      .data-table tbody tr {
        border-bottom: 1px solid #2a2a2a;
      }
      .data-table tbody tr:last-child {
        border-bottom: none;
      }
      .data-table td {
        padding: 12px 16px;
        color: #fafafa;
      }
      .data-table td.muted {
        color: #9e9e9e;
      }

      /* Empty state */
      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 64px 0;
        text-align: center;
      }
      .empty-icon {
        width: 48px;
        height: 48px;
        color: rgba(158, 158, 158, 0.5);
        margin-bottom: 16px;
      }
      .empty-state h3 {
        font-size: 18px;
        font-weight: 600;
        margin-bottom: 8px;
      }
      .empty-state p {
        font-size: 14px;
        color: #9e9e9e;
        margin-bottom: 24px;
      }

      /* Error state */
      .error-state {
        text-align: center;
        padding: 32px 0;
      }
      .error-text {
        font-size: 14px;
        color: #ef4444;
        margin-bottom: 16px;
      }

      @media (max-width: 640px) {
        .member-card {
          flex-direction: column;
          align-items: flex-start;
          gap: 12px;
        }
        .member-right {
          flex-wrap: wrap;
        }
        .header-inner {
          flex-direction: column;
          gap: 12px;
          align-items: flex-start;
        }
        .data-table {
          font-size: 12px;
        }
        .data-table th,
        .data-table td {
          padding: 8px 12px;
        }
      }
    `,
  ],
  template: `
    <div class="page">
      <header class="top-header">
        <div class="header-inner">
          <div class="header-left">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
              />
            </svg>
            <h1>Upravljanje timom</h1>
          </div>
          <div class="header-actions">
            @if (authService.currentUser()?.role === 'TENANT_OWNER') {
              <a routerLink="/account-settings" class="settings-link">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  />
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                  />
                </svg>
                Podešavanja naloga
              </a>
            }
            <button class="invite-btn" (click)="showInviteDialog$.set(true)">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                />
              </svg>
              Pozovi člana
            </button>
          </div>
        </div>
      </header>

      <main class="main-content">
        @if (isLoading$()) {
          <div class="loading-state">
            <div class="load-spinner"></div>
          </div>
        } @else {
          @if (loadError$()) {
            <div class="error-state">
              <p class="error-text">{{ loadError$() }}</p>
              <button class="invite-btn" (click)="loadData()">Pokušaj ponovo</button>
            </div>
          }

          <!-- Active Members -->
          @if (members$().length > 0) {
            <section class="section">
              <h2 class="section-title">Aktivni članovi ({{ members$().length }})</h2>
              <div class="member-list">
                @for (member of members$(); track member.id) {
                  <div class="member-card">
                    <div class="member-left">
                      <div class="member-avatar">
                        {{ getInitials(member.name, member.email) }}
                      </div>
                      <div>
                        <div class="member-name">{{ member.name || member.email }}</div>
                        <div class="member-email">{{ member.email }}</div>
                      </div>
                    </div>
                    <div class="member-right">
                      <span [class]="getRoleBadgeClass(member.role)">
                        @if (member.role === 'TENANT_OWNER') {
                          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z"
                            />
                          </svg>
                        }
                        {{ formatRole(member.role) }}
                      </span>
                      @if (member.department) {
                        <span class="badge badge-dept">{{ member.department }}</span>
                      }
                      @if (canRemoveMember(member)) {
                        <button class="remove-btn" (click)="openRemoveDialog(member)">
                          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M13 7a4 4 0 11-8 0 4 4 0 018 0zM9 14a6 6 0 00-6 6v1h12v-1a6 6 0 00-6-6zM21 12h-6"
                            />
                          </svg>
                          Ukloni
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
            <section class="section">
              <h2 class="section-title">Pozivi na čekanju ({{ pendingInvitations$().length }})</h2>
              <div class="member-list">
                @for (invitation of pendingInvitations$(); track invitation.id) {
                  <div class="member-card">
                    <div class="member-left">
                      <div class="invite-avatar">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                          />
                        </svg>
                      </div>
                      <div>
                        <div class="member-name">{{ invitation.email }}</div>
                        <div class="invite-meta">
                          <span class="badge badge-dept">{{ invitation.department }}</span>
                          <span class="invite-meta-item">
                            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                              />
                            </svg>
                            Ističe {{ formatExpiry(invitation.expiresAt) }}
                          </span>
                        </div>
                      </div>
                    </div>
                    <button class="remove-btn" (click)="revokeInvitation(invitation.id)">
                      Opozovi
                    </button>
                  </div>
                }
              </div>
            </section>
          }

          <!-- All Invitations History -->
          @if (allInvitations$().length > 0) {
            <section class="section">
              <h2 class="section-title">Istorija poziva</h2>
              <div class="table-container">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>Email</th>
                      <th>Odeljenje</th>
                      <th>Status</th>
                      <th>Poslato</th>
                    </tr>
                  </thead>
                  <tbody>
                    @for (invitation of allInvitations$(); track invitation.id) {
                      <tr>
                        <td>{{ invitation.email }}</td>
                        <td>
                          <span class="badge badge-dept">{{ invitation.department }}</span>
                        </td>
                        <td>
                          <span [class]="getStatusBadgeClass(invitation.status)">
                            {{ formatStatus(invitation.status) }}
                          </span>
                        </td>
                        <td class="muted">{{ formatDate(invitation.createdAt) }}</td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
            </section>
          }

          <!-- Empty State -->
          @if (members$().length === 0 && allInvitations$().length === 0) {
            <div class="empty-state">
              <svg class="empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                />
              </svg>
              <h3>Još nema članova tima</h3>
              <p>Pozovite prvog člana tima da biste počeli.</p>
              <button class="invite-btn" (click)="showInviteDialog$.set(true)">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"
                  />
                </svg>
                Pozovi člana
              </button>
            </div>
          }
        }
      </main>
    </div>

    @if (showInviteDialog$()) {
      <app-invite-dialog (close)="onInviteDialogClose($event)" />
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
  readonly loadError$ = signal<string | null>(null);
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
    this.loadError$.set(null);
    forkJoin([this.teamMembersService.getMembers(), this.invitationService.getInvitations()])
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
          this.loadError$.set('Greška pri učitavanju podataka tima. Pokušajte ponovo.');
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
          this.pendingInvitations$.set(response.data.filter((inv) => inv.status === 'PENDING'));
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
        return 'Vlasnik';
      case 'ADMIN':
        return 'Admin';
      case 'MEMBER':
        return 'Član';
      default:
        return role;
    }
  }

  getRoleBadgeClass(role: string): string {
    switch (role) {
      case 'TENANT_OWNER':
        return 'badge badge-owner';
      case 'ADMIN':
        return 'badge badge-admin';
      default:
        return 'badge badge-member';
    }
  }

  formatExpiry(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return 'isteklo';
    if (diffDays === 1) return 'za 1 dan';
    return `za ${diffDays} dana`;
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('sr-Latn', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  formatStatus(status: string): string {
    switch (status) {
      case 'PENDING':
        return 'Na čekanju';
      case 'ACCEPTED':
        return 'Prihvaćeno';
      case 'EXPIRED':
        return 'Isteklo';
      case 'REVOKED':
        return 'Opozvano';
      default:
        return status;
    }
  }

  getStatusBadgeClass(status: string): string {
    switch (status) {
      case 'PENDING':
        return 'badge badge-pending';
      case 'ACCEPTED':
        return 'badge badge-accepted';
      case 'EXPIRED':
        return 'badge badge-expired';
      case 'REVOKED':
        return 'badge badge-revoked';
      default:
        return 'badge badge-member';
    }
  }
}
