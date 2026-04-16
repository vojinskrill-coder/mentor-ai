---
title: 'Interactive Task Workflow Execution with Comprehensive Busy Indicators'
slug: 'interactive-task-workflow-execution'
created: '2026-02-09'
status: 'ready-for-dev'
stepsCompleted: [1, 2, 3, 4]
tech_stack: ['Angular 21', 'NestJS', 'Socket.io', 'PostgreSQL', 'Qdrant', 'Prisma 5.x', 'Nx monorepo']
files_to_modify:
  - 'apps/web/src/app/features/chat/chat.component.ts'
  - 'apps/web/src/app/features/chat/components/conversation-notes.component.ts'
  - 'apps/web/src/app/features/chat/components/chat-input.component.ts'
  - 'apps/web/src/app/features/chat/components/concept-tree.component.ts'
  - 'apps/web/src/app/features/chat/services/chat-websocket.service.ts'
  - 'apps/web/src/app/features/chat/services/conversation.service.ts'
  - 'apps/api/src/app/conversation/conversation.gateway.ts'
  - 'apps/api/src/app/workflow/workflow.service.ts'
  - 'libs/shared/types/src/lib/types.ts'
code_patterns:
  - 'Signals with $ suffix for component state'
  - 'WebSocket domain:action event format'
  - 'ExecutionCallbacks interface for step lifecycle'
  - 'Promise-based stepResolvers Map for pause/resume'
  - 'Set-based per-item loading (scoringInProgress pattern)'
  - 'Inline templates with pure CSS (no Tailwind in components)'
  - 'Standalone components with inject() function'
test_patterns:
  - 'Jest + @angular/core/testing for frontend'
  - 'Jest + @nestjs/testing for backend'
  - 'Co-located .spec.ts files'
  - '8 existing spec files in chat feature'
  - '0 spec files in workflow service (gap)'
---

# Tech-Spec: Interactive Task Workflow Execution with Comprehensive Busy Indicators

**Created:** 2026-02-09

## Overview

### Problem Statement

Users can trigger workflow execution from the Notes panel, but the workflow runs autonomously (fire-and-forget) with no ability for the user to interact during execution. Steps execute silently and results appear as progress bars, not as a conversation. Additionally, several UI components lack loading indicators when awaiting server responses, creating a poor UX where the user doesn't know if an action registered.

### Solution

Transform workflow execution into an interactive, conversational experience. When a task (single or multi-select) is executed, create a per-concept conversation and navigate the user to it. Each workflow step appears as an AI message in the chat — some steps require user text input before proceeding, others just need a "Continue" confirmation. Separately, audit and fix all missing busy indicators across the application.

### Scope

**In Scope:**
- Single task "Execute" button on each task card -> generates workflow for that task
- Multi-select tasks + "Run Agents" button (existing behavior, enhanced)
- Busy indicator while workflow is being generated (between click and plan display)
- Per-concept conversation creation + auto-navigate to it
- Workflow steps rendered as chat messages (AI asks -> user responds or confirms -> next step)
- Hybrid interaction: some steps need text input, others need "Continue" button
- Fix ALL missing busy indicators:
  - Conversation creation (new conversation, from tree, from topic picker)
  - Individual task actions (delete, submit report, score report)
  - Tree lock visual indication during workflow
  - Double-click protection on action buttons

**Out of Scope:**
- Parallel execution of multiple workflows simultaneously
- Workflow editing/customization UI
- Risk classification / approval gates (Epic 13 -- future)
- New WorkflowTask DB model (Epic 10 -- future, we use existing Notes/Tasks)
- Voice commands

## Context for Development

### Codebase Patterns

