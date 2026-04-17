/**
 * Seeds the Brand Design Profile from visual analysis of LSA brochure
 * Run: npx ts-node prisma/seed-brochure-profile.ts
 */
import { PrismaClient } from '@prisma/client';
import { createId } from '@paralleldrive/cuid2';

const prisma = new PrismaClient();

async function main() {
  // Auto-detect tenant
  const tenant = await prisma.tenant.findFirst({ select: { id: true, name: true } });
  if (!tenant) { console.log('No tenant found'); return; }
  console.log(`Tenant: ${tenant.name} (${tenant.id})`);

  // Delete existing profile for this file to avoid duplicates
  await prisma.brandDesignProfile.deleteMany({ where: { tenantId: tenant.id, figmaFileKey: 'sTjPUTmhrfvcKVdfMawdTa' } });

  const profileId = `bdp_${createId()}`;

  await prisma.brandDesignProfile.create({
    data: {
      id: profileId,
      tenantId: tenant.id,
      name: 'Luxury Statues Adria — Main Brochure',
      figmaFileKey: 'sTjPUTmhrfvcKVdfMawdTa',
      figmaFileName: 'Brochure LSA',
      pageCount: 12,

      colors: {
        background: { hex: '#0D0D0D', usage: ['page backgrounds', 'text panel backgrounds'] },
        primary: { hex: '#C9A96E', usage: ['headings', 'accent lines', 'logo', 'numbered items'] },
        textPrimary: { hex: '#FFFFFF', usage: ['subheadings', 'emphasis text'] },
        textBody: { hex: '#B0B0B0', usage: ['body paragraphs', 'descriptions'] },
        textMuted: { hex: '#808080', usage: ['quotes', 'captions', 'fine print'] },
        surfaceDark: { hex: '#1A1A1A', usage: ['card backgrounds', 'elevated surfaces'] },
        surfaceLight: { hex: '#F5F0EB', usage: ['light accent sections'] },
        accentLine: { hex: '#C9A96E', usage: ['horizontal separators', 'decorative lines'] },
      },

      typography: [
        {
          role: 'h1',
          fontFamily: 'Helvetica Neue',
          fontWeight: 700,
          fontSize: 42,
          lineHeight: 1.15,
          letterSpacing: 2,
          textTransform: 'uppercase',
          color: '#C9A96E',
          italic: false,
          usage: 'Main page headings — gold, bold, uppercase',
        },
        {
          role: 'h2',
          fontFamily: 'Helvetica Neue',
          fontWeight: 400,
          fontSize: 28,
          lineHeight: 1.2,
          letterSpacing: 1,
          color: '#FFFFFF',
          italic: false,
          usage: 'Section subheadings — white',
        },
        {
          role: 'subtitle',
          fontFamily: 'Montserrat',
          fontWeight: 300,
          fontSize: 16,
          lineHeight: 1.4,
          letterSpacing: 0.5,
          color: '#FFFFFF',
          italic: true,
          usage: 'Taglines, short descriptive lines under headings',
        },
        {
          role: 'body',
          fontFamily: 'Montserrat',
          fontWeight: 300,
          fontSize: 13,
          lineHeight: 1.7,
          letterSpacing: 0.3,
          color: '#B0B0B0',
          usage: 'Main body text — light gray, light weight, generous line height',
        },
        {
          role: 'caption',
          fontFamily: 'Montserrat',
          fontWeight: 400,
          fontSize: 9,
          lineHeight: 1.5,
          color: '#808080',
          usage: 'Image captions, footnotes, fine print',
        },
        {
          role: 'quote',
          fontFamily: 'Montserrat',
          fontWeight: 300,
          fontSize: 15,
          lineHeight: 1.6,
          color: '#808080',
          italic: true,
          usage: 'Pull quotes at bottom of pages',
        },
        {
          role: 'numberedItem',
          fontFamily: 'Montserrat',
          fontWeight: 600,
          fontSize: 12,
          color: '#C9A96E',
          usage: 'Bold gold numbered list items (1. Vision, 2. Structure, etc.)',
        },
      ],

      spacing: [8, 16, 24, 32, 48, 64, 80, 120],

      grids: [
        {
          pattern: 'COLUMNS',
          count: 2,
          gutterSize: 0,
          offset: 0,
          description: 'Spread layout — 50/50 split between text panel and image',
        },
      ],

      effects: [
        { type: 'GRADIENT_OVERLAY', description: 'Subtle dark gradient on image side near text boundary' },
        { type: 'GOLD_LINE', description: 'Thin horizontal gold line separators (~1px, #C9A96E)' },
        { type: 'DRAMATIC_LIGHTING', description: 'Sculpturedramatically lit from above/side in architectural space' },
      ],

      layoutPatterns: [
        {
          pageName: 'Cover (Back + Front)',
          pageIndex: 0,
          width: 100,
          height: 100,
          description: 'Left: dark panel with CTA, QR code, logo. Right: hero sculpture in architectural space.',
          components: [
            { name: 'logo-left', type: 'image', x: 3, y: 5, w: 15, h: 5 },
            { name: 'heading', type: 'text', x: 3, y: 25, w: 40, h: 10, fontRole: 'h1', maxChars: 40 },
            { name: 'subtitle', type: 'text', x: 3, y: 38, w: 40, h: 5, fontRole: 'subtitle', maxChars: 60 },
            { name: 'body', type: 'text', x: 3, y: 45, w: 40, h: 25, fontRole: 'body', maxChars: 500 },
            { name: 'qr-code', type: 'image', x: 3, y: 70, w: 12, h: 20 },
            { name: 'hero-image', type: 'image', x: 50, y: 0, w: 50, h: 100, imageDescription: 'Hero sculpture (2m tall) in grand architectural atrium with dramatic overhead lighting, dark moody atmosphere' },
            { name: 'logo-right', type: 'image', x: 80, y: 3, w: 15, h: 5 },
            { name: 'tagline', type: 'text', x: 55, y: 85, w: 40, h: 10, fontRole: 'h1', maxChars: 50 },
          ],
        },
        {
          pageName: 'Content Spread (text left, image right)',
          pageIndex: 1,
          width: 100,
          height: 100,
          description: 'Left: dark panel with logo, heading, body text. Right: full-bleed sculpture in architectural context.',
          components: [
            { name: 'logo', type: 'image', x: 3, y: 3, w: 12, h: 4 },
            { name: 'heading', type: 'text', x: 3, y: 15, w: 42, h: 12, fontRole: 'h1', maxChars: 40 },
            { name: 'body', type: 'text', x: 3, y: 30, w: 42, h: 60, fontRole: 'body', maxChars: 800 },
            { name: 'sculpture-image', type: 'image', x: 50, y: 0, w: 50, h: 100, imageDescription: 'Monumental sculpture (180-250cm) in luxury penthouse with floor-to-ceiling windows, natural light' },
          ],
        },
        {
          pageName: 'Process Spread (workshop)',
          pageIndex: 2,
          width: 100,
          height: 100,
          description: 'Left: B&W workshop photo. Right: heading + numbered process steps + product photo bottom-right.',
          components: [
            { name: 'workshop-photo', type: 'image', x: 0, y: 0, w: 45, h: 85, imageDescription: 'Black and white photo of craftsman welding large steel sculpture in industrial workshop, sparks flying, raw materials visible' },
            { name: 'quote', type: 'text', x: 3, y: 88, w: 42, h: 8, fontRole: 'quote', maxChars: 120 },
            { name: 'heading', type: 'text', x: 50, y: 5, w: 45, h: 8, fontRole: 'h1', maxChars: 35 },
            { name: 'process-text', type: 'text', x: 50, y: 15, w: 45, h: 55, fontRole: 'body', maxChars: 800 },
            { name: 'product-photo', type: 'image', x: 70, y: 60, w: 28, h: 38, imageDescription: 'Finished polished sculpture on pedestal in clean white studio, detail of surface texture and patina' },
          ],
        },
        {
          pageName: 'Product Spread (text left, image right)',
          pageIndex: 3,
          width: 100,
          height: 100,
          description: 'Left: dark panel with logo, product name, subtitle, description. Right: sculpture in modern interior.',
          components: [
            { name: 'logo', type: 'image', x: 3, y: 3, w: 12, h: 4 },
            { name: 'product-name', type: 'text', x: 3, y: 15, w: 42, h: 8, fontRole: 'h1', maxChars: 30 },
            { name: 'product-subtitle', type: 'text', x: 3, y: 25, w: 42, h: 5, fontRole: 'h2', maxChars: 60 },
            { name: 'product-description', type: 'text', x: 3, y: 33, w: 42, h: 55, fontRole: 'body', maxChars: 700 },
            { name: 'interior-image', type: 'image', x: 50, y: 0, w: 50, h: 100, imageDescription: 'Monumental sculpture (2m) as centerpiece in contemporary minimalist living room, high ceilings, curated lighting' },
          ],
        },
        {
          pageName: 'Gallery Spread',
          pageIndex: 4,
          width: 100,
          height: 100,
          description: 'Left: heading + subtitle + body text about the collection. Right: 2x2 grid of product images.',
          components: [
            { name: 'logo', type: 'image', x: 3, y: 3, w: 12, h: 4 },
            { name: 'heading', type: 'text', x: 3, y: 15, w: 42, h: 10, fontRole: 'h1', maxChars: 35 },
            { name: 'subtitle', type: 'text', x: 3, y: 27, w: 42, h: 5, fontRole: 'subtitle', maxChars: 80 },
            { name: 'body', type: 'text', x: 3, y: 35, w: 42, h: 55, fontRole: 'body', maxChars: 700 },
            { name: 'gallery-image-1', type: 'image', x: 50, y: 0, w: 50, h: 50, imageDescription: 'Sculpture in luxury gallery space, dramatic lighting from above' },
            { name: 'gallery-image-2', type: 'image', x: 50, y: 50, w: 50, h: 50, imageDescription: 'Sculpture installed in modern interior, natural daylight' },
          ],
        },
        {
          pageName: 'Testimonials Spread',
          pageIndex: 5,
          width: 100,
          height: 100,
          description: 'Left: large atmospheric image. Right: client testimonials and project references.',
          components: [
            { name: 'atmosphere-image', type: 'image', x: 0, y: 0, w: 50, h: 100, imageDescription: 'Sculpture silhouette against warm golden hour light in architectural courtyard, cinematic atmosphere' },
            { name: 'heading', type: 'text', x: 55, y: 10, w: 40, h: 8, fontRole: 'h1', maxChars: 30 },
            { name: 'testimonial-1', type: 'text', x: 55, y: 22, w: 40, h: 15, fontRole: 'quote', maxChars: 200 },
            { name: 'testimonial-2', type: 'text', x: 55, y: 42, w: 40, h: 15, fontRole: 'quote', maxChars: 200 },
            { name: 'testimonial-3', type: 'text', x: 55, y: 62, w: 40, h: 15, fontRole: 'quote', maxChars: 200 },
            { name: 'caption', type: 'text', x: 55, y: 85, w: 40, h: 8, fontRole: 'caption', maxChars: 100 },
          ],
        },
        {
          pageName: 'Contact/CTA Spread',
          pageIndex: 6,
          width: 100,
          height: 100,
          description: 'Left: contact info, address, website, social. Right: full-bleed signature image.',
          components: [
            { name: 'logo', type: 'image', x: 3, y: 5, w: 15, h: 5 },
            { name: 'heading', type: 'text', x: 3, y: 20, w: 42, h: 8, fontRole: 'h1', maxChars: 30 },
            { name: 'contact-body', type: 'text', x: 3, y: 32, w: 42, h: 40, fontRole: 'body', maxChars: 600 },
            { name: 'website-info', type: 'text', x: 3, y: 65, w: 42, h: 5, fontRole: 'subtitle', maxChars: 60 },
            { name: 'qr-code', type: 'image', x: 3, y: 75, w: 12, h: 18 },
            { name: 'caption', type: 'text', x: 18, y: 80, w: 27, h: 10, fontRole: 'caption', maxChars: 80 },
            { name: 'signature-image', type: 'image', x: 50, y: 0, w: 50, h: 100, imageDescription: 'Signature sculpture in grand hotel lobby or museum entrance, warm evening lighting, people visible for scale reference' },
          ],
        },
      ],

      tokensCss: `:root {
  /* Colors */
  --color-background: #0D0D0D;
  --color-primary: #C9A96E;
  --color-text-primary: #FFFFFF;
  --color-text-body: #B0B0B0;
  --color-text-muted: #808080;
  --color-surface-dark: #1A1A1A;
  --color-surface-light: #F5F0EB;

  /* Typography */
  --font-heading: 'Helvetica Neue', 'Helvetica', 'Arial', sans-serif;
  --font-body: 'Montserrat', sans-serif;
  --font-size-h1: 42pt;
  --font-size-h2: 28pt;
  --font-size-subtitle: 16pt;
  --font-size-body: 13pt;
  --font-size-caption: 9px;
  --font-weight-h1: 400;
  --font-weight-body: 300;

  /* Spacing */
  --spacing-xs: 8px;
  --spacing-sm: 16px;
  --spacing-md: 24px;
  --spacing-lg: 48px;
  --spacing-xl: 80px;
  --spacing-2xl: 120px;

  /* Grid */
  --grid-columns: 2;
  --grid-gutter: 0px;
  --page-margin: 40px;
}`,
    },
  });

  console.log(`Brand Design Profile created: ${profileId}`);
  console.log('  Colors: 8');
  console.log('  Typography: 7 roles');
  console.log('  Layout patterns: 5');
  console.log('  CSS tokens generated');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
