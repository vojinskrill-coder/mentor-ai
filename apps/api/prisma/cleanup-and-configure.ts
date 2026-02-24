/**
 * Database Cleanup & RunPod Configuration Script
 *
 * 1. Deletes all user-related data (conversations, messages, memories, notes, etc.)
 * 2. Preserves platform config, concepts, concept_relationships, LLM audit logs
 * 3. Re-creates dev tenant + dev user for DEV_MODE
 * 4. Sets LLM provider to LM_STUDIO (OpenAI-compatible) pointing to RunPod endpoint
 *
 * Usage: npx ts-node prisma/cleanup-and-configure.ts
 *        npx ts-node prisma/cleanup-and-configure.ts --dry-run
 */

import { PrismaClient } from '@prisma/client';
import * as crypto from 'node:crypto';

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');

// ── Encryption (same as llm-config.service.ts) ──
const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
function getEncryptionKey(): Buffer {
  const keyHex = process.env.LLM_CONFIG_ENCRYPTION_KEY;
  if (!keyHex) {
    // Default dev key (matches llm-config.service.ts fallback)
    return Buffer.from('0'.repeat(64), 'hex');
  }
  return Buffer.from(keyHex, 'hex');
}

function _encrypt(text: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

async function main(): Promise<void> {
  console.log(dryRun ? '=== DRY RUN ===' : '=== RUNNING CLEANUP ===');

  // ── Step 1: Count existing records ──
  const counts = {
    memories: await prisma.memory.count(),
    conceptCitations: await prisma.conceptCitation.count(),
    conceptWorkflows: await prisma.conceptWorkflow.count(),
    notes: await prisma.note.count(),
    tokenUsage: await prisma.tokenUsage.count(),
    onboardingMetrics: await prisma.onboardingMetric.count(),
    messages: await prisma.message.count(),
    conversations: await prisma.conversation.count(),
    dataExports: await prisma.dataExport.count(),
    invitations: await prisma.invitation.count(),
    users: await prisma.user.count(),
    tenants: await prisma.tenant.count(),
    llmConfigs: await prisma.llmProviderConfig.count(),
  };

  console.log('\nCurrent record counts:');
  for (const [table, count] of Object.entries(counts)) {
    console.log(`  ${table}: ${count}`);
  }

  // ── Preserved tables ──
  const preservedCounts = {
    platform: await prisma.platform.count(),
    tenantRegistry: await prisma.tenantRegistry.count(),
    concepts: await prisma.concept.count(),
    conceptRelationships: await prisma.conceptRelationship.count(),
    llmConfigAuditLogs: await prisma.llmConfigAuditLog.count(),
  };

  console.log('\nPreserved tables (NOT deleted):');
  for (const [table, count] of Object.entries(preservedCounts)) {
    console.log(`  ${table}: ${count}`);
  }

  if (dryRun) {
    console.log(
      '\n[DRY RUN] Would delete user data and configure RunPod. Use without --dry-run to execute.'
    );
    return;
  }

  // ── Step 2: Delete user data (leaf tables first, respecting FK constraints) ──
  console.log('\nDeleting user data...');

  // 2a. Tables with no FK dependencies on other user tables
  const deletedMemories = await prisma.memory.deleteMany({});
  console.log(`  Deleted ${deletedMemories.count} memories`);

  const deletedCitations = await prisma.conceptCitation.deleteMany({});
  console.log(`  Deleted ${deletedCitations.count} concept_citations`);

  const deletedWorkflows = await prisma.conceptWorkflow.deleteMany({});
  console.log(`  Deleted ${deletedWorkflows.count} concept_workflows`);

  const deletedTokenUsage = await prisma.tokenUsage.deleteMany({});
  console.log(`  Deleted ${deletedTokenUsage.count} token_usage`);

  const deletedOnboarding = await prisma.onboardingMetric.deleteMany({});
  console.log(`  Deleted ${deletedOnboarding.count} onboarding_metrics`);

  // 2b. Notes (self-referential FK: parentNoteId) — clear parent refs first, then delete
  await prisma.note.updateMany({ data: { parentNoteId: null } });
  const deletedNotes = await prisma.note.deleteMany({});
  console.log(`  Deleted ${deletedNotes.count} notes`);

  // 2c. Messages (FK → conversations)
  const deletedMessages = await prisma.message.deleteMany({});
  console.log(`  Deleted ${deletedMessages.count} messages`);

  // 2d. Conversations (FK → users)
  const deletedConversations = await prisma.conversation.deleteMany({});
  console.log(`  Deleted ${deletedConversations.count} conversations`);

  // 2e. Data exports (FK → users, tenants)
  const deletedExports = await prisma.dataExport.deleteMany({});
  console.log(`  Deleted ${deletedExports.count} data_exports`);

  // 2f. Invitations (FK → users, tenants)
  const deletedInvitations = await prisma.invitation.deleteMany({});
  console.log(`  Deleted ${deletedInvitations.count} invitations`);

  // 2g. Clear tenant back-references before deleting users
  await prisma.tenant.updateMany({
    data: {
      backupOwnerId: null,
      deletionRequestedById: null,
    },
  });

  // 2h. Users (FK → tenants)
  const deletedUsers = await prisma.user.deleteMany({});
  console.log(`  Deleted ${deletedUsers.count} users`);

  // 2i. Tenants
  const deletedTenants = await prisma.tenant.deleteMany({});
  console.log(`  Deleted ${deletedTenants.count} tenants`);

  // ── Step 3: Re-create dev tenant + user ──
  console.log('\nRe-creating dev tenant and user...');

  const devTenantId = 'dev-tenant-001';
  const devUserId = 'dev-user-001';

  await prisma.tenant.create({
    data: {
      id: devTenantId,
      name: 'Dev Workspace',
      industry: 'Technology',
      description: 'Local development workspace',
      status: 'ACTIVE',
      tokenQuota: 10000000,
    },
  });
  console.log('  Created dev tenant: Dev Workspace');

  await prisma.user.create({
    data: {
      id: devUserId,
      email: 'dev@mentor-ai.local',
      name: 'Dev User',
      role: 'TENANT_OWNER',
      tenantId: devTenantId,
      mfaEnabled: true,
    },
  });
  console.log('  Created dev user: dev@mentor-ai.local (TENANT_OWNER)');

  // Ensure tenant registry exists
  const existingRegistry = await prisma.tenantRegistry.findUnique({ where: { id: devTenantId } });
  if (!existingRegistry) {
    await prisma.tenantRegistry.create({
      data: {
        id: devTenantId,
        name: 'Dev Workspace',
        dbUrl: process.env.DATABASE_URL ?? 'postgresql://localhost:5432/mentor_ai_dev',
        status: 'ACTIVE',
      },
    });
    console.log('  Created dev tenant registry entry');
  }

  // ── Step 4: LLM config preserved (not reconfigured) ──
  const activeLlm = await prisma.llmProviderConfig.findFirst({
    where: { isActive: true, isPrimary: true },
  });
  console.log(
    `\nLLM config preserved: ${activeLlm?.providerType ?? 'none'} (${activeLlm?.modelId ?? 'n/a'})`
  );

  // ── Step 5: Summary ──
  console.log('\n=== CLEANUP COMPLETE ===');
  console.log('Preserved:');
  console.log(`  - ${preservedCounts.platform} platform record(s)`);
  console.log(`  - ${preservedCounts.tenantRegistry} tenant registry entries`);
  console.log(`  - ${preservedCounts.concepts} concepts`);
  console.log(`  - ${preservedCounts.conceptRelationships} concept relationships`);
  console.log(`  - ${preservedCounts.llmConfigAuditLogs} LLM audit logs`);
  console.log(
    `  - Active LLM config: ${activeLlm?.providerType ?? 'none'} (${activeLlm?.modelId ?? 'n/a'})`
  );
  console.log('Created:');
  console.log('  - Dev tenant (dev-tenant-001)');
  console.log('  - Dev user (dev-user-001)');
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('Cleanup failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
