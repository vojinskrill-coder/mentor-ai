import { Component, DestroyRef, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { timer, switchMap, takeWhile } from 'rxjs';
import { DataExportService } from '../services/data-export.service';
import type { DataExportResponse, DataExportRequest, ExportFormat } from '@mentor-ai/shared/types';

@Component({
  selector: 'app-export-section',
  standalone: true,
  styles: [
    `
      .section-card {
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 12px;
        padding: 24px;
      }
      .section-header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 8px;
      }
      .section-header svg {
        width: 20px;
        height: 20px;
        color: #3b82f6;
        flex-shrink: 0;
      }
      .section-title {
        font-size: 16px;
        font-weight: 600;
      }
      .section-desc {
        font-size: 14px;
        color: #9e9e9e;
        line-height: 1.5;
        margin-bottom: 24px;
      }

      /* Form fields */
      .field-label {
        font-size: 13px;
        font-weight: 500;
        margin-bottom: 8px;
        display: block;
      }
      .radio-group,
      .checkbox-group {
        display: flex;
        gap: 20px;
        flex-wrap: wrap;
        margin-bottom: 20px;
      }
      .radio-item,
      .checkbox-item {
        display: flex;
        align-items: center;
        gap: 8px;
        cursor: pointer;
        font-size: 14px;
      }
      .radio-item input,
      .checkbox-item input {
        accent-color: #3b82f6;
        cursor: pointer;
      }
      .fmt-icon {
        width: 16px;
        height: 16px;
        color: #9e9e9e;
      }

      /* Export button */
      .export-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 10px 20px;
        border-radius: 8px;
        border: none;
        background: #3b82f6;
        color: white;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        font-family: inherit;
        transition: background 0.15s;
      }
      .export-btn:hover:not(:disabled) {
        background: #2563eb;
      }
      .export-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .export-btn svg {
        width: 16px;
        height: 16px;
      }

      /* Spinner */
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      .btn-spinner {
        width: 16px;
        height: 16px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-top-color: white;
        border-radius: 50%;
        animation: spin 0.6s linear infinite;
      }

      /* Error */
      .error-banner {
        margin-top: 16px;
        padding: 12px;
        border-radius: 8px;
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.2);
        color: #f87171;
        font-size: 13px;
      }

      /* Export history */
      .history-section {
        margin-top: 24px;
      }
      .history-title {
        font-size: 14px;
        font-weight: 500;
        margin-bottom: 12px;
      }
      .history-list {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .history-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px;
        border-radius: 8px;
        border: 1px solid #2a2a2a;
        background: #0d0d0d;
      }
      .history-left {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .history-icon {
        width: 20px;
        height: 20px;
        color: #9e9e9e;
      }
      .history-format {
        font-size: 14px;
        font-weight: 500;
      }
      .history-meta {
        font-size: 12px;
        color: #9e9e9e;
        margin-top: 2px;
      }
      .history-right {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      /* Status badges */
      .status-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        font-size: 12px;
        font-weight: 500;
      }
      .status-badge svg {
        width: 14px;
        height: 14px;
      }
      .status-completed {
        color: #4ade80;
      }
      .status-pending {
        color: #fbbf24;
      }
      .status-processing {
        color: #60a5fa;
      }
      .status-failed {
        color: #f87171;
      }
      .status-expired {
        color: #9e9e9e;
      }

      /* Download button */
      .download-btn {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 6px 14px;
        border-radius: 6px;
        border: none;
        background: #3b82f6;
        color: white;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        font-family: inherit;
        text-decoration: none;
      }
      .download-btn:hover {
        background: #2563eb;
      }

      .processing-spinner {
        width: 14px;
        height: 14px;
        border: 2px solid rgba(96, 165, 250, 0.3);
        border-top-color: #60a5fa;
        border-radius: 50%;
        animation: spin 0.6s linear infinite;
      }
    `,
  ],
  template: `
    <section class="section-card">
      <div class="section-header">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
            d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        <h2 class="section-title">Izvoz podataka</h2>
      </div>
      <p class="section-desc">
        Preuzmite kopiju vaših podataka za usklađenost ili migraciju. Fajlovi su šifrovani i dostupni 24 sata.
      </p>

      <!-- Format -->
      <label class="field-label">Format</label>
      <div class="radio-group">
        @for (fmt of formats; track fmt.value) {
          <label class="radio-item">
            <input type="radio" name="format" [value]="fmt.value"
              [checked]="selectedFormat$() === fmt.value"
              (change)="selectedFormat$.set(fmt.value)" />
            {{ fmt.label }}
          </label>
        }
      </div>

      <!-- Data types -->
      <label class="field-label">Podaci za uključivanje</label>
      <div class="checkbox-group">
        @for (dt of dataTypeOptions; track dt.value) {
          <label class="checkbox-item">
            <input type="checkbox"
              [checked]="isDataTypeSelected(dt.value)"
              (change)="toggleDataType(dt.value)" />
            {{ dt.label }}
          </label>
        }
      </div>

      <!-- Export button -->
      <button class="export-btn" (click)="onExport()" [disabled]="isExporting$()">
        @if (isExporting$()) {
          <span class="btn-spinner"></span>
          Izvoz u toku...
        } @else {
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          Izvezi podatke
        }
      </button>

      @if (errorMessage$()) {
        <div class="error-banner">{{ errorMessage$() }}</div>
      }

      <!-- Export history -->
      @if (exports$().length > 0) {
        <div class="history-section">
          <h3 class="history-title">Istorija izvoza</h3>
          <div class="history-list">
            @for (exp of exports$(); track exp.exportId) {
              <div class="history-item">
                <div class="history-left">
                  <svg class="history-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                      d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <div>
                    <div class="history-format">{{ exp.format }}</div>
                    <div class="history-meta">
                      {{ formatDate(exp.requestedAt) }}
                      @if (exp.fileSize) {
                        · {{ formatSize(exp.fileSize) }}
                      }
                    </div>
                  </div>
                </div>
                <div class="history-right">
                  @switch (exp.status) {
                    @case ('COMPLETED') {
                      <span class="status-badge status-completed">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Spremno
                      </span>
                      <a [href]="exp.downloadUrl" class="download-btn">Preuzmi</a>
                    }
                    @case ('PENDING') {
                      <span class="status-badge status-pending">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                        </svg>
                        Na čekanju
                      </span>
                    }
                    @case ('PROCESSING') {
                      <span class="status-badge status-processing">
                        <span class="processing-spinner"></span>
                        Obrada...
                      </span>
                    }
                    @case ('FAILED') {
                      <span class="status-badge status-failed">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        Neuspelo
                      </span>
                    }
                    @case ('EXPIRED') {
                      <span class="status-badge status-expired">Isteklo</span>
                    }
                  }
                </div>
              </div>
            }
          </div>
        </div>
      }
    </section>
  `,
})
export class ExportSectionComponent implements OnInit, OnDestroy {
  private readonly exportService = inject(DataExportService);
  private readonly destroyRef = inject(DestroyRef);

  readonly selectedFormat$ = signal<string>('JSON');
  readonly selectedDataTypes$ = signal<string[]>(['all']);
  readonly isExporting$ = signal(false);
  readonly exports$ = signal<DataExportResponse[]>([]);
  readonly errorMessage$ = signal('');
  private pollingActive = false;

  readonly formats = [
    { value: 'JSON', label: 'JSON' },
    { value: 'MARKDOWN', label: 'Markdown' },
    { value: 'PDF', label: 'PDF' },
  ];

  readonly dataTypeOptions = [
    { value: 'all', label: 'Svi podaci' },
    { value: 'profile', label: 'Profil' },
    { value: 'invitations', label: 'Pozivi' },
  ];

  ngOnInit(): void {
    this.loadExports();
  }

  ngOnDestroy(): void {
    this.pollingActive = false;
  }

  isDataTypeSelected(value: string): boolean {
    return this.selectedDataTypes$().includes(value);
  }

  toggleDataType(value: string): void {
    const current = this.selectedDataTypes$();
    if (value === 'all') {
      this.selectedDataTypes$.set(['all']);
      return;
    }
    const withoutAll = current.filter((t) => t !== 'all');
    if (withoutAll.includes(value)) {
      const filtered = withoutAll.filter((t) => t !== value);
      this.selectedDataTypes$.set(filtered.length > 0 ? filtered : ['all']);
    } else {
      this.selectedDataTypes$.set([...withoutAll, value]);
    }
  }

  onExport(): void {
    this.isExporting$.set(true);
    this.errorMessage$.set('');

    const request: DataExportRequest = {
      format: this.selectedFormat$() as ExportFormat,
      dataTypes: this.selectedDataTypes$(),
    };

    this.exportService
      .requestExport(request)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isExporting$.set(false);
          this.loadExports();
          this.startPolling();
        },
        error: (err: Error) => {
          this.errorMessage$.set(err.message);
          this.isExporting$.set(false);
        },
      });
  }

  private loadExports(): void {
    this.exportService
      .getExportStatus()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.exports$.set(res.data);
        },
        error: (err: Error) => {
          this.errorMessage$.set(err.message);
        },
      });
  }

  private startPolling(): void {
    if (this.pollingActive) return;
    this.pollingActive = true;

    timer(5000, 5000)
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        takeWhile(() => this.pollingActive),
        switchMap(() => this.exportService.getExportStatus())
      )
      .subscribe({
        next: (res) => {
          this.exports$.set(res.data);
          const hasActive = res.data.some(
            (e) => e.status === 'PENDING' || e.status === 'PROCESSING'
          );
          if (!hasActive) {
            this.pollingActive = false;
          }
        },
      });
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('sr-Latn', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  }

  formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}
