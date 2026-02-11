import { Component, computed, input, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  ConfidenceLevel,
  CONFIDENCE_COLORS,
  type ConfidenceFactor,
} from '@mentor-ai/shared/types';

/**
 * Component for displaying AI response confidence score.
 * Shows a color-coded badge with percentage and tooltip explanation.
 *
 * @example
 * <app-confidence-indicator
 *   [score]="0.72"
 *   [level]="ConfidenceLevel.MEDIUM"
 *   [factors]="[...]"
 *   [improvementSuggestion]="'Provide more context...'"
 * />
 */
@Component({
  selector: 'app-confidence-indicator',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="relative inline-block" (mouseenter)="showTooltip$.set(true)" (mouseleave)="showTooltip$.set(false)">
      <!-- Confidence Badge -->
      <button
        type="button"
        class="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-all hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[#1A1A1A]"
        [style.backgroundColor]="badgeBackgroundColor$()"
        [style.color]="'white'"
        [attr.aria-label]="ariaLabel$()"
        [attr.aria-describedby]="showTooltip$() ? 'confidence-tooltip' : null"
      >
        <!-- Confidence Icon -->
        <svg
          class="w-3.5 h-3.5"
          fill="currentColor"
          viewBox="0 0 20 20"
          aria-hidden="true"
        >
          @if (level() === ConfidenceLevel.HIGH) {
            <!-- Checkmark circle for high confidence -->
            <path
              fill-rule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
              clip-rule="evenodd"
            />
          } @else if (level() === ConfidenceLevel.MEDIUM) {
            <!-- Info circle for medium confidence -->
            <path
              fill-rule="evenodd"
              d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
              clip-rule="evenodd"
            />
          } @else {
            <!-- Warning triangle for low confidence -->
            <path
              fill-rule="evenodd"
              d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
              clip-rule="evenodd"
            />
          }
        </svg>
        <span>{{ percentageDisplay$() }}</span>
      </button>

      <!-- Tooltip -->
      @if (showTooltip$()) {
        <div
          id="confidence-tooltip"
          role="tooltip"
          class="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 w-64 p-3 bg-[#2A2A2A] border border-[#3A3A3A] rounded-lg shadow-lg text-sm"
        >
          <!-- Tooltip Arrow -->
          <div
            class="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-8 border-transparent border-t-[#2A2A2A]"
          ></div>

          <!-- Confidence Level Header -->
          <div class="flex items-center gap-2 mb-2">
            <span
              class="inline-block w-2 h-2 rounded-full"
              [style.backgroundColor]="badgeColor$()"
            ></span>
            <span class="font-medium text-white">{{ levelLabel$() }} Confidence</span>
          </div>

          <!-- Factor Breakdown -->
          @if (factors() && factors()!.length > 0) {
            <div class="space-y-1.5 mb-3">
              @for (factor of factors(); track factor.name) {
                <div class="flex items-center justify-between text-xs">
                  <span class="text-[#A0A0A0]">{{ formatFactorName(factor.name) }}</span>
                  <span class="text-white">{{ formatFactorScore(factor.score) }}</span>
                </div>
              }
            </div>
          }

          <!-- Improvement Suggestion -->
          @if (improvementSuggestion()) {
            <div class="pt-2 border-t border-[#3A3A3A]">
              <p class="text-xs text-[#A0A0A0] leading-relaxed">
                <span class="text-amber-400">To improve:</span>
                {{ improvementSuggestion() }}
              </p>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class ConfidenceIndicatorComponent {
  /** Confidence score between 0.0 and 1.0 */
  readonly score = input.required<number>();

  /** Confidence level classification */
  readonly level = input.required<ConfidenceLevel>();

  /** Factor breakdown for tooltip */
  readonly factors = input<ConfidenceFactor[] | null>(null);

  /** Improvement suggestion for low/medium confidence */
  readonly improvementSuggestion = input<string | null>(null);

  /** Previous score for showing improvement */
  readonly previousScore = input<number | null>(null);

  /** Expose ConfidenceLevel enum to template */
  readonly ConfidenceLevel = ConfidenceLevel;

  /** Signal for tooltip visibility */
  readonly showTooltip$ = signal(false);

  /** Computed percentage display (e.g., "72%") */
  readonly percentageDisplay$ = computed(() => {
    return `${Math.round(this.score() * 100)}%`;
  });

  /** Computed badge color based on level */
  readonly badgeColor$ = computed(() => {
    return CONFIDENCE_COLORS[this.level()];
  });

  /** Computed background color with opacity */
  readonly badgeBackgroundColor$ = computed(() => {
    const color = CONFIDENCE_COLORS[this.level()];
    // Convert hex to rgba with 0.2 opacity for background
    return this.hexToRgba(color, 0.2);
  });

  /** Computed level label */
  readonly levelLabel$ = computed(() => {
    switch (this.level()) {
      case ConfidenceLevel.HIGH:
        return 'High';
      case ConfidenceLevel.MEDIUM:
        return 'Medium';
      case ConfidenceLevel.LOW:
        return 'Low';
      default:
        return 'Unknown';
    }
  });

  /** Computed aria-label for accessibility */
  readonly ariaLabel$ = computed(() => {
    const percent = Math.round(this.score() * 100);
    const levelLabel = this.levelLabel$().toLowerCase();
    return `AI confidence: ${percent} percent, ${levelLabel}`;
  });

  /**
   * Formats factor name for display.
   * Converts snake_case to Title Case.
   */
  formatFactorName(name: string): string {
    return name
      .split('_')
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  }

  /**
   * Formats factor score as percentage.
   */
  formatFactorScore(score: number): string {
    return `${Math.round(score * 100)}%`;
  }

  /**
   * Converts hex color to rgba with opacity.
   */
  private hexToRgba(hex: string, opacity: number): string {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
}
