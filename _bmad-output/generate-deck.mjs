import PptxGenJS from 'pptxgenjs';

const pptx = new PptxGenJS();
pptx.layout = 'LAYOUT_WIDE';

// ═══ PALETTE — clean, readable, dynamic ═══
const BG = 'FFFFFF';
const ACCENT = '2563EB';       // Vibrant blue
const ACCENT_DARK = '1E40AF';  // Deep blue for section titles
const ACCENT_LIGHT = 'DBEAFE'; // Light blue tint
const ACCENT_BG = 'EFF6FF';    // Very subtle blue bg
const HEADING = '0F172A';      // Near-black
const DARK = '1E293B';         // Dark slate body
const GRAY = '475569';         // Medium gray
const MUTED = '94A3B8';        // Captions
const SURFACE = 'F1F5F9';      // Card bg
const SURFACE2 = 'E2E8F0';     // Darker card
const GREEN = '059669';
const ORANGE = 'EA580C';
const PURPLE = '7C3AED';
const WHITE = 'FFFFFF';

// ═══ HELPERS ═══
const sn = (s, n) => s.addText(String(n), { x: 12.5, y: 7.0, w: 0.5, h: 0.3, fontSize: 9, color: MUTED, align: 'right' });
const line = (s, x, y, w, c = ACCENT) => s.addShape(pptx.ShapeType.rect, { x, y, w, h: 0.04, fill: { color: c } });
const title = (s, t, y = 0.5) => s.addText(t, { x: 0.8, y, w: 11.5, h: 0.6, fontSize: 28, fontFace: 'Helvetica Neue', color: ACCENT_DARK, bold: true, charSpacing: 2 });
const sub = (s, t, y) => s.addText(t, { x: 0.8, y, w: 11.5, h: 0.5, fontSize: 17, fontFace: 'Montserrat', color: HEADING, lineSpacingMultiple: 1.3 });
const card = (s, x, y, w, h, c = SURFACE) => s.addShape(pptx.ShapeType.rect, { x, y, w, h, fill: { color: c }, rectRadius: 0.1 });

// ═══ SLIDE 1: COVER ═══
{
  const s = pptx.addSlide();
  // Left accent strip
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.35, h: 7.5, fill: { color: ACCENT } });
  // Subtle background shape top-right
  s.addShape(pptx.ShapeType.rect, { x: 8, y: 0, w: 5.33, h: 3, fill: { color: ACCENT_BG } });
  s.background = { color: BG };

  line(s, 0.8, 2.7, 2.5, ACCENT);
  s.addText('NEURON OS', { x: 0.8, y: 2.9, w: 11, h: 1.2, fontSize: 54, fontFace: 'Helvetica Neue', color: ACCENT_DARK, bold: true, charSpacing: 5 });
  s.addText('The Digital Operating System for Business', { x: 0.8, y: 4.1, w: 11, h: 0.7, fontSize: 22, fontFace: 'Montserrat', color: GRAY });
  line(s, 0.8, 5.0, 4, ACCENT);
  s.addText('Pre-Seed Investment Deck  |  April 2026  |  Confidential', { x: 0.8, y: 5.4, w: 11, h: 0.4, fontSize: 12, fontFace: 'Montserrat', color: MUTED });
}

// ═══ SLIDE 2: PROBLEM ═══
{
  const s = pptx.addSlide();
  s.background = { color: BG };
  sn(s, 1);
  title(s, 'THE PROBLEM');
  line(s, 0.8, 1.1, 1.5);

  s.addText('Every business runs on someone\'s brain. That doesn\'t scale.', { x: 0.8, y: 1.3, w: 11.5, h: 0.6, fontSize: 18, fontFace: 'Montserrat', color: HEADING, italic: true });

  const problems = [
    ['Slow execution', '60% of work time spent on "work about work" — only 27% on skilled work', 'Asana', ACCENT],
    ['Knowledge walks out', '48% of companies lose institutional knowledge with each departure', 'Gallup', PURPLE],
    ['Information silos', 'Employees lose up to 12 hours/week due to data silos', 'Sinequa', ORANGE],
    ['Reactive, not proactive', '85% of companies make decisions based on stale data', 'BusinessWire', GREEN],
    ['Gut-feeling decisions', 'Only 29% of applications are integrated — incomplete data', 'MuleSoft', ACCENT],
    ['Repetitive work', 'B2B sales reps spend only 10% of time actually selling', 'Blogging Wizard', PURPLE],
  ];

  problems.forEach(([t, stat, src, color], i) => {
    const y = 2.1 + i * 0.85;
    s.addShape(pptx.ShapeType.rect, { x: 0.8, y, w: 0.25, h: 0.65, fill: { color }, rectRadius: 0.05 });
    s.addText(t, { x: 1.2, y, w: 3.0, h: 0.35, fontSize: 13, fontFace: 'Montserrat', color: HEADING, bold: true });
    s.addText(`${stat} (${src})`, { x: 4.4, y, w: 8.1, h: 0.65, fontSize: 11, fontFace: 'Montserrat', color: GRAY, valign: 'middle' });
  });
}

