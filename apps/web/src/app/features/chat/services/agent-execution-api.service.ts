import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type {
  AgentExecutionResponse,
  AgentRecommendationsResponse,
  AgentType,
} from '@mentor-ai/shared/types';

interface DataResponse<T> {
  data: T;
}

@Injectable({ providedIn: 'root' })
export class AgentExecutionApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/api/v1/agent-execution`;

  async getRecommendations(noteId: string): Promise<AgentRecommendationsResponse> {
    const response = await firstValueFrom(
      this.http.get<DataResponse<AgentRecommendationsResponse>>(
        `${this.baseUrl}/recommendations/${noteId}`
      )
    );
    return response.data;
  }

  async triggerAgent(noteId: string, agentType: AgentType): Promise<{ executionId: string }> {
    const response = await firstValueFrom(
      this.http.post<DataResponse<{ executionId: string }>>(
        `${this.baseUrl}/trigger/${noteId}/${agentType}`,
        {}
      )
    );
    return response.data;
  }

  async getExecution(executionId: string): Promise<AgentExecutionResponse> {
    const response = await firstValueFrom(
      this.http.get<DataResponse<AgentExecutionResponse>>(`${this.baseUrl}/${executionId}`)
    );
    return response.data;
  }

  async getExecutionsByNote(noteId: string): Promise<AgentExecutionResponse[]> {
    const response = await firstValueFrom(
      this.http.get<DataResponse<AgentExecutionResponse[]>>(`${this.baseUrl}/note/${noteId}`)
    );
    return response.data;
  }

  async getTodaysBudget(): Promise<{ spentEur: number; limitEur: number }> {
    const response = await firstValueFrom(
      this.http.get<DataResponse<{ spentEur: number; limitEur: number }>>(
        `${this.baseUrl}/budget/today`
      )
    );
    return response.data;
  }
}
