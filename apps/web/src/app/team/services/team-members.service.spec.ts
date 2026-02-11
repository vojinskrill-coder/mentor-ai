import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TeamMembersService } from './team-members.service';

describe('TeamMembersService', () => {
  let service: TeamMembersService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        TeamMembersService,
      ],
    });

    service = TestBed.inject(TeamMembersService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should GET team members', () => {
    const mockMembers = [
      {
        id: 'usr_1',
        email: 'owner@test.com',
        name: 'Owner',
        role: 'TENANT_OWNER',
        department: null,
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ];

    service.getMembers().subscribe((response) => {
      expect(response.status).toBe('success');
      expect(response.data).toEqual(mockMembers);
    });

    const req = httpMock.expectOne('/api/team/members');
    expect(req.request.method).toBe('GET');
    req.flush({ status: 'success', data: mockMembers });
  });

  it('should POST to remove member with strategy', () => {
    service.removeMember('usr_member1', 'REASSIGN').subscribe((response) => {
      expect(response.status).toBe('success');
    });

    const req = httpMock.expectOne('/api/team/members/usr_member1/remove');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ strategy: 'REASSIGN' });
    req.flush({ status: 'success', message: 'Member removed' });
  });

  it('should POST to remove member with ARCHIVE strategy', () => {
    service.removeMember('usr_member1', 'ARCHIVE').subscribe();

    const req = httpMock.expectOne('/api/team/members/usr_member1/remove');
    expect(req.request.body).toEqual({ strategy: 'ARCHIVE' });
    req.flush({ status: 'success', message: 'Member removed' });
  });

  it('should transform HTTP errors to user-friendly messages', () => {
    let errorMessage = '';
    service.removeMember('usr_self', 'REASSIGN').subscribe({
      error: (err: Error) => {
        errorMessage = err.message;
      },
    });

    const req = httpMock.expectOne('/api/team/members/usr_self/remove');
    req.flush(
      {
        type: 'self_removal_denied',
        title: 'Cannot Remove Yourself',
        status: 403,
        detail:
          'You cannot remove yourself. Designate a backup Owner first.',
      },
      { status: 403, statusText: 'Forbidden' }
    );

    expect(errorMessage).toBe(
      'You cannot remove yourself. Designate a backup Owner first.'
    );
  });
});
