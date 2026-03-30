import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { TaskHubResponse } from '@mentor-ai/shared/types';

export interface TaskHubQuery {
  status?: string;
  category?: string;
  search?: string;
  hasJobs?: boolean;
  page?: number;
  limit?: number;
}

@Injectable({ providedIn: 'root' })
export class TaskHubService {
  private readonly http = inject(HttpClient);

  stopAllAgents(): Observable<{ stoppedExecutions: number; stoppedJobs: number }> {
    return this.http.post<{ stoppedExecutions: number; stoppedJobs: number }>(
      '/api/v1/agent-execution/stop-all', {}
    );
  }

  retryJob(jobId: string): Observable<{ data: { jobId: string; executionId: string } }> {
    return this.http.post<{ data: { jobId: string; executionId: string } }>(
      `/api/v1/agent-execution/jobs/${jobId}/retry`, {}
    );
  }

  retryAllPending(): Observable<{ totalJobs: number; message: string }> {
    return this.http.post<{ totalJobs: number; message: string }>(
      '/api/v1/agent-execution/retry-all-pending', {}
    );
  }

  executeAction(noteId: string, agentType: string, actionId: string): Observable<{ success: boolean }> {
    return this.http.post<{ success: boolean }>('/api/v1/notes/actions/execute', {
      noteId, agentType, actionId,
    });
  }

  getTasks(query: TaskHubQuery = {}): Observable<{ data: TaskHubResponse }> {
    let params = new HttpParams();
    if (query.status) params = params.set('status', query.status);
    if (query.category) params = params.set('category', query.category);
    if (query.search) params = params.set('search', query.search);
    if (query.hasJobs) params = params.set('hasJobs', 'true');
    if (query.page) params = params.set('page', query.page.toString());
    if (query.limit) params = params.set('limit', query.limit.toString());

    return this.http.get<{ data: TaskHubResponse }>('/api/v1/notes/tasks', { params });
  }
}
