#!/bin/bash
curl -s -X POST "http://91.98.231.87:3100/execute" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer 9b8d2c89d0ff9f2477b9c2b50b4bf1c0a6a01672014cd02d" \
  -d '{
    "message": "Design two markdown files for our vault:\n\n1. GUARDRAILS.md - validation checkpoints for enrichment pipeline. Each step has: action, expected result, validation command, retry logic. Machine-readable format.\n\n2. FLOW.md - complete onboarding-to-enrichment pipeline step by step. Each step has: who does it (backend/agent), what happens, what to validate, what fails if skipped.\n\nKey rules: ALL content in English. Never Serbian. Write the actual file contents.",
    "agentId": "main",
    "sessionId": "guardrails-short-001",
    "timeoutSeconds": 120
  }' --max-time 150
