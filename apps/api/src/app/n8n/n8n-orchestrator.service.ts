import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { fetch as undiciFetch } from 'undici';

// ════════════════════════════════════════════
//  n8n Type Definitions
// ════════════════════════════════════════════

export interface N8nNode {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  parameters: Record<string, any>;
  credentials?: Record<string, { id: string; name: string }>;
  /** When true, n8n continues to next node even if this one fails (HTTP 4xx/5xx) */
  continueOnFail?: boolean;
}

export interface N8nWorkflowDef {
  name: string;
  nodes: N8nNode[];
  connections: Record<
    string,
    { main: Array<Array<{ node: string; type: string; index: number }>> }
  >;
  settings?: { executionOrder?: string };
}

export interface N8nWorkflow extends N8nWorkflowDef {
  id: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface N8nExecution {
  id: string;
  finished: boolean;
  mode: string;
  status: 'waiting' | 'running' | 'success' | 'error' | 'canceled';
  startedAt: string;
  stoppedAt?: string;
  workflowId: string;
  data?: { resultData?: { runData?: Record<string, any> } };
}

// ════════════════════════════════════════════
//  N8nOrchestratorService
// ════════════════════════════════════════════

@Injectable()
export class N8nOrchestratorService {
  private readonly logger = new Logger(N8nOrchestratorService.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly webhookBaseUrl: string;

  constructor(
    private readonly config: ConfigService,
  ) {
    this.baseUrl = this.config.get<string>('N8N_BASE_URL', 'http://localhost:5678');
    this.apiKey = this.config.get<string>('N8N_API_KEY', '');
    this.webhookBaseUrl =
      this.config.get<string>('N8N_WEBHOOK_BASE_URL') || this.baseUrl;

    if (!this.apiKey) {
      this.logger.warn('N8N_API_KEY is not set — API calls to n8n will fail');
    }
  }

  // ─── Workflow CRUD ─────────────────────────

  // ─── Generic fetch helper ──────────────────

  private async request<T>(method: string, url: string, body?: unknown, opts?: { timeout?: number; headers?: Record<string, string> }): Promise<T> {
    const headers = { ...this.apiHeaders(), ...(opts?.headers ?? {}) };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), opts?.timeout ?? 30_000);

