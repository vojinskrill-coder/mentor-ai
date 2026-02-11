import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import type { Persona, PersonaType } from '@mentor-ai/shared/types';

/**
 * Response wrapper for persona list
 */
interface PersonasResponse {
  data: Persona[];
}

/**
 * Response wrapper for single persona
 */
interface PersonaResponse {
  data: Persona;
}

/**
 * Service for interacting with the Personas API.
 * Provides methods to fetch and manage department personas.
 */
@Injectable({ providedIn: 'root' })
export class PersonasService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/api/v1/personas';

  /**
   * Fetches all available personas.
   * @returns Promise resolving to array of persona definitions
   */
  async getPersonas(): Promise<Persona[]> {
    const response = await firstValueFrom(
      this.http.get<PersonasResponse>(this.baseUrl)
    );
    return response.data;
  }

  /**
   * Fetches a specific persona by type.
   * @param type - PersonaType string (CFO, CMO, CTO, etc.)
   * @returns Promise resolving to single persona definition
   */
  async getPersonaByType(type: PersonaType): Promise<Persona> {
    const response = await firstValueFrom(
      this.http.get<PersonaResponse>(`${this.baseUrl}/${type}`)
    );
    return response.data;
  }
}
