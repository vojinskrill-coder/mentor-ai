import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as yaml from 'js-yaml';
import * as fs from 'fs';
import * as path from 'path';

export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

interface RelayConfig {
  host: string;
  port: number;
  authToken: string;
  timeout: number;
}

interface VaultConfig {
  basePath: string;
  tenantPath: string;
  sshHost: string;
  sshPort: number;
  sshUser: string;
  sshKeyPath: string;
  mode: string;
}

interface QdrantConfig {
  url: string;
  apiKey: string;
  collectionName: string;
  embeddingDimension: number;
}

interface EnrichmentConfig {
  maxConcurrentJobs: number;
  maxRetries: number;
  retryDelayMs: number;
  zombieTimeoutMs: number;
  batchSize: number;
  minWords: number;
  minChars: number;
  requireDiacritics: boolean;
  requireFrontmatter: boolean;
  requireSources: boolean;
}

interface TimeoutsConfig {
  relayCallMs: number;
  vaultWriteMs: number;
  vaultReadMs: number;
  enrichmentStepMs: number;
  validationMs: number;
  correctionMs: number;
}

interface GuardrailsConfig {
  maxTokensPerCall: number;
  maxRetriesPerStep: number;
  requireValidation: boolean;
  requireSelfCorrection: boolean;
}

interface PlatformConfig {
  relay: RelayConfig;
  vault: VaultConfig & { [key: string]: unknown };
  qdrant: QdrantConfig;
  enrichment: EnrichmentConfig;
  timeouts: TimeoutsConfig;
  guardrails: GuardrailsConfig;
  [key: string]: unknown;
}

@Injectable()
export class PlatformConfigService implements OnModuleInit {
  private readonly logger = new Logger(PlatformConfigService.name);
  private config!: PlatformConfig;
  private configPath: string;

  constructor() {
    this.configPath = path.resolve(
      process.cwd(),
      'openclaw-config',
      'platform-config.yaml',
    );
  }

  onModuleInit(): void {
    this.loadConfig();
  }

  /** Load config from yaml, exposed for testing */
  loadConfig(configPath?: string): void {
    const filePath = configPath || this.configPath;
    if (!fs.existsSync(filePath)) {
      throw new ConfigurationError(
        `Platform config not found at ${filePath}`,
      );
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = yaml.load(raw) as PlatformConfig;
    this.config = this.resolveEnvVars(parsed);
    this.logger.log('Platform config loaded successfully');
  }

  private resolveEnvVars(obj: any): any {
    if (typeof obj === 'string') {
      return obj.replace(/\$\{([^}]+)\}/g, (_match, expr) => {
        const [envVar, defaultVal] = expr.split(':');
        const envValue = process.env[envVar.trim()];
        if (envValue !== undefined) return envValue;
        if (defaultVal !== undefined) return defaultVal;
        throw new ConfigurationError(
          `Missing required environment variable: ${envVar.trim()}`,
        );
      });
    }
    if (Array.isArray(obj)) {
      return obj.map((item) => this.resolveEnvVars(item));
    }
    if (obj && typeof obj === 'object') {
      const result: any = {};
      for (const [key, value] of Object.entries(obj)) {
        result[key] = this.resolveEnvVars(value);
      }
      return result;
    }
    return obj;
  }

  getRelayConfig(): RelayConfig {
    this.ensureLoaded();
    return {
      host: this.config.relay.host,
      port: Number(this.config.relay.port),
      authToken: this.config.relay.authToken,
      timeout: Number(this.config.relay.timeout),
    };
  }

  getVaultConfig(tenantId?: string): VaultConfig {
    this.ensureLoaded();
    const vault = { ...this.config.vault } as VaultConfig;
    vault.sshPort = Number(vault.sshPort);
    if (tenantId) {
      vault.tenantPath = vault.tenantPath.replace('{{tenantId}}', tenantId);
    }
    return vault;
  }

  getQdrantConfig(): QdrantConfig {
    this.ensureLoaded();
    return {
      ...this.config.qdrant,
      embeddingDimension: Number(this.config.qdrant.embeddingDimension),
    };
  }

  getEnrichmentConfig(): EnrichmentConfig {
    this.ensureLoaded();
    const e = this.config.enrichment;
    return {
      maxConcurrentJobs: Number(e.maxConcurrentJobs),
      maxRetries: Number(e.maxRetries),
      retryDelayMs: Number(e.retryDelayMs),
      zombieTimeoutMs: Number(e.zombieTimeoutMs),
      batchSize: Number(e.batchSize),
      minWords: Number(e.minWords),
      minChars: Number(e.minChars),
      requireDiacritics: e.requireDiacritics === true || String(e.requireDiacritics) === 'true',
      requireFrontmatter: e.requireFrontmatter === true || String(e.requireFrontmatter) === 'true',
      requireSources: e.requireSources === true || String(e.requireSources) === 'true',
    };
  }

  getTimeouts(): TimeoutsConfig {
    this.ensureLoaded();
    const t = this.config.timeouts;
    return {
      relayCallMs: Number(t.relayCallMs),
      vaultWriteMs: Number(t.vaultWriteMs),
      vaultReadMs: Number(t.vaultReadMs),
      enrichmentStepMs: Number(t.enrichmentStepMs),
      validationMs: Number(t.validationMs),
      correctionMs: Number(t.correctionMs),
    };
  }

  getGuardrailsConfig(): GuardrailsConfig {
    this.ensureLoaded();
    return {
      ...this.config.guardrails,
      maxTokensPerCall: Number(this.config.guardrails.maxTokensPerCall),
      maxRetriesPerStep: Number(this.config.guardrails.maxRetriesPerStep),
    };
  }

  private ensureLoaded(): void {
    if (!this.config) {
      throw new ConfigurationError('Platform config not loaded. Call loadConfig() first.');
    }
  }
}
