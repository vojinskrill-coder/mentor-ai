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
  template: `
    <div class="ai-response-card overflow-hidden animate-in">
      <!-- Card Header -->
      <div class="ai-response-header">
        <div class="flex items-center gap-3">
          <!-- Persona Avatar -->
          <div
            class="w-8 h-8 rounded-full flex items-center justify-center text-white text-[13px] font-semibold"
            [style.backgroundColor]="getPersonaColor()"
          >
            {{ getPersonaInitial() }}
          </div>
          <div class="flex items-center gap-2">
            <span class="text-[13px] font-medium" [style.color]="getPersonaColor()">
              {{ getPersonaLabel() }}
            </span>
            <span class="text-[11px] text-[var(--color-text-muted)]">is thinking...</span>
          </div>
        </div>
      </div>

      <!-- Card Content with Typing Dots -->
      <div class="ai-response-content">
        <div class="flex items-center gap-1.5">
          <span
            class="w-2 h-2 rounded-full animate-bounce"
            [style.backgroundColor]="getPersonaColor()"
            style="animation-delay: 0ms; animation-duration: 1s;"
          ></span>
          <span
            class="w-2 h-2 rounded-full animate-bounce"
            [style.backgroundColor]="getPersonaColor()"
            style="animation-delay: 150ms; animation-duration: 1s;"
          ></span>
          <span
            class="w-2 h-2 rounded-full animate-bounce"
            [style.backgroundColor]="getPersonaColor()"
            style="animation-delay: 300ms; animation-duration: 1s;"
          ></span>
        </div>
      </div>
    </div>
  `,
})
export class TypingIndicatorComponent {
  /** Optional persona type for personalized styling */
  readonly personaType = input<PersonaType | null>(null);

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
