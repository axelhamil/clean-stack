# CLAUDE.md

Generic monorepo boilerplate. Clean Architecture + DDD. No business features.

> **Detailed rules live in sub-CLAUDE.md files — auto-loaded by Claude Code via recursive lookup the moment you read/edit a file under the path.**
> - `apps/api/CLAUDE.md` → high-level server (CQRS, DI inwire, Hono RPC, BetterAuth server, storage, org scoping, logging). Read before touching `packages/{ddd-kit,drizzle,access-control}/**` too.
>   - `apps/api/src/modules/CLAUDE.md` → per-module: layers, DDD primitives, domain events, testing, code patterns
>   - `apps/api/src/shared/CLAUDE.md` → shared kernel: port placement decisor, transaction.ts exception
> - `apps/app/CLAUDE.md` → high-level client (layout, import direction, naming, theme). Read before touching `packages/{ui,access-control}/**` too.
>   - `apps/app/src/features/CLAUDE.md` → per-feature: anatomy, routing 2-file pattern, queries/mutations, composition patterns, form/schema contracts
>   - `apps/app/src/shared/CLAUDE.md` → shared front: api-client, auth-client, route gates, authorization, org-scoping front
>
> **For conceptual / cross-cutting questions** ("how should I structure a new module?", "where does this rule live?"), read the relevant sub-CLAUDE.md before answering — that's where the rules are.

## Philosophy

Lean Startup — **Build → Measure → Learn**. Stack ships SaaS plumbing (auth, billing, multi-tenant, email, storage) and isolates the domain so pivots don't trash the foundation. "Done > perfect" applies to features; the rules in the sub-CLAUDE.md are non-negotiable — what *makes* shipping fast sustainable.

## Working method

Library API/config/SOTA unclear → **check docs first**. Outdated patterns are a frequent failure mode. Primary: Context7 MCP via `explore-docs`. Fallback: `websearch`/`WebFetch`.

## Stack

- **Runtime**: Bun 1.3+ (api+scripts), Node 24.15+ (tooling) · **API**: Hono on native `Bun.serve()` — `bun build` (prod), `bun --hot` (dev)
- **App**: Vite 8 + React 19 + TanStack Router/Query + Tailwind 4 · **UI**: shadcn/ui (`@packages/ui`) + `sonner` + `next-themes`
- **DB**: Drizzle + Postgres 17 (Docker, port `5433`) · **DI**: `inwire` (type-inference container)
- **Auth**: BetterAuth (Drizzle adapter + `twoFactor`, `passkey`, `magicLink`, `bearer`) — module-level singleton, never wrapped in DI
- **Observability**: `pino` + `hono-pino` · **Contract**: Hono RPC (`hc<AppType>`)
- **Primitives**: `@packages/ddd-kit` (`Result`, `Option`, `Entity`, `Aggregate`, `ValueObject`, `UUID`, `DomainEvent`, `BaseRepository`, `ScopedRepository`, `IUnitOfWork`)
- **Tooling**: pnpm 10 + Turborepo + Biome + Husky + commitlint + semantic-release + knip + jscpd · **Testing**: `bun test` (api) + `vitest` (packages, app)

## Cross-cutting rules (always apply)

