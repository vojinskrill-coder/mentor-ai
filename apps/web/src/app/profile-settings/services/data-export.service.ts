import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import type { Observable } from 'rxjs';
import type { DataExportRequest, DataExportResponse } from '@mentor-ai/shared/types';

interface ApiSuccessResponse<T> {
  data: T;
  message?: string;
}

@Injectable({ providedIn: 'root' })
export class DataExportService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/v1/data-export';

  requestExport(request: DataExportRequest): Observable<ApiSuccessResponse<DataExportResponse>> {
    return this.http.post<ApiSuccessResponse<DataExportResponse>>(this.baseUrl, request);
  }

  getExportStatus(): Observable<ApiSuccessResponse<DataExportResponse[]>> {
    return this.http.get<ApiSuccessResponse<DataExportResponse[]>>(`${this.baseUrl}/status`);
  }

  getDownloadUrl(exportId: string): string {
    return `${this.baseUrl}/${exportId}/download`;
  }
}
