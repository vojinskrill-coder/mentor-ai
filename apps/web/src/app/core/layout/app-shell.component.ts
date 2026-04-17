import { Component, inject, signal, computed, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { RouterModule, RouterLink, RouterLinkActive, NavigationStart, NavigationEnd, NavigationCancel, NavigationError, Router } from '@angular/router';
import { AuthService } from '../auth/auth.service';
import { ToastContainerComponent } from '../components/toast-container.component';
import { ExecutionPanelService } from '../services/execution-panel.service';
import { JobPanelComponent } from '../../features/chat/components/job-panel.component';
import { MarkdownPipe } from '@mentor-ai/shared/ui';
import { NotesApiService } from '../../features/chat/services/notes-api.service';
import { ChatWebsocketService } from '../../features/chat/services/chat-websocket.service';
import { PageLoadingService } from '../services/page-loading.service';
import { GraphViewComponent } from '../../features/graph/graph-view.component';
import { GraphPopupComponent } from '../../features/graph/graph-popup.component';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterModule, RouterLink, RouterLinkActive, ToastContainerComponent, JobPanelComponent, MarkdownPipe, GraphViewComponent, GraphPopupComponent],
  styles: [
    `
      :host {
        display: block;
        height: 100vh;
        overflow: hidden;
      }
      .shell {
        display: flex;
        height: 100vh;
        overflow: hidden;
        background: var(--color-bg-base, #0D1117);
        color: var(--color-text-primary, #E6EDF3);
        font-family: 'Inter', system-ui, sans-serif;
      }

      /* ===== SIDEBAR ===== */
      .sidebar {
        width: clamp(200px, 14vw, 260px);
        min-width: clamp(200px, 14vw, 260px);
        background: var(--color-bg-base, #0D1117);
        border-right: 1px solid var(--color-border-subtle, #21262D);
        display: flex;
        flex-direction: column;
        flex-shrink: 0;
        overflow: hidden;
      }
      .sidebar-brand {
        height: clamp(44px, 3vw, 52px);
        display: flex;
        align-items: center;
        padding: 0 clamp(16px, 1.2vw, 24px);
        border-bottom: 1px solid var(--color-border-subtle, #21262D);
        flex-shrink: 0;
      }
      .sidebar-brand h1 {
        font-size: clamp(14px, 0.9vw, 17px);
        font-weight: 600;
        color: var(--color-text-primary, #E6EDF3);
        letter-spacing: -0.01em;
      }
      .sidebar-brand .brand-icon {
        height: clamp(24px, 1.6vw, 30px);
        width: auto;
        margin-right: clamp(8px, 0.6vw, 12px);
        flex-shrink: 0;
        object-fit: contain;
      }
      .sidebar-nav {
        flex: 1;
        overflow-y: auto;
        padding: clamp(6px, 0.5vw, 10px) 0;
      }
      .nav-section-label {
        font-size: 11px !important;
        font-weight: 600;
        color: var(--color-text-muted, #9e9e9e);
        text-transform: uppercase;
        letter-spacing: 0.06em;
        padding: 16px 20px 6px;
      }
      .nav-item {
        display: flex;
        align-items: center;
        gap: clamp(8px, 0.6vw, 12px);
        padding: clamp(6px, 0.5vw, 10px) clamp(16px, 1.2vw, 24px);
        margin: 1px clamp(6px, 0.5vw, 10px);
        border-radius: 6px;
        font-size: 13px;
        font-weight: 500;
        color: var(--color-text-secondary, #a1a1a1);
        text-decoration: none;
        transition: background 0.15s ease, color 0.15s ease;
        position: relative;
        cursor: pointer;
      }
      .nav-item:hover {
        background: var(--color-bg-surface, #161B22);
        color: var(--color-text-primary, #E6EDF3);
      }
      .nav-item.active {
        background: var(--color-bg-surface, #161B22);
        color: var(--color-text-primary, #E6EDF3);
      }
      .nav-item.active::before {
        content: '';
        position: absolute;
        left: 0;
        top: 6px;
        bottom: 6px;
        width: 3px;
        border-radius: 0 2px 2px 0;
        background: var(--color-primary, #58A6FF);
      }
      .nav-badge {
        display: inline-flex; align-items: center; justify-content: center;
        min-width: 18px; height: 18px; padding: 0 5px;
        border-radius: 9px; background: #58A6FF; color: #fff;
        font-size: 11px; font-weight: 600; margin-left: auto;
        line-height: 1;
      }
      .nav-item svg {
        width: var(--icon-sm, 16px);
        height: var(--icon-sm, 16px);
        flex-shrink: 0;
        opacity: 0.7;
      }
      .nav-item.active svg {
        opacity: 1;
      }

      /* ===== MAIN AREA ===== */
      .main-area {
        flex: 1;
        display: flex;
        flex-direction: column;
        min-width: 0;
        overflow: hidden;
      }

      /* Topbar — aligned with sidebar brand */
      .topbar {
        height: clamp(44px, 3vw, 52px);
        min-height: clamp(44px, 3vw, 52px);
        display: flex;
        align-items: center;
        justify-content: flex-end;
        padding: 0 clamp(16px, 1.5vw, 32px);
        border-bottom: 1px solid var(--color-border-subtle, #21262D);
        background: var(--color-bg-base, #0D1117);
        flex-shrink: 0;
        position: relative;
        box-sizing: border-box;
      }

      /* Route loading bar */
      .route-loading-bar {
        position: absolute;
        bottom: 0;
        left: 0;
        height: 2px;
        background: var(--color-primary, #58A6FF);
        animation: loading-bar 1.5s ease-in-out infinite;
        border-radius: 0 2px 2px 0;
      }
      @keyframes loading-bar {
        0% { width: 0; left: 0; }
        50% { width: 60%; left: 20%; }
        100% { width: 0; left: 100%; }
      }

      .topbar-right {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .user-menu {
        position: relative;
      }
      .user-btn {
        display: flex;
        align-items: center;
        gap: clamp(6px, 0.5vw, 10px);
        padding: 4px 8px 4px 4px;
        border-radius: 6px;
        border: none;
        background: transparent;
        color: var(--color-text-primary, #E6EDF3);
        cursor: pointer;
        font-family: inherit;
        font-size: clamp(13px, 0.85vw, 16px);
        font-weight: 500;
        transition: background 0.15s ease;
      }
      .user-btn:hover {
        background: var(--color-bg-surface, #161B22);
      }
      .user-avatar {
        width: clamp(26px, 1.8vw, 34px);
        height: clamp(26px, 1.8vw, 34px);
        border-radius: 50%;
        background: var(--color-primary, #58A6FF);
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: clamp(10px, 0.7vw, 13px);
        font-weight: 600;
        flex-shrink: 0;
      }
      .user-btn svg {
        width: 14px;
        height: 14px;
        opacity: 0.6;
      }
      .dropdown {
        position: absolute;
        top: calc(100% + 4px);
        right: 0;
        min-width: 180px;
        background: var(--color-bg-surface, #161B22);
        border: 1px solid var(--color-border-subtle, #21262D);
        border-radius: 8px;
        padding: 4px;
        z-index: 100;
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
        animation: dropdown-in 0.15s cubic-bezier(0.16, 1, 0.3, 1);
      }
      @keyframes dropdown-in {
        from { opacity: 0; transform: translateY(-4px) scale(0.98); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }
      .dropdown-item {
        display: flex;
        align-items: center;
        gap: clamp(6px, 0.5vw, 10px);
        width: 100%;
        padding: clamp(6px, 0.5vw, 10px) clamp(10px, 0.8vw, 16px);
        border-radius: 6px;
        border: none;
        background: transparent;
        color: var(--color-text-secondary, #a1a1a1);
        font-size: clamp(13px, 0.85vw, 16px);
        font-weight: 500;
        font-family: inherit;
        cursor: pointer;
        text-decoration: none;
        transition: background 0.1s ease, color 0.1s ease;
      }
      .dropdown-item:hover {
        background: var(--color-bg-elevated, #1C2128);
        color: var(--color-text-primary, #E6EDF3);
      }
      .dropdown-item svg {
        width: 16px;
        height: 16px;
        opacity: 0.6;
      }
      .dropdown-sep {
        height: 1px;
        background: var(--color-border-subtle, #21262D);
        margin: 4px 8px;
      }
      .dropdown-item.danger {
        color: var(--color-error, #F85149);
      }
      .dropdown-item.danger:hover {
        background: rgba(248, 81, 73, 0.1);
      }
      .dropdown-backdrop {
        position: fixed;
        inset: 0;
        z-index: 99;
      }

      /* Graph panel in exec panel upper half — resizable */
      .graph-panel {
        min-height: 150px;
        max-height: 80%;
        border-bottom: 1px solid #21262D;
        overflow: hidden;
        position: relative;
        flex-shrink: 0;
      }
      .graph-panel.hidden {
        height: 0 !important;
        min-height: 0;
        border-bottom: none;
      }
      .graph-resize-handle {
        position: absolute;
        bottom: -3px;
        left: 0;
        right: 0;
        height: 6px;
        cursor: row-resize;
        z-index: 10;
      }
      .graph-resize-handle:hover,
      .graph-resize-handle.active {
        background: rgba(88, 166, 255, 0.3);
      }

      /* Content area — row layout for content + exec panel */
      .content {
        flex: 1;
        overflow: hidden;
        display: flex;
        flex-direction: row;
      }
      .content-inner {
        flex: 1;
        min-width: 0;
        min-height: 0;
        max-width: none;
        overflow-y: scroll;
        overflow-x: hidden;
        -webkit-overflow-scrolling: touch;
      }

      /* ===== EXECUTION PANEL (right sidebar) — responsive width ===== */
      .exec-panel {
        width: clamp(400px, 28vw, 700px);
        min-width: clamp(340px, 22vw, 500px);
        max-width: 55vw;
        flex-shrink: 0;
        height: 100%;
        background: #0D1117;
        border-left: 1px solid #21262D;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        transition: width 0.2s ease, min-width 0.2s ease, opacity 0.15s ease;
        position: relative;
      }
      .exec-panel.collapsed {
        width: 0;
        min-width: 0;
        border-left: none;
        overflow: hidden;
        pointer-events: none;
      }

      /* Resize handle */
      .panel-resize-handle {
        position: absolute;
        left: -3px;
        top: 0;
        bottom: 0;
        width: 6px;
        cursor: col-resize;
        z-index: 10;
        transition: background 0.15s;
      }
      .panel-resize-handle:hover,
      .panel-resize-handle.active {
        background: rgba(88, 166, 255, 0.3);
      }
      .exec-panel.collapsed * {
        display: none;
      }
      .exec-panel-header {
        display: flex;
        align-items: center;
        gap: clamp(8px, 0.6vw, 12px);
        padding: clamp(10px, 0.8vw, 16px) clamp(12px, 1vw, 20px);
        border-bottom: 1px solid #21262D;
        flex-shrink: 0;
        min-height: clamp(44px, 3vw, 52px);
        box-sizing: border-box;
      }
      .exec-panel-title {
        font-size: clamp(14px, 0.9vw, 17px) !important;
        font-weight: 600;
        flex: 1;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .exec-panel-close {
        background: none;
        border: none;
        color: #707070;
        cursor: pointer;
        padding: 4px;
        border-radius: 4px;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: color 0.15s, background 0.15s;
      }
      .exec-panel-close:hover {
        color: #E6EDF3;
        background: #1C2128;
      }
      .exec-panel-close svg {
        width: 16px;
        height: 16px;
      }
      .ws-indicator {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        flex-shrink: 0;
        background: #F85149;
      }
      .ws-indicator.ws-connected { background: #3FB950; }
      .ws-indicator.ws-disconnected { background: #F85149; }
      .ws-indicator.ws-reconnecting { background: #eab308; animation: pulse-dot 1s infinite; }
      .exec-panel-body {
        flex: 1;
        overflow-y: auto;
        padding: clamp(12px, 1vw, 20px);
        scrollbar-width: thin;
        scrollbar-color: #21262D transparent;
        font-size: 16px;
      }
      .exec-panel-body::-webkit-scrollbar { width: 4px; }
      .exec-panel-body::-webkit-scrollbar-track { background: transparent; }
      .exec-panel-body::-webkit-scrollbar-thumb { background: #21262D; border-radius: 4px; }

      /* Panel toggle button in topbar */
      .panel-toggle-btn {
        background: none;
        border: 1px solid #21262D;
        color: #707070;
        cursor: pointer;
        padding: clamp(4px, 0.4vw, 8px) clamp(6px, 0.5vw, 10px);
        border-radius: 6px;
        display: flex;
        align-items: center;
        gap: clamp(4px, 0.4vw, 8px);
        font-size: clamp(11px, 0.75vw, 14px);
        font-family: inherit;
        transition: color 0.15s, border-color 0.15s, background 0.15s;
      }
      .panel-toggle-btn:hover {
        color: #E6EDF3;
        border-color: #30363D;
      }
      .panel-toggle-btn.active {
        color: #58A6FF;
        border-color: #58A6FF;
        background: rgba(88, 166, 255, 0.08);
      }
      .panel-toggle-btn svg {
        width: 16px;
        height: 16px;
      }

      /* Panel empty state */
      .panel-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        height: 100%;
        color: #707070;
        text-align: center;
        padding: 24px;
      }
      .panel-empty svg {
        width: 40px;
        height: 40px;
        opacity: 0.3;
        margin-bottom: 12px;
      }
      .panel-empty h4 {
        font-size: 16px;
        font-weight: 500;
        color: #9e9e9e;
        margin-bottom: 4px;
      }
      .panel-empty p {
        font-size: 16px;
        line-height: 1.5;
      }

      /* Panel detail sections */
      .panel-status-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 12px;
      }
      .panel-status-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 10px;
        border-radius: 999px;
        font-size: 16px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }
      .panel-status-badge.pending { background: rgba(234, 179, 8, 0.12); color: #eab308; }
      .panel-status-badge.review { background: rgba(88, 166, 255, 0.12); color: #58A6FF; }
      .panel-status-badge.completed { background: rgba(63, 185, 80, 0.12); color: #3FB950; }
      .panel-status-badge svg { width: 10px; height: 10px; }
      .panel-score {
        margin-left: auto;
        padding: 3px 10px;
        border-radius: 999px;
        font-size: 16px;
        font-weight: 600;
      }
      .panel-score.high { background: rgba(63, 185, 80, 0.15); color: #4ade80; }
      .panel-score.medium { background: rgba(234, 179, 8, 0.15); color: #fbbf24; }
      .panel-score.low { background: rgba(248, 81, 73, 0.15); color: #f87171; }
      .panel-task-title {
        font-size: 16px;
        font-weight: 600;
        line-height: 1.35;
        margin-bottom: 6px;
      }
      .panel-concept {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        padding: 3px 10px;
        border-radius: 999px;
        background: #1C2128;
        font-size: 16px;
        font-weight: 500;
        color: #a1a1a1;
        margin-bottom: 16px;
      }
      .panel-concept svg { width: 12px; height: 12px; }

      /* Lifecycle stepper in panel */
      .panel-stepper {
        display: flex;
        align-items: center;
        gap: 0;
        margin-bottom: 16px;
        padding: 10px 12px;
        background: #161B22;
        border-radius: 8px;
        border: 1px solid #21262D;
      }
      .panel-step {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 3px;
      }
      .panel-step-dot {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        border: 2px solid #30363D;
        background: transparent;
      }
      .panel-step-dot.done { background: #3FB950; border-color: #3FB950; }
      .panel-step-dot.active {
        background: #58A6FF;
        border-color: #58A6FF;
        animation: pulse-dot 1.5s ease-in-out infinite;
      }
      @keyframes pulse-dot {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.4; }
      }
      .panel-step-label {
        font-size: 16px;
        color: #707070;
        white-space: nowrap;
      }
      .panel-step-label.done { color: #3FB950; }
      .panel-step-label.active { color: #58A6FF; }
      .panel-step-line {
        flex: 1;
        height: 2px;
        background: #30363D;
        margin: 0 4px;
        margin-bottom: 16px;
      }
      .panel-step-line.done { background: #3FB950; }

      /* Panel section */
      .panel-section {
        margin-bottom: 16px;
      }
      .panel-section-label {
        font-size: 16px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #707070;
        margin-bottom: 6px;
        display: flex;
        align-items: center;
        gap: 5px;
      }
      .panel-section-label svg { width: 12px; height: 12px; }
      .panel-description {
        font-size: 16px;
        color: #b0b0b0;
        line-height: 1.6;
      }
      .panel-description :first-child { margin-top: 0; }
      .panel-description :last-child { margin-bottom: 0; }
      .panel-expected {
        background: #161B22;
        border: 1px solid #21262D;
        border-radius: 8px;
        padding: 12px;
        font-size: 16px;
        color: #b0b0b0;
        line-height: 1.6;
      }

      /* Jobs summary in panel */
      .panel-jobs {
        background: #161B22;
        border: 1px solid #21262D;
        border-radius: 8px;
        padding: 12px;
      }
      .panel-jobs-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
      }
      .panel-jobs-title {
        font-size: 16px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: #707070;
      }
      .panel-jobs-count { font-size: 16px; color: #9e9e9e; }
      .panel-job-row {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 6px 0;
        border-bottom: 1px solid #1C2128;
      }
      .panel-job-row:last-child { border-bottom: none; }
      .panel-job-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .panel-job-dot.planned { border: 2px solid #30363D; background: transparent; }
      .panel-job-dot.running { background: #58A6FF; animation: pulse-dot 1.5s ease-in-out infinite; }
      .panel-job-dot.completed { background: #3FB950; }
      .panel-job-dot.failed { background: #F85149; }
      .panel-job-name {
        flex: 1;
        font-size: 16px;
        font-weight: 500;
        color: #d0d0d0;
      }
      .panel-job-status {
        font-size: 16px;
        font-weight: 500;
        text-transform: uppercase;
        letter-spacing: 0.03em;
      }
      .panel-job-status.planned { color: #707070; }
      .panel-job-status.running { color: #58A6FF; }
      .panel-job-status.completed { color: #3FB950; }
      .panel-job-status.failed { color: #F85149; }

      /* Panel meta */
      .panel-meta {
        display: flex;
        align-items: center;
        gap: 10px;
        padding-top: 12px;
        border-top: 1px solid #21262D;
        font-size: 16px;
        color: #707070;
      }
      .panel-chat-link {
        color: #58A6FF;
        text-decoration: none;
        margin-left: auto;
        font-weight: 500;
        font-size: 11px;
      }
      .panel-chat-link:hover { text-decoration: underline; }

      /* ===== ACTIVITY FEED — Claude-style Timeline ===== */
      .feed-section { margin-bottom: 16px; }
      .feed-header {
        display: flex; align-items: center; justify-content: space-between;
        margin-bottom: 12px;
      }
      .feed-header-title {
        font-size: clamp(14px, 0.9vw, 17px) !important; font-weight: 600;
        letter-spacing: 0.02em; color: #808080;
        display: flex; align-items: center; gap: 8px;
      }
      .feed-running-count {
        display: inline-flex; align-items: center; justify-content: center;
        min-width: 18px; height: 18px; padding: 0 5px;
        border-radius: 9px; background: #58A6FF; color: #fff;
        font-size: 10px; font-weight: 700; letter-spacing: 0;
      }
      .feed-clear-btn {
        font-size: 10px; color: #606060; background: none; border: none;
        cursor: pointer; padding: 3px 8px; border-radius: 4px; font-family: inherit;
        transition: all 0.15s ease;
      }
      .feed-clear-btn:hover { color: #E6EDF3; background: #1C2128; }

      /* Timeline container */
      .activity-feed {
        display: flex; flex-direction: column; gap: 0;
        position: relative;
        padding-left: 20px;
      }

      /* Vertical connector line */
      .activity-feed::before {
        content: '';
        position: absolute;
        left: 7px;
        top: 8px;
        bottom: 8px;
        width: 1px;
        background: linear-gradient(to bottom, #21262D 0%, #161B22 100%);
      }

      /* Timeline entry */
      .tl-entry {
        position: relative;
        padding: 6px 0;
        animation: tl-slide-in 0.25s cubic-bezier(0.4, 0, 0.2, 1);
      }
      @keyframes tl-slide-in {
        from { opacity: 0; transform: translateX(-6px); }
        to { opacity: 1; transform: translateX(0); }
      }

      /* Timeline dot on the connector line */
      .tl-dot {
        position: absolute;
        left: -20px;
        top: 10px;
        width: 14px;
        height: 14px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 1;
        background: #0D1117;
      }
      .tl-dot-inner {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        transition: all 0.2s ease;
      }
      .tl-dot-inner.running {
        width: 10px; height: 10px;
        background: #58A6FF;
        box-shadow: 0 0 8px rgba(88, 166, 255, 0.5);
        animation: tl-pulse 2s ease-in-out infinite;
      }
      @keyframes tl-pulse {
        0%, 100% { box-shadow: 0 0 4px rgba(88, 166, 255, 0.3); }
        50% { box-shadow: 0 0 12px rgba(88, 166, 255, 0.7); }
      }
      .tl-dot-inner.completed {
        background: #3FB950;
      }
      .tl-dot-inner.error {
        background: #F85149;
        box-shadow: 0 0 6px rgba(248, 81, 73, 0.3);
      }
      .tl-dot-inner.info {
        width: 6px; height: 6px;
        background: #505050;
      }

      /* SVG icon inside completed dots */
      .tl-dot svg {
        width: 8px; height: 8px;
        stroke: #fff; stroke-width: 3;
        fill: none;
      }
      .tl-dot.has-icon .tl-dot-inner { display: none; }
      .tl-dot.has-icon {
        background: #3FB950;
        width: 14px; height: 14px;
      }
      .tl-dot.has-icon.error-icon {
        background: #F85149;
      }

      /* Content block next to timeline */
      .tl-content {
        padding: 4px 0 4px 4px;
        cursor: pointer;
        border-radius: 6px;
        transition: background 0.15s ease;
      }
      .tl-content:hover {
        background: rgba(255, 255, 255, 0.02);
      }

      /* Header row */
      .tl-header {
        display: flex; align-items: center; gap: 8px;
      }
      .tl-icon {
        width: 16px; height: 16px; flex-shrink: 0;
        color: #606060;
        display: flex; align-items: center; justify-content: center;
      }
      .tl-icon svg {
        width: 14px; height: 14px;
        stroke: currentColor; stroke-width: 2;
        fill: none;
      }
      .tl-entry.is-running .tl-icon { color: #60a5fa; }
      .tl-entry.is-completed .tl-icon { color: #4ade80; }
      .tl-entry.is-error .tl-icon { color: #f87171; }

      .tl-title {
        flex: 1; font-size: 15px !important; font-weight: 500; color: #b0b0b0;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        line-height: 1.4;
      }
      .tl-entry.is-running .tl-title {
        color: #e0e0e0; font-weight: 600;
      }
      .tl-entry.is-error .tl-title { color: #fca5a5; }

      .tl-time {
        font-size: 10px; color: #4a4a4a; flex-shrink: 0;
        font-variant-numeric: tabular-nums;
      }

      /* Expand chevron for collapsible entries */
      .tl-chevron {
        width: 14px; height: 14px; flex-shrink: 0;
        color: #4a4a4a;
        transition: transform 0.2s ease, color 0.15s ease;
      }
      .tl-chevron svg {
        width: 12px; height: 12px;
        stroke: currentColor; stroke-width: 2;
        fill: none;
      }
      .tl-chevron.expanded { transform: rotate(90deg); }
      .tl-content:hover .tl-chevron { color: #808080; }

      /* Detail / subtitle text */
      .tl-detail {
        margin-top: 4px;
        font-size: 15px !important; color: #707070; line-height: 1.4;
        padding-left: 24px;
      }

      /* ── Thinking dots (shown when running, no stream content yet) ── */
      .tl-thinking {
        display: flex; gap: 4px; padding: 8px 0 4px 24px;
      }
      .tl-thinking-dot {
        width: 5px; height: 5px;
        border-radius: 50%;
        background: #58A6FF;
        animation: thinking-bounce 1.4s infinite ease-in-out;
      }
      .tl-thinking-dot:nth-child(2) { animation-delay: 0.16s; }
      .tl-thinking-dot:nth-child(3) { animation-delay: 0.32s; }
      @keyframes thinking-bounce {
        0%, 80%, 100% { transform: scale(0.6); opacity: 0.4; }
        40% { transform: scale(1); opacity: 1; }
      }

      /* ── Streaming content block ── */
      .tl-stream-wrap {
        margin: 6px 0 2px;
        padding: 10px 12px;
        background: #0D1117;
        border-radius: 8px;
        border: 1px solid #21262D;
        max-height: 200px;
        overflow-y: auto;
        position: relative;
        scrollbar-width: thin;
        scrollbar-color: #21262D transparent;
      }
      .tl-stream-wrap::-webkit-scrollbar { width: 3px; }
      .tl-stream-wrap::-webkit-scrollbar-track { background: transparent; }
      .tl-stream-wrap::-webkit-scrollbar-thumb { background: #21262D; border-radius: 3px; }

      /* Markdown-rendered streaming content */
      .tl-stream-content {
        font-size: 12px;
        color: #c0c0c0;
        line-height: 1.6;
        word-break: break-word;
      }
      .tl-stream-content p { margin: 0 0 8px; }
      .tl-stream-content p:last-child { margin-bottom: 0; }
      .tl-stream-content strong { color: #e0e0e0; font-weight: 600; }
      .tl-stream-content em { color: #a0a0a0; }
      .tl-stream-content code {
        font-family: 'JetBrains Mono', 'Fira Code', monospace;
        font-size: 11px; background: #161B22; padding: 1px 4px;
        border-radius: 3px; color: #93c5fd;
      }
      .tl-stream-content pre {
        background: #0D1117; padding: 10px 12px; border-radius: 6px;
        overflow-x: auto; margin: 8px 0;
      }
      .tl-stream-content pre code {
        background: none; padding: 0; font-size: 11px; color: #a0a0a0;
      }
      .tl-stream-content ul, .tl-stream-content ol {
        padding-left: 18px; margin: 4px 0;
      }
      .tl-stream-content li { margin: 2px 0; }
      .tl-stream-content h1, .tl-stream-content h2, .tl-stream-content h3 {
        color: #e0e0e0; margin: 12px 0 6px; font-weight: 600;
      }
      .tl-stream-content h1 { font-size: 15px; }
      .tl-stream-content h2 { font-size: 14px; }
      .tl-stream-content h3 { font-size: 13px; }
      .tl-stream-content table {
        width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 11px;
      }
      .tl-stream-content th {
        background: #161B22; font-weight: 600; text-align: left;
        padding: 6px 8px; border: 1px solid #21262D; color: #d0d0d0;
      }
      .tl-stream-content td {
        padding: 5px 8px; border: 1px solid #21262D;
      }
      .tl-stream-content tr:nth-child(even) { background: #161B22; }
      .tl-stream-content blockquote {
        border-left: 2px solid #58A6FF; padding-left: 12px;
        margin: 8px 0; color: #808080; font-style: italic;
      }
      .tl-stream-content a { color: #58A6FF; text-decoration: none; }
      .tl-stream-content a:hover { text-decoration: underline; }

      /* ── Sub-entry styles (smaller dot, no icon, muted) ── */
      .tl-entry.is-sub-entry { padding: 3px 0; }
      .tl-entry.is-sub-entry .tl-dot {
        width: 10px; height: 10px; left: -18px; top: 9px;
      }
      .tl-entry.is-sub-entry .tl-dot-inner { width: 5px; height: 5px; }
      .tl-entry.is-sub-entry .tl-dot-inner.running { width: 6px; height: 6px; }
      .tl-entry.is-sub-entry .tl-dot.has-icon { width: 10px; height: 10px; }
      .tl-entry.is-sub-entry .tl-dot.has-icon svg { width: 6px; height: 6px; }
      .tl-entry.is-sub-entry .tl-icon { display: none; }
      .tl-entry.is-sub-entry .tl-title {
        font-size: 11px; font-weight: 400; color: #909090;
      }
      .tl-entry.is-sub-entry.is-running .tl-title {
        color: #c0c0c0; font-weight: 500;
      }
      .tl-entry.is-sub-entry .tl-time { font-size: 9px; }
      .tl-entry.is-sub-entry .tl-thinking { padding: 4px 0 2px 4px; }
      .tl-entry.is-sub-entry .tl-thinking-dot { width: 4px; height: 4px; }

      /* ── Inline stream (no box) for agent text output ── */
      .tl-stream-inline {
        margin: 4px 0 2px; padding: 0 0 0 4px;
      }
      .tl-stream-inline .tl-stream-content {
        font-size: 12px; color: #c0c0c0; line-height: 1.6; word-break: break-word;
      }

      /* Blinking cursor at the end of streaming content */
      .tl-cursor {
        display: inline-block;
        width: 2px; height: 14px;
        background: #58A6FF;
        margin-left: 2px;
        vertical-align: text-bottom;
        animation: cursor-blink 1s step-end infinite;
      }
      @keyframes cursor-blink {
        0%, 100% { opacity: 1; }
        50% { opacity: 0; }
      }

      /* Collapsed state — body hidden */
      .tl-body { overflow: hidden; transition: max-height 0.2s ease, opacity 0.2s ease; }
      .tl-body.collapsed { max-height: 0; opacity: 0; }
      .tl-body.expanded { max-height: 2000px; opacity: 1; }

      /* Completion summary for collapsed entries */
      .tl-summary {
        font-size: 11px; color: #606060; margin-left: 24px; margin-top: 2px;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }

      .feed-divider {
        height: 1px; background: #21262D; margin: 12px 0;
      }

      /* Panel toggle badge showing running count */
      .panel-toggle-badge {
        display: inline-flex; align-items: center; justify-content: center;
        min-width: 16px; height: 16px; padding: 0 4px;
        border-radius: 8px; background: #58A6FF; color: #fff;
        font-size: 10px; font-weight: 700; margin-left: 4px;
        animation: tl-pulse 2s ease-in-out infinite;
      }

      /* Layout overrides handled by global styles in styles.css */
    `,
  ],
  template: `
    <div class="shell">
      <!-- Sidebar -->
      <aside class="sidebar">
        <div class="sidebar-brand">
          <img class="brand-icon" src="assets/images/neuron-os-logo.png" alt="Neuron OS" />
        </div>
        <nav class="sidebar-nav">
          <a class="nav-item" routerLink="/dashboard" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: true }">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0a1 1 0 01-1-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 01-1 1" /></svg>
            Dashboard
          </a>
          <a class="nav-item" routerLink="/chat" routerLinkActive="active" (click)="chatBadge.set(0)">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
            Conversations
            @if (chatBadge() > 0) { <span class="nav-badge">{{ chatBadge() }}</span> }
          </a>
          <a class="nav-item" routerLink="/tasks" routerLinkActive="active" (click)="taskBadge.set(0)">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" /></svg>
            Tasks
            @if (taskBadge() > 0) { <span class="nav-badge">{{ taskBadge() }}</span> }
          </a>
          <a class="nav-item" routerLink="/materijali" routerLinkActive="active">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
            Materials
          </a>
          <a class="nav-item" routerLink="/process-results" routerLinkActive="active" (click)="processBadge.set(0)">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            Processes
            @if (processBadge() > 0) { <span class="nav-badge">{{ processBadge() }}</span> }
          </a>
          @if (isOwnerOrAdmin()) {
            <a class="nav-item" routerLink="/team" routerLinkActive="active">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" /></svg>
              Team
            </a>
          }

          <!-- Separator -->
          <div style="height: 1px; background: #21262D; margin: 8px 16px;"></div>
          <a class="nav-item" routerLink="/settings" routerLinkActive="active">
            <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><circle cx="12" cy="12" r="3"/></svg>
            Settings
          </a>
          @if (isOwner()) {
            <a class="nav-item" routerLink="/brochure-generator" routerLinkActive="active">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 21a4 4 0 01-4-4V5a2 2 0 012-2h4a2 2 0 012 2v12a4 4 0 01-4 4zm0 0h12a2 2 0 002-2v-4a2 2 0 00-2-2h-2.343M11 7.343l1.657-1.657a2 2 0 012.828 0l2.829 2.829a2 2 0 010 2.828l-8.486 8.485M7 17h.01"/></svg>
              Brochures
            </a>
            <a class="nav-item" routerLink="/process-design" routerLinkActive="active">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"/></svg>
              Design Process
            </a>
            <a class="nav-item" routerLink="/process-builder" routerLinkActive="active">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><circle cx="12" cy="12" r="3"/></svg>
              Process Settings
            </a>
            <a class="nav-item" routerLink="/account-settings" routerLinkActive="active">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" /></svg>
              Account
            </a>
          }
          @if (isPlatformOwner()) {
            <a class="nav-item" routerLink="/admin/llm-config" routerLinkActive="active">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              AI Settings
            </a>
            <a class="nav-item" routerLink="/admin/monitoring" routerLinkActive="active">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
              Monitoring
            </a>
          }
        </nav>
      </aside>

      <!-- Main content area -->
      <div class="main-area">
        <!-- Topbar -->
        <header class="topbar">
          @if (routeLoading() || pageLoading.isLoading()) {
            <div class="route-loading-bar"></div>
          }
          <div class="topbar-right">
            <!-- Graph button removed — graph accessible via popup only -->
            <div class="user-menu">
              <button class="user-btn" (click)="toggleDropdown()">
                <div class="user-avatar">{{ userInitials() }}</div>
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" /></svg>
              </button>
              @if (dropdownOpen()) {
                <div class="dropdown-backdrop" (click)="dropdownOpen.set(false)"></div>
                <div class="dropdown">
                  <a class="dropdown-item" routerLink="/profile-settings" (click)="dropdownOpen.set(false)">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
                    Profile
                  </a>
                  <a class="dropdown-item" routerLink="/profile-settings" (click)="dropdownOpen.set(false)">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                    Settings
                  </a>
                  <div class="dropdown-sep"></div>
                  <button class="dropdown-item danger" (click)="logout()">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
                    Sign out
                  </button>
                </div>
              }
            </div>
          </div>
        </header>

        <!-- Page content + execution panel -->
        <main class="content">
          <div class="content-inner">
            <router-outlet></router-outlet>
          </div>

          <!-- Global Execution Panel -->
          <aside class="exec-panel" [class.collapsed]="!execPanel.panelOpen()" [style.width.px]="panelWidth()">
              <div class="panel-resize-handle"
                [class.active]="isResizingPanel"
                (mousedown)="onPanelResizeStart($event)"></div>
              <div class="exec-panel-header">
                <span class="ws-indicator" [class.ws-connected]="wsState() === 'connected'" [class.ws-disconnected]="wsState() === 'disconnected'" [class.ws-reconnecting]="wsState() === 'reconnecting'"></span>
                <span class="exec-panel-title">
                  @if (execPanel.activeTask(); as t) {
                    {{ t.note.title }}
                  } @else {
                    Graph View
                  }
                </span>
                <button class="exec-panel-close" (click)="execPanel.close()" title="Collapse panel">
                  <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>

              <!-- Knowledge Graph (upper half of panel, resizable) -->
              <div class="graph-panel" [class.hidden]="!showGraph()" [style.height.px]="graphHeight()">
                <div class="graph-resize-handle"
                  [class.active]="isResizingGraph"
                  (mousedown)="onGraphResizeStart($event)"></div>
                <app-graph-view
                  [embedded]="true"
                  (noteActivated)="onGraphNoteActivated($event)"
                  (expandRequested)="showGraphPopup.set(true)">
                </app-graph-view>
              </div>

              <div class="exec-panel-body" #panelBody>
                <!-- Activity Feed — Claude-style Timeline -->
                @if (execPanel.activityFeed().length > 0) {
                  <div class="feed-section">
                    <div class="feed-header">
                      <span class="feed-header-title">
                        Activity
                        @if (runningCount() > 0) {
                          <span class="feed-running-count">{{ runningCount() }}</span>
                        }
                      </span>
                      <button class="feed-clear-btn" (click)="execPanel.clearFeed()">Delete</button>
                    </div>
                    <div class="activity-feed">
                      @for (entry of execPanel.activityFeed(); track entry.id) {
                        <div class="tl-entry" [class.is-running]="entry.status === 'running'" [class.is-completed]="entry.status === 'completed'" [class.is-error]="entry.status === 'error'" [class.is-info]="entry.status === 'info'" [class.is-sub-entry]="entry.isSubEntry">
                          <!-- Timeline dot -->
                          <div class="tl-dot" [class.has-icon]="entry.status === 'completed' || entry.status === 'error'" [class.error-icon]="entry.status === 'error'">
                            @if (entry.status === 'completed') {
                              <svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
                            } @else if (entry.status === 'error') {
                              <svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                            } @else {
                              <span class="tl-dot-inner" [class]="entry.status"></span>
                            }
                          </div>

                          <!-- Content -->
                          <div class="tl-content" (click)="toggleEntryExpand(entry.id, entry.status)">
                            <div class="tl-header">
                              <span class="tl-icon" [innerHTML]="getEntryIconSvg(entry.type)"></span>
                              <span class="tl-title">{{ entry.title }}</span>
                              <span class="tl-time">{{ formatRelativeTime(entry.timestamp) }}</span>
                              @if (entry.detail || entry.streamContent) {
                                <span class="tl-chevron" [class.expanded]="isEntryExpanded(entry.id, entry.status)">
                                  <svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5l7 7-7 7" /></svg>
                                </span>
                              }
                            </div>

                            <!-- Collapsed summary for completed entries -->
                            @if (!isEntryExpanded(entry.id, entry.status) && entry.detail) {
                              <div class="tl-summary">{{ entry.detail }}</div>
                            }

                            <!-- Expandable body -->
                            <div class="tl-body" [class.collapsed]="!isEntryExpanded(entry.id, entry.status)" [class.expanded]="isEntryExpanded(entry.id, entry.status)">
                              @if (entry.detail) {
                                <div class="tl-detail">{{ entry.detail }}</div>
                              }

                              <!-- Thinking dots: shown when running with no stream content -->
                              @if (entry.status === 'running' && !entry.streamContent) {
                                <div class="tl-thinking">
                                  <span class="tl-thinking-dot"></span>
                                  <span class="tl-thinking-dot"></span>
                                  <span class="tl-thinking-dot"></span>
                                </div>
                              }

                              <!-- Streaming content with markdown + blinking cursor -->
                              @if (entry.streamContent) {
                                <div [class]="isInlineStreamEntry(entry.type) ? 'tl-stream-inline' : 'tl-stream-wrap'">
                                  <div class="tl-stream-content" [innerHTML]="streamTail(entry.streamContent) | markdown"></div>
                                  @if (entry.status === 'running') {
                                    <span class="tl-cursor"></span>
                                  }
                                </div>
                              }
                            </div>
                          </div>
                        </div>
                      }
                    </div>
                  </div>
                  <div class="feed-divider"></div>
                }

                @if (execPanel.activeTask(); as t) {
                  <!-- Status + score -->
                  <div class="panel-status-row">
                    @if (t.note.status === 'COMPLETED') {
                      <span class="panel-status-badge completed">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7" /></svg>
                        Completed
                      </span>
                    } @else if (t.note.status === 'READY_FOR_REVIEW') {
                      <span class="panel-status-badge review">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                        For Review
                      </span>
                    } @else {
                      <span class="panel-status-badge pending">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3" /></svg>
                        Pending
                      </span>
                    }
                    @if (t.note.aiScore != null) {
                      <span class="panel-score" [class.high]="t.note.aiScore >= 80" [class.medium]="t.note.aiScore >= 50 && t.note.aiScore < 80" [class.low]="t.note.aiScore < 50">{{ t.note.aiScore }}/100</span>
                    }
                  </div>

                  <!-- Title -->
                  <h3 class="panel-task-title">{{ t.note.title }}</h3>

                  <!-- Concept -->
                  @if (t.conceptName) {
                    <span class="panel-concept">
                      <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A2 2 0 013 12V7a4 4 0 014-4z" /></svg>
                      {{ t.conceptName }}
                    </span>
                  }

                  <!-- Lifecycle stepper -->
                  <div class="panel-stepper">
                    <span class="panel-step">
                      <span class="panel-step-dot done"></span>
                      <span class="panel-step-label done">Created</span>
                    </span>
                    <span class="panel-step-line" [class.done]="t.note.status === 'COMPLETED'"></span>
                    <span class="panel-step">
                      <span class="panel-step-dot" [class.done]="t.note.status === 'COMPLETED'"></span>
                      <span class="panel-step-label" [class.done]="t.note.status === 'COMPLETED'">Executing</span>
                    </span>
                    <span class="panel-step-line" [class.done]="t.note.userReport !== null"></span>
                    <span class="panel-step">
                      <span class="panel-step-dot" [class.active]="t.note.status === 'COMPLETED' && !t.note.aiScore" [class.done]="t.note.aiScore !== null && t.note.aiScore !== undefined"></span>
                      <span class="panel-step-label" [class.active]="t.note.status === 'COMPLETED' && !t.note.aiScore" [class.done]="t.note.aiScore !== null && t.note.aiScore !== undefined">Review</span>
                    </span>
                    <span class="panel-step-line" [class.done]="t.note.aiScore !== null && t.note.aiScore !== undefined"></span>
                    <span class="panel-step">
                      <span class="panel-step-dot" [class.done]="t.note.aiScore !== null && t.note.aiScore !== undefined"></span>
                      <span class="panel-step-label" [class.done]="t.note.aiScore !== null && t.note.aiScore !== undefined">Scored</span>
                    </span>
                  </div>

                  <!-- Description -->
                  @if (t.note.content) {
                    <div class="panel-section">
                      <div class="panel-section-label">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h7" /></svg>
                        Description
                      </div>
                      <div class="panel-description agent-result-content" [innerHTML]="t.note.content | markdown"></div>
                    </div>
                  }

                  <!-- Expected outcome -->
                  @if (t.note.expectedOutcome) {
                    <div class="panel-section">
                      <div class="panel-section-label">
                        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                        Expected Outcome
                      </div>
                      <div class="panel-expected agent-result-content" [innerHTML]="t.note.expectedOutcome | markdown"></div>
                    </div>
                  }

                  <!-- Agent jobs -->
                  @if (t.agentJobs && t.agentJobs.length > 0) {
                    <div class="panel-jobs">
                      <div class="panel-jobs-header">
                        <span class="panel-jobs-title">Agent pipeline</span>
                        <span class="panel-jobs-count">{{ getCompletedJobCount(t.agentJobs) }}/{{ t.agentJobs.length }}</span>
                      </div>
                      @for (job of t.agentJobs; track job.id) {
                        <div class="panel-job-row">
                          <span class="panel-job-dot" [class]="job.status.toLowerCase()"></span>
                          <span class="panel-job-name">{{ formatAgentType(job.agentType) }}</span>
                          <span class="panel-job-status" [class]="job.status.toLowerCase()">{{ getJobStatusLabel(job.status) }}</span>
                        </div>
                      }
                    </div>
                  }

                  <!-- Job execution panel -->
                  <div class="panel-section">
                    <app-job-panel [note]="t.note" (noteUpdated)="onPanelNoteUpdated()"></app-job-panel>
                  </div>

                  <!-- Meta -->
                  <div class="panel-meta">
                    <span>{{ t.note.source }}</span>
                    @if (t.conversationId) {
                      <a class="panel-chat-link" [routerLink]="['/chat', t.conversationId]">Pogledaj u razgovoru</a>
                    }
                  </div>
                }

                @if (execPanel.activityFeed().length === 0 && !execPanel.activeTask()) {
                  <!-- Empty state -->
                  <div class="panel-empty">
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    <h4>No activity</h4>
                    <p>Start a task or conversation to see execution status here.</p>
                  </div>
                }
              </div>
          </aside>
        </main>
      </div>
    </div>
    <app-toast-container />
    @if (showGraphPopup()) {
      <app-graph-popup
        (closed)="showGraphPopup.set(false)"
        (noteActivated)="onGraphNoteActivated($event)">
      </app-graph-popup>
    }
  `,
})
export class AppShellComponent {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly sanitizer = inject(DomSanitizer);
  readonly execPanel = inject(ExecutionPanelService);
  private readonly notesApi = inject(NotesApiService);
  private readonly wsService = inject(ChatWebsocketService);
  readonly pageLoading = inject(PageLoadingService);

