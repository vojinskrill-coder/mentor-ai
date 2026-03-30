import { IsString, IsOptional, IsNumber, IsArray, Min, Max, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';

// ── Read Operations ──

export class ConceptSearchQuery {
  @IsString()
  q!: string;

  @IsString()
  tenantId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  limit?: number;
}

export class TenantIdQuery {
  @IsString()
  tenantId!: string;
}

export class ProposalListQuery {
  @IsString()
  tenantId!: string;

  @IsOptional()
  @IsString()
  status?: string;
}

// ── Write Operations: Proposals ──

export class CreateProposalDto {
  @IsString()
  tenantId!: string;

  @IsString()
  canvasBlock!: string;

  @IsString()
  type!: string;

  @IsString()
  @MaxLength(500)
  title!: string;

  @IsString()
  reasoning!: string;

  @IsString()
  proposedAction!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  estimatedCost?: number;

  @IsOptional()
  @IsString()
  priority?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  relatedConcepts?: string[];
}

export class UpdateProposalDto {
  @IsString()
  status!: string;

  @IsOptional()
  @IsString()
  approvedBy?: string;

  @IsOptional()
  @IsString()
  rejectedReason?: string;
}

// ── Write Operations: Concepts ──

export class CreateConceptDto {
  @IsString()
  tenantId!: string;

  @IsString()
  name!: string;

  @IsString()
  category!: string;

  @IsString()
  definition!: string;

  @IsOptional()
  @IsString()
  canvasBlock?: string;

  @IsOptional()
  @IsString()
  extendedDescription?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(1)
  confidence?: number;

  @IsOptional()
  @IsArray()
  relationships?: Array<{ targetId: string; type: string }>;
}

// ── Write Operations: Tasks ──

export class CreateTaskDto {
  @IsString()
  tenantId!: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  content?: string;

  @IsOptional()
  @IsString()
  conceptId?: string;

  @IsOptional()
  @IsString()
  expectedOutcome?: string;

  @IsOptional()
  @IsString()
  proposalId?: string;
}

export class TaskContributionDto {
  @IsString()
  tenantId!: string;

  @IsString()
  noteId!: string;

  @IsString()
  agentType!: string;

  @IsString()
  summary!: string;

  @IsString()
  output!: string;

  @IsOptional()
  @IsArray()
  files?: Array<{
    name: string;
    displayName: string;
    path: string;
    mimeType: string;
    size: number;
  }>;

  @IsOptional()
  @IsArray()
  actions?: Array<{
    id: string;
    type: string;
    target: string;
    label: string;
    status?: string;
    scheduledFor?: string;
  }>;

  @IsOptional()
  metrics?: Record<string, number | string>;
}

export class TaskProgressDto {
  @IsString()
  tenantId!: string;

  @IsString()
  noteId!: string;

  @IsString()
  phase!: string;

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(100)
  percent!: number;

  @IsString()
  message!: string;
}

export class TaskCompleteDto {
  @IsString()
  tenantId!: string;

  @IsString()
  noteId!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  score?: number;
}

// ── Write Operations: Agent Status ──

export class AgentStatusDto {
  @IsString()
  tenantId!: string;

  @IsOptional()
  @IsString()
  taskId?: string;

  @IsString()
  agent!: string;

  @IsString()
  status!: string;

  @IsString()
  message!: string;
}

// ── Write Operations: Memories ──

export class CreateMemoryDto {
  @IsString()
  tenantId!: string;

  @IsString()
  type!: string;

  @IsString()
  content!: string;

  @IsOptional()
  @IsString()
  conceptId?: string;
}

// ── Write Operations: Brain State ──

export class UpdateBrainStateDto {
  @IsString()
  tenantId!: string;

  @IsString()
  canvasBlock!: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  risks?: number;

  @IsOptional()
  @IsString()
  status?: string;
}

// ── Write Operations: Action Results ──

export class ActionResultDto {
  @IsString()
  tenantId!: string;

  @IsString()
  noteId!: string;

  @IsString()
  agentType!: string;

  @IsString()
  actionId!: string;

  @IsString()
  status!: string; // completed | failed

  @IsOptional()
  result?: Record<string, unknown>;
}

// ── Write Operations: Conversations ──

export class CreateConversationDto {
  @IsString()
  tenantId!: string;

  @IsString()
  conceptId!: string;

  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  initialMessage?: string;
}
