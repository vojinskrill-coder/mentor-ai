import { IsEnum, IsString, IsOptional, IsNumber, Min, Max } from 'class-validator';
import { MemoryType, MemorySource } from '@mentor-ai/shared/types';

/**
 * DTO for creating a new memory entry.
 */
export class CreateMemoryDto {
  @IsEnum(MemoryType)
  type!: MemoryType;

  @IsEnum(MemorySource)
  source!: MemorySource;

  @IsString()
  content!: string;

  @IsOptional()
  @IsString()
  subject?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  @IsOptional()
  @IsString()
  sourceMessageId?: string;
}
