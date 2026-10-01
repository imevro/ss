---
name: fp-purity-no-added-complexity
description: Every edit must make the code simpler, not more complex. Use when a refactor adds files, types, or abstractions to do the same job.
---

# Every edit must make the code simpler, not more complex

"It should have become simpler, not more complex." A refactor that adds files, types, or abstractions to do the same job is a regression, not an improvement.

## The shape of the failure

A value that is just an array gets assembled through three overlapping pieces of machinery:

```ts
const history = await loadFromDb(threadId);
const messages = [system, ...history, user];
```

One assembler, one loader. NOT `priorItems` + `historyToMessages` + `loadThreadTimeline` — three layers that each re-derive what a plain array spread already expresses.

## Rules

- When a change adds a layer, stop and find the collapse instead.
- Net line count going DOWN on a "cleanup" is the signal it actually got simpler. A cleanup that grows the file grew complexity.

## Why

Wrappers and dual systems get killed aggressively in review. Every extra file, type, or indirection is a place for future contributors to misread intent and for the two copies to drift apart.
