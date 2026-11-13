# Audit: audit-log, notifications, uploads

Paths are relative to `the repo root/modules/<module>` unless absolute or prefixed `apps/`. Read-only; nothing in the repo was touched. Not checked: runtime behaviour, `pnpm check:*` output, real-database scripts (none exist for these 3 modules: `ls scripts` shows none, no `check:*` script in their package.json).

## Cross-cutting: where the current guide (modules/CLAUDE.md) and the target diverge

| Topic | Current guide (modules/CLAUDE.md) | Target | Modules concerned |
|---|---|---|---|
| Infra folder | `infrastructure/` (Anatomy l.16) | `infra/` (T2, T5) | all 3 |
| Test folder | `__TESTS__/` (l.18) | `__tests__/` (T2) | all 3 |
| Use cases | `application/use-cases/` "only where an aggregate exists"; otherwise `application/services/<Noun>Service` with N methods (l.41-42, 53) | one `usecases/<name>/<name>.usecase.ts` per action, sole entry of application (T4, T6) | all 3 (UploadService, AuditQueryService) |
| DTO | `application/dto/<verb-noun>.dto.ts` flat (l.43) | next to its use case (T4) | all 3 |
| Stores | `infrastructure/repositories/*.store.ts` (l.45) | `infra/repos/drizzle/` (T5) | audit-log (`drizzle-audit.service.ts` in `repositories/`), notifications (2 `.store.ts`) |
| Queries | "Controller -> Query (direct ORM, no use case)", "A route may read its own tables" (l.30, 69-70) | routes call use cases only, reads included (T7) | notifications routes call `INotificationStore` directly for reads; audit-log routes call a service |
| Route transaction | route opens `ITransactionService.run` when it composes several store writes (l.85, cites `notifications` routes) | no orchestration in route (T7) | notifications |
| Built-in subscriber | lives in the reacting module, `BuiltInEventHandler`, own `uow.run`, key from `eventId` + ON CONFLICT DO NOTHING (l.110) | `application/event-handlers/` only dispatches to use cases, no store access (T10) | audit-log, notifications |
| Event handlers location | `application/event-handlers/` (l.44), but built-in subscribers are in `infrastructure/services/` | `application/event-handlers/` | audit-log, notifications |
| Domain | "An empty `domain/` is cargo-cult" (l.38); flat otherwise | `domain/<concept>/...` only if real invariants | none of the 3 has `domain/` |
| Events | one catalog in `packages/events`, emitted via `emitEvent(outbox, ...)` (l.28, 96) | domain events in `domain/<c>/events/`, application events in `application/events/` (T9) | all emit through the shared catalog; no module owns event files |
| Service name suffix | `*.service.ts` used for infra (`drizzle-audit.service.ts`, `storage.service.ts`, `noop-storage.service.ts`) | suffix does not decide layer (T6) | audit-log, uploads |
| Routes layout | `infrastructure/http/<name>.routes.ts` factory (l.47) | `infra/http/routes/<route>/<route>.ts` + `<route>.schema.ts` (T5) | all 3 |
| Mappers | "Row mapping stays inside the store; mappers/ only next to an aggregate" (l.45) | mappers centralised (T12) | all 3 |

The three modules follow the current guide closely; nearly every gap below is a deliberate guide choice, not a drift. Real drifts (outside both guide and target) are flagged "DRIFT".

---

## audit-log

### 1. Responsibility
Built-in event subscriber that writes every catalog event with a retention other than `none` into `audit_log`, optionally hash-chained (tamper evidence), plus a staff-only read/verify API. It owns the `audit_log` table (`schemas/audit-log.ts:4`).

### 2. Business or technical; DDD justified?
Technical (compliance plumbing). No aggregate, no entity. Invariants found: hash chain integrity (`src/infrastructure/services/audit-event-subscriber.ts:54-70`, `audit-hash.ts:21`, `drizzle-audit.service.ts:170-195`), idempotency by `audit-${eventId}` + `onConflictDoNothing` (`audit-event-subscriber.ts:39,81`), retention `none` skip (`:34-35`). They are enforced in SQL/crypto, not in an aggregate. DDD domain not justified; a `domain/` would be at most 2 pure functions (`extractActor`, `computeAuditHash`). Verdict on T1: no `domain/`, matches target.

### 3. Tree (`src/`, 15 files incl. config; plus `schemas/audit-log.ts`)
| Folder | Files |
|---|---|
| `src/` | 1 (`audit-log.module.ts`) |
| `application/config` | 1 |
| `application/dto` | 1 (`list-audit-events.dto.ts`) |
| `application/ports` | 2 (`audit.port.ts`, `audit-trail.port.ts`) |
| `application/services` | 1 (`audit-query.service.ts`) |
| `infrastructure/http` | 1 |
| `infrastructure/repositories` | 1 (`drizzle-audit.service.ts`) |
| `infrastructure/services` | 2 (`audit-event-subscriber.ts`, `audit-hash.ts`) |
| `__TESTS__` | 5 (4 tests + layering), 29 `it()` total |

### 4. Service vs use case
| File | Really is | Methods |
|---|---|---|
| `application/services/audit-query.service.ts` | 2 use cases (query) wrapped in a span, pure pass-through to port (`:11-21`) | `listForPlatform` -> use case `list-audit-events`; `verifyChain` -> use case `verify-audit-chain`. 2 use cases |
| `infrastructure/services/audit-event-subscriber.ts` | event handler with business-ish logic + persistence (see 6); misnamed as service | `handle` -> 1 use case `record-audit-entry` |
| `infrastructure/services/audit-hash.ts` | technical helper (SHA-256 canonical), belongs to an adapter `IAuditHasher` or a pure util | `computeAuditHash` |
| `infrastructure/repositories/drizzle-audit.service.ts` | repository (class `DrizzleAuditRepository`, file misnamed `.service`) | `record`, `list`, `verifyChain` (DRIFT: `IAuditPort.record` is never called by the subscriber, see 8) |

