---
name: web-page-title-composer
description: ONE document-title composer for every route — segments ordered specific → general, brand last, em-dash separator, blanks dropped; tab subentities derive from the same tab-definition source as the nav.
---

# One page-title composer, no per-route drift

The SINGLE document `<title>` composer for every route is:

```ts
pageTitle(segments: ReadonlyArray<string | null | undefined>): string
```

## How it works

- Orders segments SPECIFIC → GENERAL, appends the brand last.
- Separator is the em-dash ` — ` (a named constant; brand a named constant
  too).
- Blank / null / undefined segments are filtered (trimmed), so a missing
  subentity collapses cleanly:

```
pageTitle(['Activity', 'Westside', 'Admin'])  => "Activity — Westside — Admin — Brand"
pageTitle([null, 'Westside', 'Admin'])        => "Westside — Admin — Brand"
pageTitle([])                                 => "Brand"
```

## Why one composer

Many routes previously had no `meta()` at all and fell through to the root's
brand floor. The composer fills EVERY route with a consistent title order. One
composer = titles cannot drift per-route.

Internal surfaces (admin, auth, onboarding) wrap the composed title in
`noindexMeta(...)` — `meta = () => noindexMeta(pageTitle([…]))`.

## KEY INVARIANT: title and tab nav never drift

Tab-bearing pages derive the active-tab title subentity from the SAME
tab-definition source that renders the visible nav:

- Tab definitions live in one promoted module const (`TABS: TabDef[]`); the
  nav renders `TABS.filter(t => t.available)`.
- The title subentity comes from a lookup over the SAME list by the active tab
  id, not a second hand-written map.
- The default tab yields a `null` subentity, which `pageTitle` collapses out —
  no redundant default label in the default title.

## Router note

The router renders only the deepest matched route's `meta()`, so a leaf that
exports `meta()` fully replaces root's brand floor — which is exactly why every
leaf needs its own composed title.
