import { IsString, IsOptional, MaxLength, IsIn, Matches } from 'class-validator';
import { PersonaType } from '@mentor-ai/shared/types';

/**
 * Valid persona type values for validation.
 * Derived from shared PersonaType enum to avoid duplication.
 */
const VALID_PERSONA_TYPES = Object.values(PersonaType) as string[];

/**
 * DTO for creating a new conversation.
 */
export class CreateConversationDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  title?: string;

  @IsOptional()
  @IsIn(VALID_PERSONA_TYPES, {
    message: `Persona type must be one of: ${VALID_PERSONA_TYPES.join(', ')}`,
  })
  personaType?: PersonaType;

  @IsOptional()
  @IsString()
  @Matches(/^cpt_/, { message: 'conceptId must have cpt_ prefix' })
  conceptId?: string;

  @IsOptional()
  @IsString()
  curriculumId?: string;
}
