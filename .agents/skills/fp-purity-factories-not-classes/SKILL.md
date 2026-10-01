---
name: fp-purity-factories-not-classes
description: When writing agent or application code — build it from factory functions returning plain objects/closures; never use the class keyword.
---

# Factories, no classes

Code is written as **factory functions returning plain objects or
closures** — no `class` keyword.

## Why

- **Testability**: no `this` binding, no mock constructors — dependencies
  are plain parameters or captured closure state, stubbed with plain
  values/functions.
- **Composition**: factories compose like functions (wrap, decorate,
  partial-apply) where classes need inheritance or interfaces.
- Traceability: every outcome flows through ordinary function calls and
  returns.

## Practice

- A factory takes its dependencies/config as arguments and returns the
  behavior as an object of functions or a closure.
- State that must persist across calls lives in the closure — with
  discipline about what mutates (prefer returning new state over mutating
  captured state).
