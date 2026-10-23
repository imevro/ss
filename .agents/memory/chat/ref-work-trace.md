# A work circle: Trace while it runs, one short line after

The answer goes in **circles**: words, a circle of tools, words again. Hence the shape of
the work: while a circle runs — a full `Trace` (every call in order); after it — one short
line for that circle. Blocks keep the circle order, so the texts are not glued together.

```
Работаю 12s                          circle runs: Trace
  Bash — Смотрю файлы
  Read — Читаю схему                 ← the active line shimmers via Trace itself
  Мысли ×3

Worked for 12s • Bash ×2 • 3 thoughts    circle closed: one short line
```

Rules:

- The short line speaks English (`Worked for`, `thought`/`thoughts`), the Trace heading
  speaks Russian (`Работаю 12s`, `Работал 12s`): it is a caption, not the agent's words.
- Counting is **by name**: `Bash ×2`, wherever the calls stand. One call — no number.
- The short line shows at most two tool names: the last two distinct ones by first
  appearance (`HISTORY_LIMIT` in `work-trace.tsx`), so the line does not grow with the
  turn.
- A name is read as words: first letter capital, underscores as spaces (`web_search` →
  "Web search").
- The call icon follows the tool name: `read` — file, `edit`/`write` — pencil,
  `run`/`bash` — terminal, the rest — wrench. One icon set for the whole project
  (hugeicons).
- The shimmer is drawn by `Trace` itself
  (`data-[status=running]:*:data-[slot=trace-title]:shimmer`). There is no shimmer of
  our own: `text-shimmer` was removed with the foreign sets.
- The number of thoughts is counted by the log fold, the line does not count.
- `expanded` (a turn running by the journal or by the record) matters more than
  `running`: after a reload in the middle of a turn the circle stays open, and typing
  does not start over.
- A closed circle is built from the record block, not from the browser journal: so it
  arrives server-rendered and does not blink on a reload.
