import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { PersonasController } from './personas.controller';
import { PersonasService } from './personas.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MfaRequiredGuard } from '../auth/guards/mfa-required.guard';
import type { Persona, PersonaType } from '@mentor-ai/shared/types';

describe('PersonasController', () => {
  let controller: PersonasController;
  let personasService: PersonasService;

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

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [PersonasController],
      providers: [
        {
          provide: PersonasService,
          useValue: {
            getPersonas: jest.fn().mockReturnValue(mockPersonas),
            getPersonaByType: jest.fn().mockImplementation((type: string) => {
              const persona = mockPersonas.find((p) => p.type === type);
              if (!persona) {
                throw new NotFoundException({
                  type: 'persona_not_found',
                  title: 'Persona Not Found',
                  status: 404,
                  detail: `Persona with type '${type}' not found`,
                });
              }
              return persona;
            }),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(MfaRequiredGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<PersonasController>(PersonasController);
    personasService = module.get<PersonasService>(PersonasService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getPersonas', () => {
    it('should return all personas', () => {
      const result = controller.getPersonas();

      expect(result.data).toEqual(mockPersonas);
      expect(personasService.getPersonas).toHaveBeenCalled();
    });

    it('should return data wrapped in response object', () => {
      const result = controller.getPersonas();

      expect(result).toHaveProperty('data');
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  describe('getPersonaByType', () => {
    it('should return CFO persona', () => {
      const result = controller.getPersonaByType('CFO');

      expect(result.data.type).toBe('CFO');
      expect(personasService.getPersonaByType).toHaveBeenCalledWith('CFO');
    });

    it('should convert type to uppercase', () => {
      controller.getPersonaByType('cfo');

      expect(personasService.getPersonaByType).toHaveBeenCalledWith('CFO');
    });

    it('should return data wrapped in response object', () => {
      const result = controller.getPersonaByType('CFO');

      expect(result).toHaveProperty('data');
      expect(result.data).toHaveProperty('type');
    });

    it('should throw NotFoundException for invalid type', () => {
      expect(() => controller.getPersonaByType('INVALID')).toThrow(
        NotFoundException
      );
    });
  });
});
