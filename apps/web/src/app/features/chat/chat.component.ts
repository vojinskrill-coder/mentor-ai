import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  OnDestroy,
  AfterViewInit,
  DestroyRef,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { combineLatest, firstValueFrom, take } from 'rxjs';
import { ConversationService } from './services/conversation.service';
import { ChatWebsocketService } from './services/chat-websocket.service';
import { NotesApiService } from './services/notes-api.service';
import { ChatMessageComponent } from './components/chat-message.component';
import { ChatInputComponent } from './components/chat-input.component';
import { TypingIndicatorComponent } from './components/typing-indicator.component';
import {
  MessageRole,
  type Message,
  type ConversationWithMessages,
  type Persona,
  type PersonaType,
  type ConfidenceFactor,
  type ConceptCitation,
  type MemoryAttribution,
  type WebSearchSource,
  type ExecutionPlan,
  type ExecutionPlanStep,
  type WorkflowConversationsCreatedPayload,
  type WorkflowStepConfirmationPayload,
  type WorkflowStepAwaitingInputPayload,
  type WorkflowStepMessagePayload,
  type WorkflowNavigatePayload,
  type YoloProgressPayload,
  type SuggestedAction,
} from '@mentor-ai/shared/types';
import { PersonaSelectorComponent } from '../personas/persona-selector.component';
import { PersonaBadgeComponent } from '../personas/persona-badge.component';
import { ConceptPanelComponent } from '../knowledge/concept-panel/concept-panel.component';
import { ConceptTreeComponent } from './components/concept-tree.component';
import { ConversationNotesComponent } from './components/conversation-notes.component';
import { TopicPickerComponent } from './components/topic-picker.component';
import type { CurriculumNode } from '@mentor-ai/shared/types';

interface WorkflowStatusEntry {
  planId: string;
  title: string;
  totalSteps: number;
  completedSteps: number;
  currentStepTitle: string | null;
  status: 'executing' | 'completed' | 'failed' | 'cancelled';
}

/**
 * Main chat page component.
 * Displays conversation list sidebar and active conversation messages.
 */