// ═══ SLIDE 3: WHY EXISTING AI FAILS ═══
{
  const s = pptx.addSlide();
  s.background = { color: BG };
  sn(s, 2);
  title(s, 'WHY EXISTING AI DOESN\'T SOLVE THIS');
  line(s, 0.8, 1.1, 1.5);

  s.addText('Every AI tool today is an isolated chat window.', { x: 0.8, y: 1.5, w: 11.5, h: 0.6, fontSize: 20, fontFace: 'Montserrat', color: HEADING });

  const items = [
    'ChatGPT doesn\'t know your business.',
    'Copilot helps with one task in isolation.',
    'Jasper writes copy without understanding your strategy.',
    'Each tool works in a vacuum — no shared context, no memory, no process execution.',
    'Every time you switch tools, you start from zero.',
  ];

  items.forEach((text, i) => {
    s.addShape(pptx.ShapeType.rect, { x: 1.0, y: 2.5 + i * 0.75, w: 0.15, h: 0.15, fill: { color: ORANGE } });
    s.addText(text, { x: 1.4, y: 2.38 + i * 0.75, w: 10.5, h: 0.55, fontSize: 14, fontFace: 'Montserrat', color: DARK });
  });

  card(s, 0.8, 6.0, 11.7, 0.9, ACCENT_BG);
  s.addText('88% of SMB leaders feel overwhelmed by too many tools. Average SMB uses 7 apps. Only 29% are integrated.', { x: 1.0, y: 6.1, w: 11.3, h: 0.7, fontSize: 12, fontFace: 'Montserrat', color: ACCENT_DARK, italic: true, align: 'center' });
}

// ═══ SLIDE 4: SOLUTION ═══
{
  const s = pptx.addSlide();
  s.background = { color: BG };
  sn(s, 3);
  title(s, 'THE SOLUTION');
  line(s, 0.8, 1.1, 1.5);

  s.addText('A digital operating system that learns your business\nand accelerates everything you do.', { x: 0.8, y: 1.4, w: 11.5, h: 0.8, fontSize: 17, fontFace: 'Montserrat', color: HEADING, lineSpacingMultiple: 1.3 });

  const pillars = [
    { num: '01', title: 'IT LEARNS', desc: 'Ingests everything about your business — industry, competitors, processes, knowledge base. What takes a new hire 8-26 weeks, Neuron OS absorbs from documents and conversations.', color: ACCENT },
    { num: '02', title: 'IT THINKS', desc: 'Proactively identifies opportunities, bottlenecks, and optimizations. Doesn\'t wait for you to ask — analyzes context and proposes concrete actions.', color: PURPLE },
    { num: '03', title: 'IT ACTS', desc: 'Designs and executes automations through n8n — 400+ integrations. The owner approves, the agent executes. Human-in-the-loop at every critical decision.', color: GREEN },
  ];

  pillars.forEach((p, i) => {
    const x = 0.8 + i * 4.1;
    card(s, x, 2.5, 3.8, 3.3, SURFACE);
    // Top color strip
    s.addShape(pptx.ShapeType.rect, { x, y: 2.5, w: 3.8, h: 0.08, fill: { color: p.color } });
    s.addText(p.num, { x: x + 0.2, y: 2.7, w: 0.6, h: 0.5, fontSize: 22, fontFace: 'Helvetica Neue', color: p.color, bold: true });
    s.addText(p.title, { x: x + 0.2, y: 3.2, w: 3.4, h: 0.4, fontSize: 15, fontFace: 'Helvetica Neue', color: HEADING, bold: true, charSpacing: 2 });
    line(s, x + 0.2, 3.65, 1, p.color);
    s.addText(p.desc, { x: x + 0.2, y: 3.8, w: 3.4, h: 1.8, fontSize: 11, fontFace: 'Montserrat', color: GRAY, lineSpacingMultiple: 1.4, valign: 'top' });
  });

  card(s, 0.8, 6.2, 11.7, 0.8, ACCENT_DARK);
  s.addText('"Zapier and n8n are hands without a brain. Copilot and Notion AI are a brain without hands.\nNeuron OS is the brain that uses n8n as its hands — with the owner as the controller."', { x: 1.0, y: 6.25, w: 11.3, h: 0.7, fontSize: 11, fontFace: 'Montserrat', color: WHITE, italic: true, align: 'center', lineSpacingMultiple: 1.3 });
}

