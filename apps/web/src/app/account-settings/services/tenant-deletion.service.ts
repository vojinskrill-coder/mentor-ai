import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type {
  TenantDeletionRequest,
  TenantDeletionResponse,
  TenantDeletionStatusResponse,
} from '@mentor-ai/shared/types';

interface ApiResponse<T> {
  data: T;
  message?: string;
}

@Injectable({
  providedIn: 'root',
})
export class TenantDeletionService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/v1/tenant/deletion';

  requestDeletion(workspaceName: string): Observable<TenantDeletionResponse> {
    const body: TenantDeletionRequest = { workspaceName };
    return this.http.post<TenantDeletionResponse>(this.baseUrl, body);
  }

  cancelDeletion(): Observable<ApiResponse<TenantDeletionStatusResponse>> {
    return this.http.post<ApiResponse<TenantDeletionStatusResponse>>(
      `${this.baseUrl}/cancel`,
      {}
    );
  }

  getDeletionStatus(): Observable<ApiResponse<TenantDeletionStatusResponse>> {
    return this.http.get<ApiResponse<TenantDeletionStatusResponse>>(
      `${this.baseUrl}/status`
    );
  }
}
