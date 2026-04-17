/**
 * Emit the openclaw.json agent list entry for a per-process agent.
 *
 * The entry follows the same shape as the existing lead-discovery and
 * content-creation entries (no dedicated workspace — shared
 * /root/.openclaw/workspace). The SOUL.md and SKILL.md live at:
 *
 *   /root/.openclaw/agents/proc-<slug>/agent/SOUL.md
 *   /root/.openclaw/workspace/skills/lsa-<slug>/SKILL.md
 *
 * NOTE: per-process agents share the workspace because they don't
 * need their own persona files — the n8n workflow carries the per-
 * call instructions via the message body. The SOUL.md is a static
 * reference doc the agent loads once at session start.
 */

import type { ProcessIR } from './process-ir';

export interface OpenclawAgentEntry {
  id: string;
  name: string;
  workspace: string;
  model: { primary: string };
}

export function emitOpenclawEntry(ir: ProcessIR): OpenclawAgentEntry {
  return {
    id: ir.agentId,
    name: `${ir.name} Process Executor`,
    workspace: '/root/.openclaw/workspace',
    model: { primary: 'deepseek/MiniMax-M2.7' },
  };
}
