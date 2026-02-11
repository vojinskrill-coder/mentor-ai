import { TestBed } from '@angular/core/testing';
import {
  provideHttpClient,
  withInterceptorsFromDi,
} from '@angular/common/http';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { ExportFormat } from '@mentor-ai/shared/types';
import { DataExportService } from './data-export.service';

describe('DataExportService (Frontend)', () => {
  let service: DataExportService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        DataExportService,
        provideHttpClient(withInterceptorsFromDi()),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(DataExportService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('requestExport', () => {
    it('should POST to /api/v1/data-export with the request body', () => {
      const dto = { format: ExportFormat.JSON, dataTypes: ['all'] };
      const mockResponse = {
        data: {
          exportId: 'exp_1',
          status: 'PENDING',
          format: 'JSON',
          dataTypes: ['all'],
        },
      };

      service.requestExport(dto).subscribe((res) => {
        expect(res.data).toBeDefined();
      });

      const req = httpMock.expectOne('/api/v1/data-export');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(dto);
      req.flush(mockResponse);
    });
  });

  describe('getExportStatus', () => {
    it('should GET /api/v1/data-export/status', () => {
      const mockResponse = { data: [] };

      service.getExportStatus().subscribe((res) => {
        expect(res.data).toEqual([]);
      });

      const req = httpMock.expectOne('/api/v1/data-export/status');
      expect(req.request.method).toBe('GET');
      req.flush(mockResponse);
    });

    it('should return export list with data', () => {
      const mockResponse = {
        data: [
          {
            exportId: 'exp_1',
            status: 'COMPLETED',
            format: 'JSON',
          },
        ],
      };

      service.getExportStatus().subscribe((res) => {
        expect(res.data).toHaveLength(1);
        expect(res.data[0]!.exportId).toBe('exp_1');
      });

      const req = httpMock.expectOne('/api/v1/data-export/status');
      req.flush(mockResponse);
    });
  });

  describe('getDownloadUrl', () => {
    it('should return the correct download URL', () => {
      expect(service.getDownloadUrl('exp_123')).toBe(
        '/api/v1/data-export/exp_123/download'
      );
    });
  });
});
