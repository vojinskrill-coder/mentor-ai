import { Component, DestroyRef, inject, output, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BrnButton } from '@spartan-ng/brain/button';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideX, lucideLoader2, lucideShieldCheck } from '@ng-icons/lucide';
import { BackupOwnerService } from '../services/backup-owner.service';
import type { TeamMemberResponse } from '@mentor-ai/shared/types';

@Component({
  selector: 'app-designate-dialog',
  standalone: true,
  imports: [CommonModule, BrnButton, NgIcon],
  providers: [provideIcons({ lucideX, lucideLoader2, lucideShieldCheck })],
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center">
      <!-- Backdrop -->
      <div
        class="absolute inset-0 bg-black/50"
        (click)="onCancel()"
      ></div>

      <!-- Dialog -->
      <div class="relative z-10 w-full max-w-md rounded-lg bg-card p-6 shadow-lg">
        <!-- Header -->
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2">
            <ng-icon name="lucideShieldCheck" class="h-5 w-5 text-primary" />
            <h2 class="text-lg font-semibold text-foreground">Designate Backup Owner</h2>
          </div>
          <button
            brnButton
            (click)="onCancel()"
            class="rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <ng-icon name="lucideX" class="h-5 w-5" />
          </button>
        </div>

        <p class="text-sm text-muted-foreground mb-4">
          Choose a team member who can recover your account if you lose access.
          They will be able to reset your two-factor authentication.
        </p>

        @if (isLoadingMembers$()) {
          <div class="flex items-center justify-center py-8">
            <ng-icon name="lucideLoader2" class="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        } @else if (eligibleMembers$().length === 0) {
          <div class="text-center py-8 text-muted-foreground text-sm">
            <p>No eligible team members found.</p>
            <p class="mt-1">Invite an Admin or Member to your workspace first.</p>
          </div>
        } @else {
          <!-- Member Selection -->
          <div class="space-y-2 mb-6 max-h-64 overflow-y-auto">
            @for (member of eligibleMembers$(); track member.id) {
              <label
                class="flex items-center gap-3 p-3 rounded-md border cursor-pointer hover:bg-muted/50"
                [class.border-primary]="selectedMemberId$() === member.id"
                [class.bg-primary/5]="selectedMemberId$() === member.id"
              >
                <input
                  type="radio"
                  name="backupOwner"
                  [value]="member.id"
                  [checked]="selectedMemberId$() === member.id"
                  (change)="selectedMemberId$.set(member.id)"
                  class="mt-0.5"
                />
                <div>
                  <p class="text-sm font-medium text-foreground">{{ member.name || member.email }}</p>
                  <p class="text-xs text-muted-foreground">{{ member.email }} &middot; {{ formatRole(member.role) }}</p>
                </div>
              </label>
            }
          </div>
        }

        <!-- Error Message -->
        @if (errorMessage$()) {
          <div class="mb-4 rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
            {{ errorMessage$() }}
          </div>
        }

        <!-- Actions -->
        <div class="flex justify-end gap-3">
          <button
            brnButton
            (click)="onCancel()"
            class="inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            Cancel
          </button>
          <button
            brnButton
            (click)="onConfirm()"
            [disabled]="isSubmitting$() || !selectedMemberId$()"
            class="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {{ isSubmitting$() ? 'Designating...' : 'Designate' }}
          </button>
        </div>
      </div>
    </div>
  `,
})
export class DesignateDialogComponent implements OnInit {
  private readonly backupOwnerService = inject(BackupOwnerService);
  private readonly destroyRef = inject(DestroyRef);

  readonly close = output<string | false>();

  readonly eligibleMembers$ = signal<TeamMemberResponse[]>([]);
  readonly selectedMemberId$ = signal<string>('');
  readonly isLoadingMembers$ = signal(true);
  readonly isSubmitting$ = signal(false);
  readonly errorMessage$ = signal('');

  ngOnInit(): void {
    this.loadEligibleMembers();
  }

  private loadEligibleMembers(): void {
    this.backupOwnerService
      .getEligibleMembers()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (response) => {
          this.eligibleMembers$.set(response.data);
          this.isLoadingMembers$.set(false);
        },
        error: (err: Error) => {
          this.errorMessage$.set(err.message);
          this.isLoadingMembers$.set(false);
        },
      });
  }

  onConfirm(): void {
    const memberId = this.selectedMemberId$();
    if (!memberId) return;

    this.isSubmitting$.set(true);
    this.errorMessage$.set('');

    this.backupOwnerService
      .designateBackupOwner(memberId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.close.emit(memberId);
        },
        error: (err: Error) => {
          this.errorMessage$.set(err.message);
          this.isSubmitting$.set(false);
        },
      });
  }

  onCancel(): void {
    this.close.emit(false);
  }

  formatRole(role: string): string {
    switch (role) {
      case 'ADMIN':
        return 'Admin';
      case 'MEMBER':
        return 'Member';
      default:
        return role;
    }
  }
}
