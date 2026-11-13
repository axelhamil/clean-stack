# Audit of the API host `apps/api/src` against the target rules T1 to T13

Read-only. Paths are relative to `the repo root` unless stated. Line numbers are from the tree as read (branch `develop`, clean). Counts come from `find`, `grep` or direct reading; anything not run is marked "not verified".

Basis for counts: 138 non-test files in `apps/api/src` (141 with the 3 helper files that live in `__TESTS__` dirs), 88 `*.test.ts` files in `src` and `scripts`, 12 modules in `modules/`.

| Host context | Non-test files |
|---|---|
| `auth/` (28 root + 3 `hooks/` + 6 `plugins/`) | 37 |
| `shared/` (8 root, 15 `internal-routes`, 17 `middleware`, 8 `ports`, 16 `services`, 3 `surface`) | 67 |
| `composition/` (3 + 4 `sources/`) | 7 |
| `cron/` | 7 |
| `health/` (4 + 2 `infrastructure/`) | 6 |
| `public-api/` (2 + 3 `v1/`) | 5 |
| `organization/` | 2 |
| `queries/` | 1 |
| root (`app.ts`, `container.ts`, `index.ts`, `client.ts`, `migrate.ts`, `server-options.ts`) | 6 |
| Total | 138 |

---

## A. Host contexts: responsibility and classification

Legend: C = pure composition, T = technical integration, B = business logic that would deserve a module under the target (T1: a technical module has no `domain/`).

| Context | Responsibility | Class | Evidence |
|---|---|---|---|
| `app.ts` (282 l.) | Hono construction, global middleware chain, mounts of 21 module route factories (18 in the typed chain `app.ts:258-276`, 3 outside: `:222`, `:223`, `:256`), plus 7 host-owned mounts | C with HTTP policy | Policy tables live here: `CSRF_GUARDED_PATHS` `:116-128`, `AUTH_RATE_LIMITS` `:133-148`, rate-limit wiring `:194-210`, `/api/auth/*` pass-through `:219`. Policy is declarative but is host code a module cannot own. |
| `container.ts` (262 l.) | inwire root: 21 host `.add()` (`:100-208`), 12 `.addModule()` of business modules + `healthModule` + 3 host source modules, `.build()` | C | Also contains technical wiring with real config: `EmailDeliveryWorker` (`:125-144`), `OutboxDispatcher`/`OutboxRelay` (`:227-258`). |
| `index.ts` | Server entry, workers start (`di.OutboxDispatcher`, `WebhookDeliveryWorker`, `EmailDeliveryWorker`, `NotificationStreamHub`, `index.ts:32-35`), shutdown | C | no rules |
| `composition/` (7 files) | `settings.ts` (env to 11 typed module settings + `authSettings`), `sources/{admin,auth,notifications,rgpd}.ts`, `route-guards.ts`, `auth-provider.ts` | C, with 2 leaks | `sources/rgpd.ts:18-29` `staffAccessRules` is a logic adapter that imports admin application services and admin infra; `auth-provider.ts` is a traced technical adapter (`BetterAuthProvider`, 49 l.) over the `auth` singleton, not wiring. |
| `auth/` (37 files) | BetterAuth singleton (`create-auth.ts`), 3 hook factories, 6 plugin factories, event bridge, data access (`queries.ts`, 546 l., 23 query functions exposed at `:517-540`), SCIM projection, SSO rules | T that embeds B | See list below. `auth/index.ts:15` `export const auth = createAuth(di.authDeps)` is the only file importing the container, and `AuthDeps` (`deps.ts:40-61`, 20 keys) is already a `Prerequisites`-shaped interface. |
| `organization/` (2 files) | Owner-only SCIM connection management and SSO enforcement toggle for the org settings page | B | `scim-connection.service.ts` (297 l.) 3 use cases with invariants (one active connection per org `:50`, rotation revokes every other credential `:147-164`, token lifetime 365 days `:44`, users-only scopes `:37`, per-org lock `:232-240`); `routes.ts` 4 routes. Imports the `auth` singleton directly (`:14`). |
| `health/` (6 files) | Health registry (`in-memory-health-check-registry.ts`, 91 l.), DB probe, 3 probe routes + `/internal/build-info` | T | `modules/CLAUDE.md:63` test "removing the module leaves only a module file plus one port implementation": holds. `uploads` consumes `IHealthCheckRegistry` through its own prerequisite (`uploads.module.ts`). `health/module.ts` is already a `defineModule()` with no prerequisites, imported by `container.ts:41`. |
| `public-api/` (5 files) | `/api/v1` mount (`index.ts:21-33`): IP rate limit, `requireApiToken`, token rate limit, 3 routes | C (mount + guards) with 1 route holding B | `v1/me.routes.ts:29-43` runs a write plus event in the route (see B, T7). |
| `cron/` (7 files) | Standalone processes that sign and POST to `/internal/*` (`internal-job.ts`), heartbeat, own env | T | No DI, no module import. Reads only `shared/internal-routes/internal-fetch.ts` and `@packages/http/sweep-result`. `sweep.ts:9-19` lists 9 paths, 2 of which (`sweep-admin-approvals`, `sweep-admin-impersonations`) are served by `@modules/admin`. |
| `queries/` (1 file) | `StaffRecipientsQuery` implements notifications' `IStaffRecipientsReader` (`staff-recipients.query.ts:72-104`) over admin `staff` tables and auth `user` | T (read adapter) | Allowed by contract 5; `.dependency-cruiser.cjs` rule `host-reads-modules-through-public-layers` limits it to `schemas/` and `application/ports/`. Contains a business rule (who is reachable staff, `:35-70`) that mirrors `staffAccessOf`. |
| `shared/middleware` (17) | Session, org, staff, policy, billing, api-token, CSRF, rate-limit | T, 4 files with B gating | `billing.middleware.ts` (feature/plan/quota gates, emits `BILLING_QUOTA_EXCEEDED` `:48-77`), `api-token.middleware.ts` (token lookup, pepper rotation, rehash, last-used write `:42-113`), `org.middleware.ts`, `staff.middleware.ts`. Reads the container through `di` in 5 of them. |
| `shared/internal-routes` (15) | HMAC and private-network gates, 7 sweep routes, flush route, CSP report route | T + B | 5 of 7 sweeps delete directly from module tables (`audit_log`, `consent_record`, `notification`, `stripe_event`, `webhook_delivery`) through `@modules/*/schemas/*`. `flush-notification-emails.route.ts` (259 l.) is notifications digest business logic in a route file. |
| `shared/services` (16) | Adapters (rate limiter, captcha, HIBP, geo, TOTP, stores, Sentry) and 2 services with rules | T + B | See C. |
| `shared/ports` (8), `shared/surface` (3), root (8: env, logger, shutdown, request-context...) | Host ports, route-parity tooling, process singletons | T | `surface/back-routes.ts` imports `routes` from `app.ts`. |

