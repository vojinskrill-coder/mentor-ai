const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
p.tenant
  .findMany({ select: { id: true, name: true }, take: 10 })
  .then((r) => {
    console.log(JSON.stringify(r, null, 2));
    return p.$disconnect();
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
