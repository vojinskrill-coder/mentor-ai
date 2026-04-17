#!/bin/bash
# setup-relay.sh — Recreates OpenClaw relay on a fresh machine
# Usage: ./setup-relay.sh <host> <ssh-key-path>
# Copies all configs, templates, skills, and agent SOUL.md files

set -e

HOST="${1:-91.98.231.87}"
KEY="${2:-~/.ssh/id_ed25519}"
USER="root"
BASE="/root/.openclaw"
RELAY_DIR="/root/openclaw-relay"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

echo "=== OpenClaw Relay Setup ==="
echo "Host: $HOST"
echo "Config source: $SCRIPT_DIR"

# 1. Create base directories
ssh -i "$KEY" "$USER@$HOST" "mkdir -p $BASE/workspace $BASE/agents $BASE/media"

# 2. Copy openclaw.json
scp -i "$KEY" "$SCRIPT_DIR/openclaw.json" "$USER@$HOST:$BASE/openclaw.json" 2>/dev/null || echo "WARN: openclaw.json not found in config dir"

# 3. Copy all agent SOUL.md files
for agent_dir in "$SCRIPT_DIR/agents"/*/; do
  agent_name=$(basename "$agent_dir")
  echo "  Deploying agent: $agent_name"
  ssh -i "$KEY" "$USER@$HOST" "mkdir -p $BASE/agents/$agent_name/agent"
  if [ -f "$agent_dir/SOUL.md" ]; then
    scp -i "$KEY" "$agent_dir/SOUL.md" "$USER@$HOST:$BASE/agents/$agent_name/agent/SOUL.md"
  fi
done

# 4. Copy platform skills
ssh -i "$KEY" "$USER@$HOST" "mkdir -p $BASE/workspace/skills"
for skill in "$SCRIPT_DIR/skills"/*.md; do
  [ -f "$skill" ] && scp -i "$KEY" "$skill" "$USER@$HOST:$BASE/workspace/skills/$(basename $skill)"
done

# 5. Copy vault templates (for reference — actual provisioning done by NestJS)
ssh -i "$KEY" "$USER@$HOST" "mkdir -p $BASE/workspace/vault-templates"
for tmpl in "$SCRIPT_DIR/templates/vault"/*.md; do
  [ -f "$tmpl" ] && scp -i "$KEY" "$tmpl" "$USER@$HOST:$BASE/workspace/vault-templates/$(basename $tmpl)"
done

# 6. Verify
echo ""
echo "=== Verification ==="
ssh -i "$KEY" "$USER@$HOST" "
  echo 'openclaw.json:' && test -f $BASE/openclaw.json && echo '  OK' || echo '  MISSING'
  echo 'Agents:' && ls $BASE/agents/*/agent/SOUL.md 2>/dev/null | wc -l && echo ' SOUL.md files'
  echo 'Skills:' && ls $BASE/workspace/skills/*.md 2>/dev/null | wc -l && echo ' skill files'
  echo 'Templates:' && ls $BASE/workspace/vault-templates/*.md 2>/dev/null | wc -l && echo ' template files'
"

echo ""
echo "=== Setup Complete ==="
echo "Next: start relay with 'pm2 start $RELAY_DIR/index.mjs'"
