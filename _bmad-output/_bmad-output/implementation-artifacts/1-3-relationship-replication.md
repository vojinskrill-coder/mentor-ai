# Story 1.3: Relationship Replication from Source Vault

Status: ready-for-dev

## Story

As a business owner viewing my brain graph,
I want to see the same meaningful connections between concepts as in the proven source curriculum,
so that I understand how different aspects of my business relate to each other.

## Acceptance Criteria

1. **Given** the source vault has 445 concepts with [[wikilinks]] **When** the tenant brain is created **Then** ALL wikilink-based relationships from the original content are extracted and created as ConceptRelationship edges in the tenant's vault

2. **Given** relationships are created **When** types are assigned **Then** earlier chapter → PREREQUISITE, same chapter → RELATED, later chapter → ADVANCED

3. **Given** concepts have [[wikilinks]] in content **When** the vault is created **Then** wikilinks point to the tenant's own concept notes (not template IDs)

4. **Given** concepts have a ## References section **When** content is stored **Then** the References section has correct links to tenant-scoped concepts

5. **Given** the vault is created **When** the graph is rendered **Then** the relationship graph is identical in structure to the source vault

6. **Given** the brain is growing **When** new concepts are added **Then** new relationships can be created by agents over time

7. **Given** relationships are created **When** monitoring is checked **Then** relationship count is logged in VaultOperationLog

## Tasks / Subtasks

- [ ] Task 1: Wikilink Extraction from Source Content (AC: #1, #3)
  - [ ] 1.1: Add `extractWikilinks(content: string): string[]` method to SourceVaultService that parses [[concept name]] patterns from markdown content
  - [ ] 1.2: During vault creation in VaultService.createTenantRelationships(), also extract wikilinks from each concept's originalContent and create RELATED edges for them
  - [ ] 1.3: Resolve wikilink targets to tenant concept IDs by matching on concept name (case-insensitive)

- [ ] Task 2: ADVANCED Relationship Type (AC: #2)
  - [ ] 2.1: In createTenantRelationships(), when a concept links to a concept from a LATER chapter (higher categorySortOrder), create an ADVANCED relationship instead of RELATED
  - [ ] 2.2: Ensure the three types are correctly assigned: PREREQUISITE (parent→child), RELATED (same chapter siblings + same-chapter wikilinks), ADVANCED (cross-chapter to later content)

- [ ] Task 3: References Section Maintenance (AC: #4)
  - [ ] 3.1: When enrichment rewrites a concept (Story 1.2), ensure the ## References section at the bottom contains [[wikilinks]] to related concepts from the tenant vault
  - [ ] 3.2: Add instruction to the enrichment SOUL.md template to maintain the References section with correct [[wikilinks]]

- [ ] Task 4: Relationship Creation API (AC: #6)
  - [ ] 4.1: Add `POST /api/v1/vault/relationships` endpoint that allows agents to create new relationships between tenant concepts
  - [ ] 4.2: Validate: both concepts exist and belong to the same tenant, relationship type is valid, no duplicate edges
  - [ ] 4.3: Log relationship creation to VaultOperationLog (AC: #7)

- [ ] Task 5: Tests (AC: all)
  - [ ] 5.1: Test wikilink extraction from markdown content
  - [ ] 5.2: Test ADVANCED vs RELATED vs PREREQUISITE type assignment based on chapter ordering
  - [ ] 5.3: Test relationship creation endpoint validation

## Dev Notes

### Key Insight
Story 1.1 already creates PREREQUISITE (parent→child) and RELATED (sibling) relationships from the curriculum hierarchy. This story adds:
1. Wikilink-based RELATED relationships from content [[links]]
2. ADVANCED type for cross-chapter forward references
3. API endpoint for agents to create new relationships over time

### Existing Code
- `VaultService.createTenantRelationships()` — already creates hierarchy-based relationships
- `seed-obsidian.ts` Pass 2 (lines 338-388) — reference implementation for wikilink extraction + relationship type assignment
- `ConceptRelationship` model with @@unique([sourceConceptId, targetConceptId]) — prevents duplicates

### References
- [Source: apps/api/prisma/seed-obsidian.ts#Pass 2 — wikilink extraction pattern]
- [Source: apps/api/src/app/vault/vault.service.ts#createTenantRelationships — existing hierarchy relationships]

## Dev Agent Record

### Agent Model Used
Claude Opus 4.6 (1M context)

### File List
