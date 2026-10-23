# One bot token — one webhook: the token does not go on a chat-free box

A Telegram bot token has exactly one webhook. A new address **removes the previous one**
without an error. So the rooms box lives without a bot token: the deploy script sets the
webhook on every run and quietly steals updates from the archive worker on Cloudflare.

The danger is that nothing falls over: the bot just stays silent in the archive, and nobody
reads messages on the box. The cause is looked for in the bot, while it is in the last
deploy.

- the bot token stands only on the machine that runs the chats;
- setting the webhook is a separate step of a bot release, not every deploy.

**Check:** `getWebhookInfo` before and after the deploy — the address must be the same
(`https://tg.<zone>/b/<bot>`, `docs/bot-on-cloudflare.md`). Changed — updates were stolen.
