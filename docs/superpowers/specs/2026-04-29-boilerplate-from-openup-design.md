# Clean-stack boilerplate from raphael-openup-app

**Date:** 2026-04-29
**Status:** Approved, ready for implementation plan

## Goal

Transform `clean-stack` into a clean, generic monorepo boilerplate by cloning the architectural skeleton of `raphael-openup-app` and stripping all OpenUp-specific business logic, documentation, and product references.

The result is a reusable starter for Clean Architecture + DDD projects — no auth implementation, no domain entities, no use cases, no routes. Only infrastructure, tooling, and patterns.

## Non-goals

- Not migrating any business feature (auth, billing, LLM, links, etc.)
- Not preserving any reference implementation in code form
- Not keeping mobile (Capacitor) support
- Not keeping the marketing web app or the link-router worker

## Scope

### Apps kept

- **`apps/api`** — Hono + Node.js. Infrastructure only: DI container (inwire), middleware (auth, error, rate-limit), generic services (email, storage, geo), port interfaces. **No domain, no use cases, no DTOs, no event handlers, no routes, no mappers, no payment/quota/wallet/deeplink/custom-domain services.**
- **`apps/app`** — Vite + React 19 + TanStack Router. **Bare skeleton only**: `main.tsx` (provider tree), `routes/__root.tsx` (root layout), and empty top-level dirs `features/`, `entities/`, `shared/` each with a short README documenting their intended purpose. **No Capacitor**, no `android/`, no `ios/`, no `capacitor.config.ts`, no Capacitor deps in `package.json`.

### Apps dropped

- `apps/web` (was an empty Next.js shell in source — Framer-hosted externally)
- `apps/link-router` (Cloudflare Worker — too product-specific)

### Packages

| Package | Action |
|---|---|
| `ddd-kit` | Copy as-is (already 100% generic) |
| `test` | Copy as-is |
| `typescript-config` | Copy as-is |
| `ui` | Copy as-is — including `pricing-card`, `feature-card`, `stat-card`, `pricing-table` (will be reused in boilerplate) |
| `drizzle` | Copy, but **empty** `src/schema/`, `src/seeds/`, `migrations/` (neutral starting point) |
| `reserved-slugs` | **Drop** completely |

### Root tooling kept (copied from openup)

- `package.json` — adapted: drop `cap:*` scripts, `dev:app`/`dev:api` filters kept, drop `web`/`link-router` references
- `turbo.json`
- `biome.json`
- `knip.json`
- `.jscpd.json`
- `commitlint.config.mjs`
- `.releaserc.json`
- `.husky/` (commit-msg, pre-commit, pre-push)
- `pnpm-workspace.yaml`
- `docker-compose.yaml` — Postgres only
- `.npmrc`, `.nvmrc`, `.gitignore`, `tsconfig.json`, `LICENSE`

### CI/CD

Keep only:
- `.github/workflows/ci.yml` (type-check, lint, test, build)
- `.github/workflows/release.yml` (semantic-release on main)

Drop: `deploy-link-router.yml`, all `android-*.yml`, all `ios-*.yml`.

### Documentation

- **`README.md`** — rewritten minimal, generic. Describes stack (Hono API + Vite/React app + Drizzle/Postgres + DDD/Clean Arch) and setup (`pnpm install`, `pnpm db`, `pnpm dev`). No OpenUp references.
- **`CLAUDE.md`** — rewritten from openup's version, aligned to new structure (api+app monorepo, Hono, Vite+TanStack, DDD primitives in `ddd-kit`, CQRS, inwire DI). All product-specific references removed (no "link", "qr-code", "billing", "openup", "PRODUCT.md").
- **`CHANGELOG.md`** — **kept from current clean-stack repo** (preserves semantic-release history at `1.1.0`).
- All other docs **dropped**: `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/ISSUE_TEMPLATE/`, `.cursorrules`, `.cursorignore`, `docs/` from openup, internal `apps/*/README.md` and `packages/*/README.md` (replaced with minimal generic ones or dropped), `.claude/PRODUCT.md`.
- All inline comments/docstrings referencing OpenUp product (links, qr-codes, billing Stripe, etc.) stripped.

### `.claude/` directory

**Dropped completely.** Repo will have no commands, agents, skills, hooks, or settings under `.claude/`. To be regenerated on demand.

## Strip detail — `apps/api`

**Keep (boilerplate / infrastructure):**
- `src/index.ts` (entry point — adjusted to remove route imports)
- `src/di/container.ts`
- `src/di/modules/infrastructure.module.ts` (generic infra bindings only)
- `src/adapters/middleware/{auth,error,rate-limit}.middleware.ts`
- `src/adapters/services/auth/better-auth.service.ts` *(BetterAuth adapter — reusable infra; if it imports anything from `domain/user`, replace those imports with stub types)*
- `src/adapters/services/email/resend-email.service.ts`
- `src/adapters/services/storage/s3-storage.service.ts`
- `src/adapters/services/geo/geo.service.ts`
- `src/application/ports/` — keep only generic ports (IAuthProvider, IEmailService, IStorageService, IGeoService, IEventDispatcher). Drop ports tied to dropped domains.
- `common/auth.ts`, `common/env.ts`
- `package.json`, `tsconfig*.json`, `vitest.config.ts`, `.env.example`

**Drop entirely:**
- `src/domain/` (user, billing, link, link-in-bio, project, qr-code, shared)
- `src/application/use-cases/`
- `src/application/dto/`
- `src/application/event-handlers/`
- `src/application/services/` (plan-resolver, quota-checker, feature-resolver, slug-resolver)
- `src/routes/`
- `src/adapters/mappers/`
- `src/adapters/services/{payment,quota,wallet,deeplink,custom-domain}/`
- `src/__TESTS__/`
- `assets/wallet/`
- `.env` (never copy real secrets)
- DI module files for dropped domains (auth.module.ts, billing.module.ts, etc. — keep only infrastructure.module.ts)

