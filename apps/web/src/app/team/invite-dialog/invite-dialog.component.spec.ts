import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { InviteDialogComponent } from './invite-dialog.component';
import { InvitationService } from '../services/invitation.service';

describe('InviteDialogComponent', () => {
  let component: InviteDialogComponent;
  let fixture: ComponentFixture<InviteDialogComponent>;

  const mockInvitationService = {
    createInvitation: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [InviteDialogComponent],
      providers: [
        { provide: InvitationService, useValue: mockInvitationService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(InviteDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should have invalid form initially', () => {
    expect(component.form.valid).toBe(false);
  });

  it('should validate email field', () => {
    component.form.controls.email.setValue('invalid');
    expect(component.form.controls.email.errors?.['email']).toBeTruthy();

    component.form.controls.email.setValue('valid@test.com');
    expect(component.form.controls.email.errors).toBeNull();
  });

  it('should require department', () => {
    expect(component.form.controls.department.errors?.['required']).toBeTruthy();

    component.form.controls.department.setValue('TECHNOLOGY');
    expect(component.form.controls.department.errors).toBeNull();
  });

  it('should emit close(false) on cancel', () => {
    const closeSpy = vi.fn();
    component.close.subscribe(closeSpy);

    component.onClose();

    expect(closeSpy).toHaveBeenCalledWith(false);
  });

  it('should not submit when form is invalid', () => {
    component.onSubmit();
    expect(mockInvitationService.createInvitation).not.toHaveBeenCalled();
  });

  it('should submit and emit close(true) on success', () => {
    const closeSpy = vi.fn();
    component.close.subscribe(closeSpy);
    mockInvitationService.createInvitation.mockReturnValue(
      of({ status: 'success', data: {} })
    );

    component.form.controls.email.setValue('test@example.com');
    component.form.controls.department.setValue('TECHNOLOGY');
    component.onSubmit();

    expect(mockInvitationService.createInvitation).toHaveBeenCalledWith({
      email: 'test@example.com',
      department: 'TECHNOLOGY',
    });
    expect(closeSpy).toHaveBeenCalledWith(true);
  });

  it('should show error message on failure', () => {
    mockInvitationService.createInvitation.mockReturnValue(
      throwError(() => new Error('Duplicate invitation'))
    );

    component.form.controls.email.setValue('test@example.com');
    component.form.controls.department.setValue('TECHNOLOGY');
    component.onSubmit();

    expect(component.errorMessage$()).toBe('Duplicate invitation');
    expect(component.isSubmitting$()).toBe(false);
  });
});
