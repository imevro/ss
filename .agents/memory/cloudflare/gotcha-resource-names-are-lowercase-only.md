# Cloudflare resource names are lowercase only

A company number is a prefixed nanoid with mixed case (`comp_o1jpI99oJpSVVR5`). If a worker
name is built straight from it (`comp-o1jpI99oJpSVVR5-bot-demo`), the platform answers
`400`, code `10016`: "Invalid Worker name. Ensure the name is lowercase, alphanumeric…".
The worker is not created, and the mistake looks like the proxy filter being at fault.

So the company name start is lowercased **in one place** — where the name start is
produced (`apps/api/src/cloudflare.ts`, `<company number>.replace('_','-').toLowerCase()`)
— and the rule is stated to the clanker in the route description and in `/openapi`.

- The name filter and the rule for the clanker must take the case from one expression,
  otherwise a name of its own stops matching.
- Same for D1: database names are lowercase.
