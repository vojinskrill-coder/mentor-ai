/**
 * ProcessIR facade — single entry point for compiling design.json to
 * the four artifacts a per-process agent needs.
 *
 * Usage:
 *   const ir = compileDesignToIR(design, { tenantId });
 *   const artifacts = emitAllArtifacts(ir);
 *
 * The artifacts are returned as pure data so the caller (API
 * endpoint) can either:
 *   - return them to a skill script for writing to disk on Hetzner
 *   - POST the n8n workflow to the n8n API
 *   - persist metadata on the ProcessWorkflow row
 */

export {
  compileDesignToIR,
  type ProcessIR,
  type BrainCall,
  type BrainCallInputBinding,
} from './process-ir';
export { emitN8nWorkflow } from './emit-n8n-workflow';
export { emitSoulMd } from './emit-soul-md';
export { emitSkillMd } from './emit-skill-md';
export {
  emitOpenclawEntry,
  type OpenclawAgentEntry,
} from './emit-openclaw-entry';

import type { ProcessIR } from './process-ir';
import type { N8nWorkflowDef } from '../../n8n/n8n-orchestrator.service';
import { emitN8nWorkflow } from './emit-n8n-workflow';
import { emitSoulMd } from './emit-soul-md';
import { emitSkillMd } from './emit-skill-md';
import { emitOpenclawEntry, type OpenclawAgentEntry } from './emit-openclaw-entry';

export interface ProcessArtifacts {
  ir: ProcessIR;
  n8nWorkflow: N8nWorkflowDef;
  soulMd: string;
  skillMd: string;
  openclawEntry: OpenclawAgentEntry;
  paths: {
    soulMd: string;
    skillMd: string;
    skillDir: string;
    agentDir: string;
  };
}

export function emitAllArtifacts(
  ir: ProcessIR,
  opts?: { n8nWorkflowId?: string },
): ProcessArtifacts {
  return {
    ir,
    n8nWorkflow: emitN8nWorkflow(ir),
    soulMd: emitSoulMd(ir, opts),
    skillMd: emitSkillMd(ir),
    openclawEntry: emitOpenclawEntry(ir),
    paths: {
      agentDir: `/root/.openclaw/agents/${ir.agentId}/agent`,
      soulMd: `/root/.openclaw/agents/${ir.agentId}/agent/SOUL.md`,
      skillDir: `/root/.openclaw/workspace/skills/lsa-${ir.slug}`,
      skillMd: `/root/.openclaw/workspace/skills/lsa-${ir.slug}/SKILL.md`,
    },
  };
}
