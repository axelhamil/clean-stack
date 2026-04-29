# CLAUDE.md

Generic monorepo boilerplate. Clean Architecture + DDD. No business features.

## Philosophy

Lean Startup — **Build → Measure → Learn**. The bottleneck is *Build*, so this stack ships the SaaS plumbing (auth, billing, multi-tenant, email, storage) and isolates the domain so pivots don't trash the foundation. Default move when in doubt: ship the smallest thing that tests one hypothesis. "Done > perfect" applies to features; the architecture rules below stay non-negotiable because they're what *makes* shipping fast sustainable.

## Working method

**Whenever something is unclear about a library API, version, config option, or "is this still SOTA" — check the docs before guessing.**

1. **Primary**: Context7 MCP via the `explore-docs` agent (Hono, TanStack Router/Query, Drizzle, Zod, shadcn, sonner, next-themes, react-hook-form, Vite, Bun…).
2. **Fallback**: web search via the `websearch` agent / `WebFetch` for libs Context7 doesn't index, or for broader questions (architecture posts, RFCs).
3. **Never** invent API surface from memory when it's a 30s lookup. Outdated patterns (deprecated hooks, removed flags) are a frequent failure mode.

## Stack

- **Runtime**: Bun 1.3+ (api + scripts), Node 24.15+ for tooling
- **API**: Hono on native `Bun.serve()` — `bun build` (prod, ~7ms), `bun --hot` (dev)
- **App**: Vite 8 + React 19 + TanStack Router + TanStack Query + Tailwind 4 (`@tailwindcss/vite`)
- **UI kit**: shadcn/ui (`@packages/ui`) + `sonner` (toasts) + `next-themes` (light/dark/system)
- **DB**: Drizzle ORM + Postgres 17 (Docker, port `5433` to avoid local Postgres collisions)
- **DI**: `inwire`
- **Auth**: BetterAuth (Drizzle adapter + `twoFactor`, `passkey`, `magicLink`, `bearer`) — module-level singleton in `apps/api/src/auth.ts`, never wrapped in DI
- **Observability**: `pino` (root, JSON in prod, `pino-pretty` in dev) + `hono-pino` (per-request, status-driven level)
- **API ↔ App contract**: Hono RPC (`hc<AppType>`) — type-safe routes end-to-end
- **Primitives**: `@packages/ddd-kit` (`Result<T,E>`, `Option<T>`, `Entity`, `Aggregate`, `ValueObject`, `UUID`, `DomainEvent`, `BaseRepository`, `UseCase`)
- **Packages tooling**: `tsup` (esbuild) for `ddd-kit` + `drizzle`
- **Repo tooling**: pnpm 10 + Turborepo + Biome + Husky + commitlint + semantic-release + knip + jscpd
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
        middleware/            Hono middleware (auth, error, logger, rate-limit)
        services/              External services (email, storage, …)
        repositories/          Drizzle repositories
        mappers/               Domain <-> DB
      routes/                  Hono route registration
      di/                      inwire container + per-context modules
      auth.ts                  BetterAuth singleton
    common/
      env.ts                   Validated env (zod)
      logger.ts                pino root logger
  app/
    src/
      main.tsx                 createRoot + <AppProviders />
      routes/                  TanStack Router file-based routes
        _protected.tsx         pathless gate — redirects when not authenticated
        _guest.tsx             pathless gate — redirects when already authenticated
      features/<area>/         workflow area (auth, dashboard, …) (≈ application/)
        <feature>.page.tsx     entry component (`.page` suffix is non-negotiable)
        <feature>.layout.tsx   (optional)
        <feature>.loading.tsx  (optional) → route's pendingComponent
        <feature>.error.tsx    (optional) → route's errorComponent
        _components/           private colocated components
        _forms/                private isolated forms (RHF + zodResolver)
        _hooks/                private feature-local React hooks
        _schemas/              private zod schemas
      adapters/                auth-client, auth-broadcast, query-client, queries/session, storage
      providers/               provider tree (≈ di/)
      common/                  zero-business infra (env.ts, components/theme-toggle.tsx)
packages/
  ddd-kit                      DDD primitives
  drizzle                      DB client + TransactionService
  test                         shared vitest config
  typescript-config            tsconfig presets
  ui                           shadcn/ui components
