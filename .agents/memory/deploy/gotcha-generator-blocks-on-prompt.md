# `db:generate` can block on an interactive prompt

The migration generator compares the schema with the last snapshot
(`packages/db/drizzle/meta/*.json`). When a table in the schema has no obvious match in the
snapshot, drizzle-kit does not guess: it asks a human "create it or rename it from one of
these?" — and writes no file without an answer. That happens after a table was renamed or
after a snapshot was hand-edited, and it is how the organization tables were migrated
(`companies` → `organization` and so on).

How to catch it:

- no terminal — the generator refuses with "Interactive prompts require a TTY terminal …";
  that is visible when the command goes through a pipe or a CI step;
- there is a terminal — it shows the list of renames and waits; the answer for a new table
  kind is "create table", otherwise the generator records a rename of the old table into the
  new one.

So `bun run db:generate` is a command that needs a live human, not a line in a pipeline.
The order of repair for lagging migrations is described in
`gotcha-migrations-lag-behind-schema.md`.

State on 2026-10-23: the snapshots match the schema, and `bun run db:generate` finishes with
"No schema changes, nothing to migrate". The prompt is not gone, it is only not reached while
the snapshots stay clean.
