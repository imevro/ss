# The chat is ours, the agent key is his

The chat number is ours (`chat_…`). The agent room key is his (`-<number>:0`), and it
must stay the same for the whole life of the chat: otherwise the agent loses memory
between questions.

The link is held by the `agent_sessions` table in the core database: `company_id`,
`conversation_id`, `gentic_key`. The key number is taken like this:

```
take the row by (company, chat) — if it exists, return its key;
otherwise: number = next value of the database sequence;
           key = `-<number>:0`; write it, absorb a repeated insert.
```

The number comes from a sequence, not from counting rows: counting rows gives two
simultaneous requests one number. The number grows and is never reused: a vanished
chat must not give its number to a new one — the agent keeps memory by number.

**What not to do:** do not send the agent our chat number. The agent accepts only
`-<number>:<stream>`, and the meaning of the number is his own.

**Check:** ask the agent twice in one chat, the second time ask it to repeat the first
answer. If the key changes, the agent says "we have not met yet".
