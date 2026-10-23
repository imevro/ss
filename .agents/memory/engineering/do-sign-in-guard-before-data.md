# The sign-in guard is asked before the data request, not beside it

A page loader that needs a signed-in person must ask **who signed in** (`GET /v1/me`) and, on
401, take you to sign-in (`throw redirect('/login')`) **before** the data request. Only then
do the other requests go.

Why not in one row: while the guard waits together with the data request, there is nobody to
turn the sign-in refusal into a redirect. The data request itself falls over without a
session (`api` in `apps/web/app/lib/api.ts` throws on any non-2xx answer), a page error goes
out, and the person sees a failure instead of the sign-in screen. The guard must stand
**before** that request.

How it is done — the same order in every guarded loader:

- `apps/web/app/routes/[company]/sessions/[session]/page.tsx` — first `/v1/me`, then the
  company list, then `Promise.all` of the conversation and miniapp lists;
- `apps/web/app/routes/onboarding/page.tsx`;
- `apps/web/app/routes/companies/page.tsx`.

The home loader is the exception and needs no guard: it holds no data and redirects to
`/companies`.

Check without a cookie: `/` and `/<slug>/sessions/<id>` must answer with a redirect (302),
`/v1/me` — with a sign-in refusal (401).
