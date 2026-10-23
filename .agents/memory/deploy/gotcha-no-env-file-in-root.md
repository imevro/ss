# Without an environment file in the root directory the service does not start

Development services run **from the root directory**, not only from the copy in
`.worktrees/`. They need `.env` next to `package.json`: it was missing in the root
directory, and the service fell over with "`DATABASE_URL` is not set".

Commands from the root directory:

```bash
bun --env-file=.env apps/api/src/index.ts   # application
cd apps/web && bun run dev                  # panel
```

`bun run dev` in the root starts both through turbo; the API dev script itself is
`bun --env-file=../../.env --watch src/index.ts` in `apps/api`. There is no queue process
to start: `bunqueue` sits in `apps/api/package.json` but nothing imports it.

- `.env` never goes into git. The sample is `.env.example`; the working file is made by
  `scripts/iso-setup.sh`.
- Check: `curl localhost:8787/health`.
