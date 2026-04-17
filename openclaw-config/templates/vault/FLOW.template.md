# FLOW.md — Enrichment Pipeline Documentation

## Pipeline Overview

This document describes the enrichment flow for the {{companyName}} knowledge vault. Each concept goes through a structured pipeline to produce a comprehensive, validated article.

## Pipeline Stages

```
QUEUED → DISPATCHED → EXECUTING → VALIDATING → COMPLETED
                                      ↓
                                  CORRECTING → VALIDATING (retry)
                                      ↓
                                    FAILED (after max retries)
```

## Stage Details

### 1. QUEUED
Concept is in the enrichment queue, waiting to be picked up. Concepts are prioritized by:
- Category balance (spread across departments)
- Prerequisite relationships (foundational concepts first)
- Relevance score to {{industry}} industry

### 2. DISPATCHED
Concept has been assigned to an agent session. The agent:
1. Reads TENANT-PROTOCOL.md (if not already in session)
2. Reads SCHEMA.md (if not already in session)
3. Loads the concept metadata (name, category, department tags)

### 3. EXECUTING
Agent is actively researching and writing the article:
1. **Research phase**: Web search for the concept in context of {{industry}}
2. **Outline phase**: Structure the 9 sections per SCHEMA.md
3. **Writing phase**: Produce the full article (5000+ words)
4. **Cross-reference phase**: Add `[[wikilinks]]` to related concepts
5. **Save phase**: Write the article to `vault/wiki/concepts/{slug}.md`

### 4. VALIDATING
Article is checked against GUARDRAILS.md Checkpoint 2:
- Word count >= 5000
- English only
- Frontmatter complete
- All 9 sections present
- Sources >= 5
- No placeholders

### 5. CORRECTING
If validation fails, the agent self-corrects:
- Reads the specific failures
- Fixes only the identified issues
- Re-submits for validation
- Maximum 2 correction attempts

### 6. COMPLETED
Article passed all validation checks. The system:
- Updates `index.md` with status: enriched
- Logs completion to `log.md`
- Embeds the article in Qdrant for semantic search
- Moves to the next concept in the queue

### 7. FAILED
Article failed validation after max correction attempts. The system:
- Logs the failure and specific errors
- Moves to the next concept
- Failed concepts can be retried in a later batch

## Session Compaction

After every 20 enrichments:
1. Write session learnings to `vault/wiki/skills/session-learnings.md`
2. Clear accumulated session history
3. Read `log.md` and `index.md` to recover state
4. Continue with clean context

## Cross-Concept References

When writing concept B and needing to reference concept A:
1. Read `vault/wiki/concepts/concept-a.md` for specific content
2. Or search Qdrant with `tenantId` filter for semantic matches
3. Use `[[concept-a]]` wikilink syntax in the article
4. Do NOT hold concept A's full article in session context
