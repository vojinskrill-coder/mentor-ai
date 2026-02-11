import {
  Component,
  input,
  output,
  signal,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import type { MemoryAttribution, MemoryType } from '@mentor-ai/shared/types';
import { MEMORY_TYPE_COLORS, MEMORY_TYPE_LABELS } from '@mentor-ai/shared/types';

/**
 * Component for displaying memory attribution in AI responses.
 * Shows "Based on our previous discussion about [subject]..." with expandable details.
 *
 * @example
 * ```html
 * <app-memory-attribution
 *   [attributions]="message.memoryAttributions"
 *   (attributionClick)="onAttributionClick($event)"
 *   (outdatedClick)="onOutdatedClick($event)"
 * />
 * ```
 *
 * Story 2.7: Persistent Memory Across Conversations
 */
@Component({
  selector: 'app-memory-attribution',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (attributions().length > 0) {
      <div class="memory-attribution-container">
        <div class="attribution-header">
          <button
            type="button"
            class="attribution-toggle"
            [attr.aria-expanded]="isExpanded$()"
            aria-controls="attribution-details"
            (click)="toggleExpand()"
          >
            <span class="memory-icon" aria-hidden="true">💭</span>
            <span class="attribution-text">
              Based on our previous discussion about
              <strong>{{ primarySubject$() }}</strong>
              @if (additionalCount$() > 0) {
                <span class="additional-count">
                  (+{{ additionalCount$() }} more)
                </span>
              }
            </span>
            <span class="expand-icon" [class.expanded]="isExpanded$()">
              ▼
            </span>
          </button>
        </div>

        @if (isExpanded$()) {
          <div
            id="attribution-details"
            class="attribution-details"
            role="region"
            aria-label="Memory attribution details"
          >
            @for (attr of attributions(); track attr.memoryId) {
              <div
                class="attribution-item"
                [class]="getTypeClass(attr.type)"
              >
                <div class="item-header">
                  <span
                    class="type-badge"
                    [style.background-color]="getTypeColor(attr.type) + '20'"
                    [style.color]="getTypeColor(attr.type)"
                  >
                    {{ getTypeLabel(attr.type) }}
                  </span>
                  <span class="subject">{{ attr.subject }}</span>
                </div>
                <p class="summary">{{ attr.summary }}</p>
                <div class="item-actions">
                  <button
                    type="button"
                    class="action-btn view-btn"
                    (click)="onViewDetails(attr)"
                    aria-label="View full memory details"
                  >
                    View details
                  </button>
                  <button
                    type="button"
                    class="action-btn outdated-btn"
                    (click)="onMarkOutdated(attr)"
                    aria-label="Mark this memory as outdated"
                  >
                    This is outdated
                  </button>
                </div>
              </div>
            }
          </div>
        }
      </div>
    }
  `,
  styles: [`
    .memory-attribution-container {
      margin: 0.5rem 0;
      border-radius: 0.5rem;
      background-color: #1a1a1a;
      border: 1px solid #333;
      overflow: hidden;
    }

    .attribution-header {
      padding: 0;
    }

    .attribution-toggle {
      width: 100%;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 1rem;
      background: transparent;
      border: none;
      color: #a3a3a3;
      cursor: pointer;
      font-size: 0.875rem;
      text-align: left;
      transition: background-color 0.15s ease;
    }

    .attribution-toggle:hover {
      background-color: #262626;
    }

    .attribution-toggle:focus {
      outline: none;
    }

    .attribution-toggle:focus-visible {
      box-shadow: inset 0 0 0 2px #3b82f6;
    }

    .memory-icon {
      font-size: 1rem;
    }

    .attribution-text {
      flex: 1;
      font-style: italic;
    }

    .attribution-text strong {
      color: #e5e5e5;
      font-weight: 600;
    }

    .additional-count {
      color: #737373;
      font-size: 0.75rem;
      margin-left: 0.25rem;
    }

    .expand-icon {
      font-size: 0.625rem;
      transition: transform 0.2s ease;
      color: #737373;
    }

    .expand-icon.expanded {
      transform: rotate(180deg);
    }

    .attribution-details {
      padding: 0 1rem 1rem;
      border-top: 1px solid #333;
    }

    .attribution-item {
      padding: 0.75rem;
      margin-top: 0.75rem;
      border-radius: 0.375rem;
      background-color: #0d0d0d;
      border: 1px solid #262626;
    }

    .item-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-bottom: 0.5rem;
    }

    .type-badge {
      display: inline-flex;
      align-items: center;
      padding: 0.125rem 0.5rem;
      font-size: 0.75rem;
      font-weight: 500;
      border-radius: 0.25rem;
      text-transform: uppercase;
      letter-spacing: 0.025em;
    }

    .subject {
      font-weight: 600;
      color: #e5e5e5;
      font-size: 0.875rem;
    }

    .summary {
      margin: 0 0 0.75rem;
      color: #a3a3a3;
      font-size: 0.875rem;
      line-height: 1.5;
    }

    .item-actions {
      display: flex;
      gap: 0.5rem;
    }

    .action-btn {
      padding: 0.375rem 0.75rem;
      font-size: 0.75rem;
      font-weight: 500;
      border-radius: 0.25rem;
      border: 1px solid #333;
      background-color: transparent;
      color: #a3a3a3;
      cursor: pointer;
      transition: all 0.15s ease;
    }

    .action-btn:hover {
      background-color: #262626;
      color: #e5e5e5;
    }

    .action-btn:focus {
      outline: none;
    }

    .action-btn:focus-visible {
      box-shadow: 0 0 0 2px #3b82f6;
    }

    .view-btn:hover {
      border-color: #3b82f6;
      color: #3b82f6;
    }

    .outdated-btn {
      color: #f59e0b;
      border-color: #f59e0b33;
    }

    .outdated-btn:hover {
      background-color: #f59e0b20;
      border-color: #f59e0b;
      color: #f59e0b;
    }
  `],
})
export class MemoryAttributionComponent {
  /** List of memory attributions for this response */
  attributions = input<MemoryAttribution[]>([]);

  /** Emitted when user clicks to view attribution details */
  attributionClick = output<MemoryAttribution>();

  /** Emitted when user marks a memory as outdated */
  outdatedClick = output<MemoryAttribution>();

  /** Whether the details panel is expanded */
  isExpanded$ = signal(false);

  /** Primary subject to display in collapsed view */
  primarySubject$ = signal('');

  /** Count of additional attributions beyond the first */
  additionalCount$ = signal(0);

  ngOnChanges(): void {
    this.updatePrimarySubject();
  }

  ngOnInit(): void {
    this.updatePrimarySubject();
  }

  /**
   * Updates the primary subject based on attributions.
   */
  private updatePrimarySubject(): void {
    const attrs = this.attributions();
    if (attrs.length > 0) {
      this.primarySubject$.set(attrs[0]?.subject ?? 'previous context');
      this.additionalCount$.set(Math.max(0, attrs.length - 1));
    }
  }

  /**
   * Toggles the expanded state of the details panel.
   */
  toggleExpand(): void {
    this.isExpanded$.update((v) => !v);
  }

  /**
   * Gets the CSS class for memory type.
   */
  getTypeClass(type: MemoryType): string {
    return type.toLowerCase().replace('_', '-');
  }

  /**
   * Gets the color for memory type.
   */
  getTypeColor(type: MemoryType): string {
    return MEMORY_TYPE_COLORS[type] ?? '#6b7280';
  }

  /**
   * Gets the display label for memory type.
   */
  getTypeLabel(type: MemoryType): string {
    return MEMORY_TYPE_LABELS[type] ?? 'Note';
  }

  /**
   * Handles view details click.
   */
  onViewDetails(attribution: MemoryAttribution): void {
    this.attributionClick.emit(attribution);
  }

  /**
   * Handles mark as outdated click.
   */
  onMarkOutdated(attribution: MemoryAttribution): void {
    this.outdatedClick.emit(attribution);
  }
}
