---
name: wrap
description: Wrap up a finished work session end-to-end (the /wrap workflow) — sync with the remote, then run the sibling /noslop, /test and /doc commands, squash commit, ship when this repo releases
---

Work is done and the session needs finalization. Invoking this workflow means it runs fully autonomous — no missed work, one exception: the `/doc` approval gate in step 3 waits for the user's item-by-item reply. If some steps already happened (another session's agency), continue where it stopped — never restart from scratch.

This is an orchestrator. Its steps delegate to the standalone sibling commands `/noslop`, `/test`, `/doc` — read each one; each is self-contained and can be run alone.

## Sync with the remote first

- Fetch the latest main branch (main or master — match the repo) — parallel sessions may have pushed.
- Divergence is expected with parallel sessions: rebase on the remote main, land this session's commit in LOCAL main. Never push to origin from a worktree; never let origin main get ahead of local main.

## Subagent rules (whole workflow, read first)

- Delegate the steps below to subagents: cheap literal model (haiku) for `/test`, strongest available (opus) for `/noslop` — quality judgment is not for the cheap model. `/doc` is the exception: run it in this session (step 3), because the overview and the "already known?" judgment exist only in this session's history.
- Each prompt must be self-contained: exact commands to run, absolute file paths, exact accept/reject criteria. Assume the subagent has none of your context beyond the prompt.
- Resolve `git rev-parse --show-toplevel` ONCE and pass that absolute worktree root to every subagent that touches files. You are usually in a worktree: forbid writing to the main checkout's memory through session-history symlinks (those writes land off-branch) — memory writes go to the worktree's memory dir.

## Steps

1. Check the unstaged diff against what this session's plan set out to do.
2. Two independent subagents in parallel — run `/noslop` (quality gate) and `/test` (tests) on the diff. Give each the sibling command's full text plus your session's specifics (touched surfaces, absolute paths, the plan). Don't be biased toward your own work; don't ignore their recommendations.
3. When tests pass and everything is fixed — documentation: run the `/doc` workflow in THIS session, never via a subagent. Post the session overview and the flat numbered proposal of ADD / DELETE / UPDATE items with their facts and evidence, then wait. The user answers `1 ок 2 ок 3 не надо`; apply exactly the approved items and continue. Nothing is remembered that was not approved; declined items are not re-proposed.
4. Squash commit to LOCAL main with a detailed commit message — no AI ads. Never commit to origin.
5. Ship — only if this repo ships via releases: run the sibling `/release` command (read `skills/commands/release/SKILL.md`) — it triggers the release-cut workflow, fills the draft's whats-new markers, publishes the draft (publishing IS the deploy — no separate manual steps), and watches the deploy + TestFlight runs. Prerequisite it enforces: the squash commit is landed on origin/main and CI is green first — the cut builds from main.
   No release pipeline in this repo → this step is done; the local squash commit was the whole ship.
6. Verify the release per the /release command's success states, then clean up ONLY your own worktree/branch/devices; leave other sessions' stuff alone.
7. Give the final summary: version, release link, what shipped.

## Red runs

- Read the failed logs (`gh run view <id> --log-failed`). Most deploy failures are infra, and the fixes are already documented in the repo memory gotchas — start there.
- Infra-only fix → apply it and rerun the same run/tag (`gh run rerun --failed`); do NOT cut a new version. Cut a new patch only when the fix is repo code that must ship in the released ref.
- The steps you cannot do autonomously: the `/doc` approval gate, and a job that needs an interactive secret (codesign/keychain class). For the secret, ask the user to run that single command via the `!` prefix — the secret never reaches you — then rerun the job.
- Never touch the project's agent-config files (CLAUDE.md / AGENTS.md) — out of scope for this workflow.
