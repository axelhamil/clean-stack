#!/usr/bin/env bash
set -euo pipefail

STANZA=clean-stack
ENV_FILE="${CLEAN_STACK_PGBACKREST_ENV:-/etc/clean-stack/pgbackrest.env}"
LOCK_FILE="${CLEAN_STACK_PGBACKREST_LOCK:-/run/clean-stack-pgbackrest.lock}"
READY_SECONDS="${CLEAN_STACK_PGBACKREST_READY_SECONDS:-120}"
KIND="${1:-}"

case "$KIND" in
  full | diff) COMMAND=(--type="$KIND" backup) ;;
  check) COMMAND=(check) ;;
  *)
    echo "usage: $0 full|diff|check" >&2
    exit 2
    ;;
esac

if [[ ! -r "$ENV_FILE" ]]; then
  echo "missing $ENV_FILE: copy infra/vps/pgbackrest.env.example there" >&2
  exit 2
fi

# shellcheck source=/dev/null
. "$ENV_FILE"

: "${PGBACKREST_CONTAINERS:?set PGBACKREST_CONTAINERS in $ENV_FILE}"

URL_KEY="HEARTBEAT_URL_PGBACKREST_${KIND^^}"
HEARTBEAT_URL="${!URL_KEY:-}"
HEARTBEAT_URL="${HEARTBEAT_URL%/}"

ping() {
  if [[ -z "$HEARTBEAT_URL" ]]; then return 0; fi
  curl --fail --max-time 10 --retry 3 "$HEARTBEAT_URL$1" >/dev/null 2>&1 || true
}

wait_ready() {
  local deadline=$((SECONDS + READY_SECONDS))

  until docker exec --user postgres "$1" pg_isready --quiet; do
    if [[ "$SECONDS" -ge "$deadline" ]]; then
      echo "$1 not ready after ${READY_SECONDS}s, $KIND skipped" >&2
      return 1
    fi
    sleep 1
  done
}

exec 9>"$LOCK_FILE"
flock 9

ping /start

read -r -a CONTAINERS <<<"$PGBACKREST_CONTAINERS"
STATUS=0

for CONTAINER in "${CONTAINERS[@]}"; do
  if ! wait_ready "$CONTAINER"; then
    STATUS=1
    continue
  fi

  docker exec --user postgres "$CONTAINER" pgbackrest "--stanza=$STANZA" "${COMMAND[@]}" || STATUS=$?
done

if [[ "$STATUS" -eq 0 ]]; then ping ""; else ping /fail; fi

exit "$STATUS"
