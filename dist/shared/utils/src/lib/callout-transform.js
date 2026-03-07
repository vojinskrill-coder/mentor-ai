/**
 * Shared callout and citation transforms for markdown HTML.
 * Used by both frontend (concept-citation.component) and backend (PDF export).
 */ /**
 * Transforms standard blockquotes with Serbian callout keywords
 * into styled callout HTML with CSS classes.
 *
 * Supported callout types:
 * - "Ključni uvid:" → .callout-insight (blue)
 * - "Upozorenje:" → .callout-warning (amber)
 * - "Metrika:" → .callout-metric (green)
 * - "Rezime:" → .callout-summary (purple)
 */ "use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
function _export(target, all) {
    for(var name in all)Object.defineProperty(target, name, {
        enumerable: true,
        get: all[name]
    });
}
_export(exports, {
    applyCalloutTransforms: function() {
        return applyCalloutTransforms;
    },
    applyCitationTransforms: function() {
        return applyCitationTransforms;
    }
});
function applyCalloutTransforms(html) {
    return html.replace(/<blockquote>\s*<p>\s*<strong>Ključni uvid:?<\/strong>/gi, '<blockquote class="callout callout-insight"><p><strong>Ključni uvid:</strong>').replace(/<blockquote>\s*<p>\s*<strong>Upozorenje:?<\/strong>/gi, '<blockquote class="callout callout-warning"><p><strong>Upozorenje:</strong>').replace(/<blockquote>\s*<p>\s*<strong>Metrika:?<\/strong>/gi, '<blockquote class="callout callout-metric"><p><strong>Metrika:</strong>').replace(/<blockquote>\s*<p>\s*<strong>Rezime:?<\/strong>/gi, '<blockquote class="callout callout-summary"><p><strong>Rezime:</strong>');
}
function applyCitationTransforms(html) {
    return html.replace(/\[\[([^\]]+)\]\]/g, '<span class="citation-inline">$1</span>');
}

//# sourceMappingURL=callout-transform.js.map