### What in `auth/` is business logic (evidence)

| File | Rule | Under the current doc |
|---|---|---|
| `personal-org.ts:28-77` | Every user owns exactly one Personal org, advisory lock, 3 events | invariant, but modelled as plain function over `AuthQueries` |
| `seats.ts:21-30`, `organization-seats.ts:9-21` | Seat cap with per-org lock under an ambient transaction | "config + middleware + hook" (`modules/CLAUDE.md:53`) |
| `entitlements.ts:19-32` | SSO plan gate | same |
| `scim-membership.ts` (166 l.) | SCIM projection: seat limit, plan, verified domain, RFC 7644 errors | rule set |
| `sso-enforcement.ts`, `hooks/before.ts:73-92`, `hooks/database.ts:72-92` | SSO enforced domains refuse non-SSO sign-in | rule |
| `password-policy.ts` (58 l.) | Password violation rules incl. breach | rule |
| `saml-config.ts` (44 l.) | Forces strong SAML algorithms | security rule |
| `scim-events.ts` (127 l.) | Derives SCIM and membership events from library calls | event projection |

### Verdict per context against T1

| Candidate | Becomes a module? | Reasoning |
|---|---|---|
| `auth` | Technical integration module without `domain/` (T1), not a DDD module | The library owns the model (`apps/api/CLAUDE.md:37`); the rules above are gates and projections, which `modules/CLAUDE.md:53` says are never DDD. Blockers: `auth/index.ts` imports the container; `SessionUser`/`SessionData` types come from the singleton and are used by `composition/route-guards.ts:7`, `shared/middleware/*`; `composition/auth-provider.ts`, `organization/scim-connection.service.ts` import the singleton; `AuthDeps` imports 6 `@modules/*` ports types and 5 `shared/ports`. `modules/CLAUDE.md:63` already tests this: removing it leaves more than a module file plus one port, so it does qualify as more than host platform code. |
| `organization` | Yes, small business module (SSO and SCIM directory settings) | 4 use cases (find, issueToken, disconnect, setSsoEnforcement via `AdminActionService`), 1 routes file, events `SCIM_CONNECTION_*`, `SSO_ENFORCEMENT_CHANGED`, `ORG_MEMBER_REMOVED`. Needs a port for the `auth.api.*SCIMManaged*` calls (currently `import { auth } from "../auth"` at `scim-connection.service.ts:14`), bound by the host. `AdminActionService` is also injected into `@modules/admin` routes (`admin-orgs.routes.ts:24`), so two modules would share one use case. |
| `health` | No | Fails the module test (`modules/CLAUDE.md:63`); keep as host platform. |
| `public-api` | No standalone module | It is a token-authenticated surface of other modules: `/me` belongs to `profile` (or account), `/organizations` to an organization read use case, `requireApiToken` to `api-token` (already imports its crypto from `@modules/api-token/domain/api-token-crypto`, `api-token.middleware.ts:3`). |
| `cron` | No | Pure technical, 0 business code. |
| `queries` | No | Contract 5 mandates the host. |
| `shared/internal-routes` flush route | Move to `notifications` | Uses only `INotificationDigestStore`, `IEmailService`, `ITransactionService` through `di` (`flush-notification-emails.route.ts:111-205`). |
| `shared/services/security-signals.service.ts` | Auth module (if created) | 3 methods, only consumer is auth through `ISecuritySignals` (`composition/sources/auth.ts:56`). |

---

## B. HTTP routes declared by the host

22 declarations, 20 `METHOD path` entries plus 2 `ALL`. Not counted: the 18 chained plus 3 module route factories mounted in `app.ts`, and the 3 module routes that `routes.txt` lists under `/internal` (`rgpd-sweep`, `sweep-admin-approvals`, `sweep-admin-impersonations`).

