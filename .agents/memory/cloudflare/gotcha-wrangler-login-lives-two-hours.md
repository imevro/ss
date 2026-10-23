# The Cloudflare login lives two hours

The key `wrangler login` puts into `~/Library/Preferences/.wrangler/config/default.toml`
(`oauth_token`) is good for about two hours. Measured: renewed at 17:42, by 19:38 the
platform answered `401 Authentication error`, code `10000`. The proxy was working
correctly — the filter passed the request, and Cloudflare answered.

It is renewed without a browser while the `refresh_token` in the same file is alive:

```sh
wrangler whoami                       # renews and rewrites oauth_token itself
grep -o 'oauth_token = "[^"]*"' ~/Library/Preferences/.wrangler/config/default.toml | cut -d'"' -f2
```

Then the key must be moved into `.env` (`CLOUDFLARE_API_TOKEN`) and the API restarted:
settings are read at start. If `whoami` answers `Invalid access token [code: 9109]`, refresh
did not help — `wrangler login` is needed again (opens a browser).

This does not work for production: there the account key is a separate key from the
Cloudflare dashboard (My Profile → API Tokens) with the needed rights, not our `wrangler`
login.

**Done 2026-10-05:** such a key was created (rights `Account → Workers Scripts → Edit`,
`Account → D1 → Edit`) and stands in the proxy `.env` as `CLOUDFLARE_API_TOKEN`; a copy is
at `~/.ss-secrets/cloudflare-account-token.env`. The `wrangler whoami` dance is now needed
only for stand checks.
