# cloudflare

How a clanker gets access to the Cloudflare platform, and what it hits there.

- [`gotcha-resource-names-are-lowercase-only`](gotcha-resource-names-are-lowercase-only.md) — worker and database names at Cloudflare are lowercase only.
- [`how-clanker-reaches-the-platform`](how-clanker-reaches-the-platform.md) — the company key on our proxy, four checks and running wrangler.
- [`gotcha-wrangler-login-lives-two-hours`](gotcha-wrangler-login-lives-two-hours.md) — the Cloudflare login lasts two hours and is renewed without a browser.
- [`gotcha-tunnel-port-is-closed`](gotcha-tunnel-port-is-closed.md) — the Cloudflare tunnel port is closed in our network; the pilot goes over Tailscale.
