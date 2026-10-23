# The feed is built by replaying the log

The feed state is not stored. What is stored is the **event log** — and only in page
memory: we have no browser storage. The log key is the open chat (`useChatLog` in
`apps/web/app/lib/chat-log.ts`). The feed and the work circles are the result of one
pass over the log (`fold` in `apps/web/app/lib/chat-state.ts`).

Why this and not "store the ready messages":

- a restored chat differs from a fresh one in nothing: same pass, same events;
- the markup need not be stored and then compared — it is derived;
- a new event kind is described once, in one place.

## Rules

- An event goes into the log first, the state is read from the log. There is no second
  build path.
- Ready messages from the server go in front of the replayed ones. Extra replayed ones
  are filtered out **by record number**: the record answers with its number
  (`messageId`), and the log event remembers it. Neither text nor message count works
  here: the log does not always remember the whole feed, the count drifts — and a fresh
  question would disappear from the screen.
- An answer is blocks in real order: `text` is words, `work` is a circle of tools. A
  circle closes when the next words start, and each circle has its own
  `startedAt`/`endedAt`. So the text is not glued together, and there are as many work
  lines as there were circles.
- In the database the answer row carries a **journal of frames** (`raw.frames`), not an
  aggregate: the page folds it with the same `fold` as the live journal. Old records
  (`raw.work`) are kept for reading only: they have one circle as a summary.
- Whether a turn runs is decided by `runningOfRaw`: a journal without an end runs; no
  journal — by the summary's `endedAt`.
- The log is capped at 2000 entries: old ones leave, the feed is read from the end.
- The core (`fold`, `stateOf`) is pure: no window, no storage.
- A reload does not keep the log — and that is no loss: the feed and the running turn
  come from the database.
