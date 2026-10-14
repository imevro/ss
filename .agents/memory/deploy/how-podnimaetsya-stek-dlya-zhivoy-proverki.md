# Как поднять стек для живой проверки

Стек поднимается тремя отдельными вещами, и очередь — из них отдельная.

## Что поднимается

| Что | Чем | Где живёт |
| --- | --- | --- |
| База ядра | `docker compose up -d db` | контейнер `ss-db`, порт хоста **5433**, `ss`/`ss_core` |
| Брокер очереди | `bun run broker` | **отдельный процесс**: `bunqueue start --tcp-port 6789 --http-port 6790` (`apps/worker/package.json`) |
| API и веб | `bun run dev` (turbo) | API на `8787` (`PORT`, `apps/api/src/env.ts:39`), веб на `5173` (умолчание vite; тот же порт в `docs/mvp.md:66` и `WEB_ORIGINS`, `apps/api/src/env.ts:36`) |

Брокер — не часть API: его слушают и постановщик задач (`apps/api/src/queue.ts`,
`BUNQUEUE_PORT`, по умолчанию `6789`), и воркер (`apps/worker/src/env.ts`). Пока он
не поднят, задача из API в очередь не встаёт.

Веб проксирует запросы в API сам: `/api` и `/v1` идут на `API_ORIGIN`, по умолчанию
`http://localhost:8787` (`apps/web/vite.config.ts`). Без `.env` в главном каталоге
служба не стартует — см. `gotcha-bez-faila-okruzheniya-v-glavnom-kataloge.md`.

## Что доказать

- API жив: `curl -s -o /dev/null -w '%{http_code}' http://localhost:8787/health` → `200`
  (`/health` в `apps/api/src/index.ts:29-40`).
- Вход проверяется: `http://localhost:8787/v1/me` без куки → `401`.
- Сторож входа работает: веб без куки на `/` и на `/<слаг>/sessions/<номер>` → `302`
  на вход (см. `do-storozh-vhoda-do-zaprosov.md`).

Порт `8787` проверку портит, если его держит вчерашний процесс:
`gotcha-staryi-process-derzhit-port.md`.

## База компании

База компании выписана в **том же кластере**, а не в отдельном сервере: имя выводится
из слага (`ss_<слаг>`, `packages/companies/src/plan.ts:151`), а адрес — из адреса
служебной базы (`packages/db/src/tenant.ts:50-59`). Поэтому смотреть её содержимое
можно прямо в ядровом контейнере:

```bash
docker exec -it ss-db psql -U ss -d ss_<слаг>
```
