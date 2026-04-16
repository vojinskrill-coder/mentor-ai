# Story 1.2: Business-Specific Concept Rewrite and Enrichment

Status: review

## Story

As a new business owner,
I want each business concept to be rewritten specifically for MY business while preserving the original teaching style,
so that my brain contains deep, authoritative knowledge that feels like it was written for my industry.

## Acceptance Criteria

1. **Given** a tenant vault exists with 445 placeholder concept notes and the user's business profile is available **When** the onboarding enrichment process runs **Then** the Main agent identifies the top 100 concepts most relevant to this specific business and queues them for enrichment first

2. **Given** concepts are queued for enrichment **When** the enrichment agent runs **Then** a MiniMax agent rewrites each concept SEQUENTIALLY (not in parallel) to avoid duplicate information across concepts

3. **Given** a concept is being rewritten **When** the enrichment agent processes it **Then** each rewritten concept preserves the TONE and STYLE of the original Serbian note but translates/adapts it to the specific business being onboarded

4. **Given** a concept is being rewritten **When** the enrichment agent finishes **Then** each concept is minimum 5000 words with: detailed analysis, industry-specific strategies, competitor references, market data, actionable recommendations

5. **Given** a concept is being rewritten **When** the enrichment agent includes sources **Then** each concept includes hyperlinks and URLs to real sources that confirm the research (websites, articles, reports, data)

