const NOCODB_URL = 'http://91.98.231.87:8080';

async function main() {
  // Login
  const authRes = await fetch(`${NOCODB_URL}/api/v1/auth/user/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@neuron-os.com', password: 'NeuronOS2026!' }),
  });
  const { token } = await authRes.json();
  console.log('Token:', token.substring(0, 30) + '...');

  // Try different paths
  const paths = [
    '/api/v1/db/meta/projects/',
    '/api/v2/meta/bases/',
    '/api/v1/meta/bases/',
    '/api/v1/workspaces/',
    '/api/v2/meta/workspaces/',
  ];

  for (const path of paths) {
    try {
      const res = await fetch(`${NOCODB_URL}${path}`, {
        headers: { 'xc-auth': token },
      });
      const text = await res.text();
      console.log(`${path} → ${res.status}: ${text.substring(0, 200)}`);
    } catch (e) {
      console.log(`${path} → ERROR: ${e.message}`);
    }
  }
}

main().catch(console.error);
