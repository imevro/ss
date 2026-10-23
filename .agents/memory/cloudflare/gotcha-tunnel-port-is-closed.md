# The Cloudflare tunnel port is closed in our network

Cloudflare Tunnel does not come up from the laptop: the connection to the edge breaks at
the TLS handshake. Neither `quic` (UDP) nor `http2` (TCP) — the same:

```
ERR Unable to establish connection with Cloudflare edge error="TLS handshake with edge error: EOF"
ERR failed to dial to edge with quic: timeout: no recent network activity
```

Yet the TCP port answers (`nc -vz 198.41.192.7 7844` — success), and from another network
the same tunnel lives: from the `gentic-ss` box (Fly, iad region) `cloudflared` connected on
the first try and registered three `Registered tunnel connection` connections. Conclusion:
it is not keys and not settings being cut, it is our provider cutting port 7844 to the
Cloudflare edges.

What that means in practice:

- the tunnel must be raised not from the laptop but on a machine that reaches the edges
  (then it must run the service itself too, or the tunnel leads into nothing);
- or do not use 7844 at all: the pilot went over Tailscale, which uses plain 443.

Traces of the attempt are removed: tunnel `ss-api` deleted, the `ss.erodionov.com` record
taken off the zone (removing the record needed the key from `~/.cloudflared/cert.pem` —
`ARGO TUNNEL TOKEN`, which has rights on the zone DNS, unlike the `wrangler` login key).
