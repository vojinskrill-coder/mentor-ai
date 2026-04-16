const NOCODB_URL = 'http://91.98.231.87:8080';

async function api(method, path, body, token) {
  const opts = { method, headers: { 'Content-Type': 'application/json' } };
  if (token) opts.headers['xc-auth'] = token;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${NOCODB_URL}${path}`, opts);
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} ${res.status}: ${text.substring(0, 300)}`);
  return text ? JSON.parse(text) : {};
}

async function main() {
  console.log('=== NocoDB Setup ===\n');

  // Login
  const auth = await api('POST', '/api/v1/auth/user/signin', {
    email: 'admin@neuron-os.com', password: 'NeuronOS2026!',
  });
  const token = auth.token;
  console.log('Logged in');

  // API Token already created: HeaMngQVhQu4SfYZ6faDl8tf8-5o_JWz0vHqsB9M
  const apiToken = 'HeaMngQVhQu4SfYZ6faDl8tf8-5o_JWz0vHqsB9M';

  // Find bases using v2 API
  let baseId;
  try {
    const bases = await api('GET', '/api/v2/meta/bases/', null, token);
    baseId = bases.list?.[0]?.id;
    console.log('Found base:', baseId);
  } catch (e) {
    console.log('v2 bases failed, trying v1...');
    try {
      const bases = await api('GET', '/api/v1/db/meta/projects/', null, token);
      baseId = bases.list?.[0]?.id;
      console.log('Found base (v1):', baseId);
    } catch (e2) {
      console.log('Creating new base...');
      const newBase = await api('POST', '/api/v2/meta/bases/', { title: 'Neuron OS' }, token);
      baseId = newBase.id;
      console.log('Created base:', baseId);
    }
  }

  if (!baseId) throw new Error('No base found');

  // List existing tables
  let tableId;
  try {
    const tables = await api('GET', `/api/v2/meta/bases/${baseId}/tables`, null, token);
    const existing = tables.list?.find(t => t.title === 'Leads');
    if (existing) {
      tableId = existing.id;
      console.log('Leads table exists:', tableId);
    }
  } catch (e) {
    console.log('Could not list tables:', e.message);
  }

  if (!tableId) {
    // Create Leads table
    const table = await api('POST', `/api/v2/meta/bases/${baseId}/tables`, {
      table_name: 'Leads',
      title: 'Leads',
      columns: [
        { column_name: 'CompanyName', title: 'Company Name', uidt: 'SingleLineText', pv: true },
        { column_name: 'ContactName', title: 'Contact Name', uidt: 'SingleLineText' },
        { column_name: 'ContactEmail', title: 'Email', uidt: 'Email' },
        { column_name: 'Phone', title: 'Phone', uidt: 'PhoneNumber' },
        { column_name: 'Website', title: 'Website', uidt: 'URL' },
        { column_name: 'LinkedIn', title: 'LinkedIn', uidt: 'URL' },
        { column_name: 'Location', title: 'Location', uidt: 'SingleLineText' },
        { column_name: 'Industry', title: 'Industry', uidt: 'SingleLineText' },
        { column_name: 'Role', title: 'Role', uidt: 'SingleLineText' },
        { column_name: 'CompanyDescription', title: 'Company Description', uidt: 'LongText' },
        { column_name: 'WhyGoodFit', title: 'Why Good Fit', uidt: 'LongText' },
        { column_name: 'LeadScore', title: 'Score', uidt: 'Number' },
        { column_name: 'ScoringRationale', title: 'Scoring Rationale', uidt: 'LongText' },
        { column_name: 'OutreachEmail', title: 'Outreach Email', uidt: 'LongText' },
        { column_name: 'OutreachLinkedIn', title: 'Outreach LinkedIn', uidt: 'LongText' },
        { column_name: 'Status', title: 'Status', uidt: 'SingleSelect', dtxp: "'New','Contacted','Qualified','Converted','Archived'" },
        { column_name: 'Source', title: 'Source', uidt: 'SingleLineText' },
        { column_name: 'ProcessRunId', title: 'Process Run ID', uidt: 'SingleLineText' },
        { column_name: 'DiscoveredAt', title: 'Discovered At', uidt: 'DateTime' },
      ],
    }, token);
    tableId = table.id;
    console.log('Created Leads table:', tableId);
  }

  console.log('\n=== Setup Complete ===');
  console.log('NocoDB URL:', NOCODB_URL);
  console.log('API Token:', apiToken);
  console.log('Base ID:', baseId);
  console.log('Table ID:', tableId);
  console.log('\nFor .env:');
  console.log(`NOCODB_URL=${NOCODB_URL}`);
  console.log(`NOCODB_API_TOKEN=${apiToken}`);
  console.log(`NOCODB_BASE_ID=${baseId}`);
  console.log(`NOCODB_LEADS_TABLE_ID=${tableId}`);
}

main().catch(err => { console.error('FAILED:', err.message); process.exit(1); });
