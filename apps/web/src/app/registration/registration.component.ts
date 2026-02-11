import { Component, DestroyRef, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators,
} from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { BrnButton } from '@spartan-ng/brain/button';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideX,
  lucideBuilding2,
  lucideLoader2,
} from '@ng-icons/lucide';
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
    BrnButton,
    NgIcon,
    IndustrySelectComponent,
    FileUploadPreviewComponent,
  ],
  providers: [
    provideIcons({ lucideX, lucideBuilding2, lucideLoader2 }),
  ],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-background p-4">
      <div class="w-full max-w-md space-y-8">
        <div class="text-center">
          <ng-icon name="lucideBuilding2" class="mx-auto h-12 w-12 text-primary" />
          <h1 class="mt-4 text-3xl font-bold text-foreground">Create your workspace</h1>
          <p class="mt-2 text-muted-foreground">
            Get started with Mentor AI for your company
          </p>
        </div>

        <form [formGroup]="form" (ngSubmit)="onSubmit()" class="space-y-6">
          @if (serverError()) {
            <div class="rounded-md bg-destructive/10 p-4 text-destructive text-sm">
              {{ serverError() }}
            </div>
          }

          <!-- Email -->
          <div class="space-y-2">
            <label for="email" class="text-sm font-medium text-foreground">
              Email address
            </label>
            <input
              id="email"
              type="email"
              formControlName="email"
              class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="you@company.com"
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

          <!-- Company Name -->
          <div class="space-y-2">
            <label for="companyName" class="text-sm font-medium text-foreground">
              Company name
            </label>
            <input
              id="companyName"
              type="text"
              formControlName="companyName"
              class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              placeholder="Acme Inc."
            />
            @if (form.controls.companyName.touched && form.controls.companyName.errors) {
              <p class="text-sm text-destructive">
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

          <!-- Industry -->
          <div class="space-y-2">
            <label for="industry" class="text-sm font-medium text-foreground">
              Industry
            </label>
            <app-industry-select
              [industries]="industries"
              formControlName="industry"
            />
            @if (form.controls.industry.touched && form.controls.industry.errors) {
              <p class="text-sm text-destructive">
                Please select an industry
              </p>
            }
          </div>

          <!-- Description -->
          <div class="space-y-2">
            <label for="description" class="text-sm font-medium text-foreground">
              Business description
              <span class="text-muted-foreground font-normal">(optional)</span>
            </label>
            <textarea
              id="description"
              formControlName="description"
              rows="3"
              class="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
              placeholder="Tell us about your business..."
            ></textarea>
            @if (form.controls.description.errors?.['maxlength']) {
              <p class="text-sm text-destructive">
                Description cannot exceed 500 characters
              </p>
            }
            <p class="text-xs text-muted-foreground text-right">
              {{ form.controls.description.value?.length || 0 }}/500
            </p>
          </div>

          <!-- Company Icon -->
          <div class="space-y-2">
            <label class="text-sm font-medium text-foreground">
              Company icon
              <span class="text-muted-foreground font-normal">(optional)</span>
            </label>
            <app-file-upload-preview
              (fileSelected)="onFileSelected($event)"
              (fileRemoved)="onFileRemoved()"
              [previewUrl]="iconPreview()"
              [error]="fileError()"
            />
          </div>

          <!-- Submit Button -->
          <button
            brnButton
            type="submit"
            [disabled]="isSubmitting() || form.invalid"
            class="w-full inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            @if (isSubmitting()) {
              <ng-icon name="lucideLoader2" class="mr-2 h-4 w-4 animate-spin" />
              Creating workspace...
            } @else {
              Create workspace
            }
          </button>
        </form>

        <p class="text-center text-sm text-muted-foreground">
          Already have an account?
          <a routerLink="/login" class="font-medium text-primary hover:underline">
            Sign in
          </a>
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
    companyName: [
      '',
      [Validators.required, Validators.minLength(2), Validators.maxLength(100)],
    ],
    industry: ['', Validators.required],
    description: ['', Validators.maxLength(500)],
  });

  onFileSelected(file: File): void {
    // Validate file size (2MB max)
    const maxSize = 2 * 1024 * 1024;
    if (file.size > maxSize) {
      this.fileError.set('Please upload a PNG or JPG image under 2MB');
      return;
    }

    // Validate file type
    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg'];
    if (!allowedTypes.includes(file.type)) {
      this.fileError.set('Please upload a PNG or JPG image under 2MB');
      return;
    }

    this.fileError.set(null);
    this.selectedFile = file;

    // Create preview URL
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
          // Redirect to OAuth flow placeholder
          this.router.navigate(['/oauth-pending']);
        },
        error: (error: Error) => {
          this.serverError.set(error.message);
          this.isSubmitting.set(false);
        },
      });
  }
}
