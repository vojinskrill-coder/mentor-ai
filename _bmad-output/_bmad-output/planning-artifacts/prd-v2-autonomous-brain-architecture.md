---
stepsCompleted: ['architectural-evolution']
parentPrd: './prd.md'
workflowType: 'prd-evolution'
date: 2026-04-11
author: Tanjav
project_name: Neuron OS (formerly Mentor AI)
classification:
  changeType: 'architectural-pivot'
  scope: 'platform-wide'
  trigger: 'production-failure + strategic-insight'
  demoDeadline: '2026-04-18'
---

# PRD v2: Autonomous Brain Architecture

**Parent PRD:** [prd.md](./prd.md) (Mentor AI, 2026-02-04 — still valid for business model, personas, success criteria)

**What this document covers:** The architectural evolution from backend-controlled agent execution to fully autonomous agents with a living business brain. This replaces the execution model described in the parent PRD while preserving all business-level requirements.

**Why this exists:** The backend-controlled model broke in production. Direct MCP HTTP calls failed (double-stringify bugs, missing data chaining, silent n8n update failures). 10 automated retries couldn't fix what was fundamentally a wrong architecture. The agent must own its execution.

---

## 1. Executive Summary of Change

### What Changed

| Aspect | Before (PRD v1) | After (This Document) |
|--------|-----------------|----------------------|
| **Execution model** | Backend orchestrates agents step-by-step, validates results, retries on failure | Agent is fully autonomous — self-validates, self-heals, only reports verified results |
| **Knowledge storage** | Static concept seeds in PostgreSQL + Qdrant | Living Obsidian vault per tenant — Karpathy LLM Wiki pattern with raw/wiki/schema layers |
| **Onboarding** | Quick-win task in 5 minutes | Business brain creation — agents research and populate 548+ concepts specifically for THAT business |
| **MCP integration** | Backend makes direct HTTP calls to external APIs | Agent calls MCP gateway via exec curl, handles parameter formats, data chaining, retries |
| **Process Designer** | AI agent designs processes via chat (unreliable) | Deterministic wizard (backend) generates precise agent definitions (JSON step specs) |
| **Data access** | Department guard at API level | Metatags on every piece of data (Qdrant vectors, Obsidian notes, conversation messages) |
| **Brain evolution** | Concepts are static, never updated | Concepts are living documents — updated by agents after every conversation and process run |

### What Stays the Same

- Target audience: Solo founders + business owners with teams
- Pricing: $99/mo starter + $49/mo per additional user
- Business model: Break-even at 200 users
- Core value prop: 10X productivity via AI agents that know YOUR business
- Multi-tenant architecture with data isolation
- Department personas (CFO/CMO/CTO) with role-based guardrails

---

## 2. The 11 Capability Areas

### 2.1 Skill Builder (Process Designer Wizard)

**What it does:** Backend-driven wizard that creates detailed, precise agent definitions through a structured flow.

**Flow:**
1. User describes what they want in one sentence
2. Backend shows available MCP tools (from catalog + tenant credentials)
3. User selects tools and operations via interactive cards
4. Backend suggests input fields based on description + selected operations
5. Backend generates pipeline preview (phase-based: Search → Enrich → Score → Review → Save)
6. User confirms
7. Backend generates complete agent definition (SOUL.md with step-by-step JSON specs, validation gates, self-correction rules, MCP gateway call patterns)
8. Backend deploys: n8n workflow + per-process OpenClaw agent + storage (Notion/Qdrant)
9. Agent runs autonomously, self-validates, reports verified results

**Key principle:** Backend creates the playbook. Agent follows the playbook autonomously.

**Current state:** Wizard flow works (tool select → operations → inputs → pipeline → confirm). Agent instructions need to be much richer and more precise. Self-validation rules added to SOUL.md but untested in production.

### 2.2 Prompt Enricher

**What it does:** Invisibly rewrites user messages before they reach AI agents to maximize output quality.

