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
export declare function applyCalloutTransforms(html: string): string;
/**
 * Replaces [[Concept Name]] citation markers with styled inline spans.
 * For PDF/non-interactive contexts — renders as visible text badges.
 */
export declare function applyCitationTransforms(html: string): string;
