# Как кланкер получает доступ к Cloudflare

Кланкер не держит ключ аккаунта Cloudflare. Он приходит с ключом компании вида `ss_cf_…` на наш
прокси `/v1/cloudflare/<путь как у Cloudflare>`; ключ аккаунта подставляет прокси. Ключи ведёт плагин
`@better-auth/api-key`, компания и разрешённые области лежат в метаданных ключа. Выдача и отзыв —
`POST/GET/DELETE /v1/companies/<номер>/keys`.

Прокси проверяет по порядку: ключ наш → аккаунт в пути наш → область из ключа → имя ресурса начинается
с начала имени компании строчными. Перечисления закрыты (`GET` на список скриптов, баз, пространств —
отказ), общая настройка `workers/subdomain` только на чтение. Разрешены пути `workers/scripts`,
`workers/services`, `workers/workers`, `workers/durable_objects/namespaces`, `d1/database`.

Готовые средства работают без правок, потому что ключ принимается и как `Authorization: Bearer`:

```sh
CLOUDFLARE_API_BASE_URL=https://<наш API>/v1/cloudflare \
CLOUDFLARE_API_TOKEN=<ключ компании> \
CLOUDFLARE_ACCOUNT_ID=<номер аккаунта> \
wrangler deploy
```

## Как ключ попадает на коробку кланкера (сделано 2026-10-05)

Ключ пилотной компании `.solutions` (`comp_Tp62Im4Kwj1zAawW3A6gVh`) выдан на год и лежит:

- на ноутбуке — `~/.ss-secrets/cloudflare-pilot.env`;
- на коробке `gentic-ss` — `/data/secrets/cloudflare.env` (права 600), вне рабочего дерева.

Адрес входа в пилоте — ноутбук в сети Tailscale: `http://mac-erodionov:8787/v1/cloudflare`
(адрес `100.76.130.8`). Публичного адреса у нашего API нет: имя `ss.erodionov.com` не заведено,
приложения на Fly тоже нет, а Cloudflare-туннель с этой сети не поднимается (см.
`gotcha-port-tunnelya-zakryt.md`). Пилот работает, пока ноутбук не спит.

Подсказка кланкеру лежит в его собственном дереве: `.agents/memory/deploy/cloudflare-dostup.md`
на коробке (в нашем репозитории не дублируется).

Проверено 2026-10-05 на нашем стенде и с коробки: выкладка воркера (в том числе `bun x wrangler
deploy` из коробки — бот ответил 200), чтение, удаление, `wrangler secret put`, создание базы D1,
запрос по номеру, отказ на чужое имя, отказ на чужую область, отзыв ключа.
