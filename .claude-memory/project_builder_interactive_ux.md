---
name: Process Builder Interactive UX Requirements
description: Builder must present MCP tool choices as interactive cards with radio buttons in chat, not plaintext. Input field mapping must work.
type: project
---

## Critical UX Requirements (from user, 2026-04-10)

### 1. MCP Tool Selection — Interactive Cards
Builder must NOT assume which MCP tool to use. Instead:
- Show connected tools as selectable cards with radio buttons in chat
- User clicks to select (e.g., "Save to: ○ Apollo ○ Notion ○ Google Sheets")
- Then show available operations as checkboxes (e.g., "☑ enrich_person ☐ enrich_organization")
- Only after user selects → builder uses those choices in the design

### 2. Operation Suggestions
After user picks the primary tool, builder suggests useful operations:
- "Apollo has these operations for your process: enrich_person (email, phone, LinkedIn), enrich_organization (revenue, employees). Which do you want to include?"
- Rendered as checkbox cards, not text

### 3. Input Field Mapping MUST WORK
- `region` parameter was ignored — n8n MCP node didn't receive it
- `fieldBindings` in designArtifact must correctly map to MCP body parameters
- IR compiler `buildMcpBodyTemplate()` must resolve `{ source: "manual", field: "region" }` into the actual n8n expression
- Test with real input to verify fields propagate

### 4. No Notion by Default
- `deploy()` creates Notion DB whenever `notionSchema` exists in design
- If user chose Apollo for save → design should NOT have `notionSchema`
- Builder must ask where to save, not default to Notion

## Implementation Status — DONE (2026-04-10)

### Completed:
- ✅ ChatMessage interface extended with choice fields (choiceType, choices, selectedChoice, selectedOperations)
- ✅ Template renders radio button cards for tool_select, checkbox cards for operation_checklist
- ✅ toggleOperation() and submitChoice() methods send SELECTED_TOOL/SELECTED_OPERATIONS back to builder
- ✅ tryExtractChoiceCards() parses TOOL_SELECT/OPERATION_SELECT JSON from AI output
- ✅ CSS for choice cards (dark theme, colored kind badges, connected status)
- ✅ Builder SOUL v3: Stage 1 ASK mandatory before design, uses verifiedOperations only
- ✅ Settings Integrations: per-operation status display (✓ Verified / ✗ Not available / ? Not tested)
- ✅ Gateway listToolsForTenant returns verifiedOperations + failedOperations

### Still needed (NEXT SESSION):
- **SOUL rewrite to WIZARD_CARD format** — local SOUL has TOOL_SELECT, needs full replacement with WIZARD_CARD Steps A-G. Frontend is READY to render them.
- WIZARD_CARD format: `WIZARD_CARD: {"type":"tool_select"|"operation_select"|"input_fields"|"output_columns"|"pipeline_preview"|"confirm", ...}`
- Frontend responses: `WIZARD_TOOL:`, `WIZARD_OPERATIONS:`, `WIZARD_INPUTS:`, `WIZARD_COLUMNS:`, `WIZARD_PIPELINE_CONFIRMED`, `WIZARD_CONFIRMED`
- fieldBindings → input field mapping fix (region parameter)
- Notion creation only when user chooses Notion (not auto)
- Re-probe button in Settings UI
- Brave Search TenantCredential added (key: BRAVE_KEY_REDACTED)
- Test full wizard flow end-to-end

## Original Implementation Plan

### Backend
- New message type in builder chat: `structured_choice`
- Schema: `{ type: "tool_select" | "operation_checklist" | "confirm", options: [...], selected?: string }`
- Builder agent returns these as JSON blocks in its output
- Chat SSE stream forwards them as special events

### Frontend (process-design.component.ts)
- Detect `structured_choice` in assistant messages
- Render as interactive cards (radio buttons for single-select, checkboxes for multi-select)
- On user selection → send choice back as chat message
- Style: dark cards (#1A1A1A), tool icons, operation badges (search=blue, write=green, read=purple)

### Process Builder SOUL
- Stage 1: Grounding (business context + MCP catalog)
- Stage 2: Show tool selection cards → wait for user choice
- Stage 3: Show operation checklist based on selected tool → wait
- Stage 4: Propose process design using user's choices
- Stage 5: User confirms → submit to orchestrator

### fieldBindings Fix
- Check `buildMcpBodyTemplate()` in process-ir.ts
- Verify n8n expression `$json.body.input?.region` actually resolves
- Test with a real run that passes `input: { region: "Italy" }`
