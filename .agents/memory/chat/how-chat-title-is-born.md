# How the chat title is born

The model names the chat from the first question. The name is born **next to the agent
turn**, not before and not after: `askAgent` starts `nameChat` and goes on at once.

- The model call is `packages/companies/src/llm-title.ts`, schema `chatTitleSchema`:
  up to three words, the language of the question, no quotes. A 30 second deadline.
- The invented name goes into the chat record (`conversations.title`) and out to the
  chat room as the `titled` event.
- The panel catches the event and changes the name right in the list, without a reload.
- A model failure does not touch the turn: the chat keeps its previous name.
- A chat is created with the company name; the model name replaces it.
