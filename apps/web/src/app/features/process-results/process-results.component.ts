import { Component, inject, signal, computed, OnInit, OnDestroy, AfterViewInit } from '@angular/core';
import { PageLoadingService } from '../../core/services/page-loading.service';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { LeadCardComponent, LeadData, LeadAction } from './components/lead-card.component';
import { ContentPreviewComponent, ContentData } from './components/content-preview.component';
import { ContentCalendarComponent, CalendarItem } from './components/content-calendar.component';
import { BrochureIdeasComponent, BrochureIdea } from './components/brochure-ideas.component';
import { BuilderResultsComponent } from './components/builder-results.component';
import { ChatWebsocketService } from '../chat/services/chat-websocket.service';
import type {
  ProcessRunResponse,
  ProcessWorkflowResponse,
  ProcessRunStatus,
} from '@mentor-ai/shared/types';

@Component({
  selector: 'app-process-results',
  standalone: true,
  imports: [LeadCardComponent, ContentPreviewComponent, ContentCalendarComponent, BrochureIdeasComponent, BuilderResultsComponent],
  template: `
    <div class="process-results">
      <!-- Process tabs -->
      <div class="process-tabs">
        @for (wf of workflows(); track wf.id) {
          <button class="process-tab" [class.active]="activeWorkflowId() === wf.id" (click)="switchWorkflow(wf)">
            {{ wf.name }}
          </button>
        }
      </div>

      <!-- Sub-tabs + actions -->
      <div class="content-header">
        <div class="view-tabs">
          <button class="view-tab" [class.active]="viewMode() === 'runs'" (click)="viewMode.set('runs')">Runs</button>
          <button class="view-tab" [class.active]="viewMode() === 'saved'" (click)="viewMode.set('saved'); loadSaved()">Saved</button>
        </div>
        <div class="header-actions">
          @if (activeWorkflow()) {
            <button class="run-btn" [disabled]="isRunning()" (click)="triggerRun()">
              @if (isRunning()) {
                <span class="run-spinner"></span> Running...
              } @else {
                Run process
              }
            </button>
          }
        </div>
      </div>

      @if (viewMode() === 'saved') {
        @if (loadingSaved()) {
          <div class="loading-inline"><span class="spinner-sm"></span> Loading saved data...</div>
        }
        @if (isBuilderProcess()) {
          <div class="builder-saved-wrap">
            @if (builderSavedLoading()) {
              <div class="loading-inline"><span class="spinner-sm"></span> Loading from Notion…</div>
            }
            @if (!builderSavedLoading() && builderSavedItems().length === 0) {
              <div class="builder-saved-empty">
                No saved items yet. Run the process and approve some
                results to see them here.
                @if (notionUrlForActive()) {
                  <a class="notion-link-inline" [href]="notionUrlForActive()" target="_blank" rel="noopener">
                    Open Notion database →
                  </a>
                }
              </div>
            }
            @if (builderSavedItems().length > 0) {
              <div class="builder-saved-header">
                <span class="muted">{{ builderSavedItems().length }} items in Notion</span>
                @if (notionUrlForActive()) {
                  <a class="notion-link-inline" [href]="notionUrlForActive()" target="_blank" rel="noopener">
                    Open in Notion →
                  </a>
                }
              </div>
              <app-builder-results
                [items]="builderSavedItems()"
                [readonly]="true"
              />
            }
          </div>
        } @else if (isLeadWorkflow()) {
          <!-- Saved leads — same table as runs -->
          <div class="leads-table-wrap">
            <table class="leads-table">
              <thead>
                <tr>
                  <th>Score</th>
                  <th>Name</th>
                  <th>Company</th>
                  <th>Location</th>
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
            @if (savedLeads().length === 0) { <div class="empty-state">No saved leads. Run and approve the Lead Discovery process.</div> }
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
                            <h4 class="section-label">Strategy</h4>
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
                            <button class="copy-btn" (click)="copyHashtags(post.hashtags); $event.stopPropagation()">Copy</button>
                          </div>
                        }
                      </div>
                    </div>
                  </div>
                }
              </div>
            }
            @if (savedContent().length === 0) { <div class="empty-state">No saved content. Run and approve the Instagram Content process.</div> }
          </div>
        }
      }

      @if (viewMode() === 'runs') {
      @if (loadingRuns()) {
        <div class="loading-inline"><span class="spinner-sm"></span> Loading runs...</div>
      }
      <div class="results-layout">
        <!-- Left sidebar: run progress -->
        <aside class="run-sidebar">
          <h3 class="sidebar-title">Recent runs</h3>
          @for (run of runs(); track run.id; let i = $index) {
            <div class="run-item" [class.active]="selectedRunId() === run.id" [class.is-new]="isNewRun(run)" (click)="selectRun(run); markRunSeen(run)">
              <div class="run-header-row">
                <span class="run-title">{{ activeWorkflow()?.name }} — T-{{ runs().length - i }}</span>
                <span class="run-dot" [class]="'dot-' + run.status"></span>
              </div>
              <div class="run-date">{{ formatDate(run.createdAt) }}</div>
              @if (run.currentStepOrder && run.status === 'RUNNING') {
                <div class="run-progress">
                  <div class="progress-bar">
                    <div class="progress-fill" [style.width.%]="getProgressPct(run)"></div>
                  </div>
                  <span class="progress-text">Step {{ run.currentStepOrder }}/{{ totalSteps() }}</span>
                </div>
              }
            </div>
          }

          @if (runs().length === 0) {
            <div class="empty-state">No runs</div>
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
                    <div class="activity-log">
                      <div class="process-executing">
                        <div class="exec-spinner"></div>
                        <div class="exec-label">Process is being executed</div>
                        <div class="exec-step">{{ executionStatus() }}</div>
                      </div>
                      @for (activity of activityLog(); track $index) {
                        <div class="activity-entry" [class]="'activity-' + activity.type">
                          @if (activity.type === 'tool') {
                            <span class="activity-icon">&#x1F527;</span>
                            <span>{{ activity.tool }} — {{ activity.status }}</span>
                          } @else if (activity.type === 'text') {
                            <span class="activity-icon">&#x270F;</span>
                            <span class="activity-text">{{ activity.data }}</span>
                          } @else if (activity.type === 'status') {
                            <span class="activity-icon">&#x2699;</span>
                            <span>{{ activity.phase }}</span>
                          } @else if (activity.type === 'error') {
                            <span class="activity-icon">&#x26A0;</span>
                            <span class="activity-error">{{ activity.data }}</span>
                          }
                        </div>
                      }
                      @if (activityLog().length === 0) {
                        <div class="activity-entry">Connecting to agent...</div>
                      }
                    </div>
                  } @else if (selectedRun()!.status === 'WAITING_APPROVAL') {
                    Waiting for your approval.
                  } @else {
                    No leads in this run.
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

                @if ((selectedRun()?.status === 'WAITING_APPROVAL' || selectedRun()?.status === 'COMPLETED') && approvedCount() > 0) {
                  <button class="batch-btn submit-btn" [disabled]="approvingSaving()" (click)="submitApproval(true)">
                    @if (approvingSaving()) {
                      <span class="btn-spinner"></span> Saving to CRM...
                    } @else {
                      Save ({{ approvedCount() }} leads)
                    }
                  </button>
                }
              </div>
            }
          }

          @if (isBuilderProcess()) {
            @if (selectedRun()) {
              <app-builder-results
                [items]="builderItems()"
                [approving]="builderApproving()"
                (approve)="approveBuilderItems($event)"
              />
            } @else {
              <div class="empty-state">
                No run selected. Click a run on the left or click
                <strong>Run process</strong> to execute it.
              </div>
            }
          } @else if (!isLeadWorkflow()) {
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
                              <span class="placeholder-text">Image will be generated</span>
                              <p class="post-prompt">{{ post.imagePrompt }}</p>
                            </div>
                          }

                          @if (post.visualStyle) {
                            <div class="post-meta-item">
                              <span class="meta-label">Visual style</span>
                              <span class="meta-value">{{ post.visualStyle }}</span>
                            </div>
                          }
                          @if (post.suggestedDay) {
                            <div class="post-meta-item">
                              <span class="meta-label">Suggested day</span>
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
                              <span class="meta-label">Reference</span>
                              <span class="meta-value">{{ post.reference }}</span>
                            </div>
                          }
                        </div>

                        <!-- Right: text content -->
                        <div class="detail-right">
                          <!-- Strategy / Why -->
                          @if (post.reasoning || post.whyItWorks) {
                            <div class="strategy-box">
                              <h4 class="section-label">📋 Strategy — why we are creating this content</h4>
                              @if (post.reasoning) {
                                <p class="strategy-text">{{ post.reasoning }}</p>
                              }
                              @if (post.whyItWorks) {
                                <p class="strategy-text"><strong>Why it works:</strong> {{ post.whyItWorks }}</p>
                              }
                              @if (post.scoreBreakdown) {
                                <div class="score-mini">
                                  @if (post.scoreBreakdown.relevance !== undefined) { <span class="score-chip">Relevance: {{ post.scoreBreakdown.relevance }}/2</span> }
                                  @if (post.scoreBreakdown.engagement !== undefined) { <span class="score-chip">Engagement: {{ post.scoreBreakdown.engagement }}/2</span> }
                                  @if (post.scoreBreakdown.uniqueness !== undefined) { <span class="score-chip">Uniqueness: {{ post.scoreBreakdown.uniqueness }}/2</span> }
                                  @if (post.scoreBreakdown.brandFit !== undefined) { <span class="score-chip">Brand fit: {{ post.scoreBreakdown.brandFit }}/2</span> }
                                  @if (post.scoreBreakdown.timeliness !== undefined) { <span class="score-chip">Timeliness: {{ post.scoreBreakdown.timeliness }}/2</span> }
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
                              <button class="copy-btn" (click)="copyHashtags(post.hashtags); $event.stopPropagation()">Copy hashtags</button>
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
                    <div class="activity-log">
                      <div class="activity-header">Process running...</div>
                      @for (activity of activityLog(); track $index) {
                        <div class="activity-entry" [class]="'activity-' + activity.type">
                          @if (activity.type === 'tool') {
                            <span class="activity-icon">&#x1F527;</span>
                            <span>{{ activity.tool }} — {{ activity.status }}</span>
                          } @else if (activity.type === 'text') {
                            <span class="activity-icon">&#x270F;</span>
                            <span class="activity-text">{{ activity.data }}</span>
                          } @else if (activity.type === 'status') {
                            <span class="activity-icon">&#x2699;</span>
                            <span>{{ activity.phase }}</span>
                          } @else if (activity.type === 'error') {
                            <span class="activity-icon">&#x26A0;</span>
                            <span class="activity-error">{{ activity.data }}</span>
                          }
                        </div>
                      }
                      @if (activityLog().length === 0) {
                        <div class="activity-entry">Connecting to agent...</div>
                      }
                    </div>
                  } @else if (selectedRun()!.status === 'WAITING_APPROVAL') {
                    @if (brochureIdeas().length > 0) {
                      <app-brochure-ideas
                        [ideas]="brochureIdeas()"
                        (ideaApproved)="onBrochureIdeaApproved($event)"
                        (ideaRejected)="submitGenericApproval(false)"
                      />
                    } @else {
                      <div class="approval-prompt">
                        <p>Process is waiting for your approval to continue.</p>
                        @if (pendingStepOutput()) {
                          <pre class="step-output">{{ pendingStepOutput() }}</pre>
                        }
                        <div class="approval-actions">
                          <button class="batch-btn submit-btn" (click)="submitGenericApproval(true)">Approve and continue</button>
                          <button class="batch-btn skip-all" (click)="submitGenericApproval(false)">Reject</button>
                        </div>
                      </div>
                    }
                  } @else {
                    No posts in this run.
                  }
                </div>
              }
            </div>

            <!-- Submit approval for content -->
            @if (posts().length > 0 && (selectedRun()?.status === 'WAITING_APPROVAL' || selectedRun()?.status === 'COMPLETED')) {
              <div class="batch-actions">
                <button class="batch-btn submit-btn" [disabled]="approvingSaving()" (click)="submitContentApproval(true)">
                  @if (approvingSaving()) {
                    <span class="btn-spinner"></span> Saving to Notion...
                  } @else {
                    Confirm approved ({{ approvedPostCount() }})
                  }
                </button>
                <button class="batch-btn skip-all" [disabled]="approvingSaving()" (click)="submitContentApproval(false)">Reject all</button>
              </div>
            }
          }
        </main>
      </div>
      }

      <!-- Run input modal: appears when user clicks Run on a process
           that has an inputContract with required runtime parameters -->
      @if (runInputOpen()) {
        <div class="modal-backdrop" (click)="cancelRunInputs()">
          <div class="modal-card" (click)="$event.stopPropagation()">
            <div class="modal-header">
              <h3>Run {{ activeWorkflow()?.name }}</h3>
              <button class="modal-close" (click)="cancelRunInputs()">×</button>
            </div>
            <p class="modal-sub">
              Provide the inputs the process needs for this run.
            </p>
            <div class="modal-fields">
              @for (f of inputContractFields(); track f.name) {
                <label class="modal-field">
                  <span class="field-label">
                    {{ f.name }}
                    @if (f.required) { <span class="req-mark">*</span> }
                  </span>
                  @if (f.description) {
                    <span class="field-hint">{{ f.description }}</span>
                  }
                  @if (f.enum && f.enum.length > 0) {
                    <select
                      class="field-select"
                      [value]="runInputValues()[f.name] || ''"
                      (change)="updateRunInputField(f.name, $any($event.target).value)"
                    >
                      <option value="">— select —</option>
                      @for (opt of f.enum; track opt) {
                        <option [value]="opt">{{ opt }}</option>
                      }
                    </select>
                  } @else if (f.type === 'number' || f.type === 'integer') {
                    <input
                      type="number"
                      class="field-input"
                      [value]="runInputValues()[f.name] ?? ''"
                      (input)="updateRunInputField(f.name, +$any($event.target).value)"
                    />
                  } @else if (f.type === 'boolean') {
                    <input
                      type="checkbox"
                      class="field-checkbox"
                      [checked]="!!runInputValues()[f.name]"
                      (change)="updateRunInputField(f.name, $any($event.target).checked)"
                    />
                  } @else {
                    <textarea
                      class="field-input field-textarea"
                      rows="2"
                      [value]="runInputValues()[f.name] || ''"
                      (input)="updateRunInputField(f.name, $any($event.target).value)"
                    ></textarea>
                  }
                </label>
              }
            </div>
            <div class="modal-actions">
              <button class="modal-cancel" (click)="cancelRunInputs()">Cancel</button>
              <button class="modal-run" (click)="submitRunInputs()">Run process</button>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .process-results { padding: 24px; }
    .process-tabs {
      display: flex; gap: 0;
      border-bottom: 1px solid #21262D;
      margin-bottom: 0;
    }
    .process-tab {
      padding: 10px 20px; font-size: 14px; font-weight: 500;
      cursor: pointer; background: none; border: none;
      border-bottom: 2px solid transparent;
      color: #8B949E; transition: all 0.2s;
    }
    .process-tab:hover { color: #E6EDF3; }
    .process-tab.active {
      color: #58A6FF;
      border-bottom-color: #58A6FF;
    }
    .content-header {
      display: flex; justify-content: space-between; align-items: center;
      margin-bottom: 4px; margin-top: 12px;
    }
    .results-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 20px; }
    .header-left { display: flex; flex-direction: column; gap: 8px; }
    .results-title { color: #E6EDF3; font-size: 24px; font-weight: 700; margin: 0; }
    /* process-tabs removed — replaced by process-sidebar cards */
    .header-actions { display: flex; gap: 8px; }
    .run-btn {
      padding: 10px 24px; background: #58A6FF; color: #E6EDF3; border: none;
      border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer;
      display: flex; align-items: center; gap: 8px; transition: background 0.15s;
    }
    .run-btn:hover:not(:disabled) { background: #2563eb; }
    .run-btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .run-spinner {
      display: inline-block; width: 14px; height: 14px; border: 2px solid #E6EDF340;
      border-top-color: #E6EDF3; border-radius: 50%; animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .results-layout { display: flex; gap: 20px; }

    .run-sidebar {
      width: 240px; flex-shrink: 0; background: #161B22; border-radius: 8px;
      padding: 16px; overflow-y: auto; border: 1px solid #21262D;
    }
    .sidebar-title { color: #E6EDF3; font-size: 14px; font-weight: 600; margin: 0 0 12px; }
    .run-item {
      padding: 10px; border-radius: 6px; cursor: pointer; margin-bottom: 8px;
      border: 1px solid transparent; transition: all 0.15s;
    }
    .run-item:hover { border-color: #21262D; background: #1C2128; }
    .run-item.active { border-color: #58A6FF; background: #1C2128; }
    .run-item.is-new { border-left: 3px solid #58A6FF; }
    .run-header-row { display: flex; align-items: center; justify-content: space-between; gap: 6px; }
    .new-dot { width: 8px; height: 8px; border-radius: 50%; background: #58A6FF; flex-shrink: 0; }
    .run-title { font-size: 12px; font-weight: 500; color: #E6EDF3; }
    .run-dot {
      width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
    }
    .dot-COMPLETED { background: #3FB950; }
    .dot-RUNNING { background: #58A6FF; animation: pulse 1.5s infinite; }
    .dot-FAILED { background: #F85149; }
    .dot-WAITING_APPROVAL { background: #D29922; }
    .dot-IDLE, .dot-CANCELLED { background: #6E7681; }
    .status-COMPLETED { color: #3FB950; }
    .status-RUNNING { color: #58A6FF; }
    .status-WAITING_APPROVAL { color: #D29922; }
    .status-FAILED { color: #F85149; }
    .status-CANCELLED { color: #6B7280; }
    .status-IDLE { color: #6B7280; }
    .run-date { color: #6B7280; font-size: 11px; }
    .run-progress { margin-top: 6px; }
    .progress-bar { height: 3px; background: #1C2128; border-radius: 2px; overflow: hidden; }
    .progress-fill { height: 100%; background: #58A6FF; border-radius: 2px; transition: width 0.3s; }
    .progress-text { color: #6B7280; font-size: 10px; margin-top: 2px; display: block; }

    .results-main { flex: 1; min-width: 0; display: flex; flex-direction: column; }


    .stats-bar {
      display: flex; gap: 16px; margin-bottom: 16px; padding: 12px;
      background: #161B22; border-radius: 8px; border: 1px solid #21262D;
    }
    .stat { display: flex; flex-direction: column; align-items: center; min-width: 70px; }
    .stat-val { color: #E6EDF3; font-size: 20px; font-weight: 700; }
    .stat-label { color: #6B7280; font-size: 11px; }

    .leads-table-wrap { flex: 1; overflow-y: auto; border-radius: 8px; border: 1px solid #21262D; }
    .leads-table { width: 100%; border-collapse: collapse; background: #0D1117; }
    .leads-table thead { position: sticky; top: 0; z-index: 1; }
    .leads-table th {
      background: #161B22; color: #6B7280; font-size: 11px; font-weight: 600;
      text-transform: uppercase; padding: 8px; text-align: left; border-bottom: 1px solid #21262D;
      letter-spacing: 0.5px;
    }
    .th-check { width: 32px; }
    .th-check input { accent-color: #58A6FF; cursor: pointer; }

    .batch-actions {
      position: sticky; bottom: 0; display: flex; gap: 8px; padding: 12px;
      background: #0D1117; border-top: 1px solid #21262D;
    }
    .batch-btn {
      padding: 8px 20px; border-radius: 6px; font-size: 13px; font-weight: 600;
      cursor: pointer; border: none; transition: all 0.15s;
    }
    .approve-all { background: #3FB950; color: #0D1117; }
    .approve-all:hover { background: #16a34a; }
    .select-all { background: #58A6FF; color: #E6EDF3; }
    .select-all:hover { background: #2563eb; }
    .submit-btn { background: #D29922; color: #0D1117; display: inline-flex; align-items: center; gap: 6px; }
    .submit-btn:hover { background: #B08800; }
    .submit-btn:disabled { opacity: 0.7; cursor: wait; }
    .btn-spinner {
      display: inline-block;
      width: 14px; height: 14px;
      border: 2px solid rgba(0,0,0,0.2);
      border-top-color: #0D1117;
      border-radius: 50%;
      animation: spin 0.6s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .skip-all { background: transparent; border: 1px solid #6B7280; color: #6B7280; }
    .skip-all:hover { background: #6B728020; }

    .content-section { display: flex; flex-direction: column; gap: 12px; }
    .content-toggle { display: flex; gap: 4px; }
    .toggle-btn {
      padding: 6px 16px; border-radius: 6px; font-size: 12px; cursor: pointer;
      background: transparent; border: 1px solid #21262D; color: #9CA3AF;
    }
    .toggle-btn.active { background: #D29922; border-color: #D29922; color: #0D1117; }

    /* Post cards */
    .posts-list { display: flex; flex-direction: column; gap: 8px; padding-bottom: 80px; }
    .post-card {
      background: #161B22; border: 1px solid #21262D; border-radius: 8px;
      overflow: hidden; transition: border-color 0.15s;
    }
    .post-card:hover { border-color: #58A6FF; }
    .post-card.approved { border-color: #3FB950; }
    .post-card.skipped { opacity: 0.4; }
    .post-header {
      display: flex; align-items: center; gap: 12px; padding: 12px 16px;
      cursor: pointer;
    }
    .post-header input { accent-color: #58A6FF; width: 16px; height: 16px; cursor: pointer; }
    .post-info { flex: 1; display: flex; flex-direction: column; gap: 2px; }
    .post-topic { color: #E6EDF3; font-size: 14px; font-weight: 500; }
    .post-score {
      display: inline-block; padding: 1px 8px; border-radius: 4px; font-size: 11px; font-weight: 700;
      width: fit-content;
    }
    .score-high { background: #3FB95020; color: #3FB950; }
    .score-medium { background: #D2992220; color: #D29922; }
    .score-low { background: #F8514920; color: #F85149; }
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
      background: #1C2128; border-radius: 8px; padding: 24px; text-align: center;
      border: 1px dashed #21262D; display: flex; flex-direction: column; align-items: center; gap: 8px;
    }
    .placeholder-icon { font-size: 32px; }
    .placeholder-text { color: #6B7280; font-size: 12px; }

    .post-meta-item { display: flex; flex-direction: column; gap: 2px; }
    .meta-label { color: #6B7280; font-size: 9px; text-transform: uppercase; font-weight: 600; letter-spacing: 0.5px; }
    .meta-value { color: #9CA3AF; font-size: 12px; }

    .strategy-box {
      background: #141420; border-radius: 8px; padding: 14px;
      border-left: 3px solid #D29922; display: flex; flex-direction: column; gap: 8px;
    }
    .strategy-text { color: #9CA3AF; font-size: 13px; line-height: 1.6; margin: 0; }
    .score-mini { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
    .score-chip {
      background: #1C2128; color: #6B7280; padding: 2px 8px; border-radius: 4px;
      font-size: 10px; font-weight: 600;
    }

    .caption-box {
      background: #161B22; border-radius: 8px; padding: 14px;
      border: 1px solid #21262D; display: flex; flex-direction: column; gap: 8px;
    }
    .hook-line {
      color: #E6EDF3; font-size: 15px; font-weight: 600; line-height: 1.4;
      padding-bottom: 8px; border-bottom: 1px solid #21262D;
    }
    .cta-line { color: #D29922; font-size: 12px; font-weight: 500; padding-top: 6px; border-top: 1px solid #21262D; }

    .section-label { color: #9CA3AF; font-size: 10px; text-transform: uppercase; font-weight: 600; margin: 0; letter-spacing: 0.5px; }
    .post-caption { color: #E6EDF3; font-size: 13px; line-height: 1.7; white-space: pre-wrap; }

    .hashtags-box { display: flex; flex-direction: column; gap: 8px; }
    .post-hashtags { display: flex; flex-wrap: wrap; gap: 4px; }
    .hashtag { color: #58A6FF; font-size: 12px; }
    .copy-btn {
      align-self: flex-start; background: transparent; border: 1px solid #58A6FF;
      color: #58A6FF; padding: 4px 12px; border-radius: 4px; font-size: 11px;
      cursor: pointer;
    }
    .copy-btn:hover { background: #58A6FF20; }

    .post-prompt { color: #D29922; font-size: 11px; font-family: monospace; background: #1C2128; padding: 8px; border-radius: 4px; }

    /* View toggle */
    .view-tabs {
      display: flex; gap: 0; margin-bottom: 16px;
      border-bottom: 1px solid #21262D;
    }
    .view-tab {
      padding: 10px 20px; font-size: 13px; font-weight: 500;
      cursor: pointer; background: none; border: none;
      border-bottom: 2px solid transparent;
      color: #8B949E; transition: all 0.2s;
    }
    .view-tab:hover { color: #E6EDF3; }
    .view-tab.active {
      color: #58A6FF;
      border-bottom-color: #58A6FF;
    }

    /* Saved items */
    .saved-section { display: flex; flex-direction: column; gap: 12px; }
    .saved-card {
      background: #161B22; border: 1px solid #21262D; border-radius: 8px;
      padding: 16px; display: flex; flex-direction: column; gap: 8px;
    }
    .saved-header { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .saved-name { color: #E6EDF3; font-size: 14px; font-weight: 600; }
    .saved-company { color: #D29922; font-size: 13px; }
    .saved-score { background: #3FB95020; color: #3FB950; padding: 1px 6px; border-radius: 4px; font-size: 11px; font-weight: 700; }
    .saved-status { font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 3px; }
    .st-approved { background: #3FB95020; color: #3FB950; }
    .st-posted { background: #58A6FF20; color: #58A6FF; }
    .saved-details { display: flex; gap: 12px; flex-wrap: wrap; }
    .saved-detail { color: #6B7280; font-size: 12px; }
    .saved-desc { color: #9CA3AF; font-size: 12px; line-height: 1.5; margin: 0; }
    .saved-fit { color: #D29922; font-size: 12px; font-style: italic; margin: 0; }
    .saved-image { border-radius: 6px; overflow: hidden; max-width: 300px; }
    .saved-image img { width: 100%; display: block; }
    .saved-caption { color: #E6EDF3; font-size: 13px; line-height: 1.5; white-space: pre-wrap; }
    .saved-hashtags { display: flex; flex-wrap: wrap; gap: 4px; }

    .empty-state { color: #6B7280; text-align: center; padding: 40px; font-size: 14px; }

    /* Real-time activity log (claude-code pattern) */
    .activity-log { text-align: left; max-width: 500px; margin: 0 auto; }
    .process-executing {
      display: flex; flex-direction: column; align-items: center;
      gap: 16px; padding: 40px 20px;
    }
    .exec-spinner {
      width: 40px; height: 40px;
      border: 3px solid #21262D;
      border-top-color: #58A6FF;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    .exec-label {
      font-size: 16px; font-weight: 600; color: #E6EDF3;
    }
    .exec-step {
      font-size: 13px; color: #8B949E;
      max-width: 400px; text-align: center;
      animation: pulse 2s ease-in-out infinite;
    }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.5; } }
    .activity-header { font-size: 15px; font-weight: 600; color: #58A6FF; margin-bottom: 12px; }
    .activity-entry { display: flex; align-items: flex-start; gap: 8px; padding: 4px 0; font-size: 12px; color: #9CA3AF; border-left: 2px solid #21262D; padding-left: 10px; margin-bottom: 4px; }
    .activity-icon { flex-shrink: 0; width: 16px; }
    .activity-text { color: #D1D5DB; white-space: pre-wrap; max-height: 40px; overflow: hidden; }
    .activity-error { color: #EF4444; }
    .activity-tool { color: #8B5CF6; }
    .activity-status { color: #58A6FF; }
    .loading-inline {
      display: flex; align-items: center; gap: 10px;
      padding: 20px; color: #8B949E; font-size: 13px;
    }
    .spinner-sm {
      display: inline-block; width: 18px; height: 18px;
      border: 2px solid #21262D; border-top-color: #58A6FF;
      border-radius: 50%; animation: spin 0.7s linear infinite;
    }
    .approval-prompt { text-align: left; }
    .approval-prompt p { color: #E6EDF3; margin-bottom: 16px; font-size: 14px; }
    .approval-actions { display: flex; gap: 12px; margin-top: 16px; }
    .step-output { background: #161B22; color: #B0B0B0; padding: 12px; border-radius: 6px; font-size: 11px; max-height: 300px; overflow-y: auto; white-space: pre-wrap; word-break: break-word; margin-bottom: 12px; }
    .builder-saved-info {
      padding: 32px;
      text-align: center;
      background: #161B22;
      border: 1px solid #21262D;
      border-radius: 8px;
      color: #C9D1D9;
      font-size: 13px;
    }
    .builder-saved-info p { margin: 0 0 12px; }
    .builder-saved-info .muted { color: #6B7280; }
    .notion-link {
      display: inline-block;
      padding: 10px 20px;
      background: #58A6FF;
      color: #E6EDF3;
      border-radius: 8px;
      font-size: 13px;
      font-weight: 600;
      text-decoration: none;
    }
    .notion-link:hover { background: #2563eb; }
    .builder-saved-wrap { display: flex; flex-direction: column; gap: 12px; }
    .builder-saved-empty {
      padding: 32px;
      text-align: center;
      background: #161B22;
      border: 1px solid #21262D;
      border-radius: 8px;
      color: #8B949E;
      font-size: 13px;
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 12px;
    }
    .builder-saved-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 4px;
      font-size: 12px;
    }
    .builder-saved-header .muted { color: #6B7280; }
    .notion-link-inline {
      color: #58A6FF;
      font-size: 12px;
      text-decoration: none;
      font-weight: 500;
    }
    .notion-link-inline:hover { text-decoration: underline; }

    /* Run input modal */
    .modal-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.7);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 100;
      backdrop-filter: blur(2px);
    }
    .modal-card {
      background: #161B22;
      border: 1px solid #21262D;
      border-radius: 12px;
      padding: 24px;
      width: 520px;
      max-width: 90vw;
      max-height: 80vh;
      overflow-y: auto;
      box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
    }
    .modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .modal-header h3 {
      color: #E6EDF3;
      font-size: 18px;
      margin: 0;
      font-weight: 700;
    }
    .modal-close {
      background: transparent;
      border: none;
      color: #6B7280;
      font-size: 24px;
      cursor: pointer;
      padding: 0;
      line-height: 1;
    }
    .modal-close:hover { color: #E6EDF3; }
    .modal-sub {
      color: #8B949E;
      font-size: 13px;
      margin: 0 0 20px;
    }
    .modal-fields {
      display: flex;
      flex-direction: column;
      gap: 16px;
      margin-bottom: 24px;
    }
    .modal-field {
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    .field-label {
      font-size: 12px;
      font-weight: 600;
      color: #C9D1D9;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .req-mark {
      color: #F85149;
      margin-left: 2px;
    }
    .field-hint {
      font-size: 11px;
      color: #6B7280;
      margin-bottom: 4px;
    }
    .field-input,
    .field-select {
      background: #0D1117;
      border: 1px solid #21262D;
      border-radius: 6px;
      color: #E6EDF3;
      padding: 10px 12px;
      font-size: 13px;
      font-family: inherit;
    }
    .field-input:focus,
    .field-select:focus {
      outline: none;
      border-color: #58A6FF;
    }
    .field-textarea {
      resize: vertical;
      min-height: 60px;
    }
    .field-checkbox {
      width: 18px;
      height: 18px;
      accent-color: #58A6FF;
    }
    .modal-actions {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
    }
    .modal-cancel {
      background: transparent;
      border: 1px solid #21262D;
      color: #8B949E;
      border-radius: 8px;
      padding: 10px 20px;
      font-size: 13px;
      cursor: pointer;
    }
    .modal-cancel:hover { color: #E6EDF3; border-color: #58A6FF; }
    .modal-run {
      background: #58A6FF;
      color: #E6EDF3;
      border: none;
      border-radius: 8px;
      padding: 10px 20px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    .modal-run:hover { background: #2563eb; }
  `],
})
export class ProcessResultsComponent implements OnInit, OnDestroy {
  private readonly http = inject(HttpClient);
  private readonly wsService = inject(ChatWebsocketService);
  private readonly pageLoading = inject(PageLoadingService);
  private readonly apiBase = `${environment.apiUrl}/api/v1/processes`;
  private unsubscribers: Array<() => void> = [];

