import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type {
  NoteItem,
  NoteType,
  NoteStatus,
  CommentItem,
  CommentListResponse,
} from '@mentor-ai/shared/types';

interface NotesResponse {
  data: NoteItem[];
}

interface NoteResponse {
  data: NoteItem;
}

@Injectable({ providedIn: 'root' })
export class NotesApiService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/api/v1/notes`;

  /** Last error message for UI display */
  readonly lastError$ = signal<string | null>(null);

  async getByConversation(conversationId: string): Promise<NoteItem[]> {
    const response = await firstValueFrom(
      this.http.get<NotesResponse>(`${this.baseUrl}/conversation/${conversationId}`)
    );
    return response.data;
  }

  async getByConcept(conceptId: string): Promise<NoteItem[]> {
    const response = await firstValueFrom(
      this.http.get<NotesResponse>(`${this.baseUrl}/concept/${conceptId}`)
    );
    return response.data;
  }

  async getByConceptIds(conceptIds: string[]): Promise<NoteItem[]> {
    let failCount = 0;
    const results = await Promise.all(
      conceptIds.map((id) =>
        this.getByConcept(id).catch(() => {
          failCount++;
          return [];
        })
      )
    );
    if (failCount > 0) {
      this.lastError$.set(`Greška pri učitavanju beleški (${failCount} od ${conceptIds.length})`);
    }
    return results.flat();
  }

  async getByConversationIds(conversationIds: string[]): Promise<NoteItem[]> {
    let failCount = 0;
    const results = await Promise.all(
      conversationIds.map((id) =>
        this.getByConversation(id).catch(() => {
          failCount++;
          return [];
        })
      )
    );
    if (failCount > 0) {
      this.lastError$.set(
        `Greška pri učitavanju beleški (${failCount} od ${conversationIds.length})`
      );
    }
    return results.flat();
  }

  async createNote(data: {
    title: string;
    content: string;
    noteType?: NoteType;
    conversationId?: string;
    conceptId?: string;
  }): Promise<NoteItem> {
    const response = await firstValueFrom(this.http.post<NoteResponse>(this.baseUrl, data));
    return response.data;
  }

  async updateStatus(noteId: string, status: NoteStatus): Promise<NoteItem> {
    const response = await firstValueFrom(
      this.http.patch<NoteResponse>(`${this.baseUrl}/${noteId}/status`, { status })
    );
    return response.data;
  }

  async updateNote(noteId: string, title: string, content: string): Promise<NoteItem> {
    const response = await firstValueFrom(
      this.http.patch<NoteResponse>(`${this.baseUrl}/${noteId}`, { title, content })
    );
    return response.data;
  }

  async submitReport(noteId: string, report: string): Promise<NoteItem> {
    const response = await firstValueFrom(
      this.http.post<NoteResponse>(`${this.baseUrl}/${noteId}/report`, { report })
    );
    return response.data;
  }

  async generateReport(noteId: string): Promise<string> {
    const response = await firstValueFrom(
      this.http.post<{ data: { report: string } }>(`${this.baseUrl}/${noteId}/generate-report`, {})
    );
    return response.data.report;
  }

  async scoreReport(noteId: string): Promise<NoteItem> {
    const response = await firstValueFrom(
      this.http.post<NoteResponse>(`${this.baseUrl}/${noteId}/score`, {})
    );
    return response.data;
  }

  async deleteNote(noteId: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${this.baseUrl}/${noteId}`));
  }

  // ── Comment endpoints ──

  async getComments(taskId: string, page = 1, limit = 50): Promise<CommentListResponse> {
    const response = await firstValueFrom(
      this.http.get<{ data: CommentListResponse }>(
        `${this.baseUrl}/${taskId}/comments?page=${page}&limit=${limit}`
      )
    );
    return response.data;
  }

  async createComment(taskId: string, content: string): Promise<CommentItem> {
    const response = await firstValueFrom(
      this.http.post<{ data: CommentItem }>(`${this.baseUrl}/${taskId}/comments`, { content })
    );
    return response.data;
  }

  async updateComment(commentId: string, content: string): Promise<CommentItem> {
    const response = await firstValueFrom(
      this.http.patch<{ data: CommentItem }>(`${this.baseUrl}/${commentId}/comment`, { content })
    );
    return response.data;
  }

  async deleteComment(commentId: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${this.baseUrl}/${commentId}/comment`));
  }
}