### 5. HTTP routes (`infrastructure/http/audit-log.routes.ts`)
| Route | Direct call | Validation |
|---|---|---|
| `GET /` (`:21-63`) | `deps.AuditQueryService.listForPlatform` (`:28`), then `emitEvent(IOutboxRepository, SECURITY_OPERATOR_AUDIT_ACCESSED)` directly in the route (`:31-50`), then row-to-JSON mapping inline (`:52-61`) | query: `zV("query", listAuditEventsQuerySchema)` (`:25`), Zod via `@packages/http/validator`. No `as` |
| `GET /verify` (`:64`) | `deps.AuditQueryService.verifyChain` (`:65`), inline response mapping (`:68-73`) | no params/query/body, nothing to validate |

T7 violations: route emits an outbox event itself (orchestration, no transaction around it either: `emitEvent` is called without `uow.run`, see 11), and maps Option to JSON. Route deps include a raw `IOutboxRepository` (`:13`). Guards only: `requireAuth`, `requireStaffPermission("audit.read")`.

### 6. Event handlers
`AuditEventSubscriber` (`infrastructure/services/audit-event-subscriber.ts:22-93`), registered in `apps/api/src/container.ts:236` (`buildEventDispatcher([c.AuditEventSubscriber, ...])`). What it does directly, with no delegation to any use case or port:
- reads the retention map `retentionFor(event.eventType)` and skips on `"none"` (`:34-35`);
- derives actor via `readActorId` (`:15-20`, `:37`): null actor => `system`, else `user`;
- builds the entry (id `audit-${eventId}`, target = aggregateType/aggregateId) (`:38-48`);
- opens its own `uow.run` (`:50`), takes an advisory lock `lockForTransaction("audit_log_chain")` (`:55`), reads the last hash with a raw Drizzle select on the table (`:56-62`), computes the hash (`:64-69`), inserts with ON CONFLICT DO NOTHING (`:72-85`);
- span + `capture` + rethrow (`:32,87-90`).
Everything is in the handler: logic, store write, ORM, locking. Does not use `IAuditPort.record`. Emits nothing.

### 7. Events emitted
| Event | Declared | Emitted at | Kind |
|---|---|---|---|
| `security.operator.audit_accessed` (`packages/events/src/event-types.ts:58`) | shared catalog | route `audit-log.routes.ts:32` | application event (a read access trail, no aggregate), emitted by an HTTP route |
The module consumes all catalog types, emits only that one.

### 8. Technical code in application; ports
- `application/` imports no ORM/framework: clean. It imports `zod` and `@packages/http/time-id-cursor` (kit) in the DTO (`list-audit-events.dto.ts:1`), allowed by the guide.
- Ports: `IAuditPort` (`audit.port.ts:49`: `record`, `list`, `verifyChain`) and `IAuditTrail = Pick<IAuditPort,"list"|"verifyChain">` (`audit-trail.port.ts:3`). Gaps: `record` is on the port and implemented (`drizzle-audit.service.ts:72`) but the write path actually used by production is the subscriber's own raw insert, so the chain-hash write logic exists twice in different shapes (record writes no hash, `:98-99`; the subscriber does). `record` has no production caller (grep: only tests). Missing ports: chain hasher, advisory lock/last hash read (embedded in the handler).
- Implementations: `DrizzleAuditRepository` in `infrastructure/repositories/`, bound `audit-log.module.ts:18-21`.
- `AuditEntry`/`AuditRecord` data records live in the port file (`audit.port.ts:6-23`).

### 9. Scattered conversions
- row -> record: `toRecord` module-level function in the repository (`drizzle-audit.service.ts:44-60`).
- record -> JSON (Option.toNull x4): inline in route (`audit-log.routes.ts:52-61`), and again for verification (`:68-73`).
- event -> entry: inline in subscriber (`audit-event-subscriber.ts:37-48`, `:64-69`).
- record -> hash input: re-built field by field in `verifyChain` (`drizzle-audit.service.ts:172-185`) and in the subscriber (`:64-69`): 2 copies of the same hash input shape.
- filters DTO -> event payload filters: inline in route (`:40-46`).
Candidates for `mappers/`: 3 to 4 mappers (`audit-row.mapper`, `audit-record.response.mapper`, `event-to-audit-entry.mapper`, `audit-hash-input.mapper`).

### 10. DTO locations
`application/dto/list-audit-events.dto.ts` only (query schema). The response shape is not a DTO, it is inline in the route. `AuditFilters` (port file) duplicates the schema's fields with `organizationId?: string | null` vs `string` in the schema.

### 11. Layer violations and ddd-kit gaps
- No import from application to infrastructure (the layering test `__TESTS__/layering.test.ts:7` calls `assertModuleLayering`).
- DRIFT: `emitEvent` in `GET /` runs outside any `uow.run` (`audit-log.routes.ts:32`); the outbox write uses the ambient executor with none open. Needs verification (not run) whether `emitEvent` opens its own transaction; it is a read route so atomicity is moot, but it deviates from root rule 6 wording "same transaction as the write".
- DRIFT: `ChainVerification`/`AuditPage` use `Option` correctly; `AuditEntry.requestId?: string` and `AuditRecord.metadata: unknown` mix `undefined` with `Option` (`audit.port.ts:14`), a ddd-kit rule 2 gap (absence in a port should be `Option`).
- DRIFT: `r.hash as string` cast (`drizzle-audit.service.ts:194`) in verifyChain; `Result.fail` via `this.fail(...)` fine.
- No ids (`AuditId`), plain `string`.
- The subscriber `throw err` instead of `Result` (acceptable, contract of `BuiltInEventHandler`).

