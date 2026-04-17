# OpenClaw Config (LSA)

Source of truth for the 9 LSA agent SOULs **plus the toolkit instruction files** running on the Hetzner OpenClaw instance.

The Hetzner filesystem is a **deployment target**, not storage. If Hetzner dies, this folder + a fresh install + the latest backup archive lets us rebuild.

## Layout

```
agents/
├── main/SOUL.md          ← director (contains bridge curl examples)
├── marketing/SOUL.md
├── content/SOUL.md
├── sales/SOUL.md
├── designer/SOUL.md
├── research/SOUL.md
├── dev/SOUL.md
├── financial/SOUL.md
└── web-search/SOUL.md
toolkits/
├── nocodb.md             ← NocoDB CRM toolkit (Lead Discovery dedup)
└── notion.md             ← Notion content hub toolkit (Instagram Content)
CONFIG_HASHES.txt         ← sha256 baseline of all 11 files (Hetzner 2026-04-06)
deploy-config.sh          ← idempotent rsync deploy + verify
SECURITY.md               ← embedded secrets and rotation notes — READ THIS
```

## What lives where

| File | Purpose | Referenced from |
|---|---|---|
| `agents/main/SOUL.md` | Director persona + bridge protocol + curl examples | OpenClaw runtime |
| `agents/{role}/SOUL.md` | Sub-agent personas | OpenClaw runtime |
| `toolkits/nocodb.md` | CRM connection, dedup rules, field mapping for Lead Discovery | `agents/main/SOUL.md` |
| `toolkits/notion.md` | Notion DB schema for Instagram Content workflow | `agents/main/SOUL.md` |

## Workflow

1. Edit a file locally
2. Commit and push
3. Run `./deploy-config.sh` to push to Hetzner
4. Script verifies remote hashes match the local baseline after deploy
5. If you intentionally changed a file, regenerate the baseline:
   ```bash
   cd agents && sha256sum */SOUL.md > ../tmp1
   cd ../toolkits && sha256sum *.md > ../tmp2
   # then merge into CONFIG_HASHES.txt manually
   ```

## What is NOT in this repo

- **`openclaw.json`** — contains API keys in plaintext. Lives only on Hetzner + encrypted local backup.
- **Agent memory** (`/root/.openclaw/memory/*.sqlite`) — dynamic state, backed up via `openclaw backup create`.
- **Agent sessions** (`/root/.openclaw/agents/*/sessions/`) — dynamic state, backed up via `openclaw backup create`.
- **Workspaces** (`/root/.openclaw/workspace*/`) — generated deliverables, backed up via `openclaw backup create`.

## Backup strategy summary

| What | Where | How |
|---|---|---|
| SOUL files (static) | This git repo | Commit |
| Memory + sessions + workspaces (dynamic) | `/root/backups/*.tar.gz` on Hetzner + local copy | `openclaw backup create --output /root/backups --verify` |
| Tenant dirs (`/root/.openclaw-*`) | Raw tar | `tar czf raw-openclaw-*.tar.gz --exclude=browser ...` |
| Whole-disk safety net | Hetzner snapshots | Hetzner Cloud Console |

## Forensics baseline (2026-04-06)

- OpenClaw version on Hetzner: **2026.3.24** (commit cff6dc9)
- Latest stable available: **2026.4.5**
- Memory store format: **SQLite 3** (per-agent .sqlite files in `/root/.openclaw/memory/`)
- Total memory size: 109 MB across 5 agents (financial 75 MB, main 14 MB, content 13 MB, sales 10 MB, marketing 68 KB)
- Session log size: 190 MB (180 MB in main director alone)
