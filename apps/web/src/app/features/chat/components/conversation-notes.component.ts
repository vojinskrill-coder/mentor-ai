import {
  Component,
  inject,
  signal,
  input,
  output,
  effect,
  untracked,
  ChangeDetectionStrategy,
  ViewEncapsulation,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NotesApiService } from '../services/notes-api.service';
import { NoteType, NoteStatus } from '@mentor-ai/shared/types';
import type { NoteItem, CommentItem } from '@mentor-ai/shared/types';
// eslint-disable-next-line @nx/enforce-module-boundaries
import { MarkdownPipe } from '@mentor-ai/shared/ui';

@Component({
  selector: 'app-conversation-notes',
  standalone: true,
  imports: [CommonModule, FormsModule, MarkdownPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        flex: 1;
        overflow: hidden;
      }

      .notes-container {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
      }

      .filter-bar {
        display: flex;
        gap: 4px;
        padding: 0 16px 12px;
        border-bottom: 1px solid #2a2a2a;
      }
      .filter-btn {
        padding: 4px 12px;
        border-radius: 12px;
        font-size: 12px;
        background: none;
        border: 1px solid #2a2a2a;
        color: #9e9e9e;
        cursor: pointer;
      }
      .filter-btn:hover {
        color: #a1a1a1;
        border-color: #3b82f6;
      }
      .filter-btn.active {
        background: #3b82f6;
        color: #fafafa;
        border-color: #3b82f6;
      }

      /* ── Task Card ── */
      .task-card {
        background: #1a1a1a;
        border-radius: 8px;
        margin-bottom: 8px;
        border: 1px solid #2a2a2a;
        overflow: hidden;
      }
      .task-card:hover {
        border-color: #333;
      }

      .task-card-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 12px;
        cursor: pointer;
        user-select: none;
      }

      .task-checkbox {
        width: 16px;
        height: 16px;
        cursor: pointer;
        accent-color: #3b82f6;
        flex-shrink: 0;
      }

      .note-type-badge {
        font-size: 10px;
        padding: 2px 6px;
        border-radius: 4px;
        text-transform: uppercase;
        font-weight: 600;
        flex-shrink: 0;
      }
      .badge-task {
        background: #1e3a5f;
        color: #60a5fa;
      }
      .badge-note {
        background: #1a2e1a;
        color: #86efac;
      }
      .badge-summary {
        background: #2e1a2e;
        color: #c084fc;
      }
      .badge-review {
        background: #3d2e0a;
        color: #f59e0b;
      }

      .task-title {
        font-size: 13px;
        font-weight: 500;
        color: #fafafa;
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .task-title.completed {
        text-decoration: line-through;
        color: #9e9e9e;
      }

      .reuse-badge {
        font-size: 13px;
        flex-shrink: 0;
        cursor: default;
      }
      .score-badge {
        font-size: 11px;
        font-weight: 600;
        padding: 2px 8px;
        border-radius: 10px;
        flex-shrink: 0;
      }
      .score-high {
        background: rgba(34, 197, 94, 0.15);
        color: #22c55e;
      }
      .score-medium {
        background: rgba(234, 179, 8, 0.15);
        color: #eab308;
      }
      .score-low {
        background: rgba(239, 68, 68, 0.15);
        color: #ef4444;
      }

      .expand-icon {
        width: 16px;
        height: 16px;
        color: #9e9e9e;
        flex-shrink: 0;
        transition: transform 0.2s;
      }
      .expand-icon.expanded {
        transform: rotate(90deg);
      }

      .delete-btn {
        background: none;
        border: none;
        color: #707070;
        cursor: pointer;
        padding: 2px;
        flex-shrink: 0;
      }
      .delete-btn:hover {
        color: #ef4444;
      }

      /* ── Lifecycle Stepper ── */
      .lifecycle-stepper {
        display: flex;
        align-items: center;
        gap: 4px;
        padding: 10px 12px;
        border-top: 1px solid #242424;
        font-size: 10px;
        color: #707070;
      }
      .step-marker {
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .step-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #2a2a2a;
        flex-shrink: 0;
      }
      .step-dot.active {
        background: #3b82f6;
      }
      .step-dot.done {
        background: #22c55e;
      }
      .step-label {
        white-space: nowrap;
      }
      .step-label.active {
        color: #3b82f6;
        font-weight: 600;
      }
      .step-label.done {
        color: #22c55e;
      }
      .step-line {
        width: 12px;
        height: 1px;
        background: #2a2a2a;
        flex-shrink: 0;
      }
      .step-line.done {
        background: #22c55e;
      }

      /* ── Expanded Body ── */
      .task-card-body {
        padding: 0 12px 12px;
      }

      .task-description {
        padding: 10px 0;
        word-break: break-word;
      }

      .expected-outcome {
        font-size: 12px;
        color: #a1a1a1;
        line-height: 1.5;
        padding: 8px;
        background: #0d0d0d;
        border-radius: 6px;
        margin-bottom: 10px;
      }
      .expected-outcome-label {
        font-size: 11px;
        font-weight: 600;
        color: #9e9e9e;
        margin-bottom: 4px;
        text-transform: uppercase;
      }

      .task-meta {
        font-size: 10px;
        color: #707070;
        display: flex;
        gap: 8px;
        margin-bottom: 10px;
      }

      /* ── Sub-tasks ── */
      .subtasks-section {
        margin-top: 8px;
      }
      .subtasks-label {
        font-size: 11px;
        font-weight: 600;
        color: #9e9e9e;
        margin-bottom: 6px;
        text-transform: uppercase;
      }

      .subtask-item {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        padding: 8px;
        background: #0d0d0d;
        border-radius: 6px;
        margin-bottom: 4px;
        cursor: pointer;
      }
      .subtask-item:hover {
        background: #141414;
      }

      .subtask-step-num {
        font-size: 11px;
        font-weight: 600;
        color: #3b82f6;
        background: rgba(59, 130, 246, 0.1);
        padding: 1px 6px;
        border-radius: 4px;
        flex-shrink: 0;
      }

      .subtask-check {
        width: 14px;
        height: 14px;
        color: #22c55e;
        flex-shrink: 0;
        margin-top: 1px;
      }

      .subtask-title {
        font-size: 12px;
        color: #d4d4d4;
        flex: 1;
      }

      .subtask-expand-icon {
        width: 12px;
        height: 12px;
        color: #707070;
        flex-shrink: 0;
        transition: transform 0.2s;
      }
      .subtask-expand-icon.expanded {
        transform: rotate(90deg);
      }

      .subtask-content {
        padding: 8px 8px 8px 32px;
        word-break: break-word;
        max-height: 300px;
        overflow-y: auto;
      }

      /* ── Report Section ── */
      .report-section {
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid #242424;
      }
      .report-label {
        font-size: 11px;
        font-weight: 600;
        color: #9e9e9e;
        margin-bottom: 6px;
        text-transform: uppercase;
      }
      .report-textarea {
        width: 100%;
        background: #0d0d0d;
        border: 1px solid #2a2a2a;
        border-radius: 6px;
        padding: 8px 12px;
        color: #fafafa;
        font-size: 12px;
        font-family: inherit;
        resize: vertical;
        min-height: 60px;
        box-sizing: border-box;
      }
      .report-textarea:focus {
        outline: none;
        border-color: #3b82f6;
      }
      .report-textarea::placeholder {
        color: #707070;
      }

      .report-actions {
        display: flex;
        gap: 8px;
        margin-top: 8px;
        justify-content: flex-end;
      }

      .existing-report {
        padding: 8px;
        background: #0d0d0d;
        border-radius: 6px;
      }

      /* ── Score Display ── */
      .score-section {
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid #242424;
      }
      .score-bar-container {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 8px;
      }
      .score-bar-bg {
        flex: 1;
        height: 8px;
        background: #242424;
        border-radius: 4px;
        overflow: hidden;
      }
      .score-bar-fill {
        height: 100%;
        border-radius: 4px;
        transition: width 0.3s;
      }
      .score-bar-fill.high {
        background: #22c55e;
      }
      .score-bar-fill.medium {
        background: #eab308;
      }
      .score-bar-fill.low {
        background: #ef4444;
      }

      .score-number {
        font-size: 18px;
        font-weight: 700;
        flex-shrink: 0;
      }
      .score-number.high {
        color: #22c55e;
      }
      .score-number.medium {
        color: #eab308;
      }
      .score-number.low {
        color: #ef4444;
      }

      .score-feedback {
        padding: 8px;
        background: #0d0d0d;
        border-radius: 6px;
      }

      /* ── Buttons ── */
      .btn-primary {
        background: #3b82f6;
        color: #fafafa;
        border: none;
        border-radius: 6px;
        padding: 6px 16px;
        font-size: 12px;
        cursor: pointer;
      }
      .btn-primary:hover {
        background: #2563eb;
      }
      .btn-primary:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .btn-ai-fill {
        background: none;
        color: #8b5cf6;
        border: 1px solid #8b5cf633;
        border-radius: 6px;
        padding: 6px 16px;
        font-size: 12px;
        cursor: pointer;
      }
      .btn-ai-fill:hover {
        background: #8b5cf620;
        border-color: #8b5cf6;
      }
      .btn-ai-fill:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .btn-secondary {
        background: none;
        color: #a1a1a1;
        border: 1px solid #2a2a2a;
        border-radius: 6px;
        padding: 6px 16px;
        font-size: 12px;
        cursor: pointer;
      }
      .btn-secondary:hover {
        color: #fafafa;
        border-color: #707070;
      }
      .btn-score {
        background: rgba(234, 179, 8, 0.1);
        color: #eab308;
        border: 1px solid rgba(234, 179, 8, 0.3);
        border-radius: 6px;
        padding: 6px 16px;
        font-size: 12px;
        cursor: pointer;
      }
      .btn-score:hover {
        background: rgba(234, 179, 8, 0.2);
      }
      .btn-score:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .view-in-chat-btn {
        background: none;
        border: none;
        color: #3b82f6;
        cursor: pointer;
        font-size: 10px;
        padding: 0;
      }
      .view-in-chat-btn:hover {
        text-decoration: underline;
      }

      .empty-notes {
        text-align: center;
        padding: 32px 16px;
      }
      .empty-notes p {
        font-size: 13px;
        color: #9e9e9e;
      }

      .add-note-section {
        border-top: 1px solid #2a2a2a;
        padding: 12px 16px;
      }
      .add-note-form {
        display: flex;
        flex-direction: column;
        gap: 8px;
      }
      .note-input {
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 6px;
        padding: 8px 12px;
        color: #fafafa;
        font-size: 13px;
        font-family: inherit;
      }
      .note-input:focus {
        outline: none;
        border-color: #3b82f6;
      }
      .note-input::placeholder {
        color: #707070;
      }
      .note-textarea {
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 6px;
        padding: 8px 12px;
        color: #fafafa;
        font-size: 13px;
        font-family: inherit;
        resize: vertical;
        min-height: 60px;
      }
      .note-textarea:focus {
        outline: none;
        border-color: #3b82f6;
      }
      .note-textarea::placeholder {
        color: #707070;
      }
      .form-actions {
        display: flex;
        gap: 8px;
        justify-content: flex-end;
      }

      .loading-spinner {
        text-align: center;
        padding: 24px;
        color: #9e9e9e;
        font-size: 13px;
      }

      .run-agents-bar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 16px;
        background: #1a1a1a;
        border-bottom: 1px solid #2a2a2a;
      }
      .run-agents-bar span {
        font-size: 12px;
        color: #a1a1a1;
      }
      .run-agents-actions {
        display: flex;
        gap: 8px;
        align-items: center;
      }
      .run-agents-btn {
        background: #3b82f6;
        color: #fafafa;
        border: none;
        border-radius: 6px;
        padding: 6px 16px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
      }
      .run-agents-btn:hover {
        background: #2563eb;
      }
      .run-agents-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .select-link {
        background: none;
        border: none;
        color: #3b82f6;
        cursor: pointer;
        font-size: 11px;
        padding: 0;
      }
      .select-link:hover {
        text-decoration: underline;
      }

      .executing-bar {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 16px;
        background: #1a1a1a;
        border-bottom: 1px solid #2a2a2a;
        font-size: 12px;
        color: #60a5fa;
      }
      .executing-spinner {
        width: 14px;
        height: 14px;
        border: 2px solid #2a2a2a;
        border-top-color: #3b82f6;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        flex-shrink: 0;
      }
      .scoring-spinner {
        display: inline-block;
        width: 12px;
        height: 12px;
        border: 2px solid #2a2a2a;
        border-top-color: #eab308;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        margin-right: 6px;
        vertical-align: middle;
      }
      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }

      /* ── Comments Section ── */
      .comments-section {
        margin-top: 12px;
        padding-top: 12px;
        border-top: 1px solid #242424;
      }
      .comments-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        cursor: pointer;
        margin-bottom: 8px;
      }
      .comments-label {
        font-size: 11px;
        font-weight: 600;
        color: #9e9e9e;
        text-transform: uppercase;
      }
      .comments-toggle {
        font-size: 10px;
        color: #707070;
        background: none;
        border: none;
        cursor: pointer;
      }
      .comments-toggle:hover {
        color: #a1a1a1;
      }
      .comment-item {
        padding: 8px;
        background: #0d0d0d;
        border-radius: 6px;
        margin-bottom: 4px;
      }
      .comment-meta {
        display: flex;
        align-items: center;
        gap: 6px;
        margin-bottom: 4px;
      }
      .comment-author {
        font-size: 11px;
        font-weight: 600;
        color: #d4d4d4;
      }
      .comment-role {
        font-size: 9px;
        padding: 1px 4px;
        border-radius: 3px;
        background: rgba(59, 130, 246, 0.1);
        color: #60a5fa;
      }
      .comment-time {
        font-size: 10px;
        color: #707070;
        margin-left: auto;
      }
      .comment-edited {
        font-size: 10px;
        color: #707070;
        font-style: italic;
      }
      .comment-body {
        font-size: 12px;
        color: #a1a1a1;
        line-height: 1.5;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .comment-actions {
        display: flex;
        gap: 8px;
        margin-top: 4px;
      }
      .comment-action-btn {
        background: none;
        border: none;
        font-size: 10px;
        color: #707070;
        cursor: pointer;
        padding: 0;
      }
      .comment-action-btn:hover {
        color: #a1a1a1;
      }
      .comment-action-btn.danger:hover {
        color: #ef4444;
      }
      .comment-edit-textarea {
        width: 100%;
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 4px;
        padding: 6px 8px;
        color: #fafafa;
        font-size: 12px;
        font-family: inherit;
        resize: vertical;
        min-height: 40px;
        box-sizing: border-box;
      }
      .comment-edit-textarea:focus {
        outline: none;
        border-color: #3b82f6;
      }
      .comment-edit-actions {
        display: flex;
        gap: 6px;
        margin-top: 4px;
        justify-content: flex-end;
      }
      .comment-input-row {
        display: flex;
        gap: 6px;
        margin-top: 8px;
      }
      .comment-input {
        flex: 1;
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 6px;
        padding: 6px 10px;
        color: #fafafa;
        font-size: 12px;
        font-family: inherit;
      }
      .comment-input:focus {
        outline: none;
        border-color: #3b82f6;
      }
      .comment-input::placeholder {
        color: #707070;
      }
      .comment-send-btn {
        background: #3b82f6;
        color: #fafafa;
        border: none;
        border-radius: 6px;
        padding: 6px 12px;
        font-size: 11px;
        cursor: pointer;
        flex-shrink: 0;
      }
      .comment-send-btn:hover {
        background: #2563eb;
      }
      .comment-send-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .load-more-btn {
        display: block;
        width: 100%;
        background: none;
        border: none;
        color: #3b82f6;
        font-size: 11px;
        cursor: pointer;
        padding: 6px 0;
        text-align: center;
      }
      .load-more-btn:hover {
        text-decoration: underline;
      }

      .folder-header {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 14px 16px;
        border-bottom: 1px solid #2a2a2a;
        background: #111;
      }
      .folder-title {
        font-size: 15px;
        font-weight: 600;
        color: #fafafa;
        flex: 1;
      }
      .folder-count {
        font-size: 12px;
        color: #9e9e9e;
      }

      .execute-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(59, 130, 246, 0.1);
        color: #60a5fa;
        border: 1px solid rgba(59, 130, 246, 0.3);
        border-radius: 6px;
        padding: 5px 12px;
        font-size: 11px;
        cursor: pointer;
        margin-top: 8px;
      }
      .execute-btn:hover {
        background: rgba(59, 130, 246, 0.2);
        border-color: #3b82f6;
      }
      .execute-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .execute-spinner {
        display: inline-block;
        width: 12px;
        height: 12px;
        border: 2px solid rgba(59, 130, 246, 0.3);
        border-top-color: #60a5fa;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }

      /* ── Execution Progress Area ── */
      .execution-progress {
        margin-top: 10px;
        padding: 10px 12px;
        background: #111;
        border: 1px solid rgba(34, 197, 94, 0.2);
        border-radius: 6px;
      }
      .execution-progress-header {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 11px;
        font-weight: 600;
        color: #4ade80;
        margin-bottom: 8px;
      }
      .execution-progress-spinner {
        display: inline-block;
        width: 10px;
        height: 10px;
        border: 2px solid rgba(34, 197, 94, 0.3);
        border-top-color: #4ade80;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
      .execution-progress-content {
        max-height: 200px;
        overflow-y: auto;
        word-break: break-word;
        padding: 6px 8px;
        background: #0d0d0d;
        border-radius: 4px;
      }
      .execution-complete-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        background: rgba(34, 197, 94, 0.1);
        border: 1px solid rgba(34, 197, 94, 0.3);
        border-radius: 4px;
        font-size: 11px;
        color: #4ade80;
        margin-top: 8px;
      }

      /* ── Submit Result Button ── */
      .submit-result-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(234, 179, 8, 0.1);
        color: #eab308;
        border: 1px solid rgba(234, 179, 8, 0.3);
        border-radius: 6px;
        padding: 5px 12px;
        font-size: 11px;
        cursor: pointer;
        margin-top: 8px;
      }
      .submit-result-btn:hover {
        background: rgba(234, 179, 8, 0.2);
        border-color: #eab308;
      }
      .submit-result-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .submit-result-spinner {
        display: inline-block;
        width: 12px;
        height: 12px;
        border: 2px solid rgba(234, 179, 8, 0.3);
        border-top-color: #eab308;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
      .result-progress {
        margin-top: 10px;
        padding: 10px 12px;
        background: #111;
        border: 1px solid rgba(234, 179, 8, 0.2);
        border-radius: 6px;
      }
      .result-progress-header {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 11px;
        font-weight: 600;
        color: #eab308;
        margin-bottom: 8px;
      }
      .result-progress-content {
        max-height: 200px;
        overflow-y: auto;
        word-break: break-word;
        padding: 6px 8px;
        background: #0d0d0d;
        border-radius: 4px;
      }

      /* ── Chat markdown rendering for task/note panels ── */
      .ai-content {
        font-size: 12px;
        line-height: 1.65;
        color: #e0e0e0;
        word-break: break-word;
      }
      .ai-content > :first-child {
        margin-top: 0 !important;
      }
      .ai-content > :last-child {
        margin-bottom: 0 !important;
      }

      .ai-content h1 {
        font-size: 1.35em;
        font-weight: 700;
        color: #fafafa;
        margin: 16px 0 6px;
        padding-bottom: 4px;
        border-bottom: 1px solid #2a2a2a;
      }
      .ai-content h2 {
        font-size: 1.2em;
        font-weight: 600;
        color: #fafafa;
        margin: 14px 0 5px;
        padding-bottom: 3px;
        border-bottom: 1px solid rgba(42, 42, 42, 0.5);
      }
      .ai-content h3 {
        font-size: 1.1em;
        font-weight: 600;
        color: #f0f0f0;
        margin: 12px 0 4px;
      }
      .ai-content h4,
      .ai-content h5,
      .ai-content h6 {
        font-size: 1em;
        font-weight: 600;
        color: #e5e5e5;
        margin: 10px 0 3px;
      }

      .ai-content p {
        margin: 8px 0;
        line-height: 1.65;
      }
      .ai-content strong {
        color: #fafafa;
        font-weight: 600;
      }
      .ai-content em {
        color: #d4d4d4;
        font-style: italic;
      }

      .ai-content ul,
      .ai-content ol {
        margin: 6px 0;
        padding-left: 1.5em;
        list-style-position: outside;
      }
      .ai-content ul {
        list-style-type: disc;
      }
      .ai-content ol {
        list-style-type: decimal;
      }
      .ai-content li {
        margin: 3px 0;
        line-height: 1.65;
        color: #e0e0e0;
      }
      .ai-content li::marker {
        color: #9e9e9e;
      }
      .ai-content li > ul,
      .ai-content li > ol {
        margin: 3px 0;
      }
      .ai-content li > p {
        margin: 3px 0;
      }
      .ai-content ul ul {
        list-style-type: circle;
      }
      .ai-content ul ul ul {
        list-style-type: square;
      }

      .ai-content table {
        width: 100%;
        border-collapse: collapse;
        margin: 10px 0;
        font-size: 0.9em;
        border-radius: 6px;
        overflow: hidden;
        border: 1px solid #2a2a2a;
      }
      .ai-content thead th {
        background: #1a1a1a;
        color: #fafafa;
        font-weight: 600;
        text-align: left;
        padding: 7px 10px;
        border-bottom: 2px solid #333;
      }
      .ai-content tbody td {
        padding: 7px 10px;
        border-bottom: 1px solid #1e1e1e;
        color: #d4d4d4;
      }
      .ai-content tbody tr:hover {
        background: rgba(59, 130, 246, 0.04);
      }
      .ai-content tbody tr:last-child td {
        border-bottom: none;
      }

      .ai-content code {
        background: rgba(255, 255, 255, 0.06);
        color: #e5e5e5;
        padding: 0.1em 0.35em;
        border-radius: 3px;
        font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
        font-size: 0.875em;
      }
      .ai-content pre {
        background: #111;
        border: 1px solid #2a2a2a;
        border-radius: 6px;
        padding: 10px 14px;
        overflow-x: auto;
        margin: 10px 0;
      }
      .ai-content pre code {
        background: none;
        padding: 0;
        border-radius: 0;
        font-size: 0.85em;
        line-height: 1.5;
      }

      .ai-content blockquote {
        border-left: 3px solid #3b82f6;
        margin: 10px 0;
        padding: 6px 12px;
        color: #b0b0b0;
        background: rgba(59, 130, 246, 0.04);
        border-radius: 0 6px 6px 0;
      }
      .ai-content blockquote p {
        margin: 3px 0;
      }

      .ai-content a {
        color: #60a5fa;
        text-decoration: none;
      }
      .ai-content a:hover {
        color: #93c5fd;
        text-decoration: underline;
      }

      .ai-content hr {
        border: none;
        border-top: 1px solid #2a2a2a;
        margin: 14px 0;
      }
      .ai-content del {
        color: #9e9e9e;
        text-decoration: line-through;
      }
    `,
  ],
  template: `
    @if (isGeneratingPlan()) {
      <div class="executing-bar">
        <span class="executing-spinner"></span>
        Generisanje plana...
      </div>
    } @else if (isExecuting()) {
      <div class="executing-bar">
        <span class="executing-spinner"></span>
        Agenti rade...
      </div>
    }

    @if (folderName()) {
      <div class="folder-header">
        <svg
          style="width: 18px; height: 18px; color: #3B82F6;"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"
          />
        </svg>
        <span class="folder-title">{{ folderName() }}</span>
        <span class="folder-count"
          >{{ notes().length }} zadatak{{ notes().length !== 1 ? 'a' : '' }}</span
        >
      </div>
    }

    <!-- Filter bar -->
    <div class="filter-bar" role="tablist" aria-label="Filter zadataka">
      <button
        class="filter-btn"
        [class.active]="activeFilter() === 'all'"
        (click)="activeFilter.set('all'); updateFilteredNotes()"
        role="tab"
        [attr.aria-selected]="activeFilter() === 'all'"
      >
        Sve
      </button>
      <button
        class="filter-btn"
        [class.active]="activeFilter() === 'TASK'"
        (click)="activeFilter.set('TASK'); updateFilteredNotes()"
        role="tab"
        [attr.aria-selected]="activeFilter() === 'TASK'"
      >
        Zadaci
      </button>
      <button
        class="filter-btn"
        [class.active]="activeFilter() === 'READY_FOR_REVIEW'"
        (click)="activeFilter.set('READY_FOR_REVIEW'); updateFilteredNotes()"
        role="tab"
        [attr.aria-selected]="activeFilter() === 'READY_FOR_REVIEW'"
      >
        Pregled
      </button>
      <button
        class="filter-btn"
        [class.active]="activeFilter() === 'NOTE'"
        (click)="activeFilter.set('NOTE'); updateFilteredNotes()"
        role="tab"
        [attr.aria-selected]="activeFilter() === 'NOTE'"
      >
        Beleške
      </button>
    </div>

    @if (selectedTaskIds().size > 0) {
      <div class="run-agents-bar">
        <span
          >{{ selectedTaskIds().size }} zadatak{{
            selectedTaskIds().size > 1 ? 'a' : ''
          }}
          izabrano</span
        >
        <div class="run-agents-actions">
          <button class="select-link" (click)="deselectAll()">Poništi izbor</button>
          <button
            class="run-agents-btn"
            [disabled]="isExecuting() || isGeneratingPlan()"
            (click)="onRunAgents()"
          >
            Pokreni agente
          </button>
        </div>
      </div>
    } @else if (pendingTaskCount() > 0) {
      <div class="run-agents-bar">
        <span
          >{{ pendingTaskCount() }} zadatak{{ pendingTaskCount() > 1 ? 'a' : '' }} na čekanju</span
        >
        <button class="select-link" (click)="selectAllPending()">Izaberi sve</button>
      </div>
    }

    <div class="notes-container">
      @if (loading()) {
        <div class="loading-spinner">Učitavanje beleški...</div>
      } @else if (filteredNotes().length === 0) {
        <div class="empty-notes">
          <p>Još nema beleški</p>
          <p style="font-size: 11px; margin-top: 4px;">
            Beleške i zadaci će se pojaviti ovde tokom razgovora
          </p>
        </div>
      } @else {
        @for (note of filteredNotes(); track note.id) {
          <div class="task-card">
            <!-- Header -->
            <div class="task-card-header" (click)="toggleExpand(note.id)">
              @if (note.noteType === 'TASK' && note.status !== 'COMPLETED') {
                <input
                  type="checkbox"
                  class="task-checkbox"
                  [checked]="selectedTaskIds().has(note.id)"
                  (change)="toggleSelection(note.id); $event.stopPropagation()"
                  (click)="$event.stopPropagation()"
                  title="Izaberi za agente"
                />
              }
              <span
                class="note-type-badge"
                [class.badge-task]="note.noteType === 'TASK'"
                [class.badge-note]="note.noteType === 'NOTE'"
                [class.badge-summary]="note.noteType === 'SUMMARY'"
                [class.badge-review]="note.status === 'READY_FOR_REVIEW'"
                >{{ note.status === 'READY_FOR_REVIEW' ? 'REVIEW' : note.noteType }}</span
              >
              <span class="task-title" [class.completed]="note.status === 'COMPLETED'">
                {{ note.title }}
              </span>
              @if (note.reusedFromNoteId) {
                <span class="reuse-badge" title="Korišćen postojeći rezultat">♻️</span>
              }
              @if (note.aiScore !== null && note.aiScore !== undefined) {
                <span
                  class="score-badge"
                  [class.score-high]="note.aiScore >= 80"
                  [class.score-medium]="note.aiScore >= 50 && note.aiScore < 80"
                  [class.score-low]="note.aiScore < 50"
                  >{{ note.aiScore }}/100</span
                >
              }
              <svg
                class="expand-icon"
                [class.expanded]="expandedNotes().has(note.id)"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 5l7 7-7 7"
                />
              </svg>
              <button
                class="delete-btn"
                [disabled]="deletingInProgress().has(note.id)"
                (click)="deleteNote(note.id); $event.stopPropagation()"
                title="Obriši"
              >
                @if (deletingInProgress().has(note.id)) {
                  <span
                    class="scoring-spinner"
                    style="width:12px;height:12px;border-top-color:#EF4444;"
                  ></span>
                } @else {
                  <svg
                    style="width: 14px; height: 14px;"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                }
              </button>
            </div>

            <!-- Expanded body -->
            @if (expandedNotes().has(note.id)) {
              @if (note.noteType === 'TASK') {
                <div class="lifecycle-stepper">
                  <span class="step-marker">
                    <span class="step-dot" [class.done]="true"></span>
                    <span class="step-label done">Kreiran</span>
                  </span>
                  <span
                    class="step-line"
                    [class.done]="note.status === 'COMPLETED' || executingTaskId() === note.id"
                  ></span>
                  <span class="step-marker">
                    <span
                      class="step-dot"
                      [class.active]="executingTaskId() === note.id"
                      [class.done]="note.status === 'COMPLETED'"
                    ></span>
                    <span
                      class="step-label"
                      [class.active]="executingTaskId() === note.id"
                      [class.done]="note.status === 'COMPLETED'"
                      >Izvršava se</span
                    >
                  </span>
                  <span
                    class="step-line"
                    [class.done]="note.userReport !== undefined && note.userReport !== null"
                  ></span>
                  <span class="step-marker">
                    <span
                      class="step-dot"
                      [class.active]="note.status === 'COMPLETED' && !note.aiScore"
                      [class.done]="note.aiScore !== null && note.aiScore !== undefined"
                    ></span>
                    <span
                      class="step-label"
                      [class.active]="note.status === 'COMPLETED' && !note.aiScore"
                      [class.done]="note.aiScore !== null && note.aiScore !== undefined"
                      >Pregled</span
                    >
                  </span>
                  <span
                    class="step-line"
                    [class.done]="note.aiScore !== null && note.aiScore !== undefined"
                  ></span>
                  <span class="step-marker">
                    <span
                      class="step-dot"
                      [class.done]="note.aiScore !== null && note.aiScore !== undefined"
                    ></span>
                    <span
                      class="step-label"
                      [class.done]="note.aiScore !== null && note.aiScore !== undefined"
                      >Ocenjen</span
                    >
                  </span>
                </div>
              }
              <div class="task-card-body">
                @if (note.content) {
                  <div
                    class="task-description ai-content"
                    [innerHTML]="note.content | markdown"
                  ></div>
                }

                @if (note.expectedOutcome) {
                  <div class="expected-outcome">
                    <div class="expected-outcome-label">Očekivani ishod</div>
                    <div class="ai-content" [innerHTML]="note.expectedOutcome | markdown"></div>
                  </div>
                }

                @if (note.noteType === 'TASK' && note.status !== 'COMPLETED') {
                  <button
                    class="execute-btn"
                    [disabled]="executingTaskId() === note.id || isExecuting()"
                    (click)="onExecuteTask(note.id)"
                  >
                    @if (executingTaskId() === note.id) {
                      <span class="execute-spinner"></span> AI radi...
                    } @else {
                      <svg
                        style="width:12px;height:12px;"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
                        />
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      Izvrši
                    }
                  </button>
                }

                <!-- Execution Progress (shown while AI is executing this task) -->
                @if (executingTaskId() === note.id && taskExecutionContent()) {
                  <div class="execution-progress">
                    <div class="execution-progress-header">
                      <span class="execution-progress-spinner"></span>
                      AI radi na zadatku...
                    </div>
                    <div
                      class="execution-progress-content ai-content"
                      [innerHTML]="taskExecutionContent() | markdown"
                    ></div>
                  </div>
                }

                <!-- Submit Result button (shown after task is COMPLETED, no score yet) -->
                @if (
                  note.noteType === 'TASK' && note.status === 'COMPLETED' && note.aiScore === null
                ) {
                  <button
                    class="submit-result-btn"
                    [disabled]="submittingResultId() === note.id"
                    (click)="onSubmitTaskResult(note.id)"
                  >
                    @if (submittingResultId() === note.id) {
                      <span class="submit-result-spinner"></span> Ocenjujem...
                    } @else {
                      <svg
                        style="width:12px;height:12px;"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                        />
                      </svg>
                      Potvrdi rezultat
                    }
                  </button>
                }

                <!-- Result streaming progress -->
                @if (submittingResultId() === note.id && taskResultContent()) {
                  <div class="result-progress">
                    <div class="result-progress-header">
                      <span class="submit-result-spinner"></span>
                      Optimizujem i ocenjujem...
                    </div>
                    <div
                      class="result-progress-content ai-content"
                      [innerHTML]="taskResultContent() | markdown"
                    ></div>
                  </div>
                }

                <div class="task-meta">
                  <span>{{ note.source }}</span>
                  <span>{{ formatDate(note.createdAt) }}</span>
                  @if (note.messageId) {
                    <button class="view-in-chat-btn" (click)="emitViewMessage(note)">
                      Pogledaj u razgovoru
                    </button>
                  }
                </div>

                <!-- Sub-tasks -->
                @if (note.children && note.children.length > 0) {
                  <div class="subtasks-section">
                    <div class="subtasks-label">
                      Rezultat workflow-a ({{ note.children.length }} koraka)
                    </div>
                    @for (child of note.children; track child.id) {
                      <div>
                        <div class="subtask-item" (click)="toggleSubtaskExpand(child.id)">
                          @if (child.workflowStepNumber !== null) {
                            <span class="subtask-step-num">{{ child.workflowStepNumber }}</span>
                          }
                          @if (child.status === 'COMPLETED') {
                            <svg class="subtask-check" fill="currentColor" viewBox="0 0 20 20">
                              <path
                                fill-rule="evenodd"
                                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                                clip-rule="evenodd"
                              />
                            </svg>
                          }
                          <span class="subtask-title">{{ child.title }}</span>
                          <svg
                            class="subtask-expand-icon"
                            [class.expanded]="expandedSubtasks().has(child.id)"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M9 5l7 7-7 7"
                            />
                          </svg>
                        </div>
                        @if (expandedSubtasks().has(child.id)) {
                          <div
                            class="subtask-content ai-content"
                            [innerHTML]="child.content | markdown"
                          ></div>

                          <!-- Sub-task report -->
                          @if (child.status === 'COMPLETED' && !child.userReport) {
                            <div class="report-section" style="padding-left: 32px;">
                              <div class="report-label">Vaš izveštaj</div>
                              <textarea
                                class="report-textarea"
                                placeholder="Opišite šta ste uradili, šta ste naučili, ostvarene rezultate..."
                                [value]="getReportText(child.id)"
                                (input)="setReportText(child.id, asTextareaValue($event))"
                              ></textarea>
                              <div class="report-actions">
                                <button
                                  class="btn-ai-fill"
                                  [disabled]="generatingReportId() === child.id"
                                  (click)="onGenerateReport(child.id)"
                                >
                                  {{
                                    generatingReportId() === child.id
                                      ? 'AI generiše...'
                                      : 'AI popuni'
                                  }}
                                </button>
                                <button
                                  class="btn-primary"
                                  [disabled]="
                                    !getReportText(child.id) || submittingInProgress().has(child.id)
                                  "
                                  (click)="submitReport(child.id)"
                                >
                                  {{
                                    submittingInProgress().has(child.id)
                                      ? 'Šaljem...'
                                      : 'Pošalji izveštaj'
                                  }}
                                </button>
                              </div>
                            </div>
                          }
                          @if (child.userReport) {
                            <div class="report-section" style="padding-left: 32px;">
                              <div class="report-label">Vaš izveštaj</div>
                              <div
                                class="existing-report ai-content"
                                [innerHTML]="child.userReport | markdown"
                              ></div>
                              @if (child.aiScore !== null && child.aiScore !== undefined) {
                                <div class="score-section" style="border: none; padding-top: 8px;">
                                  <div class="score-bar-container">
                                    <div class="score-bar-bg">
                                      <div
                                        class="score-bar-fill"
                                        [class.high]="child.aiScore >= 80"
                                        [class.medium]="child.aiScore >= 50 && child.aiScore < 80"
                                        [class.low]="child.aiScore < 50"
                                        [style.width.%]="child.aiScore"
                                      ></div>
                                    </div>
                                    <span
                                      class="score-number"
                                      [class.high]="child.aiScore >= 80"
                                      [class.medium]="child.aiScore >= 50 && child.aiScore < 80"
                                      [class.low]="child.aiScore < 50"
                                      >{{ child.aiScore }}</span
                                    >
                                  </div>
                                  @if (child.aiFeedback) {
                                    <div
                                      class="score-feedback ai-content"
                                      [innerHTML]="child.aiFeedback | markdown"
                                    ></div>
                                  }
                                </div>
                              } @else {
                                <div class="report-actions">
                                  <button
                                    class="btn-score"
                                    [disabled]="scoringInProgress().has(child.id)"
                                    (click)="scoreReport(child.id)"
                                  >
                                    @if (scoringInProgress().has(child.id)) {
                                      <span class="scoring-spinner"></span> Ocenjujem...
                                    } @else {
                                      Dobij AI ocenu
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
                    <div class="report-label">Vaš izveštaj</div>
                    <textarea
                      class="report-textarea"
                      placeholder="Opišite šta ste uradili, šta ste naučili, ostvarene rezultate..."
                      [value]="getReportText(note.id)"
                      (input)="setReportText(note.id, asTextareaValue($event))"
                    ></textarea>
                    <div class="report-actions">
                      <button
                        class="btn-ai-fill"
                        [disabled]="generatingReportId() === note.id"
                        (click)="onGenerateReport(note.id)"
                      >
                        {{ generatingReportId() === note.id ? 'AI generiše...' : 'AI popuni' }}
                      </button>
                      <button
                        class="btn-primary"
                        [disabled]="!getReportText(note.id) || submittingInProgress().has(note.id)"
                        (click)="submitReport(note.id)"
                      >
                        {{ submittingInProgress().has(note.id) ? 'Šaljem...' : 'Pošalji izveštaj' }}
                      </button>
                    </div>
                  </div>
                }

                @if (note.userReport) {
                  <div class="report-section">
                    <div class="report-label">Vaš izveštaj</div>
                    <div
                      class="existing-report ai-content"
                      [innerHTML]="note.userReport | markdown"
                    ></div>

                    @if (note.aiScore !== null && note.aiScore !== undefined) {
                      <div class="score-section">
                        <div class="score-bar-container">
                          <div class="score-bar-bg">
                            <div
                              class="score-bar-fill"
                              [class.high]="note.aiScore >= 80"
                              [class.medium]="note.aiScore >= 50 && note.aiScore < 80"
                              [class.low]="note.aiScore < 50"
                              [style.width.%]="note.aiScore"
                            ></div>
                          </div>
                          <span
                            class="score-number"
                            [class.high]="note.aiScore >= 80"
                            [class.medium]="note.aiScore >= 50 && note.aiScore < 80"
                            [class.low]="note.aiScore < 50"
                            >{{ note.aiScore }}</span
                          >
                        </div>
                        @if (note.aiFeedback) {
                          <div
                            class="score-feedback ai-content"
                            [innerHTML]="note.aiFeedback | markdown"
                          ></div>
                        }
                      </div>
                    } @else {
                      <div class="report-actions">
                        <button
                          class="btn-score"
                          [disabled]="scoringInProgress().has(note.id)"
                          (click)="scoreReport(note.id)"
                        >
                          @if (scoringInProgress().has(note.id)) {
                            <span class="scoring-spinner"></span> Ocenjujem...
                          } @else {
                            Dobij AI ocenu
                          }
                        </button>
                      </div>
                    }
                  </div>
                }

                <!-- Comments thread -->
                @if (note.noteType === 'TASK') {
                  <div class="comments-section">
                    <div class="comments-header" (click)="toggleComments(note.id)">
                      <span class="comments-label">
                        Komentari
                        @if (getCommentTotal(note.id) > 0) {
                          ({{ getCommentTotal(note.id) }})
                        }
                      </span>
                      <button class="comments-toggle">
                        {{ commentsExpanded().has(note.id) ? 'Sakrij' : 'Prikaži' }}
                      </button>
                    </div>
                    @if (commentsExpanded().has(note.id)) {
                      @if (loadingComments().has(note.id)) {
                        <div style="font-size: 11px; color: #9e9e9e; padding: 4px 0;">
                          Učitavanje komentara...
                        </div>
                      } @else {
                        @for (comment of getComments(note.id); track comment.id) {
                          <div class="comment-item">
                            <div class="comment-meta">
                              <span class="comment-author">{{ comment.userName }}</span>
                              @if (comment.userRole !== 'MEMBER') {
                                <span class="comment-role">{{ comment.userRole }}</span>
                              }
                              <span class="comment-time">{{ formatDate(comment.createdAt) }}</span>
                              @if (comment.updatedAt !== comment.createdAt) {
                                <span class="comment-edited">(izmenjeno)</span>
                              }
                            </div>
                            @if (editingCommentId() === comment.id) {
                              <textarea
                                class="comment-edit-textarea"
                                [value]="editCommentText()"
                                (input)="editCommentText.set(asTextareaValue($event))"
                              ></textarea>
                              <div class="comment-edit-actions">
                                <button
                                  class="btn-secondary"
                                  style="padding: 3px 10px; font-size: 10px;"
                                  (click)="cancelEditComment()"
                                >
                                  Otkaži
                                </button>
                                <button
                                  class="btn-primary"
                                  style="padding: 3px 10px; font-size: 10px;"
                                  [disabled]="!editCommentText()"
                                  (click)="saveEditComment(note.id)"
                                >
                                  Sačuvaj
                                </button>
                              </div>
                            } @else {
                              <div class="comment-body">{{ comment.content }}</div>
                              <div class="comment-actions">
                                <button
                                  class="comment-action-btn"
                                  (click)="startEditComment(comment)"
                                >
                                  Izmeni
                                </button>
                                <button
                                  class="comment-action-btn danger"
                                  (click)="deleteComment(note.id, comment.id)"
                                >
                                  Obriši
                                </button>
                              </div>
                            }
                          </div>
                        }
                        @if (hasMoreComments(note.id)) {
                          <button class="load-more-btn" (click)="loadMoreComments(note.id)">
                            Učitaj još...
                          </button>
                        }
                      }
                      <div class="comment-input-row">
                        <input
                          class="comment-input"
                          placeholder="Dodaj komentar..."
                          [value]="getCommentInput(note.id)"
                          (input)="setCommentInput(note.id, asInputValue($event))"
                          (keydown.enter)="submitComment(note.id)"
                        />
                        <button
                          class="comment-send-btn"
                          [disabled]="!getCommentInput(note.id) || submittingComment().has(note.id)"
                          (click)="submitComment(note.id)"
                        >
                          Pošalji
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
          <input
            class="note-input"
            placeholder="Naslov"
            [value]="newTitle()"
            (input)="newTitle.set(asInputValue($event))"
          />
          <textarea
            class="note-textarea"
            placeholder="Sadržaj..."
            [value]="newContent()"
            (input)="newContent.set(asTextareaValue($event))"
          ></textarea>
          <div class="form-actions">
            <button class="btn-secondary" (click)="showAddForm.set(false)">Otkaži</button>
            <button
              class="btn-primary"
              [disabled]="!newTitle() || addingNote$()"
              (click)="addNote()"
            >
              {{ addingNote$() ? 'Dodajem...' : 'Dodaj belešku' }}
            </button>
          </div>
        </div>
      } @else {
        <button class="btn-secondary" style="width: 100%;" (click)="showAddForm.set(true)">
          + Dodaj belešku
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
  taskExecutionContent = input<string>('');
  submittingResultId = input<string | null>(null);
  taskResultContent = input<string>('');
  isGeneratingPlan = input(false);
  viewMessage = output<{ conversationId: string; messageId: string }>();
  runAgents = output<string[]>();
  executeTask = output<string>();
  submitTaskResult = output<string>();

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
  readonly generatingReportId = signal<string | null>(null);
  readonly addingNote$ = signal(false);
  readonly togglingStatus = signal<Set<string>>(new Set());

  // Comment state
  readonly commentsExpanded = signal<Set<string>>(new Set());
  readonly commentsByTask = signal<
    Map<string, { comments: CommentItem[]; total: number; page: number }>
  >(new Map());
  readonly commentInputs = signal<Map<string, string>>(new Map());
  readonly loadingComments = signal<Set<string>>(new Set());
  readonly submittingComment = signal<Set<string>>(new Set());
  readonly editingCommentId = signal<string | null>(null);
  readonly editCommentText = signal('');

  // Loading guard to prevent duplicate loads from rapid events
  private isLoadingNotes = false;
  private pendingReload = false;

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
    // Guard: if already loading, schedule a reload after current one finishes
    if (this.isLoadingNotes) {
      this.pendingReload = true;
      return;
    }
    this.isLoadingNotes = true;

    try {
      await this._loadNotesInternal();
    } finally {
      this.isLoadingNotes = false;
      // If a reload was requested while we were loading, do it now
      if (this.pendingReload) {
        this.pendingReload = false;
        this.loadNotes();
      }
    }
  }

  private async _loadNotesInternal(): Promise<void> {
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

    // Single conversation mode — also merge concept-based notes if conceptId available
    const convId = this.conversationId();
    const cId = this.conceptId();

    if (!convId && !cId) {
      this.notes.set([]);
      this.updateFilteredNotes();
      return;
    }

    this.loading.set(true);
    try {
      const [convNotes, conceptNotes] = await Promise.all([
        convId ? this.notesApi.getByConversation(convId) : Promise.resolve([]),
        cId ? this.notesApi.getByConcept(cId).catch(() => []) : Promise.resolve([]),
      ]);
      // Merge and deduplicate by note ID
      const seen = new Set<string>();
      const merged: NoteItem[] = [];
      for (const note of [...convNotes, ...conceptNotes]) {
        if (!seen.has(note.id)) {
          seen.add(note.id);
          merged.push(note);
        }
      }
      this.notes.set(merged);
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
    this.submittingInProgress.update((s) => {
      const n = new Set(s);
      n.add(noteId);
      return n;
    });
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
      this.submittingInProgress.update((s) => {
        const n = new Set(s);
        n.delete(noteId);
        return n;
      });
    }
  }

  async onGenerateReport(noteId: string): Promise<void> {
    if (this.generatingReportId()) return;
    this.generatingReportId.set(noteId);
    try {
      const report = await this.notesApi.generateReport(noteId);
      this.setReportText(noteId, report);
    } catch {
      // ignore — user can still type manually
    } finally {
      this.generatingReportId.set(null);
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
    const newStatus =
      note.status === NoteStatus.COMPLETED ? NoteStatus.PENDING : NoteStatus.COMPLETED;
    this.togglingStatus.update((s) => {
      const n = new Set(s);
      n.add(note.id);
      return n;
    });
    try {
      await this.notesApi.updateStatus(note.id, newStatus);
      this.notes.update((list) =>
        list.map((n) => (n.id === note.id ? { ...n, status: newStatus } : n))
      );
      this.updateFilteredNotes();
    } catch {
      // Revert on error
    } finally {
      this.togglingStatus.update((s) => {
        const n = new Set(s);
        n.delete(note.id);
        return n;
      });
    }
  }

  async deleteNote(noteId: string): Promise<void> {
    if (this.deletingInProgress().has(noteId)) return;
    this.deletingInProgress.update((s) => {
      const n = new Set(s);
      n.add(noteId);
      return n;
    });
    try {
      await this.notesApi.deleteNote(noteId);
      this.notes.update((list) => list.filter((n) => n.id !== noteId));
      this.updateFilteredNotes();
    } catch {
      // ignore
    } finally {
      this.deletingInProgress.update((s) => {
        const n = new Set(s);
        n.delete(noteId);
        return n;
      });
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
    if (minutes < 1) return 'Upravo';
    if (minutes < 60) return `pre ${minutes} min`;
    if (hours < 24) return `pre ${hours}h`;
    if (days < 7) return `pre ${days}d`;
    return date.toLocaleDateString('sr-Latn');
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

  onSubmitTaskResult(noteId: string): void {
    this.submitTaskResult.emit(noteId);
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
            children: n.children.map((c) => (c.id === updated.id ? { ...c, ...updated } : c)),
          };
        }
        return n;
      })
    );
    this.updateFilteredNotes();
  }

  // ── Comment methods ──

  toggleComments(taskId: string): void {
    const expanded = this.commentsExpanded();
    const next = new Set(expanded);
    if (next.has(taskId)) {
      next.delete(taskId);
    } else {
      next.add(taskId);
      // Load comments on first expand if not already loaded
      if (!this.commentsByTask().has(taskId)) {
        this.fetchComments(taskId, 1);
      }
    }
    this.commentsExpanded.set(next);
  }

  getCommentTotal(taskId: string): number {
    return this.commentsByTask().get(taskId)?.total ?? 0;
  }

  getComments(taskId: string): CommentItem[] {
    return this.commentsByTask().get(taskId)?.comments ?? [];
  }

  hasMoreComments(taskId: string): boolean {
    const data = this.commentsByTask().get(taskId);
    if (!data) return false;
    return data.comments.length < data.total;
  }

  getCommentInput(taskId: string): string {
    return this.commentInputs().get(taskId) ?? '';
  }

  setCommentInput(taskId: string, value: string): void {
    this.commentInputs.update((m) => {
      const next = new Map(m);
      next.set(taskId, value);
      return next;
    });
  }

  async fetchComments(taskId: string, page: number): Promise<void> {
    this.loadingComments.update((s) => {
      const n = new Set(s);
      n.add(taskId);
      return n;
    });
    try {
      const result = await this.notesApi.getComments(taskId, page, 50);
      this.commentsByTask.update((m) => {
        const next = new Map(m);
        const existing = next.get(taskId);
        if (existing && page > 1) {
          // Append for "load more"
          next.set(taskId, {
            comments: [...existing.comments, ...result.comments],
            total: result.total,
            page,
          });
        } else {
          next.set(taskId, { comments: result.comments, total: result.total, page });
        }
        return next;
      });
    } catch {
      // ignore
    } finally {
      this.loadingComments.update((s) => {
        const n = new Set(s);
        n.delete(taskId);
        return n;
      });
    }
  }

  loadMoreComments(taskId: string): void {
    const data = this.commentsByTask().get(taskId);
    const nextPage = data ? data.page + 1 : 1;
    this.fetchComments(taskId, nextPage);
  }

  async submitComment(taskId: string): Promise<void> {
    const content = this.getCommentInput(taskId);
    if (!content || this.submittingComment().has(taskId)) return;
    this.submittingComment.update((s) => {
      const n = new Set(s);
      n.add(taskId);
      return n;
    });
    try {
      const comment = await this.notesApi.createComment(taskId, content);
      this.commentsByTask.update((m) => {
        const next = new Map(m);
        const existing = next.get(taskId);
        if (existing) {
          next.set(taskId, {
            comments: [...existing.comments, comment],
            total: existing.total + 1,
            page: existing.page,
          });
        } else {
          next.set(taskId, { comments: [comment], total: 1, page: 1 });
        }
        return next;
      });
      this.setCommentInput(taskId, '');
    } catch {
      // ignore
    } finally {
      this.submittingComment.update((s) => {
        const n = new Set(s);
        n.delete(taskId);
        return n;
      });
    }
  }

  startEditComment(comment: CommentItem): void {
    this.editingCommentId.set(comment.id);
    this.editCommentText.set(comment.content);
  }

  cancelEditComment(): void {
    this.editingCommentId.set(null);
    this.editCommentText.set('');
  }

  async saveEditComment(taskId: string): Promise<void> {
    const commentId = this.editingCommentId();
    const content = this.editCommentText();
    if (!commentId || !content) return;
    try {
      const updated = await this.notesApi.updateComment(commentId, content);
      this.commentsByTask.update((m) => {
        const next = new Map(m);
        const data = next.get(taskId);
        if (data) {
          next.set(taskId, {
            ...data,
            comments: data.comments.map((c) => (c.id === commentId ? { ...c, ...updated } : c)),
          });
        }
        return next;
      });
      this.cancelEditComment();
    } catch {
      // ignore
    }
  }

  async deleteComment(taskId: string, commentId: string): Promise<void> {
    try {
      await this.notesApi.deleteComment(commentId);
      this.commentsByTask.update((m) => {
        const next = new Map(m);
        const data = next.get(taskId);
        if (data) {
          next.set(taskId, {
            ...data,
            comments: data.comments.filter((c) => c.id !== commentId),
            total: data.total - 1,
          });
        }
        return next;
      });
    } catch {
      // ignore
    }
  }
}
