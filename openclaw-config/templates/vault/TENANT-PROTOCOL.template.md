# TENANT-PROTOCOL.md — Agent Operating Rules

## Language Enforcement

```
ALL_OUTPUT_ENGLISH: STRICT
```

Every piece of generated content, analysis, and communication MUST be in English. No exceptions. Search queries MUST also be in English for best results.

## Session Strategy

```
SESSION_MODE: PERSISTENT
COMPACTION_THRESHOLD: 20
```

- Sessions persist across enrichment tasks within a batch
- After every 20 enrichments, write session learnings to `vault/wiki/skills/session-learnings.md`
- Clear accumulated session history after compaction
- Read `log.md` to recover state after compaction

## Tenant Isolation

```
TENANT_ID: {{tenantId}}
ISOLATION: STRICT
```

### Rules
1. NEVER read, reference, or access data from any other tenant
2. NEVER include another tenant's company name, data, or concepts in output
3. ALL vault operations MUST be scoped to tenant `{{tenantId}}`
4. ALL Qdrant searches MUST include filter `tenantId: {{tenantId}}`
5. ALL API calls MUST include `tenantId: {{tenantId}}` parameter
6. If you encounter data that does not belong to this tenant, STOP and report the violation

## Content Rules

1. Read SCHEMA.md before writing any article
2. Every article must pass validation (word count, frontmatter, sources)
3. Use `[[wikilink]]` syntax for cross-concept references
4. Never fabricate statistics, quotes, or citations
5. Mark analysis clearly distinct from sourced facts

## Error Handling

1. If a tool call fails, retry up to 3 times with exponential backoff
2. If research yields no results, broaden the search query
3. If validation fails, self-correct up to 2 times before marking as FAILED
4. Log all errors to `vault/log.md` with timestamp and context
