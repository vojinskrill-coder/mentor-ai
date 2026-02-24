import { Component, computed, input, output, signal, HostBinding } from '@angular/core';
import { CommonModule } from '@angular/common';
import type {
  Message,
  PersonaType,
  ConceptCitation,
  MemoryAttribution,
  SuggestedAction,
} from '@mentor-ai/shared/types';
import {
  ConfidenceLevel,
  PERSONA_COLORS,
  PERSONA_NAMES,
  PersonaType as PersonaTypeEnum,
} from '@mentor-ai/shared/types';
import { ConceptCitationComponent } from './concept-citation/concept-citation.component';
import { MemoryAttributionComponent } from './memory-attribution/memory-attribution.component';

/**
 * Component for displaying a single chat message.
 * Supports both user and assistant messages with different styling.
 */
@Component({
  selector: 'app-chat-message',
  standalone: true,
  imports: [CommonModule, ConceptCitationComponent, MemoryAttributionComponent],
  styles: [
    `
      :host {
        display: block;
      }
      .msg-user-row {
        display: flex;
        justify-content: flex-end;
      }
      .msg-user {
        max-width: 70%;
        background: #3b82f6;
        color: #ffffff;
        border-radius: 16px 16px 4px 16px;
        padding: 12px 16px;
      }
      .msg-user-text {
        font-size: 15px;
        line-height: 1.6;
        white-space: pre-wrap;
        word-break: break-word;
      }
      .msg-user-time {
        font-size: 11px;
        color: rgba(255, 255, 255, 0.6);
        margin-top: 8px;
        text-align: right;
      }
      .ai-card {
        background: #1a1a1a;
        border-radius: 12px;
        border: 1px solid #2a2a2a;
        overflow: hidden;
      }
      .ai-header {
        padding: 12px 16px;
        border-bottom: 1px solid #2a2a2a;
        display: flex;
        align-items: center;
        justify-content: space-between;
      }
      .ai-header-left {
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .persona-avatar {
        width: 32px;
        height: 32px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 13px;
        font-weight: 600;
      }
      .persona-name {
        font-size: 13px;
        font-weight: 500;
      }
      .confidence-badge {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        border-radius: 20px;
        font-size: 11px;
        font-weight: 500;
      }
      .confidence-badge svg {
        width: 14px;
        height: 14px;
      }
      .confidence-high {
        color: #22c55e;
        background: rgba(34, 197, 94, 0.1);
      }
      .confidence-medium {
        color: #eab308;
        background: rgba(234, 179, 8, 0.1);
      }
      .confidence-low {
        color: #ef4444;
        background: rgba(239, 68, 68, 0.1);
      }
      .ai-content {
        padding: 20px;
        font-size: 15px;
        line-height: 1.75;
        color: #e0e0e0;
        word-break: break-word;
      }

      /* ── Obsidian-style markdown rendering ── */

      .ai-content > :first-child {
        margin-top: 0 !important;
      }
      .ai-content > :last-child {
        margin-bottom: 0 !important;
      }

      /* Headings — clean, no underlines, generous spacing */
      .ai-content h1 {
        font-size: 1.6em;
        font-weight: 700;
        color: #fafafa;
        margin: 28px 0 12px;
        letter-spacing: -0.01em;
      }
      .ai-content h2 {
        font-size: 1.35em;
        font-weight: 600;
        color: #fafafa;
        margin: 24px 0 10px;
        letter-spacing: -0.01em;
      }
      .ai-content h3 {
        font-size: 1.15em;
        font-weight: 600;
        color: #fafafa;
        margin: 22px 0 8px;
      }
      .ai-content h4,
      .ai-content h5,
      .ai-content h6 {
        font-size: 1em;
        font-weight: 600;
        color: #e5e5e5;
        margin: 20px 0 6px;
      }

      /* Paragraphs — visible gap between each */
      .ai-content p {
        margin: 16px 0;
      }

      /* Bold & italic */
      .ai-content strong {
        color: #fafafa;
        font-weight: 600;
      }
      .ai-content em {
        color: #d4d4d4;
        font-style: italic;
      }

      /* Lists — clean Obsidian-style */
      .ai-content ul,
      .ai-content ol {
        margin: 16px 0;
        padding-left: 1.75em;
        list-style-position: outside;
      }
      .ai-content ul {
        list-style-type: disc;
      }
      .ai-content ol {
        list-style-type: decimal;
      }
      .ai-content li {
        margin: 0.4em 0;
        line-height: 1.75;
        color: #e0e0e0;
      }
      .ai-content li::marker {
        color: #8b8b8b;
      }
      .ai-content li > ul,
      .ai-content li > ol {
        margin: 0.3em 0;
      }
      .ai-content li > p {
        margin: 0.4em 0;
      }

      /* Nested list markers */
      .ai-content ul ul {
        list-style-type: circle;
      }
      .ai-content ul ul ul {
        list-style-type: square;
      }

      /* Tables — well separated */
      .ai-content table {
        width: 100%;
        border-collapse: collapse;
        margin: 20px 0;
        font-size: 0.9em;
      }
      .ai-content thead th {
        background: #262626;
        color: #fafafa;
        font-weight: 600;
        text-align: left;
        padding: 10px 14px;
        border: 1px solid #333;
      }
      .ai-content tbody td {
        padding: 10px 14px;
        border: 1px solid #2a2a2a;
        color: #d4d4d4;
      }
      .ai-content tbody tr:nth-child(even) {
        background: #1a1a1a;
      }
      .ai-content tbody tr:nth-child(odd) {
        background: #0d0d0d;
      }
      .ai-content tbody tr:hover {
        background: #262626;
      }

      /* Inline code */
      .ai-content code {
        background: #262626;
        color: #e5e5e5;
        padding: 0.15em 0.4em;
        border-radius: 4px;
        font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
        font-size: 0.875em;
      }

      /* Code blocks — well separated */
      .ai-content pre {
        background: #0d0d0d;
        border: 1px solid #2a2a2a;
        border-radius: 8px;
        padding: 14px 18px;
        overflow-x: auto;
        margin: 20px 0;
      }
      .ai-content pre code {
        background: none;
        padding: 0;
        border-radius: 0;
        font-size: 0.85em;
        line-height: 1.5;
      }

      /* Blockquotes — well separated */
      .ai-content blockquote {
        border-left: 3px solid #3b82f6;
        margin: 20px 0;
        padding: 0.75em 1.25em;
        color: #a1a1a1;
        background: rgba(59, 130, 246, 0.05);
        border-radius: 0 6px 6px 0;
      }
      .ai-content blockquote p {
        margin: 0.4em 0;
      }

      /* Rich callout cards (D2) */
      .ai-content blockquote.callout {
        padding: 12px 16px;
        border-radius: 8px;
      }
      .ai-content blockquote.callout strong:first-child {
        display: block;
        margin-bottom: 4px;
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
      .ai-content .callout-insight {
        border-left-color: #3b82f6;
        background: rgba(59, 130, 246, 0.08);
      }
      .ai-content .callout-insight strong {
        color: #60a5fa;
      }
      .ai-content .callout-warning {
        border-left-color: #f59e0b;
        background: rgba(245, 158, 11, 0.08);
      }
      .ai-content .callout-warning strong {
        color: #fbbf24;
      }
      .ai-content .callout-metric {
        border-left-color: #10b981;
        background: rgba(16, 185, 129, 0.08);
      }
      .ai-content .callout-metric strong {
        color: #34d399;
      }
      .ai-content .callout-summary {
        border-left-color: #8b5cf6;
        background: rgba(139, 92, 246, 0.08);
      }
      .ai-content .callout-summary strong {
        color: #a78bfa;
      }

      /* Links */
      .ai-content a {
        color: #60a5fa;
        text-decoration: underline;
        text-underline-offset: 2px;
      }
      .ai-content a:hover {
        color: #93c5fd;
      }

      /* Horizontal rule — generous spacing */
      .ai-content hr {
        border: none;
        border-top: 1px solid #2a2a2a;
        margin: 24px 0;
      }

      /* Strikethrough */
      .ai-content del {
        color: #8b8b8b;
        text-decoration: line-through;
      }

      .ai-footer {
        padding: 12px 16px;
        border-top: 1px solid #2a2a2a;
      }
      .ai-time {
        font-size: 11px;
        color: #8b8b8b;
      }
      .improvement-row {
        display: flex;
        align-items: flex-start;
        gap: 8px;
        margin-bottom: 8px;
      }
      .improvement-row svg {
        width: 16px;
        height: 16px;
        color: #eab308;
        flex-shrink: 0;
        margin-top: 2px;
      }
      .improvement-text {
        font-size: 13px;
        color: #a1a1a1;
        line-height: 1.5;
      }
      .improvement-label {
        color: #eab308;
        font-weight: 500;
      }
      @keyframes pulse {
        0%,
        100% {
          opacity: 1;
        }
        50% {
          opacity: 0.5;
        }
      }
      .cursor-blink {
        display: inline-block;
        width: 6px;
        height: 20px;
        background: #3b82f6;
        border-radius: 2px;
        margin-left: 2px;
        animation: pulse 1s ease-in-out infinite;
        vertical-align: text-bottom;
      }
      .memory-section {
        margin-bottom: 12px;
      }
      .sources-section {
        padding: 12px 20px;
        border-top: 1px solid #2a2a2a;
        background: rgba(59, 130, 246, 0.03);
      }
      .sources-label {
        font-size: 11px;
        font-weight: 600;
        color: #60a5fa;
        text-transform: uppercase;
        margin-bottom: 10px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .sources-label svg {
        width: 14px;
        height: 14px;
      }
      .sources-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 8px;
      }
      .source-card {
        display: block;
        text-decoration: none;
        background: #0d0d0d;
        border: 1px solid #2a2a2a;
        border-radius: 8px;
        padding: 10px 12px;
        transition: all 0.15s;
      }
      .source-card:hover {
        border-color: #3b82f6;
        background: #1a1a1a;
      }
      .source-domain {
        font-size: 10px;
        color: #707070;
        margin-bottom: 4px;
        display: flex;
        align-items: center;
        gap: 4px;
      }
      .source-domain-icon {
        width: 12px;
        height: 12px;
        flex-shrink: 0;
      }
      .source-title {
        font-size: 12px;
        color: #a1a1a1;
        line-height: 1.4;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }

      /* Suggested action buttons (D1) */
      .actions-section {
        padding: 10px 20px 14px;
        border-top: 1px solid #2a2a2a;
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .actions-label {
        font-size: 10px;
        color: #707070;
        width: 100%;
        margin-bottom: 2px;
      }
      .action-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 6px 14px;
        background: #0d0d0d;
        border: 1px solid #2a2a2a;
        border-radius: 20px;
        font-size: 12px;
        font-weight: 500;
        color: #a1a1a1;
        cursor: pointer;
        font-family: inherit;
        transition: all 0.15s;
      }
      .action-pill:hover {
        background: #1a1a1a;
        border-color: #3b82f6;
        color: #fafafa;
      }
      .action-pill svg {
        width: 14px;
        height: 14px;
        flex-shrink: 0;
      }

      /* Inline chart (D5) */
      .chart-toggle-row {
        padding: 8px 16px;
        border-top: 1px solid #242424;
      }
      .chart-toggle-btn {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        padding: 4px 10px;
        border: 1px solid #2a2a2a;
        border-radius: 6px;
        background: transparent;
        color: #8b8b8b;
        font-size: 12px;
        cursor: pointer;
        transition: all 0.15s ease;
      }
      .chart-toggle-btn:hover {
        color: #fafafa;
        border-color: #3b82f6;
        background: rgba(59, 130, 246, 0.05);
      }
      .chart-toggle-btn svg {
        width: 14px;
        height: 14px;
      }
      .chart-container {
        padding: 16px;
        border-top: 1px solid #242424;
      }
      .chart-bar-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 6px;
      }
      .chart-bar-label {
        width: 100px;
        font-size: 11px;
        color: #8b8b8b;
        text-align: right;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex-shrink: 0;
      }
      .chart-bar-track {
        flex: 1;
        height: 20px;
        background: #242424;
        border-radius: 4px;
        overflow: hidden;
      }
      .chart-bar-fill {
        height: 100%;
        border-radius: 4px;
        transition: width 0.3s ease;
        min-width: 2px;
      }
      .chart-bar-value {
        width: 70px;
        font-size: 11px;
        color: #fafafa;
        font-weight: 500;
        flex-shrink: 0;
      }
    `,
  ],
  template: `
    <!-- User Message -->
    @if (message().role === 'USER') {
      <div class="msg-user-row">
        <div class="msg-user">
          <div class="msg-user-text">{{ message().content }}</div>
          @if (message().createdAt) {
            <p class="msg-user-time">{{ formatTime(message().createdAt) }}</p>
          }
        </div>
      </div>
    }

    <!-- AI Response Card -->
    @if (message().role === 'ASSISTANT') {
      <div class="ai-card">
        <!-- Header -->
        <div class="ai-header">
          <div class="ai-header-left">
            <div class="persona-avatar" [style.backgroundColor]="getPersonaColor()">
              {{ getPersonaInitial() }}
            </div>
            <span
              class="persona-name"
              [style.color]="personaType() ? getPersonaColor() : '#FAFAFA'"
            >
              {{ getPersonaLabel() }}
            </span>
          </div>

          @if (!isStreaming() && hasConfidence$()) {
            <div
              class="confidence-badge"
              [class.confidence-high]="confidenceLevel$() === 'HIGH'"
              [class.confidence-medium]="confidenceLevel$() === 'MEDIUM'"
              [class.confidence-low]="confidenceLevel$() === 'LOW'"
            >
              <svg fill="currentColor" viewBox="0 0 20 20">
                @if (confidenceLevel$() === 'HIGH') {
                  <path
                    fill-rule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clip-rule="evenodd"
                  />
                } @else if (confidenceLevel$() === 'MEDIUM') {
                  <path
                    fill-rule="evenodd"
                    d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                    clip-rule="evenodd"
                  />
                } @else {
                  <path
                    fill-rule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clip-rule="evenodd"
                  />
                }
              </svg>
              {{ (message().confidenceScore! * 100).toFixed(0) }}% pouzdanost
            </div>
          }
        </div>

        <!-- Content -->
        <div class="ai-content">
          @if (!isStreaming() && hasMemoryAttributions$()) {
            <div class="memory-section">
              <app-memory-attribution
                [attributions]="message().memoryAttributions ?? []"
                (attributionClick)="onAttributionClick($event)"
                (outdatedClick)="onOutdatedClick($event)"
              />
            </div>
          }

          <app-concept-citation
            [content]="message().content"
            [citations]="message().citations ?? []"
            (citationClick)="onCitationClick($event)"
          />
          @if (isStreaming()) {
            <span class="cursor-blink">&nbsp;</span>
          }
        </div>

        <!-- Web Search Sources (D3: rich cards) -->
        @if (!isStreaming() && hasWebSearchSources$()) {
          <div class="sources-section">
            <div class="sources-label">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9"
                />
              </svg>
              Web izvori
            </div>
            <div class="sources-grid">
              @for (source of message().webSearchSources ?? []; track $index) {
                <a
                  class="source-card"
                  [href]="source.link"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <div class="source-domain">
                    <svg
                      class="source-domain-icon"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                    {{ extractDomain(source.link) }}
                  </div>
                  <div class="source-title">{{ source.title }}</div>
                </a>
              }
            </div>
          </div>
        }

        <!-- Suggested Actions (D1) -->
        @if (!isStreaming() && hasSuggestedActions$()) {
          <div class="actions-section">
            <div class="actions-label">Preporučeni sledeći koraci</div>
            @for (action of message().suggestedActions ?? []; track $index) {
              <button class="action-pill" (click)="onActionClick(action)">
                @switch (action.icon) {
                  @case ('tasks') {
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                      />
                    </svg>
                  }
                  @case ('explore') {
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  }
                  @case ('arrow') {
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M13 7l5 5m0 0l-5 5m5-5H6"
                      />
                    </svg>
                  }
                  @case ('workflow') {
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                  }
                  @case ('search') {
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                      />
                    </svg>
                  }
                  @case ('score') {
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z"
                      />
                    </svg>
                  }
                  @case ('note') {
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                  }
                  @case ('web') {
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9"
                      />
                    </svg>
                  }
                  @default {
                    <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M13 10V3L4 14h7v7l9-11h-7z"
                      />
                    </svg>
                  }
                }
                {{ action.label }}
              </button>
            }
          </div>
        }

        <!-- Inline Chart (D5) -->
        @if (!isStreaming() && chartData$().length > 0) {
          <div class="chart-toggle-row">
            <button class="chart-toggle-btn" (click)="showChart$.set(!showChart$())">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                />
              </svg>
              {{ showChart$() ? 'Sakrij grafikon' : 'Prikaži grafikon' }}
            </button>
          </div>
          @if (showChart$()) {
            <div class="chart-container">
              @for (row of chartData$(); track $index) {
                <div class="chart-bar-row">
                  <span class="chart-bar-label" [title]="row.label">{{ row.label }}</span>
                  <div class="chart-bar-track">
                    <div
                      class="chart-bar-fill"
                      [style.width.%]="row.percent"
                      [style.backgroundColor]="chartColors[$index % chartColors.length]"
                    ></div>
                  </div>
                  <span class="chart-bar-value">{{ row.displayValue }}</span>
                </div>
              }
            </div>
          }
        }

        <!-- Footer -->
        @if (!isStreaming()) {
          <div class="ai-footer">
            @if (showImprovementSuggestion$()) {
              <div class="improvement-row">
                <svg fill="currentColor" viewBox="0 0 20 20">
                  <path
                    d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"
                  />
                </svg>
                <p class="improvement-text">
                  <span class="improvement-label">Za poboljšanje:</span>
                  {{ improvementSuggestion() }}
                </p>
              </div>
            }
            @if (message().createdAt) {
              <p class="ai-time">{{ formatTime(message().createdAt) }}</p>
            }
          </div>
        }
      </div>
    }
  `,
})
export class ChatMessageComponent {
  @HostBinding('attr.id') get hostId() {
    return `msg-${this.message().id}`;
  }

