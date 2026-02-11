import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { InvitationService } from './invitation.service';

describe('InvitationService (Frontend)', () => {
  let service: InvitationService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        InvitationService,
      ],
    });

    service = TestBed.inject(InvitationService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should POST to create invitation', () => {
    const dto = { email: 'test@example.com', department: 'TECHNOLOGY' };
    service.createInvitation(dto).subscribe();

    const req = httpMock.expectOne('/api/invitations');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(dto);
    req.flush({ status: 'success', data: {} });
  });

  it('should GET invitations list', () => {
    service.getInvitations().subscribe();

    const req = httpMock.expectOne('/api/invitations');
    expect(req.request.method).toBe('GET');
    req.flush({ status: 'success', data: [] });
  });

  it('should POST to revoke invitation', () => {
    service.revokeInvitation('inv_123').subscribe();

    const req = httpMock.expectOne('/api/invitations/inv_123/revoke');
    expect(req.request.method).toBe('POST');
    req.flush({ status: 'success', data: { message: 'Revoked' } });
  });

  it('should GET to validate token', () => {
    service.validateToken('abc123').subscribe();

    const req = httpMock.expectOne('/api/invitations/validate/abc123');
    expect(req.request.method).toBe('GET');
    req.flush({ status: 'success', data: {} });
  });

  it('should POST to accept invitation', () => {
    service.acceptInvitation('abc123').subscribe();

    const req = httpMock.expectOne('/api/invitations/accept/abc123');
    expect(req.request.method).toBe('POST');
    req.flush({ status: 'success', data: {} });
  });

  it('should transform HTTP errors to user-friendly messages', () => {
    let errorMessage = '';
    service.createInvitation({ email: 'x@y.com', department: 'TECH' }).subscribe({
      error: (err: Error) => {
        errorMessage = err.message;
      },
    });

    const req = httpMock.expectOne('/api/invitations');
    req.flush(
      { type: 'duplicate_invitation', title: 'Duplicate', status: 409, detail: 'Already invited' },
      { status: 409, statusText: 'Conflict' }
    );

    expect(errorMessage).toBe('Already invited');
  });
});
