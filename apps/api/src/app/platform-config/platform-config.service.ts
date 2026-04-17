import { Injectable, Logger } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const yaml = require('js-yaml');
import * as fs from 'fs';
import * as path from 'path';

// ── Custom error ────────────────────────────────────────────────────────────
export class ConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigurationError';
  }
}

// ── Config interfaces ───────────────────────────────────────────────────────
export interface RelayConfig {
  host: string;
  port: number;
  authToken: string;
  timeoutSeconds: number;
}

export interface VaultConfig {
  storageBackend: string;
  sshHost: string;
  sshUser: string;
  sshKeyPath: string;
  basePath: string;
}

export interface QdrantConfig {
  host: string;
  apiKey: string;
  collectionPrefix: string;
  vectorDimension: number;
}

export interface EnrichmentGuardrails {
  minWords: number;
  minChars: number;
  language: string;
  requireSources: boolean;
  requireFrontmatter: boolean;
}

export interface EnrichmentConfig {
  concurrency: number;
  sessionStrategy: string;
  compactionInterval: number;
  maxRetries: number;
  guardrails: EnrichmentGuardrails;
}

export interface TimeoutConfig {
  enrichmentTimeout: number;
  sshTimeout: number;
  relayTimeout: number;
}

// ── Service ─────────────────────────────────────────────────────────────────
@Injectable()
export class PlatformConfigService {
  private readonly logger = new Logger(PlatformConfigService.name);
  private config: Record<string, unknown>;

  constructor() {
    this.config = this.loadConfig();
  }

  // ── Public accessors ────────────────────────────────────────────────────

  getRelayConfig(): RelayConfig {
    const relay = this.getSection('relay');
    return {
      host: this.requireString(relay, 'host', 'relay.host'),
      port: this.toNumber(relay['port'], 'relay.port'),
      authToken: this.requireString(relay, 'authToken', 'relay.authToken'),
      timeoutSeconds: this.toNumber(relay['timeoutSeconds'], 'relay.timeoutSeconds'),
    };
  }

  getVaultConfig(tenantId: string): VaultConfig {
    const vault = this.getSection('vault');
    const basePath = this.requireString(vault, 'basePath', 'vault.basePath');
    return {
      storageBackend: this.requireString(vault, 'storageBackend', 'vault.storageBackend'),
      sshHost: this.requireString(vault, 'sshHost', 'vault.sshHost'),
      sshUser: this.requireString(vault, 'sshUser', 'vault.sshUser'),
      sshKeyPath: this.requireString(vault, 'sshKeyPath', 'vault.sshKeyPath'),
      basePath: basePath.replace('{tenantId}', tenantId),
    };
  }

  getQdrantConfig(): QdrantConfig {
    const qdrant = this.getSection('qdrant');
    return {
      host: this.requireString(qdrant, 'host', 'qdrant.host'),
      apiKey: this.requireString(qdrant, 'apiKey', 'qdrant.apiKey'),
      collectionPrefix: this.requireString(qdrant, 'collectionPrefix', 'qdrant.collectionPrefix'),
      vectorDimension: this.toNumber(qdrant['vectorDimension'], 'qdrant.vectorDimension'),
    };
  }

  getEnrichmentConfig(): EnrichmentConfig {
    const enrichment = this.getSection('enrichment');
    const guardrails = enrichment['guardrails'] as Record<string, unknown> | undefined;
    if (!guardrails || typeof guardrails !== 'object') {
      throw new ConfigurationError('Missing required config section: enrichment.guardrails');
    }
    return {
      concurrency: this.toNumber(enrichment['concurrency'], 'enrichment.concurrency'),
      sessionStrategy: this.requireString(enrichment, 'sessionStrategy', 'enrichment.sessionStrategy'),
      compactionInterval: this.toNumber(enrichment['compactionInterval'], 'enrichment.compactionInterval'),
      maxRetries: this.toNumber(enrichment['maxRetries'], 'enrichment.maxRetries'),
      guardrails: {
        minWords: this.toNumber(guardrails['minWords'], 'enrichment.guardrails.minWords'),
        minChars: this.toNumber(guardrails['minChars'], 'enrichment.guardrails.minChars'),
        language: this.requireString(guardrails, 'language', 'enrichment.guardrails.language'),
        requireSources: this.toBool(guardrails['requireSources'], 'enrichment.guardrails.requireSources'),
        requireFrontmatter: this.toBool(guardrails['requireFrontmatter'], 'enrichment.guardrails.requireFrontmatter'),
      },
    };
  }

  getTimeouts(): TimeoutConfig {
    const timeouts = this.getSection('timeouts');
    return {
      enrichmentTimeout: this.toNumber(timeouts['enrichmentTimeout'], 'timeouts.enrichmentTimeout'),
      sshTimeout: this.toNumber(timeouts['sshTimeout'], 'timeouts.sshTimeout'),
      relayTimeout: this.toNumber(timeouts['relayTimeout'], 'timeouts.relayTimeout'),
    };
  }

  // ── Private helpers ─────────────────────────────────────────────────────

  private loadConfig(): Record<string, unknown> {
    const yamlPath = path.join(process.cwd(), 'openclaw-config', 'platform-config.yaml');

    let rawYaml: string;
    try {
      rawYaml = fs.readFileSync(yamlPath, 'utf8');
    } catch (err) {
      this.logger.warn(
        `platform-config.yaml not found at ${yamlPath}. Using empty config — all values must come from env vars.`,
      );
      return {};
    }

    // Resolve ${ENV_VAR} and ${ENV_VAR:default} patterns
    const resolved = rawYaml.replace(/\$\{([^}]+)\}/g, (_match, expr: string) => {
      const [envKey, ...defaultParts] = expr.split(':');
      const defaultValue = defaultParts.join(':'); // rejoin in case default contains ':'
      const envValue = envKey ? process.env[envKey] : undefined;
      if (envValue !== undefined) return envValue;
      if (defaultValue !== '') return defaultValue;
      return ''; // will be treated as missing if required
    });

    const parsed = yaml.load(resolved) as Record<string, unknown>;
    this.logger.log('Platform config loaded successfully');
    return parsed ?? {};
  }

  private getSection(key: string): Record<string, unknown> {
    const section = this.config[key];
    if (!section || typeof section !== 'object') {
      throw new ConfigurationError(`Missing required config section: ${key}`);
    }
    return section as Record<string, unknown>;
  }

  private requireString(
    obj: Record<string, unknown>,
    key: string,
    path: string,
  ): string {
    const val = obj[key];
    if (val === undefined || val === null || val === '') {
      throw new ConfigurationError(`Missing required config key: ${path}`);
    }
    return String(val);
  }

  private toNumber(val: unknown, path: string): number {
    if (val === undefined || val === null || val === '') {
      throw new ConfigurationError(`Missing required config key: ${path}`);
    }
    const num = Number(val);
    if (isNaN(num)) {
      throw new ConfigurationError(`Config key ${path} must be a number, got: ${val}`);
    }
    return num;
  }

  private toBool(val: unknown, path: string): boolean {
    if (val === undefined || val === null) {
      throw new ConfigurationError(`Missing required config key: ${path}`);
    }
    if (typeof val === 'boolean') return val;
    if (typeof val === 'string') return val.toLowerCase() === 'true';
    return Boolean(val);
  }
}
