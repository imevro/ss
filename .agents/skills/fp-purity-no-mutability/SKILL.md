---
name: fp-purity-no-mutability
description: "No mutability — every function is traceable, every outcome is a pure function's return value. Use for ALL code: no let, reassignment, ++/+=, or in-place array mutators."
---

# No mutability, ever

Every function must be TRACEABLE. Every outcome is the return value of a pure function you can log and follow — never a value buried in a variable that gets reassigned somewhere down the function.

The failure shape this bans: `x.start(); let outcome = ''; /* 200 lines */ outcome = true; x.finish(outcome)` — the step's result hides in a reassigned variable instead of being the return value of a pure function.

## Banned

- `let` in any form — including `for (let i…)` and `let x;` — and therefore module-level mutable singletons.
- Every assignment expression: compound `+=`/`-=`/`*=`/…, reassignment, AND property/index mutation `obj.x = y` / `arr[i] = y`.
- `++` / `--`.
- In-place array mutators: `.push`, `.pop`, `.shift`, `.unshift`, `.splice`, `.sort`, `.reverse`, `.fill`, `.copyWithin`.
- `Object.assign(existingObj, …)` (mutates the target; `Object.assign({}, a)` / spread is fine).

## Allowed

- `const` everywhere.
- `for…of` over a const collection (it reassigns nothing — but NO `let` accumulator inside it).

## Canonical transforms

| Anti-pattern | Immutable replacement |
|---|---|
| `let outcome; try { outcome = await f() } catch {…}` | `const outcome = await f()` directly, or a named helper returning it |
| `let x = dflt; if (c) x = a` | `function pickX() { if (c) return a; return dflt }` then `const x = pickX()` |
| `let acc = 0; for (const v of vs) acc += v` | `const acc = vs.reduce((a, v) => a + v, 0)` |
| `let out = []; …out.push(g(v))` | `const out = vs.map(g)` / `.flatMap` / `.filter` |
| `for (let i = 0; i < n; i++) …` | `Array.from({ length: n }, (_, i) => …)` |
| while-retry with `let attempt` | recursive `async function attempt(n) { … return attempt(n + 1) }` |
| in-place `arr.sort(cmp)` | `arr.toSorted(cmp)` |
| `obj.x = y` while building an object | object literal / spread `{ ...obj, x: y }` |
| `known = {}; if (c) known.k = v` | spread-compose single-key partials |

Reference idiom: small named helpers with early returns that RETURN the value assigned to a `const`.

## The one irreducible exception: set-once process singletons

A lazy + synchronously-read + immutable cell is physically impossible (an eager top-level await would fetch on every import, including offline tests). For genuine process singletons the sanctioned primitive is a module-`const` Map/Set cell set exactly once — deliberately commented. Do not reach for it unless the state is truly irreducible; prefer recursion/reduce/spread.

## Why

Mutability hides observability. The outcome of a step must be visible in the trace — a pure function's return value is; a reassigned `let` is not, and the reassignment site is where the truth gets lost.
