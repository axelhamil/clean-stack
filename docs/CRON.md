# Cron / scheduled jobs

clean-stack stays **scheduler-agnostic**. The boilerplate ships protected
internal endpoints (`POST /internal/<job>`); you wire your own scheduler.

## Endpoints

| Endpoint | Body | What it does |
|---|---|---|
| `POST /internal/rgpd-sweep` | `{ batchSize?: number; dryRun?: boolean }` | Wipes accounts whose 7-day grace window has elapsed (`pendingDeletionUntil <= now AND deletedAt IS NULL`). Idempotent, returns `{ processed, succeeded, failed, dryRun }`. |

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

### `POST /internal/audit-log-purge` — sweep operational audit rows

Purges audit log entries with `retention='operational'` older than N days. `retention='compliance'` rows are immutable (7 years).

Body: `{ olderThanDays?: number, dryRun?: boolean }` (default 90 days, dryRun off). Response: `{ deleted: number, dryRun: boolean, cutoff: <ISO> }`.

Schedule: daily at 3:30 (avoid overlap with RGPD sweep). Same scheduler patterns (Railway/Fly/GitHub Actions/Kubernetes/Inngest) as `/internal/rgpd-sweep` above.
- **Replay window**: 30s. If your scheduler's clock drifts more than that
  from the API's, NTP is broken — fix that, not the window.
