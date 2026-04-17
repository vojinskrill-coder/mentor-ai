import { Component, DestroyRef, inject, signal, computed, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { TaskHubService } from './services/task-hub.service';
import { ProposalService } from './services/proposal.service';
import { ToastService } from '../../core/services/toast.service';
import { ExecutionPanelService } from '../../core/services/execution-panel.service';
import { PageLoadingService } from '../../core/services/page-loading.service';
import { ChatWebsocketService } from '../chat/services/chat-websocket.service';
import type { TaskHubItem, DomainSummary, BrainProposalItem, BridgeAgentStatusPayload } from '@mentor-ai/shared/types';
import { AgentGraphComponent } from './components/agent-graph.component';
import { AgentContributionsComponent } from './components/agent-contributions.component';

@Component({
  selector: 'app-task-hub',
  standalone: true,
  imports: [CommonModule, FormsModule, AgentGraphComponent, AgentContributionsComponent],
  styles: [
    `
      :host {
        display: block;
      }
      .page {
        padding: 24px;
        width: 100%;
      }

      /* Page header */
      .page-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        margin-bottom: 20px;
      }
      .page-title {
        font-size: 26px;
        font-weight: 600;
        margin-bottom: 4px;
      }
      .page-desc {
        font-size: 16px;
        color: #a1a1a1;
      }

      /* Domain summary banner */
      .domain-banner {
        display: flex;
        gap: 8px;
        flex-wrap: wrap;
        margin-bottom: 20px;
      }
      .domain-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 12px;
        border-radius: 999px;
        background: #161B22;
        border: 1px solid #21262D;
        font-size: 14px;
        font-weight: 500;
        color: #a1a1a1;
        cursor: pointer;
        transition: border-color 0.15s, color 0.15s;
      }
      .domain-pill:hover {
        border-color: #30363D;
        color: #E6EDF3;
      }
      .domain-pill.active {
        border-color: #58A6FF;
        color: #58A6FF;
        background: rgba(88, 166, 255, 0.08);
      }
      .domain-count {
        background: #1C2128;
        padding: 1px 6px;
        border-radius: 999px;
        font-size: 13px;
        font-weight: 600;
      }
      .domain-pill.active .domain-count {
        background: rgba(88, 166, 255, 0.2);
        color: #58A6FF;
      }

      /* Filter bar */
      .filter-bar {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-bottom: 16px;
      }
      .search-wrap {
        position: relative;
        flex: 1;
        max-width: 320px;
      }
      .search-icon {
        position: absolute;
        left: 12px;
        top: 50%;
        transform: translateY(-50%);
        width: 16px;
        height: 16px;
        color: #9e9e9e;
        pointer-events: none;
      }
      .search-input {
        width: 100%;
        padding: 8px 12px 8px 36px;
        border-radius: 6px;
        border: 1px solid #21262D;
        background: #161B22;
        color: #E6EDF3;
        font-size: 14px;
        font-family: inherit;
        outline: none;
        transition: border-color 0.15s;
      }
      .search-input::placeholder { color: #9e9e9e; }
      .search-input:focus { border-color: #58A6FF; }
      .filter-select {
        padding: 8px 12px;
        border-radius: 6px;
        border: 1px solid #21262D;
        background: #161B22;
        color: #E6EDF3;
        font-size: 14px;
        font-family: inherit;
        outline: none;
        cursor: pointer;
      }
      .filter-select:focus { border-color: #58A6FF; }
      .filter-loading {
        width: 16px;
        height: 16px;
        border: 2px solid #21262D;
        border-top-color: #58A6FF;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }

      /* Task list */
      .task-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
      }

      /* Task card */
      .task-card {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        background: #161B22;
        border: 1px solid #21262D;
        border-radius: 8px;
        cursor: pointer;
        transition: border-color 0.12s, background 0.12s;
        position: relative;
      }
      .task-card:hover {
        border-color: #30363D;
        background: #21262D;
      }
      .task-card.selected {
        border-color: #58A6FF;
        background: rgba(88, 166, 255, 0.05);
      }
      .status-icon {
        width: 18px;
        height: 18px;
        flex-shrink: 0;
      }
      .status-icon.pending { color: #eab308; }
      .status-icon.review { color: #58A6FF; }
      .status-icon.completed { color: #3FB950; }
      .task-info {
        flex: 1;
        min-width: 0;
      }
      .task-title {
        font-size: 15px;
        font-weight: 500;
        line-height: 1.4;
        margin-bottom: 4px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .task-meta {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .concept-pill {
        display: inline-flex;
        align-items: center;
        padding: 2px 8px;
        border-radius: 999px;
        background: #1C2128;
        font-size: 13px;
        font-weight: 500;
        color: #a1a1a1;
      }
      .agent-pipeline {
        display: inline-flex;
        align-items: center;
        gap: 3px;
      }
      .agent-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        border: 1.5px solid #30363D;
      }
      .agent-dot.planned { background: transparent; }
      .agent-dot.running {
        background: #58A6FF;
        border-color: #58A6FF;
        animation: pulse-dot 1.5s ease-in-out infinite;
      }
      .agent-dot.completed { background: #3FB950; border-color: #3FB950; }
      .agent-dot.failed { background: #F85149; border-color: #F85149; }
      @keyframes pulse-dot {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
      }
      .score-badge {
        flex-shrink: 0;
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 13px;
        font-weight: 600;
      }
      .score-high { background: rgba(63, 185, 80, 0.15); color: #4ade80; }
      .score-medium { background: rgba(234, 179, 8, 0.15); color: #fbbf24; }
      .score-low { background: rgba(248, 81, 73, 0.15); color: #f87171; }
      .task-arrow {
        width: 16px;
        height: 16px;
        color: #707070;
        flex-shrink: 0;
        transition: color 0.15s;
      }
      .task-card:hover .task-arrow { color: #a1a1a1; }
      .task-card.selected .task-arrow { color: #58A6FF; }

      /* Skeleton loading */
      .skeleton-card {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        background: #161B22;
        border: 1px solid #21262D;
        border-radius: 8px;
      }
      .skel {
        border-radius: 6px;
        background: linear-gradient(90deg, #161B22 25%, #1C2128 50%, #161B22 75%);
        background-size: 200% 100%;
        animation: shimmer 1.5s infinite linear;
      }
      @keyframes shimmer {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
      .skel-dot { width: 18px; height: 18px; border-radius: 50%; flex-shrink: 0; }
      .skel-info { flex: 1; }
      .skel-title { height: 14px; width: 70%; margin-bottom: 8px; }
      .skel-meta { height: 10px; width: 40%; }
      .skel-banner { height: 32px; width: 100%; border-radius: 999px; }

      /* Empty state */
      .empty-state {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 80px 0;
        text-align: center;
      }
      .empty-icon {
        width: 48px;
        height: 48px;
        color: #9e9e9e;
        opacity: 0.5;
        margin-bottom: 16px;
      }
      .empty-state h3 {
        font-size: 18px;
        font-weight: 600;
        margin-bottom: 8px;
      }
      .empty-state p {
        font-size: 16px;
        color: #a1a1a1;
        margin-bottom: 24px;
        max-width: 360px;
      }
      .cta-btn {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 10px 20px;
        border-radius: 8px;
        border: none;
        background: #58A6FF;
        color: white;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        text-decoration: none;
        font-family: inherit;
        transition: opacity 0.15s;
      }
      .cta-btn:hover { opacity: 0.9; }
      .cta-btn svg { width: 18px; height: 18px; }

      /* Error */
      .error-banner {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        background: rgba(248, 81, 73, 0.1);
        border: 1px solid rgba(248, 81, 73, 0.2);
        border-radius: 8px;
        margin-bottom: 16px;
        color: #f87171;
        font-size: 14px;
      }
      .error-banner svg { width: 18px; height: 18px; flex-shrink: 0; }
      .retry-btn {
        margin-left: auto;
        padding: 6px 12px;
        border-radius: 6px;
        border: none;
        background: rgba(248, 81, 73, 0.2);
        color: #f87171;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        font-family: inherit;
      }
      .retry-btn:hover { background: rgba(248, 81, 73, 0.3); }

      /* Filter overlay */
      .filter-overlay { position: relative; }
      .filter-overlay.loading::after {
        content: '';
        position: absolute;
        inset: 0;
        background: rgba(13, 13, 13, 0.4);
        border-radius: 8px;
        z-index: 1;
        pointer-events: none;
      }

      .agent-job-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 22px;
        height: 22px;
        border-radius: 4px;
        border: 1px solid transparent;
        font-size: 11px;
        cursor: pointer;
        transition: all 0.15s;
        padding: 0;
        line-height: 1;
      }
      .agent-job-btn.completed {
        background: rgba(63, 185, 80, 0.15);
        color: #3FB950;
        border-color: rgba(63, 185, 80, 0.3);
      }
      .agent-job-btn.failed {
        background: rgba(248, 81, 73, 0.15);
        color: #F85149;
        border-color: rgba(248, 81, 73, 0.3);
      }
      .agent-job-btn.planned, .agent-job-btn.running {
        background: rgba(88, 166, 255, 0.15);
        color: #58A6FF;
        border-color: rgba(88, 166, 255, 0.3);
      }
      .agent-job-btn:hover:not(:disabled) {
        transform: scale(1.2);
        border-color: #f59e0b;
        box-shadow: 0 0 6px rgba(245, 158, 11, 0.3);
      }
      .agent-job-btn:disabled { opacity: 0.5; cursor: not-allowed; }
      .job-spinner {
        width: 10px; height: 10px;
        border: 2px solid rgba(245, 158, 11, 0.3);
        border-top-color: #f59e0b;
        border-radius: 50%;
        animation: spin 0.6s linear infinite;
      }

      .stop-btn {
        padding: 10px 20px;
        border-radius: 8px;
        border: 1px solid #F85149;
        background: rgba(248, 81, 73, 0.1);
        color: #F85149;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s;
        white-space: nowrap;
      }
      .stop-btn:hover:not(:disabled) { background: rgba(248, 81, 73, 0.2); }
      .stop-btn:disabled { opacity: 0.5; cursor: not-allowed; }

      .retry-all-btn {
        padding: 10px 20px;
        border-radius: 8px;
        border: 1px solid #58A6FF;
        background: rgba(88, 166, 255, 0.1);
        color: #58A6FF;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s;
        display: flex;
        align-items: center;
        gap: 8px;
        white-space: nowrap;
      }
      .retry-all-btn:hover:not(:disabled) {
        background: rgba(88, 166, 255, 0.2);
        border-color: #60a5fa;
      }
      .retry-all-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .spinner {
        width: 14px;
        height: 14px;
        border: 2px solid rgba(88, 166, 255, 0.3);
        border-top-color: #58A6FF;
        border-radius: 50%;
        animation: spin 0.6s linear infinite;
        display: inline-block;
      }
      @keyframes spin { to { transform: rotate(360deg); } }

      /* Proposal section inside task card */
      .proposal-section {
        margin-top: 8px;
        padding: 10px 12px;
        background: rgba(88, 166, 255, 0.06);
        border: 1px solid rgba(88, 166, 255, 0.15);
        border-radius: 8px;
        font-size: 13px;
        line-height: 1.5;
      }
      .proposal-label {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 12px;
        font-weight: 600;
        color: #58A6FF;
        margin-bottom: 4px;
      }
      .proposal-text {
        color: #a1a1a1;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      .proposal-meta {
        display: flex;
        align-items: center;
        gap: 12px;
        margin-top: 8px;
        font-size: 12px;
        color: #6E7681;
      }
      .proposal-cost {
        color: #4ade80;
        font-weight: 500;
      }
      .canvas-pill {
        display: inline-flex;
        padding: 2px 8px;
        border-radius: 999px;
        background: rgba(88, 166, 255, 0.1);
        color: #60a5fa;
        font-size: 11px;
        font-weight: 500;
      }
      .deliverable-icons {
        display: inline-flex;
        gap: 4px;
        align-items: center;
      }
      .deliverable-pill {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        padding: 2px 7px;
        border-radius: 999px;
        background: rgba(74, 222, 128, 0.1);
        border: 1px solid rgba(74, 222, 128, 0.25);
        color: #4ade80;
        font-size: 10px;
        font-weight: 600;
      }
      .deliverable-list {
        display: flex;
        flex-direction: column;
        gap: 6px;
        margin-top: 4px;
      }
      .deliverable-row {
        display: flex;
        gap: 8px;
        padding: 6px 8px;
        background: rgba(74, 222, 128, 0.05);
        border: 1px solid rgba(74, 222, 128, 0.18);
        border-radius: 6px;
      }
      .deliverable-icon {
        font-size: 16px;
        line-height: 1.2;
        flex-shrink: 0;
      }
      .deliverable-meta {
        display: flex;
        flex-direction: column;
        gap: 2px;
        min-width: 0;
      }
      .deliverable-name {
        font-size: 12px;
        font-weight: 600;
        color: #4ade80;
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        word-break: break-all;
      }
      .deliverable-desc {
        font-size: 11px;
        color: #9ca3af;
        line-height: 1.4;
      }
      .status-icon.incomplete {
        color: #f59e0b;
      }
      .incomplete-banner {
        margin-top: 6px;
        padding: 6px 10px;
        background: rgba(245, 158, 11, 0.08);
        border: 1px solid rgba(245, 158, 11, 0.25);
        border-radius: 6px;
        font-size: 11px;
        color: #fbbf24;
      }

      /* Running state for PENDING tasks that the backend told us are active */
      .task-card.is-running {
        background: linear-gradient(90deg, rgba(88, 166, 255, 0.04), rgba(88, 166, 255, 0.1), rgba(88, 166, 255, 0.04));
        background-size: 200% 100%;
        border-left: 2px solid #58A6FF;
        animation: running-bg-sweep 2.4s ease-in-out infinite;
      }
      @keyframes running-bg-sweep {
        0%   { background-position: 200% 0; }
        100% { background-position: -200% 0; }
      }
      .status-icon.running-spinner {
        display: inline-block;
        width: 18px;
        height: 18px;
        border: 2px solid rgba(88, 166, 255, 0.25);
        border-top-color: #58A6FF;
        border-radius: 50%;
        animation: running-spin 0.9s linear infinite;
        flex-shrink: 0;
      }
      @keyframes running-spin {
        to { transform: rotate(360deg); }
      }
      .running-badge {
        display: inline-flex;
        align-items: center;
        margin-left: 8px;
        padding: 1px 8px;
        border-radius: 999px;
        background: rgba(88, 166, 255, 0.14);
        color: #58A6FF;
        font-size: 10px;
        font-weight: 700;
        letter-spacing: 0.5px;
        animation: running-badge-pulse 1.5s ease-in-out infinite;
      }
      @keyframes running-badge-pulse {
        0%, 100% { opacity: 1; }
        50%      { opacity: 0.55; }
      }
      .live-agents {
        display: flex;
        flex-wrap: wrap;
        gap: 4px;
        margin-top: 6px;
      }
      .live-agent-pill {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 2px 8px;
        border-radius: 999px;
        background: rgba(156, 163, 175, 0.08);
        border: 1px solid rgba(156, 163, 175, 0.2);
        color: #9ca3af;
        font-size: 10px;
        font-weight: 500;
      }
      .live-agent-pill.running {
        background: rgba(88, 166, 255, 0.12);
        border-color: rgba(88, 166, 255, 0.35);
        color: #58A6FF;
      }
      .live-agent-pill.completed {
        background: rgba(74, 222, 128, 0.1);
        border-color: rgba(74, 222, 128, 0.3);
        color: #4ade80;
      }
      .live-agent-pill .live-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        background: currentColor;
      }
      .live-agent-pill.running .live-dot {
        animation: live-dot-pulse 1.2s ease-in-out infinite;
      }
      @keyframes live-dot-pulse {
        0%, 100% { opacity: 1; transform: scale(1); }
        50%      { opacity: 0.4; transform: scale(1.4); }
      }
      .task-progress {
        margin-top: 6px;
      }
      .task-progress-bar {
        height: 4px;
        background: rgba(156, 163, 175, 0.15);
        border-radius: 999px;
        overflow: hidden;
      }
      .task-progress-fill {
        height: 100%;
        background: linear-gradient(90deg, #58A6FF, #4ade80);
        border-radius: 999px;
        transition: width 0.4s ease;
      }
      .task-progress-label {
        display: flex;
        justify-content: space-between;
        margin-top: 3px;
        font-size: 10px;
        color: #9ca3af;
      }
      .progress-percent {
        font-weight: 600;
        color: #58A6FF;
      }
      .progress-message {
        margin-top: 2px;
        font-size: 10px;
        color: #6b7280;
        font-style: italic;
      }
      .proposal-actions {
        display: flex;
        gap: 6px;
        margin-top: 10px;
      }
      .btn-pokreni {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 6px 14px;
        border-radius: 6px;
        border: none;
        background: #58A6FF;
        color: #fff;
        font-size: 13px;
        font-weight: 500;
        cursor: pointer;
        transition: background 0.15s;
      }
      .btn-pokreni:hover { background: #2563eb; }
      .btn-pokreni:disabled { opacity: 0.5; cursor: not-allowed; }
      .btn-discuss {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 6px 14px;
        border-radius: 6px;
        border: 1px solid #21262D;
        background: transparent;
        color: #a1a1a1;
        font-size: 13px;
        cursor: pointer;
        transition: border-color 0.15s, color 0.15s;
      }
      .btn-discuss:hover { border-color: #30363D; color: #E6EDF3; }
      .btn-reject {
        display: inline-flex;
        align-items: center;
        padding: 6px 10px;
        border-radius: 6px;
        border: 1px solid #21262D;
        background: transparent;
        color: #6E7681;
        font-size: 13px;
        cursor: pointer;
        transition: color 0.15s;
      }
      .btn-reject:hover { color: #f87171; border-color: rgba(248, 113, 113, 0.3); }

      /* ── Dual panel layout ── */
      .dual-panels {
        display: flex;
        gap: 16px;
        height: calc(100vh - 220px);
        min-height: 400px;
      }
      .panel {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-width: 0;
      }
      .panel-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding-bottom: 12px;
        border-bottom: 1px solid #21262D;
        margin-bottom: 12px;
        flex-shrink: 0;
      }
      .panel-title {
        font-size: 16px;
        font-weight: 600;
        color: #E6EDF3;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .panel-count {
        padding: 2px 8px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 600;
      }
      .panel-count.proposals { background: rgba(88,166,255,0.15); color: #58A6FF; }
      .panel-count.tasks { background: rgba(63,185,80,0.15); color: #4ade80; }
      .panel-scroll {
        flex: 1;
        overflow-y: auto;
        padding-right: 4px;
      }
      .panel-scroll::-webkit-scrollbar { width: 4px; }
      .panel-scroll::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
      .ai-badge {
        display: inline-flex;
        align-items: center;
        gap: 3px;
        padding: 1px 6px;
        border-radius: 4px;
        background: rgba(88,166,255,0.1);
        color: #60a5fa;
        font-size: 10px;
        font-weight: 600;
      }

      /* ── Global Activity Bar ── */
      .activity-bar {
        background: #161B22;
        border: 1px solid #21262D;
        border-radius: 8px;
        padding: 10px 14px;
        margin-bottom: 12px;
        max-height: 120px;
        overflow-y: auto;
      }
      .activity-bar-header {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 6px;
        font-size: 13px;
        font-weight: 600;
        color: #E6EDF3;
      }
      .activity-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #3FB950;
        animation: pulse-dot 1.5s infinite;
      }
      @keyframes pulse-dot {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
      }
      .activity-dot.idle { background: #6E7681; animation: none; }
      .activity-entry {
        font-size: 12px;
        color: #a1a1a1;
        padding: 2px 0;
        border-bottom: 1px solid #161B22;
      }
      .activity-entry:last-child { border-bottom: none; }
      .activity-agent {
        color: #60a5fa;
        font-weight: 500;
      }
      .activity-time {
        color: #444;
        font-size: 11px;
        margin-left: 6px;
      }

      /* ── Expanded task detail ── */
      .task-expanded {
        margin-top: 8px;
        padding: 12px;
        background: #161B22;
        border: 1px solid #21262D;
        border-radius: 8px;
      }
      .task-content-preview {
        font-size: 13px;
        color: #a1a1a1;
        line-height: 1.5;
        max-height: 100px;
        overflow: hidden;
        margin-bottom: 8px;
      }
    `,
  ],
  template: `
    <div class="page">
      <div class="page-header">
        <div>
          <h1 class="page-title">Tasks</h1>
          <p class="page-desc">Review and track tasks with AI agents.</p>
        </div>
        <!-- Agent control buttons removed — execution managed by maturity engine -->
      </div>

      @if (error()) {
        <div class="error-banner">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span>{{ error() }}</span>
          <button class="retry-btn" (click)="loadTasks()">Retry</button>
        </div>
      }

      <div class="filter-bar">
        <div class="search-wrap">
          <svg class="search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input class="search-input" placeholder="Search tasks..." [ngModel]="searchTerm()" (ngModelChange)="onSearchChange($event)" />
        </div>
        <select class="filter-select" [ngModel]="statusFilter()" (ngModelChange)="onStatusChange($event)">
          <option value="">All statuses</option>
          <option value="PENDING">Pending</option>
          <option value="READY_FOR_REVIEW">For review</option>
          <option value="COMPLETED">Completed</option>
        </select>
        <select class="filter-select" [ngModel]="activeCategory() ?? ''" (ngModelChange)="filterByCategory($event || null)">
          <option value="">All categories ({{ totalCount() }})</option>
          @for (domain of domainSummary(); track domain.category) {
            <option [value]="domain.category">{{ stripCategoryNumber(domain.category) }} ({{ domain.total }})</option>
          }
        </select>
        @if (isFiltering()) { <div class="filter-loading"></div> }
      </div>

      <!-- ═══ DUAL PANEL LAYOUT ═══ -->
      <div class="dual-panels">

        <!-- LEFT: AI Recommended tasks -->
        <div class="panel">
          <div class="panel-header">
            <span class="panel-title">
              <span class="ai-badge">AI</span> Recommended
            </span>
            <span class="panel-count proposals">{{ proposals().length }}</span>
          </div>
          <div class="panel-scroll">
            @if (proposals().length === 0 && !isLoading()) {
              <div class="empty-state" style="padding:24px 0;">
                <p style="color:#6E7681;font-size:13px;text-align:center;">Brain is still thinking... Suggestions will appear here.</p>
              </div>
            }
            @for (proposal of proposals(); track proposal.id) {
              <div class="task-card" [class.selected]="expandedProposalId() === proposal.id">
                <svg class="status-icon pending" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                <div class="task-info" (click)="toggleProposalExpand(proposal.id)">
                  <div class="task-title"><span class="ai-badge">AI</span> {{ proposal.title }}</div>
                  <div class="proposal-meta" style="margin-top:4px;">
                    <span class="canvas-pill">{{ formatCanvasBlock(proposal.canvasBlock) }}</span>
                    @if (proposal.estimatedCost) {
                      <span class="proposal-cost">~{{ proposal.estimatedCost | number:'1.2-2' }}</span>
                    }
                    <span>{{ proposal.priority }}</span>
                    @if (proposal.expectedDeliverables.length) {
                      <span class="deliverable-icons" title="Will produce: {{ proposal.expectedDeliverables.length }} file(s)">
                        @for (d of proposal.expectedDeliverables; track d.filename) {
                          <span class="deliverable-pill">{{ deliverableIcon(d.type) }} .{{ d.type }}</span>
                        }
                      </span>
                    }
                    <span style="margin-left:auto;font-size:11px;color:#444;">
                      {{ expandedProposalId() === proposal.id ? '▲' : '▼' }}
                    </span>
                  </div>

                  <!-- Expanded content -->
                  @if (expandedProposalId() === proposal.id) {
                    <div class="proposal-section" style="margin-top:8px;">
                      <div class="proposal-label"><span>Why this is important</span></div>
                      <div style="font-size:13px;color:#ccc;line-height:1.6;white-space:pre-wrap;">{{ proposal.reasoning }}</div>

                      @if (proposal.proposedAction && proposal.proposedAction !== proposal.reasoning) {
                        <div class="proposal-label" style="margin-top:10px;"><span>What needs to be done</span></div>
                        <div style="font-size:13px;color:#ccc;line-height:1.6;white-space:pre-wrap;">{{ proposal.proposedAction }}</div>
                      }

                      @if (proposal.expectedDeliverables.length) {
                        <div class="proposal-label" style="margin-top:10px;"><span>You will get</span></div>
                        <div class="deliverable-list">
                          @for (d of proposal.expectedDeliverables; track d.filename) {
                            <div class="deliverable-row">
                              <span class="deliverable-icon">{{ deliverableIcon(d.type) }}</span>
                              <div class="deliverable-meta">
                                <div class="deliverable-name">{{ d.filename }}</div>
                                <div class="deliverable-desc">{{ d.description }}</div>
                              </div>
                            </div>
                          }
                        </div>
                      }

                      <div class="proposal-actions" style="margin-top:12px;">
                        @if (proposal.expectedDeliverables && proposal.expectedDeliverables.length > 0) {
                          <button class="btn-pokreni" [disabled]="approvingProposalId() === proposal.id" (click)="approveProposal(proposal, $event)">
                            @if (approvingProposalId() === proposal.id) {
                              <span class="spinner" style="width:12px;height:12px;"></span> Starting...
                            } @else {
                              Run
                            }
                          </button>
                        } @else {
                          <button class="btn-pokreni" disabled title="Discuss this proposal first to lock in concrete deliverables before running">
                            Discuss to lock plan
                          </button>
                        }
                        <button class="btn-discuss" (click)="discussProposal(proposal, $event)">Discuss</button>
                        <button class="btn-reject" (click)="rejectProposal(proposal, $event)">Reject</button>
                      </div>
                    </div>
                  }
                </div>
              </div>
            }
          </div>
        </div>

        <!-- RIGHT: Tasks -->
        <div class="panel">
          <div class="panel-header">
            <span class="panel-title">Tasks</span>
            <span class="panel-count tasks">{{ tasks().length }}</span>
          </div>
          <div class="panel-scroll">
            @if (isLoading() && !tasks().length) {
              @for (i of skeletonCards; track i) {
                <div class="skeleton-card">
                  <div class="skel skel-dot"></div>
                  <div class="skel-info"><div class="skel skel-title"></div><div class="skel skel-meta"></div></div>
                </div>
              }
            } @else if (tasks().length > 0) {
              @for (task of tasks(); track task.id) {
                <div class="task-card"
                     [class.selected]="selectedId() === task.id"
                     [class.is-running]="isTaskRunning(task.id) && task.status === 'PENDING'"
                     (click)="selectTask(task)">
                  @if (task.status === 'COMPLETED') {
                    <svg class="status-icon completed" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  } @else if (task.status === 'INCOMPLETE') {
                    <svg class="status-icon incomplete" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                  } @else if (task.status === 'READY_FOR_REVIEW') {
                    <svg class="status-icon review" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  } @else if (isTaskRunning(task.id)) {
                    <!-- Animated spinner for tasks backend told us are actively running -->
                    <span class="status-icon running-spinner" title="Task is running"></span>
                  } @else {
                    <svg class="status-icon pending" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  }
                  <div class="task-info">
                    <div class="task-title">
                      {{ task.title }}
                      @if (isTaskRunning(task.id) && task.status === 'PENDING') {
                        <span class="running-badge">RUNNING</span>
                      }
                    </div>
                    <div class="task-meta">
                      @if (task.conceptName) {
                        <span class="concept-pill">{{ task.conceptName }}</span>
                      }
                      @if (task.agentJobs.length > 0) {
                        <div class="agent-pipeline">
                          @for (job of task.agentJobs; track job.id) {
                            <span class="agent-dot" [class]="job.status.toLowerCase()" [title]="job.agentType + ' - ' + job.status"></span>
                          }
                        </div>
                      }
                    </div>
                    <!-- Live agent activity pills — populated from AGENT_STATUS events in real time -->
                    @if (liveAgentsForTask(task.id).length > 0) {
                      <div class="live-agents">
                        @for (a of liveAgentsForTask(task.id); track a.agent) {
                          <span class="live-agent-pill" [class.running]="a.status === 'running'" [class.completed]="a.status === 'completed'" [title]="a.message">
                            <span class="live-dot"></span>{{ agentLabel(a.agent) }}
                          </span>
                        }
                      </div>
                    }
                    <!-- Progress bar driven by task:progress events -->
                    @if (progressForTask(task.id); as prog) {
                      <div class="task-progress">
                        <div class="task-progress-bar">
                          <div class="task-progress-fill" [style.width.%]="prog.percent"></div>
                        </div>
                        <div class="task-progress-label">
                          <span class="progress-phase">{{ prog.phase }}</span>
                          <span class="progress-percent">{{ prog.percent }}%</span>
                        </div>
                        @if (prog.message) {
                          <div class="progress-message">{{ prog.message }}</div>
                        }
                      </div>
                    }
                    @if (task.status === 'INCOMPLETE') {
                      <div class="incomplete-banner">⚠️ Task ran but expected deliverables are missing — see details</div>
                    }
                  </div>
                  @if (task.aiScore != null) {
                    <span class="score-badge" [class]="getScoreClass(task.aiScore)">{{ task.aiScore }}</span>
                  }
                  <svg class="task-arrow" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" /></svg>
                </div>
                <!-- Expanded detail when selected -->
                @if (selectedId() === task.id) {
                  <div class="task-expanded">
                    @if (task.content) {
                      <div class="task-content-preview">{{ task.content }}</div>
                    }
                    <app-agent-graph
                      [statusEvents]="agentStatusEvents()"
                      [taskId]="task.id"
                    ></app-agent-graph>
                    <app-agent-contributions
                      [enrichments]="task.agentEnrichments"
                      [noteId]="task.id"
                      (downloadFile)="onDownloadFile($event)"
                      (executeAction)="onExecuteAction($event)">
                    </app-agent-contributions>
                  </div>
                }
              }
            } @else if (!isLoading() && !error()) {
              <div class="empty-state">
                <svg class="empty-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                </svg>
                <h3>No tasks yet</h3>
                <p>Approve a brain suggestion or start a conversation.</p>
              </div>
            }
          </div>
        </div>

      </div>
    </div>
  `,
})
export class TaskHubComponent implements OnInit, OnDestroy {
  private readonly taskHubService = inject(TaskHubService);
  private readonly proposalService = inject(ProposalService);
  private readonly toastService = inject(ToastService);
  private readonly execPanel = inject(ExecutionPanelService);
  private readonly chatWs = inject(ChatWebsocketService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  private readonly pageLoading = inject(PageLoadingService);

  readonly proposals = signal<BrainProposalItem[]>([]);
  readonly agentStatusEvents = signal<BridgeAgentStatusPayload[]>([]);
  readonly recentStatusEvents = computed(() => this.agentStatusEvents().slice(-10).reverse());
  readonly hasActiveAgents = computed(() =>
    this.agentStatusEvents().some(e =>
      e.status !== 'completed' && e.status !== 'failed'
    )
  );

  /**
   * Set of task IDs that the backend has told us are actively running right
   * now. Populated from:
   *   - onBridgeTaskCreated  → add to running set (fresh approval)
   *   - onBridgeTaskProgress → add to running set (explicit progress event)
   *   - onBridgeAgentStatus  → add to running set (agent working on this task)
   *   - onBridgeTaskComplete → remove from running set
   *
   * Used by the task card template to render a spinner + running badge on
   * PENDING tasks, giving the user immediate feedback when they click
   * "Confirm plan and run" — previously the task just showed a static
   * yellow clock icon forever.
   */
  readonly runningTaskIds = signal<Set<string>>(new Set());

  /**
   * Per-task live agent activity — map of taskId → most recent agent status
   * messages. Used to show "Research agent running..." directly on the task
   * card in real time, even before agentJobs are persisted to the DB.
   */
  readonly liveAgentActivityByTask = signal<Map<string, { agent: string; status: string; message: string; timestamp: string }[]>>(
    new Map(),
  );

  /** Per-task progress percentage from task:progress events. */
  readonly taskProgressByTask = signal<Map<string, { percent: number; phase: string; message: string }>>(
    new Map(),
  );
  readonly expandedProposalId = signal<string | null>(null);
  readonly approvingProposalId = signal<string | null>(null);
  readonly tasks = signal<TaskHubItem[]>([]);
  readonly domainSummary = signal<DomainSummary[]>([]);
  readonly isLoading = signal(true);
  readonly isFiltering = signal(false);
  readonly error = signal<string | null>(null);
  readonly selectedId = signal<string | null>(null);

  readonly searchTerm = signal('');
  readonly statusFilter = signal('');
  readonly activeCategory = signal<string | null>(null);

  readonly totalCount = computed(() =>
    this.domainSummary().reduce((sum, d) => sum + d.total, 0)
  );

  readonly isRetryingAll = signal(false);
  readonly isStopping = signal(false);
  readonly rerunningJobs = signal(new Set<string>());
  readonly skeletonCards = [1, 2, 3, 4, 5, 6];

  private readonly searchSubject = new Subject<string>();

  private autoRefreshInterval: ReturnType<typeof setInterval> | null = null;

  private unsubBridgeEvents: Array<() => void> = [];

  private isInitialLoad = true;

  ngOnInit(): void {
    this.pageLoading.start();
    this.loadTasks();
    this.loadProposals();

    // Auto-refresh every 15s — include proposals
    this.autoRefreshInterval = setInterval(() => {
      if (!this.isFiltering()) {
        this.loadTasks(false, true);  // silent — no loading flash
        this.loadProposals();
      }
    }, 15_000);

    this.searchSubject
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed(this.destroyRef))
      .subscribe((term) => {
        this.searchTerm.set(term);
        this.loadTasks(true);
      });

    // Debounce bridge events to coalesce rapid-fire events into single refresh
    const bridgeRefresh$ = new Subject<void>();
    bridgeRefresh$
      .pipe(debounceTime(500), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.loadTasks(false, true);  // silent — no loading flash
        this.loadProposals();
      });

    // Listen for real-time bridge events — all trigger debounced refresh
    this.unsubBridgeEvents.push(
      this.chatWs.onProposalNew(() => bridgeRefresh$.next()),
      this.chatWs.onProposalApproved(() => bridgeRefresh$.next()),
      this.chatWs.onBridgeTaskCreated((data) => {
        // Mark the task as actively running THE MOMENT it's created so the
        // user sees a spinner immediately on approval — without waiting for
        // the first agent_status or the next refresh.
        if (data?.noteId) {
          this.runningTaskIds.update((set) => new Set(set).add(data.noteId));
        }
        bridgeRefresh$.next();
      }),
      this.chatWs.onBridgeTaskComplete((data) => {
        // Clear running + live activity + progress for completed tasks.
        if (data?.noteId) {
          this.runningTaskIds.update((set) => {
            const next = new Set(set);
            next.delete(data.noteId);
            return next;
          });
          this.liveAgentActivityByTask.update((map) => {
            const next = new Map(map);
            next.delete(data.noteId);
            return next;
          });
          this.taskProgressByTask.update((map) => {
            const next = new Map(map);
            next.delete(data.noteId);
            return next;
          });
          // Defensive: mark any lingering agent timeline events for THIS
          // task as completed. The backend now also fires a final
          // AGENT_STATUS=completed event in completeTask, so this is
          // redundant for fresh runs — but keeps the agent graph clean
          // even if a task completes via auto-fallback or some path that
          // skips the AGENT_STATUS emit. Without this, the agent-graph
          // .running CSS would stick on the last reported sub-agent
          // forever even though the task itself shows COMPLETED.
          this.agentStatusEvents.update((events) =>
            events.map((e) =>
              e.taskId === data.noteId && e.status !== 'completed' && e.status !== 'failed'
                ? { ...e, status: 'completed' as const }
                : e,
            ),
          );
        }
        bridgeRefresh$.next();
      }),
      this.chatWs.onBridgeTaskContribution(() => bridgeRefresh$.next()),
      this.chatWs.onBridgeTaskProgress((data) => {
        // Live progress bar on task card.
        if (data?.noteId) {
          this.taskProgressByTask.update((map) => {
            const next = new Map(map);
            next.set(data.noteId, {
              percent: data.percent ?? 0,
              phase: data.phase ?? '',
              message: data.message ?? '',
            });
            return next;
          });
          // Progress also implies running
          this.runningTaskIds.update((set) => new Set(set).add(data.noteId));
        }
      }),
      this.chatWs.onBridgeAgentStatus((data) => {
        // Keep the global timeline (used by agent-graph)
        this.agentStatusEvents.update((events) => {
          const updated = [...events, data];
          return updated.length > 100 ? updated.slice(-100) : updated;
        });
        // If the event is scoped to a task, update the task's live activity
        // and mark it as running. The backend emits with taskId = noteId.
        const taskId = (data as any)?.taskId || (data as any)?.noteId;
        if (taskId) {
          this.runningTaskIds.update((set) => new Set(set).add(taskId));
          this.liveAgentActivityByTask.update((map) => {
            const next = new Map(map);
            const existing = next.get(taskId) ?? [];
            // Upsert by agent — keep only most recent status per agent
            const filtered = existing.filter((e) => e.agent !== data.agent);
            filtered.push({
              agent: data.agent,
              status: data.status,
              message: data.message,
              timestamp: data.timestamp,
            });
            // Cap per-task history at 8 most recent agents
            next.set(taskId, filtered.slice(-8));
            return next;
          });
        }
      }),
    );
  }

  ngOnDestroy(): void {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
    }
    this.unsubBridgeEvents.forEach((unsub) => unsub());
  }

  loadTasks(isFilter = false, silent = false): void {
    if (isFilter) {
      this.isFiltering.set(true);
    } else if (!silent) {
      this.isLoading.set(true);
    }
    this.error.set(null);

    this.taskHubService
      .getTasks({
        status: this.statusFilter() || undefined,
        category: this.activeCategory() || undefined,
        search: this.searchTerm() || undefined,
        hasJobs: false,
        limit: 50,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          // Smart merge: only update if data actually changed (prevents flicker)
          const newTasks = res.data.tasks;
          const oldTasks = this.tasks();
          const changed = newTasks.length !== oldTasks.length ||
            newTasks.some((t: any, i: number) => t.id !== oldTasks[i]?.id || t.status !== oldTasks[i]?.status);
          if (changed) this.tasks.set(newTasks);

          this.domainSummary.set(res.data.domainSummary);

          // Hydrate runningTaskIds from the server-side in-memory tracker so
          // the running spinner survives page reloads / navigation. Merge
          // with whatever is already in the local set (live WS events take
          // precedence and may include very recent additions not yet
          // visible to the auto-refresh).
          const serverRunning = res.runningTaskIds ?? [];
          if (serverRunning.length > 0) {
            this.runningTaskIds.update((set) => {
              const next = new Set(set);
              for (const id of serverRunning) next.add(id);
              return next;
            });
          }

          this.isLoading.set(false);
          this.isFiltering.set(false);
          if (this.isInitialLoad) { this.pageLoading.stop(); this.isInitialLoad = false; }
          const first = newTasks[0];
          if (!this.selectedId() && first) {
            this.selectTask(first);
          }
        },
        error: () => {
          this.error.set('Error loading tasks.');
          this.isLoading.set(false);
          this.isFiltering.set(false);
          if (this.isInitialLoad) { this.pageLoading.stop(); this.isInitialLoad = false; }
        },
      });
  }

  selectTask(task: TaskHubItem): void {
    this.selectedId.set(task.id);
    this.execPanel.showTask({
      note: task,
      conceptName: task.conceptName,
      conceptCategory: task.conceptCategory,
      conversationId: task.conversationId,
      agentJobs: task.agentJobs,
    });
  }

  onSearchChange(term: string): void {
    this.searchSubject.next(term);
  }

  onStatusChange(status: string): void {
    this.statusFilter.set(status);
    this.loadTasks(true);
  }

  filterByCategory(category: string | null): void {
    this.activeCategory.set(category);
    this.loadTasks(true);
  }

  getScoreClass(score: number): string {
    if (score >= 80) return 'score-badge score-high';
    if (score >= 50) return 'score-badge score-medium';
    return 'score-badge score-low';
  }

  stripCategoryNumber(category: string): string {
    return category.replace(/^\d+\.\s*/, '');
  }

  getAgentIcon(agentType: string): string {
    const icons: Record<string, string> = {
      web_search: '🔍', content: '✏️', marketing: '📈',
      sales: '💼', financial: '💰',
    };
    return icons[agentType] || '⚙️';
  }

  rerunJob(job: { id: string; agentType: string }, event: Event): void {
    event.stopPropagation();
    const current = new Set(this.rerunningJobs());
    current.add(job.id);
    this.rerunningJobs.set(current);

    this.taskHubService.retryJob(job.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toastService.success(`${job.agentType} restarted`);
          // Poll for completion
          const poll = setInterval(() => this.loadTasks(), 5_000);
          setTimeout(() => {
            clearInterval(poll);
            const updated = new Set(this.rerunningJobs());
            updated.delete(job.id);
            this.rerunningJobs.set(updated);
            this.loadTasks();
          }, 5 * 60_000);
        },
        error: (err) => {
          const updated = new Set(this.rerunningJobs());
          updated.delete(job.id);
          this.rerunningJobs.set(updated);
          this.toastService.error('Error: ' + (err.error?.detail || err.message || 'Unknown'));
        },
      });
  }

  stopAllAgents(): void {
    this.isStopping.set(true);
    this.taskHubService.stopAllAgents()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.isStopping.set(false);
          this.isRetryingAll.set(false);
          this.toastService.success(`Stopped: ${result.stoppedExecutions} executions, ${result.stoppedJobs} jobs`);
          this.loadTasks();
        },
        error: () => {
          this.isStopping.set(false);
          this.toastService.error('Error stopping agents');
        },
      });
  }

  retryAllPending(): void {
    this.isRetryingAll.set(true);
    this.taskHubService.retryAllPending()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          if (result.totalJobs === 0) {
            this.toastService.info('No pending tasks.');
            this.isRetryingAll.set(false);
          } else {
            this.toastService.success(`Started ${result.totalJobs} tasks in waves of 5.`);
            const poll = setInterval(() => {
              this.loadTasks();
            }, 10_000);
            setTimeout(() => {
              clearInterval(poll);
              this.isRetryingAll.set(false);
            }, 30 * 60_000);
          }
        },
        error: (err) => {
          this.isRetryingAll.set(false);
          this.toastService.error('Error starting: ' + (err.message || 'Unknown error'));
        },
      });
  }

  // ── Brain Proposals ──

  loadProposals(): void {
    this.proposalService.getProposals('pending')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (proposals) => this.proposals.set(proposals),
        error: () => { /* Silent — proposals are supplementary */ },
      });
  }

  toggleProposalExpand(proposalId: string): void {
    this.expandedProposalId.set(
      this.expandedProposalId() === proposalId ? null : proposalId
    );
  }

  approveProposal(proposal: BrainProposalItem, event: Event): void {
    event.stopPropagation();
    this.approvingProposalId.set(proposal.id);
    this.proposalService.approveProposal(proposal.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.approvingProposalId.set(null);
          this.toastService.success(`Started: ${proposal.title}`);
          this.loadProposals();
          this.loadTasks();
        },
        error: () => {
          this.approvingProposalId.set(null);
          this.toastService.error('Error approving proposal.');
        },
      });
  }

  discussProposal(proposal: BrainProposalItem, event: Event): void {
    event.stopPropagation();
    const conceptId = proposal.relatedConcepts?.[0];
    this.router.navigate(['/chat'], {
      queryParams: {
        ...(conceptId ? { conceptId } : {}),
        proposalId: proposal.id,
        proposalTitle: proposal.title,
        proposalReasoning: proposal.reasoning?.slice(0, 500),
        proposalAction: proposal.proposedAction?.slice(0, 500),
      },
    });
  }

  rejectProposal(proposal: BrainProposalItem, event: Event): void {
    event.stopPropagation();
    const reason = prompt('Reason for rejection (optional):');
    if (reason === null) return; // User clicked Cancel — abort
    this.proposalService.rejectProposal(proposal.id, reason || undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toastService.info(`Rejected: ${proposal.title}`);
          this.loadProposals();
        },
        error: () => this.toastService.error('Error rejecting proposal.'),
      });
  }

  onDownloadFile(file: { name: string; path: string; mimeType: string }): void {
    window.open(`/api/v1/notes/files/download?path=${encodeURIComponent(file.path)}`, '_blank');
  }

  onExecuteAction(event: { noteId: string; agentType: string; actionId: string }): void {
    this.taskHubService.executeAction(event.noteId, event.agentType, event.actionId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.toastService.success('Action started'),
        error: () => this.toastService.error('Error starting action'),
      });
  }

  formatCanvasBlock(block: string): string {
    const labels: Record<string, string> = {
      KEY_PARTNERS: 'Partners',
      KEY_ACTIVITIES: 'Activities',
      KEY_RESOURCES: 'Resources',
      VALUE_PROPOSITION: 'Value',
      CUSTOMER_RELATIONSHIPS: 'Relationships',
      CHANNELS: 'Channels',
      CUSTOMER_SEGMENTS: 'Segments',
      REVENUE_STREAMS: 'Revenue',
      COST_STRUCTURE: 'Costs',
    };
    return labels[block] ?? block;
  }

  /** True when the given task is actively running (backend has told us so via WS events). */
  isTaskRunning(taskId: string): boolean {
    return this.runningTaskIds().has(taskId);
  }

  /** Live agent activity for a task (up to 8 most recent agents). */
  liveAgentsForTask(taskId: string): Array<{ agent: string; status: string; message: string; timestamp: string }> {
    return this.liveAgentActivityByTask().get(taskId) ?? [];
  }

  /** Latest progress for a task (percent + phase + message). */
  progressForTask(taskId: string): { percent: number; phase: string; message: string } | null {
    return this.taskProgressByTask().get(taskId) ?? null;
  }

  /** Human-friendly label for an agent role. */
  agentLabel(agent: string): string {
    const labels: Record<string, string> = {
      main: 'Direktor',
      direktor: 'Direktor',
      research: 'Istraživanje',
      financial: 'Finansije',
      content: 'Sadržaj',
      marketing: 'Marketing',
      sales: 'Prodaja',
      designer: 'Dizajn',
      dev: 'Razvoj',
    };
    return labels[agent.toLowerCase()] ?? agent;
  }

  /** Pure-CSS-friendly emoji icon for each deliverable type — used in proposal cards. */
  deliverableIcon(type: string): string {
    const icons: Record<string, string> = {
      xlsx: '📊',
      csv: '📊',
      pdf: '📄',
      docx: '📝',
      pptx: '🎯',
      png: '🖼️',
      jpg: '🖼️',
      jpeg: '🖼️',
      svg: '🖼️',
    };
    return icons[type] ?? '📎';
  }

  formatEventTime(ts: string): string {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
}
