---
name: fp-purity-no-fake-compliance-hacks
description: When an abstraction does not fit, drop it — never write hacks that pretend its contract is different (no-op callbacks, sentinels, monkey-patching). Use when an upstream API or library does not fit your case.
---

# No hacks — drop the abstraction or use the primitive directly

When an abstraction does not fit your use case, DROP the abstraction. Do not write hacks that fake fitting it.

## The question to ask

Am I composing with the upstream API (good), or pretending its contract is different than it is (bad)?

## Banned shapes

- No-op callbacks / deferred-execute placeholders pretending a call ran. Example: overriding a tool's execute to return a sentinel string so the framework skips running it — instead call the underlying provider's HTTP endpoint directly, which returns the tool calls without executing them. Clean, direct API usage.
- Sentinel values flowing through normal data paths to smuggle meaning the type does not have.
- Monkey-patching internal/private fields of a third-party library to override its hardcoded options. Always bad: use the public API, fix it upstream (PR), use the primitive directly (e.g. the bare queue + worker), or restructure your code so the abstraction fits as designed.

## Rules

- If the upstream contract is wrong for you → either restructure your code to match its design, or drop it for direct primitives. Do not fake it.
- Monkey-patching internals of third-party libraries: public API or fork.

## Why

Hacks encode a lie about what the abstraction does, and the lie breaks the moment the library updates or the next developer reads the code. Direct usage is boring, visible, and survives.