@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    ChatMessageComponent,
    ChatInputComponent,
    TypingIndicatorComponent,
    PersonaSelectorComponent,
    PersonaBadgeComponent,
    ConceptPanelComponent,
    ConceptTreeComponent,
    ConversationNotesComponent,
    TopicPickerComponent,
  ],
  styles: [
    `
      /* All styles inline - no Tailwind dependency */
      :host {
        display: block;
        height: 100vh;
      }
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
      }
      .layout {
        display: flex;
        height: 100vh;
        background: #0d0d0d;
        color: #fafafa;
        font-family: 'Inter', system-ui, sans-serif;
      }
      .sidebar {
        width: 280px;
        min-width: 280px;
        background: #0d0d0d;
        border-right: 1px solid #2a2a2a;
        display: flex;
        flex-direction: column;
      }
      .sidebar-header {
        height: 48px;
        display: flex;
        align-items: center;
        padding: 0 16px;
        border-bottom: 1px solid #2a2a2a;
      }
      .sidebar-header h1 {
        font-size: 15px;
        font-weight: 600;
      }
      .sidebar-actions {
        padding: 12px;
      }
      .new-chat-btn {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        background: #3b82f6;
        color: white;
        border: none;
        padding: 10px 16px;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
      }
      .new-chat-btn:hover {
        opacity: 0.9;
      }
      .sidebar-footer {
        padding: 12px;
        border-top: 1px solid #2a2a2a;
        display: flex;
        flex-direction: column;
        gap: 4px;
      }
      .sidebar-footer a {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 13px;
        color: #8b8b8b;
        text-decoration: none;
        padding: 6px 4px;
        border-radius: 4px;
      }
      .sidebar-footer a:hover {
        color: #fafafa;
        background: #1a1a1a;
      }
      .chat-main {
        flex: 1;
        min-width: 480px;
        display: flex;
        flex-direction: column;
        background: #0d0d0d;
      }
      .chat-header {
        height: 48px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 16px;
        border-bottom: 1px solid #2a2a2a;
      }
      .chat-header-left {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .chat-header h2 {
        font-size: 15px;
        font-weight: 500;
      }
      .switch-btn {
        background: none;
        border: none;
        color: #8b8b8b;
        font-size: 13px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .switch-btn:hover {
        color: #fafafa;
      }
      .header-actions {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      /* Connection indicator */
      .connection-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .connection-dot.connected {
        background: #22c55e;
      }
      .connection-dot.disconnected {
        background: #ef4444;
      }
      .connection-dot.reconnecting {
        background: #f59e0b;
        animation: pulse-dot 1s ease-in-out infinite;
      }
      @keyframes pulse-dot {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.3;
        }
      }

      /* Disconnect toast */
      .disconnect-toast {
        padding: 8px 16px;
        background: #1a1a1a;
        border-bottom: 1px solid #2a2a2a;
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        flex-shrink: 0;
      }
      .disconnect-toast.error {
        border-left: 3px solid #ef4444;
        color: #fca5a5;
      }
      .disconnect-toast.warning {
        border-left: 3px solid #f59e0b;
        color: #fde68a;
      }
      .disconnect-toast.success {
        border-left: 3px solid #22c55e;
        color: #86efac;
      }
      .disconnect-toast-close {
        background: none;
        border: none;
        color: #707070;
        cursor: pointer;
        margin-left: auto;
        font-size: 14px;
        padding: 0 4px;
      }
      .disconnect-toast-close:hover {
        color: #fafafa;
      }

      .chat-messages {
        flex: 1;
        overflow-y: auto;
        padding: 24px;
      }
      .messages-container {
        max-width: 768px;
        margin: 0 auto;
      }
      .empty-state {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .empty-content {
        text-align: center;
        max-width: 400px;
        padding: 24px;
      }
      .empty-icon {
        width: 80px;
        height: 80px;
        margin: 0 auto 24px;
        background: #1a1a1a;
        border-radius: 16px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .empty-title {
        font-size: 24px;
        font-weight: 600;
        margin-bottom: 8px;
      }
      .empty-desc {
        font-size: 15px;
        color: #a1a1a1;
        margin-bottom: 24px;
        line-height: 1.5;
      }
      .start-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        background: #3b82f6;
        color: white;
        border: none;
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 15px;
        font-weight: 500;
        cursor: pointer;
      }
      .start-btn:hover {
        opacity: 0.9;
      }
      .persona-pills {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        gap: 8px;
        margin-top: 24px;
      }
      .domain-pill {
        padding: 8px 16px;
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 20px;
        font-size: 13px;
        font-weight: 500;
        color: #a1a1a1;
        cursor: pointer;
        font-family: inherit;
        transition: all 0.15s;
      }
      .domain-pill:hover {
        background: #242424;
        border-color: #3b82f6;
        color: #fafafa;
      }
      .empty-or {
        font-size: 12px;
        color: #707070;
        margin-top: 16px;
        margin-bottom: 0;
      }
      .persona-selector-panel {
        padding: 12px 16px;
        border-bottom: 1px solid #2a2a2a;
        background: #1a1a1a;
      }
      .persona-selector-label {
        font-size: 13px;
        color: #a1a1a1;
        margin-bottom: 12px;
      }
      .error-toast {
        position: fixed;
        top: 16px;
        right: 16px;
        z-index: 9999;
        background: #1a1a1a;
        border: 1px solid #ef4444;
        padding: 12px 16px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        gap: 12px;
        max-width: 400px;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      }
      .right-panel {
        width: 360px;
        min-width: 360px;
        background: #0d0d0d;
        border-left: 1px solid #2a2a2a;
        display: flex;
        flex-direction: column;
      }
      .source-header {
        padding: 12px 16px;
        border-bottom: 1px solid #2a2a2a;
        font-size: 11px;
        font-weight: 600;
        color: #8b8b8b;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        flex-shrink: 0;
      }
      .tab-bar {
        display: flex;
        gap: 0;
        border-bottom: 1px solid #2a2a2a;
      }
      .tab {
        padding: 8px 20px;
        background: none;
        border: none;
        border-bottom: 2px solid transparent;
        color: #8b8b8b;
        font-size: 13px;
        cursor: pointer;
      }
      .tab:hover {
        color: #a1a1a1;
      }
      .tab.active {
        color: #fafafa;
        border-bottom-color: #3b82f6;
      }
      .notes-view {
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      /* Brain status bar (D6) */
      .brain-status-bar {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px 16px;
        background: #1a1a1a;
        border-bottom: 1px solid #2a2a2a;
        font-size: 11px;
        flex-shrink: 0;
      }
      .brain-status-label {
        color: #707070;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .brain-progress-bar {
        flex: 1;
        height: 4px;
        background: #242424;
        border-radius: 2px;
        overflow: hidden;
        min-width: 60px;
      }
      .brain-progress-fill {
        height: 100%;
        background: #3b82f6;
        border-radius: 2px;
        transition: width 0.5s;
      }
      .brain-stat {
        color: #8b8b8b;
        white-space: nowrap;
      }
      .brain-stat strong {
        color: #fafafa;
      }

      /* Next-step suggestion banner (D4) */
      .next-step-banner {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 10px 16px;
        background: linear-gradient(135deg, rgba(59, 130, 246, 0.08), rgba(59, 130, 246, 0.03));
        border: 1px solid rgba(59, 130, 246, 0.2);
        border-radius: 8px;
        margin: 8px 16px;
        font-size: 13px;
        animation: fadeSlideIn 0.3s ease;
      }
      .next-step-icon {
        width: 20px;
        height: 20px;
        color: #3b82f6;
        flex-shrink: 0;
      }
      .next-step-text {
        flex: 1;
        color: #bfbfbf;
      }
      .next-step-actions {
        display: flex;
        gap: 8px;
        flex-shrink: 0;
      }
      .next-step-btn {
        padding: 4px 12px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 500;
        cursor: pointer;
        border: none;
        transition: all 0.15s ease;
      }
      .next-step-btn.primary {
        background: #3b82f6;
        color: white;
      }
      .next-step-btn.primary:hover {
        background: #2563eb;
      }
      .next-step-btn.secondary {
        background: transparent;
        color: #8b8b8b;
        border: 1px solid #2a2a2a;
      }
      .next-step-btn.secondary:hover {
        color: #fafafa;
        border-color: #525252;
      }
      .next-step-close {
        background: none;
        border: none;
        color: #525252;
        font-size: 16px;
        cursor: pointer;
        padding: 0 4px;
        line-height: 1;
      }
      .next-step-close:hover {
        color: #fafafa;
      }
      @keyframes fadeSlideIn {
        from {
          opacity: 0;
          transform: translateY(-8px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      .domain-dashboard {
        padding: 20px 24px;
        border-bottom: 1px solid #2a2a2a;
      }
      .domain-stats {
        display: flex;
        gap: 16px;
        margin-bottom: 16px;
      }
      .stat-card {
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 8px;
        padding: 12px 16px;
        flex: 1;
      }
      .stat-label {
        font-size: 11px;
        color: #8b8b8b;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        margin-bottom: 4px;
      }
      .stat-value {
        font-size: 20px;
        font-weight: 600;
        color: #fafafa;
      }
      .stat-value.completed {
        color: #10b981;
      }
      .stat-value.pending {
        color: #f59e0b;
      }
      .domain-actions {
        display: flex;
        gap: 10px;
      }
      .run-brain-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 18px;
        background: #3b82f6;
        color: #fff;
        border: none;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
      }
      .run-brain-btn:hover {
        background: #2563eb;
      }
      .run-brain-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .add-investigation-btn {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 18px;
        background: #242424;
        color: #fafafa;
        border: 1px solid #2a2a2a;
        border-radius: 8px;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
      }
      .add-investigation-btn:hover {
        background: #2a2a2a;
      }
      .yolo-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 8px 10px;
        border-radius: 8px;
        border: 1px solid #2a2a2a;
        background: none;
        color: #8b8b8b;
        cursor: pointer;
      }
      .yolo-btn:hover {
        color: #eab308;
        border-color: #eab308;
      }
      .yolo-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      .plan-inline-panel {
        background: #1a1a1a;
        border-bottom: 1px solid #2a2a2a;
        display: flex;
        flex-direction: column;
        flex-shrink: 0;
      }
      .plan-inline-panel.collapsed .plan-steps {
        display: none;
      }
      .plan-inline-panel.collapsed .plan-footer {
        display: none;
      }
      .plan-header {
        padding: 10px 16px;
        border-bottom: 1px solid #2a2a2a;
        display: flex;
        align-items: center;
        gap: 12px;
        cursor: pointer;
      }
      .plan-header:hover {
        background: #242424;
      }
      .plan-header h3 {
        font-size: 14px;
        font-weight: 600;
        color: #fafafa;
        flex: 1;
      }
      .plan-collapse-icon {
        width: 16px;
        height: 16px;
        color: #8b8b8b;
        transition: transform 0.2s;
        flex-shrink: 0;
      }
      .plan-collapse-icon.expanded {
        transform: rotate(180deg);
      }
      .plan-meta {
        display: flex;
        gap: 16px;
        font-size: 12px;
        color: #a1a1a1;
      }
      .plan-summary {
        font-size: 12px;
        color: #a1a1a1;
        padding: 8px 0 0;
      }
      .plan-steps {
        max-height: 40vh;
        overflow-y: auto;
        padding: 8px 16px;
      }
      .plan-step {
        display: flex;
        gap: 12px;
        padding: 10px 0;
        border-bottom: 1px solid #242424;
      }
      .plan-step:last-child {
        border-bottom: none;
      }
      .step-indicator {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 12px;
        font-weight: 600;
      }
      .step-pending {
        background: #242424;
        color: #8b8b8b;
      }
      .step-in-progress {
        background: #1e3a5f;
        color: #60a5fa;
      }
      .step-completed {
        background: #1a2e1a;
        color: #86efac;
      }
      .step-failed {
        background: #3b1a1a;
        color: #fca5a5;
      }
      .step-info {
        flex: 1;
      }
      .step-title {
        font-size: 13px;
        font-weight: 500;
        color: #fafafa;
      }
      .step-desc {
        font-size: 12px;
        color: #a1a1a1;
        margin-top: 2px;
      }
      .step-tags {
        display: flex;
        gap: 6px;
        margin-top: 4px;
      }
      .step-tag {
        font-size: 10px;
        padding: 1px 6px;
        border-radius: 4px;
        background: #242424;
        color: #8b8b8b;
      }
      .plan-btn-cancel {
        background: none;
        border: 1px solid #2a2a2a;
        color: #a1a1a1;
        border-radius: 6px;
        padding: 4px 12px;
        font-size: 12px;
        cursor: pointer;
        font-family: inherit;
        flex-shrink: 0;
      }
      .plan-btn-cancel:hover {
        color: #fafafa;
        border-color: #4a4a4a;
      }
      .plan-btn-approve {
        background: #3b82f6;
        color: #fafafa;
        border: none;
        border-radius: 6px;
        padding: 4px 12px;
        font-size: 12px;
        font-weight: 500;
        font-family: inherit;
        flex-shrink: 0;
        cursor: pointer;
      }
      .plan-btn-approve:hover {
        background: #2563eb;
      }

      /* Workflow Status Bar (top banner) */
      .workflow-status-bar {
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 10px 16px;
        background: #1a1a1a;
        border-bottom: 1px solid #2a2a2a;
        flex-shrink: 0;
      }
      .workflow-status-entry {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 8px;
        font-size: 12px;
        padding: 8px 12px;
        border-radius: 6px;
        background: #0d0d0d;
      }
      .ws-detail-row {
        display: flex;
        align-items: center;
        gap: 8px;
        flex: 1;
        min-width: 0;
      }
      .wse-executing {
        border-left: 3px solid #3b82f6;
      }
      .wse-completed {
        border-left: 3px solid #22c55e;
        animation: fadeOutEntry 1.5s ease 3s forwards;
      }
      .wse-failed {
        border-left: 3px solid #ef4444;
        animation: fadeOutEntry 1.5s ease 3s forwards;
      }
      .wse-cancelled {
        border-left: 3px solid #f59e0b;
        animation: fadeOutEntry 1.5s ease 3s forwards;
      }
      @keyframes fadeOutEntry {
        from {
          opacity: 1;
          max-height: 60px;
        }
        to {
          opacity: 0;
          max-height: 0;
          padding: 0;
          margin: 0;
          overflow: hidden;
        }
      }
      .ws-title {
        color: #fafafa;
        font-weight: 600;
        font-size: 13px;
        max-width: 200px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        width: 100%;
      }
      .ws-progress-bar {
        flex: 1;
        height: 4px;
        background: #242424;
        border-radius: 2px;
        overflow: hidden;
        min-width: 60px;
      }
      .ws-progress-fill {
        height: 100%;
        background: #3b82f6;
        border-radius: 2px;
        transition: width 0.3s;
      }
      .ws-count {
        color: #8b8b8b;
        flex-shrink: 0;
      }
      .ws-current {
        color: #60a5fa;
        font-size: 11px;
        width: 100%;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .ws-badge-done {
        color: #22c55e;
        font-weight: 600;
      }
      .ws-badge-fail {
        color: #ef4444;
        font-weight: 600;
      }

      @keyframes spin {
        from {
          transform: rotate(0deg);
        }
        to {
          transform: rotate(360deg);
        }
      }
      .spinner {
        animation: spin 1s linear infinite;
      }

      .step-status-msg {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 14px;
        margin: 8px 0;
        max-width: 768px;
        background: #1a1a1a;
        border-left: 3px solid #3b82f6;
        border-radius: 0 6px 6px 0;
        font-size: 12px;
        color: #a1a1a1;
      }
      .step-status-msg .step-icon {
        width: 14px;
        height: 14px;
        flex-shrink: 0;
      }

      @keyframes highlightFlash {
        0% {
          outline: 2px solid #3b82f6;
          outline-offset: 4px;
        }
        100% {
          outline: 2px solid transparent;
          outline-offset: 4px;
        }
      }
      :host ::ng-deep .highlight-flash {
        animation: highlightFlash 2s ease-out;
      }

      /* Step confirmation UI */
      .step-confirmation {
        margin: 16px 0;
        padding: 16px;
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 12px;
        border-left: 3px solid #3b82f6;
      }
      .confirmation-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 8px;
      }
      .confirmation-label {
        font-size: 0.8rem;
        font-weight: 600;
        color: #3b82f6;
        text-transform: uppercase;
        letter-spacing: 0.05em;
      }
      .confirmation-title {
        font-size: 1rem;
        font-weight: 600;
        color: #fafafa;
        margin: 0 0 4px 0;
      }
      .confirmation-desc {
        font-size: 0.875rem;
        color: #a3a3a3;
        margin: 0 0 12px 0;
        line-height: 1.5;
      }
      .input-prompt {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        margin-bottom: 8px;
        background: rgba(245, 158, 11, 0.08);
        border: 1px solid rgba(245, 158, 11, 0.2);
        border-radius: 8px;
        font-size: 0.85rem;
        color: #f59e0b;
        font-weight: 500;
      }
      .input-prompt svg {
        flex-shrink: 0;
      }
      .confirmation-input {
        width: 100%;
        padding: 10px 12px;
        background: #0d0d0d;
        border: 1px solid #2a2a2a;
        border-radius: 8px;
        color: #fafafa;
        font-size: 0.875rem;
        font-family: inherit;
        resize: vertical;
        min-height: 60px;
        margin-bottom: 12px;
        transition: border-color 0.15s ease;
        box-sizing: border-box;
      }
      .confirmation-input:focus {
        outline: none;
        border-color: #3b82f6;
      }
      .confirmation-input::placeholder {
        color: #525252;
      }
      .confirmation-actions {
        display: flex;
        gap: 8px;
      }
      .confirm-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        padding: 8px 16px;
        font-size: 0.875rem;
        font-weight: 500;
        border-radius: 8px;
        cursor: pointer;
        transition: all 0.15s ease;
        border: 1px solid transparent;
      }
      .confirm-btn.primary {
        background: #3b82f6;
        color: white;
        border-color: #3b82f6;
      }
      .confirm-btn.primary:hover {
        background: #2563eb;
        border-color: #2563eb;
      }
      .confirm-btn.cancel {
        background: transparent;
        color: #a3a3a3;
        border-color: #2a2a2a;
      }
      .confirm-btn.cancel:hover {
        background: #1a1a1a;
        color: #ef4444;
        border-color: #ef4444;
      }

      .return-link-container {
        margin: 12px 0;
        text-align: center;
      }
      .return-link {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: none;
        border: 1px solid #2a2a2a;
        color: #60a5fa;
        padding: 8px 16px;
        border-radius: 8px;
        font-size: 13px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .return-link:hover {
        background: #1a1a1a;
        border-color: #3b82f6;
        color: #93c5fd;
      }
      .return-link svg {
        flex-shrink: 0;
      }
    `,
  ],
  template: `
    <!-- Error Toast -->
    @if (errorMessage$()) {
      <div class="error-toast" role="alert">
        <svg
          style="width: 20px; height: 20px; color: #EF4444; flex-shrink: 0;"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fill-rule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
            clip-rule="evenodd"
          />
        </svg>
        <span style="font-size: 13px; color: #FAFAFA;">{{ errorMessage$() }}</span>
        <button
          (click)="dismissError()"
          style="background: none; border: none; color: #8B8B8B; cursor: pointer; margin-left: auto;"
          aria-label="Zatvori"
        >
          <svg style="width: 16px; height: 16px;" fill="currentColor" viewBox="0 0 20 20">
            <path
              fill-rule="evenodd"
              d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
              clip-rule="evenodd"
            />
          </svg>
        </button>
      </div>
    }

    <!-- Topic Picker Modal -->
    @if (showTopicPicker$()) {
      <app-topic-picker
        (topicSelected)="onTopicSelected($event)"
        (cancelled)="onTopicPickerCancelled()"
      />
    }

    <!-- Plan Panel (inline, non-blocking) — rendered inside chat-main below -->

    <!-- Three-Panel Layout -->
    <div class="layout">
      <!-- Left Sidebar -->
      <aside class="sidebar">
        <div class="sidebar-header">
          <h1>Mentor AI</h1>
        </div>

        <div class="sidebar-actions">
          <button class="new-chat-btn" (click)="createNewConversation()">
            <svg
              style="width: 16px; height: 16px;"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M12 4v16m8-8H4"
              />
            </svg>
            Nova konverzacija
          </button>
        </div>

        <app-concept-tree
          [activeConversationId]="activeConversationId$()"
          [locked]="isExecutingWorkflow$()"
          [newConversationIds]="newConversationIds$()"
          [loadingItemId]="loadingConversationId$()"
          (conversationSelected)="selectConversation($event)"
          (newChatRequested)="createConversationUnderConcept($event)"
          (conceptSelected)="onConceptSelected($event)"
        />

        <div class="sidebar-footer">
          <a routerLink="/admin/llm-config">
            <svg
              style="width: 16px; height: 16px;"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
              />
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            AI konfiguracija
          </a>
          <a routerLink="/dashboard">
            <svg
              style="width: 16px; height: 16px;"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
              />
            </svg>
            Kontrolna tabla
          </a>
        </div>
      </aside>

      <!-- Main Chat Area -->
      <main class="chat-main">
        @if (activeConversation$() || folderName$()) {
          <!-- Chat Header -->
          <header class="chat-header">
            <div class="chat-header-left">
              <span
                class="connection-dot"
                [class.connected]="connectionState$() === 'connected'"
                [class.disconnected]="connectionState$() === 'disconnected'"
                [class.reconnecting]="connectionState$() === 'reconnecting'"
                [title]="
                  connectionState$() === 'connected'
                    ? 'Povezano'
                    : connectionState$() === 'reconnecting'
                      ? 'Ponovno povezivanje...'
                      : 'Veza prekinuta'
                "
              >
              </span>
              @if (folderName$() && !activeConversation$()) {
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
                <h2>{{ folderName$() }}</h2>
              } @else {
                <h2>{{ activeConversation$()?.title || 'Nova konverzacija' }}</h2>
                @if (currentPersonaType$()) {
                  <app-persona-badge [personaType]="currentPersonaType$()" />
                }
              }
            </div>
            @if (activeConversation$()) {
              <div class="header-actions">
                <div
                  class="tab-bar"
                  style="border-bottom: none;"
                  role="tablist"
                  aria-label="Prikaz konverzacije"
                >
                  <button
                    class="tab"
                    [class.active]="activeTab$() === 'chat'"
                    (click)="activeTab$.set('chat')"
                    role="tab"
                    [attr.aria-selected]="activeTab$() === 'chat'"
                  >
                    Poruke
                  </button>
                  <button
                    class="tab"
                    [class.active]="activeTab$() === 'notes'"
                    (click)="activeTab$.set('notes')"
                    role="tab"
                    [attr.aria-selected]="activeTab$() === 'notes'"
                  >
                    Zadaci
                  </button>
                </div>
                <button class="switch-btn" (click)="togglePersonaSelector()">
                  <svg
                    style="width: 16px; height: 16px;"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                  </svg>
                  {{ showPersonaSelector$() ? 'Sakrij persone' : 'Promeni personu' }}
                </button>
              </div>
            }
          </header>

          <!-- Disconnect Toast -->
          @if (disconnectToast$()) {
            <div
              class="disconnect-toast"
              [class.error]="connectionState$() === 'disconnected'"
              [class.warning]="connectionState$() === 'reconnecting'"
              [class.success]="connectionState$() === 'connected'"
            >
              {{ disconnectToast$() }}
              <button class="disconnect-toast-close" (click)="disconnectToast$.set(null)">
                &times;
              </button>
            </div>
          }

          @if (activeConversation$()) {
            @if (activeTab$() === 'chat') {
              <!-- Persona Selector -->
              @if (showPersonaSelector$()) {
                <div class="persona-selector-panel">
                  <p class="persona-selector-label">
                    Izaberite personu odeljenja za specijalizovane AI odgovore:
                  </p>
                  <app-persona-selector
                    [selectedType]="currentPersonaType$()"
                    [allowNone]="false"
                    (personaSelected)="onPersonaSelected($event)"
                  />
                </div>
              }

              <!-- Inline Plan Panel -->
              @if (showPlanOverlay$() && currentPlan$()) {
                <div class="plan-inline-panel" [class.collapsed]="planCollapsed$()">
                  <div class="plan-header" (click)="togglePlanCollapse()">
                    <svg
                      class="plan-collapse-icon"
                      [class.expanded]="!planCollapsed$()"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                    <h3>
                      {{ isExecutingWorkflow$() ? 'Izvršavanje plana...' : 'Plan izvršavanja' }}
                    </h3>
                    <div class="plan-meta">
                      <span>{{ currentPlan$()!.steps.length }} koraka</span>
                      <span>~{{ currentPlan$()!.totalEstimatedMinutes }} min</span>
                    </div>
                    @if (!planCollapsed$()) {
                      @if (isExecutingWorkflow$()) {
                        <button
                          class="plan-btn-cancel"
                          (click)="cancelExecution(); $event.stopPropagation()"
                        >
                          Prekini
                        </button>
                      } @else {
                        <button
                          class="plan-btn-cancel"
                          (click)="rejectPlan(); $event.stopPropagation()"
                        >
                          Otkaži
                        </button>
                        <button
                          class="plan-btn-approve"
                          (click)="approvePlan(); $event.stopPropagation()"
                        >
                          Pokreni
                        </button>
                      }
                    }
                  </div>
                  <div class="plan-steps">
                    @for (step of currentPlan$()!.steps; track step.stepId) {
                      <div class="plan-step">
                        <div
                          class="step-indicator"
                          [class.step-pending]="getStepStatus(step.stepId) === 'pending'"
                          [class.step-in-progress]="getStepStatus(step.stepId) === 'in_progress'"
                          [class.step-completed]="getStepStatus(step.stepId) === 'completed'"
                          [class.step-failed]="getStepStatus(step.stepId) === 'failed'"
                        >
                          @if (getStepStatus(step.stepId) === 'in_progress') {
                            <svg
                              class="spinner"
                              style="width:16px;height:16px;"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path stroke-linecap="round" stroke-width="2" d="M4 12a8 8 0 018-8" />
                            </svg>
                          } @else if (getStepStatus(step.stepId) === 'completed') {
                            <svg
                              style="width:14px;height:14px;"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fill-rule="evenodd"
                                d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                clip-rule="evenodd"
                              />
                            </svg>
                          } @else if (getStepStatus(step.stepId) === 'failed') {
                            <svg
                              style="width:14px;height:14px;"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fill-rule="evenodd"
                                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                                clip-rule="evenodd"
                              />
                            </svg>
                          } @else {
                            {{ step.workflowStepNumber }}
                          }
                        </div>
                        <div class="step-info">
                          <div class="step-title">{{ step.title }}</div>
                          <div class="step-desc">{{ step.description }}</div>
                          <div class="step-tags">
                            <span class="step-tag">{{ step.conceptName }}</span>
                            @if (step.departmentTag) {
                              <span class="step-tag">{{ step.departmentTag }}</span>
                            }
                            <span class="step-tag">~{{ step.estimatedMinutes }}m</span>
                          </div>
                        </div>
                      </div>
                    }
                  </div>
                </div>
              }

              <!-- Workflow Status Bar (top of chat area) -->
              @if (workflowHistory$().length > 0 || (isYoloMode$() && yoloProgress$())) {
                <div class="workflow-status-bar">
                  @if (isYoloMode$() && yoloProgress$()) {
                    <div
                      class="workflow-status-entry wse-executing"
                      style="border-left-color: #F59E0B;"
                    >
                      <span class="ws-title">YOLO</span>
                      <div class="ws-progress-bar">
                        <div
                          class="ws-progress-fill"
                          style="background: #F59E0B;"
                          [style.width.%]="
                            (yoloProgress$()!.executionBudget ?? yoloProgress$()!.total) > 0
                              ? (yoloProgress$()!.completed /
                                  (yoloProgress$()!.executionBudget ?? yoloProgress$()!.total)) *
                                100
                              : 0
                          "
                        ></div>
                      </div>
                      <span class="ws-count"
                        >{{ yoloProgress$()!.completed }}/{{
                          yoloProgress$()!.executionBudget ?? yoloProgress$()!.total
                        }}</span
                      >
                      @if (yoloProgress$()!.currentTasks.length > 0) {
                        <span class="ws-current"
                          >{{ yoloProgress$()!.currentTasks.length }} aktivn{{
                            yoloProgress$()!.currentTasks.length > 1 ? 'a' : 'o'
                          }}</span
                        >
                      }
                      @if (yoloProgress$()!.failed > 0) {
                        <span class="ws-badge-fail">{{ yoloProgress$()!.failed }} neuspešno</span>
                      }
                      @if (yoloProgress$()!.discoveredCount > 0) {
                        <span style="color: #10B981; font-size: 11px; font-weight: 600;"
                          >+{{ yoloProgress$()!.discoveredCount }}</span
                        >
                      }
                    </div>
                  }
                  @for (entry of workflowHistory$(); track entry.planId) {
                    <div
                      class="workflow-status-entry"
                      [class.wse-executing]="entry.status === 'executing'"
                      [class.wse-completed]="entry.status === 'completed'"
                      [class.wse-failed]="entry.status === 'failed'"
                      [class.wse-cancelled]="entry.status === 'cancelled'"
                    >
                      <span class="ws-title">{{ entry.title }}</span>
                      <div class="ws-detail-row">
                        <div class="ws-progress-bar">
                          <div
                            class="ws-progress-fill"
                            [style.width.%]="
                              entry.totalSteps > 0
                                ? (entry.completedSteps / entry.totalSteps) * 100
                                : 0
                            "
                          ></div>
                        </div>
                        <span class="ws-count"
                          >{{ entry.completedSteps }}/{{ entry.totalSteps }}</span
                        >
                      </div>
                      @if (entry.status === 'executing' && entry.currentStepTitle) {
                        <span class="ws-current">{{ entry.currentStepTitle }}</span>
                      }
                      @if (entry.status === 'completed') {
                        <span class="ws-badge-done">Završeno</span>
                      }
                      @if (entry.status === 'failed') {
                        <span class="ws-badge-fail">Greška</span>
                      }
                      @if (entry.status === 'cancelled') {
                        <span class="ws-badge-fail">Otkazano</span>
                      }
                    </div>
                  }
                </div>
              }

              <!-- Messages Container -->
              <div class="chat-messages" #messagesContainer>
                <div class="messages-container">
                  @for (message of messages$(); track message.id) {
                    <app-chat-message
                      [message]="message"
                      [personaType]="message.role === 'ASSISTANT' ? currentPersonaType$() : null"
                      (citationClick)="onCitationClick($event)"
                      (actionClick)="onSuggestedAction($event)"
                      style="display: block; margin-bottom: 16px;"
                    />
                  }
                  @if (isExecutingWorkflow$() && !showPlanOverlay$()) {
                    <div class="step-status-msg">
                      <svg
                        class="step-icon spinner"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path stroke-linecap="round" stroke-width="2" d="M4 12a8 8 0 018-8" />
                      </svg>
                      @if (currentStepTitle$()) {
                        Korak {{ currentStepIndex$() + 1 }}/{{ totalStepsCount$() }}:
                        {{ currentStepTitle$() }}
                      } @else {
                        Pripremam izvršavanje...
                      }
                    </div>
                  }
                  @if (isYoloMode$() && yoloProgress$()) {
                    <div class="step-status-msg" style="border-left-color: #F59E0B;">
                      <svg
                        class="step-icon spinner"
                        fill="none"
                        stroke="#F59E0B"
                        viewBox="0 0 24 24"
                      >
                        <path stroke-linecap="round" stroke-width="2" d="M4 12a8 8 0 018-8" />
                      </svg>
                      YOLO — {{ yoloProgress$()!.completed }}/{{
                        yoloProgress$()!.executionBudget ?? yoloProgress$()!.total
                      }}
                      @if (yoloProgress$()!.currentTasks.length > 0) {
                        | {{ yoloProgress$()!.currentTasks.length }} aktivn{{
                          yoloProgress$()!.currentTasks.length > 1 ? 'a' : 'o'
                        }}
                      }
                      @if (yoloProgress$()!.discoveredCount > 0) {
                        |
                        <span style="color: #10B981;"
                          >+{{ yoloProgress$()!.discoveredCount }} otkriveno</span
                        >
                      }
                    </div>
                  }
                  @if (isStreaming$()) {
                    <app-chat-message
                      [message]="streamingMessage$()"
                      [isStreaming]="true"
                      [personaType]="currentPersonaType$()"
                    />
                  }
                  @if (isLoading$() && !isStreaming$()) {
                    <app-typing-indicator [personaType]="currentPersonaType$()" />
                  }

                  @if (isGeneratingPlan$()) {
                    <div class="step-status-msg">
                      <svg
                        class="step-icon spinner"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path stroke-linecap="round" stroke-width="2" d="M4 12a8 8 0 018-8" />
                      </svg>
                      Generišem plan izvršavanja...
                    </div>
                  }

                  @if (currentWorkflowStepInput$(); as stepInput) {
                    <div class="step-confirmation">
                      <div class="confirmation-header">
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#3B82F6"
                          stroke-width="2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        >
                          <circle cx="12" cy="12" r="10"></circle>
                          <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                        <span class="confirmation-label"
                          >Korak {{ stepInput.stepIndex + 1 }}/{{ stepInput.totalSteps }}:
                          {{ stepInput.conceptName }}</span
                        >
                      </div>
                      <p class="confirmation-title">{{ stepInput.stepTitle }}</p>
                      <p class="confirmation-desc">{{ stepInput.stepDescription }}</p>
                      @if (stepInput.inputType === 'confirmation') {
                        <div class="confirmation-actions">
                          <button class="confirm-btn primary" (click)="continueWorkflowStep()">
                            Nastavi
                            <svg
                              width="16"
                              height="16"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              stroke-width="2"
                              stroke-linecap="round"
                              stroke-linejoin="round"
                            >
                              <line x1="5" y1="12" x2="19" y2="12"></line>
                              <polyline points="12 5 19 12 12 19"></polyline>
                            </svg>
                          </button>
                          <button class="confirm-btn cancel" (click)="cancelExecution()">
                            Otkaži
                          </button>
                        </div>
                      } @else {
                        <div class="input-prompt">
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#F59E0B"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          >
                            <path
                              d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
                            ></path>
                          </svg>
                          <span>Unesite odgovor u polje za poruke ispod</span>
                        </div>
                      }
                    </div>
                  }

                  @if (previousConversationId$()) {
                    <div class="return-link-container">
                      <button class="return-link" (click)="returnToPreviousConversation()">
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          stroke-width="2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        >
                          <line x1="19" y1="12" x2="5" y2="12"></line>
                          <polyline points="12 19 5 12 12 5"></polyline>
                        </svg>
                        Vrati se na prethodnu konverzaciju
                      </button>
                    </div>
                  }

                  @if (awaitingConfirmation$() && nextStepInfo$() && !currentWorkflowStepInput$()) {
                    <div class="step-confirmation">
                      <div class="confirmation-header">
                        <svg
                          width="20"
                          height="20"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#3B82F6"
                          stroke-width="2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        >
                          <circle cx="12" cy="12" r="10"></circle>
                          <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                        <span class="confirmation-label"
                          >Korak {{ nextStepInfo$()!.stepIndex + 1 }}/{{
                            nextStepInfo$()!.totalSteps
                          }}:</span
                        >
                      </div>
                      <p class="confirmation-title">{{ nextStepInfo$()!.title }}</p>
                      <p class="confirmation-desc">{{ nextStepInfo$()!.description }}</p>
                      <div class="input-prompt">
                        <svg
                          width="16"
                          height="16"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="#F59E0B"
                          stroke-width="2"
                          stroke-linecap="round"
                          stroke-linejoin="round"
                        >
                          <path
                            d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"
                          ></path>
                        </svg>
                        <span>Imate li dodatne informacije ili odgovore za ovaj korak?</span>
                      </div>
                      <textarea
                        class="confirmation-input"
                        [value]="userStepInput$()"
                        (input)="userStepInput$.set($any($event.target).value)"
                        placeholder="Unesite vaše odgovore, podatke o kompaniji, specifične zahteve..."
                        rows="4"
                      ></textarea>
                      <div class="confirmation-actions">
                        <button class="confirm-btn primary" (click)="continueWorkflow()">
                          {{ userStepInput$() ? 'Izvrši sa odgovorom' : 'Preskoči i izvrši' }}
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            stroke-width="2"
                            stroke-linecap="round"
                            stroke-linejoin="round"
                          >
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                            <polyline points="12 5 19 12 12 19"></polyline>
                          </svg>
                        </button>
                        <button class="confirm-btn cancel" (click)="cancelExecution()">
                          Otkaži
                        </button>
                      </div>
                    </div>
                  }
                </div>
              </div>
            } @else {
              <!-- Brain Status Dashboard (D6) -->
              @if (brainStats$().totalDomains > 0) {
                <div class="brain-status-bar">
                  <span class="brain-status-label">Mozak</span>
                  <div class="brain-progress-bar">
                    <div
                      class="brain-progress-fill"
                      [style.width.%]="brainStats$().progressPercent"
                    ></div>
                  </div>
                  <span class="brain-stat"
                    ><strong
                      >{{ brainStats$().completedDomains }}/{{ brainStats$().totalDomains }}</strong
                    >
                    domena</span
                  >
                  @if (brainStats$().pendingTasks > 0) {
                    <span class="brain-stat" style="color: #F59E0B;"
                      ><strong>{{ brainStats$().pendingTasks }}</strong> na čekanju</span
                    >
                  }
                </div>
              }
              <!-- Notes View (conversation mode) -->
              <div class="notes-view" style="flex: 1; overflow-y: auto;">
                <app-conversation-notes
                  [conversationId]="activeConversationId$()"
                  [conceptId]="activeConversation$()?.conceptId ?? null"
                  [autoSelectTaskIds]="autoSelectTaskIds$()"
                  [isExecuting]="isExecutingWorkflow$()"
                  [executingTaskId]="executingTaskId$()"
                  [taskExecutionContent]="taskExecutionStreamContent$()"
                  [submittingResultId]="submittingResultId$()"
                  [taskResultContent]="taskResultStreamContent$()"
                  [isGeneratingPlan]="isGeneratingPlan$()"
                  (viewMessage)="onViewMessage($event)"
                  (runAgents)="onRunAgents($event)"
                  (executeTask)="onExecuteSingleTask($event)"
                  (submitTaskResult)="onSubmitTaskResult($event)"
                />
              </div>
            }
            <!-- D4: Next-step suggestion banner -->
            @if (nextStepSuggestion$()) {
              <div class="next-step-banner">
                <svg class="next-step-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
                <span class="next-step-text">{{ nextStepSuggestion$()!.message }}</span>
                <div class="next-step-actions">
                  <button class="next-step-btn primary" (click)="onNextStepAction()">
                    {{ nextStepSuggestion$()!.actionLabel }}
                  </button>
                  @if (nextStepSuggestion$()!.secondaryLabel) {
                    <button
                      class="next-step-btn secondary"
                      (click)="activeTab$.set('notes'); dismissNextStep()"
                    >
                      {{ nextStepSuggestion$()!.secondaryLabel }}
                    </button>
                  }
                </div>
                <button class="next-step-close" (click)="dismissNextStep()">&times;</button>
              </div>
            }
            <!-- Chat Input (always visible at bottom when conversation is active) -->
            <div style="flex-shrink: 0;">
              <app-chat-input
                [disabled]="isLoading$() && !allowWorkflowInput$()"
                (messageSent)="sendMessage($event)"
              />
            </div>
          } @else if (folderName$()) {
            <!-- Domain Dashboard + Notes View (folder mode) -->
            <div class="domain-dashboard">
              <div class="domain-stats">
                <div class="stat-card">
                  <div class="stat-label">Završeno</div>
                  <div class="stat-value completed">{{ domainCompletedCount$() }}</div>
                </div>
                <div class="stat-card">
                  <div class="stat-label">Na čekanju</div>
                  <div class="stat-value pending">{{ domainPendingCount$() }}</div>
                </div>
                <div class="stat-card">
                  <div class="stat-label">Ukupno</div>
                  <div class="stat-value">
                    {{ domainCompletedCount$() + domainPendingCount$() }}
                  </div>
                </div>
              </div>
              <div class="domain-actions">
                <button
                  class="run-brain-btn"
                  [disabled]="
                    isExecutingWorkflow$() || isYoloMode$() || domainPendingCount$() === 0
                  "
                  (click)="onRunBrain()"
                >
                  <svg
                    style="width: 16px; height: 16px;"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                  Pokreni Brain
                </button>
                <button
                  class="yolo-btn"
                  [disabled]="
                    isExecutingWorkflow$() || isYoloMode$() || domainPendingCount$() === 0
                  "
                  (click)="onRunBrainYolo()"
                  title="YOLO režim (bez pregleda plana)"
                >
                  <svg
                    style="width: 16px; height: 16px;"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    />
                  </svg>
                </button>
                <button class="add-investigation-btn" (click)="showTopicPicker$.set(true)">
                  <svg
                    style="width: 16px; height: 16px;"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                  Istraži koncept
                </button>
              </div>
            </div>
            <!-- Brain Status Dashboard (D6) — folder view -->
            @if (brainStats$().totalDomains > 0) {
              <div class="brain-status-bar">
                <span class="brain-status-label">Mozak</span>
                <div class="brain-progress-bar">
                  <div
                    class="brain-progress-fill"
                    [style.width.%]="brainStats$().progressPercent"
                  ></div>
                </div>
                <span class="brain-stat"
                  ><strong
                    >{{ brainStats$().completedDomains }}/{{ brainStats$().totalDomains }}</strong
                  >
                  domena</span
                >
                @if (brainStats$().pendingTasks > 0) {
                  <span class="brain-stat" style="color: #F59E0B;"
                    ><strong>{{ brainStats$().pendingTasks }}</strong> na čekanju</span
                  >
                }
              </div>
            }
            <div class="notes-view">
              <app-conversation-notes
                [conversationId]="null"
                [conceptId]="null"
                [folderConceptIds]="folderConceptIds$()"
                [folderConversationIds]="folderConversationIds$()"
                [folderName]="folderName$()"
                [autoSelectTaskIds]="autoSelectTaskIds$()"
                [isExecuting]="isExecutingWorkflow$()"
                [executingTaskId]="executingTaskId$()"
                [taskExecutionContent]="taskExecutionStreamContent$()"
                [submittingResultId]="submittingResultId$()"
                [taskResultContent]="taskResultStreamContent$()"
                [isGeneratingPlan]="isGeneratingPlan$()"
                (viewMessage)="onViewMessage($event)"
                (runAgents)="onRunAgents($event)"
                (executeTask)="onExecuteSingleTask($event)"
                (submitTaskResult)="onSubmitTaskResult($event)"
              />
            </div>
          }
        } @else {
          <!-- Empty State -->
          <div class="empty-state">
            <div class="empty-content">
              <div class="empty-icon">
                <svg
                  style="width: 40px; height: 40px; color: #3B82F6;"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="1.5"
                    d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                  />
                </svg>
              </div>
              <h2 class="empty-title">Dobrodošli u Business Brain</h2>
              <p class="empty-desc">
                Vaš AI poslovni partner koji misli umesto vas. Izaberite domen za početak:
              </p>
              <div class="persona-pills">
                <button class="domain-pill" (click)="createNewConversation('Poslovanje')">
                  Poslovanje
                </button>
                <button class="domain-pill" (click)="createNewConversation('Marketing')">
                  Marketing
                </button>
                <button class="domain-pill" (click)="createNewConversation('Prodaja')">
                  Prodaja
                </button>
                <button class="domain-pill" (click)="createNewConversation('Finansije')">
                  Finansije
                </button>
                <button class="domain-pill" (click)="createNewConversation('Operacije')">
                  Operacije
                </button>
                <button class="domain-pill" (click)="createNewConversation('HR')">HR</button>
              </div>
              <p class="empty-or">ili</p>
              <button class="start-btn" (click)="createNewConversation()">
                <svg
                  style="width: 20px; height: 20px;"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M12 4v16m8-8H4"
                  />
                </svg>
                Nova konverzacija
              </button>
            </div>
          </div>
        }
      </main>

      <!-- Right Panel: Source / Citation Details -->
      @if (selectedConceptId$()) {
        <aside class="right-panel">
          <div class="source-header">Izvor</div>
          <app-concept-panel
            [conceptId]="selectedConceptId$()"
            [isOpen]="true"
            (close)="closeConceptPanel()"
            (conceptClick)="onRelatedConceptClick($event)"
          />
        </aside>
      }
    </div>
  `,
})
export class ChatComponent implements OnInit, OnDestroy, AfterViewInit {
  private readonly conversationService = inject(ConversationService);
  private readonly chatWsService = inject(ChatWebsocketService);
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly notesApi = inject(NotesApiService);

