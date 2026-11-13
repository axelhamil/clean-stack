# Architecture harmonization: Clean Architecture everywhere, DDD where the business is

Execution plan of the roadmap line "Architecture harmonization" ([`ROADMAP.md`](../ROADMAP.md)). This file is the working document of the whole chantier: target rules, audit of what exists, ordered steps, agent strategy, progress. It is written so an agent can pick up any step without redoing the analysis.

- **Status**: prepared, decisions taken on 2026-11-13, not started. No code was changed while writing it.
- **Audit date**: 2026-11-13, branch `develop` at `3bec6dba`, static read (no test or check script was run for the audit).
- **Living document**: every step updates section 12 (progress) and its own block in the commit that delivers it.
- **Annexes**: the full audit reports, one per scope, with file paths and line numbers, in [`architecture-harmonization/audit/`](architecture-harmonization/audit/). A second, independent pass recounted every claim of this file against the code; its reports are in [`architecture-harmonization/verification/`](architecture-harmonization/verification/). **Where an annex and this file disagree, this file is the corrected one.**

| Annex | Scope |
|---|---|
| [`admin.md`](architecture-harmonization/audit/admin.md) | `modules/admin` |
| [`api-token-webhooks.md`](architecture-harmonization/audit/api-token-webhooks.md) | `modules/api-token`, `modules/webhooks` |
| [`audit-log-notifications-uploads.md`](architecture-harmonization/audit/audit-log-notifications-uploads.md) | `modules/audit-log`, `modules/notifications`, `modules/uploads` |
| [`billing-quotas.md`](architecture-harmonization/audit/billing-quotas.md) | `modules/billing`, `modules/quotas`, billing logic in the host |
| [`consents-policies-profile-rgpd.md`](architecture-harmonization/audit/consents-policies-profile-rgpd.md) | `modules/consents`, `modules/policies`, `modules/profile`, `modules/rgpd` |
| [`host.md`](architecture-harmonization/audit/host.md) | `apps/api/src`: host contexts, host routes, composition root, inter-module map, `check:api-shape` |
| [`kit-tooling-docs.md`](architecture-harmonization/audit/kit-tooling-docs.md) | every `CLAUDE.md`, skills and docs; tooling that hard-codes the structure; kit packages; counts |

## Contents

1. Context and objectives
2. Target rules
3. Decisions (taken on 2026-11-13)
4. Audit: where the repository stands
5. Module by module
6. Dependencies between modules and shared files
7. Migration plan, step by step
8. Agent strategy: one Opus agent per module
9. Risks and precautions
10. Tests and validations
11. Acceptance criteria
12. Progress

---

## 1. Context and objectives

The repository already enforces a dependency direction (`check:boundaries`, one `layering.test.ts` per module): `domain/` and `application/` import no framework, no ORM and no provider SDK. What it does not have is one shape for every module. The current guide (`modules/CLAUDE.md`) makes `application/services/<Noun>Service` the default and reserves use cases for modules with an aggregate, lets a route read its own tables and open a transaction, keeps request schemas in a global `application/dto/`, and lets an event handler write. The result, measured:

- 0 use case, 0 aggregate, 0 entity, 0 value object, 0 typed id and 0 domain event class in the 12 modules; 23 `*.service.ts` under `application/services` carry the orchestration.
- 82 module routes, 35 `zV(...)` validations (29 `json`, 6 `query`), 0 on `param`: 35 raw `c.req.param(...)` reads.
- 2 modules (`notifications`, `profile`) open the transaction, call the store and emit the event from the route.
- 3 `onEvent` handlers and 3 built-in subscribers in the modules; 5 of the 6 hold logic or write directly (only `close-approvals-of-deleted-user` already dispatches). The host has a 4th handler, `backupCodeUsedNotifier`, which holds logic too.
- Business rules sit in the host: API token validity, billing gates, the notification digest flush, SCIM connection management.

**Objective**: one architecture, read from the path.

- Clean Architecture in every module, with the same folders and the same flow.
- DDD with `@packages/ddd-kit` only in the modules that carry real business rules and invariants.
- Light CQRS: writes enter the application layer only through use cases; reads are queries behind a port, called by the route. Services are technical capabilities behind ports.
- Every HTTP input validated with Zod at the HTTP boundary.
- Events available to every module: domain events from a model, application events from a use case.
- Event handlers that only dispatch to use cases.
- Transformations centralised in mappers.
- The BetterAuth bridge extracted last as the technical module `modules/auth`.
- Every `CLAUDE.md`, skill and doc telling the same architecture.

**Not an objective**: new features, a changed HTTP contract (the frozen API shape must not move except where a validation is added, see section 9), a rewrite of the kit, DDD for the sake of the schema.

---

## 2. Target rules

The rules below are the contract of the chantier. Identifiers `T1` to `T14` are used by the audit annexes (which stop at `T13`) and by the agent briefs.

### 2.1 Clean Architecture everywhere, DDD only for the business (T1)

Every module follows Clean Architecture. Not every module needs a DDD model.

- **Business module**: it carries rules and invariants of the application itself. It has a `domain/` built with `ddd-kit`, organised per business concept.
- **Technical or orchestration module**: it exposes, configures or orchestrates a technical capability or an outside service (object storage, an auth library, an email provider, a cache, webhook plumbing). It has no `domain/`: `application/`, `infra/`, `__tests__/` and its module file are enough.

Decision test, before creating a `domain/`:

> Does this module carry a real business of the application, with rules and invariants that deserve a model, or does it orchestrate technical capabilities and outside services?

Never create an entity, an aggregate, a value object or a domain service to satisfy the folder scheme. A `domain/` folder that exists today is not proof that a domain is needed, and its absence is not proof of the contrary.

### 2.2 Module structure (T2)

At the root of a module's source, only:

```text
__tests__/
application/
domain/            optional
infra/
<name>.module.ts   configuration and assembly of the module
```

Nothing else without an explicit architectural justification (the accepted ones are listed in decision D1 and D2). A sub-folder exists only when it has something to hold. The two trees of 2.9 are references, not templates to fill.

### 2.3 Domain (T3)

Optional. When present: built with `ddd-kit`, independent of the application layer, of the infrastructure, of frameworks and of providers. It holds business concepts and rules only.

Organised **per business concept or aggregate**, never per technical category. No global `entities/`, `aggregates/`, `value-objects/` or `services/` at the root of `domain/`.

```text
domain/
└── link/
    ├── events/
    │   ├── link-created.event.ts
    │   └── link-destination-changed.event.ts
    ├── services/
    │   └── redirect-guards.service.ts
    ├── value-objects/
    │   ├── slug.vo.ts
    │   └── original-url.vo.ts
    ├── link-id.ts
    └── link.aggregate.ts
```

| Suffix | Holds |
|---|---|
| `.aggregate.ts` | an aggregate and its root |
| `.entity.ts` | an entity that is not an aggregate root |
| `.vo.ts` | a value object |
| `.event.ts` | a domain event (or an application event under `application/events/`) |
| `.service.ts` under `domain/` | a domain service |
| `*-id.ts` | a typed identifier, on the `ddd-kit` id primitive |

- Aggregate and entity are not interchangeable. The choice comes from the model: transactional boundary and invariants. Never wrap every entity in an aggregate, never require both files in a concept folder.
- A domain service holds a rule that fits neither an entity nor a value object. No network call, no database, no framework; it handles domain concepts only.
- Aggregate, value object and id shapes follow `packages/ddd-kit/CLAUDE.md` (`static create`, `static reconstitute`, `Result`, `Option`).

### 2.4 Application (T4)

```text
application/
├── ports/
│   ├── repositories/
│   └── services/
├── usecases/          writes only
│   └── create-link/
│       ├── create-link.usecase.ts
│       └── create-link.dto.ts
├── queries/           reads: one query port per read
│   └── list-links.query.ts
├── services/          application services, only when a distinct responsibility justifies one
├── mappers/
├── events/            application events
└── event-handlers/
```

- **No global `application/dto/`**. A DTO that belongs to a use case sits in that use case's folder.
- **Ports** are the contracts the application needs: repositories, technical services, providers, storage, event publication. Declared in `application/ports/`, implemented in `infra/`. The application never depends on a concrete implementation.
- **Use cases** orchestrate repositories, services, ports and the domain for one operation. They do not import the ORM, do not make HTTP calls, do not depend on a framework, hold no infrastructure detail, and are not replaced by a service that hides their responsibility. One clear responsibility each.
- **Queries** (light CQRS, D5): a read is a query port `application/queries/<name>.query.ts`, implemented in `infra/queries/`, called directly by the route. No read use case. Ownership scoping lives in the query's `WHERE`; the response mapper is applied in the route (2.7). A query changes no state and emits nothing; a read that must emit or write is a use case.
- **Application services** exist only for a distinct, justified application responsibility. They never bypass a use case and never move orchestration around arbitrarily.
- **Mappers**: see 2.7.

### 2.5 Services and use cases (T6, T7)

| | Service | Use case |
|---|---|---|
| What | a technical capability, an outside integration, a mechanism | one business or application action |
| Contract | `application/ports/` | itself |
| Implementation | `infra/` | `application/usecases/<name>/` |
| Entry point | never | the only entry point of writes (reads enter through a query port, 2.4) |

Three things are called "service" and must not be confused: a **technical service** (implemented in `infra/` behind a port), a **domain service** (a business rule, in `domain/<concept>/services/`), an **application service** (rare, justified, in `application/services/`). The `.service.ts` suffix never decides the layer: the real responsibility does.

**Absolute rule: no HTTP entry point consumes a service or a repository directly.** A route calls a use case for a write and a query port for a read. It never imports a repository, an adapter, the ORM or a technical service.

```text
Write: HTTP Request → HTTP Route → Zod validation → validated input → Use Case → Services / Repositories / Domain → Result → HTTP Response
Read:  HTTP Request → HTTP Route → Zod validation → validated input → Query port → Option / data → presenter → HTTP Response
```

