import { Test, TestingModule } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import { OnboardingController } from './onboarding.controller';
import { OnboardingService } from './onboarding.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MfaRequiredGuard } from '../auth/guards/mfa-required.guard';
import { Department, TenantStatus } from '@mentor-ai/shared/types';
import type { CurrentUserPayload } from '../auth/strategies/jwt.strategy';

describe('OnboardingController', () => {
  let controller: OnboardingController;

  const mockOnboardingService = {
    getStatus: jest.fn(),
    getAllTasks: jest.fn(),
    getTasksForIndustry: jest.fn(),
    executeQuickWin: jest.fn(),
    completeOnboarding: jest.fn(),
  };

  const mockUser: CurrentUserPayload = {
    userId: 'usr_456',
    tenantId: 'tnt_123',
    role: 'MEMBER',
    email: 'test@example.com',
    auth0Id: 'auth0|123',
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [OnboardingController],
      providers: [
        { provide: OnboardingService, useValue: mockOnboardingService },
        Reflector,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(MfaRequiredGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<OnboardingController>(OnboardingController);
  });

  describe('getStatus', () => {
    it('should return onboarding status', async () => {
      const mockStatus = {
        currentStep: 1,
        tenantStatus: TenantStatus.ONBOARDING,
        selectedIndustry: undefined,
        selectedTaskId: undefined,
        startedAt: undefined,
      };

      mockOnboardingService.getStatus.mockResolvedValue(mockStatus);

      const result = await controller.getStatus(mockUser, 'corr_123');

      expect(result.data).toEqual(mockStatus);
      expect(result.correlationId).toBe('corr_123');
      expect(mockOnboardingService.getStatus).toHaveBeenCalledWith(
        'tnt_123',
        'usr_456'
      );
    });
  });

  describe('getAllTasks', () => {
    it('should return all quick tasks', () => {
      const mockTasks = [
        {
          id: 'finance-email',
          name: 'Draft a Financial Summary Email',
          description: 'Create a professional email',
          department: Department.FINANCE,
          estimatedTimeSaved: 15,
        },
      ];

      mockOnboardingService.getAllTasks.mockReturnValue(mockTasks);

      const result = controller.getAllTasks('corr_123');

      expect(result.data).toEqual(mockTasks);
      expect(result.correlationId).toBe('corr_123');
    });
  });

  describe('getTasksByIndustry', () => {
    it('should return tasks for specific industry', () => {
      const mockTasks = [
        {
          id: 'finance-email',
          name: 'Draft a Financial Summary Email',
          description: 'Create a professional email',
          department: Department.FINANCE,
          estimatedTimeSaved: 15,
        },
      ];

      mockOnboardingService.getTasksForIndustry.mockReturnValue(mockTasks);

      const result = controller.getTasksByIndustry('FINANCE', 'corr_123');

      expect(result.data).toEqual(mockTasks);
      expect(mockOnboardingService.getTasksForIndustry).toHaveBeenCalledWith(
        'FINANCE'
      );
    });
  });

  describe('executeQuickWin', () => {
    it('should execute quick win task', async () => {
      const mockResponse = {
        output: 'Generated content here',
        generationTimeMs: 2500,
        tokensUsed: 150,
      };

      mockOnboardingService.executeQuickWin.mockResolvedValue(mockResponse);

      const dto = {
        taskId: 'finance-email',
        userContext: 'Need Q4 summary for board',
        industry: 'FINANCE',
      };

      const result = await controller.executeQuickWin(dto, mockUser, 'corr_123');

      expect(result.data).toEqual(mockResponse);
      expect(result.correlationId).toBe('corr_123');
      expect(mockOnboardingService.executeQuickWin).toHaveBeenCalledWith(
        'tnt_123',
        'usr_456',
        dto.taskId,
        dto.userContext,
        dto.industry
      );
    });
  });

  describe('completeOnboarding', () => {
    it('should complete onboarding and return celebration', async () => {
      const mockResponse = {
        output: 'Generated content',
        timeSavedMinutes: 15,
        noteId: 'note_123',
        celebrationMessage: 'Congratulations! You just saved ~15 minutes!',
        newTenantStatus: TenantStatus.ACTIVE,
      };

      mockOnboardingService.completeOnboarding.mockResolvedValue(mockResponse);

      const dto = {
        taskId: 'finance-email',
        userContext: 'Need Q4 summary',
        industry: 'FINANCE',
        generatedOutput: 'Generated content',
      };

      const result = await controller.completeOnboarding(dto, mockUser, 'corr_123');

      expect(result.data).toEqual(mockResponse);
      expect(result.data.celebrationMessage).toContain('saved');
      expect(result.data.newTenantStatus).toBe(TenantStatus.ACTIVE);
      expect(mockOnboardingService.completeOnboarding).toHaveBeenCalledWith(
        'tnt_123',
        'usr_456',
        dto.taskId,
        dto.generatedOutput,
        undefined
      );
    });
  });
});
