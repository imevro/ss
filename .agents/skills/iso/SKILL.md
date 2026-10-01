---
name: iso
description: Isolate this session in a worktree before doing real work (the /iso workflow)
---

Before starting main work, take the whole project into an isolated workspace.

Follow `engineering/engineering-iso-isolated-workspace` — the general isolation contract. If this is an iOS repo, its simulator specifics live in `ios/ios-dev-setup` (the iOS form of iso-setup).

1. If `scripts/iso-setup.sh` (or the platform's equivalent) exists — run it with a session slug. That IS the isolation.
2. If it does not exist — offer to create it (or create it yourself if asked): a per-repo script that encapsulates this project's worktree + runtime bring-up. Ask the user first.
3. Name the worktree after this session — a stable, meaningful slug, not a random one.
4. Do all subsequent work in the worktree, never the main checkout.
5. Clean after session finish, but don't loose any data or code.
