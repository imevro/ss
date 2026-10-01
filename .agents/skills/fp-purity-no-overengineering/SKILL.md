---
name: fp-purity-no-overengineering
description: Single source of truth — drop dual systems. Use when two code paths, tables, or helpers do the same thing at different granularities.
---

# Single source of truth — drop dual systems

When two code paths do similar things, one of them goes. Dual systems die: two helpers, tables, or files doing the same job keep ONE.

## The failure shapes

- A usage table at one granularity PLUS per-step rows → keep the per-step rows only; aggregate with a plain reduce/SUM where needed.
- Bespoke fetch and HTML-to-markdown tools layered over native primitives → the shell already has them: plain `curl | jq`, and a shell builtin for the transform. Do not wrap natives in tools for agents.
- Several files for one domain → consolidate into one.
- A generic meta-factory building context for each agent → each agent inlines its own construction.

## Rules

- When you find yourself writing helper-around-helper, ask: "could the caller just do this directly?"
- When you have two tables/files that store the same data at different granularities, drop one and aggregate.
- When you reach for generics to power a registry, inline instead.

## Why

Every wrapper is a footgun for future contributors. Plain shell composition is trusted over bespoke tool layers; SQL aggregation over a denormalized aggregate table. Each abstraction layer is another contract to keep honest, and dual systems drift until one of them lies.
