import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type {
  AgentExecutionResponse,
  AgentType,
  JobsForNoteResponse,
  JobExecuteResponse,
} from '@mentor-ai/shared/types';

interface DataResponse<T> {
  data: T;
}

@Injectable({ providedIn: 'root' })
export class AgentExecutionApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/api/v1/agent-execution`;

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

  async getJobsForNote(noteId: string): Promise<JobsForNoteResponse> {
    const response = await firstValueFrom(
      this.http.get<DataResponse<JobsForNoteResponse>>(`${this.baseUrl}/jobs/${noteId}`)
    );
    return response.data;
  }

  async executeJob(jobId: string): Promise<JobExecuteResponse> {
    const response = await firstValueFrom(
      this.http.post<DataResponse<JobExecuteResponse>>(`${this.baseUrl}/jobs/${jobId}/execute`, {})
    );
    return response.data;
  }

  async retryJob(jobId: string): Promise<JobExecuteResponse> {
    const response = await firstValueFrom(
      this.http.post<DataResponse<JobExecuteResponse>>(`${this.baseUrl}/jobs/${jobId}/retry`, {})
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
