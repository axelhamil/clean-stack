# Audit: docs, tooling and kit packages against target rules T1 to T13

Read-only. Paths are relative to the repo root. Line numbers come from `cat -n`. Counts come from the scripts in the scratchpad (`counts.sh`, `routes.mjs`, `ev.sh`), which are quoted in Part 4.

Headline finding: the current structure is encoded in three independent places that must move together: (1) written rules (`modules/CLAUDE.md` is the master, roughly 13 hard-coded statements), (2) five path-aware tools (dependency-cruiser, source-scan, jscpd, turbo, tsconfig.build) and (3) 138 hand-written `exports` entries in the 12 module `package.json` files, consumed by 77 distinct subpath specifiers in `apps` and `packages`. Nothing in the repo today uses `domain/<concept>/`, aggregates, entities, value objects, domain events or use cases (Part 4).

---

## Part 1. Documentation inventory

Legend: C = concerned (needs change), S = silent on the target (add a statement), V = stays valid.

### 1.1 Master table

| File | Concerned | Statements to change (quoted, line) | Statements to add | Stay valid |
|---|---|---|---|---|
| `modules/CLAUDE.md` | C, heavily | L14-19 anatomy tree: `domain/ application/{config,ports,services,use-cases,dto,event-handlers} infrastructure/{repositories,services,http,...}`, `testing/`, `__TESTS__/` (T2, T3, T4, T5). L16 `use-cases`, L18 `__TESTS__`. L25 contract 1 "plus what the host must bind (application services, event handlers)". L30 contract 6 "A route may read its own tables; it writes only through a service or a use case" (T7: reads too must go through a use case). L36 "The `infrastructure/` list is open" (T5 closes it to `repos/ http/ adapters/`). L38 "`domain/`: only pure rules or `ddd-kit` primitives ... An empty `domain/` is cargo-cult" (T1/T3: per concept layout). L41 "`application/use-cases/`: one file per use case, only where an aggregate exists" (T4/T6: use case is the single entry point, `usecases/<name>/<name>.usecase.ts`). L42 "`application/services/`: `<Noun>Service` with N methods" (T6: services are technical capabilities, ports in `application/ports`, impl in `infra/`). L43 "`application/dto/`: request schemas" (T4: DTO next to its use case; T8: HTTP schemas stay in HTTP layer). L45 "`infrastructure/repositories/`: `*.store.ts` ... `*.repository.ts` only where the port models an owned record" (T5 `infra/repos/`; the store/repository suffix split goes). L46 "`infrastructure/services/`, `adapters/`" (T5 `adapters/`). L47 "`infrastructure/http/`: the route factories" (T5 `infra/http/routes/<route>/<route>.ts + <route>.schema.ts`, `controllers/`). L53 "Orchestration defaults to `application/services/`; add `domain/` and `use-cases/` only when ... an aggregate exists ... billing, auth, plans and quotas are never DDD" (T1, T6). L55 "Do I need an aggregate?" test (keep as the DDD gate, drop its coupling to use cases). L57 `check:boundaries` text naming `infrastructure/` (T13). L69-70 "Commands: Controller -> Use Case or Service -> Aggregate or Store ... Queries: Controller -> Query (direct ORM, no use case)" (T7). L85 "Transactions are opened by `uow.run` in use cases, services and route handlers ... A route opens `ITransactionService.run` ... (`profile`, `notifications` routes)" (T7: only use cases). L95-97 domain events: "Without an aggregate, the write and its `emitEvent(outbox, ...)` share one `uow.run`", handler "lives in the module that reacts, as `onEvent(...)` bound in the module file" (T9, T10: application events in `application/events/`, handler only dispatches to use cases, in `application/event-handlers/`). L28 "Events go through the one catalog in `packages/events`" (T9: per-module events). L118 boundaries paragraph (`domain/` and `application/` free of infrastructure; "no write from a routes file"). L122 "Moving a module here" (still valid, add the migration recipe). | A T2 root rule (`__tests__/`, `application/`, `domain/` optional, `infra/`, `<name>.module.ts`). T3 domain layout and suffix table. T4 application layout. T5 infra layout. T6 service versus use case rule. T7/T8 route rules (use cases only, Zod on params, query, body, headers). T9/T10/T11 event rules. T12 mappers rule (currently "a `mappers/` folder exists only next to an aggregate", L45). T1 rule that a technical module has no `domain/`. | L3 intro, L21 per-module CLAUDE.md policy, L26 prerequisites, L27 port-by-consumer, L29 host query for cross-module reads, L31 relative imports and no barrel, L32 source only, L61-65 ports (consumer declares), L72-83 DI (`defineModule`, explicit generic), L87-89 repository instrumentation, L114 testing pointer, L122 api-shape recipe. |
| `CLAUDE.md` (root) | C, light | L7-9 "Three roots" (valid). L25 table row `modules/` points to `modules/CLAUDE.md` (valid). L55 rule 3 pre-push chain names no folder (valid). L58 rule 6 "aggregate transition, lifecycle hook, service-level write" and "Test before merging a state change: trace the action to an emit call" (T9: domain event by the model, application event by use case; wording "service-level write" becomes "use case write"). L60 rule 8 "Repositories and external-I/O services" (T5/T6 naming). L59 rule 7 (valid). | Pointer to T1 to T13 (or to the new `modules/CLAUDE.md` sections). | L7-9, L51-56, rule 4, rule 5, rule 7, Turborepo, work tracking, release flow. |
| `apps/api/CLAUDE.md` | C, medium | L19 "Business modules are `@modules/<name>`" (valid). L29 `queries/` "Reads joining tables of several modules, behind a port a module declares" (valid, but T7 means the module-side consumer of that port is a use case). L47 `auth/queries.ts` "no port or aggregate: auth is not domain" (T1: auth integration is a technical module, consistent; no change except wording "not domain"). L55 "route factories only by `app.ts`". L57 removability recipe (path-agnostic, valid). L65 "A port a module consumes is declared in that module" (valid). L105 "Domain and application use `Result`; the controller translates to `HTTPException`" (T5 `controllers/`, T7). L115-116 "the controller builds `RepoScope.org(orgId)` and passes it to the use case" / "Queries ... take the same `RepoScope`" (aligned with T7 once queries become use cases). L83-85 auth bridge `emitEvent` in the host (T9/T11: host-side emit stays an application or infra concern; decide which). L124 `shared/__TESTS__/` canary tests (T2 `__tests__`). L128 `src/__TESTS__/preload.ts` (bunfig path, `apps/api/bunfig.toml:2`). | Statement that a route factory in a module lives at `infra/http/routes/<route>/`. | L5-15 skills table, L59-70 `shared/`, L71-77 DI, L91-97 Hono RPC, L99-105 logging, L107-111 observability, L126-129 commands. |
| `apps/app/CLAUDE.md` | Not concerned | L42 "No `domain/` on the front" (front only). | none | all |
| `apps/admin/CLAUDE.md` | Not concerned | none | none | all |
| `modules/admin/CLAUDE.md` | C | L7 "`staffAccessOf` (`application/services/staff-access.ts`)" path (T3: it is a domain rule, belongs in `domain/staff/` as a service or VO). L12 "`application/approved-action.ts`" and "`ApprovalHandlers` map of `admin.module.ts`" (T4 use cases; handler map becomes use-case map). L13 "handler `notify-impersonated-user`" (T10: dispatch to a use case). L17 "Events emitted": lists 40+ `ADMIN_*` types (T9: which are domain, which are application). L21 "Ports exposed" (valid). | Layout of its domain concepts (staff, approval, impersonation, step-up) per T3; use case list. | L9 last-manager lock, L10 step-up, L11 four eyes, L25-28 traps. |
| `modules/api-token/CLAUDE.md` | C | L8 `parseToken` in `domain/api-token-crypto.ts` (T3: lives in `domain/api-token/` as VO or service). L9 "`ApiTokenService` re-applies" (T6: use cases). L15-17 events emitted incl. handler on `ORG_MEMBER_REMOVED` (T10). | Concept folder and use cases; scanning route as `infra/http/routes/scanning/`. | L7, L9-11 invariants, L21-22 traps. |
| `modules/rgpd/CLAUDE.md` | C | L3 "rgpd writes kit tables ... directly" (T13/T1: erasure orchestrator, decide use case + ports). L21 "Ports exposed" (valid). L25 trap names `executeWipe`, `collectUserDataForExport` of "the rgpd repository" (T5 `repos/`). L17 events (T9). | Whether rgpd has a `domain/` (it has none today). | L7-13 invariants, L21 ports. |
| `modules/webhooks/CLAUDE.md` | C | L13 `application/config/webhook-settings.ts` (T4 has no `config/`; decide placement). L10 URL guard (technical service, T6). L12 fan-out "reacts only to public catalog events" (T10: built-in subscriber, see Part 3). L24 `hmac-signer.ts` (technical, `infra/`). | Which parts are `adapters/` (crypto, signer, DNS guard) versus use cases (create, update, rotate, replay, fan-out). | L7-9, L11, L14, L18-20. |
| `packages/ddd-kit/CLAUDE.md` | C | L10 `domain/ entity, aggregate, value-object, watched-list, domain-event` (valid, no `usecase` base). L26-31 table: "Aggregate ... Infra orchestration is NOT an aggregate" (valid for T1). L31 "DomainEvent + onEvent + EventCollector" and L44 rule 6 (T10: handler to use case). L45 rule 7 scopes. L33 "`BaseRepository<T>` ... Rare". | Application event helper, use case base or convention, handler-to-use-case pattern (Part 3). | L39-43 rules 1 to 5, L69 commands. |
| `packages/events/CLAUDE.md` | C | L3 "The single event catalog: every domain event type" (T9: domain events per concept, application events in `application/events/`). L18-28 "Declaring an event ... One new type touches five files" in `event-types.ts`, `payloads.ts`, `retention-map.ts`, `visibility-map.ts`, `event-descriptions.ts` (central, exhaustive `Record<EventType,...>`). L35 rule 4 "emit call (`aggregate.addEvent(...)` inside `uow.run()`, or `emitEvent(outbox, ...)` inside `uow.run()` for service and library-bridge code)". | Rule for where an event declaration lives if per module. | L32-34 payload and actor contract. |
| `packages/outbox/CLAUDE.md` | C | L26 rule 2 "`emitEvent(outbox, ...)` for code that emits outside an aggregate flow" (T9/T11: becomes application-event publisher port, impl in `infra/adapters/`). L27 rule 3 handlers run via `OutboxRelay`. L28 rule 4 "a user handler returns a failed `Result`" (T10 handler = dispatch only). L17-18 layout. | Publisher port naming and location (T11). | L25 no env, L27-29 lease model. |
| `packages/http/CLAUDE.md` | C | L8 `zV` "a failed parse throws `REQUEST_INVALID`" (T8 valid; add that every input is mandatory). L24 `RouteGuards` (valid). | T8 rule: params, query, body, headers validated; no `c.req.param` cast. | L22-26 rules. |
| `packages/drizzle/CLAUDE.md` | C, light | L3 "Consumers: `apps/api` (stores, repositories ...) and `modules/*`" (naming `stores`). L28 `organizationId` rule (valid). L43 "A repository's save/create calls `EventCollector.collectFrom`" (valid). | none | L25-45. |
| `packages/test/CLAUDE.md` | C | L7 rule 1 "one test file per service, use case, store or repository, DTO or route file, under `__TESTS__/`" (T2 `__tests__/`; drop "store"). L8 reference test path `modules/api-token/src/__TESTS__/github-key-verifier.test.ts` (path moves). L3 `./source-scan` (see Part 2). | Layer-based test rule for use cases (T6). | L8-11 rules 2 to 5. |
| `packages/access-control/CLAUDE.md`, `packages/i18n/CLAUDE.md`, `packages/web-kit/CLAUDE.md`, `packages/ui/CLAUDE.md` | Not concerned | none (greps for use-case, `application/`, `infrastructure`, `__TESTS__` returned nothing) | none | all |
| `.claude/skills/feature-slice/SKILL.md` | C | L25 "derive the aggregate/VOs (or a `<Noun>Service` when no aggregate; decide by aggregate, not I/O count)" and "files per layer (domain -> use case -> Hono route ...)" (T1/T6). L29 "domain -> application -> route" (valid ordering). | Use case first slice; per-concept domain folder; new module checklist (T2). | L10-15, L33-43. |
| `.claude/skills/billing-entitlements/SKILL.md` | C | L8 "Pragmatic infra, **NOT DDD**. `modules/billing/src/domain/entitlements.ts`" (T1 says billing without invariants has no `domain/`; entitlements config goes to `application/` or `infra/config`). L17 `modules/quotas/src/infrastructure/quota-reservation.ts` path and "Never a use case" (T6/T7 conflict). L16 "`requireFeature`, `requirePlan`, `requireQuota`" (host middleware, valid). | | L10-15 axes. |
| `.claude/skills/events-outbox/SKILL.md` | C | L8 "`repo.save(agg)` ... `collectFrom`" (valid for domain). L23 "wiring a handler: `handlerName` is a persisted key" (valid; add handler-to-use-case). | Application events path. | L8, L27. |
| `.claude/skills/email-delivery/SKILL.md` | C, light | L8 `QueuedEmailService` (technical service, valid under T6; port/impl split in `packages/email` described in Part 3). | | all |
| `.claude/skills/compliance-consent/SKILL.md` | C, light | L15 "`PolicyAcceptanceService.accept(...)` ... `DrizzlePolicyAcceptanceStore`", L24 "`ConsentService`" (T6 use-case candidates, T5 `repos/`). | | rest |
| `.claude/skills/auth-server/SKILL.md` | C, light | L8 "Module-level singleton, not wrapped in port/adapter" (T1 technical module; T13 consistent). L12 middleware chain (valid). | | rest |
| `.claude/skills/storage-uploads/SKILL.md` | Not concerned by greps (no hits for `use-case`, `application/`, `infrastructure`) | | | all |
| `docs/MODULES.md` | Not concerned | It is a priced feature catalogue (L37 "DDD-kit ... 275 vitest cases"); no structure rule. | | all |
| `docs/OVERVIEW.md` | C, light | L113 "Clean Architecture + DDD enforced by structure". L115 "DDD scoped to your actual business domain: never billing, auth, gating, or quotas" (T1: DDD only where invariants exist, wording to align). L87 "declare an event, add it in your aggregate, run the use case" (consistent with the target, inconsistent with today's code). | | L31, L99, L113 first clause. |
| `docs/EVENTS.md` | C | L55-132 "How to emit a new event" Step 1 declares in `packages/events/src/event-types.ts` (L57-66), Step 2 `payloads.ts` (L68), L112 "Step 5: persist in a use-case via `uow.run()`". L136 "A handler factory in the module's `src/application/event-handlers/`" (path OK for T4/T10). L626-629 reference table with `modules/audit-log/src/infrastructure/services/audit-event-subscriber.ts`, `modules/webhooks/src/infrastructure/services/webhook-fanout-subscriber.ts`, `webhook-delivery-worker.service.ts`, `crypto/aead.ts` (8 path hits for old folders). L376 same fan-out path. | Application event section. | L28-52 mental model, L196-259 delivery. |
| `docs/EVENT_PIPELINE.md` | C, light | L87 "Producer: Your use case / service ... `aggregate.addEvent()` or `emitEvent(outbox, ...)`" and L181-182. L225 `modules/webhooks/src/infrastructure/services/webhook-fanout-subscriber.ts` path. | | rest |
| `CONTRIBUTING.md` | Not concerned | L32 "The architecture rules live in the CLAUDE.md files" (pointer only). | none | all |
| `README.md` | C | L81 "DDD scope: Reserved for what your customers pay for. Not for billing, auth, gating, or quotas". L130 "Clean Architecture + DDD enforced by structure". L132 "DDD scoped to the business domain only: never billing / auth / gating / quotas". L138 "`modules/<context>/{domain,application,infrastructure}`". L139 "CQRS (commands via use-cases, queries direct to Drizzle)" (T7). L126 "declare the event ... `addEvent()` in the aggregate" (consistent). | | L127, L133-137. |
| Other docs holding old paths (not in scope list, found by grep) | C | `docs/FEATURES.md` (9 hits, e.g. L333, L360, L380, L381, L416, L428, L430), `docs/REMOVABILITY.md` (5), `docs/INTEGRATIONS.md` (5), `ROADMAP.md` (2), `docs/HISTORY.md` (2), `docs/HEALTH-PROBES.md` (2), `docs/CRON.md` (2), `docs/SURFACE.md` (1), `docs/QUOTA-GATING.md` (1), `docs/OBSERVABILITY.md` (1) | | |

### 1.2 Known contradictions, located

| Known example | Where it is written |
|---|---|
| "orchestration defaults to application/services, use-cases only where an aggregate exists" | `modules/CLAUDE.md:41`, `:53`; `.claude/skills/feature-slice/SKILL.md:25` |
| "Queries: Controller -> Query (direct ORM, no use case)" | `modules/CLAUDE.md:70`; `README.md:139` ("queries direct to Drizzle") |
| "a route may read its own tables" | `modules/CLAUDE.md:30` |
| `application/dto/` | `modules/CLAUDE.md:16,43`; 11 modules hold the folder (Part 4.9) |
| `infrastructure/` naming | `modules/CLAUDE.md:16,36,45-47,57,118`; `.dependency-cruiser.cjs:75`; `README.md:138` |
| `__TESTS__` naming | `modules/CLAUDE.md:18`; `packages/test/CLAUDE.md:7`; `apps/api/CLAUDE.md:124,128`; `.jscpd.json:11`; `turbo.json:65`; `apps/api/tsconfig.build.json:6`; `.dependency-cruiser.cjs:13,21,72` |
| `*.store.ts` | `modules/CLAUDE.md:45` (`I<Noun>Store`); `modules/CLAUDE.md:78` example; `packages/drizzle/CLAUDE.md:3`; `packages/test/CLAUDE.md:7` |
| handlers that write directly | `modules/CLAUDE.md:105` example `c.ITransactionService.run(async () => /* write + emitEvent */)`; `docs/EVENTS.md:136-175`; real code: `modules/api-token/src/application/event-handlers/revoke-on-membership-lost.ts`, `modules/admin/src/application/event-handlers/*.ts` |
| "billing, auth, plans and quotas are never DDD" | `modules/CLAUDE.md:53`; `README.md:81,132`; `docs/OVERVIEW.md:115`; `.claude/skills/billing-entitlements/SKILL.md:8` |
| single event catalog versus per module events | `modules/CLAUDE.md:28`; `packages/events/CLAUDE.md:3`; `docs/EVENTS.md:57-68` |

---

## Part 2. Tooling that encodes the structure

### 2.1 `.dependency-cruiser.cjs` (run by `pnpm check:boundaries`, `package.json:15`)

| Line | Hard-coded pattern | Effect | Change for `infra/`, `__tests__/`, `usecases/`, `infra/repos/` etc. |
|---|---|---|---|
| 1 | `MODULES = "^modules"` | module root | none |
| 13 | `pathNot: "(/__TESTS__/\|/src/testing/)"` in `no-cross-module-import` | tests and `testing/` exempt | must also exempt `__tests__` (rename) or keep both during transition; `testing/` folder is outside T2 (decide: `__tests__/fixtures`) |
| 21 | `from: ${MODULES}/([^/]+)/src/(testing/\|__TESTS__/)` in `tests-reach-other-modules-schemas-only` | tests may reach other modules' `schemas/` only | rename to `__tests__/`; `testing/` same decision |
| 32-35 | `${MODULES}/([^/]+)/schemas/` | module schemas folder | T2 lists `schemas/` nowhere (source root only); `schemas/` sits outside `src/`, so unaffected |
| 44 | `to: { path: "\\.module\\.ts$" }` | only hosts import `*.module.ts` | none (T2 keeps `<name>.module.ts`) |
| 72 | `from: ${MODULES}/[^/]+/src/(domain\|application)/`, `pathNot: "/__TESTS__/"` in `pure-module-domain-and-application` | domain and application purity | rename `__TESTS__`; add a stronger rule `domain` -> only `domain` (T13: domain depends on nothing, today it may import `application`) and `application` -> not `infra` |
| 75 | `${MODULES}/[^/]+/src/infrastructure/` as forbidden target | rule actually enforcing T13 | `infrastructure` -> `infra` (if left, the rule silently stops protecting the renamed folder) |
| 76-78 | `${MODULES}/[^/]+/schemas/`, `^packages/drizzle/`, `FRAMEWORKS` regex (L3-4: hono, hono-pino, @hono/*, drizzle-orm, pg, better-auth, @aws-sdk, resend, stripe, @sentry) | framework ban | valid; T13 says "framework, ORM, provider SDK": `zod` allowed, matches today |
| 88 | `pathNot: ${MODULES}/[^/]+/(schemas\|src/application/ports)/` in `host-reads-modules-through-public-layers` | host queries read ports and schemas only | valid; `application/ports/` stays in T4 |
| 130 | `exclude ... routeTree.gen.ts`, `dist` | none | none |

Missing rules the target needs: nothing forbids `application` -> `infra` of another folder name, `domain` -> `application`, `infra/http` -> `infra/repos` (T7), or `application/event-handlers` -> `infra` (T10). There is no rule at all on intra-module direction between `application` and `domain` today.

### 2.2 `packages/test/src/source-scan.ts` (`assertModuleLayering`, L259-285)

| Line | Hard-coded | Effect | Change |
|---|---|---|---|
| 9 | `TEST_DIRECTORIES = new Set(["__TESTS__", "__tests__"])` | already tolerant to both spellings | none needed for the rename; remove `__TESTS__` when the migration ends |
| 146-148 | `isProductionSource`: `.ts`, not `.test.ts`, no segment in `TEST_DIRECTORIES` | files scanned | none |
| 249-253 | `isRouteFile`: `name === "routes.ts" \|\| name.endsWith(".routes.ts")` | used by guard "routes never write" (L271) | T5 target is `infra/http/routes/<route>/<route>.ts`: file name no longer ends in `.routes.ts`. Change to path-based test (`/infra/http/routes/` segment). If not changed, the guard matches zero files and passes vacuously |
| 232-233 | `HOST_PATH` regex `^(?:apps\/\|(?:container\|auth\|composition)...\|shared\/(?:env\|middleware\/))` | detects reach into the host | none |
| 265 | `existingLayers(srcRoot, ["domain", "application"])` | "domain and application never throw" | valid (T13); add `infra` is allowed to throw? Keep as is |
| 271 | `"routes never write": Object.keys(writeCallsPerFile(".")).filter(isRouteFile)` | regex `/\.(?:insert\|update\|delete)\((?!\s*["'`])/` (L185) | T7 asks for much more: a route calls use cases only. Add a guard "route files import no `repos/`, `adapters/`, ORM" |
| 272-275 | tx parameter, tx opener, env read, host reach on `"."` | whole `src` | valid |
| `layering.test.ts` | each of the 12 modules has `src/__TESTS__/layering.test.ts` calling `assertModuleLayering(join(import.meta.dir, ".."))` (example `modules/api-token/src/__TESTS__/layering.test.ts:7`) | location-dependent only through `import.meta.dir` | move file to `src/__tests__/` (the `..` still resolves to `src`) |

Needed additions for the target: a T2 guard (source root holds only `__tests__`, `application`, `domain`, `infra`, `<name>.module.ts`), a T3 guard (no `domain/entities|aggregates|value-objects|services` at its root, suffixes), a T4 guard (no `application/dto/`), a T1 guard (technical module has no `domain/`).

### 2.3 Other tools

| Tool | File and lines | Hard-coded | Change |
|---|---|---|---|
| knip | `knip.json:75-77` | `"modules/*": { "project": ["**/*.ts"] }` with no `entry` | path-agnostic. Entry points come from the `exports` map of each module `package.json`; a renamed export key or moved file is reported only if the export map is stale |
| jscpd | `.jscpd.json:11` | `"**/__TESTS__/**"` ignored | add `**/__tests__/**` (today `__tests__` dirs in `packages/emails/src/__tests__` are not ignored; same after rename if not updated). `package.json:13` scans `./packages ./modules ...` (path-agnostic) |
| turbo | `turbo.json:65` | `"**/__TESTS__/**"` in `test` inputs; L32-35 `src/**`, `schemas/**`, `common/**` | add `__tests__`; `src/**` already covers the rest |
| tsconfig (module) | `modules/*/tsconfig.json` | `include: ["src/**/*.ts", "schemas/**/*.ts", "scripts/**/*.ts"]`, extends `@packages/typescript-config/hono.json` (no `paths`) | none |
| tsconfig (api) | `apps/api/tsconfig.json` | `paths: {"@/*": ["./src/*"]}` (only for the host, modules forbid `@/` per `modules/CLAUDE.md:31`) | none |
| tsconfig.build (api) | `apps/api/tsconfig.build.json:6` | `exclude: [..., "**/__TESTS__/**"]` | add `__tests__` |
| biome | `biome.json:150-196` | overrides only for `packages/ui/src/components/ui/**`, `packages/drizzle/src/seeds/**`, `**/routeTree.gen.ts`, `packages/drizzle/migrations/**`. No override by module path | none. Note `noImportCycles` L36 is global (valid) |
| lint-staged | `package.json:41-48` | globs by extension only | none |
| husky | `.husky/pre-push` | `pnpm ci:check`, `check:boundaries`, `check:api-shape`, `turbo run build type-check test`, `check:duplication`, `check:unused` | none (path-agnostic) |
| CI | `.github/workflows/ci.yml` (L37 boundaries, L46 api-shape, L52 duplication, L55 unused, L108-222 `check:*`) | no `paths:` or `paths-ignore:` filters anywhere in `.github` (grep returned zero); no `modules/` or `__TESTS__` path | none. `ci.yml:127,145` call `pnpm --filter @modules/webhooks check:webhook-lease` and `@modules/api-token check:api-token-visibility`, whose scripts import module paths (below) |
| bunfig | `apps/api/bunfig.toml:2` `preload = ["./src/__TESTS__/preload.ts"]`; no module bunfig exists | rename of host test dir only if host also renames | |
| docker | `docker-compose.yaml:101-102` syncs `./modules` to `/repo/modules` | path-agnostic | none |

### 2.4 `check:api-shape`

`package.json:16` -> `apps/api/package.json:36` `bun scripts/api-shape.ts`. The script (`apps/api/scripts/api-shape.ts`) emits `src/app.d.ts` with `tsc` (L24-48) and compares it to `apps/api/shape/app-type.d.ts.snap` (L57), plus the route inventory `listBackRoutes()` against `apps/api/shape/routes.txt` (L62-64; `listBackRoutes` is in `apps/api/src/shared/surface/back-routes.ts`, built from `routes.routes` of `app.ts`, no module path). No folder or suffix is hard-coded. Risk: the `.d.ts` text contains `import("@modules/<name>/<subpath>")` specifiers whenever an inferred type names a module type; `modules/CLAUDE.md:122` accepts exactly this drift (a declaring package changed) with `api-shape:update`. Moving a type file under `infra/` changes those specifiers; each such move needs the proven-structural refreeze recipe.

### 2.5 Module `package.json` `exports` maps (the largest hard-coded surface)

Keys are one per file, path-mirroring. Example `modules/api-token/package.json:7-18`: `./application/services/api-token.service`, `./application/dto/create-token.dto`, `./infrastructure/repositories/drizzle-api-token.repository`, `./infrastructure/http/api-token.routes`, `./schemas/*`.

| Module | exports entries | `/infrastructure/` | `/application/` | `/domain/` | `/testing/` | `/schemas/` |
|---|---|---|---|---|---|---|
| admin | 42 | 11 | 28 | 0 | 1 | 1 |
| api-token | 12 | 4 | 5 | 1 | 0 | 1 |
| audit-log | 7 | 2 | 3 | 0 | 0 | 1 |
| billing | 19 | 4 | 12 | 1 | 0 | 1 |
| consents | 6 | 1 | 3 | 0 | 0 | 1 |
| notifications | 9 | 3 | 4 | 0 | 0 | 1 |
| policies | 5 | 1 | 2 | 0 | 0 | 1 |
| profile | 3 | 1 | 1 | 0 | 0 | 0 |
| quotas | 5 | 1 | 1 | 1 | 0 | 1 |
| rgpd | 11 | 3 | 7 | 0 | 0 | 0 |
| uploads | 8 | 3 | 4 | 0 | 0 | 0 |
| webhooks | 11 | 4 | 5 | 0 | 0 | 1 |
| total | 138 | 38 | 75 | 3 | 1 | 9 |

Consumers: `apps` and `packages` import 77 distinct `@modules/<name>/(infrastructure|application|domain|testing)/...` specifiers (83 `application/`, 15 `domain/`, 38 `infrastructure/`, 1 `testing/` import lines), across 69 files that import `@modules/` under `apps`. Plus two `apps/api/scripts` files (`check-admin-approval.ts:9`, `check-admin-workspace.ts:10`) import `@modules/<x>/infrastructure/http/*-internal.routes`, and module scripts (`modules/api-token/scripts`, `modules/webhooks/scripts`) hold old folder names. Moving a file means: edit the `exports` key and value, every importer, and rerun `check:api-shape`.

### 2.6 Other places that name the old structure

- `apps/api/src/shared/surface/front-consumers.ts:48` skips directories matching `/^__tests__$/i` (already case-insensitive).
- `packages/test/src/source-scan.ts:9` see 2.2.
- `packages/ddd-kit` has its own `src/application/` and `src/domain/` folders and `__TESTS__/` (kit, not a module; no migration needed, but `packages/ddd-kit/CLAUDE.md:13` documents `__TESTS__/`).
- No `.github` path filter, no `CODEOWNERS` glob on module folders found.

---

## Part 3. Kit packages against the target

### 3.1 `packages/ddd-kit` (`src/index.ts` is a barrel of 26 `export *`)

| Primitive | Where | State |
|---|---|---|
| `Entity<T, Id>` | `src/domain/entity.ts:27` | exists, distinct from Aggregate. Has `id`, `get(key)`, `equals`, `toObject`, `clone`. Props in `_props`, public (CLAUDE.md rule forbids outside access) |
| `Aggregate<T, Id> extends Entity` | `src/domain/aggregate.ts:12` | `addEvent` protected (L28), `pullDomainEvents` (L22), `getDomainEvents` (L18) |
| `ValueObject<T, E>` | `src/domain/value-object.ts` | `create` returning `Result`, `validate` protected |
| `WatchedList` | `src/domain/watched-list.ts` | |
| ids | `src/primitives/uuid.ts`: `UUID<T>`, `uuidv7`, `randomUuidV4`; `class XId extends UUID<string>` | typed ids supported |
| `IDomainEvent` / `BaseDomainEvent` | `src/domain/domain-event.ts:3-21`: `eventId?`, `eventType: string`, `dateOccurred`, `aggregateId: string`, `payload: T` | plain object shape; the type string is not tied to `@packages/events` (ddd-kit cannot import it); `BaseDomainEvent` is abstract class, unused by any module (0 `extends BaseDomainEvent`) |
| `Result`, `Option` | `src/primitives/result.ts`, `option.ts` | used by 105 and 83 module files |
| `BaseRepository`, `ScopedRepository`, `RepoScope` | `src/application/repository.ts:7,24`, `scope.ts` | defined with 11 CRUD methods each; used by 0 module files (Part 4) |
| `IUnitOfWork` | `src/application/transaction.ts:1-3`: `run<T>(work)` | used by 33 module files |
| `EventCollector`, `IEventDispatcher`, `InMemoryEventDispatcher`, `onEvent`, `EventHandler` | `src/events/*.ts`; `onEvent(type, handlerName, factory(deps) => (event, payload?) => Promise<Result|undefined>, { payload })` (`on-event.ts:14-30`) | handler signature is event-in, `Promise<Result<void,unknown>\|undefined>` out; a failed `Result` is rethrown (L53-54) |
| `AppError`, `httpStatusFromCode` | `src/application/error-code.ts` | |
| `IInstrumentation`, `ILogger`, `createDbFailure`, `HealthCheck` | `src/application/*` | |

Gaps against the target:
1. No use case base, interface or convention (`IUseCase<I, O>`, `execute`). T4/T6 need a one-line contract (or a deliberate "no base class"). `modules/CLAUDE.md:96` forbids `.execute()` today for services; the target use case needs a calling convention decided once.
2. No application-event primitive (T9): `IDomainEvent` is the only event shape and its `aggregateId: string` presumes an aggregate. Use cases of a module without domain need an `IApplicationEvent` (or `aggregateId` replaced by a subject id) plus an emit helper that does not take `outbox, eventType, aggregateType` positional arguments (`packages/outbox/src/event-emitter.ts:28-35`).
3. No handler-to-use-case pattern (T10): `onEvent` takes a factory returning an arbitrary function. A helper such as `dispatchTo(useCase, mapPayload)` and a lint guard (handler imports only use cases) is missing.
4. No `Mapper` interface (T12); today each repository maps rows inline.
5. `Entity` exists; T3 `*.entity.ts` needs no kit change. `Entity` requires `UUID`-typed ids.
6. Repository contracts are the 11-method CRUD shape; every module repository today is a bespoke port (0 users of `BaseRepository` or `ScopedRepository`). Decide: keep the kit contracts for aggregates only, or shrink them.

### 3.2 `packages/events`

Shape: `EventTypes` const object with 107 entries (`src/event-types.ts:3`, `ALL_EVENT_TYPES` L115, `EventType` L113). Declaring a type touches 5 central files: `event-types.ts`, `payloads.ts` (`PayloadByEventType` L652, 760 lines), `retention-map.ts:11` (`Record<EventType, ...>`, exhaustive), `visibility-map.ts:113` (`satisfies Record<EventType, Visibility>`), `event-descriptions.ts:3` (`Record<EventType, string>`), optionally `notification-map.ts:169`. There is no registration API: the exhaustive `Record<EventType, ...>` maps and the `buildEventDispatcher` loop over `Object.values(EventTypes)` (`packages/outbox/src/event-handlers.ts:38`) assume one closed union. A per-module declaration is not possible without a change: a module-level `defineEvent({ type, payload, retention, visibility, description })` collected into the catalog (or a registry assembled by the host, since modules cannot be imported by packages: `.dependency-cruiser.cjs:51` `packages-stay-business-free`). Also, the type of `emitEvent`'s `eventType` is the closed `EventType` (`event-emitter.ts:30`), so a module event unknown to the catalog does not compile.

Needed before modules migrate: decide whether T9 means (a) the catalog stays central and each event is only classified domain or application by folder, or (b) a real per-module declaration with a host-assembled registry. Option (b) touches `events`, `outbox` (`buildEventDispatcher`, `DrizzleOutboxRepository.enqueue` payload guard noted at `docs/EVENTS.md:592`), `drizzle` (`audit_log` enums share `AUDIT_ACTOR_TYPES`), `modules/webhooks` (visibility) and `modules/notifications` (`NOTIFICATION_MAP`).

### 3.3 `packages/outbox`

- `emitEvent(outbox, eventType, aggregateType, aggregateId, payload, opts)` and `emitEventBestEffort` (`src/event-emitter.ts:28,58`). Positional string args, a global `SOURCE = "app/api"` (L6). This is the only way a non-aggregate code path emits (T9 application events). 
- Port: `IOutboxRepository` in `src/outbox.port.ts`, Drizzle impl in the same package (`src/drizzle-outbox.repository.ts`). So T11 (publisher port in `application/ports/`, impl in `infra/adapters/`) is satisfied at kit level for the outbox, but modules call `emitEvent(outbox, ...)` directly from application code and from routes.
- Handlers: `onEvent` from ddd-kit; `collectUserEventHandlers(diLike)` finds them in the container by `EVENT_HANDLER_SYMBOL` (`src/event-handlers.ts:19-21`), built-ins (`BuiltInEventHandler`, `{name, handle(event: DeliveredEvent)}`) subscribe to every catalog type (L37-41). `payloadParser(schema)` (`src/payload-parser.ts:4`) is the Zod parser for the handler payload.
- Needs for the target: a publisher port in the module's `application/ports/` (the module should not import `@packages/outbox/event-emitter` in application, though `modules/CLAUDE.md:57` allows kit emit helpers there today), an application-event helper (3.1 point 2), and an explicit statement on whether built-in subscribers (`audit-log`, `webhook-fanout`, `notification-fanout`, today `infrastructure/services/*-subscriber.ts`) are handlers (dispatch to a use case, T10) or adapters.

### 3.4 `packages/http`

`src/validator.ts:48-61`: `zV(target, schema)` wraps `@hono/zod-validator` (dependency `packages/http/package.json:28`) and throws `AppErrorException({ code: "REQUEST_INVALID", metadata: { fields } })` on failure; `target` is any Hono `ValidationTargets` key (`json`, `query`, `param`, `form`, `header`, `cookie`). Application is opt-in per route: nothing enforces it. A route skips it by not calling `zV` and reading `c.req.param()` / `c.req.header()` / `c.req.text()` directly. This happens in the repo (Part 4.4: 0 of 32 path-param routes validate `param`, 3 raw header or text reads). Needs for T8: a layering guard (every `c.req.param|query|json|header|text` call requires a matching `zV` target, or ban those calls in route files), and a shared `idParam` schema to avoid 32 ad hoc ones. No change to the validator itself is required.

### 3.5 `packages/email` and `packages/emails`

- `packages/email` is both port and implementation in one package: ports `src/email.port.ts` (`IEmailService`, L40) and `src/email-queue.port.ts` (`IEmailQueue`, L49); implementations `src/email.service.ts` (`QueuedEmailService`), `src/drizzle-email-queue.ts`, `src/email-delivery-worker.ts`, `src/email-timing.ts`. Exports (`packages/email/package.json:6-13`): `./email.port`, `./email-queue.port`, `./email.service`, `./drizzle-email-queue`, `./email-delivery-worker`, `./email-timing`. Tests under `src/__TESTS__/`.
- `packages/emails` holds React Email templates (`src/templates.ts`, `src/render.tsx`, `src/components/`, `src/__tests__/render.test.ts`) and pure data. It uses `__tests__` while `packages/email` uses `__TESTS__` (inconsistent already).
- Module use: modules take `IEmailService` through `<Name>Prerequisites` (`modules/CLAUDE.md:62`). For T5/T11 the module-local adapter is the host binding; there is no module-owned email adapter. Change before migration: none required; optionally document that `packages/email` is a kit adapter with the port at its edge.

### 3.6 Summary: what to add or change in the kit before modules migrate

| Item | Package | Reason |
|---|---|---|
| Use case convention or `IUseCase` | ddd-kit | T4, T6, T7 |
| Application event type and emit helper | ddd-kit, outbox | T9; positional `emitEvent` is awkward and aggregate-flavoured |
| Per module event registration or explicit decision to keep central | events, outbox | T9, 3.2 |
| `dispatchTo(useCase)` helper for `onEvent` | ddd-kit | T10 |
| Mapper convention | ddd-kit (doc only, or tiny interface) | T12 |
| Route-input guard (every `c.req.*` read requires `zV`) and `idParam` schema | test (source-scan), http | T8 |
| New structural guards (T2, T3, T4, T1) | test (source-scan), dependency-cruiser | Part 2 |
| `isRouteFile` path-based | test | `.routes.ts` suffix disappears in T5 |
| `domain` -> only `domain`, `application` -> not `infra` rules | dependency-cruiser | T13 |

---

## Part 4. Counts across `modules/*/src`

Commands: `bash <scratch>/counts.sh` (service, use case, domain file counts; ignore its "CLAUDE.md" pseudo-module row), `node .../scratchpad/routes.mjs` (route registrations, regex `\.(get|post|put|patch|delete)\(\s*["'`]/` over `*/src/**/infrastructure/http/*.ts`, `__TESTS__` and `node_modules` excluded), `bash .../scratchpad/ev.sh` (events). Raw route table: `<scratch>/routes.txt` (82 lines, one per registration, with `file|line|METHOD|path|zV targets|raw req reads|casts`).

### 4.1 Services, use cases, domain files

| Module | `*.service.ts` in `application/services` | `*.service.ts` in `infrastructure/services` | other `*.service.ts` | files in `application/services` (all) | files in `infrastructure/services` (all) | files in `use-cases`/`usecases` | `*.aggregate.ts` | `*.vo.ts` | `*.entity.ts` | `*.event.ts` | `*-id.ts` | `*.test.ts` |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| admin | 12 | 0 | 0 | 16 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 23 |
| api-token | 2 | 0 | 0 | 2 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 9 |
| audit-log | 1 | 0 | 1 (`infrastructure/repositories/drizzle-audit.service.ts`) | 1 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 5 |
| billing | 3 | 0 | 0 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 9 |
| consents | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3 |
| notifications | 0 | 0 | 0 | 2 | 3 | 0 | 0 | 0 | 0 | 0 | 0 | 7 |
| policies | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3 |
| profile | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 2 |
| quotas | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 5 |
| rgpd | 1 | 0 | 0 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 3 |
| uploads | 1 | 2 | 0 | 1 | 2 | 0 | 0 | 0 | 0 | 0 | 0 | 4 |
| webhooks | 1 | 1 | 0 | 1 | 4 | 0 | 0 | 0 | 0 | 0 | 0 | 11 |
| total | 23 | 3 | 1 | 28 | 12 | 0 | 0 | 0 | 0 | 0 | 0 | 84 |

Note: in `admin`, 16 files sit in `application/services` but 12 carry the `.service.ts` suffix (the others are e.g. `staff-access.ts`), so the suffix undercounts. Only 3 domain files exist in all modules (`modules/api-token/src/domain/api-token-crypto.ts`, `modules/billing/src/domain/entitlements.ts`, `modules/quotas/src/domain/quota-remaining.ts`), all pure functions or config, no aggregate, entity, VO, id or event class. `.module.ts` count 12 (one per module, at `src/<name>.module.ts`). Test files are all `*.test.ts` under `__TESTS__/`; no other file lives there (0 helpers).

### 4.2 Folder file counts per module (non-test `.ts` in `src`)

| Module | total non-test | `application/dto` | `application/ports` | `application/services` | `application/event-handlers` | `application/config` | `infrastructure/repositories` | `infrastructure/services` | `infrastructure/http` | other |
|---|---|---|---|---|---|---|---|---|---|---|
| admin | 72 | 13 | 16 | 16 | 2 | 1 | 10 | 0 | 11 | `application/approved-action.ts`, `testing/` 1 |
| api-token | 13 | 1 | 2 | 2 | 1 | 1 | 1 | 1 | 2 | `domain` 1 |
| audit-log | 10 | 1 | 2 | 1 | 0 | 1 | 1 | 2 | 1 | |
| billing | 25 | 0 | 7 | 3 | 0 | 1 | 4 | 0 | 1 | `infrastructure/adapters` 5, `infrastructure/stripe-client.ts`, `application/subscription-events.ts`, `domain` 1 |
| consents | 7 | 1 | 1 | 1 | 0 | 1 | 1 | 0 | 1 | |
| notifications | 14 | 1 | 3 | 2 | 0 | 1 | 2 | 3 | 1 | |
| policies | 6 | 1 | 1 | 1 | 0 | 0 | 1 | 0 | 1 | |
| profile | 5 | 1 | 1 | 0 | 0 | 0 | 1 | 0 | 1 | |
| quotas | 6 | 0 | 1 | 0 | 0 | 1 | 1 | 0 | 0 | `infrastructure/quota-reservation.ts`, `domain` 1 |
| rgpd | 16 | 2 | 8 | 1 | 0 | 1 | 1 | 0 | 2 | |
| uploads | 14 | 5 | 2 | 1 | 0 | 1 | 0 | 2 | 1 | `infrastructure/storage-health-probe.ts` |
| webhooks | 20 | 4 | 4 | 1 | 0 | 1 | 2 | 4 | 1 | `infrastructure/crypto` 2 |

Repository files carry `*.repository.ts` or `*.store.ts` suffixes (T5 `repos/`).

### 4.3 Route registrations

Total 82 registrations in 20 routes files (`infrastructure/http/*.routes.ts`; `profile` has one `.put(` chained on `new Hono()`).

| Module | routes | with at least one `zV` | without any `zV` | with a path param (`:`) | path-param routes that validate `param` via `zV` | raw `c.req.param/header/text` reads |
|---|---|---|---|---|---|---|
| admin | 40 | 17 | 23 | 24 (from raw list) | 0 | 24 |
| api-token | 4 | 1 | 3 | 1 | 0 | 2 |
| audit-log | 2 | 1 | 1 | 0 | 0 | 0 |
| billing | 3 | 0 | 3 | 0 | 0 | 1 (`header`) |
| consents | 3 | 1 | 2 | 0 | 0 | 1 (`header`) |
| notifications | 9 | 4 | 5 | 0 | 0 | 0 |
| policies | 2 | 1 | 1 | 0 | 0 | 0 |
| profile | 1 | 1 | 0 | 0 | 0 | 0 |
| rgpd | 5 | 2 | 3 | 0 | 0 | 0 |
| uploads | 4 | 4 | 0 | 0 | 0 | 0 |
| webhooks | 9 | 3 | 6 | 7 | 0 | 7 |
| total | 82 | 35 | 47 | 32 | 0 | 35 |

`zV` target usage: `json` 29, `query` 6, `param` 0, `header` 0, `form` 0. Out of 47 routes without any `zV`: 24 have no path param and no raw read (plain GET lists, POSTs with no body), 32 total have a path param and read it through `c.req.param(...)` unvalidated (the `Id` is a string, with 0 `as` casts on `c.req.*` per the cast regex). Raw header or text reads (no validation): `modules/api-token/src/infrastructure/http/scanning.routes.ts:18` (`text`, `header` twice, signature check done by hand), `modules/billing/src/infrastructure/http/billing.routes.ts:29` (`header`), `modules/consents/src/infrastructure/http/consents.routes.ts:28` (`header`). Not checked: whether a `c.req.json()` is read through `c.req.valid("json")` in every route with `zV("json")` (assumed, 0 `c.req.json(` calls found).

Routes whose handler calls a store or opens a transaction directly (T7 violations): `modules/notifications/src/infrastructure/http/notifications.routes.ts` (8 direct `deps.INotificationStore.*` calls at L48, 67, 83, 121, 145, 161, 202, 222; `ITransactionService.run` at L81, 119, 159; `emitEvent` at L99, 127, 172, 233) and `modules/profile/src/infrastructure/http/profile.routes.ts` (`IProfileStore.findLocale` L33, `setLocale` L36, `ITransactionService.run`, `emitEvent` L39). `modules/audit-log/src/infrastructure/http/audit-log.routes.ts:32` emits an event from the route after `AuditQueryService.listForPlatform`. `modules/rgpd/src/infrastructure/http/rgpd-internal.routes.ts:19,42` passes `ISweepRunStore` to the sweep runner. All other routes call `*Service` objects (admin 8 services files with 3 to 28 service references each).

### 4.4 Event handlers (`onEvent(`) in modules

3 handlers, 2 modules: `modules/api-token/src/application/event-handlers/revoke-on-membership-lost.ts:22`, `modules/admin/src/application/event-handlers/close-approvals-of-deleted-user.ts:12`, `modules/admin/src/application/event-handlers/notify-impersonated-user.ts:28`. Built-in subscribers (`BuiltInEventHandler`, not `onEvent`): audit-log, webhooks fan-out, notifications fan-out, all in `infrastructure/services/` (`modules/audit-log/src/infrastructure/services/audit-event-subscriber.ts`, `modules/webhooks/src/infrastructure/services/webhook-fanout-subscriber.ts`, `modules/notifications/src/infrastructure/services/notification-fanout-subscriber.ts`).

### 4.5 `emitEvent(` call sites (production code, tests excluded)

| Module | `application/` | `infrastructure/` | total |
|---|---|---|---|
| admin | 23 | 0 | 23 |
| api-token | 4 | 0 | 4 |
| audit-log | 0 | 1 (route L32) | 1 |
| billing | 0 | 0 | 0 |
| consents | 2 | 0 | 2 |
| notifications | 0 | 4 (routes L99,127,172,233) | 4 |
| policies | 1 | 0 | 1 |
| profile | 0 | 1 (route L39) | 1 |
| quotas | 0 | 0 | 0 |
| rgpd | 9 | 0 | 9 |
| uploads | 3 | 0 | 3 |
| webhooks | 6 | 2 (worker `webhook-delivery-worker.service.ts:490,529`) | 8 |
| total | 48 | 8 | 56 |

`emitEvent` in the host `apps/api/src`: 13 call sites (auth 2, organization 2, public-api 1, shared 8); the BetterAuth bridge goes through helpers in `apps/api/src/auth/emit.ts` and is not counted here. `addEvent(` and `extends Aggregate|Entity|ValueObject|BaseDomainEvent|UUID` in `modules/`: 0. Domain events are therefore 0, every event is an application-level `emitEvent`.

### 4.6 `@packages/ddd-kit` usage by module files (production)

`Result` 105 files, `Option` 83, `AppErrorException` 23, `IUnitOfWork` 33, `onEvent` 3; `Aggregate`, `Entity`, `ValueObject`, `BaseDomainEvent`, `UUID`, `WatchedList`, `ScopedRepository`, `BaseRepository`, `RepoScope` 0 files each.

### 4.7 Not verified

- Per-method counts of each service (point 4 of the per-module report) are not part of this audit.
- Whether `application/` files import `@packages/outbox/*` helpers or concrete SDKs is allowed today by `modules/CLAUDE.md:57`; not counted here.
- Routes in `apps/api` (`public-api`, `organization`, `health`, sweeps) are out of scope of the module counts.
