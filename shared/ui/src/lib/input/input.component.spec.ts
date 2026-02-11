import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { vi } from 'vitest';
import { InputComponent, InputState, InputType } from './input.component';

describe('InputComponent', () => {
  let component: InputComponent;
  let fixture: ComponentFixture<InputComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InputComponent, FormsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(InputComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('input types', () => {
    const types: InputType[] = ['text', 'password', 'email', 'number', 'tel', 'url', 'search'];

    types.forEach((type) => {
      it(`should support ${type} input type`, () => {
        fixture.componentRef.setInput('type', type);
        fixture.detectChanges();

        const input = fixture.nativeElement.querySelector('input');
        if (type === 'password') {
          // Password starts hidden
          expect(input.type).toBe('password');
        } else {
          expect(input.type).toBe(type);
        }
      });
    });
  });

  describe('validation states', () => {
    const states: InputState[] = ['default', 'error', 'success'];

    states.forEach((state) => {
      it(`should apply ${state} state classes`, () => {
        fixture.componentRef.setInput('state', state);
        fixture.detectChanges();

        const classes = component.inputClasses();
        if (state === 'error') {
          expect(classes).toContain('border-destructive');
        } else if (state === 'success') {
          expect(classes).toContain('border-green-500');
        } else {
          expect(classes).toContain('border-input');
        }
      });
    });
  });

  describe('error message', () => {
    it('should show error message when state is error', () => {
      fixture.componentRef.setInput('state', 'error');
      fixture.componentRef.setInput('errorMessage', 'This field is required');
      fixture.detectChanges();

      const errorElement = fixture.nativeElement.querySelector('[role="alert"]');
      expect(errorElement).toBeTruthy();
      expect(errorElement.textContent.trim()).toBe('This field is required');
    });

    it('should not show error message when state is not error', () => {
      fixture.componentRef.setInput('state', 'default');
      fixture.componentRef.setInput('errorMessage', 'This field is required');
      fixture.detectChanges();

      const errorElement = fixture.nativeElement.querySelector('[role="alert"]');
      expect(errorElement).toBeFalsy();
    });
  });

  describe('helper text', () => {
    it('should show helper text when provided and not in error state', () => {
      fixture.componentRef.setInput('helperText', 'Enter your email');
      fixture.detectChanges();

      const helperElement = fixture.nativeElement.querySelector('.text-muted-foreground');
      expect(helperElement).toBeTruthy();
      expect(helperElement.textContent.trim()).toBe('Enter your email');
    });

    it('should hide helper text when in error state', () => {
      fixture.componentRef.setInput('helperText', 'Enter your email');
      fixture.componentRef.setInput('state', 'error');
      fixture.detectChanges();

      // Helper text should not be visible in error state
      const helpers = fixture.nativeElement.querySelectorAll('.text-muted-foreground');
      const visibleHelper = Array.from(helpers as NodeListOf<Element>).find(
        (el) => el.textContent?.trim() === 'Enter your email'
      );
      expect(visibleHelper).toBeFalsy();
    });
  });

  describe('password visibility toggle', () => {
    it('should show toggle button for password type', () => {
      fixture.componentRef.setInput('type', 'password');
      fixture.detectChanges();

      const toggleButton = fixture.nativeElement.querySelector('button[type="button"]');
      expect(toggleButton).toBeTruthy();
    });

    it('should toggle password visibility', () => {
      fixture.componentRef.setInput('type', 'password');
      fixture.detectChanges();

      const input = fixture.nativeElement.querySelector('input');
      expect(input.type).toBe('password');

      component.togglePasswordVisibility();
      fixture.detectChanges();

      expect(input.type).toBe('text');
    });
  });

  describe('accessibility', () => {
    it('should have aria-invalid when in error state', () => {
      fixture.componentRef.setInput('state', 'error');
      fixture.detectChanges();

      const input = fixture.nativeElement.querySelector('input');
      expect(input.getAttribute('aria-invalid')).toBe('true');
    });

    it('should have aria-describedby linking to error message', () => {
      fixture.componentRef.setInput('state', 'error');
      fixture.componentRef.setInput('errorMessage', 'Error message');
      fixture.detectChanges();

      const input = fixture.nativeElement.querySelector('input');
      const describedBy = input.getAttribute('aria-describedby');
      expect(describedBy).toContain('-error');
    });

    it('should have proper focus styles in class list', () => {
      const classes = component.inputClasses();
      expect(classes).toContain('focus-visible:outline-none');
      expect(classes).toContain('focus-visible:ring-2');
    });

    it('should support aria-label', () => {
      fixture.componentRef.setInput('ariaLabel', 'Email address');
      fixture.detectChanges();

      const input = fixture.nativeElement.querySelector('input');
      expect(input.getAttribute('aria-label')).toBe('Email address');
    });
  });

  describe('label', () => {
    it('should show label when provided', () => {
      fixture.componentRef.setInput('label', 'Email');
      fixture.detectChanges();

      const label = fixture.nativeElement.querySelector('label');
      expect(label).toBeTruthy();
      expect(label.textContent).toContain('Email');
    });

    it('should show required indicator when required', () => {
      fixture.componentRef.setInput('label', 'Email');
      fixture.componentRef.setInput('required', true);
      fixture.detectChanges();

      const requiredIndicator = fixture.nativeElement.querySelector('.text-destructive');
      expect(requiredIndicator).toBeTruthy();
      expect(requiredIndicator.textContent).toBe('*');
    });
  });

  describe('disabled state', () => {
    it('should be disabled when disabled input is true', async () => {
      fixture.componentRef.setInput('disabled', true);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const input = fixture.nativeElement.querySelector('input');
      expect(input.hasAttribute('disabled')).toBe(true);
    });

    it('should be disabled when setDisabledState is called with true', async () => {
      component.setDisabledState(true);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const input = fixture.nativeElement.querySelector('input');
      expect(input.hasAttribute('disabled')).toBe(true);
    });

    it('should re-enable when setDisabledState is called with false', async () => {
      component.setDisabledState(true);
      fixture.detectChanges();

      component.setDisabledState(false);
      fixture.detectChanges();
      await fixture.whenStable();
      fixture.detectChanges();

      const input = fixture.nativeElement.querySelector('input');
      expect(input.hasAttribute('disabled')).toBe(false);
    });

    it('should combine disabled input and form disabled state', async () => {
      // Both false - should not be disabled
      expect(component.isDisabled()).toBe(false);

      // Input true - should be disabled
      fixture.componentRef.setInput('disabled', true);
      fixture.detectChanges();
      expect(component.isDisabled()).toBe(true);

      // Reset input, set form disabled - should still be disabled
      fixture.componentRef.setInput('disabled', false);
      component.setDisabledState(true);
      fixture.detectChanges();
      expect(component.isDisabled()).toBe(true);
    });
  });

  describe('value changes', () => {
    it('should emit valueChange when value changes', () => {
      const valueChangeSpy = vi.fn();
      component.valueChange.subscribe(valueChangeSpy);

      component.onValueChange('test value');

      expect(valueChangeSpy).toHaveBeenCalledWith('test value');
    });
  });
});