// ═══ SLIDE 5: MARKET ═══
{
  const s = pptx.addSlide();
  s.background = { color: BG };
  sn(s, 4);
  title(s, 'MARKET OPPORTUNITY');
  line(s, 0.8, 1.1, 1.5);

  sub(s, 'AI automation is the fastest-growing technology market in history.', 1.4);

  const markets = [
    { label: 'AI Automation', now: '$130B', future: '$1.14T (2033)', cagr: '31.4%', color: ACCENT },
    { label: 'Agentic AI', now: '$5.2B', future: '$199B (2034)', cagr: '43.8%', color: PURPLE },
    { label: 'Process Automation', now: '$14.5B', future: '$44.7B (2030)', cagr: '22.6%', color: GREEN },
  ];

  markets.forEach((m, i) => {
    const x = 0.8 + i * 4.1;
    card(s, x, 2.1, 3.8, 1.7, SURFACE);
    s.addShape(pptx.ShapeType.rect, { x, y: 2.1, w: 3.8, h: 0.06, fill: { color: m.color } });
    s.addText(m.label, { x: x + 0.2, y: 2.25, w: 3.4, h: 0.3, fontSize: 11, fontFace: 'Montserrat', color: MUTED });
    s.addText(`${m.now}  →  ${m.future}`, { x: x + 0.2, y: 2.6, w: 3.4, h: 0.4, fontSize: 13, fontFace: 'Montserrat', color: HEADING, bold: true });
    s.addText(`CAGR ${m.cagr}`, { x: x + 0.2, y: 3.05, w: 3.4, h: 0.35, fontSize: 15, fontFace: 'Helvetica Neue', color: m.color, bold: true });
  });

  // Funding table
  s.addText('Capital is following', { x: 0.8, y: 4.1, w: 5, h: 0.4, fontSize: 15, fontFace: 'Helvetica Neue', color: HEADING, bold: true });

  const rows = [
    [{ text: 'Company', options: { bold: true, color: ACCENT_DARK } }, { text: 'Growth Signal', options: { bold: true, color: ACCENT_DARK } }, { text: 'Valuation', options: { bold: true, color: ACCENT_DARK } }],
    ['Cognition (Devin)', '$1M → $73M ARR in 9 months', '$10.2B'],
    ['Sierra AI', '$26M → $130M ARR in 12 months', '$10B'],
    ['n8n', '6x user growth YoY, 200K users', '$2.5B'],
    ['LangChain', '1,000+ enterprise customers', '$1.25B'],
  ];

  s.addTable(rows, {
    x: 0.8, y: 4.5, w: 7.5,
    fontSize: 11, fontFace: 'Montserrat', color: DARK,
    border: { type: 'solid', pt: 0.5, color: SURFACE2 },
    colW: [2.2, 3.3, 2], rowH: [0.35, 0.35, 0.35, 0.35, 0.35],
    autoPage: false,
  });

  // SMB adoption card
  card(s, 8.8, 4.5, 3.7, 2.3, ACCENT_BG);
  s.addText('SMB AI Adoption', { x: 9.0, y: 4.6, w: 3.3, h: 0.3, fontSize: 12, fontFace: 'Montserrat', color: ACCENT_DARK, bold: true });
  s.addText('39% → 55%', { x: 9.0, y: 5.0, w: 3.3, h: 0.5, fontSize: 26, fontFace: 'Helvetica Neue', color: ACCENT, bold: true });
  s.addText('in one year (+41%)', { x: 9.0, y: 5.4, w: 3.3, h: 0.3, fontSize: 12, fontFace: 'Montserrat', color: GREEN, bold: true });
  s.addText('But 51-76% don\'t know how AI fits their business.\n\nThe #1 barrier isn\'t money.\nIt\'s complexity.', { x: 9.0, y: 5.8, w: 3.3, h: 1.0, fontSize: 10, fontFace: 'Montserrat', color: GRAY, lineSpacingMultiple: 1.3 });
}

// ═══ SLIDE 6: PRODUCT ═══
{
  const s = pptx.addSlide();
  s.background = { color: BG };
  sn(s, 5);
  title(s, 'PRODUCT');
  line(s, 0.8, 1.1, 1.5);

  sub(s, 'A brain that learns your business. Hands that execute through 400+ integrations.', 1.4);

  const caps = [
    { t: 'Business Brain', d: 'Persistent, evolving model of the entire business. Industry, competitors, processes, knowledge — always learning.', c: ACCENT },
    { t: 'Proactive Discovery', d: 'AI agents analyze context continuously. Identifies what should be automated. Proposes actions with expected outcomes.', c: PURPLE },
    { t: 'n8n Execution Layer', d: 'Agent designs workflows automatically. 400+ integrations. Approval gates at every critical step. Catalog grows with every client.', c: GREEN },
  ];

  caps.forEach((cap, i) => {
    const y = 2.2 + i * 1.5;
    card(s, 0.8, y, 6.5, 1.3);
    s.addShape(pptx.ShapeType.rect, { x: 0.8, y, w: 0.08, h: 1.3, fill: { color: cap.c } });
    s.addText(cap.t, { x: 1.1, y: y + 0.1, w: 6.0, h: 0.35, fontSize: 14, fontFace: 'Helvetica Neue', color: cap.c, bold: true });
    s.addText(cap.d, { x: 1.1, y: y + 0.5, w: 6.0, h: 0.65, fontSize: 11, fontFace: 'Montserrat', color: GRAY, lineSpacingMultiple: 1.3 });
  });

  card(s, 7.6, 2.2, 4.9, 4.5);
  s.addText('BUILT-IN STARTER PROCESSES', { x: 7.8, y: 2.35, w: 4.5, h: 0.35, fontSize: 11, fontFace: 'Helvetica Neue', color: ACCENT_DARK, charSpacing: 2 });
  line(s, 7.8, 2.8, 1);

  const procs = [
    ['01', 'Lead Discovery', 'Finds and qualifies potential clients'],
    ['02', 'Content Creation', 'Blog, social media, newsletters, brochures'],
    ['03', 'Competitor Monitoring', 'Tracks competition, alerts on changes'],
    ['04', 'Client Onboarding', 'Standardizes new client intake'],
    ['05', 'Report Generation', 'Automatic weekly/monthly reports'],
  ];

  procs.forEach(([num, t, d], i) => {
    const y = 3.0 + i * 0.7;
    s.addText(num, { x: 7.8, y, w: 0.4, h: 0.3, fontSize: 14, fontFace: 'Helvetica Neue', color: ACCENT, bold: true });
    s.addText(t, { x: 8.3, y, w: 3.0, h: 0.3, fontSize: 12, fontFace: 'Montserrat', color: HEADING, bold: true });
    s.addText(d, { x: 8.3, y: y + 0.3, w: 3.8, h: 0.3, fontSize: 10, fontFace: 'Montserrat', color: MUTED });
  });
}