- **Signals for state:** All component state uses Angular `signal()` with `$` suffix naming
- **WebSocket events:** `domain:action` format (e.g., `workflow:step-progress`, `chat:message-chunk`)
- **ExecutionCallbacks interface:** 7 callbacks for step lifecycle -- `onStepStart`, `onStepChunk`, `onStepComplete`, `onStepFailed`, `onStepAwaitingConfirmation`, `onComplete`, `saveMessage`
- **Promise-based pause/resume:** `stepResolvers` Map<string, resolver> -- `executePlan()` awaits Promise before each step, `continueStep(planId, userInput?)` resolves it
- **User input injection:** User text added to `completedSummaries[]` array -> injected into system prompt for current step
- **Per-item loading:** `scoringInProgress` Signal<Set<string>> pattern for per-task busy states -- the RIGHT pattern to replicate
- **Standalone components:** All components use `standalone: true`, no NgModules
- **Inline templates with pure CSS:** Tailwind v4 doesn't process inline templates; all styles use pure CSS class definitions
- **RFC 7807 errors:** All error responses use ProblemDetails format via global AllExceptionsFilter

### Files to Reference

| File | Purpose | Key Lines |
| ---- | ------- | --------- |
| `apps/web/src/app/features/chat/chat.component.ts` | Main chat UI -- workflow event handlers, plan overlay, step confirmation, message rendering | L1079 `onRunAgents()`, L1089 `approvePlan()`, L1250-1418 event handlers, L1420 `continueWorkflow()` |
| `apps/web/src/app/features/chat/components/conversation-notes.component.ts` | Task panel -- "Run Agents" button, task card UI, report/score actions | L366 Run Agents btn, L621 signals, L757 `submitReport()`, L773 `scoreReport()`, L806 `deleteNote()` |
| `apps/web/src/app/features/chat/components/chat-input.component.ts` | Chat text input -- disabled binding, send mechanism, spinner when loading | L155 `disabled` input, L135-144 spinner/@if, L169 `send()` |
| `apps/web/src/app/features/chat/components/concept-tree.component.ts` | Tree view -- loading skeleton, conversation navigation, refresh | L259 `isLoading$`, L268 `loadTree()`, L299 `onConversationSelect()` |
| `apps/web/src/app/features/chat/services/chat-websocket.service.ts` | WebSocket client -- all event emitters and listeners | L156 `emitRunAgents()`, L161 `emitWorkflowApproval()`, L171 `emitStepContinue()` |
| `apps/web/src/app/features/chat/services/conversation.service.ts` | Conversation CRUD -- HTTP createConversation, no loading signal | `createConversation()` method |
| `apps/api/src/app/conversation/conversation.gateway.ts` | Backend gateway -- handleRunAgents, handleWorkflowApproval, handleStepContinue, autoExecuteWorkflow | L802 `handleRunAgents`, L845 `handleWorkflowApproval`, L1046 `handleStepContinue`, L1063 `autoExecuteWorkflow` |
| `apps/api/src/app/workflow/workflow.service.ts` | Execution engine -- executePlan loop, executeStep, continueStep, cancelPlan | L412 `executePlan()`, L572 `executeStep()`, L797 `continueStep()`, L779 `cancelPlan()` |
| `libs/shared/types/src/lib/types.ts` | Shared types -- ExecutionPlan, ExecutionPlanStep, WorkflowStep, all payload interfaces | L1308-1398 workflow types |

### Technical Decisions

**Decided (Party Mode consensus + investigation):**

1. **New `workflow:step-awaiting-input` event** -- Do NOT overload existing `workflow:step-awaiting-confirmation`. New event carries `inputType: 'text' | 'confirmation'` discriminator. Existing `workflow:step-continue` reused for both Continue clicks and text submissions.

2. **Workflow steps as complete (non-streamed) messages** -- Emit full step message via `workflow:step-message` event. Frontend pushes complete message object into `messages$` with `metadata: { isWorkflowStep: true, stepIndex, totalSteps, inputType }`. Existing `chat-message.component.ts` renders step badge. No streaming involved.

3. **Per-action LoadingState signals** -- Not global. Follow the `scoringInProgress` Set pattern: `deletingInProgress$: Signal<Set<string>>`, `submittingInProgress$: Signal<Set<string>>`. For conversation creation: `isCreatingConversation$: Signal<boolean>`.

4. **Auto-navigate with transition feedback** -- Show toast "Opening workflow conversation..." -> create conversation -> navigate -> show "Preparing workflow..." in empty conversation until first step arrives. Store `previousConversationId$` for "Return to previous" link after workflow completes.

