#!/bin/bash
mkdir -p /tmp/perf-test

meta() {
  node -e "try{const d=JSON.parse(require('fs').readFileSync('$1','utf8'));console.log(d.result.meta.durationMs+'ms',d.result.meta.agentMeta?.model,d.result.payloads[0].text.length+'ch')}catch(e){console.log('ERR:'+e.message)}" 2>/dev/null
}

extract() {
  node -e "try{const d=JSON.parse(require('fs').readFileSync('$1','utf8'));console.log(d.result.payloads[0].text)}catch(e){console.log('ERROR')}" 2>/dev/null
}

TOTAL_START=$(date +%s)
echo "============================================"
echo "PERFORMANCE TEST: 3 concepts"
echo "Start: $(date)"
echo "============================================"

# C1: search-financial -> financial
echo ""
echo ">>> C1: Tok Vrednosti (search-fin + financial)"
C1_START=$(date +%s)

echo "  search-fin..."
S1=$(date +%s)
openclaw agent --agent web-search --session-id perf-c1-ws --message "Research financial aspects of value stream mapping for luxury custom manufacturing. Company: Luxury Statues Adria, bronze/marble sculptures, SE Europe, HNW clients. Material variance 28.5% (standard 10-15%), CCC 180-240 days. Find: industry benchmarks for CCC, material cost variance standards, lean implementation ROI, profit margins. Output in Serbian, markdown, tables, sources." --json --timeout 300 2>/dev/null > /tmp/perf-test/c1-ws.json
E1=$(date +%s)
echo "  c1-ws: $(meta /tmp/perf-test/c1-ws.json) ($((E1-S1))s)"

C1_WS=$(extract /tmp/perf-test/c1-ws.json | head -c 4000)
echo "  financial..."
S2=$(date +%s)
openclaw agent --agent financial --session-id perf-c1-fin --message "Financial analysis for Luxury Statues Adria based on research below. Variance 28.5%, CCC 180-240, revenue 500K EUR. Calculate ROI, break-even, scenarios. Serbian, tables.
--- RESEARCH ---
$C1_WS
--- END ---" --json --timeout 600 2>/dev/null > /tmp/perf-test/c1-fin.json
E2=$(date +%s)
echo "  c1-fin: $(meta /tmp/perf-test/c1-fin.json) ($((E2-S2))s)"
C1_END=$(date +%s)
echo "  C1 total: $((C1_END-C1_START))s"

# C2: search-marketing -> marketing (gets C1)
echo ""
echo ">>> C2: Predvidljivost (search-mkt + marketing, uses C1)"
C2_START=$(date +%s)

echo "  search-mkt..."
S3=$(date +%s)
openclaw agent --agent web-search --session-id perf-c2-ws --message "Research marketing aspects of predictability as luxury brand value. Company: Luxury Statues Adria, luxury sculptures. Brand trust through consistency, customer loyalty examples, luxury brand predictability. Output in Serbian, markdown, tables, sources." --json --timeout 300 2>/dev/null > /tmp/perf-test/c2-ws.json
E3=$(date +%s)
echo "  c2-ws: $(meta /tmp/perf-test/c2-ws.json) ($((E3-S3))s)"

C2_WS=$(extract /tmp/perf-test/c2-ws.json | head -c 4000)
C1_FIN=$(extract /tmp/perf-test/c1-fin.json | head -c 2000)
echo "  marketing..."
S4=$(date +%s)
openclaw agent --agent marketing --session-id perf-c2-mkt --message "Marketing strategy for predictability as luxury value. Luxury Statues Adria. Use research AND financial analysis.
--- RESEARCH ---
$C2_WS
--- PREVIOUS: Financial ---
$C1_FIN
--- END ---
Create positioning, generate 1 image. Serbian, markdown." --json --timeout 600 2>/dev/null > /tmp/perf-test/c2-mkt.json
E4=$(date +%s)
echo "  c2-mkt: $(meta /tmp/perf-test/c2-mkt.json) ($((E4-S4))s)"
C2_END=$(date +%s)
echo "  C2 total: $((C2_END-C2_START))s"

# C3: search-sales -> sales (gets C1+C2)
echo ""
echo ">>> C3: Poverenje (search-sales + sales, uses C1+C2)"
C3_START=$(date +%s)

echo "  search-sales..."
S5=$(date +%s)
openclaw agent --agent web-search --session-id perf-c3-ws --message "Research sales aspects of trust building in luxury B2B. Company: Luxury Statues Adria, custom sculptures 20K-200K EUR. HNW trust signals, relationship selling, objection handling. Output in Serbian, markdown, tables, sources." --json --timeout 300 2>/dev/null > /tmp/perf-test/c3-ws.json
E5=$(date +%s)
echo "  c3-ws: $(meta /tmp/perf-test/c3-ws.json) ($((E5-S5))s)"

C3_WS=$(extract /tmp/perf-test/c3-ws.json | head -c 4000)
C2_MKT=$(extract /tmp/perf-test/c2-mkt.json | head -c 2000)
echo "  sales..."
S6=$(date +%s)
openclaw agent --agent sales --session-id perf-c3-sales --message "Sales strategy for trust. Luxury Statues Adria. Use ALL previous.
--- RESEARCH ---
$C3_WS
--- PREVIOUS: Financial ---
$C1_FIN
--- PREVIOUS: Marketing ---
$C2_MKT
--- END ---
Talk tracks, objection handling, pricing. Serbian, markdown." --json --timeout 600 2>/dev/null > /tmp/perf-test/c3-sales.json
E6=$(date +%s)
echo "  c3-sales: $(meta /tmp/perf-test/c3-sales.json) ($((E6-S6))s)"
C3_END=$(date +%s)
echo "  C3 total: $((C3_END-C3_START))s"

# Locks
echo ""
LOCKS=$(find /root/.openclaw -name "*.lock" 2>/dev/null | wc -l)
echo "Lock files: $LOCKS"

TOTAL_END=$(date +%s)
echo ""
echo "============================================"
echo "COMPLETE: $(date)"
echo "C1: $((C1_END-C1_START))s | C2: $((C2_END-C2_START))s | C3: $((C3_END-C3_START))s"
echo "TOTAL: $((TOTAL_END-TOTAL_START))s"
echo "============================================"
