# OpenClaw Infrastructure Setup

## Hetzner Server
- **IP**: 91.98.231.87
- **Type**: CX22 (4 vCPU, 8GB RAM)
- **OS**: Ubuntu 24.04
- **SSH Key**: `~/.ssh/id_ed25519`
- **Location**: Nuremberg (nbg1)

## Tailscale Network
- **Hetzner**: 100.124.215.24 (ubuntu-8gb-nbg1-1)
- **Dev laptop**: 100.114.192.85 (kgse-tanjav)
- **Funnel URL**: `https://ubuntu-8gb-nbg1-1.tailb04872.ts.net/`
- **Funnel proxies to**: `http://127.0.0.1:18789` (OpenClaw gateway)

## OpenClaw
- **Version**: 2026.3.2
- **Config**: `/root/.openclaw/openclaw.json`
- **Gateway port**: 18789 (loopback only)
- **Gateway auth token**: `RELAY_TOKEN_REDACTED`
- **LLM Provider**: DeepSeek (deepseek-chat V3)
- **SOUL.md**: Web research agent personality at `/root/.openclaw/workspace/SOUL.md`
- **Systemd service**: `openclaw-gateway.service`
- **Memory search**: disabled
- **Gateway mode**: local

## Available Tools on Agent
- `web_search` (Perplexity provider - configured and working)
- `web_fetch` (works without API key - fetches pages directly)
- `browser` (headless Chrome control)
- `read`, `write`, `edit`, `exec` (file/shell tools)
- `sessions_spawn` (sub-agent spawning)

## API Keys
- **DeepSeek**: `sk-a297b323b0e94fd3849351acf4c55b6b`
- **Perplexity**: `pplx-REDACTED` (configured in env, powers web_search)
- **Tavily**: `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` (configured in env but not natively supported by OpenClaw)

## Security
- UFW firewall: SSH(22) + Tailscale(41641/udp) + HTTPS(443) + tailscale0 interface
- Port 18789 NOT exposed publicly (only via Tailscale Funnel)
- Gateway auth token required for WebSocket connections

## CLI Usage (for NestJS backend reference)
```bash
# Send task to agent (returns JSON with response)
openclaw agent --agent main --message "Research task here" --json --timeout 120

# Health check
openclaw gateway call health --json

# Status check
openclaw gateway call status --json
```

## WebSocket API (for programmatic access from Railway)
- **URL**: `wss://ubuntu-8gb-nbg1-1.tailb04872.ts.net`
- **Auth**: Token-based (send in connect params)
- **Protocol**: ACP (Agent Control Protocol)