5. **Chat input selective re-enable during workflow** -- Add `allowWorkflowInput$` signal. When `workflow:step-awaiting-input` fires with `inputType: 'text'`, set true -> chat input re-enables. When user submits, set false again.

### Existing Infrastructure (Already Built)

| Feature | Status | Location |
| ------- | ------ | -------- |
| `ExecutionCallbacks` interface | Complete | `workflow.service.ts:47-55` |
| `stepResolvers` Map for pause/resume | Complete | `workflow.service.ts:66, 440-446, 797-804` |
| `continueStep(planId, userInput?)` | Complete | `workflow.service.ts:797-804` |
| User input -> `completedSummaries` injection | Complete | `workflow.service.ts:457-463` |
| Per-concept conversation creation | Complete | `conversation.gateway.ts:869-906` |
| `workflow:step-awaiting-confirmation` event | Complete | `conversation.gateway.ts:963-979` |
| `workflow:step-continue` handler | Complete | `conversation.gateway.ts:1046-1057` |
| Plan approval overlay UI | Complete | `chat.component.ts:374-433` |
| Inline execution progress display | Complete | `chat.component.ts:539-587` |
| Step confirmation UI with textarea | Complete | `chat.component.ts:1411-1417, 1620-1627` |
| `scoringInProgress` per-item Set pattern | Complete | `conversation-notes.component.ts:647, 773-790` |
| Concept tree skeleton loading | Complete | `concept-tree.component.ts:144-153` |
| Chat input disabled + spinner | Complete | `chat-input.component.ts:135-144` |

### Busy Indicator Audit -- Gaps Found

| Component | Action | Current State | Gap |
| --------- | ------ | ------------- | --- |
| `chat.component.ts` | `onRunAgents()` click -> plan generation | `isExecutingWorkflow$` set ONLY on approve, not on initial click | No indicator between "Run Agents" click and plan display |
| `chat.component.ts` | Conversation creation (from tree, topic picker) | No loading signal | User clicks, nothing visible happens for 1-2s |
| `conversation-notes.component.ts` | `deleteNote()` | Optimistic removal, no busy state | Double-click can trigger double-delete |
| `conversation-notes.component.ts` | `submitReport()` | No busy state during API call | Button stays enabled, user can double-click |
| `conversation-notes.component.ts` | `addNote()` | No busy state | Same double-click issue |
| `conversation-notes.component.ts` | `toggleTaskStatus()` | Optimistic update, no visual indicator | Status can flicker on error |
| `conversation-notes.component.ts` | Single task "Execute" | **Does not exist** | Need new button + indicator |
| `concept-tree.component.ts` | `onConversationSelect()` | No loading on the clicked item | User doesn't know if click registered |
| `concept-tree.component.ts` | `onNewChat()` | No loading indicator | Same -- blank moment before navigation |
| `conversation.service.ts` | `createConversation()` | No `isCreating$` signal | Callers have no way to show loading |

## Implementation Plan

### Tasks

#### Phase 1: Shared Types + Backend Event Extensions (Foundation)

- [ ] Task 1: Add workflow interaction types to shared types
  - File: `libs/shared/types/src/lib/types.ts`
  - Action: Add `WorkflowStepInputType = 'text' | 'confirmation'` type alias. Add `WorkflowStepAwaitingInputPayload` interface with fields: `planId`, `stepId`, `stepTitle`, `stepDescription`, `conceptName`, `stepIndex`, `totalSteps`, `inputType: WorkflowStepInputType`, `conversationId`. Add `WorkflowStepMessagePayload` interface with: `planId`, `conversationId`, `messageId`, `content`, `stepIndex`, `totalSteps`, `inputType: WorkflowStepInputType`, `conceptName`.
  - Notes: These extend the existing payload types at L1343-1398. Keep them adjacent.

