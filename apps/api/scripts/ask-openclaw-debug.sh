#!/bin/bash
curl -s -X POST "http://91.98.231.87:3100/execute" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer 9b8d2c89d0ff9f2477b9c2b50b4bf1c0a6a01672014cd02d" \
  -d '{
    "message": "Quick status check:\n1. Are you using fresh sessions for each concept enrichment?\n2. Is fresh session affecting your ability to orchestrate sub-agents and use cross-collaboration?\n3. How many concepts have you enriched for tenant tnt_yk5e4522qar8egaxn0d969g5?\n4. When you complete an enrichment, what do you return as output? The full article or just a status message?\n5. Do you see the vault at /root/.openclaw/workspace/tnt_yk5e4522qar8egaxn0d969g5-vault/? Can you read TENANT-PROTOCOL.md from it?\n\nBe brief.",
    "agentId": "main",
    "sessionId": "debug-quick-001",
    "timeoutSeconds": 60
  }' --max-time 90