### 12. Folder and naming gaps (T2 to T5)
- `infrastructure/` -> `infra/`; `__TESTS__` -> `__tests__`.
- `infrastructure/repositories/drizzle-audit.service.ts` -> `infra/repos/drizzle/drizzle-audit.repository.ts` (class already `DrizzleAuditRepository`).
- `infrastructure/services/audit-event-subscriber.ts` -> `application/event-handlers/` (thin) + use case `record-audit-entry`.
- `audit-hash.ts` -> `infra/adapters/`.
- `application/services/audit-query.service.ts` -> `application/usecases/{list-audit-events,verify-audit-chain}/`.
- DTO `list-audit-events.dto.ts` moves into `usecases/list-audit-events/`.
- Routes `infra/http/routes/audit/{list,verify}/...` + schema files.
- `application/config/` and `schemas/` stay (not covered by T2 but kept by the guide; T2 says the root holds only `__tests__`, `application`, `domain`, `infra`, `<name>.module.ts`, so `application/config` is fine, `schemas/` sits outside `src/`).

### 13. Dependencies
- Packages: `@packages/{ddd-kit,drizzle,events,http,outbox}`, `drizzle-orm`, `hono`, `inwire`, `zod`; `bun` `CryptoHasher` in `audit-hash.ts:2` (runtime-specific import, infra only).
- Other modules: none imported.
- Tables read not owned: none (own table only).
- Host binds (`apps/api/src`): `container.ts:3,212` `addModule(auditLogModule)`; `container.ts:236` hands `AuditEventSubscriber` to `buildEventDispatcher`; `composition/settings.ts:4,143,180` builds `AuditLogSettings { tamperEvidence }` from `AUDIT_TAMPER_EVIDENCE`; `app.ts:12,270` mounts `createAuditLogRoutes` on `/admin/audit-log`. The host also reaches the module internals: `shared/internal-routes/sweep-audit-log.route.ts:3` imports `@modules/audit-log/schemas/audit-log` and deletes rows by retention bucket itself (retention sweep logic lives in the host); `__TESTS__/staff-permission-matrix.test.ts:2,32` imports the routes file and type.
- Prerequisites: `IInstrumentation`, `ILogger`, `ITransactionService`, `auditLogSettings` (`audit-log.module.ts:9-14`).
- package.json exports (`package.json:6-14`): module, settings, `audit-trail.port`, `audit-query.service`, `audit-event-subscriber`, routes, `schemas/*`. Consumers: apps/api (container, app, settings, sweep route, test). `audit-query.service` export has no external importer found (export for container type inference).

### 14. Tests and migration risks
29 `it()` across 4 files + layering: `audit-hash.test.ts` (3), `audit-query.service.test.ts` (7), `drizzle-audit.service.test.ts` (11), `audit-event-subscriber.test.ts` (7). No real-database script (no `scripts/`, no `check:*`): hash chain concurrency under the advisory lock is untested against Postgres. Risks: frozen API shape (`apps/api/shape/`): `GET /admin/audit-log` and `GET /admin/audit-log/verify` response shape (Option -> null mapping) must not move; `sweep-audit-log.route.ts` depends on `schemas/audit-log` path; `staff-permission-matrix.test.ts` depends on the routes file path and `AuditLogRoutesDeps` export; hash format (`GENESIS`, canonicalize input field set) is an on-disk contract with existing rows; layering test `assertModuleLayering` expects the folder names it scans (not read; verify before renaming to `infra/`).

### 15. Verdict
Partially conform. Effort **M**.
Ordered corrections:
1. Rename `infrastructure/` -> `infra/`, `__TESTS__` -> `__tests__`, fix `assertModuleLayering` path assumptions and `package.json` exports + the 5 host import sites (`container.ts`, `app.ts`, `settings.ts`, `sweep-audit-log.route.ts`, `staff-permission-matrix.test.ts`).
2. Extract use cases `record-audit-entry`, `list-audit-events`, `verify-audit-chain`; subscriber becomes `application/event-handlers/audit.event-handler.ts` that parses and dispatches to `record-audit-entry`.
3. Introduce ports for the chain write (last hash + lock + insert) and hasher; remove the duplicate insert path (`IAuditPort.record` vs subscriber raw insert) and the `as string` cast.
4. Move route response mapping and the `audit_accessed` emission into the list use case (emit inside it, `uow.run`).
5. Mappers: row, response, hash input. Move DTO next to use cases; response shape as DTO.
6. Optionally move sweep retention into the module (host currently owns it) and add a real-DB check for the chain.

---

## notifications

### 1. Responsibility
Built-in event subscriber that fans every catalog event with a notification config out into per-user `notification` rows (in-app feed + pending e-mail digest timestamp), applying org/user preference precedence in SQL; and the user-facing API (feed, unread count, mark read, preferences, org preferences, SSE stream via pg LISTEN/NOTIFY). It owns `notification` and `notification_preference` (`schemas/notification.ts:11,44`). The digest e-mail flush runs in the host (`apps/api/src/shared/internal-routes/flush-notification-emails.route.ts`) through the module's `INotificationDigestStore`.

### 2. Business or technical; DDD justified?
Mixed, leaning technical (delivery plumbing driven by a catalog in `packages/events`). Rules found: preference precedence org-locked > user > org default > fallback (`notification-fanout-subscriber.ts:56-67`, duplicated in `drizzle-notification-digest.store.ts:43-62`); forced notifications ignore preferences and are never deferred (`:69-79`); digest due-at is a pure function (`application/services/digest-schedule.ts:27-45`); dedup key by event or time bucket (`:20-30`); audience resolution (`application/services/resolve-audience.ts:23-43`); mark-read all-or-none (`notifications.routes.ts:92-97`). These are policy functions, not aggregate invariants: the state lives in SQL rows with no lifecycle invariants of its own beyond read/unread. DDD domain not justified for the notification row. A small `domain/` of pure policies (`resolve-audience`, `digest-due-at`, preference precedence as a typed function, dedup key) is defensible, because the precedence is currently expressed twice in SQL (fanout and digest) and could be unified; but not an aggregate. Judgment call, not forced by T1.

