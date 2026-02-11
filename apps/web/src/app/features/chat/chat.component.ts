import {
  Component,
  inject,
  signal,
  computed,
  OnInit,
  OnDestroy,
  DestroyRef,
  ViewChild,
  ElementRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { firstValueFrom } from 'rxjs';
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
  type ExecutionPlan,
  type ExecutionPlanStep,
  type WorkflowConversationsCreatedPayload,
  type WorkflowStepConfirmationPayload,
  type WorkflowStepAwaitingInputPayload,
  type WorkflowStepMessagePayload,
  type WorkflowNavigatePayload,
  type YoloProgressPayload,
  type YoloCompletePayload,
} from '@mentor-ai/shared/types';
import { PersonaSelectorComponent } from '../personas/persona-selector.component';
import { PersonaBadgeComponent } from '../personas/persona-badge.component';
import { ConceptPanelComponent } from '../knowledge/concept-panel/concept-panel.component';
import { ConceptTreeComponent } from './components/concept-tree.component';
import { ConversationNotesComponent } from './components/conversation-notes.component';
import { TopicPickerComponent } from './components/topic-picker.component';
import type { CurriculumNode } from '@mentor-ai/shared/types';

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
  styles: [`
    /* All styles inline - no Tailwind dependency */
    :host { display: block; height: 100vh; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    .layout { display: flex; height: 100vh; background: #0D0D0D; color: #FAFAFA; font-family: 'Inter', system-ui, sans-serif; }
    .sidebar { width: 280px; min-width: 280px; background: #0D0D0D; border-right: 1px solid #2A2A2A; display: flex; flex-direction: column; }
    .sidebar-header { height: 48px; display: flex; align-items: center; padding: 0 16px; border-bottom: 1px solid #2A2A2A; }
    .sidebar-header h1 { font-size: 15px; font-weight: 600; }
    .sidebar-actions { padding: 12px; }
    .new-chat-btn { width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px; background: #3B82F6; color: white; border: none; padding: 10px 16px; border-radius: 8px; font-size: 13px; font-weight: 500; cursor: pointer; }
    .new-chat-btn:hover { opacity: 0.9; }
    .sidebar-footer { padding: 12px; border-top: 1px solid #2A2A2A; display: flex; flex-direction: column; gap: 4px; }
    .sidebar-footer a { display: flex; align-items: center; gap: 8px; font-size: 13px; color: #6B6B6B; text-decoration: none; padding: 6px 4px; border-radius: 4px; }
    .sidebar-footer a:hover { color: #FAFAFA; background: #1A1A1A; }
    .chat-main { flex: 1; min-width: 480px; display: flex; flex-direction: column; background: #0D0D0D; }
    .chat-header { height: 48px; display: flex; align-items: center; justify-content: space-between; padding: 0 16px; border-bottom: 1px solid #2A2A2A; }
    .chat-header-left { display: flex; align-items: center; gap: 12px; }
    .chat-header h2 { font-size: 15px; font-weight: 500; }
    .switch-btn { background: none; border: none; color: #6B6B6B; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 6px; }
    .switch-btn:hover { color: #FAFAFA; }
    .header-actions { display: flex; align-items: center; gap: 12px; }
    .chat-messages { flex: 1; overflow-y: auto; padding: 24px; }
    .messages-container { max-width: 768px; margin: 0 auto; }
    .empty-state { flex: 1; display: flex; align-items: center; justify-content: center; }
    .empty-content { text-align: center; max-width: 400px; padding: 24px; }
    .empty-icon { width: 80px; height: 80px; margin: 0 auto 24px; background: #1A1A1A; border-radius: 16px; display: flex; align-items: center; justify-content: center; }
    .empty-title { font-size: 24px; font-weight: 600; margin-bottom: 8px; }
    .empty-desc { font-size: 15px; color: #A1A1A1; margin-bottom: 24px; line-height: 1.5; }
    .start-btn { display: inline-flex; align-items: center; gap: 8px; background: #3B82F6; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-size: 15px; font-weight: 500; cursor: pointer; }
    .start-btn:hover { opacity: 0.9; }
    .persona-pills { display: flex; flex-wrap: wrap; justify-content: center; gap: 8px; margin-top: 32px; }
    .persona-pill { padding: 6px 12px; background: #1A1A1A; border-radius: 20px; font-size: 11px; font-weight: 500; }
    .persona-selector-panel { padding: 12px 16px; border-bottom: 1px solid #2A2A2A; background: #1A1A1A; }
    .persona-selector-label { font-size: 13px; color: #A1A1A1; margin-bottom: 12px; }
    .error-toast { position: fixed; top: 16px; right: 16px; z-index: 50; background: #1A1A1A; border: 1px solid #EF4444; padding: 12px 16px; border-radius: 8px; display: flex; align-items: center; gap: 12px; max-width: 400px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
    .right-panel { width: 360px; min-width: 360px; background: #0D0D0D; border-left: 1px solid #2A2A2A; display: flex; flex-direction: column; }
    .source-header { padding: 12px 16px; border-bottom: 1px solid #2A2A2A; font-size: 11px; font-weight: 600; color: #6B6B6B; text-transform: uppercase; letter-spacing: 0.5px; flex-shrink: 0; }
    .tab-bar { display: flex; gap: 0; border-bottom: 1px solid #2A2A2A; }
    .tab { padding: 8px 20px; background: none; border: none; border-bottom: 2px solid transparent; color: #6B6B6B; font-size: 13px; cursor: pointer; }
    .tab:hover { color: #A1A1A1; }
    .tab.active { color: #FAFAFA; border-bottom-color: #3B82F6; }
    .notes-view { flex: 1; display: flex; flex-direction: column; overflow: hidden; }

    .plan-backdrop {
      position: fixed; inset: 0; z-index: 100;
      background: rgba(0,0,0,0.7); display: flex; align-items: center; justify-content: center;
    }
    .plan-modal {
      background: #1A1A1A; border: 1px solid #2A2A2A; border-radius: 12px;
      width: 560px; max-height: 80vh; display: flex; flex-direction: column;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    }
    .plan-header {
      padding: 16px 20px; border-bottom: 1px solid #2A2A2A;
      display: flex; align-items: center; justify-content: space-between;
    }
    .plan-header h3 { font-size: 16px; font-weight: 600; color: #FAFAFA; }
    .plan-meta { display: flex; gap: 16px; font-size: 12px; color: #A1A1A1; }
    .plan-steps { flex: 1; overflow-y: auto; padding: 12px 20px; }
    .plan-step {
      display: flex; gap: 12px; padding: 10px 0;
      border-bottom: 1px solid #242424;
    }
    .plan-step:last-child { border-bottom: none; }
    .step-indicator {
      width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0;
      display: flex; align-items: center; justify-content: center;
      font-size: 12px; font-weight: 600;
    }
    .step-pending { background: #242424; color: #6B6B6B; }
    .step-in-progress { background: #1E3A5F; color: #60A5FA; }
    .step-completed { background: #1A2E1A; color: #86EFAC; }
    .step-failed { background: #3B1A1A; color: #FCA5A5; }
    .step-info { flex: 1; }
    .step-title { font-size: 13px; font-weight: 500; color: #FAFAFA; }
    .step-desc { font-size: 12px; color: #A1A1A1; margin-top: 2px; }
    .step-tags { display: flex; gap: 6px; margin-top: 4px; }
    .step-tag {
      font-size: 10px; padding: 1px 6px; border-radius: 4px;
      background: #242424; color: #6B6B6B;
    }
    .plan-footer {
      padding: 12px 20px; border-top: 1px solid #2A2A2A;
      display: flex; gap: 8px; justify-content: flex-end;
    }
    .plan-btn-cancel {
      background: none; border: 1px solid #2A2A2A; color: #A1A1A1;
      border-radius: 6px; padding: 8px 20px; font-size: 13px; cursor: pointer;
    }
    .plan-btn-cancel:hover { color: #FAFAFA; border-color: #4A4A4A; }
    .plan-btn-approve {
      background: #3B82F6; color: #FAFAFA; border: none;
      border-radius: 6px; padding: 8px 20px; font-size: 13px; font-weight: 500; cursor: pointer;
    }
    .plan-btn-approve:hover { background: #2563EB; }

    @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    .spinner { animation: spin 1s linear infinite; }

    .execution-progress {
      background: #1A1A1A; border: 1px solid #2A2A2A; border-radius: 10px;
      padding: 14px 18px; margin: 12px 0; max-width: 768px;
    }
    .progress-header {
      display: flex; align-items: center; gap: 10px; margin-bottom: 10px;
    }
    .progress-spinner {
      width: 18px; height: 18px; animation: spin 1s linear infinite;
      color: #3B82F6; flex-shrink: 0;
    }
    .progress-label {
      font-size: 13px; font-weight: 500; color: #FAFAFA;
    }
    .progress-step-name {
      font-size: 12px; color: #A1A1A1; margin-bottom: 8px;
    }
    .progress-bar-container {
      width: 100%; height: 4px; background: #242424; border-radius: 2px; overflow: hidden;
    }
    .progress-bar-fill {
      height: 100%; background: #3B82F6; border-radius: 2px;
      transition: width 0.5s ease-in-out;
    }
    .progress-counter {
      font-size: 11px; color: #6B6B6B; margin-top: 6px; text-align: right;
    }
    .progress-steps-list {
      margin-top: 10px; border-top: 1px solid #242424; padding-top: 8px;
    }
    .progress-step-item {
      display: flex; align-items: center; gap: 8px;
      padding: 3px 0; font-size: 11px; color: #6B6B6B;
    }
    .progress-step-item.active { color: #60A5FA; }
    .progress-step-item.completed { color: #86EFAC; }
    .progress-step-item.failed { color: #FCA5A5; }
    .progress-step-icon { width: 14px; height: 14px; flex-shrink: 0; }
    .progress-step-num {
      width: 14px; height: 14px; display: flex; align-items: center; justify-content: center;
      font-size: 9px; font-weight: 600; color: #4A4A4A; flex-shrink: 0;
    }
    .progress-step-text { flex: 1; }
    .progress-step-concept {
      font-size: 10px; color: #4A4A4A; flex-shrink: 0;
    }

    .yolo-progress {
      padding: 16px; background: #1A1A1A; border: 1px solid #2A2A2A;
      border-radius: 10px; margin: 12px 0; max-width: 768px;
    }
    .yolo-progress-title {
      font-size: 15px; font-weight: 600; margin-bottom: 8px; color: #FAFAFA;
      display: flex; align-items: center; gap: 8px;
    }
    .yolo-spinner {
      width: 16px; height: 16px; border: 2px solid #2A2A2A; border-top-color: #3B82F6;
      border-radius: 50%; animation: spin 0.8s linear infinite; display: inline-block;
    }
    .yolo-progress-stats { font-size: 14px; color: #A0A0A0; text-align: center; }
    .yolo-progress-stats span { color: #3B82F6; font-weight: 600; }
    .yolo-progress-stats .yolo-failed { color: #EF4444; }
    .yolo-progress-stats .yolo-discovered { color: #10B981; font-weight: 600; }
    .yolo-progress-bar {
      height: 4px; background: #2A2A2A; border-radius: 2px; margin-top: 12px; overflow: hidden;
    }
    .yolo-progress-fill { height: 100%; background: #3B82F6; border-radius: 2px; transition: width 0.3s; }

    .yolo-workers {
      margin-top: 10px; border-top: 1px solid #242424; padding-top: 8px;
    }
    .yolo-worker-item {
      display: flex; align-items: center; gap: 8px;
      padding: 4px 0; font-size: 12px; color: #A1A1A1;
    }
    .yolo-worker-spinner {
      width: 12px; height: 12px; border: 2px solid #2A2A2A; border-top-color: #60A5FA;
      border-radius: 50%; animation: spin 0.8s linear infinite; flex-shrink: 0;
    }
    .yolo-worker-concept { color: #FAFAFA; font-weight: 500; }
    .yolo-worker-step { color: #6B6B6B; font-size: 11px; }

    .yolo-activity-toggle {
      background: none; border: none; color: #6B6B6B; cursor: pointer;
      font-size: 11px; padding: 4px 0; margin-top: 8px;
      display: flex; align-items: center; gap: 4px;
    }
    .yolo-activity-toggle:hover { color: #A1A1A1; }
    .yolo-toggle-icon { width: 12px; height: 12px; transition: transform 0.2s; }
    .yolo-toggle-icon.expanded { transform: rotate(90deg); }
    .yolo-activity-log {
      margin-top: 6px; max-height: 160px; overflow-y: auto;
      background: #0D0D0D; border-radius: 6px; padding: 8px;
    }
    .yolo-log-entry {
      font-size: 10px; color: #6B6B6B; padding: 2px 0;
      font-family: 'Courier New', monospace; white-space: pre-wrap; word-break: break-all;
    }

    .step-status-msg {
      display: flex; align-items: center; gap: 8px;
      padding: 8px 14px; margin: 8px 0; max-width: 768px;
      background: #111; border-left: 3px solid #3B82F6;
      border-radius: 0 6px 6px 0;
      font-size: 12px; color: #A1A1A1;
    }
    .step-status-msg .step-icon {
      width: 14px; height: 14px; flex-shrink: 0;
    }

    @keyframes pulse-bg {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.6; }
    }
    .progress-preparing {
      font-size: 12px; color: #60A5FA; margin-top: 8px;
      display: flex; align-items: center; gap: 6px;
      animation: pulse-bg 1.5s ease-in-out infinite;
    }
    .progress-preparing svg {
      width: 14px; height: 14px; flex-shrink: 0;
    }

    @keyframes highlightFlash {
      0% { outline: 2px solid #3B82F6; outline-offset: 4px; }
      100% { outline: 2px solid transparent; outline-offset: 4px; }
    }
    :host ::ng-deep .highlight-flash {
      animation: highlightFlash 2s ease-out;
    }

    /* Step confirmation UI */
    .step-confirmation {
      margin: 16px 0;
      padding: 16px;
      background: #1A1A1A;
      border: 1px solid #2A2A2A;
      border-radius: 12px;
      border-left: 3px solid #3B82F6;
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
      color: #3B82F6;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .confirmation-title {
      font-size: 1rem;
      font-weight: 600;
      color: #FAFAFA;
      margin: 0 0 4px 0;
    }
    .confirmation-desc {
      font-size: 0.875rem;
      color: #A3A3A3;
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
      color: #F59E0B;
      font-weight: 500;
    }
    .input-prompt svg {
      flex-shrink: 0;
    }
    .confirmation-input {
      width: 100%;
      padding: 10px 12px;
      background: #0D0D0D;
      border: 1px solid #2A2A2A;
      border-radius: 8px;
      color: #FAFAFA;
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
      border-color: #3B82F6;
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
      background: #3B82F6;
      color: white;
      border-color: #3B82F6;
    }
    .confirm-btn.primary:hover {
      background: #2563EB;
      border-color: #2563EB;
    }
    .confirm-btn.cancel {
      background: transparent;
      color: #A3A3A3;
      border-color: #2A2A2A;
    }
    .confirm-btn.cancel:hover {
      background: #1A1A1A;
      color: #EF4444;
      border-color: #EF4444;
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
      border: 1px solid #2A2A2A;
      color: #60A5FA;
      padding: 8px 16px;
      border-radius: 8px;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .return-link:hover {
      background: #1A1A1A;
      border-color: #3B82F6;
      color: #93C5FD;
    }
    .return-link svg {
      flex-shrink: 0;
    }
  `],
  template: `
    <!-- Error Toast -->
    @if (errorMessage$()) {
      <div class="error-toast" role="alert">
        <svg style="width: 20px; height: 20px; color: #EF4444; flex-shrink: 0;" fill="currentColor" viewBox="0 0 20 20">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
        </svg>
        <span style="font-size: 13px; color: #FAFAFA;">{{ errorMessage$() }}</span>
        <button (click)="dismissError()" style="background: none; border: none; color: #6B6B6B; cursor: pointer; margin-left: auto;" aria-label="Dismiss">
          <svg style="width: 16px; height: 16px;" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
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

    <!-- Plan Overlay -->
    @if (showPlanOverlay$() && currentPlan$()) {
      <div class="plan-backdrop" (click)="$event.target === $event.currentTarget && !isExecutingWorkflow$() ? rejectPlan() : null">
        <div class="plan-modal">
          <div class="plan-header">
            <h3>{{ isExecutingWorkflow$() ? 'Executing Plan...' : 'Execution Plan' }}</h3>
            <div class="plan-meta">
              <span>{{ currentPlan$()!.steps.length }} steps</span>
              <span>~{{ currentPlan$()!.totalEstimatedMinutes }} min</span>
              <span>{{ currentPlan$()!.conceptOrder.length }} concepts</span>
            </div>
          </div>
          <div class="plan-steps">
            @for (step of currentPlan$()!.steps; track step.stepId) {
              <div class="plan-step">
                <div class="step-indicator"
                  [class.step-pending]="getStepStatus(step.stepId) === 'pending'"
                  [class.step-in-progress]="getStepStatus(step.stepId) === 'in_progress'"
                  [class.step-completed]="getStepStatus(step.stepId) === 'completed'"
                  [class.step-failed]="getStepStatus(step.stepId) === 'failed'"
                >
                  @if (getStepStatus(step.stepId) === 'in_progress') {
                    <svg class="spinner" style="width:16px;height:16px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-width="2" d="M4 12a8 8 0 018-8"/>
                    </svg>
                  } @else if (getStepStatus(step.stepId) === 'completed') {
                    <svg style="width:14px;height:14px;" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                    </svg>
                  } @else if (getStepStatus(step.stepId) === 'failed') {
                    <svg style="width:14px;height:14px;" fill="currentColor" viewBox="0 0 20 20">
                      <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
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
          <div class="plan-footer">
            @if (isExecutingWorkflow$()) {
              <button class="plan-btn-cancel" (click)="cancelExecution()">Cancel Execution</button>
            } @else {
              <button class="plan-btn-cancel" (click)="rejectPlan()">Cancel</button>
              <button class="plan-btn-approve" (click)="approvePlan()">Approve & Execute</button>
            }
          </div>
        </div>
      </div>
    }

    <!-- Three-Panel Layout -->
    <div class="layout">
      <!-- Left Sidebar -->
      <aside class="sidebar">
        <div class="sidebar-header">
          <h1>Mentor AI</h1>
        </div>

        <div class="sidebar-actions">
          <button class="new-chat-btn" (click)="createNewConversation()">
            <svg style="width: 16px; height: 16px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
            </svg>
            New Conversation
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
            <svg style="width: 16px; height: 16px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/>
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/>
            </svg>
            AI Configuration
          </a>
          <a routerLink="/dashboard">
            <svg style="width: 16px; height: 16px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>
            </svg>
            Dashboard
          </a>
        </div>
      </aside>

      <!-- Main Chat Area -->
      <main class="chat-main">
        @if (activeConversation$() || folderName$()) {
          <!-- Chat Header -->
          <header class="chat-header">
            <div class="chat-header-left">
              @if (folderName$() && !activeConversation$()) {
                <svg style="width: 18px; height: 18px; color: #3B82F6;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/>
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
                  <button class="tab" [class.active]="activeTab$() === 'chat'" (click)="activeTab$.set('chat')">Chat</button>
                  <button class="tab" [class.active]="activeTab$() === 'notes'" (click)="activeTab$.set('notes')">Tasks</button>
                </div>
                <button class="switch-btn" (click)="togglePersonaSelector()">
                  <svg style="width: 16px; height: 16px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"/>
                  </svg>
                  {{ showPersonaSelector$() ? 'Hide Personas' : 'Switch Persona' }}
                </button>
              </div>
            }
          </header>

          @if (activeConversation$()) {
            @if (activeTab$() === 'chat') {
            <!-- Persona Selector -->
            @if (showPersonaSelector$()) {
              <div class="persona-selector-panel">
                <p class="persona-selector-label">Select a department persona for specialized AI responses:</p>
                <app-persona-selector
                  [selectedType]="currentPersonaType$()"
                  [allowNone]="false"
                  (personaSelected)="onPersonaSelected($event)"
                />
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
                    style="display: block; margin-bottom: 16px;"
                  />
                }
                @if (isExecutingWorkflow$()) {
                  <div class="execution-progress">
                    <div class="progress-header">
                      <svg class="progress-spinner" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-width="2" d="M4 12a8 8 0 018-8"/>
                      </svg>
                      <span class="progress-label">Izvršavam zadatke...</span>
                    </div>
                    @if (currentStepTitle$()) {
                      <div class="progress-step-name">Korak {{ currentStepIndex$() + 1 }}/{{ totalStepsCount$() }}: {{ currentStepTitle$() }}</div>
                    } @else {
                      <div class="progress-preparing">
                        <svg class="spinner" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-width="2" d="M4 12a8 8 0 018-8"/>
                        </svg>
                        Pripremam plan izvršavanja...
                      </div>
                    }
                    <div class="progress-bar-container">
                      <div class="progress-bar-fill" [style.width.%]="progressPercent$()"></div>
                    </div>
                    <div class="progress-counter">{{ completedStepsCount$() }} / {{ totalStepsCount$() }} koraka zavrseno</div>
                    @if (currentPlan$()) {
                      <div class="progress-steps-list">
                        @for (step of currentPlan$()!.steps; track step.stepId) {
                          <div class="progress-step-item"
                               [class.active]="getStepStatus(step.stepId) === 'in_progress'"
                               [class.completed]="getStepStatus(step.stepId) === 'completed'"
                               [class.failed]="getStepStatus(step.stepId) === 'failed'">
                            @if (getStepStatus(step.stepId) === 'completed') {
                              <svg class="progress-step-icon" fill="currentColor" viewBox="0 0 20 20" style="color: #22C55E;">
                                <path fill-rule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clip-rule="evenodd"/>
                              </svg>
                            } @else if (getStepStatus(step.stepId) === 'in_progress') {
                              <svg class="progress-step-icon spinner" fill="none" stroke="currentColor" viewBox="0 0 24 24" style="color: #60A5FA;">
                                <path stroke-linecap="round" stroke-width="2" d="M4 12a8 8 0 018-8"/>
                              </svg>
                            } @else if (getStepStatus(step.stepId) === 'failed') {
                              <svg class="progress-step-icon" fill="currentColor" viewBox="0 0 20 20" style="color: #EF4444;">
                                <path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd"/>
                              </svg>
                            } @else {
                              <span class="progress-step-num">{{ step.workflowStepNumber }}</span>
                            }
                            <span class="progress-step-text">{{ step.title }}</span>
                            <span class="progress-step-concept">{{ step.conceptName }}</span>
                          </div>
                        }
                      </div>
                    }
                  </div>
                }
                @if (isYoloMode$() && yoloProgress$()) {
                  <div class="yolo-progress">
                    <div class="yolo-progress-title">
                      <span class="yolo-spinner"></span>
                      @if (yoloProgress$()!.currentTasks.length > 0) {
                        Processing {{ yoloProgress$()!.currentTasks.length }} concept{{ yoloProgress$()!.currentTasks.length > 1 ? 's' : '' }}
                      } @else {
                        YOLO Mode — Autonomous Execution
                      }
                    </div>
                    <div class="yolo-progress-stats">
                      Running: <span>{{ yoloProgress$()!.running }}/{{ yoloProgress$()!.maxConcurrency }}</span> |
                      Completed: <span>{{ yoloProgress$()!.completed }}/{{ yoloProgress$()!.total }}</span>
                      @if (yoloProgress$()!.failed > 0) {
                        | Failed: <span class="yolo-failed">{{ yoloProgress$()!.failed }}</span>
                      }
                      @if (yoloProgress$()!.discoveredCount > 0) {
                        | <span class="yolo-discovered">Discovered: {{ yoloProgress$()!.discoveredCount }}</span>
                      }
                    </div>
                    <div class="yolo-progress-bar">
                      <div class="yolo-progress-fill" [style.width.%]="yoloProgress$()!.total > 0 ? (yoloProgress$()!.completed / yoloProgress$()!.total) * 100 : 0"></div>
                    </div>

                    <!-- Per-worker step detail (Story 2.16 AC3) -->
                    @if (yoloProgress$()!.currentTasks.length > 0) {
                      <div class="yolo-workers">
                        @for (worker of yoloProgress$()!.currentTasks; track worker.conceptName) {
                          <div class="yolo-worker-item">
                            <span class="yolo-worker-spinner"></span>
                            <span class="yolo-worker-concept">{{ worker.conceptName }}</span>
                            @if (worker.currentStep) {
                              <span class="yolo-worker-step">
                                Step {{ (worker.currentStepIndex ?? 0) + 1 }}/{{ worker.totalSteps ?? '?' }}: {{ worker.currentStep }}
                              </span>
                            }
                          </div>
                        }
                      </div>
                    }

                    <!-- Activity log toggle (Story 2.16 AC4) -->
                    @if (yoloProgress$()!.recentLogs && yoloProgress$()!.recentLogs!.length > 0) {
                      <button class="yolo-activity-toggle" (click)="toggleYoloActivityLog()">
                        <svg class="yolo-toggle-icon" [class.expanded]="showYoloActivityLog$()" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/>
                        </svg>
                        {{ showYoloActivityLog$() ? 'Hide' : 'Show' }} Activity Log ({{ yoloProgress$()!.recentLogs!.length }})
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
                  <div class="execution-progress">
                    <div class="progress-header">
                      <svg class="progress-spinner" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-width="2" d="M4 12a8 8 0 018-8"/>
                      </svg>
                      <span class="progress-label">Učitavam workflow...</span>
                    </div>
                    <div class="progress-preparing">
                      <svg class="spinner" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-width="2" d="M4 12a8 8 0 018-8"/>
                      </svg>
                      Generišem plan izvršavanja...
                    </div>
                  </div>
                }

                @if (currentWorkflowStepInput$(); as stepInput) {
                  <div class="step-confirmation">
                    <div class="confirmation-header">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                      </svg>
                      <span class="confirmation-label">Korak {{ stepInput.stepIndex + 1 }}/{{ stepInput.totalSteps }}: {{ stepInput.conceptName }}</span>
                    </div>
                    <p class="confirmation-title">{{ stepInput.stepTitle }}</p>
                    <p class="confirmation-desc">{{ stepInput.stepDescription }}</p>
                    @if (stepInput.inputType === 'confirmation') {
                      <div class="confirmation-actions">
                        <button class="confirm-btn primary" (click)="continueWorkflowStep()">
                          Nastavi
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                            <line x1="5" y1="12" x2="19" y2="12"></line>
                            <polyline points="12 5 19 12 12 19"></polyline>
                          </svg>
                        </button>
                        <button class="confirm-btn cancel" (click)="cancelExecution()">
                          Otkazi
                        </button>
                      </div>
                    } @else {
                      <div class="input-prompt">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
                        </svg>
                        <span>Unesite odgovor u polje za poruke ispod</span>
                      </div>
                    }
                  </div>
                }

                @if (previousConversationId$()) {
                  <div class="return-link-container">
                    <button class="return-link" (click)="returnToPreviousConversation()">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                      </svg>
                      <span class="confirmation-label">Korak {{ nextStepInfo$()!.stepIndex + 1 }}/{{ nextStepInfo$()!.totalSteps }}:</span>
                    </div>
                    <p class="confirmation-title">{{ nextStepInfo$()!.title }}</p>
                    <p class="confirmation-desc">{{ nextStepInfo$()!.description }}</p>
                    <div class="input-prompt">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F59E0B" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
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
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
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
              <!-- Notes View (conversation mode) -->
              <div class="notes-view" style="flex: 1; overflow-y: auto;">
                <app-conversation-notes
                  [conversationId]="activeConversationId$()"
                  [conceptId]="activeConversation$()?.conceptId ?? null"
                  [autoSelectTaskIds]="autoSelectTaskIds$()"
                  [isExecuting]="isExecutingWorkflow$()"
                  [executingTaskId]="isGeneratingPlan$() ? executingTaskId$() : null"
                  [isGeneratingPlan]="isGeneratingPlan$()"
                  (viewMessage)="onViewMessage($event)"
                  (runAgents)="onRunAgents($event)"
                  (executeTask)="onExecuteSingleTask($event)"
                />
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
            <!-- Notes View (folder mode only) -->
            <div class="notes-view">
              <app-conversation-notes
                [conversationId]="null"
                [conceptId]="null"
                [folderConceptIds]="folderConceptIds$()"
                [folderConversationIds]="folderConversationIds$()"
                [folderName]="folderName$()"
                [autoSelectTaskIds]="autoSelectTaskIds$()"
                [isExecuting]="isExecutingWorkflow$()"
                [executingTaskId]="isGeneratingPlan$() ? executingTaskId$() : null"
                [isGeneratingPlan]="isGeneratingPlan$()"
                (viewMessage)="onViewMessage($event)"
                (runAgents)="onRunAgents($event)"
                (executeTask)="onExecuteSingleTask($event)"
              />
            </div>
          }
        } @else {
          <!-- Empty State -->
          <div class="empty-state">
            <div class="empty-content">
              <div class="empty-icon">
                <svg style="width: 40px; height: 40px; color: #3B82F6;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/>
                </svg>
              </div>
              <h2 class="empty-title">Welcome to Mentor AI</h2>
              <p class="empty-desc">Your AI-powered business partner with expertise in Finance, Marketing, Technology, Operations, Legal, and Creative.</p>
              <button class="start-btn" (click)="createNewConversation()">
                <svg style="width: 20px; height: 20px;" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"/>
                </svg>
                Start New Conversation
              </button>
              <div class="persona-pills">
                <span class="persona-pill" style="color: #3B82F6;">CFO</span>
                <span class="persona-pill" style="color: #8B5CF6;">CMO</span>
                <span class="persona-pill" style="color: #10B981;">CTO</span>
                <span class="persona-pill" style="color: #F59E0B;">Operations</span>
                <span class="persona-pill" style="color: #EF4444;">Legal</span>
                <span class="persona-pill" style="color: #EC4899;">Creative</span>
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
  `,
})
export class ChatComponent implements OnInit, OnDestroy {
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
  readonly activeConversationId$ = computed(
    () => this.activeConversation$()?.id ?? null
  );
  readonly messages$ = computed(
    () => this.activeConversation$()?.messages ?? []
  );
  readonly isLoading$ = signal(false);
  readonly isStreaming$ = signal(false);
  readonly streamingContent$ = signal('');
  readonly streamingMessage$ = computed((): Message => ({
    id: 'streaming',
    conversationId: this.activeConversationId$() ?? '',
    role: MessageRole.ASSISTANT,
    content: this.streamingContent$(),
    confidenceScore: null,
    confidenceFactors: null,
    createdAt: '',
  }));

