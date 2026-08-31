# Cron / scheduled jobs

clean-stack stays **scheduler-agnostic**. The boilerplate ships protected
internal endpoints (`POST /internal/<job>`); you wire your own scheduler.

## Endpoints

| Endpoint | Body | What it does |
|---|---|---|
| `POST /internal/rgpd-sweep` | `{ batchSize?: number; dryRun?: boolean }` | Wipes accounts whose 7-day grace window has elapsed (`pendingDeletionUntil <= now AND deletedAt IS NULL`). Idempotent, returns `{ processed, succeeded, failed, dryRun, truncated }`. `processed` is `succeeded.length + failed.length` — accounts actually attempted, not the batch size, so a truncated run reports what it really did. Time-budgeted like the retention sweeps below (checked *between* account wipes, never inside one — an account wipe is a single transaction and must never be cut in half), but deliberately holds no lease and its selection query is not `SKIP LOCKED`, so two overlapping runs can pick the same account; the anonymizing update is guarded by `deletedAt IS NULL`, making the wipe itself idempotent so the loser of the race short-circuits without double-wiping. |
| `POST /internal/flush-notification-emails` | `{ batchSize?: number; dryRun?: boolean }` | Groups pending notification emails into per-user/category digests and enqueues them for delivery. Recommended cadence: every minute. Note: "immediate" frequency means "at the next cron tick" — true real-time delivery is handled by the SSE event stream, not email. |
| `POST /internal/sweep-notifications` | `{ batchSize?: number; dryRun?: boolean }` | Purges read notifications older than `NOTIFICATION_RETENTION_DAYS` (default 30d). Unread notifications are never purged regardless of age. Recommended cadence: daily. |

## Authentication

Two layers, configured at deploy time via `INTERNAL_AUTH_LAYERS`:

- **`signature`** (mandatory in prod) — HMAC-SHA256 over a canonical message
  (timestamp, method, path, host, content-type, raw body). Header
  `X-Internal-Signature: t=<unix>,v1=<hex>`. Replay window: 30s. The signing
  key never travels on the wire.
- **`private-network`** (optional, additive) — accepts the request only if
  the source IP is in the IPv6 ULA range (Railway/Fly internal mesh) or
  loopback. Not a substitute for `signature`; stack on top.

Set in env (defense-in-depth on Railway):

```bash
INTERNAL_SIGNING_KEY=$(openssl rand -hex 32)
INTERNAL_AUTH_LAYERS=signature,private-network
```

Public infra (no internal mesh):

```bash
INTERNAL_AUTH_LAYERS=signature
```

## Bounds

**Upgrading an existing checkout.** `pnpm bootstrap` only creates `.env` from
`.env.example` when `.env` does not already exist — it never overwrites one.
Anyone who ran `pnpm bootstrap` before this branch landed has a `.env` missing
the variables below; `check:sweep-lock` (and the boot-time ordering check)
will fail until they're added by hand:

```bash
SWEEP_DEADLINE_MS=90000
SERVER_IDLE_TIMEOUT_SECONDS=120
INTERNAL_FETCH_TIMEOUT_MS=150000
INTERNAL_SIGNING_KEY=$(openssl rand -hex 32)   # required to run check:sweep-lock/check:fanout locally
```

### Single-flight

Each sweep label holds a lease in `sweep_lock` for the duration of its run. A
second call for the same label while one is running answers `{ skipped: true }`
without touching a row. The lease is time-boxed (twice `SWEEP_DEADLINE_MS`), so
a process killed mid-sweep frees the label on its own rather than wedging it —
which is why this is a lease row and not a session advisory lock, whose release
would be tied to a pooled connection.

The lease is fenced by an owner token, not just the label. `acquireSweepLease`
returns a fresh `uuidv7` per acquisition; `releaseSweepLease` deletes by
`label` AND `owner`. This matters because the deadline is only checked
*between* batches — a run can outlive its own TTL. If it does, the lease
expires, a legitimate successor acquires it, and the overrunning run's
eventual `release()` must not delete that successor's row just because it
still remembers the same label. Without the token, a run that overruns its
lease and finishes late would steal back a lease it no longer owns.

`sweep_lock.locked_at`/`locked_until` are `timestamptz` (`withTimezone: true`)
— deliberately, since bare `timestamp` is the norm everywhere else in this
schema. This is the one table that compares an application-written timestamp
against Postgres's own `now()` in the same predicate (`lockedUntil < now()`);
a tz-naive column is silently wrong the moment the app process and the
database don't agree on a timezone, so don't "fix" it back to match the rest
of the schema.

