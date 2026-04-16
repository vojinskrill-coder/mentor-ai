# NEURON OS — Website Design & Copy Specification
## Complete Instructions for Claude Agent Implementation

**Created by:** Caravaggio (Visual), Sally (UX), Sophia (Copy), Victor (Strategy)
**Date:** April 3, 2026
**Target:** Single-page marketing website + subpages

---

## DESIGN SYSTEM

### Color Palette
| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-primary` | `#0A0A0F` | Page background (near-black with blue undertone) |
| `--bg-surface` | `#12121A` | Cards, sections |
| `--bg-elevated` | `#1A1A2E` | Hover states, feature boxes |
| `--border` | `#2A2A3E` | Subtle borders |
| `--text-primary` | `#F5F5F7` | Headlines, body |
| `--text-secondary` | `#8B8BA3` | Descriptions, captions |
| `--accent-blue` | `#3B82F6` | Primary CTA, links |
| `--accent-cyan` | `#22D3EE` | Neuron OS brand accent (from logo) |
| `--accent-gradient` | `linear-gradient(135deg, #1E40AF, #06B6D4)` | Logo gradient, hero highlights |
| `--success` | `#22C55E` | Metrics, positive stats |
| `--gold` | `#C9A96E` | Premium tier, enterprise |

### Typography
- **Headlines:** Inter, 700 weight, -0.02em letter-spacing
- **Body:** Inter, 400 weight, 1.6 line-height
- **Code/Data:** JetBrains Mono, 400 weight
- **Hero headline:** 64-80px (clamp responsive)
- **Section headlines:** 40-48px
- **Body:** 16-18px

### Spacing & Grid
- Max content width: 1200px
- Section padding: 120px vertical
- Bento grid: CSS Grid with `gap: 24px`, auto-fill columns
- Cards: 16px padding, 12px border-radius, 1px solid `--border`

### Animations
- Scroll-triggered fade-in-up (IntersectionObserver, 0.6s ease)
- Hero: gradient text shimmer (subtle, 8s loop)
- Product screenshots: subtle parallax on scroll
- Number counters: animate from 0 on scroll enter
- Hover: cards lift 4px with shadow transition

---

## PAGE STRUCTURE

### Navigation Bar (Sticky)
```
[Neuron OS Logo + Text]     [Kako radi]  [Mogucnosti]  [Cene]  [Slucajevi]     [Prijavi se]  [Zatrazi demo]
```
- Transparent initially, solid `--bg-primary` on scroll
- Logo: Neuron OS icon (IMG_0548.PNG) + "Neuron OS" text
- CTA buttons: ghost "Prijavi se" + solid blue "Zatrazi demo"
- Mobile: hamburger menu

---

## SECTION 1: HERO
**Goal:** Instant understanding + emotion + CTA

### Layout
Full-screen dark section with centered content. Behind the text, a subtle radial gradient (blue→transparent) emanates from the center. Below the headline, an animated product screenshot floats with soft glow.

### Copy
```
[Overline — small, cyan, uppercase]
DIGITALNI OPERATIVNI SISTEM ZA POSAO

[H1 — 72px, bold, gradient text blue→cyan]
Vas posao ima mozak.
Sada ima i operativni sistem.

[Subtitle — 20px, text-secondary, max-width 600px]
Neuron OS uci vas biznis, proaktivno predlaze automatizacije
i izvrsava ih kroz 400+ integracija. Vi odobravate. On radi.

[CTA row — two buttons]
[Solid blue] Zatrazi besplatni demo  →
[Ghost border] Pogledaj kako radi  ▶
```

### Visual
- Floating product screenshot showing the Business Brain graph view with glowing nodes
- Subtle particle animation behind (represents neural connections)
- Below hero: trust bar with logos — "Koristi n8n, DeepSeek, Notion, NocoDB" (integration logos, grayscale)

---

## SECTION 2: THE PROBLEM
**Goal:** Pain recognition — reader thinks "that's exactly my problem"

### Layout
Dark section, centered text block followed by 6-column bento grid of problem cards.

