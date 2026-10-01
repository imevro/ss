---
name: api-metered-call-spend-cap
description: Every metered third-party call runs with a limits check and an explicit per-run spend cap; get the cheap half of the data through a free path first.
---

# Cap the spend of every metered third-party call

Anything billed per result, per token, or per runtime minute gets three things
before the first request: a **limits check**, an explicit **per-run cap**, and a
**free path for the cheap half of the data**.

## Before running

1. **Read the ceiling from the provider's own API** — current usage against the
   plan limit — and compare it to the estimated cost of the run. Do this first,
   not after a surprise.
2. **Pass the provider's spend-cap parameter on the run itself.** Most
   actor/job APIs expose one. Cap; do not hope. A cap turns a bad input into a
   truncated result instead of an invoice.
3. **Prefer the synchronous "run and return items" endpoint** for exploratory
   runs: one HTTP call, result in the response, fewer moving parts to poll.
4. **Discover the input schema for free** before guessing parameter names and
   enum values — build/metadata endpoints usually expose the full input schema
   without a run.

## Split cheap discovery from paid metrics

Enumerate candidates — names, captions, ids, urls — through a **free
text-extraction path** (a reader proxy over the public page), and only pay for
the numeric fields the free path cannot provide. Discovery sets are large;
metric sets can be one row per candidate. This is routinely the difference
between a multi-dollar crawl and cents.

## Reading results

- **Verify the field, not just the row count.** A metric present under a
  plausible name can be uniformly null while the real value sits under a sibling
  key. Check both before trusting a column.
- **A `200` with a tiny body is a failure.** Index/collection/hub pages that
  don't exist may still answer successfully with an empty shell. Gate on
  response size, not status code alone.
- **Log actual spend per run** next to the plan, and keep the running total
  against the billing-cycle ceiling in the session notes — the remaining budget
  is the constraint that decides how many more runs are affordable.
