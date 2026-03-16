import { Component, DestroyRef, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { TaskHubService } from './services/task-hub.service';
import { ToastService } from '../../core/services/toast.service';
import { ExecutionPanelService } from '../../core/services/execution-panel.service';
import type { TaskHubItem, DomainSummary } from '@mentor-ai/shared/types';

@Component({
  selector: 'app-task-hub',
  standalone: true,
  imports: [CommonModule, FormsModule],
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        overflow-y: auto;
      }
      .page {
        padding: 24px;
        width: 100%;
      }

      /* Page header */
      .page-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        margin-bottom: 20px;
      }
      .page-title {
        font-size: 24px;
        font-weight: 600;
        margin-bottom: 4px;
      }
      .page-desc {
        font-size: 14px;
        color: #a1a1a1;
      }

      /* Domain summary banner */
      .domain-banner {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-bottom: 20px;
      }
      .domain-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        border-radius: 999px;
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        font-size: 12px;
        font-weight: 500;
        color: #a1a1a1;
        cursor: pointer;
        transition: border-color 0.15s, color 0.15s;
      }
      .domain-pill:hover {
        border-color: #3a3a3a;
        color: #fafafa;
      }
      .domain-pill.active {
        border-color: #3b82f6;
        color: #3b82f6;
        background: rgba(59, 130, 246, 0.08);
      }
      .domain-count {
        background: #242424;
        padding: 1px 6px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 600;
      }
      .domain-pill.active .domain-count {
        background: rgba(59, 130, 246, 0.2);
        color: #3b82f6;
      }

      /* Filter bar */
      .filter-bar {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 16px;
      }
      .search-wrap {
        position: relative;
        flex: 1;
        max-width: 320px;
      }
      .search-icon {
        position: absolute;
        left: 12px;
        top: 50%;
        transform: translateY(-50%);
        width: 16px;
        height: 16px;
        color: #9e9e9e;
        pointer-events: none;
      }
      .search-input {
        width: 100%;
        padding: 8px 12px 8px 36px;
        border-radius: 6px;
        border: 1px solid #2a2a2a;
        background: #1a1a1a;
        color: #fafafa;
        font-size: 13px;
        font-family: inherit;
        outline: none;
        transition: border-color 0.15s;
      }
      .search-input::placeholder { color: #9e9e9e; }
      .search-input:focus { border-color: #3b82f6; }
      .filter-select {
        padding: 8px 12px;
        border-radius: 6px;
        border: 1px solid #2a2a2a;
        background: #1a1a1a;
        color: #fafafa;
        font-size: 13px;
        font-family: inherit;
        outline: none;
        cursor: pointer;
      }
      .filter-select:focus { border-color: #3b82f6; }
      .filter-loading {
        width: 16px;
        height: 16px;
        border: 2px solid #2a2a2a;
        border-top-color: #3b82f6;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }

      /* Task list */
      .task-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      /* Task card */
      .task-card {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 8px;
        cursor: pointer;
        transition: border-color 0.12s, background 0.12s;
        position: relative;
      }
      .task-card:hover {
        border-color: #3a3a3a;
        background: #1e1e1e;
      }
      .task-card.selected {
        border-color: #3b82f6;
        background: rgba(59, 130, 246, 0.05);
      }
      .status-icon {
        width: 18px;
        height: 18px;
        flex-shrink: 0;
      }
      .status-icon.pending { color: #eab308; }
      .status-icon.review { color: #3b82f6; }
      .status-icon.completed { color: #22c55e; }
      .task-info {
        flex: 1;
        min-width: 0;
      }
      .task-title {
        font-size: 13px;
        font-weight: 500;
        line-height: 1.4;
        margin-bottom: 4px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .task-meta {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .concept-pill {
        display: inline-flex;
        align-items: center;
        padding: 2px 8px;
        border-radius: 999px;
        background: #242424;
        font-size: 11px;
        font-weight: 500;
        color: #a1a1a1;
      }
      .agent-pipeline {
        display: inline-flex;
        align-items: center;
        gap: 3px;
      }
      .agent-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        border: 1.5px solid #3a3a3a;
      }
      .agent-dot.planned { background: transparent; }
      .agent-dot.running {
        background: #3b82f6;
        border-color: #3b82f6;
        animation: pulse-dot 1.5s ease-in-out infinite;
      }
      .agent-dot.completed { background: #22c55e; border-color: #22c55e; }
      .agent-dot.failed { background: #ef4444; border-color: #ef4444; }
      @keyframes pulse-dot {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
      }
      .score-badge {
        flex-shrink: 0;
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 600;
      }
      .score-high { background: rgba(34, 197, 94, 0.15); color: #4ade80; }
      .score-medium { background: rgba(234, 179, 8, 0.15); color: #fbbf24; }
      .score-low { background: rgba(239, 68, 68, 0.15); color: #f87171; }
      .task-arrow {
        width: 16px;
        height: 16px;
        color: #707070;
        flex-shrink: 0;
        transition: color 0.15s;
      }
      .task-card:hover .task-arrow { color: #a1a1a1; }
      .task-card.selected .task-arrow { color: #3b82f6; }

      /* Skeleton loading */
      .skeleton-card {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 8px;
      }
      .skel {
        border-radius: 6px;
        background: linear-gradient(90deg, #1a1a1a 25%, #242424 50%, #1a1a1a 75%);
        background-size: 200% 100%;
        animation: shimmer 1.5s infinite linear;
      }
      @keyframes shimmer {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
      .skel-dot { width: 18px; height: 18px; border-radius: 50%; flex-shrink: 0; }
      .skel-info { flex: 1; }
      .skel-title { height: 14px; width: 70%; margin-bottom: 8px; }
      .skel-meta { height: 10px; width: 40%; }
      .skel-banner { height: 32px; width: 100%; border-radius: 999px; }

      /* Empty state */
      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 80px 0;
        text-align: center;
      }
      .empty-icon {
        width: 48px;
        height: 48px;
        color: #9e9e9e;
        opacity: 0.5;
        margin-bottom: 16px;
      }
      .empty-state h3 {
        font-size: 18px;
        font-weight: 600;
        margin-bottom: 8px;
      }
      .empty-state p {
        font-size: 14px;
        color: #a1a1a1;
        margin-bottom: 24px;
        max-width: 360px;
      }
      .cta-btn {
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
        text-decoration: none;
        font-family: inherit;
        transition: opacity 0.15s;
      }
      .cta-btn:hover { opacity: 0.9; }
      .cta-btn svg { width: 18px; height: 18px; }

      /* Error */
      .error-banner {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.2);
        border-radius: 8px;
        margin-bottom: 16px;
        color: #f87171;
        font-size: 13px;
      }
      .error-banner svg { width: 18px; height: 18px; flex-shrink: 0; }
      .retry-btn {
        margin-left: auto;
        padding: 6px 12px;
        border-radius: 6px;
        border: none;
        background: rgba(239, 68, 68, 0.2);
        color: #f87171;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        font-family: inherit;
      }
      .retry-btn:hover { background: rgba(239, 68, 68, 0.3); }

      /* Filter overlay */
      .filter-overlay { position: relative; }
      .filter-overlay.loading::after {
        content: '';
        position: absolute;
        inset: 0;
        background: rgba(13, 13, 13, 0.4);
        border-radius: 8px;
        z-index: 1;
        pointer-events: none;
      }
    `,
  ],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1 class="page-title">Zadaci</h1>
          <p class="page-desc">Pregledajte i pratite zadatke sa AI agentima.</p>
        </div>
      </div>

      @if (error()) {
        <div class="error-banner">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span>{{ error() }}</span>
          <button class="retry-btn" (click)="loadTasks()">Ponovo</button>
        </div>
      }

      @if (domainSummary().length > 0 && !isLoading()) {
        <div class="domain-banner">
          <button class="domain-pill" [class.active]="!activeCategory()" (click)="filterByCategory(null)">
            Sve <span class="domain-count">{{ totalCount() }}</span>
          </button>
          @for (domain of domainSummary(); track domain.category) {
            <button class="domain-pill" [class.active]="activeCategory() === domain.category" (click)="filterByCategory(domain.category)">
              {{ stripCategoryNumber(domain.category) }} <span class="domain-count">{{ domain.total }}</span>
            </button>
          }
        </div>
      }

      <div class="filter-bar">
        <div class="search-wrap">
          <svg class="search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input class="search-input" placeholder="Pretraži zadatke..." [ngModel]="searchTerm()" (ngModelChange)="onSearchChange($event)" />
        </div>
        <select class="filter-select" [ngModel]="statusFilter()" (ngModelChange)="onStatusChange($event)">
          <option value="">Svi statusi</option>
          <option value="PENDING">Na čekanju</option>
          <option value="READY_FOR_REVIEW">Za pregled</option>
          <option value="COMPLETED">Završeno</option>
        </select>
        @if (isFiltering()) {
          <div class="filter-loading"></div>
        }
      </div>

      @if (isLoading() && !tasks().length) {
        <div class="task-list">
          @for (i of skeletonCards; track i) {
            <div class="skeleton-card">
              <div class="skel skel-dot"></div>
              <div class="skel-info">
                <div class="skel skel-title"></div>
                <div class="skel skel-meta"></div>
              </div>
            </div>
          }
        </div>
      } @else if (tasks().length > 0) {
        <div class="task-list" [class.filter-overlay]="true" [class.loading]="isFiltering()">
          @for (task of tasks(); track task.id) {
            <div class="task-card" [class.selected]="selectedId() === task.id" (click)="selectTask(task)">
              @if (task.status === 'COMPLETED') {
                <svg class="status-icon completed" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              } @else if (task.status === 'READY_FOR_REVIEW') {
                <svg class="status-icon review" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
              } @else {
                <svg class="status-icon pending" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              }
              <div class="task-info">
                <div class="task-title">{{ task.title }}</div>
                <div class="task-meta">
                  @if (task.conceptName) {
                    <span class="concept-pill">{{ task.conceptName }}</span>
                  }
                  @if (task.agentJobs.length > 0) {
                    <div class="agent-pipeline">
                      @for (job of task.agentJobs; track job.id) {
                        <span class="agent-dot" [class]="job.status.toLowerCase()" [title]="job.agentType + ' - ' + job.status"></span>
                      }
                    </div>
                  }
                </div>
              </div>
              @if (task.aiScore != null) {
                <span class="score-badge" [class]="getScoreClass(task.aiScore)">{{ task.aiScore }}</span>
              }
              <svg class="task-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
            </div>
          }
        </div>
      } @else if (!isLoading() && !error()) {
        <div class="empty-state">
          <svg class="empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
          </svg>
          <h3>Još nema zadataka</h3>
          <p>Započnite razgovor da kreirate prvi zadatak. Zadaci se automatski generišu iz vaših razgovora sa AI agentima.</p>
        </div>
      }
    </div>
  `,
})
export class TaskHubComponent implements OnInit {
  private readonly taskHubService = inject(TaskHubService);
  private readonly toastService = inject(ToastService);
  private readonly execPanel = inject(ExecutionPanelService);
  private readonly destroyRef = inject(DestroyRef);

  readonly tasks = signal<TaskHubItem[]>([]);
  readonly domainSummary = signal<DomainSummary[]>([]);
  readonly isLoading = signal(true);
  readonly isFiltering = signal(false);
  readonly error = signal<string | null>(null);
  readonly selectedId = signal<string | null>(null);

  readonly searchTerm = signal('');
  readonly statusFilter = signal('');
  readonly activeCategory = signal<string | null>(null);

  readonly totalCount = computed(() =>
    this.domainSummary().reduce((sum, d) => sum + d.total, 0)
  );

  readonly skeletonCards = [1, 2, 3, 4, 5, 6];

  private readonly searchSubject = new Subject<string>();

  ngOnInit(): void {
    this.loadTasks();

    this.searchSubject
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((term) => {
        this.searchTerm.set(term);
        this.loadTasks(true);
      });
  }

  loadTasks(isFilter = false): void {
    if (isFilter) {
      this.isFiltering.set(true);
    } else {
      this.isLoading.set(true);
    }
    this.error.set(null);

    this.taskHubService
      .getTasks({
        status: this.statusFilter() || undefined,
        category: this.activeCategory() || undefined,
        search: this.searchTerm() || undefined,
        hasJobs: true,
        limit: 50,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.tasks.set(res.data.tasks);
          this.domainSummary.set(res.data.domainSummary);
          this.isLoading.set(false);
          this.isFiltering.set(false);
          // Auto-select first task if nothing selected
          const first = res.data.tasks[0];
          if (!this.selectedId() && first) {
            this.selectTask(first);
          }
        },
        error: () => {
          this.error.set('Greška pri učitavanju zadataka.');
          this.isLoading.set(false);
          this.isFiltering.set(false);
        },
      });
  }

  selectTask(task: TaskHubItem): void {
    this.selectedId.set(task.id);
    this.execPanel.showTask({
      note: task,
      conceptName: task.conceptName,
      conceptCategory: task.conceptCategory,
      conversationId: task.conversationId,
      agentJobs: task.agentJobs,
    });
  }

  onSearchChange(term: string): void {
    this.searchSubject.next(term);
  }

  onStatusChange(status: string): void {
    this.statusFilter.set(status);
    this.loadTasks(true);
  }

  filterByCategory(category: string | null): void {
    this.activeCategory.set(category);
    this.loadTasks(true);
  }

  getScoreClass(score: number): string {
    if (score >= 80) return 'score-badge score-high';
    if (score >= 50) return 'score-badge score-medium';
    return 'score-badge score-low';
  }

  stripCategoryNumber(category: string): string {
    return category.replace(/^\d+\.\s*/, '');
  }
}
