---
name: web-seo-meta-helper
description: All SEO/meta strings, robots directives, og/twitter blocks and schema.org builders live in ONE leaf module; routes import helpers, never inline tag arrays. Internal pages = noindex, public pages = full contract.
---

# SEO — one leaf module, no per-route drift

All web SEO/meta strings, robots directives, og/twitter blocks, and
schema.org node shapes live in ONE leaf module (`app/lib/seo.ts`). Routes
import helpers from it; they never inline tag arrays. Inlining a whole
contract in one page is how the constant drifts.

## What the module exports

- Locale constants: the document/schema locale public, the og-variant
  (underscore form) private.
- `ROBOTS_INDEX` — the indexable directive (`index, follow,
  max-image-preview:large, …`). Internal pages never use it.
- `siteName(scope)` — the per-scope brand string used as `og:site_name` and in
  the WebSite/Organization `name`.
- `originOf(request)` — `new URL(request.url).origin`, the single base every
  loader uses for canonical + og:url. Loaders return `origin` so `meta()` can
  read it.
- `pageTitle(segments)` — the SINGLE document-title composer.
- `noindexMeta(title)` → `[{title}, {name:'robots', content:'noindex,
  nofollow'}]` — the ONLY head tags internal routes emit.
- `ogTwitterTags(input)` — the shared og: + twitter: block; image/alt/modified
  tags append only when present (no blank tags for pages without media).
- JSON-LD node builders for the site/organization shapes.

## Two rules the module encodes

**1. Internal pages are noindex; public pages get the full SEO + JSON-LD.**
Admin/auth/onboarding all export `meta = () => noindexMeta('…')`. Public
routes compose `ROBOTS_INDEX` + the og/twitter block + the LD builders.

**2. Shared JSON-LD nodes are declared ONCE, on the entry page.** Every other
page's `@graph` REFERENCES the node by `origin + '#anchor'` — the node is not
re-asserted per page. Builders return the node WITHOUT `@context` so it can sit
inside a `@graph`; the standalone entry caller spreads `@context` in. All
sites agree on the shape because it is built in one place.

## Meta cascade

The root layout exports a brand baseline `meta()`. The router renders ONLY the
deepest matched route's `meta()`, so any leaf that exports one fully replaces
root's — root is purely the floor that guarantees no document is ever untitled
(a route with no `meta()`). A leaf `meta()` whose loader threw (`!data`)
should still return the brand title/description and skip only the URL-derived
tags it cannot build.