- [ ] Task 2: Extend backend gateway to emit new workflow events
  - File: `apps/api/src/app/conversation/conversation.gateway.ts`
  - Action: In the `onStepAwaitingConfirmation` callback inside `handleWorkflowApproval()` (L963-979), replace the `workflow:step-awaiting-confirmation` emit with `workflow:step-awaiting-input` emit. Include `inputType: 'confirmation'` for now (all steps default to confirmation; text-input determination will come from step metadata in a future enhancement or can be set based on step description containing question markers). Same change in `autoExecuteWorkflow()` callbacks (L1157-1172). Also emit a new `workflow:step-message` event inside `onStepComplete` callback (L932-947) containing the full step content as a complete message payload.
  - Notes: The existing `workflow:step-awaiting-confirmation` event and its frontend listener stay in place temporarily for backward compatibility. The new `workflow:step-awaiting-input` supersedes it. The `saveMessage` callback already persists AI output -- `workflow:step-message` is a frontend rendering signal, not a persistence mechanism.

- [ ] Task 3: Extend `handleWorkflowApproval` to auto-navigate pattern
  - File: `apps/api/src/app/conversation/conversation.gateway.ts`
  - Action: After `workflow:conversations-created` emit (L905), also emit a new `workflow:navigate-to-conversation` event with `{ planId, conversationId: firstConceptConversationId, conceptName }`. This tells the frontend which conversation to auto-navigate to. Pick the first concept conversation from the created list.
  - Notes: The navigation trigger comes from backend because only it knows which conversation was created first. Frontend will listen and navigate.

#### Phase 2: Frontend WebSocket + Service Layer

- [ ] Task 4: Add new event listeners and emitters to chat-websocket service
  - File: `apps/web/src/app/features/chat/services/chat-websocket.service.ts`
  - Action: Add Subject/callback registration for three new events: `workflow:step-awaiting-input` (handler receives `WorkflowStepAwaitingInputPayload`), `workflow:step-message` (handler receives `WorkflowStepMessagePayload`), `workflow:navigate-to-conversation` (handler receives `{ planId, conversationId, conceptName }`). Register listeners in `setupListeners()`. No new emitters needed -- existing `emitStepContinue(planId, conversationId, userInput?)` already handles both Continue and text responses.
  - Notes: Follow existing pattern at L260-306 where each event has a callback-registration method.

- [ ] Task 5: Add `isCreating$` signal to conversation service
  - File: `apps/web/src/app/features/chat/services/conversation.service.ts`
  - Action: Add `readonly isCreating$ = signal(false)`. In `createConversation()` method, set `this.isCreating$.set(true)` before the HTTP call and `this.isCreating$.set(false)` in finally block. Expose as public readonly signal.
  - Notes: This lets any component consuming this service show a loading state during conversation creation.

#### Phase 3: Chat Component -- Interactive Workflow Rendering

- [ ] Task 6: Add interactive workflow signals and event handlers to chat component
  - File: `apps/web/src/app/features/chat/chat.component.ts`
  - Action: Add new signals: `isGeneratingPlan$ = signal(false)` (busy between Run Agents click and plan-ready), `allowWorkflowInput$ = signal(false)` (re-enables chat input during text-input steps), `currentWorkflowStepInput$ = signal<WorkflowStepAwaitingInputPayload | null>(null)` (active step metadata), `previousConversationId$ = signal<string | null>(null)` (for "return" link). In `onRunAgents()`, set `isGeneratingPlan$.set(true)`. In `onPlanReady` handler, set `isGeneratingPlan$.set(false)`. Register new WebSocket event handlers in `setupWebSocket()`:
    - `onStepAwaitingInput`: Set `currentWorkflowStepInput$` with payload. If `inputType === 'text'`, set `allowWorkflowInput$.set(true)`. If `inputType === 'confirmation'`, render inline Continue button by pushing a UI message.
    - `onStepMessage`: Push complete message into `activeConversation$.messages` with `metadata: { isWorkflowStep: true, stepIndex, totalSteps }`.
    - `onNavigateToConversation`: Store current conversation as `previousConversationId$`, navigate via router to new conversation, load it.
  - Notes: The `disabled` binding on `<app-chat-input>` should change from `isLoading$()` to `isLoading$() && !allowWorkflowInput$()`. When `allowWorkflowInput$` is true, the input enables even during workflow execution.

