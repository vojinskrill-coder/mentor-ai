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
import { AuthService } from '../../core/auth/auth.service';
import { ChatMessageComponent } from './components/chat-message.component';
import { ChatInputComponent, ChatMessagePayload } from './components/chat-input.component';
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
import { FeatureTourComponent } from './components/feature-tour.component';
import type { CurriculumNode } from '@mentor-ai/shared/types';

interface WorkflowStatusEntry {
  planId: string;
  conversationId: string;
  taskIds: string[];
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
    FeatureTourComponent,
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
        transition:
          width 0.25s ease,
          min-width 0.25s ease;
        overflow: hidden;
      }
      .sidebar.collapsed {
        width: 0;
        min-width: 0;
        border-right: none;
      }
      .sidebar-toggle {
        background: none;
        border: none;
        color: #9e9e9e;
        cursor: pointer;
        padding: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        flex-shrink: 0;
      }
      .sidebar-toggle:hover {
        color: #fafafa;
        background: #1a1a1a;
      }
      .sidebar-toggle svg {
        width: 20px;
        height: 20px;
      }
      .sidebar-expand-btn {
        position: fixed;
        top: 12px;
        left: 12px;
        z-index: 50;
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        color: #9e9e9e;
        cursor: pointer;
        padding: 8px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
        transition: all 0.2s;
      }
      .sidebar-expand-btn:hover {
        color: #fafafa;
        background: #242424;
        border-color: #3b82f6;
      }
      .sidebar-expand-btn svg {
        width: 20px;
        height: 20px;
      }
      .sidebar-overlay {
        display: none;
      }
      @media (max-width: 768px) {
        .sidebar {
          position: fixed;
          top: 0;
          left: 0;
          height: 100vh;
          z-index: 100;
          box-shadow: 4px 0 16px rgba(0, 0, 0, 0.4);
        }
        .sidebar.collapsed {
          width: 0;
          box-shadow: none;
        }
        .sidebar-overlay {
          display: block;
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.5);
          z-index: 99;
        }
        .chat-main {
          min-width: 0 !important;
        }
      }
      .sidebar-header {
        height: 48px;
        display: flex;
        align-items: center;
        justify-content: space-between;
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
      .new-chat-btn:hover:not(:disabled) {
        background: #2563eb;
      }
      .new-chat-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
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
        color: #9e9e9e;
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
        color: #9e9e9e;
        font-size: 13px;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .switch-btn:hover:not(:disabled) {
        color: #fafafa;
      }
      .switch-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      .header-actions {
        display: flex;
        align-items: center;
        gap: 12px;
      }

      /* Connection indicator */
      .connection-dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .connection-label {
        font-size: 11px;
        color: #707070;
        transition: color 0.2s;
      }
      .connection-label.connected {
        color: #22c55e;
      }
      .connection-label.disconnected {
        color: #ef4444;
      }
      .connection-label.reconnecting {
        color: #f59e0b;
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

      .chat-messages-wrapper {
        position: relative;
        flex: 1;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      .chat-messages {
        flex: 1;
        overflow-y: auto;
        padding: 24px;
        scroll-behavior: smooth;
      }
      .messages-container {
        max-width: 768px;
        margin: 0 auto;
      }
      .scroll-to-bottom {
        position: absolute;
        bottom: 16px;
        left: 50%;
        transform: translateX(-50%);
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: #242424;
        border: 1px solid #3a3a3a;
        color: #fafafa;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        transition: all 0.2s;
        z-index: 10;
        animation: scrollBtnFadeIn 0.2s ease-out;
      }
      @keyframes scrollBtnFadeIn {
        from {
          opacity: 0;
          transform: translateX(-50%) translateY(8px);
        }
        to {
          opacity: 1;
          transform: translateX(-50%) translateY(0);
        }
      }
      .scroll-to-bottom:hover {
        background: #3a3a3a;
        border-color: #3b82f6;
      }
      .scroll-to-bottom svg {
        width: 18px;
        height: 18px;
      }
      .stop-generation-btn {
        position: absolute;
        bottom: 16px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 8px 16px;
        background: #242424;
        border: 1px solid #3a3a3a;
        border-radius: 20px;
        color: #fafafa;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        font-family: inherit;
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
        transition: all 0.2s;
        z-index: 10;
        animation: scrollBtnFadeIn 0.2s ease-out;
      }
      .stop-generation-btn:hover {
        background: #3a3a3a;
        border-color: #ef4444;
      }
      .stop-generation-btn svg {
        width: 14px;
        height: 14px;
      }
      .empty-state {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: emptyFadeIn 0.5s ease-out;
      }
      @keyframes emptyFadeIn {
        from {
          opacity: 0;
          transform: translateY(16px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }
      .empty-content {
        text-align: center;
        max-width: 560px;
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
        background: #2563eb;
      }
      .suggestion-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 12px;
        margin-top: 24px;
      }
      .suggestion-card {
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 12px;
        padding: 16px;
        text-align: left;
        cursor: pointer;
        font-family: inherit;
        transition: all 0.2s;
      }
      .suggestion-card:hover {
        background: #242424;
        border-color: #3b82f6;
        transform: translateY(-2px);
      }
      .suggestion-card-icon {
        font-size: 20px;
        margin-bottom: 8px;
      }
      .suggestion-card-title {
        font-size: 13px;
        font-weight: 500;
        color: #fafafa;
        margin-bottom: 4px;
      }
      .suggestion-card-desc {
        font-size: 12px;
        color: #9e9e9e;
        line-height: 1.4;
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
        animation: panelSlideDown 0.2s ease;
      }
      @keyframes panelSlideDown {
        from {
          opacity: 0;
          max-height: 0;
          padding-top: 0;
          padding-bottom: 0;
        }
        to {
          opacity: 1;
          max-height: 200px;
          padding-top: 12px;
          padding-bottom: 12px;
        }
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
        border-left: 3px solid #ef4444;
        padding: 12px 16px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        gap: 12px;
        max-width: 400px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
        animation: toastSlideIn 0.3s ease-out;
        font-size: 13px;
        color: #fca5a5;
      }
      .info-toast {
        position: fixed;
        top: 16px;
        right: 16px;
        z-index: 9999;
        background: #1a1a1a;
        border: 1px solid #3b82f6;
        border-left: 3px solid #3b82f6;
        padding: 12px 16px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        gap: 12px;
        max-width: 400px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
        animation: toastSlideIn 0.3s ease-out;
        font-size: 13px;
        color: #93c5fd;
      }
      .success-toast {
        position: fixed;
        top: 16px;
        right: 16px;
        z-index: 9999;
        background: #1a1a1a;
        border: 1px solid #22c55e;
        border-left: 3px solid #22c55e;
        padding: 12px 16px;
        border-radius: 8px;
        display: flex;
        align-items: center;
        gap: 12px;
        max-width: 400px;
        box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
        animation: toastSlideIn 0.3s ease-out;
        font-size: 13px;
        color: #86efac;
      }
      @keyframes toastSlideIn {
        from {
          opacity: 0;
          transform: translateX(100%);
        }
        to {
          opacity: 1;
          transform: translateX(0);
        }
      }
      .toast-dismiss {
        background: none;
        border: none;
        color: #707070;
        cursor: pointer;
        padding: 2px;
        font-size: 16px;
        line-height: 1;
        margin-left: auto;
        flex-shrink: 0;
      }
      .toast-dismiss:hover {
        color: #fafafa;
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
        color: #9e9e9e;
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
        color: #9e9e9e;
        font-size: 13px;
        cursor: pointer;
      }
      .tab:hover {
        color: #d4d4d4;
      }
      .tab.active {
        color: #fafafa;
        border-bottom-color: #3b82f6;
        font-weight: 600;
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
        color: #9e9e9e;
        white-space: nowrap;
      }
      .brain-stat strong {
        color: #fafafa;
      }
      .auto-ai-toggle {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-left: auto;
      }
      .auto-ai-label {
        color: #707070;
        font-size: 11px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .toggle-track {
        width: 36px;
        height: 20px;
        border-radius: 10px;
        background: #2a2a2a;
        cursor: pointer;
        position: relative;
        transition: background 0.2s;
        border: none;
        padding: 0;
      }
      .toggle-track.active {
        background: #3b82f6;
      }
      .toggle-track:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .toggle-thumb {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #fafafa;
        position: absolute;
        top: 2px;
        left: 2px;
        transition: transform 0.2s;
      }
      .toggle-track.active .toggle-thumb {
        transform: translateX(16px);
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
        color: #9e9e9e;
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
        color: #9e9e9e;
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
        color: #9e9e9e;
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
        color: #9e9e9e;
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
        transition:
          max-height 0.3s ease,
          opacity 0.3s ease,
          padding 0.3s ease;
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
        color: #9e9e9e;
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
        color: #9e9e9e;
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
      .plan-btn-approve:hover:not(:disabled) {
        background: #2563eb;
      }
      .plan-btn-approve:disabled,
      .plan-btn-cancel:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      .btn-spinner {
        display: inline-block;
        width: 12px;
        height: 12px;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-top-color: #fff;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
        vertical-align: middle;
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
        color: #9e9e9e;
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

      /* Skeleton loading screens */
      @keyframes shimmer {
        0% {
          background-position: -200% 0;
        }
        100% {
          background-position: 200% 0;
        }
      }
      .skeleton-messages {
        max-width: 768px;
        margin: 0 auto;
        padding: 24px;
      }
      .skeleton-msg {
        margin-bottom: 20px;
        display: flex;
      }
      .skeleton-msg.user {
        justify-content: flex-end;
      }
      .skeleton-bubble {
        border-radius: 12px;
        background: linear-gradient(90deg, #1a1a1a 25%, #242424 50%, #1a1a1a 75%);
        background-size: 200% 100%;
        animation: shimmer 1.5s ease-in-out infinite;
      }
      .skeleton-bubble.user {
        width: 40%;
        height: 48px;
      }
      .skeleton-bubble.ai {
        width: 70%;
        height: 80px;
      }
      .skeleton-bubble.ai-short {
        width: 55%;
        height: 56px;
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

      /* Created Task Navigation Card */
      .task-nav-card {
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 10px;
        margin-bottom: 16px;
        overflow: hidden;
        animation: cardFadeIn 0.25s ease;
      }
      .task-nav-header {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        font-size: 12px;
        font-weight: 600;
        color: #a1a1a1;
        border-bottom: 1px solid #242424;
      }
      .task-nav-icon {
        width: 16px;
        height: 16px;
        color: #3b82f6;
        flex-shrink: 0;
      }
      .task-nav-dismiss {
        margin-left: auto;
        background: none;
        border: none;
        color: #707070;
        cursor: pointer;
        padding: 2px;
        display: flex;
        align-items: center;
      }
      .task-nav-dismiss:hover {
        color: #a1a1a1;
      }
      .task-nav-btn {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
        padding: 10px 14px;
        background: none;
        border: none;
        border-bottom: 1px solid #1e1e1e;
        color: #fafafa;
        font-size: 13px;
        cursor: pointer;
        text-align: left;
        transition: background 0.15s;
        gap: 12px;
        font-family: inherit;
      }
      .task-nav-btn:last-child {
        border-bottom: none;
      }
      .task-nav-btn:hover {
        background: #242424;
      }
      .task-nav-btn.cross-concept {
        border-left: 3px solid #3b82f6;
      }
      .task-nav-title {
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .task-nav-concept {
        display: flex;
        align-items: center;
        gap: 4px;
        font-size: 11px;
        color: #3b82f6;
        flex-shrink: 0;
        white-space: nowrap;
      }
      @keyframes cardFadeIn {
        from {
          opacity: 0;
          transform: translateY(6px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
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
      .confirm-btn.primary:hover:not(:disabled) {
        background: #2563eb;
        border-color: #2563eb;
      }
      .confirm-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
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
    <!-- Error Toasts -->
    @for (err of errorMessages$(); track err.id; let i = $index) {
      <div class="error-toast" role="alert" [style.top.px]="16 + i * 64">
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
        <span style="font-size: 13px; color: #FAFAFA;">{{ err.message }}</span>
        <button
          (click)="dismissErrorById(err.id)"
          style="background: none; border: none; color: #a1a1a1; cursor: pointer; margin-left: auto;"
          aria-label="Dismiss"
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

    <!-- Info Toast (success/info notifications) -->
    @for (info of infoMessages$(); track info.id; let i = $index) {
      <div
        class="info-toast"
        role="status"
        [style.top.px]="16 + (errorMessages$().length + i) * 64"
      >
        <svg
          style="width: 20px; height: 20px; color: #3B82F6; flex-shrink: 0;"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fill-rule="evenodd"
            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
            clip-rule="evenodd"
          />
        </svg>
        <span style="font-size: 13px; color: #FAFAFA;">{{ info.message }}</span>
        <button
          (click)="dismissInfoById(info.id)"
          style="background: none; border: none; color: #a1a1a1; cursor: pointer; margin-left: auto;"
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
      <!-- Sidebar expand button (visible when collapsed) -->
      @if (sidebarCollapsed$()) {
        <button class="sidebar-expand-btn" (click)="toggleSidebar()">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>
      }
      <!-- Mobile overlay -->
      @if (!sidebarCollapsed$()) {
        <div class="sidebar-overlay" (click)="toggleSidebar()"></div>
      }
      <!-- Left Sidebar -->
      <aside class="sidebar" [class.collapsed]="sidebarCollapsed$()">
        <div class="sidebar-header">
          <h1>Mentor AI</h1>
          <button class="sidebar-toggle" (click)="toggleSidebar()">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M11 19l-7-7 7-7m8 14l-7-7 7-7"
              />
            </svg>
          </button>
        </div>

        <div class="sidebar-actions">
          <button
            class="new-chat-btn"
            [disabled]="isLoading$() || isCurrentConversationExecuting$()"
            (click)="createNewConversation()"
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
                d="M12 4v16m8-8H4"
              />
            </svg>
            New Conversation
          </button>
        </div>

        <app-concept-tree
          [activeConversationId]="activeConversationId$()"
          [locked]="isCurrentConversationExecuting$()"
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
            AI Configuration
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
            Dashboard
          </a>
        </div>
      </aside>

      <!-- Main Chat Area -->
      <main class="chat-main">
        @if (isLoadingConversation$() && !activeConversation$()) {
          <!-- Skeleton loading state -->
          <div class="skeleton-messages">
            <div class="skeleton-msg user"><div class="skeleton-bubble user"></div></div>
            <div class="skeleton-msg"><div class="skeleton-bubble ai"></div></div>
            <div class="skeleton-msg user"><div class="skeleton-bubble user"></div></div>
            <div class="skeleton-msg"><div class="skeleton-bubble ai-short"></div></div>
            <div class="skeleton-msg user"><div class="skeleton-bubble user"></div></div>
            <div class="skeleton-msg"><div class="skeleton-bubble ai"></div></div>
          </div>
        } @else if (activeConversation$() || folderName$()) {
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
                <h2>{{ activeConversation$()?.title || 'New Conversation' }}</h2>
                @if (currentPersonaType$()) {
                  <app-persona-badge [personaType]="currentPersonaType$()" />
                }
              }
            </div>
            @if (activeConversation$()) {
              <div class="header-actions">
                <div class="tab-bar" style="border-bottom: none;">
                  <button
                    class="tab"
                    [class.active]="activeTab$() === 'chat'"
                    (click)="activeTab$.set('chat')"
                  >
                    Chat
                  </button>
                  <button
                    class="tab"
                    [class.active]="activeTab$() === 'notes'"
                    (click)="activeTab$.set('notes')"
                  >
                    Tasks
                  </button>
                </div>
                <button
                  class="switch-btn"
                  [disabled]="isCurrentConversationExecuting$()"
                  (click)="togglePersonaSelector()"
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
                      d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                    />
                  </svg>
                  {{ showPersonaSelector$() ? 'Hide Personas' : 'Switch Persona' }}
                </button>
                <div class="auto-ai-toggle">
                  <span class="auto-ai-label">Auto AI</span>
                  <button
                    class="toggle-track"
                    [class.active]="autoAiPopuni$()"
                    [disabled]="isTogglingAutoPopuni$()"
                    (click)="toggleAutoAiPopuni()"
                  >
                    <span class="toggle-thumb"></span>
                  </button>
                </div>
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
                    Select a department persona for specialized AI responses:
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
              @if (sortedWorkflowHistory$().length > 0 || (isYoloMode$() && yoloProgress$())) {
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
              <div class="chat-messages-wrapper">
                <div class="chat-messages" #messagesContainer (scroll)="onMessagesScroll()">
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
                    @if (isCurrentConversationExecuting$() && !showPlanOverlay$()) {
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
                      <div class="yolo-progress">
                        <div class="yolo-progress-title">
                          <span class="yolo-spinner"></span>
                          @if (yoloProgress$()!.currentTasks.length > 0) {
                            Processing {{ yoloProgress$()!.currentTasks.length }} concept{{
                              yoloProgress$()!.currentTasks.length > 1 ? 's' : ''
                            }}
                          } @else {
                            YOLO Mode — Autonomous Execution
                          }
                        </div>
                        <div class="yolo-progress-stats">
                          Executing:
                          <span
                            >{{ yoloProgress$()!.completed }}/{{
                              yoloProgress$()!.executionBudget ?? yoloProgress$()!.total
                            }}</span
                          >
                          @if (yoloProgress$()!.failed > 0) {
                            | Failed: <span class="yolo-failed">{{ yoloProgress$()!.failed }}</span>
                          }
                          @if ((yoloProgress$()!.createdOnlyCount ?? 0) > 0) {
                            |
                            <span class="yolo-deferred"
                              >{{ yoloProgress$()!.createdOnlyCount }} queued for next run</span
                            >
                          }
                          @if (yoloProgress$()!.discoveredCount > 0) {
                            |
                            <span class="yolo-discovered"
                              >Discovered: {{ yoloProgress$()!.discoveredCount }}</span
                            >
                          }
                        </div>
                        <div class="yolo-progress-bar">
                          <div
                            class="yolo-progress-fill"
                            [style.width.%]="
                              (yoloProgress$()!.executionBudget ?? yoloProgress$()!.total) > 0
                                ? (yoloProgress$()!.completed /
                                    (yoloProgress$()!.executionBudget ?? yoloProgress$()!.total)) *
                                  100
                                : 0
                            "
                          ></div>
                        </div>

                        <!-- Per-worker step detail (Story 2.16 AC3) -->
                        @if (yoloProgress$()!.currentTasks.length > 0) {
                          <div class="yolo-workers">
                            @for (
                              worker of yoloProgress$()!.currentTasks;
                              track worker.conceptName
                            ) {
                              <div class="yolo-worker-item">
                                <span class="yolo-worker-spinner"></span>
                                <span class="yolo-worker-concept">{{ worker.conceptName }}</span>
                                @if (worker.currentStep) {
                                  <span class="yolo-worker-step">
                                    Step {{ (worker.currentStepIndex ?? 0) + 1 }}/{{
                                      worker.totalSteps ?? '?'
                                    }}: {{ worker.currentStep }}
                                  </span>
                                }
                              </div>
                            }
                          </div>
                        }

                        <!-- Activity log toggle (Story 2.16 AC4) -->
                        @if (
                          yoloProgress$()!.recentLogs && yoloProgress$()!.recentLogs!.length > 0
                        ) {
                          <button class="yolo-activity-toggle" (click)="toggleYoloActivityLog()">
                            <svg
                              class="yolo-toggle-icon"
                              [class.expanded]="showYoloActivityLog$()"
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
                            {{ showYoloActivityLog$() ? 'Hide' : 'Show' }} Activity Log ({{
                              yoloProgress$()!.recentLogs!.length
                            }})
                          </button>
                          @if (showYoloActivityLog$()) {
                            <div class="yolo-activity-log" #yoloLogContainer>
                              @for (logEntry of yoloProgress$()!.recentLogs!; track $index) {
                                <div class="yolo-log-entry">{{ logEntry }}</div>
                              }
                            </div>
                          }
                        }
                      </div>
                    }
                    <!-- Created Task Navigation Buttons -->
                    @if (createdTaskNotifications$().length > 0) {
                      <div class="task-nav-card">
                        <div class="task-nav-header">
                          <svg
                            class="task-nav-icon"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
                            />
                          </svg>
                          Kreirani zadaci
                          <button
                            class="task-nav-dismiss"
                            (click)="createdTaskNotifications$.set([])"
                          >
                            <svg
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                              style="width:14px;height:14px;"
                            >
                              <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d="M6 18L18 6M6 6l12 12"
                              />
                            </svg>
                          </button>
                        </div>
                        @for (task of createdTaskNotifications$(); track task.id) {
                          <button
                            class="task-nav-btn"
                            [class.cross-concept]="task.isCrossConversation"
                            (click)="navigateToCreatedTask(task)"
                          >
                            <span class="task-nav-title">{{ task.title }}</span>
                            @if (task.isCrossConversation && task.conceptName) {
                              <span class="task-nav-concept">
                                <svg
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                  style="width:12px;height:12px;"
                                >
                                  <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M13 7l5 5m0 0l-5 5m5-5H6"
                                  />
                                </svg>
                                {{ task.conceptName }}
                              </span>
                            } @else {
                              <span class="task-nav-concept">
                                <svg
                                  fill="none"
                                  stroke="currentColor"
                                  viewBox="0 0 24 24"
                                  style="width:12px;height:12px;"
                                >
                                  <path
                                    stroke-linecap="round"
                                    stroke-linejoin="round"
                                    stroke-width="2"
                                    d="M9 5l7 7-7 7"
                                  />
                                </svg>
                                Otvori
                              </span>
                            }
                          </button>
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
                      <app-typing-indicator
                        [personaType]="currentPersonaType$()"
                        [phase]="researchPhase$()"
                      />
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
                            <button
                              class="confirm-btn primary"
                              [disabled]="isProcessingStep$()"
                              (click)="continueWorkflowStep()"
                            >
                              @if (isProcessingStep$()) {
                                <span class="btn-spinner"></span> Obrađujem...
                              } @else {
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
                              }
                            </button>
                            <button
                              class="confirm-btn cancel"
                              [disabled]="isProcessingStep$()"
                              (click)="cancelExecution()"
                            >
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

                    @if (
                      awaitingConfirmation$() && nextStepInfo$() && !currentWorkflowStepInput$()
                    ) {
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
                          <button
                            class="confirm-btn primary"
                            [disabled]="isProcessingStep$()"
                            (click)="continueWorkflow()"
                          >
                            @if (isProcessingStep$()) {
                              <span class="btn-spinner"></span> Obrađujem...
                            } @else {
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
                            }
                          </button>
                          <button
                            class="confirm-btn cancel"
                            [disabled]="isProcessingStep$()"
                            (click)="cancelExecution()"
                          >
                            Otkaži
                          </button>
                        </div>
                      </div>
                    }
                  </div>
                </div>
                @if (showScrollToBottom$()) {
                  @if (isStreaming$()) {
                    <button class="stop-generation-btn" (click)="stopGeneration()">
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <rect x="6" y="6" width="12" height="12" rx="2" stroke-width="2" />
                      </svg>
                      Zaustavi generisanje
                    </button>
                  } @else {
                    <button class="scroll-to-bottom" (click)="scrollToBottom()">
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M19 14l-7 7m0 0l-7-7m7 7V3"
                        />
                      </svg>
                    </button>
                  }
                }
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
                  @if (isPlatformOwner$()) {
                    <div class="auto-ai-toggle">
                      <span class="auto-ai-label">Auto AI</span>
                      <button
                        class="toggle-track"
                        [class.active]="autoAiPopuni$()"
                        [disabled]="isTogglingAutoPopuni$()"
                        (click)="toggleAutoAiPopuni()"
                      >
                        <span class="toggle-thumb"></span>
                      </button>
                    </div>
                  }
                </div>
              }
              <!-- Notes View (conversation mode) -->
              <div class="notes-view" style="flex: 1; overflow-y: auto;">
                <app-conversation-notes
                  [conversationId]="activeConversationId$()"
                  [conceptId]="activeConversation$()?.conceptId ?? null"
                  [autoSelectTaskIds]="autoSelectTaskIds$()"
                  [isExecuting]="isCurrentConversationExecuting$()"
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
                    isCurrentConversationExecuting$() ||
                    isYoloMode$() ||
                    domainPendingCount$() === 0
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
                    isCurrentConversationExecuting$() ||
                    isYoloMode$() ||
                    domainPendingCount$() === 0
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
                <div class="auto-ai-toggle">
                  <span class="auto-ai-label">Auto AI</span>
                  <button
                    class="toggle-track"
                    [class.active]="autoAiPopuni$()"
                    [disabled]="isTogglingAutoPopuni$()"
                    (click)="toggleAutoAiPopuni()"
                  >
                    <span class="toggle-thumb"></span>
                  </button>
                </div>
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
                [isExecuting]="isCurrentConversationExecuting$()"
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
              <h2 class="empty-title">Dobrodošli u Mentor AI</h2>
              <p class="empty-desc">
                Vaš AI poslovni partner sa ekspertizom u finansijama, marketingu, tehnologiji,
                operacijama, pravu i kreativnom razvoju.
              </p>
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
                Novi razgovor
              </button>
              <div class="suggestion-grid">
                <button
                  class="suggestion-card"
                  (click)="
                    onSuggestionClick(
                      'Analiziraj moje tržište i identifikuj ključne prilike za rast'
                    )
                  "
                >
                  <div class="suggestion-card-icon">📊</div>
                  <div class="suggestion-card-title">Analiza tržišta</div>
                  <div class="suggestion-card-desc">
                    Identifikuj prilike za rast i konkurentsku poziciju
                  </div>
                </button>
                <button
                  class="suggestion-card"
                  (click)="onSuggestionClick('Napravi profil idealnog kupca za moj biznis')"
                >
                  <div class="suggestion-card-icon">👤</div>
                  <div class="suggestion-card-title">Profilisanje kupaca</div>
                  <div class="suggestion-card-desc">Definiši idealnog kupca i segmente</div>
                </button>
                <button
                  class="suggestion-card"
                  (click)="
                    onSuggestionClick(
                      'Pomozi mi da napravim finansijski plan za narednih 12 meseci'
                    )
                  "
                >
                  <div class="suggestion-card-icon">💰</div>
                  <div class="suggestion-card-title">Finansijski plan</div>
                  <div class="suggestion-card-desc">Projekcije prihoda, troškova i budžeta</div>
                </button>
                <button
                  class="suggestion-card"
                  (click)="onSuggestionClick('Kreiraj marketing strategiju za moj proizvod')"
                >
                  <div class="suggestion-card-icon">🚀</div>
                  <div class="suggestion-card-title">Marketing strategija</div>
                  <div class="suggestion-card-desc">Plan za promociju i pozicioniranje brenda</div>
                </button>
              </div>
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

    <app-feature-tour (tourComplete)="onTourComplete()" />
  `,
})
export class ChatComponent implements OnInit, OnDestroy, AfterViewInit {
  private readonly conversationService = inject(ConversationService);
  private readonly chatWsService = inject(ChatWebsocketService);
  private readonly http = inject(HttpClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly authService = inject(AuthService);
  private readonly notesApi = inject(NotesApiService);

  @ViewChild(FeatureTourComponent) featureTour?: FeatureTourComponent;
  @ViewChild(ConceptTreeComponent) conceptTree?: ConceptTreeComponent;
  @ViewChild(ConversationNotesComponent) conversationNotes?: ConversationNotesComponent;
  @ViewChild('yoloLogContainer') yoloLogContainer?: ElementRef<HTMLDivElement>;
  @ViewChild('messagesContainer') messagesContainer?: ElementRef<HTMLDivElement>;

  readonly activeConversation$ = signal<ConversationWithMessages | null>(null);
  readonly activeConversationId$ = computed(() => this.activeConversation$()?.id ?? null);
  readonly messages$ = computed(() => this.activeConversation$()?.messages ?? []);
  readonly isLoading$ = signal(false);
  readonly isStreaming$ = signal(false);
  readonly showScrollToBottom$ = signal(false);
  readonly sidebarCollapsed$ = signal(false);
  readonly isLoadingConversation$ = signal(false);
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
  readonly errorMessages$ = signal<{ id: string; message: string }[]>([]);
  // Info/success notifications (blue border, checkmark icon)
  readonly infoMessages$ = signal<{ id: string; message: string }[]>([]);

  // Busy/processing guards (prevent double-clicks)
  readonly isApprovingPlan$ = signal(false);
  readonly isProcessingStep$ = signal(false);

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
  // Track ALL active workflow conversations (enables parallel execution)
  readonly executingWorkflowConversationIds$ = signal<Set<string>>(new Set());
  // True if ANY workflow is running (backward-compatible global check)
  readonly isExecutingWorkflow$ = computed(() => this.executingWorkflowConversationIds$().size > 0);
  // True only when the CURRENT conversation is executing a workflow
  readonly isCurrentConversationExecuting$ = computed(() => {
    const activeConv = this.activeConversationId$();
    return activeConv !== null && this.executingWorkflowConversationIds$().has(activeConv);
  });

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

  // Created task navigation buttons (shown inline in chat)
  readonly createdTaskNotifications$ = signal<
    Array<{
      id: string;
      title: string;
      conceptId: string | null;
      conceptName: string | null;
      conversationId: string;
      isCrossConversation: boolean;
    }>
  >([]);

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
  private pendingPlanId: string | null = null;
  private streamBuffer = '';
  private streamRafId: number | null = null;

  // Workflow status bar: tracks all active/recent workflow executions
  readonly workflowHistory$ = signal<WorkflowStatusEntry[]>([]);

  // Per-plan data maps for click-to-expand workflow navigation
  readonly workflowPlans$ = signal<Map<string, ExecutionPlan>>(new Map());
  readonly workflowProgressMaps$ = signal<Map<string, Map<string, ExecutionPlanStep['status']>>>(
    new Map()
  );
  readonly selectedWorkflowPlanId$ = signal<string | null>(null);

  // Sorted workflow entries: executing first, then completed, failed, cancelled
  readonly sortedWorkflowHistory$ = computed(() => {
    const order: Record<string, number> = { executing: 0, completed: 1, failed: 2, cancelled: 3 };
    return [...this.workflowHistory$()].sort(
      (a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9)
    );
  });

  // Multi-step orchestration: research phase indicator
  readonly researchPhase$ = signal<'thinking' | 'researching'>('thinking');

  // Auto AI Popuni toggle (brain config)
  readonly autoAiPopuni$ = signal(false);
  readonly isTogglingAutoPopuni$ = signal(false);
  readonly autoPopuniTaskIds$ = signal<string[]>([]);
  readonly isPlatformOwner$ = computed(
    () => this.authService.currentUser()?.role === 'PLATFORM_OWNER'
  );

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
    this.loadBrainConfig();

    // Use combineLatest so both params and queryParams resolve before acting.
    // This prevents a race condition where loadConversation() runs before
    // queryParams sets yoloPending/pendingPlanId flags.
    combineLatest([this.route.params, this.route.queryParams])
      .pipe(takeUntilDestroyed(this.destroyRef), take(1))
      .subscribe(([params, queryParams]) => {
        // Set YOLO / planId flags BEFORE loading conversation
        if (queryParams['yolo'] === 'true' && !this.isYoloMode$()) {
          this.isYoloMode$.set(true);
          this.yoloPending = true;
        }
        if (queryParams['planId'] && !this.yoloPending) {
          this.pendingPlanId = queryParams['planId'];
        }

        if (queryParams['tour'] === 'true') {
          setTimeout(() => this.featureTour?.launchTour(), 1000);
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
      this.errorMessages$.set([]);
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
    this.isLoadingConversation$.set(true);
    try {
      // Clear plan state from previous conversation (unless this conversation has its own active workflow or a workflow is selected in status bar)
      if (
        !this.executingWorkflowConversationIds$().has(conversationId) &&
        !this.selectedWorkflowPlanId$()
      ) {
        this.closePlanOverlay();
      }
      const conversation = await this.conversationService.getConversation(conversationId);
      this.activeConversation$.set(conversation);
      this.isLoadingConversation$.set(false);
      this.activeTab$.set('chat');
      // Reset transient UI state from any previous conversation
      this.isLoading$.set(false);
      this.isStreaming$.set(false);
      this.streamingContent$.set('');
      this.createdTaskNotifications$.set([]);
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
      // Load pre-built plan from onboarding if planId is set
      if (this.pendingPlanId) {
        const planId = this.pendingPlanId;
        this.pendingPlanId = null;
        try {
          await this.chatWsService.waitForConnection();
          this.chatWsService.emitGetPlan(planId, conversationId);
        } catch {
          this.showError('WebSocket konekcija neuspešna — plan nije mogao da se učita');
        }
      }
    } catch {
      this.activeConversation$.set(null);
      this.isLoadingConversation$.set(false);
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
   * Navigate to a created task — switches to its conversation and opens the notes tab with the task selected.
   */
  navigateToCreatedTask(task: {
    id: string;
    conversationId: string;
    isCrossConversation: boolean;
  }): void {
    // Clear the notification for this task
    this.createdTaskNotifications$.update((list) => list.filter((t) => t.id !== task.id));

    // Set auto-select so the task is highlighted in notes
    this.autoSelectTaskIds$.set([task.id]);
    this.activeTab$.set('notes');

    if (task.isCrossConversation) {
      // Navigate to the new conversation under the correct concept
      this.router.navigate(['/chat', task.conversationId]);
    }
    // If same conversation, just switch to notes tab (already done above)
    this.conversationNotes?.loadNotes();
  }

  /**
   * Toggles the persona selector visibility.
   */
  togglePersonaSelector(): void {
    this.showPersonaSelector$.update((show) => !show);
  }

  /**
   * Shows an error message to the user with auto-dismiss after 8 seconds.
   */
  private showError(message: string): void {
    const id = crypto.randomUUID();
    this.errorMessages$.update((list) => [...list, { id, message }]);
    setTimeout(() => this.dismissErrorById(id), 8000);
  }

  /**
   * Dismisses a specific error message by id.
   */
  dismissErrorById(id: string): void {
    this.errorMessages$.update((list) => list.filter((e) => e.id !== id));
  }

  /**
   * Loads brain config from API and sets autoAiPopuni toggle state.
   */
  private loadBrainConfig(): void {
    this.http.get<{ data: { autoAiPopuni: boolean } }>('/api/admin/brain-config').subscribe({
      next: (res) => this.autoAiPopuni$.set(res.data.autoAiPopuni),
      error: () => {
        /* ignore — not critical */
      },
    });
  }

  /**
   * Toggles the Auto AI Popuni brain config setting.
   */
  toggleAutoAiPopuni(): void {
    if (this.isTogglingAutoPopuni$()) return;
    this.isTogglingAutoPopuni$.set(true);
    const newValue = !this.autoAiPopuni$();
    this.http
      .patch<{
        data: { autoAiPopuni: boolean };
      }>('/api/admin/brain-config', { autoAiPopuni: newValue })
      .subscribe({
        next: (res) => {
          this.autoAiPopuni$.set(res.data.autoAiPopuni);
          this.isTogglingAutoPopuni$.set(false);
        },
        error: () => {
          this.isTogglingAutoPopuni$.set(false);
          this.showError('Greška pri promeni Auto AI podešavanja');
        },
      });
  }

  /**
   * Shows an info/success message to the user with auto-dismiss after 10 seconds.
   */
  private showInfo(message: string): void {
    const id = crypto.randomUUID();
    this.infoMessages$.update((list) => [...list, { id, message }]);
    setTimeout(() => this.dismissInfoById(id), 10000);
  }

  /**
   * Dismisses a specific info message by id.
   */
  dismissInfoById(id: string): void {
    this.infoMessages$.update((list) => list.filter((e) => e.id !== id));
  }

  manualReconnect(): void {
    this.chatWsService.disconnect();
    setTimeout(() => this.chatWsService.connect(), 500);
  }

  /**
   * Handles citation click from chat messages.
   * During workflow execution: always opens panel, never navigates away.
   * Otherwise: navigates to concept conversation if available, or opens panel.
   */
  onSuggestedAction(action: SuggestedAction): void {
    switch (action.type) {
      case 'create_tasks':
        // Send explicit task creation request so backend generates tasks from conversation
        this.sendMessage('Kreiraj zadatke na osnovu prethodne analize.');
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
    if (this.isCurrentConversationExecuting$()) {
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

  private planGenerationTimeout: ReturnType<typeof setTimeout> | null = null;

  async onRunAgents(taskIds: string[]): Promise<void> {
    if (taskIds.length === 0) return;

    let conversationId = this.activeConversationId$();

    // If no active conversation, try to resolve one from the task or create a new one
    if (!conversationId) {
      const task = this.conversationNotes?.notes()?.find((n) => taskIds.includes(n.id));
      if (task?.conversationId) {
        // Task already belongs to a conversation — navigate to it
        conversationId = task.conversationId;
        await this.loadConversation(conversationId);
        this.router.navigate(['/chat', conversationId]);
      } else {
        // No conversation exists — create one under the task's concept
        try {
          const conceptId = task?.conceptId ?? undefined;
          const title = task?.title ? `${task.title}` : 'Izvršavanje zadatka';
          const conversation = await this.conversationService.createConversation(
            title,
            undefined,
            conceptId
          );
          conversationId = conversation.id;
          await this.loadConversation(conversationId);
          this.router.navigate(['/chat', conversationId]);
          this.conceptTree?.loadTree();
        } catch {
          this.showError('Greška pri kreiranju konverzacije za zadatak.');
          return;
        }
      }
    }

    this.isGeneratingPlan$.set(true);
    this.chatWsService.emitRunAgents(taskIds, conversationId);
    // Safety timeout: clear generating state after 90s if server never responds
    if (this.planGenerationTimeout) clearTimeout(this.planGenerationTimeout);
    this.planGenerationTimeout = setTimeout(() => {
      if (this.isGeneratingPlan$()) {
        this.isGeneratingPlan$.set(false);
        this.showError('Generisanje plana je trajalo predugo — pokušajte ponovo.');
      }
    }, 90_000);
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

  navigateToWorkflow(entry: WorkflowStatusEntry): void {
    const currentlySelected = this.selectedWorkflowPlanId$();

    // Toggle: clicking same entry collapses overlay
    if (currentlySelected === entry.planId && this.showPlanOverlay$()) {
      this.showPlanOverlay$.set(false);
      this.selectedWorkflowPlanId$.set(null);
      return;
    }

    // Navigate to different conversation if needed
    if (entry.conversationId !== this.activeConversationId$()) {
      this.folderConceptIds$.set([]);
      this.folderConversationIds$.set([]);
      this.folderName$.set(null);
      this.router.navigate(['/chat', entry.conversationId]);
    }

    // Restore plan data from maps and show overlay
    const plan = this.workflowPlans$().get(entry.planId);
    if (plan) {
      this.currentPlan$.set(plan);
      this.executionProgress$.set(this.workflowProgressMaps$().get(entry.planId) ?? new Map());
      this.activePlanId$.set(entry.planId);
      this.selectedWorkflowPlanId$.set(entry.planId);
      this.showPlanOverlay$.set(true);
      this.planCollapsed$.set(false);
    }

    this.activeTab$.set('notes');
    this.autoSelectTaskIds$.set(entry.taskIds.length > 0 ? entry.taskIds : []);
  }

  getStepStatus(stepId: string): ExecutionPlanStep['status'] {
    return this.executionProgress$().get(stepId) ?? 'pending';
  }

  approvePlan(): void {
    const plan = this.currentPlan$();
    const conversationId = this.activeConversationId$();
    if (!plan || !conversationId) return;
    this.executingWorkflowConversationIds$.update((s) => new Set([...s, conversationId]));
    this.planCollapsed$.set(true); // Auto-collapse plan panel during execution
    this.chatWsService.emitWorkflowApproval(plan.planId, true, conversationId);

    // Add entry to workflow status bar
    const firstConcept = plan.steps[0]?.conceptName ?? 'Workflow';
    this.workflowHistory$.update((entries) => [
      ...entries,
      {
        planId: plan.planId,
        conversationId,
        taskIds: plan.steps.map((s: any) => s.taskId).filter(Boolean),
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
    this.isApprovingPlan$.set(false);
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
    this.selectedWorkflowPlanId$.set(null);
    this.isApprovingPlan$.set(false);
    // NOTE: execution state is managed per-conversation by callers, not here
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

  /** Toggle sidebar collapsed state */
  toggleSidebar(): void {
    this.sidebarCollapsed$.set(!this.sidebarCollapsed$());
  }

  /** Handle suggestion card click from empty state */
  async onSuggestionClick(prompt: string): Promise<void> {
    await this.createNewConversation();
    // Wait for conversation to be created then send the message
    setTimeout(() => {
      if (this.activeConversationId$()) {
        this.sendMessage(prompt);
      }
    }, 500);
  }

  /** Track scroll position to show/hide scroll-to-bottom button */
  onMessagesScroll(): void {
    const el = this.messagesContainer?.nativeElement;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    this.showScrollToBottom$.set(distanceFromBottom > 100);
  }

  /** Scroll to the bottom of the messages container */
  scrollToBottom(): void {
    const el = this.messagesContainer?.nativeElement;
    if (el) el.scrollTop = el.scrollHeight;
  }

  /** Stop AI response generation (client-side cancel) */
  stopGeneration(): void {
    this.isStreaming$.set(false);
    this.isLoading$.set(false);
    this.showScrollToBottom$.set(false);
  }

  async sendMessage(input: string | ChatMessagePayload): Promise<void> {
    const content = typeof input === 'string' ? input : input.content;
    const attachmentIds = typeof input === 'string' ? undefined : input.attachmentIds;
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

    // Send via WebSocket (with optional attachment IDs)
    const sent = this.chatWsService.sendMessage(
      conversationId,
      content,
      attachmentIds?.length ? attachmentIds : undefined
    );
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
        setTimeout(() => {
          if (this.connectionState$() === 'connected') this.disconnectToast$.set(null);
        }, 3000);
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
      this.streamBuffer += data.content;
      if (!this.streamRafId) {
        this.streamRafId = requestAnimationFrame(() => {
          this.streamingContent$.update((c) => c + this.streamBuffer);
          this.streamBuffer = '';
          this.streamRafId = null;
        });
      }
    });

    this.chatWsService.onResearchPhase((data) => {
      this.researchPhase$.set(data.phase === 'researching' ? 'researching' : 'thinking');
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
      this.researchPhase$.set('thinking');
    });

    this.chatWsService.onError((error) => {
      this.isLoading$.set(false);
      this.isStreaming$.set(false);
      this.researchPhase$.set('thinking');
      const errorType = error.type ? `[${error.type}] ` : '';
      this.showError(errorType + (error.message || 'Poruka nije poslata. Pokušajte ponovo.'));
    });

    this.chatWsService.onNotesUpdated(() => {
      // Refresh the notes component if it's currently visible
      this.conversationNotes?.loadNotes();
    });

    this.chatWsService.onTasksCreatedForExecution((data) => {
      if (data.conversationId !== this.activeConversationId$()) return;

      // Auto-select created tasks in notes tab
      if (data.taskIds.length > 0) {
        this.autoSelectTaskIds$.set(data.taskIds);
      }
      this.conversationNotes?.loadNotes();

      // Refresh concept tree (new conversations may have been created)
      this.conceptTree?.loadTree();

      // Show visible feedback in chat with navigation instructions
      const count = data.taskCount ?? data.taskIds.length;
      let content = `**Kreirano ${count} ${count === 1 ? 'zadatak' : 'zadataka'}!**`;
      content += ' Kliknite na dugme ispod da biste prešli na zadatak.';

      const taskMsg: Message = {
        id: `tasks_created_${Date.now()}`,
        conversationId: data.conversationId,
        role: MessageRole.ASSISTANT,
        content,
        confidenceScore: null,
        confidenceFactors: null,
        createdAt: new Date().toISOString(),
      };
      this.activeConversation$.update((conv) => {
        if (!conv) return conv;
        return { ...conv, messages: [...conv.messages, taskMsg] };
      });

      // Auto AI Popuni: if toggle is ON, automatically execute FRESH tasks only
      // Reused tasks are already COMPLETED — skip AI execution for them
      const reusedSet = new Set(data.reusedTaskIds ?? []);
      const freshTaskIds = data.taskIds.filter((id) => !reusedSet.has(id));

      if (this.autoAiPopuni$() && freshTaskIds.length > 0) {
        setTimeout(() => {
          const convId = data.conversationId;
          for (const taskId of freshTaskIds) {
            this.chatWsService.emitExecuteTaskAi(taskId, convId);
          }
        }, 1500);
      }
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
      if (this.planGenerationTimeout) {
        clearTimeout(this.planGenerationTimeout);
        this.planGenerationTimeout = null;
      }
      this.isGeneratingPlan$.set(false);

      this.executingTaskId$.set(null);
      this.currentPlan$.set(payload.plan);
      this.activePlanId$.set(payload.plan.planId);
      this.executionProgress$.set(new Map());
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

      // Auto-execute path: mark this conversation as executing on first step-progress
      this.executingWorkflowConversationIds$.update((s) => new Set([...s, payload.conversationId]));
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

      // Remove this conversation from executing set (allows parallel workflows)
      this.executingWorkflowConversationIds$.update((s) => {
        const next = new Set(s);
        next.delete(payload.conversationId);
        return next;
      });
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

        // Auto-clear completed/cancelled entries after 30 seconds (gives user time to click)
        setTimeout(() => {
          this.workflowHistory$.update((entries) =>
            entries.filter((e) => e.planId !== payload.planId)
          );
        }, 30000);
      }

      // D4: Suggest next step after successful workflow
      if (payload.status === 'completed') {
        setTimeout(() => this.suggestNextStep(), 1500);
      }
    });

    this.chatWsService.onWorkflowError((payload) => {
      // Global: remove from executing set regardless of active conversation
      this.executingWorkflowConversationIds$.update((s) => {
        const next = new Set(s);
        next.delete(payload.conversationId);
        return next;
      });
      // Per-conversation UI cleanup only for active conversation
      if (payload.conversationId !== this.activeConversationId$()) return;
      this.closePlanOverlay();
      this.isYoloMode$.set(false);
      this.yoloProgress$.set(null);
      this.showError(payload.message ?? 'Izvršavanje workflow-a neuspešno');
    });

    // ─── Task AI Execution Events ───────────────────────────────

    this.chatWsService.onTaskAiStart((data) => {
      if (data.conversationId && data.conversationId !== this.activeConversationId$()) return;
      // Clear plan-generation state: direct AI execution replaces workflow plan
      if (this.isGeneratingPlan$()) {
        this.isGeneratingPlan$.set(false);
        if (this.planGenerationTimeout) {
          clearTimeout(this.planGenerationTimeout);
          this.planGenerationTimeout = null;
        }
      }
      // Set execution state — track which task is currently executing
      this.executingTaskId$.set(data.taskId);
      this.taskExecutionStreamContent$.set('');
      this.isStreaming$.set(true);
      this.streamingContent$.set('');
    });

    this.chatWsService.onTaskAiChunk((data) => {
      if (data.conversationId && data.conversationId !== this.activeConversationId$()) return;
      this.streamBuffer += data.content;
      if (!this.streamRafId) {
        this.streamRafId = requestAnimationFrame(() => {
          this.streamingContent$.update((c) => c + this.streamBuffer);
          this.taskExecutionStreamContent$.update((c) => c + this.streamBuffer);
          this.streamBuffer = '';
          this.streamRafId = null;
        });
      }
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

    // ─── Auto AI Popuni Events ─────────────────────────────────
    this.chatWsService.onAutoPopuniStart((data) => {
      this.autoPopuniTaskIds$.set(data.taskIds);
    });

    this.chatWsService.onAutoPopuniComplete(() => {
      this.autoPopuniTaskIds$.set([]);
      this.conversationNotes?.loadNotes();
      this.conceptTree?.loadTree();
    });

    this.chatWsService.onAutoPopuniTaskError(() => {
      // Individual task errors — the complete event will have the final count
    });

    // ─── Execution Persistence: State Restoration on Reconnect ─────
    this.chatWsService.onExecutionActiveState((data) => {
      // M1: Track whether we've already restored a YOLO/workflow to avoid overwrites
      let yoloRestored = false;
      let workflowRestored = false;

      // Restore active executions
      for (const exec of data.active) {
        if ((exec.type === 'yolo' || exec.type === 'domain-yolo') && !yoloRestored) {
          yoloRestored = true;
          // Restore YOLO overlay with checkpoint data
          this.isYoloMode$.set(true);
          if (exec.conversationId) {
            this.executingWorkflowConversationIds$.update((s) => {
              const next = new Set(s);
              next.add(exec.conversationId!);
              return next;
            });
          }
          const cp = exec.checkpoint as {
            planId?: string;
            running?: number;
            maxConcurrency?: number;
            completed?: number;
            completedCount?: number;
            failed?: number;
            failedCount?: number;
            total?: number;
            discoveredCount?: number;
            conversationId?: string;
            currentTasks?: YoloProgressPayload['currentTasks'];
          };
          const completedVal = cp.completed ?? cp.completedCount ?? 0;
          const failedVal = cp.failed ?? cp.failedCount ?? 0;
          this.yoloProgress$.set({
            planId: cp.planId ?? exec.planId ?? 'resume',
            running: cp.running ?? 0,
            maxConcurrency: cp.maxConcurrency ?? 3,
            completed: completedVal,
            failed: failedVal,
            total: cp.total ?? 0,
            discoveredCount: cp.discoveredCount ?? 0,
            currentTasks: cp.currentTasks ?? [],
            conversationId: cp.conversationId ?? exec.conversationId ?? '',
          });
          // M2: Replay only events since the execution was created (avoid stale replays)
          this.chatWsService.replayEvents(exec.id, exec.createdAt);
        }

        if (exec.type === 'workflow' && !workflowRestored) {
          workflowRestored = true;
          // Restore workflow execution indicator
          if (exec.conversationId) {
            this.executingWorkflowConversationIds$.update((s) => {
              const next = new Set(s);
              next.add(exec.conversationId!);
              return next;
            });
          }
          if (exec.planId) {
            this.activePlanId$.set(exec.planId);
            this.showPlanOverlay$.set(true);
          }
          // Restore step progress from checkpoint
          const wfCp = exec.checkpoint as {
            lastCompletedStepIndex?: number;
            totalSteps?: number;
            currentStepTitle?: string;
          };
          if (wfCp.lastCompletedStepIndex != null) {
            this.completedStepsCount$.set(wfCp.lastCompletedStepIndex + 1);
            this.currentStepIndex$.set(wfCp.lastCompletedStepIndex + 1);
          }
          if (wfCp.totalSteps != null) {
            this.totalStepsCount$.set(wfCp.totalSteps);
          }
          if (wfCp.currentStepTitle) {
            this.currentStepTitle$.set(wfCp.currentStepTitle);
          }
          // M2: Replay only events since the execution was created
          this.chatWsService.replayEvents(exec.id, exec.createdAt);
        }

        if (exec.type === 'auto-popuni') {
          const meta = exec.metadata as { taskIds?: string[] };
          if (Array.isArray(meta?.taskIds)) {
            this.autoPopuniTaskIds$.set(meta.taskIds);
          }
        }
      }

      // Show summary for recently completed executions (completed while user was away)
      let needsRefresh = false;
      for (const exec of data.recentlyCompleted) {
        const typeLabel =
          exec.type === 'yolo' || exec.type === 'domain-yolo'
            ? 'YOLO'
            : exec.type === 'workflow'
              ? 'Workflow'
              : 'Auto AI';
        this.showError(`Brain je radio dok ste bili odsutni: ${typeLabel} završen`);
        needsRefresh = true;
      }
      // Refresh tree and notes once (not per-completion)
      if (needsRefresh) {
        this.conceptTree?.loadTree();
        this.conversationNotes?.loadNotes();
      }
    });

    this.chatWsService.onStepAwaitingConfirmation((payload) => {
      if (payload.conversationId !== this.activeConversationId$()) return;
      this.activePlanId$.set(payload.planId);

      // Backend auto-continues confirmation steps — no action needed here during execution
      if (this.isCurrentConversationExecuting$()) return;

      this.awaitingConfirmation$.set(true);
      this.nextStepInfo$.set(payload.nextStep);
      this.userStepInput$.set('');
    });

    // ─── Interactive Workflow Step Events (Task 6) ───────────────

    this.chatWsService.onStepAwaitingInput((payload: WorkflowStepAwaitingInputPayload) => {
      if (payload.conversationId !== this.activeConversationId$()) return;

      // Confirmation steps are auto-resolved on the backend — skip on frontend
      if (payload.inputType === 'confirmation') return;

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
      // Global: track executing conversation regardless of active view
      this.executingWorkflowConversationIds$.update((s) => new Set([...s, payload.conversationId]));
      // Per-conversation UI updates
      if (payload.conversationId !== this.activeConversationId$()) return;
      this.yoloProgress$.set(payload);
      // Auto-scroll activity log to latest entry (AC4)
      if (this.showYoloActivityLog$() && this.yoloLogContainer?.nativeElement) {
        setTimeout(() => {
          const el = this.yoloLogContainer?.nativeElement;
          if (el) el.scrollTop = el.scrollHeight;
        });
      }
    });

    this.chatWsService.onYoloComplete((payload) => {
      // Global: remove from executing set regardless of active view
      this.executingWorkflowConversationIds$.update((s) => {
        const next = new Set(s);
        next.delete(payload.conversationId);
        return next;
      });
      // Per-conversation UI cleanup
      if (payload.conversationId !== this.activeConversationId$()) return;
      this.yoloProgress$.set(null);
      this.isYoloMode$.set(false);
      this.conversationNotes?.loadNotes();
      this.conceptTree?.loadTree();
      // D4: Suggest next step after YOLO completion
      setTimeout(() => this.suggestNextStep(), 1500);
    });

    this.chatWsService.onTasksDiscovered(() => {
      this.conceptTree?.loadTree();
    });

    // ─── Auto AI Popuni Events ───────────────────────────────
    this.chatWsService.onAutoPopuniStart((data) => {
      this.autoPopuniTaskIds$.set(data.taskIds);
    });

    this.chatWsService.onAutoPopuniComplete((data) => {
      this.autoPopuniTaskIds$.set([]);
      this.conversationNotes?.loadNotes();
      this.conceptTree?.loadTree();
      if (data.completedTasks < data.totalTasks) {
        this.showError(
          `Auto AI: ${data.completedTasks}/${data.totalTasks} zadataka uspešno popunjeno`
        );
      }
    });

    this.chatWsService.onAutoPopuniTaskError(() => {
      // Individual task errors — the complete event will have the final count
    });

    // ─── Execution Persistence: State Restoration on Reconnect ─────
    this.chatWsService.onExecutionActiveState((data) => {
      // M1: Track whether we've already restored a YOLO/workflow to avoid overwrites
      let yoloRestored = false;
      let workflowRestored = false;

      // Restore active executions
      for (const exec of data.active) {
        if ((exec.type === 'yolo' || exec.type === 'domain-yolo') && !yoloRestored) {
          yoloRestored = true;
          // Restore YOLO overlay with checkpoint data
          this.isYoloMode$.set(true);
          if (exec.conversationId) {
            this.executingWorkflowConversationIds$.update((s) => {
              const next = new Set(s);
              next.add(exec.conversationId!);
              return next;
            });
          }
          const cp = exec.checkpoint as {
            planId?: string;
            running?: number;
            maxConcurrency?: number;
            completed?: number;
            completedCount?: number;
            failed?: number;
            failedCount?: number;
            total?: number;
            discoveredCount?: number;
            conversationId?: string;
            currentTasks?: YoloProgressPayload['currentTasks'];
          };
          const completedVal = cp.completed ?? cp.completedCount ?? 0;
          const failedVal = cp.failed ?? cp.failedCount ?? 0;
          this.yoloProgress$.set({
            planId: cp.planId ?? exec.planId ?? 'resume',
            running: cp.running ?? 0,
            maxConcurrency: cp.maxConcurrency ?? 3,
            completed: completedVal,
            failed: failedVal,
            total: cp.total ?? 0,
            discoveredCount: cp.discoveredCount ?? 0,
            currentTasks: cp.currentTasks ?? [],
            conversationId: cp.conversationId ?? exec.conversationId ?? '',
          });
          // M2: Replay only events since the execution was created (avoid stale replays)
          this.chatWsService.replayEvents(exec.id, exec.createdAt);
        }

        if (exec.type === 'workflow' && !workflowRestored) {
          workflowRestored = true;
          // Restore workflow execution indicator
          if (exec.conversationId) {
            this.executingWorkflowConversationIds$.update((s) => {
              const next = new Set(s);
              next.add(exec.conversationId!);
              return next;
            });
          }
          if (exec.planId) {
            this.activePlanId$.set(exec.planId);
            this.showPlanOverlay$.set(true);
          }
          // Restore step progress from checkpoint
          const wfCp = exec.checkpoint as {
            lastCompletedStepIndex?: number;
            totalSteps?: number;
            currentStepTitle?: string;
          };
          if (wfCp.lastCompletedStepIndex != null) {
            this.completedStepsCount$.set(wfCp.lastCompletedStepIndex + 1);
            this.currentStepIndex$.set(wfCp.lastCompletedStepIndex + 1);
          }
          if (wfCp.totalSteps != null) {
            this.totalStepsCount$.set(wfCp.totalSteps);
          }
          if (wfCp.currentStepTitle) {
            this.currentStepTitle$.set(wfCp.currentStepTitle);
          }
          // M2: Replay only events since the execution was created
          this.chatWsService.replayEvents(exec.id, exec.createdAt);
        }

        if (exec.type === 'auto-popuni') {
          const meta = exec.metadata as { taskIds?: string[] };
          if (Array.isArray(meta?.taskIds)) {
            this.autoPopuniTaskIds$.set(meta.taskIds);
          }
        }
      }

      // Show summary for recently completed executions (completed while user was away)
      let needsRefresh = false;
      for (const exec of data.recentlyCompleted) {
        const typeLabel =
          exec.type === 'yolo' || exec.type === 'domain-yolo'
            ? 'YOLO'
            : exec.type === 'workflow'
              ? 'Workflow'
              : 'Auto AI';
        this.showInfo(`Brain je radio dok ste bili odsutni: ${typeLabel} završen`);
        needsRefresh = true;
      }
      // Refresh tree and notes once (not per-completion)
      if (needsRefresh) {
        this.conceptTree?.loadTree();
        this.conversationNotes?.loadNotes();
      }
    });
  }

  continueWorkflow(): void {
    const planId = this.activePlanId$();
    const convId = this.activeConversationId$();
    if (!planId || !convId || this.isProcessingStep$()) return;
    this.isProcessingStep$.set(true);

    const input = this.userStepInput$().trim() || undefined;
    this.chatWsService.emitStepContinue(planId, convId, input);
    this.awaitingConfirmation$.set(false);
    this.nextStepInfo$.set(null);
    this.userStepInput$.set('');
    // Reset after emission (backend takes over)
    setTimeout(() => this.isProcessingStep$.set(false), 1000);
  }

  continueWorkflowStep(): void {
    const stepInput = this.currentWorkflowStepInput$();
    const convId = this.activeConversationId$();
    if (!stepInput || !convId || this.isProcessingStep$()) return;
    this.isProcessingStep$.set(true);

    this.chatWsService.emitStepContinue(stepInput.planId, convId);
    this.currentWorkflowStepInput$.set(null);
    this.allowWorkflowInput$.set(false);
    setTimeout(() => this.isProcessingStep$.set(false), 1000);
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

  onTourComplete(): void {
    // Tour finished or skipped — no additional action needed
  }
}
