import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TenantDeletionService } from './tenant-deletion.service';
import type { TenantStatus } from '@mentor-ai/shared/types';

describe('TenantDeletionService', () => {
  let service: TenantDeletionService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        TenantDeletionService,
      ],
    });

    service = TestBed.inject(TenantDeletionService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('requestDeletion', () => {
    it('should POST to request deletion with workspace name', () => {
      const mockResponse = {
        data: {
          status: 'PENDING_DELETION' as TenantStatus,
          requestedAt: '2024-06-01T10:00:00.000Z',
          gracePeriodEndsAt: '2024-06-08T10:00:00.000Z',
          estimatedCompletionBy: '2024-07-01T10:00:00.000Z',
          canCancel: true,
        },
        message: 'Workspace deletion initiated. You have 7 days to cancel.',
      };

      service.requestDeletion('Test Workspace').subscribe((response) => {
        expect(response.data.status).toBe('PENDING_DELETION');
        expect(response.data.canCancel).toBe(true);
        expect(response.message).toContain('7 days');
      });

      const req = httpMock.expectOne('/api/v1/tenant/deletion');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ workspaceName: 'Test Workspace' });
      req.flush(mockResponse);
    });

    it('should handle type-to-confirm validation error', () => {
      let errorReceived = false;

      service.requestDeletion('Wrong Name').subscribe({
        error: () => {
          errorReceived = true;
        },
      });

      const req = httpMock.expectOne('/api/v1/tenant/deletion');
      req.flush(
        {
          type: 'workspace_name_mismatch',
          title: 'Confirmation Failed',
          status: 400,
          detail: 'The workspace name you entered does not match.',
        },
        { status: 400, statusText: 'Bad Request' }
      );

      expect(errorReceived).toBe(true);
    });
  });

  describe('cancelDeletion', () => {
    it('should POST to cancel deletion', () => {
      const mockResponse = {
        data: {
          status: 'ACTIVE' as TenantStatus,
          requestedAt: null,
          gracePeriodEndsAt: null,
          estimatedCompletionBy: null,
          canCancel: false,
        },
        message: 'Workspace deletion cancelled. Your workspace has been restored.',
      };

      service.cancelDeletion().subscribe((response) => {
        expect(response.data.status).toBe('ACTIVE');
        expect(response.data.canCancel).toBe(false);
      });

      const req = httpMock.expectOne('/api/v1/tenant/deletion/cancel');
      expect(req.request.method).toBe('POST');
      req.flush(mockResponse);
    });

    it('should handle grace period expired error', () => {
      let errorReceived = false;

      service.cancelDeletion().subscribe({
        error: () => {
          errorReceived = true;
        },
      });

      const req = httpMock.expectOne('/api/v1/tenant/deletion/cancel');
      req.flush(
        {
          type: 'grace_period_expired',
          title: 'Cannot Cancel Deletion',
          status: 410,
          detail: 'The 7-day grace period has expired.',
        },
        { status: 410, statusText: 'Gone' }
      );

      expect(errorReceived).toBe(true);
    });
  });

  describe('getDeletionStatus', () => {
    it('should GET current deletion status for pending deletion', () => {
      const mockResponse = {
        data: {
          status: 'PENDING_DELETION' as TenantStatus,
          requestedAt: '2024-06-01T10:00:00.000Z',
          gracePeriodEndsAt: '2024-06-05T10:00:00.000Z',
          estimatedCompletionBy: '2024-07-01T10:00:00.000Z',
          canCancel: true,
        },
      };

      service.getDeletionStatus().subscribe((response) => {
        expect(response.data.status).toBe('PENDING_DELETION');
        expect(response.data.canCancel).toBe(true);
        expect(response.data.gracePeriodEndsAt).toBeDefined();
      });

      const req = httpMock.expectOne('/api/v1/tenant/deletion/status');
      expect(req.request.method).toBe('GET');
      req.flush(mockResponse);
    });

    it('should GET deletion status for active tenant', () => {
      const mockResponse = {
        data: {
          status: 'ACTIVE' as TenantStatus,
          requestedAt: null,
          gracePeriodEndsAt: null,
          estimatedCompletionBy: null,
          canCancel: false,
        },
      };

      service.getDeletionStatus().subscribe((response) => {
        expect(response.data.status).toBe('ACTIVE');
        expect(response.data.requestedAt).toBeNull();
        expect(response.data.canCancel).toBe(false);
      });

      const req = httpMock.expectOne('/api/v1/tenant/deletion/status');
      expect(req.request.method).toBe('GET');
      req.flush(mockResponse);
    });
  });
});
