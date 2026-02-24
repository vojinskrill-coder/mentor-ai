import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { OnboardingService } from './onboarding.service';
import { TenantStatus, Department } from '@mentor-ai/shared/types';

describe('OnboardingService (Frontend)', () => {
  let service: OnboardingService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), OnboardingService],
    });

    service = TestBed.inject(OnboardingService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getStatus', () => {
    it('should GET onboarding status', async () => {
      const mockStatus = {
        currentStep: 'industry-selection' as const,
        tenantStatus: TenantStatus.ONBOARDING,
        selectedIndustry: undefined,
        selectedTaskId: undefined,
        startedAt: undefined,
      };

      const promise = service.getStatus();

      const req = httpMock.expectOne('/api/onboarding/status');
      expect(req.request.method).toBe('GET');
      req.flush({ data: mockStatus });

      const result = await promise;
      expect(result).toEqual(mockStatus);
    });
  });

  describe('getAllTasks', () => {
    it('should GET all quick tasks', async () => {
      const mockTasks = [
        {
          id: 'finance-email',
          name: 'Draft a Financial Summary Email',
          description: 'Create a professional email',
          department: Department.FINANCE,
          estimatedTimeSaved: 15,
        },
      ];

      const promise = service.getAllTasks();

      const req = httpMock.expectOne('/api/onboarding/tasks');
      expect(req.request.method).toBe('GET');
      req.flush({ data: mockTasks });

      const result = await promise;
      expect(result).toEqual(mockTasks);
    });
  });

  describe('getTasksByIndustry', () => {
    it('should GET tasks for specific industry', async () => {
      const mockTasks = [
        {
          id: 'tech-memo',
          name: 'Write a Technical Decision Memo',
          description: 'Document a technical decision',
          department: Department.TECHNOLOGY,
          estimatedTimeSaved: 20,
        },
      ];

      const promise = service.getTasksByIndustry('TECHNOLOGY');

      const req = httpMock.expectOne('/api/onboarding/tasks/TECHNOLOGY');
      expect(req.request.method).toBe('GET');
      req.flush({ data: mockTasks });

      const result = await promise;
      expect(result).toEqual(mockTasks);
    });

    it('should encode industry parameter', async () => {
      const promise = service.getTasksByIndustry('TECHNOLOGY & ENGINEERING');

      const req = httpMock.expectOne('/api/onboarding/tasks/TECHNOLOGY%20%26%20ENGINEERING');
      expect(req.request.method).toBe('GET');
      req.flush({ data: [] });

      await promise;
    });
  });

  describe('executeQuickWin', () => {
    it('should POST quick win request', async () => {
      const mockResponse = {
        output: 'Generated content here',
        generationTimeMs: 2500,
        tokensUsed: 150,
      };

      const promise = service.executeQuickWin(
        'finance-email',
        'Need Q4 summary for board',
        'FINANCE'
      );

      const req = httpMock.expectOne('/api/onboarding/quick-win');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        taskId: 'finance-email',
        userContext: 'Need Q4 summary for board',
        industry: 'FINANCE',
      });
      req.flush({ data: mockResponse });

      const result = await promise;
      expect(result).toEqual(mockResponse);
    });
  });

  describe('completeOnboarding', () => {
    it('should POST complete onboarding request', async () => {
      const mockResponse = {
        celebrationMessage: 'Congratulations! Your workspace is ready!',
        welcomeConversationId: 'sess_welcome',
      };

      const promise = service.completeOnboarding('ANALYSE_BUSINESS', 'Generated content', 'MANUAL');

      const req = httpMock.expectOne('/api/onboarding/complete');
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({
        taskId: 'ANALYSE_BUSINESS',
        generatedOutput: 'Generated content',
        executionMode: 'MANUAL',
      });
      req.flush({ data: mockResponse });

      const result = await promise;
      expect(result).toEqual(mockResponse);
      expect(result.celebrationMessage).toContain('Congratulations');
    });
  });

  describe('error handling', () => {
    it('should propagate HTTP errors from getStatus', async () => {
      const promise = service.getStatus();

      const req = httpMock.expectOne('/api/onboarding/status');
      req.flush(
        { type: 'unauthorized', title: 'Unauthorized', status: 401, detail: 'Not authenticated' },
        { status: 401, statusText: 'Unauthorized' }
      );

      await expect(promise).rejects.toThrow();
    });

    it('should propagate HTTP errors from executeQuickWin', async () => {
      const promise = service.executeQuickWin('task-1', 'context', 'FINANCE');

      const req = httpMock.expectOne('/api/onboarding/quick-win');
      req.flush(
        { type: 'rate_limited', title: 'Rate Limited', status: 429, detail: 'Too many requests' },
        { status: 429, statusText: 'Too Many Requests' }
      );

      await expect(promise).rejects.toThrow();
    });
  });
});
