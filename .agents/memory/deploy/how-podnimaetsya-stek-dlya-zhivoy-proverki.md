# Как поднять стек для живой проверки

Стек поднимается двумя вещами: база и приложение. Очереди в нём нет.

## Что поднимается

| Что | Чем | Где живёт |
| --- | --- | --- |
| База ядра | `docker compose up -d db` | контейнер `ss-db`, порт хоста **5433**, `ss`/`ss_core` |
| API | `bun run dev` (turbo) | `8787` (`PORT`, `apps/api/src/env.ts:39`) |
| Веб | `bun run dev` (turbo) | `5173` (умолчание vite; тот же порт в `docs/mvp.md:66` и `WEB_ORIGINS`, `apps/api/src/env.ts:36`) |

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

## Где лежит переписка

В общей базе, рядом с компаниями: `conversations` и `messages`
(`packages/db/src/conversations.ts`). Своей базы у компании нет, поэтому и заходить
за ней в отдельную базу не нужно.
