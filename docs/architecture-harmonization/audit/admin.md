## admin

Paths are relative to `modules/admin/` unless noted. Line numbers refer to the tree at the time of audit (branch `develop`, 3bec6dba).

### 1. Real responsibility

The staff back office server side: who is staff and with which effective permissions (role plus overrides, MFA flag), moderation of users (ban, unban, sessions, password reset), impersonation start/stop, step-up TOTP, four-eyes approvals on sensitive actions, plan overrides, staff notes, saved views, ops views (dead letters, sweep runs, Stripe replay) and two internal sweeps. It is a business module: it owns 7 tables (`schemas/staff.ts`: `staffMember`, `staffPermissionOverride`, `adminStepUp`, `adminTotpCounter`, `adminApproval`, `staffNote`, `savedView`) and 28 event types in the shared catalog.

### 2. Business or technical, DDD justified?

Business module. DDD is justified on a bounded part only, and today there is no `domain/` folder at all (see 3). The invariants that live in services, not in a model:

| Invariant | Where it is enforced |
|---|---|
| Staff access computed in one place (`staffAccessOf`), env-listed ids are managers with no override, env row whose id left the list grants nothing | `src/application/services/staff-access.ts:23-74` (pure functions) |
| Last manager cannot lose access (lock then decide in one unit) | `staff.service.ts:213-232, 252-312, 405-420, 458-476, 503-545` via `store.lockActiveManagers()` (`drizzle-staff.store.ts:220`) and `isLastManager` (`staff-access.ts:30`) |
| Nobody changes own access, nobody grants a permission not held, `staff.manage` needed | `staff.service.ts:572-627` (`refusedRoleGrant`, `refusedOverrideGrant`, `refusedChange`) |
| Approval: one pending per action and subject, requester cannot decide, subject cannot decide, decider holds the permission, requester still holds it at decision time | `approval.service.ts:150-186` (gate), `:294-335` (refusal, requesterHolds), `:349-398` (approve = claim, execute, mark in one unit); partial unique index in `schemas/staff.ts:69` |
| Approval params re-parsed on read, canonical comparison of params | `src/application/approved-action.ts:81-121` |
| Step-up: fresh TOTP consumed once, bound to session, TTL, refusal map | `step-up.service.ts:30-110` |
| Impersonation: self refused, STARTED emitted in the start unit, STOPPED with honest end reason | `admin-moderation.service.ts:121-150`, `impersonation-end.ts:6-30`, `staff.service.ts:73-99` (`signOutActor`) |
| Plan override: one active per org, replace closes previous | `plan-override.service.ts:45-83` |

Verdict on DDD: two real aggregate candidates, `StaffMember` (role + overrides + source, with `isLastManager`, `grantsStaffAccess`, `effectivePermissions` already pure) and `ApprovalRequest` (status machine pending -> approved/rejected/executed/failed/expired/cancelled, version for claim). Everything else (ban/unban, notes, saved views, plan override, step-up, ops, Stripe replay, queries, inbox) is flat orchestration over stores (`array.includes`, `count(*)`, config lookups), which the current guide explicitly keeps out of `domain/`. So target T1 would give a small `domain/staff-member/` and `domain/approval/`, and an Clean Architecture-only shape for the rest. `domain/` is not justified for the whole module.

### 3. Current tree of `src/`

95 source files in `src/` (plus `schemas/staff.ts`, 143 lines; `package.json`, `CLAUDE.md`, `tsconfig.json`). No `domain/`, no `scripts/`, no `bunfig.toml`.

| Folder | Files | Content |
|---|---|---|
| `src/` | 1 | `admin.module.ts` (356 lines) |
| `application/` (root) | 1 | `approved-action.ts` (121) |
| `application/config/` | 1 | `admin-settings.ts` |
| `application/dto/` | 13 | 13 `*.dto.ts` request schemas (list in point 10) |
| `application/event-handlers/` | 2 | `close-approvals-of-deleted-user.ts`, `notify-impersonated-user.ts` |
| `application/ports/` | 16 | 16 `*.port.ts` files, 1 per concern |
| `application/services/` | 16 | 12 `*.service.ts` classes + 4 helper files (`staff-access.ts`, `session-end.ts`, `impersonation-end.ts`, `sweep-cadence.ts`) |
| `infrastructure/http/` | 11 | 8 `*.routes.ts` + `approval-response.ts`, `relay-set-cookie.ts`, `staff-note-response.ts` |
| `infrastructure/repositories/` | 10 | 8 `drizzle-*.store.ts`, `drizzle-staff-data-eraser.ts`, `ended-sessions.ts` |
| `testing/` | 1 | `mount-admin-routes.ts` |
| `__TESTS__/` | 23 | 23 test files, 291 test cases (counted by `it(`) |

Service count: `application/services/` has 16 files = 12 classes (`AdminModerationService`, `AdminQueryService`, `ApprovalService`, `InboxService`, `OpsService`, `PlanOverrideService`, `SavedViewService`, `StaffAccessService`, `StaffNoteService`, `StaffService`, `StepUpService`, `StripeReplayService`) + 4 non-class files (`staff-access.ts`, `session-end.ts`, `impersonation-end.ts`, `sweep-cadence.ts`).

### 4. Service vs use case confusions

No `use-cases/` folder: the module follows the current guide (no aggregate -> `application/services/`). Under target T6 every class below is a bag of use cases or a technical thing. Public method counts are from the class bodies.

