/**
 * One-time migration: copy tool credentials from the per-process
 * TenantToolBinding rows into the new tenant-level TenantCredential
 * table. Keeps the old rows intact for backwards compatibility with
 * existing processes (instagram-content, lead-discovery).
 *
 * Safe to re-run — uses upsert on (tenantId, toolSlug).
 */
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

(async () => {
  const bindings = await p.tenantToolBinding.findMany({
    include: { adapter: { select: { toolSlug: true } } },
  });
  console.log(`Found ${bindings.length} existing TenantToolBinding rows`);

  // Catalog slug mapping — existing adapters use "nocodb", the new
  // generic catalog uses slugs like "notion", "gmail", etc. Only migrate
  // rows whose toolSlug exists in McpToolCatalog.
  const catalog = await p.mcpToolCatalog.findMany({
    select: { slug: true },
  });
  const catalogSlugs = new Set(catalog.map((c) => c.slug));

  let migrated = 0;
  let skipped = 0;

  for (const b of bindings) {
    const slug = b.adapter.toolSlug;
    if (!catalogSlugs.has(slug)) {
      console.log(`  skip: toolSlug "${slug}" not in McpToolCatalog (tenant ${b.tenantId})`);
      skipped++;
      continue;
    }

    // Extract only the credential material, not any process-specific
    // config (e.g. contentDatabaseId, tableId) — those stay scoped to
    // the old binding row because they're per-process.
    const src = b.toolCredentials || {};
    const creds = {};
    if (src.apiToken) creds.apiToken = src.apiToken;
    if (src.oauthToken) creds.oauthToken = src.oauthToken;
    if (src.baseUrl) creds.baseUrl = src.baseUrl;

    if (Object.keys(creds).length === 0) {
      console.log(`  skip: no portable credentials in ${slug} for tenant ${b.tenantId}`);
      skipped++;
      continue;
    }

    await p.tenantCredential.upsert({
      where: {
        tenantId_toolSlug: { tenantId: b.tenantId, toolSlug: slug },
      },
      create: {
        tenantId: b.tenantId,
        toolSlug: slug,
        credentials: creds,
        verified: true, // existing binding was working
        verifiedAt: new Date(),
        label: `${slug} (migrated from ${b.adapter.toolSlug})`,
      },
      update: {
        credentials: creds,
        verified: true,
        verifiedAt: new Date(),
      },
    });
    migrated++;
    console.log(`  ok: migrated ${slug} for tenant ${b.tenantId}`);
  }

  console.log(`\nDone. migrated=${migrated} skipped=${skipped}`);

  // Sanity check
  const all = await p.tenantCredential.findMany({
    select: { tenantId: true, toolSlug: true, verified: true },
  });
  console.log(`\nTenantCredential rows now: ${all.length}`);
  all.forEach((r) => console.log(` - ${r.tenantId} × ${r.toolSlug} verified=${r.verified}`));

  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
