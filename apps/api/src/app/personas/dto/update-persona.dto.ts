import { IsIn, IsNotEmpty } from 'class-validator';
import { PersonaType } from '@mentor-ai/shared/types';

/**
 * Valid persona type values for validation.
 * Derived from shared PersonaType enum to avoid duplication.
 */
const VALID_PERSONA_TYPES = Object.values(PersonaType) as string[];

/**
 * DTO for updating conversation persona.
 * Used for PATCH /conversations/:id/persona endpoint.
 */
export class UpdatePersonaDto {
  @IsNotEmpty({ message: 'Persona type is required' })
  @IsIn(VALID_PERSONA_TYPES, {
    message: `Persona type must be one of: ${VALID_PERSONA_TYPES.join(', ')}`,
  })
  personaType!: PersonaType;
}
