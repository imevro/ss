# One address segment: `sessions` for chats and for miniapps

A company chat and a miniapp open under **one address segment**: `/:slug/sessions/:number`.
There is no second segment for miniapps and none should be started: what is open is decided
by the number, not by the record kind (`openIdOf` in
`apps/web/app/routes/[company]/sessions/[session]/page.tsx`).

The rule is held by two places, both in web:

- the address is assembled only in `apps/web/app/lib/address.ts` — `companyAddress` prints
  `/${slug}/sessions`, `sessionAddress` appends the short number; the address is not built by
  hand in markup;
- `apps/web/app/routes.test.ts` compares the segments of the address builder with the lines
  of the address table: rename a segment in one place and the check falls.

The table line the segments are compared against: `apps/web/app/routes.ts`.
