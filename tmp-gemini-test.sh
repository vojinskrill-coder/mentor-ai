#!/bin/bash
mkdir -p /tmp/gemini-test

meta() {
  node -e "try{const d=JSON.parse(require('fs').readFileSync('$1','utf8'));console.log(d.result.meta.durationMs+'ms',d.result.meta.agentMeta?.model,d.result.payloads[0].text.length+'ch')}catch(e){console.log('ERR:'+e.message)}" 2>/dev/null
}
extract() {
  node -e "try{const d=JSON.parse(require('fs').readFileSync('$1','utf8'));console.log(d.result.payloads[0].text)}catch{console.log('ERROR')}" 2>/dev/null
}

TOTAL_START=$(date +%s)
echo "============================================"
echo "ALL GEMINI FLASH TEST: 3 concepts"
echo "Start: $(date)"
echo "============================================"

echo ""
echo ">>> C1: search-fin + financial"
S=$(date +%s)
openclaw agent --agent web-search --session-id g-c1-ws --message "Research financial aspects of value stream mapping for luxury manufacturing. Luxury Statues Adria, bronze/marble, variance 28.5%, CCC 180-240 days. Find benchmarks, ROI, margins. English queries, Serbian output, markdown, tables." --json --timeout 300 2>/dev/null > /tmp/gemini-test/c1-ws.json
echo "  c1-ws: $(meta /tmp/gemini-test/c1-ws.json) ($(($(date +%s)-S))s)"

C1_WS=$(extract /tmp/gemini-test/c1-ws.json | head -c 4000)
S=$(date +%s)
openclaw agent --agent financial --session-id g-c1-fin --message "Financial analysis for Luxury Statues Adria. Variance 28.5%, CCC 180-240, revenue 500K EUR. Calculate ROI, break-even, scenarios. Serbian, tables.
--- RESEARCH ---
$C1_WS
--- END ---" --json --timeout 300 2>/dev/null > /tmp/gemini-test/c1-fin.json
echo "  c1-fin: $(meta /tmp/gemini-test/c1-fin.json) ($(($(date +%s)-S))s)"
C1_END=$(date +%s)

echo ""
echo ">>> C2: search-mkt + marketing (uses C1)"
S=$(date +%s)
openclaw agent --agent web-search --session-id g-c2-ws --message "Research marketing aspects of predictability as luxury brand value. Luxury Statues Adria, luxury sculptures. Brand trust, consistency, loyalty. English queries, Serbian output, markdown, tables." --json --timeout 300 2>/dev/null > /tmp/gemini-test/c2-ws.json
echo "  c2-ws: $(meta /tmp/gemini-test/c2-ws.json) ($(($(date +%s)-S))s)"

C2_WS=$(extract /tmp/gemini-test/c2-ws.json | head -c 4000)
C1_FIN=$(extract /tmp/gemini-test/c1-fin.json | head -c 2000)
S=$(date +%s)
openclaw agent --agent marketing --session-id g-c2-mkt --message "Marketing strategy for predictability as luxury value. Luxury Statues Adria. Use research AND financial analysis. Generate 1 image.
--- RESEARCH ---
$C2_WS
--- PREVIOUS: Financial ---
$C1_FIN
--- END ---
Serbian, markdown." --json --timeout 300 2>/dev/null > /tmp/gemini-test/c2-mkt.json
echo "  c2-mkt: $(meta /tmp/gemini-test/c2-mkt.json) ($(($(date +%s)-S))s)"
C2_END=$(date +%s)

echo ""
echo ">>> C3: search-sales + sales (uses C1+C2)"
S=$(date +%s)
openclaw agent --agent web-search --session-id g-c3-ws --message "Research sales trust building in luxury B2B. Luxury Statues Adria, custom sculptures 20K-200K EUR. HNW trust, relationship selling, objection handling. English queries, Serbian output, markdown, tables." --json --timeout 300 2>/dev/null > /tmp/gemini-test/c3-ws.json
echo "  c3-ws: $(meta /tmp/gemini-test/c3-ws.json) ($(($(date +%s)-S))s)"

C3_WS=$(extract /tmp/gemini-test/c3-ws.json | head -c 4000)
C2_MKT=$(extract /tmp/gemini-test/c2-mkt.json | head -c 2000)
S=$(date +%s)
openclaw agent --agent sales --session-id g-c3-sales --message "Sales strategy for trust. Luxury Statues Adria. Use ALL previous.
--- RESEARCH ---
$C3_WS
--- PREVIOUS: Financial ---
$C1_FIN
--- PREVIOUS: Marketing ---
$C2_MKT
--- END ---
Talk tracks, objection handling, pricing. Serbian, markdown." --json --timeout 300 2>/dev/null > /tmp/gemini-test/c3-sales.json
echo "  c3-sales: $(meta /tmp/gemini-test/c3-sales.json) ($(($(date +%s)-S))s)"
C3_END=$(date +%s)

LOCKS=$(find /root/.openclaw -name "*.lock" 2>/dev/null | wc -l)
TOTAL_END=$(date +%s)

echo ""
echo "============================================"
echo "COMPLETE: $(date)"
echo "C1: $((C1_END-TOTAL_START))s | C2: $((C2_END-C1_END))s | C3: $((C3_END-C2_END))s"
echo "TOTAL: $((TOTAL_END-TOTAL_START))s"
echo "Locks: $LOCKS"
echo "============================================"
