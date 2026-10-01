---
name: web-add-base-ui-component
description: Add UI primitives as thin wrappers over one headless set (Base UI) — cn() + design tokens, data-slot, forwarded props, state via data attributes, inline SVG icons.
---

# Adding a UI primitive component

Components are THIN wrappers over the headless primitive set the UI package is
built on (Base UI) — NOT Radix, and never a second set in the same tree. Style
with design tokens only, which is what makes dark mode automatic.

## Pattern

1. Import the primitive:
   ```tsx
   import { Button as ButtonPrimitive } from '@base-ui/react/button';
   // multi-part composites:
   import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';
   ```

2. Wrap with `cn()` and style with tokens only (`bg-accent`, `bg-muted`,
   `border-border`, `text-foreground`, …) — never raw colors:
   ```tsx
   function Button({ className, ...props }: ButtonPrimitive.Props) {
     return (
       <ButtonPrimitive
         data-slot="button"
         className={cn('bg-primary text-primary-foreground hover:bg-primary/80', className)}
         {...props}
       />
     );
   }
   ```

3. `data-slot` on the root element names the component for testing/debugging.

4. Forward all props so consumers reach the primitive's state and behavior.

## State & styling hooks

The primitive exposes state as **data attributes** and **CSS variables** —
style those, never guessed classes:

- `data-checked` (toggle/switch), `data-active` (tabs/list item),
  `data-popup-open` (popover/select), `aria-disabled`, `aria-expanded`.
- `--anchor-width` (positioned width), `--available-height` (popover
  max-height), more per component.

## Multi-part composites

Export every part (Root/List/Trigger/Content…), each its own thin wrapper with
its own `data-slot`.

## Accessible names

Put `aria-label` on the element that actually renders — e.g. `SelectTrigger`,
NOT `Select.Root` (Root renders no element; the label would be lost).

## Icons

No icon-library imports — inline SVG or JSX children:
```tsx
<Button>
  <svg className="size-4" viewBox="0 0 24 24"><path d="..." /></svg>
  Click me
</Button>
```

## Placement

One file per primitive named after it (`switch.tsx`, `select.tsx`) in the UI
package's components dir. Export types alongside components.

Testing: state behavior and focus styles come from the primitive; token
styling means dark mode works without per-component work.
