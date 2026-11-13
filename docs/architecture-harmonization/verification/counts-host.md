# Fact check: sections 1, 4.3, 4.4, 4.5, 12 (Before column). Doc: docs/ARCHITECTURE-HARMONIZATION.md. Code at develop 3bec6dba. Tests excluded.

| Claim | Line | Measure / command | Verdict |
|---|---|---|---|
| 12 modules | 41 | ls modules = 12 | confirmed |
| 0 aggregate/entity/VO/typed id/domain event class | 41 | grep extends Aggregate/Entity/ValueObject/BaseDomainEvent, UUID< in modules = 0; domain/ only has 3 plain files | confirmed |
| 0 use case | 41, 893 | no usecase file/class | confirmed |
| 23 *.service.ts under application/services | 41, 895 | find modules -name '*.service.ts' -path '*application/services*' (no __TESTS__) = 23 | confirmed |
| 82 module routes | 42, 896 | 80 line-leading `.get/post/...(` in *.routes.ts + 2 chained starts (profile:21, scanning:18) = 82; also routes.txt 102 METHOD path - 20 host = 82 | confirmed |
| 35 zV (29 json, 6 query, 0 param) | 42, 897 | grep zV( = 35; json 29, query 6, param 0 | confirmed |
| 35 raw c.req.param reads | 42, 898 | grep 'c.req.param(' = 35 | confirmed |
| 2 modules open the transaction from the route (notifications, profile) | 43, 899 | ITransactionService.run in http/: profile, notifications only | confirmed |
| emit from the route (same 2) | 43 | profile + notifications emitEvent in routes (audit-log route also emits, outside a tx) | confirmed |
| 3 onEvent handlers | 44 | modules: 3 (revoke-on-membership-lost, close-approvals-of-deleted-user, notify-impersonated-user). Host adds a 4th (apps/api/src/shared/services/backup-code-used-notifier.ts) | confirmed for modules, incomplete (see below) |
| 3 built-in subscribers | 44 | audit-event, notification-fanout, webhook-fanout subscribers | confirmed |
| 5 of 6 hold logic, only close-approvals dispatches | 44, 903 | read: revoke runs uow+writes+emits; notify queries+sends email; close = 1 call to ApprovalService | confirmed (for the 6 in modules; the 7th, host backup-code notifier, is not counted) |
| Business rules in host: api-token.middleware, billing.middleware, flush-notification-emails (259 l.), me.routes, organization (297 l.), admin-action.service, security-signals.service, backup-code-used-notifier | 45, 374 | files exist; wc -l flush = 259, scim-connection.service = 297 | confirmed |
| Result in 105 module files, Option in 83 | 363 | grep -rlw Result = 105, Option = 83 (Result imported: 104) | confirmed |
| No throw in domain/application | 363 | grep throw in */src/domain, */src/application = 0 | confirmed |
| No application file imports ORM/framework/SDK | 362 | grep drizzle-orm, better-auth, stripe, resend in application/domain = 0 | confirmed |
| No module imports another module | 364 | grep @modules/ outside own module = 0 | confirmed |
| Every JSON body and query validated with zV | 366 | only exception: api-token scanning.routes.ts reads c.req.text() (HMAC signature on raw body) then validates by Zod safeParse, not zV | confirmed with one exception, see below |
| No `as` cast on validated request in modules | 366 | no `as` in *.routes.ts | confirmed |
| 55 emit sites in modules | 367 | grep `emitEvent(` excl. import = 55; plus 1 emitEventBestEffort (admin step-up.service.ts:111) = 56 | wrong/ambiguous |
| 48 emit sites in application/ | 367 | `emitEvent(` under /application/ = 47; with emitEventBestEffort = 48 | wrong/ambiguous (mixes the two bases) |
| 20 METHOD path routes in host | 372 | routes.txt: 102 METHOD path + 1 ALL; minus 82 module = 20; list: livez, readyz, startupz, build-info, csp-report, 8 internal, 4 organization, 3 /api/v1 | confirmed |
| 17 reach a store/ORM/lib/container directly (3 only local state) | 372 | the 3 local ones: livez, startupz, build-info; 20-3 = 17 (judgment, readyz uses di) | confirmed |
| 5 of 7 retention sweeps delete via @modules/*/schemas | 373 | host sweeps: audit-log, consents, email-messages, notifications, outbox, stripe-events, webhook-delivery = 7; 5 import module schemas (audit-log, consents, notifications, stripe-events, webhook-delivery) | confirmed |
| 40 `as` casts in non-test host code | 374 | grep `\bas <type>` excl. as const/import renames: 42 hits, 2 are prose in strings (env-bounds.ts:210, index.ts:40) = 40 | confirmed |
| 19 of them on request bodies inside BetterAuth hooks | 374 | auth/hooks/after.ts + before.ts: `body` casts = 14 (after 3, before 11); adding ctx.params casts = 18 (after:40,94; before:168 +...); 15 if sso-paths.ts:73 (not a hook) counted | wrong |
| 13 non-test files read global `di` | 375, 904 | grep `import { di }` = 13: policy, staff, auth, billing, org middleware; flush route; sweep-route; me.routes; index; auth/index; health/routes; organization/routes; app | confirmed |
| Module `exports` entries 138 | 905 | package.json exports per module: 42+12+7+19+6+9+5+3+5+11+8+11 = 138 | confirmed |
| ddd-kit has Entity, Aggregate, ValueObject, WatchedList, UUID<T>, Result, Option, IUnitOfWork, onEvent, EventCollector | 386 | all in packages/ddd-kit/src | confirmed |
| ddd-kit lacks use case convention, handler->use case helper, mapper convention | 386 | no such file/symbol | confirmed |
| events: closed catalog, 5 exhaustive maps | 387 | doc "5 files touched"; strict Record<EventType,..>: EVENT_DESCRIPTIONS, RETENTION_MAP, visibility (satisfies); NOTIFICATION_MAP is Partial; PayloadByEventType is `as const` object | wrong (imprecise): 3 strict Records, 1 partial, 1 payload map |
| outbox: IOutboxRepository, emitEvent, relay, dispatcher, payloadParser | 388 | all present in packages/outbox/src | confirmed |
| http: zV(target, schema) on any Hono target, no shared idParam | 389 | validator.ts takes keyof ValidationTargets; grep idParam = 0 | confirmed |
| test: assertModuleLayering; lacks guards T2,T3,T4,T7,T8,T10 and a path-based route file test | 390 | guards = no throw, routes never write, no tx param, no tx opened, no env read, no host reach; isRouteFile is name-based (routes.ts / .routes.ts) | confirmed |
| email, emails: port and implementation in one kit package | 391 | `email` = ports + impl (queue, worker, service); `emails` is a separate package (templates/render) | confirmed for email, wording loose for emails |

## Wrong / unverifiable in detail

1. Emit sites (line 367, "55 in the modules, 48 in application/"). Corrected: `emitEvent(` = 55 in modules, 47 in application/. Including `emitEventBestEffort` (admin/src/application/services/step-up.service.ts:111): 56 and 48. Use 55/47 or 56/48 consistently.
2. "19 of them on request bodies inside the BetterAuth hooks" (line 374). Corrected: 14 casts of `ctx.body`/`body?.x` in `auth/hooks/{before,after}.ts`; 18 if the `ctx.params` casts are added; 15 if `auth/sso-paths.ts:73` is added. 19 is not reproducible. Suggest "14 on request bodies".
3. "events: 5 exhaustive maps" (line 387). Corrected: 5 files to touch (packages/events/CLAUDE.md), but only 3 typed `Record<EventType,...>` (descriptions, retention, visibility); `NOTIFICATION_MAP` is `Partial`; `PayloadByEventType` is an untyped `as const` object.

## Imprecise (not counted as wrong)
- Line 44: host has a 4th `onEvent` handler (backup-code-used-notifier.ts, 33 l.); "3 onEvent / 5 of 6" is correct for modules only. Row 903 "5 of 6" ignores it (line 374 already lists it as a handler holding logic).
- Line 366: scanning.routes.ts validates its body with `safeParse` after HMAC check on `c.req.text()`, not `zV`.
- Out of scope but seen: line 346 (4.2) says global `application/dto/` in 11 modules; directories exist in 10 (admin, api-token, audit-log, consents, notifications, policies, profile, rgpd, uploads, webhooks).
