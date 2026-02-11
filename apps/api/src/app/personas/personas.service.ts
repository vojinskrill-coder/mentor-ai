import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  PERSONA_COLORS,
  PERSONA_NAMES,
  PersonaType,
  type Persona,
} from '@mentor-ai/shared/types';

/**
 * Static persona definitions with prs_ prefix IDs.
 * These are predefined personas representing C-suite and department leads.
 * Colors and names are sourced from shared constants for consistency.
 */
const PERSONAS: Record<string, Persona> = {
  CFO: {
    id: 'prs_cfo001',
    type: PersonaType.CFO,
    name: 'Chief Financial Officer',
    shortName: PERSONA_NAMES[PersonaType.CFO],
    description:
      'Financial strategy, budgeting, forecasting, ROI analysis, and fiscal responsibility',
    avatarUrl: '/assets/images/personas/cfo-avatar.svg',
    color: PERSONA_COLORS[PersonaType.CFO],
  },
  CMO: {
    id: 'prs_cmo002',
    type: PersonaType.CMO,
    name: 'Chief Marketing Officer',
    shortName: PERSONA_NAMES[PersonaType.CMO],
    description:
      'Brand strategy, marketing campaigns, growth initiatives, and customer acquisition',
    avatarUrl: '/assets/images/personas/cmo-avatar.svg',
    color: PERSONA_COLORS[PersonaType.CMO],
  },
  CTO: {
    id: 'prs_cto003',
    type: PersonaType.CTO,
    name: 'Chief Technology Officer',
    shortName: PERSONA_NAMES[PersonaType.CTO],
    description:
      'Technical architecture, software development, infrastructure, and technology strategy',
    avatarUrl: '/assets/images/personas/cto-avatar.svg',
    color: PERSONA_COLORS[PersonaType.CTO],
  },
  OPERATIONS: {
    id: 'prs_ops004',
    type: PersonaType.OPERATIONS,
    name: 'Chief Operations Officer',
    shortName: PERSONA_NAMES[PersonaType.OPERATIONS],
    description:
      'Process optimization, operational efficiency, supply chain, and resource management',
    avatarUrl: '/assets/images/personas/operations-avatar.svg',
    color: PERSONA_COLORS[PersonaType.OPERATIONS],
  },
  LEGAL: {
    id: 'prs_leg005',
    type: PersonaType.LEGAL,
    name: 'General Counsel',
    shortName: PERSONA_NAMES[PersonaType.LEGAL],
    description:
      'Compliance, contracts, risk management, intellectual property, and regulatory affairs',
    avatarUrl: '/assets/images/personas/legal-avatar.svg',
    color: PERSONA_COLORS[PersonaType.LEGAL],
  },
  CREATIVE: {
    id: 'prs_cre006',
    type: PersonaType.CREATIVE,
    name: 'Chief Creative Officer',
    shortName: PERSONA_NAMES[PersonaType.CREATIVE],
    description:
      'Design thinking, brand identity, creative strategy, and innovation',
    avatarUrl: '/assets/images/personas/creative-avatar.svg',
    color: PERSONA_COLORS[PersonaType.CREATIVE],
  },
  CSO: {
    id: 'prs_cso007',
    type: PersonaType.CSO,
    name: 'Chief Strategy Officer',
    shortName: PERSONA_NAMES[PersonaType.CSO],
    description:
      'Business strategy, competitive analysis, market positioning, and strategic planning',
    avatarUrl: '/assets/images/personas/cso-avatar.svg',
    color: PERSONA_COLORS[PersonaType.CSO],
  },
  SALES: {
    id: 'prs_sal008',
    type: PersonaType.SALES,
    name: 'VP of Sales',
    shortName: PERSONA_NAMES[PersonaType.SALES],
    description:
      'Sales strategy, pipeline management, client relationships, and revenue growth',
    avatarUrl: '/assets/images/personas/sales-avatar.svg',
    color: PERSONA_COLORS[PersonaType.SALES],
  },
};

/**
 * Service for managing department personas.
 * Provides static persona definitions for AI conversation context.
 */
@Injectable()
export class PersonasService {
  private readonly logger = new Logger(PersonasService.name);

  /**
   * Retrieves all available personas.
   * @returns Array of all persona definitions
   */
  getPersonas(): Persona[] {
    this.logger.log({ message: 'Retrieving all personas' });
    return Object.values(PERSONAS);
  }

  /**
   * Retrieves a specific persona by type.
   * @param type - PersonaType enum value
   * @returns Persona definition
   * @throws NotFoundException if persona type is invalid
   */
  getPersonaByType(type: string): Persona {
    const persona = PERSONAS[type];

    if (!persona) {
      this.logger.warn({ message: 'Persona not found', type });
      throw new NotFoundException({
        type: 'persona_not_found',
        title: 'Persona Not Found',
        status: 404,
        detail: `Persona with type '${type}' not found. Valid types: ${Object.keys(PERSONAS).join(', ')}`,
      });
    }

    this.logger.log({ message: 'Persona retrieved', type, personaId: persona.id });
    return persona;
  }

  /**
   * Validates if a persona type is valid.
   * @param type - PersonaType string to validate
   * @returns Boolean indicating validity
   */
  isValidPersonaType(type: string): boolean {
    return type in PERSONAS;
  }
}
