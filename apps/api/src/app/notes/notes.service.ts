import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { createId } from '@paralleldrive/cuid2';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { NoteSource, NoteType, NoteStatus } from '@mentor-ai/shared/prisma';
import type { NoteItem } from '@mentor-ai/shared/types';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';

/**
 * DTO for creating a new note.
 */
export interface CreateNoteDto {
  /** Title of the note */
  title: string;
  /** Content of the note */
  content: string;
  /** Source of the note creation */
  source: NoteSource;
  /** User ID who owns the note */
  userId: string;
  /** Tenant ID the note belongs to */
  tenantId: string;
  /** Note type (TASK, NOTE, SUMMARY) */
  noteType?: NoteType;
  /** Status for TASK type */
  status?: NoteStatus;
  /** Link to a conversation */
  conversationId?: string;
  /** Link to a concept */
  conceptId?: string;
  /** Link to a specific AI message */
  messageId?: string;
  /** Parent note for sub-task hierarchy */
  parentNoteId?: string;
  /** Expected outcome description */
  expectedOutcome?: string;
  /** Workflow step number */
  workflowStepNumber?: number;
}

/**
 * Service for managing user notes.
 * Provides CRUD operations for notes created from AI outputs and manual entry.
 */
@Injectable()
export class NotesService {
  private readonly logger = new Logger(NotesService.name);

  constructor(
    private readonly prisma: PlatformPrismaService,
    private readonly aiGateway: AiGatewayService
  ) {}

  /**
   * Creates a new note.
   *
   * @param dto - Note creation data
   * @returns The created note with its ID
   */
  async createNote(dto: CreateNoteDto): Promise<{ id: string }> {
    const id = `note_${createId()}`;

    this.logger.log({
      message: 'Creating note',
      noteId: id,
      userId: dto.userId,
      tenantId: dto.tenantId,
      source: dto.source,
      titleLength: dto.title.length,
      contentLength: dto.content.length,
    });

    await this.prisma.note.create({
      data: {
        id,
        title: dto.title,
        content: dto.content,
        source: dto.source,
        noteType: dto.noteType ?? NoteType.NOTE,
        status: dto.noteType === NoteType.TASK ? (dto.status ?? NoteStatus.PENDING) : null,
        conversationId: dto.conversationId ?? null,
        conceptId: dto.conceptId ?? null,
        messageId: dto.messageId ?? null,
        userId: dto.userId,
        tenantId: dto.tenantId,
        parentNoteId: dto.parentNoteId ?? null,
        expectedOutcome: dto.expectedOutcome ?? null,
        workflowStepNumber: dto.workflowStepNumber ?? null,
      },
    });

    this.logger.log({
      message: 'Note created successfully',
      noteId: id,
      userId: dto.userId,
      tenantId: dto.tenantId,
    });

    return { id };
  }

  /**
   * Gets a note by ID.
   *
   * @param noteId - The note ID to retrieve
   * @param tenantId - The tenant ID for authorization
   * @returns The note or null if not found
   */
  async getNoteById(noteId: string, tenantId: string) {
    return this.prisma.note.findFirst({
      where: {
        id: noteId,
        tenantId,
      },
    });
  }

