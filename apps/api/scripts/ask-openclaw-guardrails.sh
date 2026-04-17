#!/bin/bash
curl -s -X POST "http://91.98.231.87:3100/execute" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer 9b8d2c89d0ff9f2477b9c2b50b4bf1c0a6a01672014cd02d" \
  -d '{
    "message": "We have recurring problems with the enrichment pipeline. I need your help designing GUARDRAILS - machine-readable instructions (markdown) that validate every step works correctly.\n\nPROBLEMS:\n1. Descriptions keep coming back in Serbian instead of English\n2. Maturity Engine does not auto-start after onboarding\n3. No validation that vault files were actually written\n4. No validation that concepts were created in PG and Qdrant\n5. No validation that enrichment actually produced 5000+ words\n6. Agent sometimes returns empty content but task gets marked COMPLETED\n\nWHAT I NEED:\n1. A GUARDRAILS.md file for the vault that describes EVERY step in the enrichment flow with validation checkpoints\n2. Machine-readable format so the orchestrator can verify each step\n3. A FLOW.md that describes the complete onboarding-to-enrichment pipeline step by step\n4. Clear language rules: ALL content in English, never Serbian\n5. Retry logic: if a step fails validation, what happens?\n\nDesign these guardrails documents. What should GUARDRAILS.md contain? What should FLOW.md contain? How should the orchestrator use them to ensure quality?\n\nBe specific - give me the actual file contents, not just descriptions.",
    "agentId": "main",
    "sessionId": "guardrails-design-001",
    "timeoutSeconds": 180
  }' --max-time 210