**How it works:**
1. User types raw request: "find me leads in Europe"
2. Backend enriches with:
   - Business context (ICP definition, industry, products, pricing from Obsidian vault)
   - Quality standards (minimum fields per result, data freshness requirements)
   - Format rules (JSON structure, field names and types)
   - Historical context (what similar requests produced before, what worked/didn't)
   - Scoring criteria (from tenant's configured ICP weights)
3. Enriched prompt sent to agent — user never sees the transformation

**Key principle:** The user should never need to be a prompt engineer. The system handles that.

**Current state:** `agent-prompt.service.ts` has basic `formatPrompt()` that injects system prompt + business context. Needs formalization as a named `PromptEnrichmentService` with tenant-specific business rules injection.

### 2.3 Detailed Agent Instructions

**What it does:** Every spawned agent receives a comprehensive SOUL.md that acts as a complete operating manual.

**What the SOUL.md must contain:**
- Identity and purpose (one paragraph)
- Step-by-step execution plan with JSON specs for each step
- MCP gateway call patterns (exact curl commands, parameter formats, API-specific rules)
- Validation gates per step (expected output schema, minimum item count, error detection)
- Self-correction rules (parameter format fixes, retry logic, timeout handling)
- End-of-execution validation (filter errors, verify fields, deduplicate)
- Data chaining instructions (how to extract IDs from step N for step N+1)
- Business context (tenant's ICP, industry, products)
- Tools available and their capabilities
- Hard rules (JSON only, no invented data, no prose)

**Key principle:** The agent should be able to run its entire pipeline from the SOUL.md alone, without any backend involvement at runtime.

**Current state:** `emit-soul-md.ts` generates SOUL.md with call shapes + self-validation protocol. Needs richer MCP-specific instructions and more precise step definitions.

### 2.4 Qdrant as Structured Data Store

**What it does:** Qdrant stores all agent outputs, memories, and process results with rich metadata for filtered retrieval.

**Metadata on every vector:**
- `tenantId` — tenant isolation (already exists)
- `userId` — who created it (already exists)
- `departmentTags: string[]` — which departments can access (MISSING)
- `conceptId` — which business concept this relates to (partially exists)
- `source` — where this came from (conversation, process run, onboarding, agent discovery)
- `confidence` — how reliable this data is (MISSING)
- `lastReinforced` — when was this last confirmed/accessed (MISSING)
- `tier` — working / episodic / semantic / procedural (MISSING — Karpathy v2 pattern)

**Key principle:** Every piece of data is tagged so the right people see the right data, and stale data decays while reinforced data strengthens.

### 2.5 Obsidian Vault as Extended Agent Memory

**What it does:** Structured Obsidian vault per tenant that serves as the agent's knowledge base, following the Karpathy LLM Wiki pattern.

**Vault structure:**
```
tenant-vault/
  raw/                          # Immutable sources (hidden from user)
    conversations/              # Chat transcripts
    documents/                  # User uploads
    process-outputs/            # Results from process runs
  
  wiki/                         # The business brain (user sees "concepts")
    index.md                    # Master catalog (hidden from user)
    concepts/                   # Business-specific concept notes (VISIBLE)
      prodaja/
        prodajni-plan.md        # Rewritten for THIS business
        crm-strategija.md
      marketing/
        digital-marketing.md
        content-strategy.md
      finansije/
        budzet.md
        cash-flow.md
    entities/                   # Hidden — people, companies, products
    decisions/                  # Hidden — business decision log
    insights/                   # Hidden — crystallized analysis
  
  skills/                       # Hidden — agent skill definitions
  instructions/                 # Hidden — SOUL.md files, step specs
  log.md                        # Hidden — operation log
  SCHEMA.md                     # Hidden — conventions, entity types
```

**User visibility:** ONLY `wiki/concepts/` — organized by department/category. Everything else is infrastructure that agents use but users never see.

**Department metatags on every note:**
```yaml
---
title: Prodajni Plan
department: [prodaja, marketing]  # Cross-functional: both teams can see
confidence: 0.85
lastReinforced: 2026-04-10
tier: semantic
---
```

### 2.6 Self-Checking and Healing

**What it does:** Agents validate every step of their execution internally and self-correct before returning results to the user.

**Validation protocol (per step):**
1. Execute the step (MCP call, web search, reasoning)
2. Validate output: JSON parseable? Items > 0? No error objects? Schema fields present?
3. If validation fails: diagnose error type, apply correction (fix params, broaden search, retry), max 5 retries per step
4. Only proceed to next step when current step passes
5. End-of-execution: filter error items, verify count, verify fields, deduplicate
6. Return only clean, verified results

**Error correction table:**
| Error | Fix |
|-------|-----|
| Parameter format ("must be array") | Fix and retry (e.g., "Europe" → ["Europe"]) |
| Empty results | Broaden search, fewer filters, retry |
| Timeout | Retry same call (transient) |
| Auth failure (401/403) | Stop, report — can't self-fix |
| Rate limit (429) | Wait 10s, retry |
| Server error (5xx) | Retry 3x with 5s gaps |

**Key principle:** User NEVER sees raw errors. Either the agent fixes it, or it reports a clean failure with context.

### 2.7 Role-Based Data Filtering

**What it does:** Every piece of data has department metatags. Backend filters what each user can see — in conversations, in responses, in the graph view, in process results.

**How it works:**
1. During onboarding, concepts get department tags based on their category
2. Every agent output, memory, note, and vector gets tagged with department(s)
3. When a user queries (chat, graph view, process results), backend checks their role
4. Backend filters: only return data where user's department is in the item's departmentTags
5. PLATFORM_OWNER / TENANT_OWNER see everything — no filter
6. Cross-functional data (marketing campaign budget = finance + marketing) gets multi-tags

**Current state:** `DepartmentGuard` + `department-categories.ts` enforce at API level. Qdrant vectors lack department tags. Obsidian notes will need frontmatter tags.

### 2.8 Agent-Filtered Responses

**What it does:** Agents themselves know the user's role and tailor responses accordingly.

**How it works:**
- Agent receives user's department/role in the prompt context
- Agent instructions (SOUL.md) include rules like: "If user is marketing team, focus on marketing-relevant aspects. Do not expose financial details unless user is finance or owner."
- Agent filters its own output before returning — complementary to backend filtering

**Key principle:** Double filtering — agent filters proactively, backend filters defensively.

### 2.9 Smart Recommendations as Cards

**What it does:** Dedicated agents per mode (chat, AI recommended tasks, process builder) proactively suggest next steps, rendered as interactive cards.

**Card types:**
- **MCP Configuration:** "Apollo.io is available. Connect your API key to enable lead search." [Connect]
- **Process Suggestion:** "Based on your business, you could automate weekly lead discovery." [Build This Process]
- **Next Step:** "You've scored 15 leads. Next: send personalized outreach emails." [Start Outreach Process]
- **Tool Discovery:** "Your Apollo plan includes 5 operations. You're using 2. Here's what the others do." [Explore]
- **Task Recommendation:** "Your marketing budget hasn't been reviewed in 3 weeks. Schedule a review?" [Review Now]

**Key principle:** The system doesn't wait for the user to figure out what to do next. It suggests, and the user approves.

### 2.10 MCP Self-Evolution

**What it does:** When a process agent discovers that an MCP tool's API has changed (new fields, renamed endpoints, different parameter formats), it adapts on the fly AND reports the change back to the platform.

**Flow:**
1. Agent calls MCP gateway with expected parameters
2. API returns an error indicating a change (new field name, deprecated endpoint)
3. Agent adapts: tries alternative field names, reads error message for clues, succeeds with new format
4. Agent appends `_specDrift` object to its output:
   ```json
   { "_specDrift": { "tool": "apollo-io", "operation": "search_organizations", "issue": "field renamed", "oldField": "q_keywords", "newField": "q_organization_keyword_tags" } }
   ```
5. Backend callback handler extracts `_specDrift`, updates MCP catalog
6. All future agents get the corrected field names in their SOUL.md

**Key principle:** The system learns from every execution. MCP integrations don't break — they evolve.

### 2.11 Brain Cleanup and Deduplication

**What it does:** As the Obsidian vault and Qdrant grow, automated maintenance keeps the knowledge base healthy.

**Operations (following Karpathy's "lint" pattern):**
- **Dedup:** Detect concepts/notes covering the same topic, merge into authoritative version
- **Staleness:** Flag notes not accessed or reinforced in 90+ days for review
- **Contradictions:** Detect conflicting claims across notes (e.g., two different ICP definitions), flag for resolution
- **Orphans:** Find notes with no relationships to any concept, either link them or archive
- **Consolidation:** Promote frequently-reinforced working memories to semantic tier
- **Cross-reference:** Ensure all entity mentions are linked to their entity pages

**Key principle:** The brain should get BETTER over time, not more cluttered.

---

## 3. Onboarding: Birth of the Business Brain

This is the critical differentiator. When a new tenant onboards, they don't get a blank AI — they get a fully populated brain that already knows their business.

### 3.1 Onboarding Flow

1. **Business Profile:** User describes their business (industry, products/services, team structure, target market)
2. **Agent Research:** Dedicated onboarding agents take each of the 548 base concepts and research how it applies to THIS specific business
3. **Concept Enrichment:** Each concept note is rewritten with business-specific context:
   - Generic "Prodajni Plan" → "Prodajni Plan za [Company Name]: [specific channels, pricing strategy, ICP, competitive landscape]"
   - Each note populated with researched, real information — not templates
4. **Department Tagging:** Every note tagged with which departments can access it
5. **Vault Creation:** Complete Obsidian vault created with:
   - 548+ enriched concept notes (visible to user)
   - Relationships between concepts (visible as graph)
   - Skills, instructions, indexes (hidden infrastructure)
6. **MCP Connection:** User connects their tools (Apollo, Notion, etc.) — wizard guides them
7. **First Process:** System recommends a process based on connected tools — user builds it via wizard

### 3.2 What the User Sees After Onboarding

- **Graph View:** Their business brain — concepts connected by relationships, organized by department
- **Conversations:** Chat with AI agents that already know their business context (pulled from the vault)
- **AI Recommended Tasks:** Suggestions based on which concepts have been explored vs which haven't
- **Process Builder:** Tool-aware wizard that shows connected MCP tools and suggests automations

### 3.3 Concept Relationships — Initial and Evolving

**Initial relationships (from seed Obsidian vault):**
- The 548 base concepts have 3658+ pre-defined relationships (PREREQUISITE, RELATED, ADVANCED)
- During onboarding, these relationships are PRESERVED and carried into the new business brain
- Relationships are based on chapter ordering: earlier chapter → PREREQUISITE, same chapter → RELATED, later chapter → ADVANCED
- These form the initial graph structure the user sees

**Evolving relationships (as the brain grows):**
- New concepts discovered through conversations get relationship edges to existing concepts
- Agent determines relationship type based on context (PREREQUISITE, RELATED, ADVANCED, DEPENDS_ON, CONTRADICTS)
- When a process run produces insights about concept X that relate to concept Y, a new relationship edge is created
- Orphan concepts (no relationships) are flagged during brain lint for manual or AI-assisted linking

### 3.4 Concept Note Quality Standards

Every concept note in the business brain must meet these standards:
- **Language:** Fully in English (regardless of user's language preference for chat)
- **Formatting:** Clean markdown with proper headings (H2/H3), bullet points, bold for key terms
- **Structure:** Title → Summary (2-3 sentences) → Key Points → Details → Relationships → Sources
- **Frontmatter:** YAML with title, department tags, confidence, lastReinforced, tier, relationships
- **Length:** Minimum 200 words for meaningful concepts, no upper limit
- **Research depth:** Real data — competitor names, market figures, best practices — not generic filler
- **Cross-references:** Wikilinks to related concepts using `[[concept-name]]` format

### 3.5 The New Brain IS the Product

The seeded 548 concepts are TEMPLATES used during onboarding. They are never shown to the user. What the user sees is their BUSINESS-SPECIFIC brain:
- Every concept rewritten for their industry, products, team
- Enriched with real research (competitors, market data, best practices)
- Tagged with department access
- Connected via relationships that reflect their actual business structure (initial + evolving)
- Growing with every conversation, process run, and agent discovery
- All notes in English with consistent, professional formatting

---

## 4. Architecture Overview

```
USER (role-tagged)
  ↓ raw message
PROMPT ENRICHER (invisible)
  ↓ enriched prompt + user context + role + business context from vault
DEDICATED MODE AGENT (chat / task recommender / process builder)
  ↓ reads skills + instructions from
OBSIDIAN VAULT (per-tenant, Karpathy wiki pattern)
  ↓ queries with department filters
QDRANT (vectors with department metatags)
  ↓ calls with self-validation
MCP TOOLS (Apollo, Notion, etc.)
  ↓ self-heals on failure
VALIDATION GATES (per step, in agent)
  ↓ clean results
RESPONSE FILTER (backend strips data user's role can't see)
  ↓ files insights back to vault
OBSIDIAN VAULT (updated — living brain)
  ↓
USER sees only what they should see
```

### Backend's Role (Configuration Layer)
- Build agent definitions (Skill Builder wizard)
- Enrich prompts (invisible to user)
- Tag everything with department metatags
- Filter responses by role
- Accept spec updates from agents (MCP evolution)
- Maintain the brain (scheduled lint/cleanup)
- Manage MCP catalog and credentials

### Agent's Role (Execution Layer)
- Execute autonomously (full playbook in SOUL.md)
- Self-validate every step
- Self-heal on MCP failures
- Call MCP gateway via exec curl (handle data chaining, parameter formats)
- Respect access rules (built into instructions)
- Recommend next steps (proactive cards)
- Discover MCP API changes and report back
- File insights back into Obsidian vault (compounding knowledge)

---

## 5. Demo Requirements (2026-04-18)

**The demo story:** "I described my business. The system built my brain. I asked it to find leads. It guided me through building the process. The agent ran autonomously, found real companies, scored them, and brought back verified results. My marketing team sees marketing data. My finance team sees finance data. And the brain learned from the whole experience."

**Must show end-to-end:**
1. Onboarding: business description → brain created with enriched concepts
2. Graph view: business-specific concepts with department coloring
3. Process Builder: wizard flow → agent deployed
4. Agent execution: autonomous run with real Apollo data
5. Results: verified, filtered by role
6. Brain update: new knowledge filed back into vault

**Acceptable shortcuts for demo:**
- Pre-populated vault (onboarding runs in background, show result)
- 10-20 enriched concepts (not all 548)
- One MCP tool (Apollo) proven working
- Role filtering demonstrated with 2 roles (owner + marketing)

---

## 6. Technical Debt to Resolve

| Item | Current State | Required State | Priority |
|------|--------------|----------------|----------|
| handleConfirm retry loop | Backend retries 10x | Deploy once, agent is autonomous | P0 |
| SOUL.md richness | Generic templates | Precise step-by-step with MCP call patterns | P0 |
| n8n workflow update | Was silently failing (fixed: deactivate first) | Verified working | Done |
| MCP body templates | Double-stringify bug (fixed: all brain calls now) | Verified working | Done |
| Qdrant department tags | Missing | Add to vector payloads | P1 |
| Obsidian vault creation | Not implemented | Onboarding creates per-tenant vault | P1 |
| Prompt enricher | Basic formatPrompt() | Full PromptEnrichmentService | P1 |
| Spec drift endpoint | Not implemented | Agent reports MCP changes | P2 |
| Brain lint/cleanup | Not implemented | Scheduled maintenance job | P2 |
| Concept note updating | Static seeds | Living docs updated from conversations | P2 |

---

## 7. Success Criteria for v2

**Demo Success (April 18):**
- Investor sees complete flow from onboarding to verified results
- Process runs end-to-end with real data (no errors shown to user)
- Role-based filtering demonstrated
- Brain graph shows business-specific concepts

**30-Day Success:**
- 3 MCP tools proven working (Apollo, Notion, Brave Search)
- 5 process templates available (lead discovery, content ideation, competitor research, outreach, reporting)
- Onboarding creates brain for any business type in < 10 minutes
- Agent self-validation produces clean results on 90%+ of runs

**90-Day Success:**
- MCP self-evolution working (at least 1 documented case of agent-discovered API change)
- Brain cleanup running weekly
- 100+ enriched concepts per tenant brain
- Cross-functional data tagging working across 3+ departments
