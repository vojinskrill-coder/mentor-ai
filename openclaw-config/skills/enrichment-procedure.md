# Enrichment Procedure — Platform-Wide Learned Skills
# Version: 1.0 | Updated: 2026-04-14
# This file is deployed to OpenClaw's workspace for ALL tenants

## Session Strategy
- Use ONE persistent session per tenant (sessionId: "enrichment-{tenantId}")
- Compact every 20 concepts (summarize to MEMORY.md, archive conversation)
- Read log.md at session start to see what's already done
- Cross-reference previous concepts via [[wikilinks]]

## Research Best Practices
- Always do web_search BEFORE writing — never fabricate data
- Useful sources: Fortune Business Insights, Statista, industry reports
- Every claim needs an inline citation: "Market is $X ([Source](URL))"
- Minimum 5 sources per article with real URLs
- Search queries: "{concept} {industry} best practices 2025 2026"

## Writing Structure
- Follow SCHEMA.md exactly — 9 sections, each 400+ words
- Total minimum: 5,000 words
- Every H2 section gets a <!-- dept:tag --> marker
- Use [[wikilinks]] to connect to other vault concepts
- Tables with real data wherever possible (min 3 per article)
- Bold **key terms** on first use

## Quality Checks (Self-Validate Before Declaring Complete)
- [ ] 5,000+ words (check with wc -w)
- [ ] All 9 sections present
- [ ] English only — no Serbian characters (čćšžđ)
- [ ] Sources section with real URLs
- [ ] dept tags on every H2
- [ ] YAML frontmatter complete
- [ ] index.md updated
- [ ] log.md updated

## Common Errors to Avoid
- Writing in Serbian — ALWAYS English
- Returning article content in messages — ALWAYS write to vault file
- Fabricating URLs — use web_search to find real ones
- Skipping Sources section — article rejected without it
- Using stale session with 192K context — compact when needed
- Spawning parallel sub-agents — use sequential one-shot only
