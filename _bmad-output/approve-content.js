async function main() {
  // Get posts from the completed run
  const runRes = await fetch('http://localhost:3000/api/v1/processes/runs/prun_uztf616mjrntr7blzrducncg');
  const runData = await runRes.json();
  const posts = runData.data.finalOutput?.posts || [];
  console.log(`Found ${posts.length} posts to approve`);

  // Write to Notion + local backup via MCP endpoint
  const res = await fetch('http://localhost:3000/api/v1/mcp/content/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ processRunId: 'prun_uztf616mjrntr7blzrducncg', posts }),
  });
  console.log('Status:', res.status);
  console.log('Response:', await res.text());
}
main().catch(console.error);
