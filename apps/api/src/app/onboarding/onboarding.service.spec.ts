import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { OnboardingService } from './onboarding.service';
import { OnboardingMetricService } from './onboarding-metric.service';
import { PlatformPrismaService } from '@mentor-ai/shared/tenant-context';
import { AiGatewayService } from '../ai-gateway/ai-gateway.service';
import { NotesService } from '../notes/notes.service';
import { ConceptService } from '../knowledge/services/concept.service';
import { ConceptMatchingService } from '../knowledge/services/concept-matching.service';
import { ConversationService } from '../conversation/conversation.service';
import { WebSearchService } from '../web-search/web-search.service';
import { BrainSeedingService } from '../knowledge/services/brain-seeding.service';
import { TenantStatus, NoteSource } from '@mentor-ai/shared/prisma';

describe('OnboardingService', () => {
  let service: OnboardingService;

  const mockPrismaService = {
    tenant: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    conversation: {
      count: jest.fn().mockResolvedValue(0),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ department: null, role: 'MEMBER' }),
    },
  };

  const mockAiGatewayService = {
    streamCompletionWithContext: jest.fn(),
  };

  const mockMetricService = {
    getMetric: jest.fn(),
    startOnboarding: jest.fn(),
    completeOnboarding: jest.fn(),
    hasIncompleteOnboarding: jest.fn(),
  };

  const mockNotesService = {
    createNote: jest.fn(),
    linkNotesToConversation: jest.fn(),
  };

  const mockConceptService = {
    findByIds: jest.fn(),
    findByName: jest.fn(),
  };

  const mockConceptMatchingService = {
    findRelevantConcepts: jest.fn(),
  };

  const mockConversationService = {
    createConversation: jest.fn(),
    addMessage: jest.fn(),
  };

  const mockWebSearchService = {
    isAvailable: jest.fn().mockReturnValue(false),
    search: jest.fn(),
    fetchWebpage: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingService,
        { provide: PlatformPrismaService, useValue: mockPrismaService },
        { provide: AiGatewayService, useValue: mockAiGatewayService },
        { provide: NotesService, useValue: mockNotesService },
        { provide: OnboardingMetricService, useValue: mockMetricService },
        { provide: ConceptService, useValue: mockConceptService },
        { provide: ConceptMatchingService, useValue: mockConceptMatchingService },
        { provide: ConversationService, useValue: mockConversationService },
        { provide: WebSearchService, useValue: mockWebSearchService },
        {
          provide: BrainSeedingService,
          useValue: { seedPendingTasksForUser: jest.fn().mockResolvedValue([]) },
        },
      ],
    }).compile();

    service = module.get<OnboardingService>(OnboardingService);
  });

  describe('getStatus', () => {
    it('should return onboarding status for valid tenant', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        status: TenantStatus.ONBOARDING,
      });
      mockMetricService.getMetric.mockResolvedValue(null);

      const result = await service.getStatus('tnt_123', 'usr_456');

      expect(result.currentStep).toBe(1);
      expect(result.tenantStatus).toBe('ONBOARDING');
    });

    it('should return DRAFT status when tenant not found', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue(null);

      const result = await service.getStatus('tnt_invalid', 'usr_456');

      expect(result.currentStep).toBe(1);
      expect(result.tenantStatus).toBe('DRAFT');
    });

    it('should return step based on metric progress', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        status: TenantStatus.ONBOARDING,
      });
      mockMetricService.getMetric.mockResolvedValue({
        id: 'obm_123',
        industry: 'FINANCE',
        quickTaskType: 'finance-email',
        startedAt: new Date().toISOString(),
        completedAt: null,
        timeToFirstValueMs: null,
        tenantId: 'tnt_123',
        userId: 'usr_456',
      });

      const result = await service.getStatus('tnt_123', 'usr_456');

      expect(result.currentStep).toBe(3);
      expect(result.selectedIndustry).toBe('FINANCE');
      expect(result.selectedTaskId).toBe('finance-email');
    });
  });

  describe('getTasksForIndustry', () => {
    it('should return tasks for valid industry', () => {
      const tasks = service.getTasksForIndustry('FINANCE');

      expect(tasks.length).toBeGreaterThan(0);
      expect(tasks.every((t) => t.department === 'FINANCE')).toBe(true);
    });

    it('should return empty array for unknown industry', () => {
      const tasks = service.getTasksForIndustry('UNKNOWN');

      expect(tasks).toEqual([]);
    });
  });

  describe('getAllTasks', () => {
    it('should return all quick task templates', () => {
      const tasks = service.getAllTasks();

      expect(tasks.length).toBeGreaterThan(0);
      expect(tasks.some((t) => t.department === 'FINANCE')).toBe(true);
      expect(tasks.some((t) => t.department === 'MARKETING')).toBe(true);
    });
  });

  describe('executeQuickWin', () => {
    it('should execute quick win and return output', async () => {
      mockMetricService.hasIncompleteOnboarding.mockResolvedValue(false);
      mockMetricService.startOnboarding.mockResolvedValue({ id: 'obm_123' });
      mockAiGatewayService.streamCompletionWithContext.mockImplementation(
        async (_messages, _options, onChunk) => {
          onChunk('Test output content');
          return { inputTokens: 100, outputTokens: 50 };
        }
      );

      const result = await service.executeQuickWin(
        'tnt_123',
        'usr_456',
        'finance-email',
        'Need Q4 summary',
        'FINANCE'
      );

      expect(result.output).toBe('Test output content');
      expect(result.tokensUsed).toBe(150);
      expect(result.generationTimeMs).toBeGreaterThanOrEqual(0);
      expect(mockMetricService.startOnboarding).toHaveBeenCalled();
    });

    it('should throw BadRequestException for invalid task', async () => {
      await expect(
        service.executeQuickWin('tnt_123', 'usr_456', 'invalid-task', 'Context', 'FINANCE')
      ).rejects.toThrow(BadRequestException);
    });

    it('should not start new metric if one exists', async () => {
      mockMetricService.hasIncompleteOnboarding.mockResolvedValue(true);
      mockAiGatewayService.streamCompletionWithContext.mockImplementation(
        async (_messages, _options, onChunk) => {
          onChunk('Output');
          return { inputTokens: 50, outputTokens: 25 };
        }
      );

      await service.executeQuickWin('tnt_123', 'usr_456', 'finance-email', 'Context', 'FINANCE');

      expect(mockMetricService.startOnboarding).not.toHaveBeenCalled();
    });
  });

  describe('completeOnboarding', () => {
    it('should complete onboarding, create note, and update tenant to ACTIVE', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        status: TenantStatus.ONBOARDING,
      });
      mockPrismaService.tenant.update.mockResolvedValue({
        status: TenantStatus.ACTIVE,
      });
      mockMetricService.completeOnboarding.mockResolvedValue({ id: 'obm_123' });
      mockNotesService.createNote.mockResolvedValue({ id: 'note_abc123' });
      // generateInitialPlan returns null (no concepts matched)
      mockConceptMatchingService.findRelevantConcepts.mockResolvedValue([]);

      const result = await service.completeOnboarding(
        'tnt_123',
        'usr_456',
        'finance-email',
        'Generated output'
      );

      expect(result.newTenantStatus).toBe('ACTIVE');
      expect(result.celebrationMessage).toContain('saved');
      expect(result.noteId).toBe('note_abc123');
      expect(mockPrismaService.tenant.update).toHaveBeenCalledWith({
        where: { id: 'tnt_123' },
        data: { status: TenantStatus.ACTIVE },
      });
      expect(mockMetricService.completeOnboarding).toHaveBeenCalled();
      expect(mockNotesService.createNote).toHaveBeenCalledWith({
        title: 'Draft a Financial Summary Email',
        content: 'Generated output',
        source: NoteSource.ONBOARDING,
        userId: 'usr_456',
        tenantId: 'tnt_123',
      });
    });

    it('should not update tenant if already ACTIVE but still create note', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        status: TenantStatus.ACTIVE,
      });
      mockMetricService.completeOnboarding.mockResolvedValue({ id: 'obm_123' });
      mockNotesService.createNote.mockResolvedValue({ id: 'note_xyz789' });
      mockConceptMatchingService.findRelevantConcepts.mockResolvedValue([]);

      const result = await service.completeOnboarding(
        'tnt_123',
        'usr_456',
        'finance-email',
        'Output'
      );

      expect(result.newTenantStatus).toBe('ACTIVE');
      expect(result.noteId).toBe('note_xyz789');
      expect(mockPrismaService.tenant.update).not.toHaveBeenCalled();
      expect(mockNotesService.createNote).toHaveBeenCalled();
    });

    it('should throw NotFoundException for invalid tenant', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue(null);

      await expect(
        service.completeOnboarding('tnt_invalid', 'usr_456', 'task', 'output')
      ).rejects.toThrow(NotFoundException);
    });

    it('should return welcomeConversationId when generateInitialPlan succeeds', async () => {
      // Setup: tenant exists and is in ONBOARDING
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        status: TenantStatus.ONBOARDING,
        name: 'Test Co',
        industry: 'FINANCE',
        description: 'Financial consulting firm',
      });
      mockPrismaService.tenant.update.mockResolvedValue({
        status: TenantStatus.ACTIVE,
      });
      mockMetricService.completeOnboarding.mockResolvedValue({ id: 'obm_1' });
      mockNotesService.createNote.mockResolvedValue({ id: 'note_1' });
      mockNotesService.linkNotesToConversation.mockResolvedValue(2);

      // generateInitialPlan internals
      mockConceptMatchingService.findRelevantConcepts.mockResolvedValue([
        {
          conceptId: 'cpt_1',
          conceptName: 'Cash Flow',
          score: 0.9,
          definition: 'Cash flow analysis',
          category: 'Finance',
        },
        {
          conceptId: 'cpt_2',
          conceptName: 'Budget Forecasting',
          score: 0.8,
          definition: 'Budget prediction',
          category: 'Finance',
        },
      ]);

      mockConversationService.createConversation.mockResolvedValue({
        id: 'sess_welcome_1',
        userId: 'usr_456',
        title: 'Dobrodošli u Mentor AI',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      mockConversationService.addMessage.mockResolvedValue({
        id: 'msg_1',
        conversationId: 'sess_welcome_1',
        role: 'ASSISTANT',
        content: 'Welcome message',
        createdAt: new Date().toISOString(),
      });

      // LLM generates welcome message
      mockAiGatewayService.streamCompletionWithContext.mockImplementation(
        async (_messages, _options, onChunk) => {
          onChunk('Dobrodošli u Mentor AI!');
          return { inputTokens: 200, outputTokens: 100 };
        }
      );

      const result = await service.completeOnboarding(
        'tnt_123',
        'usr_456',
        'finance-email',
        'Generated output'
      );

      expect(result.welcomeConversationId).toBe('sess_welcome_1');

      // Verify createConversation was called with first concept's ID
      expect(mockConversationService.createConversation).toHaveBeenCalledWith(
        'tnt_123',
        'usr_456',
        'Dobrodošli u Mentor AI',
        undefined,
        'cpt_1' // first matched concept
      );

      // Verify task notes were created for each matched concept
      expect(mockNotesService.createNote).toHaveBeenCalledTimes(3); // 1 onboarding note + 2 task notes

      // Verify notes were linked to the welcome conversation
      expect(mockNotesService.linkNotesToConversation).toHaveBeenCalledWith(
        ['cpt_1', 'cpt_2'],
        'sess_welcome_1',
        'usr_456',
        'tnt_123'
      );
    });

    it('should still succeed when generateInitialPlan fails', async () => {
      mockPrismaService.tenant.findUnique.mockResolvedValue({
        status: TenantStatus.ONBOARDING,
        name: 'Test Co',
        industry: 'FINANCE',
        description: 'Firm',
      });
      mockPrismaService.tenant.update.mockResolvedValue({
        status: TenantStatus.ACTIVE,
      });
      mockMetricService.completeOnboarding.mockResolvedValue({ id: 'obm_1' });
      mockNotesService.createNote.mockResolvedValue({ id: 'note_1' });

      // generateInitialPlan throws
      mockConceptMatchingService.findRelevantConcepts.mockRejectedValue(
        new Error('Qdrant unavailable')
      );

      const result = await service.completeOnboarding(
        'tnt_123',
        'usr_456',
        'finance-email',
        'Output'
      );

      // completeOnboarding should still succeed
      expect(result.newTenantStatus).toBe('ACTIVE');
      expect(result.noteId).toBe('note_1');
      expect(result.welcomeConversationId).toBeUndefined();
    });
  });
});