  /** Cache for sanitized SVG icons */
  private readonly iconCache = new Map<string, SafeHtml>();

  readonly dropdownOpen = signal(false);
  readonly routeLoading = signal(false);

  /** Navigation badge counters — show unread/new items since last page visit */
  readonly chatBadge = signal(0);
  readonly taskBadge = signal(0);
  readonly processBadge = signal(0);
  readonly showGraph = signal(true);
  readonly showGraphPopup = signal(false);
  readonly panelWidth = signal(parseInt(localStorage.getItem('execPanelWidth') ?? '420', 10));
  readonly graphHeight = signal(parseInt(localStorage.getItem('graphHeight') ?? '280', 10));
  isResizingPanel = false;
  isResizingGraph = false;
  private resizeStartX = 0;
  private resizeStartWidth = 0;

  /** Map of context keys (taskId, batchId, etc.) → activity entry IDs */
  private readonly entryMap = new Map<string, string>();

  /** Set of entry IDs that the user has explicitly toggled (overrides auto-expand/collapse) */
  private readonly expandedOverrides = new Map<string, boolean>();

  @ViewChild('panelBody') private panelBody?: ElementRef<HTMLDivElement>;

  /** WebSocket connection state for panel indicator */
  readonly wsState = computed(() => this.wsService.connectionState$());

