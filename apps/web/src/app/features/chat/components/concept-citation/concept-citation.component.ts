import {
  Component,
  input,
  output,
  computed,
  ChangeDetectionStrategy,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { marked, type Tokens } from 'marked';
import type { ConceptCitation, ConceptCategory } from '@mentor-ai/shared/types';

// Configure marked for Obsidian-like rendering with target="_blank" links
const renderer = new marked.Renderer();
const originalLinkRenderer = renderer.link.bind(renderer);
renderer.link = (token: Tokens.Link) => {
  const html = originalLinkRenderer(token);
  return html.replace('<a ', '<a target="_blank" rel="noopener noreferrer" ');
};
marked.setOptions({
  gfm: true,
  breaks: true,
  renderer,
});

/**
 * Rendered segment of message content.
 */
interface ContentSegment {
  /** Segment type: text or citation */
  type: 'text' | 'citation';
  /** The content/name */
  content: string;
  /** Optional concept data for citations */
  citation?: ConceptCitation;
}

/**
 * Component for rendering message content with inline concept citations.
 * Parses [[Concept Name]] markers and renders them as clickable badges.
 * Renders markdown content (headings, tables, bold, lists) via `marked`.
 */
@Component({
  selector: 'app-concept-citation',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="content-with-citations">
      @for (segment of segments$(); track $index) {
        @if (segment.type === 'text') {
          <span [innerHTML]="segment.content"></span>
        } @else {
          <button
            type="button"
            class="citation-badge"
            [class]="getCategoryClass(segment.citation?.conceptCategory)"
            [attr.aria-label]="'Concept: ' + segment.content + '. Click to view details.'"
            tabindex="0"
            (click)="emitCitation(segment)"
            (keydown.enter)="emitCitation(segment)"
            (keydown.space)="emitCitation(segment)"
          >
            {{ segment.content }}
          </button>
        }
      }
    </div>
  `,
  styles: [`
    .content-with-citations {
      display: block;
      line-height: 1.6;
    }

    .citation-badge {
      display: inline-flex;
      align-items: center;
      padding: 0.125rem 0.5rem;
      margin: 0 0.125rem;
      font-size: 0.875rem;
      font-weight: 500;
      font-family: 'Inter', system-ui, sans-serif;
      border-radius: 0.375rem;
      background-color: #1a1a1a;
      border: 1px solid #333;
      color: #a3a3a3;
      cursor: pointer;
      transition: all 0.15s ease;
      vertical-align: baseline;
      text-decoration: none;
    }

    .citation-badge:hover,
    .citation-badge:focus {
      background-color: #262626;
      border-color: #525252;
      color: #e5e5e5;
      outline: none;
    }

    .citation-badge:focus-visible {
      box-shadow: 0 0 0 2px #3b82f6;
    }

    /* Category-specific colors */
    .citation-badge.finance {
      border-color: #10b98133;
      color: #10b981;
    }

    .citation-badge.finance:hover {
      background-color: #10b98120;
      border-color: #10b981;
    }

    .citation-badge.marketing {
      border-color: #f59e0b33;
      color: #f59e0b;
    }

    .citation-badge.marketing:hover {
      background-color: #f59e0b20;
      border-color: #f59e0b;
    }

    .citation-badge.technology {
      border-color: #3b82f633;
      color: #3b82f6;
    }

    .citation-badge.technology:hover {
      background-color: #3b82f620;
      border-color: #3b82f6;
    }

    .citation-badge.operations {
      border-color: #8b5cf633;
      color: #8b5cf6;
    }

    .citation-badge.operations:hover {
      background-color: #8b5cf620;
      border-color: #8b5cf6;
    }

    .citation-badge.legal {
      border-color: #6b728033;
      color: #6b7280;
    }

    .citation-badge.legal:hover {
      background-color: #6b728020;
      border-color: #6b7280;
    }

    .citation-badge.creative {
      border-color: #ec489933;
      color: #ec4899;
    }

    .citation-badge.creative:hover {
      background-color: #ec489920;
      border-color: #ec4899;
    }

  `],
})
export class ConceptCitationComponent {
  /** Message content with [[Citation]] markers */
  content = input.required<string>();

  /** Citation metadata from API */
  citations = input<ConceptCitation[]>([]);

  /** Emitted when a citation badge is clicked — opens right panel */
  citationClick = output<ConceptCitation | string>();

  /** Computed segments for rendering */
  segments$ = computed(() => this.parseContent(this.content(), this.citations()));

  /**
   * Two-pass markdown + citation rendering:
   * 1. Extract [[Citation]] markers → replace with unique placeholders
   * 2. Run marked.parse() on the placeholder-substituted text
   * 3. Split HTML on placeholders → produce text + citation segments
   */
  private parseContent(
    content: string,
    citations: ConceptCitation[]
  ): ContentSegment[] {
    // Build citation lookup map
    const citationMap = new Map<string, ConceptCitation>();
    for (const citation of citations) {
      citationMap.set(citation.conceptName.toLowerCase(), citation);
    }

    // Pass 1: Extract [[Citation]] markers, replace with unique placeholders
    const placeholders = new Map<string, { name: string; citation?: ConceptCitation }>();
    let idx = 0;
    const withPlaceholders = content.replace(/\[\[([^\]]+)\]\]/g, (_, name: string) => {
      const key = `%%CITE_${idx++}%%`;
      placeholders.set(key, {
        name,
        citation: citationMap.get(name.toLowerCase()),
      });
      return key;
    });

    // Pass 2: Run marked.parse() to produce HTML
    const html = marked.parse(withPlaceholders, { async: false }) as string;

    // Pass 3: Split HTML on placeholders, produce segments
    if (placeholders.size === 0) {
      return [{ type: 'text', content: html }];
    }

    const segments: ContentSegment[] = [];
    const parts = html.split(/(%%CITE_\d+%%)/);

    for (const part of parts) {
      const placeholderData = placeholders.get(part);
      if (placeholderData) {
        segments.push({
          type: 'citation',
          content: placeholderData.name,
          citation: placeholderData.citation,
        });
      } else if (part.length > 0) {
        segments.push({ type: 'text', content: part });
      }
    }

    return segments;
  }

  /**
   * Gets CSS class for category styling.
   */
  getCategoryClass(category?: ConceptCategory): string {
    if (!category) return '';
    return category.toLowerCase();
  }

  emitCitation(segment: ContentSegment): void {
    if (segment.citation) {
      this.citationClick.emit(segment.citation);
    } else {
      this.citationClick.emit(segment.content);
    }
  }
}
