import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { PersonaSelectorComponent } from './persona-selector.component';
import { PersonasService } from './services/personas.service';
import type { Persona, PersonaType } from '@mentor-ai/shared/types';
import { vi, describe, it, expect, beforeEach } from 'vitest';

describe('PersonaSelectorComponent', () => {
  let component: PersonaSelectorComponent;
  let fixture: ComponentFixture<PersonaSelectorComponent>;
  let personasServiceSpy: {
    getPersonas: ReturnType<typeof vi.fn>;
  };

  const mockPersonas: Persona[] = [
    {
      id: 'prs_cfo001',
      type: 'CFO' as PersonaType,
      name: 'Chief Financial Officer',
      shortName: 'CFO',
      description: 'Financial expertise, ROI analysis',
      avatarUrl: '/assets/images/personas/cfo-avatar.svg',
      color: '#10B981',
    },
    {
      id: 'prs_cmo002',
      type: 'CMO' as PersonaType,
      name: 'Chief Marketing Officer',
      shortName: 'CMO',
      description: 'Marketing expertise, brand strategy',
      avatarUrl: '/assets/images/personas/cmo-avatar.svg',
      color: '#F59E0B',
    },
  ];

  beforeEach(async () => {
    personasServiceSpy = {
      getPersonas: vi.fn().mockResolvedValue(mockPersonas),
    };

    await TestBed.configureTestingModule({
      imports: [PersonaSelectorComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PersonasService, useValue: personasServiceSpy },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(PersonaSelectorComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load personas on init', async () => {
    await fixture.whenStable();
    fixture.detectChanges();

    expect(personasServiceSpy.getPersonas).toHaveBeenCalled();
    expect(component.personas$()).toEqual(mockPersonas);
  });

  it('should show loading state initially', () => {
    expect(component.isLoading$()).toBe(true);
  });

  it('should hide loading state after personas load', async () => {
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.isLoading$()).toBe(false);
  });

  it('should select persona when clicked', async () => {
    await fixture.whenStable();
    fixture.detectChanges();

    const testPersona = mockPersonas[0]!;
    const emitSpy = vi.spyOn(component.personaSelected, 'emit');
    component.selectPersona(testPersona);

    expect(component.selectedPersona$()).toEqual(testPersona);
    expect(emitSpy).toHaveBeenCalledWith(testPersona);
  });

  it('should clear selection when clearSelection is called', async () => {
    await fixture.whenStable();
    fixture.detectChanges();

    const testPersona = mockPersonas[0]!;
    component.selectPersona(testPersona);
    expect(component.selectedPersona$()).toEqual(testPersona);

    const emitSpy = vi.spyOn(component.personaSelected, 'emit');
    component.clearSelection();

    expect(component.selectedPersona$()).toBeNull();
    expect(emitSpy).toHaveBeenCalledWith(null);
  });

  it('should show error message on load failure', async () => {
    personasServiceSpy.getPersonas.mockRejectedValue(new Error('Network error'));

    fixture = TestBed.createComponent(PersonaSelectorComponent);
    component = fixture.componentInstance;
    await fixture.whenStable();
    fixture.detectChanges();

    expect(component.errorMessage$()).toBe('Failed to load personas');
  });

  it('should truncate long descriptions', () => {
    const longDescription =
      'This is a very long description that should be truncated because it exceeds the maximum length allowed for display';
    const result = component.getShortDescription(longDescription);

    expect(result.length).toBeLessThanOrEqual(50);
    expect(result.endsWith('...')).toBe(true);
  });

  it('should not truncate short descriptions', () => {
    const shortDescription = 'Short description';
    const result = component.getShortDescription(shortDescription);

    expect(result).toBe(shortDescription);
  });
});
