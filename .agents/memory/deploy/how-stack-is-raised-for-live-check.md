# How to raise the stack for a live check

The stack is two things: the database and the application. It has no queue.

## What is raised

| What | With | Where it lives |
| --- | --- | --- |
| Core database | `docker compose up -d db` | container `ss-db`, host port **5433**, `ss`/`ss_core` |
| API | `bun run dev` (turbo) | `8787` (`PORT`, `apps/api/src/env.ts`) |
| Web | `bun run dev` (turbo) | `5173` (vite default; the same port in `WEB_ORIGINS`, `apps/api/src/env.ts`) |

Web proxies requests to the API itself: `/api` and `/v1` go to `API_ORIGIN`, by default
`http://localhost:8787` (`apps/web/vite.config.ts`). Without `.env` in the root directory
the service does not start — see `gotcha-no-env-file-in-root.md`.

## What to prove

- The API is alive: `curl -s -o /dev/null -w '%{http_code}' http://localhost:8787/health`
  → `200` (`/health` in `apps/api/src/index.ts`).
- Sign-in is checked: `http://localhost:8787/v1/me` without a cookie → `401`.
- The sign-in guard works: web without a cookie on `/` and on `/<slug>/sessions/<id>` →
  `302` to sign-in (see `do-sign-in-guard-before-data.md`).

Port `8787` spoils the check if yesterday's process holds it:
`gotcha-old-process-holds-port.md`.

## Where the conversation lives

In the core database, next to companies: `conversations` and `messages`
(`packages/db/src/conversations.ts`). A company has no database of its own, so there is no
separate database to visit for it.
