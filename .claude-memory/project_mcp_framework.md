---
name: MCP Framework Implementation Status
description: Generic MCP (Model Context Protocol) framework for Process Builder — what's done, what's pending, key files
type: project
---

## Status as of 2026-04-10

### DONE — Backend Infrastructure
- **McpGatewayService** (`apps/api/src/app/mcp/mcp-gateway.service.ts`) — generic runtime, executes any operation on any connected tool
- **McpGatewayController** (`apps/api/src/app/mcp/mcp-gateway.controller.ts`) — endpoints: GET /mcp/tools, POST /mcp/tools/:slug/connect|test, DELETE /mcp/tools/:slug, POST /mcp/:toolSlug/:operationId
- **McpModule** registered in app.module.ts
- **McpToolCatalog** seeded: Apollo (5 ops), Notion (4), Gmail (3), Google Sheets (2), HTTP Generic (1), LinkedIn Sales Nav (1)
- **TenantCredential** seeded for Apollo + Notion
- **IR compiler** supports MCP steps: `BrainCall.callType: 'brain' | 'mcp'`, MCP steps → HTTP node to backend gateway
- **IR compiler** uses `step.prompt` if present (no more empty synthesized instructions)
- **PATCH /builder/drafts/:id/design** — edit mode endpoint
- **n8n updateWorkflow()** — PUT for in-place workflow updates
- **emit-n8n-workflow.ts** — business context is generic (from $json.body.businessContext), no hardcoded LSA/Apollo
- **Per-process agent** always gets MiniMax M2.7 + models.json + all tools via register-agent
- **ApolloLeadService** for lead CRUD via Apollo REST API
- **Relay multi-session tailer** with noteId filter for sub-session visibility
- **ai-task-runner** agent for AI Recommended Tasks
- **Apollo** skill added to ALL 17 agents on Hetzner

### DONE — Frontend
- **Integrations tab** in Settings page with tool cards grid, connect/disconnect/test panel, operations list
- CSS styled to match dark theme (#0D0D0D, #1A1A1A, #3B82F6, #10B981)

### DONE — Process Builder SOUL
- Three modes: CREATE / EDIT / SUGGEST
- Two-stage: propose → confirm → build
- Generic: uses MCP catalog + grounding curls, no hardcoded business context
- Pipeline patterns: Data Acquisition, Content Generation, Analysis, Pure AI
- Intent-to-step mapping table
- Test validation protocol (non-empty, schema match, real data, business relevance)
- Hard rule: never finish without passing test

### CRITICAL FINDINGS (2026-04-10 evening)

**What works end-to-end:**
- Lead discovery: Apollo search_organizations → enrich → brain scoring → callback → COMPLETED with real leads (Spagnulo & Partners score 8, Four Seasons Milan score 7, OBMI score 7, Studio Munge score 7)
- Brave Search MCP: connected, probed 1/1 ops, web_search returns real results
- n8n workflow UPDATE (PUT) works — no longer just reuses old workflows
- continueOnFail on all HTTP nodes
- Apollo new key: APOLLO_KEY_REDACTED (5/5 ops verified)
- Brave key: BRAVE_KEY_REDACTED (1/1 ops verified)

**What still needs fixing:**
1. **MCP_SEARCH is wrong for multi-query searches** — Signal Scanner has 4 Brave MCP_SEARCH steps but n8n can't run them as independent parallel searches. Use ONE brain call with web_search tool instead for consolidation.
2. **Builder doesn't ask user for tool/operation choices** — SOUL updated with TOOL_SELECT/OPERATION_SELECT JSON format but MiniMax doesn't reliably output it
3. **Input field mapping broken** — region parameter not reaching MCP nodes. fieldBindings → buildMcpBodyTemplate() needs debugging
4. **Notion created by default** — deploy() creates Notion DB whenever notionSchema exists, even when user chose Apollo
5. **Builder shows too many input fields** — user should choose which inputs during design
6. **Frontend wizard needed** — AI-driven interactive flow is unreliable. Frontend-driven step-by-step wizard with AI assistance is the real solution

### PENDING
- **Frontend: Builder sidebar** — process list with Edit buttons
- **Frontend: Process Design Card** — visual proposal + diff view for edit
- **Smart MCP recommendations** — builder suggests upgrades when new tools connected
- **Tool icons (logoUrl)** — Prisma field + UI display
- **Version history** — designArtifactHistory JSON array
- **OAuth2 flow** for HubSpot/Salesforce (current: apiKey only)
- **Rate limiting** per MCP tool
- **Field mapping UI** for tenant customization

### Key Architecture Decisions
- MCP steps in n8n → HTTP to our backend gateway (not direct to external API)
- Brain-call steps → HTTP to OpenClaw relay (AI agent)
- Business context comes from bridge/context grounding (not hardcoded)
- Process Builder discovers tools via GET /mcp/tools API (not Python scripts)
- Each MCP tool is ONE row in McpToolCatalog + operations JSON array
- Adding new tool = seed one DB row + no code changes
