# Story 2.14: Universal Web Search in Task/Workflow Execution

Status: done

## Story

As a **business user executing tasks through the Mentor AI platform**,
I want every task and workflow step to automatically research relevant current information via web search before generating its response,
So that the AI advice I receive is grounded in up-to-date market data, current best practices, and real-world examples rather than relying solely on training data.

## Acceptance Criteria

1. **AC1: Web Search on Every Task Step**
   - **Given** a workflow step is being executed (YOLO or manual)
   - **When** `executeStepAutonomous()` runs for any step
   - **Then** a web search is always performed (not just for keyword-matching steps)
   - **And** search results are injected into the LLM context before generating the response
   - **And** the step execution still succeeds if web search fails or is unavailable

2. **AC2: Intelligent Search Query Construction**
   - **Given** a workflow step "Create a SWOT Analysis" for concept "Brand Positioning"
   - **When** the web search query is built
   - **Then** it combines: concept name, step title, company name, and industry
   - **And** includes the current year for temporal relevance (e.g., "Brand Positioning SWOT Analysis tech startup 2026")
   - **And** generates a search-engine-optimized query (not raw title concatenation)

3. **AC3: Deep Research with Page Content Extraction**
   - **Given** web search returns top results
   - **When** results are processed for context injection
   - **Then** the system fetches full page content from the top 2-3 most relevant results (not just snippets)
   - **And** extracts useful text content (stripping HTML, navigation, ads)
   - **And** truncates extracted content to prevent context window overflow (max 3000 chars per page)
   - **And** the total injected web context does not exceed 10,000 characters

4. **AC4: Source Attribution in AI Response**
   - **Given** web search results are used in generating a response
   - **When** the AI produces its output
   - **Then** the system prompt instructs the AI to cite web sources where used
   - **And** source URLs are included in a "Izvori / Sources" section at the end of the response
   - **And** the user can see which information came from real-time web research

5. **AC5: Graceful Degradation**
   - **Given** the Serper API key is not configured or the API is down
   - **When** a workflow step executes
   - **Then** the step continues without web search context
   - **And** a log warning is emitted (not an error)
   - **And** the user is not shown any error — the response is generated from AI knowledge alone

## Tasks / Subtasks

- [x] **Task 1: Remove keyword-only filter from workflow execution** (AC: 1)
  - 1.1 In `workflow.service.ts`, remove the `shouldPerformWebSearch()` method
  - 1.2 In `executeStepAutonomous()`, always call web search (remove the `if (this.shouldPerformWebSearch(step))` conditional)
  - 1.3 Keep the `if (this.webSearchService.isAvailable())` guard to respect missing API key

- [x] **Task 2: Improve search query construction** (AC: 2)
  - 2.1 Create `buildSearchQuery()` method in `workflow.service.ts`
  - 2.2 Combine concept name + step title + company name + industry intelligently
  - 2.3 Append current year for temporal relevance
  - 2.4 Remove duplicate words and limit query to 10-12 meaningful words
  - 2.5 For Serbian concept names, optionally translate key terms to English for better search results

- [x] **Task 3: Add deep page content extraction** (AC: 3)
  - 3.1 After getting search results, call `webSearchService.fetchWebpage()` for top 2-3 results
  - 3.2 Run page fetches in parallel with `Promise.allSettled()` (non-blocking, tolerates failures)
  - 3.3 Merge extracted content with search snippets into structured context
  - 3.4 Enforce total context limit: 10,000 chars across all web results
  - 3.5 Prioritize content by relevance: title match > snippet quality > page content

- [x] **Task 4: Enhance web context formatting and injection** (AC: 4)
  - 4.1 Structure web context section with clear source attribution
  - 4.2 Format: `**[Source Title](URL)** - Extracted content summary`
  - 4.3 Add instruction in system prompt: "Citiraj izvore iz web istraživanja gde je relevantno. Na kraju odgovora, navedi korišćene izvore pod 'Izvori / Sources'."
  - 4.4 Inject web context AFTER concept knowledge and business info in the system prompt

- [x] **Task 5: Add web search timeout and parallel fetch limits** (AC: 1, 5)
  - 5.1 Set search API timeout to 8 seconds (currently 10s)
  - 5.2 Set page fetch timeout to 10 seconds per page (currently 15s)
  - 5.3 Total web research phase should not exceed 15 seconds
  - 5.4 If timeout reached, proceed with whatever results are available
  - 5.5 Add `Promise.race()` with global timeout for the entire web research phase

- [x] **Task 6: Update WebSearchService for batch fetching** (AC: 3)
  - 6.1 Add `searchAndExtract(query: string, numResults: number)` method to `web-search.service.ts`
  - 6.2 This method combines search + page extraction into a single call
  - 6.3 Returns `EnrichedSearchResult[]` with `title, link, snippet, pageContent?`
  - 6.4 Handles timeouts, failures, and content limits internally

- [x] **Task 7: Shared types** (AC: 3, 4)
  - 7.1 Add `EnrichedSearchResult` interface to `shared/types/src/lib/types.ts`
  - 7.2 Include: `title`, `link`, `snippet`, `pageContent?`, `fetchedAt`

