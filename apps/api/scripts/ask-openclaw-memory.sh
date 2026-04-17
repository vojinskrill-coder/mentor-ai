#!/bin/bash
curl -s -X POST "http://91.98.231.87:3100/execute" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer 9b8d2c89d0ff9f2477b9c2b50b4bf1c0a6a01672014cd02d" \
  -d '{
    "message": "We are switching to sequential enrichment (1 concept at a time, fresh session per concept). Questions about memory:\n\n1. When you use a fresh session for each concept, do you lose memory of what you learned from previous concepts?\n2. Where does your memory live? In your MEMORY.md files? In Qdrant? In the vault?\n3. If I send concept A in session-1, then concept B in session-2 — does session-2 know what you wrote for concept A? Or do you need to read the vault to get that context?\n4. What is the best way to preserve cross-concept knowledge while using fresh sessions?\n5. Should we use one persistent session for all concepts (with compaction) or fresh sessions + vault reads?",
    "agentId": "main",
    "sessionId": "memory-question-001",
    "timeoutSeconds": 90
  }' --max-time 120