  /**
   * Gets all notes for a user.
   *
   * @param userId - The user ID
   * @param tenantId - The tenant ID
   * @returns Array of notes for the user
   */
  async getNotesByUser(userId: string, tenantId: string) {
    return this.prisma.note.findMany({
      where: {
        userId,
        tenantId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Gets the most recent note for a user filtered by source.
   */
  async getLatestNoteBySource(userId: string, tenantId: string, source: NoteSource) {
    return this.prisma.note.findFirst({
      where: { userId, tenantId, source },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Gets top-level notes for a conversation, with children included.
   */
  async getByConversation(
    conversationId: string,
    userId: string,
    tenantId: string
  ): Promise<NoteItem[]> {
    const notes = await this.prisma.note.findMany({
      where: { conversationId, userId, tenantId, parentNoteId: null },
      include: {
        children: { orderBy: { workflowStepNumber: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return notes.map((n) => this.mapToNoteItemWithChildren(n));
  }

  /**
   * Gets notes for a specific concept.
   */
  async getByConcept(conceptId: string, userId: string, tenantId: string): Promise<NoteItem[]> {
    const notes = await this.prisma.note.findMany({
      where: { conceptId, userId, tenantId, parentNoteId: null },
      include: {
        children: { orderBy: { workflowStepNumber: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return notes.map((n) => this.mapToNoteItemWithChildren(n));
  }

  /**
   * Gets distinct concept IDs from notes for a user/tenant.
   * Used for concept tree growth — shows concepts discovered via tasks.
   */
  async getDiscoveredConceptIds(userId: string, tenantId: string): Promise<string[]> {
    const notes = await this.prisma.note.findMany({
      where: { userId, tenantId, conceptId: { not: null } },
      select: { conceptId: true },
      distinct: ['conceptId'],
    });
    return notes.map((n) => n.conceptId).filter(Boolean) as string[];
  }

  /**
   * Links orphan notes (no conversationId) for given concepts to a conversation.
   * Used after onboarding creates tasks per-concept, then creates the welcome conversation.
   */
  async linkNotesToConversation(
    conceptIds: string[],
    conversationId: string,
    userId: string,
    tenantId: string
  ): Promise<number> {
    if (conceptIds.length === 0) return 0;
    const result = await this.prisma.note.updateMany({
      where: {
        conceptId: { in: conceptIds },
        conversationId: null,
        userId,
        tenantId,
      },
      data: { conversationId },
    });
    return result.count;
  }

  /**
   * Updates conceptId for all notes of a conversation that have no concept set.
   * Used when a conversation is auto-classified to retroactively link its tasks.
   */
  async updateConceptIdForConversation(
    conversationId: string,
    conceptId: string,
    tenantId: string
  ): Promise<void> {
    await this.prisma.note.updateMany({
      where: {
        conversationId,
        tenantId,
        conceptId: null,
      },
      data: { conceptId },
    });
  }

  /**
   * Checks if a task already exists tenant-wide by title (Story 3.4 AC3).
   * Multiple tasks per concept are allowed — dedup is by title match only.
   * When both conceptId and title are provided, requires BOTH to match for strongest dedup.
   *
   * @returns The existing task ID if found, null otherwise
   */
  async findExistingTask(
    tenantId: string,
    options: { conceptId?: string; title?: string }
  ): Promise<string | null> {
    const { conceptId, title } = options;

    // Must provide at least one search criterion
    if (!conceptId && !title) return null;

    // Load all existing tasks once for both checks (efficient single query)
    const candidates = await this.prisma.note.findMany({
      where: {
        tenantId,
        noteType: NoteType.TASK,
        status: { in: [NoteStatus.PENDING, NoteStatus.COMPLETED, NoteStatus.READY_FOR_REVIEW] },
        parentNoteId: null, // Only top-level tasks, not workflow step children
      },
      select: { id: true, title: true, conceptId: true },
      take: 500,
    });

    // Check 1: exact conceptId + title match (same concept AND same title = true duplicate)
    if (conceptId && title) {
      const normalizedTitle = title.toLowerCase().trim();
      const byBoth = candidates.find(
        (c) => c.conceptId === conceptId && c.title.toLowerCase().trim() === normalizedTitle
      );
      if (byBoth) return byBoth.id;
    }

    // Check 2: title-only match (catches duplicates across conversations with different/null conceptIds)
    if (title) {
      const normalizedTitle = title.toLowerCase().trim();
      const byTitle = candidates.find((c) => c.title.toLowerCase().trim() === normalizedTitle);
      if (byTitle) return byTitle.id;
    }

    return null;
  }

  /**
   * Checks if a sub-task already exists for a specific workflow step (Story 3.4 AC3).
   *
   * @returns The existing sub-task ID if found, null otherwise
   */
  async findExistingSubTask(
    tenantId: string,
    parentNoteId: string,
    workflowStepNumber: number
  ): Promise<string | null> {
    const existing = await this.prisma.note.findFirst({
      where: {
        tenantId,
        parentNoteId,
        workflowStepNumber,
        noteType: NoteType.TASK,
      },
      select: { id: true },
    });
    return existing?.id ?? null;
  }

  /**
   * Gets all pending tasks for a user/tenant.
   * Used for auto-triggering workflow execution from chat.
   */
  async getPendingTasksByUser(userId: string, tenantId: string) {
    return this.prisma.note.findMany({
      where: { userId, tenantId, noteType: 'TASK', status: 'PENDING' },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Gets pending task concept IDs for the brain tree (Story 3.2).
   * If userId is provided, returns only that user's pending tasks.
   * If omitted, returns all pending tasks for the tenant (PLATFORM_OWNER view).
   */
  async getPendingTaskConceptIds(
    tenantId: string,
    userId?: string
  ): Promise<Array<{ conceptId: string; userId: string; noteId: string }>> {
    const where: Record<string, unknown> = {
      tenantId,
      noteType: NoteType.TASK,
      status: NoteStatus.PENDING,
      conceptId: { not: null },
    };
    if (userId) where.userId = userId;

    const notes = await this.prisma.note.findMany({
      where,
      select: { conceptId: true, userId: true, id: true },
    });
    return notes
      .filter((n): n is typeof n & { conceptId: string } => n.conceptId !== null)
      .map((n) => ({ conceptId: n.conceptId, userId: n.userId, noteId: n.id }));
  }

  /**
   * Gets completed task concept IDs for the brain tree.
   * A concept is "completed" when its TASK note has status COMPLETED.
   */
  async getCompletedTaskConceptIds(
    tenantId: string,
    userId?: string
  ): Promise<Array<{ conceptId: string; userId: string; noteId: string }>> {
    const where: Record<string, unknown> = {
      tenantId,
      noteType: NoteType.TASK,
      status: NoteStatus.COMPLETED,
      conceptId: { not: null },
    };
    if (userId) where.userId = userId;

    const notes = await this.prisma.note.findMany({
      where,
      select: { conceptId: true, userId: true, id: true },
    });
    return notes
      .filter((n): n is typeof n & { conceptId: string } => n.conceptId !== null)
      .map((n) => ({ conceptId: n.conceptId, userId: n.userId, noteId: n.id }));
  }

  /**
   * Updates the status of a note/task.
   */
  async updateStatus(noteId: string, status: NoteStatus, tenantId: string): Promise<NoteItem> {
    const note = await this.prisma.note.findFirst({
      where: { id: noteId, tenantId },
    });
    if (!note) {
      throw new NotFoundException(`Note ${noteId} not found`);
    }
    const updated = await this.prisma.note.update({
      where: { id: noteId },
      data: { status },
    });
    return this.mapToNoteItem(updated);
  }

  /**
   * Updates a note's title and content.
   */
  async updateNote(
    noteId: string,
    title: string | undefined,
    content: string | undefined,
    tenantId: string
  ): Promise<NoteItem> {
    const note = await this.prisma.note.findFirst({
      where: { id: noteId, tenantId },
    });
    if (!note) {
      throw new NotFoundException(`Note ${noteId} not found`);
    }
    const data: Record<string, unknown> = {};
    if (title !== undefined) data.title = title;
    if (content !== undefined) data.content = content;

    const updated = await this.prisma.note.update({
      where: { id: noteId },
      data,
    });
    return this.mapToNoteItem(updated);
  }

  /**
   * Deletes a note.
   */
  async deleteNote(noteId: string, tenantId: string): Promise<void> {
    const note = await this.prisma.note.findFirst({
      where: { id: noteId, tenantId },
    });
    if (!note) {
      throw new NotFoundException(`Note ${noteId} not found`);
    }
    await this.prisma.note.delete({ where: { id: noteId } });
  }

  /**
   * Submits a user completion report for a note/task.
   */
  async submitReport(noteId: string, report: string, tenantId: string): Promise<NoteItem> {
    const note = await this.prisma.note.findFirst({
      where: { id: noteId, tenantId },
    });
    if (!note) {
      throw new NotFoundException(`Note ${noteId} not found`);
    }
    const updated = await this.prisma.note.update({
      where: { id: noteId },
      data: { userReport: report },
    });
    return this.mapToNoteItem(updated);
  }

  /**
   * AI-generates a completion report for a task.
   * Returns the generated text for user review before submission.
   */
  async generateReport(noteId: string, userId: string, tenantId: string): Promise<string> {
    const note = await this.prisma.note.findFirst({
      where: { id: noteId, tenantId },
    });
    if (!note) {
      throw new NotFoundException(`Note ${noteId} not found`);
    }

    // Fetch child notes (workflow step outputs) — full content, no truncation
    const children = await this.prisma.note.findMany({
      where: { parentNoteId: noteId, tenantId },
      orderBy: { workflowStepNumber: 'asc' },
    });

    let prompt: string;

    if (children.length > 0) {
      // Workflow steps exist — synthesize into FINAL DELIVERABLE
      const workflowResults = children
        .map((child, i) => {
          const stepNum = child.workflowStepNumber ?? i + 1;
          return `--- KORAK ${stepNum}: ${child.title} ---\n${child.content}`;
        })
        .join('\n\n');

      prompt = `Ti si vrhunski poslovni stručnjak. Tvoj tim je završio detaljnu analizu i istraživanje kroz ${children.length} koraka workflow-a. Sintetiši SVE rezultate u FINALNI DOKUMENT koji vlasnik poslovanja može odmah da koristi.

ZADATAK: ${note.title}
${note.expectedOutcome ? `OČEKIVANI REZULTAT: ${note.expectedOutcome}` : ''}

REZULTATI ISTRAŽIVANJA I ANALIZE (ovo je tvoj ulazni materijal — koristi SVE podatke):
${workflowResults}

KRITIČNO — RAZLIKUJ DVA TIPA ZADATAKA:
A) DIGITALNI (sadržaj, planovi, analize, mejlovi, kampanje, budžeti, šabloni, procedure):
   → PROIZVEDI GOTOV REZULTAT. Ne daj instrukcije — NAPIŠI sam dokument/sadržaj/plan.
B) FIZIČKI (odlazak negde, naručivanje, pozivi, instalacija, sastanci):
   → NE simuliraj da si obavio fizičku radnju. Napiši KO treba ŠTA da uradi sa detaljima.
   → Označi sa "⚠ ZAHTEVA LJUDSKU AKCIJU:" ispred svakog fizičkog koraka.

INSTRUKCIJE:
1. Ovo NIJE izveštaj o tome šta je urađeno. Ovo je FINALNI DELIVERABLE — gotov dokument koji vlasnik koristi.
2. Ako su koraci proizveli analizu → sintetiši u GOTOV AKCIONI PLAN sa preporukama, rokovima, odgovornim osobama
3. Ako su koraci definisali strategiju → napravi KOMPLETNU STRATEGIJU sa koracima implementacije i metrikama
4. Ako su koraci istražili vrednost → definiši KONKRETNE OBLIKE VREDNOSTI sa cenovnom strategijom
5. Ako su koraci kreirali sadržaj → napravi GOTOV SADRŽAJ spreman za objavljivanje
6. NIKADA ne piši "trebalo bi da..." za digitalne zadatke — NAPRAVI to sam
7. NIKADA ne izmišljaj podatke — ako nemaš konkretan podatak, naznači [POPUNITI: ...]
8. Koristi specifične podatke, brojke i nalaze iz koraka — nemoj generalizovati
9. Strukturiraj sa jasnim zaglavljima, tabelama, nabrajanjima
10. NIKADA ne piši "u prethodnim koracima smo..." — PRIKAŽI gotov rezultat
11. Dodaj "Sledeći koraci" SAMO za stavke koje zahtevaju LJUDSKU intervenciju

Odgovaraj ISKLJUČIVO na srpskom jeziku.`;
    } else {
      // No workflow steps — simple task, do the work directly
      prompt = `Ti si poslovni stručnjak. IZVRŠI sledeći zadatak u potpunosti.

ZADATAK: ${note.title}
${note.content ? `OPIS: ${note.content}` : ''}
${note.expectedOutcome ? `OČEKIVANI REZULTAT: ${note.expectedOutcome}` : ''}

KRITIČNO — RAZLIKUJ:
A) DIGITALNI ZADACI (sadržaj, planovi, analize, mejlovi, kampanje, budžeti, šabloni):
   → PROIZVEDI GOTOV REZULTAT. Ne piši instrukcije — NAPIŠI sam dokument.
B) FIZIČKI ZADACI (odlazak, naručivanje, pozivi, instalacija):
   → NE simuliraj fizičku radnju. Napiši ko treba šta da uradi sa detaljima.
   → Označi: "⚠ ZAHTEVA LJUDSKU AKCIJU:" ispred fizičkih koraka.

Proizvedi kompletan, profesionalan rezultat. NIKADA ne piši "trebalo bi da..." za digitalne zadatke. Ako nemaš podatak, naznači [POPUNITI: ...]. Odgovaraj na srpskom jeziku.`;
    }

    let fullResponse = '';
    await this.aiGateway.streamCompletionWithContext(
      [{ role: 'user', content: prompt }],
      { tenantId, userId },
      (chunk) => {
        fullResponse += chunk;
      }
    );

    const result = fullResponse.trim() || 'Generisanje nije uspelo. Pokušajte ponovo.';

    // Auto-save as userReport and mark as COMPLETED
    await this.prisma.note.update({
      where: { id: noteId },
      data: {
        userReport: result,
        status: 'COMPLETED',
      },
    });

    return result;
  }

  /**
   * AI-scores a user's completion report.
   */
  async scoreReport(noteId: string, userId: string, tenantId: string): Promise<NoteItem> {
    const note = await this.prisma.note.findFirst({
      where: { id: noteId, tenantId },
    });
    if (!note) {
      throw new NotFoundException(`Note ${noteId} not found`);
    }
    if (!note.userReport) {
      throw new NotFoundException(`Note ${noteId} has no report to score`);
    }

    const scoringPrompt = `Ti si AI mentor za poslovanje. Oceni izveštaj korisnika o završenom zadatku.

ZADATAK:
Naslov: ${note.title}
Opis: ${note.content}
${note.expectedOutcome ? `Očekivani ishod: ${note.expectedOutcome}` : ''}

IZVEŠTAJ KORISNIKA:
${note.userReport}

Oceni na skali 0-100 na osnovu:
- Kompletnost: Da li su svi aspekti zadatka pokriveni?
- Specifičnost: Da li su navedeni konkretni detalji umesto opštih fraza?
- Kvalitet analize: Da li je korisnik pokazao razumevanje?
- Primenljivost: Da li se rezultati mogu primeniti u praksi?

Odgovori ISKLJUČIVO u JSON formatu:
{"score": <broj 0-100>, "feedback": "<2-3 rečenice na srpskom sa konkretnim savetima za poboljšanje>"}`;

    let fullResponse = '';
    await this.aiGateway.streamCompletionWithContext(
      [{ role: 'user', content: scoringPrompt }],
      { tenantId, userId },
      (chunk) => {
        fullResponse += chunk;
      }
    );

    let score = 50;
    let feedback = 'Ocenjivanje nije uspelo. Pokušajte ponovo.';
    try {
      const jsonMatch = fullResponse.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        score = Math.max(0, Math.min(100, Number(parsed.score) || 50));
        feedback = parsed.feedback || feedback;
      }
    } catch {
      this.logger.warn({
        message: 'Failed to parse AI scoring response',
        noteId,
        response: fullResponse.substring(0, 200),
      });
    }

    const updated = await this.prisma.note.update({
      where: { id: noteId },
      data: { aiScore: score, aiFeedback: feedback },
    });
    return this.mapToNoteItem(updated);
  }

  // ─── Comment methods (Story 3.4 AC4) ─────────────────────

  /**
   * Creates a comment on a task or workflow step note.
   *
   * @param taskId - The parent note ID (task or workflow step)
   * @param content - Comment text
   * @param userId - The commenting user's ID
   * @param tenantId - Tenant for isolation
   * @returns Created comment with user info
   */
  async createComment(
    taskId: string,
    content: string,
    userId: string,
    tenantId: string
  ): Promise<{ id: string; content: string; userId: string; createdAt: string }> {
    // Verify parent task exists and is a TASK type
    const parent = await this.prisma.note.findFirst({
      where: { id: taskId, tenantId },
      select: { id: true, noteType: true },
    });
    if (!parent) {
      throw new NotFoundException(`Task ${taskId} not found`);
    }
    if (parent.noteType !== NoteType.TASK) {
      throw new BadRequestException('Comments can only be added to tasks or workflow steps');
    }

    const id = `note_${createId()}`;
    const comment = await this.prisma.note.create({
      data: {
        id,
        title: 'Comment',
        content,
        source: NoteSource.MANUAL,
        noteType: NoteType.COMMENT,
        parentNoteId: taskId,
        userId,
        tenantId,
      },
    });

    return {
      id: comment.id,
      content: comment.content,
      userId: comment.userId,
      createdAt: comment.createdAt.toISOString(),
    };
  }

  /**
   * Gets all comments for a task/workflow step, ordered oldest first.
   * Includes user info (name, role) from the User model.
   *
   * @param taskId - The parent note ID
   * @param tenantId - Tenant for isolation
   * @param page - Page number (1-based, default 1)
   * @param limit - Items per page (default 50)
   */
  async getCommentsByTask(
    taskId: string,
    tenantId: string,
    page = 1,
    limit = 50
  ): Promise<{
    comments: Array<{
      id: string;
      content: string;
      userId: string;
      userName: string;
      userRole: string;
      createdAt: string;
      updatedAt: string;
    }>;
    total: number;
    page: number;
    limit: number;
  }> {
    // Enforce pagination bounds
    page = Math.max(1, page || 1);
    limit = Math.min(100, Math.max(1, limit || 50));
    const skip = (page - 1) * limit;

    const [comments, total] = await Promise.all([
      this.prisma.note.findMany({
        where: {
          parentNoteId: taskId,
          tenantId,
          noteType: NoteType.COMMENT,
        },
        orderBy: { createdAt: 'asc' },
        skip,
        take: limit,
      }),
      this.prisma.note.count({
        where: {
          parentNoteId: taskId,
          tenantId,
          noteType: NoteType.COMMENT,
        },
      }),
    ]);

    // Resolve user info
    const userIds = [...new Set(comments.map((c) => c.userId))];
    const users =
      userIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, name: true, role: true },
          })
        : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    return {
      comments: comments.map((c) => {
        const user = userMap.get(c.userId);
        return {
          id: c.id,
          content: c.content,
          userId: c.userId,
          userName: user?.name ?? c.userId,
          userRole: user?.role ?? 'MEMBER',
          createdAt: c.createdAt.toISOString(),
          updatedAt: c.updatedAt.toISOString(),
        };
      }),
      total,
      page,
      limit,
    };
  }

  /**
   * Updates a comment's content. Only the comment author can edit.
   *
   * @param commentId - The comment note ID
   * @param content - New comment content
   * @param userId - The requesting user (must be author)
   * @param tenantId - Tenant for isolation
   */
  async updateComment(
    commentId: string,
    content: string,
    userId: string,
    tenantId: string
  ): Promise<{ id: string; content: string; updatedAt: string }> {
    const comment = await this.prisma.note.findFirst({
      where: { id: commentId, tenantId, noteType: NoteType.COMMENT },
    });
    if (!comment) {
      throw new NotFoundException(`Comment ${commentId} not found`);
    }
    if (comment.userId !== userId) {
      throw new ForbiddenException('Only the comment author can edit');
    }

    const updated = await this.prisma.note.update({
      where: { id: commentId },
      data: { content },
    });

    return {
      id: updated.id,
      content: updated.content,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  /**
   * Deletes a comment. Only the author or TENANT_OWNER/PLATFORM_OWNER can delete.
   *
   * @param commentId - The comment note ID
   * @param userId - The requesting user
   * @param role - The requesting user's role
   * @param tenantId - Tenant for isolation
   */
  async deleteComment(
    commentId: string,
    userId: string,
    role: string,
    tenantId: string
  ): Promise<void> {
    const comment = await this.prisma.note.findFirst({
      where: { id: commentId, tenantId, noteType: NoteType.COMMENT },
    });
    if (!comment) {
      throw new NotFoundException(`Comment ${commentId} not found`);
    }

    const isOwner = role === 'PLATFORM_OWNER' || role === 'TENANT_OWNER';
    if (comment.userId !== userId && !isOwner) {
      throw new ForbiddenException('Only the comment author or an owner can delete');
    }

    await this.prisma.note.delete({ where: { id: commentId } });
  }

  private mapToNoteItem(note: {
    id: string;
    title: string;
    content: string;
    source: NoteSource;
    noteType: NoteType;
    status: NoteStatus | null;
    conversationId: string | null;
    conceptId: string | null;
    messageId: string | null;
    parentNoteId?: string | null;
    userReport?: string | null;
    aiScore?: number | null;
    aiFeedback?: string | null;
    expectedOutcome?: string | null;
    workflowStepNumber?: number | null;
    createdAt: Date;
    updatedAt: Date;
  }): NoteItem {
    return {
      id: note.id,
      title: note.title,
      content: note.content,
      source: note.source as NoteItem['source'],
      noteType: note.noteType as NoteItem['noteType'],
      status: note.status as NoteItem['status'],
      conversationId: note.conversationId,
      conceptId: note.conceptId,
      messageId: note.messageId,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
      parentNoteId: note.parentNoteId ?? null,
      userReport: note.userReport ?? null,
      aiScore: note.aiScore ?? null,
      aiFeedback: note.aiFeedback ?? null,
      expectedOutcome: note.expectedOutcome ?? null,
      workflowStepNumber: note.workflowStepNumber ?? null,
    };
  }

  private mapToNoteItemWithChildren(
    note: Parameters<NotesService['mapToNoteItem']>[0] & {
      children?: Array<Parameters<NotesService['mapToNoteItem']>[0]>;
    }
  ): NoteItem {
    const mapped = this.mapToNoteItem(note);
    if (note.children && note.children.length > 0) {
      mapped.children = note.children.map((c) => this.mapToNoteItem(c));
    }
    return mapped;
  }
}
