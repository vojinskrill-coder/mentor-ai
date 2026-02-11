import { Component, computed, input, output, HostBinding } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { Message, PersonaType, ConceptCitation, MemoryAttribution } from '@mentor-ai/shared/types';
import { ConfidenceLevel } from '@mentor-ai/shared/types';
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
  styles: [`
    :host { display: block; }
    .msg-user-row {
      display: flex;
      justify-content: flex-end;
    }
    .msg-user {
      max-width: 70%;
      background: #3B82F6;
      color: #FFFFFF;
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
      color: rgba(255,255,255,0.6);
      margin-top: 8px;
      text-align: right;
    }
    .ai-card {
      background: #1A1A1A;
      border-radius: 12px;
      border: 1px solid #2A2A2A;
      overflow: hidden;
    }
    .ai-header {
      padding: 12px 16px;
      border-bottom: 1px solid #2A2A2A;
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
    .confidence-badge svg { width: 14px; height: 14px; }
    .confidence-high { color: #22C55E; background: rgba(34,197,94,0.1); }
    .confidence-medium { color: #EAB308; background: rgba(234,179,8,0.1); }
    .confidence-low { color: #EF4444; background: rgba(239,68,68,0.1); }
    .ai-content {
      padding: 20px;
      font-size: 15px;
      line-height: 1.75;
      color: #E0E0E0;
      word-break: break-word;
    }

    /* ── Obsidian-style markdown rendering ── */

    .ai-content > :first-child { margin-top: 0 !important; }
    .ai-content > :last-child { margin-bottom: 0 !important; }

    /* Headings — clean, no underlines, generous spacing */
    .ai-content h1 {
      font-size: 1.6em;
      font-weight: 700;
      color: #FAFAFA;
      margin: 28px 0 12px;
      letter-spacing: -0.01em;
    }
    .ai-content h2 {
      font-size: 1.35em;
      font-weight: 600;
      color: #FAFAFA;
      margin: 24px 0 10px;
      letter-spacing: -0.01em;
    }
    .ai-content h3 {
      font-size: 1.15em;
      font-weight: 600;
      color: #FAFAFA;
      margin: 22px 0 8px;
    }
    .ai-content h4, .ai-content h5, .ai-content h6 {
      font-size: 1em;
      font-weight: 600;
      color: #E5E5E5;
      margin: 20px 0 6px;
    }

    /* Paragraphs — visible gap between each */
    .ai-content p {
      margin: 16px 0;
    }

    /* Bold & italic */
    .ai-content strong { color: #FAFAFA; font-weight: 600; }
    .ai-content em { color: #D4D4D4; font-style: italic; }

    /* Lists — clean Obsidian-style */
    .ai-content ul, .ai-content ol {
      margin: 16px 0;
      padding-left: 1.75em;
      list-style-position: outside;
    }
    .ai-content ul { list-style-type: disc; }
    .ai-content ol { list-style-type: decimal; }
    .ai-content li {
      margin: 0.4em 0;
      line-height: 1.75;
      color: #E0E0E0;
    }
    .ai-content li::marker {
      color: #8B8B8B;
    }
    .ai-content li > ul, .ai-content li > ol {
      margin: 0.3em 0;
    }
    .ai-content li > p {
      margin: 0.4em 0;
    }

    /* Nested list markers */
    .ai-content ul ul { list-style-type: circle; }
    .ai-content ul ul ul { list-style-type: square; }

    /* Tables — well separated */
    .ai-content table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
      font-size: 0.9em;
    }
    .ai-content thead th {
      background: #262626;
      color: #FAFAFA;
      font-weight: 600;
      text-align: left;
      padding: 10px 14px;
      border: 1px solid #333;
    }
    .ai-content tbody td {
      padding: 10px 14px;
      border: 1px solid #2A2A2A;
      color: #D4D4D4;
    }
    .ai-content tbody tr:nth-child(even) {
      background: #1A1A1A;
    }
    .ai-content tbody tr:nth-child(odd) {
      background: #0D0D0D;
    }
    .ai-content tbody tr:hover {
      background: #262626;
    }

    /* Inline code */
    .ai-content code {
      background: #262626;
      color: #E5E5E5;
      padding: 0.15em 0.4em;
      border-radius: 4px;
      font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
      font-size: 0.875em;
    }

    /* Code blocks — well separated */
    .ai-content pre {
      background: #0D0D0D;
      border: 1px solid #2A2A2A;
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
      border-left: 3px solid #3B82F6;
      margin: 20px 0;
      padding: 0.75em 1.25em;
      color: #A1A1A1;
      background: rgba(59, 130, 246, 0.05);
      border-radius: 0 6px 6px 0;
    }
    .ai-content blockquote p {
      margin: 0.4em 0;
    }

    /* Links */
    .ai-content a {
      color: #60A5FA;
      text-decoration: underline;
      text-underline-offset: 2px;
    }
    .ai-content a:hover {
      color: #93C5FD;
    }

    /* Horizontal rule — generous spacing */
    .ai-content hr {
      border: none;
      border-top: 1px solid #2A2A2A;
      margin: 24px 0;
    }

    /* Strikethrough */
    .ai-content del {
      color: #6B6B6B;
      text-decoration: line-through;
    }

    .ai-footer {
      padding: 12px 16px;
      border-top: 1px solid #2A2A2A;
    }
    .ai-time {
      font-size: 11px;
      color: #6B6B6B;
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
      color: #EAB308;
      flex-shrink: 0;
      margin-top: 2px;
    }
    .improvement-text {
      font-size: 13px;
      color: #A1A1A1;
      line-height: 1.5;
    }
    .improvement-label {
      color: #EAB308;
      font-weight: 500;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }
    .cursor-blink {
      display: inline-block;
      width: 6px;
      height: 20px;
      background: #3B82F6;
      border-radius: 2px;
      margin-left: 2px;
      animation: pulse 1s ease-in-out infinite;
      vertical-align: text-bottom;
    }
    .memory-section { margin-bottom: 12px; }
  `],
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
            <span class="persona-name" [style.color]="personaType() ? getPersonaColor() : '#FAFAFA'">
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
                  <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
                } @else if (confidenceLevel$() === 'MEDIUM') {
                  <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
                } @else {
                  <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
                }
              </svg>
              {{ (message().confidenceScore! * 100).toFixed(0) }}% confident
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

        <!-- Footer -->
        @if (!isStreaming()) {
          <div class="ai-footer">
            @if (showImprovementSuggestion$()) {
              <div class="improvement-row">
                <svg fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z"/>
                </svg>
                <p class="improvement-text">
                  <span class="improvement-label">To improve:</span>
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

  onCitationClick(citation: ConceptCitation | string): void {
    this.citationClick.emit(citation);
  }

  onAttributionClick(attribution: MemoryAttribution): void {
    this.attributionClick.emit(attribution);
  }

  onOutdatedClick(attribution: MemoryAttribution): void {
    this.outdatedClick.emit(attribution);
  }

  readonly previousScore = input<number | null>(null);
  readonly improvementDelta = input<string | null>(null);

  readonly hasConfidence$ = computed(() => {
    const score = this.message().confidenceScore;
    return score !== null && score !== undefined;
  });

  readonly hasMemoryAttributions$ = computed(() => {
    const attributions = this.message().memoryAttributions;
    return attributions !== null && attributions !== undefined && attributions.length > 0;
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
    return suggestion !== null && suggestion !== undefined &&
      (level === ConfidenceLevel.LOW || level === ConfidenceLevel.MEDIUM);
  });

  formatTime(dateStr: string): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  private readonly personaColors: Record<string, string> = {
    CFO: '#3B82F6', CMO: '#8B5CF6', CTO: '#10B981',
    OPERATIONS: '#F59E0B', LEGAL: '#EF4444', CREATIVE: '#EC4899',
  };

  private readonly personaLabels: Record<string, string> = {
    CFO: 'CFO', CMO: 'CMO', CTO: 'CTO',
    OPERATIONS: 'Operations', LEGAL: 'Legal', CREATIVE: 'Creative',
  };

  getPersonaColor(): string {
    const type = this.personaType();
    return type ? (this.personaColors[type] ?? '#3B82F6') : '#3B82F6';
  }

  getPersonaInitial(): string {
    const type = this.personaType();
    if (!type) return 'AI';
    return (this.personaLabels[type] ?? 'AI').charAt(0);
  }

  getPersonaLabel(): string {
    const type = this.personaType();
    return type ? (this.personaLabels[type] ?? 'AI Assistant') : 'AI Assistant';
  }
}
