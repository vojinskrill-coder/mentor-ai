import type { PersonaType } from '@mentor-ai/shared/types';

// ─── Input Types ─────────────────────────────────────────────

export interface ConceptResearchInput {
  conceptId: string;
  tenantId: string;
  userId: string;
  /** If provided, reuse existing conversation; otherwise auto-create */
  conversationId?: string;
  personaType?: PersonaType;
  /** Number of AI conversation turns per concept (default 3) */
  turnCount?: number;
  /** Whether to enable web search enrichment (default true) */
  webSearchEnabled?: boolean;
  /** Summaries of previously researched concepts — prevents repetition */
  priorResearchSummaries?: ConceptResearchSummary[];
  /** Task titles already created in this session — prevents duplicate task creation */
  alreadyCreatedTaskTitles?: string[];
}

export interface ConceptResearchSummary {
  conceptId: string;
  conceptName: string;
  category: string;
  /** Truncated to ~300 chars */
  keySummary: string;
  taskTitles: string[];
}

// ─── Progress Callbacks ─────────────────────────────────────

export interface ResearchTurnProgress {
  conceptId: string;
  conceptName: string;
  turnIndex: number;
  totalTurns: number;
  phase: 'enrichment' | 'generating' | 'post-processing';
}

export interface ResearchProgressCallbacks {
  onTurnProgress?: (progress: ResearchTurnProgress) => void;
  onTasksCreated?: (tasks: ConceptResearchResult['createdTasks']) => void;
}

// ─── Result Types ───────────────────────────────────────────

export interface CreatedTaskInfo {
  id: string;
  title: string;
  conceptId: string | null;
  conceptName: string | null;
  conversationId: string;
}

export interface ConceptResearchResult {
  conceptId: string;
  conceptName: string;
  conversationId: string;
  /** Last turn's full AI response */
  researchOutput: string;
  createdTasks: CreatedTaskInfo[];
  summary: ConceptResearchSummary;
  fullyCompleted: boolean;
  failureReason?: string;
}
