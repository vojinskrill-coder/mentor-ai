/**
 * ProcessIR — intermediate representation for a builder-generated process.
 *
 * Single source of truth. design.json compiles to IR, and IR emits 4
 * artifacts:
 *   1. n8n workflow JSON (matches lead-discovery / content-creation pattern)
 *   2. per-process SOUL.md (identity + N call shapes)
 *   3. per-process SKILL.md (canonical schemas)
 *   4. openclaw.json agent list entry (for registration)
 *
 * The IR is deterministic: same design in → same IR → same 4 artifacts.
 * This prevents drift between the workflow's brain-call instructions
 * and the agent's documented call shapes.
 */

import type { DesignPayload } from '../process-draft.service';
import type { NotionSchema } from '../notion-database-creator.service';

export interface ProcessIR {
  /** kebab-case slug; used to derive agentId = proc-<slug> */
  slug: string;
  /** human-readable name */
  name: string;
  /** one-sentence description */
  description: string;
  /** full OpenClaw agent id (e.g. proc-talent-scout) */
  agentId: string;
  /** tenant id that owns the process */
  tenantId: string;

  /** the frozen input contract (JSON Schema) */
  inputContract: Record<string, unknown>;
  /** what the process produces per item */
  outputManifest: Record<string, unknown>;

  /** ordered brain calls — each one is a single OpenClaw call via n8n httpRequest */
  brainCalls: BrainCall[];

  /** Notion database schema to create at deploy time */
  notionSchema?: NotionSchema;

  /** synthetic test input values the builder agent generates to run the test */
  syntheticTestInput: Record<string, unknown>;

  /** list of tools the process uses (for documentation only) */
  tools: string[];
}

/**
 * A single "brain call" — one HTTP request to the OpenClaw relay with a
 * message instruction and the previous step's output embedded. This is
 * the atomic unit of work inside the n8n workflow.
 */
export interface BrainCall {
  /** order in the pipeline (1-based) */
  index: number;
  /** human-readable name — becomes the n8n node name */
  name: string;
  /** kebab-case id used for variable references */
  id: string;
  /**
   * Call type determines how the n8n node is generated:
   * - 'brain' (default): HTTP POST to OpenClaw relay with prompt
   * - 'mcp': HTTP POST to our backend MCP gateway endpoint
   */
  callType: 'brain' | 'mcp';
  /**
   * For brain calls: the human-readable instruction the agent receives.
   * For MCP calls: not used (the MCP gateway reads params from the body).
   */
  instruction: string;
  /**
   * Which fields from webhook body / previous steps to embed.
   */
  inputBindings: BrainCallInputBinding[];
  /** expected output schema for the parse node */
  outputSchema: Record<string, unknown>;
  /** MiniMax thinking level (brain calls only) */
  thinking: 'off' | 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  /** agent call timeout in seconds (brain calls only) */
  timeoutSeconds: number;
  /** MCP tool slug (mcp calls only) — e.g., 'apollo', 'notion' */
  mcpToolSlug?: string;
  /** MCP operation id (mcp calls only) — e.g., 'search_organizations' */
  mcpOperationId?: string;
  /** MCP request body template (mcp calls only) — n8n expression for the POST body */
  mcpBodyTemplate?: Record<string, unknown>;
}

export interface BrainCallInputBinding {
  /** name used in the instruction text as {{name}} */
  placeholder: string;
  /** n8n expression source, e.g. "$json.body.role_name" */
  expression: string;
  /** fallback if the source is missing */
  fallback?: string;
}

// ─── Compile design.json → ProcessIR ──────────────────────────────

/**
 * Convert a builder design.json into the IR.
 *
 * Rules:
 * - Every step in design.steps that is NOT an APPROVAL_GATE and NOT an
 *   MCP_WRITE becomes a brain call.
 * - MCP_WRITE steps are DROPPED from the IR brain calls — Notion writes
 *   happen in the backend after user approval (matches lead-discovery
 *   and content-creation patterns), not inside the n8n workflow.
 * - APPROVAL_GATE is implicit — the user approves the stored results
 *   via the Design Process UI after the workflow completes.
 * - The brain call instruction is generated from the step's name,
 *   tool, operation, and field bindings.
 */
