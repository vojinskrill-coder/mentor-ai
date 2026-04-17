import { Test, TestingModule } from '@nestjs/testing';
import {
  PlatformConfigService,
  ConfigurationError,
} from './platform-config.service';

// Sample yaml that mirrors the real config but with test values baked in
const TEST_YAML = `
relay:
  host: \${RELAY_HOST}
  port: \${RELAY_PORT:3100}
  authToken: \${RELAY_AUTH_TOKEN}
  timeoutSeconds: \${RELAY_TIMEOUT:600}

vault:
  storageBackend: \${VAULT_BACKEND:ssh}
  sshHost: \${VAULT_SSH_HOST}
  sshUser: \${VAULT_SSH_USER:root}
  sshKeyPath: \${VAULT_SSH_KEY}
  basePath: /root/.openclaw-{tenantId}/vault

qdrant:
  host: \${QDRANT_URL}
  apiKey: \${QDRANT_API_KEY}
  collectionPrefix: concepts
  vectorDimension: 1536

enrichment:
  concurrency: \${ENRICHMENT_CONCURRENCY:1}
  sessionStrategy: persistent
  compactionInterval: 20
  maxRetries: 2
  guardrails:
    minWords: 4500
    minChars: 15000
    language: english
    requireSources: true
    requireFrontmatter: true

timeouts:
  enrichmentTimeout: \${ENRICHMENT_TIMEOUT:600}
  sshTimeout: \${SSH_TIMEOUT:30}
  relayTimeout: \${RELAY_TIMEOUT:600}
`;

const mockReadFileSync = jest.fn();

jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    readFileSync: (...args: unknown[]) => mockReadFileSync(...args),
  };
});

describe('PlatformConfigService', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    mockReadFileSync.mockReturnValue(TEST_YAML);
    // Set required env vars that have no defaults
    process.env['RELAY_HOST'] = 'relay.test.io';
    process.env['RELAY_AUTH_TOKEN'] = 'tok-abc';
    process.env['VAULT_SSH_HOST'] = '10.0.0.1';
    process.env['VAULT_SSH_KEY'] = '/keys/id_rsa';
    process.env['QDRANT_URL'] = 'http://qdrant:6333';
    process.env['QDRANT_API_KEY'] = 'qd-key';
  });

  afterEach(() => {
    process.env = originalEnv;
    mockReadFileSync.mockReset();
  });

  function createService(): PlatformConfigService {
    return new PlatformConfigService();
  }

  // ── env override beats yaml default ─────────────────────────────────────

  it('env override beats yaml default', () => {
    process.env['RELAY_PORT'] = '9999';
    const svc = createService();
    expect(svc.getRelayConfig().port).toBe(9999);
  });

  // ── yaml default used when env not set ──────────────────────────────────

  it('yaml default used when env not set', () => {
    delete process.env['RELAY_PORT'];
    const svc = createService();
    expect(svc.getRelayConfig().port).toBe(3100);
  });

  // ── missing required key throws ConfigurationError ──────────────────────

  it('missing required key throws ConfigurationError', () => {
    delete process.env['RELAY_HOST'];
    const svc = createService();
    expect(() => svc.getRelayConfig()).toThrow(ConfigurationError);
    expect(() => svc.getRelayConfig()).toThrow('Missing required config key: relay.host');
  });

  // ── tenantId interpolated in basePath ───────────────────────────────────

  it('tenantId interpolated in vault basePath', () => {
    const svc = createService();
    const vault = svc.getVaultConfig('acme-corp');
    expect(vault.basePath).toBe('/root/.openclaw-acme-corp/vault');
  });

  // ── getEnrichmentConfig().guardrails returns all fields ─────────────────

  it('getEnrichmentConfig().guardrails returns all fields', () => {
    const svc = createService();
    const enrichment = svc.getEnrichmentConfig();
    expect(enrichment.guardrails).toEqual({
      minWords: 4500,
      minChars: 15000,
      language: 'english',
      requireSources: true,
      requireFrontmatter: true,
    });
    expect(enrichment.concurrency).toBe(1);
    expect(enrichment.sessionStrategy).toBe('persistent');
    expect(enrichment.compactionInterval).toBe(20);
    expect(enrichment.maxRetries).toBe(2);
  });

  // ── getTimeouts() returns all fields ────────────────────────────────────

  it('getTimeouts() returns all fields', () => {
    const svc = createService();
    const timeouts = svc.getTimeouts();
    expect(timeouts).toEqual({
      enrichmentTimeout: 600,
      sshTimeout: 30,
      relayTimeout: 600,
    });
  });

  // ── singleton check via NestJS DI ───────────────────────────────────────

  it('NestJS provides singleton instance', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [PlatformConfigService],
    }).compile();

    const a = module.get<PlatformConfigService>(PlatformConfigService);
    const b = module.get<PlatformConfigService>(PlatformConfigService);
    expect(a).toBe(b);
  });

  // ── graceful fallback when yaml file missing ────────────────────────────

  it('handles missing yaml file gracefully', () => {
    mockReadFileSync.mockImplementation(() => {
      throw new Error('ENOENT');
    });
    // Config is empty so section lookup fails
    expect(() => createService().getRelayConfig()).toThrow(ConfigurationError);
  });

  // ── vault defaults ─────────────────────────────────────────────────────

  it('vault uses default storageBackend and sshUser', () => {
    const svc = createService();
    const vault = svc.getVaultConfig('t1');
    expect(vault.storageBackend).toBe('ssh');
    expect(vault.sshUser).toBe('root');
  });

  // ── env override for enrichment concurrency ─────────────────────────────

  it('env override for enrichment concurrency', () => {
    process.env['ENRICHMENT_CONCURRENCY'] = '4';
    const svc = createService();
    expect(svc.getEnrichmentConfig().concurrency).toBe(4);
  });
});
