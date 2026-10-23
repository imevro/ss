# The port is held by an old process — the check lies

The development service is raised by hand and lives between sessions. If port `8787` is
already taken by yesterday's process, the new copy dies with `EADDRINUSE`, and
`curl localhost:8787` **answers with old code**. The check looks successful and confirms
what is no longer in the tree.

How to catch it:

```bash
lsof -nP -iTCP:8787 -sTCP:LISTEN     # who holds the port and since when
```

If the command shows a process other than the one just started, stop the old one first,
wait for the port to be released, then start your own. Readiness "the port is open" does
not tell these apart: the port may be open by a foreign process.

- Check a removed route only after your own start: `curl -o /dev/null -w '%{http_code}'`
  must give 404, not 200 from old code.
