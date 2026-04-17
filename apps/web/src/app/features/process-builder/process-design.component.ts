import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  OnDestroy,
  ElementRef,
  ViewChild,
  AfterViewChecked,
  NgZone,
  ChangeDetectorRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

interface DraftStep {
  id: string;
  order: number;
  name: string;
  stepType: string;
  mcpToolSlug?: string | null;
  manualStep?: boolean;
}

interface Draft {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  status: string;
  triggerType: string;
  automationLevel: string;
  steps: DraftStep[];
  invocationConfig?: {
    n8nWorkflowId?: string;
    n8nWorkflowName?: string;
    notionDatabaseId?: string;
    notionDatabaseUrl?: string;
  } | null;
  createdAt: string;
  updatedAt: string;
}

interface TestRun {
  id: string;
  processId: string;
  status:
    | 'pending'
    | 'running'
    | 'awaiting-approval'
    | 'approved'
    | 'passed'
    | 'failed';
  input: Record<string, unknown>;
  output?: unknown[] | null;
  stepEvents?: unknown[];
  error?: string | null;
  feedback?: string | null;
  startedAt: string;
  completedAt?: string | null;
}

interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  // Interactive wizard cards
  wizardStep?: WizardCard;
}

/** All wizard card types the Process Builder can show */
type WizardCard =
  | { type: 'tool_select'; title: string; purpose: string; tools: WizardTool[]; selected?: string; submitted?: boolean }
  | { type: 'operation_select'; title: string; toolSlug: string; operations: WizardOperation[]; selected?: string[]; submitted?: boolean }
  | { type: 'input_fields'; title: string; suggested: WizardField[]; custom?: WizardField[]; submitted?: boolean }
  | { type: 'output_columns'; title: string; suggested: WizardColumn[]; submitted?: boolean }
  | { type: 'pipeline_preview'; title: string; steps: WizardPipelineStep[]; submitted?: boolean }
  | { type: 'confirm'; title: string; summary: string; submitted?: boolean };

interface WizardTool {
  slug: string;
  displayName: string;
  description: string;
  connected: boolean;
  verified: boolean;
  operationCount: number;
}

interface WizardOperation {
  id: string;
  kind: string;
  displayName: string;
  verified: boolean;
}

interface WizardField {
  name: string;
  type: string;
  description: string;
  required: boolean;
  defaultValue?: string;
  enabled: boolean; // user can toggle
}

interface WizardColumn {
  name: string;
  type: string;
  enabled: boolean;
}

interface WizardPipelineStep {
  index: number;
  name: string;
  type: 'mcp_search' | 'mcp_read' | 'brain_call' | 'approval' | 'mcp_write';
  tool?: string;
  operation?: string;
  description: string;
}

interface ActivityEvent {
  type: 'status' | 'tool' | 'info';
  label: string;
  detail?: string;
  timestamp: number;
}

/**
 * Process Design — chat-driven process builder.
 * Dispatches to the dedicated `process-builder` OpenClaw agent,
 * streams progress via SSE, and shows drafts + deployed processes
 * in the left sidebar. Matches the app's design tokens from
 * process-results.component.ts.
 */
