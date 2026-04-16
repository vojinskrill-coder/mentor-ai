const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const bindings = await p.tenantToolBinding.findMany({
    where: { tenantId: 'tnt_rljn1gj4cgxoph0hxfohv6l4' },
    include: { adapter: { select: { processSlug: true, toolSlug: true } } },
  });
  console.log('TenantToolBindings for LSA:', bindings.length);
  for (const b of bindings) {
    const credKeys =
      b.toolCredentials && typeof b.toolCredentials === 'object'
        ? Object.keys(b.toolCredentials)
        : [];
    console.log(
      ` - process=${b.adapter.processSlug} tool=${b.adapter.toolSlug} enabled=${b.enabled} credKeys=${JSON.stringify(credKeys)}`
    );
  }
  const adapters = await p.processToolAdapter.findMany({
    select: { processSlug: true, toolSlug: true, adapterType: true },
  });
  console.log('\nProcessToolAdapters:');
  adapters.forEach((a) => console.log(` - ${a.processSlug} × ${a.toolSlug} (${a.adapterType})`));
  const catalog = await p.mcpToolCatalog.findMany({
    select: { slug: true, displayName: true, isActive: true },
  });
  console.log('\nMcpToolCatalog:');
  catalog.forEach((c) => console.log(` - ${c.slug}: ${c.displayName} active=${c.isActive}`));
  await p.$disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