// ═══ SLIDE 7: TRACTION ═══
{
  const s = pptx.addSlide();
  s.background = { color: BG };
  sn(s, 6);
  title(s, 'TRACTION');
  line(s, 0.8, 1.1, 1.5, GREEN);

  sub(s, 'From zero to first VIP project in 2 months — with 120 EUR in AI costs.', 1.4);

  // Client info
  card(s, 0.8, 2.1, 5.8, 1.0);
  s.addText('LUXURY STATUES ADRIA', { x: 1.0, y: 2.15, w: 5.4, h: 0.3, fontSize: 11, fontFace: 'Helvetica Neue', color: ACCENT_DARK, charSpacing: 2 });
  s.addText('5 employees + partner network. Collaborates with architects and developers to bring unique monumental artworks to hotels and private villas.', { x: 1.0, y: 2.5, w: 5.4, h: 0.5, fontSize: 10, fontFace: 'Montserrat', color: GRAY, lineSpacingMultiple: 1.3 });

  card(s, 6.9, 2.1, 5.6, 1.0, ACCENT_BG);
  s.addText('Co-founder\'s own business. Neuron OS was born from a real problem, not a hypothesis.', { x: 7.1, y: 2.3, w: 5.2, h: 0.6, fontSize: 11, fontFace: 'Montserrat', color: ACCENT_DARK, italic: true });

  // Timeline
  const phases = [
    { period: '2 WEEKS', t: 'Business Setup', d: 'All materials, processes, procurement, pricing, brochures, web, messaging', c: ACCENT },
    { period: '+1 MONTH', t: 'Partnerships', d: '3 architecture firms signed collaboration agreements', c: PURPLE },
    { period: '+2 WEEKS', t: 'First Project', d: 'Live project for a VIP client', c: GREEN },
  ];

  phases.forEach((p, i) => {
    const x = 0.8 + i * 4.1;
    card(s, x, 3.4, 3.8, 1.8);
    s.addShape(pptx.ShapeType.rect, { x, y: 3.4, w: 3.8, h: 0.06, fill: { color: p.c } });
    s.addText(p.period, { x: x + 0.2, y: 3.55, w: 3.4, h: 0.35, fontSize: 16, fontFace: 'Helvetica Neue', color: p.c, bold: true });
    s.addText(p.t, { x: x + 0.2, y: 3.95, w: 3.4, h: 0.3, fontSize: 13, fontFace: 'Montserrat', color: HEADING, bold: true });
    s.addText(p.d, { x: x + 0.2, y: 4.35, w: 3.4, h: 0.7, fontSize: 11, fontFace: 'Montserrat', color: GRAY, lineSpacingMultiple: 1.3 });
  });

  // Metrics table
  const rows = [
    [{ text: 'Without Neuron OS', options: { bold: true, color: ORANGE } }, { text: 'With Neuron OS', options: { bold: true, color: GREEN } }],
    ['Months of setup', '2 weeks'],
    ['6+ months to revenue', '~2 months'],
    ['10,000+ EUR (consultants)', '120 EUR (AI)'],
    ['Nobody proactively suggests', 'Brain works non-stop'],
  ];

  s.addTable(rows, {
    x: 0.8, y: 5.5, w: 11.7,
    fontSize: 11, fontFace: 'Montserrat', color: DARK,
    border: { type: 'solid', pt: 0.5, color: SURFACE2 },
    colW: [5.85, 5.85], rowH: [0.32, 0.32, 0.32, 0.32, 0.32],
    autoPage: false,
  });
}

// ═══ SLIDE 8: BUSINESS MODEL ═══
{
  const s = pptx.addSlide();
  s.background = { color: BG };
  sn(s, 7);
  title(s, 'BUSINESS MODEL');
  line(s, 0.8, 1.1, 1.5);

  sub(s, 'Three revenue streams. High margins. Strong lock-in.', 1.4);

  const pRows = [
    [{ text: '', options: {} }, { text: 'STARTER', options: { bold: true, color: ACCENT } }, { text: 'PRO', options: { bold: true, color: PURPLE } }, { text: 'ENTERPRISE', options: { bold: true, color: GREEN } }],
    ['Setup fee', 'Free', '1,000 EUR', '2,000 EUR'],
    ['Monthly', '299 EUR', '799 EUR', '2,499 EUR'],
    ['ACV', '3,588 EUR', '10,588 EUR', '31,988 EUR'],
    ['Users', '1', 'Up to 10 + RBAC', 'Unlimited + SSO'],
    ['Processes', '5 from catalog', '5 + buy more', 'Full catalog + updates'],
    ['Custom dev', '—', '150 EUR/hr', '125 EUR/hr (priority)'],
  ];

  s.addTable(pRows, {
    x: 0.8, y: 2.0, w: 11.7,
    fontSize: 11, fontFace: 'Montserrat', color: DARK,
    border: { type: 'solid', pt: 0.5, color: SURFACE2 },
    colW: [2.2, 3.1, 3.2, 3.2], rowH: [0.35, 0.32, 0.32, 0.32, 0.32, 0.32, 0.32],
    autoPage: false,
  });

  // Unit economics
  s.addText('UNIT ECONOMICS', { x: 0.8, y: 4.6, w: 5, h: 0.3, fontSize: 12, fontFace: 'Helvetica Neue', color: ACCENT_DARK, charSpacing: 2 });

  const econ = [
    ['Blended CAC', '~400-600 EUR'],
    ['Blended ACV', '~6,000 EUR'],
    ['LTV:CAC', '8-12x (24mo retention)'],
    ['Gross margin', '65-80%'],
    ['CAC payback', '< 3 months'],
    ['Break-even', '~50-60 clients'],
  ];

  econ.forEach(([l, v], i) => {
    const y = 5.0 + i * 0.35;
    s.addText(l, { x: 0.8, y, w: 3, h: 0.3, fontSize: 11, fontFace: 'Montserrat', color: MUTED });
    s.addText(v, { x: 3.8, y, w: 3, h: 0.3, fontSize: 11, fontFace: 'Montserrat', color: HEADING, bold: true });
  });

  // Flywheel
  card(s, 7.6, 4.6, 4.9, 2.5, ACCENT_BG);
  s.addText('THE FLYWHEEL', { x: 7.8, y: 4.7, w: 4.5, h: 0.3, fontSize: 11, fontFace: 'Helvetica Neue', color: ACCENT_DARK, charSpacing: 2 });
  s.addText('Every new client generates custom process requests.\n\nEvery custom process becomes a catalog item.\n\nA larger catalog makes the product more valuable for the next client.\n\nThe product gets better and cheaper to deliver with every customer.', { x: 7.8, y: 5.1, w: 4.5, h: 2.0, fontSize: 11, fontFace: 'Montserrat', color: GRAY, lineSpacingMultiple: 1.3 });
}

