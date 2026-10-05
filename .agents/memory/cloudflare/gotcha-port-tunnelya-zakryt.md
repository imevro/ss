# Порт Cloudflare-туннеля в нашей сети закрыт

Cloudflare Tunnel с ноутбука не поднимается: соединение до узла обрывается на рукопожатии TLS.
Ни `quic` (UDP), ни `http2` (TCP) — одинаково:

```
ERR Unable to establish connection with Cloudflare edge error="TLS handshake with edge error: EOF"
ERR failed to dial to edge with quic: timeout: no recent network activity
```

При этом TCP-порт отвечает (`nc -vz 198.41.192.7 7844` — успех), а с другой сети тот же туннель
живёт: с коробки `gentic-ss` (Fly, регион iad) `cloudflared` подключился с первой попытки и завёл три
соединения `Registered tunnel connection`. Вывод: режут не ключи и не настройки, а наш провайдер —
порт 7844 до узлов Cloudflare.

Что это значит на практике:

- туннель нужно поднимать не с ноутбука, а на машине, которая к узлам ходит (тогда она должна и
  держать сам сервис, иначе туннель ведёт в пустоту);
- либо не использовать 7844 вообще: пилот пошёл через Tailscale, он ходит обычным 443.

Следы попытки убраны: туннель `ss-api` удалён, запись `ss.erodionov.com` в зоне снята (для снятия
записи пригодился ключ из `~/.cloudflared/cert.pem` — `ARGO TUNNEL TOKEN`, у него есть права на DNS
зоны, в отличие от ключа входа `wrangler`).
