#!/bin/bash
# ═══════════════════════════════════════════════════════
# Mentor AI - Railway Deployment Script
#
# Prerequisites:
#   1. Run: railway login
#   2. Have apps/api/.env with all secrets configured
#
# Usage: bash deploy-railway.sh
# ═══════════════════════════════════════════════════════
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="$SCRIPT_DIR/apps/api/.env"

echo "🚀 Mentor AI Railway Deployment"
echo "================================"

# Check Railway authentication
if ! railway whoami 2>/dev/null; then
  echo "❌ Not logged in. Run: railway login"
  exit 1
fi
echo "✅ Railway authenticated"

# Check .env file exists
if [ ! -f "$ENV_FILE" ]; then
  echo "❌ .env file not found at $ENV_FILE"
  exit 1
fi
echo "✅ Found .env file"

# ─── Helper: read value from .env ───
get_env() {
  local key="$1"
  local val
  val=$(grep "^${key}=" "$ENV_FILE" | head -1 | cut -d'=' -f2-)
  echo "$val"
}

# ─── Step 1: Create project or link existing ───
echo ""
echo "📦 Setting up Railway project..."

if railway status 2>/dev/null | grep -q "Project"; then
  echo "✅ Already linked to Railway project"
else
  echo "Creating new Railway project..."
  railway init --name mentor-ai
  echo "✅ Project created"
fi

# ─── Step 2: Set environment variables from .env ───
echo ""
echo "🔧 Configuring environment variables from .env..."

# Core production settings
railway variables set NODE_ENV=production
railway variables set PORT=3000
railway variables set DEV_MODE=false
railway variables set LOG_LEVEL=info

# Database
DB_URL=$(get_env "DATABASE_URL")
if [ -n "$DB_URL" ]; then
  railway variables set "DATABASE_URL=$DB_URL"
  echo "  ✅ DATABASE_URL"
fi

# JWT
JWT=$(get_env "JWT_SECRET")
if [ -n "$JWT" ]; then
  railway variables set "JWT_SECRET=$JWT"
  echo "  ✅ JWT_SECRET"
fi

# Google OAuth
GCID=$(get_env "GOOGLE_CLIENT_ID")
GCS=$(get_env "GOOGLE_CLIENT_SECRET")
if [ -n "$GCID" ]; then
  railway variables set "GOOGLE_CLIENT_ID=$GCID"
  echo "  ✅ GOOGLE_CLIENT_ID"
fi
if [ -n "$GCS" ]; then
  railway variables set "GOOGLE_CLIENT_SECRET=$GCS"
  echo "  ✅ GOOGLE_CLIENT_SECRET"
fi

# OpenAI
OAI=$(get_env "OPENAI_API_KEY")
if [ -n "$OAI" ]; then
  railway variables set "OPENAI_API_KEY=$OAI"
  echo "  ✅ OPENAI_API_KEY"
fi

# DeepSeek
DSK=$(get_env "DEEPSEEK_API_KEY")
DSE=$(get_env "DEEPSEEK_ENDPOINT")
DSM=$(get_env "DEEPSEEK_MODEL_ID")
[ -n "$DSK" ] && railway variables set "DEEPSEEK_API_KEY=$DSK" && echo "  ✅ DEEPSEEK_API_KEY"
[ -n "$DSE" ] && railway variables set "DEEPSEEK_ENDPOINT=$DSE" && echo "  ✅ DEEPSEEK_ENDPOINT"
[ -n "$DSM" ] && railway variables set "DEEPSEEK_MODEL_ID=$DSM" && echo "  ✅ DEEPSEEK_MODEL_ID"

# RunPod
RPE=$(get_env "RUNPOD_ENDPOINT")
RPA=$(get_env "RUNPOD_API_KEY")
RPM=$(get_env "RUNPOD_MODEL_ID")
[ -n "$RPE" ] && railway variables set "RUNPOD_ENDPOINT=$RPE" && echo "  ✅ RUNPOD_ENDPOINT"
[ -n "$RPA" ] && railway variables set "RUNPOD_API_KEY=$RPA" && echo "  ✅ RUNPOD_API_KEY"
[ -n "$RPM" ] && railway variables set "RUNPOD_MODEL_ID=$RPM" && echo "  ✅ RUNPOD_MODEL_ID"

# Qdrant
QU=$(get_env "QDRANT_URL")
QA=$(get_env "QDRANT_API_KEY")
[ -n "$QU" ] && railway variables set "QDRANT_URL=$QU" && echo "  ✅ QDRANT_URL"
[ -n "$QA" ] && railway variables set "QDRANT_API_KEY=$QA" && echo "  ✅ QDRANT_API_KEY"

# Serper (Web Search)
SA=$(get_env "SERPER_API_KEY")
[ -n "$SA" ] && railway variables set "SERPER_API_KEY=$SA" && echo "  ✅ SERPER_API_KEY"

echo ""
echo "✅ Environment variables configured"

# ─── Step 3: Deploy ───
echo ""
echo "🚀 Deploying to Railway..."
railway up --detach

echo ""
echo "✅ Deployment initiated!"

# ─── Step 4: Get domain ───
echo ""
echo "📌 Getting deployment URL..."
sleep 5
DOMAIN=$(railway domain 2>/dev/null || echo "")

if [ -z "$DOMAIN" ]; then
  echo "⚠️  No domain assigned yet. Generating one..."
  railway domain
  sleep 3
  DOMAIN=$(railway domain 2>/dev/null || echo "pending")
fi

echo ""
echo "🌐 Your app will be available at: https://$DOMAIN"

# ─── Step 5: Set CORS origin ───
if [ "$DOMAIN" != "pending" ] && [ -n "$DOMAIN" ]; then
  railway variables set "CORS_ORIGIN=https://$DOMAIN"
  echo "✅ CORS_ORIGIN set to https://$DOMAIN"
fi

echo ""
echo "═══════════════════════════════════════════════════════"
echo "📋 POST-DEPLOYMENT CHECKLIST:"
echo "═══════════════════════════════════════════════════════"
echo "1. Check deployment:  railway logs"
echo "2. Verify health:     curl https://$DOMAIN/api/health"
echo "3. Update Google OAuth Console:"
echo "   - Add https://$DOMAIN/callback to redirect URIs"
echo "   - Add https://$DOMAIN to JavaScript origins"
echo "4. Prisma migrations (if needed):"
echo "   railway run npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma"
echo "═══════════════════════════════════════════════════════"
