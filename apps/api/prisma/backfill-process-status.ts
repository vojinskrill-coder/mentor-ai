/**
 * One-shot backfill: mark existing ProcessWorkflow rows (Lead Discovery
 * and Instagram Content) as status=published, isTestMode=false, and
 * infer triggerType from cronSchedule. This lets them keep running
 * through the existing pipeline without being flagged as drafts by
 * the new Processes page query.
 *
 * Safe to re-run — idempotent: only updates rows still in the default
 * status=draft state.
 *
 * Run:
 *   cd apps/api && npx ts-node prisma/backfill-process-status.ts
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const drafts = await prisma.processWorkflow.findMany({
    where: { status: 'draft' },
    select: { id: true, name: true, slug: true, cronSchedule: true },
  });

  if (drafts.length === 0) {
    console.log('No draft processes to backfill.');
    return;
  }

  console.log(`Backfilling ${drafts.length} process(es) to status=published…`);

  for (const p of drafts) {
    const triggerType = p.cronSchedule ? 'cron' : 'manual';
    await prisma.processWorkflow.update({
      where: { id: p.id },
      data: {
        status: 'published',
        isTestMode: false,
        triggerType,
        // Existing processes predate the builder so they don't have
        // an agentId/skillSlug — they use the legacy agentType field
        // on each step instead. Leaving these null is correct; the
        // extended ProcessExecutorService will fall back to the
        // legacy code path when invocationConfig is missing.
      },
    });
    console.log(`  ✔ ${p.slug} (${p.name}) → triggerType=${triggerType}`);
  }

  console.log('Done.');
}

main()
  .catch((err) => {
    console.error('Backfill failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