- [ ] Task 7: Add workflow step rendering in chat message area
  - File: `apps/web/src/app/features/chat/chat.component.ts`
  - Action: In the template's message list (`@for (message of activeConversation$()?.messages`), add conditional rendering: `@if (message.metadata?.isWorkflowStep)` -> render step badge ("Step N of M") above the message content. After the last workflow step message that has `inputType === 'confirmation'`, render an inline "Continue to next step" button. The button calls `continueWorkflow()` with no userInput. Add CSS for `.workflow-step-badge` (small pill with step number, blue background) and `.workflow-continue-btn` (prominent button below message).
  - Notes: Reuse existing message bubble styling. The step badge is additive -- it doesn't replace any message rendering.

- [ ] Task 8: Modify `sendMessage()` to handle workflow text input
  - File: `apps/web/src/app/features/chat/chat.component.ts`
  - Action: In `sendMessage()`, check if `currentWorkflowStepInput$()` is set. If yes, instead of sending via `chatWsService.sendMessage()`, call `chatWsService.emitStepContinue(planId, conversationId, content)` to send the text as workflow step input. Then reset: `allowWorkflowInput$.set(false)`, `currentWorkflowStepInput$.set(null)`. The user's message still gets added to the UI as a user message bubble (existing code handles this).
  - Notes: This intercepts the normal send flow when a workflow text-input step is active. Regular chat messages work as before when no workflow step is pending.

- [ ] Task 9: Add "Preparing workflow..." empty state and "Return to previous" link
  - File: `apps/web/src/app/features/chat/chat.component.ts`
  - Action: In the template, when `isExecutingWorkflow$()` is true and conversation has no messages yet, show a "Preparing workflow..." indicator (spinner + text). After `onWorkflowComplete`, if `previousConversationId$()` is set, show a clickable link "Return to previous conversation" below the workflow summary message. Clicking it navigates back and clears `previousConversationId$`.
  - Notes: The empty state covers the gap between auto-navigation and first step arrival.

#### Phase 4: Single Task Execute Button

- [ ] Task 10: Add per-task "Execute" button to conversation-notes component
  - File: `apps/web/src/app/features/chat/components/conversation-notes.component.ts`
  - Action: In the task card expanded body (after the expected outcome section, around L444), add an "Execute" button for tasks with status PENDING or READY_FOR_REVIEW. The button emits a new output: `executeTask = output<string>()` with the note ID. Add `executingTaskId$ = signal<string | null>(null)` signal for per-task busy state. When clicked, set `executingTaskId$.set(noteId)`, emit the output. Parent resets it via a new input `executingTaskId = input<string | null>(null)` or by listening to plan-ready. Button shows spinner when `executingTaskId$() === note.id`. CSS: `.execute-btn` styled as a small blue button with spinner variant.
  - Notes: This is the single-task equivalent of "Run Agents" for multi-select. The parent (`chat.component.ts`) receives the output and calls `onRunAgents([taskId])` with a single-item array.

- [ ] Task 11: Wire single task execute in chat component
  - File: `apps/web/src/app/features/chat/chat.component.ts`
  - Action: Add handler for the new `executeTask` output from `conversation-notes.component.ts`. The handler calls `onRunAgents([taskId])` -- identical to multi-select but with one task. Set `isGeneratingPlan$.set(true)` so the notes component can show its busy state. Pass `isGeneratingPlan$()` to the notes component so it can drive `executingTaskId$` state.
  - Notes: Minimal new code -- reuses entire existing workflow pipeline.

#### Phase 5: Busy Indicators -- Conversation Creation

