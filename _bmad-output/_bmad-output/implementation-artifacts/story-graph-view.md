# Story: Knowledge Graph View with Live Agent Activity

**Status:** ready-for-dev
**Priority:** high
**Epic:** Business Brain Visualization
**Estimated effort:** 2-3 days

---

## User Story

**As a** business owner using the maturity dashboard,
**I want** to see a visual graph of my active business concepts and agent activity,
**So that** I can understand concept relationships, track execution progress, and see agents collaborating in real-time.

---

## Key Design Decisions

- **Library:** d3-force + HTML5 Canvas (lightweight, full animation control, good for ~50-100 nodes)
- **Data:** Dynamic — only concepts with tasks/conversations appear (NOT all 716 concepts)
- **Growth:** Graph grows in real-time as execution progresses — nodes appear as concepts get tasks
- **Single source of truth:** Same data as Tree View and Notes — graph is a visualization layer only
- **Rendering:** Canvas-based for performance (not DOM nodes)

---

## Architecture

```
Backend:
  GET /api/v1/maturity/graph?stage=BASIC
  → { nodes[], edges[], activeAgents[] }
  WebSocket events → incremental graph updates

Frontend:
  GraphStateService → transforms data, subscribes to WS events
  GraphAnimationService → manages pulse/particle/collaboration animations
  GraphViewComponent → Canvas renderer with d3-force physics
  GraphPopupComponent → 70% screen overlay
  GraphControlsComponent → zoom/pan/fit buttons
```

### Data Flow
```
API (initial load) ──→ GraphStateService ──→ d3-force simulation ──→ Canvas render
                            ↑
WebSocket events ───────────┘
  task:ai-start         → add node pulse, show agent dot
  task:ai-complete      → stop pulse, update node state
  agent:status-change   → agent dot appears/disappears
  agent:tool-event      → agent activity indicator
  maturity:execution-progress → current concept highlight
  jobs:planned          → show job chain edges
  maturity:stage-initialized → bulk node creation
```

### Persona Colors (consistent across app)
```typescript
const PERSONA_COLORS: Record<string, string> = {
  CFO: '#10B981',       // emerald
  CMO: '#F59E0B',       // amber
  CTO: '#6366F1',       // indigo
  OPERATIONS: '#EF4444', // red
  LEGAL: '#8B5CF6',     // violet
  CREATIVE: '#EC4899',   // pink
  CSO: '#14B8A6',       // teal
  SALES: '#F97316',     // orange
};
```

---

## Tasks

### Task 1: Graph Data API + Frontend Service

- [ ] 1.1 **Backend:** Create `GET /api/v1/maturity/graph` endpoint
  - Returns only concepts with active tasks (noteId IS NOT NULL)
  - Edges only between concepts where BOTH sides are in the active set
  - Includes current agent activity (running executions/jobs)
  - Response shape:
    ```typescript
    {
      nodes: Array<{
        id: string;           // conceptId
        name: string;         // concept name
        category: string;     // concept category
        status: string;       // assignment status: PENDING | IN_PROGRESS | COMPLETED
        personaType: string;  // CFO, CMO, etc.
        aiScore: number | null;
        noteId: string;
      }>;
      edges: Array<{
        source: string;       // source conceptId
        target: string;       // target conceptId
        type: string;         // PREREQUISITE | RELATED | ADVANCED
      }>;
      activeAgents: Array<{
        agentType: string;    // web_search, content, etc.
        conceptId: string;    // which concept they're working on
        personaType: string;  // persona that owns this concept
        status: string;       // EXECUTING, FORMATTING, etc.
      }>;
    }
    ```
  - **File:** `apps/api/src/app/maturity/maturity.controller.ts` — new endpoint
  - **File:** `apps/api/src/app/maturity/maturity-engine.service.ts` — new method `getGraphData()`

- [ ] 1.2 **Frontend:** Create `GraphStateService`
  - Fetches graph data from API on init
  - Transforms to internal `{nodes: Map, edges: Map}` with stable IDs
  - Subscribes to WebSocket events for incremental updates:
    - New concept activated → add node (with creation animation flag)
    - Concept status changed → update node state
    - Agent started/stopped → update activeAgents
    - Relationship discovered → add edge (with creation animation flag)
  - Deduplication: Map keyed by conceptId (nodes) and `source:target:type` (edges)
  - Exposes observables: `nodes$`, `edges$`, `activeAgents$`, `graphUpdated$`
  - **File:** `apps/web/src/app/features/graph/graph-state.service.ts`

- [ ] 1.3 **Backend:** Emit `agent:concept-activity` WebSocket event
  - Emitted when agent starts/stops working on a specific concept
  - Payload: `{ agentType, conceptId, personaType, status: 'started' | 'stopped' }`
  - Emit from `agent-execution.service.ts` at pipeline start/end
  - **File:** `apps/api/src/app/agent-execution/agent-execution.service.ts`