| Class (file) | Lines | What it really is | Public methods | Use cases it would split into |
|---|---|---|---|---|
| `StaffService` (`staff.service.ts`) | 685 | Use case orchestration + policy checks + session-ending reaction; the biggest knot | `list`, `expireImpersonations`, `countExpiredImpersonations`, `endSession`, `listOverrides`, `moderate`, `moderateBan`, `refuseBan`, `banIsSensitive`, `refuseRoleChange`, `refuseRevoke`, `assignRole`, `revoke`, `refuseOverride`, `refuseOverrideRemoval`, `setOverride`, `removeOverride`, `refusedRoleGrant`, `refusedOverrideGrant`, `refuseTarget` = 20 | About 9 use cases: ListStaff, AssignStaffRole, RevokeStaff, SetStaffOverride, RemoveStaffOverride, ListStaffOverrides, ExpireImpersonations (sweep), EndSession (auth hook reaction), and the `refuse*` family which are pre-checks for approvals (would become a domain service / `StaffMember` methods, or approval handler internals) |
| `ApprovalService` (`approval.service.ts`) | 461 | Use case orchestration | `gate`, `list`, `get`, `decide`, `cancel`, `expireDue`, `countDue`, `closeForDeletedUser` = 8 | 7 use cases: RequestApproval (gate), ListApprovals, GetApproval, DecideApproval, CancelApproval, ExpireDueApprovals, CloseApprovalsOfDeletedUser (+ CountDue as a query) |
| `AdminModerationService` (`admin-moderation.service.ts`) | 156 | Use case orchestration | `ban`, `unban`, `revokeSessions`, `resetPassword`, `startImpersonation` = 5 | 5 use cases (resetPassword and startImpersonation take a callback to the auth provider, i.e. the use case needs an `IAuthProvider` port instead of a closure supplied by the route) |
| `AdminQueryService` (`admin-query.service.ts`) | 136 | Read use cases | `listUsers`, `listOrgs`, `getOrg`, `getUser` = 4 | 4 query use cases (target T7 forbids routes reading outside use cases, so these must be use cases) |
| `StepUpService` (`step-up.service.ts`) | 126 | Use case orchestration | `validUntil`, `verify` = 2 | 2: GetStepUpStatus, VerifyStepUp |
| `StripeReplayService` (`stripe-replay.service.ts`) | 151 | Use case orchestration over 2 ports (store + gateway) | `list`, `replay` = 2 | 2: ListStripeEvents, ReplayStripeEvent |
| `PlanOverrideService` (`plan-override.service.ts`) | 114 | Use case orchestration | `set`, `revoke` = 2 | 2 |
| `SavedViewService` (`saved-view.service.ts`) | 96 | Use case orchestration | `list`, `save`, `remove` = 3 | 3 |
| `InboxService` (`inbox.service.ts`) | 84 | Read composition (3 reads in parallel) | `forStaff` = 1 | 1 query use case |
| `OpsService` (`ops.service.ts`) | 76 | Use case orchestration | `deadLetters`, `requeue`, `sweeps` = 3 | 3 |
| `StaffNoteService` (`staff-note.service.ts`) | 62 | Use case orchestration | `list`, `add` = 2 | 2 |
| `StaffAccessService` (`staff-access.service.ts`) | 93 | Application service used by the host guard (`apps/api/src/shared/middleware/staff-guards.ts`): reads access, bootstraps env-listed manager (writes + emits `ADMIN_STAFF_ADDED`), `impersonatorHolds` | `read`, `gate`, `impersonatorHolds` = 3 | 3 use cases or one application service; it is the one class the guard must call per request, so a use case per call is a hot-path concern |
| Non-class helpers | | `staff-access.ts` (pure domain rules: `grantsStaffAccess`, `isLastManager`, `permissionsOfRecord`, `staffAccessOf`, `StaffEnv`), `session-end.ts` + `impersonation-end.ts` (emit helpers, `emitEvent` in `application/`), `sweep-cadence.ts` (pure rule `isSweepLate`) | | `staff-access.ts` and `sweep-cadence.ts` are domain material; the two `*-end.ts` are event publishing helpers |

Totals: 12 service classes, 71 public methods (20+8+5+4+2+2+2+3+1+3+2+3), about 55 target use cases once the `refuse*` pre-checks and `count*` helpers are folded in. None of the classes is a technical service or external integration in the T6 sense; those are the ports (`IAuthProvider`, `IStripeEventGateway`, `ITotpVerifier`, `ILocaleReader`).

Cross-service calls: the module-file `ApprovalHandlers` (admin.module.ts:150-289) composes `StaffService` and `AdminModerationService` from inside the container wiring (see point 11).

### 5. HTTP routes

Total 40 handlers in 8 routes files (grep of `.get/.post/.put/.delete(`), mounted by the host in `apps/api/src/app.ts:263-270` (+ internal routes elsewhere). Validators: `zV` from `@packages/http/validator` for `json` and `query` only. **No route validates a path param**: 25 `c.req.param(...)` reads, all raw strings (ids, `overrideId`, `:id`). No `as` cast on request data was found (grep of ` as ` in `src/infrastructure` and `src/application`: none outside `as const`).

Legend: SVC = application service, GUARD = host `RouteGuards` function (auth/permission/step-up, not business).

#### `admin.routes.ts` (`/admin/users`, `createAdminUserRoutes`)

| Handler | Calls directly | Zod |
|---|---|---|
| `GET /` (l.61-75) | `AdminQueryService.listUsers`; `serializeUser` mapper in route (l.48-55) | query `listUsersQuerySchema` |
| `GET /:id` (l.76-90) | `findUserOr404` (route helper l.35-46) -> `AdminQueryService.getUser`; throws `HTTPException(404)` itself; inline session serializer | none (param raw) |
| `POST /:id/ban` (l.91-135) | **Orchestration in route**: `StaffService.banIsSensitive`, `g.assertStepUp`, `ApprovalService.gate`, then `StaffService.moderateBan(..., () => AdminModerationService.ban)` | body `banUserBodySchema`; param raw |
| `POST /:id/unban` (l.136-145) | `StaffService.moderate(..., () => AdminModerationService.unban)` (route composes two services via closure) | param raw |
| `POST /:id/reset-password` (l.146-164) | `findUserOr404`, `StaffService.moderate`, `AdminModerationService.resetPassword(..., () => IAuthProvider.requestPasswordReset(u.email))`: provider port called from the route | param raw |
| `DELETE /:id/sessions` (l.165-180) | `findUserOr404` then `StaffService.moderate(..., revokeSessions)` | param raw |
| `GET /:id/notes` (l.181-186) | `StaffNoteService.list`, `serializeStaffNote` | param raw |
| `POST /:id/notes` (l.187-202) | `StaffNoteService.add` | body `addStaffNoteBodySchema`; param raw |

#### `staff.routes.ts` (`/admin`, `createAdminStaffRoutes`)

