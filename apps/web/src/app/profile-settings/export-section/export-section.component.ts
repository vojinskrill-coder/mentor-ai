import { Component, DestroyRef, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { timer, switchMap, takeWhile } from 'rxjs';
import { BrnButton } from '@spartan-ng/brain/button';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideDownload,
  lucideLoader2,
  lucideFileJson,
  lucideFileText,
  lucideFile,
  lucideAlertTriangle,
  lucideCheckCircle,
  lucideClock,
  lucideShieldCheck,
} from '@ng-icons/lucide';
import { DataExportService } from '../services/data-export.service';
import type { DataExportResponse, DataExportRequest, ExportFormat } from '@mentor-ai/shared/types';

@Component({
  selector: 'app-export-section',
  standalone: true,
  imports: [CommonModule, BrnButton, NgIcon],
  providers: [
    provideIcons({
      lucideDownload,
      lucideLoader2,
      lucideFileJson,
      lucideFileText,
      lucideFile,
      lucideAlertTriangle,
      lucideCheckCircle,
      lucideClock,
      lucideShieldCheck,
    }),
  ],
  template: `
    <section class="rounded-lg border bg-card p-6">
      <div class="flex items-center gap-2 mb-4">
        <ng-icon name="lucideShieldCheck" class="h-5 w-5 text-primary" />
        <h2 class="text-lg font-semibold text-foreground">Export My Data</h2>
      </div>

      <p class="text-sm text-muted-foreground mb-6">
        Download a copy of your data for compliance or migration. Export files are encrypted
        at rest and available for 24 hours.
      </p>

      <!-- Format Selection -->
      <div class="mb-4">
        <label class="text-sm font-medium text-foreground mb-2 block">Format</label>
        <div class="flex gap-4">
          @for (fmt of formats; track fmt.value) {
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name="format"
                [value]="fmt.value"
                [checked]="selectedFormat$() === fmt.value"
                (change)="selectedFormat$.set(fmt.value)"
                class="accent-primary"
              />
              <ng-icon [name]="fmt.icon" class="h-4 w-4 text-muted-foreground" />
              <span class="text-sm text-foreground">{{ fmt.label }}</span>
            </label>
          }
        </div>
      </div>

      <!-- Data Type Selection -->
      <div class="mb-6">
        <label class="text-sm font-medium text-foreground mb-2 block">Data to include</label>
        <div class="flex gap-4">
          @for (dt of dataTypeOptions; track dt.value) {
            <label class="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                [checked]="isDataTypeSelected(dt.value)"
                (change)="toggleDataType(dt.value)"
                class="accent-primary"
              />
              <span class="text-sm text-foreground">{{ dt.label }}</span>
            </label>
          }
        </div>
      </div>

      <!-- Export Button -->
      <button
        brnButton
        (click)="onExport()"
        [disabled]="isExporting$()"
        class="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        @if (isExporting$()) {
          <ng-icon name="lucideLoader2" class="h-4 w-4 animate-spin" />
          Exporting...
        } @else {
          <ng-icon name="lucideDownload" class="h-4 w-4" />
          Export My Data
        }
      </button>

      <!-- Error Message -->
      @if (errorMessage$()) {
        <div class="mt-4 rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
          {{ errorMessage$() }}
        </div>
      }

      <!-- Export History -->
      @if (exports$().length > 0) {
        <div class="mt-6">
          <h3 class="text-sm font-medium text-foreground mb-3">Export History</h3>
          <div class="space-y-2">
            @for (exp of exports$(); track exp.exportId) {
              <div class="flex items-center justify-between rounded-md border p-3">
                <div class="flex items-center gap-3">
                  <ng-icon
                    [name]="getFormatIcon(exp.format)"
                    class="h-5 w-5 text-muted-foreground"
                  />
                  <div>
                    <p class="text-sm font-medium text-foreground">{{ exp.format }}</p>
                    <p class="text-xs text-muted-foreground">
                      {{ formatDate(exp.requestedAt) }}
                      @if (exp.fileSize) {
                        · {{ formatSize(exp.fileSize) }}
                      }
                    </p>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  @switch (exp.status) {
                    @case ('COMPLETED') {
                      <span class="inline-flex items-center gap-1 text-xs text-green-600">
                        <ng-icon name="lucideCheckCircle" class="h-3.5 w-3.5" />
                        Ready
                      </span>
                      <a
                        [href]="exp.downloadUrl"
                        class="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                      >
                        Download
                      </a>
                    }
                    @case ('PENDING') {
                      <span class="inline-flex items-center gap-1 text-xs text-amber-600">
                        <ng-icon name="lucideClock" class="h-3.5 w-3.5" />
                        Queued
                      </span>
                    }
                    @case ('PROCESSING') {
                      <span class="inline-flex items-center gap-1 text-xs text-blue-600">
                        <ng-icon name="lucideLoader2" class="h-3.5 w-3.5 animate-spin" />
                        Processing
                      </span>
                    }
                    @case ('FAILED') {
                      <span class="inline-flex items-center gap-1 text-xs text-destructive">
                        <ng-icon name="lucideAlertTriangle" class="h-3.5 w-3.5" />
                        Failed
                      </span>
                    }
                    @case ('EXPIRED') {
                      <span class="text-xs text-muted-foreground">Expired</span>
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
    { value: 'JSON', label: 'JSON', icon: 'lucideFileJson' },
    { value: 'MARKDOWN', label: 'Markdown', icon: 'lucideFileText' },
    { value: 'PDF', label: 'PDF', icon: 'lucideFile' },
  ];

  readonly dataTypeOptions = [
    { value: 'all', label: 'All Data' },
    { value: 'profile', label: 'Profile' },
    { value: 'invitations', label: 'Invitations' },
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
    // Remove 'all' if selecting specific types
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
          // Stop polling if no pending/processing exports
          const hasActive = res.data.some(
            (e) => e.status === 'PENDING' || e.status === 'PROCESSING'
          );
          if (!hasActive) {
            this.pollingActive = false;
          }
        },
      });
  }

  getFormatIcon(format: string): string {
    switch (format) {
      case 'JSON':
        return 'lucideFileJson';
      case 'MARKDOWN':
        return 'lucideFileText';
      case 'PDF':
        return 'lucideFile';
      default:
        return 'lucideFile';
    }
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
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
