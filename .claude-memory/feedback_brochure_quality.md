---
name: Brochure Quality Issues
description: Critical feedback on brochure generation output quality - text overflow, image context, font sizes, content relevance
type: feedback
---

User identified these brochure rendering problems (2026-04-01):

1. **Text overflow/cut** — when title or subtitle is too long, text gets clipped. Elements below should AUTO-FLOW down to accommodate longer text instead of using fixed absolute positioning.
**Why:** Fixed percentage-based positioning means text can't grow. Need flexible layout or at minimum auto-sizing text containers.
**How to apply:** Consider CSS flexbox columns instead of absolute % positioning for text areas, or implement text-fit logic.

2. **Not using real sculptures** — brochure images should use tenant's actual product photos (Hetzner reference images) via FAL.ai Kontext compositing, NOT generic text-to-image. Same as Instagram Content process.
**Why:** Generic AI images don't represent the actual products. The whole point is to showcase REAL sculptures in contextual scenes.
**How to apply:** Brochure image generation must use `generateComposite()` not `generateImage()`, pulling reference sculpture photos from Hetzner.

3. **Insufficient and non-contextual text** — body text is too short and generic. Needs to be rich, detailed, and contextually relevant to the page topic.
**Why:** AI generates safe generic text. Needs stronger prompts with page-specific context.
**How to apply:** Prompt must include page topic, what's being communicated, target audience expectations for that section.

4. **Quote text too small** — citations/quotes rendered in tiny font, should be more prominent.
**Why:** Quote font size (10pt) is too small for a brochure pull-quote. Should be larger and more visually impactful.
**How to apply:** Increase quote font size in brand profile (at least 14-16pt).

5. **Images and text not contextually aligned** — e.g., "Vision" page shows a generic statue photo instead of architect sketches, planning meetings, design process. The Prompt Optimizer must understand the PAGE CONTEXT when generating images.
**Why:** Image prompts are generic ("sculpture in architectural space") instead of contextual ("architect reviewing sculpture sketches on drafting table").
**How to apply:** Pass page title AND page description to image prompt. Prompt Optimizer must reason about what visual best represents the page's message, not just "show a sculpture".