- [ ] Task 12: Add conversation creation loading indicators
  - File: `apps/web/src/app/features/chat/chat.component.ts`
  - Action: In all places that call `conversationService.createConversation()`:
    - Tree `onConversationSelect` / `onNewChat` path: Wrap with `isCreatingConversation$` check from conversation service. Show a subtle loading indicator on the tree item clicked (pass `loadingConversationId$` signal to concept-tree component).
    - Topic picker path: Disable the selection area and show spinner during creation.
    Add computed signal `isCreatingConversation$ = computed(() => this.conversationService.isCreating$())` for template binding.
  - File: `apps/web/src/app/features/chat/components/concept-tree.component.ts`
  - Action: Add `loadingItemId = input<string | null>(null)` input. In the tree item template, when `loadingItemId() === item.id`, show a small spinner next to the item text and dim the row. CSS: `.tree-item-loading` with opacity + spinner.

#### Phase 6: Busy Indicators -- Task Actions (Double-Click Protection)

- [ ] Task 13: Add per-action busy states to conversation-notes component
  - File: `apps/web/src/app/features/chat/components/conversation-notes.component.ts`
  - Action: Add three new signals following the `scoringInProgress` Set pattern:
    - `deletingInProgress$ = signal<Set<string>>(new Set())` -- Add/remove noteId around `deleteNote()` API call
    - `submittingInProgress$ = signal<Set<string>>(new Set())` -- Add/remove noteId around `submitReport()` API call
    - `addingNote$ = signal(false)` -- Set true/false around `addNote()` API call
    - `togglingStatus$ = signal<Set<string>>(new Set())` -- Add/remove noteId around `toggleTaskStatus()` API call
  - Update template:
    - Delete button: `[disabled]="deletingInProgress$().has(note.id)"`, show spinner when deleting
    - Submit Report button: `[disabled]="submittingInProgress$().has(note.id)"`, show "Submitting..." text
    - Add Note button: `[disabled]="addingNote$()"`, show spinner
    - Task checkbox: `[disabled]="togglingStatus$().has(note.id)"`, show spinner overlay
  - Notes: Follow exact same pattern as existing `scoringInProgress` at L773-790.

#### Phase 7: Plan Generation Busy Indicator

- [ ] Task 14: Show busy indicator during plan generation
  - File: `apps/web/src/app/features/chat/chat.component.ts`
  - Action: Pass `isGeneratingPlan$()` signal to the `conversation-notes` component via a new input. In `conversation-notes`, when `isGeneratingPlan` input is true, show an enhanced version of the existing `executing-bar` ("Generating workflow plan..." with spinner). Disable the "Run Agents" button when `isGeneratingPlan` is true. Also pass to concept-tree to optionally dim the tree during plan generation.
  - File: `apps/web/src/app/features/chat/components/conversation-notes.component.ts`
  - Action: Add `isGeneratingPlan = input(false)`. In template, show "Generating plan..." bar when true. Disable "Run Agents" button: `[disabled]="isExecuting() || isGeneratingPlan()"`.

### Acceptance Criteria

- [ ] AC 1: Given a task card in the notes panel with status PENDING, when the user clicks "Execute", then a spinner appears on the button AND the workflow plan generation starts (Run Agents called with that single task ID).

- [ ] AC 2: Given the user has clicked "Run Agents" (multi-select) or "Execute" (single task), when the plan is being generated on the backend, then a "Generating workflow plan..." indicator is visible in the notes panel AND the Run Agents/Execute buttons are disabled.

- [ ] AC 3: Given the plan is generated and approved, when per-concept conversations are created, then the frontend auto-navigates to the first concept conversation AND a "Preparing workflow..." message appears while waiting for the first step.

- [ ] AC 4: Given workflow execution is in progress, when a step completes, then the step's AI output appears as a complete chat message with a "Step N of M" badge AND the message is persisted to the conversation.

- [ ] AC 5: Given a workflow step requires text input (inputType: 'text'), when the step-awaiting-input event fires, then the chat input component re-enables AND the user can type and submit a response AND the response is sent as userInput via workflow:step-continue.

- [ ] AC 6: Given a workflow step requires confirmation (inputType: 'confirmation'), when the step-awaiting-input event fires, then an inline "Continue to next step" button appears below the step message AND clicking it advances the workflow.

- [ ] AC 7: Given the workflow completes, when all steps are done, then a summary message appears AND a "Return to previous conversation" link is shown (if navigated from another conversation).

