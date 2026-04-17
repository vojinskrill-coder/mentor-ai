#!/bin/bash
curl -s -X POST "http://91.98.231.87:3100/execute" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer 9b8d2c89d0ff9f2477b9c2b50b4bf1c0a6a01672014cd02d" \
  -d '{
    "message": "Follow-up on orchestration. You now have Qdrant for memory_search and Obsidian vault for persistent knowledge. Questions: 1) Does Qdrant+Obsidian solve context bloating? Instead of accumulating conversation history, you search Qdrant for relevant context per concept and read Obsidian for tenant knowledge. 2) If you store enriched results in Qdrant+Obsidian after each enrichment, does main session stay clean? 3) Can memory_search pull only relevant business context per concept instead of loading everything? 4) Practical recommendation: still need compaction every 8-10 concepts or does semantic memory solve it?",
    "agentId": "main",
    "sessionId": "config-discussion-fresh",
    "timeoutSeconds": 120
  }' --max-time 150