    try {
      const response = await undiciFetch(url, {
        method,
        headers,
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });

      const text = await response.text();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${text.substring(0, 500)}`);
      }

      return text ? JSON.parse(text) as T : {} as T;
    } finally {
      clearTimeout(timer);
    }
  }

  // ─── Workflow CRUD ─────────────────────────

  async createWorkflow(workflow: N8nWorkflowDef): Promise<N8nWorkflow> {
    this.logger.log(`Creating workflow: ${workflow.name}`);
    const data = await this.request<N8nWorkflow>('POST', `${this.baseUrl}/api/v1/workflows`, workflow);
    this.logger.log(`Workflow created: id=${data.id} name=${data.name}`);
    return data;
  }

  async updateWorkflow(workflowId: string, workflow: N8nWorkflowDef): Promise<N8nWorkflow> {
    this.logger.log(`Updating workflow in-place: ${workflowId}`);
    const data = await this.request<N8nWorkflow>('PUT', `${this.baseUrl}/api/v1/workflows/${workflowId}`, workflow);
    this.logger.log(`Workflow updated: id=${data.id} name=${data.name}`);
    return data;
  }

  async activateWorkflow(workflowId: string): Promise<void> {
    this.logger.log(`Activating workflow: ${workflowId}`);
    await this.request('POST', `${this.baseUrl}/api/v1/workflows/${workflowId}/activate`, {});
    this.logger.log(`Workflow activated: ${workflowId}`);
  }

  async deactivateWorkflow(workflowId: string): Promise<void> {
    this.logger.log(`Deactivating workflow: ${workflowId}`);
    await this.request('POST', `${this.baseUrl}/api/v1/workflows/${workflowId}/deactivate`, {});
  }

  async deleteWorkflow(workflowId: string): Promise<void> {
    this.logger.log(`Deleting workflow: ${workflowId}`);
    await this.request('DELETE', `${this.baseUrl}/api/v1/workflows/${workflowId}`);
  }

  async getWorkflow(workflowId: string): Promise<N8nWorkflow> {
    return this.request<N8nWorkflow>('GET', `${this.baseUrl}/api/v1/workflows/${workflowId}`);
  }

  // ─── Trigger Execution ─────────────────────

  async triggerWorkflow(webhookPath: string, payload: Record<string, any>): Promise<any> {
    this.logger.log(`Triggering workflow via webhook: ${webhookPath}`);
    return this.request('POST', `${this.webhookBaseUrl}/webhook/${webhookPath}`, payload);
  }

  async triggerAndWait(webhookPath: string, payload: Record<string, any>, timeoutMs = 120_000): Promise<any> {
    this.logger.log(`Triggering workflow (wait mode): ${webhookPath}`);
    return this.request('POST', `${this.webhookBaseUrl}/webhook/${webhookPath}`, payload, { timeout: timeoutMs });
  }

  // ─── Execution Monitoring ──────────────────

  async getExecution(executionId: string, includeData = false): Promise<N8nExecution> {
    const qs = includeData ? '?includeData=true' : '';
    return this.request<N8nExecution>('GET', `${this.baseUrl}/api/v1/executions/${executionId}${qs}`);
  }

  async listExecutions(workflowId?: string, status?: string): Promise<N8nExecution[]> {
    const params = new URLSearchParams();
    if (workflowId) params.set('workflowId', workflowId);
    if (status) params.set('status', status);
    const qs = params.toString() ? `?${params.toString()}` : '';
    const result = await this.request<{ data: N8nExecution[] }>('GET', `${this.baseUrl}/api/v1/executions${qs}`);
    return result.data ?? [];
  }

  async waitForExecution(executionId: string, maxWaitMs = 300_000, pollIntervalMs = 2_000): Promise<N8nExecution> {
    this.logger.log(`Waiting for execution ${executionId} (max ${maxWaitMs}ms)`);
    const deadline = Date.now() + maxWaitMs;
    let interval = pollIntervalMs;
    let attempts = 0;

    while (Date.now() < deadline) {
      attempts++;
      try {
        const exec = await this.getExecution(executionId, true);
        if (exec.finished || ['success', 'error', 'canceled'].includes(exec.status)) {
          this.logger.log(`Execution ${executionId} → ${exec.status} after ${attempts} polls`);
          return exec;
        }
        if (exec.status === 'waiting') return exec;
      } catch (err) {
        this.logger.warn(`Poll #${attempts} failed: ${(err as Error).message}`);
      }
      await new Promise(r => setTimeout(r, Math.min(interval, 30_000)));
      interval = Math.min(interval * 1.5, 30_000);
    }

    throw new Error(`Execution ${executionId} timed out after ${maxWaitMs}ms`);
  }

  // ─── Approval / Resume ─────────────────────

  async resumeExecution(resumeWebhookUrl: string, payload: Record<string, any>): Promise<any> {
    this.logger.log(`Resuming execution via: ${resumeWebhookUrl}`);
    return this.request('POST', resumeWebhookUrl, payload);
  }

  async stopExecution(executionId: string): Promise<void> {
    this.logger.log(`Stopping execution: ${executionId}`);
    await this.request('POST', `${this.baseUrl}/api/v1/executions/${executionId}/stop`, {});
  }

  // ─── Health ────────────────────────────────

  async checkHealth(): Promise<boolean> {
    try {
      await this.request('GET', `${this.baseUrl}/healthz`, undefined, { timeout: 5_000 });
      return true;
    } catch {
      return false;
    }
  }

  // ─── Internal ──────────────────────────────

  private apiHeaders(): Record<string, string> {
    return { 'X-N8N-API-KEY': this.apiKey, 'Content-Type': 'application/json' };
  }
}
