# Health probes

Three endpoints, K8s 2026 convention (`*z` suffix), [IETF `draft-inadarei-api-health-check-06`](https://datatracker.ietf.org/doc/html/draft-inadarei-api-health-check-06) response format. Datadog/New Relic/Grafana parse the shape natively.

## Endpoints

| Endpoint | Purpose | Hits dependencies? | Status codes |
|---|---|---|---|
| `GET /livez` | Liveness — "is the process alive" | **No** (a DB outage must NOT restart pods — thundering-herd) | always `200` while the process runs |
| `GET /readyz` | Readiness — "can this pod serve traffic" | Yes — runs every registered check | `200` on `pass`/`warn`, `503` on `fail` or during shutdown grace |
| `GET /startupz` | Startup — "is initial bootstrap done" (K8s 1.16+) | No (in-memory latch) | `200` once `lifecycleState.markStarted()` fires, `503` before |

Mounted **outside** the middleware chain (`requestId` / `httpLogger` / `sessionMiddleware` / `cors`) — probes don't carry sessions, and a probe every 5 s would drown prod logs (~17 280/day per pod). They are also outside any future rate-limit gate.

## Response shape

```json
{
  "status": "pass" | "warn" | "fail",
  "checks": [
    {
      "name": "db:postgres",
      "result": { "status": "pass", "observedValue": 7, "observedUnit": "ms" },
      "durationMs": 8,
      "critical": true,
      "time": "2026-05-25T15:25:21.780Z"
    },
    {
      "name": "storage:s3",
      "result": { "status": "fail", "output": "bucket unreachable", "observedValue": 234, "observedUnit": "ms" },
      "durationMs": 234,
      "critical": false,
      "time": "2026-05-25T15:25:22.007Z"
    }
  ]
}
```

**Tri-state aggregation** (`pass`/`warn`/`fail`) — non-binary by design:

| Per-check outcome | Aggregated | HTTP |
|---|---|---|
| All `pass` | `pass` | `200` |
| Any non-critical `fail` or `warn` | `warn` | `200` (degraded but functional) |
| Any **critical** `fail` | `fail` | `503` (truly unhealthy — LB stops routing) |

DB down (critical) = `fail` + 503. Resend / storage hiccup (non-critical) = `warn` + 200. This avoids the "everything red because one dep flickered" trap.

**Prod payload minimal** — outside `NODE_ENV !== "production"`, only the top-level `status` + each check's `status` are returned (no `observedValue`, no `output`, no `durationMs`). Prevents leaking infra timings/error messages publicly.

## Registering a probe (from a new module)

Each module **owner of an external dependency** ships its own `XxxHealthProbe` class implementing `OnInit`. inwire's `preload()` (called once after `.build()`) fires `onInit()` and the probe self-registers — no manual wiring list to keep in sync.

```ts
// modules/billing/infrastructure/stripe-health-probe.ts
import type { OnInit } from "inwire";
import type { HealthCheckFn, IHealthCheckRegistry } from "../../../shared/ports/health.port";
import type { IBillingProvider } from "../../../shared/ports/billing.port";

export class StripeHealthProbe implements OnInit {
  constructor(
    private readonly registry: IHealthCheckRegistry,
    private readonly billing: IBillingProvider,
  ) {}

  onInit(): void {
    this.registry.register("billing:stripe", this.probe, { critical: false });
  }

  private readonly probe: HealthCheckFn = async () => {
    const start = performance.now();
    const ok = await this.billing.ping();
    const observedValue = Math.round(performance.now() - start);
    return ok
      ? { status: "pass", observedValue, observedUnit: "ms" }
      : { status: "fail", output: "stripe unreachable", observedValue, observedUnit: "ms" };
  };
}
```

```ts
// modules/billing/module.ts
declare module "inwire" {
  interface AppDeps {
    StripeHealthProbe: StripeHealthProbe;
    // …
  }
}

export const billingModule = defineModule()((b) =>
  b
    .add("IBillingProvider", () => new StripeAdapter())
    .add("StripeHealthProbe", (c) => new StripeHealthProbe(c.IHealthCheckRegistry, c.IBillingProvider)),
);
```

That's it. `trash modules/billing` removes both the binding and the probe — no orphan check, no stale registration.

**Decisor `critical: true` vs `false`** — flip to `true` only if the dep being down makes the api unable to serve **any** request meaningfully. DB = `true` (no business logic without it). Storage, email, billing = `false` (most routes work without them; let the LB keep traffic flowing, alerting handles the degraded state).

## Robustness — what's wired in

- **Self-cancelling timeout 5 s per check** (`runWithTimeout`) — a hanging probe can't block rolling deploys.
- **Asymmetric cache** — `pass` cached 30 s (don't hammer Resend at ~6 req/sec on PaaS probes), `fail` cached only 5 s (re-check fast, restore quickly). Industry-standard pattern.
- **No PII in fail payloads** — checks return generic `output` (`"bucket unreachable"`, `"timeout >5000ms"`), never stack traces or hostnames.

## Graceful shutdown — `/readyz` flips before workers stop

On `SIGTERM` / `SIGINT`:

1. `lifecycleState.signalShutdown()` — `/readyz` immediately returns `503` (status `"fail"`, output `"shutting down"`). The LB stops routing new requests within one probe interval (~5 s).
2. Wait `SHUTDOWN_GRACE_PERIOD_MS` (default `15000`, env-tunable) for in-flight requests to drain.
3. Stop the outbox dispatcher + webhook delivery worker (each with its own 25 s timeout).
4. `process.exit(0)`.

**Without this flip**, the pod accepts new requests while terminating → intermittent 502s during every deploy. Visible to end-users.

The flag lives in `apps/api/src/shared/shutdown.ts` as a process-level singleton (same pattern as `env.ts` / `logger.ts` — it's lifecycle state, not business state). `lifecycleState.markStarted()` is fired after workers have booted, gating `/startupz`.

## Env vars

| Var | Default | Purpose |
|---|---|---|
| `GIT_SHA` | `"unknown"` | Surfaced in `/livez` + `/startupz` payload (`version` = first 12 chars). Inject at CI build via `GIT_SHA=$(git rev-parse HEAD)` for release tracking. |
| `BUILD_TIME` | `"unknown"` | ISO timestamp of the build, surfaced in `/livez` + `/startupz`. Inject at CI: `BUILD_TIME=$(date -u +%FT%TZ)`. |
| `SHUTDOWN_GRACE_PERIOD_MS` | `15000` | Time between SIGTERM and worker stop (window for LB to redirect + in-flight requests to drain). Tune per PaaS. |

## Deploy target recipes

### Railway (`railway.toml`)

```toml
[deploy]
healthcheckPath = "/readyz"
healthcheckTimeout = 10
restartPolicyType = "ON_FAILURE"
```

### Fly.io (`fly.toml`)

```toml
[[services.http_checks]]
  interval = "10s"
  timeout = "5s"
  grace_period = "30s"
  method = "get"
  path = "/readyz"
```

### Render (`render.yaml`)

```yaml
services:
  - type: web
    healthCheckPath: /readyz
```

### Kubernetes

```yaml
livenessProbe:
  httpGet: { path: /livez, port: 3000 }
  initialDelaySeconds: 10
  periodSeconds: 30
  failureThreshold: 3

readinessProbe:
  httpGet: { path: /readyz, port: 3000 }
  initialDelaySeconds: 5
  periodSeconds: 5
  failureThreshold: 2

startupProbe:
  httpGet: { path: /startupz, port: 3000 }
  initialDelaySeconds: 0
  periodSeconds: 2
  failureThreshold: 30   # ~60 s max boot time
```

### Cloud Run / App Runner

Use `/readyz` as the startup probe and pin `min_instances ≥ 1` (the api holds a Postgres `LISTEN` connection — scale-to-zero kills the outbox dispatcher; see [`docs/EVENTS.md`](EVENTS.md)).

### Vercel / Netlify / Lambda

Not applicable — the api is **not deployable on serverless functions** (same reason as the outbox dispatcher). See README "Deployment" + [`docs/EVENTS.md`](EVENTS.md#deployment-requirements).

## Monitoring integration

- **Datadog / New Relic** — point a synthetic monitor at `/readyz`. The draft-inadarei envelope is parsed natively; check-level latencies become metrics automatically.
- **Grafana** — Phase 0.4 (observability module) will expose `up{check="db:postgres"}` + `health_check_duration_ms{check}` from the same registry via `/metrics`. No registry rework needed.
- **Sentry** — register no probe; let `/readyz 503` trigger PagerDuty / Opsgenie / Slack via your alerting pipeline.
