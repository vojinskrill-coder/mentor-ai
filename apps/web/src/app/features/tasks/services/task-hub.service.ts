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

  retryAllPending(): Observable<{ totalJobs: number; message: string }> {
    return this.http.post<{ totalJobs: number; message: string }>(
      '/api/v1/agent-execution/retry-all-pending', {}
    );
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