  // Persona state
  readonly showPersonaSelector$ = signal(false);
  readonly currentPersonaType$ = computed(
    () => this.activeConversation$()?.personaType ?? null
  );

  // Error state for user feedback
  readonly errorMessage$ = signal<string | null>(null);

  // Concept panel state (Story 2.6)
  readonly selectedConceptId$ = signal<string | null>(null);

  // Tab state for Chat/Notes view
  readonly activeTab$ = signal<'chat' | 'notes'>('chat');

  // Topic picker state
  readonly showTopicPicker$ = signal(false);

  // Workflow execution state
  readonly showPlanOverlay$ = signal(false);
  readonly currentPlan$ = signal<ExecutionPlan | null>(null);
  readonly executionProgress$ = signal<Map<string, ExecutionPlanStep['status']>>(new Map());
  readonly isExecutingWorkflow$ = signal(false);

  // Per-concept conversations created during workflow execution
  readonly createdConceptConversations$ = signal<WorkflowConversationsCreatedPayload['conversations']>([]);

  // New conversation indicators (blue dot)
  readonly newConversationIds$ = signal<Set<string>>(new Set());

  // Folder-level task overview mode
  readonly folderConceptIds$ = signal<string[]>([]);
  readonly folderConversationIds$ = signal<string[]>([]);
  readonly folderName$ = signal<string | null>(null);
  readonly autoSelectTaskIds$ = signal<string[]>([]);

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
  readonly loadingConversationId$ = signal<string | null>(null);
  readonly isCreatingConversation$ = computed(() => this.conversationService.isCreating$());

