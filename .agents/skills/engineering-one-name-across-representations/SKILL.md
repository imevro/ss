---
name: engineering-one-name-across-representations
description: One entity carries one name across every representation (tool = wire kind = UI component = mobile block). Use when adding a cross-cutting entity or a mapping layer.
---

# A = A: one entity, one name on all layers

One entity = one name on every layer. A tool `list_items_by_ids` → wire kind `list_items_by_ids` → event `ui.component: "list_items_by_ids"` → web component `ListItemsByIds` → mobile block `ListItemsByIds`. The API function and its component share the name.

## Why

Naming is the real main problem of programming. Intermediate renames and mapping layers (`items` → `items_list` → `Items`) spawn binding layers and make auditing impossible: you can no longer trace one entity through the system because it changes identity at every hop.

## Rules

- When adding any cross-cutting entity (tool, wire kind, event, component), the name is identical on each layer, differing only by the layer's case convention (snake_case ↔ PascalCase).
- No intermediate renaming/mapping layers.
- Deviation only as a documented carve-out — for example legacy database rows where renaming would mean a data migration performed purely for naming's sake.

## Why it gets audited

This class is a ship-blocker in the semantic review gate: grep for one entity under different names across layers, and delete the mapping layer that bridges them.
