# The room key goes into the path as is

The agent key is `-<number>:<stream>`. A colon in the address is encoded as `%3A`,
and the agent, reading the path, sees `-1%3A0` — the wrong shape, answer 400.

**Do not encode the key.** The characters of the key (minus, digits, colon) are safe
in a path.

```ts
// right
const url = `${config.agentUrl}/room/${key}?token=${encodeURIComponent(secret)}`;

// wrong: the agent gets -1%3A0 and answers 400
const url = `${config.agentUrl}/room/${encodeURIComponent(key)}?token=…`;
```

How it looked: our bridge sent `encodeURIComponent(conversationId)`, the agent
answered 400, an `error` frame went into the room, and the person saw "agent
unavailable" — although the agent was alive. The first turn through a stand-in agent
showed the cause at once.
