/**
 * Server-side markdown rendering.
 * Mirrors the frontend renderMarkdown() from shared/ui/src/lib/pipes/markdown-config.ts
 * but uses isomorphic-dompurify for Node.js compatibility.
 */ "use strict";
Object.defineProperty(exports, "__esModule", {
    value: true
});
Object.defineProperty(exports, "renderMarkdownServer", {
    enumerable: true,
    get: function() {
        return renderMarkdownServer;
    }
});
const _interop_require_default = require("@swc/helpers/_/_interop_require_default");
const _marked = require("marked");
const _isomorphicdompurify = /*#__PURE__*/ _interop_require_default._(require("isomorphic-dompurify"));
const _callouttransform = require("./callout-transform");
const PURIFY_CONFIG = {
    ADD_ATTR: [
        'target',
        'rel',
        'class'
    ],
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
        'img'
    ]
};
let initialized = false;
function ensureInitialized() {
    if (initialized) return;
    const renderer = new _marked.marked.Renderer();
    const originalLinkRenderer = renderer.link.bind(renderer);
    renderer.link = (token)=>{
        const html = originalLinkRenderer(token);
        return html.replace('<a ', '<a target="_blank" rel="noopener noreferrer" ');
    };
    _marked.marked.setOptions({
        gfm: true,
        breaks: true,
        renderer
    });
    initialized = true;
}
function renderMarkdownServer(value) {
    if (!value) return '';
    ensureInitialized();
    const rawHtml = _marked.marked.parse(value, {
        async: false
    });
    const withCallouts = (0, _callouttransform.applyCalloutTransforms)(rawHtml);
    const withCitations = (0, _callouttransform.applyCitationTransforms)(withCallouts);
    return _isomorphicdompurify.default.sanitize(withCitations, PURIFY_CONFIG);
}

//# sourceMappingURL=markdown-server.js.map