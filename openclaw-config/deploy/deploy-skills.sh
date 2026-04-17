#!/bin/bash
# Deploy OpenClaw skills to Hetzner relay server
# Usage: ./deploy-skills.sh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_DIR="$(dirname "$SCRIPT_DIR")"

# Load .env from api directory
ENV_FILE="$CONFIG_DIR/../apps/api/.env"
if [ -f "$ENV_FILE" ]; then
  set -a
  source "$ENV_FILE"
  set +a
fi

# Required env vars
VAULT_SSH_HOST="${VAULT_SSH_HOST:-91.98.231.87}"
VAULT_SSH_USER="${VAULT_SSH_USER:-root}"
VAULT_SSH_KEY="${VAULT_SSH_KEY_PATH:-~/.ssh/id_rsa}"
BACKEND_URL="${BACKEND_URL:-https://mentor-ai-app-production.up.railway.app}"
BRIDGE_AUTH_TOKEN="${BRIDGE_AUTH_TOKEN:-}"

if [ -z "$BRIDGE_AUTH_TOKEN" ]; then
  echo "ERROR: BRIDGE_AUTH_TOKEN not set in .env"
  exit 1
fi

echo "Deploying skills to $VAULT_SSH_HOST..."

# Process SKILL.md template
SKILL_TEMPLATE="$CONFIG_DIR/skills/mentor-ai-bridge/SKILL.md"
SKILL_RESOLVED=$(cat "$SKILL_TEMPLATE" \
  | sed "s|{{BACKEND_URL}}|$BACKEND_URL|g" \
  | sed "s|{{BRIDGE_AUTH_TOKEN}}|$BRIDGE_AUTH_TOKEN|g" \
  | sed "s|{{TENANT_ID}}|__TENANT_PLACEHOLDER__|g")

# Deploy via SCP
REMOTE_SKILL_DIR="/root/.openclaw/workspace/skills/mentor-ai-bridge"
ssh -i "$VAULT_SSH_KEY" "$VAULT_SSH_USER@$VAULT_SSH_HOST" "mkdir -p $REMOTE_SKILL_DIR"
echo "$SKILL_RESOLVED" | ssh -i "$VAULT_SSH_KEY" "$VAULT_SSH_USER@$VAULT_SSH_HOST" "cat > $REMOTE_SKILL_DIR/SKILL.md"

echo "Skills deployed successfully."
