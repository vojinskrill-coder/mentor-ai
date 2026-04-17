import { Component, input, output, signal } from '@angular/core';

export interface BrochureIdea {
  title: string;
  audience: string;
  purpose: string;
  format: string;
  contentOutline: Array<{ pageNum: number; description: string }>;
  score: number;
  reasoning: string;
  messaging?: string;
  story?: string;
}

@Component({
  selector: 'app-brochure-ideas',
  standalone: true,
  template: `
    <div class="ideas-container">
      <div class="ideas-header">
        <h3 class="ideas-title">Predlozi za brosuru</h3>
        <p class="ideas-subtitle">AI je istrazio i predlozio {{ ideas().length }} koncepata. Pregledajte detalje i izaberite jedan.</p>
      </div>

      <div class="ideas-list">
        @for (idea of ideas(); track idea.title; let i = $index) {
          <div class="idea-row" [class.selected]="selectedIndex() === i" [class.expanded]="expandedIndex() === i">

            <!-- Row header — always visible -->
            <div class="row-header" (click)="toggleExpand(i)">
              <div class="row-left">
                <div class="radio" [class.checked]="selectedIndex() === i" (click)="select(i, $event)">
                  @if (selectedIndex() === i) {
                    <div class="radio-dot"></div>
                  }
                </div>
                <div class="row-info">
                  <span class="row-title">{{ idea.title }}</span>
                  <span class="row-meta">{{ idea.audience }} · {{ idea.format }}</span>
                </div>
              </div>
              <div class="row-right">
                <div class="score-badge" [class.high]="idea.score >= 8" [class.mid]="idea.score >= 5 && idea.score < 8" [class.low]="idea.score < 5">
                  {{ idea.score }}<span class="score-max">/10</span>
                </div>
                <div class="expand-icon" [class.rotated]="expandedIndex() === i">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                    <path d="M4 6L8 10L12 6" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                  </svg>
                </div>
              </div>
            </div>

            <!-- Expandable details -->
            @if (expandedIndex() === i) {
              <div class="row-details">
                <div class="detail-grid">

                  <div class="detail-section">
                    <div class="detail-label">Svrha</div>
                    <div class="detail-value">{{ idea.purpose }}</div>
                  </div>

                  <div class="detail-section">
                    <div class="detail-label">Ciljna publika</div>
                    <div class="detail-value">{{ idea.audience }}</div>
                  </div>

                  <div class="detail-section full">
                    <div class="detail-label">Zasto pravimo ovu brosuru</div>
                    <div class="detail-value">{{ idea.reasoning }}</div>
                  </div>

                  @if (idea.messaging || idea.story) {
                    <div class="detail-section full">
                      <div class="detail-label">Prica i messaging</div>
                      <div class="detail-value">{{ idea.messaging || idea.story || '' }}</div>
                    </div>
                  }

                  <div class="detail-section full">
                    <div class="detail-label">Sta postizemo</div>
                    <div class="detail-value purpose-highlight">{{ idea.purpose }}</div>
                  </div>

                  <div class="detail-section full">
                    <div class="detail-label">Struktura stranica</div>
                    <div class="outline-list">
                      @for (page of idea.contentOutline; track page.pageNum) {
                        <div class="outline-item">
                          <span class="outline-num">{{ page.pageNum }}</span>
                          <span class="outline-desc">{{ page.description }}</span>
                        </div>
                      }
                    </div>
                  </div>

                  <div class="detail-section">
                    <div class="detail-label">Format</div>
                    <div class="detail-value">{{ idea.format }}</div>
                  </div>

                  <div class="detail-section">
                    <div class="detail-label">Skor</div>
                    <div class="score-detail">
                      <div class="score-bar">
                        <div class="score-fill" [style.width.%]="idea.score * 10"></div>
                      </div>
                      <span class="score-text">{{ idea.score }}/10</span>
                    </div>
                  </div>

                </div>
              </div>
            }
          </div>
        }
      </div>

      @if (selectedIndex() !== null) {
        <div class="ideas-actions">
          <button class="btn-approve" (click)="approve()">
            Nastavi sa "{{ selectedIndex() !== null ? ideas()[selectedIndex()!]?.title : '' }}"
          </button>
          <button class="btn-reject" (click)="reject()">
            Odbij sve
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    .ideas-container { padding: 8px 0; }

    .ideas-header { margin-bottom: 20px; }
    .ideas-title { color: #E6EDF3; font-size: 18px; font-weight: 600; margin: 0 0 4px; }
    .ideas-subtitle { color: #6B7280; font-size: 13px; margin: 0; }

    .ideas-list { display: flex; flex-direction: column; gap: 2px; }

    /* ═══ Row ═══ */
    .idea-row {
      background: #161B22; border: 1px solid #21262D; border-radius: 8px;
      overflow: hidden; transition: border-color 0.15s;
    }
    .idea-row:hover { border-color: #58A6FF40; }
    .idea-row.selected { border-color: #C9A96E; }
    .idea-row.expanded { border-color: #58A6FF; }

    .row-header {
      display: flex; justify-content: space-between; align-items: center;
      padding: 14px 16px; cursor: pointer; user-select: none;
    }
    .row-left { display: flex; align-items: center; gap: 14px; flex: 1; min-width: 0; }
    .row-right { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }

    /* Radio */
    .radio {
      width: 20px; height: 20px; border-radius: 50%; border: 2px solid #3A3A3A;
      display: flex; align-items: center; justify-content: center;
      flex-shrink: 0; cursor: pointer; transition: border-color 0.15s;
    }
    .radio:hover { border-color: #C9A96E; }
    .radio.checked { border-color: #C9A96E; }
    .radio-dot { width: 10px; height: 10px; border-radius: 50%; background: #C9A96E; }

    .row-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .row-title { color: #E6EDF3; font-size: 14px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .row-meta { color: #6B7280; font-size: 12px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

    /* Score badge */
    .score-badge {
      font-size: 14px; font-weight: 700; padding: 4px 8px; border-radius: 4px;
      min-width: 44px; text-align: center;
    }
    .score-badge.high { background: #C9A96E20; color: #C9A96E; }
    .score-badge.mid { background: #58A6FF20; color: #58A6FF; }
    .score-badge.low { background: #6B728020; color: #6B7280; }
    .score-max { font-size: 10px; font-weight: 400; opacity: 0.6; }

    .expand-icon { color: #6B7280; transition: transform 0.2s; display: flex; }
    .expand-icon.rotated { transform: rotate(180deg); }

    /* ═══ Expandable details ═══ */
    .row-details {
      padding: 0 16px 16px; border-top: 1px solid #1C2128;
    }

    .detail-grid {
      display: grid; grid-template-columns: 1fr 1fr; gap: 16px;
      padding-top: 16px;
    }
    .detail-section.full { grid-column: 1 / -1; }

    .detail-label {
      color: #C9A96E; font-size: 11px; font-weight: 600;
      text-transform: uppercase; letter-spacing: 0.8px; margin-bottom: 6px;
    }
    .detail-value { color: #B0B0B0; font-size: 13px; line-height: 1.6; }
    .purpose-highlight { color: #E6EDF3; font-weight: 500; }

    /* Outline */
    .outline-list { display: flex; flex-direction: column; gap: 6px; }
    .outline-item { display: flex; gap: 10px; align-items: flex-start; }
    .outline-num {
      width: 24px; height: 24px; border-radius: 50%; background: #C9A96E15;
      color: #C9A96E; font-size: 11px; font-weight: 700;
      display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    }
    .outline-desc { color: #808080; font-size: 12px; line-height: 1.5; padding-top: 3px; }

    /* Score bar */
    .score-detail { display: flex; align-items: center; gap: 10px; }
    .score-bar { flex: 1; height: 6px; background: #1C2128; border-radius: 3px; overflow: hidden; }
    .score-fill { height: 100%; background: #C9A96E; border-radius: 3px; transition: width 0.3s; }
    .score-text { color: #C9A96E; font-size: 14px; font-weight: 700; }

    /* ═══ Actions ═══ */
    .ideas-actions {
      display: flex; gap: 12px; margin-top: 20px; padding-top: 16px;
      border-top: 1px solid #21262D;
    }
    .btn-approve {
      flex: 1; padding: 12px 20px; border-radius: 6px; border: none;
      background: #C9A96E; color: #0D1117; font-weight: 600; font-size: 14px;
      cursor: pointer; transition: background 0.15s;
    }
    .btn-approve:hover { background: #D4B87A; }
    .btn-reject {
      padding: 12px 20px; border-radius: 6px; border: 1px solid #21262D;
      background: transparent; color: #6B7280; font-size: 13px; cursor: pointer;
      transition: border-color 0.15s, color 0.15s;
    }
    .btn-reject:hover { border-color: #ef4444; color: #ef4444; }
  `],
})
export class BrochureIdeasComponent {
  ideas = input.required<BrochureIdea[]>();
  ideaApproved = output<BrochureIdea>();
  ideaRejected = output<void>();

  selectedIndex = signal<number | null>(null);
  expandedIndex = signal<number | null>(null);

  select(index: number, event: Event): void {
    event.stopPropagation();
    this.selectedIndex.set(index);
  }

  toggleExpand(index: number): void {
    this.expandedIndex.set(this.expandedIndex() === index ? null : index);
  }

  approve(): void {
    const idx = this.selectedIndex();
    if (idx !== null) {
      const idea = this.ideas()[idx];
      if (idea) this.ideaApproved.emit(idea);
    }
  }

  reject(): void {
    this.ideaRejected.emit();
  }
}
