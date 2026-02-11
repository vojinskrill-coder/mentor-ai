import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type { NoteItem, NoteType, NoteStatus } from '@mentor-ai/shared/types';

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
    const results = await Promise.all(
      conceptIds.map(id => this.getByConcept(id).catch(() => []))
    );
    return results.flat();
  }

  async getByConversationIds(conversationIds: string[]): Promise<NoteItem[]> {
    const results = await Promise.all(
      conversationIds.map(id => this.getByConversation(id).catch(() => []))
    );
    return results.flat();
  }

  async createNote(data: {
    title: string;
    content: string;
    noteType?: NoteType;
    conversationId?: string;
    conceptId?: string;
  }): Promise<NoteItem> {
    const response = await firstValueFrom(
      this.http.post<NoteResponse>(this.baseUrl, data)
    );
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

  async scoreReport(noteId: string): Promise<NoteItem> {
    const response = await firstValueFrom(
      this.http.post<NoteResponse>(`${this.baseUrl}/${noteId}/score`, {})
    );
    return response.data;
  }

  async deleteNote(noteId: string): Promise<void> {
    await firstValueFrom(
      this.http.delete<void>(`${this.baseUrl}/${noteId}`)
    );
  }
}
