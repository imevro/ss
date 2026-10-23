# deploy

How the project is built, released and brought up locally.

- [`how-version-is-released`](how-version-is-released.md) — merge to master, tag, publish a release, and publishing deploys through `ss-deploy.service`.
- [`gotcha-no-env-file-in-root`](gotcha-no-env-file-in-root.md) — without `.env` in the root directory the service falls over.
- [`mic-skill-repo-access-on-gentic-box`](mic-skill-repo-access-on-gentic-box.md) — what a gentic box needs to install skill sets from the private MIC repository itself.
- [`gotcha-migrations-lag-behind-schema`](gotcha-migrations-lag-behind-schema.md) — the schema is pushed directly, migrations lag: clean-base check, repair by generation.
- [`gotcha-old-process-holds-port`](gotcha-old-process-holds-port.md) — port 8787 held by yesterday's process: the check answers with old code, the new copy dies with EADDRINUSE.
- [`how-stack-is-raised-for-live-check`](how-stack-is-raised-for-live-check.md) — the stack is two things: the database in Docker, and API plus web from `bun run dev`.
- [`gotcha-generator-blocks-on-prompt`](gotcha-generator-blocks-on-prompt.md) — `db:generate` can block on a rename prompt and writes no file without a terminal.
- [`gotcha-one-token-one-webhook`](gotcha-one-token-one-webhook.md) — a bot token has one webhook: the token does not go on a talk-free box, or a deploy steals the updates.
- [`gotcha-removed-secret-lives-in-machine-version`](gotcha-removed-secret-lives-in-machine-version.md) — an unset secret stays in the Fly machine version; only recreating the machine clears it.