  viewMode = signal<'runs' | 'saved'>('runs');
  loadingRuns = signal(false);
  loadingSaved = signal(false);
  savedLeads = signal<any[]>([]);
  savedContent = signal<any[]>([]);
  workflows = signal<ProcessWorkflowResponse[]>([]);
  runs = signal<ProcessRunResponse[]>([]);
  selectedRunId = signal<string | null>(null);
  activeWorkflowId = signal<string | null>(null);
  leadStatuses = signal<Map<string, 'approved' | 'skipped'>>(new Map());
  selectedLeads = signal<Set<string>>(new Set());
  approvingSaving = signal(false);
  contentView = signal<'preview' | 'calendar'>('preview');
  /** Real-time activity log — ring buffer of last 10 streaming events (claude-code pattern) */
  activityLog = signal<Array<{ type: string; data?: string; tool?: string; status?: string; phase?: string; timestamp: number }>>([]);
  executionStatus = computed(() => {
    const log = this.activityLog();
    const last = log[log.length - 1];
    if (!last) return 'Initializing...';
    if (last.phase) return last.phase;
    if (last.tool) return `${last.tool} — ${last.status}`;
    if (last.data) return last.data.slice(0, 80);
    return 'Processing...';
  });
  expandedPost = signal(-1);
  expandedSavedPost = signal(-1);
  postStatuses = signal<Map<string, 'approved' | 'skipped'>>(new Map());

