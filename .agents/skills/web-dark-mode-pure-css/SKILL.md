---
name: web-dark-mode-pure-css
description: "Pure-CSS dark mode via prefers-color-scheme — token swap in a media-query block, dark: variant bound to the same query, color-scheme meta, and the YAGNI toggle path."
---

# Dark mode — pure CSS, automatic

Dark mode is AUTOMATIC via `prefers-color-scheme`. No JS, no toggle, no
localStorage, no theme provider. If the visitor's OS is dark, the site is
dark; otherwise light. The design is a palette swap, and semantic tokens make
it happen at every use site with zero per-component styling.

## Mechanism (all of it, in the global stylesheet)

1. `:root` holds the light tokens plus `color-scheme: light`.
2. `@media (prefers-color-scheme: dark) { :root { … } }` mirrors the block
   with dark tokens plus `color-scheme: dark`.
3. Bind the CSS `dark:` variant to the SAME media query
   (`@custom-variant dark (@media (prefers-color-scheme: dark));`), so the few
   `dark:` utilities in component primitives fire on the same condition.

That's the whole machinery. Components that use semantic tokens
(`bg-background`, `text-foreground`, `border-border`, `text-accent`, …) flip
automatically.

## The one head hint

Emit `<meta name="color-scheme" content="light dark" />` in the document
`<head>` — BEFORE the stylesheet parses the browser picks the right
scrollbar/native-form-control colors on first paint. Without it: a split-
second flash of light chrome over a dark page (or vice versa).

## Dark-mode palette adjustments

Only non-trivial token change: the interactive accent is lightened slightly in
dark for contrast on the dark background. Everything else is either inverted
(background/foreground) or constant.

### Give the palette semantic ROLES, not brand names

A palette named after brand colors (`navy`, `white`, `grey-200`) breaks the
moment the theme flips: one name is asked to be two different things. Split the
roles that conflict:

- **Page background vs surface** — separate tokens. In light mode both may be
  `#FFFFFF`; in dark the surface must lift off the page (cards, sticky bars,
  chips), or every panel merges into one flat sheet.
- **Strong text vs strong block.** A dark brand color is usually BOTH the
  heading color on light and the fill of a dark banner. On a dark page the
  heading must become near-white while the banner must stay dark — the same
  token cannot do both. Two tokens: `--strong` (text) and `--band-bg` (fill),
  with `--band-fg` for text on the fill.
- **Accent text vs accent fill.** A saturated accent that reads on white is too
  dark on a dark background, but lightening it breaks white text sitting on it.
  Two tokens: `--accent` (text/borders on the background) and `--accent-solid`
  (a fill that keeps white text legible).
- **Selected/active fill.** Light mode often uses the dark brand color as the
  "on" fill (selected chip, active tab). On a dark surface that fill vanishes —
  switch the same role to the accent fill in dark. One token, `--active-bg`,
  solves every toggle at once.

### Things that must NOT be themed

Anything drawn on top of **photographic imagery** — caption badges, rank
numbers, action buttons over a thumbnail. Those sit on an unknown background,
not on the page surface, so keep them as fixed literals. Theming them makes
them vanish over photos that happen to match the new surface color.

### Measure the steps, don't eyeball them

Body text contrast is easy (it's either readable or not). The failures are the
**structural** steps that look fine in isolation and flat in context:

- band vs page, surface vs page — compute the contrast ratio between the two
  backgrounds; a near-1.0 ratio means the block is invisible. Aim for a clearly
  perceptible step (≈1.3+ for large blocks) and lean on hairline borders for
  the rest.
- muted/secondary text on the dark background — keep it above ~4.5.
- text on the active fill, and on the accent fill.

```js
const L = (c) => { const v = c.split(',').map(Number).map(x => { x/=255;
  return x <= 0.03928 ? x/12.92 : Math.pow((x+0.055)/1.055, 2.4); });
  return 0.2126*v[0] + 0.7152*v[1] + 0.0722*v[2]; };
const ratio = (a,b) => { const [x,y] = [L(a),L(b)].sort((p,q) => q-p);
  return ((x+0.05)/(y+0.05)).toFixed(2); };
```

Screenshot review will tell you "the banner is distinguishable, though the
contrast is subtle" and nothing more — it cannot tell you a token is missing.

## Legacy hazard

Always-dark "islands" (hardcoded dark literals on a light page) collapse into
the body when auto-dark mode makes the page background dark too. New code:
semantic tokens everywhere; never hardcode scheme-specific literals.

## Previewing both schemes in dev

1. OS-level appearance setting — CSS re-evaluates live, no refresh.
2. DevTools → Rendering → "Emulate CSS media feature prefers-color-scheme".
3. Brute force for isolating a token bug: inject a `<style>:root { … }</style>`
   override into `<head>`.

## Adding a user-facing toggle later (YAGNI now)

Not wired until asked. The minimal later change:

1. Widen the `dark` variant from a bare media query to the block form — class
   OR media, with an explicit light opt-out (`.dark`/`.light` on a root
   element).
2. Duplicate the dark token block under a `.dark { … }` rule beside the media
   one — same tokens, two triggers.
3. A tiny client script toggles the class and persists it; set the class
   server-side from a cookie to avoid FOUC.

The token VALUES already handle both modes — only the trigger selector needs
widening.

## Legacy hazard

Always-dark "islands" (hardcoded dark literals on a light page) collapse into
the body when auto-dark mode makes the page background dark too. New code:
semantic tokens everywhere; never hardcode scheme-specific literals.
