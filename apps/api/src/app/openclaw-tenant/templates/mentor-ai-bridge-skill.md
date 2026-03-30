---
name: mentor-ai-bridge
description: Connect to Mentor AI state service — read concepts, create proposals, manage tasks, track brain state
version: 1.0.0
tools:
  - name: get_brain_state
    description: Get the current brain scanning state across all 9 Business Model Canvas blocks. Shows which blocks are stale, at-risk, or recently scanned.
    parameters:
      tenantId: { type: string, required: true }

  - name: search_concepts
    description: Search the knowledge base for business concepts by keyword. Returns matching concepts with relationships and definitions.
    parameters:
      q: { type: string, required: true, description: "Search query" }
      tenantId: { type: string, required: true }
      limit: { type: number, required: false, default: 10 }

  - name: get_concept
    description: Get full details of a specific concept including relationships, workflow cache, and extended description.
    parameters:
      conceptId: { type: string, required: true }

  - name: get_pending
    description: Get all pending task concepts for the tenant. These are concepts that have PENDING tasks waiting to be worked on.
    parameters:
      tenantId: { type: string, required: true }

  - name: get_categories
    description: Get all 16 root categories with concept counts. Use to determine where to place new concepts.

  - name: get_context
    description: Get full business context for the tenant — company profile, memories, and tenant metadata.
    parameters:
      tenantId: { type: string, required: true }

  - name: get_budget
    description: Check daily budget remaining before spawning agents. Returns spent/remaining EUR for today.
    parameters:
      tenantId: { type: string, required: true }

  - name: get_proposals
    description: List brain proposals filtered by status. Use to check what's already been proposed.
    parameters:
      tenantId: { type: string, required: true }
      status: { type: string, required: false, description: "pending|approved|rejected" }

  - name: create_proposal
    description: Create a new brain proposal for the owner to review. Use this instead of acting directly. The owner will see it in their Task Hub.
    parameters:
      tenantId: { type: string, required: true }
      canvasBlock: { type: string, required: true, description: "KEY_PARTNERS|KEY_ACTIVITIES|KEY_RESOURCES|VALUE_PROPOSITION|CUSTOMER_RELATIONSHIPS|CHANNELS|CUSTOMER_SEGMENTS|REVENUE_STREAMS|COST_STRUCTURE" }
      type: { type: string, required: true, description: "concept_discovery|task_execution|risk_alert|opportunity|correction" }
      title: { type: string, required: true }
      reasoning: { type: string, required: true, description: "WHY this matters for this business" }
      proposedAction: { type: string, required: true, description: "WHAT you want to do" }
      estimatedCost: { type: number, required: false, description: "Estimated EUR cost" }
      priority: { type: string, required: false, default: "medium", description: "critical|high|medium|low" }
      relatedConcepts: { type: array, required: false, description: "Related concept IDs" }

  - name: create_concept
    description: Create a new tenant-specific business concept. Only do this after owner confirms. Always assign to a root category.
    parameters:
      tenantId: { type: string, required: true }
      name: { type: string, required: true }
      category: { type: string, required: true, description: "One of the 16 root categories" }
      definition: { type: string, required: true }
      canvasBlock: { type: string, required: false }
      extendedDescription: { type: string, required: false }
      confidence: { type: number, required: false, description: "0-1 confidence score" }
      relationships: { type: array, required: false, description: "Array of {targetId, type}" }

  - name: create_conversation
    description: Create a conversation linked to a concept. Use after creating a new concept to provide context trail.
    parameters:
      tenantId: { type: string, required: true }
      conceptId: { type: string, required: true }
      title: { type: string, required: true }
      initialMessage: { type: string, required: false }

  - name: create_task
    description: Create a task note. Usually done after a proposal is approved. Links to concept if available.
    parameters:
      tenantId: { type: string, required: true }
      title: { type: string, required: true }
      content: { type: string, required: false }
      conceptId: { type: string, required: false }
      expectedOutcome: { type: string, required: false }
      proposalId: { type: string, required: false }

  - name: add_contribution
    description: Add an agent's work results to a task. Each agent adds its contribution with files and actions.
    parameters:
      tenantId: { type: string, required: true }
      noteId: { type: string, required: true }
      agentType: { type: string, required: true, description: "research|financial|content|marketing|sales|designer|dev" }
      summary: { type: string, required: true }
      output: { type: string, required: true, description: "Full markdown output" }
      files: { type: array, required: false, description: "Array of {name, displayName, path, mimeType, size}" }
      actions: { type: array, required: false, description: "Array of {id, type, target, label}" }
      metrics: { type: object, required: false }

  - name: update_progress
    description: Report task execution progress. Frontend shows progress bar.
    parameters:
      tenantId: { type: string, required: true }
      noteId: { type: string, required: true }
      phase: { type: string, required: true }
      percent: { type: number, required: true, description: "0-100" }
      message: { type: string, required: true }

  - name: complete_task
    description: Mark a task as completed with optional AI score.
    parameters:
      tenantId: { type: string, required: true }
      noteId: { type: string, required: true }
      score: { type: number, required: false, description: "1-100 quality score" }

  - name: update_agent_status
    description: Report agent status changes. Frontend shows agent graph with live status.
    parameters:
      tenantId: { type: string, required: true }
      taskId: { type: string, required: false }
      agent: { type: string, required: true }
      status: { type: string, required: true, description: "spawning|running|completed|failed|waiting" }
      message: { type: string, required: true }

  - name: create_memory
    description: Store a business memory. Used to persist important facts discovered during analysis.
    parameters:
      tenantId: { type: string, required: true }
      type: { type: string, required: true, description: "CLIENT_CONTEXT|PROJECT_CONTEXT|USER_PREFERENCE|FACTUAL_STATEMENT" }
      content: { type: string, required: true }
      conceptId: { type: string, required: false }

  - name: update_brain_state
    description: Update canvas block scan status after heartbeat analysis.
    parameters:
      tenantId: { type: string, required: true }
      canvasBlock: { type: string, required: true }
      risks: { type: number, required: false }
      status: { type: string, required: false, description: "ok|attention|stale|scanning" }
---

# Mentor AI Bridge

This skill connects you to the Mentor AI state service. Use it to:

1. **Read state** — search concepts, check budget, get business context
2. **Create proposals** — suggest work to the owner (they approve before you act)
3. **Manage tasks** — create tasks, add agent contributions, track progress
4. **Track brain state** — update which BMC canvas blocks you've scanned

## Setup

Set the environment variable:
```
MENTOR_AI_BRIDGE_URL=https://your-mentor-ai-instance.com/api
```

All requests use Bearer token authentication from OPENCLAW_AUTH_TOKEN.

## Important Rules

- **Always check budget** before spawning agents: `get_budget`
- **Create proposals**, don't act directly — the owner decides
- **Report agent status** for real-time UI updates
- **Structure results** with markdown headings for PDF export
- **Include tenantId** in every request