  @ViewChild(ConceptTreeComponent) conceptTree?: ConceptTreeComponent;
  @ViewChild(ConversationNotesComponent) conversationNotes?: ConversationNotesComponent;
  @ViewChild('yoloLogContainer') yoloLogContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('messagesContainer') messagesContainer?: ElementRef<HTMLDivElement>;

  readonly activeConversation$ = signal<ConversationWithMessages | null>(null);
  readonly activeConversationId$ = computed(() => this.activeConversation$()?.id ?? null);
  readonly messages$ = computed(() => this.activeConversation$()?.messages ?? []);
  readonly isLoading$ = signal(false);
  readonly isStreaming$ = signal(false);
  readonly streamingContent$ = signal('');
  readonly streamingMessage$ = computed(
    (): Message => ({
      id: 'streaming',
      conversationId: this.activeConversationId$() ?? '',
      role: MessageRole.ASSISTANT,
      content: this.streamingContent$(),
      confidenceScore: null,
      confidenceFactors: null,
      createdAt: '',
    })
  );

  // Persona state
  readonly showPersonaSelector$ = signal(false);
  readonly currentPersonaType$ = computed(() => this.activeConversation$()?.personaType ?? null);

  // Error state for user feedback
  readonly errorMessage$ = signal<string | null>(null);

