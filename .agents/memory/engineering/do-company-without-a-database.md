# A company is a name, people and gentic sessions

A company has no database of its own. A company is a row in the core database: a name, people
with roles, invitations, gentic sessions. Chat conversation lives next to it, in the core
database (`conversations`/`messages`, `packages/db/src/conversations.ts`).

The database provisioning is removed whole: the route `/v1/companies/:id/database`, the job
`db:provision`, the worker, the queue broker, the `company_databases` registry, the `ctx`
schema in a separate database. Everything done with company data is done by gentics.

It follows that:

- onboarding is three questions and a button: name, what it does, invitations;
- a company has no database of its own, so there is nowhere to wait for its readiness;
- chats and the feed are read from the core database in one query without walking companies;
- access to a chat room is checked by a join with `member`, not by walking databases.

**Check:** `bun run db:migrate` on a clean database gives 14 tables without
`company_databases`; creating a company a second time does not hit an occupied address
(`freeSlug` in `apps/api/src/companies.ts`).
