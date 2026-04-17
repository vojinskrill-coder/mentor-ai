/**
 * Emit the per-process SKILL.md from a ProcessIR.
 *
 * Lives at /root/.openclaw/workspace/skills/lsa-<slug>/SKILL.md on
 * Hetzner. Acts as the canonical schema + quality reference that the
 * per-process agent's SOUL.md points to.
 *
 * The SKILL.md is the "source of truth" for the process spec —
 * detailed schemas, quality bars, edge cases — while the SOUL.md is
 * the runtime execution contract.
 */

import type { ProcessIR, BrainCall } from './process-ir';

export function emitSkillMd(ir: ProcessIR): string {
  const stepSections = ir.brainCalls
    .map((call) => renderStepSection(call))
    .join('\n\n');

  return `# SKILL: ${ir.name}

> Canonical schema + quality reference for the **${ir.name}** process, generated from the builder design.json. The per-process agent \`${ir.agentId}\` reads this file at session start to understand the full process spec. The actual runtime instructions live in the n8n workflow's brain-call nodes.

## Description

${ir.description || '(no description provided)'}

## Tools

${ir.tools.map((t) => `- \`${t}\``).join('\n')}

## Input contract (runtime parameters)

\`\`\`json
${JSON.stringify(ir.inputContract, null, 2)}
\`\`\`

## Output manifest (what each item looks like)

\`\`\`json
${JSON.stringify(ir.outputManifest, null, 2)}
\`\`\`

${
  ir.notionSchema
    ? `## Notion database schema

Database name: **${ir.notionSchema.databaseName}**

Properties:

${(ir.notionSchema.properties ?? [])
  .map((p) => `- **${p.name}** (${p.type})${p.options ? ` — options: ${p.options.join(', ')}` : ''}`)
  .join('\n')}

Parent page strategy: \`${ir.notionSchema.parentPageStrategy}\`
`
    : '## Notion database\n\n(this process does not write to Notion)\n'
}

## Pipeline steps

${stepSections}

## Execution contract

The n8n workflow \`Neuron ${ir.name} Pipeline\` runs:

1. **Webhook trigger** — receives \`{ processRunId, tenantId, input }\`
2. **Ack** — returns 200 immediately
${ir.brainCalls.map((c, i) => `${i + 3}. **${c.name}** — brain call to agent \`${ir.agentId}\` → parse JSON`).join('\n')}
${ir.brainCalls.length + 3}. **Callback** — POST final items to \`/api/v1/n8n/callback/{processRunId}\`

After the callback, the UI displays the results for user approval. Approved items are written to Notion by the backend.

## Quality bars

- Every item in the output array MUST match the output manifest schema
- Fields marked as required in input contract MUST be honored (no fabrication)
- JSON output must parse — no trailing commas, no markdown fences, no preamble
- Brain calls must complete within their \`timeoutSeconds\` budget
- If a call produces no valid items, return \`[]\` (empty array) — the pipeline handles gracefully

## Iteration

If the process design changes (user requests changes after reviewing test results), the IR is recompiled and this file is regenerated. The n8n workflow, SOUL.md, and agent registration are all updated in-place.
`;
}

function renderStepSection(call: BrainCall): string {
  return `### Step ${call.index}: ${call.name}

**Agent:** \`${call.id}\`

**Instruction sent to agent:**

> ${call.instruction}

**Inputs available:**

${
  call.inputBindings.length > 0
    ? call.inputBindings
        .map(
          (b) =>
            `- \`${b.placeholder}\` — sourced from \`${b.expression}\`${b.fallback ? ` (fallback: \`${b.fallback}\`)` : ''}`,
        )
        .join('\n')
    : '(none beyond the webhook body)'
}

**Output schema:**

${Object.keys(call.outputSchema).length > 0 ? '```json\n' + JSON.stringify(call.outputSchema, null, 2) + '\n```' : '(inferred — agent returns a JSON array matching the step name)'}

**Thinking level:** \`${call.thinking}\` — **Timeout:** ${call.timeoutSeconds}s
`;
}
