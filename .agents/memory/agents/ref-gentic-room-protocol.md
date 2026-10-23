# Agent room: address, key and frames

The agent is a separate service. One connection per question: open, ask, wait for
the end, close.

## Door

```
GET <AGENT_URL>/room/<key>?token=<AGENT_SECRET>
```

- **Key** — `-<number>:<stream>`, strictly `^-\d+:\d+$`. `-1:0`, `-2:0` and so on work.
  Any other shape is refused with 400.
- **Password** is compared in constant time. A wrong one gives 403.
- **A request without a websocket upgrade** gives 426.

The number in the key is the agent's own. It is also his session number: connections
with one key share one memory.

## Frames

Ours to the agent:

| Frame | Meaning |
| --- | --- |
| `{kind:'ask', text}` | The question. |
| `{kind:'stop'}` | Stop the turn. |
| `{kind:'close'}` | Close the room. |

Agent to us:

| Frame | Meaning |
| --- | --- |
| `{kind:'started'}` | The turn started. |
| `{kind:'chunk', text}` | A piece of the answer. |
| `{kind:'live', calls, thinking}` | The work: the **whole** list of called tools and the flag "the agent thinks". The list replaces the previous one, it does not add to it. |
| `{kind:'thought'}` | One finished thought. They are counted by the number of frames. |
| `{kind:'done'}` | The turn ended. |
| `{kind:'failed', reason}` | The turn broke. |

`calls` is a list of `{name, intent}` pairs: the tool name and the intent it was
called for (omp's `i`). No intent — `intent` carries the name. The list is reset on a
new question: one key runs one turn at a time.

## What to remember

- A stopped turn gives only `done`: frames cannot tell a stop from a full answer.
  The text has already gone out in chunks and is not repeated.
- A room without a question costs nothing: the session is ready, there is no work.
