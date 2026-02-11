import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ProfileSettingsComponent } from './profile-settings.component';
import { ExportSectionComponent } from './export-section/export-section.component';
import { DataExportService } from './services/data-export.service';
import { of } from 'rxjs';

describe('ProfileSettingsComponent', () => {
  let fixture: ComponentFixture<ProfileSettingsComponent>;
  let component: ProfileSettingsComponent;

  const mockDataExportService = {
    requestExport: vi.fn().mockReturnValue(of({})),
    getExportStatus: vi.fn().mockReturnValue(of({ data: [] })),
    getDownloadUrl: vi.fn().mockReturnValue('/api/v1/data-export/exp_1/download'),
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProfileSettingsComponent],
      providers: [
        provideRouter([]),
        { provide: DataExportService, useValue: mockDataExportService },
      ],
    })
      .overrideComponent(ExportSectionComponent, {
        set: { template: '<div>Export Section Mock</div>', imports: [], providers: [] },
      })
      .compileComponents();

    fixture = TestBed.createComponent(ProfileSettingsComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create the component', () => {
    expect(component).toBeTruthy();
  });

  it('should render the page title', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Profile Settings');
  });

  it('should render the back link to dashboard', () => {
    const link = fixture.nativeElement.querySelector('a[href="/dashboard"]');
    expect(link).toBeTruthy();
  });

  it('should render the export section component', () => {
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('Export Section Mock');
  });
});
