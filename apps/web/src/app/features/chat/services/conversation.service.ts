import { Injectable, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../../environments/environment';
import type {
  Conversation,
  ConversationWithMessages,
  ConceptTreeData,
  PersonaType,
} from '@mentor-ai/shared/types';

interface ConversationsResponse {
  data: Conversation[];
}

interface ConversationResponse {
  data: ConversationWithMessages;
}

interface CreateConversationResponse {
  data: Conversation;
}

/**
 * Service for managing chat conversations via HTTP API.
 * All operations are tenant-scoped through the authentication token.
 */
@Injectable({ providedIn: 'root' })
export class ConversationService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/api/v1/conversations`;

  readonly isCreating$ = signal(false);

  /**
   * Creates a new conversation.
   * @param title - Optional conversation title
   * @param personaType - Optional persona type for department-specific AI responses
   * @returns Created conversation
   */
  async createConversation(
    title?: string,
    personaType?: PersonaType,
    conceptId?: string,
    curriculumId?: string
  ): Promise<Conversation> {
    this.isCreating$.set(true);
    try {
      const response = await firstValueFrom(
        this.http.post<CreateConversationResponse>(this.baseUrl, {
          title,
          personaType,
          conceptId,
          curriculumId,
        })
      );
      return response.data;
    } finally {
      this.isCreating$.set(false);
    }
  }

  /**
   * Updates the persona for a conversation.
   * @param conversationId - Conversation ID to update
   * @param personaType - New persona type
   * @returns Updated conversation
   */
  async updatePersona(conversationId: string, personaType: PersonaType): Promise<Conversation> {
    const response = await firstValueFrom(
      this.http.patch<CreateConversationResponse>(`${this.baseUrl}/${conversationId}/persona`, {
        personaType,
      })
    );
    return response.data;
  }

  /**
   * Lists all conversations for the current user.
   * @returns Array of conversations (without messages)
   */
  async getConversations(): Promise<Conversation[]> {
    const response = await firstValueFrom(this.http.get<ConversationsResponse>(this.baseUrl));
    return response.data;
  }

  /**
   * Gets a single conversation with all its messages.
   * @param conversationId - Conversation ID to retrieve
   * @returns Conversation with messages
   */
  async getConversation(conversationId: string): Promise<ConversationWithMessages> {
    const response = await firstValueFrom(
      this.http.get<ConversationResponse>(`${this.baseUrl}/${conversationId}`)
    );
    return response.data;
  }

  /**
   * Deletes a conversation and all its messages.
   * @param conversationId - Conversation ID to delete
   */
  async deleteConversation(conversationId: string): Promise<void> {
    await firstValueFrom(this.http.delete<void>(`${this.baseUrl}/${conversationId}`));
  }

  /**
   * Gets conversations grouped by concept category for tree display.
   */
  async getGroupedConversations(): Promise<ConceptTreeData> {
    const response = await firstValueFrom(
      this.http.get<{ data: ConceptTreeData }>(`${this.baseUrl}/grouped`)
    );
    return response.data;
  }

  /**
   * Gets the Business Brain tree — N-level hierarchy matching the Obsidian vault.
   * Filtered by user's department. Backend returns ConceptTreeData directly.
   */
  async getBrainTree(): Promise<ConceptTreeData> {
    const response = await firstValueFrom(
      this.http.get<{ data: ConceptTreeData }>(`${this.baseUrl}/brain-tree`)
    );
    return response.data;
  }
}