  activeWorkflow = computed(() => this.workflows().find(w => w.id === this.activeWorkflowId()));
  isLeadWorkflow = computed(() => this.activeWorkflow()?.slug === 'lead-discovery');
  isContentWorkflow = computed(() => this.activeWorkflow()?.slug === 'instagram-content' || this.activeWorkflow()?.slug === 'content-creation');
  // Builder-generated processes are anything the process-builder agent created.
  // We detect them by the createdByAgentId field, or by exclusion (not the
  // legacy lead/content slugs).
  isBuilderProcess = computed(() => {
    const wf = this.activeWorkflow() as any;
    if (!wf) return false;
    if (wf.createdByAgentId === 'process-builder') return true;
    const slug = wf.slug;
    return slug && slug !== 'lead-discovery' && slug !== 'instagram-content' && slug !== 'content-creation' && slug !== 'brochure-generation';
  });
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
      if (output?.leads) return output.leads; // n8n workflow output format
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

  // ── Builder-generated process results ─────────────────────────
  // Flattens the latest step's output array into a simple list of
  // items for the BuilderResultsComponent.
  builderItems = computed<Record<string, unknown>[]>(() => {
    const run = this.selectedRun();
    if (!run?.stepResults) return [];
    for (const result of [...run.stepResults].reverse()) {
      const output = result.output as any;
      if (!output) continue;
      if (Array.isArray(output.items)) return output.items;
      if (Array.isArray(output.leads)) return output.leads;
      if (Array.isArray(output.posts)) return output.posts;
      if (Array.isArray(output.results)) return output.results;
      if (Array.isArray(output.data)) return output.data;
      if (Array.isArray(output)) return output;
    }
    return [];
  });
  builderApproving = signal(false);