- [ ] AC 8: Given the user clicks a conversation in the concept tree, when the conversation is being loaded, then a loading indicator appears on the clicked tree item until navigation completes.

- [ ] AC 9: Given the user clicks "Delete" on a note, when the delete API is in progress, then the delete button shows a spinner AND is disabled AND a second click is prevented.

- [ ] AC 10: Given the user clicks "Submit Report" on a sub-task, when the submit API is in progress, then the button shows "Submitting..." AND is disabled until the API returns.

- [ ] AC 11: Given the user toggles a task status checkbox, when the status update API is in progress, then the checkbox is disabled until the API returns.

- [ ] AC 12: Given the user clicks "Add Note", when the create API is in progress, then the button is disabled AND shows a spinner until the note appears in the list.

## Additional Context

### Dependencies

- **No new libraries required** -- all features use existing Angular, NestJS, Socket.io infrastructure
- **Existing WorkflowService** -- already handles plan building and step execution with pause/resume
- **Existing WebSocket event infrastructure** -- all workflow events already wired; we add 3 new events
- **Existing conversation creation API** -- POST /api/v1/conversations
- **ExecutionCallbacks interface** -- 7 callbacks fully implemented in gateway
- **`continueStep()` already accepts optional `userInput` string** -- zero backend execution logic changes needed
- **`completedSummaries` array** -- already injects user input into LLM context for next step

### Testing Strategy

**Unit Tests (Frontend):**
- `chat-websocket.service.spec.ts`: Test new event listener registration for `workflow:step-awaiting-input`, `workflow:step-message`, `workflow:navigate-to-conversation`
- `conversation.service.spec.ts`: Test `isCreating$` signal toggle during `createConversation()`
- `chat.component.spec.ts`: Test `sendMessage()` workflow interception (when `currentWorkflowStepInput$` set, calls `emitStepContinue` not `sendMessage`)
- `conversation-notes.component.spec.ts` (new): Test per-action busy states (deletingInProgress, submittingInProgress, addingNote, togglingStatus), test Execute button emits `executeTask` output

**Unit Tests (Backend):**
- `conversation.gateway.spec.ts`: Test new `workflow:step-awaiting-input` event emission in approval callback, test `workflow:step-message` emission in step-complete callback, test `workflow:navigate-to-conversation` emission after conversations-created

**Integration / Manual Tests:**
1. Single task Execute: Click Execute on one task -> plan generated -> approve -> auto-navigate -> steps render as chat -> text input works -> Continue button works -> workflow completes -> return link works
2. Multi-select Run Agents: Select 3 tasks -> Run Agents -> same flow as above
3. Busy indicators: Verify every action in the audit table now shows a loading indicator
4. Double-click protection: Rapidly click Delete, Submit, Add Note -- verify no duplicate API calls
5. Browser back during workflow: Verify workflow state is cleaned up properly
6. WebSocket disconnect during workflow: Verify reconnection resumes from correct state (or shows error)

### Notes

**High-Risk Items:**
- **Chat input interception** (Task 8): The `sendMessage()` conditional branch is the most critical change. Must not break normal chat when no workflow is active. Test extensively.
- **Auto-navigation timing** (Task 6/9): Race condition possible between navigation and first step message. The "Preparing workflow..." empty state mitigates this.
- **Backward compatibility**: Old `workflow:step-awaiting-confirmation` event stays active until all frontend code migrates to the new `workflow:step-awaiting-input` event. Both fire during transition.

**Known Limitations:**
- All steps currently default to `inputType: 'confirmation'`. True text-input detection (based on step description analysis or explicit flag in WorkflowStep) is a future enhancement. For now, all steps show Continue button. Users CAN provide optional text via the existing textarea in the step confirmation UI.
- The "Return to previous conversation" link is ephemeral -- only available in the current session, not persisted.

**Future Considerations (Out of Scope):**
- Step `inputType` auto-detection from WorkflowStep metadata (analyze `promptTemplate` for question patterns)
- Workflow step streaming (currently complete messages only)
- Risk-based approval gates before step execution (Epic 13)
- Parallel workflow execution across multiple concepts