### Task 2: Core Graph Renderer (Canvas + d3-force)

- [ ] 2.1 Create `GraphViewComponent` with HTML5 Canvas element
  - Input: `embedded` (boolean) — controls label visibility and density
  - Canvas resizes to container (ResizeObserver)
  - requestAnimationFrame render loop
  - **File:** `apps/web/src/app/features/graph/graph-view.component.ts`

- [ ] 2.2 Integrate d3-force simulation
  - `d3.forceSimulation(nodes)`
  - `.force('charge', d3.forceManyBody().strength(-200))` — node repulsion
  - `.force('link', d3.forceLink(edges).distance(80))` — edge springs
  - `.force('center', d3.forceCenter(width/2, height/2))` — centering
  - `.force('collide', d3.forceCollide(30))` — prevent overlap
  - Alpha decay for stabilization
  - Simulation restarts when nodes/edges change (incremental, not full rebuild)

- [ ] 2.3 Render nodes and edges on Canvas
  - Nodes: filled circles, size based on status (completed=larger), color=persona color
  - Node labels: concept name (truncated to ~20 chars), only in popup mode or on hover in embedded
  - Edges: lines colored by relationship type (PREREQUISITE=solid, RELATED=dashed, ADVANCED=dotted)
  - Edge opacity: 0.3 default, 1.0 when connected to hovered/selected node

- [ ] 2.4 Mouse interaction
  - Zoom: mouse wheel → scale transform
  - Pan: click+drag on empty canvas → translate transform
  - Drag node: click+drag on node → update node position, d3 reheat
  - Hover: highlight node + connected edges + show tooltip
  - Transform state: `{x, y, scale}` managed internally

- [ ] 2.5 Node click → emit `onNoteActivated`
  - Hit detection: check mouse position against node positions (radius-based)
  - Output event: `@Output() noteActivated = new EventEmitter<{noteId: string, conceptId: string}>()`
  - Parent component handles Tree View navigation

- [ ] 2.6 Node deduplication enforcement
  - Nodes stored in `Map<string, GraphNode>` keyed by conceptId
  - `addNode()` checks existence before adding
  - `addEdge()` checks `${source}:${target}:${type}` key before adding

### Task 3: Layout Integration

- [ ] 3.1 Integrate into AppShell status bar panel area
  - Add graph toggle button alongside existing status toggle
  - Graph component renders in the upper portion of the status panel area
  - Show/hide with same animation as status component
  - **File:** `apps/web/src/app/core/layout/app-shell.component.ts`

- [ ] 3.2 Create `GraphPopupComponent`
  - Overlay/dialog at 70% viewport width × 70% viewport height
  - Centered on screen with backdrop
  - Contains `GraphViewComponent` with `embedded=false`
  - Close button (top-right) + Escape key
  - Opened via button in embedded graph (expand icon)
  - **File:** `apps/web/src/app/features/graph/graph-popup.component.ts`

- [ ] 3.3 Graph controls overlay
  - Positioned bottom-right of canvas
  - Buttons: zoom in (+), zoom out (-), fit to view, reset
  - Expand to popup button (top-right)
  - Semi-transparent background, visible on hover
  - **File:** Part of `GraphViewComponent` template

### Task 4: Agent Activity Visualization

- [ ] 4.1 Agent dots
  - Small circles (radius=6) near the concept node they're working on
  - Color = persona color of the owning persona
  - Orbit animation: slow rotation around concept node (subtle, ~4s period)
  - Multiple agents on same concept = multiple dots at different orbit angles
  - Agent type label on hover

- [ ] 4.2 Concept pulse animation
  - When concept is being processed: radial glow expanding from node
  - Pulse color = persona color at 30% opacity
  - Pulse period: ~2s (breathe in/out)
  - Stacks with node render (drawn behind node circle)

- [ ] 4.3 Agent-to-concept connection animation
  - Particle (small dot) moves from agent dot toward concept node center
  - Speed: ~1.5s per particle
  - New particle spawns every ~2s while agent is active
  - Color matches persona

- [ ] 4.4 Animation lifecycle management
  - `GraphAnimationService` tracks active animations per conceptId
  - Start: on `task:ai-start` or `agent:concept-activity(started)`
  - Stop: on `task:ai-complete` or `agent:concept-activity(stopped)`
  - Cleanup: clear all animation state when component destroys
  - **File:** `apps/web/src/app/features/graph/graph-animation.service.ts`

### Task 5: Collaboration + Creation Animations

