import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { NotesService, CreateNoteDto } from './notes.service';
import { NoteSource, NoteType, NoteStatus } from '@mentor-ai/shared/prisma';

// ─── Helper: build a mock DB note record ───────────────────────────────────────
function makeDbNote(overrides: Partial<Record<string, unknown>> = {}) {
  const now = new Date('2026-02-01T12:00:00Z');
  return {
    id: 'note_abc123',
    title: 'Test Task',
    content: 'Task content',
    source: NoteSource.CONVERSATION,
    noteType: NoteType.TASK,
    status: NoteStatus.PENDING,
    conversationId: 'conv_1',
    conceptId: 'cpt_1',
    messageId: null,
    parentNoteId: null,
    userId: 'usr_1',
    tenantId: 'tnt_1',
    userReport: null,
    aiScore: null,
    aiFeedback: null,
    expectedOutcome: null,
    workflowStepNumber: null,
    reusedFromNoteId: null,
    agentEnrichments: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

describe('NotesService', () => {
  let service: NotesService;

  // Mock Prisma with every model / method the service touches
  const mockPrisma = {
    note: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
    concept: {
      findMany: jest.fn(),
    },
    agentJob: {
      findMany: jest.fn(),
    },
    user: {
      findMany: jest.fn(),
    },
  };

  const mockAiGateway = {
    streamCompletionWithContext: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new NotesService(mockPrisma as any, mockAiGateway as any);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // createNote
  // ═══════════════════════════════════════════════════════════════════════════
  describe('createNote', () => {
    const baseDto: CreateNoteDto = {
      title: 'New Task',
      content: 'Task body',
      source: NoteSource.CONVERSATION,
      userId: 'usr_1',
      tenantId: 'tnt_1',
    };

    it('should return an id with note_ prefix', async () => {
      mockPrisma.note.create.mockResolvedValue({ id: 'ignored' });

      const result = await service.createNote(baseDto);

      expect(result.id).toMatch(/^note_/);
    });

    it('should pass correct data to prisma.note.create', async () => {
      mockPrisma.note.create.mockResolvedValue({ id: 'ignored' });

      await service.createNote(baseDto);

      expect(mockPrisma.note.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: expect.stringMatching(/^note_/),
          title: 'New Task',
          content: 'Task body',
          source: NoteSource.CONVERSATION,
          userId: 'usr_1',
          tenantId: 'tnt_1',
          noteType: NoteType.NOTE, // default when omitted
          status: null, // not a TASK type → null
        }),
      });
    });

    it('should default noteType to NOTE when not provided', async () => {
      mockPrisma.note.create.mockResolvedValue({ id: 'x' });

      await service.createNote(baseDto);

      const data = mockPrisma.note.create.mock.calls[0][0].data;
      expect(data.noteType).toBe(NoteType.NOTE);
    });

    it('should set status to PENDING when noteType is TASK and status not provided', async () => {
      mockPrisma.note.create.mockResolvedValue({ id: 'x' });

      await service.createNote({ ...baseDto, noteType: NoteType.TASK });

      const data = mockPrisma.note.create.mock.calls[0][0].data;
      expect(data.status).toBe(NoteStatus.PENDING);
    });

    it('should set status to null when noteType is NOTE', async () => {
      mockPrisma.note.create.mockResolvedValue({ id: 'x' });

      await service.createNote({ ...baseDto, noteType: NoteType.NOTE });

      const data = mockPrisma.note.create.mock.calls[0][0].data;
      expect(data.status).toBeNull();
    });

    it('should pass optional fields through to prisma', async () => {
      mockPrisma.note.create.mockResolvedValue({ id: 'x' });

      await service.createNote({
        ...baseDto,
        noteType: NoteType.TASK,
        status: NoteStatus.COMPLETED,
        conversationId: 'conv_99',
        conceptId: 'cpt_55',
        messageId: 'msg_77',
        parentNoteId: 'note_parent',
        expectedOutcome: 'Expected result',
        workflowStepNumber: 3,
        reusedFromNoteId: 'note_old',
        userReport: 'Pre-filled report',
        aiScore: 92,
        aiFeedback: 'Great work',
      });

      const data = mockPrisma.note.create.mock.calls[0][0].data;
      expect(data.conversationId).toBe('conv_99');
      expect(data.conceptId).toBe('cpt_55');
      expect(data.messageId).toBe('msg_77');
      expect(data.parentNoteId).toBe('note_parent');
      expect(data.expectedOutcome).toBe('Expected result');
      expect(data.workflowStepNumber).toBe(3);
      expect(data.reusedFromNoteId).toBe('note_old');
      expect(data.userReport).toBe('Pre-filled report');
      expect(data.aiScore).toBe(92);
      expect(data.aiFeedback).toBe('Great work');
    });

    it('should default optional fields to null when not provided', async () => {
      mockPrisma.note.create.mockResolvedValue({ id: 'x' });

      await service.createNote(baseDto);

      const data = mockPrisma.note.create.mock.calls[0][0].data;
      expect(data.conversationId).toBeNull();
      expect(data.conceptId).toBeNull();
      expect(data.messageId).toBeNull();
      expect(data.parentNoteId).toBeNull();
      expect(data.expectedOutcome).toBeNull();
      expect(data.workflowStepNumber).toBeNull();
      expect(data.reusedFromNoteId).toBeNull();
      expect(data.userReport).toBeNull();
      expect(data.aiScore).toBeNull();
      expect(data.aiFeedback).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // findExistingTask — dedup logic
  // ═══════════════════════════════════════════════════════════════════════════
  describe('findExistingTask', () => {
    it('should return null when neither conceptId nor title is provided', async () => {
      const result = await service.findExistingTask('tnt_1', {});

      expect(result).toBeNull();
      expect(mockPrisma.note.findMany).not.toHaveBeenCalled();
    });

    it('should find exact conceptId + title match', async () => {
      mockPrisma.note.findMany.mockResolvedValue([
        { id: 'note_match', title: 'Do the thing', conceptId: 'cpt_1' },
        { id: 'note_other', title: 'Other task', conceptId: 'cpt_2' },
      ]);

      const result = await service.findExistingTask('tnt_1', {
        conceptId: 'cpt_1',
        title: 'Do the thing',
      });

      expect(result).toBe('note_match');
    });

    it('should be case-insensitive for title matching', async () => {
      mockPrisma.note.findMany.mockResolvedValue([
        { id: 'note_match', title: 'Analiza Tržišta', conceptId: 'cpt_1' },
      ]);

      const result = await service.findExistingTask('tnt_1', {
        conceptId: 'cpt_1',
        title: 'analiza tržišta',
      });

      expect(result).toBe('note_match');
    });

    it('should trim whitespace when comparing titles', async () => {
      mockPrisma.note.findMany.mockResolvedValue([
        { id: 'note_match', title: '  Plan prodaje  ', conceptId: 'cpt_1' },
      ]);

      const result = await service.findExistingTask('tnt_1', {
        conceptId: 'cpt_1',
        title: 'Plan prodaje',
      });

      expect(result).toBe('note_match');
    });

    it('should fall back to title-only match when conceptId + title has no match', async () => {
      mockPrisma.note.findMany.mockResolvedValue([
        { id: 'note_titleonly', title: 'Do the thing', conceptId: 'cpt_other' },
      ]);

      const result = await service.findExistingTask('tnt_1', {
        conceptId: 'cpt_1', // different concept
        title: 'Do the thing',
      });

      // Check 1 fails (different conceptId), but Check 2 (title-only) finds it
      expect(result).toBe('note_titleonly');
    });

    it('should return title-only match when only title is provided (no conceptId)', async () => {
      mockPrisma.note.findMany.mockResolvedValue([
        { id: 'note_found', title: 'My Task', conceptId: null },
      ]);

      const result = await service.findExistingTask('tnt_1', {
        title: 'My Task',
      });

      expect(result).toBe('note_found');
    });

    it('should return null when no title matches', async () => {
      mockPrisma.note.findMany.mockResolvedValue([
        { id: 'note_x', title: 'Totally different', conceptId: 'cpt_1' },
      ]);

      const result = await service.findExistingTask('tnt_1', {
        title: 'No match here',
      });

      expect(result).toBeNull();
    });

    it('should query only top-level tasks (parentNoteId: null)', async () => {
      mockPrisma.note.findMany.mockResolvedValue([]);

      await service.findExistingTask('tnt_1', { title: 'Anything' });

      expect(mockPrisma.note.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            parentNoteId: null,
            noteType: NoteType.TASK,
            status: { in: [NoteStatus.PENDING, NoteStatus.COMPLETED, NoteStatus.READY_FOR_REVIEW] },
          }),
        })
      );
    });

    it('should return null when only conceptId is provided (no title) and no match exists', async () => {
      mockPrisma.note.findMany.mockResolvedValue([
        { id: 'note_x', title: 'Something', conceptId: 'cpt_99' },
      ]);

      // conceptId only — the code only does check 1 if BOTH conceptId + title are set,
      // and only does check 2 if title is set, so conceptId-only returns null
      const result = await service.findExistingTask('tnt_1', { conceptId: 'cpt_99' });

      expect(result).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // findReusableTask
  // ═══════════════════════════════════════════════════════════════════════════
  describe('findReusableTask', () => {
    it('should return reusable task when all criteria met (including title)', async () => {
      mockPrisma.note.findFirst.mockResolvedValue({
        id: 'note_reuse',
        title: 'Completed task',
        content: 'Content',
        userReport: 'Detailed report',
        aiScore: 90,
        aiFeedback: 'Well done',
      });

      const result = await service.findReusableTask('tnt_1', 'cpt_1', 'Completed task');

      expect(result).toEqual({
        id: 'note_reuse',
        title: 'Completed task',
        content: 'Content',
        userReport: 'Detailed report',
        aiScore: 90,
        aiFeedback: 'Well done',
      });
    });

    it('should require exact title match (case-insensitive) in query', async () => {
      mockPrisma.note.findFirst.mockResolvedValue(null);

      await service.findReusableTask('tnt_1', 'cpt_1', 'My Task Title');

      expect(mockPrisma.note.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            title: { equals: 'My Task Title', mode: 'insensitive' },
          }),
        })
      );
    });

    it('should trim title whitespace before matching', async () => {
      mockPrisma.note.findFirst.mockResolvedValue(null);

      await service.findReusableTask('tnt_1', 'cpt_1', '  Padded Title  ');

      expect(mockPrisma.note.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            title: { equals: 'Padded Title', mode: 'insensitive' },
          }),
        })
      );
    });

    it('should use default score threshold of 85', async () => {
      mockPrisma.note.findFirst.mockResolvedValue(null);

      await service.findReusableTask('tnt_1', 'cpt_1', 'Task');

      expect(mockPrisma.note.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            aiScore: { gte: 85 },
          }),
        })
      );
    });

    it('should use custom score threshold when provided', async () => {
      mockPrisma.note.findFirst.mockResolvedValue(null);

      await service.findReusableTask('tnt_1', 'cpt_1', 'Task', { scoreThreshold: 70 });

      expect(mockPrisma.note.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            aiScore: { gte: 70 },
          }),
        })
      );
    });

    it('should use default max age of 30 days', async () => {
      mockPrisma.note.findFirst.mockResolvedValue(null);

      const before = new Date();
      before.setDate(before.getDate() - 30);

      await service.findReusableTask('tnt_1', 'cpt_1', 'Task');

      const callArgs = mockPrisma.note.findFirst.mock.calls[0][0];
      const cutoff = callArgs.where.createdAt.gte as Date;
      // The cutoff should be approximately 30 days ago (within a few seconds)
      expect(Math.abs(cutoff.getTime() - before.getTime())).toBeLessThan(5000);
    });

    it('should return null when no task found (findFirst returns null)', async () => {
      mockPrisma.note.findFirst.mockResolvedValue(null);

      const result = await service.findReusableTask('tnt_1', 'cpt_1', 'Task');

      expect(result).toBeNull();
    });

    it('should return null when task exists but has no userReport', async () => {
      mockPrisma.note.findFirst.mockResolvedValue({
        id: 'note_no_report',
        title: 'Task',
        content: 'Content',
        userReport: null,
        aiScore: 90,
        aiFeedback: null,
      });

      const result = await service.findReusableTask('tnt_1', 'cpt_1', 'Task');

      expect(result).toBeNull();
    });

    it('should return null when task exists but has no aiScore', async () => {
      mockPrisma.note.findFirst.mockResolvedValue({
        id: 'note_no_score',
        title: 'Task',
        content: 'Content',
        userReport: 'Report text',
        aiScore: null,
        aiFeedback: null,
      });

      const result = await service.findReusableTask('tnt_1', 'cpt_1', 'Task');

      expect(result).toBeNull();
    });

    it('should query only COMPLETED tasks with parentNoteId null and title match', async () => {
      mockPrisma.note.findFirst.mockResolvedValue(null);

      await service.findReusableTask('tnt_1', 'cpt_1', 'Research Task');

      expect(mockPrisma.note.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: NoteStatus.COMPLETED,
            parentNoteId: null,
            noteType: NoteType.TASK,
            userReport: { not: null },
            title: { equals: 'Research Task', mode: 'insensitive' },
          }),
          orderBy: { aiScore: 'desc' },
        })
      );
    });

    it('should NOT recycle tasks with different titles on same concept', async () => {
      // This is the key regression test — previously would recycle any task on the concept
      mockPrisma.note.findFirst.mockResolvedValue(null);

      const result = await service.findReusableTask('tnt_1', 'cpt_1', 'New Different Task');

      expect(result).toBeNull();
      // Verify title was included in the query
      const where = mockPrisma.note.findFirst.mock.calls[0][0].where;
      expect(where.title).toEqual({ equals: 'New Different Task', mode: 'insensitive' });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // findExistingSubTask
  // ═══════════════════════════════════════════════════════════════════════════
  describe('findExistingSubTask', () => {
    it('should return sub-task id when found', async () => {
      mockPrisma.note.findFirst.mockResolvedValue({ id: 'note_sub1' });

      const result = await service.findExistingSubTask('tnt_1', 'note_parent', 2);

      expect(result).toBe('note_sub1');
      expect(mockPrisma.note.findFirst).toHaveBeenCalledWith({
        where: {
          tenantId: 'tnt_1',
          parentNoteId: 'note_parent',
          workflowStepNumber: 2,
          noteType: NoteType.TASK,
        },
        select: { id: true },
      });
    });

    it('should return null when no sub-task found', async () => {
      mockPrisma.note.findFirst.mockResolvedValue(null);

      const result = await service.findExistingSubTask('tnt_1', 'note_parent', 5);

      expect(result).toBeNull();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // updateConceptIdForConversation
  // ═══════════════════════════════════════════════════════════════════════════
  describe('updateConceptIdForConversation', () => {
    it('should update orphan notes with the new conceptId', async () => {
      mockPrisma.note.updateMany.mockResolvedValue({ count: 3 });

      await service.updateConceptIdForConversation('conv_1', 'cpt_new', 'tnt_1');

      expect(mockPrisma.note.updateMany).toHaveBeenCalledWith({
        where: {
          conversationId: 'conv_1',
          tenantId: 'tnt_1',
          conceptId: null,
        },
        data: { conceptId: 'cpt_new' },
      });
    });

    it('should not throw when no notes match', async () => {
      mockPrisma.note.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        service.updateConceptIdForConversation('conv_empty', 'cpt_1', 'tnt_1')
      ).resolves.toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // updateStatus — status transition validation
  // ═══════════════════════════════════════════════════════════════════════════
  describe('updateStatus', () => {
    it('should throw NotFoundException when note not found', async () => {
      mockPrisma.note.findFirst.mockResolvedValue(null);

      await expect(
        service.updateStatus('note_missing', NoteStatus.COMPLETED, 'tnt_1')
      ).rejects.toThrow(NotFoundException);
    });

    it('should return current state when status is already the target (idempotent)', async () => {
      const note = makeDbNote({ status: NoteStatus.COMPLETED });
      mockPrisma.note.findFirst.mockResolvedValue(note);

      const result = await service.updateStatus('note_abc123', NoteStatus.COMPLETED, 'tnt_1');

      expect(result.id).toBe('note_abc123');
      expect(mockPrisma.note.update).not.toHaveBeenCalled();
    });

    it('should allow PENDING -> COMPLETED transition', async () => {
      const note = makeDbNote({ status: NoteStatus.PENDING });
      mockPrisma.note.findFirst.mockResolvedValue(note);

      const updatedNote = { ...note, status: NoteStatus.COMPLETED };
      mockPrisma.note.update.mockResolvedValue(updatedNote);

      const result = await service.updateStatus('note_abc123', NoteStatus.COMPLETED, 'tnt_1');

      expect(result.status).toBe(NoteStatus.COMPLETED);
      expect(mockPrisma.note.update).toHaveBeenCalledWith({
        where: { id: 'note_abc123' },
        data: { status: NoteStatus.COMPLETED },
      });
    });

    it('should allow PENDING -> READY_FOR_REVIEW transition', async () => {
      const note = makeDbNote({ status: NoteStatus.PENDING });
      mockPrisma.note.findFirst.mockResolvedValue(note);

      const updatedNote = { ...note, status: NoteStatus.READY_FOR_REVIEW };
      mockPrisma.note.update.mockResolvedValue(updatedNote);

      const result = await service.updateStatus('note_abc123', NoteStatus.READY_FOR_REVIEW, 'tnt_1');

      expect(result.status).toBe(NoteStatus.READY_FOR_REVIEW);
    });

    it('should allow READY_FOR_REVIEW -> COMPLETED transition', async () => {
      const note = makeDbNote({ status: NoteStatus.READY_FOR_REVIEW });
      mockPrisma.note.findFirst.mockResolvedValue(note);

      const updatedNote = { ...note, status: NoteStatus.COMPLETED };
      mockPrisma.note.update.mockResolvedValue(updatedNote);

      const result = await service.updateStatus('note_abc123', NoteStatus.COMPLETED, 'tnt_1');

      expect(result.status).toBe(NoteStatus.COMPLETED);
    });

    it('should allow READY_FOR_REVIEW -> PENDING transition', async () => {
      const note = makeDbNote({ status: NoteStatus.READY_FOR_REVIEW });
      mockPrisma.note.findFirst.mockResolvedValue(note);

      const updatedNote = { ...note, status: NoteStatus.PENDING };
      mockPrisma.note.update.mockResolvedValue(updatedNote);

      const result = await service.updateStatus('note_abc123', NoteStatus.PENDING, 'tnt_1');

      expect(result.status).toBe(NoteStatus.PENDING);
    });

    it('should block COMPLETED -> PENDING (backward transition from terminal state)', async () => {
      const note = makeDbNote({ status: NoteStatus.COMPLETED });
      mockPrisma.note.findFirst.mockResolvedValue(note);

      const result = await service.updateStatus('note_abc123', NoteStatus.PENDING, 'tnt_1');

      // Should return current state without updating
      expect(result.status).toBe(NoteStatus.COMPLETED);
      expect(mockPrisma.note.update).not.toHaveBeenCalled();
    });

    it('should block COMPLETED -> READY_FOR_REVIEW (backward transition from terminal state)', async () => {
      const note = makeDbNote({ status: NoteStatus.COMPLETED });
      mockPrisma.note.findFirst.mockResolvedValue(note);

      const result = await service.updateStatus('note_abc123', NoteStatus.READY_FOR_REVIEW, 'tnt_1');

      expect(result.status).toBe(NoteStatus.COMPLETED);
      expect(mockPrisma.note.update).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // updateNote
  // ═══════════════════════════════════════════════════════════════════════════
  describe('updateNote', () => {
    it('should throw NotFoundException when note not found', async () => {
      mockPrisma.note.findFirst.mockResolvedValue(null);

      await expect(
        service.updateNote('note_nope', 'New title', 'New content', 'tnt_1')
      ).rejects.toThrow(NotFoundException);
    });

    it('should update title and content', async () => {
      const note = makeDbNote();
      mockPrisma.note.findFirst.mockResolvedValue(note);
      mockPrisma.note.update.mockResolvedValue({
        ...note,
        title: 'Updated Title',
        content: 'Updated Content',
      });

      const result = await service.updateNote('note_abc123', 'Updated Title', 'Updated Content', 'tnt_1');

      expect(result.title).toBe('Updated Title');
      expect(result.content).toBe('Updated Content');
    });

    it('should only update title when content is undefined', async () => {
      const note = makeDbNote();
      mockPrisma.note.findFirst.mockResolvedValue(note);
      mockPrisma.note.update.mockResolvedValue({ ...note, title: 'New Title' });

      await service.updateNote('note_abc123', 'New Title', undefined, 'tnt_1');

      const updateData = mockPrisma.note.update.mock.calls[0][0].data;
      expect(updateData.title).toBe('New Title');
      expect(updateData.content).toBeUndefined();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // deleteNote
  // ═══════════════════════════════════════════════════════════════════════════
  describe('deleteNote', () => {
    it('should throw NotFoundException when note not found', async () => {
      mockPrisma.note.findFirst.mockResolvedValue(null);

      await expect(service.deleteNote('note_nope', 'tnt_1')).rejects.toThrow(NotFoundException);
    });

    it('should delete the note when found', async () => {
      mockPrisma.note.findFirst.mockResolvedValue(makeDbNote());
      mockPrisma.note.delete.mockResolvedValue({});

      await service.deleteNote('note_abc123', 'tnt_1');

      expect(mockPrisma.note.delete).toHaveBeenCalledWith({ where: { id: 'note_abc123' } });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // submitReport
  // ═══════════════════════════════════════════════════════════════════════════
  describe('submitReport', () => {
    it('should throw NotFoundException when note not found', async () => {
      mockPrisma.note.findFirst.mockResolvedValue(null);

      await expect(service.submitReport('note_nope', 'My report', 'tnt_1')).rejects.toThrow(
        NotFoundException
      );
    });

    it('should save the report and set status to COMPLETED', async () => {
      const note = makeDbNote();
      mockPrisma.note.findFirst.mockResolvedValue(note);
      mockPrisma.note.update.mockResolvedValue({
        ...note,
        userReport: 'Detailed report',
        status: 'COMPLETED',
      });

      const result = await service.submitReport('note_abc123', 'Detailed report', 'tnt_1');

      expect(mockPrisma.note.update).toHaveBeenCalledWith({
        where: { id: 'note_abc123' },
        data: { userReport: 'Detailed report', status: 'COMPLETED' },
      });
      expect(result.userReport).toBe('Detailed report');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // scoreReport — AI scoring logic
  // ═══════════════════════════════════════════════════════════════════════════
  describe('scoreReport', () => {
    it('should throw NotFoundException when note not found', async () => {
      mockPrisma.note.findFirst.mockResolvedValue(null);

      await expect(service.scoreReport('note_nope', 'usr_1', 'tnt_1')).rejects.toThrow(
        NotFoundException
      );
    });

    it('should throw NotFoundException when note has no userReport', async () => {
      mockPrisma.note.findFirst.mockResolvedValue(makeDbNote({ userReport: null }));

      await expect(service.scoreReport('note_abc123', 'usr_1', 'tnt_1')).rejects.toThrow(
        NotFoundException
      );
    });

    it('should parse valid JSON scoring response from AI', async () => {
      const note = makeDbNote({ userReport: 'My completed report' });
      mockPrisma.note.findFirst.mockResolvedValue(note);
      mockAiGateway.streamCompletionWithContext.mockImplementation(
        async (_msgs: unknown, _ctx: unknown, onChunk: (chunk: string) => void) => {
          onChunk('{"score": 88, "feedback": "Odlican rad."}');
        }
      );
      mockPrisma.note.update.mockResolvedValue({
        ...note,
        aiScore: 88,
        aiFeedback: 'Odlican rad.',
      });

      const result = await service.scoreReport('note_abc123', 'usr_1', 'tnt_1');

      expect(mockPrisma.note.update).toHaveBeenCalledWith({
        where: { id: 'note_abc123' },
        data: { aiScore: 88, aiFeedback: 'Odlican rad.' },
      });
      expect(result.aiScore).toBe(88);
      expect(result.aiFeedback).toBe('Odlican rad.');
    });

    it('should clamp score to 0-100 range', async () => {
      const note = makeDbNote({ userReport: 'Report' });
      mockPrisma.note.findFirst.mockResolvedValue(note);
      mockAiGateway.streamCompletionWithContext.mockImplementation(
        async (_msgs: unknown, _ctx: unknown, onChunk: (chunk: string) => void) => {
          onChunk('{"score": 150, "feedback": "Over the top"}');
        }
      );
      mockPrisma.note.update.mockResolvedValue({
        ...note,
        aiScore: 100,
        aiFeedback: 'Over the top',
      });

      await service.scoreReport('note_abc123', 'usr_1', 'tnt_1');

      const updateData = mockPrisma.note.update.mock.calls[0][0].data;
      expect(updateData.aiScore).toBe(100); // clamped to max
    });

    it('should clamp negative score to 0', async () => {
      const note = makeDbNote({ userReport: 'Report' });
      mockPrisma.note.findFirst.mockResolvedValue(note);
      mockAiGateway.streamCompletionWithContext.mockImplementation(
        async (_msgs: unknown, _ctx: unknown, onChunk: (chunk: string) => void) => {
          onChunk('{"score": -20, "feedback": "Very bad"}');
        }
      );
      mockPrisma.note.update.mockResolvedValue({
        ...note,
        aiScore: 0,
        aiFeedback: 'Very bad',
      });

      await service.scoreReport('note_abc123', 'usr_1', 'tnt_1');

      const updateData = mockPrisma.note.update.mock.calls[0][0].data;
      expect(updateData.aiScore).toBe(0); // clamped to min
    });

    it('should default to score 50 when AI response is unparseable', async () => {
      const note = makeDbNote({ userReport: 'Report' });
      mockPrisma.note.findFirst.mockResolvedValue(note);
      mockAiGateway.streamCompletionWithContext.mockImplementation(
        async (_msgs: unknown, _ctx: unknown, onChunk: (chunk: string) => void) => {
          onChunk('This is not JSON at all');
        }
      );
      mockPrisma.note.update.mockResolvedValue({
        ...note,
        aiScore: 50,
        aiFeedback: 'Ocenjivanje nije uspelo. Pokušajte ponovo.',
      });

      await service.scoreReport('note_abc123', 'usr_1', 'tnt_1');

      const updateData = mockPrisma.note.update.mock.calls[0][0].data;
      expect(updateData.aiScore).toBe(50);
      expect(updateData.aiFeedback).toBe('Ocenjivanje nije uspelo. Pokušajte ponovo.');
    });

    it('should extract JSON from response with surrounding text', async () => {
      const note = makeDbNote({ userReport: 'Report' });
      mockPrisma.note.findFirst.mockResolvedValue(note);
      mockAiGateway.streamCompletionWithContext.mockImplementation(
        async (_msgs: unknown, _ctx: unknown, onChunk: (chunk: string) => void) => {
          onChunk('Here is my evaluation:\n{"score": 75, "feedback": "Good work"}\nThank you.');
        }
      );
      mockPrisma.note.update.mockResolvedValue({
        ...note,
        aiScore: 75,
        aiFeedback: 'Good work',
      });

      await service.scoreReport('note_abc123', 'usr_1', 'tnt_1');

      const updateData = mockPrisma.note.update.mock.calls[0][0].data;
      expect(updateData.aiScore).toBe(75);
      expect(updateData.aiFeedback).toBe('Good work');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // generateReport
  // ═══════════════════════════════════════════════════════════════════════════
  describe('generateReport', () => {
    it('should throw NotFoundException when note not found', async () => {
      mockPrisma.note.findFirst.mockResolvedValue(null);

      await expect(service.generateReport('note_nope', 'usr_1', 'tnt_1')).rejects.toThrow(
        NotFoundException
      );
    });

    it('should generate report from workflow step children', async () => {
      const note = makeDbNote({ expectedOutcome: 'Detailed analysis' });
      mockPrisma.note.findFirst.mockResolvedValue(note);
      mockPrisma.note.findMany.mockResolvedValue([
        makeDbNote({ id: 'note_step1', title: 'Step 1', content: 'Step 1 results', workflowStepNumber: 1, parentNoteId: 'note_abc123' }),
        makeDbNote({ id: 'note_step2', title: 'Step 2', content: 'Step 2 results', workflowStepNumber: 2, parentNoteId: 'note_abc123' }),
      ]);
      mockAiGateway.streamCompletionWithContext.mockImplementation(
        async (_msgs: unknown, _ctx: unknown, onChunk: (chunk: string) => void) => {
          onChunk('Generated final deliverable content.');
        }
      );
      mockPrisma.note.update.mockResolvedValue({});

      const result = await service.generateReport('note_abc123', 'usr_1', 'tnt_1');

      expect(result).toBe('Generated final deliverable content.');
      // Should auto-save report and mark COMPLETED
      expect(mockPrisma.note.update).toHaveBeenCalledWith({
        where: { id: 'note_abc123' },
        data: { userReport: 'Generated final deliverable content.', status: 'COMPLETED' },
      });
    });

    it('should generate simple report when no children exist', async () => {
      const note = makeDbNote();
      mockPrisma.note.findFirst.mockResolvedValue(note);
      mockPrisma.note.findMany.mockResolvedValue([]); // no children
      mockAiGateway.streamCompletionWithContext.mockImplementation(
        async (_msgs: unknown, _ctx: unknown, onChunk: (chunk: string) => void) => {
          onChunk('Simple task result.');
        }
      );
      mockPrisma.note.update.mockResolvedValue({});

      const result = await service.generateReport('note_abc123', 'usr_1', 'tnt_1');

      expect(result).toBe('Simple task result.');
    });

    it('should return fallback text when AI returns empty response', async () => {
      const note = makeDbNote();
      mockPrisma.note.findFirst.mockResolvedValue(note);
      mockPrisma.note.findMany.mockResolvedValue([]);
      mockAiGateway.streamCompletionWithContext.mockImplementation(async () => {
        // AI returns nothing
      });
      mockPrisma.note.update.mockResolvedValue({});

      const result = await service.generateReport('note_abc123', 'usr_1', 'tnt_1');

      expect(result).toBe('Generisanje nije uspelo. Pokušajte ponovo.');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Comment methods
  // ═══════════════════════════════════════════════════════════════════════════
  describe('createComment', () => {
    it('should throw NotFoundException when parent task not found', async () => {
      mockPrisma.note.findFirst.mockResolvedValue(null);

      await expect(
        service.createComment('note_nope', 'Comment text', 'usr_1', 'tnt_1')
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when parent is not a TASK', async () => {
      mockPrisma.note.findFirst.mockResolvedValue({ id: 'note_1', noteType: NoteType.NOTE });

      await expect(
        service.createComment('note_1', 'Comment text', 'usr_1', 'tnt_1')
      ).rejects.toThrow(BadRequestException);
    });

    it('should create a comment with COMMENT noteType and MANUAL source', async () => {
      mockPrisma.note.findFirst.mockResolvedValue({ id: 'note_task', noteType: NoteType.TASK });
      const createdAt = new Date('2026-03-01T10:00:00Z');
      mockPrisma.note.create.mockResolvedValue({
        id: 'note_comment1',
        content: 'My comment',
        userId: 'usr_1',
        createdAt,
      });

      const result = await service.createComment('note_task', 'My comment', 'usr_1', 'tnt_1');

      expect(result.id).toBe('note_comment1');
      expect(result.content).toBe('My comment');
      expect(result.userId).toBe('usr_1');
      expect(result.createdAt).toBe(createdAt.toISOString());

      expect(mockPrisma.note.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          noteType: NoteType.COMMENT,
          source: NoteSource.MANUAL,
          parentNoteId: 'note_task',
          title: 'Comment',
        }),
      });
    });
  });

  describe('updateComment', () => {
    it('should throw NotFoundException when comment not found', async () => {
      mockPrisma.note.findFirst.mockResolvedValue(null);

      await expect(
        service.updateComment('note_nope', 'New content', 'usr_1', 'tnt_1')
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user is not the comment author', async () => {
      mockPrisma.note.findFirst.mockResolvedValue({
        id: 'note_comment',
        userId: 'usr_other',
        noteType: NoteType.COMMENT,
      });

      await expect(
        service.updateComment('note_comment', 'New content', 'usr_1', 'tnt_1')
      ).rejects.toThrow(ForbiddenException);
    });

    it('should update comment content when user is the author', async () => {
      const updatedAt = new Date('2026-03-01T12:00:00Z');
      mockPrisma.note.findFirst.mockResolvedValue({
        id: 'note_comment',
        userId: 'usr_1',
        noteType: NoteType.COMMENT,
      });
      mockPrisma.note.update.mockResolvedValue({
        id: 'note_comment',
        content: 'Updated comment',
        updatedAt,
      });

      const result = await service.updateComment('note_comment', 'Updated comment', 'usr_1', 'tnt_1');

      expect(result.content).toBe('Updated comment');
      expect(result.updatedAt).toBe(updatedAt.toISOString());
    });
  });

  describe('deleteComment', () => {
    it('should throw NotFoundException when comment not found', async () => {
      mockPrisma.note.findFirst.mockResolvedValue(null);

      await expect(
        service.deleteComment('note_nope', 'usr_1', 'MEMBER', 'tnt_1')
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when non-owner non-author tries to delete', async () => {
      mockPrisma.note.findFirst.mockResolvedValue({
        id: 'note_comment',
        userId: 'usr_other',
        noteType: NoteType.COMMENT,
      });

      await expect(
        service.deleteComment('note_comment', 'usr_1', 'MEMBER', 'tnt_1')
      ).rejects.toThrow(ForbiddenException);
    });

    it('should allow comment author to delete their own comment', async () => {
      mockPrisma.note.findFirst.mockResolvedValue({
        id: 'note_comment',
        userId: 'usr_1',
        noteType: NoteType.COMMENT,
      });
      mockPrisma.note.delete.mockResolvedValue({});

      await service.deleteComment('note_comment', 'usr_1', 'MEMBER', 'tnt_1');

      expect(mockPrisma.note.delete).toHaveBeenCalledWith({ where: { id: 'note_comment' } });
    });

    it('should allow PLATFORM_OWNER to delete any comment', async () => {
      mockPrisma.note.findFirst.mockResolvedValue({
        id: 'note_comment',
        userId: 'usr_other',
        noteType: NoteType.COMMENT,
      });
      mockPrisma.note.delete.mockResolvedValue({});

      await service.deleteComment('note_comment', 'usr_admin', 'PLATFORM_OWNER', 'tnt_1');

      expect(mockPrisma.note.delete).toHaveBeenCalledWith({ where: { id: 'note_comment' } });
    });

    it('should allow TENANT_OWNER to delete any comment', async () => {
      mockPrisma.note.findFirst.mockResolvedValue({
        id: 'note_comment',
        userId: 'usr_other',
        noteType: NoteType.COMMENT,
      });
      mockPrisma.note.delete.mockResolvedValue({});

      await service.deleteComment('note_comment', 'usr_tenant_admin', 'TENANT_OWNER', 'tnt_1');

      expect(mockPrisma.note.delete).toHaveBeenCalledWith({ where: { id: 'note_comment' } });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getAllTasks (Task Hub)
  // ═══════════════════════════════════════════════════════════════════════════
  describe('getAllTasks', () => {
    beforeEach(() => {
      // Default: no tasks returned
      mockPrisma.note.findMany.mockResolvedValue([]);
      mockPrisma.note.count.mockResolvedValue(0);
      mockPrisma.concept.findMany.mockResolvedValue([]);
      mockPrisma.agentJob.findMany.mockResolvedValue([]);
    });

    it('should return paginated response with defaults (page 1, limit 50)', async () => {
      const result = await service.getAllTasks('tnt_1');

      expect(result).toEqual({
        tasks: [],
        total: 0,
        page: 1,
        limit: 50,
        domainSummary: [],
      });
    });

    it('should apply status filter when provided', async () => {
      await service.getAllTasks('tnt_1', { status: 'PENDING' });

      // The first findMany call is for tasks; check its where clause
      const firstCall = mockPrisma.note.findMany.mock.calls[0][0];
      expect(firstCall.where.status).toBe('PENDING');
    });

    it('should apply search filter as case-insensitive contains', async () => {
      await service.getAllTasks('tnt_1', { search: 'prodaja' });

      const firstCall = mockPrisma.note.findMany.mock.calls[0][0];
      expect(firstCall.where.title).toEqual({ contains: 'prodaja', mode: 'insensitive' });
    });

    it('should look up concepts for category filter', async () => {
      mockPrisma.concept.findMany.mockResolvedValueOnce([
        { id: 'cpt_1' },
        { id: 'cpt_2' },
      ]);

      await service.getAllTasks('tnt_1', { category: 'Prodaja' });

      // Category triggers concept lookup, then filters notes by matching conceptIds
      expect(mockPrisma.concept.findMany).toHaveBeenCalledWith({
        where: { category: { contains: 'Prodaja', mode: 'insensitive' } },
        select: { id: true },
      });
    });

    it('should clamp page to minimum 1', async () => {
      const result = await service.getAllTasks('tnt_1', { page: -5 });

      expect(result.page).toBe(1);
    });

    it('should clamp limit to maximum 100', async () => {
      const result = await service.getAllTasks('tnt_1', { limit: 500 });

      expect(result.limit).toBe(100);
    });

    it('should enrich tasks with concept name and agent jobs', async () => {
      const now = new Date();
      const task = makeDbNote({
        id: 'note_hub1',
        conceptId: 'cpt_1',
        children: [],
      });
      // First findMany = tasks, second = summary tasks
      mockPrisma.note.findMany
        .mockResolvedValueOnce([task])   // tasks
        .mockResolvedValueOnce([]);      // summary tasks
      mockPrisma.note.count.mockResolvedValue(1);
      mockPrisma.concept.findMany
        .mockResolvedValueOnce([{ id: 'cpt_1', name: 'Prodaja', category: '6. Prodaja' }])  // task concepts
        .mockResolvedValueOnce([]);  // summary concepts
      mockPrisma.agentJob.findMany.mockResolvedValue([
        { id: 'job_1', noteId: 'note_hub1', agentType: 'research', status: 'completed', order: 1 },
      ]);

      const result = await service.getAllTasks('tnt_1');

      expect(result.tasks).toHaveLength(1);
      expect(result.tasks[0]!.conceptName).toBe('Prodaja');
      expect(result.tasks[0]!.conceptCategory).toBe('6. Prodaja');
      expect(result.tasks[0]!.agentJobs).toHaveLength(1);
      expect(result.tasks[0]!.agentJobs[0]!.agentType).toBe('research');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // linkNotesToConversation
  // ═══════════════════════════════════════════════════════════════════════════
  describe('linkNotesToConversation', () => {
    it('should return 0 immediately when conceptIds array is empty', async () => {
      const result = await service.linkNotesToConversation([], 'conv_1', 'usr_1', 'tnt_1');

      expect(result).toBe(0);
      expect(mockPrisma.note.updateMany).not.toHaveBeenCalled();
    });

    it('should update orphan notes with conversationId', async () => {
      mockPrisma.note.updateMany.mockResolvedValue({ count: 2 });

      const result = await service.linkNotesToConversation(
        ['cpt_1', 'cpt_2'],
        'conv_1',
        'usr_1',
        'tnt_1'
      );

      expect(result).toBe(2);
      expect(mockPrisma.note.updateMany).toHaveBeenCalledWith({
        where: {
          conceptId: { in: ['cpt_1', 'cpt_2'] },
          conversationId: null,
          userId: 'usr_1',
          tenantId: 'tnt_1',
        },
        data: { conversationId: 'conv_1' },
      });
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getDiscoveredConceptIds
  // ═══════════════════════════════════════════════════════════════════════════
  describe('getDiscoveredConceptIds', () => {
    it('should return distinct conceptIds from notes', async () => {
      mockPrisma.note.findMany.mockResolvedValue([
        { conceptId: 'cpt_1' },
        { conceptId: 'cpt_2' },
      ]);

      const result = await service.getDiscoveredConceptIds('usr_1', 'tnt_1');

      expect(result).toEqual(['cpt_1', 'cpt_2']);
    });

    it('should filter out null conceptIds', async () => {
      mockPrisma.note.findMany.mockResolvedValue([
        { conceptId: 'cpt_1' },
        { conceptId: null },
      ]);

      const result = await service.getDiscoveredConceptIds('usr_1', 'tnt_1');

      expect(result).toEqual(['cpt_1']);
    });

    it('should return empty array when no notes have concepts', async () => {
      mockPrisma.note.findMany.mockResolvedValue([]);

      const result = await service.getDiscoveredConceptIds('usr_1', 'tnt_1');

      expect(result).toEqual([]);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getByIdsWithChildren
  // ═══════════════════════════════════════════════════════════════════════════
  describe('getByIdsWithChildren', () => {
    it('should return empty array for empty noteIds', async () => {
      const result = await service.getByIdsWithChildren([], 'usr_1', 'tnt_1');

      expect(result).toEqual([]);
      expect(mockPrisma.note.findMany).not.toHaveBeenCalled();
    });

    it('should fetch notes by ids with children included', async () => {
      const note = makeDbNote({ children: [] });
      mockPrisma.note.findMany.mockResolvedValue([note]);

      const result = await service.getByIdsWithChildren(['note_abc123'], 'usr_1', 'tnt_1');

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('note_abc123');
      expect(mockPrisma.note.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: ['note_abc123'] }, userId: 'usr_1', tenantId: 'tnt_1', parentNoteId: null },
        })
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getCommentsByTask — pagination + user resolution
  // ═══════════════════════════════════════════════════════════════════════════
  describe('getCommentsByTask', () => {
    it('should return paginated comments with user info', async () => {
      const createdAt = new Date('2026-03-01T10:00:00Z');
      const updatedAt = new Date('2026-03-01T10:00:00Z');

      // First Promise.all call: [findMany, count]
      mockPrisma.note.findMany.mockResolvedValueOnce([
        { id: 'note_c1', content: 'Comment 1', userId: 'usr_1', createdAt, updatedAt },
      ]);
      mockPrisma.note.count.mockResolvedValue(1);
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'usr_1', name: 'Alice', role: 'MEMBER' },
      ]);

      const result = await service.getCommentsByTask('note_task', 'tnt_1');

      expect(result.comments).toHaveLength(1);
      expect(result.comments[0]!.userName).toBe('Alice');
      expect(result.comments[0]!.userRole).toBe('MEMBER');
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
    });

    it('should fall back to userId as userName when user not found', async () => {
      const now = new Date();
      mockPrisma.note.findMany.mockResolvedValueOnce([
        { id: 'note_c1', content: 'Comment', userId: 'usr_unknown', createdAt: now, updatedAt: now },
      ]);
      mockPrisma.note.count.mockResolvedValue(1);
      mockPrisma.user.findMany.mockResolvedValue([]); // no user found

      const result = await service.getCommentsByTask('note_task', 'tnt_1');

      expect(result.comments[0]!.userName).toBe('usr_unknown');
      expect(result.comments[0]!.userRole).toBe('MEMBER');
    });

    it('should enforce pagination bounds: minimum page 1, limit 1-100', async () => {
      mockPrisma.note.findMany.mockResolvedValue([]);
      mockPrisma.note.count.mockResolvedValue(0);

      const result = await service.getCommentsByTask('note_task', 'tnt_1', -5, 200);

      expect(result.page).toBe(1);
      expect(result.limit).toBe(100);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // getNoteByIdWithChildren
  // ═══════════════════════════════════════════════════════════════════════════
  describe('getNoteByIdWithChildren', () => {
    it('should return null when note not found', async () => {
      mockPrisma.note.findFirst.mockResolvedValue(null);

      const result = await service.getNoteByIdWithChildren('note_nope', 'tnt_1');

      expect(result).toBeNull();
    });

    it('should return note mapped to NoteItem with children', async () => {
      const note = makeDbNote({
        children: [
          makeDbNote({ id: 'note_child1', workflowStepNumber: 1, parentNoteId: 'note_abc123' }),
        ],
      });
      mockPrisma.note.findFirst.mockResolvedValue(note);

      const result = await service.getNoteByIdWithChildren('note_abc123', 'tnt_1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('note_abc123');
      expect(result!.children).toHaveLength(1);
      expect(result!.children![0]!.id).toBe('note_child1');
    });
  });
});
