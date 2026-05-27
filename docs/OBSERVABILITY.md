# Observability — Phase 0.4 (Sentry only)

clean-stack ships error tracking + tracing primitives via Sentry on the API (`@sentry/bun`) and the front (`@sentry/react`). Prometheus `/metrics` is **deferred** to Phase D.1 — see [Deferred](#deferred-otel-prometheus).

## What you get out of the box

- **Error capture** on every `>= 500` HTTP response (api) and every uncaught React render error (app).
- **Tags** auto-populated on every event: `requestId`, `userId`, `orgId`, `path`, `method`.
- **Payload scrubbing** RGPD-clean by default — `Cookie`, `Authorization`, request body, query string, `email`, `username`, `ip_address` are stripped before transmission.
- **Pino integration** — every `logger.warn` / `logger.error` becomes a Sentry breadcrumb attached to the next captured event. Single source of truth for logs.
- **Repository / service spans** — every Drizzle repo, S3, Resend method is wrapped with a Sentry span (`startSpan`) for distributed tracing. `tracesSampleRate=0` by default keeps overhead near zero; flip > 0 in Phase D.1 once a tracing backend consumes them.
- **Release tracking** ties to `GIT_SHA` injected at CI build (shared with the `/livez` payload from Phase 0.2).
- **NoOp by default** — without `SENTRY_DSN`, zero telemetry leaves the host. Binary on/off via env.

## Architecture — one port, two impls, DI everywhere

```
apps/api/src/shared/
  ports/instrumentation.port.ts        IInstrumentation { startSpan, capture, addBreadcrumb }
  services/
    noop-instrumentation.ts            Always-bound default — silent passthrough
    sentry-instrumentation.ts          Wraps Sentry.startSpan + captureException + addBreadcrumb
    sentry-init.ts                     Side-effect Sentry.init() at module load if SENTRY_DSN

apps/api/src/container.ts              Conditional binding: SentryInstrumentation if DSN, else NoOpInstrumentation
```

Every repository / external-I/O service receives `IInstrumentation` via constructor injection (inwire). Same pattern as `IEmailService` / `IStorageService` — no service-locator, no module-level singleton, no DI override magic. `trash`-able provider swap = change 1 binding in `container.ts`.

For the HTTP error path, `error.middleware.ts` exports a `createErrorHandler(instrumentation)` factory called once in `index.ts` after `di.build()` — avoids any future cycle between the middleware and the container.

## Setup

### API

```bash
SENTRY_DSN=https://...@o0.ingest.sentry.io/0      # or *.eu.sentry.io for EU residency
SENTRY_ENVIRONMENT=production                      # defaults to NODE_ENV
SENTRY_TRACES_SAMPLE_RATE=0                        # deferred — keep 0 until D.1 tracing backend lands
GIT_SHA=...                                        # CI-injected, shared with /livez
```

Sentry init runs via side-effect import `import "./shared/services/sentry-init"` placed as the first import of `apps/api/src/index.ts` — order matters: the SDK hooks async-hooks before pino, Hono, Drizzle attach handlers.

### App

```bash
VITE_SENTRY_DSN=https://...@o0.ingest.sentry.io/0
VITE_SENTRY_ENVIRONMENT=production
VITE_GIT_SHA=...
```

`<Sentry.ErrorBoundary>` already wraps the provider tree in `apps/app/src/shared/app-providers.tsx` with a fallback UI.

### CI — source maps upload (production builds)

`@sentry/vite-plugin` uploads source maps when these CI-only env vars are set:

```bash
SENTRY_AUTH_TOKEN=...   # https://sentry.io/settings/<org>/auth-tokens/
SENTRY_ORG=<your-org-slug>
SENTRY_PROJECT=<project-slug>
VITE_GIT_SHA=$GITHUB_SHA
```

Without these the plugin is no-op; the build emits `.map` files locally but never uploads.

## Repository / service instrumentation pattern

Every infrastructure-level repository and external-I/O service wraps its public methods with a Sentry span + `instrumentation.capture()` on caught errors. Pattern inspired by [nikolovlazar/nextjs-clean-architecture](https://github.com/nikolovlazar/nextjs-clean-architecture/blob/main/src/infrastructure/repositories/todos.repository.ts), adapted to the codebase's `Result<T, E>` discipline + DI:

```ts
import type { IInstrumentation } from "../../../../shared/ports/instrumentation.port";

export class DrizzleFooRepository implements IFooRepository {
  constructor(private readonly instrumentation: IInstrumentation) {}

  async create(input: FooInput, tx?: Transaction): Promise<Result<Foo, FooError>> {
    const exec = tx ?? db;
    return this.instrumentation.startSpan(
      { name: "DrizzleFooRepository > create" },
      async () => {
        try {
          const query = exec.insert(foos).values(input).returning();
          const [row] = await this.instrumentation.startSpan(
            { name: query.toSQL().sql, op: "db.query", attributes: { "db.system.name": "postgresql" } },
            () => query.execute(),
          );
          return Result.ok(toRecord(row));
        } catch (err) {
          this.instrumentation.capture(err);
          return fail(err, "create failed");
        }
      },
    );
  }
}
```

**Rules**:

- **Outer span** wraps the entire method body: `{ name: "ClassName > methodName" }`. No `op`, no attributes — it's the method-level boundary.
- **Inner span** wraps only the `query.execute()` (or external `client.send()` / `fetch()` call): `{ name: query.toSQL().sql, op: "db.query", attributes: { "db.system.name": "postgresql" } }`. For HTTP I/O, use `op: "http.client"` + relevant attrs (`http.method`, `rpc.system`).
- **`const exec = tx ?? db`** lives **outside** the `startSpan` callback (the `tx ?? db` resolution shouldn't pollute the span duration — Lazar convention).
- **catch + capture + return-or-rethrow**: for methods returning `Promise<Result<T, E>>`, call `this.instrumentation.capture(err)` inside the existing `catch` block, then `return fail(...)`. For methods returning `Promise<T>` (throwing on infra failure), capture + rethrow. Never swallow.
- **Multi-query methods** (e.g., `executeWipe` running 7+ DELETEs): keep only the outer span — 7 inner spans = noise. Single-statement methods always get an inner span.
- **Span composition**: don't call sibling repo methods that themselves open spans from within a span — the inner spans become orphaned siblings rather than children. Inline the query instead.
- **Why no-op without `SENTRY_DSN`**: `IInstrumentation` resolves to `NoOpInstrumentation` (callback passthrough, no allocation). Zero cost beyond the function call.
- **Tracing dormant**: `SENTRY_TRACES_SAMPLE_RATE=0` (default) means even when `SENTRY_DSN` is set, spans aren't exported — they're recorded in memory by the SDK and dropped. Set > 0 only when a tracing backend consumes them (Phase D.1).

Applied to: `DrizzleOutboxRepository`, `DrizzleAuditRepository`, `ResendEmailService`, `DrizzleRgpdRepository`, `S3StorageService`, `DrizzleWebhookEndpointRepository`, `DrizzleWebhookDeliveryRepository`, `AuditQueryService`. Use-case / application services are not wrapped — they orchestrate repos that already are.

## Manual error reporting

If you need to capture an error explicitly (e.g. background job, ignored promise):

**API** (anywhere with access to `di`):

```ts
import { di } from "../container";

di.IInstrumentation.capture(err, { requestId, userId, orgId, metadata: { jobId } });
di.IInstrumentation.addBreadcrumb({ message: "job started", level: "info", data: { jobId } });
```

Inside a class that already receives `IInstrumentation` via constructor:

```ts
this.instrumentation.capture(err, { requestId });
```

**App**:

```ts
import { addBreadcrumb, captureError } from "@/shared/observability/sentry";

captureError(err, { feature: "checkout", step: "stripe-redirect" });
addBreadcrumb("user clicked checkout", { plan: "pro" });
```

## Removability — flip one binding, no call-site change

The whole Sentry stack is one DI binding plus one side-effect import. The call sites (`this.instrumentation.capture(...)`, `this.instrumentation.startSpan(...)`, `<ErrorBoundary>`) never change — they resolve to NoOp when Sentry is disabled.

To remove Sentry entirely:

1. **API binding**: edit `apps/api/src/container.ts` → replace the `IInstrumentation` factory by `() => new NoOpInstrumentation()` (drop the conditional). `trash apps/api/src/shared/services/sentry-{init,instrumentation}.ts`. Remove the `import "./shared/services/sentry-init"` line from `index.ts`.
2. **Front**: in `apps/app/src/shared/app-providers.tsx`, swap `from "./observability/sentry"` to `from "./observability/noop"`. `trash apps/app/src/shared/observability/sentry.ts`.
3. **Build plugin**: remove the `@sentry/vite-plugin` block from `apps/app/vite.config.ts` (revert to `plugins: [react(), tailwindcss()]`).
4. **Packages**: `pnpm remove @sentry/bun --filter=api && pnpm remove @sentry/react @sentry/vite-plugin --filter=app`.
5. **Env**: unset `SENTRY_DSN`, `VITE_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` (and drop the matching `.env.example` blocks if you like).

**Validation**: `pnpm ci:check && pnpm type-check && pnpm test` must stay green. Every call site keeps working via NoOp. Zero refactor.

## Provider swap — Sentry → GlitchTip / Highlight

The Sentry SDK protocol (DSN format) is implemented by [GlitchTip](https://glitchtip.com) (self-hosted, FOSS) and [Highlight](https://highlight.io). Swap = DSN change:

```bash
SENTRY_DSN=https://<public-key>@glitchtip.your-domain.com/<project-id>
```

No code change. For a non-compatible provider, replace `SentryInstrumentation` with your own `IInstrumentation` impl. The port (`apps/api/src/shared/ports/instrumentation.port.ts`) is the contract.

## Privacy / EU residency

- `sendDefaultPii: false` is hard-coded.
- `beforeSend` strips `Cookie`, `Authorization`, `x-csrf-token`, request body, query string, user `email`, `username`, `ip_address` before transmission. Whitelist-based (default = drop).
- For EU clients, use a `*.eu.sentry.io` DSN — Sentry stores all data in Frankfurt.

If you ship a non-trivial scrubbing exception, document it inline in `sentry-init.ts` and update this section.

### Sentry UI — Data Scrubber (server-side defense in depth)

`beforeSend` handles client-side scrubbing, but a custom exception or a future SDK regression could bypass it. Enable server-side scrubbing in **Sentry Settings → Security & Privacy → Data Scrubber → Additional Sensitive Fields**:

```
email, password, token, authorization, cookie, set-cookie, x-csrf-token, session
```

This is a Sentry-project-level setting (not code), applied to every event before storage. It acts as a second scrub pass: even if a field slips through `beforeSend`, Sentry redacts it at ingestion. Required for RGPD compliance when the `beforeSend` whitelist is extended.

## Deferred — OTel + Prometheus

Phase 0.4 ships **only** Sentry. The other observability pieces are intentionally deferred:

### OpenTelemetry tracing — deferred

**Why**: under Bun 1.3+ in 2026, OTel auto-instrumentation for `Bun.serve()` is broken; spans must be added manually for HTTP, DB, and outbound fetch. `@hono/otel` + `@kubiks/otel-drizzle` exist and work, but the wiring cost buys no value until a consumer (Grafana Tempo, Jaeger, Sentry Performance) is wired in Phase D.1. Bun is also expected to ship native OTel — waiting avoids a refactor. **The spans already shipped via `IInstrumentation.startSpan` will be reused** — they sit in the Sentry SDK and become live the moment `SENTRY_TRACES_SAMPLE_RATE > 0`.

### Prometheus `/metrics` — deferred

**Why**: `prom-client` is the SOTA pick for `/metrics` (Julius Volz confirmed native Prometheus instrumentation over OTel push in 2025/2026), but exposing `/metrics` without a Grafana scrape is code with no consumer. The 30 LOC + `X-Metrics-Token` gate are trivial to add when D.1 lands.

**When to wire**: at Phase D.1, alongside SLO dashboards. The health check registry from Phase 0.2 already exports `up{check}` state — drop-in for the metric.

### Sentry Performance / `tracesSampleRate > 0` — coupled to OTel

Sentry can consume OTel spans natively. `SENTRY_TRACES_SAMPLE_RATE` stays at `0` until OTel wiring lands. Setting it higher today emits half-instrumented traces (Sentry-only HTTP entry spans, no DB/fetch children) — but the repo/service spans already shipped will flow through.

### Session Replay — deferred (privacy review)

`@sentry/replay` exists but ships its own bundle (~15KB gzipped) and needs a privacy-first config (`maskAllText: true`, `maskAllInputs: true`, redact images). Out of scope for 0.4 — to be enabled behind a separate `VITE_SENTRY_REPLAY=true` flag with audited defaults.