| Handler | Calls directly | Zod |
|---|---|---|
| `GET /me` (l.29-47) | `StepUpService.validUntil`, reads `deps.staffSettings` (settings object injected into route), builds the response from session/staff | none |
| `POST /step-up` (l.48-59) | `StepUpService.verify` | body `stepUpBodySchema` |
| `GET /staff` (l.60-70) | `StaffService.list`, inline serializer | none |
| `PUT /staff/:id/role` (l.71-103) | `ApprovalService.gate` then `StaffService.assignRole` (gate-or-execute orchestration in route) | body `setStaffRoleBodySchema`; param raw |
| `DELETE /staff/:id` (l.104-129) | `ApprovalService.gate` then `StaffService.revoke` | param raw |
| `GET /staff/:id/overrides` (l.130-148) | `StaffService.listOverrides`, inline serializer | param raw |
| `POST /staff/:id/overrides` (l.149-183) | `ApprovalService.gate` then `StaffService.setOverride`; `Option.fromNullable(...).map(new Date)` conversion in route (l.177) | body `setStaffOverrideBodySchema`; param raw |
| `DELETE /staff/:id/overrides/:overrideId` (l.184-215) | `ApprovalService.gate` then `StaffService.removeOverride` | params raw |

#### `admin-orgs.routes.ts` (`/admin/orgs`)

| Handler | Calls directly | Zod |
|---|---|---|
| `GET /` (l.31-48) | `AdminQueryService.listOrgs`, inline serializer | query `listOrgsQuerySchema` |
| `GET /:id` (l.49-66) | `AdminQueryService.getOrg`, 404 thrown in route (l.53), serializer | param raw |
| `POST /:id/plan-override` (l.67-86) | `PlanOverrideService.set`; `new Date(expiresAt)` in route | body `setPlanOverrideBodySchema` |
| `DELETE /:id/plan-override` (l.87-101) | `PlanOverrideService.revoke` | param raw |
| `GET /:id/notes` (l.102-107), `POST /:id/notes` (l.108-123) | `StaffNoteService` | body `addStaffNoteBodySchema` (POST) |
| `POST /:id/sso-enforcement` (l.124-144) | `ssoEnforcementChangeNeedsStepUp` (rule living in a DTO file) + `g.assertStepUp`, then `deps.AdminActionService.setSsoEnforcement(...)` where `AdminActionService` is a **host class** typed as `ISsoEnforcement` | body `setSsoEnforcementBodySchema` |

#### `admin-impersonation.routes.ts` (`/admin/impersonation`)

| Handler | Calls directly | Zod |
|---|---|---|
| `POST /:id/start` (l.33-63) | `IAuthProvider.impersonationTtlSeconds`, computes `expiresAt` from `Date.now()` (l.51), `AdminModerationService.startImpersonation(..., () => IAuthProvider.impersonateUser(targetId, c.req.raw.headers))`, `upstreamResult` (Response -> Result, l.11-18), `relaySetCookie` | body `impersonateBodySchema`; param raw |
| `POST /stop` (l.64-76) | **No service at all**: checks `g.currentSession(c).impersonatedBy`, throws `HTTPException(400, "ADMIN_NOT_IMPERSONATING")`, calls `IAuthProvider.stopImpersonating(headers)` directly, relays cookie | none |

#### `approvals.routes.ts` (`/admin/approvals`)

| Handler | Calls directly | Zod |
|---|---|---|
| `GET /` (l.37-51), `GET /:id` (l.52-57), `POST /:id/decide` (l.58-75), `POST /:id/cancel` (l.76-84) | `ApprovalService.list/get/decide/cancel`; `serializeApproval` in route (l.15-31) | query `listApprovalsQuerySchema`, body `decideApprovalBodySchema`; params raw |

#### `ops.routes.ts` (`/admin/ops`)

| Handler | Calls directly | Zod |
|---|---|---|
| `GET /dead-letters` (l.23-42) | `OpsService.deadLetters`, serializer | none |
| `POST /outbox/requeue` (l.43-58) | `OpsService.requeue` | body `requeueOutboxBodySchema` |
| `GET /sweeps` (l.59-72) | `OpsService.sweeps`, serializer | none |
| `GET /stripe-events` (l.73-91) | `StripeReplayService.list`, calls `deps.isReplayableStripeEvent(row.type)` per row in the route (business rule evaluated in HTTP layer) | none |
| `POST /stripe-events/:id/replay` (l.92-107) | `StripeReplayService.replay({ handler: (request) => IAuthProvider.handle(request) })`: route injects the BetterAuth webhook handler as a callback | param raw |

#### `workspace.routes.ts` (`/admin`)

| Handler | Calls directly | Zod |
|---|---|---|
| `GET /inbox` (l.21-66) | `InboxService.forStaff`; large inline serializer with `SECTION_FAILED` mapping (l.26-65) | none |
| `GET /views` (l.67-77), `POST /views` (l.78-87), `DELETE /views/:id` (l.88-96) | `SavedViewService.list/save/remove` | body `staffViewSchema` (from `@packages/access-control`, not an admin DTO); param raw |

#### `admin-internal.routes.ts` (`/internal/sweep-admin-*`, gated by `internalGuards`)

| Handler | Calls directly | Zod |
|---|---|---|
| `POST /sweep-admin-approvals` (l.86-88), `POST /sweep-admin-impersonations` (l.89-91) | `deps.runSweep` (host sweep runner) with passes calling `ApprovalService.expireDue/countDue` and `StaffService.expireImpersonations/countExpiredImpersonations`; `valueOrThrow` helper (l.37-42) | body `sweepBodySchema` (`@packages/http/sweep-runner`) |

Summary against T7/T8: no route touches a store, repository or ORM directly (the layering test forbids it), but 40 of 40 handlers call services, not use cases (guide-conform). T7 gaps: gate-or-execute orchestration in 5 handlers (`admin.routes.ts:91-135`, `staff.routes.ts:71-103, 104-129, 149-183, 184-215`), direct provider calls (`admin.routes.ts:157`, `admin-impersonation.routes.ts:55, 70`, `ops.routes.ts:101`), business rule evaluated in route (`ops.routes.ts:88`, `admin-orgs.routes.ts:133`), `findUserOr404` + 404 logic in route (`admin.routes.ts:35-46, 172, 153`, `admin-orgs.routes.ts:53`), the `/stop` handler with no use case (`admin-impersonation.routes.ts:64-76`). T8 gap: path params unvalidated (25), and body schemas live in `application/dto/` (not in the HTTP layer).

### 6. Event handlers

