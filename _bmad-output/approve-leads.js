async function main() {
  const leads = [
    {
      name: 'Rodolphe Parente', company: 'Rodolphe Parente Design Studio',
      email: 'contact@rodolpheparente.com', score: 8, location: 'Paris, France',
      industry: 'luxury interior design',
      companyDescription: 'Award-winning interior design studio specializing in luxury hotels and residences',
      whyGoodFit: 'Premium hotel interiors — perfect for monumental sculptures',
      outreach: {
        email: { subject: 'Collaboration: Monumental Art for Luxury Interiors', body: 'Dear Mr. Parente, your work on luxury hotel interiors is remarkable...' },
        linkedin: { message: 'Loved your recent hotel project. Would love to discuss how our sculptures could complement your spaces.' },
      },
    },
    {
      name: 'Spagnulo & Partners', company: 'Spagnulo & Partners',
      email: 'info@spagnuloandpartners.it', score: 7, location: 'Milan, Italy',
      industry: 'architecture',
      companyDescription: 'Italian architecture firm specializing in luxury hospitality',
      whyGoodFit: 'Luxury hospitality projects — ideal for large-scale art installations',
    },
    {
      name: 'Studio KO', company: 'Studio KO',
      email: 'info@studioko.fr', score: 6, location: 'Paris, France',
      industry: 'architecture',
      companyDescription: 'Franco-Moroccan architecture studio known for luxury villas and hotels',
      whyGoodFit: 'International luxury projects with strong artistic vision',
    },
  ];

  const res = await fetch('http://localhost:3000/api/v1/mcp/leads/approve', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ processRunId: 'prun_e2e_noco_test', leads }),
  });
  console.log('Status:', res.status);
  console.log('Response:', await res.text());
}
main().catch(console.error);
