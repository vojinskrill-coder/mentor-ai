import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';

export interface AgentGuardrails {
  maxTokensPerCall: number;
  maxRetriesPerStep: number;
  requireValidation: boolean;
  requireSelfCorrection: boolean;
}

export interface AgentDefinition {
  id: string;
  name: string;
  description: string;
  soulTemplate: string;
  skills: string[];
  guardrails: AgentGuardrails;
}

interface AgentRegistryYaml {
  agents: AgentDefinition[];
}

@Injectable()
export class AgentRegistryService implements OnModuleInit {
  private readonly logger = new Logger(AgentRegistryService.name);
  private agents: Map<string, AgentDefinition> = new Map();
  private registryPath: string;

  constructor() {
    this.registryPath = path.resolve(
      process.cwd(),
      'openclaw-config',
      'agent-registry.yaml',
    );
  }

  onModuleInit(): void {
    this.loadRegistry();
  }

  loadRegistry(registryPath?: string): void {
    const filePath = registryPath || this.registryPath;
    if (!fs.existsSync(filePath)) {
      throw new Error(`Agent registry not found at ${filePath}`);
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = yaml.load(raw) as AgentRegistryYaml;

    this.agents.clear();
    for (const agent of parsed.agents) {
      this.agents.set(agent.id, agent);
    }
    this.logger.log(`Loaded ${this.agents.size} agents from registry`);
  }

  getAgent(id: string): AgentDefinition | undefined {
    return this.agents.get(id);
  }

  getAllAgents(): AgentDefinition[] {
    return Array.from(this.agents.values());
  }

  getAgentGuardrails(id: string): AgentGuardrails | undefined {
    const agent = this.agents.get(id);
    return agent?.guardrails;
  }
}