  /** Count of currently running activity entries */
  readonly runningCount = computed(() =>
    this.execPanel.activityFeed().filter((e) => e.status === 'running').length
  );

  readonly userInitials = computed(() => {
    const user = this.authService.currentUser();
    if (!user) return '?';
    const email = user.email || '';
    return email[0]?.toUpperCase() || '?';
  });

  readonly isOwner = computed(() => {
    const user = this.authService.currentUser();
    return user?.role === 'TENANT_OWNER';
  });

  readonly isOwnerOrAdmin = computed(() => {
    const user = this.authService.currentUser();
    return user?.role === 'TENANT_OWNER' || user?.role === 'ADMIN';
  });

  readonly isPlatformOwner = computed(() => {
    const user = this.authService.currentUser();
    return user?.role === 'PLATFORM_OWNER';
  });

  constructor() {
    this.router.events.subscribe((event) => {
      if (event instanceof NavigationStart) {
        this.routeLoading.set(true);
      } else if (
        event instanceof NavigationEnd ||
        event instanceof NavigationCancel ||
        event instanceof NavigationError
      ) {
        this.routeLoading.set(false);
        // Architecture: force-reset the global page loading indicator on
        // every navigation. This guarantees no leaked start() from a
        // component that got unmounted mid-load can leave the spinner
        // stuck on forever. Each new page starts with a clean slate.
        this.pageLoading.reset();
      }
    });

    // Connect WebSocket globally so events are captured on ALL pages
    this.wsService.connect();
    this.setupActivityFeedSubscriptions();

    // Show connection status in the activity feed
    this.wsService.waitForConnection(15000).then(() => {
      this.execPanel.addEntry('system', 'System connected — tracking active', 'completed');
    }).catch(() => {
      this.execPanel.addEntry('system', 'WebSocket connection failed', 'error', 'Refresh the page to retry.');
    });
  }

