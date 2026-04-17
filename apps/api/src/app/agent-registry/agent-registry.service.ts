import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const yaml = require('js-yaml');

// ── Types ──────────────────────────────────────────────────────

export interface AgentConfig {
  id: string;
  role: string;
  model: string;
  capabilities: string[];
  guardrails: Record<string, unknown>;
}

// ── Service ────────────────────────────────────────────────────

@Injectable()
export class AgentRegistryService {
  private readonly logger = new Logger(AgentRegistryService.name);
  private readonly agents: Map<string, AgentConfig> = new Map();

  constructor() {
    this.loadRegistry();
  }

  /**
   * Get a single agent by ID. Throws NotFoundException if not found.
   */
  getAgent(id: string): AgentConfig {
    const agent = this.agents.get(id);
    if (!agent) {
      throw new NotFoundException(`Agent "${id}" not found in registry`);
    }
    return agent;
  }

  /**
   * Return all registered agents.
   */
  getAllAgents(): AgentConfig[] {
    return Array.from(this.agents.values());
  }

  /**
   * Return the guardrails for a specific agent.
   */
  getAgentGuardrails(id: string): Record<string, unknown> {
    return this.getAgent(id).guardrails;
  }

  // ── Private ──────────────────────────────────────────────────

  private loadRegistry(): void {
    const yamlPath = path.join(
      process.cwd(),
      'openclaw-config',
      'agent-registry.yaml',
    );

    const rawYaml = fs.readFileSync(yamlPath, 'utf-8');
    const parsed = yaml.load(rawYaml) as {
      agents: Record<string, Omit<AgentConfig, 'id'>>;
    };

    if (!parsed?.agents || typeof parsed.agents !== 'object') {
      throw new Error('agent-registry.yaml must have a top-level "agents" key');
    }

    for (const [id, entry] of Object.entries(parsed.agents)) {
      this.agents.set(id, {
        id,
        role: entry.role,
        model: entry.model,
        capabilities: entry.capabilities ?? [],
        guardrails: entry.guardrails ?? {},
      });
    }

    this.logger.log(`Loaded ${this.agents.size} agents from registry`);
  }
}
