import { IsString, IsOptional, MaxLength, IsIn, Matches, IsBoolean } from 'class-validator';
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

  /**
   * When true, suppress any auto-trigger side effects on conversation
   * creation (e.g. ConceptPlanService.triggerConceptPlan). Used by the
   * proposal-discussion flow which needs to create a conversation linked
   * to a concept WITHOUT firing the legacy auto-plan generator that would
   * burn tokens and create unwanted "Proposed AI task" entries.
   */
  @IsOptional()
  @IsBoolean()
  skipAutoTrigger?: boolean;
}
