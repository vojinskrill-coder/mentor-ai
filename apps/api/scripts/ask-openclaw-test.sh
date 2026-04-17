#!/bin/bash
curl -s -X POST "http://91.98.231.87:3100/execute" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer 9b8d2c89d0ff9f2477b9c2b50b4bf1c0a6a01672014cd02d" \
  -d '{
    "message": "A new tenant vault has been provisioned for Irish Law. Please verify you can operate on it:\n\n1. READ /root/.openclaw-tnt_id0k4cr7cbuxt1fzvn4skmcb/vault/SCHEMA.md and confirm you see the article structure\n2. READ /root/.openclaw-tnt_id0k4cr7cbuxt1fzvn4skmcb/vault/index.md and tell me how many concepts are seeded\n3. READ /root/.openclaw-tnt_id0k4cr7cbuxt1fzvn4skmcb/vault/instructions/bootstrap.md and confirm the tenant identity\n4. READ /root/.openclaw-tnt_id0k4cr7cbuxt1fzvn4skmcb/agents/main/agent/SOUL.md and confirm vault mode is configured\n5. Check if /root/.openclaw-tnt_id0k4cr7cbuxt1fzvn4skmcb/tools/qdrant-search.sh exists and is executable\n\nReport what you find. Are you ready to receive enrichment tasks for this tenant?",
    "agentId": "main",
    "sessionId": "vault-test-001",
    "tenantProfile": "tnt_id0k4cr7cbuxt1fzvn4skmcb",
    "timeoutSeconds": 120
  }' --max-time 150
