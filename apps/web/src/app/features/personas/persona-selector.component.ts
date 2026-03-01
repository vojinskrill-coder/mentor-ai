import { Component, inject, signal, input, output, OnInit } from '@angular/core';
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
        <div class="persona-grid">
          @for (i of [1, 2, 3, 4, 5, 6]; track i) {
            <div class="skeleton-card"></div>
          }
        </div>
      } @else if (errorMessage$()) {
        <div class="error-box">
          <svg
            style="width: 16px; height: 16px; flex-shrink: 0;"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fill-rule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clip-rule="evenodd"
            />
          </svg>
          {{ errorMessage$() }}
        </div>
      } @else {
        <div class="persona-grid">
          @for (persona of personas$(); track persona.id) {
            <button
              class="persona-card"
              [class.selected]="selectedPersona$()?.id === persona.id"
              [style.borderColor]="
                selectedPersona$()?.id === persona.id ? persona.color : 'transparent'
              "
              [style.backgroundColor]="
                selectedPersona$()?.id === persona.id ? persona.color + '15' : ''
              "
              (click)="selectPersona(persona)"
            >
              <div class="persona-avatar" [style.backgroundColor]="persona.color">
                {{ persona.shortName.charAt(0) }}
              </div>
              <span
                class="persona-name"
                [style.color]="selectedPersona$()?.id === persona.id ? persona.color : '#FAFAFA'"
              >
                {{ persona.shortName }}
              </span>
              <span class="persona-desc">
                {{ getShortDescription(persona.description) }}
              </span>
            </button>
          }
        </div>

        @if (allowNone()) {
          <button class="clear-btn" [class.active]="!selectedPersona$()" (click)="clearSelection()">
            <svg
              style="width: 16px; height: 16px;"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
            {{ selectedPersona$() ? 'Poništi izbor' : 'Persona nije izabrana' }}
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
      .persona-grid {
        display: grid;
        grid-template-columns: repeat(6, 1fr);
        gap: 8px;
      }
      @media (max-width: 1024px) {
        .persona-grid {
          grid-template-columns: repeat(3, 1fr);
        }
      }
      @media (max-width: 640px) {
        .persona-grid {
          grid-template-columns: repeat(2, 1fr);
        }
      }
      .skeleton-card {
        height: 96px;
        border-radius: 12px;
        background: #242424;
        animation: shimmer 1.5s linear infinite;
        background-image: linear-gradient(90deg, #242424 25%, #2a2a2a 50%, #242424 75%);
        background-size: 200% 100%;
      }
      @keyframes shimmer {
        0% {
          background-position: 200% 0;
        }
        100% {
          background-position: -200% 0;
        }
      }
      .error-box {
        display: flex;
        align-items: center;
        gap: 8px;
        color: #ef4444;
        font-size: 13px;
        padding: 12px;
        background: #242424;
        border-radius: 8px;
      }
      .persona-card {
        display: flex;
        flex-direction: column;
        align-items: center;
        padding: 12px;
        border-radius: 12px;
        border: 2px solid transparent;
        background: #242424;
        cursor: pointer;
        transition: all 0.2s;
        min-height: 96px;
      }
      .persona-card:hover {
        transform: scale(1.02);
      }
      .persona-card.selected {
        /* borderColor and backgroundColor set via style binding */
      }
      .persona-avatar {
        width: 40px;
        height: 40px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: 600;
        font-size: 13px;
        margin-bottom: 8px;
        box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
      }
      .persona-name {
        font-size: 13px;
        font-weight: 500;
        text-align: center;
        color: #fafafa;
      }
      .persona-desc {
        font-size: 11px;
        color: #9e9e9e;
        text-align: center;
        margin-top: 4px;
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        overflow: hidden;
      }
      @media (max-width: 640px) {
        .persona-desc {
          display: none;
        }
      }
      .clear-btn {
        margin-top: 12px;
        font-size: 13px;
        color: #9e9e9e;
        background: none;
        border: none;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 6px;
        transition: color 0.15s;
      }
      .clear-btn:hover {
        color: #fafafa;
      }
      .clear-btn.active {
        color: #fafafa;
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
    } catch {
      this.errorMessage$.set('Učitavanje persona nije uspelo');
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