### 3. Tree
| Folder | Files |
|---|---|
| `src/` | 1 (`notifications.module.ts`) |
| `application/config` | 1 |
| `application/dto` | 1 |
| `application/ports` | 3 (`notification.port.ts`, `notification-digest.port.ts`, `staff-recipients.port.ts`) |
| `application/services` | 2 (`digest-schedule.ts`, `resolve-audience.ts`), both pure functions, no class |
| `infrastructure/http` | 1 |
| `infrastructure/repositories` | 2 (`drizzle-notification.store.ts`, `drizzle-notification-digest.store.ts`) |
| `infrastructure/services` | 3 (`notification-fanout-subscriber.ts`, `notification-stream-hub.ts`, `notification-trigger.ts`) |
| `__TESTS__` | 7 (6 tests + layering), 62 `it()` total |
+ `schemas/notification.ts` (2 tables).

### 4. Service vs use case
| File | Really is | Public API |
|---|---|---|
| `application/services/digest-schedule.ts` | pure domain policy (not a service); `digestDueAt`, `DEFAULT_DIGEST_HOUR_UTC` | 1 function |
| `application/services/resolve-audience.ts` | pure domain policy; `resolveAudience(audience, event)` | 1 function. It imports `DeliveredEvent` from `@packages/outbox` and `@packages/access-control` (kit, fine) |
| `infrastructure/services/notification-fanout-subscriber.ts` | event handler that IS the fan-out use case (builds + runs the INSERT...SELECT) | `handle` -> 1 use case `fan-out-notification` |
| `infrastructure/services/notification-stream-hub.ts` | technical service (in-memory pub/sub + `PgListener` + trigger install) | `subscribe`, `subscriberCount`, `dispatchSignal`, `start`, `stop`. Port `INotificationStreamHub` missing; implementation in `infra/adapters/` |
| `infrastructure/services/notification-trigger.ts` | infra migration-like DDL helper (`CREATE FUNCTION`/`TRIGGER`) | `ensureNotificationTrigger`. Runs at hub start, not from a migration |
| `infrastructure/repositories/drizzle-notification.store.ts` | repository for feed + preferences | 6 methods: `list`, `unreadCount`, `markRead`, `markAllRead`, `listPreferences`, `upsertPreference` |
| `infrastructure/repositories/drizzle-notification-digest.store.ts` | repository for the digest flush rail | `countDue`, `beginFlush`, `claimDue`, `dropUnwanted`, `markSent` |
No `<Noun>Service` class exists; the use cases live inline in routes (7) and the host (digest flush). Use cases implied: `list-notifications`, `get-unread-count`, `mark-notifications-read`, `mark-all-notifications-read`, `list-preferences`, `update-preference`, `list-org-preferences`, `update-org-preference`, `fan-out-notification`, `flush-notification-digest` (currently in host), `open-notification-stream` (guard + subscribe). 11 use cases.

### 5. HTTP routes (`infrastructure/http/notifications.routes.ts`)
| Route | Direct call | Validation |
|---|---|---|
| `GET /` (`:45-64`) | `deps.INotificationStore.list` (`:48`); builds `nextCursor` from last `createdAt` (`:51-53`); maps records (`:54-62`); calls `publicNotificationPayload` | query `zV("query", listQuerySchema)`; `cursor: z.string().optional()` (`notification-requests.dto.ts:9`) is unvalidated beyond string and goes into `new Date(cursor.unwrap())` in the store (`drizzle-notification.store.ts:42`): an invalid date is not rejected at the boundary (gap, not tested) |
| `GET /unread-count` (`:65-70`) | `INotificationStore.unreadCount` | none needed |
| `POST /read` (`:71-115`) | `ITransactionService.run` (`:81`) + `INotificationStore.markRead` (`:83`) + ownership rule "marked count must equal unique ids else NOT_FOUND" (`:92-97`) + `emitEvent(NOTIFICATION_READ)` (`:99-106`) | body `zV("json", markReadSchema)` |
| `POST /read-all` (`:116-142`) | `ITransactionService.run` + `markAllRead` + conditional `emitEvent` | none |
| `GET /preferences` (`:143-148`) | `INotificationStore.listPreferences("user", userId)` | none |
| `PUT /preferences` (`:149-194`) | `ITransactionService.run` + `upsertPreference` + `emitEvent(NOTIFICATION_PREFERENCE_UPDATED)` | `zV("json", preferenceSchema)` |
| `GET /org-preferences` (`:195-206`) | `listPreferences("org", orgId)` | none (org from guard) |
| `PUT /org-preferences` (`:207-257`) | `ITransactionService.run` + `upsertPreference` + `emitEvent(NOTIFICATION_ORG_PREFERENCE_UPDATED)` | `zV("json", orgPreferenceSchema)` |
| `GET /stream` (`:258-284`) | `NotificationStreamHub.subscriberCount`/`subscribe` (`:260-271`), 429 `HTTPException` (`:262-264`), SSE loop with 25 s ping (`:266-283`) | none |
8 HTTP routes + SSE. Every route violates T7 (store/transaction/outbox/hub called directly). No `as` casts on request data (one `as const` on `{ok:true}`). Validator everywhere: `zV` from `@packages/http/validator`. Business logic in route: all-or-none ownership check (`:92`), cursor computation (`:51-53`), 429 limit (`:262`).

