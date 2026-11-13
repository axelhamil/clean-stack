# Audit: modules/billing and modules/quotas

Read-only. Paths are relative to the repo root. Checks were not re-run (tests counted from source with grep, plus the existing .turbo logs, which for quotas are stale: log shows 9 tests, source has 18).

## Where the CURRENT guide (modules/CLAUDE.md) differs from the target, and these modules follow the guide

| Target | Current guide (followed here) | Where it shows |
|---|---|---|
| T1 domain only for real DDD | "domain/: only pure rules or ddd-kit primitives", cites `billing/src/domain/entitlements.ts` and `quotas/src/domain/quota-remaining.ts` as the model (modules/CLAUDE.md "Folders") | both `domain/` folders |
| T2 `infra/`, `__tests__/` | `infrastructure/`, `__TESTS__/` | both modules |
| T5 `repos/`, `routes/<route>/<route>.ts` + schema | `infrastructure/repositories/*.store.ts`, one `http/<name>.routes.ts` | 5 stores, `billing.routes.ts` |
| T6/T7 use cases only | "Orchestration defaults to application/services/", use cases only with an aggregate; billing "never DDD, never use cases" | 3 services, route calls services |
| T7 reads go through use cases | "Queries: Controller -> Query (direct ORM, no use case)", and "a route may read its own tables" (contract 6) | n/a here, routes call services |
| T4 `application/dto/` removed | guide keeps `application/dto/` | no dto folder in either module |
| T3 domain per concept | guide has flat `domain/*.ts` | `domain/entitlements.ts`, `domain/quota-remaining.ts` |
| (no target rule) `application/config/` | guide lists it | `billing-settings.ts`, `quota-period.ts` |

Everything else (ports in `application/ports/`, stores in `infrastructure/`, factories, `<Name>Prerequisites`) matches both.

---

## modules/billing

### 1. Real responsibility
Maps a Stripe subscription (synced into the `subscription` table by the BetterAuth stripe plugin in the host) to a code-defined plan entitlement view (tier, features, seats, quotas), serves the plan catalog and the billing portal URL. It also owns the Stripe-side plumbing the admin module and the auth plugin consume: webhook delivery bookkeeping, event retrieve/redeliver, sync verification, plan override storage.

