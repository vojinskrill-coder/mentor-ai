#!/bin/bash
curl -s -X POST "http://91.98.231.87:3100/stream" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer 9b8d2c89d0ff9f2477b9c2b50b4bf1c0a6a01672014cd02d" \
  -d '{
    "message": "We agreed on persistent session with periodic compaction. Please do the following NOW:\n\n1. Update /root/.openclaw/workspace/tnt_efszr61nfiyr8b7k3bc8wfs0-vault/TENANT-PROTOCOL.md to specify: persistent session, compaction every 20 concepts, read log.md at start, cross-reference previous concepts via wikilinks\n\n2. Create or update your MEMORY.md with the key decisions for Irish Law tenant so far (what concepts are enriched, what frameworks discovered, what sources work best)\n\n3. Tell me: what sessionId should I use for ALL enrichment tasks for this tenant? A fixed one like \"enrichment-tnt_efszr61nfiyr8b7k3bc8wfs0\" so you maintain continuity?\n\n4. When should I trigger compaction? After every 20 concepts? How do I trigger it — send you a special message?\n\nDo the updates now and confirm what you changed.",
    "agentId": "main",
    "sessionId": "configure-persistent-001",
    "tenantProfile": "tnt_efszr61nfiyr8b7k3bc8wfs0",
    "timeoutSeconds": 120
  }' --max-time 150 2>&1 | grep '"text"' | tail -10
