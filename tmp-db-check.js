const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.tenant.findFirst().then(t => {
  console.log('DB OK:', t?.name);
  p.$disconnect();
}).catch(e => {
  console.log('DB FAIL:', e.message?.substring(0, 100));
  p.$disconnect();
});
