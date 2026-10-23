# How a clanker gets access to Cloudflare

A clanker holds no Cloudflare account key. It comes with a company key of the shape
`ss_cf_…` to our proxy `/v1/cloudflare/<path as at Cloudflare>`; the proxy substitutes the
account key. Keys are run by the `@better-auth/api-key` plugin, the company and the allowed
scopes live in the key metadata. Issue and revoke —
`POST/GET/DELETE /v1/companies/<number>/keys`.

The proxy checks in order: our key → the key belongs to a person who is still a member of
that company → the account in the path is ours → the scope from the key → the resource name
starts with the company name start in lowercase. Listings are closed (`GET` on the list of
scripts, databases, namespaces — refused), the shared `workers/subdomain` setting is read
only. Allowed paths: `workers/scripts`, `workers/services`, `workers/workers`,
`workers/durable_objects/namespaces`, `d1/database`, `r2/buckets`, `workflows`.

The account key on the platform side must carry the permission of each area it serves: the
proxy lets a path through, but Cloudflare refuses with its own `Authentication error` when the
token lacks the grant. R2 is its own permission group (`Workers R2 Storage`); Workers
permissions cover Workflows.

A key outlives the person's membership on purpose: the membership is checked on every
request, so leaving the company cuts access at once, not when the key expires.

Ready-made tools work without patches, because the key is accepted as
`Authorization: Bearer` too:

```sh
CLOUDFLARE_API_BASE_URL=https://<our API>/v1/cloudflare \
CLOUDFLARE_API_TOKEN=<company key> \
CLOUDFLARE_ACCOUNT_ID=<account number> \
wrangler deploy
```

## How the key lands on a clanker box (done 2026-10-05)

The pilot company `.solutions` key (a number of the shape `comp_…`) is issued for a year and
lives:

- on the laptop — `~/.ss-secrets/cloudflare-pilot.env`;
- on the `gentic-ss` box — `/data/secrets/cloudflare.env` (mode 600), outside the working
  tree.

The entry address is our domain: `https://ss.erodionov.com/_api/v1/cloudflare`. The
application lives on the `bychefs-vps` ep-infra box (152.53.133.232), Caddy strips the
`/_api` prefix before the API. The laptop was the address only in the pilot, while there was
no public address; it is not needed now — for the clanker only the address prefix changes.

The hint for the clanker lies in its own tree: `.agents/memory/deploy/cloudflare-dostup.md`
on the box (not duplicated in our repository).

Checked 2026-10-05 on our stand and from the box: worker deploy (including
`bun x wrangler deploy` from the box — the bot answered 200), read, delete,
`wrangler secret put`, D1 database creation, query by number, refusal on a foreign name,
refusal on a foreign scope, key revocation.

Checked 2026-10-23 on the production domain: `/_api/health` — 200, `/_api/v1/me` without a
cookie — 401, `/_api/v1/cloudflare/accounts` without a company key — 403 "foreign key"
(not 503, so the account key is present on the box). The production account key lies not in
the pilot file but in sops: secret `SS_CLOUDFLARE_API_TOKEN` (ep-infra,
`nixos/secrets/ss.yaml`) is assembled into `/run/secrets/rendered/ss-env` as
`CLOUDFLARE_API_TOKEN`.
