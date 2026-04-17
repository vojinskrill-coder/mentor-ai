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
  scoringRationale?: string;
  // Outreach — two formats (old: message, new: outreach from n8n)
  message?: {
    subject: string;
    body: string;
    linkedinNote?: string;
  };
  outreach?: {
    email?: { subject: string; body: string };
    linkedin?: { message: string };
  } | null;
  personalizationPoints?: string[];
  recentProjects?: string[];
  companySize?: string | null;
  companyDescription?: string;
  whyGoodFit?: string;
  industry?: string;
  source?: string;
  notes?: string;
  phone?: string;
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
        <span class="score-badge" [style.backgroundColor]="getScoreColor()">{{ lead().score }}</span>
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
              <h4 class="section-title">Details</h4>
              @if (lead().companyDescription) {
                <div class="detail-item">
                  <span class="detail-label">About company</span>
                  <span>{{ lead().companyDescription }}</span>
                </div>
              }
              @if (lead().whyGoodFit) {
                <div class="detail-item">
                  <span class="detail-label">Why good fit</span>
                  <span>{{ lead().whyGoodFit }}</span>
                </div>
              }
              @if (lead().industry) {
                <div class="detail-item">
                  <span class="detail-label">Industry</span>
                  <span>{{ lead().industry }}</span>
                </div>
              }
              @if (lead().website) {
                <div class="detail-item">
                  <span class="detail-label">Website</span>
                  <a class="detail-link" [href]="lead().website" target="_blank" rel="noopener">{{ lead().website }}</a>
                </div>
              }
              @if (lead().phone) {
                <div class="detail-item">
                  <span class="detail-label">Phone</span>
                  <span>{{ lead().phone }}</span>
                </div>
              }
              @if (lead().recentProjects?.length) {
                <div class="detail-item">
                  <span class="detail-label">Projects</span>
                  <ul class="project-list">
                    @for (p of lead().recentProjects!; track p) {
                      <li>{{ p }}</li>
                    }
                  </ul>
                </div>
              }
              @if (lead().source) {
                <div class="detail-item">
                  <span class="detail-label">Source</span>
                  <span>{{ lead().source }}</span>
                </div>
              }
            </div>

            <!-- Middle: score breakdown -->
            @if (lead().scoreBreakdown) {
              <div class="detail-section">
                <h4 class="section-title">Score</h4>
                <div class="score-bars">
                  <div class="sbar"><span class="sbar-label">Fit</span><div class="bar"><div class="bar-fill" [style.width.%]="(lead().scoreBreakdown!.fit / 3) * 100"></div></div><span class="sbar-val">{{ lead().scoreBreakdown!.fit }}/3</span></div>
                  <div class="sbar"><span class="sbar-label">Access</span><div class="bar"><div class="bar-fill" [style.width.%]="(lead().scoreBreakdown!.accessibility / 3) * 100"></div></div><span class="sbar-val">{{ lead().scoreBreakdown!.accessibility }}/3</span></div>
                  <div class="sbar"><span class="sbar-label">Timing</span><div class="bar"><div class="bar-fill" [style.width.%]="(lead().scoreBreakdown!.timing / 2) * 100"></div></div><span class="sbar-val">{{ lead().scoreBreakdown!.timing }}/2</span></div>
                  <div class="sbar"><span class="sbar-label">Size</span><div class="bar"><div class="bar-fill" [style.width.%]="(lead().scoreBreakdown!.size / 2) * 100"></div></div><span class="sbar-val">{{ lead().scoreBreakdown!.size }}/2</span></div>
                </div>
                @if (lead().reasoning) {
                  <p class="reasoning">{{ lead().reasoning }}</p>
                }
              </div>
            }

            <!-- Right: outreach message (supports multiple formats) -->
            @if (getOutreachEmail()) {
              <div class="detail-section message-section">
                <h4 class="section-title">Email message</h4>
                <div class="msg-subject">{{ getOutreachEmail()!.subject }}</div>
                <div class="msg-body">{{ getOutreachEmail()!.body }}</div>
              </div>
            }
            @if (getOutreachLinkedin()) {
              <div class="detail-section message-section">
                <h4 class="section-title">LinkedIn message</h4>
                <div class="msg-body">{{ getOutreachLinkedin() }}</div>
              </div>
            }
            @if (lead().scoringRationale || lead().reasoning) {
              <div class="detail-section">
                <h4 class="section-title">Analysis</h4>
                <p class="reasoning">{{ lead().scoringRationale || lead().reasoning }}</p>
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
      border-bottom: 1px solid #161B22;
    }
    .lead-row:hover { background: #161B22; }
    .lead-row.expanded { background: #1A1A2A; }
    .lead-row.selected { background: #1A1A2A; }
    .lead-row.approved { /* no green background — Saved section + tag is sufficient */ }
    .lead-row.skipped { opacity: 0.4; }
    .lead-row td { padding: 10px 8px; font-size: 13px; color: #E6EDF3; vertical-align: middle; white-space: nowrap; }

    .col-check { width: 32px; }
    .col-check input { accent-color: #58A6FF; cursor: pointer; width: 15px; height: 15px; }
    .col-score { width: 40px; text-align: center; }
    .col-name { min-width: 160px; }
    .col-company { min-width: 140px; color: #9CA3AF; }
    .col-location { color: #6B7280; }
    .col-email { min-width: 180px; }
    .col-linkedin { width: 80px; }
    .col-status { width: 70px; }
    .col-expand { width: 24px; text-align: center; }

    .lead-name { font-weight: 500; margin-right: 6px; }
    .lead-role { color: #D29922; font-size: 11px; }

    .score-badge {
      display: inline-flex; align-items: center; justify-content: center;
      width: 28px; height: 28px; border-radius: 50%; font-weight: 700; font-size: 12px; color: #0D1117;
    }
    /* score colors set via inline style (blue→cyan gradient) */

    .email-val { font-family: monospace; font-size: 12px; margin-right: 4px; }
    .badge {
      display: inline-block; padding: 1px 5px; border-radius: 3px;
      font-size: 9px; font-weight: 700; text-transform: uppercase;
    }
    .verified { background: #3FB95020; color: #3FB950; }
    .unverified { background: #F8514920; color: #F85149; }
    .approved { color: #3FB950; }
    .skip { background: #6B728020; color: #6B7280; }
    .no-data { color: #30363D; }

    .li-link { color: #58A6FF; text-decoration: none; font-size: 12px; }
    .li-link:hover { text-decoration: underline; }

    .expand-icon { color: #6B7280; font-size: 10px; transition: transform 0.2s; display: inline-block; }
    .expand-icon.open { transform: rotate(180deg); }

    /* Detail row */
    .detail-row td { padding: 0 8px 16px; background: #141420; border-bottom: 1px solid #21262D; }
    .detail-grid { display: grid; grid-template-columns: 1fr 1fr 1.5fr; gap: 16px; padding: 12px 0; }
    .detail-section { display: flex; flex-direction: column; gap: 6px; }
    .section-title { color: #9CA3AF; font-size: 11px; text-transform: uppercase; font-weight: 600; margin: 0 0 4px; letter-spacing: 0.5px; }

    .detail-item { display: flex; flex-direction: column; gap: 2px; }
    .detail-label { color: #6B7280; font-size: 10px; font-weight: 600; text-transform: uppercase; }
    .detail-link { color: #58A6FF; font-size: 12px; text-decoration: none; word-break: break-all; }
    .project-list { margin: 0; padding-left: 16px; color: #9CA3AF; font-size: 12px; }
    .project-list li { margin-bottom: 2px; }

    .score-bars { display: flex; flex-direction: column; gap: 4px; }
    .sbar { display: flex; align-items: center; gap: 6px; }
    .sbar-label { color: #6B7280; font-size: 11px; min-width: 52px; }
    .bar { flex: 1; height: 4px; background: #1C2128; border-radius: 2px; overflow: hidden; }
    .bar-fill { height: 100%; background: #58A6FF; border-radius: 2px; }
    .sbar-val { color: #6B7280; font-size: 11px; min-width: 28px; }
    .reasoning { color: #6B7280; font-size: 11px; line-height: 1.4; margin: 6px 0 0; font-style: italic; }

    .message-section { border-left: 2px solid #D29922; padding-left: 12px; }
    .msg-subject { color: #E6EDF3; font-weight: 600; font-size: 13px; margin-bottom: 4px; }
    .msg-body { color: #9CA3AF; font-size: 12px; line-height: 1.5; white-space: pre-wrap; }
    .msg-linkedin { color: #6B7280; font-size: 11px; margin-top: 8px; padding-top: 6px; border-top: 1px solid #21262D; }
    .msg-label { color: #58A6FF; font-weight: 600; }
    .msg-points { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 6px; align-items: center; }
    .point-tag { background: #58A6FF20; color: #58A6FF; padding: 2px 6px; border-radius: 3px; font-size: 10px; }

    .detail-actions { display: flex; gap: 8px; padding-top: 8px; border-top: 1px solid #21262D; margin-top: 8px; }
    .act-btn {
      padding: 6px 16px; border-radius: 6px; font-size: 12px; font-weight: 600;
      cursor: pointer; border: none; transition: all 0.15s;
    }
    .approve { background: #3FB950; color: #0D1117; }
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

  /** Score color: dark navy (1) → bright teal-cyan (10) */
  getScoreColor(): string {
    const s = Math.max(1, Math.min(10, this.lead().score));
    const t = (s - 1) / 9; // 0..1
    // #1E3A5F (dark navy) → #2DD4BF (teal-cyan, matches app accent)
    const r = Math.round(30 + t * (45 - 30));
    const g = Math.round(58 + t * (212 - 58));
    const b = Math.round(95 + t * (191 - 95));
    return `rgb(${r},${g},${b})`;
  }

  /** Get outreach email in normalized format (supports ALL formats) */
  getOutreachEmail(): { subject: string; body: string } | null {
    const l = this.lead();
    const any = l as any;
    // Format 1: outreach.email.subject (n8n normalized)
    if (l.outreach?.email?.subject) return l.outreach.email;
    // Format 2: message.email.subject (saved in ApprovedLead.message from n8n)
    if (any.message?.email?.subject) return any.message.email;
    // Format 3: message.subject (old OpenClaw format)
    if (l.message?.subject) return { subject: l.message.subject, body: l.message.body };
    // Format 4: flat (emailSubject / email_subject)
    if (any.emailSubject || any.email_subject) return { subject: any.emailSubject || any.email_subject, body: any.emailBody || any.email_body || '' };
    // Format 5: outreach.emailSubject (OpenClaw camelCase)
    if (any.outreach?.emailSubject) return { subject: any.outreach.emailSubject, body: any.outreach.emailBody || '' };
    return null;
  }

  /** Get outreach LinkedIn message */
  getOutreachLinkedin(): string | null {
    const l = this.lead();
    const any = l as any;
    if (l.outreach?.linkedin?.message) return l.outreach.linkedin.message;
    if (any.message?.linkedin?.message) return any.message.linkedin.message;
    if (l.message?.linkedinNote) return l.message.linkedinNote;
    if (any.outreach?.linkedinMessage) return any.outreach.linkedinMessage;
    if (any.linkedin_message || any.linkedinMessage) return any.linkedin_message || any.linkedinMessage;
    return null;
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
