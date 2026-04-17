import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ChatWebsocketService } from '../chat/services/chat-websocket.service';
import { PageLoadingService } from '../../core/services/page-loading.service';
import type { TaskHubItem, AgentEnrichments, AgentEnrichmentEntry, DeliverableFile } from '@mentor-ai/shared/types';

interface AgentGroup {
  agentType: string;
  icon: string;
  label: string;
  items: Array<{
    task: TaskHubItem;
    enrichment: AgentEnrichmentEntry;
  }>;
}

@Component({
  selector: 'app-materijali',
  standalone: true,
  imports: [CommonModule],
  styles: [
    `
      :host { display: block; }

      .page { padding: 24px; max-width: 1200px; }
      .page-header { margin-bottom: 24px; }
      .page-title { font-size: 26px; font-weight: 600; margin-bottom: 4px; }
      .page-desc { font-size: 15px; color: #a1a1a1; }

      .agent-filters {
        display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 20px;
      }
      .agent-filter {
        display: inline-flex; align-items: center; gap: 6px;
        padding: 6px 14px; border-radius: 999px;
        background: #161B22; border: 1px solid #21262D;
        font-size: 14px; color: #a1a1a1; cursor: pointer;
        transition: all 0.15s;
      }
      .agent-filter:hover { border-color: #30363D; color: #E6EDF3; }
      .agent-filter.active { border-color: #58A6FF; color: #58A6FF; background: rgba(88,166,255,0.08); }
      .agent-filter .count {
        background: #1C2128; padding: 1px 6px; border-radius: 999px; font-size: 12px; font-weight: 600;
      }
      .agent-filter.active .count { background: rgba(88,166,255,0.2); color: #58A6FF; }

      .agent-section { margin-bottom: 32px; }
      .agent-header {
        display: flex; align-items: center; gap: 10px;
        padding-bottom: 10px; border-bottom: 1px solid #21262D; margin-bottom: 12px;
      }
      .agent-icon { font-size: 20px; }
      .agent-name { font-size: 18px; font-weight: 600; color: #E6EDF3; }
      .agent-count { font-size: 13px; color: #6E7681; }

      .material-card {
        background: #161B22; border: 1px solid #21262D; border-radius: 10px;
        padding: 16px; margin-bottom: 10px; transition: border-color 0.15s;
      }
      .material-card:hover { border-color: #30363D; }

      .material-title { font-size: 15px; font-weight: 600; color: #E6EDF3; margin-bottom: 4px; }
      .material-task { font-size: 12px; color: #6E7681; margin-bottom: 8px; }
      .material-summary { font-size: 13px; color: #a1a1a1; line-height: 1.5; margin-bottom: 10px; }

      .material-content {
        font-size: 13px; color: #ccc; line-height: 1.6;
        max-height: 200px; overflow: hidden; white-space: pre-wrap;
        background: #161B22; border-radius: 6px; padding: 12px;
        margin-bottom: 10px; position: relative;
      }
      .material-content.expanded { max-height: none; }
      .expand-btn {
        display: block; margin-top: 6px; font-size: 12px; color: #58A6FF;
        background: none; border: none; cursor: pointer; padding: 0;
      }

      .files-row { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
      .file-chip {
        display: inline-flex; align-items: center; gap: 4px;
        padding: 5px 12px; background: #1C2128; border: 1px solid #21262D;
        border-radius: 6px; font-size: 12px; color: #a1a1a1;
        cursor: pointer; transition: all 0.15s; text-decoration: none;
      }
      .file-chip:hover { border-color: #58A6FF; color: #60a5fa; }

      .metrics-row {
        display: flex; gap: 16px; font-size: 12px; color: #6E7681; margin-top: 6px;
      }
      .metric { display: flex; gap: 4px; }
      .metric-val { color: #a1a1a1; font-weight: 500; }

      .score-badge {
        display: inline-flex; padding: 2px 8px; border-radius: 4px;
        font-size: 12px; font-weight: 600; margin-left: 8px;
      }
      .score-high { background: rgba(63,185,80,0.15); color: #4ade80; }
      .score-medium { background: rgba(251,191,36,0.15); color: #fbbf24; }
      .score-low { background: rgba(248,113,113,0.15); color: #f87171; }

      .empty-state {
        text-align: center; padding: 60px 20px; color: #6E7681;
      }
      .empty-state h3 { color: #a1a1a1; margin-bottom: 8px; }

      .loading { text-align: center; padding: 40px; color: #6E7681; }
    `,
  ],
  template: `
    <div class="page">
      <div class="page-header">
        <h1 class="page-title">Materials</h1>
        <p class="page-desc">All materials created by AI agents, grouped by team.</p>
      </div>

      @if (isLoading()) {
        <div class="loading">Loading materials...</div>
      } @else if (agentGroups().length === 0) {
        <div class="empty-state">
          <h3>No materials yet</h3>
          <p>Materials will appear here when AI agents complete tasks.</p>
        </div>
      } @else {
        <div class="agent-filters">
          <button class="agent-filter" [class.active]="!activeFilter()" (click)="activeFilter.set(null)">
            All <span class="count">{{ totalItems() }}</span>
          </button>
          @for (group of agentGroups(); track group.agentType) {
            <button class="agent-filter" [class.active]="activeFilter() === group.agentType"
                    (click)="activeFilter.set(group.agentType)">
              {{ group.icon }} {{ group.label }} <span class="count">{{ group.items.length }}</span>
            </button>
          }
        </div>

        @for (group of filteredGroups(); track group.agentType) {
          <div class="agent-section">
            <div class="agent-header">
              <span class="agent-icon">{{ group.icon }}</span>
              <span class="agent-name">{{ group.label }}</span>
              <span class="agent-count">{{ group.items.length }} material{{ group.items.length > 1 ? 's' : '' }}</span>
            </div>

            @for (item of group.items; track item.task.id + item.enrichment.executionId) {
              <div class="material-card">
                <div class="material-title">
                  {{ item.task.title }}
                  @if (item.task.aiScore != null) {
                    <span class="score-badge" [class]="scoreClass(item.task.aiScore)">{{ item.task.aiScore }}</span>
                  }
                </div>
                <div class="material-task">
                  @if (item.task.conceptName) { {{ item.task.conceptName }} · }
                  {{ item.task.createdAt | date:'dd.MM.yyyy' }}
                </div>

                @if (item.enrichment.summary) {
                  <div class="material-summary">{{ item.enrichment.summary }}</div>
                }

                @if (item.enrichment.result) {
                  <div class="material-content" [class.expanded]="expandedItems().has(item.task.id + group.agentType)">
                    {{ item.enrichment.result }}
                  </div>
                  <button class="expand-btn" (click)="toggleExpand(item.task.id + group.agentType)">
                    {{ expandedItems().has(item.task.id + group.agentType) ? 'Show less' : 'Show more...' }}
                  </button>
                }

                @if (taskFiles().get(item.task.id); as files) {
                  <div class="files-row">
                    @for (file of files; track file.path) {
                      <a class="file-chip" [href]="'/api/v1/notes/files/download?path=' + encodeURI(file.path)" target="_blank">
                        {{ fileIcon(file.mimeType) }} {{ file.name }}
                      </a>
                    }
                  </div>
                } @else if (item.enrichment.files?.length) {
                  <div class="files-row">
                    @for (file of item.enrichment.files; track file.name) {
                      <a class="file-chip" [href]="'/api/v1/notes/files/download?path=' + encodeURI(file.path)" target="_blank">
                        {{ fileIcon(file.mimeType) }} {{ file.displayName || file.name }}
                      </a>
                    }
                  </div>
                }

                @if (item.enrichment.metrics && objectKeys(item.enrichment.metrics).length > 0) {
                  <div class="metrics-row">
                    @for (key of objectKeys(item.enrichment.metrics!); track key) {
                      <span class="metric">{{ key }}: <span class="metric-val">{{ item.enrichment.metrics![key] }}</span></span>
                    }
                  </div>
                }
              </div>
            }
          </div>
        }
      }
    </div>
  `,
})
export class MaterijaliComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly wsService = inject(ChatWebsocketService);
  private readonly pageLoading = inject(PageLoadingService);
  private readonly wsUnsubFns: Array<() => void> = [];

  readonly isLoading = signal(true);
  readonly activeFilter = signal<string | null>(null);
  readonly expandedItems = signal(new Set<string>());
  readonly allTasks = signal<TaskHubItem[]>([]);
  readonly taskFiles = signal(new Map<string, Array<{ name: string; path: string; mimeType: string }>>());

  private static readonly AGENT_META: Record<string, { icon: string; label: string; order: number }> = {
    research: { icon: '🔍', label: 'Research', order: 0 },
    content: { icon: '✏️', label: 'Content', order: 1 },
    marketing: { icon: '📢', label: 'Marketing', order: 2 },
    sales: { icon: '💰', label: 'Sales', order: 3 },
    financial: { icon: '📊', label: 'Finance', order: 4 },
    designer: { icon: '🎨', label: 'Design', order: 5 },
    dev: { icon: '💻', label: 'Development', order: 6 },
    web_search: { icon: '🌐', label: 'Web Search', order: 7 },
  };

  readonly agentGroups = computed<AgentGroup[]>(() => {
    const tasks = this.allTasks();
    const groupMap = new Map<string, AgentGroup['items']>();

    for (const task of tasks) {
      const enrichments = task.agentEnrichments as AgentEnrichments | null;
      if (!enrichments) continue;

      for (const [agentType, entry] of Object.entries(enrichments)) {
        if (!entry.result && !entry.files?.length) continue; // Skip empty contributions
        if (!groupMap.has(agentType)) groupMap.set(agentType, []);
        groupMap.get(agentType)!.push({ task, enrichment: entry });
      }
    }

    return Array.from(groupMap.entries())
      .map(([agentType, items]) => ({
        agentType,
        icon: MaterijaliComponent.AGENT_META[agentType]?.icon ?? '⚙️',
        label: MaterijaliComponent.AGENT_META[agentType]?.label ?? agentType,
        items: items.sort((a, b) => new Date(b.task.createdAt).getTime() - new Date(a.task.createdAt).getTime()),
      }))
      .sort((a, b) =>
        (MaterijaliComponent.AGENT_META[a.agentType]?.order ?? 99) -
        (MaterijaliComponent.AGENT_META[b.agentType]?.order ?? 99)
      );
  });

  readonly filteredGroups = computed(() => {
    const filter = this.activeFilter();
    if (!filter) return this.agentGroups();
    return this.agentGroups().filter(g => g.agentType === filter);
  });

  readonly totalItems = computed(() =>
    this.agentGroups().reduce((sum, g) => sum + g.items.length, 0)
  );

  private isInitialLoad = true;

  ngOnInit(): void {
    this.loadTasks();

    // Auto-refresh when new deliverables arrive
    this.wsUnsubFns.push(
      this.wsService.onBridgeTaskComplete(() => this.loadTasks()),
      this.wsService.onBridgeTaskContribution(() => this.loadTasks()),
    );
  }

  ngOnDestroy(): void {
    this.wsUnsubFns.forEach((unsub) => unsub());
  }

  private loadTasks(): void {
    if (this.isInitialLoad) this.pageLoading.start();
    this.http.get<{ data: { tasks: TaskHubItem[] } }>('/api/v1/notes/tasks?limit=100')
      .subscribe({
        next: (res) => {
          const withEnrichments = res.data.tasks.filter(t => t.agentEnrichments && Object.keys(t.agentEnrichments).length > 0);
          this.allTasks.set(withEnrichments);
          this.isLoading.set(false);
          if (this.isInitialLoad) { this.pageLoading.stop(); this.isInitialLoad = false; }
          // Scan deliverables for each task in parallel
          for (const task of withEnrichments) {
            this.scanDeliverables(task.id);
          }
        },
        error: (err) => {
          console.error('Materijali: Failed to load tasks', err);
          this.isLoading.set(false);
          if (this.isInitialLoad) { this.pageLoading.stop(); this.isInitialLoad = false; }
        },
      });
  }

  private static readonly DELIVERABLE_EXTS = new Set([
    'xlsx', 'pptx', 'pdf', 'png', 'jpg', 'jpeg', 'svg', 'csv', 'zip', 'docx', 'gif', 'mp4', 'mp3',
  ]);

  private scanDeliverables(noteId: string): void {
    this.http.get<{ data: Array<{ name: string; path: string; mimeType: string }> }>(`/api/v1/notes/files/scan/${noteId}`)
      .subscribe({
        next: (res) => {
          if (res.data?.length) {
            // Only show real deliverables — no .md docs, no source code
            const filtered = res.data.filter(f => {
              const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
              return MaterijaliComponent.DELIVERABLE_EXTS.has(ext);
            });
            if (filtered.length) {
              const next = new Map(this.taskFiles());
              next.set(noteId, filtered);
              this.taskFiles.set(next);
            }
          }
        },
        error: () => { /* ignore — fallback to enrichment files */ },
      });
  }

  toggleExpand(key: string): void {
    const next = new Set(this.expandedItems());
    if (next.has(key)) next.delete(key);
    else next.add(key);
    this.expandedItems.set(next);
  }

  scoreClass(score: number): string {
    if (score >= 80) return 'score-high';
    if (score >= 50) return 'score-medium';
    return 'score-low';
  }

  fileIcon(mimeType: string): string {
    if (mimeType?.includes('spreadsheet') || mimeType?.includes('excel')) return '📊';
    if (mimeType?.includes('presentation') || mimeType?.includes('pptx')) return '📽️';
    if (mimeType?.includes('pdf')) return '📄';
    if (mimeType?.includes('image')) return '🖼️';
    if (mimeType?.includes('html')) return '🌐';
    return '📎';
  }

  encodeURI(path: string): string {
    return encodeURIComponent(path);
  }

  objectKeys(obj: Record<string, unknown>): string[] {
    return Object.keys(obj);
  }
}
