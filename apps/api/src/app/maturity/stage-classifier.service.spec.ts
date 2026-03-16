import { StageClassifierService } from './stage-classifier.service';
import { MaturityStage, PersonaType } from '@mentor-ai/shared/types';

describe('StageClassifierService', () => {
  let service: StageClassifierService;

  const mockAiGateway = {
    streamCompletionWithContext: jest.fn(),
  };

  const mockPrisma = {
    tenant: { findUnique: jest.fn() },
  };

  const TENANT_ID = 'tnt_test_001';
  const USER_ID = 'usr_test_001';

  const makeConcepts = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      id: `cpt_${i}`,
      name: `Concept ${i}`,
      category: 'Finansije',
      definition: `Definition ${i}`,
    }));

  beforeEach(() => {
    jest.clearAllMocks();
    service = new StageClassifierService(
      mockAiGateway as any,
      mockPrisma as any,
    );
  });

  it('should return empty array when no concepts available', async () => {
    const result = await service.classifyForStage({
      tenantId: TENANT_ID,
      userId: USER_ID,
      stage: MaturityStage.BASIC,
      personaType: PersonaType.CFO,
      availableConcepts: [],
    });

    expect(result).toEqual([]);
    expect(mockAiGateway.streamCompletionWithContext).not.toHaveBeenCalled();
  });

  it('should call LLM with tenant context and return parsed results', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({
      name: 'Test Co', industry: 'Tech',
    });

    const llmResponse = '[{"conceptId":"cpt_0","priority":1,"rationale":"Important"}]';
    mockAiGateway.streamCompletionWithContext.mockImplementation(
      (_msgs: any, _opts: any, cb: (chunk: string) => void) => {
        cb(llmResponse);
        return Promise.resolve();
      },
    );

    const concepts = makeConcepts(3);
    const result = await service.classifyForStage({
      tenantId: TENANT_ID,
      userId: USER_ID,
      stage: MaturityStage.BASIC,
      personaType: PersonaType.CFO,
      availableConcepts: concepts,
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.conceptId).toBe('cpt_0');
    expect(result[0]!.priority).toBe(1);
  });

  it('should pass skipRateLimit and skipQuotaCheck to AI gateway', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({ name: 'T', industry: 'I' });
    mockAiGateway.streamCompletionWithContext.mockImplementation(
      (_msgs: any, _opts: any, cb: (chunk: string) => void) => {
        cb('[]');
        return Promise.resolve();
      },
    );

    await service.classifyForStage({
      tenantId: TENANT_ID,
      userId: USER_ID,
      stage: MaturityStage.BASIC,
      personaType: PersonaType.CFO,
      availableConcepts: makeConcepts(1),
    });

    expect(mockAiGateway.streamCompletionWithContext).toHaveBeenCalledWith(
      expect.any(Array),
      expect.objectContaining({
        tenantId: TENANT_ID,
        userId: USER_ID,
        skipRateLimit: true,
        skipQuotaCheck: true,
      }),
      expect.any(Function),
    );
  });

  it('should filter out conceptIds not in available concepts', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({ name: 'T', industry: 'I' });
    const llmResponse = JSON.stringify([
      { conceptId: 'cpt_0', priority: 1, rationale: 'Valid' },
      { conceptId: 'cpt_FAKE', priority: 2, rationale: 'Invalid' },
    ]);
    mockAiGateway.streamCompletionWithContext.mockImplementation(
      (_msgs: any, _opts: any, cb: (chunk: string) => void) => {
        cb(llmResponse);
        return Promise.resolve();
      },
    );

    const result = await service.classifyForStage({
      tenantId: TENANT_ID,
      userId: USER_ID,
      stage: MaturityStage.BASIC,
      personaType: PersonaType.CFO,
      availableConcepts: makeConcepts(2), // cpt_0, cpt_1
    });

    expect(result).toHaveLength(1);
    expect(result[0]!.conceptId).toBe('cpt_0');
  });

  it('should extract JSON from markdown code blocks', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({ name: 'T', industry: 'I' });
    const llmResponse = '```json\n[{"conceptId":"cpt_0","priority":1,"rationale":"R"}]\n```';
    mockAiGateway.streamCompletionWithContext.mockImplementation(
      (_msgs: any, _opts: any, cb: (chunk: string) => void) => {
        cb(llmResponse);
        return Promise.resolve();
      },
    );

    const result = await service.classifyForStage({
      tenantId: TENANT_ID,
      userId: USER_ID,
      stage: MaturityStage.BASIC,
      personaType: PersonaType.CMO,
      availableConcepts: makeConcepts(1),
    });

    expect(result).toHaveLength(1);
  });

  it('should return empty array when LLM returns no JSON', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({ name: 'T', industry: 'I' });
    mockAiGateway.streamCompletionWithContext.mockImplementation(
      (_msgs: any, _opts: any, cb: (chunk: string) => void) => {
        cb('Sorry, I cannot help with that.');
        return Promise.resolve();
      },
    );

    const result = await service.classifyForStage({
      tenantId: TENANT_ID,
      userId: USER_ID,
      stage: MaturityStage.BASIC,
      personaType: PersonaType.CFO,
      availableConcepts: makeConcepts(3),
    });

    expect(result).toEqual([]);
  });

  it('should return empty array on JSON parse error', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({ name: 'T', industry: 'I' });
    mockAiGateway.streamCompletionWithContext.mockImplementation(
      (_msgs: any, _opts: any, cb: (chunk: string) => void) => {
        cb('[{invalid json}]');
        return Promise.resolve();
      },
    );

    const result = await service.classifyForStage({
      tenantId: TENANT_ID,
      userId: USER_ID,
      stage: MaturityStage.BASIC,
      personaType: PersonaType.CFO,
      availableConcepts: makeConcepts(1),
    });

    expect(result).toEqual([]);
  });

  it('should include persona label in system prompt', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({ name: 'Acme', industry: 'Finance' });
    let capturedMessages: any[] = [];
    mockAiGateway.streamCompletionWithContext.mockImplementation(
      (msgs: any, _opts: any, cb: (chunk: string) => void) => {
        capturedMessages = msgs;
        cb('[]');
        return Promise.resolve();
      },
    );

    await service.classifyForStage({
      tenantId: TENANT_ID,
      userId: USER_ID,
      stage: MaturityStage.ADVANCED,
      personaType: PersonaType.CTO,
      availableConcepts: makeConcepts(1),
    });

    const systemMsg = capturedMessages.find((m: any) => m.role === 'system');
    expect(systemMsg.content).toContain('Chief Technology Officer');
    expect(systemMsg.content).toContain('Acme');
    expect(systemMsg.content).toContain('Finance');
    expect(systemMsg.content).toContain('ADVANCED');
  });

  it('should handle tenant not found gracefully', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue(null);
    mockAiGateway.streamCompletionWithContext.mockImplementation(
      (_msgs: any, _opts: any, cb: (chunk: string) => void) => {
        cb('[{"conceptId":"cpt_0","priority":1,"rationale":"R"}]');
        return Promise.resolve();
      },
    );

    const result = await service.classifyForStage({
      tenantId: TENANT_ID,
      userId: USER_ID,
      stage: MaturityStage.BASIC,
      personaType: PersonaType.CFO,
      availableConcepts: makeConcepts(1),
    });

    // Should still work with N/A fallbacks
    expect(result).toHaveLength(1);
  });

  it('should include stage description in prompt for each stage', async () => {
    mockPrisma.tenant.findUnique.mockResolvedValue({ name: 'T', industry: 'I' });
    let capturedMessages: any[] = [];
    mockAiGateway.streamCompletionWithContext.mockImplementation(
      (msgs: any, _opts: any, cb: (chunk: string) => void) => {
        capturedMessages = msgs;
        cb('[]');
        return Promise.resolve();
      },
    );

    await service.classifyForStage({
      tenantId: TENANT_ID,
      userId: USER_ID,
      stage: MaturityStage.AUTONOMOUS,
      personaType: PersonaType.CFO,
      availableConcepts: makeConcepts(1),
    });

    const systemMsg = capturedMessages.find((m: any) => m.role === 'system');
    expect(systemMsg.content).toContain('AUTOMATIZACIJI');
  });
});
