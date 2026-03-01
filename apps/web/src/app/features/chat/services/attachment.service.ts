import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import type { AttachmentItem } from '@mentor-ai/shared/types';

@Injectable({ providedIn: 'root' })
export class AttachmentService {
  private http = inject(HttpClient);

  upload(file: File): Observable<AttachmentItem> {
    const formData = new FormData();
    formData.append('file', file);
    return this.http.post<AttachmentItem>('/api/v1/attachments/upload', formData);
  }

  getFileUrl(attachmentId: string): string {
    return `/api/v1/attachments/${attachmentId}/file`;
  }
}
