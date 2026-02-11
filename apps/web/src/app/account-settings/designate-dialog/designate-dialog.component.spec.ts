import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { DesignateDialogComponent } from './designate-dialog.component';
import { BackupOwnerService } from '../services/backup-owner.service';

const mockBackupOwnerService = {
  getEligibleMembers: vi.fn(),
  designateBackupOwner: vi.fn(),
};

describe('DesignateDialogComponent', () => {
  let component: DesignateDialogComponent;
  let fixture: ComponentFixture<DesignateDialogComponent>;

  beforeEach(async () => {
    vi.clearAllMocks();

    mockBackupOwnerService.getEligibleMembers.mockReturnValue(
      of({
        status: 'success',
        data: [
          {
            id: 'usr_1',
            email: 'admin@test.com',
            name: 'Admin User',
            role: 'ADMIN',
            department: 'TECHNOLOGY',
            createdAt: '2024-01-01T00:00:00.000Z',
          },
          {
            id: 'usr_2',
            email: 'member@test.com',
            name: 'Member User',
            role: 'MEMBER',
            department: 'FINANCE',
            createdAt: '2024-02-01T00:00:00.000Z',
          },
        ],
      })
    );

    await TestBed.configureTestingModule({
      imports: [DesignateDialogComponent],
      providers: [
        { provide: BackupOwnerService, useValue: mockBackupOwnerService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(DesignateDialogComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load eligible members on init', () => {
    expect(mockBackupOwnerService.getEligibleMembers).toHaveBeenCalled();
    expect(component.eligibleMembers$()).toHaveLength(2);
    expect(component.isLoadingMembers$()).toBe(false);
  });

  it('should display eligible members', () => {
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Admin User');
    expect(compiled.textContent).toContain('Member User');
  });

  it('should allow selecting a member', () => {
    component.selectedMemberId$.set('usr_1');
    expect(component.selectedMemberId$()).toBe('usr_1');
  });

  it('should emit selected member ID on confirm', () => {
    const closeSpy = vi.fn();
    component.close.subscribe(closeSpy);

    component.selectedMemberId$.set('usr_2');

    mockBackupOwnerService.designateBackupOwner.mockReturnValue(
      of({
        status: 'success',
        data: {
          id: 'usr_2',
          email: 'member@test.com',
          name: 'Member User',
          designatedAt: new Date().toISOString(),
        },
      })
    );

    component.onConfirm();

    expect(closeSpy).toHaveBeenCalledWith('usr_2');
  });

  it('should emit false on cancel', () => {
    const closeSpy = vi.fn();
    component.close.subscribe(closeSpy);

    component.onCancel();

    expect(closeSpy).toHaveBeenCalledWith(false);
  });

  it('should not confirm when no member selected', () => {
    const closeSpy = vi.fn();
    component.close.subscribe(closeSpy);

    component.onConfirm();

    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('should display error when designation fails', () => {
    component.selectedMemberId$.set('usr_1');
    mockBackupOwnerService.designateBackupOwner.mockReturnValue(
      throwError(() => new Error('Invalid candidate'))
    );

    component.onConfirm();
    fixture.detectChanges();

    expect(component.errorMessage$()).toBe('Invalid candidate');
    expect(component.isSubmitting$()).toBe(false);
    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Invalid candidate');
  });

  it('should show empty state when no eligible members', () => {
    mockBackupOwnerService.getEligibleMembers.mockReturnValue(
      of({ status: 'success', data: [] })
    );

    component.ngOnInit();
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('No eligible team members found');
  });

  it('should display error when loading eligible members fails', () => {
    mockBackupOwnerService.getEligibleMembers.mockReturnValue(
      throwError(() => new Error('Network error'))
    );

    component.ngOnInit();
    fixture.detectChanges();

    expect(component.errorMessage$()).toBe('Network error');
    expect(component.isLoadingMembers$()).toBe(false);
  });
});
