#!/usr/bin/env bash
# Deploy OpenClaw config (SOULs + toolkits) from this git repo to Hetzner.
# Idempotent: scp overwrites with the same content if files are unchanged.
# Uses scp (not rsync) for portability — Windows Git Bash doesn't ship with rsync.
#
# Usage:
#   ./deploy-config.sh                  # deploy to default host
#   HETZNER_HOST=root@1.2.3.4 ./deploy-config.sh
#   ./deploy-config.sh --dry-run        # show what would be deployed without uploading
#   ./deploy-config.sh --verify-only    # only verify remote hashes against baseline

set -euo pipefail

HOST="${HETZNER_HOST:-root@91.98.231.87}"
REMOTE_AGENTS="/root/.openclaw/agents"
REMOTE_TOOLKITS="/root/.openclaw/toolkits"
LOCAL_DIR="$(cd "$(dirname "$0")" && pwd)"

# Tenant profile dirs that ALSO need the new SOUL.md files. The OpenClaw
# CLI loads SOUL.md from $OPENCLAW_PROFILE_DIR/agents/*/agent/SOUL.md when
# the relay request includes a `tenantProfile` field. Without syncing
# these, chat messages from the app (which always pass tenantProfile) hit
# stale SOULs while n8n process calls (which use the default profile) get
# the fresh ones — silent split-brain bug.
#
# Add new tenants here as the platform grows.
TENANT_PROFILE_DIRS=(
  "/root/.openclaw-tnt_rljn1gj4cgxoph0hxfohv6l4"
)

MODE="deploy"
case "${1:-}" in
  --dry-run)     MODE="dry-run" ;;
  --verify-only) MODE="verify-only" ;;
esac

verify_remote() {
  echo ""
  echo "Verifying remote hashes against CONFIG_HASHES.txt baseline..."
  {
    for a in main marketing content sales designer research dev financial web-search process-builder; do
      ssh "$HOST" "sha256sum $REMOTE_AGENTS/$a/agent/SOUL.md" \
        | sed "s|$REMOTE_AGENTS/$a/agent/SOUL.md|agents/$a/SOUL.md|"
    done
    ssh "$HOST" "sha256sum $REMOTE_TOOLKITS/nocodb.md $REMOTE_TOOLKITS/notion.md" \
      | sed "s|$REMOTE_TOOLKITS/|toolkits/|g"
  } | sort > /tmp/remote-hashes.txt

  grep -v '^#' "$LOCAL_DIR/CONFIG_HASHES.txt" | grep -v '^$' | sort > /tmp/local-hashes.txt

  if diff -q /tmp/local-hashes.txt /tmp/remote-hashes.txt > /dev/null; then
    echo "OK: all 11 config files match the baseline"
    return 0
  else
    echo "MISMATCH: remote config differs from baseline"
    diff /tmp/local-hashes.txt /tmp/remote-hashes.txt
    return 1
  fi
}

if [[ "$MODE" == "verify-only" ]]; then
  verify_remote
  exit $?
fi

if [[ "$MODE" == "dry-run" ]]; then
  echo "[dry-run] would scp the following:"
  for soul in "$LOCAL_DIR"/agents/*/SOUL.md; do
    agent="$(basename "$(dirname "$soul")")"
    echo "  $soul -> $HOST:$REMOTE_AGENTS/$agent/agent/SOUL.md"
  done
  for tk in "$LOCAL_DIR"/toolkits/*.md; do
    name="$(basename "$tk")"
    echo "  $tk -> $HOST:$REMOTE_TOOLKITS/$name"
  done
  echo ""
  echo "[dry-run] verifying that current remote state matches our baseline:"
  verify_remote || true
  exit 0
fi

echo "Deploying SOULs -> $HOST:$REMOTE_AGENTS/{role}/agent/SOUL.md"
for soul in "$LOCAL_DIR"/agents/*/SOUL.md; do
  agent="$(basename "$(dirname "$soul")")"
  scp -q "$soul" "$HOST:$REMOTE_AGENTS/$agent/agent/SOUL.md"
  echo "  uploaded $agent/SOUL.md (default profile)"
  # Also push to every tenant profile so chat (which always uses tenant
  # profile dir) sees the same SOULs as n8n (which uses default profile).
  for tdir in "${TENANT_PROFILE_DIRS[@]}"; do
    ssh "$HOST" "mkdir -p $tdir/agents/$agent/agent" 2>/dev/null || true
    scp -q "$soul" "$HOST:$tdir/agents/$agent/agent/SOUL.md"
    echo "  uploaded $agent/SOUL.md ($tdir)"
  done
done

echo ""
echo "Deploying toolkits -> $HOST:$REMOTE_TOOLKITS/"
for tk in "$LOCAL_DIR"/toolkits/*.md; do
  name="$(basename "$tk")"
  scp -q "$tk" "$HOST:$REMOTE_TOOLKITS/$name"
  echo "  uploaded toolkits/$name"
done

verify_remote
