import { Component, input, output, signal } from '@angular/core';

export interface LeadData {
  name: string;
  company: string;
  role?: string;
  email?: string | null;
  emailVerified?: boolean;
  linkedin?: string | null;
  website?: string;
  location?: string;
  score: number;
  scoreBreakdown?: {
    fit: number;
    accessibility: number;
    timing: number;
    size: number;
  };
  reasoning?: string;
  message?: {
    subject: string;
    body: string;
    linkedinNote?: string;
  };
  personalizationPoints?: string[];
  recentProjects?: string[];
  companySize?: string | null;
  source?: string;
  notes?: string;
}

export type LeadAction = 'approve' | 'edit' | 'skip';

@Component({
  selector: 'app-lead-row',
  standalone: true,
  template: `
    <!-- Main row -->
    <tr class="lead-row" [class.expanded]="expanded()" [class.selected]="selected()" [class.approved]="status() === 'approved'" [class.skipped]="status() === 'skipped'" (click)="expanded.set(!expanded())">
      <td class="col-check" (click)="$event.stopPropagation()">
        <input type="checkbox" [checked]="selected()" (change)="selectionChange.emit({ lead: lead(), selected: !selected() })" />
      </td>
      <td class="col-score">
        <span class="score-badge" [class]="'score-' + getScoreLevel()">{{ lead().score }}</span>
      </td>
      <td class="col-name">
        <span class="lead-name">{{ lead().name }}</span>
        <span class="lead-role">{{ lead().role || '' }}</span>
      </td>
      <td class="col-company">{{ lead().company }}</td>
      <td class="col-location">{{ lead().location || '-' }}</td>
      <td class="col-email">
        @if (lead().email) {
          <span class="email-val">{{ lead().email }}</span>
          @if (lead().emailVerified) {
            <span class="badge verified">MX</span>
          } @else {
            <span class="badge unverified">?</span>
          }
        } @else {
          <span class="no-data">-</span>
        }
      </td>
      <td class="col-linkedin">
        @if (lead().linkedin) {
          <a class="li-link" [href]="lead().linkedin" target="_blank" rel="noopener" (click)="$event.stopPropagation()">LinkedIn</a>
        } @else {
          <span class="no-data">-</span>
        }
      </td>
      <td class="col-status">
        @if (status() === 'approved') {
          <span class="badge approved">Approved</span>
        } @else if (status() === 'skipped') {
          <span class="badge skip">Skipped</span>
        }
      </td>
      <td class="col-expand">
        <span class="expand-icon" [class.open]="expanded()">&#9662;</span>
      </td>
    </tr>

    <!-- Expanded detail row -->
    @if (expanded()) {
      <tr class="detail-row">
        <td colspan="9">
          <div class="detail-grid">
            <!-- Left: enriched details -->
            <div class="detail-section">
              <h4 class="section-title">Detalji</h4>
              @if (lead().website) {
                <div class="detail-item">
                  <span class="detail-label">Website</span>
                  <a class="detail-link" [href]="lead().website" target="_blank" rel="noopener">{{ lead().website }}</a>
                </div>
              }
              @if (lead().companySize) {
                <div class="detail-item">
                  <span class="detail-label">Velicina</span>
                  <span>{{ lead().companySize }}</span>
                </div>
              }
              @if (lead().source) {
                <div class="detail-item">
                  <span class="detail-label">Izvor</span>
                  <a class="detail-link" [href]="lead().source" target="_blank" rel="noopener">{{ shortenUrl(lead().source!) }}</a>
                </div>
              }
              @if (lead().recentProjects?.length) {
                <div class="detail-item">
                  <span class="detail-label">Projekti</span>
                  <ul class="project-list">
                    @for (p of lead().recentProjects!; track p) {
                      <li>{{ p }}</li>
                    }
                  </ul>
                </div>
              }
              @if (lead().notes) {
                <div class="detail-item">
                  <span class="detail-label">Napomena</span>
                  <span>{{ lead().notes }}</span>
                </div>
              }
            </div>

            <!-- Middle: score breakdown -->
            @if (lead().scoreBreakdown) {
              <div class="detail-section">
                <h4 class="section-title">Ocena</h4>
                <div class="score-bars">
                  <div class="sbar"><span class="sbar-label">Fit</span><div class="bar"><div class="bar-fill" [style.width.%]="(lead().scoreBreakdown!.fit / 3) * 100"></div></div><span class="sbar-val">{{ lead().scoreBreakdown!.fit }}/3</span></div>
                  <div class="sbar"><span class="sbar-label">Pristup</span><div class="bar"><div class="bar-fill" [style.width.%]="(lead().scoreBreakdown!.accessibility / 3) * 100"></div></div><span class="sbar-val">{{ lead().scoreBreakdown!.accessibility }}/3</span></div>
                  <div class="sbar"><span class="sbar-label">Tajming</span><div class="bar"><div class="bar-fill" [style.width.%]="(lead().scoreBreakdown!.timing / 2) * 100"></div></div><span class="sbar-val">{{ lead().scoreBreakdown!.timing }}/2</span></div>
                  <div class="sbar"><span class="sbar-label">Velicina</span><div class="bar"><div class="bar-fill" [style.width.%]="(lead().scoreBreakdown!.size / 2) * 100"></div></div><span class="sbar-val">{{ lead().scoreBreakdown!.size }}/2</span></div>
                </div>
                @if (lead().reasoning) {
                  <p class="reasoning">{{ lead().reasoning }}</p>
                }
              </div>
            }

            <!-- Right: outreach message -->
            @if (lead().message) {
              <div class="detail-section message-section">
                <h4 class="section-title">Poruka</h4>
                <div class="msg-subject">{{ lead().message!.subject }}</div>
                <div class="msg-body">{{ lead().message!.body }}</div>
                @if (lead().message!.linkedinNote) {
                  <div class="msg-linkedin">
                    <span class="msg-label">LinkedIn:</span> {{ lead().message!.linkedinNote }}
                  </div>
                }
                @if (lead().personalizationPoints?.length) {
                  <div class="msg-points">
                    <span class="msg-label">Personalizacija:</span>
                    @for (p of lead().personalizationPoints!; track p) {
                      <span class="point-tag">{{ p }}</span>
                    }
                  </div>
                }
              </div>
            }
          </div>

          <!-- Actions inside expanded row -->
          @if (status() === 'pending') {
            <div class="detail-actions">
              <button class="act-btn approve" (click)="onAction('approve'); $event.stopPropagation()">Approve</button>
              <button class="act-btn skip-btn" (click)="onAction('skip'); $event.stopPropagation()">Skip</button>
            </div>
          }
        </td>
      </tr>
    }
  `,
  styles: [`
    :host { display: contents; }

    .lead-row {
      cursor: pointer; transition: background 0.1s;
      border-bottom: 1px solid #1A1A1A;
    }
    .lead-row:hover { background: #1A1A1A; }
    .lead-row.expanded { background: #1A1A2A; }
    .lead-row.selected { background: #1A1A2A; }
    .lead-row.approved { opacity: 0.85; }
    .lead-row.skipped { opacity: 0.4; }
    .lead-row td { padding: 10px 8px; font-size: 13px; color: #FAFAFA; vertical-align: middle; white-space: nowrap; }

    .col-check { width: 32px; }
    .col-check input { accent-color: #3B82F6; cursor: pointer; width: 15px; height: 15px; }
    .col-score { width: 40px; text-align: center; }
    .col-name { min-width: 160px; }
    .col-company { min-width: 140px; color: #9CA3AF; }
    .col-location { color: #6B7280; }
    .col-email { min-width: 180px; }
    .col-linkedin { width: 80px; }
    .col-status { width: 70px; }
    .col-expand { width: 24px; text-align: center; }

    .lead-name { font-weight: 500; margin-right: 6px; }
    .lead-role { color: #C9A96E; font-size: 11px; }

    .score-badge {
      display: inline-flex; align-items: center; justify-content: center;
      width: 28px; height: 28px; border-radius: 50%; font-weight: 700; font-size: 12px; color: #0D0D0D;
    }
    .score-high { background: #22c55e; }
    .score-medium { background: #C9A96E; }
    .score-low { background: #ef4444; }

    .email-val { font-family: monospace; font-size: 12px; margin-right: 4px; }
    .badge {
      display: inline-block; padding: 1px 5px; border-radius: 3px;
      font-size: 9px; font-weight: 700; text-transform: uppercase;
    }
    .verified { background: #22c55e20; color: #22c55e; }
    .unverified { background: #ef444420; color: #ef4444; }
    .approved { background: #22c55e20; color: #22c55e; }
    .skip { background: #6B728020; color: #6B7280; }
    .no-data { color: #3a3a3a; }

    .li-link { color: #3B82F6; text-decoration: none; font-size: 12px; }
    .li-link:hover { text-decoration: underline; }

    .expand-icon { color: #6B7280; font-size: 10px; transition: transform 0.2s; display: inline-block; }
    .expand-icon.open { transform: rotate(180deg); }

    /* Detail row */
    .detail-row td { padding: 0 8px 16px; background: #141420; border-bottom: 1px solid #2A2A2A; }
    .detail-grid { display: grid; grid-template-columns: 1fr 1fr 1.5fr; gap: 16px; padding: 12px 0; }
    .detail-section { display: flex; flex-direction: column; gap: 6px; }
    .section-title { color: #9CA3AF; font-size: 11px; text-transform: uppercase; font-weight: 600; margin: 0 0 4px; letter-spacing: 0.5px; }

    .detail-item { display: flex; flex-direction: column; gap: 2px; }
    .detail-label { color: #6B7280; font-size: 10px; font-weight: 600; text-transform: uppercase; }
    .detail-link { color: #3B82F6; font-size: 12px; text-decoration: none; word-break: break-all; }
    .project-list { margin: 0; padding-left: 16px; color: #9CA3AF; font-size: 12px; }
    .project-list li { margin-bottom: 2px; }

    .score-bars { display: flex; flex-direction: column; gap: 4px; }
    .sbar { display: flex; align-items: center; gap: 6px; }
    .sbar-label { color: #6B7280; font-size: 11px; min-width: 52px; }
    .bar { flex: 1; height: 4px; background: #242424; border-radius: 2px; overflow: hidden; }
    .bar-fill { height: 100%; background: #3B82F6; border-radius: 2px; }
    .sbar-val { color: #6B7280; font-size: 11px; min-width: 28px; }
    .reasoning { color: #6B7280; font-size: 11px; line-height: 1.4; margin: 6px 0 0; font-style: italic; }

    .message-section { border-left: 2px solid #C9A96E; padding-left: 12px; }
    .msg-subject { color: #FAFAFA; font-weight: 600; font-size: 13px; margin-bottom: 4px; }
    .msg-body { color: #9CA3AF; font-size: 12px; line-height: 1.5; white-space: pre-wrap; }
    .msg-linkedin { color: #6B7280; font-size: 11px; margin-top: 8px; padding-top: 6px; border-top: 1px solid #2A2A2A; }
    .msg-label { color: #3B82F6; font-weight: 600; }
    .msg-points { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; align-items: center; }
    .point-tag { background: #3B82F620; color: #3B82F6; padding: 2px 6px; border-radius: 3px; font-size: 10px; }

    .detail-actions { display: flex; gap: 8px; padding-top: 8px; border-top: 1px solid #2A2A2A; margin-top: 8px; }
    .act-btn {
      padding: 6px 16px; border-radius: 6px; font-size: 12px; font-weight: 600;
      cursor: pointer; border: none; transition: all 0.15s;
    }
    .approve { background: #22c55e; color: #0D0D0D; }
    .approve:hover { background: #16a34a; }
    .skip-btn { background: transparent; border: 1px solid #6B7280; color: #6B7280; }
    .skip-btn:hover { background: #6B728020; }
  `],
})
export class LeadCardComponent {
  lead = input.required<LeadData>();
  status = input<'pending' | 'approved' | 'skipped'>('pending');
  selected = input(false);
  action = output<{ lead: LeadData; action: LeadAction }>();
  selectionChange = output<{ lead: LeadData; selected: boolean }>();

  expanded = signal(false);

  getScoreLevel(): string {
    const score = this.lead().score;
    if (score >= 7) return 'high';
    if (score >= 4) return 'medium';
    return 'low';
  }

  shortenUrl(url: string): string {
    try {
      const u = new URL(url);
      return u.hostname + (u.pathname.length > 30 ? u.pathname.slice(0, 30) + '...' : u.pathname);
    } catch {
      return url.slice(0, 40);
    }
  }

  onAction(act: LeadAction): void {
    this.action.emit({ lead: this.lead(), action: act });
  }
}
