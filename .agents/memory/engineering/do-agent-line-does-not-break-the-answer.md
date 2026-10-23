# The agent line goes as a `log` frame, not as `failed`

A failure reason from the agent error stream reaches the person as its own `log` frame.
`failed` is wrong for this: it closes the turn, clears the work circle and cuts off the
receiving of answer chunks.

The path: room → `ClientEvent` → `ChatEvent` → fold → a quiet line under the feed. The room
frame carries `line` (`apps/api/src/contracts.ts`, `packages/types/src/rooms.ts`); the chat
event carries the same string as `text`, which is what the fold reads
(`apps/web/app/lib/live.ts` → `apps/web/app/lib/chat-state.ts`, the `note` field). Display is
the session page; clearing is a new question.

**Check:** `chat-state.test.ts`, the test "the agent line lives until the next question, not
until the end of the session" — after `log` the line is visible, after `ask` it is empty; in a
live turn the remark does not extinguish the answer text.
