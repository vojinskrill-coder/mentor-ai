const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const item = await p.catalogItem.upsert({
    where: { slug: 'nocodb' },
    create: {
      type: 'tool',
      name: 'NocoDB CRM',
      slug: 'nocodb',
      description: 'Open-source CRM — cuva i prikazuje lead-ove. Automatski se sinhronizuje sa procesima.',
      icon: '🗄️',
      category: 'crm',
      requiredTier: 'starter',
      creditCost: 0,
      isActive: true,
      mcpEndpoint: 'http://91.98.231.87:8080',
    },
    update: {
      name: 'NocoDB CRM',
      description: 'Open-source CRM — cuva i prikazuje lead-ove.',
      mcpEndpoint: 'http://91.98.231.87:8080',
    },
  });
  console.log('NocoDB catalog item:', item.id, item.slug);
}

main().catch(console.error).finally(() => p.$disconnect());