export function compileDesignToIR(
  design: DesignPayload & { notionSchema?: NotionSchema },
  opts: { tenantId: string; syntheticTestInput?: Record<string, unknown> },
): ProcessIR {
  if (!design.slug || !design.name || !Array.isArray(design.steps)) {
    throw new Error('compileDesignToIR: design missing required fields');
  }

  // ── Step 0: Normalize stepKind values ──────────────────────────
  // AI agents produce varied stepKind strings ("LLM_REASONING",
  // "AI_STEP", "BRAIN_CALL", "search", etc.). Normalize to the
  // canonical enum so the rest of the compiler works deterministically.
  const normalizedSteps = (design.steps ?? []).map((s) => ({
    ...s,
    stepKind: normalizeStepKind(s.stepKind, s),
  }));

  // All steps that are NOT approval gates and NOT backend-only writes
  // become brain calls. MCP operations (search, enrich) are handled
  // BY the agent via the mcp_execute tool — NOT as direct HTTP nodes.
  // This is the "Agent-as-Executor" pattern: n8n orchestrates, agent
  // does the actual work including external API calls.
  const pipelineSteps = normalizedSteps.filter(
    (s) =>
      s.stepKind !== 'APPROVAL_GATE' &&
      !s.manualStep &&
      s.stepKind !== 'MCP_WRITE',
  );

  const brainCalls: BrainCall[] = pipelineSteps.map((step, i) => {
    const isMcpStep =
      step.stepKind === 'MCP_SEARCH' ||
      step.stepKind === 'MCP_READ';
    const bindings: BrainCallInputBinding[] = [];
    const fieldBindings = (step.fieldBindings ?? {}) as Record<
      string,
      {
        source?: string;
        field?: string;
        step?: number;
        value?: unknown;
        key?: string;
      }
    >;

    for (const [fieldName, spec] of Object.entries(fieldBindings)) {
      if (!spec || typeof spec !== 'object') continue;
      if (spec.source === 'manual' && spec.field) {
        bindings.push({
          placeholder: fieldName,
          expression: `$json.body.input?.${spec.field}`,
          fallback: `"${spec.field}"`,
        });
      } else if (spec.source === 'previous_step' && spec.field) {
        bindings.push({
          placeholder: fieldName,
          expression: `$json.${spec.field}`,
        });
      } else if (spec.source === 'literal' && spec.value !== undefined) {
        bindings.push({
          placeholder: fieldName,
          expression: JSON.stringify(spec.value),
        });
      }
    }

    const stepRec = step as Record<string, unknown>;

    return {
      index: i + 1,
      name: step.name ?? `Step ${step.index ?? i + 1}`,
      id: slugify(step.name ?? `step-${i + 1}`),
      callType: 'brain' as const, // ALL steps are brain calls now
      instruction: isMcpStep
        ? generateMcpBrainInstruction(step, bindings)
        : generateInstruction(step, bindings),
      inputBindings: bindings,
      outputSchema: (step.outputSchema ?? {}) as Record<string, unknown>,
      thinking: (isMcpStep ? 'medium' : ((stepRec.thinking as string) ?? 'low')) as BrainCall['thinking'],
      // MCP steps need longer timeout: agent calls relay → relay runs agent
      // → agent calls MCP gateway via curl → gateway calls external API.
      // Each hop adds latency. 600s (10 min) covers slow APIs + retries.
      timeoutSeconds: isMcpStep ? 600 : ((stepRec.timeoutSeconds as number) ?? 3600),
      // MCP metadata preserved for SOUL.md documentation
      mcpToolSlug: step.mcpToolSlug ?? undefined,
      mcpOperationId: step.mcpOperationId ?? undefined,
    };
  });

  const syntheticTestInput =
    opts.syntheticTestInput ?? generateSyntheticTestInput(design.inputContract);

  return {
    slug: design.slug,
    name: design.name,
    description: design.description ?? '',
    agentId: `proc-${design.slug}`,
    tenantId: opts.tenantId,
    inputContract: design.inputContract ?? {},
    outputManifest: design.outputManifest ?? {},
    brainCalls,
    notionSchema: design.notionSchema,
    syntheticTestInput,
    tools: design.tools ?? [],
  };
}

// ─── Step kind normalization ──────────────────────────────────────
// AI agents produce many variant stepKind strings. This normalizer
// maps ANY string to one of the 5 canonical types. This is the
// "guardrail" layer — deterministic code fixing AI's creative output.

type CanonicalStepKind = 'MCP_SEARCH' | 'MCP_READ' | 'MCP_WRITE' | 'APPROVAL_GATE' | 'BRAIN_CALL';

