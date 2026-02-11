import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { signal } from '@angular/core';
import { InviteAcceptComponent } from './invite-accept.component';
import { InvitationService } from '../team/services/invitation.service';
import { AuthService } from '../core/auth/auth.service';

describe('InviteAcceptComponent', () => {
  let component: InviteAcceptComponent;
  let fixture: ComponentFixture<InviteAcceptComponent>;

  const mockInvitationService = {
    validateToken: vi.fn(),
    acceptInvitation: vi.fn(),
  };

  const mockAuthService = {
    isAuthenticated$: signal(false),
    login: vi.fn(),
  };

  const mockRouter = {
    navigate: vi.fn(),
  };

  function createComponent(token = 'test-token') {
    TestBed.configureTestingModule({
      imports: [InviteAcceptComponent],
      providers: [
        { provide: InvitationService, useValue: mockInvitationService },
        { provide: AuthService, useValue: mockAuthService },
        { provide: Router, useValue: mockRouter },
        {
          provide: ActivatedRoute,
          useValue: {
            snapshot: { paramMap: { get: () => token } },
          },
        },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(InviteAcceptComponent);
    component = fixture.componentInstance;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthService.isAuthenticated$ = signal(false);
  });

  it('should create', () => {
    mockInvitationService.validateToken.mockReturnValue(
      of({ status: 'success', data: { tenantName: 'Test', department: 'TECH', role: 'MEMBER', expiresAt: '' } })
    );
    createComponent();
    fixture.detectChanges();
    expect(component).toBeTruthy();
  });

  it('should show error when no token provided', () => {
    createComponent('');
    fixture.detectChanges();

    expect(component.state$()).toBe('error');
    expect(component.errorMessage$()).toBe('No invitation token provided.');
  });

  it('should validate token on init', () => {
    const tokenData = {
      tenantName: 'Test Corp',
      department: 'TECHNOLOGY',
      role: 'MEMBER',
      expiresAt: new Date().toISOString(),
    };
    mockInvitationService.validateToken.mockReturnValue(
      of({ status: 'success', data: tokenData })
    );

    createComponent('valid-token');
    fixture.detectChanges();

    expect(mockInvitationService.validateToken).toHaveBeenCalledWith('valid-token');
    expect(component.state$()).toBe('valid');
    expect(component.invitation$()?.tenantName).toBe('Test Corp');
  });

  it('should show error on invalid token', () => {
    mockInvitationService.validateToken.mockReturnValue(
      throwError(() => new Error('Invitation expired'))
    );

    createComponent('bad-token');
    fixture.detectChanges();

    expect(component.state$()).toBe('error');
    expect(component.errorMessage$()).toBe('Invitation expired');
  });

  it('should call login with returnTo when not authenticated', () => {
    mockInvitationService.validateToken.mockReturnValue(
      of({ status: 'success', data: { tenantName: 'Test', department: 'TECH', role: 'MEMBER', expiresAt: '' } })
    );

    createComponent('my-token');
    fixture.detectChanges();

    component.login();

    expect(mockAuthService.login).toHaveBeenCalledWith('/invite/my-token');
  });

  it('should accept invitation and set accepted state', () => {
    mockInvitationService.validateToken.mockReturnValue(
      of({ status: 'success', data: { tenantName: 'Test', department: 'TECH', role: 'MEMBER', expiresAt: '' } })
    );
    mockInvitationService.acceptInvitation.mockReturnValue(
      of({ status: 'success', data: { tenantId: 'tnt_1', role: 'MEMBER', department: 'TECH' } })
    );

    createComponent('token-abc');
    fixture.detectChanges();

    component.acceptInvitation();

    expect(component.state$()).toBe('accepted');
  });
});
