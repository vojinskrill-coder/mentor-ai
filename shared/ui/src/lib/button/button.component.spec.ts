import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { ButtonComponent, ButtonVariant, ButtonSize } from './button.component';

describe('ButtonComponent', () => {
  let component: ButtonComponent;
  let fixture: ComponentFixture<ButtonComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ButtonComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ButtonComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  describe('variants', () => {
    const variants: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'destructive', 'outline', 'link'];

    variants.forEach((variant) => {
      it(`should apply ${variant} variant classes`, () => {
        fixture.componentRef.setInput('variant', variant);
        fixture.detectChanges();

        const classes = component.buttonClasses();
        expect(classes).toBeTruthy();
        // Each variant should have specific styling
        if (variant === 'primary') {
          expect(classes).toContain('bg-primary');
        } else if (variant === 'secondary') {
          expect(classes).toContain('bg-secondary');
        } else if (variant === 'destructive') {
          expect(classes).toContain('bg-destructive');
        }
      });
    });
  });

  describe('sizes', () => {
    const sizes: ButtonSize[] = ['sm', 'md', 'lg', 'icon'];

    sizes.forEach((size) => {
      it(`should apply ${size} size classes`, () => {
        fixture.componentRef.setInput('size', size);
        fixture.detectChanges();

        const classes = component.buttonClasses();
        if (size === 'sm') {
          expect(classes).toContain('h-9');
        } else if (size === 'md') {
          expect(classes).toContain('h-10');
        } else if (size === 'lg') {
          expect(classes).toContain('h-11');
        } else if (size === 'icon') {
          expect(classes).toContain('w-10');
        }
      });
    });
  });

  describe('disabled state', () => {
    it('should have aria-disabled when disabled', () => {
      fixture.componentRef.setInput('disabled', true);
      fixture.detectChanges();

      const button = fixture.nativeElement.querySelector('button');
      expect(button.getAttribute('aria-disabled')).toBe('true');
      expect(button.disabled).toBe(true);
    });

    it('should not emit click when disabled', () => {
      fixture.componentRef.setInput('disabled', true);
      fixture.detectChanges();

      const clickSpy = vi.fn();
      component.buttonClick.subscribe(clickSpy);

      const button = fixture.nativeElement.querySelector('button');
      button.click();

      expect(clickSpy).not.toHaveBeenCalled();
    });
  });

  describe('loading state', () => {
    it('should show loading spinner when loading', () => {
      fixture.componentRef.setInput('loading', true);
      fixture.detectChanges();

      const spinner = fixture.nativeElement.querySelector('svg');
      expect(spinner).toBeTruthy();
      expect(spinner.classList.contains('animate-spin')).toBe(true);
    });

    it('should disable button when loading', () => {
      fixture.componentRef.setInput('loading', true);
      fixture.detectChanges();

      const button = fixture.nativeElement.querySelector('button');
      expect(button.disabled).toBe(true);
    });

    it('should not emit click when loading', () => {
      fixture.componentRef.setInput('loading', true);
      fixture.detectChanges();

      const clickSpy = vi.fn();
      component.buttonClick.subscribe(clickSpy);

      const button = fixture.nativeElement.querySelector('button');
      button.click();

      expect(clickSpy).not.toHaveBeenCalled();
    });
  });

  describe('accessibility', () => {
    it('should have proper focus styles in class list', () => {
      const classes = component.buttonClasses();
      expect(classes).toContain('focus-visible:outline-none');
      expect(classes).toContain('focus-visible:ring-2');
    });

    it('should support aria-label', () => {
      fixture.componentRef.setInput('ariaLabel', 'Submit form');
      fixture.detectChanges();

      const button = fixture.nativeElement.querySelector('button');
      expect(button.getAttribute('aria-label')).toBe('Submit form');
    });

    it('should support aria-pressed for toggle buttons', () => {
      fixture.componentRef.setInput('pressed', true);
      fixture.detectChanges();

      const button = fixture.nativeElement.querySelector('button');
      expect(button.getAttribute('aria-pressed')).toBe('true');
    });
  });

  describe('keyboard navigation', () => {
    it('should be focusable', () => {
      const button = fixture.nativeElement.querySelector('button');
      button.focus();
      expect(document.activeElement).toBe(button);
    });

    it('should prevent keydown when disabled', () => {
      fixture.componentRef.setInput('disabled', true);
      fixture.detectChanges();

      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      const preventDefaultSpy = vi.spyOn(event, 'preventDefault');

      component.handleKeydown(event);

      expect(preventDefaultSpy).toHaveBeenCalled();
    });
  });

  describe('click handling', () => {
    it('should emit buttonClick on click', () => {
      const clickSpy = vi.fn();
      component.buttonClick.subscribe(clickSpy);

      const button = fixture.nativeElement.querySelector('button');
      button.click();

      expect(clickSpy).toHaveBeenCalled();
    });
  });
});
