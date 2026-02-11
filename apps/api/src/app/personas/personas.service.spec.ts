import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PersonasService } from './personas.service';
import type { PersonaType } from '@mentor-ai/shared/types';

describe('PersonasService', () => {
  let service: PersonasService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PersonasService],
    }).compile();

    service = module.get<PersonasService>(PersonasService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPersonas', () => {
    it('should return all 8 personas', () => {
      const personas = service.getPersonas();

      expect(personas).toHaveLength(8);
    });

    it('should return personas with required properties', () => {
      const personas = service.getPersonas();

      personas.forEach((persona) => {
        expect(persona).toHaveProperty('id');
        expect(persona).toHaveProperty('type');
        expect(persona).toHaveProperty('name');
        expect(persona).toHaveProperty('shortName');
        expect(persona).toHaveProperty('description');
        expect(persona).toHaveProperty('avatarUrl');
        expect(persona).toHaveProperty('color');
      });
    });

    it('should return personas with prs_ prefix IDs', () => {
      const personas = service.getPersonas();

      personas.forEach((persona) => {
        expect(persona.id).toMatch(/^prs_/);
      });
    });

    it('should include all expected persona types', () => {
      const personas = service.getPersonas();
      const types = personas.map((p) => p.type);

      expect(types).toContain('CFO');
      expect(types).toContain('CMO');
      expect(types).toContain('CTO');
      expect(types).toContain('OPERATIONS');
      expect(types).toContain('LEGAL');
      expect(types).toContain('CREATIVE');
      expect(types).toContain('CSO');
      expect(types).toContain('SALES');
    });

    it('should return personas with valid hex colors', () => {
      const personas = service.getPersonas();

      personas.forEach((persona) => {
        expect(persona.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      });
    });
  });

  describe('getPersonaByType', () => {
    it('should return CFO persona', () => {
      const persona = service.getPersonaByType('CFO');

      expect(persona.type).toBe('CFO');
      expect(persona.name).toBe('Chief Financial Officer');
      expect(persona.shortName).toBe('CFO');
      expect(persona.id).toBe('prs_cfo001');
    });

    it('should return CMO persona', () => {
      const persona = service.getPersonaByType('CMO');

      expect(persona.type).toBe('CMO');
      expect(persona.name).toBe('Chief Marketing Officer');
    });

    it('should return CTO persona', () => {
      const persona = service.getPersonaByType('CTO');

      expect(persona.type).toBe('CTO');
      expect(persona.name).toBe('Chief Technology Officer');
    });

    it('should return OPERATIONS persona', () => {
      const persona = service.getPersonaByType('OPERATIONS');

      expect(persona.type).toBe('OPERATIONS');
      expect(persona.name).toBe('Chief Operations Officer');
    });

    it('should return LEGAL persona', () => {
      const persona = service.getPersonaByType('LEGAL');

      expect(persona.type).toBe('LEGAL');
      expect(persona.name).toBe('General Counsel');
    });

    it('should return CREATIVE persona', () => {
      const persona = service.getPersonaByType('CREATIVE');

      expect(persona.type).toBe('CREATIVE');
      expect(persona.name).toBe('Chief Creative Officer');
    });

    it('should throw NotFoundException for invalid type', () => {
      expect(() => service.getPersonaByType('INVALID')).toThrow(
        NotFoundException
      );
    });

    it('should throw NotFoundException with RFC 7807 format', () => {
      try {
        service.getPersonaByType('INVALID');
        fail('Should have thrown NotFoundException');
      } catch (error) {
        expect(error).toBeInstanceOf(NotFoundException);
        const response = (error as NotFoundException).getResponse() as Record<
          string,
          unknown
        >;
        expect(response.type).toBe('persona_not_found');
        expect(response.title).toBe('Persona Not Found');
        expect(response.status).toBe(404);
        expect(response.detail).toContain('INVALID');
      }
    });
  });

  describe('isValidPersonaType', () => {
    it('should return true for valid persona types', () => {
      expect(service.isValidPersonaType('CFO')).toBe(true);
      expect(service.isValidPersonaType('CMO')).toBe(true);
      expect(service.isValidPersonaType('CTO')).toBe(true);
      expect(service.isValidPersonaType('OPERATIONS')).toBe(true);
      expect(service.isValidPersonaType('LEGAL')).toBe(true);
      expect(service.isValidPersonaType('CREATIVE')).toBe(true);
      expect(service.isValidPersonaType('CSO')).toBe(true);
      expect(service.isValidPersonaType('SALES')).toBe(true);
    });

    it('should return false for invalid persona types', () => {
      expect(service.isValidPersonaType('INVALID')).toBe(false);
      expect(service.isValidPersonaType('')).toBe(false);
      expect(service.isValidPersonaType('cfo')).toBe(false); // case sensitive
    });
  });
});
