# The turn write updates before the row exists

The insert of the answer row (`openTurn`) and the first journal save (`writeTurn`) live
in one turn and used to run in parallel. The update got there first: the row did not
exist yet, `UPDATE` changed zero rows, and the database kept an empty journal. The feed
then showed the answer without work circles — and that stays invisible until the chat
is opened again.

Rule: **turn write steps go through a queue, one after another**, not `Promise.all`.
`record(step)` puts a step at the tail of the package queue, the tail is remembered, and
the end of the turn waits for the whole queue (`Promise.allSettled(writes)`).

Where: `askAgent` in `apps/api/src/agent.ts`, the `queue` object with a `tail` field.

How to check it has not come back: start a websocket stub, send a question, and read
`raw->'frames'` of the answer row a second later — the journal must not be empty.