// ═══ SLIDE 9: COMPETITIVE LANDSCAPE ═══
{
  const s = pptx.addSlide();
  s.background = { color: BG };
  sn(s, 8);
  title(s, 'COMPETITIVE LANDSCAPE');
  line(s, 0.8, 1.1, 1.5);

  sub(s, 'The only platform that learns, thinks, and acts — for the whole business.', 1.4);

  const cRows = [
    [{ text: 'Capability', options: { bold: true, color: ACCENT_DARK } }, { text: 'Zapier/n8n', options: { bold: true, color: ACCENT_DARK } }, { text: 'Relevance/Lindy', options: { bold: true, color: ACCENT_DARK } }, { text: 'MS Copilot', options: { bold: true, color: ACCENT_DARK } }, { text: 'Agentforce', options: { bold: true, color: ACCENT_DARK } }, { text: 'Neuron OS', options: { bold: true, color: ACCENT_DARK } }],
    ['Learns your business', 'No', 'No', 'Partial', 'CRM only', { text: 'FULL', options: { bold: true, color: GREEN } }],
    ['Proactively suggests', 'No', 'No', 'No', 'Partial', { text: 'YES', options: { bold: true, color: GREEN } }],
    ['Cross-platform', 'Yes', 'Yes', 'No', 'No', { text: 'YES', options: { bold: true, color: GREEN } }],
    ['Human-in-the-loop', 'Manual', 'Partial', 'No', 'Partial', { text: 'YES', options: { bold: true, color: GREEN } }],
    ['End user', 'Tech builds', 'Tech builds', 'Limited', 'Expensive', { text: 'Owner approves', options: { bold: true, color: GREEN } }],
  ];

  s.addTable(cRows, {
    x: 0.8, y: 2.0, w: 11.7,
    fontSize: 10, fontFace: 'Montserrat', color: DARK,
    border: { type: 'solid', pt: 0.5, color: SURFACE2 },
    colW: [2.2, 1.8, 2.0, 1.8, 1.9, 2.0], rowH: [0.35, 0.32, 0.32, 0.32, 0.32, 0.32],
    autoPage: false,
  });

  s.addText('KEY COMPETITORS', { x: 0.8, y: 4.2, w: 5, h: 0.3, fontSize: 11, fontFace: 'Helvetica Neue', color: ACCENT_DARK, charSpacing: 2 });

  const comps = [
    ['Zapier ($5B)', 'Trigger-action. You design everything.', ACCENT],
    ['n8n ($2.5B)', 'We use n8n as infrastructure, not competition.', PURPLE],
    ['Relevance AI', 'Closest competitor — still manual agent creation.', ORANGE],
    ['MS Copilot', 'Locked in M365. No business model awareness.', GRAY],
    ['Salesforce Agentforce', 'CRM only. $125-550/user/mo.', GRAY],
  ];

  comps.forEach(([name, gap, c], i) => {
    const y = 4.6 + i * 0.45;
    s.addShape(pptx.ShapeType.rect, { x: 0.8, y: y + 0.05, w: 0.12, h: 0.25, fill: { color: c } });
    s.addText(name, { x: 1.1, y, w: 2.8, h: 0.35, fontSize: 11, fontFace: 'Montserrat', color: HEADING, bold: true });
    s.addText(gap, { x: 4.0, y, w: 8.5, h: 0.35, fontSize: 11, fontFace: 'Montserrat', color: GRAY });
  });

  card(s, 0.8, 6.5, 11.7, 0.7, ACCENT_DARK);
  s.addText('n8n raised $313M to build the best workflow engine. We don\'t compete — we use it. Their 400+ integrations become ours.', { x: 1.0, y: 6.55, w: 11.3, h: 0.6, fontSize: 11, fontFace: 'Montserrat', color: WHITE, italic: true, align: 'center' });
}

