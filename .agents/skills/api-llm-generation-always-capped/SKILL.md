---
name: api-llm-generation-always-capped
description: Always cap LLM generation — max_tokens on the request plus an overall stream deadline — or a model can generate forever and stall a single-consumer worker queue. Use when calling any LLM chat/completions API with streaming.
---

# Cap LLM generation: max_tokens + stream deadline

Never call an LLM chat/completions endpoint without a generation cap. A model can loop (reasoning-only output, repetition) and stream for hours — providers do not always stop, and idle timeouts do not fire when data keeps arriving.

## The two caps

1. **`max_tokens` in the request body.** Hard ceiling on the response. Pick a number that fits your use case (a chat answer rarely needs more than a few thousand).
2. **Overall deadline on the stream reader.** Second line of defense: even with max_tokens, a provider can ignore it or stall mid-stream. Race every read against a deadline promise (e.g. 120s); on timeout, fail the job so the caller can retry. Cancel the deadline timer on normal completion — otherwise the late reject becomes an unhandled rejection.

## Why both

- Idle/keepalive timeouts (e.g. "no data for 30s") do NOT catch an endless stream: the model emits data regularly (often `reasoning_content`, which your parser may discard), so "not idle" is true while no usable token ever yields.
- If the worker consumes one job at a time (concurrency: 1), one unbounded generation blocks the entire queue — every later job waits forever behind it.

## Real case

A Bible-study agent asked a hard theological question; without max_tokens the model streamed 4MB+ over 2 hours (reasoning only, parser yielded nothing), the single worker read forever, and the queue stalled with a dead-heartbeat "active" job. Fix was `max_tokens: 4096` + a 120s deadline raced against each read, timer cancelled in `finally`.

## Diagnostic: is the worker stuck on generation?

- Live connection to the provider IP with `bytes_received` growing = model is pouring data; the worker is reading, not hung.
- No sockets at all = worker isn't generating (different problem).
- Job heartbeat frozen while the process is alive = the task is not progressing (stuck await).
