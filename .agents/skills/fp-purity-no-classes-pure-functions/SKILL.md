---
name: fp-purity-no-classes-pure-functions
description: FP-only style — no factory wrappers around chained DSLs; inline the chain. Use when composing workflows, engines, or any builder-style DSL.
---

# FP-only — no factory wrappers around chained DSLs

When working with chained DSLs (a workflow API like `Workflow.step().doUntil(...).step()`), do NOT introduce factory helpers (e.g. `appendAgentLoop(wf, spec)`) that hide the chain structure behind a builder.

## Rules

- The chain shape must be visible at the call site so the reader sees the control flow directly — no magic, no `Spec` interface to learn.
- When the same `.step → .doUntil → .forEach → .step` pattern repeats N times across agents, INLINE it N times. Accept the verbosity.
- Do not write `Spec`/`Definition` interfaces that get fed to a builder.
- Pure stateless helper functions that compute values are fine (`getWorkDir(id)`, `chatCompletion(args)`) — they do not build chains, they just compute values.
- Pure functions returning plain data (string, number, plain object) — fine.
- A pure function that takes args and returns a `.step()` callable is ALSO a factory — avoid it too.

## Why

A factory erases the very structure the DSL exists to show. When the chain is hidden behind a builder, the reader must hold the builder's contract in mind and trust it; inlined, the control flow is right there in front of them.
