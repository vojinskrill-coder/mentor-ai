import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { AccountSettingsComponent } from './account-settings.component';
import { BackupOwnerService } from './services/backup-owner.service';
import { TenantDeletionService } from './services/tenant-deletion.service';
import type { TenantStatus } from '@mentor-ai/shared/types';

const mockTenantDeletionService = {
  getDeletionStatus: vi.fn(),
  requestDeletion: vi.fn(),
  cancelDeletion: vi.fn(),
};

const mockBackupOwnerService = {
  getBackupOwner: vi.fn(),
  getBackupOwnerStatus: vi.fn(),
  removeBackupOwner: vi.fn(),
  getEligibleMembers: vi.fn(),
  designateBackupOwner: vi.fn(),
};

describe('AccountSettingsComponent', () => {
  let component: AccountSettingsComponent;
  let fixture: ComponentFixture<AccountSettingsComponent>;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockBackupOwnerService.getBackupOwner.mockReturnValue(
      of({ status: 'success', data: null })
    );
    mockBackupOwnerService.getBackupOwnerStatus.mockReturnValue(
      of({
        status: 'success',
        data: { hasBackupOwner: false, tenantAgeDays: 10, showWarning: false },
      })
    );
    mockTenantDeletionService.getDeletionStatus.mockReturnValue(
      of({
        data: {
          status: 'ACTIVE' as TenantStatus,
          requestedAt: null,
          gracePeriodEndsAt: null,
          estimatedCompletionBy: null,
          canCancel: false,
        },
      })
    );

    await TestBed.configureTestingModule({
      imports: [AccountSettingsComponent],
      providers: [
        provideRouter([]),
        { provide: BackupOwnerService, useValue: mockBackupOwnerService },
        { provide: TenantDeletionService, useValue: mockTenantDeletionService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(AccountSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display "No backup owner designated" when none exists', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('No backup owner designated');
  });

  it('should display backup owner info when one exists', () => {
    mockBackupOwnerService.getBackupOwner.mockReturnValue(
      of({
        status: 'success',
        data: {
          id: 'usr_1',
          email: 'backup@test.com',
          name: 'Backup User',
          designatedAt: '2024-06-01T00:00:00.000Z',
        },
      })
    );
    mockBackupOwnerService.getBackupOwnerStatus.mockReturnValue(
      of({
        status: 'success',
        data: { hasBackupOwner: true, tenantAgeDays: 45, showWarning: false },
      })
    );

    // Re-trigger data load
    component.ngOnInit();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Backup User');
    expect(compiled.textContent).toContain('backup@test.com');
  });

  it('should show warning banner when showWarning is true', () => {
    mockBackupOwnerService.getBackupOwnerStatus.mockReturnValue(
      of({
        status: 'success',
        data: { hasBackupOwner: false, tenantAgeDays: 45, showWarning: true },
      })
    );

    component.ngOnInit();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain(
      'Designate a backup Owner to prevent account lockout'
    );
    expect(compiled.textContent).toContain('45 days');
  });

  it('should not show warning banner when backup owner exists', () => {
    mockBackupOwnerService.getBackupOwner.mockReturnValue(
      of({
        status: 'success',
        data: {
          id: 'usr_1',
          email: 'backup@test.com',
          name: 'Backup',
          designatedAt: '2024-06-01T00:00:00.000Z',
        },
      })
    );
    mockBackupOwnerService.getBackupOwnerStatus.mockReturnValue(
      of({
        status: 'success',
        data: { hasBackupOwner: true, tenantAgeDays: 45, showWarning: false },
      })
    );

    component.ngOnInit();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).not.toContain(
      'Designate a backup Owner to prevent account lockout'
    );
  });

  it('should open designate dialog when button clicked', () => {
    expect(component.showDesignateDialog$()).toBe(false);
    component.showDesignateDialog$.set(true);
    expect(component.showDesignateDialog$()).toBe(true);
  });

  it('should reload data after designate dialog closes with success', () => {
    const spy = vi.spyOn(mockBackupOwnerService, 'getBackupOwner');
    component.onDesignateDialogClose('usr_1');
    expect(component.showDesignateDialog$()).toBe(false);
    expect(spy).toHaveBeenCalled();
  });

  it('should not reload data when designate dialog is cancelled', () => {
    vi.clearAllMocks();
    component.onDesignateDialogClose(false);
    expect(component.showDesignateDialog$()).toBe(false);
    // getBackupOwner should NOT be called again after cancel
    expect(mockBackupOwnerService.getBackupOwner).not.toHaveBeenCalled();
  });

  it('should remove backup owner and reload', () => {
    mockBackupOwnerService.removeBackupOwner.mockReturnValue(
      of({ status: 'success', data: null })
    );

    component.onRemoveBackupOwner();

    expect(mockBackupOwnerService.removeBackupOwner).toHaveBeenCalled();
  });

  it('should display error when remove fails', () => {
    mockBackupOwnerService.removeBackupOwner.mockReturnValue(
      throwError(() => new Error('Server error'))
    );

    component.onRemoveBackupOwner();
    fixture.detectChanges();

    expect(component.errorMessage$()).toBe('Server error');
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Server error');
  });
});
