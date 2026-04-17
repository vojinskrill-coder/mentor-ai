#!/bin/bash
curl -s -X POST "http://91.98.231.87:3100/execute" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer 9b8d2c89d0ff9f2477b9c2b50b4bf1c0a6a01672014cd02d" \
  -d '{
    "message": "Specific questions about the vault as EXTENDED MEMORY and SKILL REPOSITORY:\n\n1. EXTENDED MEMORY: After a user has a conversation about pricing strategy, you crystallize the insight back into wiki/concepts/pricing-strategy.md. Next time someone asks about pricing, you READ that file for context. How would you implement this read-before-respond pattern?\n\n2. SKILLS: You learn that for Irish Law, the best research approach is searching legislation.ie + Law Reform Commission. You save this as skills/research-legal-tech.md. Next enrichment task, you READ that skill first. How would skills/ work in practice? When do you read vs write?\n\n3. KNOWLEDGE LIFECYCLE: working (placeholder) to episodic (first enrichment) to semantic (deep research) to procedural (learned skills). How does this map to your actual workflow?\n\n4. Does having the vault as extended memory REPLACE the need for Qdrant? Or do you need BOTH - vault for precise reads, Qdrant for semantic discovery?\n\n5. How would you handle GROWING concepts? A concept starts at 5000 words, then conversations add insights over months. The vault file grows. How do you manage that?",
    "agentId": "main",
    "sessionId": "vault-memory-skills-001",
    "timeoutSeconds": 180
  }' --max-time 210
