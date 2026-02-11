import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { BackupOwnerService } from './backup-owner.service';

describe('BackupOwnerService', () => {
  let service: BackupOwnerService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        BackupOwnerService,
      ],
    });

    service = TestBed.inject(BackupOwnerService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  it('should GET backup owner', () => {
    const mockBackupOwner = {
      id: 'usr_1',
      email: 'backup@test.com',
      name: 'Backup',
      designatedAt: '2024-06-01T00:00:00.000Z',
    };

    service.getBackupOwner().subscribe((response) => {
      expect(response.status).toBe('success');
      expect(response.data).toEqual(mockBackupOwner);
    });

    const req = httpMock.expectOne('/api/team/backup-owner');
    expect(req.request.method).toBe('GET');
    req.flush({ status: 'success', data: mockBackupOwner });
  });

  it('should GET eligible members', () => {
    const mockMembers = [
      {
        id: 'usr_2',
        email: 'member@test.com',
        name: 'Member',
        role: 'MEMBER',
        department: 'FINANCE',
        createdAt: '2024-01-01T00:00:00.000Z',
      },
    ];

    service.getEligibleMembers().subscribe((response) => {
      expect(response.status).toBe('success');
      expect(response.data).toEqual(mockMembers);
    });

    const req = httpMock.expectOne('/api/team/backup-owner/eligible');
    expect(req.request.method).toBe('GET');
    req.flush({ status: 'success', data: mockMembers });
  });

  it('should POST to designate backup owner', () => {
    const mockResult = {
      id: 'usr_2',
      email: 'member@test.com',
      name: 'Member',
      designatedAt: '2024-06-01T00:00:00.000Z',
    };

    service.designateBackupOwner('usr_2').subscribe((response) => {
      expect(response.status).toBe('success');
      expect(response.data).toEqual(mockResult);
    });

    const req = httpMock.expectOne('/api/team/backup-owner');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ backupOwnerId: 'usr_2' });
    req.flush({ status: 'success', data: mockResult, message: 'Backup owner designated' });
  });

  it('should DELETE backup owner', () => {
    service.removeBackupOwner().subscribe((response) => {
      expect(response.status).toBe('success');
    });

    const req = httpMock.expectOne('/api/team/backup-owner');
    expect(req.request.method).toBe('DELETE');
    req.flush({ status: 'success', data: null, message: 'Backup owner removed' });
  });

  it('should GET backup owner status', () => {
    const mockStatus = {
      hasBackupOwner: false,
      tenantAgeDays: 45,
      showWarning: true,
    };

    service.getBackupOwnerStatus().subscribe((response) => {
      expect(response.status).toBe('success');
      expect(response.data).toEqual(mockStatus);
    });

    const req = httpMock.expectOne('/api/team/backup-owner/status');
    expect(req.request.method).toBe('GET');
    req.flush({ status: 'success', data: mockStatus });
  });

  it('should transform HTTP errors to user-friendly messages', () => {
    let errorMessage = '';
    service.designateBackupOwner('usr_owner').subscribe({
      error: (err: Error) => {
        errorMessage = err.message;
      },
    });

    const req = httpMock.expectOne('/api/team/backup-owner');
    req.flush(
      {
        type: 'invalid_backup_candidate',
        title: 'Invalid Backup Owner Candidate',
        status: 400,
        detail: 'A Tenant Owner cannot be designated as backup owner.',
      },
      { status: 400, statusText: 'Bad Request' }
    );

    expect(errorMessage).toBe(
      'A Tenant Owner cannot be designated as backup owner.'
    );
  });
});