- [x] **Task 8: Backend tests** (AC: 1-5)
  - 8.1 Unit test: `buildSearchQuery()` — verify intelligent query construction
  - 8.2 Unit test: Web search always runs when available (no keyword filter)
  - 8.3 Unit test: Page extraction with timeout — verify parallel fetch and truncation
  - 8.4 Unit test: Graceful degradation when API unavailable — step still completes
  - 8.5 Unit test: Context size limits enforced (< 10,000 chars)
  - 8.6 Unit test: Source attribution format in injected context
  - 8.7 Update existing workflow.service tests that mock `shouldPerformWebSearch()`
  - 8.8 Target: 80% coverage on new/modified code

- [x] **Task 9: Build verification** (AC: 1-5)
  - 9.1 `npx nx build api` passes with no TypeScript errors
  - 9.2 `npx nx test api` — all existing + new tests pass
  - 9.3 `npx nx build web` passes (shared types change)
  - 9.4 Manual verification: Execute a YOLO task with `SERPER_API_KEY` set, verify web context appears in AI responses
  - 9.5 Manual verification: Execute a task WITHOUT `SERPER_API_KEY`, verify task completes normally

## Dev Notes

### Critical: What Already Exists

**WebSearchService** (`apps/api/src/app/web-search/web-search.service.ts`):
- `search(query, numResults)` → `SearchResult[]` (title, link, snippet)
- `fetchWebpage(url)` → extracted text (max 5000 chars)
- `isAvailable()` → boolean (checks `SERPER_API_KEY`)
- Uses `axios` for HTTP, `serper.dev` for Google Search API

**Current integration in WorkflowService** (`workflow.service.ts:649-662`):
```typescript
// CURRENT (keyword-filtered):
if (this.webSearchService.isAvailable() && this.shouldPerformWebSearch(step)) {
  const searchQuery = `${step.title} ${step.conceptName} ${companyName} ${tenant?.industry ?? ''}`.trim();
  const searchResults = await this.webSearchService.search(searchQuery, 5);
  // ... format as webSearchContext string
}

// TARGET (always search):
if (this.webSearchService.isAvailable()) {
  const searchQuery = this.buildSearchQuery(step, tenant);
  const enrichedResults = await this.webSearchService.searchAndExtract(searchQuery, 5);
  webSearchContext = this.formatWebContext(enrichedResults);
}
```

**shouldPerformWebSearch()** (to be removed, `workflow.service.ts:810-818`):
```typescript
private shouldPerformWebSearch(step: ExecutionPlanStep): boolean {
  const keywords = [
    'istraživanje', 'analiza', 'tržište', 'konkurent', 'trend',
    'benchmark', 'research', 'market', 'competitor', 'analysis',
    'industry', 'industrija', 'strategij', 'swot',
  ];
  const text = `${step.title} ${step.description ?? ''}`.toLowerCase();
  return keywords.some((kw) => text.includes(kw));
}
```

### Search Query Optimization

Bad: `"Create a SWOT Analysis Brand Positioning Tech Startup"`
Good: `"Brand Positioning SWOT Analysis tech startup best practices 2026"`

Strategy:
1. Lead with concept name (most specific term)
2. Add step action keyword (analysis, framework, strategy)
3. Add industry context
4. Append current year
5. Remove filler words ("Create a", "Draft a")

### Context Size Budget

| Component | Max Chars |
|-----------|-----------|
| Search snippets (5 results) | ~2,500 |
| Page content (top 3 pages) | ~7,500 (2,500 each) |
| **Total web context** | **10,000** |
| System prompt (without web) | ~4,000 |
| Concept knowledge | ~2,000 |
| Business info | ~1,000 |
| **Total system prompt** | **~17,000** |

This fits within standard LLM context windows with room for conversation history.

### Timeout Strategy

```
Total web research budget: 15 seconds
├── Search API call: 8s max
├── Page fetch (parallel, 3 pages): 10s max
└── Promise.race() enforces 15s total
```

If the search API takes 8s, only 7s remain for page fetching. This is handled by `Promise.race()` wrapping the entire web research phase.

### System Prompt Addition for Source Attribution

Append to the existing persona system prompt:
```
Kada koristiš informacije iz web istraživanja, citiraj izvor.
Na kraju odgovora dodaj sekciju:

**Izvori / Sources:**
- [Naziv izvora](URL)
```

### Files to Modify

```
apps/api/src/app/workflow/
├── workflow.service.ts           (modified — remove keyword filter, add buildSearchQuery, formatWebContext)
└── workflow.service.spec.ts      (modified — update web search mocks)

apps/api/src/app/web-search/
├── web-search.service.ts         (modified — add searchAndExtract method)
└── web-search.service.spec.ts    (modified — add searchAndExtract tests)

shared/types/src/lib/
└── types.ts                      (modified — EnrichedSearchResult interface)
```

### Environment Variable

Requires `SERPER_API_KEY` in `apps/api/.env`:
```env
SERPER_API_KEY=your-serper-api-key-here
```

