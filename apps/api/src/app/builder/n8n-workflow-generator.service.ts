import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { DesignPayload } from './process-draft.service';
import type {
  N8nWorkflowDef,
  N8nNode,
} from '../n8n/n8n-orchestrator.service';

/**
 * Generates an n8n workflow JSON from a builder design.json, following
 * the 5-slot skeleton documented in
 * `neuron-process-builder/references/n8n-workflow-generation.md`:
 *
 *   Trigger → Context → Task (1..N) → Approval → Write (1..N) → Callback
 *
 * Pure function — no side effects, no network calls. Call this before
 * handing the result to N8nOrchestratorService.createWorkflow().
 */
@Injectable()
export class N8nWorkflowGeneratorService {
  private readonly logger = new Logger(N8nWorkflowGeneratorService.name);

  generate(
    design: DesignPayload,
    opts: {
      tenantId: string;
      callbackBaseUrl: string;
      credentialIds?: Record<string, { id: string; name: string }>; // toolSlug → n8n credential ref
    },
  ): N8nWorkflowDef {
    if (!Array.isArray(design.steps) || design.steps.length === 0) {
      throw new BadRequestException('design.steps is empty');
    }

    const nodes: N8nNode[] = [];
    const connections: N8nWorkflowDef['connections'] = {};
    let x = 240;
    const y = 300;
    const step = 220;
    let nodeIndex = 0;

    const addConnection = (fromName: string, toName: string) => {
      const existing = connections[fromName] ?? { main: [[]] };
      if (!existing.main[0]) existing.main[0] = [];
      existing.main[0].push({
        node: toName,
        type: 'main',
        index: 0,
      });
      connections[fromName] = existing;
    };

    // ── Slot 1: Trigger ──────────────────────────────────────────
    const triggerType = design.trigger?.type ?? 'manual';
    const triggerName = triggerType === 'cron' ? 'Schedule' : 'Webhook';
    const triggerNode: N8nNode = {
      id: `node_${nodeIndex++}`,
      name: triggerName,
      type:
        triggerType === 'cron'
          ? 'n8n-nodes-base.cron'
          : 'n8n-nodes-base.webhook',
      typeVersion: 1,
      position: [x, y],
      parameters:
        triggerType === 'cron'
          ? {
              triggerTimes: {
                item: [
                  {
                    mode: 'custom',
                    cronExpression:
                      design.trigger?.cronSchedule || '0 9 * * 1',
                  },
                ],
              },
            }
          : {
              httpMethod: 'POST',
              path: `builder/${design.slug}`,
              responseMode: 'onReceived',
            },
    };
    nodes.push(triggerNode);
    x += step;

    // ── Slot 2: Context (Set node normalising input/processConfig) ─
    const contextNode: N8nNode = {
      id: `node_${nodeIndex++}`,
      name: 'Context',
      type: 'n8n-nodes-base.set',
      typeVersion: 2,
      position: [x, y],
      parameters: {
        options: {},
        values: {
          string: [
            { name: 'tenantId', value: '={{ $json.tenantId }}' },
            { name: 'runId', value: '={{ $json.runId }}' },
            { name: 'processSlug', value: `={{ $json.processSlug || "${design.slug}" }}` },
          ],
          object: [
            { name: 'input', value: '={{ $json.input }}' },
            { name: 'processConfig', value: '={{ $json.processConfig }}' },
          ],
        },
      },
    };
    nodes.push(contextNode);
    addConnection(triggerName, 'Context');
    x += step;

    // ── Slots 3 + 4 + 5: Task / Approval / Write ─────────────────
    // Walk the design.steps in order. Each step becomes one node.
    // APPROVAL_GATE → Wait node. MCP read/search → corresponding MCP
    // node. MCP write → MCP write node.
    let prevName = 'Context';
    for (const s of design.steps) {
      const stepName = this.sanitizeName(s.name || `Step ${s.index}`);
      let stepNode: N8nNode;

      if (s.stepKind === 'APPROVAL_GATE' || s.manualStep) {
        stepNode = {
          id: `node_${nodeIndex++}`,
          name: stepName,
          type: 'n8n-nodes-base.wait',
          typeVersion: 1,
          position: [x, y],
          parameters: {
            resume: 'webhook',
            options: {
              webhookSuffix: '={{ $json.runId }}',
            },
          },
        };
      } else if (s.mcpToolSlug === 'notion' && s.mcpOperationKind === 'write') {
        stepNode = this.buildNotionWriteNode(s, stepName, [x, y], nodeIndex++, opts);
      } else if (s.mcpToolSlug === 'gmail') {
        stepNode = this.buildGmailNode(s, stepName, [x, y], nodeIndex++, opts);
      } else if (s.mcpToolSlug === 'http-generic' || !s.mcpToolSlug) {
        stepNode = this.buildHttpNode(s, stepName, [x, y], nodeIndex++);
      } else {
        // Fallback: generic HTTP request placeholder for unknown tools.
        stepNode = this.buildHttpNode(s, stepName, [x, y], nodeIndex++);
      }

      nodes.push(stepNode);
      addConnection(prevName, stepName);
      prevName = stepName;
      x += step;
    }

    // ── Slot 6: Callback (HTTP POST to Neuron OS) ───────────────
    const callbackNode: N8nNode = {
      id: `node_${nodeIndex++}`,
      name: 'Notify Neuron OS',
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4,
      position: [x, y],
      parameters: {
        method: 'POST',
        url: `${opts.callbackBaseUrl}/api/v1/n8n/callback`,
        sendHeaders: true,
        headerParameters: {
          parameters: [
            { name: 'Content-Type', value: 'application/json' },
          ],
        },
        sendBody: true,
        bodyParameters: {
          parameters: [
            { name: 'runId', value: '={{ $json.runId }}' },
            { name: 'processSlug', value: design.slug },
            { name: 'status', value: 'complete' },
            { name: 'output', value: '={{ JSON.stringify($json) }}' },
          ],
        },
        options: {},
      },
    };
    nodes.push(callbackNode);
    addConnection(prevName, 'Notify Neuron OS');

    const def: N8nWorkflowDef = {
      name: `[builder] ${design.name}`,
      nodes,
      connections,
      settings: { executionOrder: 'v1' },
    };

    this.logger.log({
      message: 'Generated n8n workflow',
      slug: design.slug,
      nodeCount: nodes.length,
    });

    return def;
  }

