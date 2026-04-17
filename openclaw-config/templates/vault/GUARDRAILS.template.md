# GUARDRAILS.md — Validation Checkpoints

## Checkpoint 1: Before Writing

Before writing or editing any concept article, verify:

1. **SCHEMA loaded**: You have read SCHEMA.md in this session and know the 9-section structure
2. **Concept identified**: You know the exact concept name, category, and department tags
3. **Research complete**: You have gathered at least 5 sources on the topic
4. **No duplicates**: Check `index.md` to confirm this concept is not already enriched (status != "enriched")
5. **Tenant context**: You are operating within the correct tenant scope

### Pre-write Checklist
```
[ ] SCHEMA.md read
[ ] Concept slug confirmed
[ ] Research sources >= 5
[ ] index.md checked
[ ] Tenant ID verified
```

## Checkpoint 2: After Writing

After completing an article, verify ALL of the following before marking as complete:

1. **Word count**: Article contains 5000+ words (count all words excluding frontmatter YAML)
2. **Language**: ALL content is in English — zero non-English sentences
3. **Frontmatter**: YAML frontmatter block is present with all required fields (title, category, industry, company, departmentTags, status, wordCount, lastEnriched, sources)
4. **9 sections present**: Executive Summary, Core Concepts, Industry Application, Company Context, Implementation Guide, Competitive Landscape, Related Concepts, Sources — all present with content
5. **Sources section**: Contains at least 5 citations with author/org, title, and URL where available
6. **No placeholders**: Zero instances of "TODO", "TBD", "placeholder", "[insert]", or "lorem ipsum"
7. **Wikilinks valid**: All `[[concept-slug]]` references point to concepts that exist in index.md
8. **Markdown valid**: Proper heading hierarchy, no broken tables, no unclosed code blocks

### Post-write Checklist
```
[ ] Word count >= 5000
[ ] English only
[ ] Frontmatter complete
[ ] All 9 sections present
[ ] Sources >= 5
[ ] No placeholders
[ ] Wikilinks valid
[ ] Markdown valid
```

## Correction Protocol

If any post-write check fails:

1. **Identify** the specific failure(s) from Checkpoint 2
2. **Correct** the article to fix ONLY the identified issues
3. **Re-validate** against Checkpoint 2
4. **Maximum retries**: 2 correction attempts per article
5. If still failing after 2 corrections, mark the concept as FAILED with the specific errors logged

### Correction Priority
| Issue | Priority | Action |
|-------|----------|--------|
| Word count below 5000 | HIGH | Expand weakest sections with additional analysis |
| Missing sections | HIGH | Add the missing section with substantive content |
| Non-English content | HIGH | Rewrite non-English portions in English |
| Missing frontmatter | MEDIUM | Add complete YAML frontmatter block |
| Missing sources | MEDIUM | Research and add citations |
| Placeholder text | MEDIUM | Replace with real content |
| Broken wikilinks | LOW | Fix slug or remove link |
| Markdown issues | LOW | Fix formatting |