Free tier: 2,500 searches/month. With YOLO running 40+ concepts × 3 steps each = ~120 searches per run.

### Dependencies

- Story 2-2 (AI Gateway — done): Provides LLM integration
- Story 2-4 (Department Personas — done): Provides step execution framework
- WebSearchModule already registered in AppModule

### Testing Standards

- **Backend (Jest):** 80% coverage target
- Mock `axios.post` for Serper API responses
- Mock `axios.get` for page content fetching
- Test timeout scenarios with `jest.useFakeTimers()` or delayed mock promises
- Verify graceful degradation paths (no API key, API error, timeout)
- Verify existing tests still pass after removing `shouldPerformWebSearch()`

### References

- Architecture: `_bmad-output/architecture.md` — AI Gateway section
- Serper.dev API: https://serper.dev/docs
- WebSearchService: `apps/api/src/app/web-search/web-search.service.ts`
- WorkflowService: `apps/api/src/app/workflow/workflow.service.ts`

## File List

| File | Action | Description |
|------|--------|-------------|
| `apps/api/src/app/workflow/workflow.service.ts` | Modified | Removed `shouldPerformWebSearch()`, replaced inline search with `buildSearchQuery()` + `searchAndExtract()` + `formatWebContext()` |
| `apps/api/src/app/web-search/web-search.service.ts` | Modified | Added `searchAndExtract()` method, timeout constants, content limit constants |
| `shared/types/src/lib/types.ts` | Modified | Added `EnrichedSearchResult` interface |
| `apps/api/src/app/workflow/workflow.service.spec.ts` | Created | 18 unit tests for `buildSearchQuery()`, `formatWebContext()`, and `executeStepAutonomous` web search integration |
| `apps/api/src/app/web-search/web-search.service.spec.ts` | Created | 16 unit tests for `isAvailable()`, `search()`, `fetchWebpage()`, `searchAndExtract()` |

## Dev Agent Record

- **Agent Model:** Claude Opus 4.6
- **Date:** 2026-02-09
- **Implementation Notes:**
  - Removed keyword-only web search filter (`shouldPerformWebSearch()`) — web search now runs on every step when API key is available
  - `buildSearchQuery()` splits concept name into words, strips filler words from title, deduplicates case-insensitively, adds company name + industry + year, limits to 12 words
  - `searchAndExtract()` combines search + parallel page fetch with `Promise.race()` global 15s timeout, `Promise.allSettled()` for parallel fetches
  - `formatWebContext()` structures results with Serbian source attribution instructions
  - Timeout constants: SEARCH_TIMEOUT_MS (8s), PAGE_FETCH_TIMEOUT_MS (10s), TOTAL_WEB_RESEARCH_TIMEOUT_MS (15s)
  - Content limits: MAX_PAGE_CONTENT_CHARS (3000), MAX_TOTAL_WEB_CONTEXT_CHARS (10000)
  - Both `buildSearchQuery()` and `formatWebContext()` exposed as public for direct unit testing
- **Debug Log:**
  - Initial dedup test failed — `buildSearchQuery` pushed concept name as single string instead of splitting into words. Fixed by using `...step.conceptName.split(/\s+/)`
  - Jest "did not exit" warning from `searchAndExtract` global timeout setTimeout — fixed by adding `clearTimeout` in `finally` block

## Change Log

| Date | Change | Reason |
|------|--------|--------|
| 2026-02-09 | Removed `shouldPerformWebSearch()` method | AC1: Web search should run on every step, not just keyword-matching ones |
| 2026-02-09 | Added `buildSearchQuery()` to WorkflowService | AC2: Intelligent search query construction with dedup, filler removal, year |
| 2026-02-09 | Added `searchAndExtract()` to WebSearchService | AC3: Deep page content extraction with parallel fetch and content limits |
| 2026-02-09 | Added `formatWebContext()` to WorkflowService | AC4: Source attribution formatting with Serbian instructions |
| 2026-02-09 | Added timeout constants and `Promise.race()` | AC5: Graceful degradation with 15s global timeout |
| 2026-02-09 | Added `EnrichedSearchResult` to shared types | AC3/AC4: Shared type for enriched search results |
| 2026-02-09 | Created 30 unit tests (16 web-search + 14 workflow) | AC1-5: Full test coverage for new functionality |
| 2026-02-09 | [Review] Added company name to `buildSearchQuery()` | AC2: Query must include concept name, step title, company name, and industry |
| 2026-02-09 | [Review] Fixed timer leak in `searchAndExtract()` — added `clearTimeout` in `finally` | Prevented dangling 15s timers on every search call |
| 2026-02-09 | [Review] Replaced inline `import()` type with proper top-level import | Project import rules compliance |
| 2026-02-09 | [Review] Added 4 tests: company name inclusion + 3 `executeStepAutonomous` integration tests | AC1/AC5: Verify web search is always called, graceful degradation |
| 2026-02-09 | [Review] Documented Serbian translation gap in JSDoc | Task 2.5 known limitation |
