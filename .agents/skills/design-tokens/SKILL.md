---
name: design-tokens
description: Semantic design tokens (color, borders, radius, spacing, motion) — role-named constants consumed everywhere so theming flips every use site; OKLCH is the color format, not the point.
---

# Tokens — palette, borders, radius, motion

## Color tokens

Define SEMANTIC tokens only (role, not hue), with OKLCH values for both
schemes. Components consume tokens exclusively — never raw colors — so dark
mode flips every use site automatically.

| Token | Role |
|-------|------|
| `background` / `foreground` | page bg / text (inverted between schemes) |
| `primary` | brand neutral accent: active tabs, rings |
| `accent` | interactive color: links, CTAs (lightened in dark for contrast) |
| `secondary` / `muted` | off-white/gray section backgrounds |
| `muted-foreground` | subdued text, numbers, metadata |
| `border` | thin dividers — `oklch(... / 30%)` light, low-opacity white in dark |

Brand extension colors (warm highlight, light accent-tint backgrounds) get
their own tokens too. Export hex equivalents only when a native port needs
literal values.

## Borders & dividers

- Thin divider: `border-b border-border` (~30% opacity) between list items.
- Dark-section divider: low-opacity white border.
- Dashed muted separators only as decorative accents.

## Radius

A small `--radius-*` ladder (sm/md/lg/xl) plus `rounded-full` for pills and
avatars. Pick the smallest radius the shape needs — pills are the only
fully-round treatment.

## Layout

Generous vertical rhythm (4–8rem section padding); dominant two-column layout
(sidebar heading/description + content list/grid); full-bleed imagery for
heroes; a max content width with side padding.

## Transitions & feedback animation

- House timings: bg color 500ms ease; fades 300ms ease-in-out; interactive
  200ms ease; layout 1000ms ease.
- "Value landed" feedback (cell/field transitions empty → filled after a live
  push): a brief keyframe flash in the highlight tone, ~1s, defined once in
  the global stylesheet and applied by a CSS class.
- Gate the flash behind `@media (prefers-reduced-motion: no-preference)`.
- Never flash on initial load: seed the diff baseline silently on first
  render; flash only on subsequent changes.
