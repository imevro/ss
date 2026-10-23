# Section "chat on the page"

How the panel builds the feed and the work circles from events.

- [`how-feed-is-built-by-replay`](how-feed-is-built-by-replay.md) — the feed and the work circles are derived from the event log, not stored.
- [`ref-work-trace`](ref-work-trace.md) — the shape of a work circle: Trace while it runs, one short line after.
- [`how-chat-title-is-born`](how-chat-title-is-born.md) — the model names the chat from the first question, and the name comes into the panel.
- [`how-question-waits-in-queue-and-empty-enter-flushes`](how-question-waits-in-queue-and-empty-enter-flushes.md) — a question above a running turn waits in the panel queue; an empty Enter sends the top one now.
- [`gotcha-first-frame-cannot-read-motion-setting`](gotcha-first-frame-cannot-read-motion-setting.md) — the "reduce motion" setting is read by an effect, not by the first frame, or the markup diverges.
- [`gotcha-turn-write-overtakes-insert`](gotcha-turn-write-overtakes-insert.md) — turn write steps go through a queue, or the update overtakes the insert and the journal is lost.
