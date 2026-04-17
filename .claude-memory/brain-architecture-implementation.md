---
name: OpenClaw Brain Architecture - Full Implementation Status
description: Complete status of OpenClaw Brain integration — what works, critical gaps, key files, and next steps as of 2026-03-28
type: project
---

## Architecture
OpenClaw = autonomous brain (thinks, proposes, executes). Mentor AI = state service (DB, API, UI).
Hetzner CX32 (91.98.231.87), 8 agents, 34+ skills, Tailscale network.

## What Works
- Chat → semantic concept search (Qdrant cross-language) → create proposal → wait for approval
- Proposals in AI Predloženi panel, approve/reject flow, OpenClaw notified on approve
- Bridge API: server-side tenantId override via OPENCLAW_DEFAULT_TENANT_ID env var
- Tree view: AI-discovered concepts mapped to Serbian root categories via CATEGORY_TO_ROOT
- Graph view: bridge event subscriptions for real-time updates
- 8 SOUL.md files with full LSA business context, branding (#1A1A1A, #C9A96E), skill mapping
- Auto-scan deliverables on task-complete (safety net for unreported files)
- Auto-complete on progress=100%
- Materijali: scan endpoint, real deliverable filter (xlsx/pdf/pptx/png only), auto-refresh

## Critical Gap: task-complete Never Called
Sub-agents create files in deliverables/{noteId}/ but never call Bridge API. Director sends agent:status and task:progress but forgets task-contribution and task-complete. Manual complete triggers auto-scan successfully (found 6 real deliverables).
**Needed:** Timeout mechanism to auto-complete tasks after inactivity period.

## Key Files
- SOULs: `/root/.openclaw/agents/{agent}/agent/SOUL.md` (8 agents, 41-90 lines each)
- Bridge: `apps/api/src/app/bridge/` (controller with resolveTenantId, service with auto-scan+semantic search)
- Frontend: app-shell (activity panel bridge listeners), graph-state (bridge subscriptions), concept-tree (auto-refresh), task-hub (hasJobs:false), materijali (scan+auto-refresh)
- Conversation: getBrainTree with findTenantConcepts + CATEGORY_TO_ROOT mapping

## ENV: OPENCLAW_DEFAULT_TENANT_ID, BRAIN_RELAY_MODE=true in apps/api/.env
## Auth token: RELAY_TOKEN_REDACTED
