# Organization invitations require a verified email

The `organization` plugin accepts an invitation only from a person with a verified address:
`acceptInvitation`, `getInvitation` and `rejectInvitation` refuse if the session's
`user.emailVerified` is empty. The cause is that we set our own id generator
(`advanced.database.generateId`), which makes the plugin lose the built-in opacity of the
invitation id and demand verification.

We do not verify email (`docs/mvp.md`: mail is postponed). So the plugin settings carry
`requireEmailVerificationOnInvitation: false` — otherwise invitations could not be accepted.

If we ever turn email verification on, this setting can go.
