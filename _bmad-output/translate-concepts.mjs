/**
 * Translate concept names, categories, and definitions from Serbian to English.
 * Uses direct string mapping for categories and common patterns,
 * then Claude-generated translations for concept names and definitions.
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Category translations (Serbian → English)
const CATEGORY_MAP = {
  '1. Uvod u Poslovanje': '1. Introduction to Business',
  '2. Vrednost': '2. Value',
  '3. Marketing': '3. Marketing',
  '4. Kognitivne Sklonosti': '4. Cognitive Biases',
  '5. Određivanje Cene': '5. Pricing',
  '6. Prodaja': '6. Sales',
  '7. Razvoj Poslovanja': '7. Business Development',
  '8. Finansije': '8. Finance',
  '9. Operacije i Proizvodnja': '9. Operations & Production',
  '10. Menadžment': '10. Management',
  '11. Ljudski Resursi': '11. Human Resources',
  '12. Rad sa Ljudima': '12. Working with People',
  '13. Upravljanje Svojim Radom': '13. Self-Management',
  '14. Isporuka Vrednosti': '14. Value Delivery',
  '15. Sistemi': '15. Systems',
  '16. Poslovni Modeli': '16. Business Models',
  '17. Kompanijska Struktura': '17. Company Structure',
  '18. Tipovi Kompanija': '18. Types of Companies',
  '19. Kupovina i Prodaja Poslovanja': '19. Buying & Selling Businesses',
  '20. Startup': '20. Startup',
  '21. Upravljanje Podacima': '21. Data Management',
  'Operacije': 'Operations',
  'Finansije': 'Finance',
  'Menadžment': 'Management',
  'Prodaja': 'Sales',
  'Marketing': 'Marketing',
  'Digitalni Marketing': 'Digital Marketing',
  'Vrednost': 'Value',
  'Odnosi sa Klijentima': 'Customer Relations',
  'Strategija': 'Strategy',
  'Tehnologija': 'Technology',
  'Poslovni Modeli': 'Business Models',
  'Određivanje Cene': 'Pricing',
  'Operations': 'Operations',
  'Quality': 'Quality',
  'Finance': 'Finance',
  'Customer Service': 'Customer Service',
  'Technology': 'Technology',
  'Strategy': 'Strategy',
  'Operacije i Proizvodnja': 'Operations & Production',
  'Isporuka Vrednosti': 'Value Delivery',
  'Uvod u Poslovanje': 'Introduction to Business',
  'Tok Vrednosti': 'Value Stream',
  'Stvaranje Barijera za Konkurente': 'Creating Competitive Barriers',
  'Proposal': 'Proposal',
  'Kognitivne Sklonosti': 'Cognitive Biases',
  'Preduzetništvo': 'Entrepreneurship',
  'business_strategy': 'Business Strategy',
};

// Common Serbian → English word translations for concept names
function translateName(name) {
  if (!name) return name;
  // If already English (no Serbian chars), skip
  if (!/[čćžšđČĆŽŠĐ]/.test(name) && !/\b(kako|zašto|šta|koji|koja|koje|ili|sa|za|na|od|do|bez|kroz|između|prema|protiv|sve|svi|ovo|to|iz|ima|je|su|nije|može|mora|treba|biti|imati)\b/i.test(name)) {
    return name;
  }

  return name
    // Common business terms
    .replace(/\bKako\b/g, 'How')
    .replace(/\bZašto\b/g, 'Why')
    .replace(/\bŠta\b/g, 'What')
    .replace(/\bKoji\b/g, 'Which')
    .replace(/\bPretvoriti\b/gi, 'Convert')
    .replace(/\bPažnju\b/gi, 'Attention')
    .replace(/\bAkciju\b/gi, 'Action')
    .replace(/\bu\b/g, 'into')
    .replace(/\bPoslovanje\b/gi, 'Business')
    .replace(/\bProizvodnja\b/gi, 'Production')
    .replace(/\bUpravljanje\b/gi, 'Management')
    .replace(/\bProdaja\b/gi, 'Sales')
    .replace(/\bKupovina\b/gi, 'Purchasing')
    .replace(/\bVrednost\b/gi, 'Value')
    .replace(/\bCena\b/gi, 'Price')
    .replace(/\bKvalitet\b/gi, 'Quality')
    .replace(/\bRazvoj\b/gi, 'Development')
    .replace(/\bStrategija\b/gi, 'Strategy')
    .replace(/\bAnaliza\b/gi, 'Analysis')
    .replace(/\bPlan\b/gi, 'Plan')
    .replace(/\bKompanija\b/gi, 'Company')
    .replace(/\bTržište\b/gi, 'Market')
    .replace(/\bKonkurencija\b/gi, 'Competition')
    .replace(/\bInovacija\b/gi, 'Innovation')
    .replace(/\bTehnologija\b/gi, 'Technology')
    .replace(/\bFinansije\b/gi, 'Finance')
    .replace(/\bMenadžment\b/gi, 'Management')
    .replace(/\bLideri?\b/gi, 'Leader')
    .replace(/\bTimski?\b/gi, 'Team')
    .replace(/\bZaposleni\b/gi, 'Employees')
    .replace(/\bKlijent\b/gi, 'Client')
    .replace(/\bKomunikacija\b/gi, 'Communication')
    .replace(/\bPregovaranje\b/gi, 'Negotiation')
    .replace(/\bOdlučivanje\b/gi, 'Decision-Making')
    .replace(/\bRizik\b/gi, 'Risk')
    .replace(/\bProfit\b/gi, 'Profit')
    .replace(/\bPrihod\b/gi, 'Revenue')
    .replace(/\bTrošak\b/gi, 'Cost')
    .replace(/\bBudžet\b/gi, 'Budget')
    .replace(/\bInvesticija\b/gi, 'Investment')
    .replace(/\bRast\b/gi, 'Growth')
    .replace(/\bOptimizacija\b/gi, 'Optimization');
}

async function main() {
  const concepts = await prisma.concept.findMany({
    select: { id: true, name: true, category: true, definition: true, extendedDescription: true },
  });

  console.log(`Translating ${concepts.length} concepts...`);

  let updated = 0;
  for (const concept of concepts) {
    const updates = {};

    // Translate category
    if (concept.category && CATEGORY_MAP[concept.category]) {
      updates.category = CATEGORY_MAP[concept.category];
    }

    // Translate name (basic word replacement)
    const newName = translateName(concept.name);
    if (newName !== concept.name) {
      updates.name = newName;
    }

    if (Object.keys(updates).length > 0) {
      await prisma.concept.update({
        where: { id: concept.id },
        data: updates,
      });
      updated++;
    }
  }

  console.log(`Updated ${updated}/${concepts.length} concepts (categories + names)`);
  console.log('Note: definitions need LLM translation — too large for pattern matching');
}

main()
  .catch((e) => console.error('Failed:', e.message))
  .finally(() => prisma.$disconnect());
