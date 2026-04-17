---
name: Email restriction for AI agents
description: All AI agent email tools must only send to vojinskrill@gmail.com - never to any other address
type: feedback
---

Agent AI tools that send emails must ONLY send to vojinskrill@gmail.com.

**Why:** Safety measure — agents should never send emails to external parties without explicit approval. This applies to OpenClaw agents (cold-email, campaign-orchestrator, agentmail) and any NestJS agent execution that generates outreach.

**How to apply:** When configuring OpenClaw agent SOUL.md files or email-related skills, always include this restriction. When building email functionality in the app, hardcode this as the only allowed recipient in dev/test mode.
