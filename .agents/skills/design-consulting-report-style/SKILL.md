---
name: design-consulting-report-style
description: Decision documents read as consulting reports — claim headlines in a dark band, numbered exhibits each carrying its source, dense tables, sans-serif only, no cards.
---

# Decision documents use the consulting-report register

When the deliverable is a document someone uses to DECIDE — a plan, a business
case, a market read, a reference appendix — rather than an article to enjoy
reading, build it in the consulting-report register. What distinguishes it is
not decoration: **every heading is a claim, and every number carries its
source.**

A magazine/editorial treatment (serif display headings, long evocative titles,
sections named by topic) reads as a feature article. For a working document that
is the wrong signal.

## Structure

- **Section banner = the finding, not the topic.** A dark full-bleed band with a
  short label and a headline stating the conclusion. Someone skimming only the
  banners should get the entire argument. "The feed drops links" — not
  "Content".
- **Numbered exhibits.** Every table, chart, or diagram is an exhibit with a
  small mono label, a title, the artifact, and **a source line beneath it**. In
  a document that drives a decision, an exhibit without a source is a liability.
- **Key-message callout** for the one sentence the section must leave behind.
- **Dense tables**, right-aligned tabular numerals, a visually distinct
  total/summary row (light fill plus a heavier top rule).

## Typography and color

- **Sans-serif throughout.** A serif headline reads as a magazine feature.
- Three roles: heavy display sans for headings with slightly negative tracking,
  neutral text sans for body, mono for labels, sources, and numerals.
- One dark base for banners and headings, one accent, one secondary accent.
  Nothing else.

## Do not

Gradient washes, cards, an eyebrow label above every paragraph, decorative
emoji, ASCII tables or ASCII diagrams. If a theme is dark, invert with a real
palette rather than filtering everything through opacity.

## Verification

Claims about alignment, color, or selection state are settled by MEASUREMENT —
`getComputedStyle`, `getBoundingClientRect` — never by describing a screenshot.
A vision model will confidently report that a number sits lower than its
neighbors when all four boxes share an identical `top`; and that a control is
unfilled when its computed background is the accent color. Vision answers "does
this look intentional"; it does not answer "is this aligned".