`rgpd-sweep` deliberately has no lease and its selection (`findUsersReadyForWipe`)
does not use `SKIP LOCKED`, so two overlapping runs can select the same account.
What makes that safe is that the wipe itself is idempotent: the anonymizing
`UPDATE` is guarded by `deletedAt IS NULL`, so a run that loses the race updates
zero rows, short-circuits before emitting `USER_DELETED`, and reports success
without wiping twice.

**Migration note (pull this branch before it ships to `main`).** `sweep_lock`'s
migration (`0020`) was amended in place to add the `owner` column and switch to
`timestamptz`, rather than stacked as a new `0021` — safe only because `0020`
was still unreleased. If you already ran `db:migrate` against an earlier
checkout of this branch, `__drizzle_migrations` has the *old* `0020` hash on
record; migrating again replays the amended file and fails with `relation
"sweep_lock" already exists`. Fix: `DROP TABLE sweep_lock` and re-migrate, or
just re-migrate a clean database. `db:push` users are unaffected — it diffs
the live schema, not the migration journal.

### Timeouts

Three nested deadlines, each strictly shorter than the one wrapping it, so the
innermost always wins and the caller gets a real HTTP response instead of a
dropped socket. **The API refuses to boot if they are not ordered** — env
parsing (`superRefine`, `apps/api/src/shared/env.ts`) rejects a configuration
where `SWEEP_DEADLINE_MS < SERVER_IDLE_TIMEOUT_SECONDS * 1000 <
INTERNAL_FETCH_TIMEOUT_MS` does not hold, so a bad `.env` fails the boot
rather than silently misbehaving in prod.

There is a fourth bound, `SHUTDOWN_GRACE_PERIOD_MS` (default 15 000 ms, see
[HEALTH-PROBES.md](HEALTH-PROBES.md)), and it is **deliberately not nested**
with the three above. A `SIGTERM` during a sweep — which this branch made
routinely 90–110 s long — fires well outside that 15 s grace window: the
in-flight sweep's transaction rolls back cleanly (no corruption), but its
lease in `sweep_lock` is left behind and answers `skipped` to the next one or
two ticks until it expires on its own. This is a known, accepted gap, not an
oversight — folding a 90 s+ sweep into a 15 s shutdown grace would mean either
stretching every deploy's drain window far past what the health-probe
contract needs for ordinary requests, or teaching the shutdown handler to wait
out an arbitrary sweep, which reintroduces the exact "wedge on shutdown" risk
the grace period exists to avoid.

| Bound | Env var | Default | What it protects |
|---|---|---|---|
| Sweep budget | `SWEEP_DEADLINE_MS` | 90 000 ms | The batched loop inside `POST /internal/sweep-*`, and the per-account loop in `rgpd-sweep`. Checked *between* units of work — a started batch or wipe always finishes, so no transaction is cut short and no account is half-erased. |
| Server idle timeout | `SERVER_IDLE_TIMEOUT_SECONDS` | 120 | `Bun.serve`. Bun's own default is **10 s** and it applies while the handler runs — measured here: a handler silent for 15 s loses its socket at 10 s, and so does a stream that writes once then waits 25 s. Maximum accepted by Bun: 255. |
| Client abort | `INTERNAL_FETCH_TIMEOUT_MS` | 150 000 ms | `signedInternalFetch`. A trip means the API is unreachable or wedged; under normal operation the server answers first. |

**The boot-time ordering check only covers the API process.** `INTERNAL_FETCH_TIMEOUT_MS`
is validated in `apps/api/src/shared/env.ts` but read nowhere in the API — its only
consumer is `apps/api/src/cron/sweep.ts`, a standalone script that runs as its own
service (Railway/Fly/K8s CronJob) with its own environment and parses `process.env`
directly, unchecked against the other two bounds. Raising `SERVER_IDLE_TIMEOUT_SECONDS`
on the API without also raising `INTERNAL_FETCH_TIMEOUT_MS` on the cron service leaves
the cron aborting a legitimate long sweep and reporting it `UNREACHABLE` — always raise
both together.

