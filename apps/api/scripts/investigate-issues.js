const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();

async function main() {
  const user = await p.user.findFirst({ where: { email: { contains: 'nafata' } }, select: { tenantId: true, id: true } });
  if (!user) { console.log('No user'); return; }
  const tid = user.tenantId;

  console.log('=== 1. TENANT CONCEPTS ===');
  const concepts = await p.concept.findMany({
    where: { tenantId: tid },
    select: { id: true, name: true, source: true, tier: true, confidence: true, extendedDescription: true },
  });
  console.log('Total:', concepts.length);
  const bySource = {};
  const byTier = {};
  for (const c of concepts) {
    bySource[c.source] = (bySource[c.source] || 0) + 1;
    byTier[c.tier] = (byTier[c.tier] || 0) + 1;
  }
  console.log('By source:', JSON.stringify(bySource));
  console.log('By tier:', JSON.stringify(byTier));
  const enriched = concepts.filter(c => c.extendedDescription && c.extendedDescription.length > 1000);
  const empty = concepts.filter(c => !c.extendedDescription || c.extendedDescription.length < 100);
  console.log('Enriched:', enriched.length, '| Empty:', empty.length);
  if (empty.length > 0) console.log('  Empty:', empty.map(c => c.name).join(', '));

  console.log('\n=== 2. ENRICHED CONTENT ANALYSIS ===');
  for (const c of enriched.slice(0, 3)) {
    const content = c.extendedDescription || '';
    const images = (content.match(/!\[.*?\]\(.*?\)/g) || []);
    const mediaImages = images.filter(i => i.includes('MEDIA:'));
    const httpImages = images.filter(i => i.includes('http'));
    const otherImages = images.filter(i => !i.includes('http') && !i.includes('MEDIA:'));
    console.log('--- ' + c.name + ' ---');
    console.log('  Length:', content.length);
    console.log('  Images: MEDIA=' + mediaImages.length + ' HTTP=' + httpImages.length + ' other=' + otherImages.length);
    if (mediaImages.length > 0) console.log('  MEDIA example:', mediaImages[0].substring(0, 120));
    if (httpImages.length > 0) console.log('  HTTP example:', httpImages[0].substring(0, 120));
    // Check truncation
    const last50 = content.slice(-50).replace(/\n/g, '\\n');
    console.log('  Last 50 chars:', last50);
    const hasSources = content.includes('## Sources') || content.includes('## References');
    console.log('  Has Sources section:', hasSources);
  }

  console.log('\n=== 3. BRAIN PROPOSALS (AI Recommendations) ===');
  const proposals = await p.brainProposal.findMany({
    where: { tenantId: tid },
    select: { id: true, title: true, status: true, relatedConcepts: true },
  });
  console.log('Total proposals:', proposals.length);
  for (const pr of proposals.slice(0, 5)) {
    console.log('  ' + pr.title + ' | status: ' + pr.status + ' | concepts: ' + (pr.relatedConcepts || []).length);
    for (const cId of (pr.relatedConcepts || []).slice(0, 2)) {
      const c = await p.concept.findUnique({ where: { id: cId }, select: { name: true, tenantId: true, source: true } });
      if (c) {
        const owner = c.tenantId === tid ? 'THIS_TENANT' : (c.tenantId ? 'OTHER_TENANT:' + c.tenantId : 'PLATFORM');
        console.log('    → ' + c.name + ' | ' + owner + ' | ' + c.source);
      }
    }
  }

  console.log('\n=== 4. CONCEPT CITATIONS IN ENRICHMENTS ===');
  // Check if enriched content has [[wikilinks]]
  for (const c of enriched.slice(0, 2)) {
    const content = c.extendedDescription || '';
    const wikilinks = (content.match(/\[\[.*?\]\]/g) || []);
    console.log(c.name + ': ' + wikilinks.length + ' wikilinks');
    if (wikilinks.length > 0) console.log('  Examples:', wikilinks.slice(0, 3));
  }

  console.log('\n=== 5. LSA CONTEXT CHECK ===');
  const lsaTid = 'tnt_rljn1gj4cgxoph0hxfohv6l4';
  const lsaConcepts = await p.concept.count({ where: { tenantId: lsaTid } });
  console.log('LSA concepts in DB:', lsaConcepts);
  // Check if any enriched content mentions LSA
  for (const c of enriched) {
    const content = (c.extendedDescription || '').toLowerCase();
    if (content.includes('luxury statues') || content.includes('lsa') || content.includes('skulptur')) {
      console.log('  LSA LEAK in: ' + c.name);
    }
  }

  console.log('\n=== 6. CONVERSATION MESSAGE TRUNCATION ===');
  // Check messages in concept conversations for truncation
  const convs = await p.conversation.findMany({
    where: { conceptId: { not: null } },
    select: { id: true, conceptId: true },
    take: 3,
  });
  for (const conv of convs) {
    const msgs = await p.message.findMany({
      where: { conversationId: conv.id },
      select: { id: true, role: true, content: true },
      orderBy: { createdAt: 'desc' },
      take: 1,
    });
    if (msgs.length > 0) {
      const msg = msgs[0];
      const last50 = (msg.content || '').slice(-50).replace(/\n/g, '\\n');
      const len = (msg.content || '').length;
      console.log('Conv ' + conv.id.substring(0, 15) + ': msg len=' + len + ' | ends: ' + last50);
    }
  }
}

main().catch(console.error).finally(() => p.$disconnect());
