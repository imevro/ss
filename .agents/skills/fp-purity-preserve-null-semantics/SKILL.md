---
name: fp-purity-preserve-null-semantics
description: Preserve tri-state semantics — 0 = measured zero, NULL = no signal, undefined = untouched. Use when storing or aggregating metric/usage columns on event or step records.
---

# NULL ≠ 0 ≠ undefined — preserve unknown semantics

Enforce tri-state on metric columns (tokens, cost, duration — anything with a "no signal" state):

- `0` means "the call ran and reported zero" (e.g. served from cache).
- `NULL` means "no call happened" (a deterministic step; an error before the call).
- `undefined` (in a typed language) means the column was not touched.

Do NOT collapse these.

## Rules

- Type the metric columns as nullable. Do not default them to 0.
- An error path writes NULL for usage metrics — the failure fired before any usage was reported.
- A step that is not a calling step writes NULL for usage metrics; its timing is still populated.
- A UI renders no-signal distinctly from zero (an em-dash vs. `$0.0000`) — they mean different things to a reader.
- Aggregates: `SUM(cost) WHERE cost IS NOT NULL` answers "spent on calls". Do not `COALESCE(cost, 0)` unless you deliberately want to count no-signal rows as zero.

## Pattern to avoid

```ts
cost: cost ?? 0   // lies — null means unknown, not zero
```

## Pattern that preserves

```ts
cost: cost ?? null   // preserves unknown
```

## Why

Collapsing "no signal" into "measured zero" fabricates data: error rows and deterministic steps start looking like free calls, and the aggregated numbers quietly stop meaning anything. The same rule applies to any future metric with a "no signal" state distinct from a measured zero.
