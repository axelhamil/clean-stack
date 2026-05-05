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

## Turborepo

`ui: "tui"`; daemon auto-managed since v2.x. `globalDependencies` (`biome.json`, `pnpm-workspace.yaml`, `.env*`) bust every cache. `inputs` scoped per task — README/doc edits don't invalidate code caches. `build` declares `with: ["type-check"]` (parallel for free). `dev`, `test:watch`, `db:studio` are `interruptible: true`.

## Scripts & DB

`pnpm bootstrap` (copies `.env.example`→`.env` in each workspace, idempotent — `scripts/bootstrap.sh`). `pnpm dev` (Turbo TUI, `--filter=api` to scope) · `dev:docker` (compose up --watch — fully containerized hot reload) · `build` · `test` · `type-check` · `check` (Biome) · `fix` · `ci:check` · `check:duplication` (jscpd) · `check:unused` (knip) · `db:push`/`generate`/`migrate`/`seed`/`studio` · `clean`. Postgres on `localhost:5433` via `docker compose up -d` (don't pin back to 5432 — collides with system Postgres). Storage opt-in via `docker compose --profile storage up -d` (SeaweedFS, host port random). After schema change: `pnpm db:push` (dev — `drizzle-kit push --force` for non-TTY safety under Turbo) or `db:generate && db:migrate` (prod-style). API runs on Bun natively — don't reintroduce `@hono/node-server`/`tsx`/`tsc-alias`.

## Release flow

Two-branch model. **`main` = released; `dev` = integration.** Every merge to `main` triggers semantic-release.

- **Conventional Commits required** (commitlint enforces lower-case subject). Release impact (`.releaserc.json`): `feat`→minor; `fix`/`perf`/`refactor`/`revert`/`build` and `docs(readme)`→patch; `docs`/`style`/`test`/`chore`/`ci`→no release; `BREAKING CHANGE:` (or `!`)→major. Pick type for the *release impact you want*, not the file touched.
- Daily work on `dev` (or feature branches PR'd into `dev`). Pushing to `dev` does **not** release.
- Shipping = open PR `dev`→`main`, merge it. semantic-release analyzes commits since last tag → one bundled bump+changelog.
- **`dev`→`main` MUST be a merge commit** (not squash, not rebase) — squash collapses every conventional commit into one, semantic-release would see one entry. GitHub-side allows merge commits only.
- `main` is protected (require PR, no force push, conversation resolution). CI fix during release → on `dev`, re-merge.
- **Don't release on every commit** — wait for a meaningful batch. Don't push directly to `main`.
