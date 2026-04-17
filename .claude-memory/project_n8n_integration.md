---
name: n8n Integration — OpenClaw Process Engine
description: OpenClaw uses n8n as execution layer for all business process automation — designs, deploys, and discovers workflows
type: project
---

## Decision (2026-04-01)
OpenClaw will integrate with n8n to:
1. **Design** n8n workflows automatically based on business context
2. **Execute** all processes through n8n (400+ integrations available)
3. **Discover** new automatable processes proactively

## Why
- Custom process development (2-20 days each) doesn't scale for Enterprise "unlimited"
- n8n has 400+ integrations — no need to build connectors
- Agent generates 80% of workflow, engineer reviews 20%
- Process catalog grows automatically as n8n workflows (reusable across clients)
- n8n is self-hostable (fair-code) — fits our local infrastructure model

## How to Apply
- All new process automation should target n8n workflow format
- OpenClaw needs n8n API integration (create/trigger/monitor workflows)
- Approval gates map to n8n webhook wait nodes
- Process catalog = library of n8n workflow templates

## Implementation Status
- Planned for immediate implementation (today 2026-04-01)
- Requires: n8n instance setup, OpenClaw n8n skill, workflow template format