  // Concept panel state (Story 2.6)
  readonly selectedConceptId$ = signal<string | null>(null);

  // Tab state for Chat/Notes view
  readonly activeTab$ = signal<'chat' | 'notes'>('chat');

  // Topic picker state
  readonly showTopicPicker$ = signal(false);

  // Connection state (from WebSocket service)
  readonly connectionState$ = computed(() => this.chatWsService.connectionState$());
  readonly disconnectToast$ = signal<string | null>(null);

  // Workflow execution state
  readonly showPlanOverlay$ = signal(false);
  readonly planCollapsed$ = signal(false);
  readonly currentPlan$ = signal<ExecutionPlan | null>(null);
  readonly executionProgress$ = signal<Map<string, ExecutionPlanStep['status']>>(new Map());
  readonly isExecutingWorkflow$ = signal(false);

  // Per-concept conversations created during workflow execution
  readonly createdConceptConversations$ = signal<
    WorkflowConversationsCreatedPayload['conversations']
  >([]);

  // New conversation indicators (blue dot)
  readonly newConversationIds$ = signal<Set<string>>(new Set());

  // Folder-level task overview mode
  readonly folderConceptIds$ = signal<string[]>([]);
  readonly folderConversationIds$ = signal<string[]>([]);
  readonly folderName$ = signal<string | null>(null);
  readonly autoSelectTaskIds$ = signal<string[]>([]);