  // YOLO autonomous execution signals
  readonly isYoloMode$ = signal(false);
  readonly yoloProgress$ = signal<YoloProgressPayload | null>(null);
  readonly showYoloActivityLog$ = signal(false);
  private yoloPending = false;
  private manualAutostartPending = false;

  ngOnInit(): void {
    this.setupWebSocket();

    // Check for conversation ID in route
    this.route.params
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        if (params['conversationId']) {
          this.loadConversation(params['conversationId']);
        }
      });

    // Check for query params set by onboarding wizard
    this.route.queryParams
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        if (params['yolo'] === 'true' && !this.isYoloMode$()) {
          this.isYoloMode$.set(true);
          this.yoloPending = true;
        }
        if (params['autostart'] === 'true') {
          this.manualAutostartPending = true;
        }
      });
  }

  ngOnDestroy(): void {
    this.chatWsService.disconnect();
  }

  async loadConversation(conversationId: string): Promise<void> {
    try {
      const conversation =
        await this.conversationService.getConversation(conversationId);
      this.activeConversation$.set(conversation);
      this.activeTab$.set('chat');
      // Start YOLO execution if flagged from onboarding redirect
      if (this.yoloPending) {
        this.yoloPending = false;
        try {
          await this.chatWsService.waitForConnection();
          this.chatWsService.emitStartYolo(conversationId);
        } catch {
          this.showError('WebSocket connection failed — YOLO mode could not start');
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
      this.showError('Failed to load conversation');
    }
  }

  async createNewConversation(): Promise<void> {
    // Auto-classification handles topic detection — no manual picker needed
    try {
      const conversation = await this.conversationService.createConversation();
      await this.loadConversation(conversation.id);
      this.router.navigate(['/chat', conversation.id]);
      this.conceptTree?.loadTree();
    } catch {
      this.showError('Failed to create conversation');
    }
  }

  async onTopicSelected(node: CurriculumNode | null): Promise<void> {
    this.showTopicPicker$.set(false);
    try {
      const conversation = await this.conversationService.createConversation(
        undefined, undefined, undefined, node?.id
      );
      await this.loadConversation(conversation.id);
      this.router.navigate(['/chat', conversation.id]);
      this.conceptTree?.loadTree();
    } catch {
      this.showError('Failed to create conversation');
    }
  }

  onTopicPickerCancelled(): void {
    this.showTopicPicker$.set(false);
  }

  async createConversationUnderConcept(event: { conceptId: string; conceptName: string }): Promise<void> {
    this.loadingConversationId$.set(event.conceptId);
    try {
      // conceptId here is actually the curriculumId from the tree
      const title = this.formatConversationTitle(event.conceptName);
      const conversation = await this.conversationService.createConversation(
        title, undefined, undefined, event.conceptId
      );
      this.newConversationIds$.update(s => { const n = new Set(s); n.add(conversation.id); return n; });
      await this.loadConversation(conversation.id);
      this.router.navigate(['/chat', conversation.id]);
      this.conceptTree?.loadTree();
    } catch {
      this.showError('Failed to create conversation');
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
    this.newConversationIds$.update(s => { const n = new Set(s); n.delete(conversationId); return n; });
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
        this.showError('Failed to update persona');
      }
    }
    this.showPersonaSelector$.set(false);
  }

  async onConceptSelected(event: { conceptId: string | null; curriculumId: string; conceptName: string; isFolder: boolean; descendantConceptIds: string[]; descendantConversationIds: string[] }): Promise<void> {
    if (event.isFolder) {
      // Folder mode — show aggregated tasks for all descendant concepts + conversations
      this.folderConceptIds$.set(event.descendantConceptIds);
      this.folderConversationIds$.set(event.descendantConversationIds);
      this.folderName$.set(event.conceptName);
      this.activeConversation$.set(null);
      this.activeTab$.set('notes');
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
          title, undefined, undefined, event.curriculumId
        );
        this.newConversationIds$.update(s => { const n = new Set(s); n.add(conversation.id); return n; });
        await this.loadConversation(conversation.id);
        this.router.navigate(['/chat', conversation.id]);
        this.conceptTree?.loadTree();
        this.activeTab$.set('chat');
      }
    } catch {
      this.showError('Failed to load concept');
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
        .filter(n => n.noteType === 'TASK' && n.status === 'PENDING')
        .map(n => n.id);
      if (pendingTaskIds.length > 0) {
        this.onRunAgents(pendingTaskIds);
      }
    } catch {
      // Non-blocking — user can still start manually
    }
  }

  onRunAgents(taskIds: string[]): void {
    const conversationId = this.activeConversationId$();
    if (!conversationId || taskIds.length === 0) return;
    this.isGeneratingPlan$.set(true);
    this.chatWsService.emitRunAgents(taskIds, conversationId);
    // Auto-scroll so the loading indicator is visible
    setTimeout(() => {
      const el = this.messagesContainer?.nativeElement;
      if (el) el.scrollTop = el.scrollHeight;
    });
  }

  onExecuteSingleTask(taskId: string): void {
    this.executingTaskId$.set(taskId);
    this.onRunAgents([taskId]);
  }

  getStepStatus(stepId: string): ExecutionPlanStep['status'] {
    return this.executionProgress$().get(stepId) ?? 'pending';
  }

  approvePlan(): void {
    const plan = this.currentPlan$();
    const conversationId = this.activeConversationId$();
    if (!plan || !conversationId) return;
    this.isExecutingWorkflow$.set(true);
    this.chatWsService.emitWorkflowApproval(plan.planId, true, conversationId);
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
    this.chatWsService.sendMessage(conversationId, content);
  }

  private setupWebSocket(): void {
    this.chatWsService.connect();

    this.chatWsService.onMessageReceived((data) => {
      // Update user message ID with real one from server
      this.activeConversation$.update((conv) => {
        if (!conv) return conv;
        const messages = conv.messages.map((msg, idx, arr) => {
          // Find last user message with temp ID
          const isLastTempUser =
            msg.role === MessageRole.USER &&
            msg.id.startsWith('temp_') &&
            !arr.slice(idx + 1).some(
              (m) => m.role === MessageRole.USER && m.id.startsWith('temp_')
            );
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
      // Extract confidence from metadata (Story 2.5)
      const confidence = data.metadata?.['confidence'] as {
        score?: number;
        factors?: ConfidenceFactor[];
      } | undefined;

      const aiMessage: Message = {
        id: data.messageId,
        conversationId: this.activeConversationId$() ?? '',
        role: MessageRole.ASSISTANT,
        content: data.fullContent,
        confidenceScore: confidence?.score ?? null,
        confidenceFactors: confidence?.factors ?? null,
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

    this.chatWsService.onError(() => {
      this.isLoading$.set(false);
      this.isStreaming$.set(false);
      this.showError('Message failed to send. Please try again.');
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
      this.newConversationIds$.update(s => {
        const n = new Set(s);
        payload.conversations.forEach(c => n.add(c.conversationId));
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

        // Show "preparing next step" transition if more steps remain
        const completed = this.completedStepsCount$();
        const total = this.totalStepsCount$();
        if (completed < total) {
          this.currentStepTitle$.set('Pripremam sledeći korak...');
        }
      }

      if (payload.status === 'completed' && !payload.content) {
        this.completedStepsCount$.update((c) => c + 1);
        // Still show transition
        const completed = this.completedStepsCount$();
        const total = this.totalStepsCount$();
        if (completed < total) {
          this.currentStepTitle$.set('Pripremam sledeći korak...');
        }
      }

      if (payload.status === 'failed') {
        this.completedStepsCount$.update((c) => c + 1);
      }
    });

    this.chatWsService.onWorkflowComplete((payload) => {
      if (payload.conversationId !== this.activeConversationId$()) return;

      // Build completion summary with links to concept conversations
      const statusLabel = payload.status === 'completed' ? 'Završeno' : payload.status === 'cancelled' ? 'Otkazano' : 'Greška';
      const conceptConvs = this.createdConceptConversations$();
      let summaryContent = `**${statusLabel}!** Izvršeno ${payload.completedSteps}/${payload.totalSteps} koraka.`;

      if (conceptConvs.length > 0) {
        summaryContent += '\n\n**Rezultati po konceptima:**';
        conceptConvs.forEach((c, i) => {
          summaryContent += `\n${i + 1}. [[${c.conceptName}]]`;
        });
        summaryContent += '\n\nKliknite na koncept ili odaberite konverzaciju u drvetu sa leve strane da pregledate rezultate.';
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
    });

    this.chatWsService.onWorkflowError((payload) => {
      if (payload.conversationId !== this.activeConversationId$()) return;
      this.closePlanOverlay();
      this.showError(payload.message ?? 'Workflow execution failed');
    });

    this.chatWsService.onStepAwaitingConfirmation((payload) => {
      if (payload.conversationId !== this.activeConversationId$()) return;
      this.activePlanId$.set(payload.planId);
      this.awaitingConfirmation$.set(true);
      this.nextStepInfo$.set(payload.nextStep);
      this.userStepInput$.set('');
    });

    // ─── Interactive Workflow Step Events (Task 6) ───────────────

    this.chatWsService.onStepAwaitingInput((payload: WorkflowStepAwaitingInputPayload) => {
      if (payload.conversationId !== this.activeConversationId$()) return;
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

}
