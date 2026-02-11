import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MfaRequiredGuard } from '../auth/guards/mfa-required.guard';
import { PersonasService } from './personas.service';
import type { Persona } from '@mentor-ai/shared/types';

/**
 * Controller for persona-related API endpoints.
 * All endpoints require authentication and MFA verification.
 */
@Controller('v1/personas')
@UseGuards(JwtAuthGuard, MfaRequiredGuard)
export class PersonasController {
  constructor(private readonly personasService: PersonasService) {}

  /**
   * GET /api/v1/personas
   * Retrieves all available department personas.
   * @returns Array of all persona definitions
   */
  @Get()
  getPersonas(): { data: Persona[] } {
    const personas = this.personasService.getPersonas();
    return { data: personas };
  }

  /**
   * GET /api/v1/personas/:type
   * Retrieves a specific persona by type.
   * @param type - Persona type (CFO, CMO, CTO, OPERATIONS, LEGAL, CREATIVE)
   * @returns Single persona definition
   * @throws NotFoundException if type is invalid
   */
  @Get(':type')
  getPersonaByType(@Param('type') type: string): { data: Persona } {
    const persona = this.personasService.getPersonaByType(type.toUpperCase());
    return { data: persona };
  }
}
