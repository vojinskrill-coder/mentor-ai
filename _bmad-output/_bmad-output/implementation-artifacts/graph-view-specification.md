# Graph View Component — Full Specification

## Context / Goal

Implement a **Graph View control** that visualizes concepts/notes and their relationships (Obsidian-style), while also visualizing **live agent activity and collaboration**.

The Graph shows:
- concepts (notes) as nodes
- relationships between notes as edges
- agents working on concepts (animated dots with persona colors)
- background agent activity
- collaboration between agents
- real-time updates while workflows run

The Graph is both a **knowledge graph visualization** and a **live activity visualization layer**.

---

## 1. Placement in Layout

- Graph placed in the **panel area currently used by the Status bar/component**
- Supports **show/hide behavior identical to the Status component**
- Integrates with the same panel toggle mechanism

## 2. Popup Graph Mode (Obsidian-like)

- Popup occupies approximately **70% of screen size**
- Popup remains fully interactive: zoom, pan, drag nodes, physics, click, animations, live updates

## 3. Graph Data Model

- **NOT a separate data model** — visualizes existing notes/concepts and relationships
- Single source of truth: same state used by Tree View, Notes, Relationships
- Graph is **only a visualization layer**

## 4. Node Identity Rules

- Node ID = stable concept/note ID
- A concept must **never appear more than once**
- New relationships create edges, never duplicate nodes

## 5. Relationships and Linking (Obsidian-style)

- Existing note relationships become graph edges
- No separate graph linking mechanism
- No duplicate edges for same relationship

## 6. Graph Rendering Behavior

### 6.1 Node labels
- Display note/concept title
- Tooltip: note path, metadata, concept type

### 6.2 Physics
- Force-directed layout: node repulsion, edge springs, stabilization damping
- Drag nodes with physical reaction of surrounding nodes

## 7. Navigation Controls

- Zoom in/out, pan canvas, drag nodes, reset zoom, fit graph to view

## 8. Clicking Nodes

- Navigate to corresponding note in Tree View
- Expand Tree View path, reveal and select node
- Event: `onNoteActivated(noteId, notePath)` → `revealInTree(notePath)`, `selectTreeNode(noteId)`

## 9. Agent Visualization

- Agents appear as **small animated dots/markers**
- Color = persona color (consistent across app)

## 10. Agent Activity Visualization

- Concept node shows **pulse animation** when being processed
- Animation between agent → concept (moving particle, directional glow, flowing link)

## 11. Background Agent Activity

- Background agents appear active with animation
- User sees work is happening even if not user-triggered

## 12. Agent Collaboration Visualization

- Animate interactions across connected nodes when multiple agents collaborate
- Animated flow along edges, synchronized pulses, edge glow for handoffs
- Visible but not overwhelming; preserve persona colors

## 13. Animation Lifecycle

- While working: pulse + interaction + collaboration animations
- When finished: stop all animations, update agent status

## 14. Concept Creation Animation

- Scale-in or fade-in, 150–300ms

## 15. Relationship Creation Animation

- Blue pulse, 600–1200ms, only on first creation

## 16. Live Updates

Events that update graph: concept CRUD, relationship CRUD, workflow start/complete/fail, task CRUD/status, agent start/stop/assign/collaborate, background activity.

## 17. Event Synchronization

- Subscribe to existing event bus/state system
- React to add/remove nodes/edges, start/stop animations
- Properly dispose subscriptions on unload

## 18. Performance

- Smooth with hundreds of nodes
- Incremental updates, no full rebuilds
- Throttle events, prevent memory leaks, clean up timers

## 19. Architecture Constraints

- Follow existing Angular architecture
- Integrate with Tree View navigation and panel toggle
- Use existing relationship model and event bus
- Graph library: choose one (d3-force / cytoscape / sigma) that supports physics, zoom/pan, live updates, custom animations, click interactions

## 20. Acceptance Criteria

1. Graph in status bar panel location
2. Show/hide like Status component
3. Popup view (70% screen)
4. Obsidian-like interaction in popup
5. No duplicate nodes
6. Correct relationships
7. Node creation animation
8. Relationship creation animation
9. Concept pulse during work
10. Agent-concept interaction animation
11. Agent collaboration animation
12. Agent dots use persona colors
13. Animations stop when work completes
14. Click node → reveal in Tree View
15. Live event-driven updates
16. Stable and responsive performance