// ═══ SLIDE 10: ROADMAP ═══
{
  const s = pptx.addSlide();
  s.background = { color: BG };
  sn(s, 9);
  title(s, 'ROADMAP');
  line(s, 0.8, 1.1, 1.5);

  const phases = [
    { label: 'M1-2', t: 'Foundation', items: 'Production-ready\nn8n integration\n5 starter processes\n3-5 pilot clients', c: ACCENT },
    { label: 'M3-4', t: 'Catalog', items: 'Setup < 48h\n10-15 processes\nProactive discovery\nSelf-serve onboarding', c: ACCENT },
    { label: 'M5-6', t: 'Launch', items: 'Public launch\n15-20 clients\nSDR active (USA)\nContent marketing', c: PURPLE },
    { label: 'M7-12', t: 'Traction', items: '50-60 clients\n30-40 processes\n+2 engineers\nBreak-even', c: PURPLE },
    { label: 'YEAR 2', t: 'Scale', items: '150-200 clients\n80+ processes\nIndustry packs\nPartner program', c: GREEN },
    { label: 'YEAR 3', t: 'Platform', items: '500+ clients\nMarketplace\nPredictive AI\nAPI-first', c: GREEN },
  ];

  // Timeline line
  line(s, 0.8, 2.5, 11.7, SURFACE2);

  phases.forEach((p, i) => {
    const x = 0.8 + i * 2.05;
    s.addShape(pptx.ShapeType.ellipse, { x: x + 0.7, y: 2.4, w: 0.2, h: 0.2, fill: { color: p.c } });
    s.addText(p.label, { x, y: 1.7, w: 1.8, h: 0.4, fontSize: 13, fontFace: 'Helvetica Neue', color: p.c, bold: true, align: 'center' });
    s.addText(p.t, { x, y: 2.05, w: 1.8, h: 0.3, fontSize: 11, fontFace: 'Montserrat', color: HEADING, align: 'center', bold: true });
    card(s, x, 2.9, 1.9, 2.5);
    s.addShape(pptx.ShapeType.rect, { x, y: 2.9, w: 1.9, h: 0.05, fill: { color: p.c } });
    s.addText(p.items, { x: x + 0.1, y: 3.05, w: 1.7, h: 2.2, fontSize: 10, fontFace: 'Montserrat', color: GRAY, lineSpacingMultiple: 1.4, valign: 'top' });
  });

  // KPIs bar
  card(s, 0.8, 5.7, 11.7, 1.4, SURFACE);
  s.addText('KEY MILESTONES', { x: 1.0, y: 5.8, w: 3, h: 0.3, fontSize: 11, fontFace: 'Helvetica Neue', color: ACCENT_DARK, charSpacing: 2 });

  const kpis = [
    { l: 'Month 6', v: '20+ clients', sub: '$10-15K MRR', c: ACCENT },
    { l: 'Month 12', v: '50-60 clients', sub: '$30-40K MRR • Break-even', c: PURPLE },
    { l: 'Year 2', v: '150-200 clients', sub: '$150-200K MRR • Series A', c: GREEN },
    { l: 'Year 3', v: '500+ clients', sub: '$500K+ MRR • Profitable', c: GREEN },
  ];

  kpis.forEach((k, i) => {
    const x = 1.0 + i * 2.9;
    s.addText(k.l, { x, y: 6.15, w: 2.6, h: 0.25, fontSize: 10, fontFace: 'Montserrat', color: MUTED });
    s.addText(k.v, { x, y: 6.4, w: 2.6, h: 0.3, fontSize: 14, fontFace: 'Helvetica Neue', color: k.c, bold: true });
    s.addText(k.sub, { x, y: 6.7, w: 2.6, h: 0.25, fontSize: 10, fontFace: 'Montserrat', color: GRAY });
  });
}

// ═══ SLIDE 11: TEAM ═══
{
  const s = pptx.addSlide();
  s.background = { color: BG };
  sn(s, 10);
  title(s, 'FOUNDING TEAM');
  line(s, 0.8, 1.1, 1.5);

  sub(s, 'Two technical co-founders who built the product because they needed it.', 1.4);

  // Vojin
  card(s, 0.8, 2.2, 5.6, 2.8);
  s.addShape(pptx.ShapeType.rect, { x: 0.8, y: 2.2, w: 5.6, h: 0.06, fill: { color: ACCENT } });
  s.addText('VOJIN RAKONJAC', { x: 1.0, y: 2.4, w: 5.2, h: 0.4, fontSize: 16, fontFace: 'Helvetica Neue', color: ACCENT_DARK, bold: true, charSpacing: 2 });
  s.addText('Co-Founder & CTO', { x: 1.0, y: 2.8, w: 5.2, h: 0.3, fontSize: 12, fontFace: 'Montserrat', color: ACCENT });
  line(s, 1.0, 3.15, 1);
  s.addText('15+ years in the technology industry. Full career path from engineer to VP at a global technology company — engineering, product management, head of delivery, VP of division.\n\nBuilds the Neuron OS architecture and leads all development.', { x: 1.0, y: 3.3, w: 5.2, h: 1.5, fontSize: 11, fontFace: 'Montserrat', color: GRAY, lineSpacingMultiple: 1.4 });

  // Dejan
  card(s, 6.8, 2.2, 5.7, 2.8);
  s.addShape(pptx.ShapeType.rect, { x: 6.8, y: 2.2, w: 5.7, h: 0.06, fill: { color: PURPLE } });
  s.addText('DEJAN CUSIC', { x: 7.0, y: 2.4, w: 5.3, h: 0.4, fontSize: 16, fontFace: 'Helvetica Neue', color: ACCENT_DARK, bold: true, charSpacing: 2 });
  s.addText('Co-Founder & CEO', { x: 7.0, y: 2.8, w: 5.3, h: 0.3, fontSize: 12, fontFace: 'Montserrat', color: PURPLE });
  line(s, 7.0, 3.15, 1, PURPLE);
  s.addText('20+ years of executive experience. MBA lecturer at RDS University Belgrade on AI impact on business. Combines academic AI knowledge with practical leadership.\n\nLeads strategy, pilot clients, and investor relations.', { x: 7.0, y: 3.3, w: 5.3, h: 1.5, fontSize: 11, fontFace: 'Montserrat', color: GRAY, lineSpacingMultiple: 1.4 });

  // Why us
  s.addText('WHY US', { x: 0.8, y: 5.3, w: 3, h: 0.3, fontSize: 12, fontFace: 'Helvetica Neue', color: ACCENT_DARK, charSpacing: 2 });

  const reasons = [
    { t: 'Built together', d: 'Dejan was Vojin\'s manager for years. Proven collaboration.', c: ACCENT },
    { t: 'Complementary', d: 'Both technical, both business. Dejan: MBA. Vojin: eng-to-exec.', c: PURPLE },
    { t: 'Born from need', d: 'Product built for a real business problem, not theory.', c: GREEN },
    { t: 'Full commitment', d: '12+ months unpaid (240-450K EUR forgone). Equity-driven.', c: ORANGE },
  ];

  reasons.forEach((r, i) => {
    const x = 0.8 + i * 3.05;
    s.addShape(pptx.ShapeType.rect, { x, y: 5.7, w: 0.08, h: 1.2, fill: { color: r.c } });
    s.addText(r.t, { x: x + 0.2, y: 5.7, w: 2.7, h: 0.3, fontSize: 11, fontFace: 'Montserrat', color: HEADING, bold: true });
    s.addText(r.d, { x: x + 0.2, y: 6.0, w: 2.7, h: 1.0, fontSize: 10, fontFace: 'Montserrat', color: GRAY, lineSpacingMultiple: 1.3, valign: 'top' });
  });
}

