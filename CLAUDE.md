# CLAUDE.md

Generic monorepo boilerplate. Clean Architecture + DDD. No business features included.

## Philosophy

Lean Startup — **Build → Measure → Learn**. The bottleneck is *Build*, so this stack ships the SaaS plumbing (auth, billing, multi-tenant, email, storage) and isolates the domain so pivots don't trash the foundation. Default move when in doubt: ship the smallest thing that tests one hypothesis, never gold-plate the plumbing. "Done > perfect" applies to features; the architecture rules below stay non-negotiable because they're what *makes* shipping fast sustainable.

## Working method

**Whenever something is unclear about a library API, version, config option, deprecation, or "is this still SOTA" — check the docs before guessing.**

1. **Primary**: Context7 MCP via the `explore-docs` agent. It pulls current, version-pinned docs for any library (Hono, TanStack Router/Query, Drizzle, Zod, shadcn, sonner, next-themes, react-hook-form, Vite, Bun, etc.). Use it for any "how do I configure X" / "what's the canonical pattern in 2026" question.
2. **Fallback**: web search (via the `websearch` agent or `WebFetch`) when Context7 doesn't have the lib indexed or the question is broader (architecture posts, RFCs, GitHub discussions).
3. **Never** invent API surface from memory when the answer can be looked up in <30s. Outdated patterns (deprecated hooks, removed flags, old idioms) are a frequent failure mode — verify before writing.

Trigger this any time you're about to write code touching a third-party API and you're not 100% sure of the current shape.

## Stack

- **Runtime**: Bun 1.3+ (api + scripts), Node 24.15+ for tooling
- **API**: Hono on native `Bun.serve()` — `bun build` (prod, ~7ms), `bun --hot` (dev)
- **App**: Vite 8 + React 19 + TanStack Router + TanStack Query + Tailwind 4 (`@tailwindcss/vite`)
- **UI kit**: shadcn/ui (`@packages/ui`) + `sonner` (toasts) + `next-themes` (light/dark/system)
- **DB**: Drizzle ORM + Postgres 17 (Docker, port `5433` to avoid collisions with other local Postgres)
- **DI**: `inwire`
- **API ↔ App contract**: Hono RPC (`hc<AppType>`) — type-safe routes end-to-end
- **Primitives**: `@packages/ddd-kit` (`Result<T,E>`, `Option<T>`, `Entity`, `Aggregate`, `ValueObject`, `UUID`, `DomainEvent`, `BaseRepository`, `UseCase`)
- **Packages tooling**: `tsup` (esbuild) for `ddd-kit` + `drizzle` build
- **Repo tooling**: pnpm 10 + Turborepo (TUI + fine-grained inputs + `with`) + Biome + Husky + commitlint + semantic-release + knip + jscpd
- **Testing**: `bun test` (api) + `vitest` (packages, app)

## Layout

```
apps/
  api/
    src/
      domain/                  Aggregates, Entities, Value Objects, Domain Events
      application/
        ports/                 Interfaces (repositories, services)
        use-cases/             One file per use case
        dto/                   Zod schemas
        event-handlers/        Side effects on domain events
      adapters/
        middleware/            Hono middleware (auth, error, rate-limit)
        services/              External service implementations
        repositories/          Drizzle repositories
        mappers/               Domain <-> DB
      routes/                  Hono route registration
      di/
        container.ts           inwire container
        modules/               One module per bounded context
    common/env.ts              Validated env (zod)
  app/
    src/
      main.tsx                 createRoot + <AppProviders />
      routes/                  TanStack Router file-based routes (entry point)
      features/                One folder per user workflow (≈ application/)
        <feature>/
          page.tsx             Next-style: feature entry component
          layout.tsx           (optional) feature-level layout
          loading.tsx          (optional) pendingComponent for the route
          error.tsx            (optional) errorComponent for the route
          _components/         private colocated components (Next "_" convention)
          _forms/              private isolated forms (RHF + zodResolver)
          _hooks/              private feature-local React hooks
          _schemas/            private zod schemas
      adapters/                api-client, query-client, storage (≈ adapters/)
      providers/               Provider tree composition (≈ di/)
      common/                  Zero-business infra (env.ts, format.ts, ui/theme-toggle.tsx) — single common/ on the app side, conceptually mirrors apps/api/common/
packages/
  ddd-kit                      DDD primitives
  drizzle                      DB client + TransactionService
  test                         Shared vitest config
  typescript-config            tsconfig presets
  ui                           shadcn/ui components
```

