# Story 3.1: Business Concepts Data Model & Seeding

Status: done

## Story

As a **platform administrator**,
I want the 600 business concepts loaded into the system with proper categorization,
so that users and AI can reference structured business knowledge.

## Acceptance Criteria

1. **AC1: Concept Data Model**
   - **Given** the platform database is initialized
   - **When** the concept seeding runs
   - **Then** 600 business concepts are imported with:
     - Unique ID (cpt_ prefix)
     - Name and category (Finance, Marketing, Technology, Operations, Legal, Creative)
     - Definition (2-3 sentences)
     - Extended description (full explanation)
     - Related concepts (links to other concept IDs)
     - Department tags for filtering

2. **AC2: Category Queries**
   - **Given** concepts are loaded
   - **When** queried by category
   - **Then** concepts are returned grouped by business function
   - **And** query response time is < 100ms

3. **AC3: Concept Relationships**
   - **Given** a concept has related concepts
   - **When** the relationship is stored
   - **Then** bidirectional links are maintained
   - **And** relationship types are categorized (prerequisite, related, advanced)

4. **AC4: Version Management**
   - **Given** the concept library needs updating
   - **When** new concepts are added or existing ones modified
   - **Then** changes can be applied via migration scripts
   - **And** version history is maintained

## Tasks / Subtasks

- [x] **Task 1: Prisma schema - Concept model** (AC: 1,3)
  - [x] 1.1 Add `Concept` model to Platform DB schema with cpt_ prefix
  - [x] 1.2 Add `ConceptRelationship` model for bidirectional links
  - [x] 1.3 Add `RelationshipType` enum (PREREQUISITE, RELATED, ADVANCED)
  - [x] 1.4 Run `prisma generate` and create migration

- [x] **Task 2: Shared types** (AC: 1,2,3)
  - [x] 2.1 Add `Concept` interface to shared types
  - [x] 2.2 Add `ConceptRelationship` interface
  - [x] 2.3 Add `ConceptCategory` enum matching departments
  - [x] 2.4 Add `RelationshipType` enum

- [x] **Task 3: Seed data structure** (AC: 1,4)
  - [x] 3.1 Create `apps/api/prisma/seed-data/concepts/` folder
  - [x] 3.2 Create category JSON files (finance.json, marketing.json, etc.)
  - [x] 3.3 Define 10 seed concepts per category (60 total for MVP)
  - [x] 3.4 Include relationship definitions in seed data

- [x] **Task 4: Concept seeding service** (AC: 1,3,4)
  - [x] 4.1 Create `apps/api/src/app/knowledge/` module
  - [x] 4.2 Create `ConceptSeedService` for loading seed data
  - [x] 4.3 Implement idempotent seeding (skip existing concepts)
  - [x] 4.4 Implement bidirectional relationship creation
  - [x] 4.5 Add version tracking for seed data

- [x] **Task 5: Concept query service** (AC: 2,3)
  - [x] 5.1 Create `ConceptService` with CRUD operations
  - [x] 5.2 Implement `findByCategory(category)` method
  - [x] 5.3 Implement `findRelated(conceptId)` method
  - [ ] 5.4 Add caching for frequently accessed concepts (deferred - not required for MVP)

- [x] **Task 6: API endpoints** (AC: 2)
  - [x] 6.1 Create `GET /api/v1/knowledge/concepts` with category filter
  - [x] 6.2 Create `GET /api/v1/knowledge/concepts/:id` for single concept
  - [x] 6.3 Create `GET /api/v1/knowledge/concepts/:id/related` for relationships
  - [x] 6.4 Add pagination for concept listing

- [x] **Task 7: Qdrant integration (stub)** (AC: 1)
  - [x] 7.1 Create `EmbeddingService` interface (implementation deferred)
  - [x] 7.2 Add embeddingId field to Concept model
  - [x] 7.3 Document Qdrant setup requirements for future

- [x] **Task 8: Seed command** (AC: 1,4)
  - [x] 8.1 Add `seed:concepts` script to package.json
  - [x] 8.2 Integrate with standalone CLI command
  - [x] 8.3 Add dry-run mode for testing

- [x] **Task 9: Backend tests** (AC: 1,2,3,4)
  - [x] 9.1 `concept-seed.service.spec.ts` - seeding tests
  - [x] 9.2 `concept.service.spec.ts` - query tests
  - [x] 9.3 Test: Bidirectional relationships created correctly
  - [x] 9.4 Test: Category filtering works
  - [x] 9.5 Test: Idempotent seeding (no duplicates)