@Component({
  selector: 'app-process-design',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="process-design">
      <div class="page-header">
        <div>
          <h1 class="page-title">Design Process</h1>
          <p class="page-subtitle">
            Describe what you want to automate — the builder will design,
            deploy, and register it as a runnable process.
          </p>
        </div>
      </div>

      <div class="layout">
        <!-- Left sidebar: drafts list -->
        <aside class="drafts-sidebar">
          <div class="sidebar-head">
            <h3 class="sidebar-title">Your processes</h3>
            <button class="new-btn" (click)="startNew()" title="Start a new conversation">
              + New
            </button>
          </div>

          @if (loadingDrafts()) {
            <div class="sidebar-loading"><span class="spinner-sm"></span> Loading…</div>
          } @else if (drafts().length === 0) {
            <div class="sidebar-empty">
              No processes yet.<br/>
              Describe one to get started.
            </div>
          } @else {
            @for (d of drafts(); track d.id) {
              <div class="draft-item"
                   [class.active]="selectedDraftId() === d.id"
                   (click)="selectDraft(d)">
                <div class="draft-head-row">
                  <span class="draft-name">{{ d.name }}</span>
                  <span class="draft-dot"
                        [class.dot-published]="d.status === 'published'"
                        [class.dot-draft]="d.status === 'draft'"></span>
                </div>
                <div class="draft-meta">
                  <span class="meta-chip">{{ d.triggerType }}</span>
                  <span class="meta-chip">{{ d.steps.length }} steps</span>
                  @if (d.invocationConfig?.n8nWorkflowId) {
                    <span class="meta-chip chip-ok">deployed</span>
                  }
                </div>
              </div>
            }
          }
        </aside>

        <!-- Center: chat -->
        <main class="chat-card">
          <div class="chat-body" #messagesEl>
            @if (messages().length === 0 && !streaming() && !wizardLoading()) {
              <div class="placeholder">
                <div class="placeholder-title">What process do you want to build?</div>
                <div class="placeholder-sub">
                  Describe it in one sentence. The wizard guides you through
                  tool selection, inputs, and pipeline design step by step.
                </div>
                <div class="mode-toggle">
                  <button class="mode-btn" [class.active]="wizardMode()" (click)="wizardMode.set(true)">
                    Guided wizard
                  </button>
                  <button class="mode-btn" [class.active]="!wizardMode()" (click)="wizardMode.set(false)">
                    AI chat
                  </button>
                </div>
                <div class="examples">
                  <button class="example" (click)="sendExample('Find new ICP leads on Apollo every Monday and save approved ones to Notion')">
                    Monday lead discovery → Notion
                  </button>
                  <button class="example" (click)="sendExample('Research trending luxury design topics on the web weekly and draft 5 Notion content ideas')">
                    Weekly content ideation
                  </button>
                  <button class="example" (click)="sendExample('Generate 3 hero images with FAL.ai from a text prompt and save approved ones to Notion')">
                    Image generation pipeline
                  </button>
                </div>
              </div>
            }

            @for (msg of messages(); track $index) {
              <div class="msg" [class.msg-user]="msg.role === 'user'"
                               [class.msg-assistant]="msg.role === 'assistant'"
                               [class.msg-system]="msg.role === 'system'">
                <div class="msg-role">
                  @if (msg.role === 'user') { You }
                  @else if (msg.role === 'assistant') { Process Builder }
                  @else { System }
                </div>

                <!-- Wizard cards -->
                @if (msg.wizardStep; as w) {
                  <div class="wizard-card">

                    <!-- TOOL SELECT -->
                    @if (w.type === 'tool_select') {
                      <div class="wizard-title">{{ w.title }}</div>
                      <div class="wizard-subtitle">{{ w.purpose }}</div>
                      <div class="wizard-options">
                        @for (tool of w.tools; track tool.slug) {
                          <label class="wizard-radio" [class.selected]="w.selected === tool.slug" [class.disabled]="!tool.connected">
                            <input type="radio" [name]="'tool-' + $index" [value]="tool.slug"
                                   [checked]="w.selected === tool.slug"
                                   (change)="w.selected = tool.slug"
                                   [disabled]="w.submitted || !tool.connected" />
                            <div class="wizard-radio-body">
                              <div class="tool-avatar" [style.background]="tool.connected ? '#10B981' : '#374151'">{{ tool.displayName.charAt(0) }}</div>
                              <div class="wizard-label">
                                <span class="wizard-name">{{ tool.displayName }}</span>
                                <span class="wizard-meta">{{ tool.description.substring(0, 70) }}</span>
                              </div>
                              @if (tool.connected) { <span class="badge-connected">✓</span> }
                              @else { <span class="badge-disconnected">Not connected</span> }
                            </div>
                          </label>
                        }
                      </div>
                    }

                    <!-- OPERATION SELECT -->
                    @if (w.type === 'operation_select') {
                      <div class="wizard-title">{{ w.title }}</div>
                      <div class="wizard-options">
                        @for (op of w.operations; track op.id) {
                          <label class="wizard-checkbox" [class.selected]="w.selected?.includes(op.id)" [class.disabled]="!op.verified">
                            <input type="checkbox" [value]="op.id"
                                   [checked]="w.selected?.includes(op.id)"
                                   (change)="wizardToggle(w, op.id)"
                                   [disabled]="w.submitted || !op.verified" />
                            <div class="wizard-checkbox-body">
                              <span class="kind-badge" [attr.data-kind]="op.kind">{{ op.kind }}</span>
                              <span class="wizard-name">{{ op.displayName }}</span>
                              @if (op.verified) { <span class="badge-verified">✓</span> }
                              @else { <span class="badge-unavailable">Unavailable</span> }
                            </div>
                          </label>
                        }
                      </div>
                    }

                    <!-- INPUT FIELDS -->
                    @if (w.type === 'input_fields') {
                      <div class="wizard-title">{{ w.title }}</div>
                      <div class="wizard-subtitle">Select which input fields this process needs. You can also add custom fields.</div>
                      <div class="wizard-options">
                        @for (f of w.suggested; track f.name) {
                          <label class="wizard-checkbox" [class.selected]="f.enabled">
                            <input type="checkbox" [checked]="f.enabled"
                                   (change)="f.enabled = !f.enabled"
                                   [disabled]="w.submitted || f.required" />
                            <div class="wizard-checkbox-body">
                              <span class="kind-badge" data-kind="input">{{ f.type }}</span>
                              <div class="wizard-label">
                                <span class="wizard-name">{{ f.name }}</span>
                                <span class="wizard-meta">{{ f.description }}</span>
                              </div>
                              @if (f.required) { <span class="badge-required">Required</span> }
                            </div>
                          </label>
                        }
                      </div>
                      @if (!w.submitted) {
                        <button class="wizard-add-btn" (click)="wizardAddCustomField(w)">+ Add custom field</button>
                        @if (w.custom?.length) {
                          @for (cf of w.custom; track cf.name) {
                            <div class="custom-field-row">
                              <input class="cf-input" [(ngModel)]="cf.name" placeholder="Field name" [disabled]="!!w.submitted" />
                              <select class="cf-select" [(ngModel)]="cf.type" [disabled]="!!w.submitted">
                                <option value="string">Text</option>
                                <option value="number">Number</option>
                                <option value="boolean">Yes/No</option>
                              </select>
                              <input class="cf-input cf-desc" [(ngModel)]="cf.description" placeholder="Description" [disabled]="!!w.submitted" />
                            </div>
                          }
                        }
                      }
                    }

                    <!-- OUTPUT COLUMNS -->
                    @if (w.type === 'output_columns') {
                      <div class="wizard-title">{{ w.title }}</div>
                      <div class="wizard-subtitle">Select which columns to show in the results table.</div>
                      <div class="wizard-options">
                        @for (col of w.suggested; track col.name) {
                          <label class="wizard-checkbox" [class.selected]="col.enabled">
                            <input type="checkbox" [checked]="col.enabled"
                                   (change)="col.enabled = !col.enabled"
                                   [disabled]="w.submitted" />
                            <div class="wizard-checkbox-body">
                              <span class="kind-badge" data-kind="column">{{ col.type }}</span>
                              <span class="wizard-name">{{ col.name }}</span>
                            </div>
                          </label>
                        }
                      </div>
                    }

                    <!-- PIPELINE PREVIEW -->
                    @if (w.type === 'pipeline_preview') {
                      <div class="wizard-title">{{ w.title }}</div>
                      <div class="pipeline-steps">
                        @for (step of w.steps; track step.index) {
                          <div class="pipeline-step">
                            <span class="step-num">{{ step.index }}</span>
                            <span class="step-type-pill" [attr.data-type]="step.type">
                              @switch (step.type) {
                                @case ('mcp_search') { 🔍 Search }
                                @case ('mcp_read') { 📊 Enrich }
                                @case ('brain_call') { 🧠 AI }
                                @case ('approval') { ✅ Review }
                                @case ('mcp_write') { 💾 Save }
                              }
                            </span>
                            <div class="step-detail">
                              <span class="step-label">{{ step.name }}</span>
                              @if (step.tool) { <span class="step-tool">{{ step.tool }}</span> }
                            </div>
                          </div>
                        }
                      </div>
                    }

                    <!-- CONFIRM -->
                    @if (w.type === 'confirm') {
                      <div class="wizard-title">{{ w.title }}</div>
                      <div class="wizard-summary">{{ w.summary }}</div>
                    }

                    <!-- Submit button (all card types) -->
                    @if (!w.submitted) {
                      <button class="wizard-submit-btn"
                              (click)="wizardSubmit(msg, $index)"
                              [disabled]="wizardSubmitDisabled(w)">
                        @switch (w.type) {
                          @case ('tool_select') { Select tool → }
                          @case ('operation_select') { Confirm operations → }
                          @case ('input_fields') { Set inputs → }
                          @case ('output_columns') { Set columns → }
                          @case ('pipeline_preview') { Approve pipeline → }
                          @case ('confirm') { ✓ Confirm & Build }
                          @default { Continue → }
                        }
                      </button>
                    } @else {
                      <div class="wizard-confirmed">✓ Confirmed</div>
                    }
                  </div>
                } @else {
                  <div class="msg-body">{{ msg.content }}</div>
                }
              </div>
            }

            @if (wizardLoading()) {
              <div class="msg msg-assistant msg-streaming">
                <div class="msg-role">Process Builder</div>
                <div class="msg-body">
                  <span class="spinner-sm"></span> Preparing next step…
                </div>
              </div>
            }

            @if (streaming()) {
              <div class="msg msg-assistant msg-streaming">
                <div class="msg-role">Process Builder</div>
                <div class="msg-body">
                  {{ streamingText() || '' }}
                  <span class="caret"></span>
                </div>
              </div>
            }
          </div>

          @if (activity().length > 0) {
            <div class="activity-strip">
              <span class="activity-label">Activity:</span>
              @for (a of activity().slice(-3); track a.timestamp) {
                <span class="activity-item">
                  @if (a.type === 'tool') { 🔧 }
                  @else if (a.type === 'status') { ⚡ }
                  @else { · }
                  {{ a.label }}
                </span>
              }
            </div>
          }

          <!-- Phase 5: test run preview + approve/request-changes -->
          @if (latestTestRun(); as run) {
            @if (run.status === 'awaiting-approval' && run.output && run.output.length > 0) {
              <div class="preview-panel">
                <div class="preview-header">
                  <div class="preview-title">
                    ✨ Test run ready for review
                    <span class="preview-count">{{ run.output.length }} items</span>
                  </div>
                  <div class="preview-sub">
                    This is real data produced by the new process running end-to-end.
                    Approve to publish, or request changes to iterate.
                  </div>
                </div>

                @if (previewColumns().length > 0) {
                  <div class="preview-table-wrap">
                    <table class="preview-table">
                      <thead>
                        <tr>
                          @for (col of previewColumns(); track col) {
                            <th>{{ col }}</th>
                          }
                        </tr>
                      </thead>
                      <tbody>
                        @for (item of run.output.slice(0, 8); track $index) {
                          <tr>
                            @for (col of previewColumns(); track col) {
                              <td>{{ previewCellValue(item, col) }}</td>
                            }
                          </tr>
                        }
                      </tbody>
                    </table>
                    @if (run.output.length > 8) {
                      <div class="preview-more">… and {{ run.output.length - 8 }} more</div>
                    }
                  </div>
                }

                @if (!showFeedbackInput()) {
                  <div class="preview-actions">
                    <button class="approve-btn"
                            (click)="approveTestRun()"
                            [disabled]="confirming()">
                      @if (confirming()) {
                        <span class="spinner-sm"></span> Publishing…
                      } @else {
                        ✓ Approve and publish
                      }
                    </button>
                    <button class="changes-btn" (click)="openFeedback()">
                      Request changes
                    </button>
                  </div>
                } @else {
                  <div class="feedback-box">
                    <textarea
                      class="feedback-input"
                      [(ngModel)]="feedbackText"
                      placeholder="Describe what needs to change (e.g. 'also include company size in the score')…"
                      rows="3"
                    ></textarea>
                    <div class="feedback-actions">
                      <button class="approve-btn"
                              (click)="submitFeedback()"
                              [disabled]="!feedbackText.trim()">
                        Send feedback
                      </button>
                      <button class="cancel-btn" (click)="cancelFeedback()">
                        Cancel
                      </button>
                    </div>
                  </div>
                }
              </div>
            } @else if (run.status === 'running' || run.status === 'pending') {
              <div class="preview-panel preview-pending">
                <span class="spinner-sm"></span> Test run in progress… ({{ run.status }})
              </div>
            } @else if (run.status === 'failed') {
              <div class="preview-panel preview-failed">
                ❌ Test run failed: {{ run.error }}
                @if (run.feedback) {
                  <div class="preview-sub">Feedback sent: {{ run.feedback }}</div>
                }
              </div>
            }
          }

          <!-- Orchestrator Proposal Card -->
          @if (orchestratorProposal(); as proposal) {
            <div class="proposal-card">
              <div class="proposal-header">
                <span class="proposal-badge">📋 Process Proposal</span>
                <span class="proposal-name">{{ proposal.name }}</span>
              </div>
              <p class="proposal-desc">{{ proposal.description }}</p>
              <div class="proposal-steps">
                @for (step of proposal.steps; track step.index) {
                  <div class="proposal-step">
                    <span class="step-type-badge" [attr.data-type]="step.type">{{ step.type }}</span>
                    <span class="step-name">{{ step.name }}</span>
                    @if (step.tool) {
                      <span class="step-tool">{{ step.tool }}</span>
                    }
                  </div>
                }
              </div>
              <div class="proposal-meta">
                <span>Input: {{ proposal.inputFields?.join(', ') || 'none' }}</span>
                <span>Tools: {{ proposal.connectedTools?.join(', ') || 'none' }}</span>
                <span>Saves to: {{ proposal.saveTo }}</span>
              </div>
              <div class="proposal-actions">
                <button class="confirm-proposal-btn" [disabled]="orchestratorConfirming()" (click)="confirmProposal()">
                  @if (orchestratorConfirming()) {
                    <span class="spinner-sm"></span> Deploying...
                  } @else {
                    ✓ Confirm & Deploy
                  }
                </button>
                <button class="changes-btn" (click)="orchestratorProposal.set(null)">
                  Dismiss
                </button>
              </div>
            </div>
          }

          <div class="chat-input-row">
            <textarea
              class="chat-input"
              [(ngModel)]="inputText"
              (keydown)="onKey($event)"
              [placeholder]="streaming() || wizardLoading() ? 'Please wait…' : wizardMode() && wizardSessionId ? 'Use the card above to continue…' : 'Describe the process you want to build…'"
              [disabled]="streaming() || wizardLoading() || !!(wizardMode() && wizardSessionId)"
              rows="2"
            ></textarea>
            <button class="send-btn"
                    (click)="sendMessage()"
                    [disabled]="streaming() || wizardLoading() || !inputText.trim()">
              @if (streaming() || wizardLoading()) {
                <span class="spinner-sm"></span> Working
              } @else {
                Send
              }
            </button>
          </div>
        </main>

        <!-- Right: draft detail (inline, only when selected) -->
        @if (selectedDraft(); as d) {
          <aside class="detail-card">
            <div class="detail-head">
              <h3 class="detail-title">{{ d.name }}</h3>
              <button class="close-btn" (click)="selectedDraftId.set(null)">×</button>
            </div>

            <div class="detail-row">
              <span class="row-label">Slug</span>
              <span class="row-value mono">{{ d.slug }}</span>
            </div>
            @if (d.description) {
              <div class="detail-row">
                <span class="row-label">Description</span>
                <span class="row-value">{{ d.description }}</span>
              </div>
            }
            <div class="detail-row">
              <span class="row-label">Status</span>
              <span class="row-value">
                <span class="pill pill-{{ d.status }}">{{ d.status }}</span>
                <span class="pill">{{ d.triggerType }}</span>
              </span>
            </div>

            <div class="detail-section">
              <div class="section-title">Steps</div>
              <ol class="step-list">
                @for (s of d.steps; track s.id) {
                  <li>
                    <span class="step-name">{{ s.name }}</span>
                    @if (s.mcpToolSlug) { <span class="step-tool">· {{ s.mcpToolSlug }}</span> }
                    @if (s.manualStep) { <span class="step-tag">approval</span> }
                  </li>
                }
              </ol>
            </div>

            @if (d.invocationConfig?.n8nWorkflowId) {
              <div class="detail-section">
                <div class="section-title">Deployed</div>
                <div class="artifact-row">
                  <span class="row-label">n8n workflow</span>
                  <span class="row-value mono">{{ d.invocationConfig?.n8nWorkflowId }}</span>
                </div>
                @if (d.invocationConfig?.notionDatabaseUrl) {
                  <div class="artifact-row">
                    <span class="row-label">Notion</span>
                    <a class="row-link" [href]="d.invocationConfig?.notionDatabaseUrl" target="_blank" rel="noopener">
                      Open database →
                    </a>
                  </div>
                }
                <div class="hint">
                  Visible in Settings → Processes. Toggle active from there to enable the schedule.
                </div>
              </div>
            } @else {
              <button class="primary-btn full" (click)="deployDraft(d.id)" [disabled]="deploying()">
                @if (deploying()) {
                  <span class="spinner-sm"></span> Deploying…
                } @else {
                  Deploy (create Notion DB + n8n workflow)
                }
              </button>
            }

            <button class="danger-btn full" (click)="deleteDraft(d.id)">
              Delete
            </button>
          </aside>
        }
      </div>
    </div>
  `,
  styles: [
    `
      :host {
        display: block;
        height: 100%;
        overflow: hidden;
        background: #0D1117;
      }
      .process-design {
        padding: 24px;
        height: 100%;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        gap: 20px;
      }

      .page-header {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
      }
      .page-title {
        color: #E6EDF3;
        font-size: 24px;
        font-weight: 700;
        margin: 0 0 4px;
      }
      .page-subtitle {
        color: #8B949E;
        font-size: 13px;
        margin: 0;
        max-width: 640px;
      }

      .layout {
        display: flex;
        gap: 20px;
        flex: 1;
        min-height: 0;
      }

      /* ── Sidebar ── */
      .drafts-sidebar {
        width: 260px;
        flex-shrink: 0;
        background: #161B22;
        border: 1px solid #21262D;
        border-radius: 8px;
        padding: 16px;
        overflow-y: auto;
      }
      .sidebar-head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 12px;
      }
      .sidebar-title {
        color: #E6EDF3;
        font-size: 14px;
        font-weight: 600;
        margin: 0;
      }
      .new-btn {
        background: #58A6FF;
        color: #E6EDF3;
        border: none;
        border-radius: 6px;
        padding: 6px 12px;
        font-size: 12px;
        font-weight: 600;
        cursor: pointer;
        transition: background 0.15s;
      }
      .new-btn:hover { background: #2563eb; }

      .sidebar-loading,
      .sidebar-empty {
        color: #6B7280;
        font-size: 12px;
        text-align: center;
        padding: 24px 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
      }

      .draft-item {
        padding: 10px;
        border-radius: 6px;
        cursor: pointer;
        margin-bottom: 8px;
        border: 1px solid transparent;
        transition: all 0.15s;
      }
      .draft-item:hover { border-color: #21262D; background: #1C2128; }
      .draft-item.active { border-color: #58A6FF; background: #1C2128; }
      .draft-head-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 6px;
        margin-bottom: 4px;
      }
      .draft-name {
        color: #E6EDF3;
        font-size: 13px;
        font-weight: 500;
      }
      .draft-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
        background: #6E7681;
      }
      .dot-published { background: #3FB950; }
      .dot-draft { background: #D29922; }

      .draft-meta {
        display: flex;
        gap: 4px;
        flex-wrap: wrap;
      }
      .meta-chip {
        font-size: 10px;
        color: #8B949E;
        background: #0D1117;
        padding: 2px 6px;
        border-radius: 3px;
        border: 1px solid #21262D;
      }
      .chip-ok {
        color: #3FB950;
        border-color: #0D2F1F;
      }

      /* ── Chat card ── */
      .chat-card {
        flex: 1;
        min-width: 0;
        background: #161B22;
        border: 1px solid #21262D;
        border-radius: 8px;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .chat-body {
        flex: 1;
        overflow-y: auto;
        padding: 20px 24px;
        display: flex;
        flex-direction: column;
        gap: 16px;
      }
      .placeholder {
        margin: auto;
        max-width: 520px;
        text-align: center;
        padding: 32px 16px;
      }
      .placeholder-title {
        color: #E6EDF3;
        font-size: 17px;
        font-weight: 600;
        margin-bottom: 8px;
      }
      .placeholder-sub {
        color: #8B949E;
        font-size: 13px;
        line-height: 1.5;
        margin-bottom: 20px;
      }
      .mode-toggle {
        display: flex;
        gap: 4px;
        justify-content: center;
        margin-bottom: 16px;
        background: #0D1117;
        border: 1px solid #21262D;
        border-radius: 8px;
        padding: 3px;
      }
      .mode-btn {
        padding: 6px 16px;
        background: transparent;
        border: none;
        color: #6B7280;
        font-size: 12px;
        font-weight: 500;
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.15s;
      }
      .mode-btn.active {
        background: #1C2128;
        color: #E6EDF3;
        font-weight: 600;
      }
      .mode-btn:hover:not(.active) {
        color: #C9D1D9;
      }
      .examples {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .example {
        background: #1C2128;
        border: 1px solid #21262D;
        color: #C9D1D9;
        padding: 10px 14px;
        border-radius: 6px;
        font-size: 13px;
        cursor: pointer;
        text-align: left;
        transition: all 0.15s;
      }
      .example:hover {
        border-color: #58A6FF;
        color: #E6EDF3;
      }

      .msg {
        max-width: 760px;
      }
      .msg-user { margin-left: auto; }
      .msg-role {
        font-size: 10px;
        font-weight: 600;
        color: #6B7280;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        margin-bottom: 4px;
      }
      .msg-user .msg-role { text-align: right; color: #58A6FF; }
      .msg-body {
        background: #1C2128;
        border: 1px solid #21262D;
        border-radius: 8px;
        padding: 12px 16px;
        color: #C9D1D9;
        font-size: 13px;
        line-height: 1.55;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .msg-user .msg-body {
        background: #1f2937;
        border-color: #58A6FF40;
        color: #E6EDF3;
      }
      .msg-system .msg-body {
        background: transparent;
        border-style: dashed;
        color: #8B949E;
        font-style: italic;
      }
      .msg-streaming .msg-body { opacity: 0.92; }
      .caret {
        display: inline-block;
        width: 7px;
        height: 14px;
        background: #58A6FF;
        margin-left: 2px;
        vertical-align: text-bottom;
        animation: blink 1s step-end infinite;
      }
      @keyframes blink {
        50% { opacity: 0; }
      }

      /* ── Activity strip ── */
      .activity-strip {
        border-top: 1px solid #21262D;
        background: #0D1117;
        padding: 8px 24px;
        font-size: 11px;
        color: #8B949E;
        display: flex;
        align-items: center;
        gap: 16px;
        overflow-x: auto;
      }
      .activity-label {
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #6B7280;
      }
      .activity-item {
        color: #C9D1D9;
        white-space: nowrap;
      }

      /* ── Preview panel (Phase 5) ── */
      .preview-panel {
        border-top: 1px solid #21262D;
        background: #0D1117;
        padding: 16px 24px;
      }
      .preview-header { margin-bottom: 12px; }
      .preview-title {
        color: #E6EDF3;
        font-size: 14px;
        font-weight: 700;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .preview-count {
        font-size: 11px;
        color: #3FB950;
        background: #0D2F1F;
        padding: 2px 8px;
        border-radius: 10px;
      }
      .preview-sub {
        font-size: 11px;
        color: #8B949E;
        margin-top: 4px;
      }
      .preview-table-wrap {
        max-height: 260px;
        overflow-y: auto;
        border: 1px solid #21262D;
        border-radius: 6px;
        margin-bottom: 12px;
        background: #161B22;
      }
      .preview-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
      }
      .preview-table th {
        background: #1C2128;
        color: #6B7280;
        text-transform: uppercase;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.06em;
        padding: 8px 12px;
        text-align: left;
        border-bottom: 1px solid #21262D;
        position: sticky;
        top: 0;
      }
      .preview-table td {
        color: #C9D1D9;
        padding: 8px 12px;
        border-bottom: 1px solid #21262D;
        vertical-align: top;
      }
      .preview-more {
        text-align: center;
        color: #6B7280;
        font-size: 11px;
        padding: 6px;
      }
      .preview-actions {
        display: flex;
        gap: 8px;
      }
      /* ── Wizard cards ── */
      .wizard-card {
        background: #141414; border: 1px solid #2A2A2A; border-radius: 12px;
        padding: 16px; margin-top: 8px;
      }
      .wizard-title { font-size: 15px; font-weight: 700; color: #FAFAFA; margin-bottom: 4px; }
      .wizard-subtitle { font-size: 12px; color: #6B7280; margin-bottom: 12px; }
      .wizard-summary { font-size: 13px; color: #9CA3AF; line-height: 1.5; white-space: pre-wrap; }
      .wizard-options { display: flex; flex-direction: column; gap: 6px; margin-bottom: 4px; }

      .wizard-radio, .wizard-checkbox {
        display: block; cursor: pointer;
        background: #1A1A1A; border: 1px solid #2A2A2A; border-radius: 8px;
        padding: 10px 12px; transition: all 0.15s;
      }
      .wizard-radio:hover, .wizard-checkbox:hover { border-color: #3B82F6; }
      .wizard-radio.selected, .wizard-checkbox.selected { border-color: #3B82F6; background: rgba(59,130,246,0.06); }
      .wizard-radio.disabled, .wizard-checkbox.disabled { opacity: 0.4; cursor: not-allowed; }
      .wizard-radio input, .wizard-checkbox input { display: none; }
      .wizard-radio-body, .wizard-checkbox-body { display: flex; align-items: center; gap: 10px; }

      .tool-avatar {
        width: 32px; height: 32px; border-radius: 8px; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
        font-weight: 700; font-size: 14px; color: white;
      }
      .wizard-label { display: flex; flex-direction: column; flex: 1; min-width: 0; }
      .wizard-name { font-size: 13px; font-weight: 600; color: #FAFAFA; }
      .wizard-meta { font-size: 11px; color: #6B7280; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .badge-connected { font-size: 14px; color: #10B981; }
      .badge-disconnected { font-size: 10px; color: #6B7280; font-weight: 500; }
      .badge-verified { font-size: 14px; color: #10B981; }
      .badge-unavailable { font-size: 10px; color: #EF4444; font-weight: 500; }
      .badge-required { font-size: 10px; color: #F59E0B; font-weight: 600; padding: 1px 6px; background: rgba(245,158,11,0.12); border-radius: 3px; }

      .kind-badge {
        font-size: 10px; font-weight: 700; text-transform: uppercase;
        padding: 2px 8px; border-radius: 4px; flex-shrink: 0;
        background: #242424; color: #9CA3AF;
      }
      .kind-badge[data-kind="search"] { background: rgba(59,130,246,0.15); color: #3B82F6; }
      .kind-badge[data-kind="write"] { background: rgba(16,185,129,0.15); color: #10B981; }
      .kind-badge[data-kind="read"] { background: rgba(168,85,247,0.15); color: #A855F7; }
      .kind-badge[data-kind="input"] { background: rgba(245,158,11,0.15); color: #F59E0B; }
      .kind-badge[data-kind="column"] { background: rgba(99,102,241,0.15); color: #6366F1; }

      /* Custom fields */
      .wizard-add-btn {
        background: none; border: 1px dashed #2A2A2A; border-radius: 6px;
        color: #6B7280; padding: 6px 12px; font-size: 12px; cursor: pointer;
        margin: 8px 0; width: 100%;
      }
      .wizard-add-btn:hover { border-color: #3B82F6; color: #3B82F6; }
      .custom-field-row { display: flex; gap: 6px; margin-bottom: 4px; }
      .cf-input {
        flex: 1; background: #0D0D0D; border: 1px solid #2A2A2A; border-radius: 6px;
        padding: 6px 10px; color: #FAFAFA; font-size: 12px; outline: none;
      }
      .cf-input:focus { border-color: #3B82F6; }
      .cf-desc { flex: 2; }
      .cf-select {
        background: #0D0D0D; border: 1px solid #2A2A2A; border-radius: 6px;
        padding: 6px 8px; color: #FAFAFA; font-size: 12px;
      }

      /* Pipeline preview */
      .pipeline-steps { display: flex; flex-direction: column; gap: 4px; }
      .pipeline-step {
        display: flex; align-items: center; gap: 8px;
        background: #1A1A1A; border-radius: 6px; padding: 8px 10px;
      }
      .step-num {
        width: 22px; height: 22px; border-radius: 50%; background: #242424;
        display: flex; align-items: center; justify-content: center;
        font-size: 11px; font-weight: 700; color: #6B7280; flex-shrink: 0;
      }
      .step-type-pill {
        font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 4px;
        flex-shrink: 0;
      }
      .step-type-pill[data-type="mcp_search"] { background: rgba(59,130,246,0.12); color: #3B82F6; }
      .step-type-pill[data-type="mcp_read"] { background: rgba(168,85,247,0.12); color: #A855F7; }
      .step-type-pill[data-type="brain_call"] { background: rgba(245,158,11,0.12); color: #F59E0B; }
      .step-type-pill[data-type="approval"] { background: rgba(255,255,255,0.08); color: #FAFAFA; }
      .step-type-pill[data-type="mcp_write"] { background: rgba(16,185,129,0.12); color: #10B981; }
      .step-detail { flex: 1; display: flex; flex-direction: column; }
      .step-label { font-size: 13px; color: #D1D5DB; }
      .step-tool { font-size: 11px; color: #6B7280; }

      /* Submit */
      .wizard-submit-btn {
        margin-top: 12px; background: #3B82F6; color: white; border: none;
        border-radius: 8px; padding: 10px 24px; font-size: 14px; font-weight: 600;
        cursor: pointer; width: 100%;
      }
      .wizard-submit-btn:disabled { opacity: 0.35; cursor: not-allowed; }
      .wizard-submit-btn:hover:not(:disabled) { background: #2563EB; }
      .wizard-confirmed { margin-top: 8px; font-size: 12px; color: #10B981; font-weight: 500; text-align: center; }

      /* Proposal card */
      .proposal-card {
        background: #1A1A1A; border: 1px solid #3B82F6; border-radius: 12px;
        padding: 20px; margin: 12px 0;
      }
      .proposal-header { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
      .proposal-badge { font-size: 12px; font-weight: 600; color: #3B82F6; }
      .proposal-name { font-size: 16px; font-weight: 700; color: #FAFAFA; }
      .proposal-desc { font-size: 13px; color: #9CA3AF; margin-bottom: 14px; }
      .proposal-steps { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
      .proposal-step { display: flex; align-items: center; gap: 8px; padding: 6px 10px; background: #0D0D0D; border-radius: 6px; }
      .step-type-badge {
        font-size: 10px; font-weight: 700; text-transform: uppercase;
        padding: 2px 8px; border-radius: 4px;
        background: #242424; color: #9CA3AF;
      }
      .step-type-badge[data-type="MCP Search"] { background: rgba(59,130,246,0.15); color: #3B82F6; }
      .step-type-badge[data-type="MCP Read"] { background: rgba(168,85,247,0.15); color: #A855F7; }
      .step-type-badge[data-type="MCP Write"] { background: rgba(16,185,129,0.15); color: #10B981; }
      .step-type-badge[data-type="AI Reasoning"] { background: rgba(245,158,11,0.15); color: #F59E0B; }
      .step-type-badge[data-type="User Approval"] { background: rgba(255,255,255,0.1); color: #FAFAFA; }
      .step-name { font-size: 13px; color: #D1D5DB; }
      .step-tool { font-size: 11px; color: #6B7280; margin-left: auto; }
      .proposal-meta { display: flex; flex-wrap: wrap; gap: 16px; font-size: 12px; color: #6B7280; margin-bottom: 14px; }
      .proposal-actions { display: flex; gap: 8px; }
      .confirm-proposal-btn {
        background: #3B82F6; color: white; border: none; border-radius: 8px;
        padding: 10px 20px; font-size: 14px; font-weight: 600; cursor: pointer;
      }
      .confirm-proposal-btn:disabled { opacity: 0.5; }
      .confirm-proposal-btn:hover:not(:disabled) { background: #2563EB; }

      .approve-btn {
        flex: 1;
        background: #238636;
        color: #E6EDF3;
        border: none;
        border-radius: 8px;
        padding: 10px 16px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
      }
      .approve-btn:hover:not(:disabled) { background: #2EA043; }
      .approve-btn:disabled { opacity: 0.6; cursor: not-allowed; }
      .changes-btn {
        background: transparent;
        border: 1px solid #D29922;
        color: #D29922;
        border-radius: 8px;
        padding: 10px 16px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
      }
      .changes-btn:hover { background: rgba(210, 153, 34, 0.12); }
      .cancel-btn {
        background: transparent;
        border: 1px solid #21262D;
        color: #8B949E;
        border-radius: 8px;
        padding: 10px 16px;
        font-size: 13px;
        cursor: pointer;
      }
      .feedback-box {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .feedback-input {
        background: #161B22;
        border: 1px solid #21262D;
        border-radius: 6px;
        color: #E6EDF3;
        padding: 10px 12px;
        font-size: 13px;
        font-family: inherit;
        resize: vertical;
      }
      .feedback-input:focus {
        outline: none;
        border-color: #58A6FF;
      }
      .feedback-actions {
        display: flex;
        gap: 8px;
      }
      .preview-pending,
      .preview-failed {
        display: flex;
        align-items: center;
        gap: 10px;
        color: #8B949E;
        font-size: 12px;
        padding: 12px 24px;
      }
      .preview-failed { color: #F85149; }

      /* ── Input ── */
      .chat-input-row {
        display: flex;
        gap: 8px;
        padding: 12px 16px;
        border-top: 1px solid #21262D;
        background: #0D1117;
      }
      .chat-input {
        flex: 1;
        background: #161B22;
        border: 1px solid #21262D;
        border-radius: 6px;
        color: #E6EDF3;
        padding: 10px 12px;
        font-size: 13px;
        font-family: inherit;
        resize: none;
      }
      .chat-input:focus {
        outline: none;
        border-color: #58A6FF;
      }
      .chat-input::placeholder { color: #6B7280; }
      .send-btn {
        padding: 10px 24px;
        background: #58A6FF;
        color: #E6EDF3;
        border: none;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
        transition: background 0.15s;
      }
      .send-btn:hover:not(:disabled) { background: #2563eb; }
      .send-btn:disabled { opacity: 0.6; cursor: not-allowed; }

      .spinner-sm {
        display: inline-block;
        width: 12px;
        height: 12px;
        border: 2px solid #E6EDF340;
        border-top-color: #E6EDF3;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }

      /* ── Detail panel ── */
      .detail-card {
        width: 320px;
        flex-shrink: 0;
        background: #161B22;
        border: 1px solid #21262D;
        border-radius: 8px;
        padding: 16px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .detail-head {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        margin-bottom: 4px;
      }
      .detail-title {
        color: #E6EDF3;
        font-size: 15px;
        font-weight: 600;
        margin: 0;
        flex: 1;
      }
      .close-btn {
        background: transparent;
        border: none;
        color: #6B7280;
        font-size: 20px;
        cursor: pointer;
        line-height: 1;
        padding: 0 4px;
      }
      .close-btn:hover { color: #E6EDF3; }

      .detail-row {
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .row-label {
        font-size: 10px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #6B7280;
      }
      .row-value {
        font-size: 13px;
        color: #C9D1D9;
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
      }
      .row-link {
        color: #58A6FF;
        font-size: 13px;
        text-decoration: none;
      }
      .row-link:hover { text-decoration: underline; }
      .mono {
        font-family: monospace;
        font-size: 11px;
      }
      .pill {
        font-size: 10px;
        padding: 2px 8px;
        background: #0D1117;
        border: 1px solid #21262D;
        color: #8B949E;
        border-radius: 10px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        font-weight: 600;
      }
      .pill-published {
        color: #3FB950;
        border-color: #0D2F1F;
      }
      .pill-draft {
        color: #D29922;
        border-color: #2E2110;
      }

      .detail-section {
        border-top: 1px solid #21262D;
        padding-top: 12px;
      }
      .section-title {
        font-size: 11px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #6B7280;
        margin-bottom: 8px;
      }
      .step-list {
        margin: 0;
        padding-left: 18px;
        font-size: 12px;
        color: #C9D1D9;
      }
      .step-list li { margin-bottom: 6px; line-height: 1.4; }
      .step-name { color: #E6EDF3; }
      .step-tool {
        color: #79B8FF;
        font-family: monospace;
        font-size: 11px;
      }
      .step-tag {
        margin-left: 6px;
        font-size: 10px;
        padding: 1px 6px;
        background: #2E2110;
        color: #D29922;
        border-radius: 3px;
      }
      .artifact-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 6px;
        font-size: 12px;
      }
      .hint {
        margin-top: 8px;
        font-size: 11px;
        color: #6B7280;
        line-height: 1.4;
        font-style: italic;
      }

      .primary-btn {
        padding: 10px 16px;
        background: #238636;
        color: #E6EDF3;
        border: none;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 600;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
      }
      .primary-btn:hover:not(:disabled) { background: #2EA043; }
      .primary-btn:disabled { opacity: 0.6; cursor: not-allowed; }
      .primary-btn.full { width: 100%; }

      .danger-btn {
        padding: 8px 16px;
        background: transparent;
        border: 1px solid #DA3633;
        color: #DA3633;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
      }
      .danger-btn:hover { background: rgba(218, 54, 51, 0.1); }
      .danger-btn.full { width: 100%; }
    `,
  ],
})
export class ProcessDesignComponent
  implements OnInit, OnDestroy, AfterViewChecked
{
  private readonly http = inject(HttpClient);
  private readonly zone = inject(NgZone);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly apiBase = `${environment.apiUrl}/api/v1/builder`;
  private readonly tenantId = 'tnt_rljn1gj4cgxoph0hxfohv6l4';

  @ViewChild('messagesEl') messagesEl?: ElementRef<HTMLDivElement>;

  drafts = signal<Draft[]>([]);
  loadingDrafts = signal(false);
  selectedDraftId = signal<string | null>(null);
  selectedDraft = computed(
    () => this.drafts().find((d) => d.id === this.selectedDraftId()) ?? null,
  );

  messages = signal<ChatMessage[]>([]);
  activity = signal<ActivityEvent[]>([]);
  streamingText = signal('');
  streaming = signal(false);
  deploying = signal(false);

  // Test run preview (Phase 5)
  latestTestRun = signal<TestRun | null>(null);
  confirming = signal(false);
  showFeedbackInput = signal(false);

  // Orchestrator state
  orchestratorProcessId = signal<string | null>(null);
  orchestratorProposal = signal<any | null>(null);
  orchestratorConfirming = signal(false);
  feedbackText = '';
  private testRunPollTimer: ReturnType<typeof setInterval> | null = null;

  // Preview columns derived from first item
  previewColumns = computed<string[]>(() => {
    const run = this.latestTestRun();
    if (!run?.output || !Array.isArray(run.output) || run.output.length === 0) {
      return [];
    }
    const first = run.output[0];
    if (!first || typeof first !== 'object') return [];
    return Object.keys(first as Record<string, unknown>).slice(0, 6);
  });

  inputText = '';
  sessionId = `builder-${this.tenantId}-${Date.now()}`;
  private eventSource: EventSource | null = null;
  private shouldAutoScroll = true;
  /** Tracks whether backend emitted wizard_card SSE events this turn (prevents fallback duplicates) */
  private receivedWizardCards = false;

  // ── Deterministic wizard mode ──────────────────────────────────
  // When true, uses REST-based wizard (backend state machine) instead
  // of SSE chat with AI agent. Default: true (deterministic is reliable).
  wizardMode = signal(true);
  wizardSessionId: string | null = null;
  wizardLoading = signal(false);
  wizardBuildResult = signal<{ processId?: string; error?: string } | null>(null);

  ngOnInit(): void {
    this.loadDrafts();
  }

  ngOnDestroy(): void {
    this.closeStream();
    this.stopTestRunPolling();
  }

  ngAfterViewChecked(): void {
    if (this.shouldAutoScroll && this.messagesEl) {
      const el = this.messagesEl.nativeElement;
      el.scrollTop = el.scrollHeight;
    }
  }

  async loadDrafts(): Promise<void> {
    this.loadingDrafts.set(true);
    try {
      const res = await firstValueFrom(
        this.http.get<{ data: Draft[] }>(
          `${this.apiBase}/drafts?tenantId=${this.tenantId}`,
        ),
      );
      this.drafts.set(res.data ?? []);
    } catch (e) {
      console.error('Failed to load drafts', e);
    } finally {
      this.loadingDrafts.set(false);
    }
  }

  selectDraft(d: Draft): void {
    this.selectedDraftId.set(d.id);
    this.startTestRunPolling(d.id);
  }

  startNew(): void {
    this.selectedDraftId.set(null);
    this.messages.set([]);
    this.activity.set([]);
    this.streamingText.set('');
    this.sessionId = `builder-${this.tenantId}-${Date.now()}`;
    this.inputText = '';
    this.stopTestRunPolling();
    this.latestTestRun.set(null);
    this.wizardSessionId = null;
    this.wizardBuildResult.set(null);
  }

  // ── Deterministic wizard (REST-based, no AI agent) ─────────────

  /**
   * Start the deterministic wizard flow. Calls POST /wizard/start,
   * receives the first card (tool_select), and injects it into messages.
   */
  private async startDeterministicWizard(description: string): Promise<void> {
    this.messages.update((m) => [
      ...m,
      { role: 'user', content: description, timestamp: Date.now() },
    ]);
    this.wizardLoading.set(true);
    this.shouldAutoScroll = true;

    try {
      const res = await firstValueFrom(
        this.http.post<{ data: { session: { id: string }; card: unknown } }>(
          `${this.apiBase}/wizard/start`,
          { tenantId: this.tenantId, description },
        ),
      );
      this.wizardSessionId = res.data.session.id;
      if (res.data.card) {
        this.messages.update((m) => [
          ...m,
          {
            role: 'assistant' as const,
            content: '',
            timestamp: Date.now(),
            wizardStep: res.data.card as WizardCard,
          },
        ]);
      }
    } catch (e) {
      this.messages.update((m) => [
        ...m,
        { role: 'system', content: `Wizard error: ${(e as Error).message}`, timestamp: Date.now() },
      ]);
    } finally {
      this.wizardLoading.set(false);
    }
  }

  /**
   * Advance the deterministic wizard by one step. Sends the user's
   * card selection to POST /wizard/:id/step, receives the next card.
   */
  private async advanceDeterministicWizard(w: WizardCard): Promise<void> {
    if (!this.wizardSessionId) return;
    this.wizardLoading.set(true);
    this.shouldAutoScroll = true;

    // Build the response payload from the card's selections
    const responseData = this.buildWizardResponse(w);

    try {
      const res = await firstValueFrom(
        this.http.post<{
          data: {
            session: { id: string; stage: string; processId?: string; error?: string };
            card: unknown | null;
            complete: boolean;
            error?: string;
          };
        }>(
          `${this.apiBase}/wizard/${this.wizardSessionId}/step`,
          { tenantId: this.tenantId, response: { type: w.type, data: responseData } },
        ),
      );

      if (res.data.card) {
        this.messages.update((m) => [
          ...m,
          {
            role: 'assistant' as const,
            content: '',
            timestamp: Date.now(),
            wizardStep: res.data.card as WizardCard,
          },
        ]);
      }

      if (res.data.complete) {
        const sess = res.data.session;
        this.wizardBuildResult.set({ processId: sess.processId, error: sess.error });
        this.messages.update((m) => [
          ...m,
          {
            role: 'system',
            content: sess.error
              ? `Build failed: ${sess.error}`
              : `Process tested and deployed. ${(sess as any).testItemCount ? `Test run produced ${(sess as any).testItemCount} items.` : ''} ID: ${sess.processId}. It's live on the Processes page.`,
            timestamp: Date.now(),
          },
        ]);
        this.wizardSessionId = null;
        await this.loadDrafts();
      }

      if (res.data.error && !res.data.complete) {
        this.messages.update((m) => [
          ...m,
          { role: 'system', content: `Error: ${res.data.error}`, timestamp: Date.now() },
        ]);
      }
    } catch (e) {
      this.messages.update((m) => [
        ...m,
        { role: 'system', content: `Wizard error: ${(e as Error).message}`, timestamp: Date.now() },
      ]);
    } finally {
      this.wizardLoading.set(false);
    }
  }

  /** Build the response payload to send to the wizard backend */
  private buildWizardResponse(w: WizardCard): Record<string, unknown> {
    switch (w.type) {
      case 'tool_select':
        return { selected: w.selected };
      case 'operation_select':
        return {
          selected: (w.selected ?? []).map((id: string) => {
            // Find the operation's toolSlug from the operations array
            const op = w.operations.find((o) => o.id === id);
            return { toolSlug: (op as { toolSlug?: string })?.toolSlug ?? w.toolSlug, operationId: id };
          }),
        };
      case 'input_fields': {
        const enabled = w.suggested.filter((f) => f.enabled);
        const custom = (w.custom ?? []).filter((f) => f.name.trim()).map((f) => ({ ...f, enabled: true }));
        return { fields: [...enabled, ...custom] };
      }
      case 'output_columns':
        return { columns: w.suggested.filter((c) => c.enabled) };
      case 'pipeline_preview':
        return { confirmed: true };
      case 'confirm':
        return { confirmed: true };
      default:
        return {};
    }
  }

  // ── Phase 5: test run preview + approve/request-changes ────────

  private startTestRunPolling(draftId: string): void {
    this.stopTestRunPolling();
    this.fetchLatestTestRun(draftId);
    this.testRunPollTimer = setInterval(
      () => this.fetchLatestTestRun(draftId),
      3000,
    );
  }

  private stopTestRunPolling(): void {
    if (this.testRunPollTimer) {
      clearInterval(this.testRunPollTimer);
      this.testRunPollTimer = null;
    }
  }

  private async fetchLatestTestRun(draftId: string): Promise<void> {
    try {
      const res = await firstValueFrom(
        this.http.get<{ data: TestRun | null }>(
          `${this.apiBase}/drafts/${draftId}/latest-test-run?tenantId=${this.tenantId}`,
        ),
      );
      this.latestTestRun.set(res.data ?? null);
      this.cdr.markForCheck();
    } catch (e) {
      // silent — polling is best-effort
    }
  }

  async approveTestRun(): Promise<void> {
    const draft = this.selectedDraft();
    const run = this.latestTestRun();
    if (!draft || !run || this.confirming()) return;
    this.confirming.set(true);
    try {
      await firstValueFrom(
        this.http.post(`${this.apiBase}/drafts/${draft.id}/confirm`, {
          tenantId: this.tenantId,
          testRunId: run.id,
        }),
      );
      this.messages.update((m) => [
        ...m,
        {
          role: 'system',
          content: `✅ Approved. Process "${draft.name}" is now published and visible in the Processes page.`,
          timestamp: Date.now(),
        },
      ]);
      await this.loadDrafts();
      await this.fetchLatestTestRun(draft.id);
      // Also notify the agent that the user approved (so it emits its
      // final confirmation message)
      this.inputText = `APPROVED: the test run looks good, please publish "${draft.name}"`;
      await this.sendMessage();
    } catch (e) {
      alert(`Approve failed: ${(e as Error).message}`);
    } finally {
      this.confirming.set(false);
    }
  }

  // ─── Wizard card helpers ──────────────────────────────────────

  wizardToggle(w: any, id: string): void {
    if (!w.selected) w.selected = [];
    const idx = w.selected.indexOf(id);
    if (idx >= 0) w.selected.splice(idx, 1);
    else w.selected.push(id);
  }

  wizardAddCustomField(w: any): void {
    if (!w.custom) w.custom = [];
    w.custom.push({ name: '', type: 'string', description: '', required: false, enabled: true });
  }

  wizardSubmitDisabled(w: WizardCard): boolean {
    if (w.type === 'tool_select') return !w.selected;
    if (w.type === 'operation_select') return !(w.selected?.length);
    return false;
  }

  async wizardSubmit(msg: ChatMessage, msgIndex: number): Promise<void> {
    const w = msg.wizardStep;
    if (!w || w.submitted) return;
    w.submitted = true;

    // ── Deterministic wizard mode → REST API ──
    if (this.wizardMode() && this.wizardSessionId) {
      await this.advanceDeterministicWizard(w);
      return;
    }

    // ── AI agent mode → SSE chat ──
    let response = '';
    switch (w.type) {
      case 'tool_select':
        response = `WIZARD_TOOL: ${w.selected}`;
        break;
      case 'operation_select':
        response = `WIZARD_OPERATIONS: ${w.selected?.join(', ')}`;
        break;
      case 'input_fields': {
        const enabled = w.suggested.filter(f => f.enabled).map(f => f.name);
        const custom = (w.custom ?? []).filter(f => f.name.trim()).map(f => `${f.name}(${f.type})`);
        response = `WIZARD_INPUTS: ${[...enabled, ...custom].join(', ')}`;
        break;
      }
      case 'output_columns': {
        const cols = w.suggested.filter(c => c.enabled).map(c => c.name);
        response = `WIZARD_COLUMNS: ${cols.join(', ')}`;
        break;
      }
      case 'pipeline_preview':
        response = 'WIZARD_PIPELINE_CONFIRMED';
        break;
      case 'confirm':
        response = 'WIZARD_CONFIRMED';
        break;
    }

    if (response) {
      this.inputText = response;
      await this.sendMessage();
    }
  }

  async confirmProposal(): Promise<void> {
    const processId = this.orchestratorProcessId();
    if (!processId || this.orchestratorConfirming()) return;
    this.orchestratorConfirming.set(true);
    try {
      const res = await firstValueFrom(
        this.http.post<{ data: any }>(`${this.apiBase}/orchestrator/confirm`, {
          tenantId: this.tenantId,
          processId,
        }),
      );
      this.messages.update((m) => [
        ...m,
        {
          role: 'system',
          content: `✅ Process deployed. Infrastructure created (n8n workflow + agent). Run a test from the Processes page, then approve to publish.`,
          timestamp: Date.now(),
        },
      ]);
      this.orchestratorProposal.set(null);
      await this.loadDrafts();
    } catch (e) {
      alert(`Deploy failed: ${(e as Error).message}`);
    } finally {
      this.orchestratorConfirming.set(false);
    }
  }

  openFeedback(): void {
    this.showFeedbackInput.set(true);
    this.feedbackText = '';
  }

  cancelFeedback(): void {
    this.showFeedbackInput.set(false);
    this.feedbackText = '';
  }

  async submitFeedback(): Promise<void> {
    const draft = this.selectedDraft();
    const run = this.latestTestRun();
    const text = this.feedbackText.trim();
    if (!draft || !run || !text) return;
    try {
      await firstValueFrom(
        this.http.post(`${this.apiBase}/drafts/${draft.id}/request-changes`, {
          tenantId: this.tenantId,
          testRunId: run.id,
          feedback: text,
        }),
      );
      this.showFeedbackInput.set(false);
      this.feedbackText = '';
      // Send the feedback as a chat message so the agent iterates
      this.inputText = `REQUEST CHANGES: ${text}`;
      await this.sendMessage();
    } catch (e) {
      alert(`Request changes failed: ${(e as Error).message}`);
    }
  }

  previewCellValue(item: unknown, col: string): string {
    if (!item || typeof item !== 'object') return '';
    const v = (item as Record<string, unknown>)[col];
    if (v === null || v === undefined) return '';
    if (typeof v === 'string') return v.length > 80 ? v.slice(0, 80) + '…' : v;
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    return JSON.stringify(v).slice(0, 80);
  }

  onKey(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.sendMessage();
    }
  }

  sendExample(example: string): void {
    this.inputText = example;
    this.sendMessage();
  }

  sendMessage(): void {
    const text = this.inputText.trim();
    if (!text || this.streaming() || this.wizardLoading()) return;
    this.inputText = '';

    // Deterministic wizard mode — use REST instead of SSE
    if (this.wizardMode() && !this.wizardSessionId) {
      this.startDeterministicWizard(text);
      return;
    }

    this.messages.update((m) => [
      ...m,
      { role: 'user', content: text, timestamp: Date.now() },
    ]);
    this.activity.set([]);
    this.streamingText.set('');
    this.streaming.set(true);
    this.shouldAutoScroll = true;
    this.receivedWizardCards = false;

    // Open SSE connection
    const params = new URLSearchParams({
      tenantId: this.tenantId,
      message: text,
      sessionId: this.sessionId,
    });
    const url = `${this.apiBase}/chat/stream?${params.toString()}`;
    this.closeStream();
    this.eventSource = new EventSource(url);

    // Zoneless — signal updates should trigger CD automatically, but
    // EventSource callbacks sometimes beat the scheduler. markForCheck
    // as insurance.
    const tick = () => this.cdr.markForCheck();

    this.eventSource.addEventListener('status', (e) => {
      const data = this.parse((e as MessageEvent).data) as {
        label?: string;
        phase?: string;
      };
      this.pushActivity({
        type: 'status',
        label: String(data.label ?? data.phase ?? 'working…'),
        timestamp: Date.now(),
      });
      tick();
    });

    this.eventSource.addEventListener('tool', (e) => {
      const data = this.parse((e as MessageEvent).data) as {
        tool?: string;
        status?: string;
        query?: string | null;
      };
      const label = `${data.tool ?? 'tool'} ${data.status ?? ''}`.trim();
      this.pushActivity({
        type: 'tool',
        label,
        detail: data.query ?? undefined,
        timestamp: Date.now(),
      });
      tick();
    });

    // New orchestrator emits 'message' events for each assistant
    // response (question or final confirmation). We append these
    // directly to the messages log.
    this.eventSource.addEventListener('message', (e) => {
      const data = this.parse((e as MessageEvent).data) as {
        role?: 'assistant' | 'system';
        content?: string;
      };
      if (data.content) {
        this.messages.update((m) => [
          ...m,
          {
            role: data.role ?? 'assistant',
            content: data.content as string,
            timestamp: Date.now(),
          },
        ]);
        tick();
      }
    });

    // Structured wizard card events — emitted by the backend's
    // WizardCardStreamParser when it detects WIZARD_CARD: patterns
    // in the agent's output. Cards appear in real-time as they're
    // parsed, not after the stream ends.
    this.eventSource.addEventListener('wizard_card', (e) => {
      try {
        const card = this.parse((e as MessageEvent).data) as WizardCard;
        if (card && card.type) {
          this.receivedWizardCards = true;
          this.messages.update((m) => [
            ...m,
            {
              role: 'assistant' as const,
              content: '',
              timestamp: Date.now(),
              wizardStep: card,
            },
          ]);
          tick();
        }
      } catch { /* malformed SSE data — ignore */ }
    });

    // Text-delta events — regular text streamed from the agent
    // (wizard card JSON is stripped by the backend parser)
    this.eventSource.addEventListener('text', (e) => {
      const data = this.parse((e as MessageEvent).data) as {
        delta?: string;
      };
      if (typeof data.delta === 'string') {
        this.streamingText.update((prev) => prev + data.delta);
        tick();
      }
    });

    this.eventSource.addEventListener('done', (e) => {
      const data = this.parse((e as MessageEvent).data) as {
        success?: boolean;
        draftId?: string;
      };
      // Flush any remaining streamed text as a message.
      // Card JSON should already be stripped by the backend parser,
      // but tryExtractChoiceCards is kept as a safety-net fallback.
      const remainingText = this.streamingText().trim();
      if (remainingText) {
        // Fallback: only try text-based card extraction if the backend
        // parser did NOT emit any wizard_card events (prevents duplicates)
        if (!this.receivedWizardCards) {
          this.tryExtractChoiceCards(remainingText);
        }
        this.tryExtractOrchestratorProposal(remainingText);

        // Strip card markers + their JSON payload from the text.
        // Uses a greedy approach to handle nested JSON objects.
        const cleanText = this.stripCardMarkers(remainingText).trim();

        if (cleanText) {
          this.messages.update((m) => [
            ...m,
            {
              role: 'assistant',
              content: cleanText,
              timestamp: Date.now(),
            },
          ]);
        }
      }

      this.streamingText.set('');
      this.streaming.set(false);
      this.closeStream();
      this.loadDrafts();
      // Select the newly created draft if any
      if (data.draftId) {
        setTimeout(() => this.selectedDraftId.set(data.draftId!), 400);
      }
      tick();
    });

    this.eventSource.addEventListener('error', (e) => {
      const data = this.parse(((e as MessageEvent).data as string) ?? '{}');
      const errMsg =
        (data as { error?: string }).error ?? 'connection error';
      this.messages.update((m) => [
        ...m,
        {
          role: 'system',
          content: `Stream error: ${errMsg}`,
          timestamp: Date.now(),
        },
      ]);
      this.streamingText.set('');
      this.streaming.set(false);
      this.closeStream();
      tick();
    });
  }

  /**
   * Fallback: detect wizard card JSON in AI output using balanced brace
   * extraction (not regex). Only runs on stream end if the backend parser
   * missed cards (e.g. unexpected format).
   */
  private tryExtractChoiceCards(output: string): void {
    try {
      const markers = ['WIZARD_CARD:', 'TOOL_SELECT:', 'OPERATION_SELECT:'];
      for (const marker of markers) {
        let searchFrom = 0;
        while (true) {
          const idx = output.indexOf(marker, searchFrom);
          if (idx === -1) break;
          const afterMarker = output.substring(idx + marker.length);
          const braceStart = afterMarker.indexOf('{');
          if (braceStart === -1) break;
          const jsonStr = this.extractBalancedJson(afterMarker.substring(braceStart));
          if (!jsonStr) break;
          searchFrom = idx + marker.length + braceStart + jsonStr.length;
          try {
            const data = JSON.parse(jsonStr);
            const card = this.normalizeWizardCard(marker, data);
            if (card?.type) {
              this.messages.update((m) => [
                ...m,
                { role: 'assistant' as const, content: '', timestamp: Date.now(), wizardStep: card },
              ]);
            }
          } catch { /* invalid JSON, skip */ }
        }
      }
    } catch { /* non-fatal */ }
  }

  /** Balanced brace JSON extraction (handles nested objects/arrays) */
  private extractBalancedJson(str: string): string | null {
    if (!str || str[0] !== '{') return null;
    let depth = 0;
    let inString = false;
    let escape = false;
    for (let i = 0; i < str.length; i++) {
      const ch = str[i];
      if (escape) { escape = false; continue; }
      if (ch === '\\' && inString) { escape = true; continue; }
      if (ch === '"') { inString = !inString; continue; }
      if (inString) continue;
      if (ch === '{') depth++;
      if (ch === '}') { depth--; if (depth === 0) return str.substring(0, i + 1); }
    }
    return null;
  }

  /** Normalize legacy marker formats to unified WizardCard */
  private normalizeWizardCard(marker: string, data: Record<string, unknown>): WizardCard | null {
    if (marker === 'WIZARD_CARD:') return data as WizardCard;
    if (marker === 'TOOL_SELECT:' && data['tools']) {
      return { type: 'tool_select', title: (data['title'] as string) || 'Select a tool', purpose: (data['purpose'] as string) || '', tools: data['tools'] as WizardTool[] };
    }
    if (marker === 'OPERATION_SELECT:' && data['operations']) {
      return { type: 'operation_select', title: (data['title'] as string) || 'Select operations', toolSlug: (data['toolSlug'] as string) || '', operations: data['operations'] as WizardOperation[], selected: [] };
    }
    return null;
  }

  /** Strip all card marker + JSON blocks from text (for clean display) */
  private stripCardMarkers(text: string): string {
    const markers = ['WIZARD_CARD:', 'TOOL_SELECT:', 'OPERATION_SELECT:'];
    let result = text;
    for (const marker of markers) {
      let idx: number;
      while ((idx = result.indexOf(marker)) !== -1) {
        const afterMarker = result.substring(idx + marker.length);
        const braceStart = afterMarker.indexOf('{');
        if (braceStart === -1) {
          // No JSON — strip marker + rest of line
          result = result.substring(0, idx) + result.substring(idx + marker.length).replace(/^[^\n]*/, '');
          continue;
        }
        const jsonStr = this.extractBalancedJson(afterMarker.substring(braceStart));
        if (jsonStr) {
          const endIdx = idx + marker.length + braceStart + jsonStr.length;
          result = result.substring(0, idx) + result.substring(endIdx);
        } else {
          // Incomplete JSON — strip from marker to end
          result = result.substring(0, idx);
        }
      }
    }
    return result;
  }

  /**
   * Detect orchestrator proposal in AI output.
   * When the AI calls submit-design, the exec tool result contains
   * JSON with stage:"proposal" and the formatted proposal data.
   * We extract it and show the Proposal Card in the UI.
   */
  private tryExtractOrchestratorProposal(output: string): void {
    try {
      // Look for JSON containing orchestrator state in the AI's output
      const patterns = [
        /"stage"\s*:\s*"proposal"/,
        /"processId"\s*:\s*"proc_/,
      ];
      if (!patterns.some((p) => p.test(output))) return;

      // Find the JSON block — it could be in a tool result or inline
      const jsonMatches = output.match(/\{[^{}]*"stage"\s*:\s*"proposal"[^{}]*"proposal"\s*:\s*\{[^]*?\}\s*\}/g);
      if (!jsonMatches?.length) return;

      for (const match of jsonMatches) {
        try {
          const parsed = JSON.parse(match);
          if (parsed.stage === 'proposal' && parsed.proposal && parsed.processId) {
            this.orchestratorProcessId.set(parsed.processId);
            this.orchestratorProposal.set(parsed.proposal);
            return;
          }
        } catch { /* not valid JSON, try next */ }
      }

      // Fallback: try to find {"data":{"processId":...,"stage":"proposal"}} wrapper
      const wrapperMatch = output.match(/\{"data"\s*:\s*(\{[^]*?"stage"\s*:\s*"proposal"[^]*?\})\s*\}/);
      if (wrapperMatch?.[1]) {
        try {
          const parsed = JSON.parse(wrapperMatch[1]);
          if (parsed.processId && parsed.proposal) {
            this.orchestratorProcessId.set(parsed.processId);
            this.orchestratorProposal.set(parsed.proposal);
          }
        } catch { /* ignore */ }
      }
    } catch { /* non-fatal */ }
  }

  private closeStream(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  private pushActivity(e: ActivityEvent): void {
    this.activity.update((arr) => [...arr, e].slice(-10));
  }

  private parse(raw: string): Record<string, unknown> {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }

  async deployDraft(id: string): Promise<void> {
    if (this.deploying()) return;
    if (
      !confirm(
        'Deploy will create a real Notion database and register the n8n workflow. Continue?',
      )
    ) {
      return;
    }
    this.deploying.set(true);
    try {
      await firstValueFrom(
        this.http.post(`${this.apiBase}/drafts/${id}/deploy`, {
          tenantId: this.tenantId,
        }),
      );
      await this.loadDrafts();
    } catch (e) {
      alert(`Deploy failed: ${(e as Error).message}`);
    } finally {
      this.deploying.set(false);
    }
  }

  async deleteDraft(id: string): Promise<void> {
    if (!confirm('Delete this process? This cannot be undone.')) return;
    try {
      await firstValueFrom(
        this.http.delete(
          `${this.apiBase}/drafts/${id}?tenantId=${this.tenantId}`,
        ),
      );
      this.selectedDraftId.set(null);
      await this.loadDrafts();
    } catch (e) {
      alert(`Delete failed: ${(e as Error).message}`);
    }
  }
}