// ═══ SLIDE 12: VISION ═══
{
  const s = pptx.addSlide();
  s.background = { color: BG };
  sn(s, 11);
  title(s, 'VISION');
  line(s, 0.8, 1.1, 1.5);

  const vis = [
    { year: 'TODAY', t: 'Contextual Accelerator', d: 'Brain learns your business. Executes through n8n. Human-in-the-loop. 5 starter processes + growing catalog.', c: ACCENT },
    { year: 'YEAR 1-2', t: 'Proactive Operating System', d: 'Brain discovers what to automate. 50+ workflows. Industry knowledge packs. Multi-department context.', c: PURPLE },
    { year: 'YEAR 3', t: 'Autonomous Business OS', d: 'Predictive analytics. Cross-tenant insights. Autonomous routine decisions within defined boundaries. API-first.', c: GREEN },
    { year: 'YEAR 5', t: 'Platform Standard', d: 'Marketplace for third-party processes. Other products integrate WITH us. The Salesforce of business operations AI.', c: ORANGE },
  ];

  vis.forEach((v, i) => {
    const y = 1.6 + i * 1.35;
    card(s, 0.8, y, 11.7, 1.15, i === 0 ? ACCENT_BG : SURFACE);
    s.addShape(pptx.ShapeType.rect, { x: 0.8, y, w: 0.08, h: 1.15, fill: { color: v.c } });
    s.addText(v.year, { x: 1.1, y: y + 0.1, w: 2.0, h: 0.35, fontSize: 15, fontFace: 'Helvetica Neue', color: v.c, bold: true });
    s.addText(v.t, { x: 1.1, y: y + 0.5, w: 2.5, h: 0.35, fontSize: 13, fontFace: 'Montserrat', color: HEADING, bold: true });
    s.addText(v.d, { x: 3.8, y: y + 0.15, w: 8.5, h: 0.85, fontSize: 12, fontFace: 'Montserrat', color: GRAY, lineSpacingMultiple: 1.3, valign: 'middle' });
  });

  card(s, 0.8, 6.3, 11.7, 0.8, ACCENT_DARK);
  s.addText('"In 5 years, the question won\'t be \'do you use AI in your business\'\n— it will be \'which OS runs your business.\' We are building that OS."', { x: 1.0, y: 6.35, w: 11.3, h: 0.7, fontSize: 13, fontFace: 'Montserrat', color: WHITE, italic: true, align: 'center', lineSpacingMultiple: 1.3 });
}