  toggleDropdown(): void {
    this.dropdownOpen.update((v) => !v);
  }

  logout(): void {
    this.dropdownOpen.set(false);
    this.authService.logout();
  }

  getCompletedJobCount(jobs: { status: string }[]): number {
    return jobs.filter((j) => j.status === 'COMPLETED').length;
  }

  formatAgentType(agentType: string): string {
    return agentType.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  getJobStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      PLANNED: 'Planned',
      RUNNING: 'Running',
      COMPLETED: 'Completed',
      FAILED: 'Error',
    };
    return labels[status] ?? status;
  }

  async onPanelNoteUpdated(): Promise<void> {
    const task = this.execPanel.activeTask();
    if (!task) return;
    try {
      const updated = await this.notesApi.getById(task.note.id);
      this.execPanel.updateTask({ ...task, note: updated });
    } catch {
      // Silently ignore — panel stays with stale data
    }
  }

  onPanelResizeStart(event: MouseEvent): void {
    event.preventDefault();
    this.isResizingPanel = true;
    this.resizeStartX = event.clientX;
    this.resizeStartWidth = this.panelWidth();

    const onMove = (e: MouseEvent) => {
      const delta = this.resizeStartX - e.clientX; // dragging left = wider
      const screenWidth = window.innerWidth;
      const maxPanel = Math.min(screenWidth * 0.55, 1200); // up to 55% of screen
      const newWidth = Math.max(280, Math.min(maxPanel, this.resizeStartWidth + delta));
      this.panelWidth.set(newWidth);
    };

    const onUp = () => {
      this.isResizingPanel = false;
      localStorage.setItem('execPanelWidth', String(this.panelWidth()));
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  onGraphResizeStart(event: MouseEvent): void {
    event.preventDefault();
    this.isResizingGraph = true;
    const startY = event.clientY;
    const startH = this.graphHeight();

    let lastGraphUpdate = 0;
    const onMove = (e: MouseEvent) => {
      const now = Date.now();
      if (now - lastGraphUpdate < 16) return; // Throttle to ~60fps
      lastGraphUpdate = now;
      const delta = e.clientY - startY;
      this.graphHeight.set(Math.max(120, Math.min(800, startH + delta)));
    };
    const onUp = () => {
      this.isResizingGraph = false;
      localStorage.setItem('graphHeight', String(this.graphHeight()));
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  onGraphNoteActivated(event: { noteId: string; conceptId: string }): void {
    // Navigate to chat with this concept as context
    this.router.navigate(['/chat'], { queryParams: { concept: event.conceptId } });
    this.showGraphPopup.set(false);
  }

  formatRelativeTime(date: Date): string {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 5) return 'sada';
    if (seconds < 60) return `${seconds}s`;
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m`;
    return `${Math.floor(minutes / 60)}h`;
  }

  /** Truncate stream content to last ~3000 chars for rendering performance */
  streamTail(content: string): string {
    if (!content || content.length <= 3000) return content;
    // Find a newline near the truncation point to avoid breaking mid-word
    const start = content.indexOf('\n', content.length - 3000);
    return start > 0 ? '…\n' + content.slice(start + 1) : content.slice(-3000);
  }

  /** Check if entry type should use inline (no-box) stream rendering */
  isInlineStreamEntry(type: string): boolean {
    return type === 'agent-text' || type === 'agent-formatting';
  }

  /** Scroll the panel to top (where newest entries are) */
  private scrollPanelToTop(): void {
    if (this.panelBody?.nativeElement) {
      this.panelBody.nativeElement.scrollTop = 0;
    }
  }

  /** Check if an entry should be expanded */
  isEntryExpanded(id: string, status: string): boolean {
    const override = this.expandedOverrides.get(id);
    if (override !== undefined) return override;
    // Running entries auto-expand, others auto-collapse
    return status === 'running';
  }

  /** Toggle entry expand/collapse */
  toggleEntryExpand(id: string, status: string): void {
    const current = this.isEntryExpanded(id, status);
    this.expandedOverrides.set(id, !current);
  }

  /** SVG icons for each entry type — clean monochrome line icons */
  getEntryIconSvg(type: string): SafeHtml {
    const cached = this.iconCache.get(type);
    if (cached) return cached;
    const icons: Record<string, string> = {
      'chat': '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>',
      'research': '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>',
      'task-ai': '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>',
      'task-result': '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>',
      'task-workflow': '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" /></svg>',
      'task-step': '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>',
      'scoring': '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" /></svg>',
      'workflow': '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>',
      'workflow-msg': '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>',
      'workflow-input': '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>',
      'discovery': '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>',
      'batch': '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>',
      'batch-task': '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" /></svg>',
      'auto-popuni': '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" /></svg>',
      'auto-popuni-error': '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>',
      'agent-job': '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>',
      'jobs': '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" /></svg>',
      'tasks-created': '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 9v3m0 0v3m0-3h3m-3 0H9m12 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>',
      'yolo': '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>',
      'system': '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" /></svg>',
      'error': '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>',
      'reconnect': '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>',
      'replay': '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M12.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0019 16V8a1 1 0 00-1.6-.8l-5.333 4zM4.066 11.2a1 1 0 000 1.6l5.334 4A1 1 0 0011 16V8a1 1 0 00-1.6-.8l-5.334 4z" /></svg>',
      'agent-exec': '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>',
      'agent-formatting': '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>',
      'agent-text': '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>',
      'agent-tool': '<svg viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>',
    };
    const svg = icons[type] ?? '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" fill="currentColor" stroke="none" /></svg>';
    const safe = this.sanitizer.bypassSecurityTrustHtml(svg);
    this.iconCache.set(type, safe);
    return safe;
  }

  private setupActivityFeedSubscriptions(): void {
    const panel = this.execPanel;

    // ── Chat AI Responses ──
    this.wsService.onResearchPhase((data) => {
      if (data.phase === 'researching') {
        const id = panel.addEntry('research', 'Researching context...', 'running');
        this.entryMap.set('research-phase', id);
      } else {
        const eid = this.entryMap.get('research-phase');
        if (eid) {
          panel.completeEntry(eid, 'Research completed');
          this.entryMap.delete('research-phase');
        }
      }
    });

    this.wsService.onMessageChunk((data) => {
      let eid = this.entryMap.get('chat-response');
      if (!eid) {
        eid = panel.addEntry('chat', 'AI response...', 'running');
        this.entryMap.set('chat-response', eid);
      }
      panel.appendToEntryStream(eid, data.content);
    });

    this.wsService.onComplete(() => {
      const eid = this.entryMap.get('chat-response');
      if (eid) {
        panel.completeEntry(eid, 'Response completed');
        this.entryMap.delete('chat-response');
      }
      // Increment chat badge if user is NOT on chat page
      if (!this.router.url.startsWith('/chat')) {
        this.chatBadge.update(n => n + 1);
      }
    });

    this.wsService.onError((err) => {
      const eid = this.entryMap.get('chat-response');
      if (eid) {
        panel.failEntry(eid, err.message || 'Error');
        this.entryMap.delete('chat-response');
      } else {
        panel.addEntry('error', 'Error', 'error', err.message);
      }
    });

    // ── Task AI Execution (Popuni) ──
    this.wsService.onTaskAiStart((data) => {
      const id = panel.addEntry('task-ai', 'Generating task content...', 'running');
      this.entryMap.set(`task-ai-${data.taskId}`, id);
    });

    this.wsService.onTaskAiChunk((data) => {
      const eid = this.entryMap.get(`task-ai-${data.taskId}`);
      if (eid) panel.appendToEntryStream(eid, data.content);
    });

    this.wsService.onTaskAiComplete((data) => {
      const eid = this.entryMap.get(`task-ai-${data.taskId}`);
      if (eid) {
        panel.completeEntry(eid, 'Content generated');
        this.entryMap.delete(`task-ai-${data.taskId}`);
      }
    });

    this.wsService.onTaskAiError((data) => {
      const eid = this.entryMap.get(`task-ai-${data.taskId}`);
      if (eid) {
        panel.failEntry(eid, data.message);
        this.entryMap.delete(`task-ai-${data.taskId}`);
      }
    });

    // ── Task Result Submission ──
    this.wsService.onTaskResultStart((data) => {
      const id = panel.addEntry('task-result', 'Evaluating results...', 'running');
      this.entryMap.set(`task-result-${data.taskId}`, id);
    });

    this.wsService.onTaskResultChunk((data) => {
      const eid = this.entryMap.get(`task-result-${data.taskId}`);
      if (eid) panel.appendToEntryStream(eid, data.content);
    });

    this.wsService.onTaskResultComplete((data) => {
      const eid = this.entryMap.get(`task-result-${data.taskId}`);
      if (eid) {
        const scoreText = data.score != null ? `Score: ${data.score}/100` : 'Completed';
        panel.completeEntry(eid, scoreText);
        this.entryMap.delete(`task-result-${data.taskId}`);
      }
      // Also complete any scoring entry for this task
      const scoringEid = this.entryMap.get(`scoring-${data.taskId}`);
      if (scoringEid) {
        const scoreDetail = data.score != null ? `Score: ${data.score}/100` : 'Scoring completed';
        panel.completeEntry(scoringEid, scoreDetail);
        this.entryMap.delete(`scoring-${data.taskId}`);
      }
    });

    this.wsService.onTaskResultError((data) => {
      const eid = this.entryMap.get(`task-result-${data.taskId}`);
      if (eid) {
        panel.failEntry(eid, data.message);
        this.entryMap.delete(`task-result-${data.taskId}`);
      }
    });

    // ── Workflow Steps ──
    this.wsService.onStepProgress((data) => {
      const key = `workflow-step-${data.stepIndex ?? 0}`;
      const eid = this.entryMap.get(key);
      const title = `Step ${(data.stepIndex ?? 0) + 1}: ${data.stepTitle || 'In progress...'}`;
      if (eid) {
        const patch: { title: string; detail: string; status?: 'running' | 'completed' | 'error' | 'info' } = { title, detail: data.status };
        if (data.status === 'completed') patch.status = 'completed';
        if (data.status === 'failed') patch.status = 'error';
        panel.updateEntry(eid, patch);
        // Stream step content if available
        if (data.content) panel.appendToEntryStream(eid, data.content);
      } else {
        const id = panel.addEntry('workflow', title, 'running', data.status);
        this.entryMap.set(key, id);
      }
    });

    this.wsService.onWorkflowComplete(() => {
      panel.addEntry('workflow', 'Workflow completed', 'completed');
      for (const [key] of this.entryMap) {
        if (key.startsWith('workflow-step-')) this.entryMap.delete(key);
      }
    });

    this.wsService.onWorkflowError((data) => {
      panel.addEntry('workflow', 'Workflow error', 'error', data.message);
    });

    // ── Discovery ──
    this.wsService.onDiscoveryChunk((data) => {
      let eid = this.entryMap.get('discovery');
      if (!eid) {
        eid = panel.addEntry('discovery', 'Discovering tasks...', 'running');
        this.entryMap.set('discovery', eid);
      }
      panel.appendToEntryStream(eid, data.chunk);
    });

    this.wsService.onDiscoveryComplete(() => {
      const eid = this.entryMap.get('discovery');
      if (eid) {
        panel.completeEntry(eid, 'Discovery completed');
        this.entryMap.delete('discovery');
      }
    });

    this.wsService.onDiscoveryError((data) => {
      const eid = this.entryMap.get('discovery');
      if (eid) {
        panel.failEntry(eid, data.message);
        this.entryMap.delete('discovery');
      }
    });

    // ── Parallel Popuni (batch execution) ──
    this.wsService.onParallelPopuniStart((data) => {
      const id = panel.addEntry('batch', `Parallel execution: ${data.tasks.length} tasks`, 'running');
      this.entryMap.set(`batch-${data.batchId}`, id);
    });

    this.wsService.onParallelPopuniProgress((data) => {
      const eid = this.entryMap.get(`batch-${data.batchId}`);
      if (eid) {
        panel.updateEntry(eid, {
          detail: `${data.stepLabel || data.status} (step ${data.currentStep ?? '?'}/${data.totalSteps ?? '?'})`,
        });
      }
    });

    this.wsService.onParallelPopuniTaskDone((data) => {
      const detail = data.status === 'completed'
        ? (data.score != null ? `Score: ${data.score}/100` : 'Completed')
        : (data.error || 'Error');
      panel.addEntry(
        'batch-task',
        data.status === 'completed' ? 'Task completed' : 'Task failed',
        data.status === 'completed' ? 'completed' : 'error',
        detail
      );
    });

    this.wsService.onParallelPopuniBatchDone((data) => {
      const eid = this.entryMap.get(`batch-${data.batchId}`);
      if (eid) {
        panel.completeEntry(eid, `Completed: ${data.completedCount}, errors: ${data.failedCount}`);
        this.entryMap.delete(`batch-${data.batchId}`);
      }
    });

    // ── Auto Popuni ──
    this.wsService.onAutoPopuniStart((data) => {
      const id = panel.addEntry('auto-popuni', `Auto-fill: ${data.taskCount} tasks`, 'running');
      this.entryMap.set('auto-popuni', id);
    });

    this.wsService.onAutoPopuniComplete((data) => {
      const eid = this.entryMap.get('auto-popuni');
      if (eid) {
        panel.completeEntry(eid, `Completed: ${data.completedTasks}/${data.totalTasks}`);
        this.entryMap.delete('auto-popuni');
      }
    });

    this.wsService.onAutoPopuniTaskError((data) => {
      panel.addEntry('auto-popuni-error', 'Task error', 'error', data.message);
    });

    // ── Jobs Planned ──
    this.wsService.onJobsPlanned((data) => {
      panel.addEntry('jobs', `Planned: ${data.jobs.length} agents`, 'info',
        data.jobs.map((j) => j.agentType.replace(/_/g, ' ')).join(', '));
    });

    // ── Tasks Created for Execution ──
    this.wsService.onTasksCreatedForExecution((data) => {
      panel.addEntry('tasks-created', `Created ${data.taskIds.length} tasks for execution`, 'info');
    });

    // ── Task AI Workflow (auto-popuni per-step progress) ──
    this.wsService.onTaskAiWorkflowStart((data) => {
      const id = panel.addEntry('task-workflow', 'Generating execution plan...', 'running', data.message);
      this.entryMap.set(`task-workflow-${data.taskId}`, id);
    });

    this.wsService.onTaskAiStepProgress((data) => {
      const key = `task-workflow-${data.taskId}`;
      const eid = this.entryMap.get(key);
      const detail = `Step ${data.stepIndex + 1}/${data.totalSteps}: ${data.stepTitle}`;
      if (eid) {
        panel.updateEntry(eid, { title: 'Executing plan...', detail });
      } else {
        const id = panel.addEntry('task-workflow', 'Executing plan...', 'running', detail);
        this.entryMap.set(key, id);
      }
    });

    this.wsService.onTaskAiStepComplete((data) => {
      const detail = `Step ${data.stepIndex + 1}/${data.totalSteps}: ${data.stepTitle} — completed`;
      panel.addEntry('task-step', detail, 'completed');
      // If this is the last step, complete the workflow entry
      if (data.stepIndex + 1 >= data.totalSteps) {
        const eid = this.entryMap.get(`task-workflow-${data.taskId}`);
        if (eid) {
          panel.completeEntry(eid, `All steps completed (${data.totalSteps})`);
          this.entryMap.delete(`task-workflow-${data.taskId}`);
        }
      }
    });

    // ── Scoring ──
    this.wsService.onTaskScoringStart((data) => {
      const id = panel.addEntry('scoring', 'Scoring task...', 'running');
      this.entryMap.set(`scoring-${data.taskId}`, id);
    });

    // ── YOLO Mode ──
    this.wsService.onYoloProgress((data) => {
      let eid = this.entryMap.get(`yolo-${data.planId}`);
      const detail = `${data.completed}/${data.total} completed, ${data.running} active`;
      if (!eid) {
        eid = panel.addEntry('yolo', 'YOLO execution...', 'running', detail);
        this.entryMap.set(`yolo-${data.planId}`, eid);
      } else {
        panel.updateEntry(eid, { detail });
      }
    });

    this.wsService.onYoloComplete((data) => {
      const eid = this.entryMap.get(`yolo-${data.planId}`);
      if (eid) {
        panel.completeEntry(eid, 'YOLO execution completed');
        this.entryMap.delete(`yolo-${data.planId}`);
      } else {
        panel.addEntry('yolo', 'YOLO execution completed', 'completed');
      }
    });

    // ── Workflow Plan Ready ──
    this.wsService.onPlanReady((data) => {
      panel.addEntry('workflow', `Plan ready: ${data.plan.steps?.length ?? 0} steps`, 'info');
    });

    // ── Workflow Step Messages ──
    this.wsService.onStepMessage((data) => {
      panel.addEntry('workflow-msg', 'Step: message received', 'info', data.content?.substring(0, 100));
    });

    // ── Workflow Awaiting Input/Confirmation ──
    this.wsService.onStepAwaitingConfirmation(() => {
      panel.addEntry('workflow-input', 'Awaiting user confirmation...', 'running');
    });

    this.wsService.onStepAwaitingInput((data) => {
      panel.addEntry('workflow-input', `Awaiting input: ${data.stepTitle?.substring(0, 60) || 'user'}`, 'running');
    });

    // ── Tasks Discovered ──
    this.wsService.onTasksDiscovered((data) => {
      panel.addEntry('discovery', `Discovered ${data.conceptIds.length} new concepts`, 'info');
    });

    // ── Maturity Stage Init + Execution ──
    this.wsService.onInitProgress((data) => {
      const key = 'maturity-init';
      const eid = this.entryMap.get(key);
      const detail = `${data.persona} (${data.personaIndex + 1}/${data.totalPersonas})` +
        (data.assignedSoFar > 0 ? ` — ${data.assignedSoFar} assigned` : '');
      if (eid) {
        panel.updateEntry(eid, { detail });
      } else {
        const id = panel.addEntry('maturity', 'Initializing Maturity...', 'running', detail);
        this.entryMap.set(key, id);
      }
    });

    this.wsService.onStageInitialized((data) => {
      const eid = this.entryMap.get('maturity-init');
      if (eid) {
        panel.completeEntry(eid, `${data.assignmentCount} concepts, ${data.noteCount} tasks`);
        this.entryMap.delete('maturity-init');
      } else {
        panel.addEntry('maturity', `${data.stage} initialized`, 'completed',
          `${data.assignmentCount} concepts, ${data.noteCount} tasks`);
      }
    });

    this.wsService.onExecutionStarted(() => {
      const id = panel.addEntry('maturity', 'Executing tasks...', 'running');
      this.entryMap.set('maturity-exec', id);
    });

    this.wsService.onExecutionProgress((data) => {
      // Update overall progress entry
      const eid = this.entryMap.get('maturity-exec');
      if (eid) {
        const detail = `${data.executed}/${data.total} completed` +
          (data.failed > 0 ? `, ${data.failed} failed` : '') +
          (data.current ? ` — ${data.current.conceptName}` : '');
        panel.updateEntry(eid, { detail });
      }

      // Mark previous concept entry as completed
      const prevKey = this.entryMap.get('maturity-current-concept');
      if (prevKey && !data.current) {
        // No current concept = previous one just finished
        panel.completeEntry(prevKey);
        this.entryMap.delete('maturity-current-concept');
      }

      // Add new concept entry when a new concept starts
      if (data.current?.conceptName) {
        const conceptKey = `concept-${data.current.conceptId}`;
        if (!this.entryMap.has(conceptKey)) {
          // Complete the previous concept entry first
          const prevConceptKey = this.entryMap.get('maturity-current-concept');
          if (prevConceptKey) {
            panel.completeEntry(prevConceptKey);
          }
          const cid = panel.addEntry('concept-enrich', data.current.conceptName, 'running', 'Enriching...');
          this.entryMap.set(conceptKey, cid);
          this.entryMap.set('maturity-current-concept', cid);
        }
      }
    });

    this.wsService.onExecutionComplete((data) => {
      // Complete any remaining concept entry
      const lastConcept = this.entryMap.get('maturity-current-concept');
      if (lastConcept) {
        panel.completeEntry(lastConcept);
        this.entryMap.delete('maturity-current-concept');
      }

      const eid = this.entryMap.get('maturity-exec');
      if (eid) {
        const detail = `${data.executed}/${data.total} completed` +
          (data.failed > 0 ? `, ${data.failed} failed` : '');
        panel.completeEntry(eid, detail);
        this.entryMap.delete('maturity-exec');
      }
      // Increment task badge if user is NOT on tasks page
      if (!this.router.url.startsWith('/tasks')) {
        this.taskBadge.update(n => n + 1);
      }
    });

    // ── Execution Active State (reconnect resilience) ──
    this.wsService.onExecutionActiveState((data) => {
      if (data.active.length > 0) {
        panel.addEntry('reconnect', `Active executions: ${data.active.length}`, 'info',
          data.active.map((a) => a.type).join(', '));
      }
    });

    // ── Execution Replay Complete ──
    this.wsService.onExecutionReplayComplete((data) => {
      panel.addEntry('replay', `Replay completed: ${data.eventCount} events`, 'info');
    });

    // ── Agent Execution Streaming (Claude-style multi-entry flow) ──
    // Parent entry → formatting sub-entry → tool sub-entries → text sub-entry → completion

    this.wsService.onAgentStatusChange((data) => {
      const key = `agent-exec-${data.executionId}`;
      if (data.status === 'COMPLETED' || data.status === 'FAILED') return;
      const eid = this.entryMap.get(key);
      if (eid) {
        panel.updateEntry(eid, { title: data.label });
      } else {
        const id = panel.addEntry('agent-exec', data.label, 'running');
        this.entryMap.set(key, id);
      }
    });

    this.wsService.onAgentFormattingChunk((data) => {
      const parentId = this.entryMap.get(`agent-exec-${data.executionId}`);
      if (!parentId) return;
      const fmtKey = `agent-fmt-${data.executionId}`;
      let fmtEntryId = this.entryMap.get(fmtKey);
      if (!fmtEntryId) {
        fmtEntryId = panel.addEntryAfter(parentId, 'agent-formatting', 'Preparing instructions...', 'running', undefined, parentId);
        this.entryMap.set(fmtKey, fmtEntryId);
      }
      panel.appendToEntryStream(fmtEntryId, data.chunk);
    });

    this.wsService.onAgentFormattingComplete((data) => {
      const fmtKey = `agent-fmt-${data.executionId}`;
      const fmtEntryId = this.entryMap.get(fmtKey);
      if (fmtEntryId) {
        panel.completeEntry(fmtEntryId, `Instructions prepared (${data.promptLength} chars)`);
        this.entryMap.delete(fmtKey);
      }
    });

    this.wsService.onAgentHeartbeat((data) => {
      const eid = this.entryMap.get(`agent-exec-${data.executionId}`);
      if (eid) {
        const sec = Math.floor(data.elapsedMs / 1000);
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        panel.updateEntry(eid, {
          detail: `Agent researching... (${m > 0 ? m + 'm ' : ''}${s}s)`,
        });
      }
    });

    this.wsService.onAgentTextChunk((data) => {
      const parentId = this.entryMap.get(`agent-exec-${data.executionId}`);
      if (!parentId) return;
      const textKey = `agent-text-${data.executionId}`;
      let textEntryId = this.entryMap.get(textKey);
      if (!textEntryId) {
        textEntryId = panel.addEntryAfter(parentId, 'agent-text', 'Writing response...', 'running', undefined, parentId);
        this.entryMap.set(textKey, textEntryId);
        panel.updateEntry(parentId, { detail: 'Agent writing...' });
        this.scrollPanelToTop();
      }
      panel.appendToEntryStream(textEntryId, data.text);
    });

    this.wsService.onAgentToolEvent((data) => {
      const parentId = this.entryMap.get(`agent-exec-${data.executionId}`);
      if (!parentId) return;
      const toolLabels: Record<string, string> = {
        'web_search': 'Searching web',
        'web_fetch': 'Fetching page',
        'exec': 'Executing command',
        'browser': 'Browsing page',
      };
      const label = toolLabels[data.tool] || data.tool;
      const toolKey = `agent-tool-${data.executionId}-${data.tool}`;
      if (data.status === 'start') {
        const title = `${label}${data.query ? ': ' + data.query.substring(0, 60) : ''}`;
        const toolEntryId = panel.addEntryAfter(parentId, 'agent-tool', title, 'running', undefined, parentId);
        this.entryMap.set(toolKey, toolEntryId);
        this.scrollPanelToTop();
      } else if (data.status === 'end') {
        const toolEntryId = this.entryMap.get(toolKey);
        if (toolEntryId) {
          panel.completeEntry(toolEntryId);
          this.entryMap.delete(toolKey);
        }
      }
    });

    this.wsService.onAgentResult((data) => {
      const key = `agent-exec-${data.executionId}`;
      const parentId = this.entryMap.get(key);
      if (!parentId) return;
      const durationSec = Math.floor(data.durationMs / 1000);

      // Complete the text sub-entry
      const textKey = `agent-text-${data.executionId}`;
      const textEntryId = this.entryMap.get(textKey);
      if (textEntryId) {
        panel.completeEntry(textEntryId, `Completed in ${durationSec}s`);
        this.entryMap.delete(textKey);
      } else if (data.output) {
        // No text sub-entry was created — create one now with full output
        const finalId = panel.addEntryAfter(parentId, 'agent-text', 'Result', 'completed', `Completed in ${durationSec}s`, parentId);
        panel.updateEntry(finalId, { streamContent: data.output });
      }

      // Complete the parent entry
      panel.updateEntry(parentId, { status: 'completed', detail: `Agent completed in ${durationSec}s` });
      this.entryMap.delete(key);

      // Clean up any leftover tool entries
      for (const [k] of this.entryMap) {
        if (k.startsWith(`agent-tool-${data.executionId}-`)) {
          const toolEid = this.entryMap.get(k);
          if (toolEid) panel.completeEntry(toolEid);
          this.entryMap.delete(k);
        }
      }
    });

    this.wsService.onAgentError((data) => {
      const key = `agent-exec-${data.executionId}`;
      const parentId = this.entryMap.get(key);
      if (!parentId) return;

      panel.failEntry(parentId, data.error);
      panel.failSubEntries(parentId);

      // Clean up entryMap
      this.entryMap.delete(key);
      this.entryMap.delete(`agent-fmt-${data.executionId}`);
      this.entryMap.delete(`agent-text-${data.executionId}`);
      for (const [k] of this.entryMap) {
        if (k.startsWith(`agent-tool-${data.executionId}-`)) {
          this.entryMap.delete(k);
        }
      }
    });

    // ── Bridge Events (OpenClaw Brain) ──

    this.wsService.onBridgeAgentStatus((data) => {
      const agentLabel = (data.agent || 'director').replace(/_/g, ' ');
      const key = `bridge-agent-${data.taskId}-${data.agent}`;

      if (data.status === 'completed' || data.status === 'failed') {
        const eid = this.entryMap.get(key);
        if (eid) {
          if (data.status === 'completed') {
            panel.completeEntry(eid, data.message || 'Completed');
          } else {
            panel.failEntry(eid, data.message || 'Error');
          }
          this.entryMap.delete(key);
        }
      } else {
        const eid = this.entryMap.get(key);
        if (eid) {
          panel.updateEntry(eid, { detail: data.message || data.status });
        } else {
          const id = panel.addEntry('bridge-agent', `${agentLabel}: ${data.message || data.status}`, 'running');
          this.entryMap.set(key, id);
        }
      }
    });

    this.wsService.onBridgeTaskCreated(() => {
      panel.addEntry('bridge-task', 'New task created', 'info');
      // Show blue dot on Tasks nav so user knows a fresh task was created.
      if (!this.router.url.startsWith('/tasks')) {
        this.taskBadge.update((n) => n + 1);
      }
    });

    this.wsService.onBridgeTaskContribution((data) => {
      const key = `bridge-task-${data.noteId}`;
      const eid = this.entryMap.get(key);
      const agent = (data.agentType || '').replace(/_/g, ' ');
      if (eid) {
        panel.updateEntry(eid, { detail: `${agent} contributed` });
      } else {
        const id = panel.addEntry('bridge-contribution', `${agent}: task contribution`, 'running');
        this.entryMap.set(key, id);
      }
    });

    this.wsService.onBridgeTaskProgress((data) => {
      const key = `bridge-task-${data.noteId}`;
      const eid = this.entryMap.get(key);
      const detail = data.message || `${data.phase} ${data.percent}%`;
      if (eid) {
        panel.updateEntry(eid, { detail });
      } else {
        const id = panel.addEntry('bridge-progress', detail, 'running');
        this.entryMap.set(key, id);
      }
    });

    this.wsService.onBridgeTaskComplete((data) => {
      const key = `bridge-task-${data.noteId}`;
      const eid = this.entryMap.get(key);
      if (eid) {
        panel.completeEntry(eid, data.score ? `Score: ${data.score}` : 'Completed');
        this.entryMap.delete(key);
      } else {
        panel.addEntry('bridge-complete', 'Task completed', 'completed', data.score ? `Score: ${data.score}` : undefined);
      }
    });

    this.wsService.onProposalNew(() => {
      panel.addEntry('bridge-proposal', 'New AI proposal', 'info');
    });

    this.wsService.onProposalApproved(() => {
      panel.addEntry('bridge-proposal', 'Proposal approved — executing...', 'running');
    });

    // ── Process Workflow Engine activity ──
    const processRunEntries = new Map<string, string>();

    this.wsService.onProcessRunStarted((data) => {
      const id = panel.addEntry('process', `Process: ${data.workflowName}`, 'running', `${data.totalSteps} steps`);
      processRunEntries.set(`process-run-${data.runId}`, id);
    });

    this.wsService.onProcessStepStarted((data) => {
      const entryId = processRunEntries.get(`process-run-${data.runId}`);
      if (entryId) {
        panel.updateEntry(entryId, { detail: `Step ${data.stepOrder}/${data.totalSteps}: ${data.stepName}` });
      }
    });

    this.wsService.onProcessStepOutput((data) => {
      const entryId = processRunEntries.get(`process-run-${data.runId}`);
      if (entryId) {
        panel.updateEntry(entryId, { detail: `Step ${data.stepOrder}/${data.totalSteps}: ${data.stepName} ✓` });
      }
    });

    this.wsService.onProcessStepFailed((data) => {
      const entryId = processRunEntries.get(`process-run-${data.runId}`);
      if (entryId) {
        panel.updateEntry(entryId, { detail: `Step ${data.stepOrder} failed: ${data.error ?? ''}`, status: 'error' });
      }
    });

    this.wsService.onProcessComplete((data) => {
      const entryId = processRunEntries.get(`process-run-${data.runId}`);
      if (entryId) {
        panel.updateEntry(entryId, {
          detail: data.success ? 'Process completed successfully' : 'Process failed',
          status: data.success ? 'completed' : 'error',
        });
        processRunEntries.delete(`process-run-${data.runId}`);
      }
      // Increment process badge if user is NOT on processes page
      if (!this.router.url.startsWith('/process')) {
        this.processBadge.update(n => n + 1);
      }
    });

    this.wsService.onProcessApprovalNeeded((data) => {
      const entryId = processRunEntries.get(`process-run-${data.runId}`);
      if (entryId) {
        panel.updateEntry(entryId, { detail: `Awaiting approval: ${data.stepName}`, status: 'running' });
      }
    });

    this.wsService.onProcessCancelled((data) => {
      const entryId = processRunEntries.get(`process-run-${data.runId}`);
      if (entryId) {
        panel.updateEntry(entryId, { detail: 'Proces otkazan', status: 'error' });
        processRunEntries.delete(`process-run-${data.runId}`);
      }
    });
  }
}
