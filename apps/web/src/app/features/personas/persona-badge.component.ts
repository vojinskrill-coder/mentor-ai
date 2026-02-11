import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  PERSONA_COLORS,
  PERSONA_NAMES,
  type PersonaType,
} from '@mentor-ai/shared/types';

/**
 * Small badge component to display persona type on messages.
 * Shows a colored pill with the persona short name.
 */
@Component({
  selector: 'app-persona-badge',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (personaType()) {
      <span
        class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
        [style.backgroundColor]="getColor() + '30'"
        [style.color]="getColor()"
        [style.borderColor]="getColor()"
        style="border-width: 1px"
      >
        {{ getName() }}
      </span>
    }
  `,
})
export class PersonaBadgeComponent {
  /** Persona type to display */
  readonly personaType = input<PersonaType | null>(null);

  /**
   * Gets the color for the current persona type.
   */
  getColor(): string {
    const type = this.personaType();
    if (!type) return '#6B7280';
    return PERSONA_COLORS[type] || '#6B7280';
  }

  /**
   * Gets the display name for the current persona type.
   */
  getName(): string {
    const type = this.personaType();
    if (!type) return '';
    return PERSONA_NAMES[type] || type;
  }
}