| # | Route | Declared at | Mounted at | Handler calls directly | Zod on params / query / body |
|---|---|---|---|---|---|
| 1 | `GET /livez` | `health/routes.ts:39` | `app.ts:150` | `uptimeMs()` | none needed |
| 2 | `GET /readyz` | `health/routes.ts:40` | `app.ts:150` | `lifecycleState`, `di.IHealthCheckRegistry.runAll()` (service locator, `:44`) | none needed |
| 3 | `GET /startupz` | `health/routes.ts:47` | `app.ts:150` | `lifecycleState` | none needed |
| 4 | `GET /internal/build-info` | `health/internal.routes.ts:9` | `app.ts:221` | `buildInfo()` reading `env` | none; HMAC gate `internalLayers` |
| 5 | `POST /csp-report` | `shared/internal-routes/csp-report.route.ts:92` | `app.ts:156` | `emitEventBestEffort(outbox)` `:206` | body: manual `c.req.text()` then `JSON.parse` `:101-111`, then `ReportsJsonSchema.safeParse` `:120` / `LegacyCspReportSchema.safeParse` `:161` (not `zV`); Content-Type branch on raw header `:98`; 0 casts |
| 6 | `POST /internal/sweep-audit-log` | `sweep-audit-log.route.ts:31` | `app.ts:225` | `runSweepRequest` then `purgeBatchWithTimeout` (ORM delete on `auditLog` table) | body `zV("json", sweepBodySchema)` (`@packages/http/validator` + `sweep-runner`) |
| 7 | `POST /internal/sweep-email-messages` | `sweep-email-messages.route.ts:55` | `app.ts:229` | same, table `emailMessage` | same `zV` |
| 8-12 | `POST /internal/sweep-{consents,notifications,outbox,stripe-events,webhook-delivery}` | `tableSweepRoute` `sweep-route.ts:99-124` (the 5 route files only call it) | `app.ts:224,226-228,230` | same, tables `consent_record`, `notification`, `outbox_event`, `stripe_event`, `webhook_delivery` | same `zV` at `sweep-route.ts:104` |
| 13 | `POST /internal/flush-notification-emails` | `flush-notification-emails.route.ts:250` | `app.ts:231` | `di.ITransactionService.run`, `di.INotificationDigestStore.{countDue,beginFlush,claimDue,dropUnwanted,markSent}`, `di.IEmailService.sendTemplateBatch`, `buildDigests`, `crypto.subtle.digest` (`:102-242`) | body `zV("json", bodySchema)` `:22,250` |
| 14 | `POST /settings/organization/sso-enforcement` | `organization/routes.ts:34-53` | `app.ts:273` | `di.AdminActionService.setSsoEnforcement` | body `zV("json", setSsoEnforcementBodySchema)` imported from `@modules/admin/application/dto/...` (`:1,41`) |
| 15 | `GET /settings/organization/scim-connection` | `organization/routes.ts:54` | `app.ts:273` | `scimSvc.find` where `scimSvc` is `new ScimConnectionService(...)` at module scope (`:13-18`); inline response mapping `:58-61` | none (orgId from session) |
| 16 | `POST /settings/organization/scim-connection` | `organization/routes.ts:64` | `app.ts:273` | `scimSvc.issueToken` | none |
| 17 | `DELETE /settings/organization/scim-connection` | `organization/routes.ts:80` | `app.ts:273` | `scimSvc.disconnect` | none |
| 18 | `GET /api/v1/me` | `public-api/v1/me.routes.ts:17` | `app.ts:233-250` | `meResponseSchema.parse({user: c.get("user")})` (output whitelist) | none |
| 19 | `PATCH /api/v1/me` | `me.routes.ts:20-47` | same | `di.ITransactionService.run`, `di.IUserAccountStore.setName`, `emitEvent(di.IOutboxRepository, USER_PROFILE_UPDATED)` (`:29-43`): store write, transaction and emit in the route | body `zV("json", patchMeSchema)` (`:14`, local schema) |
| 20 | `GET /api/v1/organizations` | `public-api/v1/organizations.routes.ts:7` | same | `queries.findUserOrganizations` (`AuthQueries`, ORM) | none |
| 21 | `ALL /api/auth/admin/*` | `app.ts:212` | n/a | static 404 | n/a |
| 22 | `ALL /api/auth/*` | `app.ts:219` | n/a | `auth.handler(c.req.raw)`: the library owns every route and its validation | by the library; host hooks read the body unvalidated (see casts) |

T7 and T8 verdicts for the host: of the 20 `METHOD path` entries, 3 call nothing but local state (`/livez`, `/startupz`, `/internal/build-info`), 17 reach a store, the ORM, a library or a container service directly instead of a use case (`/readyz` 1, `/csp-report` 1, 8 sweep and flush routes, 4 organization routes, 3 `/api/v1` routes). Only `PATCH /api/v1/me` also opens the transaction and emits in the route. T8 holds for all JSON bodies except `/csp-report` (manual parse). No route validates params or query (none take any). Header validation: none via Zod (`api-token.middleware.ts:42`, `csrf.middleware.ts:28-29`, `rate-limit.middleware.ts:55`, `internal-signature.middleware.ts:17,33-34`, `rate-limit.ip.ts:86`); query `token` read raw at `rate-limit.policies.ts:154`.

### `as` casts

40 `as X` (excluding `as const`, comments, imports) in non-test host code. By kind:

| Kind | Count | Where |
|---|---|---|
| Request body or params in BetterAuth hooks | 19 | `auth/hooks/before.ts:27,55,79,96,130,159,168,183,184,185,205,207` (12); `auth/hooks/after.ts:30,40,94,243,261` (5); `auth/scim-events.ts:75`; `auth/sso-paths.ts:73` |
| Library return value | 3 | `after.ts:195,221`, `scim-events.ts:74` |
| `c.get(...)` context variable | 8 | `shared/middleware/auth.middleware.ts:64,65`, `csrf.middleware.ts:50`, `rate-limit.middleware.ts:100`, `rate-limit.policies.ts:41,123,205`, `public-api/require-scope.ts:8` |
| DB row or other | 10 | `api-token.middleware.ts:90` (`record.scopes`), `plugins/stripe.ts:111`, `auth/email.ts:28`, `auth/session-payload.ts:5,12`, `rate-limit.ip.ts:14,17`, `rate-limiter-flexible.adapter.ts:36` (`as never`), `disposable-email.service.ts:8,45` |

No `as` on a Hono-validated request (`c.req.valid`). All request-data casts are in the auth bridge, because BetterAuth hands `ctx.body` as `unknown`.

---

## C. Services in the host