  // Story 3.2: Domain dashboard stats
  readonly domainCompletedCount$ = signal(0);
  readonly domainPendingCount$ = signal(0);

  // Inline execution progress (shown in chat area)
  readonly currentStepTitle$ = signal<string | null>(null);
  readonly currentStepIndex$ = signal(0);
  readonly totalStepsCount$ = signal(0);
  readonly completedStepsCount$ = signal(0);
  readonly progressPercent$ = computed(() => {
    const total = this.totalStepsCount$();
    if (total === 0) return 0;
    return Math.round((this.completedStepsCount$() / total) * 100);
  });

  // Step-by-step workflow confirmation
  readonly activePlanId$ = signal<string | null>(null);
  readonly awaitingConfirmation$ = signal(false);
  readonly nextStepInfo$ = signal<WorkflowStepConfirmationPayload['nextStep'] | null>(null);
  readonly userStepInput$ = signal('');

  // Interactive workflow step signals (Task 6)
  readonly isGeneratingPlan$ = signal(false);
  readonly allowWorkflowInput$ = signal(false);
  readonly currentWorkflowStepInput$ = signal<WorkflowStepAwaitingInputPayload | null>(null);
  readonly previousConversationId$ = signal<string | null>(null);
  readonly executingTaskId$ = signal<string | null>(null);
  readonly taskExecutionStreamContent$ = signal('');
  readonly submittingResultId$ = signal<string | null>(null);
  readonly taskResultStreamContent$ = signal('');
  readonly loadingConversationId$ = signal<string | null>(null);
  readonly isCreatingConversation$ = computed(() => this.conversationService.isCreating$());

  // YOLO autonomous execution signals
  readonly isYoloMode$ = signal(false);
  readonly yoloProgress$ = signal<YoloProgressPayload | null>(null);
  readonly showYoloActivityLog$ = signal(false);
  private yoloPending = false;
  private manualAutostartPending = false;

  // Workflow status bar: tracks all active/recent workflow executions
  readonly workflowHistory$ = signal<WorkflowStatusEntry[]>([]);

  // Trigger for brainStats$ to re-evaluate after ViewChild is set
  private readonly viewInit$ = signal(false);

  // Brain status dashboard (D6): aggregated from concept tree data
  readonly brainStats$ = computed(() => {
    this.viewInit$(); // Force re-evaluation after AfterViewInit
    const tree = this.conceptTree?.treeData$()?.tree ?? [];
    if (tree.length === 0)
      return { totalDomains: 0, completedDomains: 0, pendingTasks: 0, progressPercent: 0 };

    let totalDomains = 0;
    let completedDomains = 0;
    let pendingTasks = 0;

    const countLeafStats = (
      nodes: import('@mentor-ai/shared/types').ConceptHierarchyNode[]
    ): { completed: number; pending: number; total: number } => {
      let completed = 0,
        pending = 0,
        total = 0;
      for (const node of nodes) {
        if (node.children.length > 0) {
          const sub = countLeafStats(node.children);
          completed += sub.completed;
          pending += sub.pending;
          total += sub.total;
        } else if (node.status) {
          total++;
          if (node.status === 'completed') completed++;
          if (node.status === 'pending') pending++;
        }
      }
      return { completed, pending, total };
    };

    for (const domain of tree) {
      totalDomains++;
      const stats = countLeafStats(domain.children);
      pendingTasks += stats.pending;
      if (stats.total > 0 && stats.completed === stats.total) completedDomains++;
    }

    const progressPercent =
      totalDomains > 0 ? Math.round((completedDomains / totalDomains) * 100) : 0;
    return { totalDomains, completedDomains, pendingTasks, progressPercent };
  });

  // Next-step suggestion banner (D4)
  readonly nextStepSuggestion$ = signal<{
    message: string;
    actionLabel: string;
    actionCurriculumId?: string;
    secondaryLabel?: string;
  } | null>(null);
  private nextStepDismissTimer: ReturnType<typeof setTimeout> | null = null;

  private keyboardHandler = (e: KeyboardEvent) => this.handleKeyboardShortcut(e);

  ngOnInit(): void {
    document.addEventListener('keydown', this.keyboardHandler);
    this.setupWebSocket();

    // Use combineLatest so both params and queryParams resolve before acting.
    // This prevents a race condition where loadConversation() runs before
    // queryParams sets yoloPending/manualAutostartPending flags.
    combineLatest([this.route.params, this.route.queryParams])
      .pipe(takeUntilDestroyed(this.destroyRef), take(1))
      .subscribe(([params, queryParams]) => {
        // Set YOLO / autostart flags BEFORE loading conversation
        if (queryParams['yolo'] === 'true' && !this.isYoloMode$()) {
          this.isYoloMode$.set(true);
          this.yoloPending = true;
        }
        if (queryParams['autostart'] === 'true') {
          this.manualAutostartPending = true;
        }

        // Now load conversation — yoloPending is already set
        if (params['conversationId']) {
          this.loadConversation(params['conversationId']);
        }
      });

    // Continue listening for subsequent param changes (e.g. navigating between conversations)
    this.route.params.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((params) => {
      if (params['conversationId'] && this.activeConversationId$() !== params['conversationId']) {
        this.loadConversation(params['conversationId']);
      }
    });
  }

  ngAfterViewInit(): void {
    this.viewInit$.set(true);
  }

  ngOnDestroy(): void {
    document.removeEventListener('keydown', this.keyboardHandler);
    this.chatWsService.disconnect();
  }

  private handleKeyboardShortcut(e: KeyboardEvent): void {
    // Ctrl+N → New conversation
    if (e.ctrlKey && e.key === 'n') {
      e.preventDefault();
      this.createNewConversation();
    }
    // Escape → Close plan panel / dismiss error
    if (e.key === 'Escape') {
      if (this.showPlanOverlay$()) {
        this.rejectPlan();
      }
      this.errorMessage$.set(null);
    }
    // Ctrl+Shift+T → Tasks tab
    if (e.ctrlKey && e.shiftKey && e.key === 'T') {
      e.preventDefault();
      this.activeTab$.set('notes');
    }
    // Ctrl+Shift+C → Chat tab
    if (e.ctrlKey && e.shiftKey && e.key === 'C') {
      e.preventDefault();
      this.activeTab$.set('chat');
    }
  }

  async loadConversation(conversationId: string): Promise<void> {
    try {
      const conversation = await this.conversationService.getConversation(conversationId);
      this.activeConversation$.set(conversation);
      this.activeTab$.set('chat');
      // Reset transient UI state from any previous conversation
      this.isLoading$.set(false);
      this.isStreaming$.set(false);
      this.streamingContent$.set('');
      // Start YOLO execution if flagged from onboarding redirect
      if (this.yoloPending) {
        this.yoloPending = false;
        try {
          await this.chatWsService.waitForConnection();
          this.chatWsService.emitStartYolo(conversationId);
        } catch {
          this.showError('WebSocket konekcija neuspešna — YOLO mod nije mogao da se pokrene');
        }
      }
      // Auto-start manual workflow if flagged from onboarding redirect
      if (this.manualAutostartPending) {
        this.manualAutostartPending = false;
        try {
          await this.chatWsService.waitForConnection();
          this.autoStartManualWorkflow(conversationId);
        } catch {
          // Non-blocking — user can still start manually
        }
      }
    } catch {
      this.activeConversation$.set(null);
      this.showError('Greška pri učitavanju konverzacije');
    }
  }

  async createNewConversation(domain?: string): Promise<void> {
    // Auto-classification handles topic detection — no manual picker needed
    try {
      const title = domain ? `${domain} — Nova konverzacija` : undefined;
      const conversation = await this.conversationService.createConversation(title);
      await this.loadConversation(conversation.id);
      this.router.navigate(['/chat', conversation.id]);
      this.conceptTree?.loadTree();
    } catch {
      this.showError('Greška pri kreiranju konverzacije');
    }
  }

  async onTopicSelected(node: CurriculumNode | null): Promise<void> {
    this.showTopicPicker$.set(false);
    try {
      const conversation = await this.conversationService.createConversation(
        undefined,
        undefined,
        undefined,
        node?.id
      );
      await this.loadConversation(conversation.id);
      this.router.navigate(['/chat', conversation.id]);
      this.conceptTree?.loadTree();
    } catch {
      this.showError('Greška pri kreiranju konverzacije');
    }
  }

  onTopicPickerCancelled(): void {
    this.showTopicPicker$.set(false);
  }

  async createConversationUnderConcept(event: {
    conceptId: string;
    conceptName: string;
  }): Promise<void> {
    this.loadingConversationId$.set(event.conceptId);
    try {
      // conceptId here is actually the curriculumId from the tree
      const title = this.formatConversationTitle(event.conceptName);
      const conversation = await this.conversationService.createConversation(
        title,
        undefined,
        undefined,
        event.conceptId
      );
      this.newConversationIds$.update((s) => {
        const n = new Set(s);
        n.add(conversation.id);
        return n;
      });
      await this.loadConversation(conversation.id);
      this.router.navigate(['/chat', conversation.id]);
      this.conceptTree?.loadTree();
    } catch {
      this.showError('Greška pri kreiranju konverzacije');
    } finally {
      this.loadingConversationId$.set(null);
    }
  }

  selectConversation(conversationId: string): void {
    this.folderConceptIds$.set([]);
    this.folderConversationIds$.set([]);
    this.folderName$.set(null);
    this.activeTab$.set('chat');
    this.autoSelectTaskIds$.set([]);
    this.newConversationIds$.update((s) => {
      const n = new Set(s);
      n.delete(conversationId);
      return n;
    });
    this.router.navigate(['/chat', conversationId]);
  }

  /**
   * Toggles the persona selector visibility.
   */
  togglePersonaSelector(): void {
    this.showPersonaSelector$.update((show) => !show);
  }

  /**
   * Shows an error message to the user with auto-dismiss after 5 seconds.
   */
  private showError(message: string): void {
    this.errorMessage$.set(message);
    setTimeout(() => this.dismissError(), 5000);
  }

  /**
   * Dismisses the current error message.
   */
  dismissError(): void {
    this.errorMessage$.set(null);
  }

  /**
   * Handles citation click from chat messages.
   * During workflow execution: always opens panel, never navigates away.
   * Otherwise: navigates to concept conversation if available, or opens panel.
   */
  onSuggestedAction(action: SuggestedAction): void {
    switch (action.type) {
      case 'create_tasks':
        // Switch to tasks tab
        this.activeTab$.set('notes');
        break;
      case 'view_tasks':
        this.activeTab$.set('notes');
        break;
      case 'deep_dive':
      case 'explore_concept':
        // Send a follow-up message asking for deeper analysis
        this.sendMessage('Istraži ovu temu dublje. Daj detaljniju analizu.');
        break;
      case 'next_domain':
        if (action.payload?.['conceptId']) {
          this.selectedConceptId$.set(action.payload['conceptId'] as string);
        }
        break;
      case 'save_note':
        this.activeTab$.set('notes');
        break;
      case 'web_search':
        this.sendMessage('Pretraži web za više informacija o ovoj temi.');
        break;
      case 'run_workflow':
        this.activeTab$.set('notes');
        break;
      case 'score_task':
        this.activeTab$.set('notes');
        break;
    }
  }