1. **Adding a rule — omnipotent or it doesn't belong.** A rule states a *principle* tied to an architectural property and survives swapping any library/version/path it references. Phrase library-agnostic; only name a tool when it *is* the property (Zod = "validate at boundary"). Always include the **why**. Promote on 2nd occurrence. Rewrite or delete a rule the moment its property changes.
2. **Reusability-first — promote, don't duplicate.** 2nd occurrence is the trigger. Once promoted, call site has zero cosmetics.
3. **Zero warnings, zero errors before push.** Husky/lint-staged/commitlint/pre-push/CI green (Biome, knip, jscpd, type-check). No `--no-verify`. Intentional warning → `/* biome-ignore <rule>: <why> */`. Contract: green `pnpm ci:check`.
4. **Internal packages ship source, not build artifacts.** Private workspace packages (consumed only in-monorepo) point `exports` directly at `src/`; no `main`/`types` pointing to emitted output, no `build` script, no generated `dist/`. **Why**: file-watchers in dev (container sync, IDE, native watchers) almost always exclude generated directories to avoid host↔runtime collision — a build step at startup then makes every source change produce a stale artifact until manual rebuild. Source types are also more accurate than emitted `.d.ts`, and modern bundlers inline workspace deps from source at app build time. **Exception**: a package explicitly designed for npm publishing keeps its build pipeline, but its top-level `main`/`types`/`exports` still point at `src/` — the rewrite to `dist/` happens only at publish time via `publishConfig.{main,types,exports}` (pnpm/npm swap these in during `pnpm publish`). **Why**: pointing top-level fields at `dist/` re-creates the stale-artifact trap for every monorepo consumer (fresh clone has no `dist/` → `Cannot find module` until someone runs `pnpm build`). The moment the answer to "is this published?" is no, the build (and the `publishConfig` block) goes.
5. **ORM-first ; raw SQL only when the ORM has no equivalent.** All data access through the typed query builder (`select`/`insert`/`update`/`delete` + helpers like `arrayContains`, `isNull`, `inArray`, `.for("update", { skipLocked: true })`). Reach for `sql\`...\`` template tags only for what the ORM doesn't model: DDL (`CREATE TRIGGER`, `CREATE FUNCTION`), session-scoped runtime tuning (`SET LOCAL idle_in_transaction_session_timeout`), or PostgreSQL operators with no helper (rare — check the ORM exports first). **Why**: the typed builder catches column rename/type drift at compile time; raw SQL silently rots until a runtime exception in prod. **Test before reaching for `sql\`\``**: search the ORM's exports for the operator name (`arrayContains`, `lateral`, `with`, …) — if it's there, use it. If not, the raw fragment is acceptable but should keep its column references typed (`${table.col}`) so a rename still breaks the build.
6. **Every state change emits a domain event ; if it's worth doing, it's worth observing.** Any action that mutates persistent state (aggregate transition, lifecycle hook, service-level write, lib-callback like BetterAuth/Stripe webhook) declares a typed event in `@packages/events` (1 line in `event-types.ts` + Zod payload + retention) and emits it — via `aggregate.addEvent()` inside `uow.run()` for domain code, or `emitEvent(outbox, ...)` for service/lib-bridge code that lives outside an aggregate. **Why**: the rail (audit_log + webhooks + future analytics/notification handlers) is opt-out, not opt-in — every silent mutation is a compliance gap (no audit trail), an integration gap (consumers can't subscribe), and a debugging gap (no event timeline). The cost of adding the event is ~5 lines; the cost of retrofitting one across N call sites later is hours. **Test before merging a state change**: trace the action to a `addEvent(...)` or `emitEvent(...)` call within the same TX. If you can't find one, you forgot. **Two recurring traps**: (a) declaring an event in the catalog without an emit site (orphan — caught by an `outbox_event WHERE event_type = '<X>'` query returning zero in the QA pass); (b) wiring only one of multiple lib lifecycles that produce the same state (e.g. BetterAuth's `afterAddMember` AND `afterAcceptInvitation` both produce a member; missing one drops every flow that uses the missed path). **Exception — infra retention sweeps**: `DELETE … WHERE created_at < cutoff` on derived pipeline tables (`outbox_event`, `audit_log`, `webhook_delivery`) is not a state change — the business event was already emitted at write time, and the sweep deletes its own audit row. No domain event required for the purge itself.
7. **Every event payload identifies its actor ; an audit row with `actorType="system"` must be the real exception, not a default.** Every payload of a state-change event carries the user who triggered it under a recognized key, in this priority order (matches `AuditEventSubscriber.extractActor`): `actorUserId` (canonical, REQUIRED when the actor differs from the subject) → `inviterUserId` → `ownerUserId` → `userId` (only when subject == actor: self-actor flows like sign-in, self-deletion, MFA toggle). **Why**: RGPD compliance hinges on "who did what to whom"; if the audit_log row has `actor_id=null, actor_type=system`, the trace is broken and the audit has zero forensic value. Same-payload `userId` is the *subject* (the row whose state changed) — when the actor is someone else (admin kicks member, owner changes role, system cron sweeps), `actorUserId` is mandatory and distinct from `userId`. **Test before merging an event payload**: for every event, ask "is the subject the actor?". If no → `actorUserId` must be a separate, NOT NULL field. If genuinely system-triggered (cron, cascade, webhook bridge with no upstream user), `actorUserId` can be nullable but the nullability must be explicit in the Zod schema, not implicit. **Two recurring traps**: (a) reusing `userId` as actor when the row is a *target* (e.g. `ORG_MEMBER_REMOVED { userId }` — `userId` here is the kicked member, not the admin who kicked); (b) forgetting to propagate the actor from the HTTP boundary down to the service — when the service is called from a route, `c.get("user").id` must be threaded through as an explicit `actorUserId` argument, never inferred later from session ALS.

## Turborepo

`ui: "tui"`; daemon auto-managed since v2.x. `globalDependencies` (`biome.json`, `pnpm-workspace.yaml`, `.env*`) bust every cache. `inputs` scoped per task — README/doc edits don't invalidate code caches. `build` declares `with: ["type-check"]` (parallel for free). `dev`, `test:watch`, `db:studio` are `interruptible: true`.

## Scripts & DB

`pnpm bootstrap` (copies `.env.example`→`.env` in each workspace, idempotent — `scripts/bootstrap.sh`). `pnpm dev` (Turbo TUI, `--filter=api` to scope) · `dev:docker` (compose up --watch — fully containerized hot reload) · `build` · `test` · `type-check` · `check` (Biome) · `fix` · `ci:check` · `check:duplication` (jscpd) · `check:unused` (knip) · `db:push`/`generate`/`migrate`/`seed`/`studio` · `clean`. Postgres on `localhost:5433` via `docker compose up postgres -d` for native dev — full stack via `docker compose up --watch` for containerized dev (api+app+postgres). `docker compose up -d` without args spins up postgres+api+app and will collide with `pnpm dev` on ports 3000/5173. Don't pin Postgres back to 5432 — collides with system Postgres. Storage opt-in via `docker compose --profile storage up seaweedfs seaweedfs-init -d` (SeaweedFS, host port pinned to `8333`). After schema change: `pnpm db:push` (dev — `drizzle-kit push --force` for non-TTY safety under Turbo) or `db:generate && db:migrate` (prod-style). API runs on Bun natively — don't reintroduce `@hono/node-server`/`tsx`/`tsc-alias`.

## Release flow

Two-branch model. **`main` = released; `dev` = integration.** Every merge to `main` triggers semantic-release.

- **Conventional Commits required** (commitlint enforces lower-case subject). Release impact (`.releaserc.json`): `feat`→minor; `fix`/`perf`/`refactor`/`revert`/`build` and `docs(readme)`→patch; `docs`/`style`/`test`/`chore`/`ci`→no release; `BREAKING CHANGE:` (or `!`)→major. Pick type for the *release impact you want*, not the file touched.
- Daily work on `dev` (or feature branches PR'd into `dev`). Pushing to `dev` does **not** release.
- Shipping = open PR `dev`→`main`, merge it. semantic-release analyzes commits since last tag → one bundled bump+changelog.
- **`dev`→`main` MUST be a merge commit** (not squash, not rebase) — squash collapses every conventional commit into one, semantic-release would see one entry. GitHub-side allows merge commits only.
- `main` is protected (require PR, no force push, conversation resolution). CI fix during release → on `dev`, re-merge.
- **Don't release on every commit** — wait for a meaningful batch. Don't push directly to `main`.
