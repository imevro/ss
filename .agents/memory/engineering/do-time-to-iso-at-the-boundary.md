# Time goes out as ISO: one conversion, at the response boundary

The database gives time as a string with a space instead of "T". By contract, time goes out
as ISO, so the conversion is done **once, at the API exit** — not by a type cast in SQL.

The place of conversion is `isoOf` in `apps/api/src/docs.ts` (`new Date(at).toISOString()`).
Both read answers call it in the row mapping: `apps/api/src/conversations.ts` (the
`last_message_at` field) and the same file (the `sent_at` field). Queries take time as text
(`last_message_at::text`, `sent_at::text`), the field shape in the response schemas is
`string` (`apps/api/src/contracts.ts`), so the type is not rewritten a second time.
