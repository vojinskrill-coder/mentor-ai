---
name: feedback_responsive_layout
description: App needs responsive layout for large screens and resizable panels
type: feedback
---

App looks too small on large screens (1440p, 4K). Layout doesn't scale up — everything clusters to the left with wasted space.

**Why:** User works on a large monitor. Current fixed-width layout wastes screen real estate.

**How to apply:**
- AppShell layout needs fluid/responsive design — max-width should scale or be removed
- Sidebar, content area, and exec panel should use flexible proportions
- Exec panel (status/graph) and any tree panels should be **resizable** (drag handle)
- Consider CSS grid with `fr` units instead of fixed pixel widths
- Graph popup already uses `75vw` which is good — embedded views need similar treatment
- Test at 1920x1080, 2560x1440, and 3840x2160
