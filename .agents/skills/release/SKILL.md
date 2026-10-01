---
name: release
description: Cut and ship a full release (the /release workflow) — trigger the release-cut workflow, fill the whats-new markers in the draft, publish it, watch the deploy and TestFlight runs land.
---

# Cut and ship a release

Run when a finished session's work is committed on the default branch and the
repo ships via GitHub Releases. This workflow runs fully autonomous end to
end: no asking, no missed steps. If some steps already happened (another
session's agency), continue where it stopped — never restart from scratch.

## Preconditions

Resolve the release automation first: find the release-cut workflow in
`.github/workflows/` (name contains `release-cut`, triggers on
`workflow_dispatch` with a `bump` input). Read the repo memory (deploy
section) for the documented flow — it names the branch the cut builds from,
the whats-new marker contract, and the health checks.

Land the session's commits on the default branch and confirm CI is green
before cutting — the cut builds from main. In a worktree: never push to
origin from the worktree; never let origin main get ahead of local main.

## Cut

Trigger the cut entirely on GitHub — no laptop:

```bash
gh workflow run release-cut.yml -f bump=patch
```

`patch` is the default; `minor`/`major` only on request. Watch the run until
it opens a DRAFT GitHub Release:

```bash
gh run list --workflow release-cut.yml
gh run watch <run-id> --exit-status
```

The cut script guards (branch, clean tree, sync), bumps the version from the
newest `v*` tag, builds the changelog from conventional commits, pushes the
commit + tag, and creates the draft Release with the whats-new markers in
place. It never deploys on its own.

## Fill whats-new + publish

Fill the notes ONLY when this release touched the iOS app — diff the repo's
iOS dir between the previous `v*` tag and this tag:

```bash
git diff --quiet <prev-tag> <tag> -- <ios-dir> || echo changed
```

- iOS changed: fill the draft's whats-new marker(s) — `<!-- testflight -->`,
  or `<!-- testflight:en -->` / `<!-- testflight:ru -->` for bilingual — with
  tester-facing plain-language notes (what to look at, what changed, known
  gaps). Keep the changelog below the marker separator. Edit via
  `gh release edit <tag> --notes-file <file>`.
- Backend-only release: the markers may stay as the TODO placeholders — the
  TestFlight gate skips before the guard ever runs.

Then publish the draft. Publishing IS the deploy trigger — it fires the
repo's release-deploy and testflight runs; there is no separate manual
deploy or TestFlight step after it:

```bash
gh release edit <tag> --draft=false
```

## Watch + verify

Publishing fires two runs: the prod deploy (always) and TestFlight (only
when the gate saw iOS changes). Watch both:

```bash
gh run list
gh run watch <run-id> --exit-status
```

Success states:

- deploy: the run's own conclusion is the source of truth, plus the repo
  memory's documented health check (on a gated endpoint, an auth challenge
  means "up" — that is NOT a failure).
- TestFlight: run green AND — only when iOS changed — a new build appears in
  App Store Connect. For a backend-only release, "green with the TestFlight
  job skipped" IS the success state — confirm via
  `gh run view <run-id> --json jobs`: the gate job is success and the
  testflight job is skipped. No build is expected then.

Clean up ONLY your own worktree/branch/devices; leave other sessions' stuff
alone.

## Red runs

Read the failed logs: `gh run view <run-id> --log-failed`. Most deploy or
TestFlight failures are self-hosted-runner infra, and the fixes are
documented in the repo memory gotchas (deploy section) — start there.

- Infra-only fix → apply it and rerun the same run against the same tag:
  `gh run rerun <run-id> --failed`. Do NOT cut a new version.
- Cut a new patch only when the fix is a change to repo code that must ship
  in the released ref.
- The one step you cannot do autonomously: a job that needs an interactive
  secret (codesign/keychain class). Ask the user to run that single command
  via the `!` prefix — the secret never reaches you — then rerun the job.

## Report

Final summary: version, GitHub Release link, what shipped.
