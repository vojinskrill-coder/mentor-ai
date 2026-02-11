import {
  Component,
  signal,
  computed,
  inject,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type {
  Memory,
  MemoryType,
  MemoryListResponse,
} from '@mentor-ai/shared/types';
import { MEMORY_TYPE_COLORS, MEMORY_TYPE_LABELS, MemorySource } from '@mentor-ai/shared/types';
import { MemoryCorrectionDialogComponent, type MemoryCorrectionResult } from './memory-correction-dialog.component';

/**
 * Component for managing user memories.
 * Displays list of memories with options to edit and delete.
 *
 * Accessible via Settings > Memory & Context
 *
 * Story 2.7: Persistent Memory Across Conversations
 */
@Component({
  selector: 'app-memory-list',
  standalone: true,
  imports: [CommonModule, FormsModule, MemoryCorrectionDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="memory-page">
      <header class="page-header">
        <div class="header-content">
          <h1 class="page-title">Memory & Context</h1>
          <p class="page-description">
            Manage what the AI remembers about you, your clients, and your projects.
          </p>
        </div>
        <button
          type="button"
          class="clear-all-btn"
          [disabled]="memories$().length === 0"
          (click)="onClearAll()"
        >
          Clear All Memory
        </button>
      </header>

      <!-- Filter tabs -->
      <div class="filter-tabs" role="tablist">
        @for (filter of filters; track filter.type) {
          <button
            type="button"
            role="tab"
            class="filter-tab"
            [class.active]="activeFilter$() === filter.type"
            [attr.aria-selected]="activeFilter$() === filter.type"
            (click)="setFilter(filter.type)"
          >
            {{ filter.label }}
            <span class="count">{{ getFilterCount(filter.type) }}</span>
          </button>
        }
      </div>

      <!-- Loading state -->
      @if (isLoading$()) {
        <div class="loading-state">
          <div class="spinner" aria-hidden="true"></div>
          <p>Loading memories...</p>
        </div>
      }

      <!-- Error state -->
      @if (error$()) {
        <div class="error-state" role="alert">
          <p>{{ error$() }}</p>
          <button type="button" class="retry-btn" (click)="loadMemories()">
            Retry
          </button>
        </div>
      }

      <!-- Empty state -->
      @if (!isLoading$() && !error$() && filteredMemories$().length === 0) {
        <div class="empty-state">
          <span class="empty-icon" aria-hidden="true">💭</span>
          <p class="empty-text">
            @if (activeFilter$() === 'ALL') {
              No memories yet. As you chat with the AI, it will learn and
              remember context about your work.
            } @else {
              No {{ getFilterLabel(activeFilter$()).toLowerCase() }} memories found.
            }
          </p>
        </div>
      }

      <!-- Memory list -->
      @if (!isLoading$() && !error$() && filteredMemories$().length > 0) {
        <div class="memory-list" role="list">
          @for (memory of filteredMemories$(); track memory.id) {
            <div
              class="memory-card"
              role="listitem"
              [class.deleting]="deletingIds$().has(memory.id)"
            >
              <div class="card-header">
                <span
                  class="type-badge"
                  [style.background-color]="getTypeColor(memory.type) + '20'"
                  [style.color]="getTypeColor(memory.type)"
                >
                  {{ getTypeLabel(memory.type) }}
                </span>
                @if (memory.subject) {
                  <span class="subject">{{ memory.subject }}</span>
                }
                <span class="source">
                  {{ getSourceLabel(memory.source) }}
                </span>
              </div>

              <p class="content">{{ memory.content }}</p>

              <div class="card-footer">
                <span class="date">
                  {{ formatDate(memory.createdAt) }}
                </span>
                <div class="actions">
                  <button
                    type="button"
                    class="action-btn edit-btn"
                    aria-label="Edit memory"
                    (click)="onEdit(memory)"
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    class="action-btn delete-btn"
                    [disabled]="deletingIds$().has(memory.id)"
                    aria-label="Delete memory"
                    (click)="onDelete(memory)"
                  >
                    @if (deletingIds$().has(memory.id)) {
                      Deleting...
                    } @else {
                      Delete
                    }
                  </button>
                </div>
              </div>
            </div>
          }
        </div>

        <!-- Pagination -->
        @if (totalMemories$() > pageSize) {
          <div class="pagination">
            <button
              type="button"
              class="page-btn"
              [disabled]="currentPage$() === 0"
              (click)="prevPage()"
            >
              ← Previous
            </button>
            <span class="page-info">
              Showing {{ currentPage$() * pageSize + 1 }} -
              {{ Math.min((currentPage$() + 1) * pageSize, totalMemories$()) }}
              of {{ totalMemories$() }}
            </span>
            <button
              type="button"
              class="page-btn"
              [disabled]="(currentPage$() + 1) * pageSize >= totalMemories$()"
              (click)="nextPage()"
            >
              Next →
            </button>
          </div>
        }
      }

      <!-- Clear All Confirmation Dialog -->
      @if (showClearConfirm$()) {
        <div class="dialog-backdrop" (click)="cancelClearAll()"></div>
        <div
          class="confirm-dialog"
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="clear-title"
          aria-describedby="clear-desc"
        >
          <h2 id="clear-title" class="dialog-title">Clear All Memory</h2>
          <p id="clear-desc" class="dialog-desc">
            This will permanently delete all {{ totalMemories$() }} memories.
            This action cannot be undone.
          </p>
          <div class="confirm-input">
            <label for="confirm-text">
              Type <strong>FORGET</strong> to confirm:
            </label>
            <input
              id="confirm-text"
              type="text"
              class="confirm-field"
              [(ngModel)]="confirmText"
              autocomplete="off"
            />
          </div>
          <div class="dialog-actions">
            <button
              type="button"
              class="btn btn-secondary"
              (click)="cancelClearAll()"
            >
              Cancel
            </button>
            <button
              type="button"
              class="btn btn-danger"
              [disabled]="confirmText !== 'FORGET' || isClearing$()"
              (click)="confirmClearAll()"
            >
              @if (isClearing$()) {
                Clearing...
              } @else {
                Clear All Memory
              }
            </button>
          </div>
        </div>
      }

      <!-- Correction Dialog -->
      <app-memory-correction-dialog
        [memory]="selectedMemory$()"
        [isOpen]="showCorrectionDialog$()"
        (save)="onSaveCorrection($event)"
        (cancel)="closeCorrectionDialog()"
      />
    </div>
  `,
  styles: [`
    .memory-page {
      max-width: 800px;
      margin: 0 auto;
      padding: 2rem;
    }

    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 2rem;
    }

    .header-content {
      flex: 1;
    }

    .page-title {
      font-size: 1.5rem;
      font-weight: 600;
      color: #e5e5e5;
      margin: 0 0 0.5rem;
    }

    .page-description {
      color: #737373;
      margin: 0;
    }

    .clear-all-btn {
      padding: 0.5rem 1rem;
      background-color: transparent;
      border: 1px solid #ef4444;
      color: #ef4444;
      border-radius: 0.375rem;
      font-size: 0.875rem;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .clear-all-btn:hover:not(:disabled) {
      background-color: #ef444420;
    }

    .clear-all-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .filter-tabs {
      display: flex;
      gap: 0.5rem;
      margin-bottom: 1.5rem;
      border-bottom: 1px solid #262626;
      padding-bottom: 0.5rem;
    }

    .filter-tab {
      padding: 0.5rem 1rem;
      background: transparent;
      border: none;
      color: #737373;
      font-size: 0.875rem;
      cursor: pointer;
      border-radius: 0.375rem 0.375rem 0 0;
      transition: all 0.15s ease;
    }

    .filter-tab:hover {
      color: #a3a3a3;
      background-color: #1a1a1a;
    }

    .filter-tab.active {
      color: #e5e5e5;
      background-color: #262626;
    }

    .filter-tab .count {
      margin-left: 0.25rem;
      padding: 0.125rem 0.375rem;
      background-color: #333;
      border-radius: 9999px;
      font-size: 0.75rem;
    }

    .loading-state,
    .error-state,
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 4rem 2rem;
      text-align: center;
      color: #737373;
    }

    .spinner {
      width: 2rem;
      height: 2rem;
      border: 2px solid #333;
      border-top-color: #3b82f6;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
      margin-bottom: 1rem;
    }

    @keyframes spin {
      to { transform: rotate(360deg); }
    }

    .empty-icon {
      font-size: 3rem;
      margin-bottom: 1rem;
    }

    .empty-text {
      max-width: 300px;
    }

    .retry-btn {
      margin-top: 1rem;
      padding: 0.5rem 1rem;
      background-color: #262626;
      border: 1px solid #333;
      color: #e5e5e5;
      border-radius: 0.375rem;
      cursor: pointer;
    }

    .memory-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .memory-card {
      background-color: #1a1a1a;
      border: 1px solid #262626;
      border-radius: 0.5rem;
      padding: 1rem;
      transition: all 0.15s ease;
    }

    .memory-card:hover {
      border-color: #333;
    }

    .memory-card.deleting {
      opacity: 0.5;
    }

    .card-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.75rem;
      flex-wrap: wrap;
    }

    .type-badge {
      display: inline-flex;
      padding: 0.125rem 0.5rem;
      font-size: 0.75rem;
      font-weight: 500;
      border-radius: 0.25rem;
      text-transform: uppercase;
    }

    .subject {
      font-weight: 600;
      color: #e5e5e5;
    }

    .source {
      font-size: 0.75rem;
      color: #525252;
      margin-left: auto;
    }

    .content {
      color: #a3a3a3;
      margin: 0 0 0.75rem;
      line-height: 1.5;
    }

    .card-footer {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .date {
      font-size: 0.75rem;
      color: #525252;
    }

    .actions {
      display: flex;
      gap: 0.5rem;
    }

    .action-btn {
      padding: 0.25rem 0.5rem;
      font-size: 0.75rem;
      background: transparent;
      border: 1px solid #333;
      border-radius: 0.25rem;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .edit-btn {
      color: #3b82f6;
      border-color: #3b82f633;
    }

    .edit-btn:hover {
      background-color: #3b82f620;
      border-color: #3b82f6;
    }

    .delete-btn {
      color: #ef4444;
      border-color: #ef444433;
    }

    .delete-btn:hover:not(:disabled) {
      background-color: #ef444420;
      border-color: #ef4444;
    }

    .delete-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .pagination {
      display: flex;
      justify-content: center;
      align-items: center;
      gap: 1rem;
      margin-top: 2rem;
    }

    .page-btn {
      padding: 0.5rem 1rem;
      background-color: #262626;
      border: 1px solid #333;
      color: #a3a3a3;
      border-radius: 0.375rem;
      cursor: pointer;
    }

    .page-btn:hover:not(:disabled) {
      background-color: #333;
      color: #e5e5e5;
    }

    .page-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .page-info {
      font-size: 0.875rem;
      color: #737373;
    }

    .dialog-backdrop {
      position: fixed;
      inset: 0;
      background-color: rgba(0, 0, 0, 0.75);
      z-index: 1000;
    }

    .confirm-dialog {
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 90%;
      max-width: 400px;
      background-color: #1a1a1a;
      border: 1px solid #333;
      border-radius: 0.75rem;
      padding: 1.5rem;
      z-index: 1001;
    }

    .dialog-title {
      font-size: 1.125rem;
      font-weight: 600;
      color: #e5e5e5;
      margin: 0 0 0.5rem;
    }

    .dialog-desc {
      color: #a3a3a3;
      margin: 0 0 1rem;
      font-size: 0.875rem;
    }

    .confirm-input {
      margin-bottom: 1.5rem;
    }

    .confirm-input label {
      display: block;
      font-size: 0.875rem;
      color: #a3a3a3;
      margin-bottom: 0.5rem;
    }

    .confirm-input strong {
      color: #ef4444;
    }

    .confirm-field {
      width: 100%;
      padding: 0.5rem 0.75rem;
      background-color: #0d0d0d;
      border: 1px solid #333;
      border-radius: 0.375rem;
      color: #e5e5e5;
      font-size: 0.875rem;
    }

    .dialog-actions {
      display: flex;
      justify-content: flex-end;
      gap: 0.75rem;
    }

    .btn {
      padding: 0.5rem 1rem;
      font-size: 0.875rem;
      font-weight: 500;
      border-radius: 0.375rem;
      cursor: pointer;
    }

    .btn-secondary {
      background-color: transparent;
      border: 1px solid #333;
      color: #a3a3a3;
    }

    .btn-secondary:hover {
      background-color: #262626;
      color: #e5e5e5;
    }

    .btn-danger {
      background-color: #ef4444;
      border: 1px solid #ef4444;
      color: white;
    }

    .btn-danger:hover:not(:disabled) {
      background-color: #dc2626;
    }

    .btn-danger:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
  `],
})
export class MemoryListComponent {
  private readonly http = inject(HttpClient);

  // State
  memories$ = signal<Memory[]>([]);
  isLoading$ = signal(true);
  error$ = signal<string | null>(null);
  activeFilter$ = signal<MemoryType | 'ALL'>('ALL');
  currentPage$ = signal(0);
  totalMemories$ = signal(0);
  deletingIds$ = signal<Set<string>>(new Set());
  showClearConfirm$ = signal(false);
  isClearing$ = signal(false);
  confirmText = '';

  // Correction dialog state
  showCorrectionDialog$ = signal(false);
  selectedMemory$ = signal<Memory | null>(null);

  // Constants
  readonly pageSize = 20;
  readonly Math = Math;

  readonly filters: { type: MemoryType | 'ALL'; label: string }[] = [
    { type: 'ALL', label: 'All' },
    { type: 'CLIENT_CONTEXT' as MemoryType, label: 'Clients' },
    { type: 'PROJECT_CONTEXT' as MemoryType, label: 'Projects' },
    { type: 'USER_PREFERENCE' as MemoryType, label: 'Preferences' },
    { type: 'FACTUAL_STATEMENT' as MemoryType, label: 'Facts' },
  ];

  // Computed
  filteredMemories$ = computed(() => {
    const filter = this.activeFilter$();
    const memories = this.memories$();
    if (filter === 'ALL') return memories;
    return memories.filter((m) => m.type === filter);
  });

  ngOnInit(): void {
    this.loadMemories();
  }

  async loadMemories(): Promise<void> {
    this.isLoading$.set(true);
    this.error$.set(null);

    try {
      const offset = this.currentPage$() * this.pageSize;
      const response = await firstValueFrom(
        this.http.get<MemoryListResponse>('/api/v1/memory', {
          params: { limit: this.pageSize.toString(), offset: offset.toString() },
        })
      );

      this.memories$.set(response.data);
      this.totalMemories$.set(response.meta.total);
    } catch (error) {
      this.error$.set('Failed to load memories. Please try again.');
    } finally {
      this.isLoading$.set(false);
    }
  }

  setFilter(type: MemoryType | 'ALL'): void {
    this.activeFilter$.set(type);
    this.currentPage$.set(0);
  }

  getFilterCount(type: MemoryType | 'ALL'): number {
    if (type === 'ALL') return this.totalMemories$();
    return this.memories$().filter((m) => m.type === type).length;
  }

  getFilterLabel(type: MemoryType | 'ALL'): string {
    const filter = this.filters.find((f) => f.type === type);
    return filter?.label ?? 'All';
  }

  getTypeColor(type: MemoryType): string {
    return MEMORY_TYPE_COLORS[type] ?? '#6b7280';
  }

  getTypeLabel(type: MemoryType): string {
    return MEMORY_TYPE_LABELS[type] ?? 'Note';
  }

  getSourceLabel(source: MemorySource): string {
    const labels: Record<MemorySource, string> = {
      AI_EXTRACTED: 'AI extracted',
      USER_STATED: 'You stated',
      USER_CORRECTED: 'Corrected',
    };
    return labels[source] ?? source;
  }

  formatDate(dateString: string): string {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }

  prevPage(): void {
    if (this.currentPage$() > 0) {
      this.currentPage$.update((p) => p - 1);
      this.loadMemories();
    }
  }

  nextPage(): void {
    if ((this.currentPage$() + 1) * this.pageSize < this.totalMemories$()) {
      this.currentPage$.update((p) => p + 1);
      this.loadMemories();
    }
  }

  onEdit(memory: Memory): void {
    this.selectedMemory$.set(memory);
    this.showCorrectionDialog$.set(true);
  }

  closeCorrectionDialog(): void {
    this.showCorrectionDialog$.set(false);
    this.selectedMemory$.set(null);
  }

  async onSaveCorrection(result: MemoryCorrectionResult): Promise<void> {
    try {
      await firstValueFrom(
        this.http.patch(`/api/v1/memory/${result.memoryId}`, {
          content: result.newContent,
        })
      );

      // Update memory in list
      this.memories$.update((memories) =>
        memories.map((m) =>
          m.id === result.memoryId
            ? { ...m, content: result.newContent, source: 'USER_CORRECTED' as MemorySource }
            : m
        )
      );

      this.closeCorrectionDialog();
    } catch (error) {
      this.error$.set('Failed to save correction. Please try again.');
    }
  }

  async onDelete(memory: Memory): Promise<void> {
    if (!confirm(`Delete memory about "${memory.subject ?? 'this topic'}"?`)) {
      return;
    }

    this.deletingIds$.update((ids) => new Set([...ids, memory.id]));

    try {
      await firstValueFrom(this.http.delete(`/api/v1/memory/${memory.id}`));

      // Remove from list
      this.memories$.update((memories) => memories.filter((m) => m.id !== memory.id));
      this.totalMemories$.update((t) => t - 1);
    } catch (error) {
      this.error$.set('Failed to delete memory. Please try again.');
    } finally {
      this.deletingIds$.update((ids) => {
        const newIds = new Set(ids);
        newIds.delete(memory.id);
        return newIds;
      });
    }
  }

  onClearAll(): void {
    this.showClearConfirm$.set(true);
    this.confirmText = '';
  }

  cancelClearAll(): void {
    this.showClearConfirm$.set(false);
    this.confirmText = '';
  }

  async confirmClearAll(): Promise<void> {
    if (this.confirmText !== 'FORGET') return;

    this.isClearing$.set(true);

    try {
      await firstValueFrom(
        this.http.post('/api/v1/memory/forget-all', { confirmation: 'FORGET' })
      );

      this.memories$.set([]);
      this.totalMemories$.set(0);
      this.cancelClearAll();
    } catch (error) {
      this.error$.set('Failed to clear memories. Please try again.');
    } finally {
      this.isClearing$.set(false);
    }
  }
}
