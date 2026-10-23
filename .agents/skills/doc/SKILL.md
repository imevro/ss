---
name: doc
description: End-of-session documentation pass (the /doc workflow) — overview the session, propose numbered additions and deletions to project memory, apply only what the user approves. Use at session end or from /wrap.
---

# /doc — propose, approve, prune

Memory is a decision aid, not a changelog. Each pass either earns a file its
place or deletes it. Nothing is written before the user approves an item.

Run this in the session that did the work. The overview and the "is this
already known?" judgment come from the real history; a subagent gets a
paraphrase and produces summary slop. Conventions — what may enter, what must
be deleted, routing — live in `engineering-session-memory-capture`.

## 1. Overview

3–6 lines: what changed, the surfaces touched, what was proven (the command,
test, or live check). No plan restatement, no praise.

## 2. Proposal — one flat numbered list

Read every affected memory section in full before proposing.

```
1. ADD memory/<section>/<prefix>-<lesson>.md
     fact: <the exact one or two lines that would be stored>
2. DELETE memory/<section>/<file>.md
     why: stale — <what the code says now>
3. UPDATE memory/<section>/<file>.md
     fact: <replacement text>
```

- Every ADD shows its fact inline. The user judges the content, not a title.
- Every DELETE carries evidence: stale (contradicted by current code),
  duplicate (name the file that wins), obvious (restates code or a naming
  convention), churn (version, ticket id, temporary state).
- Nominate the deletions this session created or invalidated. A section that
  only grows is this command failing.
- Zero additions is common and correct: say so in one line, then propose the
  cleanup alone.

## 3. Approval

`1 ок 2 ок 3 не надо`, or `все ок` / `всё не надо`, or `1 ок, но короче`.

- Apply exactly the approved items. Unapproved → no file, no README line, no
  "remember this later".
- The README/index line is part of its item, not a separate proposal.
- Declined lessons are not re-proposed in this session and not recorded
  anywhere else.
- Write in the current worktree, never through a symlink into the main
  checkout.

## 4. Report

`+N −M` files, net lines, one line on the resulting tree. Then stop.
