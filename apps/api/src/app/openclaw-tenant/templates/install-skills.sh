#!/bin/bash
# ═══════════════════════════════════════════
# OpenClaw Skills Installation Script
# Run on Hetzner server: bash install-skills.sh
# ═══════════════════════════════════════════
#
# Prerequisites:
# - OpenClaw installed and running
# - clawhub CLI available (comes with OpenClaw)
# - API keys configured in ~/.openclaw/openclaw.json
#
# Security note: Only install skills from the curated list
# (VoltAgent/awesome-openclaw-skills). ~12-20% of ClawHub
# skills have security risks.

set -euo pipefail

echo "═══ Installing OpenClaw Skills for Business Brain ═══"
echo ""

# ── Research Agent (5 skills) ──
echo "📍 Installing Research agent skills..."
clawhub install brave-search tavily agent-browser deep-research-pro summarize
echo "✅ Research agent: 5 skills installed"
echo ""

# ── Financial Agent (3 skills) ──
echo "📍 Installing Financial agent skills..."
clawhub install fin-cog excel-xlsx market-data
echo "✅ Financial agent: 3 skills installed"
echo ""

# ── Content Agent (5 skills) ──
echo "📍 Installing Content agent skills..."
clawhub install seo-content-writer content-creator humanize-ai-text ghost-cms brand-voice-profile
echo "✅ Content agent: 5 skills installed"
echo ""

# ── Marketing Agent (4 skills) ──
echo "📍 Installing Marketing agent skills..."
clawhub install marketing-strategy-pmm meta-ads-report simplified-social-media seo-geo-skills-pack
echo "✅ Marketing agent: 4 skills installed"
echo ""

# ── Sales Agent (4 skills) ──
echo "📍 Installing Sales agent skills..."
clawhub install apollo cold-email campaign-orchestrator attio-enhanced
echo "✅ Sales agent: 4 skills installed"
echo ""

# ── Designer Agent (2 skills) ──
echo "📍 Installing Designer agent skills..."
clawhub install figma-design-toolkit pptx
echo "✅ Designer agent: 2 skills installed"
echo ""

# ── Director Agent (4 skills) ──
echo "📍 Installing Director agent skills..."
clawhub install gog todoist calendar mission-control
echo "✅ Director agent: 4 skills installed"
echo ""

# ── Dev Agent ──
echo "📍 Dev agent uses built-in code tools + ClawTeam git worktree"
echo "   No additional skills needed."
echo ""

# ── ClawTeam Installation ──
echo "📍 Installing ClawTeam (OpenClaw fork)..."
if command -v clawteam &> /dev/null; then
    echo "   ClawTeam already installed: $(clawteam --version 2>/dev/null || echo 'unknown version')"
else
    echo "   Installing from OpenClaw fork..."
    pip install git+https://github.com/win4r/ClawTeam-OpenClaw.git
    echo "   ⚠️  Do NOT run 'pip install clawteam' — that gets the upstream version"
fi
echo ""

# ── Summary ──
TOTAL=27
echo "═══════════════════════════════════════════"
echo "✅ Installation complete: ${TOTAL} skills + ClawTeam"
echo ""
echo "Next steps:"
echo "  1. Configure API keys in ~/.openclaw/openclaw.json:"
echo "     - BRAVE_API_KEY (for brave-search)"
echo "     - FIGMA_ACCESS_TOKEN (for figma-design-toolkit)"
echo "     - APOLLO_API_KEY (for apollo)"
echo "     - GHOST_URL + GHOST_ADMIN_API_KEY (for ghost-cms)"
echo "     - CONVERTKIT_API_KEY (for kit-email-operator)"
echo "     - META_ACCESS_TOKEN (for meta-ads-report)"
echo "  2. Copy ClawTeam templates:"
echo "     mkdir -p ~/.clawteam/templates"
echo "     cp clawteam-templates.toml ~/.clawteam/templates/"
echo "  3. Verify: openclaw skills list"
echo "═══════════════════════════════════════════"