  // ── Node builders ────────────────────────────────────────────

  private buildNotionWriteNode(
    step: DesignPayload['steps'][number],
    name: string,
    position: [number, number],
    index: number,
    opts: { credentialIds?: Record<string, { id: string; name: string }> },
  ): N8nNode {
    const credRef = opts.credentialIds?.notion;
    return {
      id: `node_${index}`,
      name,
      type: 'n8n-nodes-base.notion',
      typeVersion: 2,
      position,
      parameters: {
        resource: 'databasePage',
        operation: 'create',
        databaseId: '={{ $json.processConfig.notionDatabaseId }}',
        propertiesUi: { propertyValues: [] }, // filled at runtime by the executor
      },
      ...(credRef
        ? { credentials: { notionApi: credRef } }
        : {}),
    };
  }

  private buildGmailNode(
    step: DesignPayload['steps'][number],
    name: string,
    position: [number, number],
    index: number,
    opts: { credentialIds?: Record<string, { id: string; name: string }> },
  ): N8nNode {
    const credRef = opts.credentialIds?.gmail;
    return {
      id: `node_${index}`,
      name,
      type: 'n8n-nodes-base.gmail',
      typeVersion: 2,
      position,
      parameters: {
        resource: 'message',
        operation: step.mcpOperationId || 'send',
      },
      ...(credRef ? { credentials: { gmailOAuth2: credRef } } : {}),
    };
  }

  private buildHttpNode(
    step: DesignPayload['steps'][number],
    name: string,
    position: [number, number],
    index: number,
  ): N8nNode {
    return {
      id: `node_${index}`,
      name,
      type: 'n8n-nodes-base.httpRequest',
      typeVersion: 4,
      position,
      parameters: {
        method: 'GET',
        url: '={{ $json.input.url }}',
        options: {},
      },
    };
  }

  private sanitizeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, 60) || 'Step';
  }
}
