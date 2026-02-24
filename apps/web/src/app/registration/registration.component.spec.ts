import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { RegistrationComponent } from './registration.component';
import { RegistrationService } from '../services/registration.service';

describe('RegistrationComponent', () => {
  let component: RegistrationComponent;
  let fixture: ComponentFixture<RegistrationComponent>;
  let mockRegistrationService: {
    register: ReturnType<typeof vi.fn>;
  };
  let router: Router;

  beforeEach(async () => {
    mockRegistrationService = {
      register: vi.fn().mockReturnValue(of({ tenantId: 'tnt_new' })),
    };

    await TestBed.configureTestingModule({
      imports: [RegistrationComponent],
      providers: [
        provideRouter([]),
        {
          provide: RegistrationService,
          useValue: mockRegistrationService,
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(RegistrationComponent);
    component = fixture.componentInstance;
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
  });

  it('should create', () => {
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should initialize form with empty fields', () => {
    expect(component.form.value).toEqual({
      email: '',
      companyName: '',
      industry: '',
      description: '',
    });
  });

  it('should initialize signals with defaults', () => {
    expect(component.isSubmitting()).toBe(false);
    expect(component.serverError()).toBeNull();
    expect(component.iconPreview()).toBeNull();
    expect(component.fileError()).toBeNull();
  });

  describe('form validation', () => {
    it('should require email', () => {
      component.form.controls.email.setValue('');
      component.form.controls.email.markAsTouched();

      expect(component.form.controls.email.hasError('required')).toBe(true);
    });

    it('should validate email format', () => {
      component.form.controls.email.setValue('invalid');
      component.form.controls.email.markAsTouched();

      expect(component.form.controls.email.hasError('email')).toBe(true);
    });

    it('should accept valid email', () => {
      component.form.controls.email.setValue('user@company.com');

      expect(component.form.controls.email.valid).toBe(true);
    });

    it('should require company name', () => {
      component.form.controls.companyName.setValue('');
      component.form.controls.companyName.markAsTouched();

      expect(component.form.controls.companyName.hasError('required')).toBe(true);
    });

    it('should enforce company name min length', () => {
      component.form.controls.companyName.setValue('A');

      expect(component.form.controls.companyName.hasError('minlength')).toBe(true);
    });

    it('should require industry selection', () => {
      component.form.controls.industry.setValue('');
      component.form.controls.industry.markAsTouched();

      expect(component.form.controls.industry.hasError('required')).toBe(true);
    });

    it('should allow description to be optional', () => {
      component.form.controls.description.setValue('');

      expect(component.form.controls.description.valid).toBe(true);
    });

    it('should enforce description max length', () => {
      component.form.controls.description.setValue('x'.repeat(501));

      expect(component.form.controls.description.hasError('maxlength')).toBe(true);
    });
  });

  describe('onFileSelected', () => {
    it('should reject files over 2MB', () => {
      const bigFile = new File(['x'], 'big.png', { type: 'image/png' });
      Object.defineProperty(bigFile, 'size', { value: 3 * 1024 * 1024 });

      component.onFileSelected(bigFile);

      expect(component.fileError()).toContain('2MB');
      expect(component.selectedFile).toBeNull();
    });

    it('should reject non-image file types', () => {
      const pdfFile = new File(['x'], 'doc.pdf', { type: 'application/pdf' });
      Object.defineProperty(pdfFile, 'size', { value: 1024 });

      component.onFileSelected(pdfFile);

      expect(component.fileError()).toContain('PNG or JPG');
    });

    it('should accept valid PNG file', () => {
      const validFile = new File(['x'], 'logo.png', { type: 'image/png' });
      Object.defineProperty(validFile, 'size', { value: 1024 });

      component.onFileSelected(validFile);

      expect(component.fileError()).toBeNull();
      expect(component.selectedFile).toBe(validFile);
    });
  });

  describe('onFileRemoved', () => {
    it('should clear file state', () => {
      component.selectedFile = new File(['x'], 'logo.png', {
        type: 'image/png',
      });
      component.iconPreview.set('data:image/png;base64,...');
      component.fileError.set('some error');

      component.onFileRemoved();

      expect(component.selectedFile).toBeNull();
      expect(component.iconPreview()).toBeNull();
      expect(component.fileError()).toBeNull();
    });
  });

  describe('onSubmit', () => {
    it('should not submit when form is invalid', () => {
      component.onSubmit();

      expect(mockRegistrationService.register).not.toHaveBeenCalled();
      expect(component.isSubmitting()).toBe(false);
    });

    it('should not submit when already submitting', () => {
      component.form.controls.email.setValue('test@co.com');
      component.form.controls.companyName.setValue('Test Co');
      component.form.controls.industry.setValue('technology');
      component.isSubmitting.set(true);

      component.onSubmit();

      expect(mockRegistrationService.register).not.toHaveBeenCalled();
    });

    it('should call registration service with form values', () => {
      component.form.controls.email.setValue('test@company.com');
      component.form.controls.companyName.setValue('Test Company');
      component.form.controls.industry.setValue('technology');
      component.form.controls.description.setValue('A tech company');

      component.onSubmit();

      expect(component.isSubmitting()).toBe(true);
      expect(mockRegistrationService.register).toHaveBeenCalledWith(
        {
          email: 'test@company.com',
          companyName: 'Test Company',
          industry: 'technology',
          description: 'A tech company',
        },
        undefined
      );
    });

    it('should navigate to oauth-pending on success', () => {
      component.form.controls.email.setValue('test@company.com');
      component.form.controls.companyName.setValue('Test Company');
      component.form.controls.industry.setValue('technology');

      component.onSubmit();

      expect(router.navigate).toHaveBeenCalledWith(['/oauth-pending']);
    });

    it('should display server error on failure', () => {
      mockRegistrationService.register.mockReturnValue(
        throwError(() => new Error('Email already registered'))
      );

      component.form.controls.email.setValue('test@company.com');
      component.form.controls.companyName.setValue('Test Company');
      component.form.controls.industry.setValue('technology');

      component.onSubmit();

      expect(component.serverError()).toBe('Email already registered');
      expect(component.isSubmitting()).toBe(false);
    });
  });
});
