---
name: prompt-optimization-analysis
description: Deep analysis of agent pipeline inefficiencies with optimization plan — preserving quality, OpenClaw learning, and master agent knowledge accumulation
type: project
---

# Agent Pipeline Optimization Analysis — Full Findings + Plan

**Date**: 2026-03-17
**Goal**: Reduce cost/time by ~50% while IMPROVING quality. OpenClaw agents and master agents must continue learning.

## Current Pipeline Per Concept (~47K tokens, ~10-15 min)

```
1. Synthesis (LLM) → "FINALNI DOKUMENT" 1000+ reči
2. Scoring (LLM) → PREPISUJE synthesis + daje ocene
3. Job Planning (LLM) → uvek 2-4 joba, uvek web_search prvi
4. Agent Prompt Formatting (LLM × 2-4) → preformuliše instrukciju
5. OpenClaw Execution (× 2-4) → svaki agent 3-5 tool poziva
6. Consolidation (LLM) → TREĆA verzija istog dokumenta
7. Knowledge Updates (OpenClaw × 3-5) → domain masteri + main
```

## KRITIČNI PROBLEMI

### P1: Tri "finalne" verzije istog dokumenta
- Synthesis piše "FINALNI DOKUMENT" (headless-executor:344)
- Scoring PREPISUJE ceo dokument (headless-executor:427)
- Consolidation OPET PREPISUJE (headless-executor:555)
- **Uticaj**: ~10K tokena bačeno po konceptu
- **Fix**: Synthesis = DRAFT (ne "finalni"), Scoring = samo ocene (ne rewrite), Consolidation = jedina finalna verzija

### P2: Prompt koji piše prompt (dvostruka indirekcija)
- Job planner kreira instrukciju za agenta (job-planner:63)
- AgentPromptService poziva LLM da PREFORMULIŠE tu instrukciju (agent-prompt:56)
- **Uticaj**: ~3K tokena × 2-4 agenta po konceptu
- **Fix**: Koristi planner instrukciju direktno + grounding block. Bez LLM reformulisanja.

### P3: OBAVEZNO generisanje slika za SVE koncepte
- Content agent: "MUST generate images for every content piece" (agent-registry:64)
- ~300 od 443 koncepta NE trebaju slike (Budžetiranje, Porezi, Ugovori...)
- **Uticaj**: ~$15 + 100 min po punom run-u
- **Fix**: Slike samo za vizuelne koncepte (marketing materijali, brending, social media)

### P4: OBAVEZNO slanje emaila na hardkodiranu adresu
- Sales agent: "MUST send email" na vojinskrill@gmail.com (agent-registry:147)
- Za SVAKI koncept, čak i "Upravljanje zalihama"
- **Uticaj**: 443+ spam emailova po run-u
- **Fix**: Email samo za prodajne/outreach koncepte. Draft mode umesto slanja.

### P5: "UVEK 2-4 joba" + "UVEK web_search prvi"
- Job planner: "ALWAYS create 2-4 jobs" + "ALWAYS start with web_search" (job-planner:59,61)
- Jednostavni koncepti (Faktura, Misija) ne trebaju agente
- **Uticaj**: 886+ nepotrebnih izvršavanja za 443 koncepta
- **Fix**: 0-4 joba bazirano na kompleksnosti. web_search samo kad treba eksterna istraživanja.

### P6: 70% rada agenata se odbacuje pri konsolidaciji
- Agent output trunciran na 5000 chars (headless-executor:561)
- 3-4 agenta proizvode 8000-18000 chars ukupno
- **Uticaj**: Većina agent rada se gubi
- **Fix**: Sumiraj svaki agent output posebno (500 chars ključnih nalaza) pre konsolidacije. Ili povećaj limit proporcionalno broju agenata.

### P7: Memorija instrukcija za agente BEZ memorije
- Prompt kaže "koristi prethodno znanje" (agent-prompt:82)
- Ali unique session-id = agent NEMA prethodno znanje
- **Uticaj**: Podstiče halucinacije, troši tokene na lažno razmišljanje
- **Fix opcija A**: Persistent session (lock contention rizik)
- **Fix opcija B** (PREPORUČENO): Pre joba, pitaj domain mastera "šta znaš?" i ubaci odgovor u prompt

### P8: Minimum 1000 reči za SVE koncepte
- Synthesis: "Minimum 1000 reči" (headless-executor:367)
- Consolidation: "Minimum 1000 reči" (headless-executor:571)
- **Uticaj**: Forsira padding za jednostavne koncepte
- **Fix**: Proporcionalno kompleksnosti: 300-500 (jednostavni), 800-1500 (strateški), 1500+ (kompleksni)

### P9: Cross-persona odseca 63% konteksta
- MAX_OUTPUT_CHARS = 1500 (cross-persona:35)
- Slepi substring, ne završava rečenicu
- **Uticaj**: Sledeći koncept dobija samo naslove, ne nalaze
- **Fix**: LLM summarization 200-300 chars KLJUČNIH nalaza umesto slepog odsecanja

### P10: Knowledge updates — spori, nepotpuni, bez strukture
- Domain masteri: 3000 chars (headless-executor:622)
- Main agent: samo 1500 chars (headless-executor:658)
- Sekvencijalno = 8-12 min latencije
- Bez instrukcije kako da organizuju znanje
- **Fix**: Strukturiran format (JSON-like), veći limit, instrukcija za organizaciju

## DODATNI PROBLEMI