| Handler | File | Does directly | Verdict |
|---|---|---|---|
| `closeApprovalsOfDeletedUser` (reacts to `USER_DELETED`) | `src/application/event-handlers/close-approvals-of-deleted-user.ts:12-18` | Parses payload (`payloadParser`), calls `ApprovalService.closeForDeletedUser(payload.userId)` and nothing else | Conform to T10 (pure dispatch to one service method; becomes one use case `CloseApprovalsOfDeletedUser`) |
| `notifyImpersonatedUser` (reacts to `ADMIN_IMPERSONATION_STARTED`) | `src/application/event-handlers/notify-impersonated-user.ts:28-54` | Reads user via `AdminQueryService.getUser` (l.32), reads locale via `ILocaleReader` (l.39), formats two dates with `toLocaleString` and a local `FORMAT` constant (l.16-22, 45-46), sends the email with `IEmailService.sendTemplate` and builds the template payload and idempotency options (`handlerIdempotency`, l.50). Depends on `IEmailService` (kit port) directly | Non conform to T10: holds orchestration (3 dependencies, formatting, payload building) and calls a technical service. Needs a use case `NotifyImpersonatedUser` that owns it; the handler becomes a dispatch |

Both are registered in `admin.module.ts:345-354` and handed to the host dispatcher. Neither emits events nor writes stores.

### 7. Events emitted

All 27 `emitEvent` calls (26 in `application/`, 1 `emitEventBestEffort` in `step-up.service.ts:110-121`) are in application services; none in a domain model (there is none) and none in a route or hook. Event types come from the shared catalog `packages/events` (not declared in the module). All are emitted inside `uow.run` except `ADMIN_STEP_UP_FAILED` (best effort, outside, by design).

| Event type(s) | Emit site | Domain or application event |
|---|---|---|
| `ADMIN_STAFF_ADDED` (x2), `ADMIN_STAFF_ROLE_CHANGED`, `ADMIN_STAFF_REVOKED`, `ADMIN_STAFF_OVERRIDE_SET`, `ADMIN_STAFF_OVERRIDE_REVOKED` | `staff.service.ts` (l.298, 329, 382, 422, 562), `staff-access.service.ts:83` (bootstrap) | Domain events of a `StaffMember` aggregate (would move to `domain/staff-member/events/`) |
| `ADMIN_APPROVAL_REQUESTED/DECIDED/EXECUTED/FAILED/CANCELLED/EXPIRED` | `approval.service.ts` `announce` (l.451-461, 9 call sites incl. `closeForDeletedUser`, `expireDue`) | Domain events of an `ApprovalRequest` aggregate |
| `ADMIN_STEP_UP_VERIFIED`, `ADMIN_STEP_UP_FAILED` | `step-up.service.ts:92, 110` | Application events (security audit, no aggregate) |
| `ADMIN_USER_BANNED/UNBANNED/PASSWORD_RESET/SESSIONS_REVOKED` + `USER_SIGNED_OUT` per ended session | `admin-moderation.service.ts` (l.63, 81, 96, 115), `session-end.ts:12` (shared helper) | Application events (the user aggregate belongs to auth) |
| `ADMIN_IMPERSONATION_STARTED` | `admin-moderation.service.ts:139` | Application event |
| `ADMIN_IMPERSONATION_STOPPED` | `impersonation-end.ts:22`, called from `staff.service.ts` (`expireImpersonations`, `endSession`, `endImpersonationsIfLost`) and `admin-moderation.service.ts` | Application event |
| `ADMIN_NOTE_ADDED`, `ADMIN_VIEW_SAVED`, `ADMIN_VIEW_DELETED` | `staff-note.service.ts:52`, `saved-view.service.ts:58, 87` | Application events |
| `ADMIN_PLAN_OVERRIDE_SET/REVOKED` | `plan-override.service.ts:66, 104` | Application events |
| `ADMIN_OPS_OUTBOX_REQUEUED`, `ADMIN_OPS_STRIPE_EVENT_REPLAYED` | `ops.service.ts:58`, `stripe-replay.service.ts:99` | Application events |

Consumed: `USER_DELETED` (handler 1), `ADMIN_IMPERSONATION_STARTED` (handler 2, its own event). T9/T11 gaps: the publisher is the kit `IOutboxRepository` + `emitEvent` helper (`@packages/outbox`), injected into 11 services as a constructor dependency and imported statically (`emitEvent` from `@packages/outbox/event-emitter`, 12 application files). That is a kit port, not a module port; target T11 wants a module port in `application/ports/` and an adapter in `infra/adapters/`. Under the current guide this is correct.

### 8. Technical implementations in `application/`, ports missing or misplaced

- `application/dto/list-approvals.dto.ts:1,15-17`: `approvalCursorOf` builds a cursor via `encodeTimeIdCursor` from `@packages/http` (HTTP-package kit); also `application/services/admin-query.service.ts:2,22-32` does cursor encoding in the service. Pagination encoding is HTTP-kit work inside application.
- `application/services/inbox.service.ts:5` and `ops.service.ts`: import `ISweepRunStore`/`SweepRun` from `@packages/http/sweep-run.port`: the port is declared in the HTTP kit, not in the module (consumer-declares-port rule of the current guide is bent for a kit port).
- `application/services/*.ts`: static import of `emitEvent` and `EventTypes` from kit packages (12 files). Allowed by the guide, forbidden by T11 purity.
- `application/event-handlers/notify-impersonated-user.ts:2,4`: `IEmailService` from `@packages/email` used directly and `Intl` formatting in the handler.
- `application/ports/auth-provider.port.ts:5-10`: `IAuthProvider` returns raw `Response` (`impersonateUser`, `stopImpersonating`, `handle(request: Request): Promise<Response>`) and takes `Headers`: HTTP/Fetch types leak into a port. The port is declared in admin and bound by the host to the auth instance (`apps/api/src/composition/auth-provider.ts`).
- `application/ports/stripe-event.port.ts:33,41-50`: `StripeWebhookHandler = (request: Request) => Promise<Response>` in the port; the replay use case receives an HTTP handler closure from the route (`ops.routes.ts:101`).
- Ports carry data records (`AdminUserRow`, `ApprovalRecord`, `StaffRecord`...): guide-conform ("data records live with their port"), but with target T3 the staff and approval records would split into domain entities.
- Port to DTO dependency: `ports/admin-user-store.port.ts:44`, `admin-org-store.port.ts:23`, `approval-store.port.ts:70` import `ListUsersInput`/`ListOrgsInput`/`ListApprovalsInput` from `application/dto/` (zod-inferred HTTP input types used as store query types), and `dto/list-approvals.dto.ts:3` imports `APPROVAL_STATUSES` from a port: a port/DTO cycle.
- Port implementations: all in `infrastructure/repositories/` (8 stores). Six ports have **no implementation in this module**, bound by the host: `IPlanOverrideStore` (also `IPlanOverrideReader`), `IStripeEventStore`, `IStripeEventGateway`, `IEntitlementsReader` (as `EntitlementsService`), `IDeadWebhookReader` (as `WebhooksService`), `ITotpVerifier` (`apps/api/src/shared/services/drizzle-totp-verifier.ts`), `ILocaleReader`, `IAuthProvider`, `ISsoEnforcement` (host `AdminActionService`, `apps/api/src/container.ts:200`). `ISsoEnforcement` (`ports/sso-enforcement.port.ts`) is not in the `AdminPrerequisites` but only consumed by the route deps.
- Missing port: none for outbox (kit); a module-level `IEventPublisher` does not exist (target T11).