- [x] **Task 10: Build verification** (AC: all)
  - [x] 10.1 `nx build api` passes
  - [x] 10.2 `nx test api` passes (606 tests passing)
  - [x] 10.3 Seed command runs successfully
  - [x] 10.4 Update story file with completion notes

## Dev Notes

### Critical Warnings from Previous Stories

> **DO NOT create duplicate types** - Import ALL shared types from `@mentor-ai/shared/types`. [Source: 2-2, 2-3, 2-4, 2-5 code reviews]

> **Use ConfigService for env vars** - NEVER use `process.env` directly. [Source: project-context.md]

> **Add JSDoc to public service methods** - All public methods need @param, @returns, @throws. [Source: 2-2 code review]

> **Use structured logging** - Use objects not string interpolation. [Source: project-context.md]

> **ID Prefixes MANDATORY** - Concept: `cpt_`, use `createId('cpt')` pattern. [Source: project-context.md]

> **API versioning** - Use `/api/v1/` prefix for all endpoints. [Source: 2-4 code review]

### Previous Story Intelligence (from 2.5)

**What Already Exists:**
- Platform DB with Tenant, User, LlmProviderConfig models
- Prisma schema at `apps/api/prisma/schema.prisma`
- Shared types at `shared/types/src/lib/types.ts`
- ID generation with prefixes pattern established

**Learnings from Previous Implementation:**
- Prisma JSON fields require `Prisma.JsonNull` for null values
- Always export new types from shared/types index.ts
- Test mock methods must match actual service method names

### Architecture Compliance

**From architecture.md:**
- Concept prefix: `cpt_` for all concept entity IDs
- Platform DB stores shared concepts (read-only for tenants)
- Qdrant for vector storage with BGE-M3 embeddings (1536 dimensions)
- Knowledge module location: `apps/api/src/app/knowledge/`

**From UX Specification:**
- 6 categories matching departments: Finance, Marketing, Technology, Operations, Legal, Creative
- Concepts linked via `[[concept]]` notation in responses
- Graph visualization (deferred to Story 3.4)

### Technical Implementation Details

**Prisma Schema:**
```prisma
// Relationship type for concept connections
enum RelationshipType {
  PREREQUISITE  // Must understand this first
  RELATED       // Related topic
  ADVANCED      // Deeper dive on topic
}

// Business concept entity (Platform DB - shared across tenants)
model Concept {
  id                  String   @id @map("id") // Must have cpt_ prefix
  name                String   @unique
  slug                String   @unique // URL-friendly version
  category            String   // Finance, Marketing, Technology, Operations, Legal, Creative
  definition          String   @db.Text // 2-3 sentences
  extendedDescription String?  @db.Text
  departmentTags      String[] @map("department_tags")
  embeddingId         String?  @map("embedding_id") // Qdrant vector ID
  version             Int      @default(1)
  createdAt           DateTime @default(now()) @map("created_at")
  updatedAt           DateTime @updatedAt @map("updated_at")

  // Relationships where this concept is the source
  relatedTo   ConceptRelationship[] @relation("SourceConcept")
  // Relationships where this concept is the target
  relatedFrom ConceptRelationship[] @relation("TargetConcept")

  @@index([category])
  @@index([slug])
  @@map("concepts")
}

// Bidirectional relationship between concepts
model ConceptRelationship {
  id               String           @id @default(cuid())
  sourceConceptId  String           @map("source_concept_id")
  targetConceptId  String           @map("target_concept_id")
  relationshipType RelationshipType @map("relationship_type")
  createdAt        DateTime         @default(now()) @map("created_at")

  sourceConcept Concept @relation("SourceConcept", fields: [sourceConceptId], references: [id], onDelete: Cascade)
  targetConcept Concept @relation("TargetConcept", fields: [targetConceptId], references: [id], onDelete: Cascade)

  @@unique([sourceConceptId, targetConceptId])
  @@index([sourceConceptId])
  @@index([targetConceptId])
  @@map("concept_relationships")
}
```

**Shared Types:**
```typescript
export enum ConceptCategory {
  FINANCE = 'Finance',
  MARKETING = 'Marketing',
  TECHNOLOGY = 'Technology',
  OPERATIONS = 'Operations',
  LEGAL = 'Legal',
  CREATIVE = 'Creative',
}

export enum RelationshipType {
  PREREQUISITE = 'PREREQUISITE',
  RELATED = 'RELATED',
  ADVANCED = 'ADVANCED',
}

export interface Concept {
  id: string;                    // cpt_ prefix
  name: string;
  slug: string;
  category: ConceptCategory;
  definition: string;
  extendedDescription?: string;
  departmentTags: string[];
  embeddingId?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ConceptRelationship {
  id: string;
  sourceConceptId: string;
  targetConceptId: string;
  relationshipType: RelationshipType;
}

export interface ConceptWithRelations extends Concept {
  relatedConcepts: Array<{
    concept: Concept;
    relationshipType: RelationshipType;
  }>;
}
```