## Architecture rules

1. **Domain has zero external imports** (only `@packages/ddd-kit` + `zod`).
2. **No `throw` in domain or application** — return `Result<T, E>`.
3. **No `null` or `undefined` for absence** — use `Option<T>`.
4. **Value Objects validate via zod** in `protected validate()`.
5. **Transactions managed in controllers** (route handlers), passed to use cases.
6. **All dependencies injected** via inwire DI. No service locators inside use cases.
7. **No barrel `index.ts` files**; import directly from the file.
8. **Self-documenting code** — no inline comments unless the WHY is non-obvious.
9. **Only `get id()` getter on aggregates**. Access other props via `entity.get('propName')`.
10. **Never override visual style at the component level** — only positioning/sizing/layout (`flex`, `grid`, `w-*`, `h-*`, `mx-auto`, `gap-*`, `space-*`, responsive breakpoints) belong in JSX `className`. Colors, typography, radius, shadows, paddings/margins that define a component's *look*, dark/light tokens — all that lives in the **theme** (Tailwind 4 `@theme` in `packages/ui/src/styles/globals.css`) or in the shadcn component itself (`packages/ui/src/components/ui/*`). If a button looks wrong, fix the `Button` variant or the theme token, never patch it inline with `bg-foo text-bar p-3`. Inline overrides = theme drift = no design system.
11. **Always use shadcn/ui first, and stay shadcn-pure** — before writing any custom UI primitive, check the [shadcn/ui registry](https://ui.shadcn.com/docs/components) and `@packages/ui/components/ui/*`. If shadcn ships it (`Button`, `Card`, `Tabs`, `Sheet`, `Dialog`, `Form`, `Tooltip`, `DropdownMenu`, `Sonner`, `Typography`, …), use it. **Use the actual slots** — `<Card>` with a title means `CardHeader` + `CardTitle`, not a `<TypographyP className="font-medium">` shoved inside `CardContent`. Reaching for the wrong slot leads to manual padding/spacing hacks (`pt-6`, `space-y-4`) that fight the primitive instead of using it. **No custom outside the theme** for any shadcn primitive: no wrapper variants, no CSS overrides targeting `data-slot="*"`, no inline styling that re-shapes how the primitive renders. The only adjustments live in the theme (`packages/ui/src/styles/globals.css` — design tokens, `@theme` block, shared utilities like `.hover-lift`) or in the primitive file itself (`packages/ui/src/components/ui/<name>.tsx`). Custom is a **last resort** — only when no shadcn equivalent exists, or when the official primitive truly cannot be adapted. When you do go custom, put it in `@packages/ui/components/ui/*` so the rest of the app can reuse it, never inline in a feature.
12. **Respect HTML semantics — exactly one `<main>` per rendered page**. `routes/__root.tsx` is a **passthrough** (`component: Outlet`) — never wraps `<Outlet />` in `<main>`, `<header>`, `<footer>` or any other landmark. Each `<feature>/page.tsx` owns its own document landmarks (`<header>`, `<main>`, `<footer>`, `<nav>`, `<aside>`) so the page is self-contained and you never end up with nested or duplicated landmarks. Same rule for `<h1>` (one per page) — use `TypographyH1` in the page hero, `TypographyH2` for sections, etc.
13. **Zero warnings, zero errors before push**. If any hook (Husky pre-commit, lint-staged, commit-msg, pre-push, CI) emits a warning or error — Biome `noImportantStyles`, knip unused, jscpd duplication, type-check, commitlint — **fix it before pushing**. Do not bypass with `--no-verify`. If the warning is genuinely intentional (e.g. `!important` for an a11y override that must beat inline styles), silence it with a targeted ignore comment that explains *why* (`/* biome-ignore <rule>: <reason> */`) — never globally disable the rule. The pipeline must stay clean: a green `pnpm ci:check` is the contract.
14. **Reusability-first — promote, don't duplicate**. The moment a behavior (animation, micro-interaction, hover effect, focus style, layout pattern, transition, conditional class set) appears for the **second time** at the call site, stop and promote it. Two destinations:
    - **Theme-level** (`packages/ui/src/styles/globals.css`) for keyframes, CSS utilities (`.hover-lift`, `.live-dot`, `.animate-fade-up`, `.hover-arrow`), and behavior primitives that aren't tied to a specific component.
    - **Primitive-level** (`packages/ui/src/components/ui/<primitive>.tsx`) when the behavior is intrinsic to a component — inject the utility into the base `cn()` of `Card`, `Button`, etc. so every consumer gets it for free.

    Once promoted, the call site contains **nothing** cosmetic — only layout/positioning per rule 10. Why this matters: each agent or contributor that comes after sees a duplicated pattern as license to duplicate it again. Three duplications in three features become twelve in twelve, and the design system silently dies. The cost of promoting early is one file edit; the cost of *not* promoting is exponential drift across generations of edits. Same logic applies to logic, not just style: if `mutationFn: (input) => api.x.$post({ json: input })` shows up twice, extract a typed helper. Three similar lines is a smell; the **second** occurrence is the trigger to refactor.

## CQRS

- **Commands** (writes): Controller → Use Case → Aggregate → Repository → EventDispatcher → Handlers
- **Queries** (reads): Controller → Query (direct ORM access, no use case layer)

## Hono RPC (end-to-end type safety)

The api exports its routes as a type (`AppType`) consumed by the app via `hono/client`.

**API side** (`apps/api/src/index.ts`):

```typescript
const routes = app
  .get("/health", (c) => c.json({ status: "ok" as const }))
  .post(
    "/widgets",
    zValidator("json", z.object({ name: z.string() })),
    (c) => c.json({ ok: true as const, name: c.req.valid("json").name }),
  );

export type AppType = typeof routes;
```

Routes **must be chained** to accumulate types. Middlewares (`app.use`) and `app.onError` are called separately — they don't add to the typed schema.

**App side** (`apps/app/src/adapters/api-client.ts`):

```typescript
import type { AppType } from "api";
import { hc } from "hono/client";

export const api = hc<AppType>(env.VITE_API_URL, {
  init: { credentials: "include" },
});
```

The `api` workspace dep is wired via `apps/api/package.json` `exports: { ".": "./src/index.ts" }`. App consumes `AppType` only — runtime is never bundled (type-only import).

**Feature usage** (TanStack Query + RPC):

```typescript
return useMutation({
  mutationFn: async (input) => {
    const res = await api.widgets.$post({ json: input });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
});
```

Path segments mirror the URL: `/widgets` → `api.widgets`. Method: `$post`/`$get`/etc.

## App import direction

`routes/` → `features/` → `adapters/` → `common/`.

`providers/` is bootstrap-only (imported by `main.tsx`).
No lateral cross-feature imports. No barrels.

| Folder | May import from | Must NOT import from |
|---|---|---|
| `routes/` | `features/`, `common/` | other features cross-link |
| `features/<x>/` | `adapters/`, `common/`, `@packages/*` | other `features/`, `routes/`, `providers/` |
| `adapters/` | `common/` | `features/`, `routes/`, `providers/` |
| `providers/` | `adapters/`, `common/`, `routeTree.gen.ts` | `features/` |
| `common/` | (nothing internal) | everything else |

## App feature anatomy

Symmetry with `apps/api`: `features/` ≈ `application/`, `adapters/` ≈ `adapters/`, `providers/` ≈ `di/`, `common/` ≈ `common/`. There is intentionally **no `domain/` on the front** — a UI domain is never pure (React deps, hooks), so we don't fake it.

Naming follows **Next.js App Router conventions** (April 2026) wherever possible — `page.tsx` for entry, `_components/` / `_forms/` / `_hooks/` / `_schemas/` for private folders (Next "underscore = excluded from routing" convention, repurposed here as visual marker for colocated private code). Optional: `layout.tsx`, `loading.tsx`, `error.tsx` map to TanStack route props (`pendingComponent`, `errorComponent`).

Each feature is self-contained. Add sub-folders **only when they earn their place** (YAGNI):

```
features/<name>/
  page.tsx                    feature entry — the route mounts this
  layout.tsx                  (optional) feature-level layout wrapper
  loading.tsx                 (optional) → wired as route's pendingComponent
  error.tsx                   (optional) → wired as route's errorComponent
  _components/
    <section>.tsx             local sub-component, kebab-case
  _forms/
    <action>-form.tsx         isolated form (RHF + zodResolver + shadcn Form)
  _hooks/
    use-<action>.ts           one mutation/query hook per action
  _schemas/
    <thing>.schema.ts         zod schema + inferred type
```

**File naming rules (Next-flavored):**

- Components/files: `kebab-case.tsx`. Component exports use `PascalCase` named exports (`export function <Feature>Page`).
- Hooks: `use-<verb>-<noun>.ts`, exporting `useVerbNoun`.
- Schemas: `<noun>.schema.ts`, exporting `<noun>Schema` and `<Noun>Input` (inferred type).
- Page entry: `page.tsx` (Next convention) — the route file simply imports the page component and wires it as `component`.

**Rules:**

1. The page lives in `<feature>/page.tsx`. The route file (`routes/<x>.tsx`) does nothing but wire `Route → component: <FeaturePage>`.
2. Components live in `_components/` (flat). Add `_components/<group>/` only when one group has 5+ files.
3. Hooks **never** call `fetch` directly — they go through `adapters/api-client.ts` (Hono RPC).
4. Schemas are zod, with `z.infer` exporting the inferred type next to the schema.
5. Cross-feature reuse is **not pre-solved**. When two features need the same `UserCard`, decide then: extract to `packages/ui` if purely presentational, or promote one feature to own it.
6. **Forms live in `_forms/<action>-form.tsx`**, isolated from the section that hosts them. The hosting section (a `Card`, `Sheet`, `Dialog`…) only does the layout/composition; the form owns RHF state, `zodResolver`, validation messages, submit. This keeps pages composable and forms reusable across hosts.

**Form contract:**

- Use `react-hook-form` + `zodResolver` from `@hookform/resolvers/zod` + the shadcn `Form` primitives (`Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage`).
- Always pass `defaultValues` to `useForm` (no flash of uncontrolled state).
- Submit goes through `form.handleSubmit((values) => mutation.mutate(values))` — never wrap in a manual `(e) => …` handler. The deprecated React `FormEvent` type stays out.
- The form imports its hook (`../_hooks/use-<action>`) and schema (`../_schemas/<thing>.schema`). It never calls `fetch` directly.

**Typography contract:**

- Headings and paragraphs go through the shadcn typography exports in `@packages/ui/components/ui/typography`: `TypographyH1`, `TypographyH2`, `TypographyH3`, `TypographyH4`, `TypographyP`, `TypographyLead`, `TypographyLarge`, `TypographyMuted`, `TypographySmall`, `TypographyBlockquote`, `TypographyInlineCode`, `TypographyList`. **Named exports**, not a namespace (consistent with `CardHeader`, `FormItem`, etc.).
- Never write raw `<h1 className="text-5xl font-bold ...">` or `<p className="text-muted-foreground text-sm">` in features. Custom typography belongs **in the theme or in the Typography component itself**, not inline at the call site (matches rule 10).
- `className` overrides are reserved for **layout** (e.g. `border-0 pb-0` to drop the H2 separator on a centered section title, or `mx-auto max-w-2xl text-balance` on a Lead). Never override colors / weights / fonts there.

**Theme & dark mode:**

- `next-themes` provider lives in `providers/app-providers.tsx` (`attribute="class"`, `defaultTheme="system"`, `disableTransitionOnChange`).
- The reusable theme switch is `apps/app/src/common/ui/theme-toggle.tsx` — uses the View Transitions API for a circle-reveal animation from the button center, with `prefers-reduced-motion` fallback.
- The view-transition CSS (`html.theme-transitioning::view-transition-*`) lives in `packages/ui/src/styles/globals.css` (theme-level, not component-level — matches rule 10).

**Where do hooks belong (`features/<x>/_hooks/` vs `adapters/`) ?**

Feature hooks **are the use cases of the UI**, by analogy with `apps/api/src/application/use-cases/`. Even if a hook is currently a thin wrapper over a single RPC call, it owns the *workflow contract* of the feature: input schema, success/error handling, toasts, redirects, optimistic updates, query invalidation. Those concerns are feature-specific and grow over time.

- **Belongs in `features/<x>/_hooks/`** — anything tied to a specific workflow (`useCheckout`, `useUpdateProfile`, `useCreateWidget`). Owns side-effects (toasts, navigation, cache invalidation).
- **Belongs in `adapters/`** — generic infra primitives (`useApiQuery<T>`, `useDebouncedValue`, RPC client itself). No workflow logic.
- **Cross-feature resource hooks** — when 2+ features need the same `useUser` / `useCart`, extract to `adapters/queries/` (or promote to a dedicated feature that owns the resource). Don't pre-emptively place them there.

**Generic feature shape:**

```
features/<name>/
  page.tsx               feature entry — wired by routes/<x>.tsx
  layout.tsx             (optional)
  loading.tsx            (optional) → route's pendingComponent
  error.tsx              (optional) → route's errorComponent
  _components/<x>.tsx    private sections / cards / sub-components
  _forms/<x>-form.tsx    isolated RHF + zodResolver forms
  _hooks/use-<x>.ts      one mutation/query hook per workflow action
  _schemas/<x>.schema.ts zod schema + inferred type
```

A feature ships only the sub-folders it actually needs (YAGNI). The repo ships a placeholder `home` feature as a working example — **delete it on clone**, then build your own features following the patterns below.

**Composition patterns (apply to any feature):**

- **Cards**: use the actual slots — `Card` + `CardHeader` + `CardTitle` (+ optional `CardDescription`) + `CardContent` (+ optional `CardFooter`). The `Card` primitive already provides `py-6` and `gap-6` between slots; never re-add `pt-6` / `space-y-4` at the call site to compensate for skipping a slot.
- **Numbered / iconic markers** (steps, list bullets, status pills): use `Badge` (already `rounded-full`) with `variant="secondary"` and a layout class (`size-6`, `size-8`, `font-mono`). Don't hand-roll `<span className="rounded-full bg-secondary …">`.
- **Styled links / nav items**: a primitive owns the *style*, a router component owns the *navigation*. Compose via `asChild` (Radix `Slot`) — the style primitive forwards its className onto the child:

  ```tsx
  <NavLink asChild>
    <Link to="/dashboard">Dashboard</Link>
  </NavLink>
  ```

  `NavLink` (in `@packages/ui/components/ui/nav-link.tsx`) holds the muted color + hover transition; TanStack `<Link>` holds typed routes, hash, active state, prefetch. Same logic for `<Button asChild><Link …/></Button>` when you want a button-styled call to action that navigates.
- **List bullets**: prefer a lucide icon (`<Dot />`, `<Check />`, `<Minus />`) over a custom rounded `<span>`. Icons live in `lucide-react`; styling stays at the icon level (`size-*`, theme color tokens).

**Rule of thumb**: if a feature contains raw `<a className="text-…">`, `<span className="… rounded-full bg-…">`, or `<div className="… rounded-lg border bg-… px-… py-…">`, it has either skipped a shadcn slot or duplicated a primitive — promote, don't patch (rule 14).

The route is one line of wiring:

```tsx
// routes/<x>.tsx
import { createFileRoute } from "@tanstack/react-router";
import { DashboardPage } from "../features/dashboard/page";

export const Route = createFileRoute("/dashboard")({ component: DashboardPage });
```

## Domain Events

Events are added in aggregate methods (`this.addEvent(...)`), NOT dispatched there. Dispatch happens in use cases AFTER successful persistence:

```typescript
const saveResult = await this.repo.create(aggregate);
if (saveResult.isFailure) return Result.fail(saveResult.getError());
await this.eventDispatcher.dispatchAll(aggregate.domainEvents);
aggregate.clearEvents();
```

## Testing

BDD style. One test file per use case under `__TESTS__/`. Mock at the repository/port level. Test `Result`/`Option` state transitions.

## Common patterns

```typescript
// Result
Result.ok(value);
Result.fail(error);
Result.combine([r1, r2, r3]);

// Option
Option.some(value);
Option.none();
Option.fromNullable(value);

// Aggregate
class Foo extends Aggregate<IFooProps> {
  get id(): FooId { return FooId.create(this._id); }
  static create(props): Foo {
    const e = new Foo({ ...props, createdAt: new Date() }, new UUID());
    e.addEvent(new FooCreatedEvent(e));
    return e;
  }
}

// Value Object
class Email extends ValueObject<string> {
  protected validate(v: string): Result<string> {
    return v.includes("@") ? Result.ok(v) : Result.fail("Invalid email");
  }
}
```

## Turborepo

- `ui: "tui"` set in `turbo.json` — no CLI flags needed (daemon auto-managed since v2.x).
- `globalDependencies`: `biome.json`, `pnpm-workspace.yaml`, `.env*` — modifying any of these busts every cache.
- `inputs` are scoped per task (build/test/type-check) — README/doc edits do NOT invalidate code caches.
- `build` declares `with: ["type-check"]` — `pnpm build` always runs type-check in parallel for free.
- `dev`, `test:watch`, `db:studio` are `interruptible: true` — clean ctrl+C kill on next reload.

## Useful scripts

- `pnpm dev` — Turbo TUI dev (filter via `pnpm dev --filter=api`)
- `pnpm build` / `pnpm test` / `pnpm type-check` — Turbo orchestrated
- `pnpm check` (Biome lint+format check) / `pnpm fix` (auto-fix) / `pnpm ci:check` (CI lint)
- `pnpm check:duplication` (jscpd) / `pnpm check:unused` (knip)
- `pnpm db:push` / `db:generate` / `db:migrate` / `db:seed` / `db:studio`
- `pnpm clean` — wipe `node_modules`, `.turbo`, `dist`

## DB

- `docker compose up -d` from repo root — Postgres on `localhost:5433`
- Schema goes in `packages/drizzle/src/schema/*.ts`
- After adding/modifying schema: `pnpm db:push` (dev) or `pnpm db:generate && pnpm db:migrate` (prod-style migrations)

## Release flow

Two-branch model. **`main` is the released branch — every merge to `main` triggers a semantic-release run.** `dev` is the integration branch where work accumulates between releases.

- **Daily work** happens on `dev` (or feature branches PR'd into `dev`). Pushing to `dev` does **not** trigger a release.
- **Shipping** is a deliberate act: open a PR `dev` → `main`, merge it. `release.yml` runs, semantic-release analyzes **all** commits since the last tag and produces one bundled version bump + changelog covering everything in the batch.
- **Merge strategy `dev` → `main` MUST be a merge commit** (not squash, not rebase-and-merge). Squash collapses every conventional commit (`feat:`, `fix:`, …) into a single message — semantic-release would only see one entry and the changelog would lose its substance. The repo is configured GitHub-side to allow merge commits only; respect it.
- **`main` is protected** (require PR, no force push, conversation resolution required). Never push directly to `main`. If a CI fix is needed during release, do it on `dev` and re-merge.
- **Don't release on every commit.** The whole point of `dev` → `main` is to bundle. If a single commit lands on `main` you get the same "tiny tag" problem the flow was designed to avoid. Wait until there's a meaningful batch (a feature complete, a coherent set of fixes) before merging.
- **`.releaserc.json` and `release.yml` stay as-is** — the cadence is controlled by *when you merge to main*, not by the semantic-release config.

```bash
# work
git checkout dev
git push                       # no release

# release
gh pr create --base main --head dev --title "Release: <theme>"
# merge via "Create a merge commit" on GitHub UI (squash is disabled repo-wide)
# → release.yml runs, one consolidated tag + changelog drops
```

## Don't

- Add business features without first agreeing on the bounded context.
- Throw in domain or application.
- Use `null` for absence.
- Add `index.ts` barrels.
- Add inline comments that restate what the code does.
- Reintroduce `@hono/node-server`, `tsx`, `tsc-alias` — the API runs on Bun natively.
- Pin Postgres back to port 5432 — collides with other local Postgres instances.
- Break Hono RPC by un-chaining routes (`app.get(...); app.post(...)`) — types are accumulated by chaining only.
- Call `fetch` directly in features — use `api` from `adapters/api-client.ts`.
- Push directly to `main` or merge `dev` → `main` with squash/rebase — squash destroys the conventional-commit history semantic-release reads, so you'd lose the bundled changelog the dev/main split exists to produce.
