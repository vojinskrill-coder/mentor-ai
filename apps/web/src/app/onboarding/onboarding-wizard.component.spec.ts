import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { OnboardingWizardComponent } from './onboarding-wizard.component';
import { OnboardingService } from './services/onboarding.service';
import { Department, TenantStatus } from '@mentor-ai/shared/types';

describe('OnboardingWizardComponent', () => {
  let component: OnboardingWizardComponent;
  let fixture: ComponentFixture<OnboardingWizardComponent>;
  let mockOnboardingService: {
    getStatus: ReturnType<typeof vi.fn>;
    getAllTasks: ReturnType<typeof vi.fn>;
    getTasksByIndustry: ReturnType<typeof vi.fn>;
    executeQuickWin: ReturnType<typeof vi.fn>;
    completeOnboarding: ReturnType<typeof vi.fn>;
  };
  let mockRouter: { navigate: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockOnboardingService = {
      getStatus: vi.fn(),
      getAllTasks: vi.fn(),
      getTasksByIndustry: vi.fn(),
      executeQuickWin: vi.fn(),
      completeOnboarding: vi.fn(),
    };

    mockRouter = {
      navigate: vi.fn(),
    };

    mockOnboardingService.getStatus.mockResolvedValue({
      currentStep: 1,
      tenantStatus: TenantStatus.ONBOARDING,
    });

    await TestBed.configureTestingModule({
      imports: [OnboardingWizardComponent],
      providers: [
        { provide: OnboardingService, useValue: mockOnboardingService },
        { provide: Router, useValue: mockRouter },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(OnboardingWizardComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should start at step 1', () => {
    expect(component.currentStep$()).toBe(1);
  });

  describe('industry selection', () => {
    it('should select industry when clicked', () => {
      component.selectIndustry('FINANCE');
      expect(component.selectedIndustry$()).toBe('FINANCE');
    });

    it('should reset task selection when industry changes', () => {
      component.selectIndustry('FINANCE');
      component.selectedTask$.set({
        id: 'finance-email',
        name: 'Test',
        description: 'Test',
        department: Department.FINANCE,
        estimatedTimeSaved: 15,
      });
      component.selectIndustry('MARKETING');
      expect(component.selectedTask$()).toBeNull();
    });

    it('should enable continue button when industry selected', () => {
      expect(component.canProceed$()).toBe(false);
      component.selectIndustry('FINANCE');
      expect(component.canProceed$()).toBe(true);
    });
  });

  describe('wizard navigation', () => {
    it('should advance to step 2 after selecting industry', async () => {
      mockOnboardingService.getTasksByIndustry.mockResolvedValue([
        {
          id: 'finance-email',
          name: 'Draft Email',
          description: 'Test',
          department: Department.FINANCE,
          estimatedTimeSaved: 15,
        },
      ]);

      component.selectIndustry('FINANCE');
      await component.nextStep();

      expect(component.currentStep$()).toBe(2);
      expect(component.availableTasks$().length).toBeGreaterThan(0);
    });

    it('should go back to previous step', async () => {
      mockOnboardingService.getTasksByIndustry.mockResolvedValue([]);
      component.selectIndustry('FINANCE');
      await component.nextStep();

      component.previousStep();

      expect(component.currentStep$()).toBe(1);
    });
  });

  describe('task selection', () => {
    it('should select task when clicked', () => {
      const task = {
        id: 'finance-email',
        name: 'Draft Email',
        description: 'Test',
        department: Department.FINANCE,
        estimatedTimeSaved: 15,
      };

      component.selectTask(task);

      expect(component.selectedTask$()).toEqual(task);
    });
  });

  describe('output generation', () => {
    it('should generate output when clicking generate button', async () => {
      mockOnboardingService.executeQuickWin.mockResolvedValue({
        output: 'Generated content',
        generationTimeMs: 2500,
        tokensUsed: 150,
      });

      component.selectIndustry('FINANCE');
      component.selectedTask$.set({
        id: 'finance-email',
        name: 'Test',
        description: 'Test',
        department: Department.FINANCE,
        estimatedTimeSaved: 15,
      });
      component.userContext = 'Need Q4 summary';

      await component.generateOutput();

      expect(component.generatedOutput$()).toBe('Generated content');
      expect(component.generationTimeMs$()).toBe(2500);
      expect(component.isGenerating$()).toBe(false);
    });

    it('should not generate if task not selected', async () => {
      component.selectIndustry('FINANCE');
      component.userContext = 'Context';

      await component.generateOutput();

      expect(mockOnboardingService.executeQuickWin).not.toHaveBeenCalled();
    });
  });

  describe('completion', () => {
    it('should complete onboarding and show celebration', async () => {
      mockOnboardingService.completeOnboarding.mockResolvedValue({
        output: 'Output',
        timeSavedMinutes: 15,
        celebrationMessage: 'Congratulations! You just saved ~15 minutes!',
        newTenantStatus: TenantStatus.ACTIVE,
      });

      component.selectIndustry('FINANCE');
      component.selectedTask$.set({
        id: 'finance-email',
        name: 'Test',
        description: 'Test',
        department: Department.FINANCE,
        estimatedTimeSaved: 15,
      });
      component.userContext = 'Context';
      component.generatedOutput$.set('Generated output');

      await component.saveAndComplete();

      expect(component.showCelebration$()).toBe(true);
      expect(component.celebrationMessage$()).toContain('saved');
    });

    it('should navigate to dashboard after completion', () => {
      component.goToDashboard();

      expect(mockRouter.navigate).toHaveBeenCalledWith(['/chat']);
    });
  });

  describe('formatTime', () => {
    it('should format milliseconds to seconds', () => {
      expect(component.formatTime(5000)).toBe('5s');
    });

    it('should format milliseconds to minutes:seconds', () => {
      expect(component.formatTime(65000)).toBe('1:05');
    });
  });

  describe('formatIndustry', () => {
    it('should capitalize first letter only', () => {
      expect(component.formatIndustry('FINANCE')).toBe('Finance');
      expect(component.formatIndustry('MARKETING')).toBe('Marketing');
    });
  });
});