**`SERVER_IDLE_TIMEOUT_SECONDS` is not only about sweeps.** It is a single,
process-wide `Bun.serve` setting: raising it from Bun's 10 s default to 120 s
raises the idle budget for **every** socket the API serves, public traffic
included, not just the internal sweep rail — there is no way to scope it to
`/internal/*` alone. The reason it moved was `GET /notifications/stream`:
its heartbeat is every 25 s, so any value at or below that drops every SSE
connection on a cadence with no visible link to this table — this was
measured in production (every stream connection was being dropped and
reconnected at Bun's implicit 10 s default), not inferred from reading the
code. Keep it well above both the heartbeat and the sweep budget, and be
aware the cost of that headroom lands on the public surface too — a slow or
stalled public handler now also gets 120 s before its socket is cut.

### Response fields

`POST /internal/sweep-*` (the retention sweeps) returns `{ deleted, durationMs,
dryRun, batchCount, deletedPerPass, stopReasons, truncated, skipped }`.

- `skipped: true` — another run held the lease; nothing was done.
- `truncated: true` — at least one pass stopped on the time budget or on the
  `MAX_BATCHES` cap. Deletions already made are committed and the next tick
  resumes. Healthy for a large backlog; truncating on *every* tick means the
  backlog outpaces the cadence, and either the cadence or `batchSize` needs
  raising.
- `stopReasons[pass]` — `exhausted` (drained), `budget`, `batch-cap`, or
  `batch-error`. **`batch-error` is not truncation**: the batch failed and will
  fail again next tick. The bundled cron (`apps/api/src/cron/sweep.ts`, via
  `classifySweepResult`) exits non-zero on it.

`batchSize` bounds rows, not time. Each batch carries its own
`statement_timeout` — 5 s for a purge, 10 s for a dry-run count (the shared
`countEligibleWithTimeout` helper in `apps/api/src/shared/internal-routes/sweep-count.ts`,
since an unbounded `COUNT(*)` on a large table would otherwise hold a pooled
connection for the whole idle timeout) — which is what makes checking the
budget between batches sufficient.

### What a sweep looks like in tracing

Every `/internal/sweep-*` request opens one `sweep` span named `sweep > <label>`,
with a `db.query` child for the lease acquire, one `sweep.pass` child per retention
pass (carrying `sweep.retention_days`, `sweep.batch_size`, `sweep.dry_run`, and on
close `sweep.deleted`, `sweep.batch_count`, `sweep.stop_reason`), and a `db.query`
child per batched delete. `sweep.stop_reason` is the field to read first: `budget`
and `batch-cap` mean "more work left, next tick will resume", `batch-error` means a
batch will keep failing identically.

Batch spans are capped at `MAX_INSTRUMENTED_BATCHES` (50) per run — past that the
deletes run untraced. The cap exists because Sentry truncates a transaction at ~1000
spans from the end, and losing the last passes and the lease release to make room for
the 900th identical delete is a bad trade.

Errors: a batch failure under `onBatchError: "break"` and a failed lease release are
both swallowed by design (a sweep that did its work must not fail on them) and both
now reported to telemetry. A batch failure with no `onBatchError` rethrows, and
`app.onError` reports it — it is deliberately not captured twice.

## Triggering — use the signed-fetch helper

The boilerplate ships `apps/api/src/shared/internal-routes/internal-fetch.ts`. Same module the
caller imports; same canonical-message function the API uses to verify.

**The wrapper script you write** (called `rgpd-sweep.ts` below — name and path are yours; the wiring sections show it under `/app/`, `.github/cron/`, your scheduler's startCommand, etc.). Not part of the API bundle, not checked into `apps/api/`. Lives in whatever repo runs your cron:

```ts
// rgpd-sweep.ts (in your scheduler service / GH Actions repo / K8s image)
import { signedInternalFetch } from "@apps/api/src/shared/internal-routes/internal-fetch";

const res = await signedInternalFetch({
  baseUrl: process.env.INTERNAL_API_URL!,   // https://api.railway.internal:3000
  method: "POST",
  path: "/internal/rgpd-sweep",
  body: { dryRun: false },
  signingKey: process.env.INTERNAL_SIGNING_KEY!,
});
if (!res.ok) throw new Error(`rgpd-sweep failed: ${res.status} ${await res.text()}`);
```

For ad-hoc curl in dev, mint a signature with a tiny script — don't try to
build the canonical message by hand from the shell, it's how you ship a
broken cron.

## Wiring options

### Railway Cron (recommended for Railway deployments)

Run the cron as a service in the **same project** as the API. It reaches the
API via the private network at `https://${API_SERVICE}.railway.internal:3000`
and signs each request. With `INTERNAL_AUTH_LAYERS=signature,private-network`
you get both barriers active.

```jsonc
// railway.json (cron service — own repo / own service)
{
  "deploy": {
    "startCommand": "bun rgpd-sweep.ts",
    "cronSchedule": "0 3 * * *"
  }
}
```

`rgpd-sweep.ts` is a one-shot wrapper you write in your scheduler service that imports `signedInternalFetch` and calls `/internal/rgpd-sweep`. Not part of the API bundle.

### GitHub Actions cron

```yaml
# .github/workflows/rgpd-sweep.yml
name: RGPD sweep
on:
  schedule:
    - cron: "0 3 * * *"
  workflow_dispatch:
jobs:
  sweep:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: bun install
      - run: bun .github/cron/rgpd-sweep.ts
        env:
          INTERNAL_API_URL: ${{ secrets.API_URL }}
          INTERNAL_SIGNING_KEY: ${{ secrets.INTERNAL_SIGNING_KEY }}
```

`.github/cron/rgpd-sweep.ts` is your 10-line wrapper around `signedInternalFetch` — checked into the repo running the cron, not the API.

### K8s CronJob

Build a small image that includes the script and run it on a schedule:

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: rgpd-sweep
spec:
  schedule: "0 3 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: rgpd-sweep
              image: your-registry/cron-runner:latest
              command: ["bun", "/app/rgpd-sweep.ts"]
              env:
                - name: INTERNAL_API_URL
                  value: "http://api.svc.cluster.local:3000"
                - name: INTERNAL_SIGNING_KEY
                  valueFrom:
                    secretKeyRef:
                      name: internal-signing-key
                      key: value
          restartPolicy: OnFailure
```

### Inngest / BullMQ

Same pattern — call `signedInternalFetch` from inside the scheduled function.
Don't reinvent signing; reuse the helper so the canonical message stays in
lockstep with the verifier.

## Operational notes

- **Idempotent**: re-running the sweep within the same minute is safe — rows
  already wiped have `deletedAt IS NOT NULL` and are filtered out.
- **Batched**: default `batchSize=50` (configurable via `RGPD_SWEEP_BATCH_SIZE`
  env var or per-call body). For large pending queues, schedule the cron
  more frequently rather than raising the batch size.
- **Failures don't cascade**: a failure on one user is logged and the sweep
  continues. The response includes a `failed` array with `userId` and
  `errorCode` for follow-up.
- **Observability**: each invocation logs through `pino` at `info` (with
  counts) on success and `warn` on partial failure.

## Other internal cron endpoints

Same `internalLayers` (HMAC + optional private network) gate, same `signedInternalFetch` pattern from your scheduler.

### `POST /internal/sweep-{outbox,audit-log,webhook-delivery}` — retention sweeps

Three endpoints purge the derived tables of the event pipeline. Defaults: outbox 7d, audit_log operational 90d / compliance 365d, webhook_delivery 30d (`success` + `dead_letter` only — `pending`/`failed` never purged). All take `{ batchSize?: 1–50000, dryRun?: boolean }`.

Schedule: daily at 03:17 UTC (off-peak). Order matters because `webhook_delivery.outbox_event_id` is `ON DELETE RESTRICT`: 1) `sweep-webhook-delivery`, 2) `sweep-audit-log`, 3) `sweep-outbox`. See `docs/EVENTS.md` § Retention for the matrix and env knobs. Reference cron entrypoint chaining the three in order: `apps/api/src/cron/sweep.ts` (bundled to `dist/cron/sweep.js`). Wire it via the wiring options above — Railway Cron is the reference deploy (see [`DEPLOY-RAILWAY.md`](DEPLOY-RAILWAY.md)).

### `POST /internal/sweep-email-messages` — email queue retention sweep (Phase D.5)

Two purge passes, run in sequence on every invocation:

1. Purges `email_message` rows with `status = 'sent'` older than `EMAIL_MESSAGE_RETENTION_DAYS` (default 7d), cutoff measured from `sent_at`.
2. Purges `email_message` rows with `status = 'failed'` older than `EMAIL_MESSAGE_FAILED_RETENTION_DAYS` (default 90d), cutoff measured from `created_at` (enqueue time), **not** from when the row failed.

A `failed` row is the operator's only trace of a dropped email and should be reviewed manually before it ages out — but it is not kept forever: past the 90-day default it is purged like any other retention sweep. All take `{ batchSize?: 1–50000, dryRun?: boolean }`. Chained at the end of `apps/api/src/cron/sweep.ts` (runs after the event-pipeline sweeps).

- **Replay window**: 30s. If your scheduler's clock drifts more than that
  from the API's, NTP is broken — fix that, not the window.

## Not an internal endpoint — Postgres backups

The weekly `pg_dump` portable export and monthly restore-test are scheduled crons too, but **not** API endpoints. They run outside the API process (your scheduler invokes `pg_dump` directly against the DB, streams to S3). See [`./DISASTER-RECOVERY.md`](DISASTER-RECOVERY.md) — copy-paste recipes for GitHub Actions, Railway Cron, and K8s CronJob, plus the restore runbook. PITR delegated to the managed Postgres provider (Neon/Supabase/RDS/Railway).
