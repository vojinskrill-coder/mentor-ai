import { Component, input, output, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { AgentEnrichments, AgentEnrichmentEntry, DeliverableFile, DeliverableAction } from '@mentor-ai/shared/types';

@Component({
  selector: 'app-agent-contributions',
  standalone: true,
  imports: [CommonModule],
  styles: [
    `
      :host { display: block; }

      .contributions {
        margin-top: 12px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .contribution-section {
        background: #141414;
        border: 1px solid #2a2a2a;
        border-radius: 8px;
        overflow: hidden;
      }

      .contribution-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 12px;
        background: #1a1a1a;
        cursor: pointer;
        user-select: none;
      }
      .contribution-header:hover {
        background: #1e1e1e;
      }

      .contribution-number {
        width: 22px;
        height: 22px;
        border-radius: 50%;
        background: rgba(59, 130, 246, 0.15);
        color: #3b82f6;
        font-size: 12px;
        font-weight: 700;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .contribution-icon {
        font-size: 16px;
      }

      .contribution-agent {
        font-size: 13px;
        font-weight: 600;
        color: #fafafa;
      }

      .contribution-summary {
        font-size: 12px;
        color: #a1a1a1;
        margin-left: auto;
        max-width: 300px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .contribution-body {
        padding: 12px;
      }

      .contribution-text {
        font-size: 13px;
        color: #ccc;
        line-height: 1.6;
        max-height: 300px;
        overflow-y: auto;
        white-space: pre-wrap;
      }

      .files-section {
        margin-top: 10px;
        display: flex;
        flex-wrap: wrap;
        gap: 6px;
      }

      .file-chip {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 10px;
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 6px;
        font-size: 12px;
        color: #a1a1a1;
        cursor: pointer;
        transition: border-color 0.15s;
      }
      .file-chip:hover {
        border-color: #3b82f6;
        color: #60a5fa;
      }

      .actions-section {
        margin-top: 10px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      .action-row {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
      }

      .action-checkbox {
        accent-color: #3b82f6;
      }

      .action-label {
        color: #a1a1a1;
      }

      .action-status {
        margin-left: auto;
        font-size: 11px;
        padding: 2px 6px;
        border-radius: 4px;
      }
      .action-status.completed {
        background: rgba(34, 197, 94, 0.15);
        color: #4ade80;
      }
      .action-status.executing {
        background: rgba(59, 130, 246, 0.15);
        color: #60a5fa;
      }
      .action-status.failed {
        background: rgba(239, 68, 68, 0.15);
        color: #f87171;
      }

      .metrics-row {
        display: flex;
        gap: 12px;
        margin-top: 8px;
        font-size: 12px;
        color: #666;
      }
      .metric-item {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .metric-value {
        color: #a1a1a1;
        font-weight: 500;
      }

      .approve-actions-btn {
        margin-top: 12px;
        padding: 8px 16px;
        border-radius: 6px;
        border: none;
        background: #3b82f6;
        color: #fff;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.15s;
      }
      .approve-actions-btn:hover { background: #2563eb; }
      .approve-actions-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    `,
  ],
  template: `
    @if (hasContributions()) {
      <div class="contributions">
        @if (totalSelectedActions() > 0) {
          <button class="approve-actions-btn" (click)="approveSelected()">
            Odobri izabrano ({{ totalSelectedActions() }})
          </button>
        }
        @for (entry of sortedEntries(); track entry.agentType; let idx = $index) {
          <div class="contribution-section">
            <div class="contribution-header" (click)="toggleExpanded(entry.agentType)">
              <span class="contribution-number">{{ idx + 1 }}</span>
              <span class="contribution-icon">{{ agentIcon(entry.agentType) }}</span>
              <span class="contribution-agent">{{ agentLabel(entry.agentType) }}</span>
              @if (entry.data.summary) {
                <span class="contribution-summary">{{ entry.data.summary }}</span>
              }
            </div>

            @if (expandedAgents().has(entry.agentType)) {
              <div class="contribution-body">
                @if (entry.data.result) {
                  <div class="contribution-text">{{ entry.data.result }}</div>
                }

                @if (entry.data.files?.length) {
                  <div class="files-section">
                    @for (file of entry.data.files; track file.name) {
                      <button class="file-chip" (click)="downloadFile.emit(file)">
                        {{ fileIcon(file.mimeType) }} {{ file.displayName || file.name }}
                      </button>
                    }
                  </div>
                }

                @if (entry.data.actions?.length) {
                  <div class="actions-section">
                    @for (action of entry.data.actions; track action.id) {
                      <div class="action-row">
                        <input type="checkbox"
                               class="action-checkbox"
                               [checked]="selectedActions().has(action.id)"
                               [disabled]="action.status === 'completed' || action.status === 'executing'"
                               (change)="toggleAction(action.id)" />
                        <span class="action-label">{{ action.label }}</span>
                        @if (action.status && action.status !== 'none') {
                          <span class="action-status" [class]="action.status">
                            {{ actionStatusLabel(action.status) }}
                          </span>
                        }
                      </div>
                    }
                  </div>
                }

                @if (entry.data.metrics && objectKeys(entry.data.metrics).length > 0) {
                  <div class="metrics-row">
                    @for (key of objectKeys(entry.data.metrics!); track key) {
                      <span class="metric-item">
                        {{ key }}: <span class="metric-value">{{ entry.data.metrics![key] }}</span>
                      </span>
                    }
                  </div>
                }
              </div>
            }
          </div>
        }
      </div>
    }
  `,
})
export class AgentContributionsComponent {
  readonly enrichments = input<AgentEnrichments | null>(null);
  readonly noteId = input<string>('');
  readonly downloadFile = output<DeliverableFile>();
  readonly executeAction = output<{ noteId: string; agentType: string; actionId: string }>();

  readonly expandedAgents = signal(new Set<string>());
  readonly selectedActions = signal(new Set<string>());

  private static readonly AGENT_ORDER = ['research', 'content', 'marketing', 'sales', 'financial', 'designer', 'dev'];

  readonly hasContributions = computed(() => {
    const e = this.enrichments();
    return !!e && Object.keys(e).length > 0;
  });

  readonly sortedEntries = computed(() => {
    const e = this.enrichments();
    if (!e) return [];

    return Object.entries(e)
      .map(([agentType, data]) => ({ agentType, data }))
      .sort((a, b) => {
        const ai = AgentContributionsComponent.AGENT_ORDER.indexOf(a.agentType);
        const bi = AgentContributionsComponent.AGENT_ORDER.indexOf(b.agentType);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });
  });

  toggleExpanded(agentType: string): void {
    const next = new Set(this.expandedAgents());
    if (next.has(agentType)) next.delete(agentType);
    else next.add(agentType);
    this.expandedAgents.set(next);
  }

  readonly totalSelectedActions = computed(() => this.selectedActions().size);

  toggleAction(actionId: string): void {
    const next = new Set(this.selectedActions());
    if (next.has(actionId)) next.delete(actionId);
    else next.add(actionId);
    this.selectedActions.set(next);
  }

  approveSelected(): void {
    const nId = this.noteId();
    for (const entry of this.sortedEntries()) {
      for (const action of entry.data.actions ?? []) {
        if (this.selectedActions().has(action.id)) {
          this.executeAction.emit({ noteId: nId, agentType: entry.agentType, actionId: action.id });
        }
      }
    }
    this.selectedActions.set(new Set());
  }

  agentIcon(name: string): string {
    const icons: Record<string, string> = {
      research: '🔍', financial: '📊', content: '✏️',
      marketing: '📢', sales: '💰', designer: '🎨', dev: '💻',
    };
    return icons[name] ?? '⚙️';
  }

  agentLabel(name: string): string {
    const labels: Record<string, string> = {
      research: 'Istraživanje', financial: 'Finansije',
      content: 'Sadržaj', marketing: 'Marketing',
      sales: 'Prodaja', designer: 'Dizajn', dev: 'Razvoj',
    };
    return labels[name] ?? name;
  }

  fileIcon(mimeType: string): string {
    if (mimeType.includes('spreadsheet') || mimeType.includes('excel')) return '📊';
    if (mimeType.includes('presentation') || mimeType.includes('pptx')) return '📽️';
    if (mimeType.includes('pdf')) return '📄';
    if (mimeType.includes('image')) return '🖼️';
    if (mimeType.includes('html')) return '🌐';
    if (mimeType.includes('markdown') || mimeType.includes('text')) return '📝';
    return '📎';
  }

  actionStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      pending: '⏳ Na čekanju',
      executing: '⏳ Izvršava se...',
      completed: '✅ Završeno',
      failed: '❌ Greška',
    };
    return labels[status] ?? status;
  }

  objectKeys(obj: Record<string, unknown>): string[] {
    return Object.keys(obj);
  }
}
