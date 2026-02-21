import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type {
  OnboardingStatus,
  QuickTask,
  QuickWinResponse,
  OnboardingCompleteResponse,
} from '@mentor-ai/shared/types';

/**
 * Service for interacting with the onboarding API.
 * Handles the quick win wizard flow for new users.
 */
@Injectable({ providedIn: 'root' })
export class OnboardingService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/onboarding';

  /**
   * Saves company details during onboarding step 1.
   */
  async setupCompany(
    companyName: string,
    industry: string,
    description?: string,
    websiteUrl?: string
  ): Promise<void> {
    await firstValueFrom(
      this.http.post(`${this.baseUrl}/setup-company`, {
        companyName,
        industry,
        description,
        websiteUrl,
      })
    );
  }

  /**
   * Gets the current onboarding status for the user.
   */
  async getStatus(): Promise<OnboardingStatus> {
    const response = await firstValueFrom(
      this.http.get<{ data: OnboardingStatus }>(`${this.baseUrl}/status`)
    );
    return response.data;
  }

  /**
   * Generates AI-powered business analysis.
   */
  async analyseBusiness(
    businessState: string,
    departments: string[],
    strategy: string
  ): Promise<{ output: string; generationTimeMs: number }> {
    const response = await firstValueFrom(
      this.http.post<{ data: { output: string; generationTimeMs: number } }>(
        `${this.baseUrl}/analyse-business`,
        { businessState, departments, strategy }
      )
    );
    return response.data;
  }

  /**
   * Auto-generates personalized tasks and focus areas.
   */
  async createBusinessBrain(
    businessState: string,
    departments: string[],
    strategy: string
  ): Promise<{ output: string; generationTimeMs: number }> {
    const response = await firstValueFrom(
      this.http.post<{ data: { output: string; generationTimeMs: number } }>(
        `${this.baseUrl}/create-business-brain`,
        { businessState, departments, strategy }
      )
    );
    return response.data;
  }

  /**
   * Saves the user's department/role selection (Story 3.2).
   */
  async setDepartment(department: string | null): Promise<void> {
    await firstValueFrom(this.http.patch(`${this.baseUrl}/set-department`, { department }));
  }

  /**
   * Completes onboarding, saves the note, and transitions tenant to ACTIVE.
   */
  async completeOnboarding(
    taskId: string,
    generatedOutput: string,
    executionMode?: string
  ): Promise<OnboardingCompleteResponse> {
    const response = await firstValueFrom(
      this.http.post<{ data: OnboardingCompleteResponse }>(`${this.baseUrl}/complete`, {
        taskId,
        generatedOutput,
        executionMode,
      })
    );
    return response.data;
  }

  /**
   * Uploads a PDF brochure and returns extracted text.
   */
  async uploadBrochure(file: File): Promise<{ extractedText: string }> {
    const formData = new FormData();
    formData.append('brochure', file);
    const response = await firstValueFrom(
      this.http.post<{ data: { extractedText: string } }>(
        `${this.baseUrl}/upload-brochure`,
        formData
      )
    );
    return response.data;
  }

  /**
   * Gets all available quick tasks.
   */
  async getAllTasks(): Promise<QuickTask[]> {
    const response = await firstValueFrom(
      this.http.get<{ data: QuickTask[] }>(`${this.baseUrl}/tasks`)
    );
    return response.data;
  }

  /**
   * Gets quick tasks filtered by industry.
   */
  async getTasksByIndustry(industry: string): Promise<QuickTask[]> {
    const response = await firstValueFrom(
      this.http.get<{ data: QuickTask[] }>(`${this.baseUrl}/tasks/${encodeURIComponent(industry)}`)
    );
    return response.data;
  }

  /**
   * Executes a quick win task using AI.
   */
  async executeQuickWin(
    taskId: string,
    userContext: string,
    industry: string
  ): Promise<QuickWinResponse> {
    const response = await firstValueFrom(
      this.http.post<{ data: QuickWinResponse }>(`${this.baseUrl}/quick-win`, {
        taskId,
        userContext,
        industry,
      })
    );
    return response.data;
  }
}
