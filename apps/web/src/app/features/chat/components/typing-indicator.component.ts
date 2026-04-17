import { Component, computed, effect, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { PersonaType } from '@mentor-ai/shared/types';

/**
 * Typing indicator — shows the user the agent is doing something.
 *
 * Two animation layers:
 *   1. Three bouncing dots (constant) so there's always motion.
 *   2. Rotating Serbian status text that cycles every ~2.5 seconds so the
 *      user sees CHANGING words — "Čitam proposal..." → "Analiziram zahtev..."
 *      → "Pripremam plan..." — making it clear the agent is actively working.
 *
 * The message list is picked from `phase`:
 *   - thinking (default)      — generic chat messages
 *   - researching             — web search phase
 *   - generating              — final response writing
 *   - preparing-discussion    — bootstrap for a proposal discussion
 */
@Component({
  selector: 'app-typing-indicator',
  standalone: true,
  imports: [CommonModule],
  styles: [
    `
      .typing-card {
        background: #161B22;
        border-radius: 12px;
        border: 1px solid #21262D;
        overflow: hidden;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
      }
      .typing-header {
        padding: 14px 18px;
        display: flex;
        align-items: center;
        gap: 14px;
      }
      .typing-avatar {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-size: 13px;
        font-weight: 700;
        flex-shrink: 0;
        box-shadow: 0 0 0 0 rgba(88, 166, 255, 0.5);
        animation: avatar-pulse 2s ease-in-out infinite;
      }
      @keyframes avatar-pulse {
        0%, 100% { box-shadow: 0 0 0 0 rgba(88, 166, 255, 0.35); }
        50%      { box-shadow: 0 0 0 8px rgba(88, 166, 255, 0); }
      }
      .typing-body {
        display: flex;
        flex-direction: column;
        gap: 4px;
        min-width: 0;
        flex: 1;
      }
      .typing-name {
        font-size: 13px;
        font-weight: 600;
      }
      .typing-status-row {
        display: flex;
        align-items: center;
        gap: 10px;
        min-height: 20px;
      }
      .typing-dots {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        flex-shrink: 0;
      }
      .typing-dot {
        width: 6px;
        height: 6px;
        border-radius: 50%;
        animation: bounce 1s ease-in-out infinite;
      }
      .typing-dot:nth-child(2) { animation-delay: 150ms; }
      .typing-dot:nth-child(3) { animation-delay: 300ms; }
      @keyframes bounce {
        0%, 100% { transform: translateY(0); opacity: 0.6; }
        50%      { transform: translateY(-4px); opacity: 1; }
      }
      .typing-message {
        font-size: 12px;
        color: #9e9e9e;
        font-style: italic;
        overflow: hidden;
        white-space: nowrap;
        text-overflow: ellipsis;
        flex: 1;
        min-width: 0;
        /* Fade in/out as messages rotate */
        animation: message-fade 2.5s ease-in-out infinite;
      }
      @keyframes message-fade {
        0%   { opacity: 0; transform: translateY(4px); }
        15%  { opacity: 1; transform: translateY(0); }
        85%  { opacity: 1; transform: translateY(0); }
        100% { opacity: 0; transform: translateY(-4px); }
      }
    `,
  ],
  template: `
    <div class="typing-card">
      <div class="typing-header">
        <div class="typing-avatar" [style.backgroundColor]="getPersonaColor()">
          {{ getPersonaInitial() }}
        </div>
        <div class="typing-body">
          <span class="typing-name" [style.color]="getPersonaColor()">
            {{ getPersonaLabel() }}
          </span>
          <div class="typing-status-row">
            <span class="typing-dots">
              <span class="typing-dot" [style.backgroundColor]="getPersonaColor()"></span>
              <span class="typing-dot" [style.backgroundColor]="getPersonaColor()"></span>
              <span class="typing-dot" [style.backgroundColor]="getPersonaColor()"></span>
            </span>
            <!-- Keyed by currentMessage so Angular remounts on change and the
                 fade animation restarts — otherwise the CSS animation would
                 only play once on initial mount. -->
            @if (currentMessage(); as msg) {
              <span class="typing-message" [attr.data-msg]="msg">{{ msg }}</span>
            }
          </div>
        </div>
      </div>
    </div>
  `,
})
export class TypingIndicatorComponent {
  /** Optional persona type for personalized styling */
  readonly personaType = input<PersonaType | null>(null);

  /** Current phase drives which list of rotating messages we show */
  readonly phase = input<'thinking' | 'researching' | 'generating' | 'preparing-discussion'>(
    'thinking',
  );

  /** Index into the current phase's message list, bumped every 2.5s */
  private readonly messageIndex = signal(0);
  private rotationInterval: ReturnType<typeof setInterval> | null = null;

  /** Persona color mapping */
  private readonly personaColors: Record<string, string> = {
    CFO: '#58A6FF',
    CMO: '#8B5CF6',
    CTO: '#10B981',
    OPERATIONS: '#F59E0B',
    LEGAL: '#EF4444',
    CREATIVE: '#EC4899',
  };

  /** Persona label mapping */
  private readonly personaLabels: Record<string, string> = {
    CFO: 'CFO',
    CMO: 'CMO',
    CTO: 'CTO',
    OPERATIONS: 'Operations',
    LEGAL: 'Legal',
    CREATIVE: 'Creative',
  };

  /** Contextual rotating messages per phase */
  private readonly messagesByPhase: Record<string, string[]> = {
    'thinking': [
      'Thinking...',
      'Analyzing your message...',
      'Looking up relevant concepts...',
      'Formulating a response...',
      'Checking business context...',
      'Putting it all together...',
    ],
    'researching': [
      'Searching the web...',
      'Analyzing sources...',
      'Extracting key findings...',
      'Comparing across sources...',
      'Verifying facts...',
    ],
    'generating': [
      'Writing the response...',
      'Formatting content...',
      'Reviewing logic...',
      'Finalizing...',
    ],
    'preparing-discussion': [
      'Reading the proposal...',
      'Understanding what the owner needs...',
      'Analyzing business context...',
      'Drafting the first plan...',
      'Thinking about deliverables...',
      'Preparing clarifying questions...',
      'Almost ready — responding now...',
    ],
  };

  readonly currentMessage = computed(() => {
    const list: string[] =
      this.messagesByPhase[this.phase()] ??
      this.messagesByPhase['thinking'] ??
      ['Thinking...'];
    const idx = this.messageIndex() % list.length;
    return list[idx] ?? 'Thinking...';
  });

  constructor() {
    // Rotate messages every 2.5s. Use effect() to reset the index when the
    // phase changes so the user doesn't see a stale message from a different
    // activity immediately after phase changes.
    effect(() => {
      // Dependency: phase — resets counter when it changes
      this.phase();
      this.messageIndex.set(0);
    });

    this.rotationInterval = setInterval(() => {
      this.messageIndex.update((n) => n + 1);
    }, 2500);
  }

  ngOnDestroy(): void {
    if (this.rotationInterval) {
      clearInterval(this.rotationInterval);
      this.rotationInterval = null;
    }
  }

  /** Get persona accent color */
  getPersonaColor(): string {
    const type = this.personaType();
    if (!type) return '#58A6FF';
    return this.personaColors[type] ?? '#58A6FF';
  }

  /** Get persona initial letter for avatar */
  getPersonaInitial(): string {
    const type = this.personaType();
    if (!type) return 'AI';
    const label = this.personaLabels[type];
    return label ? label.charAt(0) : 'AI';
  }

  /** Get persona display label */
  getPersonaLabel(): string {
    const type = this.personaType();
    if (!type) return 'Neuron OS';
    return this.personaLabels[type] ?? 'Neuron OS';
  }
}