### 9. Scattered data conversions (candidates for mappers)

There is no `mappers/` folder. Conversions are in:
- Routes (record -> response, 6 sites): `admin.routes.ts:48-55` (`serializeUser`) and `:80-88` (session serializer), `approvals.routes.ts:15-31` (`serializeApproval`), `staff.routes.ts:35-46, 64-69, 138-146`, `admin-orgs.routes.ts:41-44, 55-65`, `ops.routes.ts:29-41, 63-71, 79-90`, `workspace.routes.ts:26-65`, `staff-note-response.ts:3-10`. About 10 distinct serializers, all HTTP-specific (T12: stays in the HTTP layer, but should be named presenters or mappers, one per route).
- Route-side request conversions: `staff.routes.ts:177` (`Option.fromNullable(body.expiresAt).map(new Date)`), `admin-orgs.routes.ts:79` (`new Date(expiresAt)`), `admin-impersonation.routes.ts:51` (expiresAt from TTL).
- Stores (row -> record, inside the file, per current guide): `drizzle-admin-user.store.ts:65-89` (`toUserRow`, `toSessionRow`), `drizzle-approval.store.ts:51-89` (`recordOf`, `recordsOf`, `firstOf`, `isStatus`), `drizzle-staff.store.ts:54-73` (`sourceOf`, `overrideOf`) and ~10 inline mapping blocks, `ended-sessions.ts:22-33`, `drizzle-admin-org.store.ts` inline, `drizzle-saved-view.store.ts`, `drizzle-staff-note.store.ts`.
- Application-side conversions: `staff-access.ts:43-49` (`permissionsOfRecord`: record -> effective permissions), `approved-action.ts:94-121` (`readApprovedAction`: stored record -> typed action, zod re-parse), `admin.module.ts:154-287` (params translation inside container wiring), `impersonation-end.ts:15-20` (payload building), `approval.service.ts:451-461` (`refOf` + `announce` payload building).

### 10. DTO locations

13 files in `src/application/dto/` (global folder, target T4 wants them next to their use case): `add-staff-note`, `ban-user`, `decide-approval`, `impersonate`, `list-approvals`, `list-orgs`, `list-users`, `requeue-outbox`, `set-plan-override`, `set-sso-enforcement`, `set-staff-role`, `staff-override`, `step-up` (all `.dto.ts`, all exporting `z.object` request schemas named `*BodySchema` / `*QuerySchema` + inferred `*Input` for 3 of them).
- All are consumed from `infrastructure/http/*.routes.ts` (HTTP schemas in application: against T8 "HTTP schemas stay in the HTTP layer") and 3 are also reused as domain-ish input types (`ListUsersInput` etc. in ports).
- Impure DTO files: `list-approvals.dto.ts:15-17` (cursor builder function), `set-sso-enforcement.dto.ts:7-9` (`ssoEnforcementChangeNeedsStepUp`, a business rule), `set-plan-override.dto.ts:3-10` (date bound rule `isWithinBound`), `staff-override.dto.ts:7` (future-date refine).
- Also in the dto family but located elsewhere: `staffViewSchema` in `@packages/access-control` (used by `workspace.routes.ts:78`), `sweepBodySchema` in `@packages/http/sweep-runner`.
- No per-use-case DTO exists since there are no use cases; the services take inline anonymous input object types (e.g. `staff.service.ts:44-75` interfaces `StaffChange`, `StaffGrantingChange`, `StaffOverrideChange`).
- Exported publicly: only `./application/dto/set-sso-enforcement.dto` (consumer: host).

### 11. Layer violations and ddd-kit convention gaps