### Copy
```
[Overline — cyan]
PROBLEM

[H2 — 48px]
Svaki biznis radi na necijom glavi.
To ne skalira.

[Subtitle]
Vlasnici i timovi se bore sa istih 6 problema — bez obzira na industriju ili velicinu.
```

### Bento Grid — 6 Problem Cards
Each card: icon (emoji or minimal SVG) + title + stat + source

| Card | Title | Stat | Source |
|------|-------|------|--------|
| 1 | Spora egzekucija | 60% radnog vremena na "rad o radu" | Asana |
| 2 | Znanje odlazi sa ljudima | 48% firmi gubi znanje pri odlasku | Gallup |
| 3 | Informacioni silosi | $12,506 godisnje po zaposlenom | Pebb |
| 4 | Reaktivni, ne proaktivni | 85% odluka na zastarelim podacima | BusinessWire |
| 5 | Odluke na osecaj | Samo 29% aplikacija integrisano | MuleSoft |
| 6 | Repetitivni posao | Samo 10% vremena prodajni repovi prodaju | Blogging Wizard |

**Visual treatment:** Each card has a subtle red/orange gradient top border. On hover, the stat number animates and the card lifts.

---

## SECTION 3: WHY AI TOOLS FAIL
**Goal:** Differentiate from ChatGPT, Copilot, Jasper

### Layout
Split — left side: illustration of disconnected tools (chat windows floating isolated). Right side: copy.

### Copy
```
[Overline — cyan]
ZASTO AI ALATI NE RESAVAJU OVO

[H2]
Svaki AI alat danas je izolovani chat prozor.

[Body]
ChatGPT ne poznaje vas biznis. Copilot pomaze sa jednim zadatkom.
Jasper pise tekst bez razumevanja strategije.

Svaki alat radi u vakuumu — bez deljenog konteksta, bez memorije
izmedju sesija, bez komunikacije izmedju alata, bez izvrsavanja procesa.

[Highlight box — gradient border]
"Svaki put kad promenite alat, krecete od nule."
```

---

## SECTION 4: THE SOLUTION — HOW NEURON OS WORKS
**Goal:** Clear 3-step explanation with product visuals

### Layout
Centered headline, then 3 large feature blocks stacked vertically. Each block: left product screenshot, right copy (alternating sides).

### Copy + Visuals

**Block 1: UCI**
```
[Number badge] 01
[H3] Uci vas biznis za nedelju dana
[Body] Neuron OS upija sve o vasem biznisu — industriju, konkurenciju,
procese, bazu znanja, strukturu tima, trzisnu dinamiku.

Ono sto bi novom zaposlenom trebalo 8-26 nedelja,
Neuron OS apsorbuje iz dokumenata, razgovora i istrazivanja.

[Visual: Screenshot of onboarding wizard + business brain graph building up]
```

**Block 2: RAZMISLJA**
```
[Number badge] 02
[H3] Proaktivno identifikuje prilike
[Body] Sistem kontinuirano analizira vas poslovni kontekst.
Ne ceka da pitate — predlaze konkretne akcije sa ocekivanim rezultatima.

"Pronasao sam 5 potencijalnih klijenata u vasoj industriji.
3 su relevantna. Napisao sam personalizovane poruke. Odobri?"

[Visual: Screenshot of chat with AI proposing tasks + task list with scores]
```

**Block 3: IZVRSAVA**
```
[Number badge] 03
[H3] Izvrsava kroz 400+ integracija
[Body] Kada odobrite predlog, Neuron OS dizajnira i pokrece
automatizaciju kroz n8n — povezujuci se sa vasim alatima.

CRM, email, drustvene mreze, analitika, placanja...
Covek odobrava. Agent izvrsava.

[Visual: Screenshot of process results with leads/content + n8n flow diagram]
```

### Key Differentiator Quote Block
```
[Large gradient-bordered card, centered]

"Zapier i n8n su ruke bez mozga.
 Copilot i Notion AI su mozak bez ruku.
 Neuron OS je mozak koji koristi n8n kao ruke —
 sa vlasnikom kao kontrolerom."
```