  onCitationClick(citation: ConceptCitation | string): void {
    if (typeof citation === 'string') {
      // String citation — look up concept by name to open panel
      this.lookupConceptByName(citation);
      return;
    }

    // During workflow execution, never navigate away — just open the panel
    if (this.isExecutingWorkflow$()) {
      this.selectedConceptId$.set(citation.conceptId);
      return;
    }

    // Not executing — check for workflow conversation match
    const convs = this.createdConceptConversations$();
    const match = convs.find((c) => c.conceptId === citation.conceptId);
    if (match) {
      this.router.navigate(['/chat', match.conversationId]);
      return;
    }
    this.selectedConceptId$.set(citation.conceptId);
  }

  /**
   * Looks up a concept by name via API and opens the panel.
   */
  private async lookupConceptByName(name: string): Promise<void> {
    try {
      const response = await firstValueFrom(
        this.http.get<{ data: { id: string } }>(
          `/api/v1/knowledge/concepts/by-name/${encodeURIComponent(name)}`
        )
      );
      if (response?.data?.id) {
        this.selectedConceptId$.set(response.data.id);
      }
    } catch {
      // Concept not found — ignore
    }
  }

  /**
   * Closes the concept panel.
   */
  closeConceptPanel(): void {
    this.selectedConceptId$.set(null);
  }

  /**
   * Handles related concept click from the panel (Story 2.6).
   * Navigates to the selected related concept.
   */
  onRelatedConceptClick(conceptId: string): void {
    this.selectedConceptId$.set(conceptId);
  }

  /**
   * Handles "View in chat" click from a task in the Notes tab.
   * Switches to Chat tab and scrolls to the source message.
   */
  onViewMessage(event: { conversationId: string; messageId: string }): void {
    this.activeTab$.set('chat');
    // Allow the DOM to render the chat tab before scrolling
    setTimeout(() => {
      const el = document.getElementById(`msg-${event.messageId}`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('highlight-flash');
        setTimeout(() => el.classList.remove('highlight-flash'), 2000);
      }
    }, 100);
  }

  /**
   * Handles persona selection.
   * Updates the conversation's persona and hides the selector.
   */
  async onPersonaSelected(persona: Persona | null): Promise<void> {
    const conversationId = this.activeConversationId$();
    if (!conversationId) return;

    if (persona) {
      try {
        const updated = await this.conversationService.updatePersona(
          conversationId,
          persona.type as PersonaType
        );
        // Update the active conversation with new persona
        this.activeConversation$.update((conv) => {
          if (!conv) return conv;
          return { ...conv, personaType: updated.personaType };
        });
      } catch {
        this.showError('Greška pri ažuriranju persone');
      }
    }
    this.showPersonaSelector$.set(false);
  }

  async onConceptSelected(event: {
    conceptId: string | null;
    curriculumId: string;
    conceptName: string;
    isFolder: boolean;
    descendantConceptIds: string[];
    descendantConversationIds: string[];
  }): Promise<void> {
    if (event.isFolder) {
      // Folder mode — show aggregated tasks for all descendant concepts + conversations
      this.folderConceptIds$.set(event.descendantConceptIds);
      this.folderConversationIds$.set(event.descendantConversationIds);
      this.folderName$.set(event.conceptName);
      this.activeConversation$.set(null);
      this.activeTab$.set('notes');

      // Story 3.2: Compute domain stats
      // Completed = min(conversations, concepts) — each concept typically has 0-1 conversations
      const completedCount = Math.min(
        event.descendantConversationIds.length,
        event.descendantConceptIds.length
      );
      this.domainCompletedCount$.set(completedCount);
      // Pending = concepts minus completed (those without conversations)
      this.domainPendingCount$.set(Math.max(0, event.descendantConceptIds.length - completedCount));
      return;
    }

    // Leaf concept — clear folder mode, load conversation
    this.folderConceptIds$.set([]);
    this.folderConversationIds$.set([]);
    this.folderName$.set(null);
    try {
      const treeData = this.conceptTree?.treeData$();
      const conceptNode = this.findNodeByCurriculumId(treeData?.tree ?? [], event.curriculumId);

      if (conceptNode && conceptNode.conversations.length > 0) {
        const conv = conceptNode.conversations[0]!;
        await this.loadConversation(conv!.id);
        this.router.navigate(['/chat', conv!.id]);
        this.activeTab$.set('chat');
      } else {
        const title = this.formatConversationTitle(event.conceptName);
        const conversation = await this.conversationService.createConversation(
          title,
          undefined,
          undefined,
          event.curriculumId
        );
        this.newConversationIds$.update((s) => {
          const n = new Set(s);
          n.add(conversation.id);
          return n;
        });
        await this.loadConversation(conversation.id);
        this.router.navigate(['/chat', conversation.id]);
        this.conceptTree?.loadTree();
        this.activeTab$.set('chat');
      }
    } catch {
      this.showError('Greška pri učitavanju koncepta');
    }
  }

  private findNodeByCurriculumId(
    nodes: import('@mentor-ai/shared/types').ConceptHierarchyNode[],
    curriculumId: string
  ): import('@mentor-ai/shared/types').ConceptHierarchyNode | null {
    for (const node of nodes) {
      if (node.curriculumId === curriculumId) return node;
      const found = this.findNodeByCurriculumId(node.children, curriculumId);
      if (found) return found;
    }
    return null;
  }

  private formatConversationTitle(conceptName: string): string {
    const now = new Date();
    const date = now.toISOString().slice(0, 10);
    const time = now.toTimeString().slice(0, 5).replace(':', '-');
    return `${conceptName}_${date}_${time}`;
  }

  // ─── Workflow / Agent Execution ──────────────────────────────

  private async autoStartManualWorkflow(conversationId: string): Promise<void> {
    try {
      const notes = await this.notesApi.getByConversation(conversationId);
      const pendingTaskIds = notes
        .filter((n) => n.noteType === 'TASK' && n.status === 'PENDING')
        .map((n) => n.id);
      if (pendingTaskIds.length > 0) {
        this.onRunAgents(pendingTaskIds);
      }
    } catch {
      // Non-blocking — user can still start manually
    }
  }