**Seed Data Format (JSON):**
```json
{
  "concepts": [
    {
      "name": "Value-Based Pricing",
      "slug": "value-based-pricing",
      "category": "Finance",
      "definition": "A pricing strategy that sets prices based on customer perceived value rather than production costs or competitor pricing.",
      "extendedDescription": "Value-based pricing focuses on understanding what customers are willing to pay based on the benefits they receive...",
      "departmentTags": ["Finance", "Marketing"],
      "relatedConcepts": [
        { "slug": "price-elasticity", "type": "RELATED" },
        { "slug": "cost-plus-pricing", "type": "RELATED" },
        { "slug": "market-segmentation", "type": "PREREQUISITE" }
      ]
    }
  ]
}
```

### File Structure

```
apps/api/
├── prisma/
│   ├── schema.prisma (updated)
│   └── seed-data/
│       └── concepts/
│           ├── finance.json
│           ├── marketing.json
│           ├── technology.json
│           ├── operations.json
│           ├── legal.json
│           └── creative.json
└── src/app/
    └── knowledge/
        ├── knowledge.module.ts
        ├── knowledge.controller.ts
        ├── services/
        │   ├── concept.service.ts
        │   ├── concept.service.spec.ts
        │   ├── concept-seed.service.ts
        │   └── concept-seed.service.spec.ts
        └── dto/
            └── concept.dto.ts
```

### API Endpoints

**GET /api/v1/knowledge/concepts**
```typescript
// Query params: ?category=Finance&page=1&limit=20
{
  "data": [
    {
      "id": "cpt_abc123",
      "name": "Value-Based Pricing",
      "slug": "value-based-pricing",
      "category": "Finance",
      "definition": "A pricing strategy that sets prices..."
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 100
  }
}
```

**GET /api/v1/knowledge/concepts/:id**
```typescript
{
  "data": {
    "id": "cpt_abc123",
    "name": "Value-Based Pricing",
    "slug": "value-based-pricing",
    "category": "Finance",
    "definition": "A pricing strategy...",
    "extendedDescription": "Value-based pricing focuses on...",
    "departmentTags": ["Finance", "Marketing"],
    "relatedConcepts": [
      {
        "concept": { "id": "cpt_def456", "name": "Price Elasticity", "slug": "price-elasticity" },
        "relationshipType": "RELATED"
      }
    ]
  }
}
```

### Testing Standards

**Backend (Jest) - 80% coverage target:**

| Test File | Coverage Target |
|-----------|-----------------|
| concept.service.spec.ts | 80% |
| concept-seed.service.spec.ts | 80% |

**Key Test Scenarios:**
- Concepts created with correct cpt_ prefix
- Category filtering returns correct subset
- Bidirectional relationships created for each link
- Idempotent seeding doesn't create duplicates
- Related concepts query returns both directions
- Slug uniqueness enforced

### Seed Concept Examples (10 per category = 60 total for MVP)

**Finance:**
1. Value-Based Pricing, 2. Cost-Plus Pricing, 3. Price Elasticity, 4. Break-Even Analysis, 5. Cash Flow Management, 6. Profit Margins, 7. ROI Calculation, 8. Budget Forecasting, 9. Financial Modeling, 10. Capital Allocation

**Marketing:**
1. Market Segmentation, 2. Customer Personas, 3. Brand Positioning, 4. Content Strategy, 5. Lead Generation, 6. Conversion Optimization, 7. Customer Journey, 8. Marketing Attribution, 9. Brand Equity, 10. Competitive Analysis

**Technology:**
1. Technical Debt, 2. API Design, 3. Scalability Patterns, 4. DevOps Practices, 5. Cloud Architecture, 6. Data Modeling, 7. Security Best Practices, 8. Performance Optimization, 9. Microservices, 10. CI/CD Pipelines

**Operations:**
1. Process Optimization, 2. Supply Chain Management, 3. Quality Control, 4. Inventory Management, 5. Lean Methodology, 6. Six Sigma, 7. Capacity Planning, 8. Vendor Management, 9. Risk Management, 10. Business Continuity

**Legal:**
1. Contract Essentials, 2. Intellectual Property, 3. Compliance Frameworks, 4. Data Privacy (GDPR), 5. Employment Law Basics, 6. Liability Protection, 7. Terms of Service, 8. NDA Fundamentals, 9. Regulatory Requirements, 10. Due Diligence