### 6. Event handlers
`NotificationFanoutSubscriber` (`infrastructure/services/notification-fanout-subscriber.ts:116-217`), registered `container.ts:236`. Directly does:
- config lookup `notificationConfigOf(eventType)` and early return (`:135-136`);
- `resolveAudience` (application function, delegated) (`:138-139`);
- recipient SQL construction per audience kind: user, org via raw read of `multiTenantSchema.member` (`:149-156`), staff via port `IStaffRecipientsReader` (`:158-161`);
- delivery rules SQL with 4 LEFT JOINs on preferences (`:36-93`);
- dedup key (`:20-30`), group key (`:184`), email due-at via `digestDueAt` per frequency (`:105-114`, `:188`);
- one `INSERT ... SELECT ... ON CONFLICT DO NOTHING` raw SQL on `notification` (`:166-197`) inside `uow.run` (`:199`) with span (`:201-208`);
- `capture` unless AppErrorException, rethrow (`:210-213`).
Business logic, ORM, raw SQL all inside the handler; no use case. Emits nothing.
Plus stream hub `onNotification` callback: pg NOTIFY -> in-memory dispatch (`notification-stream-hub.ts:25`).

### 7. Events emitted
| Event | Declared | Emitted at | Kind |
|---|---|---|---|
| `notification.read` (`packages/events/src/event-types.ts:96`) | shared catalog | routes `notifications.routes.ts:99` and `:127` | application event (state change of a row, no aggregate), emitted by HTTP route |
| `notification.preference.updated` (`:94`) | catalog | route `:172` | application event |
| `notification.org_preference.updated` (`:95`) | catalog | route `:233` | application event |
All emitted by the route inside the route's `ITransactionService.run`. Consumed: all types, via the fan-out.

### 8. Technical code in application; ports
- `application/` clean of ORM/framework: imports `@packages/access-control`, `@packages/events`, `@packages/outbox` types (kit). OK under guide.
- DRIFT (layering inside application): `ports/staff-recipients.port.ts:3` imports `AudienceTarget` type from `../services/resolve-audience`, a port depending on a service file.
- Ports present: `INotificationStore`, `INotificationDigestStore`, `IStaffRecipientsReader`. Missing: `INotificationStreamHub`/signal publisher (route and host call the concrete class), `INotificationFanout` (the subscriber is inline raw SQL, no port), `IDigestMailer` (host flush does the mailing). `NotificationError` declared as a hand-written union (`notification.port.ts:35-37`) instead of `AppError<...>`.
- `StaffRecipientsQuery` implements `IStaffRecipientsReader` in the host (`apps/api/src/queries/staff-recipients.query.ts`), bound by `apps/api/src/composition/sources/notifications.ts:8-12` (port declared by consumer, correct per guide contract 3/5; reads `admin` staff tables, which a module cannot).
- Stores in `infrastructure/repositories/` bound `notifications.module.ts:26-33`.

### 9. Scattered conversions
- row -> NotificationRecord: private `toRecord` (`drizzle-notification.store.ts:204-216`); row -> PreferenceRecord `toPreference` (`:218-230`).
- record -> response (Option.toNull x3 + `publicNotificationPayload`): inline in route (`notifications.routes.ts:54-62`).
- cursor encode/decode: ISO string built in route (`:51-53`), parsed in store (`drizzle-notification.store.ts:42`).
- body -> `PreferenceInput`: built twice inline (`notifications.routes.ts:161-169`, `:222-230`).
- event -> notification payload: `JSON.stringify(event.payload)` in SQL builder (`fanout:186`); event -> `NotificationReadPayload` inline x3.
- digest row -> `DueNotification` with `locale: Option.fromNullable` (`digest-store:110-112`); `buildDigests` grouping lives in the host route (`flush-notification-emails.route.ts:37-59`) and is a mapping/grouping that belongs in the module.
- preference precedence expressed twice (SQL in fanout `:61-67`, SQL in digest store `:50-56`).
Candidates: notification-row mapper, preference-row mapper, notification-response mapper, preference-input mapper, digest grouping mapper, event-to-notification-row mapper: ~6.

### 10. DTO locations
`application/dto/notification-requests.dto.ts` holds 4 request schemas (`listQuerySchema`, `markReadSchema`, `preferenceSchema`, `orgPreferenceSchema`) in one file: to split next to 8 use cases. No response DTOs (shape inline in routes). `NotificationRecord`/`PreferenceRecord` data records sit in the port file.

### 11. Layer violations and ddd-kit gaps
- Route-level transactions and event emission (T7, and guide l.85 allows it).
- DRIFT: application port imports an application service type (see 8).
- DRIFT: `notification-fanout-subscriber.ts:124-127` default constructor value for `staffEnv`/`digestHourUtc` duplicates config defaults (`DEFAULT_DIGEST_HOUR_UTC` lives in application).
- DRIFT: `notification-stream-hub.ts:2,68` imports the global `db` singleton from `@packages/drizzle` and calls DDL `ensureNotificationTrigger(db)` at start: ambient state, not injected; trigger DDL should be a migration (guide root rule 5 accepts DDL as raw SQL, but runtime install at boot is non-standard).
- DRIFT: `NotificationStreamHub` is constructed from `databaseUrl` (`notifications.module.ts:48-52`), started by the host `apps/api/src/index.ts:35` and stopped `:77`.
- ids: plain `string` everywhere (no `NotificationId`, `UserId`); `Option` used correctly for nullable columns; `Result` used in stores.
- Hand-rolled `NotificationError` union rather than `AppError`.
- `crypto.randomUUID()` in the store (`:172`) vs `uuidv7` used in audit-log.
- `Result.fail({code, message})` literal in route (`:93-96`) for NOT_FOUND, business error built in HTTP layer.

### 12. Folder and naming gaps
- `infrastructure/` -> `infra/`; `__TESTS__` -> `__tests__`.
- `*.store.ts` -> `infra/repos/drizzle/*.repository.ts` (T5; the guide calls them stores because there is no aggregate).
- `application/services/{digest-schedule,resolve-audience}.ts` are pure policies, not services: -> `domain/` policy files (or `application/` helpers) with no `.service` role.
- `infrastructure/services/notification-fanout-subscriber.ts` -> `application/event-handlers/notification-fanout.event-handler.ts` + use case.
- `notification-stream-hub.ts` -> `infra/adapters/` behind a port; `notification-trigger.ts` -> migration or `infra/adapters/`.
- Routes: 8 routes -> `infra/http/routes/<route>/<route>.ts` + `.schema.ts`; SSE stream under `infra/http/`.
- DTO split next to use cases.

