import { Component, DestroyRef, inject, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { InvitationService } from '../services/invitation.service';

const DEPARTMENTS = [
  { value: 'FINANCE', label: 'Finansije' },
  { value: 'MARKETING', label: 'Marketing' },
  { value: 'TECHNOLOGY', label: 'Tehnologija' },
  { value: 'OPERATIONS', label: 'Operacije' },
  { value: 'LEGAL', label: 'Pravo' },
  { value: 'CREATIVE', label: 'Kreativa' },
];

@Component({
  selector: 'app-invite-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  styles: [
    `
      :host {
        display: block;
      }
      .overlay {
        position: fixed;
        inset: 0;
        z-index: 50;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 16px;
      }
      .backdrop {
        position: absolute;
        inset: 0;
        background: rgba(0, 0, 0, 0.5);
      }
      .dialog {
        position: relative;
        z-index: 10;
        width: 100%;
        max-width: 440px;
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 12px;
        padding: 24px;
        box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
        color: #fafafa;
        font-family: 'Inter', system-ui, sans-serif;
      }
      .dialog-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 24px;
      }
      .dialog-header h2 {
        font-size: 18px;
        font-weight: 600;
      }
      .close-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 32px;
        height: 32px;
        border-radius: 6px;
        border: none;
        background: transparent;
        color: #9e9e9e;
        cursor: pointer;
      }
      .close-btn:hover {
        background: #242424;
        color: #fafafa;
      }
      .close-btn svg {
        width: 20px;
        height: 20px;
      }

      .error-box {
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.2);
        border-radius: 8px;
        padding: 12px;
        margin-bottom: 16px;
        font-size: 13px;
        color: #ef4444;
      }
      .field-group {
        margin-bottom: 16px;
      }
      .field-label {
        display: block;
        font-size: 13px;
        font-weight: 500;
        margin-bottom: 8px;
      }
      .field-input {
        width: 100%;
        border-radius: 8px;
        border: 1px solid #2a2a2a;
        background: #0d0d0d;
        padding: 10px 12px;
        font-size: 14px;
        color: #fafafa;
        outline: none;
        font-family: inherit;
        transition: border-color 0.2s;
      }
      .field-input:focus {
        border-color: #3b82f6;
      }
      .field-input::placeholder {
        color: #707070;
      }
      select.field-input {
        appearance: none;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239e9e9e' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: right 12px center;
        padding-right: 32px;
      }
      select.field-input option {
        background: #1a1a1a;
        color: #fafafa;
      }
      .field-error {
        font-size: 12px;
        color: #ef4444;
        margin-top: 4px;
      }
      .field-hint {
        font-size: 12px;
        color: #9e9e9e;
        margin-top: 4px;
      }

      .role-display {
        border-radius: 8px;
        border: 1px solid #2a2a2a;
        background: #242424;
        padding: 10px 12px;
        font-size: 14px;
        color: #9e9e9e;
      }

      .actions {
        display: flex;
        justify-content: flex-end;
        gap: 12px;
        margin-top: 8px;
      }
      .cancel-btn {
        padding: 10px 20px;
        border-radius: 8px;
        border: 1px solid #2a2a2a;
        background: #242424;
        color: #fafafa;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        font-family: inherit;
      }
      .cancel-btn:hover {
        background: #2a2a2a;
      }
      .submit-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 10px 20px;
        border-radius: 8px;
        border: none;
        background: #3b82f6;
        color: white;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        font-family: inherit;
      }
      .submit-btn:hover:not(:disabled) {
        background: #2563eb;
      }
      .submit-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      @keyframes spin {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }
      .btn-spinner {
        width: 16px;
        height: 16px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-top-color: white;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
    `,
  ],
  template: `
    <div class="overlay">
      <div class="backdrop" (click)="onClose()"></div>
      <div class="dialog">
        <div class="dialog-header">
          <h2>Pozovi člana tima</h2>
          <button class="close-btn" (click)="onClose()">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <form [formGroup]="form" (ngSubmit)="onSubmit()">
          @if (errorMessage$()) {
            <div class="error-box">{{ errorMessage$() }}</div>
          }

          <div class="field-group">
            <label for="invite-email" class="field-label">Email adresa</label>
            <input
              id="invite-email"
              type="email"
              formControlName="email"
              class="field-input"
              placeholder="kolega@kompanija.com"
            />
            @if (form.controls.email.touched && form.controls.email.errors) {
              <p class="field-error">
                @if (form.controls.email.errors['required']) {
                  Email je obavezan
                } @else if (form.controls.email.errors['email']) {
                  Unesite validnu email adresu
                }
              </p>
            }
          </div>

          <div class="field-group">
            <label for="invite-department" class="field-label">Odeljenje</label>
            <select id="invite-department" formControlName="department" class="field-input">
              <option value="" disabled>Izaberite odeljenje</option>
              @for (dept of departments; track dept.value) {
                <option [value]="dept.value">{{ dept.label }}</option>
              }
            </select>
            @if (form.controls.department.touched && form.controls.department.errors) {
              <p class="field-error">Izaberite odeljenje</p>
            }
          </div>

          <div class="field-group">
            <label class="field-label">Uloga</label>
            <div class="role-display">Član tima</div>
            <p class="field-hint">Pozvani korisnici dobijaju ulogu člana tima.</p>
          </div>

          <div class="actions">
            <button type="button" class="cancel-btn" (click)="onClose()">Otkaži</button>
            <button type="submit" class="submit-btn" [disabled]="isSubmitting$() || form.invalid">
              @if (isSubmitting$()) {
                <span class="btn-spinner"></span> Slanje...
              } @else {
                Pošalji poziv
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
