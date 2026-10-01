---
name: design-motion-vocabulary
description: ONE motion file is the single source of truth — springs only (settle / brisk / momentum with velocity handoff), no inline duration or easing curves outside it; reduce-motion helpers wrap springs in quiet crossfades.
---

# Motion vocabulary — one source of truth

One motion file is the single source of truth for ALL animation in the app
(or design system), web or native.

## Spring presets (no duration curves)

All animations use springs; duration/easing curves are banned outside the
motion file.

1. **settle** (response ~0.4, damping ~1.0) — default for content
   arriving/rearranging. No overshoot, straightforward decay; use when the
   user doesn't expect momentum.
2. **brisk** (faster, smaller amplitude) — small controls: chips, segments,
   morphs. Responsive feel for interactive elements.
3. **momentum** (velocity handoff) — post-gesture, thrown weight. Supports an
   `initialVelocity` parameter to carry gesture velocity into the animation;
   use for flick-to-dismiss, scroll effects.

## Accessibility helpers

Helpers degrade motion for users who prefer reduced motion (web:
`prefers-reduced-motion`; native: the platform's reduce-motion setting):

- wrap a spring into a quiet crossfade when reduced motion is on;
- a transition-level wrapper;
- a delay-behavior wrapper.

The reduced form is always a quiet crossfade or instant opacity change.

## Rule

**Any inline `duration:` / ease curve / ad-hoc animation timing outside the
motion file is a bug.** Extract into the file or use a pre-made helper.

Unit tests verify the spring curves and the accessibility behavior.

## Related

- `design-tokens` — house motion timings shared across the design system.
- `ios-liquid-glass` — iOS-26 glass chrome, where springs drive the morph.