### 13. Dependencies
- Packages: `@packages/{access-control,ddd-kit,drizzle,events,http,outbox}`, `drizzle-orm`, `hono`, `inwire`, `zod`.
- Other modules: none imported. Tables read not owned: `authSchema.user` (digest store, `:5,29`) and `multiTenantSchema.member` (fanout `:6,145`), both kit tables, allowed by guide l.29; schema file has FKs to `@packages/drizzle/schema/auth|multi-tenant` (`schemas/notification.ts:1-2`). Staff recipients read `admin` tables, in the host.
- Host binds: `container.ts:6,218-219` `notificationsSources` + `notificationsModule`; `container.ts:236` fan-out into dispatcher; `composition/settings.ts:7,144,181` `notificationSettings {digestHourUtc, databaseUrl}`; `staffSettings` prerequisite (`PLATFORM_ADMIN_IDS`, `PLATFORM_ADMIN_REQUIRE_MFA`) bound in the host; `composition/sources/notifications.ts` binds `IStaffRecipientsReader` -> `queries/staff-recipients.query.ts`; `app.ts:15,276` mounts routes on `/notifications`; `index.ts:35,77` start/stop `NotificationStreamHub`.
- Host consumption of internals: `shared/internal-routes/flush-notification-emails.route.ts:5-7,111,125` uses `INotificationDigestStore` + `DueNotification`, runs the transaction, lock, claim, mailing, markSent itself (the digest flush use case lives in the host); `shared/internal-routes/sweep-notifications.route.ts:3` imports `schemas/notification` and deletes read rows by age (sweep logic in host); two host tests import the port and schema.
- package.json exports (`package.json:6-16`): module, settings, 3 ports, fanout subscriber, stream hub, routes, `schemas/*`.

### 14. Tests and migration risks
62 `it()` in 6 files + layering: `routes.test.ts` (30), `digest-schedule` (9), `resolve-audience` (8), `notification-stream-hub` (7), `notification-fanout-subscriber` (4), `notification-trigger` (3). Fan-out SQL (4 joins, ON CONFLICT, due-at CASE) is covered by only 4 tests with the fan-out test file at 87 lines: whether it hits a real database was not checked; no `scripts/check-*` for this module. Risks: frozen API shape for 9 `METHOD path` entries under `/notifications` (SSE route included); the SSE event names `notification`/`ping` and the 429 body; `NOTIFICATION_STREAM_LIMIT` constant; on-disk contract of `dedup_key` formats (`event:<id>`, `<type>:<aggregate>:<bucket>`) and `email_pending_at` semantics shared with the host flush; the flush route depends on 5 store methods and on `DueNotification`; the SQL trigger name `notification_notify_trigger` and channel `notification_changed` shared with `PgListener`; sweeps depend on schema path.

### 15. Verdict
Non conform to the target on layering (no use cases, handler and routes hold the logic) while conform to the current guide. Effort **L**.
Ordered corrections:
1. Folder renames (`infra/`, `__tests__`, `repos/drizzle/`) with exports and host import updates (container, app, settings, sources, index.ts, 2 internal routes, 2 host tests).
2. Introduce 8 route use cases + `usecases/<name>/` with DTOs (`list-notifications`, `get-unread-count`, `mark-notifications-read`, `mark-all-notifications-read`, `list-preferences`, `update-preference`, `list-org-preferences`, `update-org-preference`), transactions and `emitEvent` moved inside; routes become Zod + use case call + presenter.
3. Move `resolve-audience` and `digest-schedule` to `domain/` policy files (or keep as application helpers) and fix the port-imports-service dependency (`staff-recipients.port.ts:3`).
4. Extract `fan-out-notification` use case behind a port (`INotificationFanoutWriter`) for the INSERT...SELECT; handler in `application/event-handlers/` only parses and dispatches; unify the duplicated preference-precedence SQL between fanout and digest store.
5. Move the digest flush use case (`flush-notification-digest`) from `apps/api/.../flush-notification-emails.route.ts` into the module (needs an e-mail port); move `buildDigests`; consider moving the sweep.
6. Stream: port `INotificationStreamHub`, adapter in `infra/adapters/`, trigger DDL to a migration, `open-notification-stream` guard in a use case.
7. Mappers (~6), response DTOs, cursor validation at the HTTP boundary (`cursor` is an unvalidated string today), `AppError` instead of the hand-written error union, typed ids.
8. Add a real-database check for fan-out SQL and for the unique dedup index.

---

## uploads

### 1. Responsibility
Orchestrates S3-compatible object storage for user files: issues presigned PUT/GET URLs, confirms an upload by `HeadObject` (size and content-type integrity, deleting on mismatch), deletes objects, and exposes a storage health probe. It owns no table; the only state is the bucket, and the audit trail goes through outbox events.

### 2. Business or technical; DDD justified?
Technical orchestration module (storage). No aggregate, no table. Rules found: key ownership by prefix `${ownerId}/` (`application/services/upload.service.ts:21-23`), TTL clamp (`:206-211`), integrity check on confirm (`:128-140`), key hashing before events (`:8-14`), key shape validation (`application/dto/_key.ts:3-9`), production guard on endpoint/creds (`infrastructure/services/storage.service.ts:55-66`). All are simple functions; the module fits the T1 description "technical or orchestration module (storage...) has no `domain/`". Also guide Ports rule 3 ("Not a module": adapter with no domain/use case) does not apply here because the module has service, DTO and routes. DDD domain not justified. Matches target.