---

## SECTION 5: FEATURES — BENTO GRID
**Goal:** Show breadth of capabilities

### Layout
Large bento grid (3 columns, mixed sizes). Each cell: icon + title + 1-line description + mini screenshot or illustration.

| Cell | Size | Title | Description |
|------|------|-------|-------------|
| 1 | 2x1 (wide) | Poslovni mozak | 548+ koncepata organizovanih u kognitivne domene. Pamti, uci, evolira. |
| 2 | 1x1 | Otkrivanje lead-ova | Pronalazi, kvalifikuje i pise outreach automatski. |
| 3 | 1x1 | Kreiranje sadrzaja | Instagram, blog, newsletter — brendirani sadrzaj u minutima. |
| 4 | 1x1 | Katalog procesa | Ukljucite procese jednim klikom. Rastuce biblioteka. |
| 5 | 1x1 | MCP alati | Notion, NocoDB, Slack, Gmail — povezite svoje alate. |
| 6 | 2x1 (wide) | Vizuelni graf znanja | Interaktivni graf koji prikazuje sta vas biznis zna i gde su praznine. |
| 7 | 1x1 | Multi-tenant | Potpuna izolacija podataka izmedju klijenata. |
| 8 | 1x1 | Departmanski pristup | Svaki tim vidi samo svoj domen + osnove. |

---

## SECTION 6: SOCIAL PROOF / CASE STUDY
**Goal:** Build trust through real results

### Layout
Dark section with light accent. Large numbers + LSA case study.

### Copy
```
[Overline — cyan]
PRVI KLIJENT

[H2]
Od nule do prvog VIP projekta za 2 meseca.
Sa $130 troskova za AI.

[3 large metric cards in row]
| 2 nedelje        | 3 partnera        | 120 EUR          |
| Kompletna firma  | Arhitektonske firme| Umesto 10,000 EUR|
| postavljena       | potpisan ugovor   | za konsultante   |

[Body — italic, testimonial style]
"LSA je atelje za luksuzne monumentalne skulpture. Potpuno novo trziste,
nula konkurencije u regionu. Tim od 5 ljudi trebao je sve od nule —
organizaciju, marketing, materijale, cene, brosure, web.

Bez Neuron OS-a, procena je bila meseci rada i 10,000+ EUR za konsultante.
Sa Neuron OS-om, biznis je bio na nogama za 2 nedelje. Prva zarada za 2 meseca."

— Vojin Rakonjac, Co-founder, LSA & Neuron OS
```

---

## SECTION 7: PRICING
**Goal:** Clear tiers, CTA for demo

### Layout
3 pricing cards side by side. Middle (Pro) slightly elevated + highlighted.

| | Starter | Pro | Enterprise |
|---|---------|-----|------------|
| **Price** | 99 EUR/mo | 299 EUR/mo | Custom |
| **Users** | 1-3 | 1-10 | Unlimited |
| **Processes** | 3 active | Unlimited | Unlimited + Custom |
| **AI Conversations** | 500/mo | 5,000/mo | Unlimited |
| **MCP Tools** | 2 | All | All + Custom |
| **Support** | Email | Priority | Dedicated |
| **CTA** | Pocni besplatno | Najpopularniji → | Kontaktirajte nas |

### Below pricing
```
[FAQ accordion — 4-6 questions]
- Da li mogu da probam besplatno?
- Sta se desava sa mojim podacima?
- Koliko traje implementacija?
- Da li radi sa mojim postojecim alatima?
- Mogu li da hostujem na svom serveru?
```

---

## SECTION 8: FINAL CTA
**Goal:** Convert

### Layout
Full-width gradient section (blue→cyan, subtle). Centered.

### Copy
```
[H2 — 48px, white]
Vas biznis zasluzuje operativni sistem.

[Subtitle — 18px]
Zakazite demo poziv od 15 minuta i pogledajte kako Neuron OS
moze da ubrza vas tim — bez obaveza.

[Large CTA button — white bg, dark text]
Zakazite besplatni demo  →

[Small text below]
Bez kreditne kartice. Setup za 10 minuta. Otkaz u bilo kom trenutku.
```

