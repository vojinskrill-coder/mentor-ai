import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ExportSectionComponent } from './export-section.component';
import { DataExportService } from '../services/data-export.service';
import { ExportFormat, ExportStatus } from '@mentor-ai/shared/types';
import { of, throwError } from 'rxjs';

describe('ExportSectionComponent', () => {
  let fixture: ComponentFixture<ExportSectionComponent>;
  let component: ExportSectionComponent;

  const mockDataExportService = {
    requestExport: vi.fn(),
    getExportStatus: vi.fn(),
    getDownloadUrl: vi.fn(),
  };

  beforeEach(async () => {
    mockDataExportService.getExportStatus.mockReturnValue(of({ data: [] }));
    mockDataExportService.requestExport.mockReturnValue(
      of({ data: { exportId: 'exp_1', status: 'PENDING' } })
    );

    await TestBed.configureTestingModule({
      imports: [ExportSectionComponent],
      providers: [
        { provide: DataExportService, useValue: mockDataExportService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(ExportSectionComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should render the section title', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Export My Data');
  });

  it('should load exports on init', () => {
    expect(mockDataExportService.getExportStatus).toHaveBeenCalled();
  });

  it('should default to JSON format', () => {
    expect(component.selectedFormat$()).toBe('JSON');
  });

  it('should default to all data types', () => {
    expect(component.selectedDataTypes$()).toEqual(['all']);
  });

  describe('toggleDataType', () => {
    it('should set to "all" when clicking all', () => {
      component.selectedDataTypes$.set(['profile']);
      component.toggleDataType('all');
      expect(component.selectedDataTypes$()).toEqual(['all']);
    });

    it('should remove "all" when selecting a specific type', () => {
      component.toggleDataType('profile');
      expect(component.selectedDataTypes$()).toEqual(['profile']);
    });

    it('should toggle specific types off', () => {
      component.selectedDataTypes$.set(['profile', 'invitations']);
      component.toggleDataType('profile');
      expect(component.selectedDataTypes$()).toEqual(['invitations']);
    });

    it('should revert to "all" when all specific types are deselected', () => {
      component.selectedDataTypes$.set(['profile']);
      component.toggleDataType('profile');
      expect(component.selectedDataTypes$()).toEqual(['all']);
    });
  });

  describe('isDataTypeSelected', () => {
    it('should return true for "all" by default', () => {
      expect(component.isDataTypeSelected('all')).toBe(true);
    });

    it('should return false for non-selected types', () => {
      expect(component.isDataTypeSelected('invitations')).toBe(false);
    });
  });

  describe('onExport', () => {
    it('should call requestExport and reload exports on success', () => {
      component.onExport();

      expect(mockDataExportService.requestExport).toHaveBeenCalledWith({
        format: 'JSON',
        dataTypes: ['all'],
      });
      expect(component.isExporting$()).toBe(false);
    });

    it('should set error message on failure', () => {
      mockDataExportService.requestExport.mockReturnValue(
        throwError(() => new Error('Rate limit exceeded'))
      );

      component.onExport();

      expect(component.errorMessage$()).toBe('Rate limit exceeded');
      expect(component.isExporting$()).toBe(false);
    });
  });

  describe('getFormatIcon', () => {
    it('should return correct icon for JSON', () => {
      expect(component.getFormatIcon('JSON')).toBe('lucideFileJson');
    });

    it('should return correct icon for MARKDOWN', () => {
      expect(component.getFormatIcon('MARKDOWN')).toBe('lucideFileText');
    });

    it('should return correct icon for PDF', () => {
      expect(component.getFormatIcon('PDF')).toBe('lucideFile');
    });

    it('should return default icon for unknown format', () => {
      expect(component.getFormatIcon('UNKNOWN')).toBe('lucideFile');
    });
  });

  describe('formatDate', () => {
    it('should format date string correctly', () => {
      const result = component.formatDate('2025-06-15T14:30:00.000Z');
      expect(result).toBeTruthy();
      expect(typeof result).toBe('string');
    });
  });

  describe('formatSize', () => {
    it('should format bytes', () => {
      expect(component.formatSize(500)).toBe('500 B');
    });

    it('should format kilobytes', () => {
      expect(component.formatSize(2048)).toBe('2.0 KB');
    });

    it('should format megabytes', () => {
      expect(component.formatSize(1048576)).toBe('1.0 MB');
    });
  });

  describe('export history rendering', () => {
    it('should display exports when available', () => {
      component.exports$.set([
        {
          exportId: 'exp_1',
          status: ExportStatus.COMPLETED,
          format: ExportFormat.JSON,
          dataTypes: ['all'],
          fileSize: 2048,
          requestedAt: '2025-01-15T10:00:00.000Z',
          completedAt: '2025-01-15T10:01:00.000Z',
          expiresAt: '2025-01-16T10:00:00.000Z',
          downloadUrl: '/api/v1/data-export/exp_1/download',
        },
      ]);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.textContent).toContain('Export History');
      expect(el.textContent).toContain('JSON');
      expect(el.textContent).toContain('Ready');
      expect(el.textContent).toContain('Download');
    });

    it('should not display export history when empty', () => {
      component.exports$.set([]);
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.textContent).not.toContain('Export History');
    });
  });
});
