# Story 3.3: Simplified Deploy-Once Pipeline

Status: ready-for-dev

## Story

As the platform deploying a new process,
I want the build step to deploy once and trust the agent,
so that the system doesn't waste time with backend retry loops.

## Acceptance Criteria

1. **Given** the user clicks "Confirm and Build" **When** the backend handles the confirmation **Then** the flow is: generate design → save draft → validate → deploy → trigger ONE test → poll (30 min) → accept if valid → publish

2. **Given** the deploy-once flow **When** the test runs **Then** there is NO backend retry loop — agent self-heals during its single execution

3. **Given** the test produces results **When** the backend checks them **Then** only catastrophic failures are rejected (null response, status=failed, zero usable items). Error items with parseError/error/statusCode are filtered but don't block publishing.

4. **Given** n8n workflow deployment **When** updating an existing workflow **Then** the deactivate → PUT → reactivate pattern is used

5. **Given** agent registration **When** SOUL.md is deployed to relay **Then** registration retries up to 3 times if relay unreachable, with 10-second wait for gateway restart

6. **Given** deployment completes **When** monitoring is checked **Then** the deploy operation is logged with: tenant, process name, duration, status, n8n workflow ID

## Tasks / Subtasks

- [ ] Task 1: Simplify handleConfirm — remove retry loop (AC: #1, #2)
  - [ ] 1.1: Remove the `while(true)` retry loop, `MAX_SAME_ERROR_STREAK`, `adjustDesignForRetry()`, `evaluateTestResult()` methods from process-wizard.service.ts
  - [ ] 1.2: Replace with linear flow: generate → save → validate → deploy → trigger → poll → light validate → publish
  - [ ] 1.3: Keep `pollTestResult()` but with single 30-minute poll (no retry on failure)
  - [ ] 1.4: Add `generateSyntheticInput()` for test run input (already exists, keep it)

- [ ] Task 2: Light validation — trust the agent (AC: #3)
  - [ ] 2.1: After poll returns, check only: testResult is not null, status is not 'failed', output has > 0 items after filtering error objects
  - [ ] 2.2: Filter items with parseError/error/statusCode — count remaining valid items
  - [ ] 2.3: If valid items > 0, publish. If 0 valid items, report failure with clean message.

- [ ] Task 3: Inject business context into SOUL.md (AC: #5)
  - [ ] 3.1: Load tenant's business profile and top concept summaries from brain index
  - [ ] 3.2: Inject into the per-process agent's SOUL.md via emit-soul-md.ts (business context section)

- [ ] Task 4: Monitoring for deploy operations (AC: #6)
  - [ ] 4.1: Log deploy operation to VaultOperationLog with operationType 'process_deploy'
  - [ ] 4.2: Include: tenant, process name, n8n workflow ID, agent ID, duration, status

- [ ] Task 5: Tests (AC: all)
  - [ ] 5.1: Test simplified handleConfirm: no retry loop, single deploy-trigger-poll flow
  - [ ] 5.2: Test light validation: accepts partial results, rejects all-error results
  - [ ] 5.3: Test deploy monitoring: operation logged correctly

## Dev Notes

### What to DELETE from process-wizard.service.ts
- `MAX_SAME_ERROR_STREAK` constant
- The `while(true)` retry loop inside handleConfirm (lines ~345-445)
- `evaluateTestResult()` method
- `adjustDesignForRetry()` method
- All references to `sameErrorStreak`, `lastError`, `attempt` counter
- The 10-second wait inside the retry loop (`await new Promise(r => setTimeout(r, 10_000))`)
- The 3-second delay (`await new Promise(r => setTimeout(r, 3_000))`)

### What to KEEP
- `generateDesign()` — deterministic design generation
- `pollTestResult()` — single poll, 30-minute timeout
- `generateSyntheticInput()` and `syntheticStringValue()` — test input generation
- All wizard card builders (Stories 3.1, 3.4 — already working)
- Unique slug generation (already fixed)

### Existing Code
| File | Current State | Required Change |
|------|--------------|-----------------|
| `apps/api/src/app/builder/process-wizard.service.ts` | 180+ line handleConfirm with retry loop | Replace with ~50 line linear flow |
| `apps/api/src/app/builder/ir/emit-soul-md.ts` | Self-validation rules added, MCP gateway section | Add business context injection |
| `apps/api/src/app/builder/process-deploy.service.ts` | Deactivate-update-reactivate pattern (fixed) | No changes needed |

### References
- [Source: _bmad-output/planning-artifacts/epics-v2-autonomous-brain.md#Story 3.3]
- [Source: _bmad-output/planning-artifacts/prd-v2-autonomous-brain-architecture.md#Section 2.6]
- [Source: .claude/projects/.../memory/project_agent_autonomy_spec.md — agent autonomy principles]

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### File List
