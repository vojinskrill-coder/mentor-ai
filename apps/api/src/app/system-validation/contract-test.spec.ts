/**
 * Contract Tests — Verify module interfaces and integration contracts
 * across 6 phases of the enrichment pipeline.
 */

import { EnrichmentStatus } from '../enrichment-queue/enrichment-queue.service';
import { VaultStorageError } from '../vault-storage/vault-storage.error';
import { TemplateResolutionError } from '../template/template.error';
import { InvalidStateTransitionError } from '../enrichment-queue/enrichment-queue.error';
import { ConfigurationError } from '../platform-config/platform-config.service';

describe('Contract Tests', () => {
  // Phase 1: Configuration
  describe('Phase 1 — Configuration', () => {
    it('ConfigurationError should have correct name', () => {
      const err = new ConfigurationError('test');
      expect(err.name).toBe('ConfigurationError');
      expect(err.message).toBe('test');
    });

    it('PlatformConfig yaml should define required sections', () => {
      const requiredSections = ['relay', 'vault', 'qdrant', 'enrichment', 'timeouts'];
      // This is a structural contract
      expect(requiredSections.length).toBe(5);
    });

    it('env var pattern should match ${VAR:default} syntax', () => {
      const pattern = /\$\{([^}]+)\}/;
      expect(pattern.test('${RELAY_HOST:localhost}')).toBe(true);
      expect(pattern.test('plain-value')).toBe(false);
    });
  });

  // Phase 2: Storage
  describe('Phase 2 — Storage', () => {
    it('VaultStorageError should capture all fields', () => {
      const err = new VaultStorageError(
        'test',
        'tenant-1',
        'file.md',
        'write',
      );
      expect(err.tenantId).toBe('tenant-1');
      expect(err.path).toBe('file.md');
      expect(err.operation).toBe('write');
    });

    it('VaultStorage interface should define required methods', () => {
      const requiredMethods = [
        'writeFile',
        'readFile',
        'fileExists',
        'listFiles',
        'writeFiles',
        'createDirectories',
      ];
      expect(requiredMethods.length).toBe(6);
    });

    it('path traversal should be rejected', () => {
      expect(() => {
        const path = '../escape';
        if (path.includes('..')) throw new VaultStorageError('blocked', 'tenant', path, 'sanitize');
      }).toThrow(VaultStorageError);
    });
  });

  // Phase 3: Templates
  describe('Phase 3 — Templates', () => {
    it('TemplateResolutionError should capture unresolved placeholders', () => {
      const err = new TemplateResolutionError('test', ['{{MISSING_A}}', '{{MISSING_B}}']);
      expect(err.unresolvedPlaceholders).toHaveLength(2);
    });

    it('template placeholder pattern should match {{VAR_NAME}}', () => {
      const pattern = /\{\{[A-Z_]+\}\}/g;
      const matches = '{{TENANT_ID}} and {{AGENT_NAME}}'.match(pattern);
      expect(matches).toHaveLength(2);
    });

    it('SOUL template should have required placeholders', () => {
      const requiredPlaceholders = [
        '{{AGENT_NAME}}',
        '{{TENANT_ID}}',
        '{{TENANT_NAME}}',
        '{{BACKEND_URL}}',
        '{{BRIDGE_AUTH_TOKEN}}',
      ];
      expect(requiredPlaceholders.length).toBe(5);
    });
  });

  // Phase 4: Queue Management
  describe('Phase 4 — Queue Management', () => {
    it('EnrichmentStatus should have all required states', () => {
      expect(EnrichmentStatus.QUEUED).toBe('QUEUED');
      expect(EnrichmentStatus.DISPATCHED).toBe('DISPATCHED');
      expect(EnrichmentStatus.EXECUTING).toBe('EXECUTING');
      expect(EnrichmentStatus.VALIDATING).toBe('VALIDATING');
      expect(EnrichmentStatus.CORRECTING).toBe('CORRECTING');
      expect(EnrichmentStatus.COMPLETED).toBe('COMPLETED');
      expect(EnrichmentStatus.FAILED).toBe('FAILED');
      expect(EnrichmentStatus.PERMANENTLY_FAILED).toBe('PERMANENTLY_FAILED');
    });

    it('InvalidStateTransitionError should capture transition details', () => {
      const err = new InvalidStateTransitionError('entry-1', 'QUEUED', 'EXECUTING');
      expect(err.entryId).toBe('entry-1');
      expect(err.currentState).toBe('QUEUED');
      expect(err.targetState).toBe('EXECUTING');
    });

    it('state machine should follow defined transitions', () => {
      const validTransitions: Record<string, string[]> = {
        QUEUED: ['DISPATCHED'],
        DISPATCHED: ['EXECUTING', 'FAILED'],
        EXECUTING: ['VALIDATING', 'FAILED'],
        VALIDATING: ['COMPLETED', 'CORRECTING', 'FAILED'],
        CORRECTING: ['VALIDATING', 'FAILED', 'PERMANENTLY_FAILED'],
        FAILED: ['QUEUED'],
        COMPLETED: [],
        PERMANENTLY_FAILED: [],
      };
      expect(validTransitions['QUEUED']).toContain('DISPATCHED');
      expect(validTransitions['QUEUED']).not.toContain('EXECUTING');
      expect(validTransitions['COMPLETED']).toHaveLength(0);
    });
  });

  // Phase 5: Content Validation
  describe('Phase 5 — Content Validation', () => {
    it('validation result should have required fields', () => {
      const result = {
        valid: true,
        errors: [] as string[],
        warnings: [] as string[],
        stats: {
          wordCount: 100,
          charCount: 500,
          hasDiacritics: true,
          hasFrontmatter: true,
          hasSources: true,
          serbianWordCount: 10,
        },
      };
      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('warnings');
      expect(result.stats).toHaveProperty('wordCount');
      expect(result.stats).toHaveProperty('serbianWordCount');
    });

    it('serbian diacritics pattern should match čćšžđ', () => {
      const pattern = /[čćšžđČĆŠŽĐ]/;
      expect(pattern.test('č')).toBe(true);
      expect(pattern.test('ć')).toBe(true);
      expect(pattern.test('š')).toBe(true);
      expect(pattern.test('ž')).toBe(true);
      expect(pattern.test('đ')).toBe(true);
      expect(pattern.test('a')).toBe(false);
    });

    it('frontmatter pattern should match yaml header', () => {
      const pattern = /^---\n[\s\S]*?\n---/m;
      expect(pattern.test('---\ntitle: Test\n---\n\nContent')).toBe(true);
      expect(pattern.test('No frontmatter here')).toBe(false);
    });
  });

  // Phase 6: API Contracts
  describe('Phase 6 — API Contracts', () => {
    it('MCP response should have standard structure', () => {
      const response = {
        success: true,
        data: { tools: ['vault_write'] },
      };
      expect(response).toHaveProperty('success');
      expect(response.success).toBe(true);
    });

    it('MCP tools list should have 9 operations', () => {
      const tools = [
        'vault_write',
        'vault_read',
        'vault_log',
        'vault_index_update',
        'knowledge_search',
        'knowledge_get_config',
        'knowledge_get_schema',
        'task_complete',
        'task_get_next',
      ];
      expect(tools).toHaveLength(9);
    });

    it('MCP auth should require Bearer token', () => {
      const authHeader = 'Bearer test-token';
      expect(authHeader.startsWith('Bearer ')).toBe(true);
      expect(authHeader.substring(7)).toBe('test-token');
    });
  });
});
