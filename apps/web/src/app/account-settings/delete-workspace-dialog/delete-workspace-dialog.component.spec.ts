import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { DeleteWorkspaceDialogComponent } from './delete-workspace-dialog.component';
import { TenantDeletionService } from '../services/tenant-deletion.service';
import type { TenantStatus } from '@mentor-ai/shared/types';

const mockTenantDeletionService = {
  requestDeletion: vi.fn(),
};

describe('DeleteWorkspaceDialogComponent', () => {
  let component: DeleteWorkspaceDialogComponent;
  let fixture: ComponentFixture<DeleteWorkspaceDialogComponent>;

  beforeEach(async () => {
    vi.clearAllMocks();

    await TestBed.configureTestingModule({
      imports: [DeleteWorkspaceDialogComponent],
      providers: [
        { provide: TenantDeletionService, useValue: mockTenantDeletionService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DeleteWorkspaceDialogComponent);
    component = fixture.componentInstance;
    // Set required inputs
    fixture.componentRef.setInput('tenantName', 'Test Workspace');
    fixture.componentRef.setInput('memberCount', 5);
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display workspace name in confirmation prompt', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Test Workspace');
  });

  it('should display member count in warning', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('5 team members');
  });

  it('should disable confirm button when workspace name does not match', () => {
    component.confirmationInput = 'Wrong Name';
    fixture.detectChanges();

    const confirmButton = fixture.nativeElement.querySelector(
      'button[class*="destructive"]:not([class*="outline"])'
    ) as HTMLButtonElement;

    expect(confirmButton.disabled).toBe(true);
  });

  it('should enable confirm button when workspace name matches exactly', () => {
    component.confirmationInput = 'Test Workspace';
    fixture.detectChanges();

    const confirmButton = fixture.nativeElement.querySelector(
      'button[class*="destructive"]:not([class*="outline"])'
    ) as HTMLButtonElement;

    expect(confirmButton.disabled).toBe(false);
  });

  it('should not confirm when workspace name is incorrect (case-sensitive)', () => {
    component.confirmationInput = 'test workspace'; // lowercase
    fixture.detectChanges();

    const closeSpy = vi.fn();
    component.close.subscribe(closeSpy);

    component.onConfirm();
    fixture.detectChanges();

    expect(closeSpy).not.toHaveBeenCalled();
    expect(component.errorMessage$()).toBe('Workspace name does not match.');
  });

  it('should emit deletion status on successful confirm', () => {
    component.confirmationInput = 'Test Workspace';

    const mockResponse = {
      data: {
        status: 'PENDING_DELETION' as TenantStatus,
        requestedAt: '2024-06-01T10:00:00.000Z',
        gracePeriodEndsAt: '2024-06-08T10:00:00.000Z',
        estimatedCompletionBy: '2024-07-01T10:00:00.000Z',
        canCancel: true,
      },
      message: 'Workspace deletion initiated.',
    };
    mockTenantDeletionService.requestDeletion.mockReturnValue(of(mockResponse));

    const closeSpy = vi.fn();
    component.close.subscribe(closeSpy);

    component.onConfirm();

    expect(mockTenantDeletionService.requestDeletion).toHaveBeenCalledWith('Test Workspace');
    expect(closeSpy).toHaveBeenCalledWith(mockResponse.data);
  });

  it('should emit false on cancel', () => {
    const closeSpy = vi.fn();
    component.close.subscribe(closeSpy);

    component.onCancel();

    expect(closeSpy).toHaveBeenCalledWith(false);
  });

  it('should display error when deletion request fails', () => {
    component.confirmationInput = 'Test Workspace';
    mockTenantDeletionService.requestDeletion.mockReturnValue(
      throwError(() => new Error('Server error'))
    );

    component.onConfirm();
    fixture.detectChanges();

    expect(component.errorMessage$()).toBe('Server error');
    expect(component.isSubmitting$()).toBe(false);
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Server error');
  });

  it('should show loading state while submitting', () => {
    component.confirmationInput = 'Test Workspace';
    component.isSubmitting$.set(true);
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Deleting...');
  });

  it('should display all warning bullet points', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Permanently delete all workspace data');
    expect(compiled.textContent).toContain('Remove access');
    expect(compiled.textContent).toContain('Cannot be undone');
    expect(compiled.textContent).toContain('30 days');
  });

  it('should display grace period information', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('7 days');
    expect(compiled.textContent).toContain('Grace period');
  });
});