### P11: Isti Quality Standards blok kopiran u svih 5 agenata
- agent-registry.service.ts linije 43-48, 86-91, 123-131, 165-171, 197-205
- Identičan tekst u svakom agentu — ne odgovara funkciji (content agent nema "cite sources" za kreativni rad)
- **Fix**: Prilagođeni standardi po tipu agenta

### P12: Content agent UVEK fetchuje website kompanije
- "First analyze the company's visual identity by fetching their website" (agent-registry:71)
- Dešava se na SVAKI poziv, čak i kad je web-search već fetchovao sajt
- **Fix**: Prosledi web-search nalaze kao dependency context, preskoči fetch ako već postoji

### P13: Financial agent UVEK radi scenario analizu
- "Include scenario analysis (optimistic, realistic, pessimistic)" (agent-registry:191)
- Za Poreze ili Fakture — scenario analiza nema smisla
- **Fix**: Uslovne instrukcije bazirane na tipu koncepta

### P14: Grounding block na srpskom dodat na engleski prompt
- agent-prompt.service.ts linije 72-86 su na srpskom
- Agent system promptovi kažu "Write in English" (line 50)
- Jezički switch može da zbuni agenta
- **Fix**: Sve na jednom jeziku, ili jasno odvojene sekcije

### P15: "Nikada ne izmišljaj podatke" ponovljeno 4 puta
- U grounding block, u svakom agent system prompt, u synthesis prompt, u workflow step prompt
- **ZADRŽATI**: Ovo je kritična instrukcija — bolje 4 puta nego jednom propustiti. NE MENJATI.

### P16: ~~Knowledge updates idu SAMO agentima koji su radili~~ NIJE PROBLEM
- Domain agenti su SPECIJALISTI — financial zna finansije, marketing zna marketing
- MASTER agent (main) ima kompletnu sliku i povezuje domene
- Domain agent NE TREBA da zna o tuđem domenu — to je posao mastera
- **Status**: Trenutno ponašanje je ISPRAVNO

### P17: Duplicate knowledge update putanje
- headless-executor.service.ts linije 630-671 (normalan flow)
- agent-execution.service.ts linije 770-833 (retry flow)
- Mogu se desiti duplikati
- **Fix**: Flag ili check da spreči dvostruko slanje

### P18: Score se računa na PRE-consolidation tekstu
- aiScore se sačuva na liniji 494-499
- Ali userReport se PREPIŠE consolidation-om na liniji 581
- Score ne odražava finalni kvalitet
- **Fix**: Scoruj POSLE konsolidacije

### P19: Job planner vidi samo prvih 2000 chars reporta
- job-planner.service.ts linija 77: substring(0, 2000)
- Za 1000+ reči dokument, planner vidi samo 40%
- Može kreirati redundantne jobove za istraživanje koje je pokriveno u drugoj polovini
- **Fix**: Povećaj na 4000 ili sumiraj ključne nalaze

### P20: FAL slike — samo square_hd format
- Uvek isti format, nema prilagođavanja kontekstu
- Instagram = square, YouTube = landscape, Pinterest = portrait
- **Fix**: Instrukcija za izbor formata prema nameni sadržaja

## PREPORUČENI NOVI PIPELINE (sa OpenClaw učenjem)

```
1. PRE-CHECK: Pitaj domain mastera "Šta znaš o [kompanija] i [koncept]?"
   → Ako ima znanje, ubaci u prompt kao "VEĆ POZNATO"
   → Štedi web_search pozive za poznate teme

2. JOB PLANNING (LLM): Na osnovu koncepta + prethodnog znanja
   → 0-4 joba (ne obavezno 2-4)
   → web_search SAMO ako treba nova istraživanja
   → Bez image generacije za analitičke koncepte
   → Bez emaila za ne-prodajne koncepte

3. AGENT EXECUTION (OpenClaw × 0-4):
   → Svaki agent dobija planner instrukciju DIREKTNO (bez LLM reformulisanja)
   → Plus grounding block + domain master znanje kao kontekst
   → Unique session-id (za paralelizam)
   → Brave Search optimizovan (3 rezultata, 15s timeout)

4. SYNTHESIS + SCORING (1 LLM poziv, ne 3):
   → Input: koncept definicija + SVI agent nalazi (bez truncation) + cross-persona
   → Output: finalni dokument sa ocenama
   → Proporcionalna dužina (300-1500 reči)

5. KNOWLEDGE UPDATES:
   → Strukturiran format sa metapodacima
   → Domain masteri: 5000 chars + organizaciona instrukcija
   → Main: 3000 chars sa punom slikom
   → SVIM relevantnim masterima, ne samo onima koji su radili
```

**Procena novog pipeline-a: ~25K tokena, ~4-6 min po konceptu**
**Ušteda: ~47% tokena, ~55% vremena, BOLJI kvalitet jer nema truncation**

## CILJEVI KOJI SE MORAJU ZADRŽATI
- ✅ OpenClaw agenti uče kroz persistent domain master sesije
- ✅ Main agent akumulira kompletnu poslovnu sliku
- ✅ Cross-persona kolaboracija sa bogatijim kontekstom
- ✅ Dependency ordering između koncepata
- ✅ Markdown format sa izvorima
- ✅ Sve na srpskom jeziku
- ✅ Kvalitet ostaje isti ili bolji
- ✅ Jedinstven sadržaj po konceptu (bez ponovljenih slika/teksta)
