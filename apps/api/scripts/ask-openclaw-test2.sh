#!/bin/bash
curl -s -X POST "http://91.98.231.87:3100/execute" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer 9b8d2c89d0ff9f2477b9c2b50b4bf1c0a6a01672014cd02d" \
  -d '{
    "message": "Read these files and report what you see:\n1. /root/.openclaw-tnt_id0k4cr7cbuxt1fzvn4skmcb/vault/SCHEMA.md\n2. /root/.openclaw-tnt_id0k4cr7cbuxt1fzvn4skmcb/vault/index.md (first 5 lines)\n3. /root/.openclaw-tnt_id0k4cr7cbuxt1fzvn4skmcb/vault/instructions/bootstrap.md (first 5 lines)\n\nAre you ready for vault mode enrichment?",
    "agentId": "main",
    "sessionId": "vault-verify-002",
    "timeoutSeconds": 90
  }' --max-time 120
