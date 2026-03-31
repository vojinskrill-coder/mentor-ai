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
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        font-size: 14px;
        font-weight: 500;
        color: #a1a1a1;
        cursor: pointer;
        transition: border-color 0.15s, color 0.15s;
      }
      .domain-pill:hover {
        border-color: #3a3a3a;
        color: #fafafa;
      }
      .domain-pill.active {
        border-color: #3b82f6;
        color: #3b82f6;
        background: rgba(59, 130, 246, 0.08);
      }
      .domain-count {
        background: #242424;
        padding: 1px 6px;
        border-radius: 999px;
        font-size: 13px;
        font-weight: 600;
      }
      .domain-pill.active .domain-count {
        background: rgba(59, 130, 246, 0.2);
        color: #3b82f6;
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
        border: 1px solid #2a2a2a;
        background: #1a1a1a;
        color: #fafafa;
        font-size: 14px;
        font-family: inherit;
        outline: none;
        transition: border-color 0.15s;
      }
      .search-input::placeholder { color: #9e9e9e; }
      .search-input:focus { border-color: #3b82f6; }
      .filter-select {
        padding: 8px 12px;
        border-radius: 6px;
        border: 1px solid #2a2a2a;
        background: #1a1a1a;
        color: #fafafa;
        font-size: 14px;
        font-family: inherit;
        outline: none;
        cursor: pointer;
      }
      .filter-select:focus { border-color: #3b82f6; }
      .filter-loading {
        width: 16px;
        height: 16px;
        border: 2px solid #2a2a2a;
        border-top-color: #3b82f6;
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
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 8px;
        cursor: pointer;
        transition: border-color 0.12s, background 0.12s;
        position: relative;
      }
      .task-card:hover {
        border-color: #3a3a3a;
        background: #1e1e1e;
      }
      .task-card.selected {
        border-color: #3b82f6;
        background: rgba(59, 130, 246, 0.05);
      }
      .status-icon {
        width: 18px;
        height: 18px;
        flex-shrink: 0;
      }
      .status-icon.pending { color: #eab308; }
      .status-icon.review { color: #3b82f6; }
      .status-icon.completed { color: #22c55e; }
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
        background: #242424;
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
        border: 1.5px solid #3a3a3a;
      }
      .agent-dot.planned { background: transparent; }
      .agent-dot.running {
        background: #3b82f6;
        border-color: #3b82f6;
        animation: pulse-dot 1.5s ease-in-out infinite;
      }
      .agent-dot.completed { background: #22c55e; border-color: #22c55e; }
      .agent-dot.failed { background: #ef4444; border-color: #ef4444; }
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
      .score-high { background: rgba(34, 197, 94, 0.15); color: #4ade80; }
      .score-medium { background: rgba(234, 179, 8, 0.15); color: #fbbf24; }
      .score-low { background: rgba(239, 68, 68, 0.15); color: #f87171; }
      .task-arrow {
        width: 16px;
        height: 16px;
        color: #707070;
        flex-shrink: 0;
        transition: color 0.15s;
      }
      .task-card:hover .task-arrow { color: #a1a1a1; }
      .task-card.selected .task-arrow { color: #3b82f6; }

      /* Skeleton loading */
      .skeleton-card {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 12px 16px;
        background: #1a1a1a;
        border: 1px solid #2a2a2a;
        border-radius: 8px;
      }
      .skel {
        border-radius: 6px;
        background: linear-gradient(90deg, #1a1a1a 25%, #242424 50%, #1a1a1a 75%);
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
        background: #3b82f6;
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
        background: rgba(239, 68, 68, 0.1);
        border: 1px solid rgba(239, 68, 68, 0.2);
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
        background: rgba(239, 68, 68, 0.2);
        color: #f87171;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        font-family: inherit;
      }
      .retry-btn:hover { background: rgba(239, 68, 68, 0.3); }

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
        background: rgba(34, 197, 94, 0.15);
        color: #22c55e;
        border-color: rgba(34, 197, 94, 0.3);
      }
      .agent-job-btn.failed {
        background: rgba(239, 68, 68, 0.15);
        color: #ef4444;
        border-color: rgba(239, 68, 68, 0.3);
      }
      .agent-job-btn.planned, .agent-job-btn.running {
        background: rgba(59, 130, 246, 0.15);
        color: #3b82f6;
        border-color: rgba(59, 130, 246, 0.3);
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
        border: 1px solid #ef4444;
        background: rgba(239, 68, 68, 0.1);
        color: #ef4444;
        font-size: 15px;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.15s;
        white-space: nowrap;
      }
      .stop-btn:hover:not(:disabled) { background: rgba(239, 68, 68, 0.2); }
      .stop-btn:disabled { opacity: 0.5; cursor: not-allowed; }

      .retry-all-btn {
        padding: 10px 20px;
        border-radius: 8px;
        border: 1px solid #3b82f6;
        background: rgba(59, 130, 246, 0.1);
        color: #3b82f6;
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
        background: rgba(59, 130, 246, 0.2);
        border-color: #60a5fa;
      }
      .retry-all-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
      .spinner {
        width: 14px;
        height: 14px;
        border: 2px solid rgba(59, 130, 246, 0.3);
        border-top-color: #3b82f6;
        border-radius: 50%;
        animation: spin 0.6s linear infinite;
        display: inline-block;
      }
      @keyframes spin { to { transform: rotate(360deg); } }

      /* Proposal section inside task card */
      .proposal-section {
        margin-top: 8px;
        padding: 10px 12px;
        background: rgba(59, 130, 246, 0.06);
        border: 1px solid rgba(59, 130, 246, 0.15);
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
        color: #3b82f6;
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
        color: #666;
      }
      .proposal-cost {
        color: #4ade80;
        font-weight: 500;
      }
      .canvas-pill {
        display: inline-flex;
        padding: 2px 8px;
        border-radius: 999px;
        background: rgba(59, 130, 246, 0.1);
        color: #60a5fa;
        font-size: 11px;
        font-weight: 500;
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
        background: #3b82f6;
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
        border: 1px solid #2a2a2a;
        background: transparent;
        color: #a1a1a1;
        font-size: 13px;
        cursor: pointer;
        transition: border-color 0.15s, color 0.15s;
      }
      .btn-discuss:hover { border-color: #3a3a3a; color: #fafafa; }
      .btn-reject {
        display: inline-flex;
        align-items: center;
        padding: 6px 10px;
        border-radius: 6px;
        border: 1px solid #2a2a2a;
        background: transparent;
        color: #666;
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
        border-bottom: 1px solid #2a2a2a;
        margin-bottom: 12px;
        flex-shrink: 0;
      }
      .panel-title {
        font-size: 16px;
        font-weight: 600;
        color: #fafafa;
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
      .panel-count.proposals { background: rgba(59,130,246,0.15); color: #3b82f6; }
      .panel-count.tasks { background: rgba(34,197,94,0.15); color: #4ade80; }
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
        background: rgba(59,130,246,0.1);
        color: #60a5fa;
        font-size: 10px;
        font-weight: 600;
      }

      /* ── Global Activity Bar ── */
      .activity-bar {
        background: #141414;
        border: 1px solid #2a2a2a;
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
        color: #fafafa;
      }
      .activity-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #22c55e;
        animation: pulse-dot 1.5s infinite;
      }
      @keyframes pulse-dot {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.3; }
      }
      .activity-dot.idle { background: #666; animation: none; }
      .activity-entry {
        font-size: 12px;
        color: #a1a1a1;
        padding: 2px 0;
        border-bottom: 1px solid #1a1a1a;
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
        background: #141414;
        border: 1px solid #2a2a2a;
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
          <h1 class="page-title">Zadaci</h1>
          <p class="page-desc">Pregledajte i pratite zadatke sa AI agentima.</p>
        </div>
        <div style="display:flex;gap:8px;">
          <button class="retry-all-btn" [disabled]="isRetryingAll()" (click)="retryAllPending()">
            @if (isRetryingAll()) { <span class="spinner"></span> Izvršava se... } @else { Pokreni neizvršene }
          </button>
          <button class="stop-btn" [disabled]="isStopping()" (click)="stopAllAgents()">
            @if (isStopping()) { Zaustavljam... } @else { Zaustavi agente }
          </button>
        </div>
      </div>

      @if (error()) {
        <div class="error-banner">
          <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
          <span>{{ error() }}</span>
          <button class="retry-btn" (click)="loadTasks()">Ponovo</button>
        </div>
      }

      @if (domainSummary().length > 0 && !isLoading()) {
        <div class="domain-banner">
          <button class="domain-pill" [class.active]="!activeCategory()" (click)="filterByCategory(null)">
            Sve <span class="domain-count">{{ totalCount() }}</span>
          </button>
          @for (domain of domainSummary(); track domain.category) {
            <button class="domain-pill" [class.active]="activeCategory() === domain.category" (click)="filterByCategory(domain.category)">
              {{ stripCategoryNumber(domain.category) }} <span class="domain-count">{{ domain.total }}</span>
            </button>
          }
        </div>
      }

      <div class="filter-bar">
        <div class="search-wrap">
          <svg class="search-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>
          <input class="search-input" placeholder="Pretraži zadatke..." [ngModel]="searchTerm()" (ngModelChange)="onSearchChange($event)" />
        </div>
        <select class="filter-select" [ngModel]="statusFilter()" (ngModelChange)="onStatusChange($event)">
          <option value="">Svi statusi</option>
          <option value="PENDING">Na čekanju</option>
          <option value="READY_FOR_REVIEW">Za pregled</option>
          <option value="COMPLETED">Završeno</option>
        </select>
        @if (isFiltering()) { <div class="filter-loading"></div> }
      </div>

      <!-- ═══ DUAL PANEL LAYOUT ═══ -->
      <div class="dual-panels">

        <!-- LEFT: AI Preporučeni zadaci -->
        <div class="panel">
          <div class="panel-header">
            <span class="panel-title">
              <span class="ai-badge">AI</span> Preporučeni
            </span>
            <span class="panel-count proposals">{{ proposals().length }}</span>
          </div>
          <div class="panel-scroll">
            @if (proposals().length === 0 && !isLoading()) {
              <div class="empty-state" style="padding:24px 0;">
                <p style="color:#666;font-size:13px;text-align:center;">Mozak još razmišlja... Predlozi će se pojaviti ovde.</p>
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
                    <span style="margin-left:auto;font-size:11px;color:#444;">
                      {{ expandedProposalId() === proposal.id ? '▲' : '▼' }}
                    </span>
                  </div>

                  <!-- Expanded content -->
                  @if (expandedProposalId() === proposal.id) {
                    <div class="proposal-section" style="margin-top:8px;">
                      <div class="proposal-label"><span>Zašto je ovo važno</span></div>
                      <div style="font-size:13px;color:#ccc;line-height:1.6;white-space:pre-wrap;">{{ proposal.reasoning }}</div>

                      @if (proposal.proposedAction && proposal.proposedAction !== proposal.reasoning) {
                        <div class="proposal-label" style="margin-top:10px;"><span>Šta treba uraditi</span></div>
                        <div style="font-size:13px;color:#ccc;line-height:1.6;white-space:pre-wrap;">{{ proposal.proposedAction }}</div>
                      }

                      <div class="proposal-actions" style="margin-top:12px;">
                        <button class="btn-pokreni" [disabled]="approvingProposalId() === proposal.id" (click)="approveProposal(proposal, $event)">
                          @if (approvingProposalId() === proposal.id) {
                            <span class="spinner" style="width:12px;height:12px;"></span> Pokreće se...
                          } @else {
                            Pokreni
                          }
                        </button>
                        <button class="btn-discuss" (click)="discussProposal(proposal, $event)">Razgovaraj</button>
                        <button class="btn-reject" (click)="rejectProposal(proposal, $event)">Odbij</button>
                      </div>
                    </div>
                  }
                </div>
              </div>
            }
          </div>
        </div>

        <!-- RIGHT: Zadaci -->
        <div class="panel">
          <div class="panel-header">
            <span class="panel-title">Zadaci</span>
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
                <div class="task-card" [class.selected]="selectedId() === task.id" (click)="selectTask(task)">
                  @if (task.status === 'COMPLETED') {
                    <svg class="status-icon completed" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  } @else if (task.status === 'READY_FOR_REVIEW') {
                    <svg class="status-icon review" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>
                  } @else {
                    <svg class="status-icon pending" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                  }
                  <div class="task-info">
                    <div class="task-title">{{ task.title }}</div>
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
                    <app-agent-graph [statusEvents]="agentStatusEvents()"></app-agent-graph>
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
                <h3>Još nema zadataka</h3>
                <p>Odobrite predlog mozga ili započnite razgovor.</p>
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

  readonly proposals = signal<BrainProposalItem[]>([]);
  readonly agentStatusEvents = signal<BridgeAgentStatusPayload[]>([]);
  readonly recentStatusEvents = computed(() => this.agentStatusEvents().slice(-10).reverse());
  readonly hasActiveAgents = computed(() =>
    this.agentStatusEvents().some(e =>
      e.status !== 'completed' && e.status !== 'failed'
    )
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

  ngOnInit(): void {
    this.loadTasks();
    this.loadProposals();

    // Auto-refresh every 15s — include proposals
    this.autoRefreshInterval = setInterval(() => {
      if (!this.isFiltering()) {
        this.loadTasks();
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
        this.loadTasks();
        this.loadProposals();
      });

    // Listen for real-time bridge events — all trigger debounced refresh
    this.unsubBridgeEvents.push(
      this.chatWs.onProposalNew(() => bridgeRefresh$.next()),
      this.chatWs.onProposalApproved(() => bridgeRefresh$.next()),
      this.chatWs.onBridgeTaskCreated(() => bridgeRefresh$.next()),
      this.chatWs.onBridgeTaskComplete(() => bridgeRefresh$.next()),
      this.chatWs.onBridgeTaskContribution(() => bridgeRefresh$.next()),
      this.chatWs.onBridgeAgentStatus((data) => {
        this.agentStatusEvents.update(events => {
          const updated = [...events, data];
          return updated.length > 100 ? updated.slice(-100) : updated; // Keep last 100
        });
      }),
    );
  }

  ngOnDestroy(): void {
    if (this.autoRefreshInterval) {
      clearInterval(this.autoRefreshInterval);
    }
    this.unsubBridgeEvents.forEach((unsub) => unsub());
  }

  loadTasks(isFilter = false): void {
    if (isFilter) {
      this.isFiltering.set(true);
    } else {
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
          this.tasks.set(res.data.tasks);
          this.domainSummary.set(res.data.domainSummary);
          this.isLoading.set(false);
          this.isFiltering.set(false);
          // Auto-select first task if nothing selected
          const first = res.data.tasks[0];
          if (!this.selectedId() && first) {
            this.selectTask(first);
          }
        },
        error: () => {
          this.error.set('Greška pri učitavanju zadataka.');
          this.isLoading.set(false);
          this.isFiltering.set(false);
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
          this.toastService.success(`${job.agentType} ponovo pokrenut`);
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
          this.toastService.error('Greška: ' + (err.error?.detail || err.message || 'Nepoznata'));
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
          this.toastService.success(`Zaustavljeno: ${result.stoppedExecutions} izvršavanja, ${result.stoppedJobs} poslova`);
          this.loadTasks();
        },
        error: () => {
          this.isStopping.set(false);
          this.toastService.error('Greška pri zaustavljanju');
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
            this.toastService.info('Nema neizvršenih zadataka.');
            this.isRetryingAll.set(false);
          } else {
            this.toastService.success(`Pokrenuto ${result.totalJobs} zadataka u talasima po 5.`);
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
          this.toastService.error('Greška pri pokretanju: ' + (err.message || 'Nepoznata greška'));
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
          this.toastService.success(`Pokrenuto: ${proposal.title}`);
          this.loadProposals();
          this.loadTasks();
        },
        error: () => {
          this.approvingProposalId.set(null);
          this.toastService.error('Greška pri odobravanju predloga.');
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
    const reason = prompt('Razlog odbijanja (opciono):');
    if (reason === null) return; // User clicked Cancel — abort
    this.proposalService.rejectProposal(proposal.id, reason || undefined)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.toastService.info(`Odbijeno: ${proposal.title}`);
          this.loadProposals();
        },
        error: () => this.toastService.error('Greška pri odbijanju predloga.'),
      });
  }

  onDownloadFile(file: { name: string; path: string; mimeType: string }): void {
    window.open(`/api/v1/notes/files/download?path=${encodeURIComponent(file.path)}`, '_blank');
  }

  onExecuteAction(event: { noteId: string; agentType: string; actionId: string }): void {
    this.taskHubService.executeAction(event.noteId, event.agentType, event.actionId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.toastService.success('Akcija pokrenuta'),
        error: () => this.toastService.error('Greška pri pokretanju akcije'),
      });
  }

  formatCanvasBlock(block: string): string {
    const labels: Record<string, string> = {
      KEY_PARTNERS: 'Partneri',
      KEY_ACTIVITIES: 'Aktivnosti',
      KEY_RESOURCES: 'Resursi',
      VALUE_PROPOSITION: 'Vrednost',
      CUSTOMER_RELATIONSHIPS: 'Odnosi',
      CHANNELS: 'Kanali',
      CUSTOMER_SEGMENTS: 'Segmenti',
      REVENUE_STREAMS: 'Prihodi',
      COST_STRUCTURE: 'Troškovi',
    };
    return labels[block] ?? block;
  }

  formatEventTime(ts: string): string {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString('sr-Latn', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
}
