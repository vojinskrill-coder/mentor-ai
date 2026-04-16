# Story 2.3a: Onboarding Note Save

Status: done

## Story

As a **new user completing the onboarding quick win**,
I want my generated AI output to be saved as a note,
So that I can access my first AI-generated content later.

## Context

This story addresses a critical gap identified in Story 2.3 code review: AC3 requires saving the generated output as a note, but the Note model did not exist. This story adds minimal Note functionality to complete AC3.

## Acceptance Criteria

1. **AC1: Note Model**
   - **Given** a user completes the onboarding quick win
   - **When** they save their output
   - **Then** a Note record is created in the database
   - **And** the note is associated with the user and tenant

2. **AC2: Note Service Integration**
   - **Given** the onboarding completion endpoint is called
   - **When** the request includes generated output
   - **Then** a note is created via NoteService
   - **And** the noteId is returned in the response

3. **AC3: Note Model Fields**
   - **Given** a Note is created
   - **Then** it contains: id (note_ prefix), title, content, userId, tenantId, source, createdAt, updatedAt

## Tasks / Subtasks

- [x] **Task 1: Add Note model to Prisma schema**
  - [x] 1.1 Add Note model with note_ prefix ID
  - [x] 1.2 Add NoteSource enum (ONBOARDING, CONVERSATION, MANUAL)
  - [x] 1.3 Run prisma generate

- [x] **Task 2: Create NoteService**
  - [x] 2.1 Create `apps/api/src/app/notes/notes.module.ts`
  - [x] 2.2 Create `apps/api/src/app/notes/notes.service.ts`
  - [x] 2.3 Implement `createNote()` method
  - [x] 2.4 Create `notes.service.spec.ts`

- [x] **Task 3: Update OnboardingService**
  - [x] 3.1 Inject NoteService into OnboardingService
  - [x] 3.2 Create note in `completeOnboarding()` method
  - [x] 3.3 Return noteId in response

- [x] **Task 4: Tests and Verification**
  - [x] 4.1 Update onboarding.service.spec.ts with note mocks
  - [x] 4.2 Verify all tests pass
  - [x] 4.3 Run build verification

## Dev Notes

### Note Model Schema
```prisma
enum NoteSource {
  ONBOARDING
  CONVERSATION
  MANUAL
}

model Note {
  id        String     @id @map("id") // Must have note_ prefix
  title     String
  content   String     @db.Text
  source    NoteSource @default(MANUAL)
  userId    String     @map("user_id")
  tenantId  String     @map("tenant_id")
  createdAt DateTime   @default(now()) @map("created_at")
  updatedAt DateTime   @updatedAt @map("updated_at")

  @@index([userId])
  @@index([tenantId])
  @@map("notes")
}
```

### References

- Parent story: Story 2.3 Sub-5-Minute First Value Quick Win
- Future expansion: Story 4-4 save-task-outputs-as-structured-notes

## Dev Agent Record

### Agent Model Used

Claude Opus 4.5

### Completion Notes List

1. **Note Model Added** - Created Note model in Prisma schema with `note_` prefix ID pattern, NoteSource enum (ONBOARDING, CONVERSATION, MANUAL), and proper indexes
2. **NoteService Created** - Implemented NotesService with createNote(), getNoteById(), and getNotesByUser() methods following existing service patterns
3. **OnboardingService Updated** - Integrated NotesService into OnboardingService to save generated output as a note during completeOnboarding()
4. **Response Updated** - OnboardingCompleteResponse now includes noteId field with the created note's ID
5. **shared/prisma Updated** - Exported NoteSource enum and Note type from shared/prisma package
6. **Tests Updated** - Added NotesService mock to onboarding.service.spec.ts and verified note creation in completeOnboarding tests
7. **All Tests Pass** - 30 API tests passing (6 notes + 24 onboarding)
8. **Build Verified** - nx build api completes successfully

### File List

**New Files:**
- `apps/api/src/app/notes/notes.module.ts`
- `apps/api/src/app/notes/notes.service.ts`
- `apps/api/src/app/notes/notes.service.spec.ts`

**Modified Files:**
- `apps/api/prisma/schema.prisma` - Added NoteSource enum and Note model
- `shared/prisma/src/lib/prisma.ts` - Exported NoteSource and Note
- `apps/api/src/app/onboarding/onboarding.module.ts` - Imported NotesModule
- `apps/api/src/app/onboarding/onboarding.service.ts` - Integrated NotesService, removed TODO
- `apps/api/src/app/onboarding/onboarding.service.spec.ts` - Added NotesService mock and tests
