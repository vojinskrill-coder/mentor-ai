import { TestBed } from '@angular/core/testing';
import {
  HttpTestingController,
  provideHttpClientTesting,
} from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { PersonasService } from './personas.service';
import type { Persona, PersonaType } from '@mentor-ai/shared/types';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';

describe('PersonasService', () => {
  let service: PersonasService;
  let httpMock: HttpTestingController;

  const mockPersonas: Persona[] = [
    {
      id: 'prs_cfo001',
      type: 'CFO' as PersonaType,
      name: 'Chief Financial Officer',
      shortName: 'CFO',
      description: 'Financial expertise',
      avatarUrl: '/assets/images/personas/cfo-avatar.svg',
      color: '#10B981',
    },
    {
      id: 'prs_cmo002',
      type: 'CMO' as PersonaType,
      name: 'Chief Marketing Officer',
      shortName: 'CMO',
      description: 'Marketing expertise',
      avatarUrl: '/assets/images/personas/cmo-avatar.svg',
      color: '#F59E0B',
    },
  ];

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        PersonasService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });

    service = TestBed.inject(PersonasService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('getPersonas', () => {
    it('should fetch all personas', async () => {
      const promise = service.getPersonas();

      const req = httpMock.expectOne('/api/v1/personas');
      expect(req.request.method).toBe('GET');
      req.flush({ data: mockPersonas });

      const result = await promise;
      expect(result).toEqual(mockPersonas);
    });

    it('should handle empty response', async () => {
      const promise = service.getPersonas();

      const req = httpMock.expectOne('/api/v1/personas');
      req.flush({ data: [] });

      const result = await promise;
      expect(result).toEqual([]);
    });
  });

  describe('getPersonaByType', () => {
    it('should fetch specific persona by type', async () => {
      const promise = service.getPersonaByType('CFO' as PersonaType);

      const req = httpMock.expectOne('/api/v1/personas/CFO');
      expect(req.request.method).toBe('GET');
      req.flush({ data: mockPersonas[0] });

      const result = await promise;
      expect(result).toEqual(mockPersonas[0]);
    });

    it('should handle 404 error for invalid type', async () => {
      const promise = service.getPersonaByType('INVALID' as PersonaType);

      const req = httpMock.expectOne('/api/v1/personas/INVALID');
      req.flush(
        { type: 'persona_not_found', title: 'Persona Not Found', status: 404 },
        { status: 404, statusText: 'Not Found' }
      );

      await expect(promise).rejects.toThrow();
    });
  });
});