### 3. Tree (`src/`, 18 files)
| Folder | Files |
|---|---|
| `src/` | 1 (`uploads.module.ts`) |
| `application/config` | 1 |
| `application/dto` | 5 (`_key.ts`, `confirm-upload`, `delete-upload`, `presign-download`, `presign-upload`) |
| `application/ports` | 2 (`storage.port.ts`, `health.port.ts`) |
| `application/services` | 1 (`upload.service.ts`) |
| `infrastructure/` (root) | 1 (`storage-health-probe.ts`) |
| `infrastructure/http` | 1 |
| `infrastructure/services` | 2 (`storage.service.ts`, `noop-storage.service.ts`) |
| `__TESTS__` | 4 (3 tests + layering), 40 `it()` total |
No `schemas/`, no `scripts/`.

### 4. Service vs use case
| File | Really is | Public methods |
|---|---|---|
| `application/services/upload.service.ts` | application service holding 4 use cases (orchestration: ownership, integrity, event emission, TTL) | `createUploadUrl` (`:78`), `confirmUpload` (`:116`), `deleteUpload` (`:160`), `createDownloadUrl` (`:187`) => 4 use cases `create-upload-url`, `confirm-upload`, `delete-upload`, `create-download-url` |
| `infrastructure/services/storage.service.ts` | technical service/adapter of `IStorageService` (class `S3StorageService`) | `presignUpload`, `presignDownload`, `headBucket`, `headObject`, `deleteObject`, `uploadObject`, `listObjectKeys`, `deleteObjects`, `publicUrlFor`, `keyFromPublicUrl`. Correct placement: port in application, impl in infra. Move to `infra/adapters/` |
| `infrastructure/services/noop-storage.service.ts` | adapter (null object) | same 10 methods |
| `infrastructure/storage-health-probe.ts` | infra adapter registering a health check (`OnInit`) | `onInit` |
Verdict on T6: `UploadService` is the clean case of "application service that is really several use cases"; `S3StorageService` is the clean case of a technical service that is correctly separated.

### 5. HTTP routes (`infrastructure/http/uploads.routes.ts`)
| Route | Direct call | Validation |
|---|---|---|
| `POST /presign` (`:25-41`) | `deps.UploadService.createUploadUrl` | `zV("json", presignUploadBodySchema(deps.uploadSettings))` |
| `POST /confirm` (`:42-58`) | `UploadService.confirmUpload` | `zV("json", confirmUploadBodySchema)` |
| `POST /download` (`:59-74`) | `UploadService.createDownloadUrl` | `zV("json", presignDownloadBodySchema(deps.uploadSettings))` |
| `DELETE /` (`:75-91`) | `UploadService.deleteUpload` | `zV("json", deleteUploadBodySchema)` |
All four call the service only; no store, ORM or storage port from the route. `ownerId` comes from the guard (`g.currentUserId(c)`). No `as` casts. Closest to T7 of the three modules: only the call target changes (service method -> use case). Route deps carry `uploadSettings` (`:14`) because the DTO schemas are factories over settings (`presign-upload.dto.ts:7`, `presign-download.dto.ts:5`), HTTP schema construction in the host-facing deps.

### 6. Event handlers
None. The module reacts to no event.

### 7. Events emitted
| Event | Declared | Emitted at | Kind |
|---|---|---|---|
| `upload.requested` (`packages/events/src/event-types.ts:35`) | catalog, payload `packages/events/src/payloads.ts:684` | `upload.service.ts:96` | application event (no aggregate; "presign issued") |
| `upload.confirmed` (`:36`) | catalog | `upload.service.ts:143` | application event |
| `upload.deleted` (`:37`) | catalog | `upload.service.ts:177` | application event |
All emitted by the service via `emitEvent(outbox, ...)` with a SHA-256 truncated key as aggregate id. DRIFT/gap: `upload.service.ts` has no `uow.run`: the outbox write runs with whatever ambient executor exists; the storage side effect (S3 delete at `:173`) precedes the event (`:177`) and neither is transactional with anything (object storage cannot join a DB transaction), so an event emit failure after a successful delete is not compensated. Whether `emitEvent` opens its own transaction was not verified.