  onRunAgents(taskIds: string[]): void {
    const conversationId = this.activeConversationId$();
    if (!conversationId) {
      this.showError('Nema aktivne konverzacije za pokretanje zadatka.');
      return;
    }
    if (taskIds.length === 0) return;
    this.isGeneratingPlan$.set(true);
    this.chatWsService.emitRunAgents(taskIds, conversationId);
    // Auto-scroll so the loading indicator is visible
    setTimeout(() => {
      const el = this.messagesContainer?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  onExecuteSingleTask(taskId: string): void {
    // Switch to chat tab so user sees the plan overlay
    this.activeTab$.set('chat');
    this.onRunAgents([taskId]);
  }

  private resultSubmissionTimeout: ReturnType<typeof setTimeout> | null = null;

  onSubmitTaskResult(taskId: string): void {
    this.submittingResultId$.set(taskId);
    this.taskResultStreamContent$.set('');
    this.chatWsService.emitSubmitTaskResult(taskId);

    // Safety timeout: clear submitting state if no response in 60s
    if (this.resultSubmissionTimeout) clearTimeout(this.resultSubmissionTimeout);
    this.resultSubmissionTimeout = setTimeout(() => {
      if (this.submittingResultId$() === taskId) {
        this.submittingResultId$.set(null);
        this.taskResultStreamContent$.set('');
        this.showError('Ocenjivanje rezultata je isteklo. Pokušajte ponovo.');
      }
    }, 60000);
  }

  /** Story 3.2: Start per-domain Brain execution (plan-first, manual) */
  async onRunBrain(): Promise<void> {
    const folderName = this.folderName$();
    const folderConceptIds = this.folderConceptIds$();
    if (!folderName || folderConceptIds.length === 0) return;

    try {
      // Create conversation context for the brain execution
      const title = `Brain: ${folderName}`;
      const conversation = await this.conversationService.createConversation(title);
      await this.loadConversation(conversation.id);

      // Fetch pending tasks for this domain's concepts
      const allNotes = await this.notesApi.getByConceptIds(folderConceptIds);
      const pendingTaskIds = allNotes
        .filter((n) => n.noteType === 'TASK' && n.status === 'PENDING')
        .map((n) => n.id);

      if (pendingTaskIds.length === 0) {
        this.showError('Nema zadataka na čekanju u ovom domenu.');
        return;
      }

      // Feed into existing plan flow (shows plan overlay → user approves → workflow executes)
      this.onRunAgents(pendingTaskIds);
    } catch {
      this.showError('Pokretanje Brain-a nije uspelo. Pokušajte ponovo.');
    }
  }

  /** Story 3.2: YOLO mode — autonomous execution without plan review */
  async onRunBrainYolo(): Promise<void> {
    const folderName = this.folderName$();
    if (!folderName) return;

    try {
      const title = `Brain: ${folderName}`;
      const conversation = await this.conversationService.createConversation(title);
      await this.loadConversation(conversation.id);
      this.isYoloMode$.set(true);
      this.chatWsService.emitStartDomainYolo(conversation.id, folderName);
    } catch {
      this.showError('Pokretanje YOLO režima nije uspelo.');
    }
  }

  getStepStatus(stepId: string): ExecutionPlanStep['status'] {
    return this.executionProgress$().get(stepId) ?? 'pending';
  }

  approvePlan(): void {
    const plan = this.currentPlan$();
    const conversationId = this.activeConversationId$();
    if (!plan || !conversationId) return;
    this.isExecutingWorkflow$.set(true);
    this.planCollapsed$.set(true); // Auto-collapse plan panel during execution
    this.chatWsService.emitWorkflowApproval(plan.planId, true, conversationId);

    // Add entry to workflow status bar
    const firstConcept = plan.steps[0]?.conceptName ?? 'Workflow';
    this.workflowHistory$.update((entries) => [
      ...entries,
      {
        planId: plan.planId,
        title:
          plan.conceptOrder.length > 1
            ? `${firstConcept} (+${plan.conceptOrder.length - 1})`
            : firstConcept,
        totalSteps: plan.steps.length,
        completedSteps: 0,
        currentStepTitle: null,
        status: 'executing' as const,
      },
    ]);
  }

  rejectPlan(): void {
    const plan = this.currentPlan$();
    const conversationId = this.activeConversationId$();
    if (!plan || !conversationId) return;
    this.chatWsService.emitWorkflowApproval(plan.planId, false, conversationId);
    this.closePlanOverlay();
  }

  cancelExecution(): void {
    const planId = this.activePlanId$() ?? this.currentPlan$()?.planId;
    const conversationId = this.activeConversationId$();
    if (!planId || !conversationId) return;
    this.chatWsService.emitWorkflowCancel(planId, conversationId);
  }

  togglePlanCollapse(): void {
    this.planCollapsed$.update((v) => !v);
  }

  private closePlanOverlay(): void {
    this.showPlanOverlay$.set(false);
    this.currentPlan$.set(null);
    this.activePlanId$.set(null);
    this.executionProgress$.set(new Map());
    this.isExecutingWorkflow$.set(false);
    this.currentStepTitle$.set(null);
    this.currentStepIndex$.set(0);
    this.totalStepsCount$.set(0);
    this.completedStepsCount$.set(0);
    this.createdConceptConversations$.set([]);
    this.awaitingConfirmation$.set(false);
    this.nextStepInfo$.set(null);
    this.userStepInput$.set('');
    this.isGeneratingPlan$.set(false);
    this.allowWorkflowInput$.set(false);
    this.currentWorkflowStepInput$.set(null);
    this.previousConversationId$.set(null);
  }

  async sendMessage(content: string): Promise<void> {
    const conversationId = this.activeConversationId$();
    if (!conversationId || !content.trim()) return;

    // Auto-switch to Chat tab when sending from Tasks tab
    if (this.activeTab$() !== 'chat') {
      this.activeTab$.set('chat');
    }

    // Intercept: if a workflow step is awaiting text input, route to step-continue
    const stepInput = this.currentWorkflowStepInput$();
    if (stepInput && stepInput.inputType === 'text') {
      // Add user message to UI
      const userMsg: Message = {
        id: `wf_user_${Date.now()}`,
        conversationId,
        role: MessageRole.USER,
        content,
        confidenceScore: null,
        confidenceFactors: null,
        createdAt: new Date().toISOString(),
      };
      this.activeConversation$.update((conv) => {
        if (!conv) return conv;
        return { ...conv, messages: [...conv.messages, userMsg] };
      });

      // Send as step continuation and block further input until next step arrives
      this.chatWsService.emitStepContinue(stepInput.planId, conversationId, content);
      this.currentWorkflowStepInput$.set(null);
      this.allowWorkflowInput$.set(false);
      this.isLoading$.set(true);
      return;
    }

    this.isLoading$.set(true);
    this.streamingContent$.set('');

    // Add user message to UI immediately
    const userMessage: Message = {
      id: `temp_${Date.now()}`,
      conversationId,
      role: MessageRole.USER,
      content,
      confidenceScore: null,
      confidenceFactors: null,
      createdAt: new Date().toISOString(),
    };

    this.activeConversation$.update((conv) => {
      if (!conv) return conv;
      return {
        ...conv,
        messages: [...conv.messages, userMessage],
      };
    });

    // Send via WebSocket
    const sent = this.chatWsService.sendMessage(conversationId, content);
    if (!sent) {
      this.isLoading$.set(false);
      this.showError('Konekcija sa serverom nije uspostavljena. Osvežite stranicu.');
    }
  }

  private setupWebSocket(): void {
    this.chatWsService.connect();

    // Track connection state changes for toast notifications
    let wasConnected = false;
    const checkConnection = setInterval(() => {
      const state = this.chatWsService.connectionState$();
      if (state === 'disconnected' && wasConnected) {
        this.disconnectToast$.set('Veza prekinuta. Pokušavam ponovo...');
      } else if (state === 'reconnecting') {
        this.disconnectToast$.set('Ponovno povezivanje...');
      } else if (state === 'connected' && !wasConnected && this.disconnectToast$()) {
        const wasWorkflow = this.chatWsService.wasWorkflowActive$();
        if (wasWorkflow) {
          this.disconnectToast$.set('Veza obnovljena. Workflow je možda nastavljen u pozadini.');
          this.chatWsService.wasWorkflowActive$.set(false);
        } else {
          this.disconnectToast$.set('Veza obnovljena.');
        }
        setTimeout(() => this.disconnectToast$.set(null), 5000);
      }
      wasConnected = state === 'connected';
      // Keep workflow running state in sync
      this.chatWsService.setWorkflowRunning(this.isExecutingWorkflow$() || this.isYoloMode$());

      // Surface emit errors
      const emitErr = this.chatWsService.lastEmitError$();
      if (emitErr) {
        this.disconnectToast$.set(emitErr);
        this.chatWsService.lastEmitError$.set(null);
        setTimeout(() => this.disconnectToast$.set(null), 5000);
      }

      // Surface notes API errors
      const notesErr = this.notesApi.lastError$();
      if (notesErr) {
        this.disconnectToast$.set(notesErr);
        this.notesApi.lastError$.set(null);
        setTimeout(() => this.disconnectToast$.set(null), 5000);
      }
    }, 500);
    this.destroyRef.onDestroy(() => clearInterval(checkConnection));

    this.chatWsService.onMessageReceived((data) => {
      // Update user message ID with real one from server
      this.activeConversation$.update((conv) => {
        if (!conv) return conv;
        const messages = conv.messages.map((msg, idx, arr) => {
          // Find last user message with temp ID
          const isLastTempUser =
            msg.role === MessageRole.USER &&
            msg.id.startsWith('temp_') &&
            !arr
              .slice(idx + 1)
              .some((m) => m.role === MessageRole.USER && m.id.startsWith('temp_'));
          if (isLastTempUser) {
            return { ...msg, id: data.messageId };
          }
          return msg;
        });
        return { ...conv, messages };
      });
      this.isStreaming$.set(true);
    });

    this.chatWsService.onMessageChunk((data) => {
      this.streamingContent$.update((content) => content + data.content);
    });

    this.chatWsService.onComplete((data) => {
      // Extract metadata (Story 2.5 confidence, 2.6 citations, 2.7 memory, 3.11 web sources)
      const confidence = data.metadata?.['confidence'] as
        | {
            score?: number;
            factors?: ConfidenceFactor[];
          }
        | undefined;
      const citations = (data.metadata?.['citations'] as ConceptCitation[] | undefined) ?? [];
      const memoryAttributions =
        (data.metadata?.['memoryAttributions'] as MemoryAttribution[] | undefined) ?? [];
      const webSearchSources =
        (data.metadata?.['webSearchSources'] as WebSearchSource[] | undefined) ?? [];
      const suggestedActions =
        (data.metadata?.['suggestedActions'] as SuggestedAction[] | undefined) ?? [];

      const aiMessage: Message = {
        id: data.messageId,
        conversationId: this.activeConversationId$() ?? '',
        role: MessageRole.ASSISTANT,
        content: data.fullContent,
        confidenceScore: confidence?.score ?? null,
        confidenceFactors: confidence?.factors ?? null,
        citations: citations.length > 0 ? citations : undefined,
        memoryAttributions: memoryAttributions.length > 0 ? memoryAttributions : undefined,
        webSearchSources: webSearchSources.length > 0 ? webSearchSources : undefined,
        suggestedActions: suggestedActions.length > 0 ? suggestedActions : undefined,
        createdAt: new Date().toISOString(),
      };

      this.activeConversation$.update((conv) => {
        if (!conv) return conv;
        return {
          ...conv,
          messages: [...conv.messages, aiMessage],
        };
      });

      this.isLoading$.set(false);
      this.isStreaming$.set(false);
      this.streamingContent$.set('');
    });

    this.chatWsService.onError((error) => {
      this.isLoading$.set(false);
      this.isStreaming$.set(false);
      const errorType = error.type ? `[${error.type}] ` : '';
      this.showError(errorType + (error.message || 'Poruka nije poslata. Pokušajte ponovo.'));
    });

    this.chatWsService.onNotesUpdated(() => {
      // Refresh the notes component if it's currently visible
      this.conversationNotes?.loadNotes();
    });

    this.chatWsService.onTasksCreatedForExecution((data) => {
      if (data.conversationId !== this.activeConversationId$()) return;
      // Auto-select created tasks, switch to notes tab, and reload
      this.autoSelectTaskIds$.set(data.taskIds);
      this.activeTab$.set('notes');
      this.conversationNotes?.loadNotes();

      // Show visible feedback in chat
      const count = data.taskCount ?? data.taskIds.length;
      const taskMsg: Message = {
        id: `tasks_created_${Date.now()}`,
        conversationId: data.conversationId,
        role: MessageRole.ASSISTANT,
        content: `**Kreirano ${count} ${count === 1 ? 'zadatak' : 'zadataka'}!** Pogledajte tab Zadaci za detalje i pokretanje.`,
        confidenceScore: null,
        confidenceFactors: null,
        createdAt: new Date().toISOString(),
      };
      this.activeConversation$.update((conv) => {
        if (!conv) return conv;
        return { ...conv, messages: [...conv.messages, taskMsg] };
      });
    });

    this.chatWsService.onConceptDetected((data) => {
      // Refresh sidebar tree when a conversation is auto-classified
      this.conceptTree?.loadTree();
      // Update active conversation's conceptId if it matches
      if (data.conversationId === this.activeConversationId$()) {
        this.activeConversation$.update((conv) => {
          if (!conv) return conv;
          return { ...conv, conceptId: data.conceptId };
        });
      }
    });

    // ─── Workflow Events ────────────────────────────────────────

    this.chatWsService.onPlanReady((payload) => {
      if (payload.conversationId !== this.activeConversationId$()) return;
      this.isGeneratingPlan$.set(false);
      this.executingTaskId$.set(null);
      this.currentPlan$.set(payload.plan);
      this.activePlanId$.set(payload.plan.planId);
      this.executionProgress$.set(new Map());
      this.isExecutingWorkflow$.set(false);
      this.showPlanOverlay$.set(true);
    });

    this.chatWsService.onConversationsCreated((payload) => {
      if (payload.originalConversationId !== this.activeConversationId$()) return;
      // Store created conversations for completion summary links
      this.createdConceptConversations$.set(payload.conversations);
      // Mark created conversations as new (blue dot)
      this.newConversationIds$.update((s) => {
        const n = new Set(s);
        payload.conversations.forEach((c) => n.add(c.conversationId));
        return n;
      });
      // Refresh tree so new per-concept conversations appear
      this.conceptTree?.loadTree();
    });

    this.chatWsService.onStepProgress((payload) => {
      if (payload.conversationId !== this.activeConversationId$()) return;

      // Auto-execute path: set executing state and planId on first step-progress
      if (!this.isExecutingWorkflow$()) {
        this.isExecutingWorkflow$.set(true);
      }
      if (!this.activePlanId$() && payload.planId) {
        this.activePlanId$.set(payload.planId);
      }

      this.executionProgress$.update((map) => {
        const next = new Map(map);
        next.set(payload.stepId, payload.status);
        return next;
      });

      // Update workflow status bar entry
      if (payload.planId) {
        this.workflowHistory$.update((entries) =>
          entries.map((e) =>
            e.planId === payload.planId
              ? {
                  ...e,
                  currentStepTitle:
                    payload.status === 'in_progress'
                      ? (payload.stepTitle ?? e.currentStepTitle)
                      : e.currentStepTitle,
                  completedSteps:
                    payload.status === 'completed' || payload.status === 'failed'
                      ? e.completedSteps + 1
                      : e.completedSteps,
                }
              : e
          )
        );
      }

      // Update inline progress indicator
      if (payload.totalSteps != null) {
        this.totalStepsCount$.set(payload.totalSteps);
      }

      if (payload.status === 'in_progress') {
        // Update current step info
        this.currentStepTitle$.set(payload.stepTitle ?? 'Izvršavanje...');
        if (payload.stepIndex != null) {
          this.currentStepIndex$.set(payload.stepIndex);
        }

        // Add step-start status message to chat
        const stepLabel = payload.stepTitle ?? 'Korak';
        const stepNum = (payload.stepIndex ?? 0) + 1;
        const total = payload.totalSteps ?? 0;
        const statusMessage: Message = {
          id: `wf_status_${payload.stepId}`,
          conversationId: this.activeConversationId$() ?? '',
          role: MessageRole.ASSISTANT,
          content: `**Izvršavam korak ${stepNum}/${total}:** ${stepLabel}`,
          confidenceScore: null,
          confidenceFactors: null,
          createdAt: new Date().toISOString(),
        };
        this.activeConversation$.update((conv) => {
          if (!conv) return conv;
          return { ...conv, messages: [...conv.messages, statusMessage] };
        });
      }

      // If step completed with content — message rendering now handled by onStepMessage handler (F1 fix)
      // Only update progress counters and tree here
      if (payload.status === 'completed' && payload.content) {
        this.completedStepsCount$.update((c) => c + 1);
        this.conceptTree?.loadTree();
        this.conversationNotes?.loadNotes();

        // Show "preparing next step" transition if more steps remain
        const completed = this.completedStepsCount$();
        const total = this.totalStepsCount$();
        if (completed < total) {
          this.currentStepTitle$.set('Pripremam sledeći korak...');
        }
      }

      if (payload.status === 'completed' && !payload.content) {
        this.completedStepsCount$.update((c) => c + 1);
        this.conceptTree?.loadTree();
        this.conversationNotes?.loadNotes();
        // Still show transition
        const completed = this.completedStepsCount$();
        const total = this.totalStepsCount$();
        if (completed < total) {
          this.currentStepTitle$.set('Pripremam sledeći korak...');
        }
      }

      if (payload.status === 'failed') {
        this.completedStepsCount$.update((c) => c + 1);
        this.conceptTree?.loadTree();
        this.conversationNotes?.loadNotes();
      }
    });

    this.chatWsService.onWorkflowComplete((payload) => {
      if (payload.conversationId !== this.activeConversationId$()) return;

      // Build completion summary with links to concept conversations
      const statusLabel =
        payload.status === 'completed'
          ? 'Završeno'
          : payload.status === 'cancelled'
            ? 'Otkazano'
            : 'Greška';
      const conceptConvs = this.createdConceptConversations$();
      let summaryContent = `**${statusLabel}!** Izvršeno ${payload.completedSteps}/${payload.totalSteps} koraka.`;

      if (conceptConvs.length > 0) {
        summaryContent += '\n\n**Rezultati po konceptima:**';
        conceptConvs.forEach((c, i) => {
          summaryContent += `\n${i + 1}. [[${c.conceptName}]]`;
        });
        summaryContent +=
          '\n\nKliknite na koncept ili odaberite konverzaciju u drvetu sa leve strane da pregledate rezultate.';
      }

      const summaryMessage: Message = {
        id: `wf_summary_${payload.planId}`,
        conversationId: this.activeConversationId$() ?? '',
        role: MessageRole.ASSISTANT,
        content: summaryContent,
        confidenceScore: null,
        confidenceFactors: null,
        createdAt: new Date().toISOString(),
      };
      this.activeConversation$.update((conv) => {
        if (!conv) return conv;
        return { ...conv, messages: [...conv.messages, summaryMessage] };
      });

      // Reset inline progress
      this.currentStepTitle$.set(null);
      this.currentStepIndex$.set(0);
      this.totalStepsCount$.set(0);
      this.completedStepsCount$.set(0);

      this.closePlanOverlay();
      this.conversationNotes?.loadNotes();
      this.conceptTree?.loadTree();

      // Update workflow status bar entry
      if (payload.planId) {
        const finalStatus =
          payload.status === 'completed'
            ? ('completed' as const)
            : payload.status === 'cancelled'
              ? ('cancelled' as const)
              : ('failed' as const);
        this.workflowHistory$.update((entries) =>
          entries.map((e) =>
            e.planId === payload.planId
              ? { ...e, status: finalStatus, completedSteps: payload.completedSteps }
              : e
          )
        );

        // Auto-clear completed/cancelled entries after 5 seconds (with CSS fade animation)
        setTimeout(() => {
          this.workflowHistory$.update((entries) =>
            entries.filter((e) => e.planId !== payload.planId)
          );
        }, 5000);
      }

      // D4: Suggest next step after successful workflow
      if (payload.status === 'completed') {
        setTimeout(() => this.suggestNextStep(), 1500);
      }
    });

    this.chatWsService.onWorkflowError((payload) => {
      if (payload.conversationId !== this.activeConversationId$()) return;
      this.closePlanOverlay();
      // Clear YOLO / execution state so the UI doesn't get stuck
      this.isYoloMode$.set(false);
      this.isExecutingWorkflow$.set(false);
      this.yoloProgress$.set(null);
      this.showError(payload.message ?? 'Izvršavanje workflow-a neuspešno');
    });

    // ─── Task AI Execution Events ───────────────────────────────

    this.chatWsService.onTaskAiStart((data) => {
      if (data.conversationId && data.conversationId !== this.activeConversationId$()) return;
      // Confirm execution state — ensure executingTaskId is set even if click handler missed
      if (!this.executingTaskId$()) {
        this.executingTaskId$.set(data.taskId);
        this.isStreaming$.set(true);
        this.streamingContent$.set('');
      }
    });

    this.chatWsService.onTaskAiChunk((data) => {
      if (data.conversationId && data.conversationId !== this.activeConversationId$()) return;
      this.streamingContent$.update((content) => content + data.content);
      this.taskExecutionStreamContent$.update((content) => content + data.content);
    });

    this.chatWsService.onTaskAiComplete((data) => {
      if (data.conversationId !== this.activeConversationId$()) return;
      this.isStreaming$.set(false);
      this.streamingContent$.set('');
      this.taskExecutionStreamContent$.set('');
      this.executingTaskId$.set(null);
      this.conversationNotes?.loadNotes();
      // Reload conversation to show the saved AI message
      const convId = this.activeConversationId$();
      if (convId) {
        this.loadConversation(convId);
      }
    });

    this.chatWsService.onTaskAiError((data) => {
      if (data.conversationId && data.conversationId !== this.activeConversationId$()) return;
      this.isStreaming$.set(false);
      this.streamingContent$.set('');
      this.taskExecutionStreamContent$.set('');
      this.executingTaskId$.set(null);
      this.showError(data.message ?? 'Izvršavanje zadatka neuspešno');
    });

    // ─── Task Result Submission Events (Story 3.12) ─────────────

    this.chatWsService.onTaskResultChunk((data) => {
      if (data.conversationId && data.conversationId !== this.activeConversationId$()) return;
      this.taskResultStreamContent$.update((content) => content + data.content);
    });

    this.chatWsService.onTaskResultComplete((data) => {
      if (data.conversationId && data.conversationId !== this.activeConversationId$()) return;
      if (this.resultSubmissionTimeout) {
        clearTimeout(this.resultSubmissionTimeout);
        this.resultSubmissionTimeout = null;
      }
      this.submittingResultId$.set(null);
      this.taskResultStreamContent$.set('');
      this.conversationNotes?.loadNotes();
    });

    this.chatWsService.onTaskResultError((data) => {
      if (data.conversationId && data.conversationId !== this.activeConversationId$()) return;
      if (this.resultSubmissionTimeout) {
        clearTimeout(this.resultSubmissionTimeout);
        this.resultSubmissionTimeout = null;
      }
      this.submittingResultId$.set(null);
      this.taskResultStreamContent$.set('');
      this.showError(data.message ?? 'Slanje rezultata neuspešno');
    });

    this.chatWsService.onStepAwaitingConfirmation((payload) => {
      if (payload.conversationId !== this.activeConversationId$()) return;
      this.activePlanId$.set(payload.planId);

      // During auto-execution after plan approval, skip the awaiting-confirmation UI
      if (this.isExecutingWorkflow$()) return;

      this.awaitingConfirmation$.set(true);
      this.nextStepInfo$.set(payload.nextStep);
      this.userStepInput$.set('');
    });

    // ─── Interactive Workflow Step Events (Task 6) ───────────────

    this.chatWsService.onStepAwaitingInput((payload: WorkflowStepAwaitingInputPayload) => {
      if (payload.conversationId !== this.activeConversationId$()) return;

      // Auto-continue confirmation steps so workflow flows automatically after plan approval
      if (payload.inputType === 'confirmation' && this.isExecutingWorkflow$()) {
        setTimeout(() => {
          this.chatWsService.emitStepContinue(payload.planId, payload.conversationId);
        }, 300);
        return;
      }

      // For 'text' input types, show the interactive input UI
      this.currentWorkflowStepInput$.set(payload);
      this.allowWorkflowInput$.set(payload.inputType === 'text');
      this.isLoading$.set(false); // Unblock input for next step
    });

    this.chatWsService.onStepMessage((payload: WorkflowStepMessagePayload) => {
      if (payload.conversationId !== this.activeConversationId$()) return;
      const stepMessage: Message = {
        id: payload.messageId,
        conversationId: payload.conversationId,
        role: MessageRole.ASSISTANT,
        content: payload.content,
        confidenceScore: null,
        confidenceFactors: null,
        createdAt: new Date().toISOString(),
      };
      this.activeConversation$.update((conv) => {
        if (!conv) return conv;
        return { ...conv, messages: [...conv.messages, stepMessage] };
      });
    });

    this.chatWsService.onNavigateToConversation((_payload: WorkflowNavigatePayload) => {
      // Suppress auto-navigation during workflow execution.
      // User stays on original conversation to see step-progress events in real-time.
      // After completion, summary message includes links to per-concept conversations.
    });

    // ─── YOLO Mode Events ───────────────────────────────────────

    this.chatWsService.onYoloProgress((payload) => {
      if (payload.conversationId !== this.activeConversationId$()) return;
      this.yoloProgress$.set(payload);
      this.isExecutingWorkflow$.set(true);
      // Auto-scroll activity log to latest entry (AC4)
      if (this.showYoloActivityLog$() && this.yoloLogContainer?.nativeElement) {
        setTimeout(() => {
          const el = this.yoloLogContainer?.nativeElement;
          if (el) el.scrollTop = el.scrollHeight;
        });
      }
    });

    this.chatWsService.onYoloComplete((payload) => {
      if (payload.conversationId !== this.activeConversationId$()) return;
      this.yoloProgress$.set(null);
      this.isYoloMode$.set(false);
      this.isExecutingWorkflow$.set(false);
      this.conversationNotes?.loadNotes();
      this.conceptTree?.loadTree();
      // D4: Suggest next step after YOLO completion
      setTimeout(() => this.suggestNextStep(), 1500);
    });

    this.chatWsService.onTasksDiscovered(() => {
      this.conceptTree?.loadTree();
    });
  }

  continueWorkflow(): void {
    const planId = this.activePlanId$();
    const convId = this.activeConversationId$();
    if (!planId || !convId) return;

    const input = this.userStepInput$().trim() || undefined;
    this.chatWsService.emitStepContinue(planId, convId, input);
    this.awaitingConfirmation$.set(false);
    this.nextStepInfo$.set(null);
    this.userStepInput$.set('');
  }

  continueWorkflowStep(): void {
    const stepInput = this.currentWorkflowStepInput$();
    const convId = this.activeConversationId$();
    if (!stepInput || !convId) return;

    this.chatWsService.emitStepContinue(stepInput.planId, convId);
    this.currentWorkflowStepInput$.set(null);
    this.allowWorkflowInput$.set(false);
  }

  returnToPreviousConversation(): void {
    const prevId = this.previousConversationId$();
    if (!prevId) return;
    this.previousConversationId$.set(null);
    this.router.navigate(['/chat', prevId]);
  }

  toggleYoloActivityLog(): void {
    this.showYoloActivityLog$.update((v) => !v);
  }

  /** D4: Show next-step suggestion after workflow completion */
  private suggestNextStep(): void {
    const tree = this.conceptTree?.treeData$()?.tree ?? [];
    if (tree.length === 0) return;

    // Find first domain with pending tasks
    for (const domain of tree) {
      const hasPending = this.domainHasPending(domain);
      if (hasPending) {
        this.nextStepSuggestion$.set({
          message: `Preporučujem: ${domain.label} — ima zadatke na čekanju.`,
          actionLabel: `Otvori ${domain.label} →`,
          actionCurriculumId: domain.curriculumId,
          secondaryLabel: 'Pokaži sve domene',
        });
        // Auto-dismiss after 60s
        if (this.nextStepDismissTimer) clearTimeout(this.nextStepDismissTimer);
        this.nextStepDismissTimer = setTimeout(() => this.nextStepSuggestion$.set(null), 60000);
        return;
      }
    }

    // No pending domains — suggest reviewing scores
    this.nextStepSuggestion$.set({
      message: 'Svi zadaci su završeni. Pregledajte rezultate ili započnite novi koncept.',
      actionLabel: 'Pogledaj zadatke',
    });
    if (this.nextStepDismissTimer) clearTimeout(this.nextStepDismissTimer);
    this.nextStepDismissTimer = setTimeout(() => this.nextStepSuggestion$.set(null), 60000);
  }

  private domainHasPending(node: import('@mentor-ai/shared/types').ConceptHierarchyNode): boolean {
    if (node.status === 'pending') return true;
    return node.children.some((child) => this.domainHasPending(child));
  }

  dismissNextStep(): void {
    this.nextStepSuggestion$.set(null);
    if (this.nextStepDismissTimer) {
      clearTimeout(this.nextStepDismissTimer);
      this.nextStepDismissTimer = null;
    }
  }

  onNextStepAction(): void {
    const suggestion = this.nextStepSuggestion$();
    if (!suggestion) return;
    if (suggestion.actionCurriculumId) {
      // Navigate to domain folder via onConceptSelected
      const tree = this.conceptTree?.treeData$()?.tree ?? [];
      const domain = tree.find((d) => d.curriculumId === suggestion.actionCurriculumId);
      if (domain) {
        const conceptIds = this.collectAllConceptIds(domain);
        const conversationIds = this.collectAllConversationIds(domain);
        this.onConceptSelected({
          conceptId: null,
          curriculumId: domain.curriculumId,
          conceptName: domain.label,
          isFolder: true,
          descendantConceptIds: conceptIds,
          descendantConversationIds: conversationIds,
        });
      }
    } else {
      // Default: switch to notes tab
      this.activeTab$.set('notes');
    }
    this.dismissNextStep();
  }

  private collectAllConceptIds(
    node: import('@mentor-ai/shared/types').ConceptHierarchyNode
  ): string[] {
    const ids: string[] = [];
    if (node.conceptId) ids.push(node.conceptId);
    for (const child of node.children) ids.push(...this.collectAllConceptIds(child));
    return ids;
  }

  private collectAllConversationIds(
    node: import('@mentor-ai/shared/types').ConceptHierarchyNode
  ): string[] {
    const ids: string[] = [];
    for (const conv of node.conversations) ids.push(conv.id);
    for (const child of node.children) ids.push(...this.collectAllConversationIds(child));
    return ids;
  }
}
