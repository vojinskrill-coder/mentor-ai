import { Department, QuickTask } from '@mentor-ai/shared/types';

/**
 * Pre-defined quick tasks for the onboarding flow.
 * Each task is optimized for fast, high-quality AI output.
 */
export const QUICK_TASK_TEMPLATES: QuickTask[] = [
  // Finance tasks
  {
    id: 'finance-email',
    name: 'Draft a Financial Summary Email',
    description: 'Create a professional email summarizing financial metrics or updates',
    department: Department.FINANCE,
    estimatedTimeSaved: 15,
  },
  {
    id: 'finance-report',
    name: 'Create a Budget Report Outline',
    description: 'Generate an outline for a budget or financial report',
    department: Department.FINANCE,
    estimatedTimeSaved: 20,
  },

  // Marketing tasks
  {
    id: 'marketing-brief',
    name: 'Create a Campaign Brief Outline',
    description: 'Generate a marketing campaign brief with goals and strategy',
    department: Department.MARKETING,
    estimatedTimeSaved: 15,
  },
  {
    id: 'marketing-social',
    name: 'Draft Social Media Posts',
    description: 'Create engaging social media content for your brand',
    department: Department.MARKETING,
    estimatedTimeSaved: 10,
  },

  // Technology tasks
  {
    id: 'tech-memo',
    name: 'Write a Technical Decision Memo',
    description: 'Document a technical decision with rationale and trade-offs',
    department: Department.TECHNOLOGY,
    estimatedTimeSaved: 20,
  },
  {
    id: 'tech-spec',
    name: 'Create a Feature Specification',
    description: 'Generate a specification outline for a new feature',
    department: Department.TECHNOLOGY,
    estimatedTimeSaved: 25,
  },

  // Operations tasks
  {
    id: 'ops-agenda',
    name: 'Generate a Meeting Agenda',
    description: 'Create a structured agenda for your upcoming meeting',
    department: Department.OPERATIONS,
    estimatedTimeSaved: 10,
  },
  {
    id: 'ops-process',
    name: 'Draft a Process Document',
    description: 'Outline a standard operating procedure or process',
    department: Department.OPERATIONS,
    estimatedTimeSaved: 20,
  },

  // Legal tasks
  {
    id: 'legal-checklist',
    name: 'Draft a Contract Review Checklist',
    description: 'Create a checklist for reviewing contract terms',
    department: Department.LEGAL,
    estimatedTimeSaved: 15,
  },
  {
    id: 'legal-summary',
    name: 'Summarize Legal Requirements',
    description: 'Outline key legal requirements or compliance points',
    department: Department.LEGAL,
    estimatedTimeSaved: 20,
  },

  // Creative tasks
  {
    id: 'creative-pitch',
    name: 'Create a Project Pitch Outline',
    description: 'Generate a compelling pitch for your creative project',
    department: Department.CREATIVE,
    estimatedTimeSaved: 15,
  },
  {
    id: 'creative-brief',
    name: 'Draft a Creative Brief',
    description: 'Create a brief outlining project goals and creative direction',
    department: Department.CREATIVE,
    estimatedTimeSaved: 20,
  },

  // Strategy tasks
  {
    id: 'strategy-framework',
    name: 'Create a Strategic Analysis Framework',
    description: 'Generate a SWOT or competitive analysis framework for your business',
    department: Department.STRATEGY,
    estimatedTimeSaved: 20,
  },
  {
    id: 'strategy-landscape',
    name: 'Draft a Competitive Landscape Overview',
    description: 'Outline key competitors, market positioning, and strategic opportunities',
    department: Department.STRATEGY,
    estimatedTimeSaved: 25,
  },

  // Sales tasks
  {
    id: 'sales-pipeline',
    name: 'Build a Sales Pipeline Template',
    description: 'Create a structured sales pipeline with stages and qualification criteria',
    department: Department.SALES,
    estimatedTimeSaved: 20,
  },
  {
    id: 'sales-proposal',
    name: 'Draft a Client Proposal Outline',
    description: 'Generate a professional proposal outline for a prospective client',
    department: Department.SALES,
    estimatedTimeSaved: 25,
  },
];

/**
 * Get tasks filtered by department/industry.
 *
 * @param industry - The department/industry to filter by
 * @returns Array of quick tasks for the specified industry
 */
export function getTasksByIndustry(industry: string): QuickTask[] {
  return QUICK_TASK_TEMPLATES.filter(
    (task) => task.department.toLowerCase() === industry.toLowerCase()
  );
}

/**
 * Get a specific task by ID.
 *
 * @param taskId - The task ID to find
 * @returns The quick task or undefined if not found
 */
export function getTaskById(taskId: string): QuickTask | undefined {
  return QUICK_TASK_TEMPLATES.find((task) => task.id === taskId);
}

/**
 * Generate the system prompt for a quick task.
 *
 * @param task - The quick task
 * @param industry - The selected industry
 * @returns Optimized system prompt for the AI
 */
export function generateSystemPrompt(task: QuickTask, industry: string): string {
  return `You are a professional ${industry.toLowerCase()} assistant with expertise in ${task.department.toLowerCase()}.
Your task is to generate a high-quality, immediately usable ${task.name.toLowerCase()}.
Be concise but comprehensive. Provide professional, actionable content.
Format the output clearly with appropriate sections and bullet points where helpful.
The user is new to this platform and this is their first interaction - make it impressive and valuable.`;
}

/**
 * Generate the user prompt for a quick task.
 *
 * @param task - The quick task
 * @param userContext - User-provided context
 * @returns User prompt for the AI
 */
export function generateUserPrompt(task: QuickTask, userContext: string): string {
  return `Task: ${task.name}
Description: ${task.description}

User's context and requirements:
${userContext}

Please generate a professional, ready-to-use output that demonstrates immediate value.`;
}
