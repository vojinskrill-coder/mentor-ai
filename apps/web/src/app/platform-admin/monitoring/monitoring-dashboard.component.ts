import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  OnDestroy,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

interface VaultOperation {
  id: string;
  tenantId: string;
  operationType: string;
  conceptsAffected: number;
  durationMs: number | null;
  status: string;
  details: Record<string, unknown> | null;
  error: string | null;
  createdAt: string;
}

interface VaultStats {
  vaultId: string;
  status: string;
  totalConcepts: number;
  enrichedConcepts: number;
  enrichmentProgress: number;
  categories: Array<{ name: string; count: number }>;
}

interface EnrichmentProgress {
  totalConcepts: number;
  enrichedConcepts: number;
  progressPercent: number;
  isRunning: boolean;
  currentConcept?: string;
  startedAt?: string;
}

@Component({
  selector: 'app-monitoring-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="monitoring">
      <div class="page-header">
        <div>
          <h1 class="page-title">Monitoring Dashboard</h1>
          <p class="page-subtitle">
            Real-time view of all platform operations — vault, enrichment, processes, MCP calls, brain maintenance.
          </p>
        </div>
        <div class="header-actions">
          <span class="auto-refresh" [class.active]="autoRefresh()">
            Auto-refresh: {{ autoRefresh() ? 'ON' : 'OFF' }}
          </span>
          <button class="refresh-btn" (click)="loadAll()">
            Refresh Now
          </button>
        </div>
      </div>

      <!-- Summary Cards -->
      <div class="summary-grid">
        <div class="summary-card">
          <div class="summary-icon">🧠</div>
          <div class="summary-content">
            <div class="summary-value">{{ vaultStats()?.totalConcepts ?? '—' }}</div>
            <div class="summary-label">Total Concepts</div>
          </div>
        </div>
        <div class="summary-card">
          <div class="summary-icon">✨</div>
          <div class="summary-content">
            <div class="summary-value">{{ vaultStats()?.enrichedConcepts ?? '—' }}</div>
            <div class="summary-label">Enriched</div>
          </div>
        </div>
        <div class="summary-card">
          <div class="summary-icon">{{ enrichmentProgress()?.isRunning ? '🔄' : '✅' }}</div>
          <div class="summary-content">
            <div class="summary-value">{{ enrichmentProgress()?.progressPercent ?? 0 }}%</div>
            <div class="summary-label">Enrichment Progress</div>
          </div>
        </div>
        <div class="summary-card">
          <div class="summary-icon">📊</div>
          <div class="summary-content">
            <div class="summary-value">{{ operations().length }}</div>
            <div class="summary-label">Recent Operations</div>
          </div>
        </div>
      </div>

      <!-- Enrichment Status -->
      @if (enrichmentProgress()?.isRunning) {
        <div class="enrichment-banner">
          <span class="spinner-sm"></span>
          Enriching: <strong>{{ enrichmentProgress()?.currentConcept ?? 'processing...' }}</strong>
          — {{ enrichmentProgress()?.enrichedConcepts }}/{{ enrichmentProgress()?.totalConcepts }} concepts complete
        </div>
      }

      <!-- Filter Bar -->
      <div class="filter-bar">
        <select class="filter-select" [(ngModel)]="typeFilter" (change)="loadOperations()">
          <option value="">All Operations</option>
          <option value="create">Vault Creation</option>
          <option value="enrich">Enrichment</option>
          <option value="lint">Brain Lint</option>
          <option value="dedup">Deduplication</option>
          <option value="crystallize">Crystallization</option>
          <option value="tier_consolidation">Tier Consolidation</option>
          <option value="process_deploy">Process Deploy</option>
          <option value="spec_drift">Spec Drift</option>
          <option value="spec_drift_propagation">Spec Drift Propagation</option>
          <option value="mcp_health_check">MCP Health Check</option>
        </select>
        <select class="filter-select" [(ngModel)]="statusFilter" (change)="loadOperations()">
          <option value="">All Statuses</option>
          <option value="running">Running</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      <!-- Operations Table -->
      <div class="table-wrap">
        @if (loading()) {
          <div class="loading-state"><span class="spinner-sm"></span> Loading operations...</div>
        } @else if (filteredOps().length === 0) {
          <div class="empty-state">No operations found matching the current filters.</div>
        } @else {
          <table class="ops-table">
            <thead>
              <tr>
                <th>Type</th>
                <th>Status</th>
                <th>Affected</th>
                <th>Duration</th>
                <th>Details</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              @for (op of filteredOps(); track op.id) {
                <tr [class.running]="op.status === 'running'" [class.failed]="op.status === 'failed'">
                  <td>
                    <span class="type-badge" [attr.data-type]="op.operationType">
                      {{ typeIcon(op.operationType) }} {{ typeLabel(op.operationType) }}
                    </span>
                  </td>
                  <td>
                    <span class="status-badge" [class]="'status-' + op.status">
                      {{ op.status }}
                    </span>
                  </td>
                  <td class="num-cell">{{ op.conceptsAffected }}</td>
                  <td class="num-cell">{{ formatDuration(op.durationMs) }}</td>
                  <td class="details-cell">
                    @if (op.error) {
                      <span class="error-text">{{ op.error.substring(0, 80) }}</span>
                    } @else if (op.details) {
                      <span class="details-text">{{ formatDetails(op.details) }}</span>
                    }
                  </td>
                  <td class="time-cell">{{ formatTime(op.createdAt) }}</td>
                </tr>
                @if (expandedId() === op.id && op.details) {
                  <tr class="detail-row">
                    <td colspan="6">
                      <pre class="detail-json">{{ op.details | json }}</pre>
                    </td>
                  </tr>
                }
              }
            </tbody>
          </table>
        }
      </div>

      <!-- Maintenance Actions -->
      <div class="maintenance-section">
        <h3 class="section-title">Brain Maintenance</h3>
        <div class="maintenance-actions">
          <button class="maint-btn" (click)="runMaintenance('lint')" [disabled]="maintenanceRunning()">
            🔍 Run Lint
          </button>
          <button class="maint-btn" (click)="runMaintenance('dedup')" [disabled]="maintenanceRunning()">
            🔗 Run Dedup
          </button>
          <button class="maint-btn" (click)="runMaintenance('tiers')" [disabled]="maintenanceRunning()">
            📈 Run Tier Consolidation
          </button>
          <button class="maint-btn maint-full" (click)="runMaintenance('full')" [disabled]="maintenanceRunning()">
            ⚡ Full Maintenance Cycle
          </button>
        </div>
        @if (maintenanceResult()) {
          <div class="maint-result">
            <pre>{{ maintenanceResult() | json }}</pre>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    :host { display: block; height: 100%; overflow-y: auto; background: #0D1117; }
    .monitoring { padding: 24px; max-width: 1200px; margin: 0 auto; }

    .page-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; }
    .page-title { color: #E6EDF3; font-size: 24px; font-weight: 700; margin: 0 0 4px; }
    .page-subtitle { color: #8B949E; font-size: 13px; margin: 0; }
    .header-actions { display: flex; align-items: center; gap: 12px; }
    .auto-refresh { font-size: 11px; color: #6B7280; padding: 4px 10px; border-radius: 12px; background: #161B22; border: 1px solid #21262D; }
    .auto-refresh.active { color: #3FB950; border-color: #0D2F1F; }
    .refresh-btn { padding: 8px 16px; background: #21262D; color: #E6EDF3; border: 1px solid #30363D; border-radius: 6px; font-size: 13px; cursor: pointer; }
    .refresh-btn:hover { background: #30363D; }

    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 20px; }
    .summary-card { background: #161B22; border: 1px solid #21262D; border-radius: 12px; padding: 16px 20px; display: flex; align-items: center; gap: 14px; }
    .summary-icon { font-size: 28px; }
    .summary-value { color: #E6EDF3; font-size: 24px; font-weight: 700; }
    .summary-label { color: #6B7280; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }

    .enrichment-banner { background: #0D2F1F; border: 1px solid #238636; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; color: #3FB950; font-size: 13px; display: flex; align-items: center; gap: 8px; }
    .enrichment-banner strong { color: #E6EDF3; }

    .filter-bar { display: flex; gap: 8px; margin-bottom: 16px; }
    .filter-select { padding: 8px 12px; background: #161B22; color: #C9D1D9; border: 1px solid #21262D; border-radius: 6px; font-size: 13px; }

    .table-wrap { border: 1px solid #21262D; border-radius: 8px; overflow: hidden; margin-bottom: 24px; }
    .loading-state, .empty-state { padding: 40px; text-align: center; color: #6B7280; font-size: 13px; background: #161B22; }
    .loading-state { display: flex; align-items: center; justify-content: center; gap: 8px; }

    .ops-table { width: 100%; border-collapse: collapse; background: #0D1117; font-size: 13px; }
    .ops-table thead { background: #161B22; position: sticky; top: 0; }
    .ops-table th { color: #6B7280; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; padding: 10px 12px; text-align: left; border-bottom: 1px solid #21262D; }
    .ops-table td { padding: 10px 12px; color: #C9D1D9; border-bottom: 1px solid #21262D; vertical-align: top; }
    .ops-table tbody tr:hover { background: #161B22; }
    .ops-table tbody tr.running { background: rgba(56, 189, 248, 0.05); }
    .ops-table tbody tr.failed { background: rgba(218, 54, 51, 0.05); }

    .type-badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; background: #21262D; border-radius: 4px; font-size: 11px; white-space: nowrap; }
    .status-badge { display: inline-block; padding: 2px 8px; border-radius: 10px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; }
    .status-running { background: #0D3868; color: #58A6FF; }
    .status-completed { background: #0D2F1F; color: #3FB950; }
    .status-failed { background: #3D1418; color: #DA3633; }
    .status-completed_with_errors { background: #2E2110; color: #D29922; }

    .num-cell { text-align: right; font-family: monospace; }
    .time-cell { color: #6B7280; font-size: 11px; white-space: nowrap; }
    .details-cell { max-width: 300px; }
    .details-text { color: #8B949E; font-size: 11px; }
    .error-text { color: #DA3633; font-size: 11px; }

    .detail-row td { padding: 0; }
    .detail-json { background: #161B22; padding: 12px 16px; margin: 0; font-size: 11px; color: #8B949E; max-height: 200px; overflow-y: auto; border-top: 1px solid #21262D; }

    .maintenance-section { background: #161B22; border: 1px solid #21262D; border-radius: 12px; padding: 20px; }
    .section-title { color: #E6EDF3; font-size: 15px; font-weight: 600; margin: 0 0 12px; }
    .maintenance-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .maint-btn { padding: 8px 16px; background: #21262D; color: #C9D1D9; border: 1px solid #30363D; border-radius: 6px; font-size: 13px; cursor: pointer; }
    .maint-btn:hover:not(:disabled) { background: #30363D; color: #E6EDF3; }
    .maint-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .maint-full { background: #238636; color: #E6EDF3; border-color: #238636; }
    .maint-full:hover:not(:disabled) { background: #2EA043; }
    .maint-result { margin-top: 12px; background: #0D1117; border: 1px solid #21262D; border-radius: 6px; padding: 12px; }
    .maint-result pre { font-size: 11px; color: #8B949E; margin: 0; white-space: pre-wrap; }

    .spinner-sm { display: inline-block; width: 12px; height: 12px; border: 2px solid #E6EDF340; border-top-color: #E6EDF3; border-radius: 50%; animation: spin 0.8s linear infinite; }
    @keyframes spin { to { transform: rotate(360deg); } }

    @media (max-width: 768px) {
      .summary-grid { grid-template-columns: repeat(2, 1fr); }
      .filter-bar { flex-direction: column; }
    }
  `],
})
export class MonitoringDashboardComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly apiBase = `${environment.apiUrl}/api/v1/vault`;
  private readonly tenantId = 'tnt_rljn1gj4cgxoph0hxfohv6l4'; // DEV MODE

  operations = signal<VaultOperation[]>([]);
  vaultStats = signal<VaultStats | null>(null);
  enrichmentProgress = signal<EnrichmentProgress | null>(null);
  loading = signal(false);
  autoRefresh = signal(true);
  expandedId = signal<string | null>(null);
  maintenanceRunning = signal(false);
  maintenanceResult = signal<unknown>(null);

  typeFilter = '';
  statusFilter = '';
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  filteredOps = computed(() => {
    let ops = this.operations();
    if (this.typeFilter) ops = ops.filter((o) => o.operationType === this.typeFilter);
    if (this.statusFilter) ops = ops.filter((o) => o.status === this.statusFilter);
    return ops;
  });

  ngOnInit(): void {
    this.loadAll();
    this.refreshTimer = setInterval(() => {
      if (this.autoRefresh()) this.loadAll();
    }, 30_000);
  }

  ngOnDestroy(): void {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
  }

  async loadAll(): Promise<void> {
    await Promise.all([
      this.loadOperations(),
      this.loadVaultStats(),
      this.loadEnrichmentProgress(),
    ]);
  }

  async loadOperations(): Promise<void> {
    this.loading.set(true);
    try {
      const res = await firstValueFrom(
        this.http.get<{ data: VaultOperation[] }>(
          `${this.apiBase}/operations?tenantId=${this.tenantId}&limit=50`,
        ),
      );
      this.operations.set(res.data ?? []);
    } catch {
      // silent
    } finally {
      this.loading.set(false);
    }
  }

  async loadVaultStats(): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.http.get<{ data: VaultStats | null }>(
          `${this.apiBase}/stats?tenantId=${this.tenantId}`,
        ),
      );
      this.vaultStats.set(res.data);
    } catch { /* silent */ }
  }

  async loadEnrichmentProgress(): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.http.get<{ data: EnrichmentProgress | null }>(
          `${this.apiBase}/enrichment-progress?tenantId=${this.tenantId}`,
        ),
      );
      this.enrichmentProgress.set(res.data);
    } catch { /* silent */ }
  }

  async runMaintenance(type: string): Promise<void> {
    this.maintenanceRunning.set(true);
    this.maintenanceResult.set(null);
    try {
      const res = await firstValueFrom(
        this.http.post<{ data: unknown }>(
          `${this.apiBase}/maintenance/${type}`,
          { tenantId: this.tenantId },
        ),
      );
      this.maintenanceResult.set(res.data);
      await this.loadAll(); // Refresh after maintenance
    } catch (e) {
      this.maintenanceResult.set({ error: (e as Error).message });
    } finally {
      this.maintenanceRunning.set(false);
    }
  }

  typeIcon(type: string): string {
    const icons: Record<string, string> = {
      create: '🏗️', enrich: '✨', lint: '🔍', dedup: '🔗',
      crystallize: '💎', tier_consolidation: '📈', process_deploy: '🚀',
      spec_drift: '⚠️', spec_drift_propagation: '🔄', mcp_health_check: '💊',
    };
    return icons[type] ?? '📋';
  }

  typeLabel(type: string): string {
    const labels: Record<string, string> = {
      create: 'Vault Creation', enrich: 'Enrichment', lint: 'Brain Lint',
      dedup: 'Dedup', crystallize: 'Crystallize', tier_consolidation: 'Tier Change',
      process_deploy: 'Process Deploy', spec_drift: 'Spec Drift',
      spec_drift_propagation: 'Drift Propagation', mcp_health_check: 'MCP Health',
    };
    return labels[type] ?? type;
  }

  formatDuration(ms: number | null): string {
    if (!ms) return '—';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60_000).toFixed(1)}m`;
  }

  formatTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      + ' ' + d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
  }

  formatDetails(details: Record<string, unknown>): string {
    const keys = Object.keys(details).slice(0, 3);
    return keys.map((k) => {
      const v = details[k];
      const val = typeof v === 'string' ? v.substring(0, 30) : JSON.stringify(v)?.substring(0, 30);
      return `${k}: ${val}`;
    }).join(' | ');
  }
}