- [ ] 5.1 Collaboration flow
  - When agents work on connected concepts simultaneously:
  - Particles flow along the connecting edge
  - Color: blend of both persona colors (or alternating)
  - Active only while both endpoints have running agents
  - Detected via `activeAgents` — if two active agents' concepts share an edge

- [ ] 5.2 New node creation animation
  - Node scales from 0 to full size over 200ms (ease-out)
  - Brief bright flash at full size
  - Triggered when `GraphStateService` adds a node with `isNew=true` flag

- [ ] 5.3 New edge creation animation
  - Edge draws itself: line extends from source to target over 800ms
  - Blue pulse travels along the edge once
  - Triggered when `GraphStateService` adds an edge with `isNew=true` flag

- [ ] 5.4 Execution complete
  - When `maturity:execution-complete` fires:
  - All pulse animations fade out over 500ms
  - Agent dots fade out
  - Collaboration particles stop
  - Nodes settle to final physics state

### Task 6: Tree View Navigation Integration

- [ ] 6.1 Node click → Tree View reveal
  - `GraphViewComponent` emits `noteActivated` event with `{noteId, conceptId}`
  - `AppShellComponent` handles: find note in Tree View, expand path, select node
  - If Tree View not visible, show it first
  - **File:** `apps/web/src/app/core/layout/app-shell.component.ts` — handler

- [ ] 6.2 Graceful fallback
  - If note not found in Tree View data, show toast: "Koncept nije pronađen u stablu"
  - Never crash or throw unhandled error

### Task 7: Tests

- [ ] 7.1 `GraphStateService` — node deduplication
  - Add same conceptId twice → only one node in Map
  - Verify via `nodes$.value.size`

- [ ] 7.2 `GraphStateService` — edge deduplication
  - Add same source:target:type twice → only one edge
  - Verify via `edges$.value.size`

- [ ] 7.3 Event synchronization
  - Mock WebSocket events (task:ai-start, task:ai-complete, agent:concept-activity)
  - Verify graph state updates: node added, pulse started, pulse stopped
  - Verify activeAgents list updates

- [ ] 7.4 Node click navigation
  - Simulate click on node position
  - Verify `noteActivated` event emitted with correct IDs

---

## Acceptance Criteria

- [ ] AC1: Graph appears in status bar panel area, toggles show/hide
- [ ] AC2: Popup mode opens at 70% screen, fully interactive (zoom, pan, drag, click)
- [ ] AC3: Each concept appears exactly once (no duplicates)
- [ ] AC4: Only concepts with tasks/conversations appear (not all 716)
- [ ] AC5: Relationships render as edges (only between active concepts)
- [ ] AC6: Force-directed physics layout with drag, zoom, pan
- [ ] AC7: Concept pulse animation during agent work
- [ ] AC8: Agent dots with persona colors appear near active concepts
- [ ] AC9: Collaboration animation on connected concepts with simultaneous agents
- [ ] AC10: New node scale-in animation (150-300ms)
- [ ] AC11: New edge trace animation (600-1200ms)
- [ ] AC12: Animations stop when execution completes
- [ ] AC13: Click node → navigates to Tree View, expands path, selects note
- [ ] AC14: Live updates via WebSocket events (no manual refresh needed)
- [ ] AC15: Smooth performance with 55+ nodes and active animations

---

## File List (Expected)

### New Files
- `apps/web/src/app/features/graph/graph-view.component.ts`
- `apps/web/src/app/features/graph/graph-popup.component.ts`
- `apps/web/src/app/features/graph/graph-state.service.ts`
- `apps/web/src/app/features/graph/graph-animation.service.ts`
- `apps/web/src/app/features/graph/graph-state.service.spec.ts`

### Modified Files
- `apps/api/src/app/maturity/maturity.controller.ts` — new graph endpoint
- `apps/api/src/app/maturity/maturity-engine.service.ts` — new `getGraphData()` method
- `apps/api/src/app/agent-execution/agent-execution.service.ts` — emit `agent:concept-activity`
- `apps/web/src/app/core/layout/app-shell.component.ts` — graph panel integration + navigation handler
- `apps/web/src/app/app.routes.ts` — graph route (if separate page needed)
- `package.json` — add `d3-force`, `d3-selection` dependencies

---

## Dependencies

- `d3-force` — physics simulation
- `d3-selection` — DOM helpers (minimal use, mainly for types)
- No other new dependencies required

---

## Notes

- Graph is read-only visualization — no editing concepts/relationships from graph
- Persona colors must match maturity dashboard persona grid exactly
- Canvas rendering chosen over SVG for animation performance at 50+ nodes
- d3-force simulation runs at 60fps, render throttled to match requestAnimationFrame
- Embedded view shows minimal labels; popup view shows full labels
- All WebSocket subscriptions cleaned up on component destroy (takeUntilDestroyed)
