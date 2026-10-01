---
name: fp-purity-no-ternaries
description: No ternary operators anywhere — guard + early return instead. Use whenever writing any conditional value selection in code.
---

# No ternaries

`cond ? a : b` is banned everywhere — especially ternaries that return arrays or objects. Write a guard `if` with an early `return` instead.

## How

When tempted by a ternary, write an `if` with an early return — typically a small named helper that returns the value assigned to a `const`:

```ts
// banned
const label = cond ? 'a' : 'b';

// sanctioned
function pickLabel() {
  if (cond) return 'a';
  return 'b';
}
const label = pickLabel();
```

- Even a trivial string pick must be an `if`.
- In strict-FP code a reassigned `let` is ALSO banned, so the early-return-helper shape is the way.
- After any edit to conditional code, grep the touched functions for `?` before declaring done.

## The one exception

Conditional render in a UI framework's JSX: `{cond ? <A /> : <B />}` — idiomatic, allowed. Everything else: no.

## Why

Nested and value-returning ternaries are the hardest conditional shape to scan: the condition, the two branches, and their precedence all compete in one line. Guard + early return reads top to bottom and gives each branch a line of its own.
