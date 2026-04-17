const { execSync } = require('child_process');

function gitGrep(file, pattern) {
  try {
    const out = execSync(`git show HEAD:${file}`, { encoding: 'utf-8', maxBuffer: 10*1024*1024 });
    const matches = out.match(new RegExp(pattern, 'gi'));
    return matches ? matches.length : 0;
  } catch { return -1; }
}

console.log('=== MISSING MODIFICATIONS CHECK ===\n');

const checks = [
  ['headless-executor: Executing (not Serbian)', 'apps/api/src/app/maturity/headless-executor.service.ts', 'Executing:', 1],
  ['headless-executor: NO Izvrsavanje', 'apps/api/src/app/maturity/headless-executor.service.ts', 'Izvršavanje', 0],
  ['maturity-engine: Enrich (not Serbian)', 'apps/api/src/app/maturity/maturity-engine.service.ts', 'content: .Enrich:', 1],
  ['maturity-engine: NO Istrazi', 'apps/api/src/app/maturity/maturity-engine.service.ts', 'Istraži koncept', 0],
  ['knowledge.controller: uses VaultStorage', 'apps/api/src/app/knowledge/knowledge.controller.ts', 'VAULT_STORAGE|vault-storage', 0],
  ['tenant-guard: uses ContentValidation', 'apps/api/src/app/vault/tenant-guard.service.ts', 'ContentValidationService', 0],
  ['vault-provisioner: uses TemplateService', 'apps/api/src/app/vault/vault-provisioner.service.ts', 'TemplateService', 0],
  ['onboarding.module: imports orchestrator', 'apps/api/src/app/onboarding/onboarding.module.ts', 'OnboardingOrchestrator', 0],
  ['maturity.module: imports EnrichmentQueue', 'apps/api/src/app/maturity/maturity.module.ts', 'EnrichmentQueue', 0],
  ['vault.module: imports VaultStorage', 'apps/api/src/app/vault/vault.module.ts', 'VaultStorageModule', 0],
  ['knowledge.module: imports VaultStorage', 'apps/api/src/app/knowledge/knowledge.module.ts', 'VaultStorageModule', 0],
  ['persona-prompts: NO Serbian', 'apps/api/src/app/personas/templates/persona-prompts.ts', 'Ti si|srpsk', 0],
  ['workflow.service: NO Serbian', 'apps/api/src/app/workflow/workflow.service.ts', 'SRPSKOM|Generiši|srpsk', 0],
  ['agent-prompt.service: NO Serbian', 'apps/api/src/app/agent-execution/agent-prompt.service.ts', 'srpsk|konzultan', 0],
  ['bridge.service: NO Serbian', 'apps/api/src/app/bridge/bridge.service.ts', 'Završ|Direktor|Izvršavanje', 0],
  ['conversation.gateway: NO Serbian labels', 'apps/api/src/app/conversation/conversation.gateway.ts', 'Zadatak[^s]|Razgovor', 0],
  ['onboarding.service: NO Serbian prompts', 'apps/api/src/app/onboarding/onboarding.service.ts', 'Napiši|klijenta po imenu|srpsk', 0],
];

let missing = 0;
for (const [name, file, pattern, expectZero] of checks) {
  const count = gitGrep(file, pattern);
  if (expectZero === 0 && count > 0) {
    console.log(`  ✗ ${name} — found ${count} matches (should be 0, NOT committed)`);
    missing++;
  } else if (expectZero > 0 && count === 0) {
    console.log(`  ✗ ${name} — NOT found (should exist, NOT committed)`);
    missing++;
  } else {
    console.log(`  ✓ ${name}`);
  }
}

console.log(`\n${missing === 0 ? '✓ ALL MODIFICATIONS COMMITTED' : `✗ ${missing} MODIFICATIONS MISSING`}`);
