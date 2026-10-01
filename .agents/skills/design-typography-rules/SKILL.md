---
name: design-typography-rules
description: "Vertical rhythm and emphasis in body text: paragraph/block spacing by body font size (not line-height), real bold+italic, don't inherit a renderer's defaults."
---

# Typography rules for text blocks

Rules for readable long-form / markdown / chat text: how much space between
paragraphs and how to make bold and italic actually show.

## 1. Space between paragraphs — by font size, not line-height

Rule (Matthew Butterick, Practical Typography, "Space between paragraphs"):
the gap between paragraphs is about **50–100% of the body font size** — an
`em` measure, not a multiple of line-height.

- Body 16px → gap 8–16px (0.5–1em).
- "2 × line-height" is far too much: line-height is ~1.2–1.4 × font size, so
  2 × leading ≈ 2.4–2.8 × font size.
- Type guides converge near 0.5em / half a leading for a comfortable read.
  Pick once inside 0.5–1em and scale it with the text-size system (rem /
  Dynamic Type).

Apply as the block spacing between paragraphs, lists, headings, code. Do NOT
reach for a markdown renderer's shipped default just because it exists — size
it to your own body font and the em rule.

## 2. Bold and italic must be real

Emphasis that does not render reads as a typo, not a highlight.

- **Bold** uses weight 700 (`.bold`). Weight 600 (`.semibold`) sits close to
  regular at body sizes and reads as barely-bold.
- **Italic** needs an actual italic face. Passing `nil` for the italic font
  usually makes the renderer fall back to the normal face, so italic text
  silently renders upright.
- **Bold-italic** needs both. When the platform has no constructor for it,
  synthesize it by adding the italic trait to the bold descriptor (keeps the
  weight), not by starting from regular.

Symptom that triggers this rule: "**bold** and *italic* don't stand out, the
font gets lost" in a rich-text / markdown UI.

## When to apply

Long-form reading text, chat and assistant markdown bodies, docs, lists after
paragraphs. Change the one em multiplier (0.5–1.0) to tune; do not invent a
parallel spacing scheme.