---

## SECTION 9: FOOTER
```
[4 columns]

Column 1: Neuron OS logo + tagline
  "Digitalni operativni sistem za posao"

Column 2: Proizvod
  - Kako radi
  - Mogucnosti
  - Cene
  - Dokumentacija
  - Changelog

Column 3: Kompanija
  - O nama
  - Blog
  - Kontakt
  - Karijere

Column 4: Pravno
  - Uslovi koriscenja
  - Politika privatnosti
  - GDPR

[Bottom bar]
© 2026 Neuron OS. Sva prava zadrzana.
[Social icons: LinkedIn, Twitter/X, GitHub]
```

---

## VISUAL ASSETS NEEDED

| Asset | Description | Source |
|-------|-------------|--------|
| Hero product shot | Business Brain graph view with glowing nodes | Screenshot from app (dark mode) |
| Onboarding screenshot | Wizard showing business learning progress | Screenshot from app |
| Chat + tasks screenshot | AI proposing actions with scores | Screenshot from app |
| Process results screenshot | Lead discovery or content creation results | Screenshot from app |
| n8n workflow diagram | Simplified visual of process flow | Diagram or screenshot |
| Neuron OS logo | IMG_0548.PNG — icon only | Already have |
| Neuron OS logo + text | Full logo with "Neuron OS" text | Already have (Gemini version) |
| Integration logos | n8n, DeepSeek, Notion, NocoDB, Gmail, Slack | SVG from official sources |
| Problem icons | 6 minimal icons for problem cards | Generate or use Lucide icons |

---

## REFERENCE WEBSITES FOR DESIGN INSPIRATION

1. **linear.app** — Dark theme, premium feel, animated product shots, buttery transitions
2. **vercel.com** — Gradient text, bento grids, bold typography, developer-premium aesthetic
3. **n8n.io** — Workflow visualization, integration showcase, automation narrative
4. **notion.so** — Clean spacious layout, "one tool" positioning, template gallery concept
5. **jasper.ai** — AI for business positioning, ROI stats, enterprise trust signals, before/after

### What to take from each:
- **Linear:** The dark gradient aesthetic, product-in-context screenshots, smooth scroll animations
- **Vercel:** Bento grid layout for features, gradient headline treatment, trust logos bar
- **n8n:** Process/workflow visualization style, "400+ integrations" messaging approach
- **Notion:** Spacious section design, template/catalog browsing UI, simplicity
- **Jasper:** B2B AI positioning language, case study format, pricing page structure

---

## TECHNICAL IMPLEMENTATION NOTES

- **Framework:** Next.js 14+ with App Router (or Astro for pure static)
- **Styling:** Tailwind CSS v4 with dark theme tokens
- **Animations:** Framer Motion for scroll-triggered animations
- **Hosting:** Vercel or Railway
- **Analytics:** Plausible (privacy-first)
- **Forms:** Cal.com embed for demo booking
- **Performance targets:** Lighthouse 95+ on all metrics
- **Responsive:** Mobile-first, breakpoints at 640px, 768px, 1024px, 1280px

---

## COPY TONE GUIDELINES (by Sophia, Storyteller)

1. **Direct, not corporate.** "Vas posao ima mozak" not "Unapredite poslovne procese"
2. **Serbian first, English technical terms OK.** Keep brand names in English (Neuron OS, OpenClaw)
3. **Short sentences.** Max 15 words per sentence in hero. 20 in body.
4. **Numbers > adjectives.** "2 nedelje" not "brzo". "$130" not "pristupacno".
5. **Contrast pairs.** "Mozak bez ruku / Ruke bez mozga" — the core messaging device.
6. **No fluff.** Every sentence must earn its place. If it doesn't inform or persuade, cut it.
7. **CTA language:** Action verbs. "Zatrazi", "Pogledaj", "Zakazite" — not "Saznajte vise".
