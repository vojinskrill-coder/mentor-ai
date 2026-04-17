import {
  Component,
  OnInit,
  OnDestroy,
  inject,
  signal,
  DestroyRef,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import {
  MaturityDashboardData,
  MaturityStage,
  StageProgressSummary,
  AutonomousStatusData,
  AutonomousRunResult,
} from '@mentor-ai/shared/types';
import { MaturityService } from './maturity.service';
import { ToastService } from '../../core/services/toast.service';
import { ChatWebsocketService } from '../chat/services/chat-websocket.service';
import { switchMap, catchError, tap, of } from 'rxjs';
import type { DigestSummaryItem } from '@mentor-ai/shared/types';

const PERSONA_LABELS: Record<string, { label: string; color: string }> = {
  CFO: { label: 'CFO — Finance', color: '#58A6FF' },
  CMO: { label: 'CMO — Marketing', color: '#8B5CF6' },
  CTO: { label: 'CTO — Technology', color: '#10B981' },
  OPERATIONS: { label: 'COO — Operations', color: '#F59E0B' },
  LEGAL: { label: 'CLO — Legal', color: '#EF4444' },
  CREATIVE: { label: 'CCO — Creative', color: '#EC4899' },
  CSO: { label: 'CSO — Strategy', color: '#06B6D4' },
  SALES: { label: 'CRO — Sales', color: '#F97316' },
};

const STAGE_META: Record<
  string,
  { label: string; color: string; description: string }
> = {
  BASIC: {
    label: 'Basic',
    color: '#10B981',
    description: 'Foundational concepts — business basics',
  },
  ADVANCED: {
    label: 'Advanced',
    color: '#F59E0B',
    description: 'Advanced strategies and optimization',
  },
  AUTONOMOUS: {
    label: 'Autonomous',
    color: '#8B5CF6',
    description: 'Automated monitoring and continuous improvement',
  },
};

const STAGE_ORDER: MaturityStage[] = [
  MaturityStage.BASIC,
  MaturityStage.ADVANCED,
  MaturityStage.AUTONOMOUS,
];

@Component({
  selector: 'app-maturity-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink],
  styles: [
    `
      :host {
        display: flex;
        flex-direction: column;
        flex: 1;
        width: 100%;
        height: 100%;
        min-height: 0;
        overflow-y: auto;
      }

      .main {
        width: 100%;
        padding: clamp(20px, 2vw, 40px) clamp(20px, 2vw, 40px);
      }

      /* Header */
      .header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 32px;
      }
      .header h1 {
        font-size: 24px;
        font-weight: 600;
      }
      .header-sub {
        font-size: 14px;
        color: #a1a1a1;
        margin-top: 4px;
      }
      .back-link {
        font-size: 14px;
        color: #58A6FF;
        text-decoration: none;
      }
      .back-link:hover {
        text-decoration: underline;
      }

      /* Stage Steps */
      .stage-steps {
        display: flex;
        gap: 0;
        margin-bottom: 32px;
        background: #161B22;
        border-radius: 12px;
        border: 1px solid #21262D;
        overflow: hidden;
      }
      .stage-step {
        flex: 1;
        padding: 20px 24px;
        position: relative;
        cursor: default;
      }
      .stage-step:not(:last-child) {
        border-right: 1px solid #21262D;
      }
      .stage-step.active {
        background: #1C2128;
      }
      .stage-step.completed-stage {
        background: rgba(16, 185, 129, 0.05);
      }
      .stage-step-num {
        width: 28px;
        height: 28px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 13px;
        font-weight: 600;
        margin-bottom: 8px;
        color: white;
      }
      .stage-step-num.pending-num {
        background: #30363D;
        color: #8B949E;
      }
      .stage-step-label {
        font-size: 15px;
        font-weight: 600;
        margin-bottom: 4px;
        white-space: nowrap;
      }
      .stage-step-desc {
        font-size: 12px;
        color: #8B949E;
        white-space: nowrap;
      }
      .stage-badge {
        display: inline-block;
        font-size: 11px;
        font-weight: 500;
        padding: 2px 8px;
        border-radius: 9999px;
        margin-top: 8px;
        white-space: nowrap;
      }

      /* Progress Ring Section */
      .progress-section {
        display: grid;
        grid-template-columns: auto 1fr;
        gap: 32px;
        margin-bottom: 32px;
      }
      @media (max-width: 640px) {
        .progress-section {
          grid-template-columns: 1fr;
        }
      }
      .ring-card {
        background: #161B22;
        border-radius: 12px;
        border: 1px solid #21262D;
        padding: 24px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        min-width: fit-content;
      }
      .ring-container {
        position: relative;
        width: 150px;
        height: 150px;
      }
      .ring-svg {
        transform: rotate(-90deg);
      }
      .ring-bg {
        fill: none;
        stroke: #30363D;
        stroke-width: 8;
      }
      .ring-progress {
        fill: none;
        stroke-width: 8;
        stroke-linecap: round;
        transition: stroke-dashoffset 0.6s ease;
      }
      .ring-text {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        text-align: center;
      }
      .ring-percent {
        font-size: 28px;
        font-weight: 700;
      }
      .ring-label {
        font-size: 11px;
        color: #8B949E;
        margin-top: 2px;
        white-space: nowrap;
      }
      .ring-stats {
        display: flex;
        gap: 16px;
        margin-top: 16px;
        font-size: 12px;
        color: #a1a1a1;
        white-space: nowrap;
      }
      .ring-stat-val {
        font-size: 16px;
        font-weight: 600;
        color: #E6EDF3;
      }

      /* Persona Progress */
      .persona-card {
        background: #161B22;
        border-radius: 12px;
        border: 1px solid #21262D;
        padding: 24px;
      }
      .persona-card h3 {
        font-size: 15px;
        font-weight: 600;
        margin-bottom: 16px;
      }
      .persona-row {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 12px;
      }
      .persona-row:last-child {
        margin-bottom: 0;
      }
      .persona-label {
        min-width: 120px;
        width: auto;
        font-size: 13px;
        font-weight: 500;
        flex-shrink: 0;
        white-space: nowrap;
      }
      .persona-bar-track {
        flex: 1;
        height: 8px;
        background: #30363D;
        border-radius: 4px;
        overflow: hidden;
      }
      .persona-bar-fill {
        height: 100%;
        border-radius: 4px;
        transition: width 0.4s ease;
        min-width: 0;
      }
      .persona-count {
        font-size: 12px;
        color: #a1a1a1;
        width: 50px;
        text-align: right;
        flex-shrink: 0;
      }

      /* Stale Section */
      .stale-section {
        margin-bottom: 32px;
      }
      .section-title {
        font-size: 16px;
        font-weight: 600;
        margin-bottom: 16px;
      }
      .stale-card {
        background: #161B22;
        border-radius: 12px;
        border: 1px solid #21262D;
        padding: 20px;
      }
      .stale-empty {
        font-size: 14px;
        color: #8B949E;
        text-align: center;
        padding: 16px;
      }
      .stale-item {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 12px 0;
        border-bottom: 1px solid #1C2128;
      }
      .stale-item:last-child {
        border-bottom: none;
      }
      .stale-name {
        font-size: 14px;
        font-weight: 500;
      }
      .stale-reason {
        font-size: 12px;
        color: #D29922;
        margin-top: 2px;
      }
      .stale-btn {
        padding: 6px 14px;
        border-radius: 6px;
        font-size: 13px;
        font-weight: 500;
        background: #1C2128;
        color: #E6EDF3;
        border: 1px solid #21262D;
        cursor: pointer;
        transition: background 0.15s;
      }
      .stale-btn:hover {
        background: #30363D;
      }
      .stale-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }

      /* Actions */
      .actions {
        display: flex;
        gap: 12px;
        flex-wrap: wrap;
      }
      .btn-primary {
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 15px;
        font-weight: 500;
        background: #58A6FF;
        color: white;
        border: none;
        cursor: pointer;
        transition: opacity 0.15s;
      }
      .btn-primary:hover {
        opacity: 0.9;
      }
      .btn-primary:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      .btn-secondary {
        padding: 12px 24px;
        border-radius: 8px;
        font-size: 15px;
        font-weight: 500;
        background: #1C2128;
        color: #E6EDF3;
        border: 1px solid #21262D;
        cursor: pointer;
        transition: background 0.15s;
      }
      .btn-secondary:hover {
        background: #30363D;
      }

      /* Not Initialized */
      .init-card {
        background: #161B22;
        border-radius: 12px;
        border: 1px solid #21262D;
        padding: 48px 32px;
        text-align: center;
      }
      .init-icon {
        width: 64px;
        height: 64px;
        margin: 0 auto 16px;
        border-radius: 50%;
        background: rgba(88, 166, 255, 0.1);
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .init-icon svg {
        width: 32px;
        height: 32px;
        color: #58A6FF;
      }
      .init-card h2 {
        font-size: 20px;
        font-weight: 600;
        margin-bottom: 8px;
      }
      .init-card p {
        font-size: 14px;
        color: #a1a1a1;
        margin-bottom: 24px;
        max-width: 480px;
        margin-left: auto;
        margin-right: auto;
        line-height: 1.6;
      }

      /* Loading */
      .loading-state {
        text-align: center;
        padding: 64px 24px;
        color: #8B949E;
        font-size: 15px;
      }
      .error-state {
        text-align: center;
        padding: 64px 24px;
        color: #F85149;
        font-size: 15px;
      }

      /* Autonomous Section */
      .autonomous-section {
        margin-bottom: 32px;
      }
      .autonomous-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 16px;
      }
      .autonomous-header h3 {
        font-size: 16px;
        font-weight: 600;
      }
      .status-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        font-weight: 500;
        padding: 4px 10px;
        border-radius: 9999px;
      }
      .status-badge.active {
        background: rgba(16, 185, 129, 0.15);
        color: #10B981;
      }
      .status-badge.inactive {
        background: rgba(136, 136, 136, 0.15);
        color: #8B949E;
      }
      .status-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        display: inline-block;
      }
      .status-dot.green {
        background: #10B981;
      }
      .status-dot.gray {
        background: #8B949E;
      }
      .auto-card {
        background: #161B22;
        border-radius: 12px;
        border: 1px solid #21262D;
        padding: 20px;
      }
      .auto-stats {
        display: grid;
        grid-template-columns: repeat(4, 1fr);
        gap: 16px;
        margin-bottom: 20px;
      }
      @media (max-width: 640px) {
        .auto-stats {
          grid-template-columns: repeat(2, 1fr);
        }
      }
      .auto-stat {
        text-align: center;
      }
      .auto-stat-val {
        font-size: 20px;
        font-weight: 600;
        color: #E6EDF3;
      }
      .auto-stat-label {
        font-size: 11px;
        color: #8B949E;
        margin-top: 4px;
        white-space: nowrap;
      }
      .auto-last-run {
        font-size: 12px;
        color: #a1a1a1;
        margin-bottom: 16px;
      }
      .runs-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 13px;
      }
      .runs-table th {
        text-align: left;
        padding: 8px 12px;
        border-bottom: 1px solid #21262D;
        color: #8B949E;
        font-weight: 500;
        font-size: 11px;
        text-transform: uppercase;
      }
      .runs-table td {
        padding: 8px 12px;
        border-bottom: 1px solid #1C2128;
      }
      .runs-table tr:last-child td {
        border-bottom: none;
      }
      .run-type-badge {
        display: inline-block;
        font-size: 11px;
        padding: 2px 8px;
        border-radius: 4px;
        background: #1C2128;
        color: #a1a1a1;
      }
      .run-status {
        font-size: 11px;
        font-weight: 500;
      }
      .run-status.completed {
        color: #10B981;
      }
      .run-status.failed {
        color: #F85149;
      }
      .run-status.running {
        color: #D29922;
      }
      .auto-actions {
        display: flex;
        gap: 12px;
        margin-top: 16px;
      }
      .btn-scan {
        padding: 10px 20px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 500;
        background: #8B5CF6;
        color: white;
        border: none;
        cursor: pointer;
        transition: opacity 0.15s;
      }
      .btn-scan:hover {
        opacity: 0.9;
      }
      .btn-scan:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }

      /* Digest Section */
      .digest-section {
        margin-bottom: 32px;
      }
      .digest-header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 16px;
      }
      .digest-header h3 {
        font-size: 16px;
        font-weight: 600;
      }
      .digest-new-badge {
        display: inline-block;
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #58A6FF;
        animation: digest-pulse 2s ease-in-out infinite;
      }
      @keyframes digest-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
      }
      .digest-card {
        background: #161B22;
        border-radius: 12px;
        border: 1px solid #21262D;
        padding: 20px;
      }
      .digest-empty {
        font-size: 14px;
        color: #8B949E;
        text-align: center;
        padding: 16px;
      }
      .digest-item {
        border-bottom: 1px solid #1C2128;
        cursor: pointer;
        transition: background 0.15s;
      }
      .digest-item:last-child {
        border-bottom: none;
      }
      .digest-item:hover {
        background: #1C2128;
      }
      .digest-item-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 14px 0;
      }
      .digest-title {
        font-size: 14px;
        font-weight: 500;
        color: #E6EDF3;
      }
      .digest-date {
        font-size: 12px;
        color: #8B949E;
        flex-shrink: 0;
        margin-left: 16px;
      }
      .digest-preview {
        font-size: 13px;
        color: #a1a1a1;
        margin-top: 4px;
        line-height: 1.5;
      }
      .digest-expand-icon {
        font-size: 12px;
        color: #8B949E;
        margin-left: 8px;
        transition: transform 0.2s;
      }
      .digest-expand-icon.open {
        transform: rotate(180deg);
      }
      .digest-content {
        padding: 0 0 16px 0;
        font-size: 14px;
        color: #d1d1d1;
        line-height: 1.7;
        white-space: pre-wrap;
      }
      .digest-loading {
        font-size: 13px;
        color: #8B949E;
        text-align: center;
        padding: 16px;
      }

      /* Start Execution Card */
      .start-execution-card {
        background: #161B22;
        border: 1px solid #58A6FF;
        border-radius: 12px;
        padding: 24px;
        margin-bottom: 24px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 24px;
      }
      .start-exec-info h3 {
        font-size: 16px;
        font-weight: 600;
        margin-bottom: 4px;
      }
      .start-exec-info p {
        font-size: 13px;
        color: #a1a1a1;
        margin: 0;
      }
      .btn-start-exec {
        background: #58A6FF;
        color: white;
        border: none;
        padding: 12px 28px;
        border-radius: 8px;
        font-size: 14px;
        font-weight: 600;
        cursor: pointer;
        white-space: nowrap;
        transition: background 0.15s;
      }
      .btn-start-exec:hover:not(:disabled) {
        background: #1F6FEB;
      }
      .btn-start-exec:disabled {
        opacity: 0.6;
        cursor: not-allowed;
      }

      /* Execution Progress Bar */
      .execution-panel {
        background: #161B22;
        border: 1px solid #58A6FF;
        border-radius: 12px;
        padding: 16px 24px;
        margin-bottom: 24px;
      }
      .execution-header {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 10px;
      }
      .execution-header h3 {
        font-size: 15px;
        font-weight: 600;
        color: #E6EDF3;
        margin: 0;
        flex: 1;
      }
      .execution-spinner {
        width: 18px;
        height: 18px;
        border: 2px solid #21262D;
        border-top-color: #58A6FF;
        border-radius: 50%;
        animation: exec-spin 0.8s linear infinite;
        flex-shrink: 0;
      }
      @keyframes exec-spin {
        to { transform: rotate(360deg); }
      }
      .exec-stat {
        font-size: 13px;
        font-weight: 500;
        color: #a1a1a1;
        flex-shrink: 0;
      }
      .exec-done { color: #10B981; }
      .exec-fail { color: #F85149; }
      .execution-bar-track {
        height: 4px;
        background: #21262D;
        border-radius: 2px;
        overflow: hidden;
      }
      .execution-bar-fill {
        height: 100%;
        background: linear-gradient(90deg, #58A6FF, #10B981);
        border-radius: 2px;
        transition: width 0.5s ease;
      }
      .execution-current {
        font-size: 13px;
        color: #a1a1a1;
        margin-top: 8px;
      }
      .exec-persona {
        color: #6E7681;
        margin-left: 4px;
      }
    `,
  ],
  template: `
    <main class="main">
      <div class="header">
        <div>
          <h1>Maturity Engine</h1>
          <div class="header-sub">Business development plan in three phases</div>
        </div>
        <a routerLink="/dashboard" class="back-link">← Back to dashboard</a>
      </div>

      <!-- Loading -->
      <div *ngIf="isLoading()" class="loading-state">Loading...</div>

      <!-- Error -->
      <div *ngIf="error()" class="error-state">{{ error() }}</div>

      <!-- Initializing in Background (post-onboarding) -->
      <div *ngIf="!isLoading() && !error() && (isInitializingStage() || isInitializing())" class="init-card">
        <div class="execution-spinner" style="width:40px;height:40px;margin:0 auto 16px;border-width:3px"></div>
        <h2>Preparing tasks...</h2>
        <p *ngIf="initCurrentPersona()">
          Analyzing concepts for <strong>{{ getPersonaLabel(initCurrentPersona()) || initCurrentPersona() }}</strong>
          ({{ initPersonaIndex() }}/{{ initTotalPersonas() }})
        </p>
        <p *ngIf="!initCurrentPersona()">
          AI classifier is analyzing your business and preparing concepts for each C-level persona.
        </p>
        <div class="execution-bar-track" style="margin-top: 16px; max-width: 400px; margin-left: auto; margin-right: auto;">
          <div class="execution-bar-fill"
               [style.width.%]="initTotalPersonas() > 0 ? (initPersonaIndex() / initTotalPersonas()) * 100 : 0">
          </div>
        </div>
        <p *ngIf="initAssignedSoFar() > 0" style="font-size: 12px; color: #8B949E; margin-top: 8px;">
          {{ initAssignedSoFar() }} concepts assigned so far
        </p>
      </div>

      <!-- Not Initialized -->
      <div *ngIf="!isLoading() && !error() && !dashboard()?.currentStage && !isInitializingStage() && !isInitializing() && !isExecuting()" class="init-card">
        <div class="init-icon">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
              d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
        </div>
        <h2>Launch the Maturity Engine</h2>
        <p>
          The AI classifier will analyze your business and determine which concepts each
          persona needs to execute in the Basic phase — foundational steps for your business.
        </p>
        <button class="btn-primary" (click)="initializeBasic()" [disabled]="isInitializing()">
          {{ isInitializing() ? 'Initializing...' : 'Initialize Basic phase' }}
        </button>
      </div>

      <!-- Dashboard Active -->
      <ng-container *ngIf="!isLoading() && !error() && dashboard()?.currentStage && !isInitializingStage() && !isInitializing()">
        <!-- Stage Steps -->
        <div class="stage-steps">
          <div *ngFor="let stage of stages; let i = index"
               class="stage-step"
               [class.active]="stage === dashboard()?.currentStage"
               [class.completed-stage]="isStageCompleted(stage)">
            <div class="stage-step-num"
                 [class.pending-num]="!isStageReached(stage)"
                 [style.background]="isStageReached(stage) ? getStageMeta(stage).color : ''">
              {{ isStageCompleted(stage) ? '✓' : i + 1 }}
            </div>
            <div class="stage-step-label">{{ getStageMeta(stage).label }}</div>
            <div class="stage-step-desc">{{ getStageMeta(stage).description }}</div>
            <span *ngIf="stage === dashboard()?.currentStage"
                  class="stage-badge"
                  [style.background]="getStageMeta(stage).color + '20'"
                  [style.color]="getStageMeta(stage).color">
              Active
            </span>
          </div>
        </div>

        <!-- Start Execution Button — shown when tasks pending and not already executing -->
        <div class="start-execution-card" *ngIf="canStartExecution() && !isExecuting()">
          <div class="start-exec-info">
            <h3>{{ dashboard()?.progress?.pending || 0 }} tasks awaiting execution</h3>
            <p>Start automatic execution of all tasks in dependency order. Independent tasks execute in parallel.</p>
          </div>
          <button class="btn-start-exec" (click)="startExecution()" [disabled]="isStartingExecution()">
            {{ isStartingExecution() ? 'Launching...' : 'Start execution' }}
          </button>
        </div>

        <!-- Execution Progress Bar -->
        <div class="execution-panel" *ngIf="isExecuting()">
          <div class="execution-header">
            <div class="execution-spinner"></div>
            <h3>Execution in progress</h3>
            <span class="exec-stat exec-done">{{ executionDone() }}/{{ executionTotal() }}</span>
            <span class="exec-stat exec-fail" *ngIf="executionFailed() > 0">{{ executionFailed() }} failed</span>
          </div>
          <div class="execution-bar-track">
            <div class="execution-bar-fill"
                 [style.width.%]="executionTotal() > 0 ? ((executionDone() + executionFailed()) / executionTotal()) * 100 : 0">
            </div>
          </div>
          <div class="execution-current" *ngIf="executionCurrent() as current">
            {{ current.conceptName }}
            <span class="exec-persona">{{ getPersonaLabel(current.personaType) }}</span>
          </div>
        </div>

        <!-- Progress Ring + Persona Grid -->
        <div class="progress-section" *ngIf="dashboard()?.progress as progress">
          <!-- Ring -->
          <div class="ring-card">
            <div class="ring-container">
              <svg class="ring-svg" width="150" height="150" viewBox="0 0 120 120">
                <circle class="ring-bg" cx="60" cy="60" r="52" />
                <circle class="ring-progress"
                        cx="60" cy="60" r="52"
                        [style.stroke]="getCurrentStageColor()"
                        [attr.stroke-dasharray]="ringCircumference"
                        [attr.stroke-dashoffset]="ringOffset(progress.completionPercent)" />
              </svg>
              <div class="ring-text">
                <div class="ring-percent" [style.color]="getCurrentStageColor()">
                  {{ progress.completionPercent }}%
                </div>
                <div class="ring-label">Complete</div>
              </div>
            </div>
            <div class="ring-stats">
              <div style="text-align: center">
                <div class="ring-stat-val">{{ progress.completed }}</div>
                <div>Completed</div>
              </div>
              <div style="text-align: center">
                <div class="ring-stat-val">{{ progress.pending + progress.inProgress }}</div>
                <div>Remaining</div>
              </div>
              <div style="text-align: center">
                <div class="ring-stat-val">{{ progress.stale }}</div>
                <div>Stale</div>
              </div>
            </div>
          </div>

          <!-- Per-Persona -->
          <div class="persona-card">
            <h3>Progress per persona</h3>
            <div *ngFor="let key of personaKeys" class="persona-row">
              <div class="persona-label" [style.color]="getPersonaColor(key)">
                {{ getPersonaLabel(key) }}
              </div>
              <div class="persona-bar-track">
                <div class="persona-bar-fill"
                     [style.width.%]="getPersonaPercent(progress, key)"
                     [style.background]="getPersonaColor(key)">
                </div>
              </div>
              <div class="persona-count">
                {{ getPersonaCompleted(progress, key) }}/{{ getPersonaTotal(progress, key) }}
              </div>
            </div>
          </div>
        </div>

        <!-- Stale Concepts -->
        <div class="stale-section" *ngIf="dashboard()?.staleConcepts as staleConcepts">
          <h3 class="section-title">Stale concepts</h3>
          <div class="stale-card">
            <div *ngIf="staleConcepts.length === 0" class="stale-empty">
              No stale concepts.
            </div>
            <div *ngFor="let item of staleConcepts" class="stale-item">
              <div>
                <div class="stale-name">{{ item.conceptName }}</div>
                <div class="stale-reason">{{ item.reason }}</div>
              </div>
              <button class="stale-btn"
                      (click)="reExecute(item.conceptId)"
                      [disabled]="reExecutingId() === item.conceptId">
                {{ reExecutingId() === item.conceptId ? 'Launching...' : 'Re-execute' }}
              </button>
            </div>
          </div>
        </div>

        <!-- Autonomous Section (only for AUTONOMOUS stage) -->
        <div class="autonomous-section" *ngIf="dashboard()?.currentStage === 'AUTONOMOUS'">
          <div class="autonomous-header">
            <h3>Autonomous scheduler</h3>
            <span class="status-badge" [class.active]="autoStatus()?.enabled" [class.inactive]="!autoStatus()?.enabled">
              <span class="status-dot" [class.green]="autoStatus()?.enabled" [class.gray]="!autoStatus()?.enabled"></span>
              {{ autoStatus()?.enabled ? 'Active' : 'Inactive' }}
            </span>
          </div>
          <div class="auto-card">
            <!-- Stats summary from last run -->
            <div *ngIf="autoStatus()?.lastRun as lastRun" class="auto-stats">
              <div class="auto-stat">
                <div class="auto-stat-val">{{ lastRun.staleFound }}</div>
                <div class="auto-stat-label">Stale</div>
              </div>
              <div class="auto-stat">
                <div class="auto-stat-val">{{ lastRun.reExecuted }}</div>
                <div class="auto-stat-label">Re-executed</div>
              </div>
              <div class="auto-stat">
                <div class="auto-stat-val">{{ lastRun.tasksCompleted }}</div>
                <div class="auto-stat-label">Completed</div>
              </div>
              <div class="auto-stat">
                <div class="auto-stat-val">{{ formatDuration(lastRun.durationMs) }}</div>
                <div class="auto-stat-label">Duration</div>
              </div>
            </div>

            <div *ngIf="autoStatus()?.lastRun as lastRun" class="auto-last-run">
              Last run: {{ formatDate(lastRun.startedAt) }}
              · Status: {{ lastRun.status === 'COMPLETED' ? 'Successful' : lastRun.status === 'FAILED' ? 'Failed' : 'In progress' }}
            </div>

            <!-- Recent runs table -->
            <table class="runs-table" *ngIf="autoStatus()?.recentRuns?.length">
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Stale</th>
                  <th>Executed</th>
                  <th>Date</th>
                </tr>
              </thead>
              <tbody>
                <tr *ngFor="let run of autoStatus()?.recentRuns?.slice(0, 5)">
                  <td><span class="run-type-badge">{{ formatRunType(run.runType) }}</span></td>
                  <td>
                    <span class="run-status"
                          [class.completed]="run.status === 'COMPLETED'"
                          [class.failed]="run.status === 'FAILED'"
                          [class.running]="run.status === 'RUNNING'">
                      {{ run.status === 'COMPLETED' ? 'OK' : run.status === 'FAILED' ? 'Error' : 'Running...' }}
                    </span>
                  </td>
                  <td>{{ run.staleFound }}</td>
                  <td>{{ run.tasksCompleted }}</td>
                  <td>{{ formatDate(run.startedAt) }}</td>
                </tr>
              </tbody>
            </table>

            <div *ngIf="!autoStatus()?.recentRuns?.length" class="stale-empty">
              No previous autonomous runs.
            </div>

            <div class="auto-actions">
              <button class="btn-scan" (click)="triggerScan()" [disabled]="isScanning()">
                {{ isScanning() ? 'Scanning...' : 'Start scan' }}
              </button>
            </div>
          </div>
        </div>

        <!-- Weekly Digests (AUTONOMOUS stage only) -->
        <div class="digest-section" *ngIf="dashboard()?.currentStage === 'AUTONOMOUS'">
          <div class="digest-header">
            <h3>Weekly reports</h3>
            <span *ngIf="hasNewDigest()" class="digest-new-badge"></span>
          </div>
          <div class="digest-card">
            <div *ngIf="digestsLoading() && digests().length === 0" class="digest-loading">
              Loading reports...
            </div>
            <div *ngIf="!digestsLoading() && digests().length === 0" class="digest-empty">
              No weekly reports. The first one will be generated on Monday at 9:00 AM.
            </div>
            <div *ngFor="let digest of digests()" class="digest-item" (click)="toggleDigest(digest.id)">
              <div class="digest-item-header">
                <div>
                  <div class="digest-title">{{ digest.title }}</div>
                  <div *ngIf="expandedDigestId() !== digest.id" class="digest-preview">
                    {{ digest.contentPreview }}
                  </div>
                </div>
                <div style="display: flex; align-items: center">
                  <span class="digest-date">{{ formatDate(digest.createdAt) }}</span>
                  <span class="digest-expand-icon" [class.open]="expandedDigestId() === digest.id">▼</span>
                </div>
              </div>
              <div *ngIf="expandedDigestId() === digest.id" class="digest-content">
                {{ digest.content }}
              </div>
            </div>
          </div>
        </div>

        <!-- Actions -->
        <div class="actions">
          <button *ngIf="dashboard()?.progress?.canTransition"
                  class="btn-primary"
                  (click)="transition()"
                  [disabled]="isTransitioning()">
            {{ isTransitioning() ? 'Transitioning...' : 'Advance to ' + getNextStageLabel() }}
          </button>
          <button class="btn-secondary" (click)="refresh()">Refresh data</button>
        </div>
      </ng-container>
    </main>
  `,
})
export class MaturityDashboardComponent implements OnInit, OnDestroy {
  private readonly maturityService = inject(MaturityService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly toastService = inject(ToastService);
  private readonly wsService = inject(ChatWebsocketService);

  readonly stages = STAGE_ORDER;
  readonly personaKeys = Object.keys(PERSONA_LABELS);
  readonly ringCircumference = 2 * Math.PI * 52; // ~326.73

  dashboard = signal<MaturityDashboardData | null>(null);
  autoStatus = signal<AutonomousStatusData | null>(null);
  isLoading = signal(true);
  error = signal('');
  isInitializing = signal(false);
  isTransitioning = signal(false);
  reExecutingId = signal<string | null>(null);
  isScanning = signal(false);

  // Digest state
  digests = signal<DigestSummaryItem[]>([]);
  digestsLoading = signal(false);
  expandedDigestId = signal<string | null>(null);
  hasNewDigest = signal(false);

  // Stage execution state
  isStartingExecution = signal(false);
  isExecuting = signal(false);
  executionTotal = signal(0);
  executionDone = signal(0);
  executionFailed = signal(0);
  executionCurrent = signal<{ conceptName: string; personaType: string } | null>(null);

  // Initializing state (post-onboarding)
  isInitializingStage = signal(false);
  initPersonaIndex = signal(0);
  initTotalPersonas = signal(8);
  initCurrentPersona = signal('');
  initAssignedSoFar = signal(0);

  // WS unsubscribe handles
  private unsubDigestReady: (() => void) | null = null;
  private unsubScanComplete: (() => void) | null = null;
  private unsubStageInit: (() => void) | null = null;
  private unsubInitProgress: (() => void) | null = null;
  private unsubExecStarted: (() => void) | null = null;
  private unsubExecProgress: (() => void) | null = null;
  private unsubExecComplete: (() => void) | null = null;

  ngOnInit(): void {
    this.loadDashboard();
    this.checkExecutionStatus();
    this.setupWebSocketListeners();
  }

  ngOnDestroy(): void {
    this.unsubDigestReady?.();
    this.unsubScanComplete?.();
    this.unsubStageInit?.();
    this.unsubInitProgress?.();
    this.unsubExecStarted?.();
    this.unsubExecProgress?.();
    this.unsubExecComplete?.();
  }

  loadDashboard(): void {
    this.isLoading.set(true);
    this.error.set('');
    this.maturityService
      .getDashboard()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.dashboard.set(data);
          this.isLoading.set(false);
          if (data.currentStage === 'AUTONOMOUS') {
            this.loadAutonomousStatus();
            this.loadDigests();
          }
        },
        error: () => {
          this.error.set('Error loading maturity data.');
          this.isLoading.set(false);
        },
      });
  }

  /** Recover execution state on page load (handles page refresh during execution) */
  private checkExecutionStatus(): void {
    this.maturityService
      .getExecutionStatus()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (status) => {
          if (status.running) {
            this.isExecuting.set(true);
            // Use stable total from engine's progress map (doesn't shrink as tasks complete)
            this.executionTotal.set(status.total ?? (status.pendingCount + status.inProgressCount));
            // Recover progress details from enriched API response
            this.executionDone.set(status.executed ?? 0);
            this.executionFailed.set(status.failed ?? 0);
            if (status.currentConceptName) {
              this.executionCurrent.set({ conceptName: status.currentConceptName, personaType: '' });
            }
          } else if (status.initializing) {
            // Stage initialization in progress (post-onboarding)
            this.isInitializingStage.set(true);
          }
        },
        error: () => { /* non-blocking */ },
      });
  }

  initializeBasic(): void {
    this.isInitializing.set(true);
    this.isInitializingStage.set(true);
    this.maturityService
      .initializeStage(MaturityStage.BASIC)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isInitializing.set(false);
          this.isInitializingStage.set(false);
          this.loadDashboard();
          // Execution auto-starts after init — detect it via API polling
          this.checkExecutionStatus();
        },
        error: () => {
          this.isInitializing.set(false);
          this.isInitializingStage.set(false);
          this.error.set('Error during initialization. Try again.');
        },
      });
  }

  transition(): void {
    this.isTransitioning.set(true);
    this.maturityService
      .transitionToNextStage()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isTransitioning.set(false);
          this.loadDashboard();
        },
        error: () => {
          this.isTransitioning.set(false);
          this.error.set('Transition not possible. Check if the phase is complete.');
        },
      });
  }

  reExecute(conceptId: string): void {
    this.reExecutingId.set(conceptId);

    // Check prerequisites first, show warnings as toasts, then proceed
    this.maturityService
      .checkPrerequisites(conceptId)
      .pipe(
        tap((result) => {
          if (result.warnings?.length > 0) {
            for (const w of result.warnings) {
              this.toastService.info(w.message);
            }
          }
        }),
        catchError(() => of(null)), // If prerequisite check fails, continue anyway
        switchMap(() => this.maturityService.reExecuteConcept(conceptId)),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe({
        next: () => {
          this.reExecutingId.set(null);
          this.toastService.success('Re-analysis started.');
          this.loadDashboard();
        },
        error: () => {
          this.reExecutingId.set(null);
          this.toastService.error('Error re-executing concept.');
        },
      });
  }

  canStartExecution(): boolean {
    const d = this.dashboard();
    if (!d?.progress || !d.currentStage) return false;
    return d.progress.pending > 0 && !this.isExecuting();
  }

  startExecution(): void {
    const stage = this.dashboard()?.currentStage;
    if (!stage) return;
    this.isStartingExecution.set(true);
    this.maturityService
      .executeStage(stage as MaturityStage)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => {
          this.isStartingExecution.set(false);
          if (data.alreadyRunning) {
            this.isExecuting.set(true);
            this.executionTotal.set(data.pendingCount);
            this.toastService.info('Execution already in progress.');
          } else if (data.started) {
            this.isExecuting.set(true);
            this.executionTotal.set(data.pendingCount);
            this.executionDone.set(0);
            this.executionFailed.set(0);
            this.toastService.success(
              `Started execution of ${data.pendingCount} tasks`,
            );
          } else {
            this.toastService.info('No tasks to execute.');
          }
        },
        error: (err: unknown) => {
          this.isStartingExecution.set(false);
          const httpErr = err as { error?: { detail?: string; message?: string }; status?: number; message?: string };
          const detail = httpErr?.error?.detail || httpErr?.error?.message || httpErr?.message || 'Unknown error';
          this.toastService.error(`Error: [${httpErr?.status ?? '?'}] ${detail}`);
          console.error('Execute stage error:', err);
        },
      });
  }

  refresh(): void {
    this.loadDashboard();
  }

  loadAutonomousStatus(): void {
    this.maturityService
      .getAutonomousStatus()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (data) => this.autoStatus.set(data),
        error: () => {
          /* non-blocking */
        },
      });
  }

  private setupWebSocketListeners(): void {
    this.unsubDigestReady = this.wsService.onDigestReady(() => {
      this.toastService.success('New weekly report is ready!');
      this.hasNewDigest.set(true);
      this.loadDigests();
      if (this.dashboard()?.currentStage === 'AUTONOMOUS') {
        this.loadAutonomousStatus();
      }
    });

    this.unsubScanComplete = this.wsService.onScanComplete((data) => {
      this.toastService.info(
        `Automatic scan completed: ${data.staleFound} stale found`,
      );
      this.loadDashboard();
      if (this.dashboard()?.currentStage === 'AUTONOMOUS') {
        this.loadAutonomousStatus();
      }
    });

    // Stage initialization progress
    this.unsubInitProgress = this.wsService.onInitProgress((data) => {
      this.isInitializingStage.set(true);
      this.initPersonaIndex.set(data.personaIndex + 1);
      this.initTotalPersonas.set(data.totalPersonas);
      this.initCurrentPersona.set(data.persona);
      this.initAssignedSoFar.set(data.assignedSoFar);
    });

    // Stage execution events
    this.unsubStageInit = this.wsService.onStageInitialized((data) => {
      this.isInitializingStage.set(false);
      this.toastService.success(
        `${data.stage} phase initialized — ${data.assignmentCount} concepts, ${data.noteCount} tasks created`,
      );
      this.loadDashboard();
      // Check if auto-execution already started (safety net if WS event was missed)
      this.checkExecutionStatus();
    });

    this.unsubExecStarted = this.wsService.onExecutionStarted(() => {
      this.isExecuting.set(true);
      this.isInitializingStage.set(false);
      this.executionDone.set(0);
      this.executionFailed.set(0);
    });

    this.unsubExecProgress = this.wsService.onExecutionProgress((data) => {
      this.executionTotal.set(data.total);
      this.executionDone.set(data.executed);
      this.executionFailed.set(data.failed);
      this.executionCurrent.set(data.current ? {
        conceptName: data.current.conceptName,
        personaType: data.current.personaType,
      } : null);

      // Update dashboard progress in real-time from WS events
      const d = this.dashboard();
      if (d?.progress) {
        const totalAssignments = d.progress.totalAssignments;
        const completed = data.executed;
        this.dashboard.set({
          ...d,
          progress: {
            ...d.progress,
            completed,
            inProgress: data.total - data.executed - data.failed,
            pending: totalAssignments - completed - (data.total - data.executed - data.failed),
            completionPercent: totalAssignments > 0 ? Math.round((completed / totalAssignments) * 100) : 0,
          },
        });
      }
    });

    this.unsubExecComplete = this.wsService.onExecutionComplete((data) => {
      this.isExecuting.set(false);
      this.isInitializingStage.set(false);
      this.executionCurrent.set(null);
      if (data.failed > 0) {
        this.toastService.info(
          `Execution completed: ${data.executed} successful, ${data.failed} failed out of ${data.total}`,
        );
      } else {
        this.toastService.success(
          `All ${data.executed} tasks successfully executed!`,
        );
      }
      // Reload full dashboard to get accurate final state
      this.loadDashboard();
    });
  }

  loadDigests(): void {
    this.digestsLoading.set(true);
    this.maturityService
      .getDigests(5, 0)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.digests.set(res.data);
          this.digestsLoading.set(false);
        },
        error: () => {
          this.digestsLoading.set(false);
        },
      });
  }

  toggleDigest(id: string): void {
    if (this.expandedDigestId() === id) {
      this.expandedDigestId.set(null);
    } else {
      this.expandedDigestId.set(id);
      if (this.hasNewDigest() && this.digests()[0]?.id === id) {
        this.hasNewDigest.set(false);
      }
    }
  }

  triggerScan(): void {
    this.isScanning.set(true);
    this.maturityService
      .triggerAutonomousRun()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.isScanning.set(false);
          this.loadAutonomousStatus();
          this.loadDashboard();
        },
        error: () => {
          this.isScanning.set(false);
          this.error.set('Error starting scan.');
        },
      });
  }

  formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    const sec = Math.round(ms / 1000);
    if (sec < 60) return `${sec}s`;
    const min = Math.floor(sec / 60);
    const remSec = sec % 60;
    return `${min}m ${remSec}s`;
  }

  formatDate(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleDateString('en-US', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  formatRunType(type: string): string {
    const map: Record<string, string> = {
      staleness_scan: 'Staleness',
      kpi_monitor: 'KPI',
      weekly_digest: 'Report',
    };
    return map[type] || type;
  }

  // Helpers

  getStageMeta(stage: string): { label: string; color: string; description: string } {
    return STAGE_META[stage] ?? STAGE_META['BASIC']!;
  }

  getCurrentStageColor(): string {
    const current = this.dashboard()?.currentStage;
    return current ? STAGE_META[current]?.color || '#58A6FF' : '#58A6FF';
  }

  isStageReached(stage: MaturityStage): boolean {
    const current = this.dashboard()?.currentStage;
    if (!current) return false;
    return STAGE_ORDER.indexOf(stage) <= STAGE_ORDER.indexOf(current);
  }

  isStageCompleted(stage: MaturityStage): boolean {
    const current = this.dashboard()?.currentStage;
    if (!current) return false;
    return STAGE_ORDER.indexOf(stage) < STAGE_ORDER.indexOf(current);
  }

  ringOffset(percent: number): number {
    return this.ringCircumference * (1 - percent / 100);
  }

  getPersonaLabel(key: string): string {
    return PERSONA_LABELS[key]?.label || key;
  }

  getPersonaColor(key: string): string {
    return PERSONA_LABELS[key]?.color || '#888';
  }

  getPersonaPercent(
    progress: StageProgressSummary,
    key: string
  ): number {
    const p = progress.byPersona[key];
    if (!p || p.total === 0) return 0;
    return Math.round((p.completed / p.total) * 100);
  }

  getPersonaCompleted(
    progress: StageProgressSummary,
    key: string
  ): number {
    return progress.byPersona[key]?.completed || 0;
  }

  getPersonaTotal(
    progress: StageProgressSummary,
    key: string
  ): number {
    return progress.byPersona[key]?.total || 0;
  }

  getNextStageLabel(): string {
    const current = this.dashboard()?.currentStage;
    if (!current) return '';
    const idx = STAGE_ORDER.indexOf(current);
    if (idx < 0 || idx >= STAGE_ORDER.length - 1) return '';
    return STAGE_META[STAGE_ORDER[idx + 1]!]?.label || '';
  }
}
