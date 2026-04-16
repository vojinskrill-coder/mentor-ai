const NOCODB_URL = 'http://91.98.231.87:8080';

async function api(method, path, body, token) {
  const opts = { method, headers: { 'Content-Type': 'application/json', 'xc-auth': token } };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${NOCODB_URL}${path}`, opts);
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} ${res.status}: ${text.substring(0, 200)}`);
  return text ? JSON.parse(text) : {};
}

async function main() {
  // Login
  const auth = await api('POST', '/api/v1/auth/user/signin', { email: 'admin@neuron-os.com', password: 'NeuronOS2026!' }, '');
  const token = auth.token;
  console.log('Logged in');

  // Get workspace
  const ws = await api('GET', '/api/v1/workspaces/', null, token);
  const workspaceId = ws.list[0].id;
  console.log('Workspace:', workspaceId);

  // List bases in workspace
  const bases = await api('GET', `/api/v1/workspaces/${workspaceId}/bases/`, null, token);
  console.log('Bases:', bases.list?.length || 0);

  let baseId;
  if (bases.list?.length > 0) {
    baseId = bases.list[0].id;
    console.log('Using base:', baseId, bases.list[0].title);
  } else {
    const newBase = await api('POST', `/api/v1/workspaces/${workspaceId}/bases/`, { title: 'Neuron OS' }, token);
    baseId = newBase.id;
    console.log('Created base:', baseId);
  }

  // List tables
  const tables = await api('GET', `/api/v2/meta/bases/${baseId}/tables`, null, token);
  console.log('Existing tables:', tables.list?.map(t => t.title).join(', ') || 'none');

  let tableId;
  const existing = tables.list?.find(t => t.title === 'Leads');
  if (existing) {
    tableId = existing.id;
    console.log('Leads table exists:', tableId);
  } else {
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

  // Test: create a sample record
  const sample = await api('POST', `/api/v2/tables/${tableId}/records`, {
    CompanyName: 'Test Corp',
    ContactName: 'Test User',
    ContactEmail: 'test@test.com',
    LeadScore: 8,
    Status: 'New',
    Source: 'setup-test',
  }, token);
  console.log('Test record created:', sample.Id || sample.id);

  // Read it back
  const records = await api('GET', `/api/v2/tables/${tableId}/records?limit=5`, null, token);
  console.log('Records:', records.list?.length || 0);

  // Delete test record
  if (sample.Id || sample.id) {
    await api('DELETE', `/api/v2/tables/${tableId}/records`, { Id: sample.Id || sample.id }, token);
    console.log('Test record deleted');
  }

  console.log('\n=== NocoDB Ready ===');
  console.log('URL:', NOCODB_URL);
  console.log('API Token: HeaMngQVhQu4SfYZ6faDl8tf8-5o_JWz0vHqsB9M');
  console.log('Base ID:', baseId);
  console.log('Table ID:', tableId);
}

main().catch(err => { console.error('FAILED:', err.message); process.exit(1); });
