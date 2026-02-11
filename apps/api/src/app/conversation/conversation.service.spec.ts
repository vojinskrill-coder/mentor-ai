import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { ConversationService } from './conversation.service';
import { TenantPrismaService } from '@mentor-ai/shared/tenant-context';
import { ConceptService } from '../knowledge/services/concept.service';
import { CurriculumService } from '../knowledge/services/curriculum.service';
import { CitationService } from '../knowledge/services/citation.service';
import { NotesService } from '../notes/notes.service';
import { MessageRole } from '@mentor-ai/shared/types';

describe('ConversationService', () => {
  let service: ConversationService;
  let mockPrisma: {
    conversation: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    message: {
      create: jest.Mock;
    };
  };
  let mockTenantPrisma: { getClient: jest.Mock };
  let mockConceptService: { findByIds: jest.Mock };
  let mockCurriculumService: {
    getActiveConceptsByCurriculum: jest.Mock;
    getAncestorChain: jest.Mock;
    getFullTree: jest.Mock;
  };
  let mockCitationService: { getDiscoveredConceptIds: jest.Mock };
  let mockNotesService: { getDiscoveredConceptIds: jest.Mock };

  const mockTenantId = 'tnt_test123';
  const mockUserId = 'usr_test123';

  beforeEach(async () => {
    jest.clearAllMocks();

    mockPrisma = {
      conversation: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
      message: {
        create: jest.fn(),
      },
    };

    mockTenantPrisma = {
      getClient: jest.fn().mockResolvedValue(mockPrisma),
    };

    mockConceptService = {
      findByIds: jest.fn().mockResolvedValue(new Map()),
    };

    mockCurriculumService = {
      getActiveConceptsByCurriculum: jest.fn().mockResolvedValue(new Map()),
      getAncestorChain: jest.fn().mockReturnValue([]),
      getFullTree: jest.fn().mockReturnValue([]),
    };

    mockCitationService = {
      getDiscoveredConceptIds: jest.fn().mockResolvedValue([]),
    };

    mockNotesService = {
      getDiscoveredConceptIds: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationService,
        { provide: TenantPrismaService, useValue: mockTenantPrisma },
        { provide: ConceptService, useValue: mockConceptService },
        { provide: CurriculumService, useValue: mockCurriculumService },
        { provide: CitationService, useValue: mockCitationService },
        { provide: NotesService, useValue: mockNotesService },
      ],
    }).compile();

    service = module.get<ConversationService>(ConversationService);
  });

  describe('createConversation', () => {
    it('should create a new conversation with sess_ prefix', async () => {
      const mockConversation = {
        id: 'sess_abc123',
        userId: mockUserId,
        title: 'Test Conversation',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrisma.conversation.create.mockResolvedValue(mockConversation);

      const result = await service.createConversation(
        mockTenantId,
        mockUserId,
        'Test Conversation'
      );

      expect(mockTenantPrisma.getClient).toHaveBeenCalledWith(mockTenantId);
      expect(mockPrisma.conversation.create).toHaveBeenCalled();
      const createArgs = mockPrisma.conversation.create.mock.calls[0][0];
      expect(createArgs.data.id).toMatch(/^sess_/);
      expect(createArgs.data.userId).toBe(mockUserId);
      expect(result.id).toBe(mockConversation.id);
    });

    it('should create conversation with null title if not provided', async () => {
      const mockConversation = {
        id: 'sess_abc123',
        userId: mockUserId,
        title: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockPrisma.conversation.create.mockResolvedValue(mockConversation);

      const result = await service.createConversation(mockTenantId, mockUserId);

      const createArgs = mockPrisma.conversation.create.mock.calls[0][0];
      expect(createArgs.data.title).toBeNull();
      expect(result.title).toBeNull();
    });
  });

  describe('listConversations', () => {
    it('should return all conversations for a user', async () => {
      const mockConversations = [
        {
          id: 'sess_1',
          userId: mockUserId,
          title: 'Conv 1',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'sess_2',
          userId: mockUserId,
          title: 'Conv 2',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];
      mockPrisma.conversation.findMany.mockResolvedValue(mockConversations);

      const result = await service.listConversations(mockTenantId, mockUserId);

      expect(mockPrisma.conversation.findMany).toHaveBeenCalledWith({
        where: { userId: mockUserId },
        orderBy: { updatedAt: 'desc' },
      });
      expect(result).toHaveLength(2);
    });

    it('should return empty array when user has no conversations', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([]);

      const result = await service.listConversations(mockTenantId, mockUserId);

      expect(result).toEqual([]);
    });
  });

  describe('getConversation', () => {
    it('should return conversation with messages', async () => {
      const mockConversation = {
        id: 'sess_1',
        userId: mockUserId,
        title: 'Test',
        createdAt: new Date(),
        updatedAt: new Date(),
        messages: [
          {
            id: 'msg_1',
            conversationId: 'sess_1',
            role: 'USER',
            content: 'Hello',
            createdAt: new Date(),
          },
          {
            id: 'msg_2',
            conversationId: 'sess_1',
            role: 'ASSISTANT',
            content: 'Hi there!',
            createdAt: new Date(),
          },
        ],
      };
      mockPrisma.conversation.findUnique.mockResolvedValue(mockConversation);

      const result = await service.getConversation(
        mockTenantId,
        'sess_1',
        mockUserId
      );

      expect(result.id).toBe('sess_1');
      expect(result.messages).toHaveLength(2);
    });

    it('should throw NotFoundException when conversation not found', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(null);

      await expect(
        service.getConversation(mockTenantId, 'sess_nonexistent', mockUserId)
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user does not own conversation', async () => {
      const mockConversation = {
        id: 'sess_1',
        userId: 'usr_other_user',
        title: 'Test',
        createdAt: new Date(),
        updatedAt: new Date(),
        messages: [],
      };
      mockPrisma.conversation.findUnique.mockResolvedValue(mockConversation);

      await expect(
        service.getConversation(mockTenantId, 'sess_1', mockUserId)
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('deleteConversation', () => {
    it('should delete conversation when user owns it', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: 'sess_1',
        userId: mockUserId,
      });
      mockPrisma.conversation.delete.mockResolvedValue({});

      await service.deleteConversation(mockTenantId, 'sess_1', mockUserId);

      expect(mockPrisma.conversation.delete).toHaveBeenCalledWith({
        where: { id: 'sess_1' },
      });
    });

    it('should throw NotFoundException when conversation not found', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue(null);

      await expect(
        service.deleteConversation(mockTenantId, 'sess_nonexistent', mockUserId)
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when user does not own conversation', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: 'sess_1',
        userId: 'usr_other_user',
      });

      await expect(
        service.deleteConversation(mockTenantId, 'sess_1', mockUserId)
      ).rejects.toThrow(ForbiddenException);
    });
  });

  describe('addMessage', () => {
    it('should add a message with msg_ prefix', async () => {
      const mockMessage = {
        id: 'msg_abc123',
        conversationId: 'sess_1',
        role: 'USER',
        content: 'Hello',
        createdAt: new Date(),
      };
      mockPrisma.message.create.mockResolvedValue(mockMessage);
      mockPrisma.conversation.update.mockResolvedValue({});

      const result = await service.addMessage(
        mockTenantId,
        'sess_1',
        MessageRole.USER,
        'Hello'
      );

      expect(mockPrisma.message.create).toHaveBeenCalled();
      const createArgs = mockPrisma.message.create.mock.calls[0][0];
      expect(createArgs.data.id).toMatch(/^msg_/);
      expect(createArgs.data.role).toBe('USER');
      expect(createArgs.data.content).toBe('Hello');
      expect(result.id).toBe(mockMessage.id);
    });

    it('should update conversation updatedAt timestamp', async () => {
      mockPrisma.message.create.mockResolvedValue({
        id: 'msg_1',
        conversationId: 'sess_1',
        role: 'USER',
        content: 'Hello',
        createdAt: new Date(),
      });
      mockPrisma.conversation.update.mockResolvedValue({});

      await service.addMessage(mockTenantId, 'sess_1', MessageRole.USER, 'Hello');

      expect(mockPrisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'sess_1' },
        data: { updatedAt: expect.any(Date) },
      });
    });
  });

  describe('updateTitle', () => {
    it('should update conversation title', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: 'sess_1',
        userId: mockUserId,
      });
      mockPrisma.conversation.update.mockResolvedValue({
        id: 'sess_1',
        userId: mockUserId,
        title: 'New Title',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.updateTitle(
        mockTenantId,
        'sess_1',
        mockUserId,
        'New Title'
      );

      expect(mockPrisma.conversation.update).toHaveBeenCalledWith({
        where: { id: 'sess_1' },
        data: { title: 'New Title' },
      });
      expect(result.title).toBe('New Title');
    });

    it('should throw ForbiddenException when user does not own conversation', async () => {
      mockPrisma.conversation.findUnique.mockResolvedValue({
        id: 'sess_1',
        userId: 'usr_other_user',
      });

      await expect(
        service.updateTitle(mockTenantId, 'sess_1', mockUserId, 'New Title')
      ).rejects.toThrow(ForbiddenException);
    });
  });

  // ─── listGroupedConversations tests ───────────────────────────────────────

  describe('listGroupedConversations', () => {
    const now = new Date();

    const makeConv = (
      id: string,
      conceptId: string | null = null,
    ) => ({
      id,
      userId: mockUserId,
      title: `Conv ${id}`,
      personaType: null,
      conceptId,
      createdAt: now,
      updatedAt: now,
    });

    it('should return empty tree and empty uncategorized when no conversations exist', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([]);

      const result = await service.listGroupedConversations(mockTenantId, mockUserId);

      expect(result.tree).toEqual([]);
      expect(result.uncategorized).toEqual([]);
    });

    it('should place conversations without conceptId into uncategorized', async () => {
      mockPrisma.conversation.findMany.mockResolvedValue([
        makeConv('sess_1', null),
        makeConv('sess_2', null),
      ]);

      const result = await service.listGroupedConversations(mockTenantId, mockUserId);

      expect(result.tree).toEqual([]);
      expect(result.uncategorized).toHaveLength(2);
      expect(result.uncategorized[0]!.id).toBe('sess_1');
      expect(result.uncategorized[1]!.id).toBe('sess_2');
    });

    it('should place curriculum-mapped conversations into tree hierarchy', async () => {
      const conceptId = 'cpt_market';
      const curriculumId = 'segmentacija-trzista';
      const rootCurriculumId = 'marketing';

      // Conversation linked to a concept
      mockPrisma.conversation.findMany.mockResolvedValue([
        makeConv('sess_1', conceptId),
      ]);

      // Concept has curriculumId mapping
      mockCurriculumService.getActiveConceptsByCurriculum.mockResolvedValue(
        new Map([
          [curriculumId, { id: conceptId, name: 'Market Segmentation', curriculumId, parentId: null }],
        ])
      );

      // Ancestor chain from root to leaf
      mockCurriculumService.getAncestorChain.mockReturnValue([
        { id: rootCurriculumId, parentId: null, label: 'Marketing', sortOrder: 3 },
        { id: curriculumId, parentId: rootCurriculumId, label: 'Segmentacija tržišta', sortOrder: 1 },
      ]);

      // Full tree returns just the needed nodes
      mockCurriculumService.getFullTree.mockReturnValue([
        { id: rootCurriculumId, parentId: null, label: 'Marketing', sortOrder: 3 },
        { id: curriculumId, parentId: rootCurriculumId, label: 'Segmentacija tržišta', sortOrder: 1 },
      ]);

      const result = await service.listGroupedConversations(mockTenantId, mockUserId);

      // Tree should have one root node (Marketing) with a child (Segmentacija)
      expect(result.tree).toHaveLength(1);
      const root = result.tree[0]!;
      expect(root.label).toBe('Marketing');
      expect(root.children).toHaveLength(1);
      const child = root.children[0]!;
      expect(child.label).toBe('Segmentacija tržišta');
      expect(child.conversations).toHaveLength(1);
      expect(child.conversations[0]!.id).toBe('sess_1');
      expect(root.conversationCount).toBe(1);
      expect(result.uncategorized).toEqual([]);
    });

    it('should use category fallback for concepts without curriculumId', async () => {
      const conceptId = 'cpt_content_strat';

      // Conversation linked to a concept that has NO curriculum mapping
      mockPrisma.conversation.findMany.mockResolvedValue([
        makeConv('sess_1', conceptId),
      ]);

      // No curriculum mapping for this concept
      mockCurriculumService.getActiveConceptsByCurriculum.mockResolvedValue(new Map());

      // ConceptService returns details with category
      mockConceptService.findByIds.mockResolvedValue(
        new Map([
          [conceptId, { id: conceptId, name: 'Content Strategy', slug: 'content-strategy', category: 'Marketing' }],
        ])
      );

      const result = await service.listGroupedConversations(mockTenantId, mockUserId);

      // Should appear under a category fallback node
      expect(result.tree).toHaveLength(1);
      const catRoot = result.tree[0]!;
      expect(catRoot.label).toBe('Marketing');
      expect(catRoot.curriculumId).toBe('category-marketing');
      expect(catRoot.children).toHaveLength(1);
      const catChild = catRoot.children[0]!;
      expect(catChild.label).toBe('Content Strategy');
      expect(catChild.conversations).toHaveLength(1);
      expect(result.uncategorized).toEqual([]);
    });

    it('should include notes-discovered concepts as empty tree nodes', async () => {
      const conceptId = 'cpt_finance_1';
      const curriculumId = 'tok-gotovine';
      const rootCurriculumId = 'finansije';

      // No conversations at all
      mockPrisma.conversation.findMany.mockResolvedValue([]);

      // But this concept was discovered via notes
      mockNotesService.getDiscoveredConceptIds.mockResolvedValue([conceptId]);

      // It has a curriculum mapping
      mockCurriculumService.getActiveConceptsByCurriculum.mockResolvedValue(
        new Map([
          [curriculumId, { id: conceptId, name: 'Cash Flow', curriculumId, parentId: null }],
        ])
      );

      mockCurriculumService.getAncestorChain.mockReturnValue([
        { id: rootCurriculumId, parentId: null, label: 'Finansije', sortOrder: 1 },
        { id: curriculumId, parentId: rootCurriculumId, label: 'Tok gotovine', sortOrder: 2 },
      ]);

      mockCurriculumService.getFullTree.mockReturnValue([
        { id: rootCurriculumId, parentId: null, label: 'Finansije', sortOrder: 1 },
        { id: curriculumId, parentId: rootCurriculumId, label: 'Tok gotovine', sortOrder: 2 },
      ]);

      const result = await service.listGroupedConversations(mockTenantId, mockUserId);

      // Tree should show the node even though there are no conversations
      expect(result.tree).toHaveLength(1);
      const finRoot = result.tree[0]!;
      expect(finRoot.label).toBe('Finansije');
      const finChild = finRoot.children[0]!;
      expect(finChild.label).toBe('Tok gotovine');
      expect(finChild.conversations).toEqual([]);
      expect(finRoot.conversationCount).toBe(0);
    });

    it('should correctly handle mixed: curriculum-mapped + category-fallback + uncategorized', async () => {
      const mappedConceptId = 'cpt_mapped';
      const unmappedConceptId = 'cpt_unmapped';
      const curriculumId = 'lean-proizvodnja';
      const rootCurriculumId = 'operacije';

      mockPrisma.conversation.findMany.mockResolvedValue([
        makeConv('sess_mapped', mappedConceptId),
        makeConv('sess_unmapped', unmappedConceptId),
        makeConv('sess_none', null),
      ]);

      // Only the mapped concept has curriculum link
      mockCurriculumService.getActiveConceptsByCurriculum.mockResolvedValue(
        new Map([
          [curriculumId, { id: mappedConceptId, name: 'Lean', curriculumId, parentId: null }],
        ])
      );

      mockCurriculumService.getAncestorChain.mockReturnValue([
        { id: rootCurriculumId, parentId: null, label: 'Operacije', sortOrder: 5 },
        { id: curriculumId, parentId: rootCurriculumId, label: 'Lean proizvodnja', sortOrder: 1 },
      ]);

      mockCurriculumService.getFullTree.mockReturnValue([
        { id: rootCurriculumId, parentId: null, label: 'Operacije', sortOrder: 5 },
        { id: curriculumId, parentId: rootCurriculumId, label: 'Lean proizvodnja', sortOrder: 1 },
      ]);

      // The unmapped concept has a category for fallback
      mockConceptService.findByIds.mockResolvedValue(
        new Map([
          [unmappedConceptId, { id: unmappedConceptId, name: 'Six Sigma', slug: 'six-sigma', category: 'Operations' }],
        ])
      );

      const result = await service.listGroupedConversations(mockTenantId, mockUserId);

      // Curriculum tree node
      const currNode = result.tree.find((n) => n.label === 'Operacije');
      expect(currNode).toBeDefined();
      const currChild = currNode!.children[0]!;
      expect(currChild.conversations).toHaveLength(1);
      expect(currChild.conversations[0]!.id).toBe('sess_mapped');

      // Category fallback node
      const catNode = result.tree.find((n) => n.label === 'Operations');
      expect(catNode).toBeDefined();
      const catCh = catNode!.children[0]!;
      expect(catCh.label).toBe('Six Sigma');
      expect(catCh.conversations).toHaveLength(1);
      expect(catCh.conversations[0]!.id).toBe('sess_unmapped');

      // Uncategorized
      expect(result.uncategorized).toHaveLength(1);
      expect(result.uncategorized[0]!.id).toBe('sess_none');
    });
  });
});
