---
name: react-url-state-over-local-state
description: Prefer routing and URL query params over React local state, and use nuqs for typed search-param state — deep links, back button and SSR without state syncing.
---

# Route and URL state before React local state

Pick the narrowest place that can hold the state, in this order:

1. **Path** — identity: which resource or screen. `/invoices/:id`, `/settings/profile`.
2. **Query params** — refinement of that screen: filters, `q`, `sort`, `page`, tab/view mode, expanded id, open dialog.
3. **Local `useState`** — ephemeral only: uncommitted draft text, hover, focus, drag offset, animation, optimistic pending flag.
4. **Global store / context** — shared state that is genuinely not URL-able: session, cached server data, socket state.
5. **`localStorage`** — durable per-user preference that must not be shareable (collapsed sidebar). Anything needed during SSR belongs in a cookie.

Local state loses on all four counts: refresh resets it, the back button skips
it, a link cannot reproduce it, and a second reader forces an effect-based sync
bridge — two sources of truth for one value.

## Routing instead of local state

- `const [view, setView] = useState('inbox')` → two routes, `/inbox` and `/archive`.
- `const [selectedId, setSelectedId] = useState(null)` → `/items/:id` when the
  item is the screen, `?item=<id>` when the list must stay behind it.
- `const [tab, setTab] = useState('billing')` → a path segment when the tabs are
  distinct content (`/settings/billing`), a query param when they are views of
  one resource.
- Modals and drawers open from the URL (`/items/new`, `?new=1`) so a refresh
  keeps them open and back closes them.

## Query params instead of local state

Anything the user would paste to a colleague, and anything the server can
render, is a query param: filters, search text, sort, pagination, density.

Use **nuqs** (v2) rather than hand-rolled `URLSearchParams` state:

- Adapter once at the root, per framework: `nuqs/adapters/next/app` (App Router
  root `layout.tsx`), `nuqs/adapters/next/pages`, `nuqs/adapters/react-router/v7`
  (also `/v6`, `/v8`), `nuqs/adapters/tanstack-router`, `nuqs/adapters/remix`, or
  `nuqs/adapters/react` for a plain SPA.
- `useQueryState('page', parseAsIndex.withDefault(0))` → `[value, setValue]` with
  an already-parsed, validated value; an invalid param falls back to the default
  instead of throwing.
- `useQueryStates({ q: parseAsString.withDefault(''), sort: parseAsStringLiteral(['new', 'top']).withDefault('new') })`
  when several params change together — one URL update, no torn intermediate state.
- `parseAsIndex` is 1-based in the URL, 0-based in code — kills the scattered `page - 1` arithmetic.
- Parsers: `parseAsString`, `parseAsInteger`, `parseAsIndex`, `parseAsFloat`,
  `parseAsBoolean`, `parseAsIsoDate`, `parseAsIsoDateTime`, `parseAsTimestamp`,
  `parseAsHex`, `parseAsStringEnum`, `parseAsStringLiteral`, `parseAsNumberLiteral`,
  `parseAsArrayOf`, `parseAsNativeArrayOf`, `parseAsJson(validatorOrStandardSchema)`.
- Options per hook or chained on a parser via `.withOptions(...)`: `history: 'push'`
  when the change deserves a back-button entry, `scroll: false`, `clearOnDefault`
  (on by default — a default value leaves the URL clean), `limitUrlUpdates: throttle(300)`
  so typing does not flood history, `shallow: false` to force a server round trip,
  `urlKeys` for short URL keys while code keeps readable names.
- Server side: `createSearchParamsCache(parsers)` in server components and
  loaders, `createSerializer(parsers)` to build hrefs from partial state.
- Tests: wrap with `withNuqsTestingAdapter({ searchParams: '?q=x' })` and assert
  on `onUrlUpdate`.

## One source of truth

- The URL is the store: components read and write it, never mirror it into state.
- No `useEffect(() => setX(param), [param])` bridges, no two holders of one value.
- Unknown or invalid param values normalize to the default (noise from a stale
  shared link is dropped, not surfaced as an error screen).
- Several components reading the same params share one hook call or the server
  cache — do not duplicate the parser map.
