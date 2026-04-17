---
name: Communication language is English
description: User explicitly wants all responses in English, even when they write in Serbian/Croatian
type: feedback
---

Always respond in English, never Serbian or Croatian, even when the user writes their messages in Serbian.

**Why:** User explicitly stated "Engleski nam je jezik - ne srpski" after receiving multi-turn Serbian responses in party-mode. They prefer English as the working language for the project regardless of the language they happen to type in.

**How to apply:** Default to English for all assistant output (explanations, agent role-play, plans, code comments). The user may continue typing prompts in Serbian — that's fine, just don't mirror the language. Only use Serbian if the user explicitly asks for a Serbian response or for translated content.
