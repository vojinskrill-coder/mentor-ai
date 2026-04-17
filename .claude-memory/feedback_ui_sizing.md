---
name: feedback_ui_sizing
description: UI sizing preferences - buttons, labels, tree view items must be consistent
type: feedback
---

User preferences for UI sizing:
- All buttons should be same size (reference: "Novi Razgovor" button in welcome screen)
- Tree view folder items should be same size as concept items
- Labels in maturity engine must NOT wrap — use white-space: nowrap
- Panel widths (tree view sidebar + exec panel) should persist in localStorage
- No CSS zoom — use clamp() for responsive design
- Middle panel content must fill 100% width (no max-width constraints)
- "Upravljanje" and "Podešavanja" labels removed from nav — use separator line instead
- AI Configuration and Dashboard links removed from tree view footer (moved to main nav)

**Why:** User works on large screen, needs consistent sizing and no text wrapping/overflow.
**How to apply:** Always use white-space: nowrap on labels inside flex containers. Use width: auto with min-width for label columns. Store panel widths in localStorage.