**A use case never calls another use case.** Logic shared by two use cases goes into a domain service or an application service that both call. Composing two writes is done by the handler or the route, only when the two writes are independent (each its own unit of work, neither needs the other's result inside its transaction). A sequence that must be atomic is one use case.

### 2.6 Infrastructure (T5)

```text
infra/
├── repos/
│   └── drizzle/        concrete repositories, implementing application/ports/repositories/
├── http/
│   ├── routes/
│   │   └── some-route/
│   │       ├── some-route.ts
│   │       └── some-route.schema.ts
│   └── controllers/
├── queries/            implementations of application/queries/ (Drizzle reads)
└── adapters/           implementations of application/ports/ towards technologies and outside systems
```

Every concrete technical dependency stays here. No use case depends on a concrete repository.

### 2.7 Mappers and DTOs (T12)

Mappers centralise the transformations between representations: application data to domain objects, domain objects to what the application needs, one representation to another. They keep use cases free of scattered conversions.

- No business logic, no orchestration of dependencies, no repository access, no call to a technical service, no dependency on the infrastructure.
- A conversion specific to HTTP transport or to an outside technology stays in its own layer (`infra/http`, `infra/repos`, `infra/adapters`); it is not moved into `application/mappers/` arbitrarily.
- DTO: next to its use case. HTTP validation schemas: next to their route, in the HTTP layer.
- **Convention, by kind**: the row mapper (row to aggregate or record, and back) lives in `infra/repos/`; the response presenter lives in `infra/http/routes/<route>/<route>.presenter.ts`, or inline in the route when trivial, and is applied in the route for a read; an event payload is built in its event file (D3), never in a mapper. `application/mappers/` holds only conversions between application representations (for example an export payload builder).

### 2.8 Events (T9, T10, T11, T14)

Events are a capability of the application architecture, not a DDD feature. A module can have a domain and emit domain events, have no domain and emit application events, use both, or use none.

| | Domain event | Application event |
|---|---|---|
| Represents | a business fact that happened | an application or technical fact |
| Lives in | `domain/<concept>/events/` | `application/events/` |
| Emitted by | the model, when its rules require it | a use case or an application mechanism |
| Needs a domain | yes | no |
| Examples | `link-created.event.ts` | `file-uploaded.event.ts`, `email-sent.event.ts` |

A domain event states a fact, never an intent or a command, and holds no application or technical logic.

**Event handlers** live in `application/event-handlers/`, whatever the nature of the event received. A handler receives an event, picks the use case or use cases to trigger, and passes them the data from the event. It holds no business logic, does no orchestration, and never reaches a repository or a technical service to perform an operation. **A handler is not a use case and must never become a disguised one.**

```text
Domain Event / Application Event → Event Handler → Use Case → Services / Repositories / Domain
```

**Event infrastructure**: if the application depends on an event bus or publisher, the port is in `application/ports/` and the implementation in `infra/adapters/`. The application never depends on a broker or on a concrete bus (see decision D7 for how this meets the kit outbox).

### 2.9 HTTP routes and Zod (T8)

Every route validates its incoming data with Zod, at the HTTP boundary, before the use case: route params, query, body and any other relevant input (headers, cookies).

1. Each route has the Zod schemas its inputs need.
2. Inputs are parsed and validated before any use case call.
3. An invalid input rejects the request with the adapted error response.
4. Only validated, typed data reaches the use case or the query.
5. Never a TypeScript cast (`as`) or an assertion in place of a validation.
6. Schemas are reused when it can be done cleanly, not duplicated.
7. HTTP schemas stay in the HTTP layer and bring no HTTP dependency into the domain or the application.

HTTP validation does not replace business validation: use cases and the domain keep their own rules, preconditions and invariants. It is a responsibility of the entry boundary and is not delegated to the use case.

### 2.10 Reference trees

Business module with DDD:

```text
module/
├── __tests__/
│   ├── application/{usecases,services,mappers,event-handlers}/
│   ├── domain/
│   └── infra/
├── application/
│   ├── ports/{repositories,services}/
│   ├── events/
│   ├── usecases/some-usecase/{some-usecase.usecase.ts,some-usecase.dto.ts}
│   ├── queries/some-read.query.ts
│   ├── services/
│   ├── mappers/
│   └── event-handlers/
├── domain/
│   ├── concept-a/{events/,services/,value-objects/,concept-a-id.ts,concept-a.aggregate.ts}
│   └── concept-b/{events/,services/,value-objects/,concept-b-id.ts,concept-b.entity.ts}
├── infra/
│   ├── repos/drizzle/
│   ├── queries/
│   ├── http/{routes/some-route/{some-route.ts,some-route.schema.ts,some-route.presenter.ts},controllers/}
│   └── adapters/
└── module.module.ts
```

Technical module without DDD:

```text
storage/
├── __tests__/{application,infra}/
├── application/
│   ├── ports/{repositories/,services/,event-publisher.port.ts}
│   ├── events/file-uploaded.event.ts
│   ├── usecases/
│   ├── queries/
│   ├── services/
│   ├── mappers/
│   └── event-handlers/
├── infra/
│   ├── queries/
│   ├── http/routes/
│   └── adapters/{cloud-storage/,event-bus/}
└── storage.module.ts
```

### 2.11 Dependency rules (T13)

1. `domain/` depends on no other layer.
2. `application/` may depend on `domain/` and on its own abstractions.
3. `infra/` may depend on `application/` and `domain/`.
4. `infra/` implements the ports declared in `application/`.
5. HTTP routes know only the use cases they expose and the query ports they read through.
6. No direct access to a repository, an adapter, the ORM or a technical service from a route; a query port is the only read path.
7. Event handlers trigger use cases and hold no orchestration.
8. Event handlers never reach a concrete infrastructure implementation.
9. HTTP data is validated with Zod before it reaches a use case or a query.
10. Mappers hold no business logic.
11. Domain services stay independent of the infrastructure.
12. No inverted dependency: domain and application never import the infrastructure.
13. A module without a domain follows the same rules between application and infrastructure.
14. Using events does not depend on having a DDD domain.

### 2.12 What stays from the current guide

The target replaces the layout and the layering inside a module. It does not replace the contract between a module and its host, which stays as written in `modules/CLAUDE.md`: a module exports factories and the host composes them; everything from outside arrives in `<Name>Prerequisites`; a need towards another module is a port the consumer declares and the host binds; a read joining tables of two modules lives in the host behind a port; relative imports and no barrel; source only; `defineModule` with its explicit generic; transactions opened by `uow.run` and read from the ambient executor; repository instrumentation; `Result` and `Option`; no throw in domain or application.

### 2.13 Accepted exceptions

Written once here; each is a decision of section 3.

- `schemas/` and `scripts/` stay at the package root of a module (D1).
- `application/config/<name>-settings.ts` is an accepted sub-folder of `application/` (D2).
- The event catalog stays central in `packages/events`; module event files are thin typed files over it (D3).
- The kit `IOutboxRepository` is the event publication port; no per-module publisher (D7).
- Query ports in `application/queries/` are called directly by routes, with no use case (D5).
- A retention sweep of a derived table is infrastructure: it stays in the host cron behind the owning module's exported schema, with no use case (D15).

---

## 3. Decisions

The target was written for a generic module tree. This repository has specifics the target does not name. The owner took all 17 decisions on 2026-11-13: D1 to D4, D6 to D8 and D10 to D14 as the former recommendation, D5 and D9 changed, D11 settled, D15 to D17 added for the points left open. This section is the record; sections 2, 5 and 7 are written against it.

| # | Question | Decision | Why |
|---|---|---|---|
| D1 | A module here is a workspace package: `package.json`, `tsconfig.json`, `schemas/`, `scripts/`, `CLAUDE.md` at the package root, sources in `src/`. Where does the "module root" rule (T2) apply? | The module root of T2 is `src/`. `schemas/` (tables the module owns, read by Drizzle and by other modules' tests) and `scripts/` (real-database checks) stay at the package root as the documented justification. `src/testing/` (only in `admin`) moves under `__tests__/fixtures/` and keeps its export. | `schemas/` outside `src/` is what lets host queries and sweeps read a module without importing its code; the boundary rules already key on it. |
| D2 | `application/config/` holds the typed settings in 11 modules and is imported by `apps/api/src/composition/settings.ts`. T4 does not list it. | Keep `application/config/<name>-settings.ts` as an accepted sub-folder of `application/` and say so in the guide. | Settings are an application contract the host fills; moving them changes 11 import lines for no gain. |
| D3 | Events: the target puts a file per event in the module. The repository has one closed catalog in `packages/events` (107 types; each type touches 5 central files: payloads, retention, visibility, descriptions, notifications, the middle 3 exhaustive by type) that audit log, webhooks and notifications read. | The catalog stays the single registry of types and payloads. A module adds thin typed files over it: `domain/<concept>/events/<fact>.event.ts` (built by the aggregate through `addEvent`) or `application/events/<fact>.event.ts` (built by a use case). The file names the catalog type and builds its payload; it declares no new registry. | A per-module registry would break the exhaustive maps that guarantee every event has a retention, a visibility and a description, and would touch `events`, `outbox`, `drizzle`, `webhooks` and `notifications` for no behaviour change. |
| D4 | Use case calling convention. The kit has no use case base; today's guide bans `.execute()` on services. | A class `<Verb><Noun>UseCase` with one public method `execute(input): Promise<Result<Output, Error>>`, dependencies by constructor, one file `<name>.usecase.ts`, input and output types in `<name>.dto.ts`. No base class; at most an `IUseCase<I, O>` type in `ddd-kit` if the handler helper of D6 needs it. | One method makes "one use case, one responsibility" checkable by a guard, and a handler or a route can be typed against it. |
| D5 | Reads. Today: "Queries: Controller → Query (direct ORM, no use case)". | **Light CQRS.** A read does not go through a use case: it is a query behind a port, `application/queries/<name>.query.ts`, implemented in `infra/queries/` and called directly by the route. Ownership scoping lives in the query's `WHERE`; the response mapper or presenter is applied in the route. Writes go only through use cases. Guards allow route to query port and forbid route to repository, adapter or ORM. A read joining two modules stays in the host behind a port, and the consumer of that port is a query. | Reads carry no invariant and no event: a use case around one repository call is ceremony. The port keeps the route off the ORM and keeps the read testable. |
| D6 | Built-in subscribers (`AuditEventSubscriber`, `WebhookFanoutSubscriber`, `NotificationFanoutSubscriber`) live in `infrastructure/services/` and do the work themselves. | They become handlers in `application/event-handlers/` that parse and dispatch to one use case each (`record-audit-entry`, `fan-out-event-to-endpoints`, `fan-out-notification`). The SQL goes behind a repository port. Add a small `dispatchTo(useCase, mapPayload)` helper next to `onEvent`. | T10 applies whatever the kind of handler; the helper makes the correct shape the short one. |
| D7 | Event publication port (T11). Use cases call `emitEvent(outbox, ...)` from `@packages/outbox` with the kit port `IOutboxRepository`. | The kit port is the port: `IOutboxRepository` arrives through `<Name>Prerequisites`, its Drizzle implementation lives in the kit. No per-module `IEventPublisher` plus adapter. `emitEvent` stays a kit helper callable from a use case, never from a route, a handler or a repository. | Twelve identical adapters around one kit port is duplication that `check:duplication` would rightly refuse, and the dependency already points inward. |
| D8 | Host contexts holding business code (`apps/api/src`). | In scope: `organization/` becomes `modules/organization` (SCIM connection and SSO enforcement, 4 use cases, needs a port over the auth library); business logic in host middleware and host routes moves behind use cases of the owning module (API token authentication, notification digest flush, `PATCH /api/v1/me`, billing gates read through a query port). Stay in the host: `health`, `cron`, `public-api` as a mount, `queries/`, composition. `auth/` is extracted last (D9). | The module test of `modules/CLAUDE.md` ("removing it leaves a module file plus one port implementation") says `health` is platform code and `organization` is not. |
| D9 | `apps/api/src/auth` (37 files, the BetterAuth bridge) embeds seat caps, SSO rules, SCIM projection, the personal organization invariant and 40 of the 56 host emit sites. | **In the chantier, as the last wave** (wave 5, after the host wave): technical module `modules/auth` without `domain/`, with its own real-database checks; the library hooks dispatch to use cases. The casts on hook bodies and params (14 on bodies, 18 with params) are replaced by Zod parses in the same wave. | Its transaction model (library hooks, after-commit emits) is the riskiest code of the host; running it last means every module it consumes is already migrated and its checks are in place. |
| D10 | Names. `infrastructure/` → `infra/`, `__TESTS__/` → `__tests__/`, `repositories/` → `repos/drizzle/`, `*.store.ts` versus `*.repository.ts`, `use-cases` → `usecases`, one `*.routes.ts` per module → `routes/<route>/<route>.ts`. | Apply all of them. One suffix for persistence: `<noun>.repository.ts` implementing `I<Noun>Repository`; the store/repository split of today's guide disappears. `__tests__` becomes the spelling of the whole repository (apps and packages too), renamed once in Step 3. Route folder granularity: one folder per resource (the current routes file), not per HTTP verb. | Tools match on these names (section 6.3); two spellings alive at once means rules that silently match nothing. |
| D11 | Which modules get a `domain/`. | Yes: `admin` for the `ApprovalRequest` aggregate only (its refusal rules and its status transitions need only the record; the uniqueness index, the claim and `requesterHolds` stay in the database and the store); `api-token` with one thin `ApiToken` aggregate. `StaffMember`: **no aggregate**, a domain service file `domain/staff/` of pure functions. `rgpd`: `domain/deletion/` of pure rules (a state value object and an eligibility function), **no aggregate**; the wipe stays infrastructure. No `domain/`: `billing`, `quotas`, `webhooks`, `uploads`, `audit-log`, `notifications`, `consents`, `policies`, `profile`, `organization`, `auth`. `billing/src/domain` and `quotas/src/domain` are removed, they hold configuration and lookups. | Section 5 gives the invariants found for each. Access is already one pure function, the last-manager rule is a lock plus a count, the grant rules compare two actors: no aggregate earns its place on `StaffMember`. |
| D12 | `quotas` is the B.2 quota gating, **dormant by design**: a complete skeleton the cloner activates (`docs/QUOTA-GATING.md`, `ROADMAP.md` B.2, knip whitelist). `hasQuotaRemaining` and `quotaExceededError` are wired through `requireQuota`, which no route mounts; `IQuotaUsageStore`, `reserveQuota`, `countScopedRows`, `currentPeriodFor` and the `quota_usage` table have no caller outside tests, on purpose. | Keep the skeleton and migrate it like any technical module: `domain/` removed, `reserve-quota` as a use case over ports for the lock and the count, still dormant. Deleting it is a product decision (drop B.2), not a cleanup: it would then edit `ROADMAP.md`, `docs/FEATURES.md`, `docs/SURFACE.md`, `docs/QUOTA-GATING.md`, the `billing-entitlements` skill, `knip.json`, the front `useQuota` and `QuotaGate`, `container.ts`, `apps/api/package.json` and add a drop-table migration. | The guide's "not a module" test is about code with no purpose; this code has a documented one. |
| D13 | Module `exports`: 138 hand-written entries mirroring file paths, 94 distinct specifiers imported by the host source (96 with its tests and scripts). | Step 3 replaces path-mirroring keys by a short public surface with stable names (`./module`, `./config`, `./routes/<resource>`, `./ports/<port>`, `./usecases/<name>` and `./queries/<name>` only where the host binds it, `./schemas/*`, `./testing/*`). After that a module can move its files by editing only its own `package.json`. | It is the single change that lets module agents work in parallel without all editing `app.ts`, `container.ts` and the sources files. |
| D14 | Request schemas are consumed by routes and sometimes by the front through `AppType`. | The Zod schema moves to `infra/http/routes/<route>/<route>.schema.ts`. The use case DTO is a plain TypeScript type in `<name>.dto.ts`; the route maps validated input to it. Where the two are identical, the DTO is `z.infer` of nothing: it is written as a type, the schema `satisfies` it. | Keeps Zod at the boundary and the application free of an HTTP shape, without duplicating a rule. |
| D15 | Retention sweeps. 5 of the 7 delete directly from module tables through `@modules/*/schemas/*`. | **Documented exception**: a sweep of a derived table (event store, audit log, delivery logs, email queue, expired rows) is infrastructure. It stays in the host cron, behind the owning module's exported schema, with no use case. | Root rule 6 already says such a sweep is not a state change: the business event was emitted at write time. A `purge-expired-*` use case per module would add files for no rule. |
| D16 | The notification trigger is installed at boot by `ensureNotificationTrigger`, from `NotificationStreamHub.start()`. | **Keep the boot install**, behind an adapter. No hand-written migration. The real-database check `check:digest` proves the install. | A migration would need hand-written SQL, and `db:push` would stop installing the trigger. |
| D17 | `PATCH /api/v1/me` changes the display name through `IUserAccountStore`, in the host. | **The name moves into `profile`**: an `update-display-name` use case in `modules/profile` over a port the host implements with `IUserAccountStore`. The host route only validates and calls it. | The route opens the transaction and emits today; the rule belongs to a module, and `profile` already owns the locale of the same user. |

---

## 4. Audit: where the repository stands

### 4.1 Inventory

12 modules under `modules/`, plus business code in the API host.

| Module | Nature | `domain/` justified | Verdict | Effort | Use cases and queries to create (counts predate D5: reads become queries) |
|---|---|---|---|---|---|
| `admin` | business | partly: `ApprovalRequest`; staff as a domain service file (D11) | partially conform | XL | about 55 |
| `api-token` | business, thin | yes: `ApiToken` | partially conform | M | 5, plus 2 from the host middleware |
| `rgpd` | business | `domain/deletion/` of pure rules, no aggregate (D11) | partially conform | L | 5 use cases, 1 query |
| `webhooks` | technical | no | partially conform | L | 11, plus 3 from the worker and the fan-out |
| `notifications` | technical | no | non conform | L | 11 |
| `billing` | technical (Stripe) | no, remove the folder | partially conform | M | 6 |
| `audit-log` | technical | no | partially conform | M | 3 |
| `consents` | technical (append-only ledger) | no | partially conform | M | 4 |
| `policies` | technical (versioning is config) | no | partially conform | S to M | 4 |
| `uploads` | technical (object storage) | no | mostly conform | S to M | 4 |
| `profile` | technical | no | partially conform | S | 2 use cases (`set-locale`, `update-display-name`), 2 queries |
| `quotas` | technical, dormant B.2 skeleton | no, remove the folder | partially conform | S | 1 (`reserve-quota`), dormant (D12) |
| host `organization` | business | no (gates over a library) | to extract | M | 4 |
| host `auth` (BetterAuth bridge) | technical | no | to extract, last wave (D9) | XL | to size at wave 5 |

No module is conform today: every one follows the current guide, which differs from the target on purpose.

### 4.2 Gaps shared by every module

| Target | Today | Where it is written |
|---|---|---|
| `infra/` | `infrastructure/` | `modules/CLAUDE.md` anatomy, `.dependency-cruiser.cjs` |
| `__tests__/` mirroring the layers | flat `__TESTS__/` | `modules/CLAUDE.md`, `packages/test/CLAUDE.md` |
| `application/usecases/<name>/` | `application/services/<Noun>Service`, use cases only with an aggregate | `modules/CLAUDE.md` Layers |
| DTO next to its use case, schema next to its route | global `application/dto/` (10 modules) | `modules/CLAUDE.md` Folders |
| `infra/repos/drizzle/*.repository.ts` | `infrastructure/repositories/*.store.ts` or `*.repository.ts` | `modules/CLAUDE.md` Folders |
| `infra/http/routes/<route>/<route>.ts` + `.schema.ts` | one `<name>.routes.ts` per resource | `modules/CLAUDE.md` Folders |
| `infra/adapters/` | `infrastructure/services/`, `adapters/`, `crypto/` | open list in the guide |
| `application/ports/{repositories,services}/` | flat `application/ports/`, data records beside the port | `modules/CLAUDE.md` Folders |
| routes call use cases for writes and query ports for reads | "a route may read its own tables", "Queries: Controller → Query" (direct ORM) | `modules/CLAUDE.md` contract 6, Commands and queries |
| every input validated | params never validated: 35 raw `c.req.param` reads, 0 `zV("param")` | nothing enforces `zV` |
| handler dispatches to a use case | handler runs `uow.run`, writes and emits | `modules/CLAUDE.md` Domain events |
| mappers centralised | row mapping inside the store, response mapping inside the route | `modules/CLAUDE.md` Folders |
| typed ids | `string` ids everywhere | `packages/ddd-kit/CLAUDE.md` asks for typed ids, unused |

### 4.3 What is already right

- The dependency direction holds: no `application/` file imports the ORM, a framework or a provider SDK (enforced).
- `Result` (105 module files) and `Option` (83) are used throughout; no throw in domain or application (enforced).
- Ports are declared by their consumer and bound by the host; no module imports another module.
- Stores are instrumented and read the ambient transaction; ownership is in the `WHERE`.
- Every JSON body and query that exists is validated with Zod (with `zV`, except the GitHub scanning route, which must read the raw text for its signature and then `safeParse`s it); no `as` cast on a validated request in the modules.
- Every state change emits a catalog event inside its unit of work (56 emit calls in the modules, 55 `emitEvent` and 1 `emitEventBestEffort`; 48 of them in `application/`).

### 4.4 Host

Full detail in [`host.md`](architecture-harmonization/audit/host.md).

- 20 `METHOD path` routes declared by the host itself; 17 reach a store, the ORM, a library or a container service directly.
- Business logic outside any module: `shared/middleware/api-token.middleware.ts` (token validity, pepper rotation, rehash, last-used write), `shared/middleware/billing.middleware.ts` (feature, plan and quota gates), `shared/internal-routes/flush-notification-emails.route.ts` (the notification digest use case, 259 lines), `public-api/v1/me.routes.ts` (write, transaction and emit in the route), `organization/` (SCIM connection, 297 lines of use cases named service), `shared/services/admin-action.service.ts` and `security-signals.service.ts` (use cases named service), `shared/services/backup-code-used-notifier.ts` (a handler holding logic).
- 5 of the 7 retention sweeps delete directly from module tables through `@modules/*/schemas/*`.
- 40 `as` casts in non-test host code, 14 of them on request bodies inside the BetterAuth hooks (18 counting the `ctx.params` casts) (the library hands `ctx.body` as `unknown`).
- 13 non-test files read the container through the global `di` (service locator).

### 4.5 Kit

Full detail in [`kit-tooling-docs.md`](architecture-harmonization/audit/kit-tooling-docs.md), part 3.

| Package | Has | Missing for the target |
|---|---|---|
| `ddd-kit` | `Entity`, `Aggregate`, `ValueObject`, `WatchedList`, typed ids (`UUID<T>`), `Result`, `Option`, `IUnitOfWork`, `onEvent`, `EventCollector` | a use case convention (D4), a handler-to-use-case helper (D6), a written mapper convention |
| `events` | closed catalog; one event touches 5 central files, 3 of them `Record<EventType, ...>` maps exhaustive by type (description, retention, visibility), the notification map partial, the payload map a const object | nothing if D3 is accepted |
| `outbox` | `IOutboxRepository`, `emitEvent`, relay, dispatcher, `payloadParser` | nothing if D7 is accepted |
| `http` | `zV(target, schema)` on any Hono target | a shared `idParam` schema; validation is opt-in, nothing forces it |
| `test` | `assertModuleLayering` | guards for T2, T3, T4, T7, T8, T10; a path-based route file test |
| `email`, `emails` | port and implementation in one kit package | nothing |

---

## 5. Module by module

One block per module: nature, what to do, what must not break. The ordered corrections with line numbers are point 15 of each annex.

### `uploads`: technical, no domain. Effort S to M. Pilot of the technical shape.

- **Today**: `UploadService` (4 actions) behind routes that call only the service; S3 adapter cleanly behind `IStorageService`; every route validated.
- **Do**: split `UploadService` into its use cases (writes) and queries (reads) with their DTOs; move the S3 and no-op services and the health probe to `infra/adapters/`; routes to `infra/http/routes/uploads/` with the schema file; renames.
- **Do not break**: the container key `IStorageService` (10 methods) that `rgpd` consumes as `IExportStorage`; `apps/api/scripts/check-wipe-rollback.ts` imports the no-op storage; `StorageHealthProbe` is an `OnInit` registered under that container key, it registers `storage:s3` in the host health registry and silently stops running if the key goes; the host imports `application/config/upload-settings` and the routes factory by path; the `z.union` body of `DELETE /uploads` is sensitive in the frozen `AppType`.

### `api-token`: business, thin domain. Effort M. Pilot of the DDD shape.

- **Today**: `domain/api-token-crypto.ts` is one impure file (`node:crypto`, the `Bun` global). Revocation, expiry and usability are re-implemented in 4 places, one of them the host middleware. The GitHub key verifier has no port. The host middleware also rehashes on the previous pepper and casts `record.scopes as ApiScope[]` (line 96). The scanning route already validates its body with Zod; only the two GitHub headers are read by hand.
- **Do**: `domain/api-token/` with the `ApiToken` aggregate (`create`, `revoke(reason)`, `isUsable(now)`, `ownerReaches`), `ApiTokenId`, value objects for scopes, raw token format and revocation reason, 2 domain events; `ITokenHasher` and `IGithubKeyVerifier` ports with adapters; 4 use cases (`create-api-token`, `revoke-api-token`, `revoke-all-user-tokens`, `handle-leak-report`) and the query `list-api-tokens`; the membership-lost handler dispatches to a use case; `zV("param")` on `DELETE /:id`, header validation on the scanning route. Host side: `authenticate-api-token` and `record-token-usage` use cases, the middleware keeps only the Hono glue.
- **Do not break**: token wire format (prefix, 44 base58 characters, 6 character CRC32) and HMAC digest, bit for bit; stored `token_hmac`, `pepper_version`, `token_start`; `check:api-token-visibility`; the middleware must set `apiTokenId` before the per-token rate-limit policy; `revokedReason` stays a literal union in the response type; the pepper rotation path (lookup on `pepperPrevious`, then rehash); `revokeAllOfUser` with its signature, bound as `IApiTokenRevoker` for `rgpd`; `IApiTokenRepository` read by the host in `app.ts`; `ApiScope` and `API_SCOPES`, imported by the public API.

### `audit-log`: technical, no domain. Effort M.

- **Today**: `AuditEventSubscriber` does everything itself (retention filter, actor derivation, advisory lock, last hash read, hash, raw insert). The module has two insert paths: the subscriber's chained insert and `DrizzleAuditRepository.record`, a plain unchained insert that no caller can reach (the container exposes only `list` and `verifyChain`). The list route emits `SECURITY_OPERATOR_AUDIT_ACCESSED` on the first page only and maps rows inline; `/verify` emits nothing. The host owns the retention sweep.
- **Do**: use cases `record-audit-entry` and `list-audit-events` (it stays a use case because the first page emits `SECURITY_OPERATOR_AUDIT_ACCESSED`, a read with a side effect is a write), query `verify-audit-chain`; the subscriber becomes a dispatching handler; one port for the chain write and one for the hasher; delete the dead `record` insert; drop the `as string` of `verifyChain` with a typed filter; move the response mapping and the emit (first page only) into the list use case.
- **Do not break**: the hash format (`GENESIS`, the canonical input field set) is a contract with existing rows; response shape of `GET /admin/audit-log` and `/verify`; the `tamperEvidence` switch (rows with a null hash, skipped by `verifyChain`); the retention `none` early return; the `audit-${eventId}` id with `onConflictDoNothing`, which is the idempotency contract; `AuditEventSubscriber` built by `check:outbox-lease` by deep path and listed in `container.ts`; `AuditQueryService` read by `check:admin-approval`. Coverage is partial: `check:outbox-lease` proves a redelivered event appends one link; add a check of concurrent distinct events and of `verifyChain` over real rows.

### `consents`: technical, no domain. Effort M.

- **Today**: `ConsentService` with `record`, `withdraw`, `getActive` and `reconcile`; `reconcile` is reached only by the auth bridge, no route. `record` builds the row (TTL, the forced `necessary`, the policy version). `POST` mints the subject id and sets the cookie; `GET` and `DELETE` read the cookie; the `user-agent` header is read raw; none goes through Zod.
- **Do**: 3 use cases (`record-consent`, `withdraw-consent`, `reconcile-consent`) and the query `get-active-consent`; subject id minting moves into the record use case, cookie writing stays HTTP; validate the cookie and the header with Zod.
- **Do not break**: `reconcile` stays bound by the host as `IConsentReconciler` for the auth bridge; the host sweep reads `schemas/consent`; `check:sweep-lock`.

### `policies`: technical, no domain. Effort S to M.

- **Today**: `PolicyAcceptanceService` (`accept`, `getStatus`, `getStaleTypes`, `hasAcceptedCurrent`, the last two built on `getStatus`); the accept route calls `getStaleTypes` when the body names no type, then `accept`, then `getStatus`; 2 casts, `{} as PolicyAcceptanceStatus` in the service and `row.policyType as PolicyType` in the store.
- **Do**: the accept use case owning the sequence, the status, stale types and has-accepted-current reads as queries; the shared status read as a query or an application service, never a use case calling another (2.5); remove the 2 casts.
- **Do not break**: bound by the host as `IPolicyAcceptance` (auth bridge, `getStaleTypes` and `accept`); `hasAcceptedCurrent` read by `policy.middleware.ts` on every guarded route through the key `PolicyAcceptanceService`; `seed-dev-user.ts` and `seed-staff.ts` call that key too.

### `profile`: technical, no domain. Effort S.

- **Today**: no service and no use case; the route opens the transaction, calls the store and emits.
- **Do**: the `set-locale` use case for `PUT /me/locale`, plus the queries `get-locale` and `get-locale-by-email`. `update-display-name` for `PATCH /api/v1/me` (D17) over a port the module declares (for example `IUserNameWriter`), which the host binds to `IUserAccountStore`; it opens the unit of work and emits as the host route does today. The host route is rewired in the host wave.
- **Do not break**: `IProfileStore` (3 methods: `findLocale`, `findLocaleByEmail`, `setLocale`) has 5 host importers plus the container wiring (auth bridge, auth email through `localeForEmail`, admin locale reader, backup-code notifier). Keep the port, or bind those consumers to a query in the same change. `/me` is shared with `rgpd` in the mount order.

### `billing` and `quotas`: technical, no domain. Effort M, plus S for `quotas`.

- **Today**: `billing/src/domain/entitlements.ts` is a config table and 7 lookups. 3 services; `StripeSyncVerifier` is an application concern stored in `adapters/`; the `Origin` header of `POST /billing/portal` is read raw. The module emits no event: every `billing.*` emit is in the host Stripe plugin, which also deep-imports `application/subscription-events` and `infrastructure/adapters/stripe-payment-failure`. `quotas` is the dormant B.2 skeleton (D12).
- **Do**: remove `domain/`, move the entitlement table and helpers to `application/`; 2 use cases (`open-billing-portal`, `verify-stripe-sync`) and 4 queries (`get-plan-catalog`, `list-configured-price-ids`, `get-entitlements`, `read-entitlements`); catalog cache as an infra decorator; header schema. `quotas`: `domain/` removed, `reserve-quota` as a use case (a write), still mounted by no route; the host path import of `quota-remaining` follows.
- **Do not break**: the container keys `EntitlementsService`, `IPlanOverrideStore`, `IStripeEventStore`, `IStripeEventGateway` are the contract with `admin`, by key name and structural shape (admin declares its own ports, so a renamed method breaks only at the container typing); `isReplayableStripeEvent` is a function the host registers for `admin`, not a billing key; `StripeClient`, `BillingCatalogService`, `StripeSyncVerifier` and `IStripeEventStore` are read by the host auth bridge, `ISubscriptionReadStore` by the admin scripts; `EntitlementsService.getEntitlements` feeds the billing gates; `domain/entitlements` is imported by 4 host files, 1 script and tests; the `EntitlementsView` shape is inlined in the frozen `AppType`; the `subscription` table is owned by billing's schema but written by the library plugin.
- **Out of this module's pass**: the host Stripe plugin (`auth/plugins/stripe.ts`), which belongs to the `auth` wave (D9); its two deep imports stay reachable at a stable export.

### `webhooks`: technical, no domain. Effort L.

- **Today**: `WebhooksService` has 11 methods; `webhook-delivery-worker.service.ts` (544 lines) mixes the poller, the delivery and the settle policy; the fan-out subscriber queries the ORM directly; 7 of the 9 routes carry `:id` (and `:deliveryId` on 2), all read raw; 3 routes call `findEndpoint` then a second service; no port for the master key, the secret generator and the signer (the sender and the clock are injected function params, not named ports), and `ISecretCipher` has no `open`.
- **Do**: add the missing ports first (non-breaking); the write methods of the service as use cases and its four pure reads (`listEndpoints`, `findEndpoint`, `listDeliveries`, `findDelivery`) as queries; split the worker into an infra poller plus `deliver-webhook` and `settle-delivery` use cases; `fan-out-event-to-endpoints` use case behind repository ports, subscriber as a dispatching handler; param schemas on the 7 routes; crypto, signer and SSRF guard to `infra/adapters/`.
- **Do not break**: signature header and body envelope; cipher layout and HKDF info string (stored secrets must stay decryptable); delivery idempotency key; `check:webhook-lease` (the lease budget is computed in the worker constructor); container keys `WebhooksService` with `countDeadLetters()` (admin's `IDeadWebhookReader`, checked only at the container typing), `WebhookFanoutSubscriber`, `WebhookMasterKey`, `IUrlGuard` and `WebhookDeliveryWorker`, whose `start()` and `stop()` the host `index.ts` calls and which must survive the split; `check:sweep-lock`.

### `notifications`: technical, no domain. Effort L.

- **Today**: no use case at all. 9 routes (8 JSON plus the SSE stream); the mutating ones call the store, open the transaction and emit. `NotificationFanoutSubscriber` holds the audience resolution, the preference SQL and the dedup, and runs the `INSERT ... SELECT`. The digest flush use case and the sweep live in the host. The preference precedence is written twice in SQL. The `cursor` query is not validated beyond `string`.
- **Do**: route use cases for the writes (mark read, mark all read, update preference, update org preference) and queries for the reads (list notifications, unread count, list preferences, list org preferences); `fan-out-notification` behind a port, subscriber as a handler; move `flush-notification-digest` from the host route into the module (needs the email port); `INotificationStreamHub` port with its adapter, `open-notification-stream` as a query port; the trigger DDL behind an adapter, kept as a boot install (D16); one source for the preference precedence; cursor validated at the boundary.
- **Do not break**: SSE event names and the 429 body; `dedup_key` formats and `email_pending_at` semantics; trigger and channel names shared with the listener; the trigger is installed by `ensureNotificationTrigger` from `NotificationStreamHub.start()` at boot and stays so (D16); the host keys `NotificationStreamHub` (started and stopped in `index.ts`), `NotificationFanoutSubscriber`, `INotificationDigestStore`, `INotificationStore`, `IStaffRecipientsReader`; the host real-database checks `check:fanout` and `check:digest` (the annex says the module has none: they live in `apps/api/scripts/`), `check:sweep-lock`, `check:admin-approval`, `check:admin-workspace`.

### `admin`: business, domain on `ApprovalRequest`, staff as a domain service file. Effort XL.

- **Today**: 12 service classes, 55 public methods, no use case, no `domain/`. 5 route handlers combine the approval gate with the action; 4 call `IAuthProvider` directly and `/stop` has no service at all; 25 path params read raw; `admin.module.ts:150-289` holds about 140 lines of approval logic in the container wiring; `notify-impersonated-user` sends the email and formats dates itself; `IAuthProvider` leaks `Response` and `Headers`; 13 DTOs in `application/dto/`.
- **Do**, in this order inside the module: (1) behaviour tests for the 7 of 8 routes files that have none (only the step-up refusal matrix and impersonation are covered) and a baseline run of the host `check:admin-*` scripts; (2) renames; (3) ports split, `IAuthProvider` without transport types; (4) schemas to the HTTP layer, param validation; (5) use cases for the writes of the flat services (ops, notes, saved views, plan override, Stripe replay, step-up, moderation) and query ports for their reads (inbox, `AdminQueryService`, lists); (6) gate-or-execute out of the routes, approval handlers out of the module file; (7) `domain/approval/` with the `ApprovalRequest` aggregate (refusal rules and status transitions; uniqueness, claim and `requesterHolds` stay in the store), its id, value objects and events, and `ApprovalService` (8) rewritten as use cases over it; `StaffService` (20) as use cases over the `domain/staff/` service file (no aggregate, D11); (8) `notify-impersonated-user` as a dispatch.
- **Do not break**: the last-manager lock order (`lockActiveManagers` first, in the same unit); approve is claim, execute and mark in one unit, the failure recorded in a separate one; `ADMIN_STEP_UP_FAILED` stays best effort outside the unit; 11 scripts in `apps/api/scripts/` (9 checks) import the module by deep path; the `ApprovalHandlers` map is the documented extension point for a new approvable action; `testing/mount-admin-routes.ts` keeps its `AdminRoutesDeps` shape when it moves; `ISsoEnforcement` is satisfied by the host `AdminActionService`, which wave 4 moves into `organization`; the SQL mirror in `apps/api/src/queries/staff-recipients.query.ts`; the 4 ports `rgpd` consumes; `StaffAccessService` is called on every staff request by the host guard (hot path).
- **Size**: one agent, but delivered as several PRs in the order above. Never one PR.

### `rgpd`: business, domain optional. Effort L. Last module.

- **Today**: `RgpdService` (643 lines, 11 dependencies); `IRgpdRepository` is one port of 9 methods mixing deletion state, the wipe, eligibility, export reading and a password check; `executeWipe` sequences the erasure order and calls two foreign ports from inside the repository; `verifyPassword` is an auth concern in an rgpd repository; no clock port.
- **Do**: 5 use cases (`request-account-deletion`, `cancel-account-deletion`, `execute-account-wipe`, `process-pending-deletions`, `request-data-export`) and the query `preflight-account-deletion`; split the repository port in 4 (`IDeletionStateRepository`, `IAccountEraser`, `IUserDataExportReader`, `IPasswordVerifier`); the erasure order moves to the use case, or stays one SQL unit behind `IAccountEraser` with the reason written down; export payload builder as a mapper; `domain/deletion/` of pure rules (state value object, eligibility function), no aggregate (D11). The service already exposes one input and output per operation, so the use case split is mechanical; the hard part is `executeWipe` calling two foreign ports from inside the repository.
- **Do not break**: `check:wipe-rollback`, which hard-codes the 11 positional arguments of `RgpdService`, the 5 of `DrizzleRgpdRepository`, the host keys of the three ports and `requireApiToken`, and calls `executeAccountWipe` by name; `RgpdService` and `createRgpdInternalRoutes`, used by `check:admin-staff` and `check:admin-workspace`; wipe atomicity and order; the 9 events emitted here plus `ADMIN_IMPERSONATION_STOPPED` through the admin port, and their actor rules; the confirmation email enqueued inside the wipe unit; the sweep time budget between wipes (`truncated`, `batch-error`); the export rate limit sharing its unit with the two export events; wipe idempotence through `WHERE deleted_at IS NULL`; storage purge after commit; `process-pending-deletions` must not call `execute-account-wipe` (2.5): the wipe sequence moves to an application service both use cases call.
- **Why last**: it consumes 4 ports over `admin` (only `IStaffStore` is an admin key; the host builds the other three in `sources/rgpd.ts` from 4 admin export keys (`adapters/drizzle-staff-data-eraser`, `adapters/ended-sessions`, `rules/staff-access`, `services/impersonation-end`)), 1 over `api-token`, 1 of `uploads`, and the host `ITotpVerifier`.

### Host `organization` → `modules/organization`: Effort M.

- **Today**: `ScimConnectionService` (`find`, `issueToken`, `disconnect`) with real rules (one active connection per organization, rotation revokes the other credentials, token lifetime, per-organization lock), instantiated at module scope in the routes file, importing the auth singleton (12 `auth.api.*SCIMManaged*` calls). Also: users-only scopes, the disconnect that emits `ORG_MEMBER_REMOVED` per membership removed, the post-commit emit with swallow-and-capture, and reads through `AuthQueries.findMemberOf` and `scimProvisionedMembers`. `AdminActionService.setSsoEnforcement` is shared with `admin` routes, and the routes file imports `setSsoEnforcementBodySchema` from `@modules/admin`.
- **Do**: a module with its use cases (`set-sso-enforcement` among them) and queries (the connection `find`), a port over the library's SCIM calls and the auth queries bound by the host, its routes, its `layering.test.ts`; the module exposes the SSO enforcement the host binds to admin's `ISsoEnforcement`; the body schema moves out of `admin` (a module never imports another).
- **Do not break**: `check:scim-connection`, `check:scim-seats`, the tests `organization/__tests__/{routes,scim-connection.service}.test.ts`; the emit after the library committed on its own connection (documented residual window); the host layering test scans `organization/` today, the module needs the equivalent guard.

### Host `auth` → `modules/auth`: technical, no domain. Effort XL. Last wave (D9).

- **Today**: `apps/api/src/auth` (37 files), the BetterAuth bridge. It embeds seat caps, SSO rules, SCIM projection, the personal organization invariant and 40 of the 56 host emit sites, plus the Stripe plugin (`auth/plugins/stripe.ts`). 14 casts on hook bodies (18 with `ctx.params`), the library handing `ctx.body` as `unknown`. Reads the container through the global `di`.
- **Do**: a technical module without `domain/`, with `application/`, `infra/`, its module file and its `layering.test.ts`. The library hooks (`databaseHooks`, `organizationHooks`, plugin callbacks) become thin adapters in `infra/` that parse their input with Zod and dispatch to use cases; the rules above move into those use cases. Ports over the library calls, the consumed modules reached through the ports the host binds. Its own real-database checks, written before the move.
- **Do not break**: the transaction model (library hooks, after-commit emits, documented residual windows); the emit of every state change with its actor; `check:auth-transaction`, `check:scim-seats`, `check:scim-connection`; the auth session cookies and the BetterAuth routes mounted by the host; the frozen host names of 6.2 (`IAuthProvider`, `ITotpVerifier`, `IUserAccountStore`).

---

## 6. Dependencies between modules and shared files

### 6.1 Who depends on whom

No module imports another. Dependencies run through ports the host binds, through container keys resolved by name, and through events.

| Consumer | Needs from | Through |
|---|---|---|
| `admin` | `billing` | `IEntitlementsReader` bound by the host over `IReadEntitlementsQuery`; keys `IPlanOverrideStore`, `IStripeEventStore`, `IStripeEventGateway`; `isReplayableStripeEvent`, a billing function the host registers |
| `admin` | `webhooks` | key `WebhooksService` as `IDeadWebhookReader` (one method, `countDeadLetters()`) |
| `admin` | `profile` | `ILocaleReader` over `IGetLocaleQuery` |
| `profile` | host | the name-writing port of `update-display-name` (D17), bound to `IUserAccountStore` |
| `admin` | host | `IAuthProvider` (bound in the `routeDeps` scope), `ITotpVerifier`, `ISsoEnforcement` (key `AdminActionService`), `staffLookupOnce`, `staffSettings`, `adminSettings`, `ISweepRunStore`, `IEmailService`, `ILocaleReader`, route deps `routeGuards`, `internalGuards`, `runSweep`, `accountDeleteRateLimit` |
| `rgpd` | `admin` | key `IStaffStore`; the host `sources/rgpd.ts` builds `IStaffAccessRules`, `IStaffDataEraser` and `IEndedSessionsReader` from 4 admin export keys (`adapters/drizzle-staff-data-eraser`, `adapters/ended-sessions`, `rules/staff-access`, `services/impersonation-end`) |
| `rgpd` | `api-token` | `IApiTokenRevoker` (`ApiTokenService`) |
| `rgpd` | `uploads` | `IExportStorage` (key `IStorageService`) |
| `notifications` | `admin` tables | host query `StaffRecipientsQuery` behind `IStaffRecipientsReader` |
| `api-token` | host | `IUserContactReader` (key `IUserAccountStore`) |
| `uploads` | host | `IHealthCheckRegistry` |
| host `auth/` | `billing` (4), `policies`, `consents`, `admin`, `profile` | `composition/sources/auth.ts` |
| host middleware | `billing`, `admin`, `policies`, `api-token` | container keys read through `di` |
| host middleware, guards, auth | `billing`, `quotas` | path imports: `billing/domain/entitlements` (4 host files), `quotas/domain/quota-remaining` (no container key) |
| host `index.ts`, internal routes | `webhooks`, `notifications` | `WebhookDeliveryWorker` and `NotificationStreamHub` started and stopped, `INotificationDigestStore` |
| host `auth/` | `billing` | key `StripeClient`, `schemas/billing`, deep imports `application/subscription-events` and `infrastructure/adapters/stripe-payment-failure` |
| host TOTP verifier, staff recipients query | `admin` | `schemas/staff` |
| host `BackupCodeUsedNotifier` | `profile` | `IGetLocaleQuery` |
| `notifications`, `rgpd` | `admin` type | `staffSettings`, typed `StaffEnv` from admin, through `composition/settings.ts` |
| host sweeps | `audit-log`, `consents`, `notifications`, `billing`, `webhooks` | `@modules/*/schemas/*` |

Events across modules: `api-token` reacts to `ORG_MEMBER_REMOVED` (host auth bridge, SCIM); `admin` reacts to `USER_DELETED` (`rgpd`); the three built-in subscribers react to every catalog type. User handlers are not subscribed by name: the dispatcher scans every container value for an `EventHandler`. Today: `RevokeTokensOnMembershipLost`, `CloseApprovalsOfDeletedUser`, `NotifyImpersonatedUser` and the host `BackupCodeUsedNotifier`; the 3 built-ins are listed by name in `container.ts`.

Leaves, module to module only (the host still consumes `ConsentService`, `PolicyAcceptanceService`, `NotificationStreamHub` and `INotificationDigestStore` by name): `audit-log`, `consents`, `policies`, `notifications`. Providers to stabilise first: `billing`, `webhooks`, `profile`, `uploads`, `api-token`, then `admin`. `rgpd` is the last consumer.

### 6.2 The cross-module contract, frozen during the chantier

These names are consumed by another module or by the host by name. A module agent keeps them alive (bound to the new use case, or to a thin facade) until the integrator rebinds them in the raccord pass of its wave:

- **Container keys**: `IPlanOverrideStore`, `IStripeEventStore`, `IStripeEventGateway`, `isReplayableStripeEvent`, `StripeClient`, `ISubscriptionReadStore`, `WebhooksService` (keeps `countDeadLetters()`, the whole of admin's `IDeadWebhookReader`), `WebhookFanoutSubscriber`, `WebhookDeliveryWorker` (keeps `start()` and `stop()`), `IStorageService`, `ApiTokenService` (keeps `revokeAllOfUser`), `IApiTokenRepository`, `PolicyAcceptanceService`, `ConsentService`, `StaffService`, `StaffAccessService`, `StepUpService`, `IStaffStore`, `AuditEventSubscriber`, `AuditQueryService`, `NotificationFanoutSubscriber`, `NotificationStreamHub`, `INotificationDigestStore`, `INotificationStore`, `RgpdService`.
- **Keys read by the scripts through `di`**: `AdminModerationService`, `IAdminUserStore`, `AdminQueryService`, `IApprovalStore`, `ApprovalService`, `PlanOverrideService`, `CloseApprovalsOfDeletedUser`, `IStaffDataEraser`, `IEndedSessionsReader`, `IApiTokenRevoker`, and the settings keys `staffSettings`, `adminSettings`, `rgpdSettings`, `staffLookupOnce`.
- **Route factories and route deps**: the 20 `create*Routes` imported by `app.ts`, `createRgpdInternalRoutes` (also used by `check:admin-workspace`), the 12 module objects of `container.ts`, and every key a `*Deps` interface of a routes file resolves through `routeDeps`.
- **Deep paths the host imports** (to keep reachable at a stable export, D13): `billing/domain/entitlements`, `billing/application/subscription-events`, `billing/infrastructure/adapters/stripe-payment-failure`, `quotas/domain/quota-remaining`, `api-token/domain/api-token-crypto`, `api-token/application/dto/create-token.dto`, `admin/application/dto/set-sso-enforcement.dto`, `admin/application/ports/staff-store.port`, `admin/application/ports/stripe-event.port`, `admin/application/services/staff-access`, the 4 admin export keys (`adapters/drizzle-staff-data-eraser`, `adapters/ended-sessions`, `rules/staff-access`, `services/impersonation-end`) of `sources/rgpd.ts`, `webhooks/application/ports/webhook-delivery.port`, `webhooks/application/config/webhook-settings`, and the `profile`, `consents`, `policies` and `notifications` ports the host binds.
- **Reverse direction, frozen for wave 4**: host names the modules consume, which the host use cases of wave 4 would rename: `AdminActionService`, `IAuthProvider`, `ITotpVerifier`, `IUserAccountStore`, `IHealthCheckRegistry`, `ISweepRunStore`, `staffLookupOnce`, `routeGuards`, `internalGuards`, `runSweep`, `accountDeleteRateLimit`.

### 6.3 Shared files: who edits them

Several module migrations would touch the same files. One owner each.

| File | Why it is touched | Owner |
|---|---|---|
| `.dependency-cruiser.cjs` | hard-codes `src/infrastructure/`, `__TESTS__`, `src/testing/`, `src/application/ports`; `application` and `domain` → not `infrastructure` already exists; missing: `domain` → not `application`, handlers → not `infra`, `http` → not repositories or adapters (query ports allowed) | Step 3, foundation agent |
| `packages/test/src/source-scan.ts` and its fixtures | `isRouteFile` matches `*.routes.ts` only; guards to add | Step 3 |
| `apps/api/tsconfig.build.json` | excludes `**/__TESTS__/**`: a missed rename ships the tests in the build, silently | Step 3 |
| `.jscpd.json` | ignores `**/__TESTS__/**`: a missed rename fails loudly (duplication) | Step 3 |
| `apps/api/bunfig.toml`, `packages/email/bunfig.toml` | preload path `./src/__tests__/preload.ts` since the rename | Step 3, with D10 |
| `turbo.json` | lists `**/__TESTS__/**` in `test.inputs`, already covered by `src/**` | no change |
| `packages/drizzle/drizzle.config.ts` | globs `modules/*/schemas/*.ts`: a module schema in a subfolder is silently not migrated | nobody, `schemas/` stays flat at the package root (D1) |
| `apps/api/src/__tests__/event-catalog-parity.test.ts` | regex over `onEvent(EventTypes.X` and emit literals in `modules/*/src`; the `dispatchTo` helper of D6 changes what it strips | Step 3, with D6 |
| `apps/api/src/__tests__/layering.test.ts` | reads `sourceFiles("organization")`, throws once the folder is extracted | wave 4 |
| 16 host tests importing module internals by deep path | same specifiers as the host | Step 3 for the specifiers |
| `knip.json` | `modules/*` entries come from `exports`; `rules.exports` is `warn`, so a leftover facade is not caught by `check:unused` | Step 3; facades listed and removed by the integrator |
| 12 module `package.json` `exports` | path-mirroring keys | Step 3 for the keys (D13), then each module agent for the targets |
| `apps/api/src/app.ts` | 20 route factory imports, mount order decides `AppType` | Step 3 for the specifiers; integrator afterwards |
| `apps/api/src/container.ts` | 12 module imports, load-bearing `addModule` order, `AppDeps` augmentation | integrator |
| `apps/api/src/composition/settings.ts`, `composition/sources/*.ts` | settings paths, port bindings | integrator |
| `apps/api/shape/*` | frozen `AppType` and route inventory | integrator, through `api-shape:update` only, with the proof |
| `apps/api/scripts/*.ts` (20 `check:*` scripts plus the `check-seed` helper) | 7 import `@modules/*/infrastructure/`, 10 import a deep `infrastructure`, `application` or `domain` path; some import host files (`organization/scim-connection.service`, `queries/staff-recipients.query`, `composition/sources/rgpd`) | Step 3 for the specifiers; the module agent when a class it builds by name changes |
| `packages/events/src/*` | only if an event is added | the module agent, one event per PR, declared in its report |
| every `CLAUDE.md`, skills, docs | the rules | Step 6 only |

**Three silent failures to know**: renaming `infrastructure/` without editing `.dependency-cruiser.cjs` leaves the layer rule matching nothing (and a `__tests__` folder drops out of the test rule); moving routes to `routes/<route>/<route>.ts` without editing `isRouteFile` leaves the "routes never write" guard checking zero files, since it never asserts a non-empty list; a handler no longer registered as an `EventHandler` value in its module subscribes to nothing. All three stay green. This is why the tooling moves first, in one place, and accepts both spellings until the last module is done.

---

## 7. Migration plan, step by step

Every step is one or several issues and PRs following the repository work tracking: issue triaged (`refactor` or `docs` type label, `accepted`, assignee), branch `<type>/<issue>-<slug>` off `develop`, PR with `Closes #N`, squash merge. A `refactor` title ships a patch release; nothing here is a `feat`.

### Step 1: Audit and map

- **Objective**: know every module, its nature, its gaps and the migrations needed.
- **Scope**: the 12 modules, the API host, the kit, the tooling, the documentation.
- **Status**: **done** on 2026-11-13. Result: sections 4 to 6 and the 7 annexes.
- **Still to do at start of execution**: the audit is static and dated. Before Step 3, re-run the counts of section 1 and re-read the annex of any module that changed since `3bec6dba` (`git log 3bec6dba.. -- modules/<name>`), and run the full pre-push chain plus every `check:*` script once to record the green baseline.
- **Done when**: the baseline output is attached to the tracking issue and section 12 says so.

### Step 2: Documentation and conventions

- **Objective**: turn the target rules into decisions for this repository.
- **Scope**: this file only. No `CLAUDE.md` is edited yet (that is Step 6): until a module is migrated, the current guide is what describes it.
- **Status**: **done** on 2026-11-13.
- **Changes**: D1 to D17 closed with the owner and recorded in section 3; the rule for a use case calling another use case (2.5); the mapper convention (2.7); the accepted exceptions (2.13); section 2 amended for D5 and D9.
- **Depends on**: Step 1.
- **Tests**: none.
- **Done when**: no row of section 3 is open, and section 2 was amended wherever a decision changes a rule. Met.

### Step 3: Foundation, in series, one agent

- **Objective**: make the target checkable and make modules independent of each other before any module moves.
- **Scope**: `packages/ddd-kit`, `packages/http`, `packages/test`, `.dependency-cruiser.cjs`, tool configs, the 12 `exports` maps and their importers. No file inside a module's `src/` moves.
- **Changes**, one PR each, in this order:
  1. **Tooling tolerant of both spellings**: `.dependency-cruiser.cjs` matches `infrastructure|infra`, `__TESTS__|__tests__`; new rules for T13 (`domain` imports only `domain`, `application` never imports `infra`, `event-handlers` never import `infra`, `infra/http` never imports `infra/repos` or `infra/adapters`), enabled per migrated module through an allowlist that shrinks; `.jscpd.json`, `turbo.json`, `tsconfig.build.json` ignore both test spellings.
  2. **Guards in `@packages/test/source-scan`**, off by default and switched on per module by an option of `assertModuleLayering`: source root holds only the T2 entries; no category folder at the root of `domain/`; no `application/dto/`; route files are found by path (`/http/routes/`) as well as by suffix; a route file imports no repository, adapter or ORM (a query port is allowed) and calls no `c.req.param|query|json|header|text` without a matching `zV`; a handler file imports only use cases, the event and the payload parser. Each guard ships with its fixture test.
  3. **Kit additions** (D4, D5, D6): the use case convention and the query port convention in `ddd-kit` (types only), `dispatchTo` next to `onEvent`, a shared id param schema in `@packages/http`. Tests with the kit's runner.
  4. **Stable exports** (D13): replace the 138 path-mirroring keys by the public surface, update the 94 host specifiers, the scripts and the tests. Pure renaming of specifiers: `check:api-shape` must stay equal without a refreeze.
  5. **`__tests__` spelling** for apps and packages (D10).
- **Depends on**: Step 2.
- **Tests**: the full pre-push chain after each PR; `check:api-shape` unchanged; every real-database `check:*` after PR 4.
- **Done when**: a module can rename a folder by editing only its own files and `package.json`, proven by a dry run on `uploads` in a throwaway branch (rename `infrastructure` to `infra`, chain green, zero host file touched).

### Step 4: Refactoring, module by module

- **Objective**: each module conform to the target, proven by the guards of Step 3 switched on for it.
- **Method**: one Opus agent per module (section 8), in waves. A wave starts when the previous one is merged and its raccord pass is green.

| Wave | Modules | Mode | Why here |
|---|---|---|---|
| 0, pilots | `uploads`, then `api-token` | series | settle the technical shape, then the DDD shape; their PRs become the reference files every later brief points to |
| 1 | `billing` (with `quotas`), `profile`, `policies`, `consents`, `audit-log` | parallel, 5 agents | no dependency between them module to module; they all feed the same host files (auth bridge, billing and policy middleware), which only the raccord pass edits |
| 2 | `webhooks`, `notifications`, `admin` | parallel, 3 agents | `admin` consumes `billing`, `webhooks` and `profile` only through the frozen contract (6.2), so it can run beside `webhooks`; the `countDeadLetters()` link is only checked at the container, in the raccord pass; `admin` is delivered in several PRs |
| 3 | `rgpd` | alone | consumes `admin`, `api-token`, `uploads` |
| 4 | `organization` extraction, host use cases | series, one agent each | touches `app.ts`, `container.ts` and the host middleware, which no parallel agent may edit |
| 5, last | `modules/auth` (BetterAuth bridge) | alone | consumes nearly every module and carries the riskiest transaction model; it moves once all of them and the host are migrated |

- **Per module, the agent**: (1) re-audits its module against its annex; (2) confirms the nature and the `domain/` decision; (3) applies the corrections of its block in section 5, in the order of point 15 of its annex; (4) switches the guards on in its `layering.test.ts`; (5) moves and adds tests; (6) runs its checks; (7) reports.
- **Order inside a module**, so each commit compiles and stays green: safety net (missing behaviour tests, baseline of the real-database checks) → renames and folder layout → ports → schemas and param validation → use cases → handlers → domain (when justified) → mappers.
- **Depends on**: Step 3; the wave table.
- **Tests**: section 10.
- **Done when**, per module: the acceptance criteria of section 11.2 hold and the progress table is updated in the PR that delivers it.

After each wave, the **raccord pass** (integrator, main session): rebind the frozen contract names that moved, update `container.ts`, the sources files and the host deep imports, run the whole chain and every real-database check on the merged branch. **A facade is removed only once the wave of its last consumer is merged**: `IStorageService` and `ApiTokenService` stay until wave 3 (`rgpd`); the billing keys and `IProfileStore` until wave 2 (`admin`); `IStaffStore` until wave 3. `sources/rgpd.ts` reads admin through 4 admin export keys (`adapters/drizzle-staff-data-eraser`, `adapters/ended-sessions`, `rules/staff-access`, `services/impersonation-end`). `check:admin-staff` and `check:admin-workspace` reach `RgpdService` and `createRgpdInternalRoutes`, which stay frozen until wave 3.

Wave 4 detail:

- `modules/organization` from `apps/api/src/organization` (block in section 5).
- `authenticate-api-token` and `record-token-usage`: `api-token.middleware.ts` keeps the Hono glue.
- `flush-notification-digest`: the host internal route keeps the HMAC gate and the heartbeat.
- `PATCH /api/v1/me`: the route is rewired to the `update-display-name` use case of `modules/profile` (D17), and the host binds its port to `IUserAccountStore`.
- `billing.middleware.ts`, `policy.middleware.ts`, `staff.middleware.ts`: read through a query port received by injection, no global `di`.
- `AdminActionService`, `SecuritySignalsService`, `backupCodeUsedNotifier`: use cases, and a dispatching handler.
- Retention sweeps: stay in the host cron behind the owning module's exported schema, no use case (D15); the sweep reads `@modules/*/schemas/*` through the stable exports of D13.

Wave 5 detail:

- `modules/auth` from `apps/api/src/auth` (block in section 5): technical module without `domain/`, hooks dispatch to use cases, its own real-database checks, the Stripe plugin and the casts on hook bodies and params (Zod parse in place of the 18) included.

### Step 5: Global verification

- **Objective**: prove the whole, not the parts.
- **Scope**: the merged `develop`.
- **Changes**: remove the "both spellings" tolerance and the per-module allowlists of Step 3, so the rules apply to everything; delete what the migration orphaned (`check:unused`).
- **Checks**:
  - inter-module dependencies: `pnpm check:boundaries` with the strict rules, no allowlist;
  - HTTP entry points: no route file imports a repository, an adapter or the ORM, only use cases and query ports (guard), and a grep of `c.req.` in route files returns only `c.req.valid(`;
  - Zod: `zV("param"` count equals the number of routes with a path param;
  - events: every handler file imports only use cases (guard); every catalog type still has an emit site (query the event store after the real-database checks, the orphan test of root rule 6);
  - `check:api-shape`: equal, or each accepted drift listed with its proof;
  - the full pre-push chain and every `check:*` script against a real database; the accessibility jobs (the fronts consume `AppType`).
- **Depends on**: Step 4 complete.
- **Done when**: every check above is green with its output in the tracking issue, and the counts of section 1 are rewritten with the after values.

### Step 6: Final documentation

- **Objective**: every guide tells the architecture that now exists. Mandatory, and done at the end: a guide rewritten before the code would describe modules that do not exist yet.
- **Scope**: every `CLAUDE.md` concerned, the skills, the docs. One agent, in series, after Step 5.

| File | Change |
|---|---|
| `CLAUDE.md` (root) | the global architecture rules: Clean Architecture everywhere and DDD only for the business; the three kinds of service; use cases as the only entry point of writes and query ports for reads; Zod on every HTTP input; domain events and application events. Rules 6 and 8 reworded ("service-level write" becomes a use case write, "stores" becomes repositories). The "Where the rules live" table gains `modules/organization` if created and loses nothing else. Still library-agnostic, each rule with its why. |
| `modules/CLAUDE.md` | rewritten around section 2: anatomy tree, folders, Layers (the "do I need an aggregate" test stays as the DDD gate and is no longer tied to use cases), services versus use cases, commands and queries (reads through query ports, writes through use cases), events (domain and application, handlers dispatch), mappers, DTO placement, ports split, Zod on params, the two reference trees. About 13 statements replaced (listed with line numbers in the annex, part 1). What section 2.12 lists stays. |
| `apps/api/CLAUDE.md` | host routes call use cases for writes and query ports for reads; no global `di` in middleware; `auth/queries.ts` wording; test folder spelling; what stays host platform code and why. |
| `modules/admin/CLAUDE.md` | paths (`staff-access`, `approved-action`), the two domain concepts, use case names, handler rule. Invariants and traps stay. |
| `modules/api-token/CLAUDE.md` | the `ApiToken` aggregate, ports for hashing and the key verifier, where authentication lives. |
| `modules/rgpd/CLAUDE.md` | port split, where the erasure order lives, the domain decision. |
| `modules/webhooks/CLAUDE.md` | adapters versus use cases, the worker split, the settings path. |
| `modules/organization/CLAUDE.md` | created only if the module has rules of its own. |
| `modules/auth/CLAUDE.md` | the hook adapters, the transaction model, the after-commit emits, the real-database checks. |
| `packages/ddd-kit/CLAUDE.md` | use case convention, `dispatchTo`, entity versus aggregate, mapper convention. |
| `packages/events/CLAUDE.md` | the catalog stays the registry; where a module's event file lives and what it may hold (D3). |
| `packages/outbox/CLAUDE.md` | who may call `emitEvent` (use cases), handler contract. |
| `packages/http/CLAUDE.md` | every input validated, the shared id param schema, no raw `c.req.*` read. |
| `packages/drizzle/CLAUDE.md` | "stores" wording. |
| `packages/test/CLAUDE.md` | test tree mirroring the layers, one scenario per rule on the use case, the new guards. |
| `.claude/skills/feature-slice` | use case first; per-concept domain folder; new module checklist. |
| `.claude/skills/billing-entitlements`, `events-outbox`, `compliance-consent`, `auth-server`, `email-delivery` | paths and class names; "never a use case" removed from billing. |
| `README.md`, `docs/OVERVIEW.md` | the DDD scope sentence, the module tree, "queries direct to Drizzle". |
| `docs/EVENTS.md`, `docs/EVENT_PIPELINE.md`, `docs/FEATURES.md`, `docs/REMOVABILITY.md`, `docs/INTEGRATIONS.md`, `docs/HEALTH-PROBES.md`, `docs/CRON.md`, `docs/SURFACE.md`, `docs/QUOTA-GATING.md`, `docs/OBSERVABILITY.md` | file paths (33 hits counted in the annex). |
| Not concerned | `apps/app/CLAUDE.md`, `apps/admin/CLAUDE.md`, `packages/access-control`, `i18n`, `ui`, `web-kit`, `CONTRIBUTING.md`, `docs/MODULES.md`. Re-check at Step 6: a file is "not concerned" only as of the audit. |

- **Consistency rules**: the root file holds the global rules, each specific file only what is proper to its scope; no rule repeated from one level to another (root rule 1); every contradicted statement is rewritten or deleted, none is kept "for history"; a final read of all the files side by side checks they describe one architecture.
- **Check**: grep the old vocabulary across `CLAUDE.md`, skills and docs (`infrastructure/`, `__TESTS__`, `application/dto`, `application/services/`, `.store.ts`, `use-cases`, "direct ORM", "never DDD"): every remaining hit is justified in the PR.
- **Depends on**: Step 5.
- **Done when**: the grep above is clean or justified, and a fresh agent given only the guides places a new use case, a new route and a new handler in the right folders (one dry run, read only).

### Step 7: Validation and closure

- **Objective**: close the chantier with an honest state.
- **Changes**: the conformity table of section 12 final; the accepted exceptions listed with their reason (expected: `application/config/`, `schemas/` and `scripts/` at the package root, the kit outbox as the event port, the query ports of D5, the retention sweeps of D15); `ROADMAP.md` line set to delivered with its date and `docs/HISTORY.md` entry; this file frozen as the as-built record.
- **Depends on**: Step 6.
- **Done when**: section 11.3 holds.

---

## 8. Agent strategy: one Opus agent per module

**One Claude Opus agent per module, in parallel when dependencies allow, coordinated by the main session, validated before integration.** No refactoring agent was launched while preparing this document.

### 8.1 Roles

| Role | Who | Does |
|---|---|---|
| Integrator | the main session | launches the waves, owns the shared files of 6.3, reviews each diff, replays the checks, merges, runs the raccord pass. Writes no module code. |
| Foundation agent | one `implementer` (Opus), Step 3 | the kit, the tooling, the exports. Alone on the repository while it runs. |
| Module agent | one `implementer` (Opus) per module, Step 4 | everything inside `modules/<name>/` and nothing outside, except what its brief names. |
| Reviewer | `reviewer` (Opus) at the end of each module, `pr-reviewer` once the PR is open | reads the diff from a file, reproduces its suspicions. |
| Documentation agent | one agent, Step 6 | the guides, in series. |

### 8.2 Rules of engagement

- One agent per module, never two on the same module, never one agent on two modules (the `billing` agent takes `quotas`: its only wired symbols sit in the billing gate).
- Each agent works in its own worktree (`isolation: "worktree"`) on its own branch, off the `develop` that contains the previous wave.
- **Perimeter**: `modules/<name>/**`. Outside it, an agent may edit only the files its brief lists by path, typically its real-database script in `apps/api/scripts/` and, when it adds an event, the 5 catalog files of `packages/events`.
- **Never edited by a module agent**: `apps/api/src/app.ts`, `container.ts`, `composition/**`, `apps/api/shape/**`, `.dependency-cruiser.cjs`, `packages/test/**`, `packages/ddd-kit/**`, any `CLAUDE.md`, another module. If the work needs one of them, the agent stops and reports the exact change needed; the integrator applies it.
- The frozen contract names of 6.2 stay alive until the raccord pass.
- A shared abstraction needed by several modules (a kit helper, a guard) is added by the foundation agent or by the integrator between waves, never by two module agents in parallel.
- Parallelism is not forced: if two agents of a wave turn out to need the same file, the second waits.
- An agent's report is not proof. The integrator re-reads the diff and re-runs the checks before merging.
- A module is not "done" on a green module test: its dependencies and the checks of 10.2 decide.

### 8.3 What each agent receives

By file path, not by pasted text:

1. This file: sections 2 (rules), 3 (decisions, closed), its block of section 5, sections 6.2 and 6.3, 10 and 11.2.
2. Its annex in `docs/architecture-harmonization/audit/` (its diagnosis, with line numbers).
3. The guides in force: `modules/CLAUDE.md`, its module `CLAUDE.md` if any, `packages/ddd-kit/CLAUDE.md`, `packages/test/CLAUDE.md`.
4. From wave 1 on, the two pilot PRs as conforming references: `uploads` (technical) and `api-token` (DDD).
5. Its perimeter, the files it may touch outside it, the frozen names it must keep.
6. A report path.

### 8.4 What each agent does

1. Audit its module against its annex and report any difference before changing anything.
2. State the real responsibility of the module.
3. Confirm whether it needs a DDD domain, against the decision of D11.
4. List the violations it will fix.
5. Apply the corrections of its perimeter.
6. Follow the structure conventions strictly.
7. Fix the dependencies between layers.
8. Add the ports and adapters needed.
9. Make every write route go through a use case and every read route through a query port.
10. Add the missing Zod validations.
11. Fix the event handlers.
12. Centralise the transformations in mappers.
13. Add or adapt the tests.
14. Check that the module compiles and its tests pass.
15. Report its work and its blockers.

### 8.5 Brief template

```text
You migrate ONE module of clean-stack to the target architecture: modules/<name>.
Do not touch anything outside your perimeter. Do not change behaviour or the HTTP contract.

Read first, in full:
- docs/ARCHITECTURE-HARMONIZATION.md: sections 2, 3, 5 (block "<name>"), 6.2, 6.3, 10, 11.2
- docs/architecture-harmonization/audit/<annex>.md, section "<name>"
- modules/CLAUDE.md, modules/<name>/CLAUDE.md (if present), packages/ddd-kit/CLAUDE.md, packages/test/CLAUDE.md
- Reference module already migrated: modules/uploads (technical) [and modules/api-token (DDD)]

Perimeter: modules/<name>/**
Also allowed: <explicit list of paths, or "nothing">
Never edit: apps/api/src/app.ts, container.ts, composition/**, apps/api/shape/**,
.dependency-cruiser.cjs, packages/test/**, packages/ddd-kit/**, any CLAUDE.md, any other module.
If you need a change there, stop and write the exact change in your report.

Frozen names you must keep exported and bound: <list from 6.2>
Domain decision for this module: <yes: concepts ... | no>

Work in this order, one commit per stage, each commit green:
1. Re-audit against the annex; write the differences at the top of your report.
2. Safety net: <missing behaviour tests listed in the annex>; record the baseline of <check scripts>.
3. Renames and folder layout. 4. Ports. 5. HTTP schemas and param validation.
6. Use cases and queries. 7. Event handlers. 8. Domain (only if D11 lists it). 9. Mappers.
10. Switch on the target guards in src/__tests__/layering.test.ts.

Tests: behaviour first. One scenario per business rule on the use case (given / when / then,
the repo's runner, ports mocked by the runner, assert the result, the aggregate and the events,
never the call order). A unit test only for a rule no scenario reaches (bounds of a value object,
a pure algorithm). Move existing service tests onto the use cases; delete a test that cannot
catch a real regression. Never measure the work by the number of tests.

Checks to run and paste in the report:
- pnpm --filter @modules/<name> test && pnpm --filter @modules/<name> type-check
- pnpm check:boundaries && pnpm check:api-shape && pnpm check:duplication && pnpm check:unused
- <real-database scripts of this module>

Done when: section 11.2 of the plan holds for this module.
Report: write the full report to <path>; answer in 5 lines: status, what moved, checks with
numbers, what you could not verify, what the integrator must change in shared files.
```

### 8.6 Integration of one module

1. The agent reports; the integrator reads the report, then the diff written to a file.
2. The integrator replays the checks of 10.2 in the agent's worktree.
3. `reviewer` on the diff (Opus: every module here touches data, security or money somewhere). Confirmed defects are fixed with their test by the same agent, resumed by message.
4. PR opened, `pr-reviewer`, squash merge.
5. Next agent of the wave rebases on the merged `develop`. Conflicts are expected only in the frozen files, which agents do not edit.
6. End of wave: raccord pass.

---

## 9. Risks and precautions

| Risk | Where | Precaution |
|---|---|---|
| A guard silently matches nothing after a rename | `.dependency-cruiser.cjs`, `isRouteFile`, `tsconfig.build.json`, handler discovery by container value | tooling first, both spellings accepted, each guard with a fixture test that fails when the guard is blind |
| The frozen API shape drifts | adding `zV("param")` or a header schema changes the input types of `AppType`; a status or a response shape changes | a folder move or a service split does not drift it. Param validation does: the drift is expected, listed route by route in the PR, proven to be an added input type only, then refrozen with `api-shape:update` in the same commit. Any other drift is fixed in the code. |
| A unit of work is split in two | approval (claim, execute, mark), last-manager lock, wipe, token revocation with its event | one use case owns one `uow.run`; a use case composing another joins the open unit (ambient transaction); the real-database checks are the proof, not the unit tests |
| An emit moves out of its transaction | 56 emit calls to relocate into use cases | the test asserts the write and the enqueue saw the same transaction (`modules/CLAUDE.md`, Domain events); orphan query on the event store at Step 5 |
| A stored format changes | token HMAC and checksum, webhook cipher layout and HKDF info, audit hash chain, notification `dedup_key`, handler idempotency keys | crypto and format code is moved, never rewritten; its existing tests move with it unchanged; listed per module in section 5 |
| A handler name changes | `handlerName` of `onEvent` is a persisted key | names are kept verbatim when a handler becomes a dispatch |
| Hot paths get slower | `StaffAccessService` on every staff request, API token authentication on every `/api/v1` call | measure before and after (request timing on the two paths); a use case per call adds no query |
| Duplication check fails | one span wrapper and one error mapping per use case, 100+ new files | the use case convention carries no boilerplate; a shared helper is promoted at the second occurrence, by the integrator |
| Parallel agents collide | `app.ts`, `container.ts`, sources, exports | Step 3 stable exports; shared files owned by the integrator; worktrees |
| Deep imports from scripts break | 10 of the 20 `check:*` scripts import module internals by deep path, some build a class by name with positional arguments (`check:wipe-rollback`) | Step 3 rewrites the specifiers; a module agent owns the scripts its brief lists |
| `admin` is too large for one change | 95 files, about 55 use cases | one agent, several PRs in the order of section 5, each green |
| The audit is stale | static, dated 2026-11-13 | Step 1 refresh before execution; every agent starts by re-auditing |
| DDD creeps in | pressure of a uniform tree | D11 is closed before Step 4; an agent that wants a `domain/` not listed there stops and asks |
| The notification trigger stops being installed | `ensureNotificationTrigger` runs at boot from `NotificationStreamHub.start()` (D16) | `check:digest` must prove the trigger exists and fires after a boot; the install stays in the adapter and no migration replaces it |
| The auth bridge breaks its transaction model | library hooks, after-commit emits, 40 of the 56 host emit sites | last wave, alone; its real-database checks are written before the move; hooks stay thin adapters dispatching to use cases |
| A facade is removed too early | frozen names consumed by a later wave | removed only after the last consumer's wave is merged (Step 4); `knip` warns only, so the integrator keeps the list |
| The guides lie during the chantier | old guide, new code in migrated modules | this file is the reference for migrated modules until Step 6; said in each agent brief |

---

## 10. Tests and validations

### 10.1 Test rules of the chantier

- Behaviour, not implementation: one scenario per business rule, on the use case, given / when / then, with the repository's runner and its mocks.
- A unit test only where no scenario reaches the rule: bounds of a value object, a pure algorithm, a security or money wall, a bug already fixed, a fact only a real database proves, an architecture guard.
- Existing service tests move onto the use cases that replace the service; a test that only checks wiring, a getter or a mapping is deleted. The count of tests is never the measure.
- A refactor adds no behaviour: a scenario that did not exist before is added only as the safety net of a rule the migration is about to move (listed per module in the annexes, point 14).
- A query is proven where it carries a rule: ownership scoping in its `WHERE` (wrong owner returns nothing) is one scenario, against a real database or through the route.
- Tests live in `__tests__/`, mirroring the layers.

### 10.2 Checks per module (agent, then integrator)

- `pnpm --filter @modules/<name> test` and `type-check`.
- `pnpm check:boundaries`, `pnpm check:api-shape`, `pnpm check:duplication`, `pnpm check:unused`.
- The module's `layering.test.ts` with the target guards on.
- The real-database scripts that exercise the module:

| Module | Scripts |
|---|---|
| `admin` | `check:admin-staff`, `check:admin-atomicity`, `check:admin-approval`, `check:admin-step-up`, `check:admin-accounts`, `check:admin-ops`, `check:admin-workspace`, `check:wipe-rollback`; `check:totp-enrolment` tests the host verifier against the staff schema |
| `api-token` | `check:api-token-visibility`, `check:wipe-rollback` |
| `webhooks` | `check:webhook-lease`, `check:outbox-lease`, `check:sweep-lock` |
| `rgpd` | `check:wipe-rollback`, `check:admin-staff`, `check:admin-workspace`, `check:totp-enrolment` |
| `billing` | `check:admin-accounts`, `check:admin-ops`, `check:scim-seats`, `check:scim-connection`, `check:sweep-lock` |
| `organization` | `check:scim-connection`, `check:scim-seats` |
| `uploads` | `check:wipe-rollback` |
| `notifications` | `check:fanout`, `check:digest`, `check:sweep-lock`, `check:admin-approval`, `check:admin-workspace` |
| `audit-log` | `check:outbox-lease` (one link per redelivered event), `check:sweep-lock`, `check:admin-approval`, `check:audit-chain` (concurrent distinct events form one chain, `verifyChain` over real rows) |
| `consents` | `check:sweep-lock` |
| `policies`, `profile`, `quotas` | none |
| kit, rerun only when the package changes | `check:enqueue`, `check:marksent`, `check:email-lease` (email), `check:uow-rollback` (drizzle, outbox) |
| `auth` (wave 5) | `check:auth-transaction`, `check:scim-seats`, `check:scim-connection`, plus its own checks (hooks, seat caps, personal organization, after-commit emits) written in the wave |

Script names checked against `apps/api/package.json` and the module `package.json` files on 2026-11-13; which script covers which module is to confirm during the Step 1 refresh.

### 10.3 Checks per wave and at the end (integrator)

- The whole pre-push chain on the merged branch: `pnpm ci:check`, `check:boundaries`, `check:api-shape`, `turbo run build type-check test`, `check:duplication`, `check:unused`.
- Every real-database `check:*` script, and the accessibility jobs.
- The counts of Step 5.

---

## 11. Acceptance criteria

### 11.1 Of the preparation (this mission)

- [x] A roadmap line describes the chantier.
- [x] This separate file exists, with the target rules, the map of the modules, business and technical modules told apart, the gaps, steps that can be carried out, the dependencies between modules, the one Opus agent per module strategy, the acceptance criteria of the migrations, and the update of every `CLAUDE.md` concerned as an explicit final step.
- [x] The roadmap references this file.
- [x] No refactoring was done, no refactoring agent was launched, no application code or existing structure was changed.

### 11.2 Of one module

- [ ] Its source root holds only `__tests__/`, `application/`, `domain/` when justified, `infra/` and `<name>.module.ts`, plus the exceptions decided in section 3.
- [ ] Its nature (business or technical) and its `domain/` decision match D11; no artificial entity, aggregate, value object or domain service.
- [ ] If it has a `domain/`: per concept, `ddd-kit` primitives, the suffixes of 2.3, no dependency on any other layer.
- [ ] Every write is a use case in `application/usecases/<name>/` with its DTO beside it; every read is a query port in `application/queries/` implemented in `infra/queries/`; no global `application/dto/`; no use case calls another.
- [ ] Nothing named service is an entry point; technical services are behind a port in `application/ports/` and implemented in `infra/`.
- [ ] No route imports or calls a repository, an adapter, the ORM or a technical service; a read goes through a query port.
- [ ] Every param, query, body and relevant header is validated with Zod in the HTTP layer; no cast on request data.
- [ ] Every handler is in `application/event-handlers/` and only dispatches to use cases.
- [ ] Domain events are in `domain/<concept>/events/`, application events in `application/events/`; every state change still emits, in the same unit of work, with its actor.
- [ ] Transformations are in mappers; no business logic in them.
- [ ] `application/` and `domain/` import nothing from `infra/`; the target guards are on in its `layering.test.ts`.
- [ ] The checks of 10.2 are green, with their output in the PR.
- [ ] The HTTP contract is unchanged, or each drift is listed and proven (section 9).
- [ ] The frozen contract names are still bound, or were rebound by the integrator.
- [ ] Section 12 is updated in the PR that delivers it.

### 11.3 Of the chantier

- [ ] Every module is conform, or its exception is written with its reason.
- [ ] The strict boundary rules apply to the whole repository with no allowlist and no second spelling.
- [ ] The global verification of Step 5 is green.
- [ ] Every `CLAUDE.md`, skill and doc of Step 6 is updated; none contradicts another; no obsolete rule is left.
- [ ] The roadmap line is marked delivered and this file is the as-built record.

---

## 12. Progress

Updated in the PR that delivers each line.

| Step | State | Date | Issue or PR | Notes |
|---|---|---|---|---|
| 1. Audit and map | done | 2026-11-13 | #211 | static audit; green baseline on `3bec6dba`: pre-push chain (62 of 62 turbo tasks) and the 22 real-database checks |
| 2. Documentation and conventions | done | 2026-11-13 | #211 | 17 decisions taken, conventions written in section 2 |
| 3. Foundation | done | 2026-11-13 | #218, #220, #219, #223, #216 | tooling accepts both spellings and holds the layering rules (`MIGRATED_MODULES`); opt-in `targetShape` guards; `IUseCase`, `IQuery`, `dispatchTo`, `idParamSchema`; 111 stable module export keys, folder renames proven host-free on `uploads` and `billing`; `__tests__` in apps and packages |
| 4. Module by module | to do | | | see below, waves 0 to 5 |
| 5. Global verification | to do | | | |
| 6. Final documentation | to do | | | |
| 7. Validation and closure | to do | | | |

| Wave | Module | Nature | Domain | Effort | State | PR | Conform |
|---|---|---|---|---|---|---|---|
| 0 | `uploads` | technical | no | S to M | done 2026-11-13 | | yes |
| 0 | `api-token` | business | `ApiToken` | M | done 2026-11-13 | | yes |
| 1 | `billing` + `quotas` | technical | no | M | done 2026-11-13 | | yes |
| 1 | `profile` | technical | no | S | done 2026-11-13 | | yes |
| 1 | `policies` | technical | no | S to M | done 2026-11-13 | | yes |
| 1 | `consents` | technical | no | M | done 2026-11-13 | | yes |
| 1 | `audit-log` | technical | no | M | done 2026-11-13 | | yes |
| 2 | `webhooks` | technical | no | L | done 2026-11-13; HTTP drift: a malformed `:id` or `:deliveryId` answers 400 `REQUEST_INVALID` instead of 404 | | yes |
| 2 | `notifications` | technical | no | L | done 2026-11-13 | | yes |
| 2 | `admin` | business | `ApprovalRequest`; staff domain service file | XL | done 2026-11-13; HTTP drift: a malformed `:id` answers 400 `REQUEST_INVALID` instead of 404 | | yes |
| 3 | `rgpd` | business | `domain/deletion/` pure rules | L | to do | | |
| 4 | `organization` (from the host) | business | no | M | to do | | |
| 4 | host use cases | host | n/a | M | to do | | |
| 5, last | `auth` (D9) | technical | no | XL | to do | | |

Counts to rewrite at Step 5 (before, on 2026-11-13):

| Measure | Before | After |
|---|---|---|
| Use case files in modules | 0 | |
| Aggregates / value objects / typed ids | 0 / 0 / 0 | |
| `*.service.ts` under `application/services` | 23 | |
| Module routes | 82 | |
| `zV("param")` validations | 0 | |
| Raw `c.req.param` reads in module routes | 35 | |
| Modules whose routes open a transaction | 2 | |
| Handlers and subscribers holding logic | 5 of 6 in the modules, plus 1 in the host | |
| Module `exports` entries | 138 | |
| Host files reading the global `di` | 13 | |
