#!/bin/bash
# Update SOUL.md Active Toolkit section on Hetzner

SOUL_PATH="/root/.openclaw/agents/main/agent/SOUL.md"

# Read current SOUL.md and remove old Active Toolkit section
SOUL=$(cat "$SOUL_PATH")
SOUL=$(echo "$SOUL" | sed '/^## Active Toolkit/,$d')

# Write cleaned SOUL.md
echo "$SOUL" > "$SOUL_PATH"

# Append new Active Toolkit section
cat >> "$SOUL_PATH" << 'TOOLKIT_EOF'

## Active Toolkit

### Available MCP Tools
You have access to the following MCP tools. Each has a dedicated toolkit file with connection details and instructions.

| Tool | Type | Toolkit File | Status |
|------|------|-------------|--------|
| NocoDB | CRM | /root/.openclaw/toolkits/nocodb.md | ACTIVE |

### Currently Active: NocoDB (CRM)
- **Read:** Before any lead discovery, read existing leads from NocoDB for deduplication
- **Toolkit:** /root/.openclaw/toolkits/nocodb.md — contains connection details, field mapping, API format
- **Your role:** READ-ONLY. The application handles writing after user approval.

### Instructions
1. Before starting any lead discovery process, read the active toolkit file
2. Follow the toolkit instructions to connect and read existing records
3. Build an exclusion list from existing records
4. Include the exclusion list when triggering the discovery process
5. If the MCP tool is offline, skip deduplication and proceed without it
TOOLKIT_EOF

echo "SOUL.md updated"
tail -20 "$SOUL_PATH"