**Creative:**
1. Design Thinking, 2. Brand Identity, 3. Visual Hierarchy, 4. User Experience Design, 5. Creative Brief, 6. Typography Fundamentals, 7. Color Theory, 8. Layout Principles, 9. Storytelling, 10. Creative Direction

### Dependencies

**No blocking dependencies** - This is a foundational story for Epic 3.

**Enables:**
- Story 2-6 (Business Concept Citations)
- Story 3-2 (Concept Browse and Search Interface)
- Story 3-3 (Concept Detail Pages)
- Story 3-4 (Knowledge Graph Visualization)

### References

- [Source: _bmad-output/planning-artifacts/epics.md#Story-3.1]
- [Source: _bmad-output/planning-artifacts/architecture.md#Knowledge-Base]
- [Source: _bmad-output/planning-artifacts/project-context.md]

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5

### Debug Log References

- Initial build errors: Wrong import path for PrismaModule (used `../prisma/prisma.module` instead of `@mentor-ai/shared/tenant-context`)
- Fixed by using `PlatformPrismaService` from shared tenant-context library for platform-level concept data
- Response types: Removed `success` property from controller responses to match shared type definitions

### Completion Notes List

1. **Prisma Schema**: Added `Concept` and `ConceptRelationship` models to Platform DB with proper cpt_ prefix, bidirectional relationships, and all required fields including embeddingId stub for future Qdrant integration.

2. **Shared Types**: Added comprehensive type definitions including `ConceptCategory`, `RelationshipType` enums, `Concept`, `ConceptRelationship`, `ConceptWithRelations`, `ConceptSummary`, `ConceptSeedData` interfaces, and API response types.

3. **Seed Data**: Created 60 business concepts across 6 categories (10 each) in JSON files under `apps/api/prisma/seed-data/concepts/`. Each concept includes definition, extended description, department tags, and relationship links.

4. **Knowledge Module**: Created complete NestJS module with:
   - `ConceptSeedService`: Idempotent seeding with two-pass approach (concepts first, then relationships)
   - `ConceptService`: Query service with pagination, category filtering, slug lookup, and bidirectional relationship retrieval
   - `KnowledgeController`: RESTful API endpoints at `/api/v1/knowledge/`

5. **Embedding Service Stub**: Created `IEmbeddingService` interface with placeholder implementation for future Qdrant vector search integration.

6. **Seed Command**: Added `seed:concepts` CLI script with `--dry-run` and `--clear` options at `apps/api/prisma/seed-concepts.ts`.

7. **Tests**: 37 new tests added covering:
   - ConceptService: findAll, findById, findBySlug, findRelated, getCategories, getCount
   - ConceptSeedService: seedAllConcepts (normal, dry-run, idempotent), clearAllConcepts
   - KnowledgeController: all endpoints

8. **Build Verification**:
   - `nx build api` passes
   - `nx test api` passes with 606 total tests
   - Knowledge module integrated into AppModule

### File List

**New Files Created:**
- `mentor-ai/apps/api/src/app/knowledge/knowledge.module.ts`
- `mentor-ai/apps/api/src/app/knowledge/knowledge.controller.ts`
- `mentor-ai/apps/api/src/app/knowledge/knowledge.controller.spec.ts`
- `mentor-ai/apps/api/src/app/knowledge/services/concept.service.ts`
- `mentor-ai/apps/api/src/app/knowledge/services/concept.service.spec.ts`
- `mentor-ai/apps/api/src/app/knowledge/services/concept-seed.service.ts`
- `mentor-ai/apps/api/src/app/knowledge/services/concept-seed.service.spec.ts`
- `mentor-ai/apps/api/src/app/knowledge/services/embedding.service.ts`
- `mentor-ai/apps/api/prisma/seed-concepts.ts`
- `mentor-ai/apps/api/prisma/seed-data/concepts/finance.json`
- `mentor-ai/apps/api/prisma/seed-data/concepts/marketing.json`
- `mentor-ai/apps/api/prisma/seed-data/concepts/technology.json`
- `mentor-ai/apps/api/prisma/seed-data/concepts/operations.json`
- `mentor-ai/apps/api/prisma/seed-data/concepts/legal.json`
- `mentor-ai/apps/api/prisma/seed-data/concepts/creative.json`

**Modified Files:**
- `mentor-ai/apps/api/prisma/schema.prisma` (added Concept, ConceptRelationship models, RelationshipType enum)
- `mentor-ai/shared/types/src/lib/types.ts` (added concept-related types)
- `mentor-ai/apps/api/src/app/app.module.ts` (added KnowledgeModule import)
