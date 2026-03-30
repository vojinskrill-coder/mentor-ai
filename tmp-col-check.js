const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const cols = await p.$queryRawUnsafe("SELECT table_name, column_name, data_type, character_maximum_length FROM information_schema.columns WHERE table_schema = 'public' AND data_type IN ('text','character varying') AND character_maximum_length IS NOT NULL ORDER BY table_name");
  console.log('Columns WITH limits:');
  if (cols.length === 0) console.log('  NONE — all text columns unlimited');
  for (const c of cols) console.log(' ', c.table_name + '.' + c.column_name, c.data_type, 'max:', c.character_maximum_length);

  const key = await p.$queryRawUnsafe("SELECT table_name, column_name, data_type, character_maximum_length FROM information_schema.columns WHERE (table_name = 'agent_jobs' AND column_name = 'agent_output') OR (table_name = 'notes' AND column_name IN ('user_report','content')) OR (table_name = 'messages' AND column_name = 'content')");
  console.log('\nKey columns:');
  for (const c of key) console.log(' ', c.table_name + '.' + c.column_name, c.data_type, 'max:', c.character_maximum_length || 'UNLIMITED');
  await p.$disconnect();
})();
