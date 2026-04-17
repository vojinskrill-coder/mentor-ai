import { PlatformConfigService, ConfigurationError } from './platform-config.service';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('PlatformConfigService', () => {
  let service: PlatformConfigService;
  let tmpDir: string;
  let configFile: string;

  const baseConfig = `
relay:
  host: \${RELAY_HOST:localhost}
  port: \${RELAY_PORT:3100}
  authToken: \${RELAY_AUTH:defaulttoken}
  timeout: 30000

vault:
  basePath: /root/.openclaw/workspace
  tenantPath: /root/.openclaw/workspace/tenants/{{tenantId}}
  sshHost: localhost
  sshPort: 22
  sshUser: root
  sshKeyPath: ~/.ssh/id_rsa
  mode: local

qdrant:
  url: http://localhost:6333
  apiKey: testkey
  collectionName: test-collection
  embeddingDimension: 1536

enrichment:
  maxConcurrentJobs: 3
  maxRetries: 5
  retryDelayMs: 5000
  zombieTimeoutMs: 300000
  batchSize: 10
  minWords: 50
  minChars: 200
  requireDiacritics: true
  requireFrontmatter: true
  requireSources: true

timeouts:
  relayCallMs: 30000
  vaultWriteMs: 15000
  vaultReadMs: 10000
  enrichmentStepMs: 120000
  validationMs: 10000
  correctionMs: 60000

guardrails:
  maxTokensPerCall: 4096
  maxRetriesPerStep: 5
  requireValidation: true
  requireSelfCorrection: true
`;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'platform-config-test-'));
    configFile = path.join(tmpDir, 'platform-config.yaml');
    fs.writeFileSync(configFile, baseConfig);
    service = new PlatformConfigService();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.RELAY_HOST;
    delete process.env.RELAY_PORT;
    delete process.env.RELAY_AUTH;
  });

  it('should load config from yaml file', () => {
    service.loadConfig(configFile);
    const relay = service.getRelayConfig();
    expect(relay.host).toBe('localhost');
  });

  it('should resolve env var defaults', () => {
    service.loadConfig(configFile);
    const relay = service.getRelayConfig();
    expect(relay.host).toBe('localhost');
    expect(relay.port).toBe(3100);
    expect(relay.authToken).toBe('defaulttoken');
  });

  it('should override defaults with env vars', () => {
    process.env.RELAY_HOST = 'production-host';
    process.env.RELAY_PORT = '9999';
    service.loadConfig(configFile);
    const relay = service.getRelayConfig();
    expect(relay.host).toBe('production-host');
    expect(relay.port).toBe(9999);
  });

  it('should throw ConfigurationError on missing file', () => {
    expect(() => service.loadConfig('/nonexistent/path.yaml')).toThrow(
      ConfigurationError,
    );
  });

  it('should throw ConfigurationError on missing required env var', () => {
    const badConfig = `relay:\n  host: \${MISSING_REQUIRED_VAR}`;
    fs.writeFileSync(configFile, badConfig);
    expect(() => service.loadConfig(configFile)).toThrow(ConfigurationError);
  });

  it('should interpolate tenantId in vault config', () => {
    service.loadConfig(configFile);
    const vault = service.getVaultConfig('tenant-123');
    expect(vault.tenantPath).toContain('tenant-123');
    expect(vault.tenantPath).not.toContain('{{tenantId}}');
  });

  it('should return vault config without tenantId interpolation', () => {
    service.loadConfig(configFile);
    const vault = service.getVaultConfig();
    expect(vault.tenantPath).toContain('{{tenantId}}');
  });

  it('should return enrichment config with numeric types', () => {
    service.loadConfig(configFile);
    const enrichment = service.getEnrichmentConfig();
    expect(enrichment.maxConcurrentJobs).toBe(3);
    expect(enrichment.maxRetries).toBe(5);
    expect(enrichment.requireDiacritics).toBe(true);
  });

  it('should return guardrails config', () => {
    service.loadConfig(configFile);
    const guardrails = service.getGuardrailsConfig();
    expect(guardrails.maxTokensPerCall).toBe(4096);
    expect(guardrails.requireValidation).toBe(true);
  });

  it('should return timeouts config with numeric types', () => {
    service.loadConfig(configFile);
    const timeouts = service.getTimeouts();
    expect(timeouts.relayCallMs).toBe(30000);
    expect(timeouts.vaultWriteMs).toBe(15000);
    expect(timeouts.enrichmentStepMs).toBe(120000);
  });

  it('should be a singleton (same config after multiple accesses)', () => {
    service.loadConfig(configFile);
    const relay1 = service.getRelayConfig();
    const relay2 = service.getRelayConfig();
    expect(relay1).toEqual(relay2);
  });
});
