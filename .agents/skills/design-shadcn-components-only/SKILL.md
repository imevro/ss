---
name: design-shadcn-components-only
description: "shadcn/ui is the whole component vocabulary — use the installed set, add missing pieces with the CLI, never hand-write a component and never restyle one at the call site."
---

# shadcn/ui only — never invent, never restyle

The components already in the UI package (`components/ui/*`, written by the
shadcn CLI) are the app's entire component vocabulary. Two prohibitions:
do not hand-write a component the set already ships, and do not restyle one
from the outside.

## Use what is installed

- Inventory before writing markup. The set covers ordinary needs: Button /
  Button Group, Input / Input Group / Input OTP, Label, Field, Select /
  Native Select / Combobox / Command, Checkbox, Radio Group, Switch, Slider,
  Dialog / Alert Dialog / Sheet / Drawer, Dropdown Menu / Context Menu /
  Menubar, Popover / Hover Card / Tooltip, Tabs, Table / Data Table, Badge,
  Avatar, Breadcrumb, Pagination, Progress, Separator, Scroll Area, Resizable,
  Collapsible / Accordion, Calendar / Date Picker, Sidebar, Sonner, Chart,
  Empty, Item, Kbd, Toggle / Toggle Group, Aspect Ratio, Carousel,
  Navigation Menu.
  (Design laws still override the inventory: no cards, no skeletons.)
- Missing component → add the upstream one with the CLI, e.g.
  `bunx shadcn@latest add <name>`, never by hand. The CLI writes the real
  component source plus its dependencies (`radix-ui` or `@base-ui/react`,
  `class-variance-authority`, `cn`) and keeps `components.json`, aliases and
  theme tokens in sync. Hand-writing a Button is how an app ends up with four
  of them.
- No private look-alikes: no `AppButton`, `OurSelect`, `Modal`, `Pill`
  duplicating an existing component.
- No second wrapper layer around a shadcn component to change its appearance —
  that diff is exactly what makes the design system unenforceable.
- No second UI kit or stray headless primitive beside the set. One set per app.

## Never restyle at the call site

- Appearance comes from the component's own API: `variant`, `size`, and the
  state attributes it already styles (`data-slot`, `data-state`, `aria-*`,
  `disabled:*`, focus rings). Pick the closest variant.
- Never pass `className` or `style` that changes colour, background, border,
  radius, shadow, font, internal padding/gap, height, or hover/focus state.
  `cn()` is clsx + tailwind-merge: a passed class silently wins over the base,
  so a local override looks right in one screenshot and breaks the other
  instances and dark mode.
- `className` is for placement only: positioning inside the parent (`w-full`,
  `flex-1`, `min-w-0`, `ml-auto`, `mt-4`, grid placement). Layout belongs to
  the parent, looks belong to the component.
- Never re-declare component states at the call site — no `hover:bg-…`,
  `disabled:opacity-…`, focus ring, or `dark:` colour pairs. The component
  carries them and the tokens handle dark mode.
- Colour, radius, spacing and type scale live in the theme tokens (CSS
  variables) — change the token, not the consumer.

## Extending the system instead

A visual the set lacks — new variant, size, density — is a design-system
change: add it once to the component's CVA variant map inside `components/ui`,
built from existing tokens, and every call site gets it. Review it as such,
not as a one-off class at one call site.

Check before shipping: grep call sites outside `components/ui` for
`className=` values carrying `bg-`, `text-`, `border-`, `rounded-`, `shadow-`,
`p-`, `gap-`, and confirm each is plain text/layout on a plain element — not an
override handed into a component from the set.
