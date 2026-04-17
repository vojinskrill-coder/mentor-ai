#!/bin/bash
curl -s -X POST "http://91.98.231.87:3100/execute" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer 9b8d2c89d0ff9f2477b9c2b50b4bf1c0a6a01672014cd02d" \
  -d '{
    "message": "You have Qdrant memory_search and Obsidian vault. When enriching business concepts: 1) Can you use memory_search to pull ONLY relevant context per concept instead of loading all conversation history? 2) After enriching a concept, if the result is stored in Qdrant, does the main session context stay clean because you query memory instead of accumulating history? 3) Does Qdrant+Obsidian solve the 192K context overflow problem? 4) Should I still compact every 8-10 concepts or does semantic memory via Qdrant replace that need?",
    "agentId": "main",
    "sessionId": "qdrant-memory-question-001",
    "timeoutSeconds": 120
  }' --max-time 150
