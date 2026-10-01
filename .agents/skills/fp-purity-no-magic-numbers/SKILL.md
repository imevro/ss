---
name: fp-purity-no-magic-numbers
description: No hardcoded offsets or magic constants to fake platform behavior — find the native API. Use when fighting a layout or behavior with measured pixel constants.
---

# No magic-number layout hacks — use the native platform API

Hard no-go. Positioning content with hardcoded offsets (`.padding(.bottom, 92)`, then 4, then 57 — tuning pixel offsets against an accessibility tree) to fake platform chrome is unacceptable.

## The lesson

Hardcoded offsets and measured pixel constants to fake platform chrome = wrong approach. Find the real native API first. In one case the answer was the platform's bottom-accessory API for content above a tab bar — the system handles position, material, and animation, with zero numbers.

The pattern generalizes: when fighting a layout or behavior with arbitrary constants, stop. There is almost always a first-class platform or stdlib API that is the expected solution.

## Rules

- When you reach for a magic number to make something line up or behave, treat it as a signal the approach is wrong — find the native API.
- Fix the approach, not the number. Tuning the constant repeatedly means the foundation is wrong.

## Why

Magic numbers encode an observed state of someone else's chrome (a system tab bar, a browser, an OS component) that changes between versions, devices, and text sizes. The platform API tracks those changes; your constant does not, and it breaks on the first device where the chrome differs.