// ═══ SLIDE 13: THE ASK ═══
{
  const s = pptx.addSlide();
  s.background = { color: BG };
  sn(s, 12);
  title(s, 'THE ASK');
  line(s, 0.8, 1.1, 1.5);

  sub(s, '480,000 EUR pre-seed to take Neuron OS from MVP to break-even in 12 months.', 1.4);

  // Terms
  card(s, 0.8, 2.1, 5.6, 2.6);
  s.addShape(pptx.ShapeType.rect, { x: 0.8, y: 2.1, w: 5.6, h: 0.06, fill: { color: ACCENT } });
  s.addText('TERMS', { x: 1.0, y: 2.25, w: 5.2, h: 0.3, fontSize: 11, fontFace: 'Helvetica Neue', color: ACCENT_DARK, charSpacing: 2 });

  const terms = [
    ['Instrument', 'SAFE (post-money)'],
    ['Valuation cap', '3.5-4M EUR'],
    ['Discount', '20%'],
    ['Total round', '480,000 EUR'],
    ['Min ticket', '40,000 EUR'],
    ['Dilution', '~10-12%'],
  ];

  terms.forEach(([l, v], i) => {
    const y = 2.65 + i * 0.33;
    s.addText(l, { x: 1.0, y, w: 2.5, h: 0.3, fontSize: 11, fontFace: 'Montserrat', color: MUTED });
    s.addText(v, { x: 3.5, y, w: 2.5, h: 0.3, fontSize: 12, fontFace: 'Montserrat', color: HEADING, bold: true });
  });

  // Use of funds
  card(s, 6.8, 2.1, 5.7, 2.6);
  s.addShape(pptx.ShapeType.rect, { x: 6.8, y: 2.1, w: 5.7, h: 0.06, fill: { color: PURPLE } });
  s.addText('USE OF FUNDS', { x: 7.0, y: 2.25, w: 5.3, h: 0.3, fontSize: 11, fontFace: 'Helvetica Neue', color: ACCENT_DARK, charSpacing: 2 });

  const funds = [
    { l: 'Product development', a: '300,000 EUR', p: 62, c: ACCENT },
    { l: 'AI infrastructure (GPU)', a: '80,000 EUR', p: 17, c: PURPLE },
    { l: 'Go-to-market', a: '70,000 EUR', p: 15, c: GREEN },
    { l: 'Buffer', a: '30,000 EUR', p: 6, c: ORANGE },
  ];

  funds.forEach((f, i) => {
    const y = 2.7 + i * 0.5;
    s.addShape(pptx.ShapeType.rect, { x: 7.0, y: y + 0.28, w: (f.p / 100) * 4.5, h: 0.12, fill: { color: f.c } });
    s.addText(f.l, { x: 7.0, y, w: 3.5, h: 0.25, fontSize: 11, fontFace: 'Montserrat', color: GRAY });
    s.addText(`${f.a} (${f.p}%)`, { x: 9.5, y, w: 2.5, h: 0.25, fontSize: 11, fontFace: 'Montserrat', color: HEADING, align: 'right' });
  });

  // Milestones
  s.addText('WHAT THIS INVESTMENT DELIVERS', { x: 0.8, y: 5.0, w: 6, h: 0.3, fontSize: 11, fontFace: 'Helvetica Neue', color: ACCENT_DARK, charSpacing: 2 });

  const ms = [
    { m: 'Month 2', t: 'Production-ready\n+ n8n integration', c: ACCENT },
    { m: 'Month 6', t: '20+ paying\nclients', c: ACCENT },
    { m: 'Month 10-14', t: 'Break-even\n50-60 clients', c: PURPLE },
    { m: 'Month 12', t: 'Seed-ready\n$30-40K MRR', c: GREEN },
  ];

  ms.forEach((m, i) => {
    const x = 0.8 + i * 3.05;
    card(s, x, 5.4, 2.8, 1.2);
    s.addShape(pptx.ShapeType.rect, { x, y: 5.4, w: 2.8, h: 0.05, fill: { color: m.c } });
    s.addText(m.m, { x: x + 0.15, y: 5.5, w: 2.5, h: 0.3, fontSize: 13, fontFace: 'Helvetica Neue', color: m.c, bold: true });
    s.addText(m.t, { x: x + 0.15, y: 5.85, w: 2.5, h: 0.6, fontSize: 11, fontFace: 'Montserrat', color: GRAY, lineSpacingMultiple: 1.3 });
  });

  // Closing
  s.addText('Two founders invested 12+ months unpaid to build a working product. First client: zero to VIP project in 2 months for 120 EUR. The product works. The market is exploding. We need capital to scale.', { x: 0.8, y: 6.7, w: 11.7, h: 0.5, fontSize: 11, fontFace: 'Montserrat', color: ACCENT_DARK, italic: true, align: 'center' });
}

// ═══ SLIDE 14: CLOSING ═══
{
  const s = pptx.addSlide();
  s.background = { color: BG };
  // Top accent bar
  s.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.33, h: 0.15, fill: { color: ACCENT } });

  line(s, 5.5, 2.5, 2.5, ACCENT);
  s.addText('NEURON OS', { x: 0.8, y: 2.8, w: 11.5, h: 1.0, fontSize: 48, fontFace: 'Helvetica Neue', color: ACCENT_DARK, bold: true, charSpacing: 5, align: 'center' });
  s.addText('The Digital Operating System for Business', { x: 0.8, y: 3.8, w: 11.5, h: 0.6, fontSize: 18, fontFace: 'Montserrat', color: GRAY, align: 'center' });

  line(s, 5.5, 4.6, 2.5, ACCENT);

  s.addText('Vojin Rakonjac  |  Co-Founder & CTO\nDejan Cusic  |  Co-Founder & CEO', { x: 3, y: 5.2, w: 7, h: 0.8, fontSize: 13, fontFace: 'Montserrat', color: HEADING, align: 'center', lineSpacingMultiple: 1.5 });

  s.addText('[email]  |  [phone]  |  [website]', { x: 3, y: 6.2, w: 7, h: 0.4, fontSize: 12, fontFace: 'Montserrat', color: MUTED, align: 'center' });

  s.addText('Confidential', { x: 5.5, y: 7.0, w: 2.5, h: 0.3, fontSize: 9, fontFace: 'Montserrat', color: MUTED, align: 'center' });
}

// ═══ SAVE ═══
pptx.writeFile({ fileName: './_bmad-output/Neuron-OS-Pitch-Deck.pptx' })
  .then(() => console.log('Deck saved: Neuron-OS-Pitch-Deck.pptx'))
  .catch(err => console.error('Error:', err));
