---
name: fp-purity-no-else
description: No else / else if — branch with a Record mapper or guard + early return. Use whenever writing conditionals over a known set of values.
---

# No `else` / `else if` — map or guard instead

`else` (and `else if`, and braceless forms) are banned. Strangled conditionals (`if if if else`) are unreadable and unexpandable.

## Allowed forms

1. **Record mapper** — branching on a single string/enum value is always a table:
   ```ts
   const LABEL: Record<Kind, string> = {
     hero: '...',
     gallery: '...',
   };
   ```
2. **Guard + direct return** — strictly the shape `if (x) { …; return/throw }`, followed by a straight-line `return y;`. Nothing else.

## Not allowed

- `continue` as a loop guard — the same strangled-flow problem; rewrite the loop to `filter`/`map`/`flatMap`.
- Ternaries — banned separately (except conditional render in UI framework JSX).

## Why

An `else` chain forces the reader to track which branch they are in and what earlier branches already excluded. A mapper table is data you can read in one glance; guards with early returns keep the happy path as plain sequential code.