function normalizeStepKind(
  kind: string | undefined,
  step: { manualStep?: boolean; mcpToolSlug?: string; mcpOperationId?: string; prompt?: unknown },
): CanonicalStepKind {
  // Manual steps are always approval gates
  if (step.manualStep) return 'APPROVAL_GATE';

  // If no kind specified, infer from step content
  if (!kind) {
    if (step.mcpToolSlug && step.mcpOperationId) {
      // Has MCP tool binding — determine read vs search vs write from operation
      const op = (step.mcpOperationId ?? '').toLowerCase();
      if (op.includes('search') || op.includes('find') || op.includes('list')) return 'MCP_SEARCH';
      if (op.includes('save') || op.includes('create') || op.includes('write') || op.includes('append') || op.includes('send')) return 'MCP_WRITE';
      return 'MCP_READ';
    }
    return 'BRAIN_CALL';
  }

  const upper = kind.toUpperCase().replace(/[^A-Z_]/g, '');

  // Exact matches first
  if (upper === 'MCP_SEARCH') return 'MCP_SEARCH';
  if (upper === 'MCP_READ') return 'MCP_READ';
  if (upper === 'MCP_WRITE') return 'MCP_WRITE';
  if (upper === 'APPROVAL_GATE') return 'APPROVAL_GATE';
  if (upper === 'BRAIN_CALL') return 'BRAIN_CALL';

  // Fuzzy matches for AI-generated variants
  if (upper.includes('SEARCH') || upper.includes('FIND') || upper.includes('DISCOVER')) return 'MCP_SEARCH';
  if (upper.includes('ENRICH') || upper.includes('READ') || upper.includes('FETCH') || upper.includes('GET')) return 'MCP_READ';
  if (upper.includes('WRITE') || upper.includes('SAVE') || upper.includes('STORE') || upper.includes('SEND') || upper.includes('CREATE') || upper.includes('INSERT')) return 'MCP_WRITE';
  if (upper.includes('APPROV') || upper.includes('GATE') || upper.includes('REVIEW') || upper.includes('MANUAL') || upper.includes('CONFIRM')) return 'APPROVAL_GATE';

  // Anything AI-reasoning related → brain call
  // LLM_REASONING, AI_STEP, REASONING, ANALYSIS, SCORING, etc.
  return 'BRAIN_CALL';
}

// ─── Helpers ───────────────────────────────────────────────────────

/**
 * Generate a human-readable instruction for a brain call based on the
 * step's tool + operation + field bindings. Mirrors the lead-discovery
 * and content-creation instruction style.
 */
