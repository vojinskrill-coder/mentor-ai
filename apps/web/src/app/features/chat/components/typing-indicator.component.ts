import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import type { PersonaType } from '@mentor-ai/shared/types';

/**
 * Typing indicator component displayed while AI is processing.
 * Uses premium design system with persona-aware styling.
 */
@Component({
  selector: 'app-typing-indicator',
  standalone: true,
  imports: [CommonModule],
  styles: [
    `
      .typing-card {
        background: #1a1a1a;
        border-radius: 8px;
        border: 1px solid #2a2a2a;
        overflow: hidden;
      }
      .typing-header {
        padding: 12px 16px;
        border-bottom: 1px solid #2a2a2a;
        display: flex;
        align-items: center;
        gap: 12px;
      }
      .typing-avatar {
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
      .typing-label {
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .typing-name {
        font-size: 13px;
        font-weight: 500;
      }
      .typing-status {
        font-size: 11px;
        color: #9e9e9e;
      }
      .typing-content {
        padding: 16px;
      }
      .typing-dots {
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .typing-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        animation: bounce 1s ease-in-out infinite;
      }
      .typing-dot:nth-child(2) {
        animation-delay: 150ms;
      }
      .typing-dot:nth-child(3) {
        animation-delay: 300ms;
      }
      @keyframes bounce {
        0%,
        100% {
          transform: translateY(0);
        }
        50% {
          transform: translateY(-4px);
        }
      }
    `,
  ],
  template: `
    <div class="typing-card">
      <div class="typing-header">
        <div class="typing-avatar" [style.backgroundColor]="getPersonaColor()">
          {{ getPersonaInitial() }}
        </div>
        <div class="typing-label">
          <span class="typing-name" [style.color]="getPersonaColor()">
            {{ getPersonaLabel() }}
          </span>
          <span class="typing-status">{{
            phase() === 'researching' ? 'istražuje...' : 'razmišlja...'
          }}</span>
        </div>
      </div>
      <div class="typing-content">
        <div class="typing-dots">
          <span class="typing-dot" [style.backgroundColor]="getPersonaColor()"></span>
          <span class="typing-dot" [style.backgroundColor]="getPersonaColor()"></span>
          <span class="typing-dot" [style.backgroundColor]="getPersonaColor()"></span>
        </div>
      </div>
    </div>
  `,
})
export class TypingIndicatorComponent {
  /** Optional persona type for personalized styling */
  readonly personaType = input<PersonaType | null>(null);

  /** Current phase: thinking (default) or researching */
  readonly phase = input<'thinking' | 'researching'>('thinking');

  /** Persona color mapping */
  private readonly personaColors: Record<string, string> = {
    CFO: '#3B82F6',
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

  /** Get persona accent color */
  getPersonaColor(): string {
    const type = this.personaType();
    if (!type) return '#3B82F6';
    return this.personaColors[type] ?? '#3B82F6';
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
    if (!type) return 'AI Assistant';
    return this.personaLabels[type] ?? 'AI Assistant';
  }
}
