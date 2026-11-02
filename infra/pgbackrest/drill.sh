#!/usr/bin/env bash
set -euo pipefail

PROJECT=clean-stack-pgbackrest-drill
STANZA=clean-stack
PROMOTION_TIMEOUT_SECONDS=300
COMPOSE_FILE="$(cd "$(dirname "$0")" && pwd)/docker-compose.drill.yaml"

DRILL_POSTGRES_PASSWORD="$(openssl rand -hex 16)"
PGBACKREST_REPO1_S3_KEY="drill$(openssl rand -hex 12)"
PGBACKREST_REPO1_S3_KEY_SECRET="$(openssl rand -hex 32)"
PGBACKREST_REPO1_CIPHER_PASS="$(openssl rand -base64 48)"
export DRILL_POSTGRES_PASSWORD PGBACKREST_REPO1_S3_KEY PGBACKREST_REPO1_S3_KEY_SECRET PGBACKREST_REPO1_CIPHER_PASS

compose() {
  docker compose --project-name "$PROJECT" --file "$COMPOSE_FILE" "$@"
}

pgbackrest() {
  compose exec -T postgres pgbackrest "--stanza=$STANZA" "$@"
}

sql() {
  compose exec -T postgres psql -U postgres -d drill -v ON_ERROR_STOP=1 -Atqc "$1"
}

cleanup() {
  compose down --volumes --remove-orphans >/dev/null 2>&1 || true
}

trap cleanup EXIT

cleanup
compose up --detach --build --wait

pgbackrest stanza-create
pgbackrest check

sql "create table drill_row (id bigserial primary key, created_at timestamptz not null default clock_timestamp())"
sql "insert into drill_row select from generate_series(1, 1000)"
pgbackrest --type=full backup

sql "insert into drill_row select from generate_series(1, 500)"
expected="$(sql "select count(*) from drill_row")"
sleep 1
target="$(sql "select to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD HH24:MI:SS.US') || '+00'")"
sleep 1
sql "insert into drill_row select from generate_series(1, 700)"
sql "select pg_switch_wal()" >/dev/null
pgbackrest check

echo "count at ${target}: ${expected}, count before the crash: $(sql "select count(*) from drill_row")"

started="$(date +%s)"
compose kill postgres
compose rm --force --stop postgres
docker volume rm "${PROJECT}_pgdata"

# shellcheck disable=SC2016
compose run --rm --no-deps --entrypoint sh postgres -c 'mkdir -p "$PGDATA" && chmod 0700 "$PGDATA"'
compose run --rm --no-deps --entrypoint pgbackrest postgres "--stanza=$STANZA" --type=time "--target=${target}" --target-action=promote restore
compose up --detach --wait --no-deps postgres

deadline=$((SECONDS + PROMOTION_TIMEOUT_SECONDS))
until [ "$(sql "select pg_is_in_recovery()" 2>/dev/null)" = "f" ]; do
  if [ -z "$(compose ps --status running --quiet postgres)" ]; then
    echo "drill failed: the restored instance stopped during the replay" >&2
    compose logs --tail 50 postgres >&2
    exit 1
  fi
  if [ "$SECONDS" -ge "$deadline" ]; then
    echo "drill failed: the restored instance was still in recovery after ${PROMOTION_TIMEOUT_SECONDS}s, read compose logs postgres for the replay" >&2
    exit 1
  fi
  sleep 1
done

restored="$(sql "select count(*) from drill_row")"
elapsed="$(($(date +%s) - started))"

if [ "$restored" != "$expected" ]; then
  echo "drill failed: restored ${restored} rows, expected ${expected} at ${target}" >&2
  exit 1
fi

pgbackrest check
echo "drill passed: restored ${restored} rows at ${target}, RTO ${elapsed}s"
