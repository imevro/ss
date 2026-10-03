---
name: ids-prefixed-nanoid
description: Every generated identifier is a prefixed nanoid (comp_, app_, msg_…) — never a uuid; one module mints them, foreign keys are text.
---

# Идентификаторы: nanoid с префиксом, никогда uuid

## Правило

Каждый идентификатор, который мы генерируем, — это **nanoid с префиксом таблицы**:

```
comp_V1StGXR8Z5jdHi6B-myT
app_9Fj2kLmQpR7sTuVwXyZ4a
msg_Kq3nB8vCzX1yWmE5RtY7u
```

`uuid`, `gen_random_uuid()`, `crypto.randomUUID()` и `defaultRandom()` в схеме —
**запрещены**. Одно исключение: идентификатор приходит извне (номер сообщения телеграма,
`external_id` провайдера входа) — его храним как есть, своей формы не придумываем.

## Почему

- **Префикс читается в логе и в URL.** `comp_…` сразу говорит, что за объект, без похода в базу.
- **Смешение таблиц ловится на границе.** Идентификатор одной сущности, переданный туда,
  где ждут другую, отвергается по префиксу — раньше, чем испортит данные.
- **UUID не нужен.** Он защищает от коллизий при генерации в разных узлах; у нас генерация
  в одном сервисе на одну базу, а `bigint`-ключи теряют префикс и предсказуемы.
- **Сортировка не по идентификатору.** Порядок задаёт время (`created_at`, `sent_at`);
  идентификатор для этого не приспособлен и не должен.

## Где генерировать

Одно место — `packages/db/src/ids.ts`. Таблицы берут оттуда функцию, свои алфавиты
и длины не заводят (кроме тестов, см. ниже).

```ts
import { customAlphabet } from 'nanoid';

export const ID_ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export const ID_LENGTH = 22;

export type IdKind =
  | 'company' | 'membership' | 'invite' | 'companyDatabase' | 'agentSession'
  | 'app' | 'auditLog' | 'flag' | 'chatBinding'
  | 'user' | 'session' | 'account' | 'verification'
  | 'message';

const PREFIX: Record<IdKind, string> = {
  company: 'comp', membership: 'memb', invite: 'inv', companyDatabase: 'cdb',
  agentSession: 'asess', app: 'app', auditLog: 'alog', flag: 'flag',
  chatBinding: 'cbind', user: 'usr', session: 'sess', account: 'acct',
  verification: 'verif', message: 'msg',
};

const mint = customAlphabet(ID_ALPHABET, ID_LENGTH);

/** Идентификатор с префиксом вида `comp_V1StGXR8Z5jdHi6B-myT`. */
export const newId = (kind: IdKind): string => `${PREFIX[kind]}_${mint()}`;
```

Префикс — три–пять строчных букв, от таблицы: `companies` → `comp`, `apps` → `app`.
Новая таблица без своей строки в `PREFIX` — ошибка типов, а не забытая генерация.

## Форма в схеме

Колонка — `text`, значение по умолчанию ставит наш генератор. Внешний ключ — тоже `text`:
типы обязаны совпадать, иначе drizzle `uuid()` даёт `uuid`-колонку, в которую наша строка
не влезет.

```ts
export const apps = pgTable('apps', {
  id: text('id').primaryKey().$defaultFn(() => newId('app')),
  companyId: text('company_id')
    .notNull()
    .references(() => companies.id, { onDelete: 'cascade' }),
  // …
});
```

Вставка без явного идентификатора — обычный путь: `db.insert(apps).values({ … })`.
Явный `newId('app')` нужен там, где значение требуется до вставки (например, в одной
транзакции с логом). Обычные записи не должны зависеть от порядка двух вставок.

## Внешние системы

- Идентификатор из телеграма, Google, Apple храним в своём поле (`external_id`, `account_id`)
  без префикса и без преобразований: чужая форма — чужая форма.
- Ключ беседы, склеенный из внешних частей (`tg:555`), — не наш идентификатор,
  префикс к нему не приписываем.
- Токен доступа (инвайт, токен миниаппа) — не идентификатор объекта, а секрет.
  Форму задаёт тот, кто проверяет: он и генерирует.

## Вход (better-auth)

better-auth пишет свои таблицы (`user`, `session`, `account`, `verification`) сам.
Его генератор переопределяем, чтобы строки были наши:

```ts
betterAuth({
  // …
  advanced: { database: { generateId: () => newId('user') } },
});
```

## Тесты и засев

Тест, которому нужен предсказуемый идентификатор, задаёт его явно строкой
(`comp_fixture_one`) и не трогает общий алфавит: длина и алфавит — общий контракт,
локальная подмена маскирует ошибку в продакшене.

## Проверка

```bash
# Ни одного uuid в генерации схемы и коде.
grep -rn "defaultRandom()\|randomUUID()" packages apps --include=*.ts | grep -v node_modules
# Все колонки идентификаторов — text и с префиксом.
grep -rn "\.primaryKey()" packages/db/src
```
