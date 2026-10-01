---
name: engineering-no-ai-slop
description: No stubs, larp, no-op placeholders, sentinels, in-motion comments, or lying doc comments. Use when writing or reviewing code that an AI agent produced.
---

# Don't leave AI slop

Code and comments that read as "a model wrote something just to have something" get deleted.

## Banned

- Stubs / larp / no-op placeholders / sentinel values left "to make it compile or typecheck".
- Comments describing in-motion work: "replaced the old with the new", "now we use X instead of Y", "temporarily", ticket-less "TODO: later" — noise for the next reader.
- Obvious comments restating the code (`// increment i`).
- Scaffold comments and lying doc comments that do not match the code.

## Allowed

A comment that explains a NON-OBVIOUS "why" to a new reader: an unusual decision, a carve-out reference, the reason a constant is what it is. When editing an existing comment, make it concise.

## Rules

- Default: exactly as much code as needed. A comment must earn its place by explaining why, not what.
- Everything else is deleted in the same commit — nothing dangling, prod-ready.

## Why

Placeholder code compiles and passes review, then silently becomes the behavior someone depends on. In-motion and restating comments go stale the moment the code moves and actively mislead the next reader.
