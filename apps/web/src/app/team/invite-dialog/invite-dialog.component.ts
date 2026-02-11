import { Component, DestroyRef, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { BrnButton } from '@spartan-ng/brain/button';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideX, lucideLoader2 } from '@ng-icons/lucide';
import { InvitationService } from '../services/invitation.service';

const DEPARTMENTS = [
  { value: 'FINANCE', label: 'Finance' },
  { value: 'MARKETING', label: 'Marketing' },
  { value: 'TECHNOLOGY', label: 'Technology' },
  { value: 'OPERATIONS', label: 'Operations' },
  { value: 'LEGAL', label: 'Legal' },
  { value: 'CREATIVE', label: 'Creative' },
];

@Component({
  selector: 'app-invite-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, BrnButton, NgIcon],
  providers: [provideIcons({ lucideX, lucideLoader2 })],
  template: `
    <div class="fixed inset-0 z-50 flex items-center justify-center">
      <!-- Backdrop -->
      <div
        class="absolute inset-0 bg-black/50"
        (click)="onClose()"
      ></div>

      <!-- Dialog -->
      <div class="relative z-10 w-full max-w-md rounded-lg border bg-card p-6 shadow-lg">
        <div class="flex items-center justify-between mb-6">
          <h2 class="text-lg font-semibold text-foreground">Invite Team Member</h2>
          <button
            brnButton
            (click)="onClose()"
            class="inline-flex items-center justify-center rounded-md p-1 text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            <ng-icon name="lucideX" class="h-5 w-5" />
          </button>
        </div>

        <form [formGroup]="form" (ngSubmit)="onSubmit()" class="space-y-4">
          @if (errorMessage$()) {
            <div class="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {{ errorMessage$() }}
            </div>
          }

          <!-- Email -->
          <div class="space-y-2">
            <label for="invite-email" class="text-sm font-medium text-foreground">
              Email address
            </label>
            <input
              id="invite-email"
              type="email"
              formControlName="email"
              class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="colleague@company.com"
            />
            @if (form.controls.email.touched && form.controls.email.errors) {
              <p class="text-sm text-destructive">
                @if (form.controls.email.errors['required']) {
                  Email is required
                } @else if (form.controls.email.errors['email']) {
                  Please enter a valid email address
                }
              </p>
            }
          </div>

          <!-- Department -->
          <div class="space-y-2">
            <label for="invite-department" class="text-sm font-medium text-foreground">
              Department
            </label>
            <select
              id="invite-department"
              formControlName="department"
              class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="" disabled>Select a department</option>
              @for (dept of departments; track dept.value) {
                <option [value]="dept.value">{{ dept.label }}</option>
              }
            </select>
            @if (form.controls.department.touched && form.controls.department.errors) {
              <p class="text-sm text-destructive">
                Please select a department
              </p>
            }
          </div>

          <!-- Role (display only) -->
          <div class="space-y-2">
            <label class="text-sm font-medium text-foreground">Role</label>
            <div class="rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground">
              Team Member
            </div>
            <p class="text-xs text-muted-foreground">
              Invited users are assigned the Team Member role.
            </p>
          </div>

          <!-- Actions -->
          <div class="flex justify-end gap-3 pt-2">
            <button
              brnButton
              type="button"
              (click)="onClose()"
              class="inline-flex items-center justify-center rounded-md bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground hover:bg-secondary/80"
            >
              Cancel
            </button>
            <button
              brnButton
              type="submit"
              [disabled]="isSubmitting$() || form.invalid"
              class="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              @if (isSubmitting$()) {
                <ng-icon name="lucideLoader2" class="mr-2 h-4 w-4 animate-spin" />
                Sending...
              } @else {
                Send Invitation
              }
            </button>
          </div>
        </form>
      </div>
    </div>
  `,
})
export class InviteDialogComponent {
  readonly close = output<boolean>();

  private readonly fb = inject(FormBuilder);
  private readonly invitationService = inject(InvitationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly departments = DEPARTMENTS;
  readonly isSubmitting$ = signal(false);
  readonly errorMessage$ = signal<string | null>(null);

  readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    department: ['', Validators.required],
  });

  onClose(): void {
    this.close.emit(false);
  }

  onSubmit(): void {
    if (this.form.invalid || this.isSubmitting$()) {
      return;
    }

    this.isSubmitting$.set(true);
    this.errorMessage$.set(null);

    const formValue = this.form.value;

    this.invitationService
      .createInvitation({
        email: formValue.email!,
        department: formValue.department!,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.close.emit(true);
        },
        error: (error: Error) => {
          this.errorMessage$.set(error.message);
          this.isSubmitting$.set(false);
        },
      });
  }
}