### 2. Business or technical, DDD justified?
Technical / integration module with a config-driven policy. No DDD domain is justified.
- `src/domain/entitlements.ts:13-32` `ENTITLEMENTS` is a constant table (3 tiers). `:34-66` are 7 pure helpers (`isTier`, `entitlementsForTier`, `rankOf`, `hasFeature`, `meetsPlan`, `hasSeatAvailable`, `quotaLimit`): each is `includes`, `>=`, `<`, or a lookup. No aggregate, entity, value object, id, event or `Result`.
- `EntitlementsView` (`:46-50`) is a read model / response shape, not a domain object.
- Only invariant with persistence weight: "one open plan override per org", enforced by a unique partial index (`schemas/billing.ts:73-75`) and `onConflictDoNothing` (`infrastructure/repositories/drizzle-plan-override.store.ts:99-102`). The business rules around overrides (who may set, expiry, audit) live in `modules/admin/src/application/services/plan-override.service.ts`, not here.
- `application/subscription-events.ts:4-35`: owner-only authorization (`authorizeSubscriptionReference`), event-type mapping from Stripe status. Pure functions, no state.
- `application/ports/stripe-event.port.ts:5-15` `isReplayableStripeEvent`: a rule (5 event types) living in a port file.
Verdict: no `domain/`. What is in `domain/` is configuration plus lookups (the guide's own "does it fit in includes()" test, modules/CLAUDE.md "Layers").

### 3. Current tree of `src/` (31 files incl. 9 tests)
| Folder | Files |
|---|---|
| `src/` root | `billing.module.ts` |
| `domain/` | 1 (`entitlements.ts`) |
| `application/` root | 1 (`subscription-events.ts`) |
| `application/config/` | 1 |
| `application/ports/` | 7 |
| `application/services/` | 3 |
| `infrastructure/` root | 1 (`stripe-client.ts`) |
| `infrastructure/adapters/` | 5 (billing-portal gateway, catalog source, event gateway, payment-failure, sync-verifier) |
| `infrastructure/repositories/` | 4 `.store.ts` |
| `infrastructure/http/` | 1 |
| `__TESTS__/` | 9 |
Outside src: `schemas/billing.ts` (3 tables: `subscription`, `stripeEvent`, `planOverride`), `package.json`, `tsconfig.json`. No `scripts/`, no `bunfig.toml`, no `CLAUDE.md`.

### 4. Service vs use case
| Class | Real nature | Public methods | Would split into |
|---|---|---|---|
| `application/services/billing-catalog.service.ts` `BillingCatalogService` | Application service with in-memory TTL cache (`:22`, `TTL_MS` `:19`, `Date.now`), joins provider prices to the entitlement table (`:62-81`), degrades to free on provider failure (`:60`). Cache = technical concern | `getCatalog` (`:51`), `configuredPriceIds` (`:45`) | 2 use cases (`GetPlanCatalog`, `ListConfiguredPriceIds`) plus a cache decorator in `infra/` |
| `application/services/entitlements.service.ts` `EntitlementsService` | Use-case orchestration over 3 reads, fail-closed policy (`:46-60`) | `getEntitlements` (`:41`, swallows errors to free), `readEntitlements` (`:65`, returns `Result`) | 2 use cases (`GetEntitlements`, `ReadEntitlements`); the two variants differ by error policy only |
| `application/services/billing-portal.service.ts` `BillingPortalService` | Use case (read customer id, call gateway) | `openPortal` (`:13`) | 1 use case `OpenBillingPortal` |
| `infrastructure/adapters/stripe-sync-verifier.ts` `StripeSyncVerifier` | Mis-placed application service: orchestrates `ISubscriptionSyncStore` + `IStripeEventGateway` + a price-id callback (`:23-27`). Depends on `Stripe.Event` types only for input | `check` (`:29`) | 1 use case `VerifyStripeSync`, moved out of adapters; host binds it as `IStripeSyncCheck` (`composition/sources/auth.ts:58`) |
Technical services (correctly in `infra`, contract in `application/ports`): `StripeBillingPortalGateway`, `StripeCatalogSource`, `StripeEventGateway`.
Total: 5 use cases from 4 classes.

### 5. HTTP routes (`src/infrastructure/http/billing.routes.ts`)
| Route | Guards | Calls directly | Validation |
|---|---|---|---|
| `GET /billing/plans` (`:19`) | none | `deps.BillingCatalogService.getCatalog()` (`:20`), service | no input |
| `GET /billing/subscription` (`:24`) | requireAuth, requireOrg | `deps.EntitlementsService.getEntitlements(...)` (`:25`), returns the domain `EntitlementsView` unmapped | no input |
| `POST /billing/portal` (`:29`) | auth, policies, denyImpersonated, org, `billing:manage` | builds `returnUrl` from raw `Origin` header (`:37`), `deps.BillingPortalService.openPortal` (`:38`) | none: the `Origin` header is read unvalidated and concatenated. No Zod, no validator. No `as` casts. |
No repository, ORM or transaction call in the route. T7 broken only because it targets services, T8 broken for the `Origin` header. Mounted `apps/api/src/app.ts:275`; frozen in `apps/api/shape/routes.txt:33,34,71`. `/billing/portal` also in a rate-limited list `app.ts:125`.

### 6. Event handlers
None (grep `onEvent` in module: 0). The module reacts to no event. The `stripe` onEvent callback is in the host: `apps/api/src/auth/plugins/stripe.ts:162-171` (calls `handleStripeEvent`, `recordStripeDelivery`, `deps.stripeSync.check`).

### 7. Events emitted
The module emits zero events. All `billing.*` emission is in the host:
| Event | Declared | Emitted at | Kind |
|---|---|---|---|
| `billing.subscription.created/updated/cancelled` | `packages/events/src/event-types.ts:61-63` | `apps/api/src/auth/plugins/stripe.ts:53-90` (called from 4 plugin callbacks `:121-160`) | application event (no aggregate; mirrors a provider callback) |
| `billing.payment.failed` | `event-types.ts:64` | `stripe.ts:24-37` | application event |
| `billing.quota.exceeded` | `event-types.ts:65` | `apps/api/src/shared/middleware/billing.middleware.ts:48-64` | application event (operational retention) |
Pure helpers feeding them live in the module (`subscription-events.ts:22-35`, `infrastructure/adapters/stripe-payment-failure.ts:10-27`).

### 8. Technical implementations in `application/`, ports missing or misplaced
- `application/services/billing-catalog.service.ts:22,52,86`: process-local cache and `Date.now` default in application code.
- `application/ports/stripe-event.port.ts:5-15` function with logic in a port file; `:47` `StripeWebhookHandler = (request: Request) => Promise<Response>` leaks the web `Request`/`Response` shape into a port.
- `infrastructure/adapters/stripe-sync-verifier.ts` is application logic placed in adapters (section 4). `stripe-payment-failure.ts` is a pure mapper placed in adapters but consumed by the host.
- `infrastructure/stripe-client.ts:4-8` factory at infra root, not in `adapters/`; `billing.module.ts:31` binds the raw `Stripe` client as a container key `StripeClient`, which the host consumes (`composition/sources/auth.ts:42`).
- `IPlanOverrideStore`, `IStripeEventStore`, `IStripeEventGateway` ports in billing are consumed by no code inside billing except via `Pick`/gateway (`EntitlementsService` uses `IPlanOverrideReader`, `:38`). Their consumers are `modules/admin` (own copies in `modules/admin/src/application/ports/{plan-override,stripe-event,entitlements-reader}.port.ts`, bound by name in the container) and the host auth plugin. So the same port shape exists twice by design (guide contract 3), billing's copy being the provider-side declaration.
- Missing: `IPlanCatalog`, `IStripeSyncCheck` are declared by the host (`apps/api/src/auth/deps.ts`) and bound to billing classes (`composition/sources/auth.ts:57-58`). Missing: no `IEventPublisher` need (module emits nothing).
Implementations all in `infrastructure/adapters/` and `infrastructure/repositories/`, correct side.

### 9. Scattered conversions that belong in mappers
- `infrastructure/repositories/drizzle-stripe-event.store.ts:27-33` `toRow` (row to record, drops `replayClaimedAt`).
- `drizzle-subscription-sync.store.ts:41-44` inline `cancelAtPeriodEnd ?? false` mapping.
- `drizzle-subscription-read.store.ts:46-48` inline `Option` mapping.
- `adapters/stripe-catalog.source.ts:29-49` Stripe price to `StripePriceLite` (provider conversion, stays infra).
- `application/services/billing-catalog.service.ts:30-43,62-81` price + entitlement to `PlanCatalogItem`, and `buildFreeEntry`.
- `application/services/entitlements.service.ts:9-32` `freeView` and `viewOf` (tier resolution plus view building; this is policy, arguably a domain service, not a mapper).
- `adapters/stripe-sync-verifier.ts:18-20` `keyOf`; `adapters/stripe-payment-failure.ts:10-27`.
- `billing.module.ts:55-56` settings `Option` to `string | undefined`.
- Host: `apps/api/src/auth/plugins/stripe.ts:107-112` catalog to plugin plans (with `as string` at `:111`); `:67-90` payload building.

### 10. DTO locations
No `dto/` folder, no Zod schema in the module. Response/record types sit in other files: `PlanCatalogItem` in `application/services/billing-catalog.service.ts:6-17`; `EntitlementsView` in `domain/entitlements.ts:46-50`; `SubscriptionRow`, `BillingError` in `ports/subscription-read.port.ts:3-8`; `ActivePlanOverride`, `NewPlanOverride` in `ports/plan-override.port.ts:5-21`; `StripeEventRow`, `StripeEventDelivery` in `ports/stripe-event.port.ts:17-30`. Route output is the raw `EntitlementsView` / `PlanCatalogItem[]` (no presenter).

### 11. Layer violations and ddd-kit gaps
- No import from `infrastructure`, `drizzle`, `hono` or `stripe` in `domain/` or `application/` (greps on the files read; `layering.test.ts` passes per log). `check:boundaries` not re-run here.
- `domain/entitlements.ts:1` imports `Tier` from `@packages/access-control` (kit, allowed).
- Ids are bare `string` everywhere (`organizationId: string` in all ports, `ActivePlanOverride.id`, `referenceId`); no `<name>-id.ts`. `tier: string` in `SubscriptionRow`, `ActivePlanOverride`, `StripePriceLite` while `Tier` exists; `status: string` in `SubscriptionRow:7` and `EntitlementsView:49`.
- `Result`/`Option` are used correctly in ports (`Result<Option<T>, E>`, no `T | null`). Exceptions: `IEntitlementsReader.getEntitlements` (`entitlements-reader.port.ts:8`) returns a bare view and swallows failures to free (`entitlements.service.ts:46-58`); `IStripeEventGateway.isConfigured(): boolean`.
- `AppErrorException` thrown in the route (`billing.routes.ts:39`), consistent with the central handler.
- No aggregate, entity, VO, event in the module; none is needed (section 2).

### 12. Folder and naming gaps (T2 to T5)
| Gap | Where |
|---|---|
| `infrastructure/` instead of `infra/` | whole tree (15 files) |
| `__TESTS__/` instead of `__tests__/` | 9 files |
| `domain/` flat file with config and helpers (T1/T3) | `domain/entitlements.ts` |
| `application/subscription-events.ts` loose at layer root | not in T4 list |
| `application/config/` (not in T4) | `billing-settings.ts` |
| `application/services/` holds use cases (T6) | 3 files |
| `infrastructure/repositories/*.store.ts` (T5 `repos/`) | 4 files |
| `infrastructure/http/billing.routes.ts` single file, no `<route>.schema.ts`, no controller | 1 file |
| `infrastructure/stripe-client.ts` at infra root | 1 file |
| `adapters/stripe-sync-verifier.ts` is a service, `adapters/stripe-payment-failure.ts` a mapper | 2 files |
| `*.gateway.ts` / `*.source.ts` naming in adapters | 3 files |

### 13. Dependencies
- Packages (`modules/billing/package.json:35-45`): access-control, ddd-kit, drizzle, events, http, drizzle-orm, hono, inwire, stripe.
- Other modules: none imported. Reads kit tables: `user.stripeCustomerId` (`drizzle-subscription-sync.store.ts:62-64`, allowed by contract 5); schema references `organization` and `user` (`schemas/billing.ts:1-2,62-68`).
- Table `subscription` is owned by billing's schema but written by the BetterAuth stripe plugin in the host (`apps/api/src/auth/create-auth.ts:62` spreads `billingSchema` into the adapter schema). The module reads it only.
- Host binds: `billingSettings` (`apps/api/src/composition/settings.ts:108-111,175`), `IInstrumentation`. Reacts to no event.
- Exports (20) and non-test importers (grep `@modules/billing`):
  - `billing.module`: `container.ts:4`
  - `application/config/billing-settings`: `composition/settings.ts:5`
  - `domain/entitlements`: `shared/middleware/billing.middleware.ts:1-7`, `composition/route-guards.ts:1`, `auth/entitlements.ts:1`, `auth/seats.ts:1`, scripts `check-scim-seats.ts:21`, 4 test files
  - `ports/entitlements-reader.port`: `auth/deps.ts:1`, `composition/sources/auth.ts:2`
  - `ports/stripe-event.port`: `auth/deps.ts:2`, `auth/plugins/stripe.ts:2`, `composition/sources/auth.ts:3`, `composition/sources/admin.ts:4` (`isReplayableStripeEvent`)
  - `services/billing-catalog.service`, `adapters/stripe-sync-verifier`: `composition/sources/auth.ts:4,5` (types)
  - `application/subscription-events`, `adapters/stripe-payment-failure`: `auth/plugins/stripe.ts:3-8`
  - `adapters/stripe-event.gateway`: `scripts/check-admin-ops.ts:11` only
  - `http/billing.routes`: `app.ts:13`
  - `schemas/*`: `auth/create-auth.ts:8`, `shared/internal-routes/sweep-stripe-events.route.ts:3`, scripts `check-admin-accounts.ts:10`, `check-admin-ops.ts:12`, `check-scim-connection.ts:18`
  - No non-test importer found: `ports/billing-portal.port`, `plan-override.port`, `stripe-catalog.port`, `subscription-read.port`, `subscription-sync.port`, `services/billing-portal.service`, `services/entitlements.service` (classes reach the host through the container, not by import).

### 14. Tests and migration risks
- 9 files, 54 `it(` by grep (turbo log: 55 pass, 0 fail): catalog (5), portal (4), entitlements service (10), pure entitlements (9), layering (1), payment-failed (3), stripe event gateway (6), sync verifier (12), subscription events (4). Behaviour tests with fakes; none touches a real database.
- No `scripts/check-*.ts` in the module. Real-DB checks that import billing live in the host: `apps/api/scripts/check-admin-accounts.ts` (uses `di.IPlanOverrideStore`, `planOverride` table), `check-admin-ops.ts`, `check-scim-seats.ts`, `check-scim-connection.ts`.
- Risks: (a) frozen API shape, 3 routes (`apps/api/shape/routes.txt:33,34,71`) and the `EntitlementsView` type in `app-type.d.ts.snap`; moving `EntitlementsView` out of `domain/` changes import specifiers only, but `check:api-shape` must be proven structural (guide "Moving a module here"). (b) `domain/entitlements` import path used by 4 host files, 1 script, 4+ tests. (c) Container key names are the contract with `modules/admin` (`EntitlementsService`, `IPlanOverrideStore`, `IStripeEventStore`, `IStripeEventGateway`, `isReplayableStripeEvent`, see `modules/admin/src/admin.module.ts:69-73`); renaming a service to use cases breaks admin wiring and `composition/sources/auth.ts:40,50-51`. (d) Stripe webhook behaviour is exercised only through the host plugin; no module-level test of `handleStripeEvent`. (e) `layering.test.ts` (`assertModuleLayering`) assumes the current folder names; it must be updated with `infra/`.

### 15. Verdict
Partially conform. It is a clean technical module on the current guide and violates the target mainly by naming, a fake `domain/`, services in place of use cases, and no HTTP validation. Effort: M (L if the host-side billing logic below is pulled in).
Ordered corrections:
1. Rename `infrastructure/` to `infra/`, `__TESTS__` to `__tests__`, `repositories/` to `repos/` (`.store.ts` kept or renamed), update `layering.test.ts` and the dependency-cruiser rules; no API drift.
2. Delete `domain/`: move `ENTITLEMENTS` and helpers to `application/config/` (or `application/entitlements/`), update 4 host files, 1 script, tests.
3. Move `isReplayableStripeEvent` out of the port file; move `subscription-events.ts` and `stripe-payment-failure.ts` to where their consumer layer fits; move `StripeSyncVerifier` to a use case.
4. Convert 3 services to 5 use cases (`GetPlanCatalog`, `ListConfiguredPriceIds`, `GetEntitlements`, `ReadEntitlements`, `OpenBillingPortal`) plus `VerifyStripeSync`; extract the catalog cache to an infra decorator; keep container keys stable for admin.
5. Routes: Zod `Origin` header validation in `<route>.schema.ts`, route calls use cases, a presenter for `EntitlementsView` and `PlanCatalogItem`.
6. Introduce typed `Tier`/`OrganizationId` at port boundaries and mappers (`toRow`, `viewOf`, catalog items).
7. Host-side extraction (separate step): see "Billing and quota logic outside the modules".

---

## modules/quotas

### 1. Real responsibility
Counts usage per organization, resource and period in a `quota_usage` table, and exposes a helper that takes a per-org advisory lock, counts rows and throws when a limit is hit. In practice only two one-line pure functions are used; the counter store and the reservation helper have no caller.

### 2. Business or technical, DDD justified?
Technical, thin, and arguably not a module under the guide's own test ("Not a module: removing the module leaves only its module file plus one port implementation", modules/CLAUDE.md "Ports" 3): no use case, no DTO, no routes, one store, one helper.
- `src/domain/quota-remaining.ts:3-5` `hasQuotaRemaining(used, limit)` is `limit === null || used < limit`. `:7-17` `quotaExceededError` builds an `AppErrorException` with code `BILLING_QUOTA_EXCEEDED`. No aggregate, no invariant, and the error is an exception, not a `Result`.
- `src/application/config/quota-period.ts:5-13` `currentPeriodFor`: a pure function, lifetime fallback.
Verdict: no DDD domain. The limits themselves are in billing (`ENTITLEMENTS[tier].quotas`).

### 3. Current tree of `src/` (11 files)
| Folder | Files |
|---|---|
| `src/` root | `quotas.module.ts` |
| `domain/` | 1 |
| `application/config/` | 1 |
| `application/ports/` | 1 |
| `infrastructure/` root | 1 (`quota-reservation.ts`) |
| `infrastructure/repositories/` | 1 |
| `__TESTS__/` | 5 |
Outside: `schemas/quota-usage.ts` (1 table), package.json, tsconfig.json. No `scripts/`, no `CLAUDE.md`.

### 4. Service vs use case
No `application/services`, no `infrastructure/services`. `infrastructure/quota-reservation.ts` holds two free functions:
| Function | Real nature | Split |
|---|---|---|
| `reserveQuota` (`:23-39`) | Application orchestration (lock + count + decide) written against the ORM; requires an ambient transaction (`:30-34`, throws `Error`), calls `lockForTransaction` (`:36`) and throws `AppErrorException` (`:38`) | 1 use case `ReserveQuota` with ports `IAdvisoryLock` and a count port; `Result` instead of throw |
| `countScopedRows` (`:11-21`) | Technical query: takes an `AnyPgTable` and a column, does `select count(*)` through `resolveExecutor()` | 1 repository method / adapter |
`IQuotaUsageStore` (3 methods `increment`, `current`, `reset`) is a port with a counter semantics; its methods are 3 use-case candidates only if a caller ever exists.

### 5. HTTP routes
None. No `http/` folder, no route factory, no export for routes. T7/T8 not applicable.

### 6. Event handlers
None.

### 7. Events emitted
None from the module. The only quota event, `billing.quota.exceeded` (`packages/events/src/event-types.ts:65`), is emitted by the host in `apps/api/src/shared/middleware/billing.middleware.ts:48-64` (application event). The module's `quotaExceededError` is the only shared piece (`billing.middleware.ts:8,31,79`).

### 8. Technical implementations in `application/`, ports missing or misplaced
- `application/` is clean (one port, one pure function).
- `infrastructure/quota-reservation.ts` contains application orchestration with direct ORM and lock access (`@packages/drizzle` imports `:1-8`), at the infra root rather than `adapters/`.
- Missing ports: advisory lock (`lockForTransaction`), row counter (`countScopedRows` takes drizzle types in its signature `:11-15`), ambient-transaction check.
- `QuotaKey` (`"uploads" | "projects" | "apiCallsPerMonth"`) is declared in billing's domain (`billing/src/domain/entitlements.ts:4`), but quotas types its `resource` as plain `string` (`quota-usage.port.ts:10-18`), so key vocabulary is split across modules.
- Implementation of `IQuotaUsageStore`: `infrastructure/repositories/drizzle-quota-usage.store.ts` (bound in `quotas.module.ts:10-15`).

### 9. Scattered conversions
None of note. `usageRowOf` (`drizzle-quota-usage.store.ts:15-21`) is a query helper; `row?.used ?? 0` is inline in `increment :59` and `current :89`. No mapper needed.

### 10. DTO locations
None. `QuotaPeriod` and `QuotaError` live in the port (`quota-usage.port.ts:3,5`).

### 11. Layer violations and ddd-kit gaps
- `domain/quota-remaining.ts:1,8-16` creates and returns an `AppErrorException` from the domain layer (ddd-kit primitive, no framework, passes boundaries) but it is an exception-style API contradicting the `Result` convention; the code prefix `BILLING_` lives in the quotas module.
- `quota-usage.port.ts:3` hand-writes `QuotaError = { code: "QUOTA_PROVIDER_FAILURE"; message: string }` instead of `AppError<"QUOTA_PROVIDER_FAILURE">` (billing uses `AppError<...>` everywhere).
- `reserveQuota` throws `Error` and `AppErrorException` (`quota-reservation.ts:31,38`): no `Result`.
- `orgId`/`resource` are `string`; no typed ids.
- `drizzle-quota-usage.store.ts:50,109` uses `new Date()` (app clock) while billing stores use `dbNow`; `:41` generates ids with `uuidv7()` inside the store.
- `application/config/quota-period.ts` is not config, it is a pure function; and it imports a type from `../ports/quota-usage.port` (fine).

### 12. Folder and naming gaps
`infrastructure/` vs `infra/`; `__TESTS__/` vs `__tests__/`; `domain/` flat file (T1/T3); `application/config/quota-period.ts` (function, not config); `infrastructure/quota-reservation.ts` at infra root; `repositories/*.store.ts`.

### 13. Dependencies
- Packages (`modules/quotas/package.json:21-26`): ddd-kit, drizzle, drizzle-orm, inwire. No import of billing (the limit is passed in by the caller).
- Table: `quota_usage` (references kit `organization`, `schemas/quota-usage.ts:1,8-10`). Owned by quotas; migration present (`packages/drizzle/migrations/meta/0011_snapshot.json:1629`). No reader or writer elsewhere (grep `quotaUsage|quota_usage` outside the module: only migration snapshots).
- Host binds: only `IInstrumentation`. Events reacted: none.
- Exports and importers: `quotas.module` -> `container.ts:9`; `domain/quota-remaining` -> `shared/middleware/billing.middleware.ts:8`; `application/ports/quota-usage.port` -> none; `infrastructure/quota-reservation` -> none (tests only); `schemas/*` -> none. `currentPeriodFor` is not exported and is used by its test only (`__TESTS__/quota-period.test.ts:2`).
- Dead surface (grep, no non-test caller): `IQuotaUsageStore` (and the container key), `DrizzleQuotaUsageStore.increment/current/reset`, `reserveQuota`, `countScopedRows`, `currentPeriodFor`. `apps/app/CLAUDE.md:167` mentions `reserveQuota` as the backend enforcement, but nothing calls it.

### 14. Tests and migration risks
- 5 files, 18 `it(` by grep (layering 1, period 2, remaining 3, reservation 6, store 6). Turbo log in `.turbo/turbo-test.log` shows 9 and is stale. Store tests use mocks, not a real DB; no `scripts/check-*.ts`.
- Risks: low. Nothing in the frozen API shape. Only runtime link is `hasQuotaRemaining`/`quotaExceededError` in `billing.middleware.ts`. The `quota_usage` table has a migration, so dropping the module needs a drop-table migration or the schema must stay exported for drizzle config. Any merge into billing changes 1 host import (`billing.middleware.ts:8`) and the `container.ts:9,216` registration.

### 15. Verdict
Partially conform on structure, non conform on purpose (module with almost no live code). Effort: S.
Ordered corrections:
1. Decide the fate before renaming anything: either fold into billing (quota is an entitlement concern; `QuotaKey`, limits and the exceeded error then live together) or delete the dead surface (`IQuotaUsageStore`, store, `currentPeriodFor`, `reserveQuota`, `countScopedRows`, table) and keep one error helper.
2. If kept: drop `domain/`, move the two functions to `application/`, make `quotaExceeded` a typed `AppError` `Result`-style error, rename `infrastructure/` to `infra/`, `__TESTS__` to `__tests__`, move `reserveQuota` into a use case with ports for lock and count.
3. Replace the hand-written `QuotaError` by `AppError<...>`; type `resource` as `QuotaKey`.
4. Refresh the turbo log expectations; update `layering.test.ts` for the new folders.

---

## Billing and quota logic outside the modules (host `apps/api/src`)

| File | What lives there | Note |
|---|---|---|
| `shared/middleware/billing.middleware.ts` (82 lines) | `requireFeature` (`:34`), `requirePlan` (`:41`), `requireQuota` (`:66`), `assertFeature/Plan/Quota` (`:22-32`), `paymentRequired` code `BILLING_PAYMENT_REQUIRED` (`:19`), quota-exceeded event emission with try/catch fallback (`:48-64,73-78`), reads `di.EntitlementsService` directly through the global container (`:36,43,69`) | The gate logic the guide intentionally keeps as middleware; `requireQuota` has no non-test caller. Uses the global `di`, not injected deps. |
| `composition/route-guards.ts:1,21,46-48` | exposes the three guards as `RouteGuards<Feature, QuotaKey>` | binds `packages/http/src/route-guards.ts:28-30` |
| `organization/routes.ts:67` | `requireFeature("sso")` on SCIM connection | only live caller of any billing guard |
| `auth/seats.ts:7-31` | seat cap: `getEntitlements`, per-org lock (`lockSeatsOf`, `auth/queries.ts:243,531`), member count, `hasSeatAvailable` | seat business rule, host-side |
| `auth/organization-seats.ts`, `auth/plugins/organization.ts:11-14`, `auth/scim-membership.ts:6,102`, `auth/plugins/scim.ts` | seat gate on invite, accept and SCIM provisioning | consumers of `seatCapFor` |
| `auth/entitlements.ts:5-34` | SSO entitlement gate (`SSO_PLAN_REQUIRED`, `SSO_ORGANIZATION_REQUIRED`) | throws BetterAuth `APIError` |
| `auth/plugins/stripe.ts` (173 lines) | webhook handling: payment-failure event (`:24-37`), delivery recording (`:40-46`), subscription event emission with owner lookup and derived event ids (`:53-90`), plan mapping with `as string` cast (`:111`), authorizeReference (`:113-120`), try/catch policy (`:162-171`) | the biggest billing-domain chunk outside the module; no unit of work boundary of its own |
| `composition/sources/auth.ts:40-77` | binds `EntitlementsService` as `IEntitlementsReader`, `BillingCatalogService` as `IPlanCatalog`, `StripeSyncVerifier` as `IStripeSyncCheck`, passes `StripeClient` to the plugin | host composition, legitimate |
| `composition/sources/admin.ts:4,20` | binds billing `isReplayableStripeEvent` to the admin `StripeReplayRule` port | legitimate (contract 3) |
| `shared/internal-routes/sweep-stripe-events.route.ts:3-19` | retention sweep of billing's `stripe_event` table | host reads module schema directly, consistent with other sweeps |
| `auth/create-auth.ts:62` | spreads `billingSchema` into the BetterAuth drizzle adapter | the `subscription` table is written by the plugin, not by the module |
| `composition/settings.ts:108-111,175` | builds `BillingSettings` from env | contract 2, legitimate |
| `app.ts:13,125,275` | mounts `createBillingRoutes`, rate-limit entry for `/billing/portal` | legitimate |
| `scripts/check-admin-accounts.ts`, `check-admin-ops.ts`, `check-scim-seats.ts`, `check-scim-connection.ts` | real-DB checks importing billing schema, store, gateway, `ENTITLEMENTS` | would break on path moves |

Frontend counterpart (not audited in depth): `apps/app/src/shared/auth/quota-gate.tsx`, `use-entitlements`, `apps/admin/src/features/orgs/components/plan-override-*.tsx`.

Counts: 24 non-test import lines of `@modules/billing` or `@modules/quotas` in `apps/api/src` (grep), plus 4 scripts under `apps/api/scripts`.

## Not checked
- `check:boundaries`, `check:api-shape`, type-check and the test suites were not run (read-only audit, existing logs only).
- `modules/admin` internals were read only for the ports it declares (names and bindings), not audited.
- `apps/api/src/auth/deps.ts` declaration of `IPlanCatalog` / `IStripeSyncCheck` was inferred from the import list in `composition/sources/auth.ts:17-21`, not opened.
- Frontend usage of the billing endpoints was not traced.
