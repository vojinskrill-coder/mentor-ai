import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface OpenClawResult {
  success: boolean;
  output: string;
  durationMs: number;
  usage?: { input?: number; output?: number; total?: number };
  runId?: string;
  error?: string;
}

@Injectable()
export class OpenClawClientService {
  private readonly logger = new Logger(OpenClawClientService.name);
  private readonly relayUrl: string;
  private readonly authToken: string;
  private readonly timeoutSeconds: number;

  constructor(private readonly configService: ConfigService) {
    this.relayUrl = this.configService.get<string>('OPENCLAW_RELAY_URL') ?? '';
    this.authToken = this.configService.get<string>('OPENCLAW_AUTH_TOKEN') ?? '';
    this.timeoutSeconds = parseInt(
      this.configService.get<string>('OPENCLAW_TIMEOUT_SECONDS') ?? '600',
      10
    );
  }

  isConfigured(): boolean {
    return !!this.authToken && !!this.relayUrl;
  }

  async executeAgent(
    message: string,
    options?: { agentId?: string; timeoutSeconds?: number }
  ): Promise<OpenClawResult> {
    const agentId = options?.agentId ?? 'main';
    const timeout = options?.timeoutSeconds ?? this.timeoutSeconds;

    this.logger.log({
      message: 'Sending to OpenClaw relay',
      agentId,
      msgLength: message.length,
      timeoutSeconds: timeout,
    });

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), (timeout + 30) * 1000);

    try {
      const response = await fetch(this.relayUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.authToken}`,
        },
        body: JSON.stringify({ message, agentId, timeoutSeconds: timeout }),
        signal: controller.signal,
      });

      const data = await response.json();

      if (!response.ok) {
        this.logger.error({
          message: 'OpenClaw relay error',
          status: response.status,
          error: data.error,
        });
        return {
          success: false,
          output: '',
          durationMs: data.durationMs ?? 0,
          error: data.error ?? `HTTP ${response.status}`,
        };
      }

      this.logger.log({
        message: 'OpenClaw relay success',
        durationMs: data.durationMs,
        outputLength: data.output?.length ?? 0,
        runId: data.runId,
      });

      return data as OpenClawResult;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      this.logger.error({ message: 'OpenClaw relay call failed', error: errorMessage });
      return {
        success: false,
        output: '',
        durationMs: 0,
        error: errorMessage,
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
