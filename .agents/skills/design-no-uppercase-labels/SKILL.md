---
name: design-no-uppercase-labels
description: Never set small labels, eyebrows, table headers or badges in ALL CAPS — sentence case at a slightly larger size. All-caps micro-text is a readability failure, not a style.
---

# No ALL-CAPS labels — sentence case, slightly larger

Never set small text in capitals: section eyebrows, exhibit/table labels, table
column headers, metric labels, tab labels, badges, buttons. Use sentence case.

## Why

Caps destroy the word-shape cues readers use to recognise words. At 9–11px the
loss is severe: every word becomes a rectangle of even height, so the reader has
to spell instead of scan. The effect compounds with the wide letter-spacing that
caps styling usually ships with — tracking is a partial fix for caps, not a
substitute for lowercase.

The size temptation is the giveaway: if the label only works at 10px because
caps make it look "designed", the label is failing. Sentence case at the same or
slightly larger size reads better and needs no tracking.

## How to replace it

- **Drop `text-transform:uppercase` entirely.** Do not keep it on one label
  "for hierarchy" — hierarchy comes from weight, color, and position.
- **Reduce tracking to near zero.** Caps wanted `letter-spacing: 0.1em+`;
  sentence case wants `0.01em` or normal. Leftover wide tracking on lowercase
  text reads as broken kerning.
- **Bump the size one step.** A label that was 9.5–10px in caps reads better at
  11–12px in sentence case. Small mono labels especially: monospace already
  looks loosely spaced, so caps on top of it is doubly hard.
- **Keep the role, change the shape.** A label stays a label through its
  family (mono), weight, color and a rule above it — none of which need caps.
- **Write the label as real text.** `Таблица 3`, not `ТАБЛИЦА 3` typed in caps;
  `Продукт`, not `ПРОДУКТ`. Never type capitals into the data to fake the
  style — the transform belongs to CSS, and so does its removal.

## Applies to

Eyebrow labels, exhibit and table captions, `th` headers, metric labels under
numbers, tab and filter labels, badges, and button text. Proper nouns and
genuine initialisms (`USA`, `API`) keep their capitals — the rule is about
styling ordinary words, not about banning capital letters.

## Verify by measurement

Screenshots and vision models are not evidence here — a monospace font is
routinely mistaken for wide letter-spacing. Read the computed style:

```js
const c = getComputedStyle(label);
c.textTransform // must be "none"
parseFloat(c.letterSpacing) < 0.5 // px, on small labels
```
