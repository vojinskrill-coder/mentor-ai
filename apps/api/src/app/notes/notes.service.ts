import { Injectable, Logger, NotFoundException } from '@nestjs/common';
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
    private readonly aiGateway: AiGatewayService,
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
  async getLatestNoteBySource(
    userId: string,
    tenantId: string,
    source: NoteSource
  ) {
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
  async getByConcept(
    conceptId: string,
    userId: string,
    tenantId: string
  ): Promise<NoteItem[]> {
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
    tenantId: string,
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
   * Updates the status of a note/task.
   */
  async updateStatus(
    noteId: string,
    status: NoteStatus,
    tenantId: string
  ): Promise<NoteItem> {
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
  async submitReport(
    noteId: string,
    report: string,
    tenantId: string
  ): Promise<NoteItem> {
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
   * AI-scores a user's completion report.
   */
  async scoreReport(
    noteId: string,
    userId: string,
    tenantId: string
  ): Promise<NoteItem> {
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
      (chunk) => { fullResponse += chunk; }
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