**Adjust:**
- `src/index.ts` — remove all route registrations, leave a Hono app with middleware and a `/health` endpoint
- `src/di/container.ts` — keep container scaffolding, remove imports of dropped modules
- `package.json` — remove deps tied to dropped features (Stripe SDK, AI SDK if present, etc.)

## Strip detail — `apps/app`

**Recreate from scratch (do not copy openup files):**

```
apps/app/
├── package.json          # Vite + React 19 + TanStack Router + TanStack Query + Tailwind 4 + i18next + react-hook-form + Zod + Hono RPC client. NO Capacitor.
├── vite.config.ts        # Vite config (no Capacitor plugin)
├── tsconfig.json
├── index.html
├── .env.example
└── src/
    ├── main.tsx          # Provider tree: QueryClient, Router, i18n, theme
    ├── routes/
    │   └── __root.tsx    # Root layout with <Outlet />
    ├── features/
    │   └── README.md     # "Feature folders. One folder per user workflow. May import from entities/ and shared/."
    ├── entities/
    │   └── README.md     # "Cross-feature domain entities. Hooks (React Query) and display components per entity. May import from shared/ only."
    └── shared/
        └── README.md     # "Zero-business infrastructure. Sub-folders: api/, hooks/, format/, i18n/, ui/, utils/. No imports from features/ or entities/."
```

Import direction (documented in CLAUDE.md): `routes → features → entities → shared`. No lateral cross-feature imports.

## Strip detail — `packages/drizzle`

**Keep:**
- `package.json`, `tsconfig.json`, `drizzle.config.ts`, `src/config.ts`
- `src/services/transaction-manager.service.ts` + `.type.ts`
- `src/index.ts` — adjusted to re-export only generic primitives (no schema barrels)

**Empty:**
- `src/schema/` — remove all schema files. Add a placeholder `src/schema/.gitkeep` and a one-line README.
- `src/seeds/` — remove all seeds. `.gitkeep`.
- `migrations/` — remove all `.sql` files and `_journal.json`. `.gitkeep`.

## Procedure

1. **Nuke clean-stack** (preserve `.git/` only). Includes dropping `.claude/`, `src/` at root, `.cache/`, `coverage/`, `firebase-debug.log`, all dotfiles parasites at root, `apps/`, `packages/`, all docs, `README.md`, `CLAUDE.md`. **Preserve `CHANGELOG.md`** by copying it to a temp path before the nuke and restoring after.
2. **Copy tooling from openup root**: `package.json` (adapted), `turbo.json`, `biome.json`, `knip.json`, `.jscpd.json`, `commitlint.config.mjs`, `.releaserc.json`, `.husky/`, `pnpm-workspace.yaml`, `docker-compose.yaml` (postgres only), `.npmrc`, `.nvmrc`, `.gitignore`, `tsconfig.json`, `LICENSE`.
3. **Copy CI workflows**: `.github/workflows/ci.yml`, `.github/workflows/release.yml`.
4. **Copy packages** from openup: `ddd-kit`, `test`, `typescript-config`, `ui`, `drizzle` (then empty schema/seeds/migrations as specified).
5. **Copy `apps/api`** then strip per the detail section above. Adjust `index.ts` and `container.ts`.
6. **Recreate `apps/app`** from scratch (do not copy openup version) per the structure above.
7. **Restore `CHANGELOG.md`** from the temp path.
8. **Write minimal generic `README.md`** (stack + setup).
9. **Rewrite `CLAUDE.md`** from openup's version, strip all product references, align to new structure.
10. **Adapt root `package.json` scripts**: drop `cap:*`, `dev:web`, `link-router`. Bump version to next major (since this is a breaking restructure).
11. **`pnpm install`** to generate fresh `pnpm-lock.yaml`.
12. **Verify**: `pnpm type-check`, `pnpm check`, `pnpm test` should all succeed (or report only "no tests" type messages — expected).
13. **Commit** as a single restructure commit. Do not push without explicit user instruction.

## Risk / open questions

- **`apps/api/src/adapters/services/auth/better-auth.service.ts`** likely imports from `domain/user` (e.g., `User`, `Email` VOs) — these will be deleted. Either: (a) remove this service from kept set, or (b) replace domain imports with local stub types. **Decision deferred to implementation plan.**
- **`apps/api/src/application/ports/`** — some ports may reference domain types (e.g., `IUserRepository` returns `User`). Keep only ports whose signatures use no domain-specific types, OR rewrite the type signatures to be generic. **Decision deferred to implementation plan.**
- **`apps/api/src/di/modules/infrastructure.module.ts`** may reference dropped use cases / handlers. Will need surgical cleanup.

These are surgical decisions best made while editing the files, not pre-decided.

## Definition of done

- `pnpm install` succeeds
- `pnpm type-check` succeeds across all workspaces
- `pnpm check` (Biome) succeeds
- `pnpm test` succeeds (no tests is acceptable)
- No file in the repo contains the strings `openup`, `OpenUp`, `link-in-bio`, `qr-code`, `Stripe` (case-insensitive) outside of `CHANGELOG.md` (historical) and `pnpm-lock.yaml` (transitive deps)
- `git log` shows clean-stack history preserved + one new commit for the restructure
- `apps/app` boots a blank page when running `pnpm dev:app` (verified by user, not automated)
- `apps/api` responds 200 on `GET /health` when running `pnpm dev:api` (verified by user, not automated)
