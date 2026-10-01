---
name: react-nextjs-file-conventions
description: Folder-as-route file conventions borrowed from the Next.js App Router — page.tsx, layout.tsx, [param], (group), _private — used in any React framework through one explicit route table.
---

# Next-like file conventions, framework-agnostic

Use the App Router file layout in every React app, no matter which router
renders it. The convention is about where files live, not about who derives
routes from the filesystem: any React developer reads the tree without docs.

## Special filenames — and nothing else

- `page.tsx` — the route component.
- `layout.tsx` — persistent shell (nav, header, section chrome) wrapping nested routes.
- `route.ts` — non-UI handler (endpoint, loader, action) for that path.
- `not-found.tsx`, `error.tsx`, `loading.tsx` — boundary components for that segment.
- Every other file in the folder is a colocated module, never a route. That
  freedom is the point: helpers and sub-components sit next to the page that
  owns them.

## Path syntax

- `[id]` dynamic segment → a param named exactly `id`.
- `[...slug]` catch-all.
- `(group)` route group — groups routes for a shared layout or scope,
  contributes no URL segment.
- `_folder` private folder — excluded from routing even where the router walks
  the filesystem.

One shape everywhere: `src/routes/<section>/<page>/page.tsx`. A page that gains
siblings becomes a folder; never mix `name.tsx` and `name/page.tsx` for the same
kind of thing.

## Enforcement when the framework does not read the filesystem

A Vite SPA, React Router app, TanStack Router app, desktop shell or embedded
webview does not map paths to files, so keep the mapping mechanical and checked:

- One explicit route table (`routes.ts`) is the only place URLs are declared:
  `routes/users/[id]/page.tsx` ↔ `/users/:id`. Components never hardcode paths.
- Param names are identical in the folder name and the route pattern (one name
  across representations).
- A test walks the route folder and asserts each `page.tsx` has exactly one
  table entry and each table entry has exactly one `page.tsx`. It catches a
  route added on disk but not wired, and a table entry pointing at a deleted
  page.
- Colocated non-page modules are safe precisely because the table, not the
  filesystem, decides what is a route.

## Leave behind what only Next provides

Filesystem code splitting, parallel-route slots and `default.tsx`, `template.tsx`,
per-method route-handler exports, server actions: implement them only if the
framework offers an equivalent. Copy the naming, not the magic.
