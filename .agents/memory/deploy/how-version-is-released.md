# How a version is released

There is no build pipeline that tests anything: the only workflow is
`.github/workflows/release-deploy.yml`, and it deploys, it does not check. The release is
done by hand in three steps:

1. merge the work into `master`;
2. put a version tag;
3. publish a GitHub release.

## Publishing is deploying

The `release-deploy.yml` workflow triggers on `release: published`. It checks the tag out,
rsyncs the tree into `/var/lib/ss/flake` on the production box, and asks the system to run
the pinned `ss-deploy.service` through the system bus.

- The runner is self-hosted on that same box (`ss-vps`), so GitHub and the repository hold
  no server key.
- The service cannot change what it runs: the command lives in the machine configuration.
  One switch releases the system and the application together — the application is built
  from that tree in `/nix/store`, migrations run as `ss-migrate`, services start on the new
  address. Rollback is one generation.
- After the switch the workflow polls and smoke-tests: web `:5404/login` must reach 200 and
  API `:8787/health` must answer `{"ok":true}`. It also expects a queue answer on
  `:6890/health` — that is the broker planned in `docs/architecture.md`; nothing in `apps/`
  runs it, and `bunqueue` is a declared dependency with no import.

So a release is not "hand out the code": publishing it puts it on the server.

## How the work goes before a release

The work goes in the copy `.worktrees/mvp-0.1` (branch `iso/mvp-0.1`), and is merged into
`master` as one commit. The merge happens in the main directory.

What to remember while merging:

- Files tied to the build are edited by both sides. A merge in this session collided in
  `package.json`, `packages/db/drizzle.config.ts` and `packages/db/package.json`: a second
  session was editing the same places in parallel. The collision was resolved in favour of
  the branch — it is newer.
- Project memory (`.agents/memory`) entered git with this work. From then on it is part of
  the repository.