  readonly message = input.required<Message>();
  readonly isStreaming = input(false);
  readonly personaType = input<PersonaType | null>(null);
  readonly improvementSuggestion = input<string | null>(null);
  readonly citationClick = output<ConceptCitation | string>();
  readonly attributionClick = output<MemoryAttribution>();
  readonly outdatedClick = output<MemoryAttribution>();
  readonly actionClick = output<SuggestedAction>();

  onCitationClick(citation: ConceptCitation | string): void {
    this.citationClick.emit(citation);
  }

  onActionClick(action: SuggestedAction): void {
    this.actionClick.emit(action);
  }

  onAttributionClick(attribution: MemoryAttribution): void {
    this.attributionClick.emit(attribution);
  }

  onOutdatedClick(attribution: MemoryAttribution): void {
    this.outdatedClick.emit(attribution);
  }

  readonly previousScore = input<number | null>(null);
  readonly improvementDelta = input<string | null>(null);

  // Chart visualization (D5)
  readonly showChart$ = signal(false);
  readonly chartColors = [
    '#3B82F6',
    '#10B981',
    '#F59E0B',
    '#8B5CF6',
    '#EC4899',
    '#EF4444',
    '#06B6D4',
    '#84CC16',
  ];
  readonly chartData$ = computed(
    (): { label: string; value: number; percent: number; displayValue: string }[] => {
      const content = this.message().content;
      if (!content || this.message().role !== 'ASSISTANT') return [];
      // Detect markdown tables: | header | header |\n|---|---|\n| data | data |
      const tableMatch = content.match(/\|(.+)\|\r?\n\|[\s\-:|]+\|\r?\n((?:\|.+\|\r?\n?)+)/);
      if (!tableMatch || !tableMatch[1] || !tableMatch[2]) return [];
      const headerRow = tableMatch[1]
        .split('|')
        .map((h) => h.trim())
        .filter(Boolean);
      const dataRows = tableMatch[2]
        .trim()
        .split(/\r?\n/)
        .map((row) =>
          row
            .split('|')
            .map((c) => c.trim())
            .filter(Boolean)
        );
      if (headerRow.length < 2 || dataRows.length < 2) return [];
      // Find first numeric column (index >= 1)
      let numColIdx = -1;
      for (let col = 1; col < headerRow.length; col++) {
        const allNumeric = dataRows.every((row) => {
          const val = row[col]?.replace(/[€$%,.\s+↑↓KkMm]/g, '');
          return val && !isNaN(Number(val));
        });
        if (allNumeric) {
          numColIdx = col;
          break;
        }
      }
      if (numColIdx === -1) return [];
      const rows = dataRows
        .map((row) => {
          const rawVal = row[numColIdx]?.replace(/[€$%,.\s+↑↓KkMm]/g, '') ?? '0';
          return {
            label: row[0] ?? '',
            value: Math.abs(Number(rawVal) || 0),
            displayValue: row[numColIdx] ?? '',
          };
        })
        .filter((r) => r.label);
      const maxVal = Math.max(...rows.map((r) => r.value), 1);
      return rows.map((r) => ({ ...r, percent: (r.value / maxVal) * 100 }));
    }
  );

