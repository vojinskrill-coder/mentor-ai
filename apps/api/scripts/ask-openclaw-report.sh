#!/bin/bash
curl -s -X POST "http://91.98.231.87:3100/execute" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer 9b8d2c89d0ff9f2477b9c2b50b4bf1c0a6a01672014cd02d" \
  -d '{
    "message": "Status report on Irish Law vault enrichment. I see 2 articles written to vault/wiki/concepts/. Issues found:\n1. Bridge API error: concept already exists, no upsert. How did you handle this?\n2. Exit code null on 2 concepts - which ones failed and why?\n3. Articles are in Serbian - SCHEMA.md says Serbian sections but we need ENGLISH. Did you follow SCHEMA.md?\n4. How many concepts did you complete vs fail?\n5. Is the vault index.md updated?\n\nPlease read /root/.openclaw-tnt_id0k4cr7cbuxt1fzvn4skmcb/vault/log.md and report.",
    "agentId": "main",
    "sessionId": "status-report-001",
    "timeoutSeconds": 90
  }' --max-time 120
