---
name: doc
description: Capture this session into memory (the /doc workflow)
---

Wrap up this session: persist what was learned.

Follow `skills/engineering/engineering-session-memory-capture`. Route each lesson:

- **Project-specific** → this repo's own memory (`.agents/memory/`), one fact per file, prefix by kind (`do-`/`dont-`/`gotcha-`/`how-`/`ref-`), update the section README. Session state goes in `wip/`.
- **Portable** (you'd want it in the next project too) → a new or updated `SKILL.md` in the shared skills repo (imevro/skills), then push/PR.

Never run two memory-writers in parallel. Write to the worktree's memory dir, never the main checkout.