```

## Architecture rules

1. **Domain has zero external imports** (only `@packages/ddd-kit` + `zod`).
2. **No `throw` in domain or application** — return `Result<T, E>`.
3. **No `null` / `undefined` for absence** — use `Option<T>`.
4. **Value Objects validate via zod** in `protected validate()`.
5. **Transactions managed in controllers**, passed to use cases.
6. **All dependencies injected** via inwire DI. No service locators in use cases.
7. **No barrel `index.ts` files** — import directly.
8. **Self-documenting code** — no inline comments unless the WHY is non-obvious.
9. **Only `get id()` getter on aggregates**. Other props via `entity.get('propName')`.
10. **`className` is for layout only** — `flex` (default), `w-*`, `h-*`, `mx-auto`, `gap-*`, responsive breakpoints. **`grid` is reserved for true 2D layouts**; `flex flex-col gap-*` for any vertical stack. Colors / typography / radius / shadows / look-defining paddings live in the **theme** (`packages/ui/src/styles/globals.css` `@theme`) or in the shadcn primitive itself (`packages/ui/src/components/ui/*`). Inline overrides like `bg-foo text-bar p-3` = theme drift = no design system.
11. **Always shadcn first, stay shadcn-pure** — check `@packages/ui/components/ui/*` and the [shadcn registry](https://ui.shadcn.com/docs/components) before custom. **Use the actual slots** — `Card` + `CardHeader` + `CardTitle`, never `<TypographyP className="font-medium">` shoved into `CardContent` (the wrong slot forces hacks like `pt-6`, `space-y-4`). No wrapper variants, no `data-slot="*"` overrides, no inline re-shaping. Adjustments live in the theme or in the primitive file. When you do go custom (last resort), put it in `@packages/ui/components/ui/*`, never inline in a feature.
12. **Exactly one `<main>` per rendered page**. `routes/__root.tsx` and pathless gates (`_protected.tsx`, `_guest.tsx`) are passthroughs (`component: Outlet` / `component: () => <Outlet />`) — never wrap in landmarks. Each `<feature>.page.tsx` owns its own `<header>` / `<main>` / `<footer>`. Same rule for `<h1>` (one per page) — `TypographyH1` for the hero, `TypographyH2` for sections.
13. **Zero warnings, zero errors before push**. Husky / lint-staged / commitlint / pre-push / CI must stay green — Biome, knip, jscpd, type-check, all of it. No `--no-verify`. If a warning is genuinely intentional, silence it locally with `/* biome-ignore <rule>: <why> */`. Contract: green `pnpm ci:check`.
14. **Reusability-first — promote, don't duplicate**. Second occurrence of any pattern (animation, hover, layout, mutation shape) is the trigger. Two destinations: theme-level (`globals.css` for keyframes / utilities) or primitive-level (`packages/ui/components/ui/*` when intrinsic to a component). Once promoted, the call site contains zero cosmetics — only layout per rule 10. Same for logic: if `mutationFn: (input) => api.x.$post({ json: input })` shows up twice, extract a typed helper. Three duplications become twelve before you notice.
15. **Component props use `interface`, not `type`** — `interface <Component>Props { ... }` above each component, including sub-components in the same file (no inline `({ token }: { token: string })`). Reasons: declaration merging, better IDE hover, codebase consistency. `type` is for unions / intersections / mapped shapes / zod-inferred types (`type SignInInput = z.infer<typeof signInSchema>`).
16. **`void navigate(...)` in mutation callbacks, not `await`** — `await navigate()` in `useMutation.onSuccess` keeps `isPending: true` during the route transition (beforeLoad + view-transitions + animations), blocking the submit button. `void navigate(...)` is the fire-and-forget that satisfies `no-floating-promises` and resolves the mutation immediately. `await` only when chaining something *after* the navigation lands.

## CQRS

- **Commands** (writes): Controller → Use Case → Aggregate → Repository → EventDispatcher → Handlers
- **Queries** (reads): Controller → Query (direct ORM access, no use case layer)

## Hono RPC (end-to-end type safety)

The api exports its routes as a type (`AppType`) consumed by the app via `hono/client`. Routes **must be chained** to accumulate types — `app.use` and `app.onError` don't add to the typed schema.

```typescript
// apps/api/src/index.ts
const routes = app
  .get("/health", (c) => c.json({ status: "ok" as const }))
  .post("/widgets",
    zValidator("json", z.object({ name: z.string() })),
    (c) => c.json({ ok: true as const, name: c.req.valid("json").name }),
  );
export type AppType = typeof routes;

// apps/app/src/adapters/api-client.ts
import type { AppType } from "api";
import { hc } from "hono/client";
export const api = hc<AppType>(env.VITE_API_URL, { init: { credentials: "include" } });

// feature usage
useMutation({
  mutationFn: async (input) => {
    const res = await api.widgets.$post({ json: input });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  },
});
```

The `api` workspace dep is wired via `apps/api/package.json` `exports`. App consumes `AppType` only — runtime never bundled. Path segments mirror the URL (`/widgets` → `api.widgets`); method is `$post` / `$get` / etc.

## App import direction

`routes/` → `features/` → `adapters/` → `common/`. `providers/` is bootstrap-only. No lateral cross-feature imports. No barrels.

| Folder | May import from | Must NOT import from |
|---|---|---|
| `routes/` | `features/`, `common/` | other features cross-link |
| `features/<x>/` | `adapters/`, `common/`, `@packages/*` | other `features/`, `routes/`, `providers/` |
| `adapters/` | `common/` | `features/`, `routes/`, `providers/` |
| `providers/` | `adapters/`, `common/`, `routeTree.gen.ts` | `features/` |
| `common/` | (nothing internal) | everything else |

## App feature anatomy

Symmetry with `apps/api`: `features/` ≈ `application/`, `adapters/` ≈ `adapters/`, `providers/` ≈ `di/`, `common/` ≈ `common/`. Intentionally **no `domain/` on the front** — UI domain is never pure (React deps), so we don't fake it.

Naming follows **Next.js App Router conventions** — suffix-based files (`<name>.page.tsx`, `<name>.layout.tsx`), `_components/` / `_forms/` / `_hooks/` / `_schemas/` for private folders.

**Default to flatten.** When a feature is mono-page, keep `<feature>.page.tsx` directly under `features/<area>/` rather than a `<feature>/` folder for one file. Promote to `features/<area>/<feature>/` only when it actually grows multi-page (e.g. an onboarding wizard).

**File naming:**

- Files: `kebab-case.tsx`. Components export `PascalCase` named (`export function <Feature>Page`).
- Hooks: `use-<verb>-<noun>.ts`, exporting `useVerbNoun`.
- Schemas: `<noun>.schema.ts`, exporting `<noun>Schema` and `<Noun>Input` (inferred type).
- Page entry: `<feature>.page.tsx` — the route file (`routes/<x>.tsx`) is one line of wiring (`createFileRoute → component: <FeaturePage>`). The `.page` suffix is non-negotiable: it disambiguates routes / pages / forms / cards in the same folder.

**Rules:**

1. The page lives in `<feature>.page.tsx`. Components go in `_components/` (flat — add `_components/<group>/` only when one group has 5+ files).
2. Hooks **never** call `fetch` directly — they go through `adapters/api-client.ts` (Hono RPC).
3. Schemas are zod, with `z.infer` exporting the type next to the schema.
4. **Forms live in `_forms/<action>-form.tsx`**, isolated from their host. The host (Card, Sheet, Dialog…) only does layout; the form owns RHF state, `zodResolver`, validation, submit. Pages stay composable, forms reusable across hosts.
5. Cross-feature reuse is not pre-solved. When two features need the same `UserCard`, decide then: extract to `packages/ui` if presentational, or promote one feature to own it.

**Form contract:**

- `react-hook-form` + `zodResolver` from `@hookform/resolvers/zod` + shadcn `Form` primitives (`Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage`).
- Always pass `defaultValues` to `useForm` (no flash of uncontrolled state).
- Submit goes through `form.handleSubmit((values) => mutation.mutate(values))` — never a manual `(e) => …`. The deprecated React `FormEvent` type stays out.
- The form imports its hook (`../_hooks/use-<action>`) and schema (`../_schemas/<thing>.schema`). Never `fetch` directly.

**Schema contract — split loose vs strict for the same field shape.** When a field is *captured* in one flow (sign-in: just transmit, server validates) and *created* in another (sign-up / reset: enforce strength), keep two schemas. Example: `passwordSchema` (`min(1)`) for sign-in, `strongPasswordSchema` (`min(12).max(128)` + lowercase / uppercase / digit) for sign-up + reset. Validating strength on sign-in locks out users with old simple passwords who legitimately need to log in to *change* them. Composition rules stay minimal — NIST SP 800-63B 2024 deprecates required special chars (pushes users to `Pa$$w0rd!`); for stronger guarantees swap the regex set for `zxcvbn-ts` later.

**Typography contract:**

- All text uses shadcn typography exports (`@packages/ui/components/ui/typography`): `TypographyH1/H2/H3/H4`, `TypographyP/Lead/Large/Muted/Small`, `TypographyBlockquote/InlineCode/List`. Named exports, not a namespace.
- Never raw `<h1 className="text-5xl font-bold">` or `<p className="text-muted-foreground text-sm">` in features. Custom typography belongs in the theme or the Typography component itself (rule 10).
- `className` on Typography components is reserved for **layout** (e.g. `mx-auto max-w-2xl text-balance`). Never override colors / weights / fonts there.

**Theme & dark mode:** `next-themes` provider in `providers/app-providers.tsx` (`attribute="class"`, `defaultTheme="system"`, `disableTransitionOnChange`). The toggle (`apps/app/src/common/components/theme-toggle.tsx`) uses View Transitions API for a circle-reveal animation, with `prefers-reduced-motion` fallback. The view-transition CSS lives in `packages/ui/src/styles/globals.css` (theme-level, rule 10).

**Where do hooks belong?**

- **`features/<x>/_hooks/`** — workflow-specific (`useCheckout`, `useCreateWidget`). Owns side-effects (toasts, navigation, cache invalidation). These are the UI's use cases.
- **`adapters/`** — generic infra (`useApiQuery<T>`, `useDebouncedValue`, RPC client). No workflow logic.
- **Cross-feature resource hooks** — when 2+ features need the same `useUser` / `useCart`, extract to `adapters/queries/` or promote one feature to own it. Don't pre-emptively place them there.

**Composition patterns:**

- **Cards**: use the slots — `Card` + `CardHeader` + `CardTitle` + `CardContent` (+ optional `CardDescription`, `CardFooter`). The primitive already provides `py-6` / `gap-6`; never re-add `pt-6` / `space-y-4` to compensate for a skipped slot.
- **Numbered / iconic markers** (steps, status pills): `Badge variant="secondary"` with layout classes (`size-6`, `font-mono`). Don't hand-roll `<span className="rounded-full bg-secondary …">`.
- **Styled links / nav items**: a primitive owns *style*, a router component owns *navigation*. Compose via `asChild`:

  ```tsx
  <NavLink asChild>
    <Link to="/dashboard">Dashboard</Link>
  </NavLink>
  ```

  `NavLink` (`@packages/ui/components/ui/nav-link.tsx`) holds the muted color + hover; TanStack `<Link>` holds typed routes, hash, active state, prefetch. Same for `<Button asChild><Link …/></Button>`.
- **List bullets**: lucide icons (`<Dot />`, `<Check />`, `<Minus />`) over custom `<span>`s. Sized via `size-*`, colored via theme tokens.

**Rule of thumb**: raw `<a className="text-…">`, `<span className="… rounded-full bg-…">`, or `<div className="… rounded-lg border bg-…">` in a feature = skipped slot or duplicated primitive — promote, don't patch (rule 14).

## Route gates (pathless layouts)

Auth state is enforced by **pathless layouts**, not by per-route `beforeLoad` duplication.

```
routes/
  __root.tsx                  passthrough (component: Outlet)
  _protected.tsx              redirects to /sign-in if no session
  _protected/dashboard.tsx    URL: /dashboard (inherits the gate)
  _guest.tsx                  redirects to /dashboard if session exists
  _guest/sign-in.tsx          URL: /sign-in
  _guest/sign-up.tsx          URL: /sign-up
```

The `_` prefix tells TanStack Router this segment is not part of the URL — it hosts a shared `beforeLoad`. URL-wise, `_guest/sign-in.tsx` resolves to `/sign-in`.

**Naming**: by access *condition*, not feature. `_protected` = "must be authenticated", `_guest` = "must NOT be authenticated". Antonymic and reads at a glance. Avoid `_auth` (ambiguous: routes *about* auth vs routes *requiring* auth).

**Single source of session truth — TanStack Query, not React state.** Router context only exposes `queryClient`. Each gate's `beforeLoad` reads via `await context.queryClient.ensureQueryData(sessionQueryOptions)` (`adapters/queries/session.ts`, staleTime 5 min — aligned with BetterAuth `cookieCache.maxAge`). No `useSession()` React bridge, no race between nanostores and `beforeLoad`.

```ts
// _protected.tsx
beforeLoad: async ({ context, location }) => {
  const session = await context.queryClient.ensureQueryData(sessionQueryOptions);
  if (!session) throw redirect({ to: "/sign-in", search: { redirect: location.href } });
  return { user: session.user };
}
```

**After auth mutations, push state into the query, then navigate.** Sign-in / verify-email / magic-link / 2FA-verify do `await queryClient.refetchQueries({ queryKey: sessionQueryOptions.queryKey })` (cookie is set; refetch pulls the canonical shape). Sign-out does `queryClient.setQueryData(sessionQueryOptions.queryKey, null)` (result is known, no roundtrip). Then `void navigate({ to: ... })`.

**Token-consuming pages stay outside the gates** — `/verify-email?token=…`, `/reset-password?token=…`, `/magic-link?token=…`, `/two-factor`. Putting them under `_guest` would 302 them away the moment the consumed token signed the user in. They handle their own state. Token-consume effects use a `useRef(false)` guard against React StrictMode double-fire (single-use tokens would otherwise be invalidated by the second invocation in dev).

**Realtime cross-tab sync via `BroadcastChannel`** — `adapters/auth-broadcast.ts` (~15 LoC, native web API, stable since 2017). Auth mutations call `broadcastAuthChange()` which posts `{ type: "session-changed" }` on the `clean-stack-auth` channel. `app-providers.tsx` listens once via `onAuthChange(...)` and on receive does `refetchQueries(['session'])` + `router.invalidate()`. Tab A signs out → tab B (idle on `/dashboard`) instantly transitions to `/sign-in`, no polling, no hard reload, no navigation needed in B. The signal carries no payload — cookie is shared, each tab refetches against live server state, `cookieCache` keeps it cheap. **Use this for any auth state change** (sign-in, sign-out, verify-*, 2FA, future org switch / role change / impersonation — just add a new event type).

## Auth (BetterAuth integration)

BetterAuth ships as a **module-level singleton** (`apps/api/src/auth.ts`). Not wrapped in a port/adapter, not registered in inwire — wrapping would only recopy `auth.api.*` and lose the strong typing of `auth.$Infer.*`. Every consumer imports `auth` directly.

**Server pipeline** (in order, in `index.ts`):

1. `requestId()` — seeds `c.var.requestId` for log correlation.
2. `httpLogger` (hono-pino).
3. `secureHeaders()`, `cors({ origin: env.CORS_ORIGIN, credentials: true })`.
4. `sessionMiddleware` (`adapters/middleware/auth.middleware.ts`) — calls `auth.api.getSession()` once per request, stores `user` / `session` on the context. Skips `/api/auth/*`.
5. Mount `app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw))`.
6. `app.onError(errorHandler)`.

Protected handlers compose `requireAuth` (same file) — reads the resolved session and throws `HTTPException(401)` if absent. **Never re-call `auth.api.getSession()` per handler** — one read per request.

```typescript
.get("/me", requireAuth, (c) => c.json({ user: c.get("user") }))
```

**Client** (`apps/app/src/adapters/auth-client.ts`): one `createAuthClient` with the same plugin set as the server (`twoFactorClient`, `magicLinkClient`, `passkeyClient`). Consumers import `authClient` directly — no re-exports. Session reads go through TanStack Query (`sessionQueryOptions`), not the BetterAuth nanostore.

**Non-negotiable defaults:**

- **`session.cookieCache: { enabled: true, maxAge: 5 * 60 }`** — auth check is signature-only between refreshes (no DB hit). DB is source of truth at expiry → instant revoke. Keep `maxAge` ≤ 15 min so revocation lag stays acceptable.
- **`bearer()` plugin** — alongside cookies, enables `Authorization: Bearer <token>`. Web stays cookie-based (httpOnly, XSS-safe); Capacitor / mobile uses bearer with secure storage. Same session row in DB — only transport differs.
- **Cookies**: `httpOnly: true`, `sameSite: "lax"`, `secure: isProd` in `auth.advanced.defaultCookieAttributes`.

**Email URLs route through the app, not the API.** Every email link points to `${env.APP_URL}/<route>?token=...`. The frontend route consumes the token via the typed client (`authClient.verifyEmail({ query: { token } })`, `authClient.resetPassword({ newPassword, token })`, `authClient.magicLink.verify({ query: { token } })`). Reasons: branded UX (loading / error / redirect); avoids Outlook/Gmail re-autolinking the visible URL text and mangling `?callbackURL=...` (use a short label like "Verify your email", never the full URL, so re-autolinking has nothing to grab). Apply the same pattern when adding new auth-token emails (org invitations, etc.):

```typescript
sendInvitation: async ({ email, token }) => {
  const url = `${env.APP_URL}/org/accept-invite?token=${encodeURIComponent(token)}`;
  await sendEmail({ to: email, subject: "...", html: `<p><a href="${url}">Accept invitation</a></p>` });
}
```

## Logging & error handling

**No `console.*` in production paths.** All logs go through `pino` (`apps/api/common/logger.ts`): JSON to stdout in prod (Datadog, Loki consume directly), `pino-pretty` single-line in dev. Level: `info` prod, `debug` dev.

**HTTP logger** (`adapters/middleware/logger.middleware.ts`): `hono-pino` with `referRequestIdKey: "requestId"` so every line carries the same request id as the response payload. Status-driven: `5xx → error`, `4xx → warn`, `2xx/3xx → info`.

**Error handler** (`adapters/middleware/error.middleware.ts`): one `app.onError(errorHandler)`, no per-route `try/catch` for HTTP wrapping.

- `HTTPException` → `{ error: { code: "HTTP_<status>", message, requestId } }`. Logged at `error` only when `status >= 500`.
- Anything else → `500` `{ error: { code: "INTERNAL_ERROR", message: "Internal Server Error", requestId, stack? } }`. Logged with full error + request context. Stack only outside production.

**Throwing the right exception is the API.** Domain & application use `Result<T, E>` (no throw). At the controller boundary, translate failures to `HTTPException(<status>, { message })`. The handler does the rest. Never invent a custom error envelope per route — the envelope above is the contract for the whole API.

## Domain Events

Events are *added* in aggregate methods (`this.addEvent(...)`), NOT dispatched there. Dispatch happens in use cases AFTER successful persistence:

```typescript
const saveResult = await this.repo.create(aggregate);
if (saveResult.isFailure) return Result.fail(saveResult.getError());
await this.eventDispatcher.dispatchAll(aggregate.domainEvents);
aggregate.clearEvents();
```

## Testing

BDD style. One test file per use case under `__TESTS__/`. Mock at the repository/port level. Test `Result` / `Option` state transitions.

## Common patterns

```typescript
// Result
Result.ok(value); Result.fail(error); Result.combine([r1, r2, r3]);

// Option
Option.some(value); Option.none(); Option.fromNullable(value);

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

- `ui: "tui"` in `turbo.json` — daemon auto-managed since v2.x, no flags needed.
- `globalDependencies`: `biome.json`, `pnpm-workspace.yaml`, `.env*` — modifying these busts every cache.
- `inputs` scoped per task (build/test/type-check) — README/doc edits do NOT invalidate code caches.
- `build` declares `with: ["type-check"]` — `pnpm build` runs type-check in parallel for free.
- `dev`, `test:watch`, `db:studio` are `interruptible: true` — clean ctrl+C kill on next reload.

## Useful scripts

- `pnpm dev` — Turbo TUI dev (`pnpm dev --filter=api` to filter)
- `pnpm build` / `test` / `type-check` — Turbo orchestrated
- `pnpm check` (Biome lint+format) / `fix` (auto-fix) / `ci:check` (CI lint)
- `pnpm check:duplication` (jscpd) / `check:unused` (knip)
- `pnpm db:push` / `db:generate` / `db:migrate` / `db:seed` / `db:studio`
- `pnpm clean` — wipe `node_modules`, `.turbo`, `dist`

## DB

- `docker compose up -d` from repo root — Postgres on `localhost:5433`.
- Schema in `packages/drizzle/src/schema/*.ts`.
- After schema change: `pnpm db:push` (dev) or `pnpm db:generate && pnpm db:migrate` (prod-style).

## Release flow

Two-branch model. **`main` is the released branch — every merge to `main` triggers semantic-release.** `dev` is the integration branch where work accumulates between releases.

- Daily work happens on `dev` (or feature branches PR'd into `dev`). Pushing to `dev` does **not** trigger a release.
- Shipping is deliberate: open a PR `dev` → `main`, merge it. `release.yml` runs, semantic-release analyzes **all** commits since the last tag and produces one bundled bump + changelog.
- **`dev` → `main` MUST be a merge commit** (not squash, not rebase). Squash collapses every conventional commit into one, semantic-release would only see one entry. The repo is configured GitHub-side to allow merge commits only.
- `main` is protected (require PR, no force push, conversation resolution required). If a CI fix is needed during release, do it on `dev` and re-merge.
- **Don't release on every commit** — wait for a meaningful batch (a feature complete, a coherent set of fixes). Cadence is controlled by *when you merge to main*, not by `.releaserc.json` / `release.yml` (those stay as-is).

```bash
git checkout dev && git push   # no release
gh pr create --base main --head dev --title "Release: <theme>"
# merge via "Create a merge commit" on GitHub UI
# → release.yml runs, one consolidated tag + changelog drops
```

## Don't

- Add business features without first agreeing on the bounded context.
- Throw in domain or application; use `null` for absence; add `index.ts` barrels; add inline comments that restate what the code does.
- Reintroduce `@hono/node-server`, `tsx`, `tsc-alias` — the API runs on Bun natively.
- Pin Postgres back to port 5432 — collides with other local Postgres instances.
- Break Hono RPC by un-chaining routes (`app.get(...); app.post(...)`) — types accumulate via chaining.
- Call `fetch` directly in features — use `api` from `adapters/api-client.ts`.
- Wrap BetterAuth in a port/service or register it in inwire — `auth` is the integration. Import directly.
- Re-call `auth.api.getSession()` per route handler — `sessionMiddleware` reads it once; `requireAuth` / `c.get("user")` does the rest.
- Embed the API verification URL in an email — every link points to `${env.APP_URL}/<route>?token=...`, the frontend page consumes via the typed client. Use a short label as link text, never the full URL (email clients re-autolink and corrupt it).
- Sprinkle `console.log` / `console.error` in handlers — go through `pino` and the centralised error handler.
- Duplicate `beforeLoad` auth checks per route — host them on a pathless layout (`_protected.tsx` / `_guest.tsx`).
- Push directly to `main` or merge `dev` → `main` with squash/rebase — squash destroys the conventional-commit history semantic-release reads.
- Put session data in `router.context` or sync via `useSession()` React boundary — race between nanostores and `beforeLoad`. Read via `ensureQueryData(sessionQueryOptions)`; context only exposes `queryClient`.
- `await navigate(...)` in `useMutation.onSuccess` — keeps the mutation pending during transition, blocks the submit button. Use `void navigate(...)`.
- Mutate session-changing flows without calling `broadcastAuthChange()` — other tabs stay stuck on stale data until next navigation.
- Validate password strength on the **sign-in** form — only on sign-up / reset. Users with legacy weak passwords must still be able to log in to change them.
- Type component props with `type` — use `interface <Component>Props { ... }`. `type` is for unions / intersections / mapped shapes / zod-inferred types.
- Consume a single-use token from `useEffect` without a `useRef(false)` guard — StrictMode double-fire would invalidate the token even though the first call succeeded.
- Pass `redirectTo` / `callbackURL` to BetterAuth client methods when the corresponding `send*` server hook already builds the URL — duplicate dead code that can later silently override the canonical URL.
