import {
  Component,
  input,
  output,
  computed,
  ChangeDetectionStrategy,
  ViewEncapsulation,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { marked, type Tokens } from 'marked';
import DOMPurify from 'dompurify';
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

/** DOMPurify config matching the shared markdown-config */
const PURIFY_CONFIG = {
  ADD_ATTR: ['target', 'rel', 'class'],
  ALLOWED_TAGS: [
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'p',
    'br',
    'hr',
    'strong',
    'em',
    'del',
    's',
    'ul',
    'ol',
    'li',
    'a',
    'code',
    'pre',
    'blockquote',
    'table',
    'thead',
    'tbody',
    'tr',
    'th',
    'td',
    'span',
    'div',
    'img',
  ],
};

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
  encapsulation: ViewEncapsulation.None,
  template: `
    <div class="content-with-citations">
      @for (segment of segments$(); track $index) {
        @if (segment.type === 'text') {
          <div class="markdown-segment" [innerHTML]="segment.content"></div>
        } @else {
          <button
            type="button"
            class="citation-badge"
            [class.finance]="getCategoryClass(segment.citation?.conceptCategory) === 'finance'"
            [class.marketing]="getCategoryClass(segment.citation?.conceptCategory) === 'marketing'"
            [class.technology]="
              getCategoryClass(segment.citation?.conceptCategory) === 'technology'
            "
            [class.operations]="
              getCategoryClass(segment.citation?.conceptCategory) === 'operations'
            "
            [class.legal]="getCategoryClass(segment.citation?.conceptCategory) === 'legal'"
            [class.creative]="getCategoryClass(segment.citation?.conceptCategory) === 'creative'"
            [attr.aria-label]="'Koncept: ' + segment.content + '. Kliknite za detalje.'"
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
  styles: [
    `
      .content-with-citations {
        display: block;
        line-height: 1.75;
      }

      .markdown-segment {
        display: contents;
      }

      .citation-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 1px 8px;
        margin: 0 2px;
        font-size: 0.8rem;
        font-weight: 500;
        font-family: inherit;
        border-radius: 4px;
        background: rgba(59, 130, 246, 0.08);
        border: 1px solid rgba(59, 130, 246, 0.2);
        color: #60a5fa;
        cursor: pointer;
        transition: all 0.15s ease;
        vertical-align: baseline;
        text-decoration: none;
        line-height: 1.4;
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

      /* ── Chat markdown rendering ── */
      .content-with-citations > :first-child {
        margin-top: 0 !important;
      }
      .content-with-citations > :last-child {
        margin-bottom: 0 !important;
      }

      .content-with-citations h1 {
        font-size: 1.5em;
        font-weight: 700;
        color: #fafafa;
        margin: 24px 0 8px;
        padding-bottom: 6px;
        border-bottom: 1px solid #2a2a2a;
      }
      .content-with-citations h2 {
        font-size: 1.3em;
        font-weight: 600;
        color: #fafafa;
        margin: 20px 0 6px;
        padding-bottom: 4px;
        border-bottom: 1px solid rgba(42, 42, 42, 0.5);
      }
      .content-with-citations h3 {
        font-size: 1.15em;
        font-weight: 600;
        color: #f0f0f0;
        margin: 18px 0 6px;
      }
      .content-with-citations h4,
      .content-with-citations h5,
      .content-with-citations h6 {
        font-size: 1em;
        font-weight: 600;
        color: #e5e5e5;
        margin: 16px 0 4px;
      }

      .content-with-citations p {
        margin: 10px 0;
        line-height: 1.7;
      }
      .content-with-citations strong {
        color: #fafafa;
        font-weight: 600;
      }
      .content-with-citations em {
        color: #d4d4d4;
        font-style: italic;
      }

      .content-with-citations ul,
      .content-with-citations ol {
        margin: 8px 0;
        padding-left: 1.5em;
        list-style-position: outside;
      }
      .content-with-citations ul {
        list-style-type: disc;
      }
      .content-with-citations ol {
        list-style-type: decimal;
      }
      .content-with-citations li {
        margin: 4px 0;
        line-height: 1.7;
        color: #e0e0e0;
      }
      .content-with-citations li::marker {
        color: #9e9e9e;
      }
      .content-with-citations li > ul,
      .content-with-citations li > ol {
        margin: 4px 0;
      }
      .content-with-citations li > p {
        margin: 4px 0;
      }
      .content-with-citations ul ul {
        list-style-type: circle;
      }
      .content-with-citations ul ul ul {
        list-style-type: square;
      }

      .content-with-citations table {
        width: 100%;
        border-collapse: collapse;
        margin: 16px 0;
        font-size: 0.9em;
        border-radius: 6px;
        overflow: hidden;
        border: 1px solid #2a2a2a;
      }
      .content-with-citations thead th {
        background: #1a1a1a;
        color: #fafafa;
        font-weight: 600;
        text-align: left;
        padding: 10px 14px;
        border-bottom: 2px solid #333;
      }
      .content-with-citations tbody td {
        padding: 9px 14px;
        border-bottom: 1px solid #1e1e1e;
        color: #d4d4d4;
      }
      .content-with-citations tbody tr:hover {
        background: rgba(59, 130, 246, 0.04);
      }
      .content-with-citations tbody tr:last-child td {
        border-bottom: none;
      }

      .content-with-citations code {
        background: rgba(255, 255, 255, 0.06);
        color: #e5e5e5;
        padding: 0.15em 0.4em;
        border-radius: 4px;
        font-family: 'JetBrains Mono', 'Fira Code', 'Consolas', monospace;
        font-size: 0.875em;
      }
      .content-with-citations pre {
        background: #111;
        border: 1px solid #2a2a2a;
        border-radius: 8px;
        padding: 14px 18px;
        overflow-x: auto;
        margin: 16px 0;
      }
      .content-with-citations pre code {
        background: none;
        padding: 0;
        border-radius: 0;
        font-size: 0.85em;
        line-height: 1.6;
      }

      .content-with-citations blockquote {
        border-left: 3px solid #3b82f6;
        margin: 16px 0;
        padding: 8px 16px;
        color: #b0b0b0;
        background: rgba(59, 130, 246, 0.04);
        border-radius: 0 6px 6px 0;
      }
      .content-with-citations blockquote p {
        margin: 4px 0;
      }

      .content-with-citations blockquote.callout {
        padding: 12px 16px;
        border-radius: 0 8px 8px 0;
      }
      .content-with-citations .callout-insight {
        border-left-color: #3b82f6;
        background: rgba(59, 130, 246, 0.06);
      }
      .content-with-citations .callout-insight strong {
        color: #60a5fa;
      }
      .content-with-citations .callout-warning {
        border-left-color: #f59e0b;
        background: rgba(245, 158, 11, 0.06);
      }
      .content-with-citations .callout-warning strong {
        color: #fbbf24;
      }
      .content-with-citations .callout-metric {
        border-left-color: #10b981;
        background: rgba(16, 185, 129, 0.06);
      }
      .content-with-citations .callout-metric strong {
        color: #34d399;
      }
      .content-with-citations .callout-summary {
        border-left-color: #8b5cf6;
        background: rgba(139, 92, 246, 0.06);
      }
      .content-with-citations .callout-summary strong {
        color: #a78bfa;
      }

      .content-with-citations a {
        color: #60a5fa;
        text-decoration: none;
      }
      .content-with-citations a:hover {
        color: #93c5fd;
        text-decoration: underline;
      }

      .content-with-citations hr {
        border: none;
        border-top: 1px solid #2a2a2a;
        margin: 20px 0;
      }
      .content-with-citations del {
        color: #9e9e9e;
        text-decoration: line-through;
      }
    `,
  ],
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
  private parseContent(content: string, citations: ConceptCitation[]): ContentSegment[] {
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

    // Pass 2: Run marked.parse() to produce HTML, sanitize with DOMPurify
    const rawHtml = marked.parse(withPlaceholders, { async: false }) as string;
    // Add callout classes to blockquotes with specific Serbian keywords (D2)
    const withCallouts = rawHtml
      .replace(
        /<blockquote>\s*<p>\s*<strong>Ključni uvid:?<\/strong>/gi,
        '<blockquote class="callout callout-insight"><p><strong>Ključni uvid:</strong>'
      )
      .replace(
        /<blockquote>\s*<p>\s*<strong>Upozorenje:?<\/strong>/gi,
        '<blockquote class="callout callout-warning"><p><strong>Upozorenje:</strong>'
      )
      .replace(
        /<blockquote>\s*<p>\s*<strong>Metrika:?<\/strong>/gi,
        '<blockquote class="callout callout-metric"><p><strong>Metrika:</strong>'
      )
      .replace(
        /<blockquote>\s*<p>\s*<strong>Rezime:?<\/strong>/gi,
        '<blockquote class="callout callout-summary"><p><strong>Rezime:</strong>'
      );
    const html = DOMPurify.sanitize(withCallouts, PURIFY_CONFIG) as string;

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
