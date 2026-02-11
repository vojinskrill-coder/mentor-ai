import {
  Component,
  inject,
  signal,
  input,
  output,
  OnInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { PersonasService } from './services/personas.service';
import type { Persona, PersonaType } from '@mentor-ai/shared/types';

/**
 * Persona selector component for choosing department AI personas.
 * Displays a list of available personas with avatars and colors.
 */
@Component({
  selector: 'app-persona-selector',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="persona-selector">
      @if (isLoading$()) {
        <!-- Loading skeleton -->
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
          @for (i of [1,2,3,4,5,6]; track i) {
            <div class="skeleton rounded-xl h-24"></div>
          }
        </div>
      } @else if (errorMessage$()) {
        <div class="flex items-center gap-2 text-[var(--color-error)] text-[13px] p-3 surface-elevated rounded-lg">
          <svg class="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clip-rule="evenodd"/>
          </svg>
          {{ errorMessage$() }}
        </div>
      } @else {
        <div class="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
          @for (persona of personas$(); track persona.id) {
            <button
              (click)="selectPersona(persona)"
              class="flex flex-col items-center p-3 rounded-xl border-2 transition-all duration-200 hover:scale-[1.02] min-h-[96px]"
              [class.surface-elevated]="selectedPersona$()?.id !== persona.id"
              [class.border-transparent]="selectedPersona$()?.id !== persona.id"
              [style.borderColor]="selectedPersona$()?.id === persona.id ? persona.color : 'transparent'"
              [style.backgroundColor]="selectedPersona$()?.id === persona.id ? persona.color + '15' : ''"
            >
              <!-- Avatar -->
              <div
                class="w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold text-[13px] mb-2 shadow-lg"
                [style.backgroundColor]="persona.color"
              >
                {{ persona.shortName.charAt(0) }}
              </div>

              <!-- Name -->
              <span
                class="text-[13px] font-medium text-center"
                [style.color]="selectedPersona$()?.id === persona.id ? persona.color : 'var(--color-text-primary)'"
              >
                {{ persona.shortName }}
              </span>

              <!-- Description -->
              <span class="text-[11px] text-[var(--color-text-muted)] text-center mt-1 line-clamp-2 hidden sm:block">
                {{ getShortDescription(persona.description) }}
              </span>
            </button>
          }
        </div>

        <!-- None option -->
        @if (allowNone()) {
          <button
            (click)="clearSelection()"
            class="mt-3 text-[13px] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] transition-colors flex items-center gap-1.5"
            [class.text-[var(--color-text-primary)]]="!selectedPersona$()"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
            </svg>
            {{ selectedPersona$() ? 'Clear selection' : 'No persona selected' }}
          </button>
        }
      }
    </div>
  `,
  styles: [
    `
      .persona-selector {
        width: 100%;
      }

      .line-clamp-2 {
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
    `,
  ],
})
export class PersonaSelectorComponent implements OnInit {
  private readonly personasService = inject(PersonasService);

  /** Currently selected persona type (input binding) */
  readonly selectedType = input<PersonaType | null>(null);

  /** Whether to show "none" option */
  readonly allowNone = input<boolean>(true);

  /** Event emitted when persona is selected */
  readonly personaSelected = output<Persona | null>();

  /** List of available personas */
  readonly personas$ = signal<Persona[]>([]);

  /** Currently selected persona */
  readonly selectedPersona$ = signal<Persona | null>(null);

  /** Loading state */
  readonly isLoading$ = signal(true);

  /** Error message */
  readonly errorMessage$ = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    await this.loadPersonas();

    // Set initial selection based on input
    const initialType = this.selectedType();
    if (initialType) {
      const persona = this.personas$().find((p) => p.type === initialType);
      if (persona) {
        this.selectedPersona$.set(persona);
      }
    }
  }

  /**
   * Loads all available personas from the API.
   */
  private async loadPersonas(): Promise<void> {
    this.isLoading$.set(true);
    this.errorMessage$.set(null);

    try {
      const personas = await this.personasService.getPersonas();
      this.personas$.set(personas);
    } catch (error) {
      this.errorMessage$.set('Failed to load personas');
    } finally {
      this.isLoading$.set(false);
    }
  }

  /**
   * Selects a persona and emits the selection event.
   */
  selectPersona(persona: Persona): void {
    this.selectedPersona$.set(persona);
    this.personaSelected.emit(persona);
  }

  /**
   * Clears the current selection.
   */
  clearSelection(): void {
    this.selectedPersona$.set(null);
    this.personaSelected.emit(null);
  }

  /**
   * Gets a shortened description for display.
   */
  getShortDescription(description: string): string {
    const maxLength = 50;
    if (description.length <= maxLength) {
      return description;
    }
    return description.substring(0, maxLength - 3) + '...';
  }
}
