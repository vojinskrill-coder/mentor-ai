import { emitSoulMd } from './emit-soul-md';
import type { ProcessIR } from './process-ir';

describe('emitSoulMd', () => {
  const baseIR: ProcessIR = {
    slug: 'test-process',
    name: 'Test Process',
    description: 'A test process',
    agentId: 'proc-test-process',
    tenantId: 'tnt_test',
    inputContract: { type: 'object', properties: {} },
    outputManifest: {},
    brainCalls: [
      {
        index: 1,
        name: 'Search Step',
        id: 'search-step',
        callType: 'brain',
        instruction: 'Search for items',
        inputBindings: [],
        outputSchema: {},
        thinking: 'medium',
        timeoutSeconds: 300,
        mcpToolSlug: 'apollo-io',
        mcpOperationId: 'search_organizations',
      },
    ],
    syntheticTestInput: {},
    tools: ['apollo-io'],
  };

  it('should include business context when provided', () => {
    const result = emitSoulMd(baseIR, {
      businessContext: {
        companyName: 'Acme Corp',
        industry: 'Technology',
        description: 'A tech company',
        products: ['Widget A', 'Widget B'],
        targetClients: ['Enterprise', 'SMB'],
        geography: 'Europe',
      },
    });

    expect(result).toContain('Acme Corp');
    expect(result).toContain('Technology');
    expect(result).toContain('A tech company');
    expect(result).toContain('Widget A, Widget B');
    expect(result).toContain('Enterprise, SMB');
    expect(result).toContain('Europe');
  });

  it('should NOT contain hardcoded Luxury Statues Adria', () => {
    const result = emitSoulMd(baseIR, {
      businessContext: {
        companyName: 'Acme Corp',
        industry: 'Technology',
      },
    });

    expect(result).not.toContain('Luxury Statues Adria');
  });

  it('should use company name in agent identity line', () => {
    const result = emitSoulMd(baseIR, {
      businessContext: { companyName: 'Acme Corp' },
    });

    expect(result).toContain('process executor** for Acme Corp');
  });

  it('should use fallback when no business context provided', () => {
    const result = emitSoulMd(baseIR);

    expect(result).toContain('process executor** for the business');
    expect(result).toContain('No business context available');
  });

  it('should not generate blank lines for missing optional fields', () => {
    const result = emitSoulMd(baseIR, {
      businessContext: {
        companyName: 'Acme Corp',
        industry: 'Tech',
        // No products, targetClients, geography
      },
    });

    // Should not have consecutive blank lines in the business context section
    const contextSection = result.split('## Business Context')[1]?.split('---')[0] ?? '';
    expect(contextSection).not.toMatch(/\n\n\n/); // No triple newlines
  });

  it('should include self-validation protocol', () => {
    const result = emitSoulMd(baseIR);

    expect(result).toContain('autonomous self-validating agent');
    expect(result).toContain('validation gates');
    expect(result).toContain('Self-correction rules');
    expect(result).toContain('End-of-execution validation');
  });

  it('should include MCP gateway section when tools are used', () => {
    const result = emitSoulMd(baseIR);

    expect(result).toContain('MCP Gateway');
    expect(result).toContain('exec curl');
  });

  it('should include all brain call shapes', () => {
    const result = emitSoulMd(baseIR);

    expect(result).toContain('Search Step');
    expect(result).toContain('Search for items');
  });
});
