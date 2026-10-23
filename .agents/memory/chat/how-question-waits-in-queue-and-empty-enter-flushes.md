# A question above a running turn waits in the queue; an empty Enter flushes the top one

The question queue lives in the panel (`apps/web/app/routes/[company]/sessions/[session]/page.tsx`),
not in the API. A question goes to the API only when its time comes, so the tail of the
queue never reaches the feed: rows the agent did not receive do not exist in `messages`.

## How it works

- The agent is busy — the question goes into the queue and is shown above the input, not
  in the feed.
- The agent is free — the question goes to the API at once.
- The turn ended (`done`, `failed`) — the queue moves on its own: the top one leaves
  without a human.
- An empty Enter with a non-empty queue sends the top one now. That is one request
  `POST /v1/companies/:id/conversations/:conversationId/messages` with `interrupt: true`:
  it stops the running turn and goes first. Five questions in the queue — five presses.

The queue belongs to the chat: open another one and it is empty. A page reload does not
keep the queue: it is a wait, not a record.

## The "agent is busy" flag

A running turn is one without an end. It is visible from two places:

- **the page journal** (`log.state.running`) — a turn started by this page;
- **the server feed** (`runningOfRaw(messages.at(-1)?.raw)`) — a page that arrived in the
  middle of a turn: its journal is empty, but the row of the running answer is already in
  the database.

The journal alone is not enough: a page reloaded in the middle of a turn would think the
agent is free and send the question straight past the queue.

## What to remember

- The API serializes turns per chat itself: `runTurn` chains each new turn after the earlier
  one in `pending`, keyed by company and chat. So a second POST from another panel waits
  instead of running alongside.
- The stop is held by `running` in `apps/api/src/agent.ts`, keyed the same way: one turn per
  chat, so one record, and `stopTurn` hits it. `stopTurn` is what `interrupt: true` calls.
- The panel queue does not survive a reload. A page stuck on "the agent seems busy" is cured
  by an empty Enter: it flushes the top question with `interrupt`, whatever the panel thinks
  about the turn.
