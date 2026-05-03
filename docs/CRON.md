# Cron / scheduled jobs

clean-stack stays **scheduler-agnostic**. The boilerplate ships protected
internal endpoints (`POST /internal/<job>`); you wire your own scheduler.

## Endpoints

| Endpoint | Body | What it does |
|---|---|---|
| `POST /internal/gdpr-sweep` | `{ batchSize?: number; dryRun?: boolean }` | Wipes accounts whose 7-day grace window has elapsed (`pendingDeletionUntil <= now AND deletedAt IS NULL`). Idempotent, returns `{ processed, succeeded, failed, dryRun }`. |

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

The boilerplate ships `apps/api/scripts/internal-fetch.ts`. Same module the
caller imports; same canonical-message function the API uses to verify.

```ts
// my-cron.ts
import { signedInternalFetch } from "@apps/api/scripts/internal-fetch";

const res = await signedInternalFetch({
  baseUrl: process.env.INTERNAL_API_URL!,   // https://api.railway.internal:3000
  method: "POST",
  path: "/internal/gdpr-sweep",
  body: { dryRun: false },
  signingKey: process.env.INTERNAL_SIGNING_KEY!,
});
if (!res.ok) throw new Error(`gdpr-sweep failed: ${res.status} ${await res.text()}`);
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
// railway.json (cron service)
{
  "deploy": {
    "startCommand": "bun apps/api/scripts/cron/gdpr-sweep.ts",
    "cronSchedule": "0 3 * * *"
  }
}
```

### GitHub Actions cron

```yaml
# .github/workflows/gdpr-sweep.yml
name: GDPR sweep
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
      - run: bun apps/api/scripts/cron/gdpr-sweep.ts
        env:
          INTERNAL_API_URL: ${{ secrets.API_URL }}
          INTERNAL_SIGNING_KEY: ${{ secrets.INTERNAL_SIGNING_KEY }}
```

`apps/api/scripts/cron/gdpr-sweep.ts` is a 10-line wrapper around
`signedInternalFetch` — drop it next to your scheduler config.

### K8s CronJob

Build a small image that includes the script and run it on a schedule:

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: gdpr-sweep
spec:
  schedule: "0 3 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: gdpr-sweep
              image: your-registry/cron-runner:latest
              command: ["bun", "apps/api/scripts/cron/gdpr-sweep.ts"]
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
- **Batched**: default `batchSize=50` (configurable via `GDPR_SWEEP_BATCH_SIZE`
  env var or per-call body). For large pending queues, schedule the cron
  more frequently rather than raising the batch size.
- **Failures don't cascade**: a failure on one user is logged and the sweep
  continues. The response includes a `failed` array with `userId` and
  `errorCode` for follow-up.
- **Observability**: each invocation logs through `pino` at `info` (with
  counts) on success and `warn` on partial failure.
- **Replay window**: 30s. If your scheduler's clock drifts more than that
  from the API's, NTP is broken — fix that, not the window.
