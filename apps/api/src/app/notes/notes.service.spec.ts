import { Test, TestingModule } from '@nestjs/testing';
import { NotesService, CreateNoteDto } from './notes.service';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import { NoteSource } from '@mentor-ai/shared/prisma';

describe('NotesService', () => {
  let service: NotesService;

  const mockPrismaService = {
    note: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findMany: jest.fn(),
    },
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotesService,
        { provide: PlatformPrismaService, useValue: mockPrismaService },
        { provide: AiGatewayService, useValue: {} },
      ],
    }).compile();

    service = module.get<NotesService>(NotesService);
  });

  describe('createNote', () => {
    it('should create a note with note_ prefix ID', async () => {
      const dto: CreateNoteDto = {
        title: 'Test Note',
        content: 'Test content',
        source: NoteSource.ONBOARDING,
        userId: 'usr_123',
        tenantId: 'tnt_456',
      };

      mockPrismaService.note.create.mockResolvedValue({
        id: 'note_abc123',
        ...dto,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.createNote(dto);

      expect(result.id).toMatch(/^note_/);
      expect(mockPrismaService.note.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          id: expect.stringMatching(/^note_/),
          title: dto.title,
          content: dto.content,
          source: dto.source,
          userId: dto.userId,
          tenantId: dto.tenantId,
        }),
      });
    });

    it('should create note with ONBOARDING source', async () => {
      const dto: CreateNoteDto = {
        title: 'Onboarding Note',
        content: 'Generated content from onboarding',
        source: NoteSource.ONBOARDING,
        userId: 'usr_123',
        tenantId: 'tnt_456',
      };

      mockPrismaService.note.create.mockResolvedValue({
        id: 'note_abc123',
        ...dto,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await service.createNote(dto);

      expect(mockPrismaService.note.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          source: NoteSource.ONBOARDING,
        }),
      });
    });
  });

  describe('getNoteById', () => {
    it('should return note when found', async () => {
      const mockNote = {
        id: 'note_abc123',
        title: 'Test Note',
        content: 'Content',
        source: NoteSource.MANUAL,
        userId: 'usr_123',
        tenantId: 'tnt_456',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.note.findFirst.mockResolvedValue(mockNote);

      const result = await service.getNoteById('note_abc123', 'tnt_456');

      expect(result).toEqual(mockNote);
      expect(mockPrismaService.note.findFirst).toHaveBeenCalledWith({
        where: {
          id: 'note_abc123',
          tenantId: 'tnt_456',
        },
      });
    });

    it('should return null when note not found', async () => {
      mockPrismaService.note.findFirst.mockResolvedValue(null);

      const result = await service.getNoteById('note_notfound', 'tnt_456');

      expect(result).toBeNull();
    });
  });

  describe('getByConcept', () => {
    it('should return top-level notes with children, filtered by parentNoteId null', async () => {
      const now = new Date();
      const parentNote = {
        id: 'note_parent1',
        title: 'Parent Task',
        content: 'Task content',
        source: 'CONVERSATION',
        noteType: 'TASK',
        status: 'COMPLETED',
        conversationId: 'sess_conv1',
        conceptId: 'cpt_abc',
        messageId: null,
        parentNoteId: null,
        userReport: null,
        aiScore: null,
        aiFeedback: null,
        expectedOutcome: null,
        workflowStepNumber: null,
        createdAt: now,
        updatedAt: now,
        children: [
          {
            id: 'note_child1',
            title: 'Step 1',
            content: 'Step 1 content',
            source: 'CONVERSATION',
            noteType: 'TASK',
            status: 'READY_FOR_REVIEW',
            conversationId: 'sess_conv1',
            conceptId: 'cpt_abc',
            messageId: null,
            parentNoteId: 'note_parent1',
            userReport: null,
            aiScore: null,
            aiFeedback: null,
            expectedOutcome: 'Analyze market',
            workflowStepNumber: 1,
            createdAt: now,
            updatedAt: now,
          },
        ],
      };

      mockPrismaService.note.findMany.mockResolvedValue([parentNote]);

      const result = await service.getByConcept('cpt_abc', 'usr_123', 'tnt_456');

      expect(result).toHaveLength(1);
      expect(result[0]!.id).toBe('note_parent1');
      expect(result[0]!.children).toBeDefined();
      expect(result[0]!.children).toHaveLength(1);
      expect(result[0]!.children![0]!.id).toBe('note_child1');
      expect(result[0]!.children![0]!.workflowStepNumber).toBe(1);

      // Verify query includes parentNoteId: null and children include
      expect(mockPrismaService.note.findMany).toHaveBeenCalledWith({
        where: {
          conceptId: 'cpt_abc',
          userId: 'usr_123',
          tenantId: 'tnt_456',
          parentNoteId: null,
        },
        include: {
          children: { orderBy: { workflowStepNumber: 'asc' } },
        },
        orderBy: { createdAt: 'desc' },
      });
    });

    it('should return empty array when no notes exist for concept', async () => {
      mockPrismaService.note.findMany.mockResolvedValue([]);

      const result = await service.getByConcept('cpt_missing', 'usr_123', 'tnt_456');

      expect(result).toEqual([]);
    });
  });

  describe('getNotesByUser', () => {
    it('should return notes for user ordered by createdAt desc', async () => {
      const mockNotes = [
        {
          id: 'note_2',
          title: 'Note 2',
          content: 'Content 2',
          source: NoteSource.ONBOARDING,
          userId: 'usr_123',
          tenantId: 'tnt_456',
          createdAt: new Date('2024-01-02'),
          updatedAt: new Date('2024-01-02'),
        },
        {
          id: 'note_1',
          title: 'Note 1',
          content: 'Content 1',
          source: NoteSource.MANUAL,
          userId: 'usr_123',
          tenantId: 'tnt_456',
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-01'),
        },
      ];

      mockPrismaService.note.findMany.mockResolvedValue(mockNotes);

      const result = await service.getNotesByUser('usr_123', 'tnt_456');

      expect(result).toEqual(mockNotes);
      expect(mockPrismaService.note.findMany).toHaveBeenCalledWith({
        where: {
          userId: 'usr_123',
          tenantId: 'tnt_456',
        },
        orderBy: {
          createdAt: 'desc',
        },
      });
    });

    it('should return empty array when user has no notes', async () => {
      mockPrismaService.note.findMany.mockResolvedValue([]);

      const result = await service.getNotesByUser('usr_nonotes', 'tnt_456');

      expect(result).toEqual([]);
    });
  });
});