function generateInstruction(
  step: DesignPayload['steps'][number],
  bindings: BrainCallInputBinding[],
): string {
  // PRIORITY 1: Use the builder's explicit prompt if present. This is the
  // domain-specific, detailed instruction the process-builder agent wrote
  // for this step (e.g., "Search Apollo.io for luxury architects in the
  // Balkans with ICP filters..."). When present, it's always better than
  // anything we can synthesize from metadata.
  const explicitPrompt =
    (step as Record<string, unknown>).prompt as string | undefined;
  if (explicitPrompt && explicitPrompt.trim().length > 20) {
    const fieldRefs = bindings
      .map((b) => `{{${b.placeholder}}}`)
      .join(', ');
    return [
      explicitPrompt.trim(),
      fieldRefs && `\nInputs: ${fieldRefs}.`,
      `\nReturn ONLY a JSON array of items matching the output schema. No prose, no markdown fences, no explanation. Start your reply with [ and end with ].`,
    ]
      .filter(Boolean)
      .join('');
  }

  // PRIORITY 2: Synthesize from metadata (fallback for steps without prompt)
  const tool = step.mcpToolSlug ?? 'generic';
  const op = step.mcpOperationId ?? 'execute';
  const name = step.name ?? 'Step';
  const desc = step.description ?? '';

  const fieldRefs = bindings
    .map((b) => `{{${b.placeholder}}}`)
    .join(', ');

  return [
    `You are running step "${name}" of a Neuron OS process.`,
    desc && `Task: ${desc}.`,
    tool !== 'generic' && `Use the ${tool} tool (operation: ${op}).`,
    fieldRefs && `Inputs: ${fieldRefs}.`,
    `Return ONLY a JSON array of items matching the output schema. No prose, no markdown fences, no explanation. Start your reply with [ and end with ].`,
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Generate an instruction for an MCP step that the agent will execute
 * via the mcp_execute tool. The agent calls the MCP gateway HTTP
 * endpoint with the correct parameters — no direct n8n HTTP nodes.
 */
function generateMcpBrainInstruction(
  step: DesignPayload['steps'][number],
  bindings: BrainCallInputBinding[],
): string {
  const tool = step.mcpToolSlug ?? 'unknown';
  const op = step.mcpOperationId ?? 'unknown';
  const name = step.name ?? 'MCP Step';
  const desc = step.description ?? '';
  const kind = step.stepKind ?? 'MCP_SEARCH';

  const fieldRefs = bindings
    .map((b) => `- ${b.placeholder}: {{${b.placeholder}}}`)
    .join('\n');

  const lines: string[] = [
    `You are running step "${name}" of a Neuron OS process.`,
    desc && `Task: ${desc}`,
    '',
    `Call the MCP gateway to execute the "${op}" operation on "${tool}".`,
    `Use: exec curl -sS -X POST "http://100.114.192.85:3000/api/v1/mcp/${tool}/${op}" \\`,
    `  -H "Content-Type: application/json" \\`,
    `  -H "Authorization: Bearer 9b8d2c89d0ff9f2477b9c2b50b4bf1c0a6a01672014cd02d" \\`,
    `  -d '<JSON body>'`,
    '',
  ];

  if (fieldRefs) {
    lines.push('Input values to use in the body:');
    lines.push(fieldRefs);
    lines.push('');
  }

  // Apollo-specific guidance
  if (tool === 'apollo-io' || tool === 'apollo') {
    lines.push('APOLLO API RULES:');
    lines.push('- organization_locations MUST be an array: ["Europe"], NOT "Europe"');
    lines.push('- q_organization_keyword_tags MUST be an array: ["luxury", "design"]');
    lines.push('- per_page is a number (default 25, max 100)');
    if (op === 'enrich_organization') {
      lines.push('- Requires "domain" field from a previous search result');
      lines.push('- Iterate over items from the previous step and enrich each one');
    }
    if (op === 'enrich_person') {
      lines.push('- Requires "name" and "domain" from previous results');
    }
    lines.push('');
  }

  if (kind === 'MCP_READ') {
    lines.push('DATA CHAINING: This is an enrichment step. For each item from the previous step:');
    lines.push('1. Extract the required identifiers (domain, name, ID)');
    lines.push('2. Call the MCP gateway for each item');
    lines.push('3. Merge the enrichment data INTO the existing item');
    lines.push('4. KEEP ALL fields from the previous step');
    lines.push('');
  }

  lines.push('Return ONLY a JSON array of items. No prose, no markdown fences. Start with [ and end with ].');

  return lines.filter((l) => l !== undefined).join('\n');
}

/**
 * Build the MCP request body template for an MCP step.
 * Maps the step's fieldBindings to the external API's input fields.
 * Returns a template object that the n8n node will use as the POST body.
 */
function buildMcpBodyTemplate(
  step: DesignPayload['steps'][number],
  bindings: BrainCallInputBinding[],
): Record<string, unknown> {
  const template: Record<string, unknown> = {};
  const fieldBindings = (step.fieldBindings ?? {}) as Record<
    string,
    { source?: string; field?: string; value?: unknown }
  >;

  for (const [fieldName, spec] of Object.entries(fieldBindings)) {
    if (!spec) continue;
    if (spec.source === 'manual' && spec.field) {
      // Reference to runtime input — becomes n8n expression
      template[fieldName] = `={{$json.body.input?.${spec.field}}}`;
    } else if (spec.source === 'literal' && spec.value !== undefined) {
      template[fieldName] = spec.value;
    } else if (spec.source === 'previous_step' && spec.field) {
      template[fieldName] = `={{$json.${spec.field}}}`;
    } else {
      template[fieldName] = spec.value ?? spec.field ?? '';
    }
  }

  return template;
}

/**
 * Generate reasonable synthetic test input values from the inputContract.
 * The process-builder agent may override these with smarter domain-aware
 * values, but this gives us a deterministic fallback.
 */
function generateSyntheticTestInput(
  contract: unknown,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!contract || typeof contract !== 'object') return out;
  const c = contract as {
    properties?: Record<string, { type?: string; description?: string; default?: unknown; enum?: unknown[] }>;
    required?: string[];
  };
  const props = c.properties ?? {};
  for (const [name, spec] of Object.entries(props)) {
    if (spec.default !== undefined) {
      out[name] = spec.default;
      continue;
    }
    if (Array.isArray(spec.enum) && spec.enum.length > 0) {
      out[name] = spec.enum[0];
      continue;
    }
    const t = spec.type ?? 'string';
    if (t === 'string') {
      out[name] = defaultStringFor(name, spec.description);
    } else if (t === 'number' || t === 'integer') {
      out[name] = 5;
    } else if (t === 'boolean') {
      out[name] = true;
    } else if (t === 'array') {
      out[name] = [];
    } else if (t === 'object') {
      out[name] = {};
    }
  }
  return out;
}

function defaultStringFor(name: string, desc?: string): string {
  const n = name.toLowerCase();
  const d = (desc ?? '').toLowerCase();
  if (n.includes('role') || n.includes('title') || d.includes('role')) {
    return 'Software Engineer';
  }
  if (n.includes('location') || n.includes('region') || n.includes('city')) {
    return 'United States';
  }
  if (n.includes('industry') || n.includes('category')) {
    return 'luxury design';
  }
  if (n.includes('query') || n.includes('search') || n.includes('topic')) {
    return 'luxury sculpture trends 2026';
  }
  if (n.includes('description') || n.includes('jd')) {
    return 'Senior role at a premium brand, focused on creative leadership and craftsmanship.';
  }
  if (n.includes('email')) return 'test@example.com';
  if (n.includes('url')) return 'https://example.com';
  if (n.includes('name')) return 'Test User';
  return `sample-${name}`;
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40);
}
