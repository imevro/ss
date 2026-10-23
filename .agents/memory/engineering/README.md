# Engineering rules

How we write and what we decide again.

- [`do-take-the-most-of-the-stack`](do-take-the-most-of-the-stack.md) — take the most of the chosen stack; write our own only where nothing exists.
- [`how-companies-live-on-organization-plugin`](how-companies-live-on-organization-plugin.md) — companies, members and invitations are run by the better-auth organization plugin.
- [`gotcha-invitation-requires-verified-email`](gotcha-invitation-requires-verified-email.md) — an invitation is accepted only with a verified email; our setting is off.
- [`gotcha-organization-fields-match-by-name`](gotcha-organization-fields-match-by-name.md) — organization tables and fields must carry the plugin's names.
- [`do-sign-in-guard-before-data`](do-sign-in-guard-before-data.md) — the loader asks "who signed in" before any data request, or the redirect to sign-in never fires.
- [`do-time-to-iso-at-the-boundary`](do-time-to-iso-at-the-boundary.md) — time is converted to ISO once, at the API exit.
- [`do-one-sessions-segment-for-chats-and-miniapps`](do-one-sessions-segment-for-chats-and-miniapps.md) — chats and miniapps open under one address segment, `sessions`.
- [`do-onboarding-three-questions`](do-onboarding-three-questions.md) — onboarding: three questions, no model, no database.
- [`do-required-step-question-checked-in-api`](do-required-step-question-checked-in-api.md) — a required step question is required at the API entry too, or a company is created without an answer.
- [`do-agent-line-does-not-break-the-answer`](do-agent-line-does-not-break-the-answer.md) — the agent line from the error stream goes as a `log` frame; `failed` closes the turn and is wrong for a remark.
- [`do-company-without-a-database`](do-company-without-a-database.md) — a company is a name, people and gentic sessions; it has no database of its own.
