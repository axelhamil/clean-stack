#!/usr/bin/env bash
set -euo pipefail

# Copies .env.example -> .env in each workspace that owns one.
# Idempotent: never overwrites an existing .env.

ROOT="$(cd "$(dirname "$0")/.." && pwd)"

for dir in apps/api apps/app packages/drizzle; do
  src="$ROOT/$dir/.env.example"
  dst="$ROOT/$dir/.env"
  if [ ! -f "$src" ]; then
    echo "skip $dir (.env.example missing)"
    continue
  fi
  if [ -f "$dst" ]; then
    echo "keep $dir/.env (already present)"
  else
    cp "$src" "$dst"
    echo "create $dir/.env"
  fi
done
