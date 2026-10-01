---
name: fp-purity-biome-unsafe-null-coalesce
description: Biome's unsafe autofix rewrites == null to === null, silently dropping undefined guards. Use after any `biome check --write --unsafe` run, or whenever guarding nullable values.
---

# Gotcha: `biome check --write --unsafe` rewrites `== null` → `=== null`, silently dropping `undefined`

`bunx biome check --write --unsafe` applies the no-equals-to-null fix, rewriting `x == null` → `x === null` and `x != null` → `x !== null`.

This is a SILENT runtime bug anywhere the operand can be `undefined`:

- `x == null` is true for BOTH `null` AND `undefined` (loose equality).
- `x === null` is true for `null` ONLY — every `undefined` now slips through (or fails) the guard.

Biome treats this as "safe to autofix", but it is not when the type includes `undefined` — and the unnecessary-condition check does NOT reliably flag the resulting always-true/always-false branch.

## What it broke (real session, 6 bugs)

`undefined` flowed into NOT-NULL inserts, rate lookups, truncation guards, id formatting — all `T | undefined` operands (optional-schema values, `?.` chains, `Map.get()`, optional params) where the `== null` guard had been doing real double duty.

## Fix pattern

Guard both cases EXPLICITLY. Do NOT revert to `!= null` — it is banned by the rule and will be re-broken on the next unsafe run:

```ts
if (x !== null && x !== undefined) { ... }
```

When the value is genuinely optional and a real, contract-level default exists, take it through an explicit branch — never a mask that hides a broken contract (see the no-fallbacks law).

## Detection after any `--write --unsafe`

Audit the diff for every introduced `=== null` / `!== null` and confirm the operand type does NOT include `undefined`. Hot spots: optional-schema reads, optional-chained reads, `T | undefined` parameters, `Map.get`.