  // Saved tab — items fetched back from the per-process Notion database
  builderSavedItems = signal<Record<string, unknown>[]>([]);
  builderSavedLoading = signal(false);

  // Run input modal (for processes with inputContract)
  runInputOpen = signal(false);
  runInputValues = signal<Record<string, unknown>>({});
  inputContractFields = computed<
    Array<{
      name: string;
      type: string;
      description?: string;
      required: boolean;
      default?: unknown;
      enum?: unknown[];
    }>
  >(() => {
    const wf = this.activeWorkflow() as any;
    const ic = wf?.inputContract;
    if (!ic || typeof ic !== 'object') return [];
    const props = ic.properties ?? {};
    const required: string[] = ic.required ?? [];
    return Object.entries(props).map(([name, spec]: [string, any]) => ({
      name,
      type: spec?.type ?? 'string',
      description: spec?.description,
      required: required.includes(name),
      default: spec?.default,
      enum: spec?.enum,
    }));
  });

  notionUrlForActive = computed<string | null>(() => {
    const wf = this.activeWorkflow() as any;
    return wf?.invocationConfig?.notionDatabaseUrl ?? null;
  });

  async loadBuilderSaved(): Promise<void> {
    const wf = this.activeWorkflow();
    if (!wf || !this.isBuilderProcess()) return;
    this.builderSavedLoading.set(true);
    try {
      const tenantId = 'tnt_rljn1gj4cgxoph0hxfohv6l4';
      const res = await fetch(
        `${environment.apiUrl}/api/v1/builder/processes/${wf.id}/notion-records?tenantId=${tenantId}`,
      );
      const body = await res.json();
      this.builderSavedItems.set(body.data?.items ?? []);
    } catch (e) {
      console.error('Failed to load Notion records:', e);
      this.builderSavedItems.set([]);
    } finally {
      this.builderSavedLoading.set(false);
    }
  }

