# SCHEMA.md — {{companyName}} Knowledge Vault

## Purpose

This file defines the article structure and conventions for all concept articles in the {{companyName}} knowledge vault. Every enrichment agent MUST read this file before writing any content.

## Industry Context

Industry: {{industry}}

## Article Structure (9 Sections)

Every concept article MUST contain the following 9 sections in order:

### 1. Frontmatter
```yaml
---
title: [Concept Name]
category: [Category Name]
industry: {{industry}}
company: {{companyName}}
departmentTags: [relevant departments]
status: enriched
wordCount: [actual count]
lastEnriched: [ISO date]
sources: [number of citations]
---
```

### 2. Executive Summary
A concise 150-300 word overview of the concept and its direct relevance to {{companyName}} in the {{industry}} industry. Must answer: what is this, why does it matter, what should the reader take away?

### 3. Core Concepts
Detailed explanation of fundamental principles, terminology, and frameworks. Include definitions, models, and theoretical foundations. Minimum 800 words.

### 4. Industry Application
How this concept specifically applies to the {{industry}} industry. Real-world examples, case studies, and practical implementation patterns. Minimum 600 words.

### 5. Company Context
Direct application to {{companyName}}: how this concept impacts the business, current state assessment, and recommended actions. Minimum 500 words.

### 6. Implementation Guide
Step-by-step actionable guidance. Include timelines, resource requirements, KPIs, and success metrics. Minimum 600 words.

### 7. Competitive Landscape
How competitors and industry leaders approach this concept. Benchmarks, best practices, and differentiation opportunities. Minimum 400 words.

### 8. Related Concepts
Wikilinks to related concepts using `[[concept-slug]]` syntax. Explain the relationship between this concept and each linked concept. Group by: prerequisites, related, and advanced topics.

### 9. Sources
All citations with URLs where available. Minimum 5 sources per article. Format:
- [Author/Organization] — [Title] — [URL] — [Access Date]

## Quality Requirements

- **Minimum word count**: 5000 words per article
- **Language**: ALL content MUST be in ENGLISH
- **No fabricated data**: Every claim must be sourced or clearly marked as analysis
- **No placeholder text**: Zero instances of "TODO", "TBD", "placeholder", or "[insert]"
- **Wikilinks**: Use `[[concept-slug]]` for cross-references (not raw URLs to other articles)
- **Markdown**: Use proper heading hierarchy (## for sections, ### for subsections)
- **Tables**: Use markdown tables for comparisons, metrics, and structured data
- **Department tags**: Every article must have at least one department tag from the category mapping
