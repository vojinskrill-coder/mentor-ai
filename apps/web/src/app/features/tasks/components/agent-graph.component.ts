import { Component, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { BridgeAgentStatusPayload } from '@mentor-ai/shared/types';

interface AgentNode {
  name: string;
  status: string;
  message: string;
  timestamp: string;
}

@Component({
  selector: 'app-agent-graph',
  standalone: true,
  imports: [CommonModule],
  styles: [
    `
      :host { display: block; }

      .graph-container {
        padding: 12px;
        background: #141414;
        border: 1px solid #2a2a2a;
        border-radius: 8px;
        margin-top: 10px;
      }

      .director-row {
        display: flex;
        justify-content: center;
        margin-bottom: 8px;
      }

      .agent-node {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        border-radius: 6px;
        border: 1px solid #2a2a2a;
        background: #1a1a1a;
        font-size: 12px;
        color: #a1a1a1;
        transition: all 0.2s;
      }

      .agent-node.running {
        border-color: #3b82f6;
        color: #60a5fa;
        animation: pulse 1.5s ease-in-out infinite;
      }
      .agent-node.completed {
        border-color: #22c55e;
        color: #4ade80;
      }
      .agent-node.failed {
        border-color: #ef4444;
        color: #f87171;
      }
      .agent-node.spawning {
        border-color: #eab308;
        color: #facc15;
      }
      .agent-node.waiting {
        border-color: #2a2a2a;
        color: #666;
      }

      @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.6; }
      }

      .workers-row {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        justify-content: center;
      }

      .connector {
        text-align: center;
        color: #333;
        font-size: 10px;
        margin: 2px 0;
      }

      .status-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        display: inline-block;
      }
      .status-dot.running { background: #3b82f6; }
      .status-dot.completed { background: #22c55e; }
      .status-dot.failed { background: #ef4444; }
      .status-dot.spawning { background: #eab308; }
      .status-dot.waiting { background: #444; }

      .activity-feed {
        margin-top: 8px;
        max-height: 120px;
        overflow-y: auto;
        font-size: 11px;
        color: #666;
      }

      .feed-entry {
        display: flex;
        gap: 8px;
        padding: 2px 0;
        border-bottom: 1px solid #1a1a1a;
      }
      .feed-time { color: #444; min-width: 40px; }
      .feed-agent { color: #60a5fa; min-width: 70px; }
      .feed-msg { color: #a1a1a1; flex: 1; }

      .no-activity {
        text-align: center;
        color: #444;
        font-size: 12px;
        padding: 12px;
      }
    `,
  ],
  template: `
    @if (agents().length > 0) {
      <div class="graph-container">
        <div class="director-row">
          <div class="agent-node" [class]="directorStatus()">
            {{ agentIcon('direktor') }} Direktor
          </div>
        </div>
        <div class="connector">│</div>
        <div class="workers-row">
          @for (agent of agents(); track agent.name) {
            <div class="agent-node" [class]="agent.status" [title]="agent.message">
              <span class="status-dot" [class]="agent.status"></span>
              {{ agentLabel(agent.name) }}
            </div>
          }
        </div>

        @if (activityLog().length > 0) {
          <div class="activity-feed">
            @for (entry of activityLog(); track entry.timestamp) {
              <div class="feed-entry">
                <span class="feed-time">{{ formatTime(entry.timestamp) }}</span>
                <span class="feed-agent">{{ agentLabel(entry.agent) }}</span>
                <span class="feed-msg">{{ entry.message }}</span>
              </div>
            }
          </div>
        }
      </div>
    }
  `,
})
export class AgentGraphComponent {
  /** All status events received for this task */
  readonly statusEvents = input<BridgeAgentStatusPayload[]>([]);

  /** Unique agents from status events */
  readonly agents = computed(() => {
    const events = this.statusEvents();
    const agentMap = new Map<string, AgentNode>();

    for (const event of events) {
      if (event.agent === 'direktor' || event.agent === 'main') continue;
      agentMap.set(event.agent, {
        name: event.agent,
        status: event.status,
        message: event.message,
        timestamp: event.timestamp,
      });
    }

    return Array.from(agentMap.values());
  });

  /** Director's latest status */
  readonly directorStatus = computed(() => {
    const events = this.statusEvents();
    const directorEvent = [...events].reverse().find(
      (e) => e.agent === 'direktor' || e.agent === 'main',
    );
    return directorEvent?.status ?? 'running';
  });

  /** Activity log (most recent first, max 20) */
  readonly activityLog = computed(() => {
    return [...this.statusEvents()].reverse().slice(0, 20);
  });

  agentIcon(name: string): string {
    const icons: Record<string, string> = {
      direktor: '👔', research: '🔍', financial: '📊',
      content: '✏️', marketing: '📢', sales: '💰',
      designer: '🎨', dev: '💻',
    };
    return icons[name] ?? '⚙️';
  }

  agentLabel(name: string): string {
    const labels: Record<string, string> = {
      direktor: 'Direktor', main: 'Direktor',
      research: 'Research', financial: 'Finansije',
      content: 'Sadržaj', marketing: 'Marketing',
      sales: 'Prodaja', designer: 'Dizajn', dev: 'Dev',
    };
    return labels[name] ?? name;
  }

  formatTime(timestamp: string): string {
    try {
      const d = new Date(timestamp);
      return `${d.getHours().toString().padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
    } catch {
      return '';
    }
  }
}
