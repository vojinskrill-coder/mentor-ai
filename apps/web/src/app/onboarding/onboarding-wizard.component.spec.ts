import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { OnboardingWizardComponent } from './onboarding-wizard.component';
import { OnboardingService } from './services/onboarding.service';
import { TenantStatus } from '@mentor-ai/shared/types';

describe('OnboardingWizardComponent', () => {
  let component: OnboardingWizardComponent;
  let fixture: ComponentFixture<OnboardingWizardComponent>;
  let mockOnboardingService: {
    getStatus: ReturnType<typeof vi.fn>;
    setupCompany: ReturnType<typeof vi.fn>;
    analyseBusiness: ReturnType<typeof vi.fn>;
    createBusinessBrain: ReturnType<typeof vi.fn>;
    setDepartment: ReturnType<typeof vi.fn>;
    completeOnboarding: ReturnType<typeof vi.fn>;
    uploadBrochure: ReturnType<typeof vi.fn>;
    getAllTasks: ReturnType<typeof vi.fn>;
    getTasksByIndustry: ReturnType<typeof vi.fn>;
    executeQuickWin: ReturnType<typeof vi.fn>;
  };
  let mockRouter: { navigate: ReturnType<typeof vi.fn> };

  beforeEach(async () => {
    mockOnboardingService = {
      getStatus: vi.fn().mockResolvedValue({
        currentStep: 'industry-selection',
        tenantStatus: TenantStatus.ONBOARDING,
      }),
      setupCompany: vi.fn().mockResolvedValue(undefined),
      analyseBusiness: vi.fn(),
      createBusinessBrain: vi.fn(),
      setDepartment: vi.fn().mockResolvedValue(undefined),
      completeOnboarding: vi.fn(),
      uploadBrochure: vi.fn(),
      getAllTasks: vi.fn().mockResolvedValue([]),
      getTasksByIndustry: vi.fn().mockResolvedValue([]),
      executeQuickWin: vi.fn(),
    };

    mockRouter = {
      navigate: vi.fn(),
    };

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

    it('should not enable continue without company name', () => {
      component.selectIndustry('FINANCE');
      component.companyName$.set('');
      expect(component.canProceed$()).toBe(false);
    });

    it('should enable continue when industry and company name are set', () => {
      component.selectIndustry('FINANCE');
      component.companyName$.set('Test Company');
      expect(component.canProceed$()).toBe(true);
    });
  });

  describe('strategy selection', () => {
    it('should select strategy', () => {
      component.selectStrategy('ANALYSE_BUSINESS');
      expect(component.selectedStrategy$()).toBe('ANALYSE_BUSINESS');
    });

    it('should select user role', () => {
      component.selectUserRole('OWNER');
      expect(component.selectedUserRole$()).toBe('OWNER');
    });
  });

  describe('wizard navigation', () => {
    it('should advance to step 2 after setting company and industry', async () => {
      component.companyName$.set('Test Corp');
      component.selectIndustry('FINANCE');

      await component.nextStep();

      expect(component.currentStep$()).toBe(2);
      expect(mockOnboardingService.setupCompany).toHaveBeenCalledWith(
        'Test Corp',
        'FINANCE',
        undefined,
        undefined
      );
    });

    it('should go back to previous step', async () => {
      component.companyName$.set('Test Corp');
      component.selectIndustry('FINANCE');
      await component.nextStep();

      component.previousStep();

      expect(component.currentStep$()).toBe(1);
    });
  });

  describe('department selection', () => {
    it('should toggle department', () => {
      component.toggleDepartment('FINANCE');
      expect(component.selectedDepartments$().has('FINANCE')).toBe(true);

      component.toggleDepartment('FINANCE');
      expect(component.selectedDepartments$().has('FINANCE')).toBe(false);
    });
  });

  describe('output generation', () => {
    it('should generate output with analyse strategy', async () => {
      mockOnboardingService.analyseBusiness.mockResolvedValue({
        output: 'Generated analysis',
        generationTimeMs: 3000,
      });

      component.selectStrategy('ANALYSE_BUSINESS');
      component.businessState$.set('Our company is growing');
      component.toggleDepartment('FINANCE');

      await component.generateOutput();

      expect(component.generatedOutput$()).toBe('Generated analysis');
      expect(component.generationTimeMs$()).toBe(3000);
      expect(component.isGenerating$()).toBe(false);
    });

    it('should not generate without strategy', async () => {
      component.businessState$.set('State');
      component.toggleDepartment('FINANCE');

      await component.generateOutput();

      expect(mockOnboardingService.analyseBusiness).not.toHaveBeenCalled();
    });

    it('should not generate without business state', async () => {
      component.selectStrategy('ANALYSE_BUSINESS');
      component.toggleDepartment('FINANCE');

      await component.generateOutput();

      expect(mockOnboardingService.analyseBusiness).not.toHaveBeenCalled();
    });

    it('should not generate without departments selected', async () => {
      component.selectStrategy('ANALYSE_BUSINESS');
      component.businessState$.set('State');

      await component.generateOutput();

      expect(mockOnboardingService.analyseBusiness).not.toHaveBeenCalled();
    });
  });

  describe('completion', () => {
    it('should complete onboarding and show celebration', async () => {
      mockOnboardingService.completeOnboarding.mockResolvedValue({
        celebrationMessage: 'Congratulations! Your workspace is ready!',
        welcomeConversationId: 'sess_welcome',
      });

      component.selectStrategy('ANALYSE_BUSINESS');
      component.generatedOutput$.set('Generated output');

      await component.saveAndComplete();

      expect(component.showCelebration$()).toBe(true);
      expect(component.celebrationMessage$()).toContain('Congratulations');
    });

    it('should navigate to chat after completion', () => {
      component.goToChat();

      expect(mockRouter.navigate).toHaveBeenCalledWith(
        ['/chat'],
        expect.objectContaining({ queryParams: expect.any(Object) })
      );
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

  describe('formatDepartment', () => {
    it('should capitalize first letter only', () => {
      expect(component.formatDepartment('FINANCE')).toBe('Finance');
      expect(component.formatDepartment('MARKETING')).toBe('Marketing');
    });
  });
});
