#!/bin/bash
curl -s -X POST "http://91.98.231.87:3100/execute" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer 9b8d2c89d0ff9f2477b9c2b50b4bf1c0a6a01672014cd02d" \
  -d '{
    "message": "I sent you enrichment tasks for tenant tnt_yk5e4522qar8egaxn0d969g5 (Irish Law). The tasks were sent as Vault Mode tasks with vaultPath. 5 tasks show as COMPLETED but 0 concepts are actually enriched (no content written). What happened? Did you receive the enrichment tasks? Did you write to the vault? Check /root/.openclaw-tnt_yk5e4522qar8egaxn0d969g5/vault/wiki/concepts/ and /root/.openclaw/workspace/tnt_yk5e4522qar8egaxn0d969g5-vault/wiki/concepts/ — are there any articles? Also check your recent session logs for errors.",
    "agentId": "main",
    "sessionId": "enrichment-debug-001",
    "timeoutSeconds": 90
  }' --max-time 120
