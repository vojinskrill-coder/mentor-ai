/**
 * Shared callout and citation transforms for markdown HTML.
 * Used by both frontend (concept-citation.component) and backend (PDF export).
 */

/**
 * Transforms standard blockquotes with Serbian callout keywords
 * into styled callout HTML with CSS classes.
 *
 * Supported callout types:
 * - "Ključni uvid:" → .callout-insight (blue)
 * - "Upozorenje:" → .callout-warning (amber)
 * - "Metrika:" → .callout-metric (green)
 * - "Rezime:" → .callout-summary (purple)
 */
export function applyCalloutTransforms(html: string): string {
  return html
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
}

/**
 * Replaces [[Concept Name]] citation markers with styled inline spans.
 * For PDF/non-interactive contexts — renders as visible text badges.
 */
export function applyCitationTransforms(html: string): string {
  return html.replace(/\[\[([^\]]+)\]\]/g, '<span class="citation-inline">$1</span>');
}
