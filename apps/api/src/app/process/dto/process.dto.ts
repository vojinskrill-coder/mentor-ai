import {
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  IsObject,
  IsIn,
  Min,
  Max,
  MaxLength,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Valid step types matching Prisma ProcessStepType enum */
const VALID_STEP_TYPES = ['AUTOMATIC', 'APPROVAL', 'MANUAL'] as const;

// ── Workflow DTOs ──

export class CreateWorkflowDto {
  @IsString()
  @MaxLength(200)
  name!: string;

  @IsString()
  @MaxLength(100)
  @Matches(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, { message: 'Slug must be lowercase alphanumeric with hyphens only' })
  slug!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  cronSchedule?: string;

  @IsOptional()
  @IsString()
  skillMd?: string;
}

export class UpdateWorkflowDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  cronSchedule?: string;

  @IsOptional()
  @IsString()
  skillMd?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

// ── Step DTOs ──

export class CreateStepDto {
  @IsInt()
  @Min(1)
  @Type(() => Number)
  order!: number;

  @IsString()
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsIn(VALID_STEP_TYPES, { message: 'stepType must be AUTOMATIC, APPROVAL, or MANUAL' })
  stepType!: string;

  @IsString()
  agentType!: string;

  @IsString()
  toolSkill!: string;

  @IsObject()
  inputSchema!: Record<string, unknown>;

  @IsObject()
  outputSchema!: Record<string, unknown>;

  @IsOptional()
  @IsString()
  skillMdSection?: string;

  @IsOptional()
  @IsObject()
  retryPolicy?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  verifyRules?: Record<string, unknown>;
}

export class UpdateStepDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  order?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsIn(VALID_STEP_TYPES, { message: 'stepType must be AUTOMATIC, APPROVAL, or MANUAL' })
  stepType?: string;

  @IsOptional()
  @IsString()
  agentType?: string;

  @IsOptional()
  @IsString()
  toolSkill?: string;

  @IsOptional()
  @IsObject()
  inputSchema?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  outputSchema?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  skillMdSection?: string;

  @IsOptional()
  @IsObject()
  retryPolicy?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  verifyRules?: Record<string, unknown>;
}

// ── Run DTOs ──

export class TriggerRunDto {
  @IsOptional()
  @IsObject()
  input?: Record<string, unknown>;
}

export class ApproveStepDto {
  @IsBoolean()
  approved!: boolean;

  @IsOptional()
  @IsObject()
  modifiedOutput?: Record<string, unknown>;
}

// ── Query DTOs ──

export class ListRunsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @IsOptional()
  @IsString()
  status?: string;
}