6. **Given** a concept references other concepts **When** links are created **Then** all internal [[wikilinks]] between concepts are preserved (pointing to the tenant's own concept notes, not the template vault)

7. **Given** a concept is enriched **When** metadata is set **Then** YAML frontmatter includes: title, departmentTags, sectionTags (per H2/H3 section), confidence (0.7 initial), lastReinforced, tier (semantic)

8. **Given** onboarding triggers enrichment **When** the process runs **Then** the initial 100 concepts complete during onboarding (background processing acceptable) and the remaining 345 concepts are NOT enriched during onboarding — they are populated later via AI recommended tasks

9. **Given** enrichment completes for any concept **When** the monitoring dashboard is checked **Then** each enrichment operation is logged with: tenant, concept name, duration, word count, status — visible in the Brain Activity Monitor

## Tasks / Subtasks

- [x] Task 1: Concept Priority Ranking Service (AC: #1)
  - [x] 1.1: Create `apps/api/src/app/vault/concept-priority.service.ts` that ranks 445 concepts by relevance to a business profile
  - [x] 1.2: Implement ranking algorithm: score each concept by keyword overlap with business profile (industry, products, services, target clients), category relevance to the business type, and concept hierarchy position (root concepts score higher)
  - [x] 1.3: Return top 100 concept IDs ordered by relevance score
  - [x] 1.4: Log priority ranking results to VaultOperationLog

- [x] Task 2: Enrichment Agent SOUL.md Template (AC: #2, #3, #4, #5, #6, #7)
  - [x] 2.1: Create `apps/api/src/app/vault/enrichment-soul.template.ts` — generates SOUL.md for the concept-enricher agent
  - [x] 2.2: SOUL.md must instruct the agent to: preserve the original Serbian concept's tone and style, rewrite for the specific business, include minimum 5000 words, add real URLs/hyperlinks to sources, preserve [[wikilinks]], and tag each H2/H3 section with department identifiers
  - [x] 2.3: SOUL.md must include the full business profile (company name, industry, products, services, ICP, competitors, geography) as context
  - [x] 2.4: SOUL.md must include the original concept content as the reference for tone/style
  - [x] 2.5: SOUL.md must instruct the agent to use web_search for research and include real data (not fabricated)
  - [x] 2.6: Output format: full markdown document with YAML frontmatter (title, departmentTags, sectionTags, confidence, lastReinforced, tier)

- [x] Task 3: Sequential Enrichment Queue Service (AC: #2, #8)
  - [x] 3.1: Create `apps/api/src/app/vault/concept-enrichment.service.ts` with `enrichConceptsSequentially(tenantId, conceptIds[])` method
  - [x] 3.2: Process concepts ONE AT A TIME — call OpenClaw relay with the concept-enricher agent for each concept, wait for completion before starting the next
  - [x] 3.3: For each concept: generate the enrichment SOUL.md with business profile + original content → call OpenClaw relay → parse the response → update the Concept record (extendedDescription, definition, confidence, tier, lastReinforced, sectionTags)
  - [x] 3.4: Track progress: after each concept, log to VaultOperationLog (operationType: 'enrich', conceptsAffected: 1, details: { conceptName, wordCount })
  - [x] 3.5: Handle failures gracefully: if a concept enrichment fails, log the error, skip to next concept, don't abort the entire queue
  - [x] 3.6: Update vault conceptCount and the brain index (index.md) after each successful enrichment

- [x] Task 4: OpenClaw Agent Registration for Enricher (AC: #2)
  - [x] 4.1: Register a `concept-enricher` agent on the OpenClaw relay with MiniMax M2.7 model configuration
  - [x] 4.2: The agent must have web_search and web_fetch tools available for research
  - [x] 4.3: Deploy the SOUL.md to the relay via the existing register-agent endpoint (same pattern as process-deploy.service.ts)
  - [x] 4.4: The SOUL.md is regenerated per concept (different original content and context each time) but the agent ID stays the same

- [x] Task 5: Onboarding Integration (AC: #1, #8)
  - [x] 5.1: After vault creation (Story 1.1) completes, trigger the enrichment process
  - [x] 5.2: Call ConceptPriorityService to get top 100 concepts
  - [x] 5.3: Call ConceptEnrichmentService.enrichConceptsSequentially() with the top 100 IDs
  - [x] 5.4: Run as fire-and-forget background task (don't block onboarding)
  - [x] 5.5: The remaining 345 concepts stay as placeholders — enriched later via AI recommended tasks (Story 6.2)

- [x] Task 6: Enrichment Progress API (AC: #9)
  - [x] 6.1: Add `GET /api/v1/vault/enrichment-progress?tenantId=` endpoint returning: total concepts, enriched count, current concept being processed, estimated time remaining
  - [x] 6.2: Add enrichment-specific entries to VaultOperationLog for each concept enriched
  - [x] 6.3: Add WebSocket event `vault.concept.enriched` emitted after each concept completes so the frontend can show live progress

- [x] Task 7: Unit Tests (AC: all)
  - [x] 7.1: Test ConceptPriorityService: ranks concepts correctly for a sample business profile
  - [x] 7.2: Test ConceptEnrichmentService: processes concepts sequentially (not parallel)
  - [x] 7.3: Test ConceptEnrichmentService: handles single concept failure without aborting queue
  - [x] 7.4: Test enrichment SOUL.md template: includes business profile, original content, output format instructions
  - [x] 7.5: Test onboarding integration: vault creation triggers enrichment with top 100 concepts
  - [x] 7.6: Test enrichment progress endpoint: returns correct counts

## Dev Notes

### Critical Architecture Constraints

- **Sequential processing is NON-NEGOTIABLE.** Concepts must be enriched one at a time. Parallel enrichment causes duplicate information across concepts because each concept should reference what was already written in related concepts.
- **MiniMax M2.7 via OpenClaw relay.** Use the same pattern as process agent execution: register agent → call relay → parse response. Do NOT use AI Gateway directly.
- **5000 words minimum per concept.** This is a hard requirement. The agent's SOUL.md must explicitly state this. If the agent returns less, the concept should be flagged for re-enrichment.
- **Real research with URLs.** The agent must use web_search to find real data. No fabricated statistics or fake URLs.
- **Background processing.** Enrichment of 100 concepts takes hours. It must not block onboarding or any user-facing operation.

### Business Profile Source

The `BusinessProfile` interface at `apps/api/src/app/openclaw-tenant/business-profile.service.ts` provides:
- companyName, industry, description, products[], services[], targetClients[]
- geography, brandVoice, competitors[], uniqueValue, priceRange
- teamDescription, visualStyle, keyMetrics, rawSummary

This is populated during onboarding via website crawling + Gemini analysis. If not available, fall back to tenant.name + tenant.industry + tenant.description.

### Existing Code to Leverage

| File | What to Reuse |
|------|---------------|
| `apps/api/src/app/agent-execution/openclaw-client.service.ts` | `executeAgent()` for calling MiniMax via relay |
| `apps/api/src/app/openclaw-tenant/business-profile.service.ts` | `BusinessProfile` interface + `analyzeWebsite()` |
| `apps/api/src/app/builder/process-deploy.service.ts` lines 236-306 | Pattern for registering agents on the relay via POST /register-agent |
| `apps/api/src/app/vault/vault.service.ts` | VaultOperationLog pattern for monitoring |
| `apps/api/src/app/vault/source-vault.service.ts` | Source concept loading |
| `apps/api/src/app/knowledge/config/department-categories.ts` | Department tag mapping |

### Project Structure Notes

- New files: `concept-priority.service.ts`, `concept-enrichment.service.ts`, `enrichment-soul.template.ts` (all in `apps/api/src/app/vault/`)
- Modified: `vault.module.ts` (add new providers), `vault.service.ts` (trigger enrichment after creation)
- Agent: `concept-enricher` registered on OpenClaw relay (not a new local agent — uses relay's /register-agent)

### References

- [Source: _bmad-output/planning-artifacts/epics-v2-autonomous-brain.md#Story 1.2]
- [Source: _bmad-output/planning-artifacts/prd-v2-autonomous-brain-architecture.md#Section 3.1]
- [Source: apps/api/src/app/openclaw-tenant/business-profile.service.ts — BusinessProfile interface]
- [Source: apps/api/src/app/agent-execution/openclaw-client.service.ts — OpenClaw relay client]
- [Source: apps/api/src/app/builder/process-deploy.service.ts#236-306 — agent registration pattern]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.6 (1M context)

### Completion Notes List

- Story created from exhaustive codebase analysis
- 7 tasks, 27 subtasks covering: priority ranking, SOUL.md template, sequential queue, agent registration, onboarding integration, progress API, and tests
- Key decision: use OpenClaw relay with concept-enricher agent (MiniMax M2.7), not AI Gateway directly
- BusinessProfile provides rich context for enrichment prompts

### File List

**New files:**
- apps/api/src/app/vault/concept-priority.service.ts
- apps/api/src/app/vault/concept-enrichment.service.ts
- apps/api/src/app/vault/enrichment-soul.template.ts

**Modified files:**
- apps/api/src/app/vault/vault.module.ts (added new providers + AgentExecutionModule + AppEventsModule)
- apps/api/src/app/vault/vault.controller.ts (added enrichment-progress endpoint + ConceptEnrichmentService injection)
- apps/api/src/app/onboarding/onboarding.service.ts (added enrichment + priority service injection, vault→enrich flow)
- apps/api/src/app/onboarding/onboarding.module.ts (added ConceptPriorityService + ConceptEnrichmentService providers)
