import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConversationController } from './conversation.controller';
import { ConversationService } from './conversation.service';
import { CurriculumService } from '../knowledge/services/curriculum.service';
import { ConceptService } from '../knowledge/services/concept.service';
import type { CurrentUserPayload } from '../auth/strategies/jwt.strategy';

describe('ConversationController', () => {
  let controller: ConversationController;
  let mockConversationService: {
    createConversation: jest.Mock;
    listConversations: jest.Mock;
    getConversation: jest.Mock;
    deleteConversation: jest.Mock;
  };

  const mockUser: CurrentUserPayload = {
    userId: 'usr_test123',
    tenantId: 'tnt_test123',
    role: 'MEMBER',
    email: 'test@example.com',
    auth0Id: 'auth0|123',
  };

  beforeEach(async () => {
    mockConversationService = {
      createConversation: jest.fn(),
      listConversations: jest.fn(),
      getConversation: jest.fn(),
      deleteConversation: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ConversationController],
      providers: [
        { provide: ConversationService, useValue: mockConversationService },
        { provide: CurriculumService, useValue: {} },
        { provide: ConceptService, useValue: { createDynamicRelationships: jest.fn().mockResolvedValue({ relationshipsCreated: 0, errors: [] }) } },
        { provide: ConfigService, useValue: { get: jest.fn() } },
      ],
    }).compile();

    controller = module.get<ConversationController>(ConversationController);
  });

  describe('createConversation', () => {
    it('should create a new conversation', async () => {
      const mockConversation = {
        id: 'sess_abc123',
        userId: mockUser.userId,
        title: 'Test Conversation',
        createdAt: '2026-02-06T00:00:00.000Z',
        updatedAt: '2026-02-06T00:00:00.000Z',
      };
      mockConversationService.createConversation.mockResolvedValue(
        mockConversation
      );

      const result = await controller.createConversation(mockUser, {
        title: 'Test Conversation',
      });

      expect(mockConversationService.createConversation).toHaveBeenCalledWith(
        mockUser.tenantId,
        mockUser.userId,
        'Test Conversation',
        undefined,
        undefined
      );
      expect(result).toEqual({ data: mockConversation });
    });

    it('should create conversation without title', async () => {
      const mockConversation = {
        id: 'sess_abc123',
        userId: mockUser.userId,
        title: null,
        createdAt: '2026-02-06T00:00:00.000Z',
        updatedAt: '2026-02-06T00:00:00.000Z',
      };
      mockConversationService.createConversation.mockResolvedValue(
        mockConversation
      );

      const result = await controller.createConversation(mockUser, {});

      expect(mockConversationService.createConversation).toHaveBeenCalledWith(
        mockUser.tenantId,
        mockUser.userId,
        undefined,
        undefined,
        undefined
      );
      expect(result.data.title).toBeNull();
    });
  });

  describe('listConversations', () => {
    it('should return list of conversations', async () => {
      const mockConversations = [
        {
          id: 'sess_1',
          userId: mockUser.userId,
          title: 'Conv 1',
          createdAt: '2026-02-06T00:00:00.000Z',
          updatedAt: '2026-02-06T00:00:00.000Z',
        },
        {
          id: 'sess_2',
          userId: mockUser.userId,
          title: 'Conv 2',
          createdAt: '2026-02-06T00:00:00.000Z',
          updatedAt: '2026-02-06T00:00:00.000Z',
        },
      ];
      mockConversationService.listConversations.mockResolvedValue(
        mockConversations
      );

      const result = await controller.listConversations(mockUser);

      expect(mockConversationService.listConversations).toHaveBeenCalledWith(
        mockUser.tenantId,
        mockUser.userId
      );
      expect(result).toEqual({ data: mockConversations });
    });

    it('should return empty array when no conversations', async () => {
      mockConversationService.listConversations.mockResolvedValue([]);

      const result = await controller.listConversations(mockUser);

      expect(result).toEqual({ data: [] });
    });
  });

  describe('getConversation', () => {
    it('should return conversation with messages', async () => {
      const mockConversation = {
        id: 'sess_1',
        userId: mockUser.userId,
        title: 'Test',
        createdAt: '2026-02-06T00:00:00.000Z',
        updatedAt: '2026-02-06T00:00:00.000Z',
        messages: [
          {
            id: 'msg_1',
            conversationId: 'sess_1',
            role: 'USER',
            content: 'Hello',
            createdAt: '2026-02-06T00:00:00.000Z',
          },
        ],
      };
      mockConversationService.getConversation.mockResolvedValue(
        mockConversation
      );

      const result = await controller.getConversation(mockUser, 'sess_1');

      expect(mockConversationService.getConversation).toHaveBeenCalledWith(
        mockUser.tenantId,
        'sess_1',
        mockUser.userId
      );
      expect(result).toEqual({ data: mockConversation });
    });
  });

  describe('deleteConversation', () => {
    it('should delete conversation', async () => {
      mockConversationService.deleteConversation.mockResolvedValue(undefined);

      await controller.deleteConversation(mockUser, 'sess_1');

      expect(mockConversationService.deleteConversation).toHaveBeenCalledWith(
        mockUser.tenantId,
        'sess_1',
        mockUser.userId
      );
    });
  });
});
