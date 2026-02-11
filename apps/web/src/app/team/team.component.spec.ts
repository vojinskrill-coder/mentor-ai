import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';
import { signal } from '@angular/core';
import { TeamComponent } from './team.component';
import { InvitationService } from './services/invitation.service';
import { TeamMembersService } from './services/team-members.service';
import { AuthService } from '../core/auth/auth.service';

describe('TeamComponent', () => {
  let component: TeamComponent;
  let fixture: ComponentFixture<TeamComponent>;

  const mockInvitationService = {
    getInvitations: vi.fn().mockReturnValue(of({ status: 'success', data: [] })),
    revokeInvitation: vi.fn().mockReturnValue(of({ status: 'success', data: { message: 'ok' } })),
  };

  const mockTeamMembersService = {
    getMembers: vi.fn().mockReturnValue(of({ status: 'success', data: [] })),
    removeMember: vi.fn().mockReturnValue(of({ status: 'success', data: null, message: 'Member removed' })),
  };

  const mockCurrentUser = signal<{ userId: string; email: string; tenantId: string; role: string } | null>({
    userId: 'usr_owner1',
    email: 'owner@test.com',
    tenantId: 'tnt_1',
    role: 'TENANT_OWNER',
  });

  const mockAuthService = {
    currentUser: mockCurrentUser,
    isAuthenticated$: signal(true),
    user$: signal(null),
    isLoading$: signal(false),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TeamComponent],
      providers: [
        provideRouter([]),
        { provide: InvitationService, useValue: mockInvitationService },
        { provide: TeamMembersService, useValue: mockTeamMembersService },
        { provide: AuthService, useValue: mockAuthService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TeamComponent);
    component = fixture.componentInstance;
    vi.clearAllMocks();
    mockCurrentUser.set({
      userId: 'usr_owner1',
      email: 'owner@test.com',
      tenantId: 'tnt_1',
      role: 'TENANT_OWNER',
    });
    mockInvitationService.getInvitations.mockReturnValue(of({ status: 'success', data: [] }));
    mockInvitationService.revokeInvitation.mockReturnValue(of({ status: 'success', data: { message: 'ok' } }));
    mockTeamMembersService.getMembers.mockReturnValue(of({ status: 'success', data: [] }));
    mockTeamMembersService.removeMember.mockReturnValue(of({ status: 'success', data: null, message: 'Member removed' }));
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load members and invitations on init', () => {
    const mockMembers = [
      {
        id: 'usr_1',
        email: 'owner@test.com',
        name: 'Owner',
        role: 'TENANT_OWNER',
        department: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'usr_2',
        email: 'member@test.com',
        name: 'Member',
        role: 'MEMBER',
        department: 'FINANCE',
        createdAt: '2024-02-01T00:00:00.000Z',
      },
    ];

    mockTeamMembersService.getMembers.mockReturnValue(
      of({ status: 'success', data: mockMembers })
    );

    fixture.detectChanges();

    expect(mockTeamMembersService.getMembers).toHaveBeenCalled();
    expect(mockInvitationService.getInvitations).toHaveBeenCalled();
    expect(component.members$().length).toBe(2);
    expect(component.isLoading$()).toBe(false);
  });

  it('should render active members list', () => {
    mockTeamMembersService.getMembers.mockReturnValue(
      of({
        status: 'success',
        data: [
          {
            id: 'usr_1',
            email: 'owner@test.com',
            name: 'Owner',
            role: 'TENANT_OWNER',
            department: null,
            createdAt: '2024-01-01T00:00:00.000Z',
          },
        ],
      })
    );

    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('Active Members');
    expect(compiled.textContent).toContain('Owner');
    expect(compiled.textContent).toContain('owner@test.com');
  });

  it('should show remove button only for non-owner members when current user is TENANT_OWNER', () => {
    expect(
      component.canRemoveMember({
        id: 'usr_2',
        email: 'member@test.com',
        name: 'Member',
        role: 'MEMBER',
        department: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      })
    ).toBe(true);

    expect(
      component.canRemoveMember({
        id: 'usr_1',
        email: 'owner@test.com',
        name: 'Owner',
        role: 'TENANT_OWNER',
        department: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      })
    ).toBe(false);
  });

  it('should hide remove button for ADMIN users', () => {
    mockCurrentUser.set({
      userId: 'usr_admin1',
      email: 'admin@test.com',
      tenantId: 'tnt_1',
      role: 'ADMIN',
    });

    expect(
      component.canRemoveMember({
        id: 'usr_2',
        email: 'member@test.com',
        name: 'Member',
        role: 'MEMBER',
        department: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      })
    ).toBe(false);
  });

  it('should open remove dialog when openRemoveDialog is called', () => {
    const member = {
      id: 'usr_2',
      email: 'member@test.com',
      name: 'Member',
      role: 'MEMBER',
      department: null,
      createdAt: '2024-01-01T00:00:00.000Z',
    };

    component.openRemoveDialog(member);
    expect(component.memberToRemove$()).toEqual(member);
    expect(component.removalError$()).toBe('');
  });

  it('should close remove dialog and call service on removal', () => {
    const member = {
      id: 'usr_2',
      email: 'member@test.com',
      name: 'Member',
      role: 'MEMBER',
      department: null,
      createdAt: '2024-01-01T00:00:00.000Z',
    };

    component.memberToRemove$.set(member);
    fixture.detectChanges();

    component.onRemoveDialogClose('REASSIGN');

    expect(mockTeamMembersService.removeMember).toHaveBeenCalledWith(
      'usr_2',
      'REASSIGN'
    );
  });

  it('should close remove dialog without action on cancel', () => {
    const member = {
      id: 'usr_2',
      email: 'member@test.com',
      name: 'Member',
      role: 'MEMBER',
      department: null,
      createdAt: '2024-01-01T00:00:00.000Z',
    };

    component.memberToRemove$.set(member);
    component.onRemoveDialogClose(false);

    expect(component.memberToRemove$()).toBeNull();
    expect(mockTeamMembersService.removeMember).not.toHaveBeenCalled();
  });

  it('should set removalError on removal API failure and keep dialog open', () => {
    const member = {
      id: 'usr_2',
      email: 'member@test.com',
      name: 'Member',
      role: 'MEMBER',
      department: null,
      createdAt: '2024-01-01T00:00:00.000Z',
    };

    mockTeamMembersService.removeMember.mockReturnValue(
      throwError(() => new Error('You cannot remove yourself. Designate a backup Owner first.'))
    );

    component.memberToRemove$.set(member);
    fixture.detectChanges();

    component.onRemoveDialogClose('REASSIGN');

    expect(component.removalError$()).toBe(
      'You cannot remove yourself. Designate a backup Owner first.'
    );
    // Dialog should remain open (memberToRemove$ not cleared)
    expect(component.memberToRemove$()).toEqual(member);
  });

  it('should load invitations on init', () => {
    mockInvitationService.getInvitations.mockReturnValue(
      of({
        status: 'success',
        data: [
          {
            id: 'inv_1',
            email: 'a@b.com',
            department: 'TECH',
            role: 'MEMBER',
            status: 'PENDING',
            token: 't',
            expiresAt: new Date(Date.now() + 86400000).toISOString(),
            tenantId: 'tnt_1',
            invitedById: 'usr_1',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
      })
    );

    fixture.detectChanges();

    expect(mockInvitationService.getInvitations).toHaveBeenCalled();
    expect(component.allInvitations$().length).toBe(1);
    expect(component.pendingInvitations$().length).toBe(1);
  });

  it('should show empty state when no members and no invitations', () => {
    fixture.detectChanges();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.textContent).toContain('No team members yet');
  });

  it('should toggle invite dialog', () => {
    expect(component.showInviteDialog$()).toBe(false);
    component.showInviteDialog$.set(true);
    expect(component.showInviteDialog$()).toBe(true);
  });

  it('should close invite dialog and reload on successful creation', () => {
    component.showInviteDialog$.set(true);
    component.onInviteDialogClose(true);

    expect(component.showInviteDialog$()).toBe(false);
    expect(mockInvitationService.getInvitations).toHaveBeenCalled();
  });

  it('should format expiry correctly', () => {
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    expect(component.formatExpiry(tomorrow)).toBe('in 1 day');

    const yesterday = new Date(Date.now() - 86400000).toISOString();
    expect(component.formatExpiry(yesterday)).toBe('expired');
  });

  it('should get initials from name', () => {
    expect(component.getInitials('John Doe', 'john@test.com')).toBe('JD');
    expect(component.getInitials(null, 'john@test.com')).toBe('J');
  });

  it('should format role display names', () => {
    expect(component.formatRole('TENANT_OWNER')).toBe('Owner');
    expect(component.formatRole('ADMIN')).toBe('Admin');
    expect(component.formatRole('MEMBER')).toBe('Member');
  });
});
