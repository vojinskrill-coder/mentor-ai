---
name: Figma Brochure Generation Feature
description: AI-powered brochure generation from Figma design profiles — 6-step process with granular component-level approval
type: project
---

## Feature: Figma Brochure Generation

### Figma Credentials
- Client ID: D7aK9IpBxCflAxiB5gfNu1
- Client Secret: B5kOF1l5mUNzVS15aQNrzina5e4WwU
- Reference File Key: sTjPUTmhrfvcKVdfMawdTa
- Env vars saved in apps/api/.env as FIGMA_CLIENT_ID and FIGMA_CLIENT_SECRET

### Process Flow (6 steps)
1. **IDEJE** — OpenClaw predlaze 3-5 ideja za brosuru sa scoring-om. Korisnik modifikuje/odobri/odbaci. Feedback loop.
2. **LAYOUT** — AI kreira wireframe layout za svaku stranicu na osnovu BrandDesignProfile. Vizuelni prikaz praznih slotova. Stranica-po-stranica review.
3. **TEKST** — AI popunjava tekst slotove (postuje maxChars). Komponenta-po-komponenta review. Odobri/edituj/regenerisi.
4. **SLIKE** — FAL.ai popunjava image slotove (postuje dimenzije). Komponenta-po-komponenta review. Odobri/uploaduj/regenerisi.
5. **PREVIEW** — Kompletna brosura. Finalno odobrenje ili vrati se na prethodni step.
6. **EXPORT** — PDF (print-ready) + Figma Plugin (editabilni dizajn).

### Key Architecture
- BrandDesignProfile Prisma model — cuva ekstrahovane tokene iz Figma fajla
- BrochureProject → BrochurePage → BrochureComponent hijerarhija
- Svaka komponenta ima: status (pending/approved/rejected), feedback, version
- BrochurePageViewer Angular komponenta — vizuelni mini-Figma editor
- Isti viewer za wireframe (prazni slotovi) i content (popunjeni slotovi)
- Feedback-driven regenerisanje sa istorijom verzija

### Sprint Plan
- Sprint 1: Figma OAuth + Design Token/Pattern Extraction
- Sprint 2: Brochure Process Definition (6 steps) + Design Director AI
- Sprint 3: Rendering Engine (HTML/CSS templates + Puppeteer PDF)
- Sprint 4: Figma Plugin + BrochurePageViewer UI

### Tech: HTML/CSS → Puppeteer PDF + Figma Plugin for editable output
