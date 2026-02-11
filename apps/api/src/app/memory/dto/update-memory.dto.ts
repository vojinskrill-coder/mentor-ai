import { IsString, IsOptional } from 'class-validator';

/**
 * DTO for updating/correcting a memory entry.
 * Source will automatically be set to USER_CORRECTED.
 */
export class UpdateMemoryDto {
  @IsString()
  content!: string;

  @IsOptional()
  @IsString()
  subject?: string;
}
