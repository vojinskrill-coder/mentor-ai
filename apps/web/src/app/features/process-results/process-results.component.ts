import { Component, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { LeadCardComponent, LeadData, LeadAction } from './components/lead-card.component';
import { ContentPreviewComponent, ContentData } from './components/content-preview.component';
import { ContentCalendarComponent, CalendarItem } from './components/content-calendar.component';
import { ChatWebsocketService } from '../chat/services/chat-websocket.service';
import type {
  ProcessRunResponse,
  ProcessWorkflowResponse,
  ProcessRunStatus,
} from '@mentor-ai/shared/types';

@Component({
  selector: 'app-process-results',
  standalone: true,
  imports: [LeadCardComponent, ContentPreviewComponent, ContentCalendarComponent],
  template: `
    <div class="process-results">
      <div class="results-header">
        <div class="header-left">
          <h1 class="results-title">Procesi</h1>
          <div class="workflow-selector">
            @for (wf of workflows(); track wf.id) {
              <button class="wf-tab" [class.active]="activeWorkflowId() === wf.id" (click)="switchWorkflow(wf)">
                {{ wf.name }}
              </button>
            }
          </div>
        </div>
        <div class="header-actions">
          @if (activeWorkflow()) {
            <button class="run-btn" [disabled]="isRunning()" (click)="triggerRun()">
              @if (isRunning()) {
                <span class="run-spinner"></span> U toku...
              } @else {
                Pokreni proces
              }
            </button>
          }
        </div>
      </div>

      <!-- View toggle: Runs vs Saved -->
      <div class="view-toggle">
        <button class="view-btn" [class.active]="viewMode() === 'runs'" (click)="viewMode.set('runs')">Pokretanja</button>
        <button class="view-btn" [class.active]="viewMode() === 'saved'" (click)="viewMode.set('saved'); loadSaved()">Sacuvano</button>
      </div>

      @if (viewMode() === 'saved') {
        @if (isLeadWorkflow()) {
          <!-- Saved leads — same table as runs -->
          <div class="leads-table-wrap">
            <table class="leads-table">
              <thead>
                <tr>
                  <th>Score</th>
                  <th>Ime</th>
                  <th>Kompanija</th>
                  <th>Lokacija</th>
                  <th>Email</th>
                  <th>LinkedIn</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                @for (lead of savedLeads(); track lead.id) {
                  <app-lead-row
                    [lead]="lead"
                    [status]="'approved'"
                    [selected]="false"
                    (action)="noop()"
                    (selectionChange)="noop()"
                  />
                }
              </tbody>
            </table>
            @if (savedLeads().length === 0) { <div class="empty-state">Nema sacuvanih lead-ova. Pokrenite i odobrite Lead Discovery proces.</div> }
          </div>
        } @else {
          <!-- Saved content — same post cards as runs -->
          <div class="posts-list">
            @for (post of savedContent(); track post.id; let i = $index) {
              <div class="post-card approved">
                <div class="post-header" (click)="toggleSavedPost(i)">
                  <span class="saved-status st-{{ post.status }}">{{ post.status }}</span>
                  <div class="post-info">
                    <span class="post-topic">{{ post.topic }}</span>
                    @if (post.score) {
                      <span class="post-score" [class]="'score-' + (post.score >= 7 ? 'high' : post.score >= 4 ? 'medium' : 'low')">{{ post.score }}/10</span>
                    }
                    @if (post.hookLine) { <span class="post-hook">{{ post.hookLine }}</span> }
                  </div>
                  <span class="post-expand" [class.open]="expandedSavedPost() === i">&#9662;</span>
                </div>

                @if (expandedSavedPost() === i) {
                  <div class="post-detail">
                    <div class="detail-columns">
                      <div class="detail-left">
                        @if (post.imageUrl) {
                          <div class="post-image"><img [src]="post.imageUrl" [alt]="post.topic" /></div>
                        }
                      </div>
                      <div class="detail-right">
                        @if (post.reasoning) {
                          <div class="strategy-box">
                            <h4 class="section-label">Strategija</h4>
                            <p class="strategy-text">{{ post.reasoning }}</p>
                          </div>
                        }
                        <div class="caption-box">
                          <h4 class="section-label">Caption</h4>
                          @if (post.hookLine) { <div class="hook-line">{{ post.hookLine }}</div> }
                          <div class="post-caption">{{ post.caption }}</div>
                          @if (post.callToAction) { <div class="cta-line">CTA: {{ post.callToAction }}</div> }
                        </div>
                        @if (post.hashtags?.length) {
                          <div class="hashtags-box">
                            <h4 class="section-label">Hashtags ({{ post.hashtags.length }})</h4>
                            <div class="post-hashtags">
                              @for (tag of post.hashtags; track tag) { <span class="hashtag">#{{ tag }}</span> }
                            </div>
                            <button class="copy-btn" (click)="copyHashtags(post.hashtags); $event.stopPropagation()">Kopiraj</button>
                          </div>
                        }
                      </div>
                    </div>
                  </div>
                }
              </div>
            }
            @if (savedContent().length === 0) { <div class="empty-state">Nema sacuvanog sadrzaja. Pokrenite i odobrite Instagram Content proces.</div> }
          </div>
        }
      }

      @if (viewMode() === 'runs') {
      <div class="results-layout">
        <!-- Left sidebar: run progress -->
        <aside class="run-sidebar">
          <h3 class="sidebar-title">Poslednji pokretanja</h3>
          @for (run of runs(); track run.id) {
            <div class="run-item" [class.active]="selectedRunId() === run.id" (click)="selectRun(run)">
              <div class="run-status" [class]="'status-' + run.status">{{ formatStatus(run.status) }}</div>
              <div class="run-date">{{ formatDate(run.createdAt) }}</div>
              @if (run.currentStepOrder && run.status === 'RUNNING') {
                <div class="run-progress">
                  <div class="progress-bar">
                    <div class="progress-fill" [style.width.%]="getProgressPct(run)"></div>
                  </div>
                  <span class="progress-text">Korak {{ run.currentStepOrder }}/{{ totalSteps() }}</span>
                </div>
              }
            </div>
          }

          @if (runs().length === 0) {
            <div class="empty-state">Nema pokretanja</div>
          }
        </aside>

        <!-- Main area -->
        <main class="results-main">
          @if (isLeadWorkflow()) {
            <!-- Stats bar -->
            @if (selectedRun()) {
              <div class="stats-bar">
                <div class="stat"><span class="stat-val">{{ leads().length }}</span><span class="stat-label">Total</span></div>
                <div class="stat"><span class="stat-val">{{ approvedCount() }}</span><span class="stat-label">Approved</span></div>
                <div class="stat"><span class="stat-val">{{ skippedCount() }}</span><span class="stat-label">Skipped</span></div>
                <div class="stat"><span class="stat-val">{{ avgScore() }}</span><span class="stat-label">Avg Score</span></div>
              </div>
            }

            <!-- Leads table -->
            <div class="leads-table-wrap">
              <table class="leads-table">
                <thead>
                  <tr>
                    <th class="th-check"><input type="checkbox" [checked]="allSelected()" (change)="toggleSelectAll()" /></th>
                    <th>Score</th>
                    <th>Ime</th>
                    <th>Kompanija</th>
                    <th>Lokacija</th>
                    <th>Email</th>
                    <th>LinkedIn</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  @for (lead of leads(); track lead.name + lead.company) {
                    <app-lead-row
                      [lead]="lead"
                      [status]="getLeadStatus(lead)"
                      [selected]="isLeadSelected(lead)"
                      (action)="handleLeadAction($event)"
                      (selectionChange)="handleSelectionChange($event)"
                    />
                  }
                </tbody>
              </table>

              @if (leads().length === 0 && selectedRun()) {
                <div class="empty-state">
                  @if (selectedRun()!.status === 'RUNNING') {
                    Proces u toku... sacekajte rezultate.
                  } @else if (selectedRun()!.status === 'WAITING_APPROVAL') {
                    Ceka na vase odobrenje.
                  } @else {
                    Nema lead-ova u ovom pokretanju.
                  }
                </div>
              }
            </div>

            <!-- Selection + batch actions -->
            @if (leads().length > 0) {
              <div class="batch-actions">
                @if (selectedLeads().size > 0) {
                  <button class="batch-btn approve-all" (click)="approveSelected()">
                    Approve Selected ({{ selectedLeads().size }})
                  </button>
                  <button class="batch-btn skip-all" (click)="clearSelection()">Clear Selection</button>
                } @else {
                  <button class="batch-btn select-all" (click)="selectAll()">Select All</button>
                  <button class="batch-btn approve-all" (click)="batchApprove()">Approve All</button>
                  <button class="batch-btn skip-all" (click)="batchSkip()">Skip All</button>
                }

                @if (selectedRun()?.status === 'WAITING_APPROVAL' && approvedCount() > 0) {
                  <button class="batch-btn submit-btn" (click)="submitApproval(true)">
                    Potvrdi ({{ approvedCount() }} lead-ova)
                  </button>
                }
                @if (selectedRun()?.status === 'WAITING_APPROVAL') {
                  <button class="batch-btn skip-all" (click)="submitApproval(false)">Odbij sve</button>
                }
              </div>
            }
          }

          @if (!isLeadWorkflow()) {
            <!-- Posts list -->
            <div class="posts-list">
              @for (post of posts(); track post.topic; let i = $index) {
                <div class="post-card" [class.approved]="postStatuses().get(post.topic) === 'approved'" [class.skipped]="postStatuses().get(post.topic) === 'skipped'">
                  <div class="post-header" (click)="togglePost(i)">
                    <input type="checkbox" [checked]="postStatuses().get(post.topic) === 'approved'" (change)="togglePostApproval(post)" (click)="$event.stopPropagation()" />
                    <div class="post-info">
                      <span class="post-topic">{{ post.topic }}</span>
                      @if (post.score) {
                        <span class="post-score" [class]="'score-' + (post.score >= 7 ? 'high' : post.score >= 4 ? 'medium' : 'low')">{{ post.score }}/10</span>
                      }
                      @if (post.hookLine) {
                        <span class="post-hook">{{ post.hookLine }}</span>
                      }
                    </div>
                    <span class="post-expand" [class.open]="expandedPost() === i">&#9662;</span>
                  </div>

                  @if (expandedPost() === i) {
                    <div class="post-detail">
                      <div class="detail-columns">
                        <!-- Left: image + visual -->
                        <div class="detail-left">
                          @if (post.imageUrl) {
                            <div class="post-image">
                              <img [src]="post.imageUrl" [alt]="post.topic" />
                            </div>
                          } @else if (post.imagePrompt) {
                            <div class="post-image-placeholder">
                              <span class="placeholder-icon">🎨</span>
                              <span class="placeholder-text">Slika ce biti generisana</span>
                              <p class="post-prompt">{{ post.imagePrompt }}</p>
                            </div>
                          }

                          @if (post.visualStyle) {
                            <div class="post-meta-item">
                              <span class="meta-label">Vizuelni stil</span>
                              <span class="meta-value">{{ post.visualStyle }}</span>
                            </div>
                          }
                          @if (post.suggestedDay) {
                            <div class="post-meta-item">
                              <span class="meta-label">Predlozeni dan</span>
                              <span class="meta-value">{{ post.suggestedDay }}</span>
                            </div>
                          }
                          @if (post.contentType) {
                            <div class="post-meta-item">
                              <span class="meta-label">Format</span>
                              <span class="meta-value">{{ post.contentType }}</span>
                            </div>
                          }
                          @if (post.reference) {
                            <div class="post-meta-item">
                              <span class="meta-label">Referenca</span>
                              <span class="meta-value">{{ post.reference }}</span>
                            </div>
                          }
                        </div>

                        <!-- Right: text content -->
                        <div class="detail-right">
                          <!-- Strategy / Why -->
                          @if (post.reasoning || post.whyItWorks) {
                            <div class="strategy-box">
                              <h4 class="section-label">📋 Strategija — zasto kreiramo ovaj sadrzaj</h4>
                              @if (post.reasoning) {
                                <p class="strategy-text">{{ post.reasoning }}</p>
                              }
                              @if (post.whyItWorks) {
                                <p class="strategy-text"><strong>Zasto funkcionise:</strong> {{ post.whyItWorks }}</p>
                              }
                              @if (post.scoreBreakdown) {
                                <div class="score-mini">
                                  @if (post.scoreBreakdown.relevance !== undefined) { <span class="score-chip">Relevantnost: {{ post.scoreBreakdown.relevance }}/2</span> }
                                  @if (post.scoreBreakdown.engagement !== undefined) { <span class="score-chip">Engagement: {{ post.scoreBreakdown.engagement }}/2</span> }
                                  @if (post.scoreBreakdown.uniqueness !== undefined) { <span class="score-chip">Jedinstvenost: {{ post.scoreBreakdown.uniqueness }}/2</span> }
                                  @if (post.scoreBreakdown.brandFit !== undefined) { <span class="score-chip">Brand fit: {{ post.scoreBreakdown.brandFit }}/2</span> }
                                  @if (post.scoreBreakdown.timeliness !== undefined) { <span class="score-chip">Aktuelnost: {{ post.scoreBreakdown.timeliness }}/2</span> }
                                </div>
                              }
                            </div>
                          }

                          <!-- Caption -->
                          <div class="caption-box">
                            <h4 class="section-label">📝 Instagram Caption</h4>
                            @if (post.hookLine) {
                              <div class="hook-line">{{ post.hookLine }}</div>
                            }
                            <div class="post-caption">{{ post.caption }}</div>
                            @if (post.callToAction) {
                              <div class="cta-line">CTA: {{ post.callToAction }}</div>
                            }
                          </div>

                          <!-- Hashtags -->
                          @if (post.hashtags?.length) {
                            <div class="hashtags-box">
                              <h4 class="section-label"># Hashtags ({{ post.hashtags.length }})</h4>
                              <div class="post-hashtags">
                                @for (tag of post.hashtags; track tag) {
                                  <span class="hashtag">#{{ tag }}</span>
                                }
                              </div>
                              <button class="copy-btn" (click)="copyHashtags(post.hashtags); $event.stopPropagation()">Kopiraj hashtagove</button>
                            </div>
                          }
                        </div>
                      </div>
                    </div>
                  }
                </div>
              }

              @if (posts().length === 0 && selectedRun()) {
                <div class="empty-state">
                  @if (selectedRun()!.status === 'RUNNING') {
                    Proces u toku... sacekajte rezultate.
                  } @else if (selectedRun()!.status === 'WAITING_APPROVAL') {
                    Ceka na odobrenje ali nema podataka za prikaz. Proverite step rezultate.
                  } @else {
                    Nema postova u ovom pokretanju.
                  }
                </div>
              }
            </div>

            <!-- Submit approval for content -->
            @if (posts().length > 0 && selectedRun()?.status === 'WAITING_APPROVAL') {
              <div class="batch-actions">
                <button class="batch-btn submit-btn" (click)="submitContentApproval(true)">
                  Potvrdi odobrene ({{ approvedPostCount() }})
                </button>
                <button class="batch-btn skip-all" (click)="submitContentApproval(false)">Odbij sve</button>
              </div>
            }
          }
        </main>
      </div>
      }
    </div>
  `,
  styles: [`
    .process-results { padding: 24px; }
    .results-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
    .header-left { display: flex; flex-direction: column; gap: 8px; }
    .results-title { color: #FAFAFA; font-size: 24px; font-weight: 700; margin: 0; }
    .workflow-selector { display: flex; gap: 4px; }
    .wf-tab {
      padding: 6px 14px; border-radius: 6px; font-size: 13px; font-weight: 500;
      cursor: pointer; background: transparent; border: 1px solid #2A2A2A; color: #9CA3AF;
      transition: all 0.15s;
    }
    .wf-tab.active { background: #C9A96E; border-color: #C9A96E; color: #0D0D0D; font-weight: 600; }
    .wf-tab:hover:not(.active) { border-color: #C9A96E; color: #FAFAFA; }
    .header-actions { display: flex; gap: 8px; }
    .run-btn {
      padding: 10px 24px; background: #3B82F6; color: #FAFAFA; border: none;
      border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;
      display: flex; align-items: center; gap: 8px; transition: background 0.15s;
    }
    .run-btn:hover:not(:disabled) { background: #2563eb; }
    .run-btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .run-spinner {
      display: inline-block; width: 14px; height: 14px; border: 2px solid #FAFAFA40;
      border-top-color: #FAFAFA; border-radius: 50%; animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .results-layout { display: flex; gap: 20px; }

    .run-sidebar {
      width: 240px; flex-shrink: 0; background: #1A1A1A; border-radius: 8px;
      padding: 16px; overflow-y: auto; border: 1px solid #2A2A2A;
    }
    .sidebar-title { color: #FAFAFA; font-size: 14px; font-weight: 600; margin: 0 0 12px; }
    .run-item {
      padding: 10px; border-radius: 6px; cursor: pointer; margin-bottom: 8px;
      border: 1px solid transparent; transition: all 0.15s;
    }
    .run-item:hover { border-color: #2A2A2A; background: #242424; }
    .run-item.active { border-color: #3B82F6; background: #242424; }
    .run-status { font-size: 12px; font-weight: 600; margin-bottom: 4px; }
    .status-COMPLETED { color: #22c55e; }
    .status-RUNNING { color: #3B82F6; }
    .status-WAITING_APPROVAL { color: #C9A96E; }
    .status-FAILED { color: #ef4444; }
    .status-CANCELLED { color: #6B7280; }
    .status-IDLE { color: #6B7280; }
    .run-date { color: #6B7280; font-size: 11px; }
    .run-progress { margin-top: 6px; }
    .progress-bar { height: 3px; background: #242424; border-radius: 2px; overflow: hidden; }
    .progress-fill { height: 100%; background: #3B82F6; border-radius: 2px; transition: width 0.3s; }
    .progress-text { color: #6B7280; font-size: 10px; margin-top: 2px; display: block; }

    .results-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }


    .stats-bar {
      display: flex; gap: 16px; margin-bottom: 16px; padding: 12px;
      background: #1A1A1A; border-radius: 8px; border: 1px solid #2A2A2A;
    }
    .stat { display: flex; flex-direction: column; align-items: center; min-width: 70px; }
    .stat-val { color: #FAFAFA; font-size: 20px; font-weight: 700; }
    .stat-label { color: #6B7280; font-size: 11px; }

    .leads-table-wrap { flex: 1; overflow-y: auto; border-radius: 8px; border: 1px solid #2A2A2A; }
    .leads-table { width: 100%; border-collapse: collapse; background: #0D0D0D; }
    .leads-table thead { position: sticky; top: 0; z-index: 1; }
    .leads-table th {
      background: #1A1A1A; color: #6B7280; font-size: 11px; font-weight: 600;
      text-transform: uppercase; padding: 8px; text-align: left; border-bottom: 1px solid #2A2A2A;
      letter-spacing: 0.5px;
    }
    .th-check { width: 32px; }
    .th-check input { accent-color: #3B82F6; cursor: pointer; }

    .batch-actions {
      position: sticky; bottom: 0; display: flex; gap: 8px; padding: 12px;
      background: #0D0D0D; border-top: 1px solid #2A2A2A;
    }
    .batch-btn {
      padding: 8px 20px; border-radius: 6px; font-size: 13px; font-weight: 600;
      cursor: pointer; border: none; transition: all 0.15s;
    }
    .approve-all { background: #22c55e; color: #0D0D0D; }
    .approve-all:hover { background: #16a34a; }
    .select-all { background: #3B82F6; color: #FAFAFA; }
    .select-all:hover { background: #2563eb; }
    .submit-btn { background: #C9A96E; color: #0D0D0D; }
    .submit-btn:hover { background: #b8963e; }
    .skip-all { background: transparent; border: 1px solid #6B7280; color: #6B7280; }
    .skip-all:hover { background: #6B728020; }

    .content-section { display: flex; flex-direction: column; gap: 12px; }
    .content-toggle { display: flex; gap: 4px; }
    .toggle-btn {
      padding: 6px 16px; border-radius: 6px; font-size: 12px; cursor: pointer;
      background: transparent; border: 1px solid #2A2A2A; color: #9CA3AF;
    }
    .toggle-btn.active { background: #C9A96E; border-color: #C9A96E; color: #0D0D0D; }

    /* Post cards */
    .posts-list { display: flex; flex-direction: column; gap: 8px; padding-bottom: 80px; }
    .post-card {
      background: #1A1A1A; border: 1px solid #2A2A2A; border-radius: 8px;
      overflow: hidden; transition: border-color 0.15s;
    }
    .post-card:hover { border-color: #3B82F6; }
    .post-card.approved { border-color: #22c55e; }
    .post-card.skipped { opacity: 0.4; }
    .post-header {
      display: flex; align-items: center; gap: 12px; padding: 12px 16px;
      cursor: pointer;
    }
    .post-header input { accent-color: #3B82F6; width: 16px; height: 16px; cursor: pointer; }
    .post-info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
    .post-topic { color: #FAFAFA; font-size: 14px; font-weight: 500; }
    .post-score {
      display: inline-block; padding: 1px 8px; border-radius: 4px; font-size: 11px; font-weight: 700;
      width: fit-content;
    }
    .score-high { background: #22c55e20; color: #22c55e; }
    .score-medium { background: #C9A96E20; color: #C9A96E; }
    .score-low { background: #ef444420; color: #ef4444; }
    .post-hook { color: #6B7280; font-size: 12px; font-style: italic; }
    .post-expand { color: #6B7280; font-size: 10px; transition: transform 0.2s; }
    .post-expand.open { transform: rotate(180deg); }

    .post-detail { padding: 0 16px 16px; }
    .detail-columns { display: grid; grid-template-columns: 300px 1fr; gap: 20px; }
    .detail-left { display: flex; flex-direction: column; gap: 10px; }
    .detail-right { display: flex; flex-direction: column; gap: 14px; }

    .post-image { border-radius: 8px; overflow: hidden; }
    .post-image img { width: 100%; display: block; }
    .post-image-placeholder {
      background: #242424; border-radius: 8px; padding: 24px; text-align: center;
      border: 1px dashed #2A2A2A; display: flex; flex-direction: column; align-items: center; gap: 8px;
    }
    .placeholder-icon { font-size: 32px; }
    .placeholder-text { color: #6B7280; font-size: 12px; }

    .post-meta-item { display: flex; flex-direction: column; gap: 2px; }
    .meta-label { color: #6B7280; font-size: 9px; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px; }
    .meta-value { color: #9CA3AF; font-size: 12px; }

    .strategy-box {
      background: #141420; border-radius: 8px; padding: 14px;
      border-left: 3px solid #C9A96E; display: flex; flex-direction: column; gap: 8px;
    }
    .strategy-text { color: #9CA3AF; font-size: 13px; line-height: 1.6; margin: 0; }
    .score-mini { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
    .score-chip {
      background: #242424; color: #6B7280; padding: 2px 8px; border-radius: 4px;
      font-size: 10px; font-weight: 600;
    }

    .caption-box {
      background: #1A1A1A; border-radius: 8px; padding: 14px;
      border: 1px solid #2A2A2A; display: flex; flex-direction: column; gap: 8px;
    }
    .hook-line {
      color: #FAFAFA; font-size: 15px; font-weight: 600; line-height: 1.4;
      padding-bottom: 8px; border-bottom: 1px solid #2A2A2A;
    }
    .cta-line { color: #C9A96E; font-size: 12px; font-weight: 500; padding-top: 6px; border-top: 1px solid #2A2A2A; }

    .section-label { color: #9CA3AF; font-size: 10px; text-transform: uppercase; font-weight: 600; margin: 0; letter-spacing: 0.5px; }
    .post-caption { color: #FAFAFA; font-size: 13px; line-height: 1.7; white-space: pre-wrap; }

    .hashtags-box { display: flex; flex-direction: column; gap: 8px; }
    .post-hashtags { display: flex; flex-wrap: wrap; gap: 4px; }
    .hashtag { color: #3B82F6; font-size: 12px; }
    .copy-btn {
      align-self: flex-start; background: transparent; border: 1px solid #3B82F6;
      color: #3B82F6; padding: 4px 12px; border-radius: 4px; font-size: 11px;
      cursor: pointer;
    }
    .copy-btn:hover { background: #3B82F620; }

    .post-prompt { color: #C9A96E; font-size: 11px; font-family: monospace; background: #242424; padding: 8px; border-radius: 4px; }

    /* View toggle */
    .view-toggle { display: flex; gap: 4px; margin-bottom: 16px; }
    .view-btn {
      padding: 6px 16px; border-radius: 6px; font-size: 13px; font-weight: 500;
      cursor: pointer; background: transparent; border: 1px solid #2A2A2A; color: #9CA3AF;
    }
    .view-btn.active { background: #3B82F6; border-color: #3B82F6; color: #FAFAFA; }

    /* Saved items */
    .saved-section { display: flex; flex-direction: column; gap: 12px; }
    .saved-card {
      background: #1A1A1A; border: 1px solid #2A2A2A; border-radius: 8px;
      padding: 16px; display: flex; flex-direction: column; gap: 8px;
    }
    .saved-header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .saved-name { color: #FAFAFA; font-size: 14px; font-weight: 600; }
    .saved-company { color: #C9A96E; font-size: 13px; }
    .saved-score { background: #22c55e20; color: #22c55e; padding: 1px 6px; border-radius: 4px; font-size: 11px; font-weight: 700; }
    .saved-status { font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 3px; }
    .st-approved { background: #22c55e20; color: #22c55e; }
    .st-posted { background: #3B82F620; color: #3B82F6; }
    .saved-details { display: flex; gap: 12px; flex-wrap: wrap; }
    .saved-detail { color: #6B7280; font-size: 12px; }
    .saved-desc { color: #9CA3AF; font-size: 12px; line-height: 1.5; margin: 0; }
    .saved-fit { color: #C9A96E; font-size: 12px; font-style: italic; margin: 0; }
    .saved-image { border-radius: 6px; overflow: hidden; max-width: 300px; }
    .saved-image img { width: 100%; display: block; }
    .saved-caption { color: #FAFAFA; font-size: 13px; line-height: 1.5; white-space: pre-wrap; }
    .saved-hashtags { display: flex; flex-wrap: wrap; gap: 4px; }

    .empty-state { color: #6B7280; text-align: center; padding: 40px; font-size: 14px; }
  `],
})
export class ProcessResultsComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly wsService = inject(ChatWebsocketService);
  private readonly apiBase = `${environment.apiUrl}/api/v1/processes`;
  private unsubscribers: Array<() => void> = [];

  viewMode = signal<'runs' | 'saved'>('runs');
  savedLeads = signal<any[]>([]);
  savedContent = signal<any[]>([]);
  workflows = signal<ProcessWorkflowResponse[]>([]);
  runs = signal<ProcessRunResponse[]>([]);
  selectedRunId = signal<string | null>(null);
  activeWorkflowId = signal<string | null>(null);
  leadStatuses = signal<Map<string, 'approved' | 'skipped'>>(new Map());
  selectedLeads = signal<Set<string>>(new Set());
  contentView = signal<'preview' | 'calendar'>('preview');
  expandedPost = signal(-1);
  expandedSavedPost = signal(-1);
  postStatuses = signal<Map<string, 'approved' | 'skipped'>>(new Map());

  activeWorkflow = computed(() => this.workflows().find(w => w.id === this.activeWorkflowId()));
  isLeadWorkflow = computed(() => this.activeWorkflow()?.slug === 'lead-discovery');
  totalSteps = computed(() => this.activeWorkflow()?.steps?.length ?? 6);
  isRunning = computed(() => this.runs().some(r => r.status === 'RUNNING' || r.status === 'WAITING_APPROVAL'));
  allSelected = computed(() => this.leads().length > 0 && this.selectedLeads().size === this.leads().length);

  selectedRun = computed(() => this.runs().find(r => r.id === this.selectedRunId()));

  leads = computed<LeadData[]>(() => {
    const run = this.selectedRun();
    if (!run?.stepResults) return [];

    // Find the latest step with lead output (scoring step or outreach step)
    for (const result of [...run.stepResults].reverse()) {
      const output = result.output as any;
      if (output?.scoredLeads) return output.scoredLeads;
      if (output?.outreachLeads) return output.outreachLeads;
      if (output?.enrichedLeads) return output.enrichedLeads;
    }
    return [];
  });

  posts = computed<any[]>(() => {
    const run = this.selectedRun();
    if (!run?.stepResults) return [];
    for (const result of [...run.stepResults].reverse()) {
      const output = result.output as any;
      if (output?.posts) return output.posts;
      if (output?.contentIdeas) return output.contentIdeas;
    }
    return [];
  });

  approvedPostCount = computed(() =>
    [...this.postStatuses().values()].filter(s => s === 'approved').length
  );

  pendingLeads = computed(() =>
    this.leads().filter(l => !this.leadStatuses().has(l.name + l.company))
  );

  approvedCount = computed(() =>
    [...this.leadStatuses().values()].filter(s => s === 'approved').length
  );

  skippedCount = computed(() =>
    [...this.leadStatuses().values()].filter(s => s === 'skipped').length
  );

  avgScore = computed(() => {
    const l = this.leads();
    if (l.length === 0) return '0';
    return (l.reduce((sum, lead) => sum + (lead.score ?? 0), 0) / l.length).toFixed(1);
  });

  contentData = computed<ContentData | null>(() => {
    const run = this.selectedRun();
    if (!run?.stepResults) return null;

    // Find content step results (formatting or writing step)
    const data: ContentData = {};
    for (const result of run.stepResults) {
      const output = result.output as any;
      if (!output) continue;
      if (output.title) { data.title = output.title; data.body = output.body; data.metaDescription = output.metaDescription; data.keywords = output.keywords; data.wordCount = output.wordCount; data.readabilityScore = output.readabilityScore; }
      if (output.images) data.images = output.images;
      if (output.blog) data.blog = output.blog;
      if (output.instagram) data.instagram = output.instagram;
      if (output.linkedin) data.linkedin = output.linkedin;
      if (output.publishedUrls) data.publishedUrls = output.publishedUrls;
    }
    return Object.keys(data).length > 0 ? data : null;
  });

  calendarItems = computed<CalendarItem[]>(() => {
    const items: CalendarItem[] = [];
    for (const run of this.runs()) {
      const output = run.finalOutput as any;
      if (output?.publishedUrls) {
        for (const pub of output.publishedUrls) {
          items.push({
            date: pub.scheduledAt ?? run.completedAt ?? run.createdAt,
            title: (run as any).workflow?.name ?? 'Content',
            channel: pub.channel,
            status: pub.status,
            url: pub.url,
          });
        }
      }
    }
    return items;
  });

  ngOnInit(): void {
    this.loadWorkflows();
    this.setupWsListeners();
  }

  ngOnDestroy(): void {
    this.unsubscribers.forEach(fn => fn());
  }

  private loadWorkflows(): void {
    this.http.get<{ data: ProcessWorkflowResponse[] }>(this.apiBase).subscribe({
      next: (res) => {
        this.workflows.set(res.data);
        // Auto-select first workflow if none selected
        const first = res.data[0];
        if (first && !this.activeWorkflowId()) {
          this.switchWorkflow(first);
        }
      },
    });
  }

  noop(): void {}

  toggleSavedPost(i: number): void {
    this.expandedSavedPost.set(this.expandedSavedPost() === i ? -1 : i);
  }

  loadSaved(): void {
    if (this.isLeadWorkflow()) {
      this.http.get<{ data: any[] }>(`${this.apiBase}/approved/leads`).subscribe({
        next: (res) => this.savedLeads.set(res.data),
      });
    } else {
      this.http.get<{ data: any[] }>(`${this.apiBase}/approved/content`).subscribe({
        next: (res) => this.savedContent.set(res.data),
      });
    }
  }

  switchWorkflow(wf: ProcessWorkflowResponse): void {
    this.activeWorkflowId.set(wf.id);
    this.runs.set([]);
    this.selectedRunId.set(null);
    this.leadStatuses.set(new Map());
    this.selectedLeads.set(new Set());
    this.postStatuses.set(new Map());
    this.expandedPost.set(-1);
    this.loadRuns(wf.id);
  }

  triggerRun(): void {
    const wf = this.activeWorkflow();
    if (!wf) return;
    this.http.post<{ data: { runId: string } }>(`${this.apiBase}/${wf.id}/run`, {}).subscribe({
      next: (res) => {
        // Reload runs to show the new one
        this.loadRuns(wf.id);
      },
      error: (err) => {
        const detail = err?.error?.detail ?? err?.message ?? 'Greska pri pokretanju';
        alert(detail);
      },
    });
  }

  private loadRuns(workflowId: string): void {
    this.http.get<{ data: ProcessRunResponse[] }>(`${this.apiBase}/${workflowId}/runs?limit=10`).subscribe({
      next: (res) => {
        this.runs.set(res.data);
        const first = res.data[0];
        if (first) {
          this.selectRun(first);
        }
      },
    });
  }

  selectRun(run: ProcessRunResponse): void {
    this.selectedRunId.set(run.id);
    this.leadStatuses.set(new Map());

    // Load full run detail with step results
    this.http.get<{ data: ProcessRunResponse }>(`${this.apiBase}/runs/${run.id}`).subscribe({
      next: (res) => {
        // Update this run in the list
        this.runs.update(runs => runs.map(r => r.id === res.data.id ? res.data : r));
      },
    });
  }

  private leadKey(lead: LeadData): string {
    return lead.name + lead.company;
  }

  isLeadSelected(lead: LeadData): boolean {
    return this.selectedLeads().has(this.leadKey(lead));
  }

  handleSelectionChange(event: { lead: LeadData; selected: boolean }): void {
    this.selectedLeads.update(set => {
      const newSet = new Set(set);
      const key = this.leadKey(event.lead);
      if (event.selected) {
        newSet.add(key);
      } else {
        newSet.delete(key);
      }
      return newSet;
    });
  }

  getLeadStatus(lead: LeadData): 'pending' | 'approved' | 'skipped' {
    return this.leadStatuses().get(lead.name + lead.company) ?? 'pending';
  }

  handleLeadAction(event: { lead: LeadData; action: LeadAction }): void {
    if (event.action === 'approve' || event.action === 'skip') {
      const key = event.lead.name + event.lead.company;
      this.leadStatuses.update(map => {
        const newMap = new Map(map);
        newMap.set(key, event.action === 'approve' ? 'approved' : 'skipped');
        return newMap;
      });
    }
  }

  toggleSelectAll(): void {
    if (this.allSelected()) {
      this.clearSelection();
    } else {
      this.selectAll();
    }
  }

  selectAll(): void {
    this.selectedLeads.set(new Set(this.leads().map(l => this.leadKey(l))));
  }

  clearSelection(): void {
    this.selectedLeads.set(new Set());
  }

  approveSelected(): void {
    this.leadStatuses.update(map => {
      const newMap = new Map(map);
      for (const lead of this.leads()) {
        const key = this.leadKey(lead);
        if (this.selectedLeads().has(key)) {
          newMap.set(key, 'approved');
        } else if (!newMap.has(key)) {
          newMap.set(key, 'skipped');
        }
      }
      return newMap;
    });
    this.selectedLeads.set(new Set());
  }

  batchApprove(): void {
    this.leadStatuses.update(map => {
      const newMap = new Map(map);
      for (const lead of this.leads()) {
        const key = lead.name + lead.company;
        if (!newMap.has(key)) newMap.set(key, 'approved');
      }
      return newMap;
    });
  }

  batchSkip(): void {
    this.leadStatuses.update(map => {
      const newMap = new Map(map);
      for (const lead of this.leads()) {
        const key = lead.name + lead.company;
        if (!newMap.has(key)) newMap.set(key, 'skipped');
      }
      return newMap;
    });
  }

  formatStatus(status: string): string {
    const map: Record<string, string> = {
      IDLE: 'Na cekanju',
      RUNNING: 'U toku',
      WAITING_APPROVAL: 'Ceka odobrenje',
      COMPLETED: 'Zavrseno',
      FAILED: 'Neuspesno',
      CANCELLED: 'Otkazano',
    };
    return map[status] ?? status;
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('sr-Latn-RS', {
      day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });
  }

  getProgressPct(run: ProcessRunResponse): number {
    if (!run.currentStepOrder) return 0;
    return (run.currentStepOrder / this.totalSteps()) * 100;
  }

  copyHashtags(tags: string[]): void {
    const text = tags.map(t => `#${t}`).join(' ');
    navigator.clipboard.writeText(text);
  }

  togglePost(index: number): void {
    this.expandedPost.set(this.expandedPost() === index ? -1 : index);
  }

  togglePostApproval(post: any): void {
    this.postStatuses.update(map => {
      const newMap = new Map(map);
      const current = newMap.get(post.topic);
      if (current === 'approved') {
        newMap.delete(post.topic);
      } else {
        newMap.set(post.topic, 'approved');
      }
      return newMap;
    });
  }

  submitContentApproval(approved: boolean): void {
    const run = this.selectedRun();
    if (!run?.stepResults) return;
    const approvalResult = run.stepResults.find(r =>
      r.status === 'PENDING' || r.status === 'RUNNING'
    );
    if (!approvalResult) return;

    const approvedPosts = this.posts().filter(p =>
      this.postStatuses().get(p.topic) === 'approved'
    );

    this.http.post(`${this.apiBase}/runs/${run.id}/approve/${approvalResult.id}`, {
      approved,
      modifiedOutput: approved ? { approvedPosts } : undefined,
    }).subscribe({
      next: () => {
        const wf = this.activeWorkflow();
        if (wf) this.loadRuns(wf.id);
      },
    });
  }

  submitApproval(approved: boolean): void {
    const run = this.selectedRun();
    if (!run?.stepResults) return;

    // Find the APPROVAL step result that's pending
    const approvalResult = run.stepResults.find(r =>
      r.status === 'PENDING' || r.status === 'RUNNING'
    );
    if (!approvalResult) return;

    // Build modified output with only approved leads
    const approvedLeads = this.leads().filter(l =>
      this.leadStatuses().get(l.name + l.company) === 'approved'
    );

    this.http.post(`${this.apiBase}/runs/${run.id}/approve/${approvalResult.id}`, {
      approved,
      modifiedOutput: approved ? { approvedLeads } : undefined,
    }).subscribe({
      next: () => {
        // Reload runs after approval
        const wf = this.activeWorkflow();
        if (wf) this.loadRuns(wf.id);
      },
    });
  }

  private reloadCurrentRun(): void {
    const runId = this.selectedRunId();
    if (runId) {
      this.http.get<{ data: ProcessRunResponse }>(`${this.apiBase}/runs/${runId}`).subscribe({
        next: (res) => this.runs.update(runs => runs.map(r => r.id === res.data.id ? res.data : r)),
      });
    }
  }

  private setupWsListeners(): void {
    this.unsubscribers.push(
      this.wsService.onProcessRunStarted(() => this.reloadCurrentRun()),
      this.wsService.onProcessStepStarted(() => this.reloadCurrentRun()),
      this.wsService.onProcessStepOutput(() => this.reloadCurrentRun()),
      this.wsService.onProcessStepFailed(() => this.reloadCurrentRun()),
      this.wsService.onProcessApprovalNeeded(() => this.reloadCurrentRun()),
      this.wsService.onProcessComplete(() => {
        const wf = this.activeWorkflow();
        if (wf) this.loadRuns(wf.id);
      }),
      this.wsService.onProcessCancelled(() => {
        const wf = this.activeWorkflow();
        if (wf) this.loadRuns(wf.id);
      }),
    );
  }
}