### 8. Technical code in application; ports
- No SDK in application (AWS SDK only in `infrastructure/services/storage.service.ts:1-11`). Clean.
- DRIFT: infrastructure imports a DTO from application: `storage.service.ts:21` and `noop-storage.service.ts:2` import `keySchema` from `application/dto/_key`; `keyFromPublicUrl` therefore runs HTTP-layer validation in the adapter (T12/T13 grey zone: infra -> application is allowed direction, but a DTO used as domain rule).
- DRIFT: `S3StorageService` constructor throws on production misconfiguration (`:55-66`); config validation inside an adapter.
- Ports present: `IStorageService` (10 methods; 4 of them unused by the module's use cases: `headBucket` is used only by the probe, `uploadObject`, `listObjectKeys`, `deleteObjects` are used by other modules via the container key, see 13), `IHealthCheckRegistry`. `IStorageService` mixes the upload-flow capability and bulk/export capabilities; rgpd declares its own `IExportStorage` and binds it to the same container key (`modules/rgpd/src/rgpd.module.ts:23,51`), per guide Ports rule 2.
- `IHealthCheckRegistry` is declared here AND in the host (`apps/api/src/health/health.port.ts:22`): per guide this is intended (each consumer declares its own port).
- Implementations: `S3StorageService`/`NoOpStorageService` chosen in `uploads.module.ts:23-29` from `Option<S3StorageSettings>`.
- Missing: an `IKeyHasher` port (hash inline in service `:8-14`, uses `globalThis.crypto.subtle`), a clock/id port (`crypto.randomUUID()` inline `:85`).

### 9. Scattered conversions
- request -> use case input: spread of `c.req.valid("json")` into the service input in 4 routes (no mapper needed, shapes match).
- key construction `${ownerId}/${scope}/${uuid}-${filename}` inline (`upload.service.ts:85`), ownership check inline (`:21`); key-to-event-id hashing (`:8-14`) x3 call sites (`:95,142,176`).
- storage output -> use case output: inline object literals (`:104-111`, `:150-155`).
- S3 errors -> `StorageError`: via `createDbFailure("STORAGE_PROVIDER_FAILURE", logger)` plus per-method not-found mapping (`storage.service.ts:157+`, not fully read).
Mapper candidates: 2 (`upload-output.mapper`, event-payload builder), low value.

### 10. DTO locations
`application/dto/` flat, 5 files: 4 request schemas + shared `_key.ts` (underscore-prefixed shared file). Two are factories over `UploadSettings` (`presign-upload.dto.ts:7`, `presign-download.dto.ts:5`). Use-case input/output interfaces (`CreateUploadUrlInput/Output`, `ConfirmUploadInput/Output`, `CreateDownloadUrlInput/Output`, `DeleteUploadInput`) are declared in the service file (`upload.service.ts:25-68`), not in DTO files: 7 types to move next to use cases. Response shape not validated or declared as DTO.

### 11. Layer violations and ddd-kit gaps
- No application -> infrastructure import. Layering test present (`__TESTS__/layering.test.ts`).
- `Result`/`Option` used correctly (`StorageError = AppError<...>`, `keyFromPublicUrl: Option<string>`).
- `string` ids for owner (`ownerId: string`), no typed id (guide l.57 asks cross-module references to use the typed id of the referenced module; there is no `user-id.ts` module reachable, so `ownerId` stays a string).
- `expectedSize`/`expectedContentType` are trusted from the client on confirm (design, not a layering matter).
- `NoOpStorageService` logs a warn in its constructor (`:23-27`), side effect at construction.

### 12. Folder and naming gaps
- `infrastructure/` -> `infra/`; `__TESTS__` -> `__tests__`.
- `infrastructure/storage-health-probe.ts` sits at the infra root, not in a subfolder -> `infra/adapters/`.
- `infrastructure/services/{storage,noop-storage}.service.ts` -> `infra/adapters/s3-storage.adapter.ts`, `noop-storage.adapter.ts` (suffix `.service` is only for domain services in T3).
- `application/services/upload.service.ts` -> `application/usecases/{create-upload-url,confirm-upload,delete-upload,create-download-url}/`.
- `application/dto/` -> next to use cases; `_key.ts` shared schema -> small shared file inside `application/` (e.g. `usecases/_shared/`) or `infra/http` since it is also used by the S3 adapter.
- Routes -> `infra/http/routes/{presign,confirm,download,delete}/...` + `.schema.ts`.
- `application/config/upload-settings.ts` fine.

### 13. Dependencies
- Packages: `@aws-sdk/client-s3`, `@aws-sdk/s3-request-presigner` (infra only), `@packages/{ddd-kit,events,http,outbox}`, `hono`, `inwire`, `zod`. No `drizzle`, no schemas, no tables read or owned.
- Other modules: none imported. Reverse: `modules/rgpd/src/rgpd.module.ts:23,51` consumes the container key `IStorageService` (typed as its own `IExportStorage`), and `apps/api/scripts/check-wipe-rollback.ts:42` imports `NoOpStorageService` directly from the module.
- Host binds (`apps/api/src`): `container.ts:11,211` `addModule(uploadsModule)`; `composition/settings.ts:13` builds `UploadSettings`/`StorageSettings` from env (`uploadSettings`, `storageSettings` as `Option<S3StorageSettings>`); `app.ts:20,262` mounts `createUploadsRoutes(routeDeps)` on `/uploads` (also listed in rate-limited/CSRF path lists `app.ts:119-120`); `IHealthCheckRegistry` prerequisite served by the host health module (`health/module.ts:16`). The host also instantiates the `StorageHealthProbe` through the module (OnInit).
- package.json exports (`package.json:6-14`): module, settings, 2 ports, `upload.service`, `noop-storage.service`, `storage-health-probe`, routes. Importers: apps/api only (plus the rgpd container key and one script).

### 14. Tests and migration risks
40 `it()` in 3 files + layering: `upload.service.test.ts` (20), `storage.service.test.ts` (15), `routes.test.ts` (4). No real-database script (not applicable: no table) and no real-S3 check (SeaweedFS profile exists in docker compose, not exercised by a module script; not verified in CI). Risks: frozen API shape for `POST /uploads/presign|confirm|download` and `DELETE /uploads` (body union type of delete `deleteUploadBodySchema` is a `z.union`, sensitive in the emitted `AppType`); the container key `IStorageService` consumed by rgpd must keep its name and shape (10 methods) or rgpd breaks silently; `check-wipe-rollback.ts` imports the noop path; event payload contract (hashed key) read by audit and webhooks; the exported DTO factories depend on `UploadSettings` passed through route deps (changing that changes `createUploadsRoutes` signature used in `app.ts:262`).

### 15. Verdict
Mostly conform: no `domain/` (correct), clean ports/adapters split, routes call only the service. Partially conform only on naming/layout and use case split. Effort **S to M** (S if the 4 use cases stay as thin files over the same port; M with folder renames touching rgpd/scripts/host).
Ordered corrections:
1. Rename `infrastructure/` -> `infra/`, `__TESTS__` -> `__tests__`; move probe and S3/NoOp services to `infra/adapters/`; update exports and the importers (`container.ts`, `app.ts`, `settings.ts`, `check-wipe-rollback.ts`).
2. Split `UploadService` into 4 `usecases/<name>/<name>.usecase.ts` + `.dto.ts` (inputs/outputs move out of the service file); keep `UploadService`-free container keys or bind the 4 use cases.
3. Routes into `infra/http/routes/<route>/` with schema files; keep the settings-driven schema factories but move schema construction out of route deps if possible.
4. Resolve `keySchema` shared use between adapter and DTO; consider an `IKeyHasher` and id-generator port; wrap emit in `uow.run` if the guide demands it (needs verification of `emitEvent` semantics).
5. Optionally split `IStorageService` (presign flow vs bulk/export) to match the way rgpd already declares its own port.
