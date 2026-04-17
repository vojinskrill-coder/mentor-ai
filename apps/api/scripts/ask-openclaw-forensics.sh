#!/bin/bash
curl -s -X POST "http://91.98.231.87:3100/stream" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer 9b8d2c89d0ff9f2477b9c2b50b4bf1c0a6a01672014cd02d" \
  -d '{
    "message": "FORENSICS: I need to understand what happened with tenant tnt_gp35ya8e4ul5n89o9g1sixvy enrichment.\n\n1. You wrote 2 articles to the vault (marketing-kroz-drustvene-mreze.md and optimizacija-za-pretrazivace-seo.md). The vault log shows them.\n2. But the backend API (100.114.192.85:3000) shows 0 completed tasks and 74 PENDING.\n3. The backend API CRASHED at some point — it returned connection refused.\n4. Did you receive enrichment tasks from the backend? How many?\n5. Did the backend ever call you back after you finished writing?\n6. What errors did you encounter?\n7. Your log mentions \"rescued from sub-agent timeout\" — what happened with sub-agents?\n\nCheck your session logs for enrichment-tnt_gp35ya8e4ul5n89o9g1sixvy and report what you see.",
    "agentId": "main",
    "sessionId": "forensics-001",
    "timeoutSeconds": 90
  }' --max-time 120 2>&1 | grep '"text"' | grep -v '"text":""' | head -10
