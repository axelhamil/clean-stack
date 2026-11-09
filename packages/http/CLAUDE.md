# http rules

The HTTP kit a module's routes are written against: the zod request validator, time-id cursor pagination, the route-guard contract and the retention sweep rail. Auto-loaded under `packages/http/`. Consumer: `apps/api` (and every `@modules/<name>` once modules move). Server conventions (RPC chaining, error envelope): `apps/api/CLAUDE.md`.

## Layout

```
src/
  validator.ts                 `zV`: a failed parse throws `REQUEST_INVALID` (fields in `metadata`) to the host error handler, so the RPC response type stays clean
  error-handler.ts             `createErrorHandler({ instrumentation, logger, isProduction })`: the one `onError` envelope, the host binds its telemetry, logger and environment
  time-id-cursor.ts            keyset cursor on `(time, id)`: `timeIdCursorSchema` (decode), `encodeTimeIdCursor`, `afterTimeIdCursor` (`WHERE`), `exactInstant`
  route-guards.ts              `RouteGuards` contract, `RouteGuard`, `RouteEnv`
  sweep-runner.ts              `runRetentionSweep`, `runBatchedSweep`, `sweepBodySchema`, `releaseLease`: the batched, time-boxed, single-flight sweep loop
  sweep-purge.ts               `purgeBatchWithTimeout`, `withSweepGuards`, `requireFilter`: the batched delete under its `SET LOCAL` guards
  sweep-count.ts               `countEligibleWithTimeout`: the bounded dry-run count
  sweep-span.ts                `sweepSpans(instrumentation)`: the per-request span facade with its batch budget
  sweep-heartbeat.ts           `withSweepHeartbeat`, `beatOfSweep`: one `SweepRun` row per run
  sweep-result.ts              `classifySweepResult`: skipped, batch error, truncated or ok
  sweep-cadence.ts             `isSweepLate`: the late threshold per label
  sweep-run.port.ts            `ISweepRunStore`, `SweepRun`, `SweepOutcome`
  testing/route-guards.ts      `openRouteGuards(requester)`: every gate open, for a module's route tests
```

## Rules

1. **The package declares the guards, the host implements them.** `RouteGuards` lists the gates a route may stack (auth, org, org permission, policies, impersonation, staff, step-up, feature, plan, quota) and the request reads that depend on them (`currentUserId`, `signedInUserId`, `currentOrgId`, `activeOrgId`, `clientIp`, `currentSession`, `currentStaff`) plus the in-handler step-up check (`assertStepUp`), so a route never types the session itself; no guard is implemented here. The host implements it from its middlewares and hands it to the modules that mount routes. **Why**: a guard needs the session, the billing state and the policy store, all host infrastructure; implemented in the kit, it would drag that infrastructure into every module that imports a route helper.
2. **`RouteGuards` is generic over the feature and quota keys** (`RouteGuards<Feature, QuotaKey>`): the plan catalog lives in the host, so the kit takes its keys as type parameters instead of importing them.
3. **The package reads no environment, and its only write is the sweep purge.** `purgeBatchWithTimeout` deletes from the table its caller names, never from a table of its own; the lease, the heartbeat store and the route that reads the env stay in the host. `src/__TESTS__/layering.test.ts` enforces it. **Why**: a kit that reads env cannot be reused by a module or tested without a full `.env`, and pinning the one write keeps any other from slipping in.
