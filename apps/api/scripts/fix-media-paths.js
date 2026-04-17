const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const mediaHost = 'http://91.98.231.87:8003';
  const pattern = 'MEDIA:/root/.openclaw/media/tool-image-generation/';

  const concepts = await p.concept.findMany({
    where: { extendedDescription: { contains: 'MEDIA:' } },
    select: { id: true, name: true, extendedDescription: true }
  });
  console.log('Concepts with MEDIA: paths:', concepts.length);
  for (const c of concepts) {
    const updated = c.extendedDescription.replaceAll(pattern, mediaHost + '/');
    if (updated !== c.extendedDescription) {
      await p.concept.update({ where: { id: c.id }, data: { extendedDescription: updated } });
      console.log('  Fixed:', c.name);
    }
  }

  const messages = await p.message.findMany({
    where: { content: { contains: 'MEDIA:' } },
    select: { id: true, content: true }
  });
  console.log('Messages with MEDIA: paths:', messages.length);
  for (const m of messages) {
    const updated = m.content.replaceAll(pattern, mediaHost + '/');
    if (updated !== m.content) {
      await p.message.update({ where: { id: m.id }, data: { content: updated } });
    }
  }
  console.log('Fixed', messages.length, 'messages');
}

main().catch(console.error).finally(() => p.$disconnect());