  async approveBuilderItems(items: Record<string, unknown>[]): Promise<void> {
    const wf = this.activeWorkflow();
    if (!wf || items.length === 0) return;
    this.builderApproving.set(true);
    try {
      const tenantId = 'tnt_rljn1gj4cgxoph0hxfohv6l4';
      const res = await fetch(
        `${environment.apiUrl}/api/v1/builder/processes/${wf.id}/approve-items`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tenantId, items }),
        },
      );
      const body = await res.json();
      if (body.error) {
        alert(`Save failed: ${body.error}`);
        return;
      }
      // Switch to Saved tab and load fresh records from Notion so the
      // user immediately sees what was actually persisted.
      this.viewMode.set('saved');
      await this.loadBuilderSaved();
    } catch (e) {
      alert(`Save failed: ${(e as Error).message}`);
    } finally {
      this.builderApproving.set(false);
    }
  }

  approvedPostCount = computed(() =>
    [...this.postStatuses().values()].filter(s => s === 'approved').length
  );

  brochureIdeas = computed((): BrochureIdea[] => {
    const run = this.selectedRun();
    const wf = this.activeWorkflow();
    if (!run?.stepResults || wf?.slug !== 'brochure-generation') return [];
    if (run.status !== 'WAITING_APPROVAL') return [];
    // Find the last completed step's output — should contain ideas
    const completedSteps = run.stepResults.filter(r => r.status === 'COMPLETED');
    if (completedSteps.length === 0) return [];
    const lastOutput = completedSteps[completedSteps.length - 1]?.output;
    if (!lastOutput) return [];
    try {
      const data = typeof lastOutput === 'string' ? JSON.parse(lastOutput) : lastOutput;
      if (data?.ideas && Array.isArray(data.ideas)) return data.ideas;
      if (Array.isArray(data)) return data;
      return [];
    } catch { return []; }
  });

  pendingStepOutput = computed(() => {
    const run = this.selectedRun();
    if (!run?.stepResults) return '';
    const pending = run.stepResults.find(r => r.status === 'PENDING' || r.status === 'RUNNING');
    if (!pending) return '';
    // Show output from the step BEFORE the approval step
    const prevIdx = run.stepResults.indexOf(pending) - 1;
    if (prevIdx >= 0 && run.stepResults[prevIdx]?.output) {
      try {
        const out = run.stepResults[prevIdx].output;
        return typeof out === 'string' ? out : JSON.stringify(out, null, 2).slice(0, 2000);
      } catch { return ''; }
    }
    return '';
  });

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
    // Mark current timestamp — new runs after this will show as "new" next visit
    // Only set if not already set (first visit initializes)
    if (!localStorage.getItem('processes_last_seen')) {
      localStorage.setItem('processes_last_seen', String(Date.now()));
    }
  }

  ngAfterViewInit(): void {
    // Update last seen when leaving page (will mark current runs as seen)
    setTimeout(() => localStorage.setItem('processes_last_seen', String(Date.now())), 500);
  }

  ngOnDestroy(): void {
    this.unsubscribers.forEach(fn => fn());
  }

  private loadWorkflows(): void {
    this.pageLoading.start();
    this.http.get<{ data: ProcessWorkflowResponse[] }>(this.apiBase).subscribe({
      next: (res) => {
        this.pageLoading.stop();
        this.workflows.set(res.data);
        // Auto-select first workflow if none selected
        const first = res.data[0];
        if (first && !this.activeWorkflowId()) {
          this.switchWorkflow(first);
        }
      },
      error: () => this.pageLoading.stop(),
    });
  }

  noop(): void {}

  toggleSavedPost(i: number): void {
    this.expandedSavedPost.set(this.expandedSavedPost() === i ? -1 : i);
  }

  loadSaved(): void {
    this.loadingSaved.set(true);
    if (this.isBuilderProcess()) {
      // Builder processes load from per-process Notion DB
      this.loadingSaved.set(false);
      this.loadBuilderSaved();
      return;
    }
    if (this.isLeadWorkflow()) {
      const mcpBase = `${environment.apiUrl}/api/v1/mcp`;
      this.http.get<{ data: any[] }>(`${mcpBase}/leads`).subscribe({
        next: (res) => { this.savedLeads.set(res.data); this.loadingSaved.set(false); },
        error: () => this.loadingSaved.set(false),
      });
    } else {
      const mcpBase = `${environment.apiUrl}/api/v1/mcp`;
      this.http.get<{ data: any[] }>(`${mcpBase}/content`).subscribe({
        next: (res) => { this.savedContent.set(res.data); this.loadingSaved.set(false); },
        error: () => this.loadingSaved.set(false),
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

    // If the process has an inputContract with required runtime
    // parameters, open the input modal first instead of running.
    const fields = this.inputContractFields();
    if (fields.length > 0) {
      // Initialize form values from defaults
      const initial: Record<string, unknown> = {};
      for (const f of fields) {
        if (f.default !== undefined) initial[f.name] = f.default;
        else initial[f.name] = '';
      }
      this.runInputValues.set(initial);
      this.runInputOpen.set(true);
      return;
    }

    this.executeRun({});
  }

  /** Submit the input modal — kicks off the run with collected values. */
  submitRunInputs(): void {
    const wf = this.activeWorkflow();
    if (!wf) return;
    const values = this.runInputValues();
    // Validate required fields
    const fields = this.inputContractFields();
    for (const f of fields) {
      if (f.required && (values[f.name] === '' || values[f.name] == null)) {
        alert(`"${f.name}" is required`);
        return;
      }
    }
    this.runInputOpen.set(false);
    this.executeRun(values);
  }

  cancelRunInputs(): void {
    this.runInputOpen.set(false);
  }

  updateRunInputField(name: string, value: unknown): void {
    this.runInputValues.update((v) => ({ ...v, [name]: value }));
  }

  private executeRun(input: Record<string, unknown>): void {
    const wf = this.activeWorkflow();
    if (!wf) return;
    this.http
      .post<{ data: { runId: string } }>(`${this.apiBase}/${wf.id}/run`, { input })
      .subscribe({
        next: () => this.loadRuns(wf.id),
        error: (err) => {
          const detail = err?.error?.detail ?? err?.message ?? 'Error starting run';
          alert(detail);
        },
      });
  }

  private loadRuns(workflowId: string): void {
    this.loadingRuns.set(true);
    this.http.get<{ data: ProcessRunResponse[] }>(`${this.apiBase}/${workflowId}/runs?limit=10`).subscribe({
      next: (res) => {
        this.runs.set(res.data);
        this.loadingRuns.set(false);
        const first = res.data[0];
        if (first) {
          this.selectRun(first);
        }
      },
      error: () => this.loadingRuns.set(false),
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
      IDLE: 'Idle',
      RUNNING: 'Running',
      WAITING_APPROVAL: 'Awaiting approval',
      COMPLETED: 'Completed',
      FAILED: 'Failed',
      CANCELLED: 'Cancelled',
    };
    return map[status] ?? status;
  }

  formatDate(dateStr: string): string {
    return new Date(dateStr).toLocaleDateString('en-US', {
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
    if (!run?.stepResults || this.approvingSaving()) return;
    const approvalResult = run.stepResults.find(r =>
      r.status === 'PENDING' || r.status === 'RUNNING'
    );
    if (!approvalResult) return;

    const approvedPosts = this.posts().filter(p =>
      this.postStatuses().get(p.topic) === 'approved'
    );

    this.approvingSaving.set(true);

    this.http.post(`${this.apiBase}/runs/${run.id}/approve/${approvalResult.id}`, {
      approved,
      modifiedOutput: approved ? { approvedPosts } : undefined,
    }).subscribe({
      next: () => {
        // Write approved content to active MCP tool (Notion)
        if (approved && approvedPosts.length > 0) {
          const mcpBase = `${environment.apiUrl}/api/v1/mcp`;
          this.http.post(`${mcpBase}/content/approve`, {
            posts: approvedPosts,
            processRunId: run.id,
          }).subscribe({
            next: () => {
              console.log(`Wrote ${approvedPosts.length} posts to MCP tool`);
              this.finishContentApproval();
            },
            error: (err: any) => {
              console.warn('MCP content write failed (local backup saved):', err?.message);
              this.finishContentApproval();
            },
          });
        } else {
          this.finishContentApproval();
        }
      },
      error: () => {
        this.approvingSaving.set(false);
      },
    });
  }

  private finishContentApproval(): void {
    this.approvingSaving.set(false);
    const wf = this.activeWorkflow();
    if (wf) this.loadRuns(wf.id);
    this.reloadCurrentRun();
    this.postStatuses.set(new Map());
  }

  onBrochureIdeaApproved(idea: BrochureIdea): void {
    const run = this.selectedRun();
    if (!run?.stepResults) return;
    const approvalResult = run.stepResults.find(r =>
      r.status === 'PENDING' || r.status === 'RUNNING'
    );
    if (!approvalResult) return;
    this.http.post(`${this.apiBase}/runs/${run.id}/approve/${approvalResult.id}`, {
      approved: true,
      modifiedOutput: { selectedIdea: idea },
    }).subscribe({
      next: () => {
        const wf = this.activeWorkflow();
        if (wf) this.loadRuns(wf.id);
      },
    });
  }

  submitGenericApproval(approved: boolean): void {
    const run = this.selectedRun();
    if (!run?.stepResults) return;
    const approvalResult = run.stepResults.find(r =>
      r.status === 'PENDING' || r.status === 'RUNNING'
    );
    if (!approvalResult) return;
    this.http.post(`${this.apiBase}/runs/${run.id}/approve/${approvalResult.id}`, {
      approved,
    }).subscribe({
      next: () => {
        const wf = this.activeWorkflow();
        if (wf) this.loadRuns(wf.id);
      },
    });
  }

  submitApproval(approved: boolean): void {
    const run = this.selectedRun();
    if (!run?.stepResults || this.approvingSaving()) return;

    // Find the APPROVAL step result that's pending
    const approvalResult = run.stepResults.find(r =>
      r.status === 'PENDING' || r.status === 'RUNNING'
    );
    if (!approvalResult) return;

    // Build modified output with only approved leads
    const approvedLeads = this.leads().filter(l =>
      this.leadStatuses().get(l.name + l.company) === 'approved'
    );

    this.approvingSaving.set(true);

    this.http.post(`${this.apiBase}/runs/${run.id}/approve/${approvalResult.id}`, {
      approved,
      modifiedOutput: approved ? { approvedLeads } : undefined,
    }).subscribe({
      next: () => {
        // Write approved leads to active MCP tool and wait for it
        if (approved && approvedLeads.length > 0) {
          const mcpBase = `${environment.apiUrl}/api/v1/mcp`;
          this.http.post(`${mcpBase}/leads/approve`, {
            leads: approvedLeads,
            processRunId: run.id,
          }).subscribe({
            next: () => {
              console.log(`Wrote ${approvedLeads.length} leads to MCP tool`);
              this.finishApproval();
            },
            error: (err: any) => {
              console.warn('MCP tool write failed (local backup saved):', err?.message);
              this.finishApproval();
            },
          });
        } else {
          this.finishApproval();
        }
      },
      error: () => {
        this.approvingSaving.set(false);
      },
    });
  }

  private finishApproval(): void {
    this.approvingSaving.set(false);
    const wf = this.activeWorkflow();
    if (wf) this.loadRuns(wf.id);
    this.reloadCurrentRun();
    this.leadStatuses.set(new Map());
    this.selectedLeads.set(new Set());
  }

  /** Check if a run is "new" — created after last time user visited this page */
  isNewRun(run: ProcessRunResponse): boolean {
    const lastSeen = localStorage.getItem('processes_last_seen');
    if (!lastSeen) return false;
    return new Date(run.createdAt).getTime() > parseInt(lastSeen, 10);
  }

  /** Mark a run as seen */
  markRunSeen(run: ProcessRunResponse): void {
    // Update last seen to now
    localStorage.setItem('processes_last_seen', String(Date.now()));
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
      this.wsService.onProcessRunStarted(() => { this.activityLog.set([]); this.reloadCurrentRun(); }),
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
      // Real-time streaming progress (text chunks, tool use, retry info)
      this.wsService.onProcessStepProgress((data: any) => {
        const current = this.activityLog();
        const entry = {
          type: data.type as string,
          data: data.data as string,
          tool: data.tool as string,
          status: data.status as string,
          phase: data.phase as string,
          timestamp: Date.now(),
        };
        // Ring buffer: keep last 10 entries (claude-code ActivityRingBuffer pattern)
        const updated = [...current, entry].slice(-10);
        this.activityLog.set(updated);
      }),
    );
  }
}
