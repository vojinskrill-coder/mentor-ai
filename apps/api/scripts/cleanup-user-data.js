const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('=== Clearing user data (preserving platform concepts) ===');

  // Order matters due to foreign keys

  const aj = await prisma.agentJob.deleteMany({});
  console.log('AgentJobs deleted:', aj.count);

  const ae = await prisma.agentExecution.deleteMany({});
  console.log('AgentExecutions deleted:', ae.count);

  const adb = await prisma.agentDailyBudget.deleteMany({});
  console.log('AgentDailyBudgets deleted:', adb.count);

  const ee = await prisma.executionEvent.deleteMany({});
  console.log('ExecutionEvents deleted:', ee.count);

  const ex = await prisma.execution.deleteMany({});
  console.log('Executions deleted:', ex.count);

  const scl = await prisma.stageCompletionLog.deleteMany({});
  console.log('StageCompletionLogs deleted:', scl.count);

  const sca = await prisma.stageConceptAssignment.deleteMany({});
  console.log('StageConceptAssignments deleted:', sca.count);

  const ar = await prisma.autonomousRun.deleteMany({});
  console.log('AutonomousRuns deleted:', ar.count);

  const att = await prisma.attachment.deleteMany({});
  console.log('Attachments deleted:', att.count);

  const notes = await prisma.note.deleteMany({});
  console.log('Notes deleted:', notes.count);

  const cc = await prisma.conceptCitation.deleteMany({});
  console.log('ConceptCitations deleted:', cc.count);

  const msg = await prisma.message.deleteMany({});
  console.log('Messages deleted:', msg.count);

  const conv = await prisma.conversation.deleteMany({});
  console.log('Conversations deleted:', conv.count);

  const mem = await prisma.memory.deleteMany({});
  console.log('Memories deleted:', mem.count);

  const om = await prisma.onboardingMetric.deleteMany({});
  console.log('OnboardingMetrics deleted:', om.count);

  const inv = await prisma.invitation.deleteMany({});
  console.log('Invitations deleted:', inv.count);

  // Brain proposals
  try {
    const bp = await prisma.brainProposal.deleteMany({});
    console.log('BrainProposals deleted:', bp.count);
  } catch { console.log('BrainProposals: skipped (table may not exist)'); }

  // Token usage
  const tu = await prisma.tokenUsage.deleteMany({});
  console.log('TokenUsage deleted:', tu.count);

  // Data exports
  const de = await prisma.dataExport.deleteMany({});
  console.log('DataExports deleted:', de.count);

  // Users (before tenants due to FK)
  const users = await prisma.user.deleteMany({});
  console.log('Users deleted:', users.count);

  // Tenant registry
  const tr = await prisma.tenantRegistry.deleteMany({});
  console.log('TenantRegistry deleted:', tr.count);

  // Tenants
  const tenants = await prisma.tenant.deleteMany({});
  console.log('Tenants deleted:', tenants.count);

  console.log('');
  console.log('=== Preserved (platform data) ===');
  const concepts = await prisma.concept.count();
  const rels = await prisma.conceptRelationship.count();
  const wf = await prisma.conceptWorkflow.count();
  console.log('Concepts:', concepts);
  console.log('Relationships:', rels);
  console.log('Workflows:', wf);

  console.log('');
  console.log('=== Cleanup complete ===');
}

main().catch(console.error).finally(() => prisma.$disconnect());
