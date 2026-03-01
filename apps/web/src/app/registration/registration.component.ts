import { Component, DestroyRef, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { INDUSTRIES, Industry } from '@mentor-ai/shared/utils';
import { IndustrySelectComponent } from './components/industry-select.component';
import { FileUploadPreviewComponent } from './components/file-upload-preview.component';
import { RegistrationService } from '../services/registration.service';

@Component({
  selector: 'app-registration',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    IndustrySelectComponent,
    FileUploadPreviewComponent,
  ],
  styles: [
    `
      :host {
        display: block;
      }
      .page {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        background: #0d0d0d;
        padding: 16px;
        font-family: 'Inter', system-ui, sans-serif;
        color: #fafafa;
      }
      .container {
        width: 100%;
        max-width: 440px;
      }
      .header {
        text-align: center;
        margin-bottom: 32px;
      }
      .header-icon {
        width: 48px;
        height: 48px;
        margin: 0 auto 16px;
        color: #3b82f6;
      }
      .header h1 {
        font-size: 28px;
        font-weight: 700;
        margin-bottom: 8px;
      }
      .header p {
        font-size: 15px;
        color: #a1a1a1;
      }
      .error-box {
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.2);
        border-radius: 8px;
        padding: 12px 16px;
        margin-bottom: 16px;
        font-size: 13px;
        color: #ef4444;
      }
      .field-group {
        margin-bottom: 20px;
      }
      .field-label {
        display: block;
        font-size: 13px;
        font-weight: 500;
        margin-bottom: 8px;
      }
      .field-label .optional {
        color: #9e9e9e;
        font-weight: 400;
      }
      .field-input {
        width: 100%;
        border-radius: 8px;
        border: 1px solid #2a2a2a;
        background: #1a1a1a;
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
      textarea.field-input {
        resize: none;
      }
      .field-error {
        font-size: 12px;
        color: #ef4444;
        margin-top: 4px;
      }
      .char-count {
        font-size: 11px;
        color: #9e9e9e;
        text-align: right;
        margin-top: 4px;
      }
      .submit-btn {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        padding: 12px;
        background: #3b82f6;
        color: white;
        border: none;
        border-radius: 8px;
        font-size: 15px;
        font-weight: 500;
        cursor: pointer;
        font-family: inherit;
        margin-top: 24px;
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
      .footer {
        text-align: center;
        margin-top: 24px;
        font-size: 13px;
        color: #9e9e9e;
      }
      .footer a {
        color: #3b82f6;
        font-weight: 500;
        text-decoration: none;
        margin-left: 4px;
      }
      .footer a:hover {
        text-decoration: underline;
      }
    `,
  ],
  template: `
    <div class="page">
      <div class="container">
        <div class="header">
          <svg class="header-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="1.5"
              d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
            />
          </svg>
          <h1>Create your workspace</h1>
          <p>Get started with Mentor AI for your company</p>
        </div>

        <form [formGroup]="form" (ngSubmit)="onSubmit()">
          @if (serverError()) {
            <div class="error-box">{{ serverError() }}</div>
          }

          <div class="field-group">
            <label for="email" class="field-label">Email address</label>
            <input
              id="email"
              type="email"
              class="field-input"
              formControlName="email"
              placeholder="you@company.com"
            />
            @if (form.controls.email.touched && form.controls.email.errors) {
              <p class="field-error">
                @if (form.controls.email.errors['required']) {
                  Email is required
                } @else if (form.controls.email.errors['email']) {
                  Please enter a valid email address
                }
              </p>
            }
          </div>

          <div class="field-group">
            <label for="companyName" class="field-label">Company name</label>
            <input
              id="companyName"
              type="text"
              class="field-input"
              formControlName="companyName"
              placeholder="Acme Inc."
            />
            @if (form.controls.companyName.touched && form.controls.companyName.errors) {
              <p class="field-error">
                @if (form.controls.companyName.errors['required']) {
                  Company name is required
                } @else if (form.controls.companyName.errors['minlength']) {
                  Company name must be at least 2 characters
                } @else if (form.controls.companyName.errors['maxlength']) {
                  Company name cannot exceed 100 characters
                }
              </p>
            }
          </div>

          <div class="field-group">
            <label for="industry" class="field-label">Industry</label>
            <app-industry-select [industries]="industries" formControlName="industry" />
            @if (form.controls.industry.touched && form.controls.industry.errors) {
              <p class="field-error">Please select an industry</p>
            }
          </div>

          <div class="field-group">
            <label for="description" class="field-label">
              Business description
              <span class="optional">(optional)</span>
            </label>
            <textarea
              id="description"
              class="field-input"
              formControlName="description"
              rows="3"
              placeholder="Tell us about your business..."
            ></textarea>
            @if (form.controls.description.errors?.['maxlength']) {
              <p class="field-error">Description cannot exceed 500 characters</p>
            }
            <p class="char-count">{{ form.controls.description.value?.length || 0 }}/500</p>
          </div>

          <div class="field-group">
            <label class="field-label">
              Company icon
              <span class="optional">(optional)</span>
            </label>
            <app-file-upload-preview
              (fileSelected)="onFileSelected($event)"
              (fileRemoved)="onFileRemoved()"
              [previewUrl]="iconPreview()"
              [error]="fileError()"
            />
          </div>

          <button type="submit" class="submit-btn" [disabled]="isSubmitting() || form.invalid">
            @if (isSubmitting()) {
              <span class="btn-spinner"></span> Creating workspace...
            } @else {
              Create workspace
            }
          </button>
        </form>

        <p class="footer">
          Already have an account?
          <a routerLink="/login">Sign in</a>
        </p>
      </div>
    </div>
  `,
})
export class RegistrationComponent {
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly registrationService = inject(RegistrationService);
  private readonly destroyRef = inject(DestroyRef);

  readonly industries = INDUSTRIES;
  readonly isSubmitting = signal(false);
  readonly serverError = signal<string | null>(null);
  readonly iconPreview = signal<string | null>(null);
  readonly fileError = signal<string | null>(null);

  selectedFile: File | null = null;

  readonly form = this.fb.group({
    email: ['', [Validators.required, Validators.email]],
    companyName: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
    industry: ['', Validators.required],
    description: ['', Validators.maxLength(500)],
  });

  onFileSelected(file: File): void {
    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      this.fileError.set('Please upload a PNG or JPG image under 2MB');
      return;
    }

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      this.fileError.set('Please upload a PNG or JPG image under 2MB');
      return;
    }

    this.fileError.set(null);
    this.selectedFile = file;

    const reader = new FileReader();
    reader.onload = (e) => {
      this.iconPreview.set(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  }

  onFileRemoved(): void {
    this.selectedFile = null;
    this.iconPreview.set(null);
    this.fileError.set(null);
  }

  onSubmit(): void {
    if (this.form.invalid || this.isSubmitting()) {
      return;
    }

    this.isSubmitting.set(true);
    this.serverError.set(null);

    const formValue = this.form.value;

    this.registrationService
      .register(
        {
          email: formValue.email!,
          companyName: formValue.companyName!,
          industry: formValue.industry as Industry,
          description: formValue.description || undefined,
        },
        this.selectedFile || undefined
      )
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.router.navigate(['/oauth-pending']);
        },
        error: (error: Error) => {
          this.serverError.set(error.message);
          this.isSubmitting.set(false);
        },
      });
  }
}
