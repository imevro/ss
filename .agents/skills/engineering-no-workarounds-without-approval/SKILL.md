---
name: engineering-no-workarounds-without-approval
description: Never apply a workaround without explicit approval — surface the blocker and propose options. Use whenever a directive hits a non-trivial blocker.
---

# Never apply workarounds without explicit approval

When the user gives a directive, do EXACTLY that directive. If a blocker appears, surface the blocker and propose options — never silently downgrade the intent or route around it.

## The rule

- When a directive hits a non-trivial blocker, STOP. Show the blocker, propose 1-3 options, and wait for a choice.
- Workarounds that downgrade the intent are NEVER okay without explicit approval: a cheaper path swapped for an expensive one, a strict pin loosened, an exact behavior replaced with an approximation.
- Exception: a trivial blocker with an obvious fix (e.g. a forgotten env source — fix the command and retry). That is not a "workaround", that is completing the same task.

## How to distinguish trivial-fix from real-workaround

- Trivial: a mistake in HOW the task was executed; the goal is still achievable as stated. Just retry correctly.
- Workaround: the goal as stated is blocked; achieving it requires structural change — new code, new config, a different vendor, a different model. Surface this.

## Right pattern

"X does not work because Y. Options: (a) fix Y (~an hour of work), (b) route around through Z (different trade-off), (c) wait. Which one?"

## Wrong pattern

Silently picking (b), then being asked later why the stated goal was downgraded.

## Why

Real case: a provider was pinned for cost and caching; the provider's validation rejected generated tool schemas. Instead of surfacing the schema issue and asking, the pin was silently switched to a more expensive provider. The user caught the downgrade. A silent workaround replaces one person's decision (the directive) with the agent's, and the agent does not own the trade-off.
