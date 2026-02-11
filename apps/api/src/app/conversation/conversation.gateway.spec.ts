import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ConversationGateway } from './conversation.gateway';
import { ConversationService } from './conversation.service';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { NotesService } from '../notes/notes.service';
import { ConceptMatchingService } from '../knowledge/services/concept-matching.service';
import { CitationInjectorService } from '../knowledge/services/citation-injector.service';
import { CitationService } from '../knowledge/services/citation.service';
import { MemoryContextBuilderService } from '../memory/services/memory-context-builder.service';
import { MemoryExtractionService } from '../memory/services/memory-extraction.service';
import { WorkflowService } from '../workflow/workflow.service';
import { YoloSchedulerService } from '../workflow/yolo-scheduler.service';
import { ConceptService } from '../knowledge/services/concept.service';
import { ConceptExtractionService } from '../knowledge/services/concept-extraction.service';

describe('ConversationGateway', () => {
  let gateway: ConversationGateway;
  let mockConversationService: {
    getConversation: jest.Mock;
    addMessage: jest.Mock;
  };
  let mockAiGatewayService: {
    streamCompletionWithContext: jest.Mock;
  };
  let mockConfigService: { get: jest.Mock };

  beforeEach(async () => {
    mockConversationService = {
      getConversation: jest.fn(),
      addMessage: jest.fn(),
    };

    mockAiGatewayService = {
      streamCompletionWithContext: jest.fn(),
    };

    mockConfigService = {
      get: jest.fn().mockImplementation((key: string) => {
        switch (key) {
          case 'AUTH0_DOMAIN':
            return 'test.auth0.com';
          case 'AUTH0_AUDIENCE':
            return 'https://api.test.com';
          default:
            return undefined;
        }
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConversationGateway,
        { provide: ConversationService, useValue: mockConversationService },
        { provide: AiGatewayService, useValue: mockAiGatewayService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: PlatformPrismaService, useValue: { note: { findMany: jest.fn().mockResolvedValue([]) }, user: { findUnique: jest.fn().mockResolvedValue(null) }, tenant: { findUnique: jest.fn().mockResolvedValue(null) } } },
        { provide: NotesService, useValue: { getNotesForConversation: jest.fn().mockResolvedValue([]), getPendingTasksByUser: jest.fn().mockResolvedValue([]), getLatestNoteBySource: jest.fn().mockResolvedValue(null) } },
        { provide: ConceptMatchingService, useValue: { findRelevantConcepts: jest.fn().mockResolvedValue([]) } },
        { provide: CitationInjectorService, useValue: { injectCitations: jest.fn().mockImplementation((_c, text) => text) } },
        { provide: CitationService, useValue: { createCitationsForMessage: jest.fn().mockResolvedValue([]) } },
        { provide: MemoryContextBuilderService, useValue: { buildContext: jest.fn().mockResolvedValue({ contextText: '', attributions: [] }) } },
        { provide: MemoryExtractionService, useValue: { extractMemories: jest.fn().mockResolvedValue([]) } },
        { provide: WorkflowService, useValue: {} },
        { provide: YoloSchedulerService, useValue: { startYoloExecution: jest.fn(), cancelRun: jest.fn(), getRunState: jest.fn() } },
        { provide: ConceptService, useValue: { findById: jest.fn().mockResolvedValue(null) } },
        { provide: ConceptExtractionService, useValue: { extractAndCreateConcepts: jest.fn().mockResolvedValue({ created: [], skippedDuplicates: [], errors: [] }) } },
      ],
    }).compile();

    gateway = module.get<ConversationGateway>(ConversationGateway);
  });

  describe('initialization', () => {
    it('should be defined', () => {
      expect(gateway).toBeDefined();
    });

    it('should configure auth0 settings from config', () => {
      expect(mockConfigService.get).toHaveBeenCalledWith('AUTH0_DOMAIN');
      expect(mockConfigService.get).toHaveBeenCalledWith('AUTH0_AUDIENCE');
    });
  });

  describe('handleMessage', () => {
    const mockClient = {
      id: 'socket_123',
      emit: jest.fn(),
      handshake: {
        headers: { authorization: 'Bearer test-token' },
        query: {},
      },
    } as unknown as { id: string; emit: jest.Mock };

    beforeEach(() => {
      mockClient.emit.mockClear();
      // Attach user info to mock client
      (mockClient as { userId?: string; tenantId?: string }).userId =
        'usr_test123';
      (mockClient as { userId?: string; tenantId?: string }).tenantId =
        'tnt_test123';
    });

    it('should emit error for invalid payload', async () => {
      await gateway.handleMessage(mockClient as never, {
        conversationId: '',
        content: '',
      });

      expect(mockClient.emit).toHaveBeenCalledWith('chat:error', {
        type: 'invalid_payload',
        message: 'conversationId and content are required',
      });
    });

    it('should save user message and stream AI response', async () => {
      const mockConversation = {
        id: 'sess_1',
        userId: 'usr_test123',
        title: 'Test',
        createdAt: '2026-02-06T00:00:00.000Z',
        updatedAt: '2026-02-06T00:00:00.000Z',
        messages: [],
      };

      mockConversationService.getConversation.mockResolvedValue(
        mockConversation
      );
      mockConversationService.addMessage
        .mockResolvedValueOnce({
          id: 'msg_user1',
          conversationId: 'sess_1',
          role: 'USER',
          content: 'Hello',
          createdAt: '2026-02-06T00:00:00.000Z',
        })
        .mockResolvedValueOnce({
          id: 'msg_ai1',
          conversationId: 'sess_1',
          role: 'ASSISTANT',
          content: 'Hi there!',
          createdAt: '2026-02-06T00:00:00.000Z',
        });

      mockAiGatewayService.streamCompletionWithContext.mockImplementation(
        async (_messages, _options, onChunk) => {
          onChunk('Hi ');
          onChunk('there!');
          return {
            correlationId: 'cor_test',
            success: true,
            inputTokens: 10,
            outputTokens: 5,
            cost: 0.001,
            confidence: {
              score: 0.75,
              level: 'MEDIUM',
              factors: [
                { name: 'hedging_language', score: 0.8, weight: 0.35 },
              ],
            },
          };
        }
      );

      await gateway.handleMessage(mockClient as never, {
        conversationId: 'sess_1',
        content: 'Hello',
      });

      // Should verify ownership
      expect(mockConversationService.getConversation).toHaveBeenCalledWith(
        'tnt_test123',
        'sess_1',
        'usr_test123'
      );

      // Should save user message (without confidence)
      expect(mockConversationService.addMessage).toHaveBeenCalledWith(
        'tnt_test123',
        'sess_1',
        'USER',
        'Hello'
      );

      // Should emit message received
      expect(mockClient.emit).toHaveBeenCalledWith('chat:message-received', {
        messageId: 'msg_user1',
        role: 'USER',
      });

      // Should emit chunks
      expect(mockClient.emit).toHaveBeenCalledWith('chat:message-chunk', {
        content: 'Hi ',
        index: 0,
      });
      expect(mockClient.emit).toHaveBeenCalledWith('chat:message-chunk', {
        content: 'there!',
        index: 1,
      });

      // Should emit complete with confidence metadata
      expect(mockClient.emit).toHaveBeenCalledWith('chat:complete', {
        messageId: 'msg_ai1',
        fullContent: 'Hi there!',
        metadata: {
          totalChunks: 2,
          confidence: {
            score: 0.75,
            level: 'MEDIUM',
            factors: [
              { name: 'hedging_language', score: 0.8, weight: 0.35 },
            ],
          },
          citations: [],
          memoryAttributions: [],
        },
      });
    });

    it('should emit error when conversation access denied', async () => {
      mockConversationService.getConversation.mockRejectedValue(
        new Error('Access denied')
      );

      await gateway.handleMessage(mockClient as never, {
        conversationId: 'sess_1',
        content: 'Hello',
      });

      expect(mockClient.emit).toHaveBeenCalledWith('chat:error', {
        type: 'processing_error',
        message: 'Access denied',
      });
    });

    it('should emit error when AI streaming fails', async () => {
      mockConversationService.getConversation.mockResolvedValue({
        id: 'sess_1',
        userId: 'usr_test123',
        messages: [],
      });
      mockConversationService.addMessage.mockResolvedValue({
        id: 'msg_user1',
        role: 'USER',
      });
      mockAiGatewayService.streamCompletionWithContext.mockRejectedValue(
        new Error('AI service unavailable')
      );

      await gateway.handleMessage(mockClient as never, {
        conversationId: 'sess_1',
        content: 'Hello',
      });

      expect(mockClient.emit).toHaveBeenCalledWith('chat:error', {
        type: 'processing_error',
        message: 'AI service unavailable',
      });
    });
  });

  describe('handleDisconnect', () => {
    it('should log disconnection', () => {
      const mockClient = { id: 'socket_123' };

      // Just verify it doesn't throw
      expect(() =>
        gateway.handleDisconnect(mockClient as never)
      ).not.toThrow();
    });
  });
});
