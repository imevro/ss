---
name: noslop
description: "Code quality gate (the /noslop workflow) — two scopes by argument: diff review of this session's changes, or a full-codebase audit. Fix what violates repo and shared canon; nothing dangling."
---

Code-quality gate. One command, two scopes — pick by `$ARGUMENTS`:

- **`diff`** (default) — review this session's diff before finalization. Fix what's wrong, produce a verdict table.
- **`all`** — diagnostic audit of the whole codebase, all platforms, before planning. Report only, no edits.

The bar is the repo's own canon — its memory lessons (filename IS the lesson — `dont-*`, `gotcha-*`, `ref-*`, …), AGENTS rules, and CI-enforced mechanical gates — plus the shared canon for the touched surface (purity, engineering, testing, platform skills). In particular the semantic ship-blocker classes (`engineering/engineering-ship-blocker-classes`) are the classes no linter sees; run every applicable class against the relevant surfaces.

Mechanics/style are CI's job: run the repo's own mechanical gates exactly as its CI/package.json define them. This gate exists to catch the semantic classes no linter sees — so that pile never accumulates again.

## Rules (do not dodge)

- "But this already exists in the code" / "it's not my surface" is NOT an excuse — fix it. The gate is the whole codebase, every line. A documented, intentional carve-out is the only exception: flag it as a carve-out, don't fix it.
- **Nothing dangling.** Delete stale mocks / legacy / lying comments in any touched surface. Every surface should feel 0.1 → 1.0: prod-ready, no TODO tails.
- **Adversarially verify** every finding before reporting or fixing — re-grep all call-sites, including nested routes that re-query independently and dynamic refs a static analyzer can't see. Don't trust the first pass.
- Intellectual honesty over count: an intentional carve-out is NOT a bug. Do not "fix" deliberate code just to raise the finding count — that breaks production or re-litigates a settled decision.

## Scope `diff` (default) — pre-ship review

Are we ready to ship this as our best code? Fully adherent to the guidelines and approaches — no quirks, no shortcuts. Responsive layout, i18n, dark mode, a11y too when the surface has them.

Spawn an **independent strongest-model (opus) subagent** for this — you are biased by ownership of your own code. Hand it a self-contained spec: the exact gates to run, the exact surfaces touched (absolute paths), the accept/reject criteria. Have it run the gates against the touched surfaces, then every applicable semantic class.

**Verdict — table format:** one row per touched surface: **fix → canon rule → how satisfied**, each fix tied to the rule it honors. Apply its recommendations — don't be biased against your own work, don't ignore them.

## Scope `all` — full-codebase diagnostic audit

Run the gates and report only what they surface; never re-derive those classes in a subagent.

Fan out one subagent per applicable semantic class in `engineering/engineering-ship-blocker-classes` (security / money-correctness / concurrency / perf / single-source / naming / boundary-types / defensive-cruft / stale-mocks-dangling / lying-docs / dep-hygiene). Each must research its class, write a critical assessment of the current code, recommend high-confidence fixes, and adversarially verify every finding. Tie each finding to the canon rule it violates.

**NO EDITS in this mode.** Gather info — it is a diagnostic gate, report only. For all code regardless of platform.
