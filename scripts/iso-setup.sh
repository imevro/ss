#!/usr/bin/env bash
# Изоляция сессии: отдельная копия проекта (worktree) плюс база в докере.
# Повторный запуск ничего не ломает.
set -euo pipefail

SLUG="${1:-}"
if [ -z "$SLUG" ]; then
  echo "укажи имя сессии: scripts/iso-setup.sh <slug>" >&2
  exit 1
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TARGET="$ROOT/.worktrees/$SLUG"
BRANCH="iso/$SLUG"

# 1. Отдельная копия проекта.
mkdir -p "$ROOT/.worktrees"
if git -C "$ROOT" worktree list --porcelain | grep -qx "worktree $TARGET"; then
  echo "копия уже есть: $TARGET"
elif git -C "$ROOT" show-ref --verify --quiet "refs/heads/$BRANCH"; then
  git -C "$ROOT" worktree add "$TARGET" "$BRANCH"
else
  git -C "$ROOT" worktree add -b "$BRANCH" "$TARGET"
fi

# 2. Окружение. Рабочий файл живёт только в копии и в git не попадает.
if [ ! -f "$TARGET/.env" ]; then
  cp "$TARGET/.env.example" "$TARGET/.env"
  secret="$(openssl rand -hex 32)"
  sed -i '' "s|^BETTER_AUTH_SECRET=.*|BETTER_AUTH_SECRET=$secret|" "$TARGET/.env"
  echo "создан $TARGET/.env (секрет сгенерирован)"
fi

# 3. База.
(cd "$TARGET" && docker compose up -d db >/dev/null)
for _ in $(seq 1 40); do
  if docker exec ss-db pg_isready -U ss -d ss_core >/dev/null 2>&1; then
    echo "база готова: ss-db, порт 5433"
    break
  fi
  sleep 1
done

echo
echo "работай тут: $TARGET"
echo "дальше:      cd $TARGET && bun install && bun run db:migrate"
