import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ComponentRef } from '@angular/core';
import { RemoveDialogComponent } from './remove-dialog.component';

describe('RemoveDialogComponent', () => {
  let component: RemoveDialogComponent;
  let componentRef: ComponentRef<RemoveDialogComponent>;
  let fixture: ComponentFixture<RemoveDialogComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [RemoveDialogComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(RemoveDialogComponent);
    component = fixture.componentInstance;
    componentRef = fixture.componentRef;

    // Set required inputs
    componentRef.setInput('memberName', 'John Doe');
    componentRef.setInput('memberEmail', 'john@test.com');
    componentRef.setInput('memberRole', 'MEMBER');

    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display member name and email', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('John Doe');
    expect(compiled.textContent).toContain('john@test.com');
  });

  it('should default to REASSIGN strategy', () => {
    expect(component.selectedStrategy$()).toBe('REASSIGN');
  });

  it('should allow switching to ARCHIVE strategy', () => {
    component.selectedStrategy$.set('ARCHIVE');
    expect(component.selectedStrategy$()).toBe('ARCHIVE');
  });

  it('should emit selected strategy on confirm', () => {
    const closeSpy = vi.fn();
    component.close.subscribe(closeSpy);

    component.onConfirm();

    expect(closeSpy).toHaveBeenCalledWith('REASSIGN');
    expect(component.isSubmitting$()).toBe(true);
  });

  it('should emit false on cancel', () => {
    const closeSpy = vi.fn();
    component.close.subscribe(closeSpy);

    component.onCancel();

    expect(closeSpy).toHaveBeenCalledWith(false);
  });

  it('should emit ARCHIVE strategy when selected and confirmed', () => {
    const closeSpy = vi.fn();
    component.close.subscribe(closeSpy);

    component.selectedStrategy$.set('ARCHIVE');
    component.onConfirm();

    expect(closeSpy).toHaveBeenCalledWith('ARCHIVE');
  });

  it('should show error message when set', () => {
    component.errorMessage$.set('You cannot remove yourself.');
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('You cannot remove yourself.');
  });

  it('should not show error message when empty', () => {
    expect(component.errorMessage$()).toBe('');
    const compiled = fixture.nativeElement as HTMLElement;
    const errorDiv = compiled.querySelector('.text-destructive');
    // Error div should not be present (or content should be empty)
    expect(
      errorDiv === null || errorDiv.textContent?.trim() === ''
    ).toBeTruthy();
  });

  it('should display error from input and reset submitting state', async () => {
    component.onConfirm();
    expect(component.isSubmitting$()).toBe(true);

    componentRef.setInput('error', 'You cannot remove yourself.');
    fixture.detectChanges();
    await fixture.whenStable();

    expect(component.errorMessage$()).toBe('You cannot remove yourself.');
    expect(component.isSubmitting$()).toBe(false);

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('You cannot remove yourself.');
  });
});
