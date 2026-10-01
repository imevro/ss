---
name: design-no-cards-no-skeletons
description: The two hard design laws — NO CARDS (no bordered/shadowed boxes; hairline dividers + typography) and NO SKELETONS (no pulsing placeholders; stream real content or quiet captions). Apply everywhere, web and native.
---

# NO CARDS. NO SKELETONS.

Two hard laws that apply everywhere — public site, admin, native.

## NO CARDS

Never wrap content in bordered or shadowed rectangular containers. No card
components, no `border rounded-* p-*` grouping boxes, no dashed "add" tiles
that read as cards.

Separate content with whitespace, typography, alignment, and thin hairline
dividers. Row lists use a thin bottom border between items. When you're
tempted to draw a box around a group of things: put an eyebrow label above
them and a divider below instead.

## NO SKELETONS

Never render skeleton placeholders (pulsing gray rectangles) during loading.
If data isn't ready:

- show nothing,
- show a quiet italic muted caption,
- or stream the page with suspense boundaries that swap in real content.

Skeletons imply dashboards; the product is a document/book. The same law
covers remote images on native: prefetch images when the screen opens, reserve
the slot with transparent/empty state, and swap in the resolved image — never a
gray block.

## Row layout details (keep clean)

- One visual line per dense row. Each side of a two-column row is a single
  logical text node inside `line-clamp-1` — LEFT (time · entity · explanation)
  | RIGHT (meta · action · duration · cost).
- Join row children with a literal `{' · '}` in JSX. Separate `<span>`
  siblings on different JSX lines break text selection: copying a row copies
  fragments line by line. Don't regress when extending a row.
- Metadata column is dimmed; a value stands out only when it carries meaning
  (e.g. red under a threshold). No decorative per-item identity colors.
- Debug/expandable detail: a native `<button>` toggle that is hidden by
  default — not an always-visible accordion.
- Relative timestamps via a tiny local helper (`now`, `5s`, `12m`, `3h`,
  `2d`, `1mo`, `1y`) — no date library needed.
