import {
  Component,
  input,
  output,
  signal,
  computed,
  effect,
  inject,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { firstValueFrom } from 'rxjs';
import { marked } from 'marked';
import type { ConceptCitationSummary, ConceptCategory } from '@mentor-ai/shared/types';

/**
 * Side panel component for displaying concept details.
 * Slides in from the right edge when a citation is clicked.
 *
 * @example
 * ```html
 * <app-concept-panel
 *   [conceptId]="selectedConceptId"
 *   [isOpen]="isPanelOpen"
 *   (close)="closePanelHandler()"
 *   (conceptClick)="navigateToConcept($event)"
 * />
 * ```
 */
@Component({
  selector: 'app-concept-panel',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isOpen()) {
      <!-- Backdrop -->
      <div
        class="panel-backdrop"
        (click)="onClose()"
        role="presentation"
      ></div>

      <!-- Panel -->
      <div
        class="concept-panel"
        role="dialog"
        aria-modal="true"
        [attr.aria-label]="concept$()?.name ? 'Concept: ' + concept$()?.name : 'Loading concept'"
      >
        <!-- Header -->
        <div class="panel-header">
          <div class="header-content">
            @if (concept$()) {
              <span
                class="category-badge"
                [class]="getCategoryClass(concept$()!.category)"
              >
                {{ concept$()!.category }}
              </span>
              <h2 class="concept-name">{{ concept$()!.name }}</h2>
            } @else if (isLoading$()) {
              <div class="skeleton skeleton-badge"></div>
              <div class="skeleton skeleton-title"></div>
            }
          </div>
          <button
            type="button"
            class="close-button"
            aria-label="Close panel"
            (click)="onClose()"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        <!-- Content -->
        <div class="panel-content">
          @if (error$()) {
            <div class="error-message">
              <p>{{ error$() }}</p>
              <button type="button" class="retry-button" (click)="loadConcept()">
                Retry
              </button>
            </div>
          } @else if (isLoading$()) {
            <div class="skeleton skeleton-text"></div>
            <div class="skeleton skeleton-text short"></div>
          } @else if (concept$()) {
            <p class="definition">{{ concept$()!.definition }}</p>

            @if (concept$()!.extendedDescription) {
              <div class="extended-section">
                <h3 class="section-title">Detalji</h3>
                <div class="extended-text" [innerHTML]="renderMarkdown(concept$()!.extendedDescription!)"></div>
              </div>
            }

            @if (concept$()!.relatedConcepts.length > 0) {
              <div class="related-section">
                <h3 class="section-title">Related Concepts</h3>
                <div class="related-chips">
                  @for (related of concept$()!.relatedConcepts; track related.id) {
                    <button
                      type="button"
                      class="related-chip"
                      (click)="onConceptClicked(related.id)"
                    >
                      {{ related.name }}
                    </button>
                  }
                </div>
              </div>
            }
          }
        </div>

        <!-- Footer -->
        <div class="panel-footer">
          <button
            type="button"
            class="learn-more-button"
            [disabled]="!concept$()"
            (click)="onLearnMore()"
          >
            Learn More
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <line x1="5" y1="12" x2="19" y2="12"></line>
              <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
          </button>
        </div>
      </div>
    }
  `,
  styles: [`
    .panel-backdrop {
      position: fixed;
      inset: 0;
      background: rgba(0, 0, 0, 0.5);
      z-index: 40;
    }

    .concept-panel {
      position: fixed;
      top: 0;
      right: 0;
      height: 100vh;
      width: 320px;
      max-width: 90vw;
      background: #0a0a0a;
      border-left: 1px solid #262626;
      display: flex;
      flex-direction: column;
      z-index: 50;
      animation: slideIn 0.2s ease-out;
    }

    @keyframes slideIn {
      from {
        transform: translateX(100%);
      }
      to {
        transform: translateX(0);
      }
    }

    .panel-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      padding: 1rem;
      border-bottom: 1px solid #262626;
    }

    .header-content {
      flex: 1;
      min-width: 0;
    }

    .category-badge {
      display: inline-block;
      padding: 0.125rem 0.5rem;
      font-size: 0.75rem;
      font-weight: 500;
      border-radius: 9999px;
      background: #1a1a1a;
      color: #a3a3a3;
      margin-bottom: 0.5rem;
    }

    .category-badge.finance { background: #10b98120; color: #10b981; }
    .category-badge.marketing { background: #f59e0b20; color: #f59e0b; }
    .category-badge.technology { background: #3b82f620; color: #3b82f6; }
    .category-badge.operations { background: #8b5cf620; color: #8b5cf6; }
    .category-badge.legal { background: #6b728020; color: #6b7280; }
    .category-badge.creative { background: #ec489920; color: #ec4899; }

    .concept-name {
      font-size: 1.125rem;
      font-weight: 600;
      color: #f5f5f5;
      margin: 0;
      line-height: 1.4;
    }

    .close-button {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      background: transparent;
      border: none;
      color: #737373;
      cursor: pointer;
      border-radius: 0.375rem;
      transition: all 0.15s ease;
      flex-shrink: 0;
      margin-left: 0.5rem;
    }

    .close-button:hover {
      background: #262626;
      color: #e5e5e5;
    }

    .panel-content {
      flex: 1;
      padding: 1rem;
      overflow-y: auto;
    }

    .definition {
      color: #d4d4d4;
      line-height: 1.6;
      margin: 0 0 1.5rem 0;
    }

    .extended-section {
      margin-top: 1.5rem;
      padding-top: 1rem;
      border-top: 1px solid #262626;
    }

    .extended-text {
      color: #b0b0b0;
      font-size: 0.875rem;
      line-height: 1.7;
    }

    .extended-text p { margin: 10px 0; }
    .extended-text h1, .extended-text h2, .extended-text h3 {
      color: #e0e0e0; margin: 16px 0 8px;
    }
    .extended-text ul, .extended-text ol {
      padding-left: 1.5em; margin: 8px 0;
    }
    .extended-text li { margin: 4px 0; }
    .extended-text strong { color: #e5e5e5; }

    .related-section {
      margin-top: 1.5rem;
    }

    .section-title {
      font-size: 0.875rem;
      font-weight: 500;
      color: #737373;
      margin: 0 0 0.75rem 0;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .related-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.5rem;
    }

    .related-chip {
      padding: 0.375rem 0.75rem;
      font-size: 0.875rem;
      background: #1a1a1a;
      border: 1px solid #333;
      color: #a3a3a3;
      border-radius: 9999px;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .related-chip:hover {
      background: #262626;
      border-color: #525252;
      color: #e5e5e5;
    }

    .panel-footer {
      padding: 1rem;
      border-top: 1px solid #262626;
    }

    .learn-more-button {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.5rem;
      width: 100%;
      padding: 0.75rem;
      font-size: 0.875rem;
      font-weight: 500;
      background: #262626;
      border: 1px solid #333;
      color: #e5e5e5;
      border-radius: 0.5rem;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .learn-more-button:hover:not(:disabled) {
      background: #333;
      border-color: #525252;
    }

    .learn-more-button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }

    .error-message {
      text-align: center;
      color: #ef4444;
      padding: 2rem;
    }

    .retry-button {
      margin-top: 1rem;
      padding: 0.5rem 1rem;
      background: #262626;
      border: 1px solid #333;
      color: #e5e5e5;
      border-radius: 0.375rem;
      cursor: pointer;
    }

    /* Skeleton loaders */
    .skeleton {
      background: linear-gradient(90deg, #1a1a1a 25%, #262626 50%, #1a1a1a 75%);
      background-size: 200% 100%;
      animation: shimmer 1.5s infinite;
      border-radius: 0.25rem;
    }

    .skeleton-badge {
      width: 80px;
      height: 20px;
      margin-bottom: 0.5rem;
    }

    .skeleton-title {
      width: 180px;
      height: 24px;
    }

    .skeleton-text {
      width: 100%;
      height: 16px;
      margin-bottom: 0.75rem;
    }

    .skeleton-text.short {
      width: 75%;
    }

    @keyframes shimmer {
      0% { background-position: 200% 0; }
      100% { background-position: -200% 0; }
    }
  `],
})
export class ConceptPanelComponent {
  private readonly http = inject(HttpClient);
  private readonly sanitizer = inject(DomSanitizer);

  /** Concept ID to display */
  conceptId = input<string | null>(null);

  /** Whether the panel is open */
  isOpen = input(false);

  /** Emitted when panel should close */
  close = output<void>();

  /** Emitted when a related concept is clicked */
  conceptClick = output<string>();

  /** Emitted when Learn More is clicked */
  learnMore = output<string>();

  /** Concept data */
  readonly concept$ = signal<ConceptCitationSummary | null>(null);

  /** Loading state */
  readonly isLoading$ = signal(false);

  /** Error state */
  readonly error$ = signal<string | null>(null);

  constructor() {
    // Load concept when ID changes
    effect(() => {
      const id = this.conceptId();
      if (id && this.isOpen()) {
        this.loadConcept();
      }
    });
  }

  /**
   * Loads concept data from API.
   */
  async loadConcept(): Promise<void> {
    const id = this.conceptId();
    if (!id) return;

    this.isLoading$.set(true);
    this.error$.set(null);

    try {
      const response = await firstValueFrom(
        this.http.get<{ data: ConceptCitationSummary }>(
          `/api/v1/knowledge/concepts/${id}/summary`
        )
      );

      if (response?.data) {
        this.concept$.set(response.data);
      }
    } catch (error) {
      // Log error for debugging while showing user-friendly message
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.error$.set(`Failed to load concept details: ${errorMessage}`);
    } finally {
      this.isLoading$.set(false);
    }
  }

  /**
   * Gets CSS class for category styling.
   */
  getCategoryClass(category?: ConceptCategory): string {
    if (!category) return '';
    return category.toLowerCase();
  }

  /**
   * Handles close button click.
   */
  onClose(): void {
    this.close.emit();
  }

  /**
   * Handles related concept click.
   */
  onConceptClicked(conceptId: string): void {
    this.conceptClick.emit(conceptId);
  }

  /**
   * Renders markdown content as safe HTML.
   */
  renderMarkdown(content: string): SafeHtml {
    const html = marked.parse(content, { async: false }) as string;
    return this.sanitizer.bypassSecurityTrustHtml(html);
  }

  /**
   * Handles Learn More button click.
   */
  onLearnMore(): void {
    const concept = this.concept$();
    if (concept) {
      this.learnMore.emit(concept.id);
    }
  }
}
