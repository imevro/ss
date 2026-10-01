---
name: fp-purity-strictness-rules
description: "Hard FP purity bar for Swift projects: no ternary operators (computed props / @ViewBuilder + if), no magic constants (named lets), no needless mutability, DRY, strong types — enforced by an independent whole-codebase review."
---

# Strict FP bar (Swift)

Hard rules for Swift code in this family's FP-school projects:

- **No classes / OOP.** No inheritance, no `ObservableObject`, no
  `@StateObject`/`@ObservedObject`/`@EnvironmentObject`, no `@Model`, no
  SwiftData. (Where the codebase canon keeps an `@Observable` store class for
  app-global session state, that one top-level layer is the documented
  exception; everything below it stays value-based.)
- **No ternary operators.** Use computed properties or `@ViewBuilder` + `if`.
- **No magic constants.** Named `let`s.
- **DRY.** No duplicated logic.
- **Strong types.**
- **No needless mutability.**
- **No slop.** No in-motion placeholder comments, no dead or fake code paths.

Enforcement: an independent review pass (the owner considers self-review
biased) that audits the whole codebase, not just the session's surface —
"fix, don't dodge."