Layer rules (T13) as the checker sees them: `layering.test.ts` passes (`assertModuleLayering`), there is no import of `infrastructure/`, `drizzle-orm`, `hono` or `@packages/drizzle` from `application/` (grep: none). Findings:
- `application/` imports `@packages/outbox`, `@packages/events`, `@packages/http` (cursor, sweep port), `@packages/email`, `@packages/i18n`, `@packages/access-control`: kit packages, allowed by the current guide, not by a strict T13 reading.
- Route layer imports `drizzle` kit types: `admin-internal.routes.ts:6` (`SweepSpans` from `@packages/drizzle/sweep-span`, type only) and `hono-pino` (l.17).
- Business orchestration in the container wiring: `admin.module.ts:150-289` defines `ApprovalHandlers` (4 actions x `prepare`, `authorize`, `run`, 140 lines, with branching on `params.op`, `Option` building, param translation) inside the module file. Not DI wiring, it is application logic misplaced in the composition root (should be 4 handler classes or use cases in `application/`).
- `ApprovalService` -> `StaffService` -> `AdminModerationService` coupling runs through the closure in `ApprovalHandlers` (service calls service via the container, contradicts "a service never injects another service" only in letter, not in the guide's text since it goes through the map).
- Routes compose services via closures (`StaffService.moderate(..., () => AdminModerationService.ban)` at `admin.routes.ts:122-131, 139-142, 154-159, 173-176`): the orchestration of two services is done in HTTP.
- Time and IDs: `Date.now()` / `new Date()` in services and routes (`approval.service.ts:101`, `admin-moderation.service.ts:49`, `admin-impersonation.routes.ts:51`) and `uuidv7()` in `plan-override.service.ts:48`: no clock/id port, tests rely on mocks.
- ddd-kit conventions not met because there is no domain: no `AggregateRoot`, no `ValueObject`, no typed id (`staff-member-id.ts`, `approval-id.ts`; every id is a `string`, e.g. `userId`, `approvalId`, `overrideId`), `StaffRole`, `StaffPermission`, `ApprovalAction`, `ApprovalStatus` are string unions rather than VOs (some from `@packages/access-control`). Events are plain payload objects emitted by services, no `addEvent`.
- `Result` / `Option`: used consistently (stores return `Result<..., XStoreError>`, absence is `Option`, errors are typed codes), `AppErrorException` thrown at the route boundary (`.isFailure` -> throw) in all 40 handlers. Good fit for the target. Leaks: `IAuthProvider` returns `Response` (point 8), `ILocaleReader.localeOf` returns `Promise<Locale>` without `Result` (`ports/locale-reader.port.ts:4`), `IDeadWebhookReader.countDeadLetters` returns `Result<number, AppError>` (untyped code).
- `as` casts / `!`: none found in `src/` outside tests (grep ` as ` excluding `as const`).
- Public interface surface: 12 service classes expose `Pick<Service, ...>` in route deps (`admin.routes.ts:25-32` etc.): routes are wired to method names of services.

### 12. Folder and naming gaps (T2 to T5)

| Target | Current | Gap |
|---|---|---|
| T2 root: `__tests__/`, `application/`, `domain/`, `infra/`, `<name>.module.ts` | `__TESTS__/`, `application/`, `infrastructure/`, `testing/`, `admin.module.ts` | `__TESTS__` -> `__tests__`; `infrastructure/` -> `infra/`; extra `testing/` (1 file, `mount-admin-routes.ts`, consumed by the host test `apps/api` via `@modules/admin/testing/mount-admin-routes`) |
| T3 `domain/<concept>/...` | no `domain/`; pure rules sit in `application/services/staff-access.ts`, `sweep-cadence.ts`, `application/approved-action.ts` | Create `domain/staff-member/` (`staff-member.aggregate.ts`, `staff-member-id.ts`, value objects for role/permission/override, `events/`, `services/` for access computation) and `domain/approval/` |
| T4 `application/usecases/<name>/<name>.usecase.ts` + `.dto.ts` | `application/services/*.service.ts` (12 classes), `application/dto/` (13) | Replace by about 55 use cases, move DTOs next to them (or HTTP schemas to `infra/http/routes/<route>/<route>.schema.ts` per T8) |
| T4 `application/ports/{repositories,services}/` | flat `application/ports/` of 16 files, `*.port.ts` | Split in `ports/repositories/` (store ports: admin-user, admin-org, approval, ops, plan-override, saved-view, staff-note, staff, step-up, stripe-event) and `ports/services/` (auth-provider, entitlements-reader, dead-webhook-reader, locale-reader, sso-enforcement, totp-verifier, stripe gateway) |
| T4 `application/event-handlers/` | exists, 2 files named `<verb>-<noun>.ts` | conform; add `application/mappers/` |
| T5 `infra/repos/drizzle/` | `infrastructure/repositories/drizzle-*.store.ts` (8 stores + eraser + `ended-sessions.ts`) | rename folder and `*.store.ts` -> repository naming |
| T5 `infra/http/routes/<route>/<route>.ts` + `<route>.schema.ts` | `infrastructure/http/<name>.routes.ts` flat, 11 files | restructure to `routes/<route>/` with schemas split out of `application/dto/`; the 3 helpers (`approval-response.ts`, `relay-set-cookie.ts`, `staff-note-response.ts`) become presenters |
| T5 `infra/adapters/` | no adapters; all adapters for this module's ports live in the host | adapters not required in module unless implementations move in |
| `application/approved-action.ts` and `application/config/` | root-level file in `application/` | `approved-action.ts` is the handler contract + zod re-parse of stored params; fits under `application/` (approval concept) or `domain/approval/` |

Smaller naming: `drizzle-staff-data-eraser.ts` has no `.store.ts`/`.repository.ts` suffix (class `DrizzleStaffDataEraser`); `ended-sessions.ts` is a mapper in a repositories folder; `*.routes.ts`.

### 13. Dependencies

Packages (`package.json` dependencies): `@packages/access-control`, `ddd-kit`, `drizzle`, `email`, `events`, `http`, `i18n`, `outbox` + `drizzle-orm`, `hono`, `hono-pino`, `inwire`, `zod`. Dev: `@packages/test`, `typescript-config`.

Other modules: none imported (cross-module rule). Needs towards other modules are ports served by the host: `IPlanOverrideStore`/`IPlanOverrideReader` (billing), `IEntitlementsReader` (billing `EntitlementsService`), `IStripeEventStore` (billing), `IStripeEventGateway`, `isReplayableStripeEvent` (billing `stripe-event.port`, `apps/api/src/composition/sources/admin.ts:6, 22`), `IDeadWebhookReader` (webhooks), `ILocaleReader` (profile via `IProfileStore`, `sources/admin.ts:17-20`), `IAuthProvider` (auth instance, `apps/api/src/composition/auth-provider.ts`), `ISsoEnforcement` (host `AdminActionService`), `ITotpVerifier` (host `drizzle-totp-verifier.ts`). `staffLookupOnce` is a request-scoped memo bound by the host (`shared/request-context.ts`).

Events of other modules: reacts to `USER_DELETED` only (`close-approvals-of-deleted-user.ts:13`); its own `ADMIN_IMPERSONATION_STARTED` is consumed by its own handler.

Tables read that it does not own (kit tables, allowed by the guide, rule 5): `authSchema.user`, `authSchema.session` (read and written: `drizzle-admin-user.store.ts:41-324`, `drizzle-staff.store.ts:74, 184, 228`, `drizzle-step-up.store.ts:8, 56`, `ended-sessions.ts:4`), `multiTenantSchema.organization`, `member` (`drizzle-admin-org.store.ts:34, 60, 103, 135`), outbox tables (via `DrizzleOpsStore`, `drizzle-ops.store.ts`, plus `IDeadWebhookReader`/email queue counts). Writes to auth tables: ban/unban on `user`, deletion of `session` (`drizzle-admin-user.store.ts:253-330`, `drizzle-staff.store.ts` impersonation session deletes): writes of a kit table outside the erasure case of rgpd, tolerated by the module's own invariants (moderation).

Exports of `package.json`: 45 export entries exposing individual files at 3 layers (`./application/ports/*`, `./application/services/*`, `./infrastructure/*`, `./testing/*`, `./schemas/*`, `./admin.module`). Importers (counts of `@modules/admin/...` specifiers across `apps`, `modules`, `packages`): `apps/api` only (plus `modules/rgpd/CLAUDE.md` mentions in text). Heaviest: `schemas/staff` x11, `application/ports/staff-store.port` x5, `staff-access.service` x4, `staff-access` x4, `staff.service` x3, `admin-internal.routes` x2, `stripe-event.port` x2, `auth-provider.port` x2, 8 route factories x1 each, `admin.module` x1, plus single imports (`ended-sessions`, `drizzle-staff.store`, `drizzle-staff-data-eraser`, `locale-reader.port`, `admin-settings`, `set-sso-enforcement.dto`, `admin-moderation.service`, `impersonation-end`, `stripe-replay.service`). Host importers: `apps/api/src/{app,client,container}.ts`, `shared/middleware/staff-guards.ts`, `shared/request-context.ts`, `shared/services/drizzle-totp-verifier.ts`, `composition/{settings,auth-provider}.ts`, `composition/sources/{admin,rgpd,auth}.ts`, `auth/ports.ts`, `organization/routes.ts`, `queries/staff-recipients.query.ts`, tests `staff-guards.test.ts`, `staff-lookup-once.test.ts`, `staff-permission-matrix.test.ts`, and 11 scripts under `apps/api/scripts/` (`check-admin-*.ts`, `admin-probes.ts`, `check-wipe-rollback.ts`, `check-totp-enrolment.ts`, `seed-staff.ts`). rgpd consumes `IStaffStore`, `IStaffAccessRules`, `IStaffDataEraser`, `IEndedSessionsReader` served by admin (`modules/rgpd/CLAUDE.md`, Ports exposed). `apps/api/src/queries/staff-recipients.query.ts` mirrors `staffAccessOf` in SQL.

Impact: a migration that moves or renames files breaks 45 export paths and about 30 host files; the deep-path exports to `application/services/*` and `infrastructure/repositories/*` are the costly part (they are the only public contract with the host).

### 14. Tests and regression risks

23 test files, 291 test cases, under `src/__TESTS__/` (counted with `it(`):

| Area | Files (cases) |
|---|---|
| Services | `staff.service.test.ts` (62), `approval.service.test.ts` (31), `admin-moderation.service.test.ts` (16), `staff-access.service.test.ts` (16), `admin-query.service.test.ts` (12), `stripe-replay.service.test.ts` (9), `step-up.service.test.ts` (7), `plan-override.service.test.ts` (5), `inbox.service.test.ts` (4), `ops.service.test.ts` (4), `saved-view.service.test.ts` (4), `staff-note.service.test.ts` (2) |
| Pure rules | `staff-access.test.ts` (14), `sweep-cadence.test.ts` (2) |
| Routes | `admin-impersonation.routes.test.ts` (7), `step-up-routes.test.ts` (2), `relay-set-cookie.test.ts` (2) |
| Handlers | `notify-impersonated-user.test.ts` (5) |
| DTO | `admin-dto.test.ts` (3), `plan-override.dto.test.ts` (3) |
| Stores | `drizzle-admin-user.store.test.ts` (3), `drizzle-staff.store.test.ts` (3) |
| Layering | `layering.test.ts` (1, `assertModuleLayering`) |

Tests are given/when/then style on services with mocked ports; only 6 cases touch the stores; no test on `ApprovalHandlers` wiring in `admin.module.ts` (tested indirectly via `approval.service.test.ts` with stubbed handlers). Missing: route tests for 7 of 8 routes files (only impersonation, step-up and cookie relay), handler `close-approvals-of-deleted-user` has no dedicated test.

Regression risks of a migration:
- Frozen API shape: `check:api-shape` compares `AppType` and the `METHOD path` inventory (40 admin handlers + the internal ones) with `apps/api/shape/`. Splitting services into use cases is invisible to it as long as route typing stays; moving route files changes nothing visible if the factory names and paths stay. Changing zod schemas (adding path-param validation) can change the `AppType` input types (a drift to fix in code, not to refreeze unless structural).
- Real-database checks in `apps/api/scripts/` (not in the module): `check-admin-staff`, `check-admin-atomicity` (last-manager lock proof), `check-admin-approval`, `check-admin-step-up`, `check-admin-accounts`, `check-admin-ops`, `check-admin-workspace`, `check-wipe-rollback`, `check-totp-enrolment`; they import the module by deep path (see point 13), so renaming `application/services/*` or `infrastructure/repositories/*` breaks them.
- Layering test `layering.test.ts` uses `assertModuleLayering` which expects the current folder names (`application`, `infrastructure`, `domain`); renaming to `infra/` needs the shared helper and `.dependency-cruiser.cjs` updated (they are in packages, not in this module), and the same rename would impact every module.
- External contracts: 28 event types and payloads in `packages/events`; email template `impersonation_started`; the SQL mirror in `apps/api/src/queries/staff-recipients.query.ts`; `rgpd` ports served by admin; BetterAuth hooks that call `StaffService.endSession` / `announceSessionsEnded` (host `auth/ports.ts`, `composition/sources/auth.ts`); outbox idempotency keys (`handlerIdempotency("notify-impersonated-user", event)`).
- Behaviour traps: last-manager lock ordering (`lockActiveManagers` must stay first in the same unit), approve = claim + execute + mark in one unit with the failure recorded in a separate unit, `ADMIN_STEP_UP_FAILED` best effort outside the unit, `ADMIN_STEP_UP_MFA_FORBIDDEN` raised both by the host guard and by `StepUpService`.

Not checked: runtime behaviour (no test run, no DB), `apps/api` internals beyond the import and binding sites, `packages/events` payload definitions (only counted via emit sites), whether `check:boundaries` and `check:api-shape` currently pass.

### 15. Verdict

**Partially conform.** Conform: Clean Architecture dependency direction (application -> ports only, zero infra/ORM/framework imports in `application/`, enforced by `layering.test.ts`), `Result`/`Option` and typed error codes everywhere, ports consumer-declared, stores behind ports with ambient transaction, handler `close-approvals-of-deleted-user` is a pure dispatch, no `as` casts, 40/40 handlers validate body or query with `zV` when they have one, routes never reach a store. Non conform: no use cases (12 service classes, 71 public methods), no `domain/` although two aggregates are real (`StaffMember`, `ApprovalRequest`), 5 route handlers orchestrate (gate-or-execute, two-service closures), 4 call providers directly, path params never validated (25), body schemas in `application/dto/` instead of the HTTP layer, one handler (`notify-impersonated-user`) holds orchestration and a technical service, 140 lines of application logic in `admin.module.ts`, `IAuthProvider` leaks `Response`, naming (`infrastructure/`, `__TESTS__`, `*.store.ts`, `*.service.ts`, `application/dto/`, flat `ports/`).

**Effort: XL.** Largest module (95 files), 12 services to split into about 55 use cases, a domain to extract with ddd-kit shapes for two aggregates, 45 deep-path exports used by about 30 host files and 11 real-database scripts, plus stores renamed (`infra/repos/drizzle/`) and a rename of `infrastructure/` and `__TESTS__` that depends on shared tooling (`assertModuleLayering`, dependency-cruiser).

Ordered corrections (each step keeps `check:api-shape`, the layering test and the `check:admin-*` scripts green):
1. Safety net first: add route-level tests for the 7 uncovered routes files and run the 9 host `check:admin-*` scripts as the baseline (no refactor yet).
2. Mechanical renames in one commit: `__TESTS__` -> `__tests__`, `infrastructure/` -> `infra/`, `repositories/` -> `repos/drizzle/`, `*.store.ts` naming, `http/` -> `routes/<route>/`; update `package.json` exports, host imports (30 files), scripts, `assertModuleLayering` and `.dependency-cruiser.cjs` (shared work, do once for all modules).
3. Split `application/ports/` into `repositories/` and `services/`; fix `IAuthProvider` (no `Response`: return a result with the cookies to relay, or a dedicated `ImpersonationSession` record) and the stripe handler callback; break the port/DTO cycle (store query types declared in ports).
4. Move HTTP schemas from `application/dto/` to `infra/http/routes/<route>/<route>.schema.ts`; keep only use-case inputs in `application/usecases/<name>/<name>.dto.ts`; add path-param validation (`zV("param", ...)`) on the 25 sites; move `ssoEnforcementChangeNeedsStepUp`, `isWithinBound`, `approvalCursorOf` out of DTO files.
5. Introduce use cases for the cheap services first (Ops 3, StaffNote 2, SavedView 3, PlanOverride 2, StripeReplay 2, StepUp 2, Inbox 1, Query 4), then `AdminModerationService` (5, with an `IAuthProvider` port instead of closures), keeping the route factory signatures so the shape stays frozen.
6. Move the gate-or-execute orchestration out of the 5 route handlers into use cases (`BanUser`, `AssignStaffRole`, `RevokeStaff`, `SetStaffOverride`, `RemoveStaffOverride`, each calling an `ApprovalGate`), replace `StaffService.moderate/moderateBan` closures by use case composition, add use cases for `StopImpersonation` and `ResetUserPassword`; move `ApprovalHandlers` (admin.module.ts:150-289) into `application/` as 4 handler classes.
7. Extract `domain/staff-member/` (aggregate + typed id + VOs role/permission/override + events + `staff-access` rules, moving `staff-access.ts`) and `domain/approval/` (aggregate with status machine, `approved-action.ts` contract, typed id); rewrite `StaffService` (20 methods) and `ApprovalService` (8) as use cases over these aggregates; add repositories `StaffMemberRepository` and `ApprovalRepository` (the existing stores become the infra), keeping the `lockActiveManagers` ordering.
8. Convert `notify-impersonated-user` to a pure dispatch to a `NotifyImpersonatedUser` use case; add a mapper per route (presenters) and move store row mappers to `application/mappers` only where reused; define the module event publisher port (T11) only if the target forces it over the kit `IOutboxRepository`.
9. Re-run `check:boundaries`, `check:api-shape`, `check:duplication`, `check:unused` (knip will flag stale exports) and the 9 `check:admin-*` scripts; update `modules/admin/CLAUDE.md` paths (it references `application/services/staff-access.ts`, `application/approved-action.ts`).

### Where the module follows the current guide but not the target

| Current guide (`modules/CLAUDE.md`) | Target | admin today |
|---|---|---|
| Anatomy tree: `infrastructure/`, `__TESTS__/`, `testing/` | `infra/`, `__tests__/`, no `testing/` | uses current names |
| "Orchestration defaults to `application/services/`; add `domain/` and `use-cases/` only when an aggregate exists" | Use cases everywhere, services only for technical capabilities | 12 `<Noun>Service` classes, no use case |
| `application/dto/`: request schemas, `<verb-noun>.dto.ts` | DTO next to its use case, HTTP schemas in HTTP layer | 13 global `*.dto.ts` consumed by routes |
| `infrastructure/repositories/`: `*.store.ts` without aggregate, `*.repository.ts` with | `infra/repos/drizzle/` | `drizzle-*.store.ts` x8, no repository |
| "Row mapping stays inside the store; `mappers/` only next to an aggregate" | Mappers centralised in `application/mappers/` | inline mapping in stores, route serializers |
| Routes: "A route may read its own tables; it writes only through a service or a use case"; queries: "Controller -> Query (direct ORM, no use case)" | Routes call use cases only, reads included | routes call services (read and write), 4 query methods in `AdminQueryService` |
| `application/ports/` flat, data records beside ports | `ports/repositories` + `ports/services`, records in domain | flat 16 files, records in ports |
| Kit ports (`IOutboxRepository`, `emitEvent`, `IEmailService`, `ISweepRunStore`) imported into application | Event bus port in `application/ports`, implementation in `infra/adapters` | direct kit imports in 12 application files |
| Event handlers `onEvent(...)` in `application/event-handlers/` may run a short `uow.run` and write | Handler only dispatches to use cases | `notifyImpersonatedUser` sends email itself; `closeApprovals...` already dispatches |
| Routes `zV` for body/query; params not mentioned | Every input incl. params validated | params raw (25 sites) |
| Handler/route may own gating flow (`g.assertStepUp`, `ApprovalService.gate`) | No orchestration in routes | gating composed in 5 handlers |
| Billing/auth/plans not DDD; flat services allowed | DDD only where invariants are real | consistent with target for plan overrides, notes, views, ops; inconsistent for staff access and approvals which carry real invariants |