  readonly hasConfidence$ = computed(() => {
    const score = this.message().confidenceScore;
    return score !== null && score !== undefined;
  });

  readonly hasWebSearchSources$ = computed(() => {
    const sources = this.message().webSearchSources;
    return sources !== null && sources !== undefined && sources.length > 0;
  });

  readonly hasMemoryAttributions$ = computed(() => {
    const attributions = this.message().memoryAttributions;
    return attributions !== null && attributions !== undefined && attributions.length > 0;
  });

  readonly hasSuggestedActions$ = computed(() => {
    const actions = this.message().suggestedActions;
    return actions !== null && actions !== undefined && actions.length > 0;
  });

  readonly confidenceLevel$ = computed((): ConfidenceLevel => {
    const score = this.message().confidenceScore;
    if (score === null || score === undefined) return ConfidenceLevel.MEDIUM;
    if (score >= 0.85) return ConfidenceLevel.HIGH;
    if (score >= 0.5) return ConfidenceLevel.MEDIUM;
    return ConfidenceLevel.LOW;
  });

  readonly showImprovementSuggestion$ = computed(() => {
    const suggestion = this.improvementSuggestion();
    const level = this.confidenceLevel$();
    return (
      suggestion !== null &&
      suggestion !== undefined &&
      (level === ConfidenceLevel.LOW || level === ConfidenceLevel.MEDIUM)
    );
  });

  formatTime(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  extractDomain(url: string): string {
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return url;
    }
  }

  getPersonaColor(): string {
    const type = this.personaType();
    return type ? (PERSONA_COLORS[type as PersonaTypeEnum] ?? '#3B82F6') : '#3B82F6';
  }

  getPersonaInitial(): string {
    const type = this.personaType();
    if (!type) return 'AI';
    return (PERSONA_NAMES[type as PersonaTypeEnum] ?? 'AI').charAt(0);
  }

  getPersonaLabel(): string {
    const type = this.personaType();
    return type ? (PERSONA_NAMES[type as PersonaTypeEnum] ?? 'AI Asistent') : 'AI Asistent';
  }
}
