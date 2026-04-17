import {
  Component,
  OnInit,
  OnDestroy,
  input,
  output,
  signal,
  computed,
  inject,
  effect,
  untracked,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type { NoteItem, AgentJobItem } from '@mentor-ai/shared/types';
import { AgentExecutionApiService } from '../services/agent-execution-api.service';
import { ExecutionPanelService } from '../../../core/services/execution-panel.service';
import { ChatWebsocketService } from '../services/chat-websocket.service';

const AGENT_INFO: Record<string, { label: string; icon: string; cost: number }> = {
  web_search: { label: 'Online research', icon: '🔍', cost: 0.5 },
  content: { label: 'Content creation', icon: '✏️', cost: 0.5 },
  marketing: { label: 'Marketing analysis', icon: '📈', cost: 0.5 },
  sales: { label: 'Sales strategy', icon: '💼', cost: 0.5 },
  financial: { label: 'Financial analysis', icon: '💰', cost: 0.5 },
};

@Component({
  selector: 'app-job-panel',
  standalone: true,
  imports: [CommonModule],
  styles: [
    `
      .job-panel {
        margin-top: 16px;
        padding: 16px;
        background: #161B22;
        border: 1px solid #21262D;
        border-radius: 8px;
      }
      .job-panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 12px;
      }
      .job-panel-title {
        font-size: 14px;
        font-weight: 600;
        color: #E6EDF3;
        margin: 0;
      }
      .job-panel-count {
        font-size: 11px;
        color: #6E7681;
      }
      .job-budget-bar {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 16px;
        font-size: 11px;
        color: #8B949E;
      }
      .job-budget-track {
        flex: 1;
        height: 4px;
        background: #21262D;
        border-radius: 2px;
        overflow: hidden;
      }
      .job-budget-fill {
        height: 100%;
        background: #58A6FF;
        border-radius: 2px;
        transition: width 0.3s;
      }
      .job-budget-fill.over-budget {
        background: #F85149;
      }

      /* Pipeline layout */
      .job-pipeline {
        display: flex;
        flex-direction: column;
        gap: 0;
      }
      .job-card-wrapper {
        display: flex;
        gap: 12px;
      }

      /* Order column with badge + connector line */
      .job-order-col {
        display: flex;
        flex-direction: column;
        align-items: center;
        width: 28px;
        flex-shrink: 0;
      }
      .job-order-badge {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: 700;
        flex-shrink: 0;
        border: 2px solid #21262D;
        background: #1C2128;
        color: #8B949E;
      }
      .job-order-badge.planned {
        border-color: #21262D;
        color: #8B949E;
      }
      .job-order-badge.running {
        border-color: #58A6FF;
        color: #58A6FF;
        animation: job-pulse 1.5s ease-in-out infinite;
      }
      .job-order-badge.completed {
        border-color: #3FB950;
        background: #3FB950;
        color: #fff;
      }
      .job-order-badge.failed {
        border-color: #F85149;
        background: #F85149;
        color: #fff;
      }
      .job-order-badge.locked {
        border-color: #21262D;
        background: #161B22;
        color: #555;
      }
      @keyframes job-pulse {
        0%,
        100% {
          box-shadow: 0 0 0 0 rgba(88, 166, 255, 0.4);
        }
        50% {
          box-shadow: 0 0 0 6px rgba(88, 166, 255, 0);
        }
      }
      .job-connector {
        width: 2px;
        flex: 1;
        min-height: 12px;
        background: #21262D;
      }
      .job-connector.completed {
        background: #3FB950;
      }
      .job-connector.hidden {
        visibility: hidden;
      }

      /* Card content */
      .job-content {
        flex: 1;
        min-width: 0;
        margin-bottom: 12px;
      }
      .job-card {
        background: #1C2128;
        border: 1px solid #21262D;
        border-radius: 6px;
        padding: 12px;
        transition: border-color 0.15s;
      }
      .job-card.running {
        border-color: #58A6FF;
      }
      .job-card.completed {
        border-color: #3FB950;
      }
      .job-card.failed {
        border-color: #F85149;
      }
      .job-card.locked {
        opacity: 0.5;
      }
      .job-card-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 6px;
      }
      .job-agent-icon {
        font-size: 14px;
      }
      .job-agent-label {
        font-size: 13px;
        font-weight: 600;
        color: #E6EDF3;
        flex: 1;
      }
      .job-status-badge {
        font-size: 10px;
        font-weight: 600;
        padding: 2px 8px;
        border-radius: 10px;
      }
      .job-status-badge.running {
        background: rgba(88, 166, 255, 0.15);
        color: #60a5fa;
      }
      .job-status-badge.completed {
        background: rgba(63, 185, 80, 0.15);
        color: #3FB950;
      }
      .job-status-badge.failed {
        background: rgba(248, 81, 73, 0.15);
        color: #F85149;
      }
      .job-status-badge.locked {
        background: rgba(100, 100, 100, 0.15);
        color: #6E7681;
      }
      .job-instruction-preview {
        font-size: 12px;
        color: #8B949E;
        line-height: 1.5;
        margin-bottom: 8px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .job-card-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .job-cost {
        font-size: 11px;
        color: #6E7681;
      }
      .job-execute-btn {
        background: transparent;
        border: 1px solid #58A6FF;
        color: #58A6FF;
        padding: 4px 14px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s;
      }
      .job-execute-btn:hover:not(:disabled) {
        background: #58A6FF;
        color: #fff;
      }
      .job-execute-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      .job-retry-btn {
        background: transparent;
        border: 1px solid #D29922;
        color: #D29922;
        padding: 4px 14px;
        border-radius: 4px;
        font-size: 11px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.15s;
      }
      .job-retry-btn:hover:not(:disabled) {
        background: #D29922;
        color: #fff;
      }
      .job-retry-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      .job-running-indicator {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        color: #58A6FF;
      }
      .job-running-spinner {
        width: 12px;
        height: 12px;
        border: 2px solid #30363D;
        border-top-color: #58A6FF;
        border-radius: 50%;
        animation: job-spin 0.8s linear infinite;
      }
      @keyframes job-spin {
        to {
          transform: rotate(360deg);
        }
      }
      .job-running-text {
        display: flex;
        flex-direction: column;
        gap: 1px;
      }
      .job-phase {
        font-weight: 500;
      }
      .job-elapsed {
        font-size: 10px;
        color: #6E7681;
        font-variant-numeric: tabular-nums;
      }
      .job-error-msg {
        background: rgba(248, 81, 73, 0.1);
        border: 1px solid rgba(248, 81, 73, 0.3);
        border-radius: 4px;
        padding: 6px 10px;
        margin-top: 8px;
        font-size: 11px;
        color: #F85149;
      }

      /* Expandable result section */
      .job-result-section {
        margin-top: 10px;
        border-top: 1px solid #21262D;
      }
      .job-result-header {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 8px 0 0 0;
        cursor: pointer;
        font-size: 11px;
        color: #8B949E;
      }
      .job-result-header:hover {
        color: #bbb;
      }
      .job-result-toggle {
        font-size: 10px;
      }

      /* Reuse enrichment-content styles from agent-panel */
      .enrichment-content {
        padding: 16px 0;
        font-size: 13.5px;
        color: #d4d4d4;
        line-height: 1.7;
        max-height: 1200px;
        overflow-y: auto;
        letter-spacing: 0.01em;
      }
      .enrichment-content > *:first-child {
        margin-top: 0;
      }
      .enrichment-content > *:last-child {
        margin-bottom: 0;
      }
      .enrichment-content h1,
      .enrichment-content h2,
      .enrichment-content h3,
      .enrichment-content h4,
      .enrichment-content h5 {
        color: #f5f5f5;
        font-weight: 600;
        letter-spacing: -0.01em;
      }
      .enrichment-content h1 {
        font-size: 18px;
        margin: 28px 0 12px 0;
        padding-bottom: 8px;
        border-bottom: 1px solid #21262D;
      }
      .enrichment-content h2 {
        font-size: 15px;
        margin: 24px 0 10px 0;
        padding-bottom: 6px;
        border-bottom: 1px solid rgba(88, 166, 255, 0.15);
      }
      .enrichment-content h3 {
        font-size: 14px;
        margin: 20px 0 8px 0;
        color: #e5e5e5;
      }
      .enrichment-content h4 {
        font-size: 13px;
        margin: 16px 0 6px 0;
        color: #d4d4d4;
      }
      .enrichment-content h5 {
        font-size: 12px;
        margin: 12px 0 4px 0;
        color: #a3a3a3;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .enrichment-content p {
        margin: 8px 0;
      }
      .enrichment-content ul,
      .enrichment-content ol {
        padding-left: 24px;
        margin: 10px 0;
      }
      .enrichment-content li {
        margin: 6px 0;
        line-height: 1.6;
      }
      .enrichment-content li::marker {
        color: #525252;
      }
      .enrichment-content a {
        color: #60a5fa;
        text-decoration: none;
        border-bottom: 1px solid rgba(96, 165, 250, 0.3);
        transition:
          border-color 0.15s,
          color 0.15s;
      }
      .enrichment-content a:hover {
        color: #93c5fd;
        border-bottom-color: rgba(147, 197, 253, 0.6);
      }
      .enrichment-content strong {
        color: #f5f5f5;
        font-weight: 600;
      }
      .enrichment-content em {
        color: #a3a3a3;
        font-style: italic;
      }
      .enrichment-content blockquote {
        margin: 16px 0;
        padding: 12px 16px;
        border-left: 3px solid #58A6FF;
        background: rgba(88, 166, 255, 0.06);
        border-radius: 0 6px 6px 0;
        color: #d4d4d4;
        font-style: italic;
      }
      .enrichment-content blockquote p {
        margin: 4px 0;
      }
      .enrichment-content hr {
        border: none;
        height: 1px;
        background: linear-gradient(to right, transparent, #21262D 20%, #21262D 80%, transparent);
        margin: 20px 0;
      }
      .enrichment-content code {
        font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
        font-size: 12px;
        background: rgba(255, 255, 255, 0.06);
        color: #e879f9;
        padding: 2px 6px;
        border-radius: 4px;
        border: 1px solid rgba(255, 255, 255, 0.08);
      }
      .enrichment-content pre {
        margin: 14px 0;
        border-radius: 8px;
        overflow: hidden;
      }
      .enrichment-content pre code {
        display: block;
        padding: 14px 18px;
        background: #0D1117;
        border: 1px solid #21262D;
        color: #d4d4d4;
        font-size: 12px;
        line-height: 1.5;
        overflow-x: auto;
      }
      .enrichment-content img {
        max-width: 100%;
        border-radius: 10px;
        margin: 16px 0;
        border: 1px solid #21262D;
        display: block;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      }
      .enrichment-content p:has(img) {
        margin: 0;
      }
      .enrichment-content table {
        border-collapse: separate;
        border-spacing: 0;
        width: 100%;
        margin: 14px 0;
        border-radius: 8px;
        overflow: hidden;
        border: 1px solid #21262D;
        font-size: 12.5px;
      }
      .enrichment-content th {
        background: #161B22;
        color: #f5f5f5;
        font-weight: 600;
        text-align: left;
        padding: 10px 14px;
        font-size: 11.5px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        border-bottom: 2px solid #21262D;
      }
      .enrichment-content td {
        padding: 9px 14px;
        text-align: left;
        border-bottom: 1px solid rgba(42, 42, 42, 0.5);
        color: #d4d4d4;
      }
      .enrichment-content tr:last-child td {
        border-bottom: none;
      }
      .enrichment-content tbody tr:nth-child(even) {
        background: rgba(255, 255, 255, 0.02);
      }
      .enrichment-content tbody tr:hover {
        background: rgba(88, 166, 255, 0.04);
      }
      .enrichment-content del {
        color: #737373;
        text-decoration: line-through;
      }

      /* Summary section */
      .job-summary {
        margin-top: 16px;
        padding: 12px;
        background: rgba(63, 185, 80, 0.08);
        border: 1px solid rgba(63, 185, 80, 0.2);
        border-radius: 6px;
        text-align: center;
        font-size: 12px;
        color: #3FB950;
        font-weight: 500;
      }

      /* Global error */
      .job-global-error {
        background: rgba(248, 81, 73, 0.1);
        border: 1px solid rgba(248, 81, 73, 0.3);
        border-radius: 6px;
        padding: 8px 12px;
        margin-top: 12px;
        font-size: 12px;
        color: #F85149;
      }

      .job-empty {
        text-align: center;
        padding: 16px;
        color: #6E7681;
        font-size: 12px;
      }

      .job-loading {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 0;
        color: #8B949E;
        font-size: 12px;
      }
      .job-loading-spinner {
        width: 14px;
        height: 14px;
        border: 2px solid #30363D;
        border-top-color: #58A6FF;
        border-radius: 50%;
        animation: job-spin 0.8s linear infinite;
      }
    `,
  ],
  template: `
    <div class="job-panel">
      <div class="job-panel-header">
        <h4 class="job-panel-title">AI Work Plan</h4>
        @if (jobs().length > 0) {
          <span class="job-panel-count">{{ completedCount() }}/{{ jobs().length }} completed</span>
        }
      </div>

      @if (budget()) {
        <div class="job-budget-bar">
          <span>{{ budget()!.spent.toFixed(2) }} / {{ budget()!.limit.toFixed(2) }} EUR</span>
          <div class="job-budget-track">
            <div
              class="job-budget-fill"
              [class.over-budget]="budgetPercent() >= 100"
              [style.width.%]="budgetPercent()"
            ></div>
          </div>
        </div>
      }

      @if (loading()) {
        <div class="job-loading">
          <div class="job-loading-spinner"></div>
          Loading plan...
        </div>
      } @else if (jobs().length === 0) {
        <div class="job-empty">No planned tasks for this report.</div>
      } @else {
        <div class="job-pipeline">
          @for (job of jobs(); track job.id; let last = $last) {
            <div class="job-card-wrapper">
              <div class="job-order-col">
                <div class="job-order-badge" [ngClass]="getBadgeClass(job)">
                  @if (job.status === 'COMPLETED') {
                    ✓
                  } @else if (job.status === 'FAILED') {
                    ✕
                  } @else if (isLocked(job)) {
                    🔒
                  } @else {
                    {{ job.order }}
                  }
                </div>
                @if (!last) {
                  <div
                    class="job-connector"
                    [ngClass]="{ completed: job.status === 'COMPLETED' }"
                  ></div>
                }
              </div>
              <div class="job-content">
                <div class="job-card" [ngClass]="getCardClass(job)">
                  <div class="job-card-header">
                    <span class="job-agent-icon">{{ getIcon(job.agentType) }}</span>
                    <span class="job-agent-label">{{ getLabel(job.agentType) }}</span>
                    @if (job.status === 'RUNNING') {
                      <span class="job-status-badge running">Executing</span>
                    } @else if (job.status === 'COMPLETED') {
                      <span class="job-status-badge completed">Completed</span>
                    } @else if (job.status === 'FAILED') {
                      <span class="job-status-badge failed">Error</span>
                    } @else if (isLocked(job)) {
                      <span class="job-status-badge locked">Awaiting previous</span>
                    }
                  </div>

                  <div class="job-instruction-preview">{{ job.instruction }}</div>

                  <div class="job-card-footer">
                    <span class="job-cost">~{{ getCost(job.agentType).toFixed(2) }} EUR</span>
                    @if (job.status === 'RUNNING') {
                      <span class="job-running-indicator">
                        <span class="job-running-spinner"></span>
                        <span class="job-running-text">
                          <span class="job-phase">{{ getRunningPhase(job.id) }}</span>
                          <span class="job-elapsed">{{ getElapsed(job.id) }}</span>
                        </span>
                      </span>
                    } @else if (job.status === 'PLANNED' && canExecute(job)) {
                      <button
                        class="job-execute-btn"
                        [disabled]="!canAfford()"
                        (click)="onExecuteJob(job)"
                      >
                        Execute
                      </button>
                    } @else if (job.status === 'FAILED') {
                      <button
                        class="job-retry-btn"
                        [disabled]="retryingJobs().has(job.id)"
                        (click)="onRetryJob(job)"
                      >
                        {{ retryingJobs().has(job.id) ? 'Retrying...' : 'Retry' }}
                      </button>
                    }
                  </div>

                  @if (job.error) {
                    <div class="job-error-msg">{{ job.error }}</div>
                  }

                  @if (job.status === 'COMPLETED' && job.agentOutput) {
                    <div class="job-result-section">
                      <div class="job-result-header" (click)="toggleResult(job.id)">
                        <span class="job-result-toggle">{{
                          isResultExpanded(job.id) ? '▼' : '▶'
                        }}</span>
                        <span>{{
                          isResultExpanded(job.id) ? 'Hide result' : 'Show result'
                        }}</span>
                      </div>
                      @if (isResultExpanded(job.id)) {
                        <div
                          class="enrichment-content"
                          [innerHTML]="renderOutput(job.agentOutput)"
                        ></div>
                      }
                    </div>
                  }
                </div>
              </div>
            </div>
          }
        </div>

        @if (allCompleted()) {
          <div class="job-summary">
            All tasks completed | {{ jobs().length }} agents | ~{{
              totalEstimatedCost().toFixed(2)
            }}
            EUR
          </div>
        }
      }

      @if (globalError()) {
        <div class="job-global-error">{{ globalError() }}</div>
      }
    </div>
  `,
})
export class JobPanelComponent implements OnInit, OnDestroy {
  note = input.required<NoteItem>();
  initialJobs = input<AgentJobItem[]>([]);
  noteUpdated = output<void>();

  private readonly agentApi = inject(AgentExecutionApiService);
  private readonly execPanel = inject(ExecutionPanelService);
  private readonly wsService = inject(ChatWebsocketService);

  /** Maps jobId → activity feed entry ID for real-time panel updates */
  private readonly jobEntryIds = new Map<string, string>();
  /** Maps executionId → jobId for reverse lookup from WS events */
  private readonly execToJobMap = new Map<string, string>();
  /** WS unsubscribe functions */
  private readonly wsUnsubs: (() => void)[] = [];

  jobs = signal<AgentJobItem[]>([]);
  loading = signal(false);
  budget = signal<{ spent: number; limit: number } | null>(null);
  expandedResults = signal<Set<string>>(new Set());
  retryingJobs = signal<Set<string>>(new Set());
  globalError = signal<string | null>(null);

  // Running job state
  private runningJobs = signal<
    Map<string, { executionId: string; phase: string; startedAt: number }>
  >(new Map());
  private pollTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private pollRetryCounts: Map<string, number> = new Map();
  private pollErrorCounts: Map<string, number> = new Map();
  private elapsedTimer: ReturnType<typeof setInterval> | null = null;
  private readonly MAX_POLL_RETRIES = 400;
  private readonly MAX_CONSECUTIVE_ERRORS = 10;
  private readonly BASE_POLL_INTERVAL = 3000;

  budgetPercent = computed(() => {
    const b = this.budget();
    if (!b || b.limit === 0) return 0;
    return Math.min(100, (b.spent / b.limit) * 100);
  });

  completedCount = computed(() => this.jobs().filter((j) => j.status === 'COMPLETED').length);

  allCompleted = computed(() => {
    const j = this.jobs();
    return j.length > 0 && j.every((job) => job.status === 'COMPLETED');
  });

  totalEstimatedCost = computed(() =>
    this.jobs().reduce((sum, j) => sum + this.getCost(j.agentType), 0)
  );

  canAfford = computed(() => {
    const b = this.budget();
    if (!b) return false;
    return b.spent + 0.5 <= b.limit;
  });

  private lastLoadedNoteRef: unknown = null;

  constructor() {
    // Re-load jobs whenever the note input reference changes (e.g., after loadNotes() refreshes).
    // This ensures the panel picks up newly created jobs (e.g., from jobs:planned event).
    effect(() => {
      const noteRef = this.note();
      if (noteRef === this.lastLoadedNoteRef) return;
      this.lastLoadedNoteRef = noteRef;
      untracked(() => this.loadJobs());
    });

    // ── WebSocket-driven agent execution updates ──
    this.wsUnsubs.push(
      this.wsService.onAgentStatusChange((data) => {
        const jobId = this.findJobByExecOrJobId(data.executionId, data.jobId);
        if (!jobId) return;

        if (data.status === 'COMPLETED' || data.status === 'FAILED') {
          const current = new Map(this.runningJobs());
          current.delete(jobId);
          this.runningJobs.set(current);
          if (current.size === 0) this.stopElapsedTimer();
          // Also reload + emit so the job card updates
          this.loadJobs();
          this.noteUpdated.emit();
        } else {
          const current = new Map(this.runningJobs());
          const existing = current.get(jobId);
          current.set(jobId, {
            executionId: data.executionId,
            phase: data.label,
            startedAt: existing?.startedAt ?? Date.now(),
          });
          this.runningJobs.set(current);

          const eid = this.jobEntryIds.get(jobId);
          if (eid) this.execPanel.updateEntry(eid, { detail: data.label });
        }
      }),

      this.wsService.onAgentHeartbeat((data) => {
        const jobId = this.findJobByExecOrJobId(data.executionId, data.jobId);
        if (!jobId) return;
        const current = new Map(this.runningJobs());
        const existing = current.get(jobId);
        if (existing) {
          const sec = Math.floor(data.elapsedMs / 1000);
          const m = Math.floor(sec / 60);
          const s = sec % 60;
          current.set(jobId, {
            ...existing,
            phase: `Agent researching... (${m > 0 ? m + 'm ' : ''}${s}s)`,
          });
          this.runningJobs.set(current);
        }
      }),

      this.wsService.onAgentResult((data) => {
        const jobId = this.findJobByExecOrJobId(data.executionId, data.jobId);
        if (!jobId) return;

        // Clean up running state
        const current = new Map(this.runningJobs());
        current.delete(jobId);
        this.runningJobs.set(current);
        this.cleanupJobPolling(jobId);
        if (current.size === 0) this.stopElapsedTimer();

        // Update activity feed
        const eid = this.jobEntryIds.get(jobId);
        if (eid) {
          this.execPanel.completeEntry(eid, `Completed in ${Math.floor(data.durationMs / 1000)}s`);
          this.jobEntryIds.delete(jobId);
        }
        this.execToJobMap.delete(data.executionId);

        // Refresh jobs to get updated status + output
        this.loadJobs();
        this.noteUpdated.emit();
      }),

      this.wsService.onAgentError((data) => {
        const jobId = this.findJobByExecOrJobId(data.executionId, data.jobId);
        if (!jobId) return;

        // Clean up running state
        const current = new Map(this.runningJobs());
        current.delete(jobId);
        this.runningJobs.set(current);
        this.cleanupJobPolling(jobId);
        if (current.size === 0) this.stopElapsedTimer();

        // Update activity feed
        const eid = this.jobEntryIds.get(jobId);
        if (eid) {
          this.execPanel.failEntry(eid, data.error);
          this.jobEntryIds.delete(jobId);
        }
        this.execToJobMap.delete(data.executionId);

        // Refresh jobs
        this.loadJobs();
        this.noteUpdated.emit();
      })
    );
  }

  ngOnInit(): void {
    // Initial load is handled by the constructor effect.
    // Nothing needed here.
  }

  ngOnDestroy(): void {
    for (const timer of this.pollTimers.values()) {
      clearTimeout(timer);
    }
    this.pollTimers.clear();
    this.pollRetryCounts.clear();
    this.pollErrorCounts.clear();
    this.stopElapsedTimer();
    // Clean up WS subscriptions
    for (const unsub of this.wsUnsubs) unsub();
    this.wsUnsubs.length = 0;
  }

  getIcon(agentType: string): string {
    return AGENT_INFO[agentType]?.icon ?? '🤖';
  }

  getLabel(agentType: string): string {
    return AGENT_INFO[agentType]?.label ?? agentType;
  }

  getCost(agentType: string): number {
    return AGENT_INFO[agentType]?.cost ?? 0.5;
  }

  isLocked(job: AgentJobItem): boolean {
    if (job.status !== 'PLANNED') return false;
    if (job.dependsOn.length === 0) return false;
    const allJobs = this.jobs();
    return job.dependsOn.some((depId) => {
      const dep = allJobs.find((j) => j.id === depId);
      return !dep || dep.status !== 'COMPLETED';
    });
  }

  canExecute(job: AgentJobItem): boolean {
    if (job.status !== 'PLANNED') return false;
    if (job.dependsOn.length === 0) return true;
    const allJobs = this.jobs();
    return job.dependsOn.every((depId) => {
      const dep = allJobs.find((j) => j.id === depId);
      return dep?.status === 'COMPLETED';
    });
  }

  getBadgeClass(job: AgentJobItem): string {
    if (job.status === 'RUNNING') return 'running';
    if (job.status === 'COMPLETED') return 'completed';
    if (job.status === 'FAILED') return 'failed';
    if (this.isLocked(job)) return 'locked';
    return 'planned';
  }

  getCardClass(job: AgentJobItem): string {
    if (job.status === 'RUNNING') return 'running';
    if (job.status === 'COMPLETED') return 'completed';
    if (job.status === 'FAILED') return 'failed';
    if (this.isLocked(job)) return 'locked';
    return '';
  }

  getRunningPhase(jobId: string): string {
    return this.runningJobs().get(jobId)?.phase ?? 'Agent radi...';
  }

  getElapsed(jobId: string): string {
    const running = this.runningJobs().get(jobId);
    if (!running) return '';
    const elapsed = Math.floor((Date.now() - running.startedAt) / 1000);
    const min = Math.floor(elapsed / 60);
    const sec = elapsed % 60;
    if (min === 0) return `${sec}s`;
    return `${min}m ${sec.toString().padStart(2, '0')}s`;
  }

  isResultExpanded(jobId: string): boolean {
    return this.expandedResults().has(jobId);
  }

  toggleResult(jobId: string): void {
    const current = new Set(this.expandedResults());
    if (current.has(jobId)) {
      current.delete(jobId);
    } else {
      current.add(jobId);
    }
    this.expandedResults.set(current);
  }

  renderOutput(output: string | null): string {
    if (!output) return '';
    const html = marked.parse(output, { async: false }) as string;
    return DOMPurify.sanitize(html, {
      ALLOWED_TAGS: [
        'h1',
        'h2',
        'h3',
        'h4',
        'h5',
        'h6',
        'p',
        'br',
        'hr',
        'ul',
        'ol',
        'li',
        'strong',
        'em',
        'b',
        'i',
        'a',
        'img',
        'table',
        'thead',
        'tbody',
        'tr',
        'th',
        'td',
        'blockquote',
        'pre',
        'code',
        'span',
        'div',
        'del',
      ],
      ALLOWED_ATTR: ['href', 'src', 'alt', 'title', 'class', 'target', 'rel'],
      ALLOW_DATA_ATTR: false,
    });
  }

  async onExecuteJob(job: AgentJobItem): Promise<void> {
    this.globalError.set(null);

    // Add activity feed entry for this agent execution
    const entryId = this.execPanel.addEntry(
      'agent-job',
      `${this.getLabel(job.agentType)}`,
      'running',
      'Pokretanje agenta...'
    );
    this.jobEntryIds.set(job.id, entryId);

    try {
      const { executionId } = await this.agentApi.executeJob(job.id);

      // Update local job state to RUNNING
      this.updateJobStatus(job.id, 'RUNNING', executionId);

      // Track running state
      const current = new Map(this.runningJobs());
      current.set(job.id, {
        executionId,
        phase: 'Preparing instructions...',
        startedAt: Date.now(),
      });
      this.runningJobs.set(current);
      this.startElapsedTimer();

      // Map executionId → jobId for WS event reverse lookup
      this.execToJobMap.set(executionId, job.id);

      // Use WS-driven updates when connected, fall back to polling otherwise
      if (this.wsService.connectionState$() !== 'connected') {
        this.pollRetryCounts.delete(job.id);
        this.pollErrorCounts.delete(job.id);
        this.pollJobExecution(job.id, executionId);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error launching task';
      this.globalError.set(message);
      // Update activity feed with error
      const eid = this.jobEntryIds.get(job.id);
      if (eid) {
        this.execPanel.failEntry(eid, message);
        this.jobEntryIds.delete(job.id);
      }
    }
  }

  async onRetryJob(job: AgentJobItem): Promise<void> {
    this.globalError.set(null);

    const retrying = new Set(this.retryingJobs());
    retrying.add(job.id);
    this.retryingJobs.set(retrying);

    const entryId = this.execPanel.addEntry(
      'agent-job',
      `${this.getLabel(job.agentType)} (retry)`,
      'running',
      'Retrying task...',
    );
    this.jobEntryIds.set(job.id, entryId);

    try {
      const { executionId } = await this.agentApi.retryJob(job.id);

      this.updateJobStatus(job.id, 'RUNNING', executionId);

      const current = new Map(this.runningJobs());
      current.set(job.id, {
        executionId,
        phase: 'Preparing instructions...',
        startedAt: Date.now(),
      });
      this.runningJobs.set(current);
      this.startElapsedTimer();
      this.execToJobMap.set(executionId, job.id);

      if (this.wsService.connectionState$() !== 'connected') {
        this.pollRetryCounts.delete(job.id);
        this.pollErrorCounts.delete(job.id);
        this.pollJobExecution(job.id, executionId);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Error retrying task';
      this.globalError.set(message);
      const eid = this.jobEntryIds.get(job.id);
      if (eid) {
        this.execPanel.failEntry(eid, message);
        this.jobEntryIds.delete(job.id);
      }
    } finally {
      const updated = new Set(this.retryingJobs());
      updated.delete(job.id);
      this.retryingJobs.set(updated);
    }
  }

  private pollJobExecution(jobId: string, executionId: string): void {
    const retries = (this.pollRetryCounts.get(jobId) ?? 0) + 1;
    if (retries > this.MAX_POLL_RETRIES) {
      this.stopJobPolling(jobId, 'Task timed out. Try again.');
      return;
    }
    this.pollRetryCounts.set(jobId, retries);

    const errorCount = this.pollErrorCounts.get(jobId) ?? 0;
    const interval = Math.min(this.BASE_POLL_INTERVAL * Math.pow(1.5, errorCount), 15000);

    const timer = setTimeout(async () => {
      try {
        const exec = await this.agentApi.getExecution(executionId);
        this.pollErrorCounts.set(jobId, 0);

        if (
          exec.status === 'PENDING' ||
          exec.status === 'FORMATTING' ||
          exec.status === 'EXECUTING'
        ) {
          const phaseMap: Record<string, string> = {
            PENDING: 'Queued...',
            FORMATTING: 'Preparing instructions...',
            EXECUTING: 'Agent researching and analyzing...',
          };
          const phase = phaseMap[exec.status] ?? 'Agent radi...';
          const current = new Map(this.runningJobs());
          const existing = current.get(jobId);
          current.set(jobId, {
            executionId,
            phase,
            startedAt: existing?.startedAt ?? Date.now(),
          });
          this.runningJobs.set(current);

          // Update activity feed with current phase
          const eid = this.jobEntryIds.get(jobId);
          if (eid) this.execPanel.updateEntry(eid, { detail: phase });

          this.pollJobExecution(jobId, executionId);
        } else {
          // COMPLETED or FAILED — refresh jobs from server
          const current = new Map(this.runningJobs());
          current.delete(jobId);
          this.runningJobs.set(current);
          this.pollTimers.delete(jobId);
          this.pollRetryCounts.delete(jobId);
          this.pollErrorCounts.delete(jobId);
          if (current.size === 0) this.stopElapsedTimer();

          // Update activity feed
          const eid = this.jobEntryIds.get(jobId);
          if (eid) {
            if (exec.status === 'COMPLETED') {
              this.execPanel.completeEntry(eid, 'Agent completed');
            } else {
              this.execPanel.failEntry(eid, 'Agent failed');
            }
            this.jobEntryIds.delete(jobId);
          }

          // Refresh all jobs to get updated status + output
          await this.loadJobs();
          this.noteUpdated.emit();
        }
      } catch {
        const consecutive = (this.pollErrorCounts.get(jobId) ?? 0) + 1;
        this.pollErrorCounts.set(jobId, consecutive);
        if (consecutive >= this.MAX_CONSECUTIVE_ERRORS) {
          this.stopJobPolling(jobId, 'Lost connection to server. Try again.');
        } else {
          this.pollJobExecution(jobId, executionId);
        }
      }
    }, interval);

    this.pollTimers.set(jobId, timer);
  }

  private stopJobPolling(jobId: string, errorMessage: string): void {
    const current = new Map(this.runningJobs());
    current.delete(jobId);
    this.runningJobs.set(current);
    this.pollTimers.delete(jobId);
    this.pollRetryCounts.delete(jobId);
    this.pollErrorCounts.delete(jobId);
    if (current.size === 0) this.stopElapsedTimer();
    this.updateJobStatus(jobId, 'FAILED');
    this.globalError.set(errorMessage);

    // Update activity feed
    const eid = this.jobEntryIds.get(jobId);
    if (eid) {
      this.execPanel.failEntry(eid, errorMessage);
      this.jobEntryIds.delete(jobId);
    }
  }

  /** Resolve a jobId from WS event data (executionId or direct jobId) */
  private findJobByExecOrJobId(executionId: string, jobId: string | null): string | null {
    // Direct match
    if (jobId && this.jobs().some((j) => j.id === jobId)) return jobId;
    // Reverse lookup from execToJobMap
    return this.execToJobMap.get(executionId) ?? null;
  }

  /** Stop polling for a job without emitting errors */
  private cleanupJobPolling(jobId: string): void {
    const timer = this.pollTimers.get(jobId);
    if (timer) clearTimeout(timer);
    this.pollTimers.delete(jobId);
    this.pollRetryCounts.delete(jobId);
    this.pollErrorCounts.delete(jobId);
  }

  private updateJobStatus(jobId: string, status: string, executionId?: string): void {
    const updated = this.jobs().map((j) =>
      j.id === jobId
        ? {
            ...j,
            status: status as AgentJobItem['status'],
            executionId: executionId ?? j.executionId,
          }
        : j
    );
    this.jobs.set(updated);
  }

  private startElapsedTimer(): void {
    if (this.elapsedTimer) return;
    this.elapsedTimer = setInterval(() => {
      this.runningJobs.set(new Map(this.runningJobs()));
    }, 1000);
  }

  private stopElapsedTimer(): void {
    if (this.elapsedTimer) {
      clearInterval(this.elapsedTimer);
      this.elapsedTimer = null;
    }
  }

  async loadJobs(): Promise<void> {
    this.loading.set(this.jobs().length === 0);
    try {
      const response = await this.agentApi.getJobsForNote(this.note().id);
      this.jobs.set(response.jobs);
      this.budget.set({ spent: response.dailySpentEur, limit: response.dailyLimitEur });

      // Auto-expand completed results
      const expanded = new Set(this.expandedResults());
      for (const j of response.jobs) {
        if (j.status === 'COMPLETED' && j.agentOutput) {
          expanded.add(j.id);
        }
      }
      this.expandedResults.set(expanded);
    } catch (err) {
      console.error('Failed to load jobs:', err);
    } finally {
      this.loading.set(false);
    }
  }

  private async loadBudget(): Promise<void> {
    try {
      const b = await this.agentApi.getTodaysBudget();
      this.budget.set({ spent: b.spentEur, limit: b.limitEur });
    } catch {
      // best-effort
    }
  }
}
