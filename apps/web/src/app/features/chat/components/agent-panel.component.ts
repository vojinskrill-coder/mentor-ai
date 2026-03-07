import {
  Component,
  OnInit,
  OnDestroy,
  input,
  output,
  signal,
  computed,
  inject,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import type {
  NoteItem,
  AgentRecommendation,
  AgentType,
  AgentTypeInfo,
} from '@mentor-ai/shared/types';
import { AgentExecutionApiService } from '../services/agent-execution-api.service';

const AGENT_TYPE_INFO: Record<string, AgentTypeInfo> = {
  web_search: {
    type: 'web_search' as AgentType,
    label: 'Online istraživanje',
    description: 'Pretražuje internet za relevantne informacije',
    icon: '🔍',
    estimatedCostEur: 0.5,
  },
  content: {
    type: 'content' as AgentType,
    label: 'Kreiranje sadržaja',
    description: 'Generiše tekstove i sadržaj',
    icon: '✏️',
    estimatedCostEur: 0.5,
  },
  marketing: {
    type: 'marketing' as AgentType,
    label: 'Marketing analiza',
    description: 'Analizira tržište i konkurenciju',
    icon: '📈',
    estimatedCostEur: 0.5,
  },
  sales: {
    type: 'sales' as AgentType,
    label: 'Prodajna strategija',
    description: 'Kreira prodajne planove',
    icon: '💼',
    estimatedCostEur: 0.5,
  },
  financial: {
    type: 'financial' as AgentType,
    label: 'Finansijska analiza',
    description: 'ROI kalkulacije i budžetiranje',
    icon: '💰',
    estimatedCostEur: 0.5,
  },
};

interface RunningAgent {
  executionId: string;
  phase: string;
  startedAt: number;
}

@Component({
  selector: 'app-agent-panel',
  standalone: true,
  imports: [CommonModule],
  styles: [
    `
      .agent-panel {
        margin-top: 16px;
        padding: 16px;
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 8px;
      }
      .agent-panel-title {
        font-size: 14px;
        font-weight: 600;
        color: #fafafa;
        margin: 0 0 12px 0;
      }
      .agent-budget-bar {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;
        font-size: 11px;
        color: #999;
      }
      .agent-budget-track {
        flex: 1;
        height: 4px;
        background: #2a2a2a;
        border-radius: 2px;
        overflow: hidden;
      }
      .agent-budget-fill {
        height: 100%;
        background: #3b82f6;
        border-radius: 2px;
        transition: width 0.3s;
      }
      .agent-budget-fill.over-budget {
        background: #ef4444;
      }
      .agent-loading {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px 0;
        color: #999;
        font-size: 12px;
      }
      .agent-loading-spinner {
        width: 14px;
        height: 14px;
        border: 2px solid #333;
        border-top-color: #3b82f6;
        border-radius: 50%;
        animation: agent-spin 0.8s linear infinite;
      }
      @keyframes agent-spin {
        to {
          transform: rotate(360deg);
        }
      }
      .agent-cards {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .agent-card {
        background: #242424;
        border: 1px solid #2a2a2a;
        border-radius: 6px;
        padding: 12px;
      }
      .agent-card-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 4px;
      }
      .agent-icon {
        font-size: 16px;
      }
      .agent-label {
        font-size: 13px;
        font-weight: 600;
        color: #fafafa;
        flex: 1;
      }
      .agent-relevance {
        font-size: 11px;
        color: #a855f7;
        font-weight: 600;
      }
      .agent-card-reasoning {
        font-size: 11px;
        color: #999;
        margin-bottom: 8px;
        line-height: 1.4;
      }
      .agent-card-footer {
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .agent-cost {
        font-size: 11px;
        color: #666;
      }
      .agent-run-btn {
        background: transparent;
        border: 1px solid #3b82f6;
        color: #3b82f6;
        padding: 4px 12px;
        border-radius: 4px;
        font-size: 11px;
        cursor: pointer;
        transition: all 0.15s;
      }
      .agent-run-btn:hover:not(:disabled) {
        background: #3b82f6;
        color: #fff;
      }
      .agent-run-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      .agent-running {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 11px;
        color: #3b82f6;
      }
      .agent-running-text {
        display: flex;
        flex-direction: column;
        gap: 1px;
      }
      .agent-phase {
        font-weight: 500;
      }
      .agent-elapsed {
        font-size: 10px;
        color: #666;
        font-variant-numeric: tabular-nums;
      }
      .agent-running-spinner {
        width: 12px;
        height: 12px;
        border: 2px solid #333;
        border-top-color: #3b82f6;
        border-radius: 50%;
        animation: agent-spin 0.8s linear infinite;
      }
      .agent-completed-badge {
        font-size: 11px;
        color: #22c55e;
        font-weight: 600;
      }
      .agent-error-badge {
        font-size: 11px;
        color: #ef4444;
      }
      .enrichment-sections {
        margin-top: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }
      .enrichment-section {
        background: #242424;
        border: 1px solid #2a2a2a;
        border-radius: 6px;
        overflow: hidden;
      }
      .enrichment-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        background: #1a1a1a;
        border-bottom: 1px solid #2a2a2a;
        cursor: pointer;
      }
      .enrichment-header:hover {
        background: #222;
      }
      .enrichment-label {
        font-size: 13px;
        font-weight: 600;
        color: #fafafa;
        flex: 1;
      }
      .enrichment-toggle {
        font-size: 11px;
        color: #666;
      }
      .enrichment-content {
        padding: 20px 24px;
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
        border-bottom: 1px solid #2a2a2a;
      }
      .enrichment-content h2 {
        font-size: 15px;
        margin: 24px 0 10px 0;
        padding-bottom: 6px;
        border-bottom: 1px solid rgba(59, 130, 246, 0.15);
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
        border-left: 3px solid #3b82f6;
        background: rgba(59, 130, 246, 0.06);
        border-radius: 0 6px 6px 0;
        color: #d4d4d4;
        font-style: italic;
      }
      .enrichment-content blockquote p {
        margin: 4px 0;
      }
      .enrichment-content blockquote p:first-child {
        margin-top: 0;
      }
      .enrichment-content blockquote p:last-child {
        margin-bottom: 0;
      }
      .enrichment-content hr {
        border: none;
        height: 1px;
        background: linear-gradient(to right, transparent, #2a2a2a 20%, #2a2a2a 80%, transparent);
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
        background: #0d0d0d;
        border: 1px solid #1e1e1e;
        color: #d4d4d4;
        font-size: 12px;
        line-height: 1.5;
        overflow-x: auto;
      }
      .enrichment-content img {
        max-width: 100%;
        border-radius: 10px;
        margin: 16px 0;
        border: 1px solid #2a2a2a;
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
        border: 1px solid #2a2a2a;
        font-size: 12.5px;
      }
      .enrichment-content th {
        background: #1a1a1a;
        color: #f5f5f5;
        font-weight: 600;
        text-align: left;
        padding: 10px 14px;
        font-size: 11.5px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        border-bottom: 2px solid #2a2a2a;
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
        background: rgba(59, 130, 246, 0.04);
      }
      .enrichment-content del {
        color: #737373;
        text-decoration: line-through;
      }
      .agent-error-msg {
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.3);
        border-radius: 6px;
        padding: 8px 12px;
        margin-top: 8px;
        font-size: 12px;
        color: #ef4444;
      }
      .agent-empty {
        text-align: center;
        padding: 16px;
        color: #666;
        font-size: 12px;
      }
    `,
  ],
  template: `
    <div class="agent-panel">
      <h4 class="agent-panel-title">Dostupni Agenti</h4>

      @if (budget()) {
        <div class="agent-budget-bar">
          <span>{{ budget()!.spent.toFixed(2) }} / {{ budget()!.limit.toFixed(2) }} EUR</span>
          <div class="agent-budget-track">
            <div
              class="agent-budget-fill"
              [class.over-budget]="budgetPercent() >= 100"
              [style.width.%]="budgetPercent()"
            ></div>
          </div>
        </div>
      }

      @if (loading()) {
        <div class="agent-loading">
          <div class="agent-loading-spinner"></div>
          Analiziram izveštaj...
        </div>
      } @else if (recommendations().length === 0) {
        <div class="agent-empty">Nema preporučenih agenata za ovaj izveštaj.</div>
      } @else {
        <div class="agent-cards">
          @for (rec of recommendations(); track rec.agentType) {
            <div class="agent-card">
              <div class="agent-card-header">
                <span class="agent-icon">{{ getIcon(rec.agentType) }}</span>
                <span class="agent-label">{{ getLabel(rec.agentType) }}</span>
                <span class="agent-relevance">{{ rec.relevanceScore }}%</span>
              </div>
              <div class="agent-card-reasoning">{{ rec.reasoning }}</div>
              <div class="agent-card-footer">
                <span class="agent-cost">~{{ getCost(rec.agentType).toFixed(2) }} EUR</span>
                @if (isRunning(rec.agentType)) {
                  <span class="agent-running">
                    <span class="agent-running-spinner"></span>
                    <span class="agent-running-text">
                      <span class="agent-phase">{{ getPhase(rec.agentType) }}</span>
                      <span class="agent-elapsed">{{ getElapsed(rec.agentType) }}</span>
                    </span>
                  </span>
                } @else if (hasResult(rec.agentType)) {
                  <span class="agent-completed-badge">Završeno</span>
                } @else if (hasError(rec.agentType)) {
                  <span class="agent-error-badge">Greška</span>
                } @else {
                  <button
                    class="agent-run-btn"
                    [disabled]="!canRun()"
                    (click)="onRunAgent(rec.agentType)"
                  >
                    Pokreni
                  </button>
                }
              </div>
            </div>
          }
        </div>
      }

      @if (triggerError()) {
        <div class="agent-error-msg">{{ triggerError() }}</div>
      }

      @if (completedAgentTypes().length > 0) {
        <div class="enrichment-sections">
          @for (agentType of completedAgentTypes(); track agentType) {
            <div class="enrichment-section">
              <div class="enrichment-header" (click)="toggleEnrichment(agentType)">
                <span class="agent-icon">{{ getIcon(agentType) }}</span>
                <span class="enrichment-label">{{ getLabel(agentType) }}</span>
                <span class="enrichment-toggle">{{
                  isEnrichmentExpanded(agentType) ? '▼' : '▶'
                }}</span>
              </div>
              @if (isEnrichmentExpanded(agentType)) {
                <div class="enrichment-content" [innerHTML]="renderResult(agentType)"></div>
              }
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class AgentPanelComponent implements OnInit, OnDestroy {
  note = input.required<NoteItem>();
  noteUpdated = output<void>();

  private readonly agentApi = inject(AgentExecutionApiService);

  recommendations = signal<AgentRecommendation[]>([]);
  loading = signal(true);
  budget = signal<{ spent: number; limit: number } | null>(null);
  runningAgents = signal<Map<string, RunningAgent>>(new Map());
  expandedEnrichments = signal<Set<string>>(new Set());
  triggerError = signal<string | null>(null);
  agentTypeMap = signal<Record<string, AgentTypeInfo>>(AGENT_TYPE_INFO);

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

  completedAgentTypes = computed(() => {
    const enrichments = this.note().agentEnrichments;
    if (!enrichments) return [];
    return Object.keys(enrichments).filter(
      (key) => enrichments[key]?.status === 'COMPLETED' && enrichments[key]?.result
    );
  });

  canRun = computed(() => {
    const b = this.budget();
    if (!b) return false;
    return b.spent + 0.5 <= b.limit;
  });

  ngOnInit(): void {
    if (this.note().userReport) {
      this.loadRecommendations();
    } else {
      this.loading.set(false);
    }
  }

  ngOnDestroy(): void {
    for (const timer of this.pollTimers.values()) {
      clearTimeout(timer);
    }
    this.pollTimers.clear();
    this.pollRetryCounts.clear();
    this.pollErrorCounts.clear();
    this.stopElapsedTimer();
  }

  getIcon(agentType: string): string {
    return this.agentTypeMap()[agentType]?.icon ?? '🤖';
  }

  getLabel(agentType: string): string {
    return this.agentTypeMap()[agentType]?.label ?? agentType;
  }

  getCost(agentType: string): number {
    return this.agentTypeMap()[agentType]?.estimatedCostEur ?? 0.5;
  }

  isRunning(agentType: string): boolean {
    return this.runningAgents().has(agentType);
  }

  getPhase(agentType: string): string {
    return this.runningAgents().get(agentType)?.phase ?? 'Priprema...';
  }

  getElapsed(agentType: string): string {
    const agent = this.runningAgents().get(agentType);
    if (!agent) return '';
    const elapsed = Math.floor((Date.now() - agent.startedAt) / 1000);
    const min = Math.floor(elapsed / 60);
    const sec = elapsed % 60;
    if (min === 0) return `${sec}s`;
    return `${min}m ${sec.toString().padStart(2, '0')}s`;
  }

  private startElapsedTimer(): void {
    if (this.elapsedTimer) return;
    this.elapsedTimer = setInterval(() => {
      // Trigger signal re-read by creating a new Map reference
      this.runningAgents.set(new Map(this.runningAgents()));
    }, 1000);
  }

  private stopElapsedTimer(): void {
    if (this.elapsedTimer) {
      clearInterval(this.elapsedTimer);
      this.elapsedTimer = null;
    }
  }

  hasResult(agentType: string): boolean {
    const enrichments = this.note().agentEnrichments;
    return enrichments?.[agentType]?.status === 'COMPLETED' && !!enrichments[agentType]?.result;
  }

  hasError(agentType: string): boolean {
    const enrichments = this.note().agentEnrichments;
    return enrichments?.[agentType]?.status === 'FAILED';
  }

  isEnrichmentExpanded(agentType: string): boolean {
    return this.expandedEnrichments().has(agentType);
  }

  toggleEnrichment(agentType: string): void {
    const current = new Set(this.expandedEnrichments());
    if (current.has(agentType)) {
      current.delete(agentType);
    } else {
      current.add(agentType);
    }
    this.expandedEnrichments.set(current);
  }

  renderResult(agentType: string): string {
    const enrichments = this.note().agentEnrichments;
    const result = enrichments?.[agentType]?.result;
    if (!result) return '';
    const html = marked.parse(result, { async: false }) as string;
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

  async onRunAgent(agentType: string): Promise<void> {
    this.triggerError.set(null);
    try {
      const { executionId } = await this.agentApi.triggerAgent(
        this.note().id,
        agentType as AgentType
      );

      const current = new Map(this.runningAgents());
      current.set(agentType, {
        executionId,
        phase: 'Priprema instrukcija...',
        startedAt: Date.now(),
      });
      this.runningAgents.set(current);
      this.startElapsedTimer();

      this.pollRetryCounts.delete(agentType);
      this.pollErrorCounts.delete(agentType);
      this.pollExecution(agentType, executionId);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Greška pri pokretanju agenta';
      this.triggerError.set(message);
    }
  }

  private pollExecution(agentType: string, executionId: string): void {
    const retries = (this.pollRetryCounts.get(agentType) ?? 0) + 1;
    if (retries > this.MAX_POLL_RETRIES) {
      this.stopPolling(agentType, 'Agent je istekao. Pokušajte ponovo.');
      return;
    }
    this.pollRetryCounts.set(agentType, retries);

    const errorCount = this.pollErrorCounts.get(agentType) ?? 0;
    const interval = Math.min(this.BASE_POLL_INTERVAL * Math.pow(1.5, errorCount), 15000);

    const timer = setTimeout(async () => {
      try {
        const exec = await this.agentApi.getExecution(executionId);
        this.pollErrorCounts.set(agentType, 0);

        if (
          exec.status === 'PENDING' ||
          exec.status === 'FORMATTING' ||
          exec.status === 'EXECUTING'
        ) {
          const phaseMap: Record<string, string> = {
            PENDING: 'Čeka na red...',
            FORMATTING: 'Priprema instrukcija...',
            EXECUTING: 'Agent istražuje i analizira...',
          };
          const phase = phaseMap[exec.status] ?? 'Agent radi...';
          const current = new Map(this.runningAgents());
          const existing = current.get(agentType);
          current.set(agentType, {
            executionId,
            phase,
            startedAt: existing?.startedAt ?? Date.now(),
          });
          this.runningAgents.set(current);
          this.pollExecution(agentType, executionId);
        } else {
          // COMPLETED or FAILED
          const current = new Map(this.runningAgents());
          current.delete(agentType);
          this.runningAgents.set(current);
          this.pollTimers.delete(agentType);
          this.pollRetryCounts.delete(agentType);
          this.pollErrorCounts.delete(agentType);
          if (current.size === 0) this.stopElapsedTimer();
          this.noteUpdated.emit();
          this.loadBudget();
        }
      } catch {
        const consecutive = (this.pollErrorCounts.get(agentType) ?? 0) + 1;
        this.pollErrorCounts.set(agentType, consecutive);
        if (consecutive >= this.MAX_CONSECUTIVE_ERRORS) {
          this.stopPolling(agentType, 'Izgubljena veza sa serverom. Pokušajte ponovo.');
        } else {
          this.pollExecution(agentType, executionId);
        }
      }
    }, interval);

    this.pollTimers.set(agentType, timer);
  }

  private stopPolling(agentType: string, errorMessage: string): void {
    const current = new Map(this.runningAgents());
    current.delete(agentType);
    this.runningAgents.set(current);
    this.pollTimers.delete(agentType);
    this.pollRetryCounts.delete(agentType);
    this.pollErrorCounts.delete(agentType);
    if (current.size === 0) this.stopElapsedTimer();
    this.triggerError.set(errorMessage);
  }

  private async loadRecommendations(): Promise<void> {
    this.loading.set(true);
    try {
      const response = await this.agentApi.getRecommendations(this.note().id);
      this.recommendations.set(response.recommendations);
      this.budget.set({ spent: response.dailySpentEur, limit: response.dailyLimitEur });
      if (response.agentTypes?.length) {
        const map: Record<string, AgentTypeInfo> = {};
        for (const info of response.agentTypes) {
          map[info.type] = info;
        }
        this.agentTypeMap.set(map);
      }

      // Auto-expand completed enrichments
      const enrichments = this.note().agentEnrichments;
      if (enrichments) {
        const expanded = new Set<string>();
        for (const key of Object.keys(enrichments)) {
          if (enrichments[key]?.status === 'COMPLETED' && enrichments[key]?.result) {
            expanded.add(key);
          }
        }
        this.expandedEnrichments.set(expanded);
      }
    } catch (err) {
      console.error('Failed to load recommendations:', err);
      this.recommendations.set([]);
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
