---
name: Karpathy LLM Wiki Pattern — Knowledge Architecture Reference
description: Core principles from Karpathy's LLM Wiki gist + v2 extensions. Defines how Obsidian vault should work as extended agent memory in Neuron OS.
type: reference
---

## Sources
- Karpathy gist: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
- LLM Wiki v2 (rohitg00): https://gist.github.com/rohitg00/2067ab416f7bbe447c1977edaaa681e2
- Video: https://www.youtube.com/watch?v=l5Diqeoffa4

## Core Insight: Compile, Don't Re-derive
Traditional RAG re-discovers knowledge from scratch on every query. Nothing accumulates.
The LLM Wiki alternative: LLM incrementally builds and maintains a persistent wiki.
New sources get INTEGRATED into existing pages — not stored as isolated records.

## Three-Layer Architecture
1. **raw/** — Immutable source docs. LLM reads, never modifies. Source of truth.
2. **wiki/** — LLM-generated markdown. Summaries, entity pages, concept pages. LLM owns entirely.
3. **Schema** (CLAUDE.md) — Conventions, workflows, entity types. Co-evolved by human + LLM.

## Three Core Operations
- **Ingest**: New source → LLM reads → writes summary page → updates index → updates 10-15 entity/concept pages
- **Query**: Search wiki → synthesize answer → good answers filed back as new pages (compounding)
- **Lint**: Health-check. Find contradictions, stale claims, orphan pages, missing cross-refs.

## Knowledge Lifecycle (v2 extension)
- Confidence scoring (sources count, recency, contradictions)
- Supersession (new info replaces old, linked + timestamped)
- Forgetting curve (retention decays, reinforcement resets)
- Consolidation tiers: working → episodic → semantic → procedural memory

## How to apply: Obsidian vault structure for Neuron OS agents
- raw/ = conversations, uploaded docs, meeting notes, market data
- wiki/ = concepts (living, LLM-updated), entities, decisions, processes, insights
- index.md = master catalog (cheaper than vector search for <500 pages)
- log.md = append-only operation log
- Each page: YAML frontmatter with confidence, last_reinforced, tier, relationships

## Current gaps in our codebase
- Concepts are static seeds, not LLM-maintained living docs
- No raw source layer (immutable originals)
- No ingest pipeline that updates existing concepts from conversations
- No confidence scoring or staleness tracking
- No lint/self-healing operation
- No "file answer back" loop (conversation insights don't crystallize into wiki)
