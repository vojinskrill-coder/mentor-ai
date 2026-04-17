import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  Min,
  Max,
  MaxLength,
  ArrayMinSize,
  ValidateNested,
  IsIn,
  Matches,
} from 'class-validator';
import { Type } from 'class-transformer';

// Whitelist of file types the brain may declare as deliverables.
// Anything outside this list cannot be a deliverable on a proposal.
export const ALLOWED_DELIVERABLE_TYPES = [
  'xlsx',
  'pdf',
  'pptx',
  'docx',
  'png',
  'jpg',
  'jpeg',
  'csv',
  'svg',
] as const;

export type DeliverableType = (typeof ALLOWED_DELIVERABLE_TYPES)[number];

export class ExpectedDeliverableDto {
  @IsIn(ALLOWED_DELIVERABLE_TYPES as unknown as string[])
  type!: DeliverableType;

  @IsString()
  @Matches(/^[a-z0-9._-]+\.(xlsx|pdf|pptx|docx|png|jpg|jpeg|csv|svg)$/i, {
    message: 'filename must be lowercase-friendly and end with an allowed extension',
  })
  filename!: string;

  @IsString()
  @MaxLength(300)
  description!: string;
}

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

  // OPTIONAL at proposal birth.
  // The brain MAY provide an initial best-guess manifest when it creates the
  // proposal, but the canonical place to lock in deliverables is the
  // discussion + "Confirm plan and run" step. The approve endpoint can
  // override or set this field via UpdateProposalDto.expectedDeliverables.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExpectedDeliverableDto)
  expectedDeliverables?: ExpectedDeliverableDto[];
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

  @IsOptional()
  @IsString()
  proposedAction?: string;

  // The chat "Confirm plan and run" flow generates a deliverable manifest
  // from the discussion and passes it here. When present, this becomes the
  // locked manifest copied to the Note (overriding any initial brain guess
  // stored on the proposal). When absent, the proposal's existing manifest
  // is used (which may be empty).
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ExpectedDeliverableDto)
  expectedDeliverables?: ExpectedDeliverableDto[];
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

  // ─── Winston-session learning-loop enrichment ───
  // These fields are packed into the memory content as a structured
  // suffix so the director/executor can recall accumulated learning
  // without schema changes to the Memory table.

  @IsOptional()
  @IsString()
  taskId?: string;

  @IsOptional()
  @IsString()
  category?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keyFacts?: string[];

  @IsOptional()
  @IsString()
  appliesToFuture?: string;
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
