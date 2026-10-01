---
name: fp-purity-fail-loud-no-fallbacks
description: Never hide failures with defensive try/catch or fallback defaults — fail loudly. Use when writing error handling, env/config defaults, or boundary parsing.
---

# Don't hide errors with fallbacks

Defensive programming that HIDES a failure is worse than the failure: a silent wrong result ships to production and costs real money; a loud crash with a trace is caught immediately.

## Banned

- `try/catch` that swallows an error (logs and continues, or returns `null`/`[]`/`0`).
- Empty `catch {}`.
- A fallback default that masks a contract break (the LLM/fetch/DB returned something wrong → substitute a "reasonable" value instead of failing).
- `?.`/`??` hiding an IMPOSSIBLE null (if null here is a bug, do not mask it — let it throw).

## The only legal home for try/catch

Genuinely untrusted / unsanitized input — parsing user data, the network edge, a third-party API — and even there with EXPLICIT handling of a specific error (not a catch-all silencer) and meaningful recovery or a re-throw with context.

## Rules

- Default: let it fail loudly.
- Every `catch` must answer: "which specific untrusted input am I handling here, and why is this not a bug?" — otherwise delete it.
- Legitimate cases have a home that is NOT a fallback:
  - env/config default → fail-loud `required(name)`; production and dev set it explicitly, an absence is a misconfiguration.
  - untrusted HTTP/LLM input → parse against a schema (the one legal edge domain — through a schema, not bare `??`).
  - absence normalization (`undefined → null` at a DB boundary) → explicit branch/`if`, not coalescing.
  - conditional render `{x ?? <Empty/>}` in a UI framework → render syntax, not a fallback; treated as such.

## Why

There are no legitimate fallbacks: a default that fires instead of a failure converts an impossible state into a plausible-looking wrong answer, and the wrong answer outlives the crash that should have happened.
