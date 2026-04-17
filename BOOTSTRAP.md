# Neuron OS — New Machine Bootstrap

## 1. Clone & Install
```bash
git clone git@github.com:vojinskrill-coder/mentor-ai.git
cd mentor-ai
npm install
cd apps/api && npx prisma generate && cd ../..
```

## 2. Transfer Secrets (NOT in git)
These must be transferred manually (USB, AirDrop, etc.):
- **SSH key**: `~/.ssh/id_ed25519` — authenticates to root@91.98.231.87
- **`.env`**: `apps/api/.env` — all API keys, DB connection, relay config

Get both from the previous machine. The .env needs ONE change on Mac:
```
HETZNER_SSH_KEY=~/.ssh/id_ed25519
```

## 3. Tailscale
Install: https://tailscale.com/download/macos
Login with `vojinskrill@` Google account.
After login: `tailscale status` → should show `ubuntu-8gb-nbg1-1` at `100.124.215.24`

## 4. Hetzner Stack (91.98.231.87 / Tailscale 100.124.215.24)

| Service | Port | Manager | Notes |
|---|---|---|---|
| OpenClaw Relay | 3100 | systemd `openclaw-relay.service` | Auth token in unit file |
| PostgreSQL | 5433 | Docker `neuron-postgres` | postgres:16-alpine |
| n8n | 5678 | Docker `n8n-n8n-1` | Process workflows |
| NocoDB | 8080 | Docker `nocodb` | Legacy CRM |
| OpenClaw CLI | - | `/usr/bin/openclaw` v2026.4.5 | Agent execution |

### Key Paths on Hetzner
- OpenClaw config: `/root/.openclaw/openclaw.json`
- Agent SOULs: `/root/.openclaw/agents/{id}/SOUL.md`
- Bridge skill: `/root/.openclaw/workspace/skills/mentor-ai-bridge/SKILL.md`
- Per-tenant vaults: `/root/.openclaw-{tenantId}/vault/`
- Relay code: `/root/openclaw-relay/index.mjs`
- Relay unit: `/etc/systemd/system/openclaw-relay.service`

### DB Connection
Use Tailscale IP (stable): `postgresql://neuron:neuron_dev_2026@100.124.215.24:5433/neurondb`

### Qdrant
Qdrant Cloud (not on Hetzner). URL + key in .env.

## 5. Claude Memory
Project memory files are in `.claude-memory/` in this repo. On the new machine, tell Claude:
> Read all files in `.claude-memory/` to understand this project's history, architecture decisions, and behavioral rules.

## 6. Verify Setup
```bash
# SSH
ssh -i ~/.ssh/id_ed25519 root@91.98.231.87 "hostname"  # → ubuntu-8gb-nbg1-1

# API
npx nx serve api  # wait 20s
curl http://localhost:3000/api/health

# Tests (210+)
npx jest apps/api/src/app/system-validation/ --no-cache --forceExit

# Base readiness
node -r dotenv/config apps/api/scripts/verify-base-ready.js

# Frontend
npx nx serve web  # localhost:4200
```

## 7. Architecture Summary
- Angular 21 + NestJS 11 monorepo (Nx)
- Multi-tenant: tenantId in every data path
- Obsidian vault per tenant for concept enrichment
- OpenClaw agents (MiniMax M2.7) for autonomous execution
- 14 new modules built for enrichment pipeline (210+ tests)
- Platform base: 394 English concepts mapped 1:1 to Obsidian curriculum (436 nodes)
- DEV_MODE=true bypasses auth for local development
