import {
  Component,
  inject,
  signal,
  input,
  output,
  effect,
  untracked,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NotesApiService } from '../services/notes-api.service';
import { NoteType, NoteStatus } from '@mentor-ai/shared/types';
import type { NoteItem } from '@mentor-ai/shared/types';

@Component({
  selector: 'app-conversation-notes',
  standalone: true,
  imports: [CommonModule, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { display: flex; flex-direction: column; flex: 1; overflow: hidden; }

    .notes-container {
      flex: 1; overflow-y: auto; padding: 16px;
    }

    .filter-bar {
      display: flex; gap: 4px; padding: 0 16px 12px; border-bottom: 1px solid #2A2A2A;
    }
    .filter-btn {
      padding: 4px 12px; border-radius: 12px; font-size: 12px;
      background: none; border: 1px solid #2A2A2A; color: #6B6B6B;
      cursor: pointer;
    }
    .filter-btn:hover { color: #A1A1A1; border-color: #3B82F6; }
    .filter-btn.active { background: #3B82F6; color: #FAFAFA; border-color: #3B82F6; }

    /* ── Task Card ── */
    .task-card {
      background: #1A1A1A; border-radius: 8px;
      margin-bottom: 8px; border: 1px solid #2A2A2A;
      overflow: hidden;
    }
    .task-card:hover { border-color: #333; }

    .task-card-header {
      display: flex; align-items: center; gap: 8px;
      padding: 12px; cursor: pointer; user-select: none;
    }

    .task-checkbox {
      width: 16px; height: 16px; cursor: pointer;
      accent-color: #3B82F6; flex-shrink: 0;
    }

    .select-btn {
      width: 18px; height: 18px; border-radius: 50%; border: 2px solid #3B82F6;
      background: transparent; cursor: pointer; flex-shrink: 0; padding: 0;
      display: inline-block; box-sizing: border-box;
    }
    .select-btn.selected { background: #3B82F6; }
    .select-btn:hover { background: rgba(59, 130, 246, 0.3); }
    .select-btn.selected:hover { background: #2563EB; }

    .note-type-badge {
      font-size: 10px; padding: 2px 6px; border-radius: 4px;
      text-transform: uppercase; font-weight: 600; flex-shrink: 0;
    }
    .badge-task { background: #1E3A5F; color: #60A5FA; }
    .badge-note { background: #1A2E1A; color: #86EFAC; }
    .badge-summary { background: #2E1A2E; color: #C084FC; }
    .badge-review { background: #3D2E0A; color: #F59E0B; }

    .task-title {
      font-size: 13px; font-weight: 500; color: #FAFAFA;
      flex: 1; min-width: 0; overflow: hidden;
      text-overflow: ellipsis; white-space: nowrap;
    }
    .task-title.completed {
      text-decoration: line-through; color: #6B6B6B;
    }

    .score-badge {
      font-size: 11px; font-weight: 600; padding: 2px 8px;
      border-radius: 10px; flex-shrink: 0;
    }
    .score-high { background: rgba(34, 197, 94, 0.15); color: #22C55E; }
    .score-medium { background: rgba(234, 179, 8, 0.15); color: #EAB308; }
    .score-low { background: rgba(239, 68, 68, 0.15); color: #EF4444; }

    .expand-icon {
      width: 16px; height: 16px; color: #6B6B6B; flex-shrink: 0;
      transition: transform 0.2s;
    }
    .expand-icon.expanded { transform: rotate(90deg); }

    .delete-btn {
      background: none; border: none; color: #4A4A4A;
      cursor: pointer; padding: 2px; flex-shrink: 0;
    }
    .delete-btn:hover { color: #EF4444; }

    /* ── Expanded Body ── */
    .task-card-body {
      padding: 0 12px 12px;
      border-top: 1px solid #242424;
    }

    .task-description {
      font-size: 12px; color: #A1A1A1; line-height: 1.5;
      padding: 10px 0; white-space: pre-wrap; word-break: break-word;
    }

    .expected-outcome {
      font-size: 12px; color: #A1A1A1; line-height: 1.5;
      padding: 8px; background: #0D0D0D; border-radius: 6px;
      margin-bottom: 10px;
    }
    .expected-outcome-label {
      font-size: 11px; font-weight: 600; color: #6B6B6B;
      margin-bottom: 4px; text-transform: uppercase;
    }

    .task-meta {
      font-size: 10px; color: #4A4A4A; display: flex; gap: 8px;
      margin-bottom: 10px;
    }

    /* ── Sub-tasks ── */
    .subtasks-section {
      margin-top: 8px;
    }
    .subtasks-label {
      font-size: 11px; font-weight: 600; color: #6B6B6B;
      margin-bottom: 6px; text-transform: uppercase;
    }

    .subtask-item {
      display: flex; align-items: flex-start; gap: 8px;
      padding: 8px; background: #0D0D0D; border-radius: 6px;
      margin-bottom: 4px; cursor: pointer;
    }
    .subtask-item:hover { background: #141414; }

    .subtask-step-num {
      font-size: 11px; font-weight: 600; color: #3B82F6;
      background: rgba(59, 130, 246, 0.1); padding: 1px 6px;
      border-radius: 4px; flex-shrink: 0;
    }

    .subtask-check {
      width: 14px; height: 14px; color: #22C55E; flex-shrink: 0; margin-top: 1px;
    }

    .subtask-title {
      font-size: 12px; color: #D4D4D4; flex: 1;
    }

    .subtask-expand-icon {
      width: 12px; height: 12px; color: #4A4A4A; flex-shrink: 0;
      transition: transform 0.2s;
    }
    .subtask-expand-icon.expanded { transform: rotate(90deg); }

    .subtask-content {
      font-size: 11px; color: #A1A1A1; line-height: 1.5;
      padding: 8px 8px 8px 32px; white-space: pre-wrap;
      word-break: break-word;
      max-height: 300px; overflow-y: auto;
    }

    /* ── Report Section ── */
    .report-section {
      margin-top: 12px; padding-top: 12px; border-top: 1px solid #242424;
    }
    .report-label {
      font-size: 11px; font-weight: 600; color: #6B6B6B;
      margin-bottom: 6px; text-transform: uppercase;
    }
    .report-textarea {
      width: 100%; background: #0D0D0D; border: 1px solid #2A2A2A;
      border-radius: 6px; padding: 8px 12px; color: #FAFAFA;
      font-size: 12px; font-family: inherit; resize: vertical;
      min-height: 60px; box-sizing: border-box;
    }
    .report-textarea:focus { outline: none; border-color: #3B82F6; }
    .report-textarea::placeholder { color: #4A4A4A; }

    .report-actions {
      display: flex; gap: 8px; margin-top: 8px; justify-content: flex-end;
    }

    .existing-report {
      font-size: 12px; color: #A1A1A1; line-height: 1.5;
      padding: 8px; background: #0D0D0D; border-radius: 6px;
      white-space: pre-wrap;
    }

    /* ── Score Display ── */
    .score-section {
      margin-top: 12px; padding-top: 12px; border-top: 1px solid #242424;
    }
    .score-bar-container {
      display: flex; align-items: center; gap: 12px; margin-bottom: 8px;
    }
    .score-bar-bg {
      flex: 1; height: 8px; background: #242424; border-radius: 4px; overflow: hidden;
    }
    .score-bar-fill {
      height: 100%; border-radius: 4px; transition: width 0.3s;
    }
    .score-bar-fill.high { background: #22C55E; }
    .score-bar-fill.medium { background: #EAB308; }
    .score-bar-fill.low { background: #EF4444; }

    .score-number {
      font-size: 18px; font-weight: 700; flex-shrink: 0;
    }
    .score-number.high { color: #22C55E; }
    .score-number.medium { color: #EAB308; }
    .score-number.low { color: #EF4444; }

    .score-feedback {
      font-size: 12px; color: #A1A1A1; line-height: 1.5;
      padding: 8px; background: #0D0D0D; border-radius: 6px;
    }

    /* ── Buttons ── */
    .btn-primary {
      background: #3B82F6; color: #FAFAFA; border: none; border-radius: 6px;
      padding: 6px 16px; font-size: 12px; cursor: pointer;
    }
    .btn-primary:hover { background: #2563EB; }
    .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .btn-secondary {
      background: none; color: #A1A1A1; border: 1px solid #2A2A2A; border-radius: 6px;
      padding: 6px 16px; font-size: 12px; cursor: pointer;
    }
    .btn-secondary:hover { color: #FAFAFA; border-color: #4A4A4A; }
    .btn-score {
      background: rgba(234, 179, 8, 0.1); color: #EAB308;
      border: 1px solid rgba(234, 179, 8, 0.3); border-radius: 6px;
      padding: 6px 16px; font-size: 12px; cursor: pointer;
    }
    .btn-score:hover { background: rgba(234, 179, 8, 0.2); }
    .btn-score:disabled { opacity: 0.5; cursor: not-allowed; }

    .view-in-chat-btn {
      background: none; border: none; color: #3B82F6; cursor: pointer;
      font-size: 10px; padding: 0;
    }
    .view-in-chat-btn:hover { text-decoration: underline; }

    .empty-notes {
      text-align: center; padding: 32px 16px;
    }
    .empty-notes p { font-size: 13px; color: #6B6B6B; }

    .add-note-section {
      border-top: 1px solid #2A2A2A; padding: 12px 16px;
    }
    .add-note-form {
      display: flex; flex-direction: column; gap: 8px;
    }
    .note-input {
      background: #1A1A1A; border: 1px solid #2A2A2A; border-radius: 6px;
      padding: 8px 12px; color: #FAFAFA; font-size: 13px; font-family: inherit;
    }
    .note-input:focus { outline: none; border-color: #3B82F6; }
    .note-input::placeholder { color: #4A4A4A; }
    .note-textarea {
      background: #1A1A1A; border: 1px solid #2A2A2A; border-radius: 6px;
      padding: 8px 12px; color: #FAFAFA; font-size: 13px;
      font-family: inherit; resize: vertical; min-height: 60px;
    }
    .note-textarea:focus { outline: none; border-color: #3B82F6; }
    .note-textarea::placeholder { color: #4A4A4A; }
    .form-actions {
      display: flex; gap: 8px; justify-content: flex-end;
    }

    .loading-spinner {
      text-align: center; padding: 24px; color: #6B6B6B; font-size: 13px;
    }

    .run-agents-bar {
      display: flex; align-items: center; justify-content: space-between;
      padding: 8px 16px; background: #1A1A1A; border-bottom: 1px solid #2A2A2A;
    }
    .run-agents-bar span { font-size: 12px; color: #A1A1A1; }
    .run-agents-actions { display: flex; gap: 8px; align-items: center; }
    .run-agents-btn {
      background: #3B82F6; color: #FAFAFA; border: none; border-radius: 6px;
      padding: 6px 16px; font-size: 12px; font-weight: 500; cursor: pointer;
    }
    .run-agents-btn:hover { background: #2563EB; }
    .run-agents-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .select-link {
      background: none; border: none; color: #3B82F6; cursor: pointer;
      font-size: 11px; padding: 0;
    }
    .select-link:hover { text-decoration: underline; }

    .executing-bar {
      display: flex; align-items: center; gap: 8px;
      padding: 10px 16px; background: #1A1A1A; border-bottom: 1px solid #2A2A2A;
      font-size: 12px; color: #60A5FA;
    }
    .executing-spinner {
      width: 14px; height: 14px; border: 2px solid #2A2A2A;
      border-top-color: #3B82F6; border-radius: 50%;
      animation: spin 0.8s linear infinite; flex-shrink: 0;
    }
    .scoring-spinner {
      display: inline-block; width: 12px; height: 12px;
      border: 2px solid #2A2A2A; border-top-color: #EAB308;
      border-radius: 50%; animation: spin 0.8s linear infinite;
      margin-right: 6px; vertical-align: middle;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    .folder-header {
      display: flex; align-items: center; gap: 10px;
      padding: 14px 16px; border-bottom: 1px solid #2A2A2A;
      background: #111;
    }
    .folder-title {
      font-size: 15px; font-weight: 600; color: #FAFAFA; flex: 1;
    }
    .folder-count {
      font-size: 12px; color: #6B6B6B;
    }

    .execute-btn {
      display: inline-flex; align-items: center; gap: 6px;
      background: rgba(59, 130, 246, 0.1); color: #60A5FA;
      border: 1px solid rgba(59, 130, 246, 0.3); border-radius: 6px;
      padding: 5px 12px; font-size: 11px; cursor: pointer;
      margin-top: 8px;
    }
    .execute-btn:hover { background: rgba(59, 130, 246, 0.2); border-color: #3B82F6; }
    .execute-btn:disabled { opacity: 0.5; cursor: not-allowed; }
    .execute-spinner {
      display: inline-block; width: 12px; height: 12px;
      border: 2px solid rgba(59, 130, 246, 0.3); border-top-color: #60A5FA;
      border-radius: 50%; animation: spin 0.8s linear infinite;
    }
  `],
  template: `
    @if (isGeneratingPlan()) {
      <div class="executing-bar">
        <span class="executing-spinner"></span>
        Generating workflow plan...
      </div>
    } @else if (isExecuting()) {
      <div class="executing-bar">
        <span class="executing-spinner"></span>
        Agents running...
      </div>
    }

    @if (folderName()) {
      <div class="folder-header">
        <svg style="width: 18px; height: 18px; color: #3B82F6;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
        </svg>
        <span class="folder-title">{{ folderName() }}</span>
        <span class="folder-count">{{ notes().length }} task{{ notes().length !== 1 ? 's' : '' }}</span>
      </div>
    }

    <!-- Filter bar -->
    <div class="filter-bar">
      <button class="filter-btn" [class.active]="activeFilter() === 'all'" (click)="activeFilter.set('all'); updateFilteredNotes()">All</button>
      <button class="filter-btn" [class.active]="activeFilter() === 'TASK'" (click)="activeFilter.set('TASK'); updateFilteredNotes()">Tasks</button>
      <button class="filter-btn" [class.active]="activeFilter() === 'READY_FOR_REVIEW'" (click)="activeFilter.set('READY_FOR_REVIEW'); updateFilteredNotes()">Review</button>
      <button class="filter-btn" [class.active]="activeFilter() === 'NOTE'" (click)="activeFilter.set('NOTE'); updateFilteredNotes()">Notes</button>
    </div>

    @if (selectedTaskIds().size > 0) {
      <div class="run-agents-bar">
        <span>{{ selectedTaskIds().size }} task{{ selectedTaskIds().size > 1 ? 's' : '' }} selected</span>
        <div class="run-agents-actions">
          <button class="select-link" (click)="deselectAll()">Deselect</button>
          <button class="run-agents-btn" [disabled]="isExecuting() || isGeneratingPlan()" (click)="onRunAgents()">Run Agents</button>
        </div>
      </div>
    } @else if (pendingTaskCount() > 0) {
      <div class="run-agents-bar">
        <span>{{ pendingTaskCount() }} pending task{{ pendingTaskCount() > 1 ? 's' : '' }}</span>
        <button class="select-link" (click)="selectAllPending()">Select all</button>
      </div>
    }

    <div class="notes-container">
      @if (loading()) {
        <div class="loading-spinner">Loading notes...</div>
      } @else if (filteredNotes().length === 0) {
        <div class="empty-notes">
          <p>No notes yet</p>
          <p style="font-size: 11px; margin-top: 4px;">Notes and tasks will appear here as you chat</p>
        </div>
      } @else {
        @for (note of filteredNotes(); track note.id) {
          <div class="task-card">
            <!-- Header -->
            <div class="task-card-header" (click)="toggleExpand(note.id)">
              @if (note.noteType === 'TASK' && note.status !== 'COMPLETED') {
                <button
                  class="select-btn"
                  [class.selected]="selectedTaskIds().has(note.id)"
                  (click)="toggleSelection(note.id); $event.stopPropagation()"
                  title="Select for agents"
                ></button>
              }
              @if (note.noteType === 'TASK') {
                <input
                  type="checkbox"
                  class="task-checkbox"
                  [checked]="note.status === 'COMPLETED'"
                  [disabled]="togglingStatus().has(note.id)"
                  (change)="toggleTaskStatus(note); $event.stopPropagation()"
                  (click)="$event.stopPropagation()"
                />
              }
              <span class="note-type-badge"
                    [class.badge-task]="note.noteType === 'TASK'"
                    [class.badge-note]="note.noteType === 'NOTE'"
                    [class.badge-summary]="note.noteType === 'SUMMARY'"
                    [class.badge-review]="note.status === 'READY_FOR_REVIEW'"
              >{{ note.status === 'READY_FOR_REVIEW' ? 'REVIEW' : note.noteType }}</span>
              <span class="task-title" [class.completed]="note.status === 'COMPLETED'">
                {{ note.title }}
              </span>
              @if (note.aiScore !== null && note.aiScore !== undefined) {
                <span class="score-badge"
                      [class.score-high]="note.aiScore >= 80"
                      [class.score-medium]="note.aiScore >= 50 && note.aiScore < 80"
                      [class.score-low]="note.aiScore < 50"
                >{{ note.aiScore }}/100</span>
              }
              <svg class="expand-icon" [class.expanded]="expandedNotes().has(note.id)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
              </svg>
              <button class="delete-btn" [disabled]="deletingInProgress().has(note.id)" (click)="deleteNote(note.id); $event.stopPropagation()" title="Delete">
                @if (deletingInProgress().has(note.id)) {
                  <span class="scoring-spinner" style="width:12px;height:12px;border-top-color:#EF4444;"></span>
                } @else {
                  <svg style="width: 14px; height: 14px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                  </svg>
                }
              </button>
            </div>

            <!-- Expanded body -->
            @if (expandedNotes().has(note.id)) {
              <div class="task-card-body">
                @if (note.content) {
                  <div class="task-description">{{ note.content }}</div>
                }

                @if (note.expectedOutcome) {
                  <div class="expected-outcome">
                    <div class="expected-outcome-label">Expected outcome</div>
                    {{ note.expectedOutcome }}
                  </div>
                }

                @if (note.noteType === 'TASK' && note.status !== 'COMPLETED') {
                  <button
                    class="execute-btn"
                    [disabled]="executingTaskId() === note.id || isExecuting()"
                    (click)="onExecuteTask(note.id)"
                  >
                    @if (executingTaskId() === note.id) {
                      <span class="execute-spinner"></span> Generating...
                    } @else {
                      <svg style="width:12px;height:12px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"/>
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
                      </svg>
                      Execute
                    }
                  </button>
                }

                <div class="task-meta">
                  <span>{{ note.source }}</span>
                  <span>{{ formatDate(note.createdAt) }}</span>
                  @if (note.messageId) {
                    <button class="view-in-chat-btn" (click)="emitViewMessage(note)">View in chat</button>
                  }
                </div>

                <!-- Sub-tasks -->
                @if (note.children && note.children.length > 0) {
                  <div class="subtasks-section">
                    <div class="subtasks-label">Workflow Output ({{ note.children.length }} steps)</div>
                    @for (child of note.children; track child.id) {
                      <div>
                        <div class="subtask-item" (click)="toggleSubtaskExpand(child.id)">
                          @if (child.workflowStepNumber !== null) {
                            <span class="subtask-step-num">{{ child.workflowStepNumber }}</span>
                          }
                          @if (child.status === 'COMPLETED') {
                            <svg class="subtask-check" fill="currentColor" viewBox="0 0 20 20">
                              <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                            </svg>
                          }
                          <span class="subtask-title">{{ child.title }}</span>
                          <svg class="subtask-expand-icon" [class.expanded]="expandedSubtasks().has(child.id)" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                          </svg>
                        </div>
                        @if (expandedSubtasks().has(child.id)) {
                          <div class="subtask-content">{{ child.content }}</div>

                          <!-- Sub-task report -->
                          @if (child.status === 'COMPLETED' && !child.userReport) {
                            <div class="report-section" style="padding-left: 32px;">
                              <div class="report-label">Your completion report</div>
                              <textarea
                                class="report-textarea"
                                placeholder="Describe what you did, what you learned, results achieved..."
                                [value]="getReportText(child.id)"
                                (input)="setReportText(child.id, asTextareaValue($event))"
                              ></textarea>
                              <div class="report-actions">
                                <button class="btn-primary" [disabled]="!getReportText(child.id) || submittingInProgress().has(child.id)" (click)="submitReport(child.id)">
                                  {{ submittingInProgress().has(child.id) ? 'Submitting...' : 'Submit Report' }}
                                </button>
                              </div>
                            </div>
                          }
                          @if (child.userReport) {
                            <div class="report-section" style="padding-left: 32px;">
                              <div class="report-label">Your report</div>
                              <div class="existing-report">{{ child.userReport }}</div>
                              @if (child.aiScore !== null && child.aiScore !== undefined) {
                                <div class="score-section" style="border: none; padding-top: 8px;">
                                  <div class="score-bar-container">
                                    <div class="score-bar-bg">
                                      <div class="score-bar-fill"
                                           [class.high]="child.aiScore >= 80"
                                           [class.medium]="child.aiScore >= 50 && child.aiScore < 80"
                                           [class.low]="child.aiScore < 50"
                                           [style.width.%]="child.aiScore"
                                      ></div>
                                    </div>
                                    <span class="score-number"
                                          [class.high]="child.aiScore >= 80"
                                          [class.medium]="child.aiScore >= 50 && child.aiScore < 80"
                                          [class.low]="child.aiScore < 50"
                                    >{{ child.aiScore }}</span>
                                  </div>
                                  @if (child.aiFeedback) {
                                    <div class="score-feedback">{{ child.aiFeedback }}</div>
                                  }
                                </div>
                              } @else {
                                <div class="report-actions">
                                  <button class="btn-score" [disabled]="scoringInProgress().has(child.id)" (click)="scoreReport(child.id)">
                                    @if (scoringInProgress().has(child.id)) {
                                      <span class="scoring-spinner"></span> Scoring...
                                    } @else {
                                      Get AI Score
                                    }
                                  </button>
                                </div>
                              }
                            </div>
                          }
                        }
                      </div>
                    }
                  </div>
                }

                <!-- Parent task report -->
                @if (note.noteType === 'TASK' && note.status === 'COMPLETED' && !note.userReport) {
                  <div class="report-section">
                    <div class="report-label">Your completion report</div>
                    <textarea
                      class="report-textarea"
                      placeholder="Describe what you did, what you learned, results achieved..."
                      [value]="getReportText(note.id)"
                      (input)="setReportText(note.id, asTextareaValue($event))"
                    ></textarea>
                    <div class="report-actions">
                      <button class="btn-primary" [disabled]="!getReportText(note.id) || submittingInProgress().has(note.id)" (click)="submitReport(note.id)">
                        {{ submittingInProgress().has(note.id) ? 'Submitting...' : 'Submit Report' }}
                      </button>
                    </div>
                  </div>
                }

                @if (note.userReport) {
                  <div class="report-section">
                    <div class="report-label">Your report</div>
                    <div class="existing-report">{{ note.userReport }}</div>

                    @if (note.aiScore !== null && note.aiScore !== undefined) {
                      <div class="score-section">
                        <div class="score-bar-container">
                          <div class="score-bar-bg">
                            <div class="score-bar-fill"
                                 [class.high]="note.aiScore >= 80"
                                 [class.medium]="note.aiScore >= 50 && note.aiScore < 80"
                                 [class.low]="note.aiScore < 50"
                                 [style.width.%]="note.aiScore"
                            ></div>
                          </div>
                          <span class="score-number"
                                [class.high]="note.aiScore >= 80"
                                [class.medium]="note.aiScore >= 50 && note.aiScore < 80"
                                [class.low]="note.aiScore < 50"
                          >{{ note.aiScore }}</span>
                        </div>
                        @if (note.aiFeedback) {
                          <div class="score-feedback">{{ note.aiFeedback }}</div>
                        }
                      </div>
                    } @else {
                      <div class="report-actions">
                        <button class="btn-score" [disabled]="scoringInProgress().has(note.id)" (click)="scoreReport(note.id)">
                          @if (scoringInProgress().has(note.id)) {
                            <span class="scoring-spinner"></span> Scoring...
                          } @else {
                            Get AI Score
                          }
                        </button>
                      </div>
                    }
                  </div>
                }
              </div>
            }
          </div>
        }
      }
    </div>

    <!-- Add note form -->
    <div class="add-note-section">
      @if (showAddForm()) {
        <div class="add-note-form">
          <input class="note-input" placeholder="Title" [value]="newTitle()" (input)="newTitle.set(asInputValue($event))" />
          <textarea class="note-textarea" placeholder="Content..." [value]="newContent()" (input)="newContent.set(asTextareaValue($event))"></textarea>
          <div class="form-actions">
            <button class="btn-secondary" (click)="showAddForm.set(false)">Cancel</button>
            <button class="btn-primary" [disabled]="!newTitle() || addingNote$()" (click)="addNote()">{{ addingNote$() ? 'Adding...' : 'Add Note' }}</button>
          </div>
        </div>
      } @else {
        <button class="btn-secondary" style="width: 100%;" (click)="showAddForm.set(true)">
          + Add Note
        </button>
      }
    </div>
  `,
})
export class ConversationNotesComponent {
  private readonly notesApi = inject(NotesApiService);

  conversationId = input<string | null>(null);
  conceptId = input<string | null>(null);
  isExecuting = input<boolean>(false);
  folderConceptIds = input<string[]>([]);
  folderConversationIds = input<string[]>([]);
  folderName = input<string | null>(null);
  autoSelectTaskIds = input<string[]>([]);
  executingTaskId = input<string | null>(null);
  isGeneratingPlan = input(false);
  viewMessage = output<{ conversationId: string; messageId: string }>();
  runAgents = output<string[]>();
  executeTask = output<string>();

  readonly notes = signal<NoteItem[]>([]);
  readonly loading = signal(false);
  readonly activeFilter = signal<'all' | 'TASK' | 'NOTE' | 'READY_FOR_REVIEW'>('all');
  readonly showAddForm = signal(false);
  readonly newTitle = signal('');
  readonly newContent = signal('');
  readonly selectedTaskIds = signal<Set<string>>(new Set());
  readonly pendingTaskCount = signal(0);
  readonly filteredNotes = signal<NoteItem[]>([]);

  readonly expandedNotes = signal<Set<string>>(new Set());
  readonly expandedSubtasks = signal<Set<string>>(new Set());
  readonly reportTexts = signal<Map<string, string>>(new Map());
  readonly scoringInProgress = signal<Set<string>>(new Set());
  readonly deletingInProgress = signal<Set<string>>(new Set());
  readonly submittingInProgress = signal<Set<string>>(new Set());
  readonly addingNote$ = signal(false);
  readonly togglingStatus = signal<Set<string>>(new Set());

  constructor() {
    effect(() => {
      // Track all reactive signal inputs — any change triggers reload
      this.conversationId();
      this.conceptId();
      this.folderConceptIds();
      this.folderConversationIds();
      this.autoSelectTaskIds();
      untracked(() => this.loadNotes());
    });
  }

  async loadNotes(): Promise<void> {
    // Folder mode: load notes from all descendant concepts + conversations
    const folderIds = this.folderConceptIds();
    const convIds = this.folderConversationIds();
    if (folderIds.length > 0 || convIds.length > 0) {
      this.loading.set(true);
      try {
        const [conceptNotes, convNotes] = await Promise.all([
          folderIds.length > 0 ? this.notesApi.getByConceptIds(folderIds) : Promise.resolve([]),
          convIds.length > 0 ? this.notesApi.getByConversationIds(convIds) : Promise.resolve([]),
        ]);
        // Deduplicate by note ID
        const seen = new Set<string>();
        const merged: NoteItem[] = [];
        for (const note of [...conceptNotes, ...convNotes]) {
          if (!seen.has(note.id)) {
            seen.add(note.id);
            merged.push(note);
          }
        }
        this.notes.set(merged);
        this.updateFilteredNotes();
      } catch {
        this.notes.set([]);
        this.updateFilteredNotes();
      } finally {
        this.loading.set(false);
      }
      return;
    }

    // Single conversation mode
    const convId = this.conversationId();
    if (!convId) {
      this.notes.set([]);
      this.updateFilteredNotes();
      return;
    }

    this.loading.set(true);
    try {
      const notes = await this.notesApi.getByConversation(convId);
      this.notes.set(notes);
      this.updateFilteredNotes();
      this.applyAutoSelect();
    } catch {
      this.notes.set([]);
      this.updateFilteredNotes();
    } finally {
      this.loading.set(false);
    }
  }

  private applyAutoSelect(): void {
    const ids = this.autoSelectTaskIds();
    if (ids.length > 0) {
      this.selectedTaskIds.set(new Set(ids));
    }
  }

  toggleExpand(noteId: string): void {
    this.expandedNotes.update((set) => {
      const next = new Set(set);
      if (next.has(noteId)) {
        next.delete(noteId);
      } else {
        next.add(noteId);
      }
      return next;
    });
  }

  toggleSubtaskExpand(noteId: string): void {
    this.expandedSubtasks.update((set) => {
      const next = new Set(set);
      if (next.has(noteId)) {
        next.delete(noteId);
      } else {
        next.add(noteId);
      }
      return next;
    });
  }

  getReportText(noteId: string): string {
    return this.reportTexts().get(noteId) ?? '';
  }

  setReportText(noteId: string, text: string): void {
    this.reportTexts.update((m) => {
      const next = new Map(m);
      next.set(noteId, text);
      return next;
    });
  }

  async submitReport(noteId: string): Promise<void> {
    const text = this.getReportText(noteId);
    if (!text || this.submittingInProgress().has(noteId)) return;
    this.submittingInProgress.update(s => { const n = new Set(s); n.add(noteId); return n; });
    try {
      const updated = await this.notesApi.submitReport(noteId, text);
      this.updateNoteInList(updated);
      this.reportTexts.update((m) => {
        const next = new Map(m);
        next.delete(noteId);
        return next;
      });
    } catch {
      // ignore
    } finally {
      this.submittingInProgress.update(s => { const n = new Set(s); n.delete(noteId); return n; });
    }
  }

  async scoreReport(noteId: string): Promise<void> {
    this.scoringInProgress.update((set) => {
      const next = new Set(set);
      next.add(noteId);
      return next;
    });
    try {
      const updated = await this.notesApi.scoreReport(noteId);
      this.updateNoteInList(updated);
    } catch {
      // ignore
    } finally {
      this.scoringInProgress.update((set) => {
        const next = new Set(set);
        next.delete(noteId);
        return next;
      });
    }
  }

  async toggleTaskStatus(note: NoteItem): Promise<void> {
    if (this.togglingStatus().has(note.id)) return;
    const newStatus = note.status === NoteStatus.COMPLETED ? NoteStatus.PENDING : NoteStatus.COMPLETED;
    this.togglingStatus.update(s => { const n = new Set(s); n.add(note.id); return n; });
    try {
      await this.notesApi.updateStatus(note.id, newStatus);
      this.notes.update((list) =>
        list.map((n) => n.id === note.id ? { ...n, status: newStatus } : n)
      );
      this.updateFilteredNotes();
    } catch {
      // Revert on error
    } finally {
      this.togglingStatus.update(s => { const n = new Set(s); n.delete(note.id); return n; });
    }
  }

  async deleteNote(noteId: string): Promise<void> {
    if (this.deletingInProgress().has(noteId)) return;
    this.deletingInProgress.update(s => { const n = new Set(s); n.add(noteId); return n; });
    try {
      await this.notesApi.deleteNote(noteId);
      this.notes.update((list) => list.filter((n) => n.id !== noteId));
      this.updateFilteredNotes();
    } catch {
      // ignore
    } finally {
      this.deletingInProgress.update(s => { const n = new Set(s); n.delete(noteId); return n; });
    }
  }

  async addNote(): Promise<void> {
    const title = this.newTitle();
    const content = this.newContent();
    if (!title || this.addingNote$()) return;

    this.addingNote$.set(true);
    try {
      const note = await this.notesApi.createNote({
        title,
        content,
        noteType: NoteType.NOTE,
        conversationId: this.conversationId() ?? undefined,
        conceptId: this.conceptId() ?? undefined,
      });
      this.notes.update((list) => [note, ...list]);
      this.updateFilteredNotes();
      this.newTitle.set('');
      this.newContent.set('');
      this.showAddForm.set(false);
    } catch {
      // ignore
    } finally {
      this.addingNote$.set(false);
    }
  }

  formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return date.toLocaleDateString();
  }

  asInputValue(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  asTextareaValue(event: Event): string {
    return (event.target as HTMLTextAreaElement).value;
  }

  toggleSelection(noteId: string): void {
    this.selectedTaskIds.update((set) => {
      const next = new Set(set);
      if (next.has(noteId)) {
        next.delete(noteId);
      } else {
        next.add(noteId);
      }
      return next;
    });
  }

  selectAllPending(): void {
    const pendingIds = this.notes()
      .filter((n) => n.noteType === 'TASK' && n.status !== NoteStatus.COMPLETED)
      .map((n) => n.id);
    this.selectedTaskIds.set(new Set(pendingIds));
  }

  deselectAll(): void {
    this.selectedTaskIds.set(new Set());
  }

  onRunAgents(): void {
    const ids = Array.from(this.selectedTaskIds());
    if (ids.length > 0) {
      this.runAgents.emit(ids);
      this.selectedTaskIds.set(new Set());
    }
  }

  onExecuteTask(noteId: string): void {
    this.executeTask.emit(noteId);
  }

  emitViewMessage(note: NoteItem): void {
    if (note.messageId && note.conversationId) {
      this.viewMessage.emit({ conversationId: note.conversationId, messageId: note.messageId });
    }
  }

  updateFilteredNotes(): void {
    const filter = this.activeFilter();
    const all = this.notes();
    if (filter === 'all') {
      this.filteredNotes.set(all);
    } else if (filter === 'READY_FOR_REVIEW') {
      this.filteredNotes.set(all.filter((n) => n.status === 'READY_FOR_REVIEW'));
    } else {
      this.filteredNotes.set(all.filter((n) => n.noteType === filter));
    }
    this.pendingTaskCount.set(
      all.filter((n) => n.noteType === 'TASK' && n.status !== 'COMPLETED').length
    );
  }

  private updateNoteInList(updated: NoteItem): void {
    this.notes.update((list) =>
      list.map((n) => {
        if (n.id === updated.id) return { ...n, ...updated };
        // Also check children
        if (n.children) {
          return {
            ...n,
            children: n.children.map((c) =>
              c.id === updated.id ? { ...c, ...updated } : c
            ),
          };
        }
        return n;
      })
    );
    this.updateFilteredNotes();
  }
}