| Class or file | Public surface | What it really is | Would split into |
|---|---|---|---|
| `organization/scim-connection.service.ts` `ScimConnectionService` | `find`, `issueToken`, `disconnect` | Use case orchestration with business rules, over the auth library. Not a technical service. | 3 use cases + 1 port for `auth.api.*SCIMManaged*` |
| `shared/services/admin-action.service.ts` `AdminActionService` | `setSsoEnforcement` | Use case (write + event in one `uow.run`, `:26-42`); the `.service.ts` suffix misleads (T6) | 1 use case |
| `shared/services/security-signals.service.ts` `SecuritySignalsService` | `sessionFields`, `refuseDenied`, `reportImpossibleTravel` | Business rules (deny countries and ASNs `:105-112`, impossible travel `:65-103`) + best-effort emit | 2 use cases (`refuseDenied`, `reportImpossibleTravel`), `sessionFields` is a pure helper |
| `shared/services/backup-code-used-notifier.ts` | `backupCodeUsedNotifier` | Event handler with logic (reads `env.APP_URL`, resolves locale, sends template, `:19-33`), violates T10 | 1 use case "notify backup code used" + handler dispatch |
| `auth/personal-org.ts` `createPersonalOrg` | `ensurePersonalOrgFor` | Use case orchestration (lock, query, inserts, 3 events) | 1 use case |
| `auth/email.ts` `createEmailFlows`, `createMailer` | 5 flows (`sendChangeEmailConfirmation`, `sendResetPassword`, `beforeEmailVerification`, `sendVerificationEmail`, `sendMagicLink`) | Orchestration: write + event + email dispatch | up to 5 use cases; email building stays a technical adapter |
| `auth/seats.ts`, `entitlements.ts`, `organization-seats.ts`, `visitor.ts` | gates | Gates (config + hook), per `modules/CLAUDE.md:53` | none, remain hooks |
| `auth/emit.ts` `createEmitter` | `emit`, `emitBestEffort` | Technical adapter binding the outbox to hooks | event publisher port in application (T11) |
| `auth/scim-events.ts` | `emitScimUserEvents` | Event projection of a library call | handler-like, 1 |
| `auth/queries.ts` | 23 functions | Repository-like data access, no port, "not domain" (`queries.ts:2-5`) | repository port + `infra/repos` |
| `auth/unit-of-work-adapter.ts` | `asUnitOfWork` | Technical adapter | stays |
| `shared/services/drizzle-user-account.store.ts` | `findContact`, `setName` | Store (technical) | stays |
| `shared/services/drizzle-session-geo.store.ts`, `drizzle-sweep-run.store.ts` | stores | Technical | stay |
| `shared/services/drizzle-totp-verifier.ts` | `consume` (+ replay guard, decrypt) | Technical adapter with a security rule (replay counter `:61-100`); ports declared by admin and rgpd separately (`ITotpVerifier`) | stays |
| `shared/services/{hibp-password-breach, disposable-email, siteverify-captcha, noop-captcha, header-ip-geo, rate-limiter-flexible.adapter}` | external integrations | Technical services, ports in `shared/ports/` | stay (ports move to `application/ports/`) |
| `shared/services/{logging,sentry}-instrumentation`, `sentry-init` | | Technical | stay |
| `composition/auth-provider.ts` `BetterAuthProvider` | 4 methods | Technical adapter (admin's `IAuthProvider`) | moves next to the auth module's `infra/adapters/` |

Counts: 16 files in `shared/services`; 2 business services (`AdminActionService`, `SecuritySignalsService`), 1 handler, 13 technical.

---

## D. Events emitted by the host

51 distinct `EventTypes.*` referenced in non-test host code (`USER_MFA_BACKUP_CODE_USED` is both emitted and consumed). 56 emit call sites. None is emitted by an aggregate: the host has no aggregate, so under T9 all are application events, even though the catalog names them as domain facts.

| Where | Sites | Mechanism | Same transaction as the write? |
|---|---|---|---|
| `auth/hooks/after.ts` | 16 (`:49,83,101,129,141,145,149,155,166,171,178,185,203,227,246,265`) + `emitScimUserEvents` `:122` | `emit` on the BetterAuth `hooks.after` | No. Runs after the endpoint committed, no `uow.run` wrapper; autocommit on the pool (documented in `auth/scim-events.ts:51-53`, `emit-event` doc "outside one it autocommits", `packages/outbox/src/event-emitter.ts`). Window: state without event if the process dies between. `SSO_LOGIN_FAILURE` `:49` is a telemetry event on a rejected call. |
| `auth/hooks/database.ts` | 3 (`:41,114,133`) + `ensurePersonalOrgFor` `:29` | `databaseHooks` | Joins the BetterAuth adapter transaction (every adapter transaction is an outermost unit of work, `auth/create-auth.ts:52-56`, `unit-of-work-adapter.ts:25-37`, `emit.ts:25-31`). `:38` also wraps in `deps.uow.run`. Not verified per hook by execution; claim is from code comments and `check:auth-transaction`. |
| `auth/plugins/organization.ts` | 10 (`:48,63,77,86,104,115,125,140,155,171`) | `organizationHooks.after*` | Joins the plugin transaction (same adapter). `afterRemoveMember` `:112-122` adds its own `uow.run` for `deleteOrgIfEmpty` + `ORG_DELETED`. |
| `auth/personal-org.ts` | 3 (`:34,61,68`) | `uow.run` `:29` | Yes, same unit as the inserts. |
| `auth/email.ts` | 3 (`:125,144,175`) | email flows | `:125` yes (inside `uow.run` with `setPendingEmail`); `:144` and `:175` no write, notification events outside any unit. |
| `auth/create-auth.ts:89` | 1 | `onPasswordReset` | Outside any unit visible in the file; the library has already written the password. |
| `auth/plugins/clear-expired-ban.ts:20` | 1 | `databaseHooks.session.create.before` | Yes, `uow.run` `:18` with `clearExpiredBan`. |
| `auth/plugins/stripe.ts` | 2 (`:29`, `:68`; `:68` serves 4 callbacks `:121-160`) | Stripe plugin callbacks | No `uow.run` in file. Idempotent via `derivedEventId` (`:35,81-88`). Not verified whether the plugin invokes the callback inside its own transaction. |
| `auth/scim-events.ts` | 3 (`:36,96,102`) | after-hook projection | No (after commit, `:53`). |
| `auth/hooks/before.ts` | 3 (`:112,193,229`) | `emitBestEffort` | No state change; refusal telemetry, failure logged only. |
| `shared/services/security-signals.service.ts` | 2 (`:45,83`) | `emitEventBestEffort` | No state change. |
| `organization/scim-connection.service.ts` | 2 call sites (`:206` `ORG_MEMBER_REMOVED`, `:262` helper for 3 `SCIM_CONNECTION_*` types) | `emitCommitted` on a savepoint `:246-252` | Same outer unit as the lock (`serialized` `:236`), but emitted after the library committed on its own connection; a failed emit is captured and swallowed (`:250`) to avoid returning a revoked token without replacement. Residual window documented in `apps/api/CLAUDE.md:85`. |
| `shared/services/admin-action.service.ts:29` | 1 | `uow.run` `:26` | Yes. |
| `public-api/v1/me.routes.ts:33` | 1 | in route, `ITransactionService.run` `:29` | Yes. |
| `shared/middleware/api-token.middleware.ts:117` | 1 `API_TOKEN_USED` | `deps.uow.run` `:113` with last-used bucket write | Yes. |
| `shared/middleware/{csrf,rate-limit}.middleware.ts`, `billing.middleware.ts`, `shared/internal-routes/csp-report.route.ts` | 4 | best-effort / quota refusal | No state change. |

Subscriptions owned by the host: 1 handler, `backupCodeUsedNotifier` on `USER_MFA_BACKUP_CODE_USED` (`shared/services/backup-code-used-notifier.ts:19`), registered in `container.ts:259`. It runs business logic itself (T10 gap).

---

## E. Composition root

### E1. How modules are mounted

- `container.ts:98-262`: `container().addModule(apiSettings(env))`, 13 host `.add()` of cross-cutting keys (`:100-208` includes instrumentation, logger, `AuthQueries`, sweep store, outbox, `ITransactionService`, email queue and service, `EmailDeliveryWorker`, breach, disposable email, rate limiter, captcha, geo, TOTP, session geo, user account, `SecuritySignalsService`, `AdminActionService`), then in order:
  `apiTokenModule`, `healthModule`, `uploadsModule`, `auditLogModule`, `webhooksModule`, `policyModule`, `consentModule`, `quotaModule`, `billingModule`, `notificationsSources`, `notificationsModule`, `profileModule`, `adminSources`, `adminModule`, `rgpdSources`, `rgpdModule`, `authSources`, then `OutboxDispatcher` and `BackupCodeUsedNotifier`. The order is a hard constraint (inwire refuses at compile time a module whose prerequisites are not yet on the builder).
- `declare module "inwire"` `AppDeps` augmentation `container.ts:72-96`, 21 keys.
- `app.ts:86-99`: `di.scope({routeGuards, internalGuards, runSweep, IAuthProvider, accountDeleteRateLimit})` produces `routeDeps`, passed to every route factory.
- `app.ts:258-276`: chain of 18 `.route()` for `AppType`; `:222-223,256`: 3 module routes outside the chain (2 internal, token-scanning).
- Event dispatcher: `container.ts:236` `buildEventDispatcher([AuditEventSubscriber, WebhookFanoutSubscriber, NotificationFanoutSubscriber], diLike)`. `packages/outbox/src/event-handlers.ts:21` auto-discovers any container value passing `isEventHandler` (by `onEvent`), so handlers need no registration list.

### E2. Ports bound by the host

"By key" means no host source file: the provider module `.add()`s a key with the same name and inwire resolves it structurally (provider `.add` in the module file).

| Consumer module | Port (declared by consumer) | Bound implementation | File |
|---|---|---|---|
| admin | `ILocaleReader` | `{localeOf: localeForUser(IProfileStore, id)}` (profile) | `composition/sources/admin.ts:16-19` |
| admin | `StripeReplayRule` `isReplayableStripeEvent` | `isReplayableStripeEvent` fn of billing | `sources/admin.ts:20` |
| admin | `StaffLookupOnce` `staffLookupOnce` | host request-scoped `staffLookupOnce` | `sources/admin.ts:21`, `shared/request-context.ts` |
| admin | `IDeadWebhookReader` as key `WebhooksService` | webhooks `WebhooksService` | by key (`webhooks.module.ts`) |
| admin | `IEntitlementsReader` as `EntitlementsService`, `IPlanOverrideStore`, `IStripeEventStore`, `IStripeEventGateway` | billing module | by key (`billing.module.ts`) |
| admin | `ITotpVerifier`, `ISweepRunStore`, `IEmailService`, `IOutboxRepository`, `ITransactionService`, `ILogger`, `IInstrumentation` | host `DrizzleTotpVerifier`, `DrizzleSweepRunStore`, `QueuedEmailService`, outbox, `TransactionService`, logger | `container.ts:107-118,181-184` |
| admin | `staffSettings`, `adminSettings` | env mapping | `composition/settings.ts` |
| admin (routes) | `IAuthProvider` | `BetterAuthProvider` | `app.ts:91`, `composition/auth-provider.ts` |
| admin (routes) | `ISsoEnforcement` as key `AdminActionService` | host `AdminActionService` | `container.ts:199-208`, consumed `admin-orgs.routes.ts:24` |
| api-token | `IUserContactReader` as `IUserAccountStore` | host `DrizzleUserAccountStore` | `container.ts:186-189` (by key) |
| notifications | `IStaffRecipientsReader` | `StaffRecipientsQuery` | `composition/sources/notifications.ts:10-15` |
| notifications | `staffSettings` | env mapping | `settings.ts` |
| rgpd | `IStaffAccessRules` | `staffAccessRules(outbox, staffSettings)` over admin `grantsStaffAccess`, `isLastManager`, `announceImpersonationsEnded` | `sources/rgpd.ts:18-29,40-43` |
| rgpd | `IApiTokenRevoker` | api-token `ApiTokenService` | `sources/rgpd.ts:44` |
| rgpd | `IStaffDataEraser` | admin `DrizzleStaffDataEraser` | `sources/rgpd.ts:45-48` |
| rgpd | `IEndedSessionsReader` | admin `endedImpersonationsOf` | `sources/rgpd.ts:49-52` |
| rgpd | `IStaffStore` | admin module | by key (`admin.module.ts:132-` list) |
| rgpd | `IExportStorage` as `IStorageService` | uploads module | by key |
| rgpd | `ITotpVerifier` | host | `container.ts:181` |
| uploads | `IHealthCheckRegistry` | host `healthModule` (`InMemoryHealthCheckRegistry`) | `container.ts:210`, `health/module.ts:15-19` |
| auth (host) | `IPlanCatalog` | billing `BillingCatalogService` | `sources/auth.ts:57` |
| auth | `IStripeSyncCheck` | billing `StripeSyncVerifier` | `sources/auth.ts:58` |
| auth | `IPolicyAcceptance` | policies `PolicyAcceptanceService` | `sources/auth.ts:59` |
| auth | `IConsentReconciler` | consents `ConsentService` | `sources/auth.ts:60` |
| auth | `IStaffSessionEnder` | admin `StaffService` | `sources/auth.ts:61` |
| auth | `ISecuritySignals` | host `SecuritySignalsService` | `sources/auth.ts:56` |
| auth | `IEntitlementsReader`, `IStripeEventStore`, `Stripe` client, `IProfileStore` | billing x3, profile | `sources/auth.ts:73-75,68` |
| audit-log, billing, consents, policies, profile, quotas, webhooks | no host-bound cross-module port (kit ports and settings only) | | |

### E3. Inter-module dependency map (through host-bound ports)

| Module | Depends on (via host-bound ports) | Counted |
|---|---|---|
| admin | profile (locale), billing (5 keys), webhooks (1 key), host auth provider | 3 modules |
| rgpd | admin (4 ports), api-token (1), uploads (1) | 3 modules |
| notifications | admin (read of `staff*` tables, via `queries/`) | 1 module |
| uploads | host health | 0 modules |
| api-token | host user account store | 0 modules |
| audit-log, billing, consents, policies, profile, quotas, webhooks | none | 0 |
| host `auth/` (not a module) | billing (4), policies (1), consents (1), admin (1), profile (1) | 5 modules |
| host `shared/middleware` + `public-api` | billing (`EntitlementsService`, `domain/entitlements`), quotas (`domain/quota-remaining`), admin (`StaffAccessService`, `StepUpService`), policies (`PolicyAcceptanceService`), api-token (`ApiTokenService` crypto, repo) | 5 modules |
| host `shared/internal-routes` | audit-log, consents, notifications, billing, webhooks schemas (5 table reads and deletes), notifications digest port | 5 modules |

Events of other modules subscribed to (user handlers; all 3 built-in subscribers subscribe to every catalog type by construction, `packages/outbox/src/event-handlers.ts:38-41`):

| Subscriber | Event | Emitter | File |
|---|---|---|---|
| api-token `revokeTokensOnMembershipLost` | `ORG_MEMBER_REMOVED` | host auth bridge (`plugins/organization.ts:104`, `scim-events.ts:102`) and `ScimConnectionService` (`:206`) | `modules/api-token/src/application/event-handlers/revoke-on-membership-lost.ts:22` |
| admin `closeApprovalsOfDeletedUser` | `USER_DELETED` | rgpd (not verified in this audit) | `modules/admin/src/application/event-handlers/close-approvals-of-deleted-user.ts:12` |
| admin `notifyImpersonatedUser` | `ADMIN_IMPERSONATION_STARTED` | admin | `.../notify-impersonated-user.ts:29` |
| host `backupCodeUsedNotifier` | `USER_MFA_BACKUP_CODE_USED` | host auth bridge `hooks/after.ts:83` | `shared/services/backup-code-used-notifier.ts:19` |
| audit-log, webhooks, notifications built-ins | all catalog types | all | `container.ts:236` |

Direct code imports from the host into modules, beyond the ports above: 173 import lines of `@modules/*` in 69 files (34 non-test, 35 tests and scripts), 94 distinct specifiers. In non-test `src`: 24 lines into `infrastructure/` (20 route factories, 2 admin repos in `sources/rgpd.ts:7-8`, `plugins/stripe.ts:8`, a type in `sources/auth.ts:5`), 11 into `application/services`, 3 into `application/dto`, 6 into `schemas/*`.

---

## F. Shared files touched by several module migrations

| File | What a restructuring forces |
|---|---|
| `apps/api/src/container.ts` (262 l.) | Imports 12 `*.module.ts` by path (`:1-12`); if a module file moves or renames, edit here. Insertion order of `.addModule` is load-bearing (`:209-225`). New modules (auth, organization) add a line each plus an `AppDeps` key in the augmentation (`:72-96`). Auth rewrite removes `AuthQueries`, `authSources`, `AdminActionService`, `SecuritySignalsService`, `ISessionGeoStore` keys. Splitting a service into use cases changes every `c.XService` consumer key: `EntitlementsService`, `StaffAccessService`, `StepUpService`, `PolicyAcceptanceService`, `WebhooksService`, `ApiTokenService` are read by host middleware (`billing.middleware.ts:36,43,69`, `staff.middleware.ts`, `policy.middleware.ts:18`, `auth.middleware.ts:39`). 13 non-test files import `di` (service locator). |
| `apps/api/src/app.ts` (282 l.) | 18 `import ... from "@modules/<x>/infrastructure/http/<y>.routes"` (`:2-21`, 20 imports incl. rgpd internal and scanning). `infrastructure` to `infra` or `routes/<name>/<name>.ts` (T5) rewrites every one of them plus the `exports` keys. Route mount order and prefixes decide `AppType`. A route factory renamed or converted from factory to use cases changes the `deps` it receives from `routeDeps` (`:86-99`). `export type { WebhookDeliveryStatus } from "@modules/webhooks/application/ports/webhook-delivery.port"` (`:282`) pins one port path that the typed client consumes. |
| `apps/api/src/composition/settings.ts` | Imports 11 `application/config/*-settings` paths (`:1-17`). T4 has no `config/` folder under `application/`: the location of module settings is undefined by the target and must be decided before any rename (one decision, 11 files). |
| `apps/api/src/composition/sources/{admin,rgpd,auth,notifications}.ts` | Import module application services and infra by exact path: `sources/rgpd.ts:1-13` (6 admin/api-token/rgpd paths incl. `infrastructure/repositories/*`), `sources/admin.ts:1-5`, `sources/auth.ts:1-8` (incl. `infrastructure/adapters/stripe-sync-verifier` type). Splitting `StaffService` or `ConsentService` into use cases breaks `IStaffSessionEnder`, `IConsentReconciler` bindings (`sources/auth.ts:59-61`): each port then needs its own use case binding. |
| `apps/api/src/auth/plugins/stripe.ts:3-8` | Imports `@modules/billing/application/subscription-events` and `infrastructure/adapters/stripe-payment-failure`: 2 paths. |
| `apps/api/package.json` | 12 `@modules/*` dependencies; host exports `.`, `./app`, `./client` (`src/index.ts`, `src/app.ts`, `src/client.ts`) consumed by the fronts through `hcWithType` and `AppType`. Adding a module adds a dependency line. |
| Module `package.json` `exports` (12 files) | Exports are per-file paths with `./src/` targets, e.g. admin has 41 export keys, all `./application/...`, `./infrastructure/...`, `./testing/...`, `./schemas/*`. Any folder rename or file split changes both key and target for every file the host or tests import (94 distinct specifiers in the host alone). `./testing/mount-admin-routes` is part of admin exports. |
| `.dependency-cruiser.cjs` (138 l.) | Hard-coded path regexes: `src/(domain|application)/` (rule `pure-module-domain-and-application`, `:96`), `src/infrastructure/` (same rule, forbidden target), `src/(testing/|__TESTS__/)` and `/(__TESTS__/|/src/testing/)` (3 rules), `schemas/`, `\.module\.ts$` (`only-hosts-compose-modules`), `application/ports/` (`host-reads-modules-through-public-layers`, host `queries/`). `infrastructure` to `infra` makes the forbidden target `src/infrastructure/` match nothing, so the T13 rule silently stops guarding `infra` unless edited; `__TESTS__` to `__tests__` breaks the test carve-outs (exemption no longer matches, cross-module test fixtures become errors); `application/ports/` must stay a path or the `queries/` rule rejects the new location; `<name>.module.ts` kept as is. |
| `packages/test/src/source-scan.ts` (`assertModuleLayering` `:261-292`) | Layers hard-coded as `["domain","application"]` (`:265`); a `domain/<concept>/` tree still matches since it scans the dir. `TEST_DIRECTORIES` accepts both `__TESTS__` and `__tests__` (`:9`) so that rename is safe here. `isRouteFile` (`:244-248`) matches only `routes.ts` or `*.routes.ts`: T5's `routes/<route>/<route>.ts` would exit the "routes never write" guard unnoticed. `HOST_PATH` (`:236-237`) names `container`, `auth`, `composition`, `shared/env`, `shared/middleware`: moving auth into a module breaks "no host reach" semantics for modules importing from it (it would be a module, not host). Fixtures in `packages/test/src/__TESTS__/module-layering.test.ts` use `infrastructure/...` names (`:17-26,67-153`). Each of the 12 modules has `src/__TESTS__/layering.test.ts` calling it. |
| `apps/api/src/__TESTS__/layering.test.ts` | Host-level guard: scans `health`, `organization`, `public-api` for route writes (`:21-35`), `auth`, `health`, `organization`, `shared` for tx parameters (`:38-46`), env reads. Creating a module from `auth` or `organization` moves files out of these scanned directories: the guards need an equivalent in the new module (its own `layering.test.ts`) or the coverage is lost. `isApiRouteFile` hard-codes `public-api/` prefix. |
| `knip.json` | `apps/api` entry list: `src/container.ts`, `src/shared/middleware/*.ts`, `src/shared/internal-routes/internal-fetch.ts`, `src/cron/*.ts` (`:4-9`); `modules/*` project `**/*.ts` with no entry, so module files are reachable only through `package.json` exports. Moving files into new folders needs no config change if exports stay accurate; a file exported but unused by the host is reported. Route files moving into `routes/<name>/` keep being reached through `exports`. |
| `.jscpd.json` / `check:duplication` | Command scans `./packages ./modules ./apps/api/src ./apps/app/src ./apps/admin/src ./infra` (`package.json:13`), threshold 3, `minLines` 10, `minTokens` 70, ignores `__TESTS__`. Splitting a service into several use cases with repeated boilerplate (`run` span wrapper, error mapping like `AdminActionService.run` `:46-59` and `ScimConnectionService.run` `:278-296`) is the likely trigger. Test directories are ignored only by the exact name `**/__TESTS__/**`: after a rename to `__tests__` they are scanned. |
| `turbo.json:65` | Excludes `**/__TESTS__/**` from task inputs; same rename effect (cache keys). |
| `apps/api/bunfig.toml` | Preload `./src/__TESTS__/preload.ts`. |
| `apps/api/src/shared/surface/route-map.ts` (214 l.) and `__TESTS__/surface-parity.test.ts` | Keyed by `METHOD path`; only breaks if a path changes. |
| `apps/api/scripts/*.ts` (21 `check-*` plus helpers) | 10 import `infrastructure/` paths directly (grep `infrastructure/` in `scripts` and `src/__TESTS__`), plus `@modules/*/application/services`. Rename-sensitive; all 20 `check:*` scripts are wired in CI. |
| Docs and skills naming paths | `docs/{EVENT_PIPELINE,HEALTH-PROBES,INTEGRATIONS,OBSERVABILITY,SURFACE,FEATURES,EVENTS,REMOVABILITY}.md`, `ROADMAP.md`, `.claude/skills/billing-entitlements/SKILL.md`, `modules/CLAUDE.md` (Anatomy, Folders). `docs/FEATURES.md` is a file-level inventory. |

---

## G. `pnpm check:api-shape`

Entry: `package.json:15` `check:api-shape` runs `pnpm --filter api check:api-shape`, i.e. `bun scripts/api-shape.ts` (`apps/api/package.json`). Wired in `.husky/pre-push:14` and `.github/workflows/ci.yml:46`. `api-shape:update` is the same script with `--update`.

Two probes, each compared byte for byte after canonicalisation to a frozen file in `apps/api/shape/`:

1. `AppType`: `scripts/api-shape.ts:20-52` spawns `tsc -p tsconfig.json --noEmit false --declaration --emitDeclarationOnly --removeComments --declarationMap false --incremental false --outDir <tmp>` for the whole api project, reads `src/app.d.ts`, and compares `canonicalDeclaration(text)` (`scripts/type-text.ts`) with `shape/app-type.d.ts.snap` (1762 lines, 38.9 KB). The canonicaliser sorts members of objects and unions at every nesting level (`canonicalGroup`, `canonicalType`), removes implied `| undefined` on optional keys, and rewrites any specifier starting with `./`, `../` or `@modules/` to `<local>` (`LOCAL_SPECIFIER`, `type-text.ts:~147`). Specifiers that survive in the frozen file: `hono/utils/http-status` (79), `hono/types` (20), `<local>` (10), `@packages/events` (6), `hono/utils/types` (5), `@packages/access-control` (3), `@packages/http/sweep-run.port` (2), `hono/hono-base` (1).
2. Route inventory: `listBackRoutes()` (`src/shared/surface/back-routes.ts:15-27`) over `routes.routes` of `app.ts`, drops middleware paths (`/*`, `*`), `ALL` and `/api/auth*`, adds the opaque row `ALL /api/auth/*`, sorts; compared with `shape/routes.txt` (103 lines). It lists routes that are not in `AppType` too (`/api/v1/*`, `/internal/*`, `/csp-report`, `/livez`, `/readyz`, `/startupz`, `/api/token-scanning/github`).

Failure prints the first differing offset with 80 characters of context (`firstDifference`, `:77-86`) and exits 1; a missing frozen file also fails. Declaration emit failure (`TS2883`, `TS4023`) throws before the comparison (`:44-46`). The script runs full `tsc` without incremental, so it needs a type-clean tree.

What drifts it:

| Refactor | Drift? |
|---|---|
| Rename or move a module folder, file, class or `infrastructure` to `infra`, `__TESTS__` to `__tests__`, service split into use cases | No, as long as response, input, status and validator types are unchanged: type text is structural and `@modules/*` and relative specifiers become `<local>` |
| A named alias moving to another package, or a package subpath renamed (`@packages/events`, `@packages/access-control`, `@packages/http/sweep-run.port`): 11 references in the frozen text | Yes (the only accepted drift, per `modules/CLAUDE.md:122`: prove structurally, then `api-shape:update` in the same commit) |
| Moving a type from a module to a package, or the reverse, if the inferred type now prints a named `import("@packages/...")` instead of an inline structure (or the opposite) | Yes |
| Change of a zod schema, including `.default`, `.optional`, coercion, `Result` mapped to a different status or `c.json` shape, a `zV` replaced by manual validation | Yes (input and output types change) |
| Route added, removed, re-prefixed, or its method changed, or a route moved out of or into the `routes` chain | Yes for `routes.txt`; for `AppType` only if the route is in the chain |
| Middleware `Variables` or `AppEnv` change (`app.ts:78-82`), e.g. auth moving into a module and `AuthVariables` changing type | Yes (printed in the preamble of the snapshot) |
| A converter from `HTTPException` to a different typed response; a handler returning a different `ContentfulStatusCode` union | Yes |
| Routes mounted with `app.route` before the chain (`/api/v1`, `/internal`, `/csp-report`, `/api/token-scanning`) | `routes.txt` only |
| T5 layout `routes/<route>/<route>.ts` + `<route>.schema.ts` | No for `AppType` if exports are equal; indirect risk through `isRouteFile` and the layering guards (see F) |

---

## Open points I could not check

- Whether BetterAuth runs `hooks.after`, Stripe plugin callbacks and `onPasswordReset` inside or outside its adapter transaction: read from code comments, not run (`check:auth-transaction`, `check:scim-connection` need a local database).
- Emitter of `USER_DELETED` (rgpd) not traced.
- No test, type-check or check script was run: the audit is static.
