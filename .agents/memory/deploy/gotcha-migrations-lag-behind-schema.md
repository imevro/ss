# Migrations lag behind the schema while development pushes it directly

In development the database schema is applied **directly**, with `drizzle push`, and
migration files are made only for a release. Ordinary schema edits therefore produce no
migrations: the files in `packages/db/drizzle` are updated rarely, and the schema moves
ahead. The difference stays invisible while you work on an already pushed database — and
shows up only on a clean one.

Why it is dangerous: a clean database raised from scratch by migrations lacks what the
working database got through push. The case that bit us: the `agent_session_number`
sequence (chat creation needs it) and the two unique indexes of `agent_sessions`
(`agent_sessions_gentic_key`, `agent_sessions_company_conversation`) existed only in the
pushed database. The application on a migrated database fell over on chat creation, and the
uniqueness of `agent_sessions` was unprotected.

The check runs on a clean database, not on the working one:

```bash
docker exec ss-db psql -U ss -d postgres -c 'CREATE DATABASE memory_check'
for f in packages/db/drizzle/*.sql; do docker exec -i ss-db psql -q -U ss -d memory_check < "$f"; done
docker exec ss-db psql -U ss -d memory_check -c '\d agent_sessions'
docker exec ss-db psql -U ss -d memory_check -c '\ds'
```

Compare the columns, indexes and sequences with the working database. The columns alone are
not enough: a missing sequence and a missing unique index are both invisible in a column
list.

The repair is to generate what is missing from the schema: `bun run db:generate` in the root
appends the difference as a new migration.

State on 2026-10-23: the check passes — a clean database from the three migrations gives 14
tables, the `agent_session_number` sequence and both unique indexes.
