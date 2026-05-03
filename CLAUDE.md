# CLAUDE.md

Generic monorepo boilerplate. Clean Architecture + DDD. No business features.

## Philosophy

Lean Startup — **Build → Measure → Learn**. The bottleneck is *Build*, so this stack ships SaaS plumbing (auth, billing, multi-tenant, email, storage) and isolates the domain so pivots don't trash the foundation. "Done > perfect" applies to features; the rules below stay non-negotiable — they're what *makes* shipping fast sustainable.

## Working method

When unclear about a library API / config / "is this still SOTA" — **check docs before guessing**. Outdated patterns are a frequent failure mode. Primary: Context7 MCP via `explore-docs` agent. Fallback: `websearch` agent / `WebFetch`.

## Stack

- **Runtime**: Bun 1.3+ (api + scripts), Node 24.15+ (tooling)
- **API**: Hono on native `Bun.serve()` — `bun build` (prod), `bun --hot` (dev)
- **App**: Vite 8 + React 19 + TanStack Router/Query + Tailwind 4
- **UI**: shadcn/ui (`@packages/ui`) + `sonner` + `next-themes`
- **DB**: Drizzle + Postgres 17 (Docker, port `5433`)
- **DI**: `inwire` (type-inference container)
- **Auth**: BetterAuth (Drizzle adapter + `twoFactor`, `passkey`, `magicLink`, `bearer`) — module-level singleton, never wrapped in DI
- **Observability**: `pino` + `hono-pino`
- **Contract**: Hono RPC (`hc<AppType>`)
- **Primitives**: `@packages/ddd-kit` (`Result`, `Option`, `Entity`, `Aggregate`, `ValueObject`, `UUID`, `DomainEvent`, `BaseRepository`, `UseCase`)
- **Tooling**: pnpm 10 + Turborepo + Biome + Husky + commitlint + semantic-release + knip + jscpd
- **Testing**: `bun test` (api) + `vitest` (packages, app)

## Layout

```
apps/
  api/
    src/
      domain/                  Aggregates, Entities, Value Objects, Domain Events
      application/
        ports/                 Interfaces (repositories, services)
        use-cases/             One file per use case (orchestrates ≥ 1 aggregate with infra)
        services/              Pure-infra orchestration (no aggregate yet) — `<Noun>Service` with N methods
        dto/                   Zod schemas (`<verb-noun>.dto.ts`, export `<Noun>Input = z.infer<...>`)
        event-handlers/        Side effects on domain events
      adapters/
        middleware/            Hono middleware (auth, error, logger, rate-limit)
        services/              External services (email, storage, …)
        repositories/          Drizzle repositories
        mappers/               Domain <-> DB
      routes/                  Hono route registration
      di/                      inwire container (flat; modules/ only when a context grows)
      auth.ts                  BetterAuth singleton
      client.ts                hcWithType (RPC client factory)
    common/                    env.ts, logger.ts
  app/
    src/
      main.tsx                 createRoot + <AppProviders />
      routes/                  TanStack Router file-based
        _protected.tsx         pathless gate — redirects when not authenticated
        _guest.tsx             pathless gate — redirects when already authenticated
      features/<area>/         workflow area (≈ application/)
        <feature>.page.tsx     entry component (`.page` suffix non-negotiable)
        <feature>.layout.tsx   (optional)
        <feature>.loading.tsx  (optional) → pendingComponent
        <feature>.error.tsx    (optional) → errorComponent
        _components/ _forms/ _hooks/ _schemas/   private colocated
      adapters/                api-client, auth-client, auth-broadcast, query-client, queries/, mutations/
      providers/               provider tree (≈ di/)
      common/                  zero-business infra (env, theme-toggle)
packages/
  access-control               BetterAuth access-control SSOT (statements, roles, authorizeRole)
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
5. **Transactions managed in controllers**, passed to use cases / services.
6. **All dependencies injected via DI**. No service locators in use cases / services. Routes consume by name (`di.XxxUseCase.execute(...)` or `di.XxxService.method(...)`); never `new XxxUseCase(...)` / `new XxxService(...)` at call site (bypasses container, breaks per-test impl swap).
7. **No barrel `index.ts` files** — import directly.
8. **Self-documenting code** — no inline comments unless WHY is non-obvious.
9. **Only `get id()` getter on aggregates**. Other props via `entity.get('propName')`.
10. **`className` is for layout only** — `flex` (default), `w-*`, `h-*`, `mx-auto`, `gap-*`, responsive breakpoints. **`grid` reserved for true 2D**; `flex flex-col gap-*` for any vertical stack. Colors / typography / radius / shadows / look-defining paddings live in **theme** (`packages/ui/src/styles/globals.css` `@theme`) or in the primitive itself. Inline `bg-foo text-bar p-3` = theme drift = no design system.
11. **Always shadcn first, stay shadcn-pure** — check `@packages/ui/components/ui/*` and the [shadcn registry](https://ui.shadcn.com/docs/components) before custom. **Use the actual slots** (`Card` + `CardHeader` + `CardTitle`) — wrong slot forces hacks (`pt-6`, `space-y-4`). No wrapper variants, no `data-slot="*"` overrides, no inline reshape. Adjustments → theme or primitive file. Custom (last resort) lives in `@packages/ui/components/ui/*`, never inline in a feature.
12. **Exactly one `<main>` per rendered page**. `__root.tsx` and pathless gates are passthroughs (`component: Outlet`) — never wrap in landmarks. Each `<feature>.page.tsx` owns its `<header>` / `<main>` / `<footer>`. Same for `<h1>` (one per page) — `TypographyH1` for hero, `TypographyH2` for sections.
13. **Zero warnings, zero errors before push**. Husky / lint-staged / commitlint / pre-push / CI must stay green (Biome, knip, jscpd, type-check). No `--no-verify`. Intentional warning → `/* biome-ignore <rule>: <why> */`. Contract: green `pnpm ci:check`.
14. **Reusability-first — promote, don't duplicate**. Second occurrence is the trigger. Theme-level (keyframes / utilities) or primitive-level (intrinsic to a component). Once promoted, call site has zero cosmetics. Same for logic: `mutationFn: (input) => api.x.$post({ json: input })` twice → extract a typed helper.
15. **Component props use `interface`, not `type`** — `interface <Component>Props { ... }` above each component (no inline `({ token }: { token: string })`). Reasons: declaration merging, IDE hover, consistency. `type` is for unions / intersections / mapped shapes / zod-inferred (`type X = z.infer<typeof xSchema>`).
16. **`void navigate(...)` in mutation callbacks, not `await`** — `await` keeps `isPending: true` during route transition (blocks submit). `void navigate(...)` resolves the mutation immediately and satisfies `no-floating-promises`. `await` only when chaining *after* navigation lands.
17. **Use case = orchestrates ≥ 1 aggregate with infra. No aggregate → it's an `application/services/<Noun>Service` with N methods, never a "use case" with `.execute()`.** Use cases live in `application/use-cases/` (one file per use case). Application services live in `application/services/<noun>.service.ts` (one class per bounded concern, methods named after the operation: `requestAccountDeletion`, `confirmUpload`, …); methods may call `this.<other>` directly — never inject a service into another. **Why**: the "use case" label implies a metier intention bound to an aggregate (Clean Architecture / DDD); using it for pure infra orchestration (presign URL, gdpr sweep, billing config lookup) invites pathological inter-injection between use cases and inflates the layer with non-domain code. The decisor is the aggregate, not the I/O count: storage presign + size/owner check is *infra orchestration* (no aggregate); transferring funds between two `Account` aggregates is a *use case* (or a domain service if the rule lives across both). Application service ≠ adapter service: `adapters/services/` = port impl (S3, Resend — pure I/O); `application/services/` = orchestration above ports.
18. **Owned aggregates use `ScopedRepository<T, TScope>`, never `BaseRepository<T>`.** Every method (`findById`, `delete`, `update`, `findMany`, `exists`, `count`, …) takes `scope: TScope` (`RepoScope.user(...)`, `RepoScope.org(...)`, `RepoScope.userInOrg(...)`); the impl AND-joins the scope into the SQL `WHERE`. **Wrong-owner returns `Option.none()` on reads, `NOT_FOUND` on writes** — never `403`/leak existence. **Why**: middleware-only enforcement (`requireOrgOwnership`, `withOrg`) breaks the moment a use case runs outside Hono (cron, queue, event handler, internal route) — port-level scoping survives every transport. `BaseRepository<T>` reserved for genuinely global aggregates (audit logs, system-wide config). Test decisor: if the row carries `userId` or `organizationId`, it's `ScopedRepository`.
19. **Adding a rule — omnipotent or it doesn't belong here.** A rule states a *principle* tied to an architectural property (Clean Architecture layer, type-safety boundary, design-system invariant, security posture) and must survive swapping any library/version/path it references — phrase library-agnostic when possible, only name a tool when it *is* the property (Zod = "validate at boundary"). Always include the **why** (the failure mode the rule prevents) — without it, the rule rots on the first edge case. Promote on second occurrence (rule 14); section-local first, `## Architecture rules` only when crossing sections; if inverse advice, mirror in `## Don't`. Rewrite or delete a rule the moment its property changes — a stale rule is worse than no rule.

## CQRS

- **Commands** (writes): Controller → Use Case → Aggregate → Repository → EventDispatcher → Handlers
- **Queries** (reads): Controller → Query (direct ORM access, no use case)

## DI (inwire)

**Type inference, no declarations.** Builder accumulates types as you `.add()`; `c` is fully typed against everything registered before — reorder a use-case before its port, `tsc` rejects. Flat container with sections grouped by bounded context (`// uploads`, `// billing`); promote a section to `apps/api/src/di/modules/<context>.module.ts` (`addModule` pattern) only when ≥ 5 use-cases *and* `container.ts` becomes hard to scan.

1. **No declared types until they pay for themselves** — no `interface XxxDeps`, no `<T extends { IPort: PortType }>`, no central `types.ts`. Hand-declaring is the boilerplate inwire removes.
2. **`AppDeps = typeof di`** after `.build()` — derived, never declared.
3. **Use cases stay in `application/use-cases/`** (one file per use case); **application services stay in `application/services/`** (one file per service, N methods). DI is *wiring*; the use-case / service file is *implementation*.
4. **No barrel `index.ts`** in `di/`.

## Hono RPC (end-to-end type safety)

API exports `AppType`; app consumes via `hono/client`. Routes **must be chained** to accumulate types — `app.use` / `app.onError` don't add to the typed schema. Paths mirror URL (`/uploads/presign` → `api.uploads.presign`); method `$post` / `$get`.

`apps/api/package.json` has two subpath exports: `.` → `./src/index.ts` (`AppType`, server runtime); `./client` → `./src/client.ts` (`hcWithType`, pre-typed factory). Single client instance lives in `apps/app/src/adapters/api-client.ts`: `hcWithType(baseUrl, { init: { credentials: "include" }, fetch: customFetch })`. Custom fetch injects `X-Request-Id` and is the slot for future global handlers (401 redirect, token refresh, Capacitor Bearer).

- **`hcWithType` from `api/client`, not inline `hc<AppType>` in the app** — `tsc` resolves `ApiClient` once, no per-callsite re-inference.
- **Trailing-slash normalize the `baseUrl`** — `hc` drops the last segment if missing.
- **`AbortSignal`** via per-call second arg → `await $get({}, { init: { signal } })`. TanStack Query passes `signal`; thread it.
- **Type sharing**: `InferRequestType<typeof $endpoint>["json"]` + `InferResponseType<typeof $endpoint, 200>` (status-narrowed to success).
- **Errors stay `throw on !res.ok`** — `ApplyGlobalResponse` widens response types but no discriminated union. Don't fake SOTA.

## App import direction

`routes/` → `features/` → `adapters/` → `common/`. `providers/` bootstrap-only. No cross-feature imports, no barrels.

- `routes/` → `features/`, `common/`
- `features/<x>/` → `adapters/`, `common/`, `@packages/*` (never other `features/`, `routes/`, `providers/`)
- `adapters/` → `common/`
- `providers/` → `adapters/`, `common/`, `routeTree.gen.ts`
- `common/` → nothing internal

## App feature anatomy

Symmetry with `apps/api`: `features/` ≈ `application/`, `adapters/` ≈ `adapters/`, `providers/` ≈ `di/`, `common/` ≈ `common/`. **No `domain/` on the front** — UI domain is never pure (React deps), don't fake it.

**Next.js App Router naming**: `<name>.page.tsx`, `<name>.layout.tsx`, `_components/` / `_forms/` / `_hooks/` / `_schemas/` private folders. Files `kebab-case.tsx`; components `PascalCase` named exports; hooks `use-<verb>-<noun>.ts` → `useVerbNoun`; schemas `<noun>.schema.ts` → `<noun>Schema` + `<Noun>Input` (z.infer). The `.page` suffix disambiguates routes / pages / forms / cards. Default to flatten — promote `features/<area>/<feature>/` only when multi-page.

1. Page in `<feature>.page.tsx`. Components in `_components/` (flat — group only when ≥ 5 files share a concern).
2. Hooks never call `fetch` directly — through `adapters/api-client.ts`.
3. Schemas are zod with `z.infer` co-located.
4. **Forms in `_forms/<action>-form.tsx`**, isolated from host (Card / Sheet / Dialog = layout only; form owns RHF state, `zodResolver`, validation, submit). Pages composable, forms reusable across hosts.
5. Cross-feature reuse not pre-solved — extract to `packages/ui` if presentational, or promote one feature to own it.

**Form contract**: `react-hook-form` + `zodResolver` + shadcn `Form`. Always pass `defaultValues` to `useForm` (no flash of uncontrolled). Submit via `form.handleSubmit((values) => mutation.mutate(values))` — never manual `(e) => …`.

**Schema contract — split loose vs strict for the same field.** A field *captured* in one flow (sign-in: transmit, server validates) and *created* in another (sign-up / reset: enforce strength) needs two schemas — validating strength on sign-in locks out users with old passwords who need to log in to *change* them. NIST SP 800-63B 2024 deprecates required special chars; stronger guarantees → `zxcvbn-ts`.

**Typography contract**: all text via shadcn typography exports (named, not namespace). Never raw `<h1 className="text-5xl font-bold">`. Custom typography → theme or Typography component itself (rule 10). `className` on Typography reserved for **layout** (`mx-auto max-w-2xl text-balance`); never colors / weights / fonts.

**Theme & dark mode**: `next-themes` (`attribute="class"`, `defaultTheme="system"`, `disableTransitionOnChange`). Toggle uses View Transitions API with `prefers-reduced-motion` fallback. View-transition CSS in `globals.css` (theme-level).

**Queries / mutations / hooks — decision table.** Options factories compose better than hook wrappers: typed, prefetchable in `beforeLoad`, call site overrides per-use. Hook wrappers earn their keep only when side-effects *always* fire and aren't the call site's concern.

| Case | Where | Form |
|---|---|---|
| **Query** (any read) | `adapters/queries/<noun>.ts` | `xxxQueryOptions` via `queryOptions(...)`. Consumed via `useQuery` + `ensureQueryData` in `beforeLoad`. |
| **Mutation, cross-feature or multi-step** | `adapters/mutations/<verb>.ts` | `xxxMutationOptions` via `mutationOptions(...)`. Call site owns side-effects. |
| **Mutation feature-specific with bundled side-effects** (toast + navigate + invalidate + broadcast, every call) | `features/<x>/_hooks/use-<verb>.ts` | Hook wrapping `useMutation`. Owns `onSuccess` / `onError`. Used by exactly one feature. |
| **Pure React utility** | `features/<x>/_hooks/` if scoped, `adapters/` if generic | Plain hook. |

A hook that does only `return useMutation({ mutationFn })` is an indirection — promote to a `mutationOptions` factory. Cross-feature resource hooks extracted to `adapters/queries/` only when 2+ features need them.

### `mutationOptions` cookbook

`adapters/mutations/<verb-noun>.ts`, file mirrors the backend use-case, export `<verbNoun>MutationOptions`. Never prefix with `use-` — these are objects.

1. **Side-effects belong to the call site** — no `toast` / `navigate` / `invalidateQueries` in the factory.
2. **Spread, don't override**: `useMutation({ ...createXMutationOptions, onSuccess: … })`. Never mutate the exported object.
3. **`mutationKey` = `[<resource>, <verb>]`** (e.g. `["uploads", "create"]`) — lets `useIsMutating({ mutationKey })` find in-flight mutations.
4. **Types via `InferRequestType` / `InferResponseType<…, 200>`** + `if (!res.ok) throw` — function signature stays accurate.
5. **Multi-step workflows go in the factory** (presign → PUT → confirm). Single `mutationFn` returning server-verified output; call site never reasons about intermediate steps.
6. **`AbortSignal`** — single-call factories thread `init.signal`. Multi-step flows with cleanup typically can't honour cancellation cleanly — document if so.

**Composition patterns** (rule 11 instances — promote, don't patch). Raw `<a className="text-…">`, `<span className="… rounded-full bg-…">`, `<div className="… rounded-lg border bg-…">` in a feature = skipped slot or duplicated primitive.

- **Cards**: actual slots (`Card` + `CardHeader` + `CardTitle` + `CardContent` + optional `CardDescription` / `CardFooter` / `CardAction`). Never re-add `pt-6` / `space-y-4` to compensate.
- **Numbered / iconic markers**: `Badge variant="secondary"` with layout (`size-6`, `font-mono`). Not hand-rolled spans.
- **Styled links / nav items**: `NavLink` from `@packages/ui/components/ui/nav-link` (variants `plain` / `pill` / `underline`, `active` flag). Primitive owns style, router owns navigation — compose via `asChild` (`<NavLink asChild variant="pill" active={isActive}><Link to="/x">…</Link></NavLink>`, same for `<Button asChild><Link …/></Button>`). Never raw `<a className="text-…">`.
- **List bullets**: lucide icons over custom spans.

## Route gates (pathless layouts)

Auth state enforced by **pathless layouts** (`_protected.tsx`, `_guest.tsx`), not per-route `beforeLoad` duplication. The `_` prefix tells TanStack Router the segment isn't part of the URL — it hosts a shared `beforeLoad`. `__root.tsx` is a passthrough (`Outlet`). Children inherit the gate (`_protected/dashboard.tsx` → `/dashboard`).

**Naming by access *condition*, not feature** — `_protected` = "must be authenticated", `_guest` = "must NOT". Avoid `_auth` (ambiguous: *about* auth vs *requiring* auth).

**Single source of session truth — TanStack Query, not React state.** Router context only exposes `queryClient`. Gates' `beforeLoad` reads `ensureQueryData(sessionQueryOptions)` (staleTime aligned with `cookieCache.maxAge`). No `useSession()` React bridge, no race.

**After auth mutations, push state into the query, then navigate.** Sign-in / verify-email / magic-link / 2FA-verify: `await queryClient.refetchQueries({ queryKey: sessionQueryOptions.queryKey })` (cookie is set; refetch pulls canonical shape). Sign-out: `setQueryData(..., null)` (result known). Then `void navigate({ to })`.

**Token-consuming pages stay outside the gates** — `/verify-email`, `/reset-password`, `/magic-link`, `/two-factor`. Under `_guest` they'd be 302'd away the moment the token signs the user in. Token-consume effects use a `useRef(false)` guard against StrictMode double-fire (single-use tokens otherwise invalidated by the second invocation in dev).

**Realtime cross-tab sync via `BroadcastChannel`** — `adapters/auth-broadcast.ts` (~15 LoC, native, stable since 2017). Mutations call `broadcastAuthChange()`; `app-providers.tsx` listens once and `refetchQueries(['session','active-org','current-membership','orgs'])` + `router.invalidate()`. No payload — cookie is shared, each tab refetches live server state. Use for **any** auth/org state change (sign-in, sign-out, verify-*, 2FA, org switch / create / delete / leave / accept-invitation / role change / future impersonation).

## Auth (BetterAuth integration)

**Module-level singleton** (`apps/api/src/auth.ts`) — not wrapped in a port/adapter, not registered in DI (wrapping recopies `auth.api.*` and loses `auth.$Infer.*` typing). Every consumer imports `auth` directly. Client (`adapters/auth-client.ts`): one `createAuthClient` with the same plugin set; session reads via TanStack Query, not the auth-lib nanostore.

**Server pipeline** (in order, `index.ts`): `requestId()` → `httpLogger` → `secureHeaders()` + `cors()` → `sessionMiddleware` (calls `auth.api.getSession()` once, stores `user` / `session` on context, skips `/api/auth/*`) → `app.on(["GET","POST"], "/api/auth/*", (c) => auth.handler(c.req.raw))` → `app.onError(errorHandler)`. Protected handlers compose `requireAuth` (reads resolved session, throws `HTTPException(401)` if absent). **Never re-call `auth.api.getSession()` per handler.**

**Defaults**: `session.cookieCache: { enabled: true, maxAge: 5*60 }` (signature-only auth check between refreshes; DB is source of truth at expiry → instant revoke; keep `maxAge` ≤ 15 min). `bearer()` plugin alongside cookies — web stays cookie-based (httpOnly, XSS-safe), Capacitor uses bearer with secure storage; same session row, transport differs. Cookies: `httpOnly`, `sameSite: "lax"`, `secure: isProd`.

**Email URLs route through the app, not the API** — `${env.APP_URL}/<route>?token=...` (opaque tokens: `verify-email`, `reset-password`, `magic-link`) or `${env.APP_URL}/<route>/<id>` (ID-based flows: `accept-invitation/<id>`). Frontend consumes the token/ID via the typed client. **Why**: branded UX; avoids Outlook/Gmail re-autolinking visible URL text and mangling `?callbackURL=...`. Use a short label, never the full URL. Applies to every auth-token email.

## Logging & error handling

**No `console.*` in production paths** — all logs through `pino` (JSON stdout in prod, `pino-pretty` in dev; `info` prod / `debug` dev). HTTP: `hono-pino` with `referRequestIdKey: "requestId"` — every line carries the same request id; status-driven (`5xx → error`, `4xx → warn`, `2xx/3xx → info`).

**One `app.onError(errorHandler)`, no per-route `try/catch`**: `HTTPException` → `{ error: { code: "HTTP_<status>", message, requestId } }` (logged at `error` only when `status >= 500`). Anything else → `500` `{ error: { code: "INTERNAL_ERROR", message: "Internal Server Error", requestId, stack? } }` (stack only outside production).

**Throwing the right exception is the API.** Domain & application use `Result<T, E>` (no throw); controller translates failures → `HTTPException(<status>, { message })`. The envelope above is the contract for the whole API — never invent a custom one per route.

## Storage (object-storage-agnostic, S3-compatible)

**Server is blind during the upload** — client PUTs directly to the provider via presigned URL; API only sees `presign` and `confirm`. Three-step flow `presign` → `PUT` → `confirm`; symmetric `POST /uploads/download`. **Why three steps**: providers like R2 don't support Presigned POST policies (no `content-length-range`, verified 2026). Signed `Content-Length` / `Content-Type` block naïve clients but providers don't verify the body — `confirm` (server `HeadObject` + `DeleteObject` on mismatch) is the real enforcement. Full as-built in `docs/HISTORY.md`.

1. **Port = pure transport.** `IStorageService` exposes only SDK-level ops (`presignUpload`, `presignDownload`, `headObject`, `deleteObject`, `publicUrlFor`). Zero business rules.
2. **Use-cases enforce owner-scoped key** `<userId>/<scope>/<uuid>-<filename>`; download + confirm reject keys without prefix `<requestingUserId>/` (`STORAGE_FORBIDDEN`). No `throw` — return `Result<T, StorageError>`.
3. **Validation at controller boundary** in `application/dto/*.dto.ts` (filename regex, scope regex, size cap, max TTL), consumed via `zValidator`. Use-cases trust their input.
4. **Routes = thin controllers.** DI resolve → `await execute(...)` → `Result` → HTTP via central `statusFor(error)` switch (403 `STORAGE_FORBIDDEN`, 404 `STORAGE_NOT_FOUND`, 422 `STORAGE_INTEGRITY_FAILED`, 502 `STORAGE_PROVIDER_FAILURE`).
5. **Provider-agnostic via S3 SDK config**: `region: "auto"`, `forcePathStyle: true`. Boot-time fail-hard if production endpoint is localhost or creds are default. Once a region/jurisdiction is chosen (e.g. R2 EU), buckets typically can't be moved.
6. **Confirm mandatory**: `HeadObject`s actual size/contentType, deletes on mismatch, returns server-verified `{ key, size, contentType, publicUrl }`. Size permissive (`actual > expected` fails — undershoot OK for client-side compression); content-type strict.
7. **Multi-step factory chain.** `createUploadMutationOptions` resolves only after `confirm` succeeds — UI never sees "maybe uploaded" intermediate state.

**Phase 2 (deferred until first concrete consumer)**: orphan GC (cron deleting objects with no DB row referencing the key — needs the first business table that stores keys); integration event bus (`IAppEventBus` port, distinct from domain events) when 2+ handlers need `UploadConfirmedEvent` (rule 14).

## Organization scoping

1. **Ownership enforced at the port (`ScopedRepository`), not at the route.** `requireOrg` exposes `c.var.orgId` so the controller can build `RepoScope.org(orgId)` and pass it to `di.XxxUseCase.execute(input, scope)`; `requireOrgPermission({ resource: ["action"] })` still gates *capabilities*. **Why**: per-route ownership middleware is bypassed the moment a use case runs outside Hono — cron, queue, event handler, internal route. Port-level scoping (rule 18) survives every transport: cross-org / cross-user leak becomes a compile-time error, not a code-review smell. Routes are responsible for **constructing the scope** from authenticated context; the repo is responsible for **honoring it**.

2. **Queries (CQRS read side) take the same `RepoScope` and AND-join it in `WHERE`.** A query function signature is `(input, scope: RepoScope) => Promise<...>`. **Why**: the rule applies to the read side too — a query that bypasses scope is exactly as dangerous as a repo that does. Promote a `withScope(table, scope)` helper on 2nd occurrence (rule 14) — never as a substitute for the parameter, only as a sugar on top.

3. **Every business table from its first migration owns `organizationId NOT NULL` + FK `organization(id) ON DELETE CASCADE`.** **Why**: post-hoc multi-tenancy (backfill + orphan handling + query rewrite) is the most expensive class of refactor. Never skip — even solo-product today.

4. **Org-changing mutations broadcast `broadcastAuthChange()` from the call-site `onSuccess`** (not the factory): `setActive`, `create-org`, `delete-org`, `leave-org`, `transfer-and-leave`, `accept-invitation`, `remove-member`. **Why**: a tab holds stale `activeOrganizationId` up to `cookieCache.maxAge` (5 min) without a signal. Listener refetches `["session", "active-org", "current-membership", "orgs"]`.

5. **Personal org is never special-cased except via `isPersonalOrg(slug)`.** `slug = personal-${orgId}` (UUID v4, collision-free), `name = "Personal"`. No `isPersonal` flag, no metadata branch, no switcher filter — the slug pattern is a *naming convention*, not a *behavior switch*. Single allowed special-case: the helper (front) + lifecycle hooks in `auth.ts` (back) — Personal can't be deleted (`beforeDeleteOrganization` rejects) or left (front hides Leave); removal goes via account deletion (cascades). **Why**: Personal is auto-created on signup tied 1:1 to the user — standalone deletion would orphan them. Branch logic for "personal vs team" elsewhere inflates LOC for cosmetics.

6. **Personal self-heals at every sign-in; non-Personal auto-collapses when last member leaves.** `ensurePersonalOrgFor(userId)` returns existing membership orgId or creates Personal org + member row in a transaction — runs in `databaseHooks.user.create.after` (signup) AND `session.create.before` (back-fills legacy `activeOrganizationId: null` users at next sign-in). `organizationHooks.afterRemoveMember` deletes empty non-Personal orgs (skipped for Personal). Never duplicate the create logic inline; "last member leaves" side-effects always through `afterRemoveMember`, never client-side.

7. **Authorization is capability-based, defined once in `@packages/access-control`.** Package exports `ac`, `roles = { owner, admin, member }`, types `OrgRole` / `OrgPermissions`, predicate `authorizeRole(role, permissions, connector?)`. Server and client wire `organization({ ac, roles })` from the same instance; the `as unknown as AccessControl` cast required by BetterAuth's generic plugin signature stays *inside* the package — call sites stay strict-typed. **Why**: roles + statements duplicated front/back is the most common drift in multi-tenant SaaS. Never hardcode role tuples in feature code — describe the *capability* (`{ organization: ["update"] }`). New resource → extend `statement` + each role policy in the package, done.

8. **Three layers, one predicate**: server `requireOrgPermission(permissions)`, route gate `ensureOrgPermission(permissions)` in `beforeLoad`, UI `<Can requires={...} connector?="OR" fallback?={...}>` backed by `useAuthorization().can()`. Same `OrgPermissions` shape, same roles. **Why**: defense in depth — back enforces, route gate prevents access, UI hides unreachable controls. Children needing permission-aware behavior call `useAuthorization` themselves rather than receiving `canEdit: boolean` props (rule 14 — row owns its own check, page passes data only). Dev-only `<AuthorizationDevTool>` (mounted in `__root.tsx`, tree-shaken in prod) renders the live capability matrix per role.

9. **Per-route capability gates use `ensureOrgPermission`, not nested pathless layouts.** One pathless layout `_org-scope` gates "active org required"; capabilities live per-route in `beforeLoad`. **Why**: stacking `_org-admin` / `_org-owner` / `_can-manage-billing` forces every tier into the directory tree. Per-route helper keeps it flat — each route declares its exact capability, no inheritance, no naming explosion. Personal-only routes (e.g. `/settings/account`) sit outside the gate. Customize via `ensureOrgPermission(perms, { redirectTo })`.

10. **`getActiveMember` / `getFullOrganization` translate `NO_ACTIVE_ORGANIZATION` to `null` at the query layer.** `currentMembershipQueryOptions` and `activeOrgQueryOptions` catch the error code, return `null`. **Why**: BetterAuth treats "no active org" as error, but in our model it's a valid transient state (between orgs, pre-self-heal). Letting it bubble crashes every `ensureQueryData` consumer. New BetterAuth-org-wrapping query → same `code === "NO_ACTIVE_ORGANIZATION" ? null : throw` shape.

11. **Navigation declares `requires: OrgPermissions` + `requiresOrg: boolean`, not roles.** `SETTINGS_TABS` (`contextual-tabs.tsx`) and `NAVIGATION_ROUTES` (`command-palette.tsx`) filter via `useAuthorization().can(requires)` + `hasMembership`. **Why**: visible tab set must match what the gate accepts — same tuple at both ends keeps them in sync. New org-scoped sub-route → declare `requires` + `requiresOrg` at the nav source AND `ensureOrgPermission(...)` on the route file (same tuple).

## Domain Events

Events are *added* in aggregate methods (`this.addEvent(...)`), NOT dispatched there. Dispatch in use cases AFTER successful persistence:

```typescript
const saveResult = await this.repo.create(aggregate);
if (saveResult.isFailure) return Result.fail(saveResult.getError());
await this.eventDispatcher.dispatchAll(aggregate.domainEvents);
aggregate.clearEvents();
```

## Testing

BDD style. One test file per use case / service under `__TESTS__/` (services group `describe` per method). Mock at the repository/port level. Test `Result` / `Option` state transitions.

## Common patterns

```typescript
Result.ok(value); Result.fail(error); Result.combine([r1, r2, r3]);
Option.some(value); Option.none(); Option.fromNullable(value);

class Foo extends Aggregate<IFooProps> {
  get id(): FooId { return FooId.create(this._id); }
  static create(props): Foo {
    const e = new Foo({ ...props, createdAt: new Date() }, new UUID());
    e.addEvent(new FooCreatedEvent(e));
    return e;
  }
}

class Email extends ValueObject<string> {
  protected validate(v: string): Result<string> {
    return v.includes("@") ? Result.ok(v) : Result.fail("Invalid email");
  }
}

// Owned aggregate — scope is part of the port signature (rule 18)
type NoteScope = ScopeOf<"user-in-org">;
interface INoteRepository extends ScopedRepository<Note, NoteScope> {}

// Controller builds the scope from authenticated context, never the use case
const scope = RepoScope.userInOrg(c.var.userId, c.var.orgId);
const result = await di.UpdateNoteUseCase.execute({ id, body }, scope);
```

## Turborepo

`ui: "tui"`; daemon auto-managed since v2.x. `globalDependencies` (`biome.json`, `pnpm-workspace.yaml`, `.env*`) bust every cache. `inputs` scoped per task — README/doc edits do NOT invalidate code caches. `build` declares `with: ["type-check"]` (parallel for free). `dev`, `test:watch`, `db:studio` are `interruptible: true` — clean ctrl+C on next reload.

## Scripts & DB

- `pnpm dev` (Turbo TUI, `--filter=api` to scope) · `build` · `test` · `type-check` · `check` (Biome) · `fix` · `ci:check` · `check:duplication` (jscpd) · `check:unused` (knip) · `db:push` / `generate` / `migrate` / `seed` / `studio` · `clean`.
- Postgres on `localhost:5433` via `docker compose up -d`. Schema in `packages/drizzle/src/schema/*.ts`. After schema change: `pnpm db:push` (dev) or `db:generate && db:migrate` (prod-style).

## Release flow

Two-branch model. **`main` = released; `dev` = integration.** Every merge to `main` triggers semantic-release.

- **Conventional Commits required** (commitlint enforces lower-case subject). Release impact (`.releaserc.json`): `feat` → minor; `fix`/`perf`/`refactor`/`revert`/`build` and `docs(readme)` → patch; `docs`/`style`/`test`/`chore`/`ci` → no release; `BREAKING CHANGE:` footer (or `!` after type) → major. Pick the type for the *release impact you want*, not the file touched.
- Daily work on `dev` (or feature branches PR'd into `dev`). Pushing to `dev` does **not** release.
- Shipping = open a PR `dev` → `main`, merge it. semantic-release analyzes all commits since the last tag → one bundled bump + changelog.
- **`dev` → `main` MUST be a merge commit** (not squash, not rebase) — squash collapses every conventional commit into one, semantic-release would see one entry. GitHub-side configured to allow merge commits only.
- `main` is protected (require PR, no force push, conversation resolution). CI fix during release → on `dev`, re-merge.
- **Don't release on every commit** — wait for a meaningful batch. Cadence = when you merge to main.

## Don't

Anti-patterns specific to this stack — rules above already cover the positive form, this section captures stack-specific landmines and high-stakes security inverses.

- Add business features without first agreeing on the bounded context.
- Reintroduce `@hono/node-server`, `tsx`, `tsc-alias` — the API runs on Bun natively.
- Pin Postgres back to port 5432 — collides with other local Postgres instances.
- Push directly to `main` or merge `dev` → `main` with squash/rebase — destroys conventional-commit history.
- Pass `redirectTo` / `callbackURL` to auth-client methods when the `send*` server hook already builds the URL — duplicate dead code can silently override the canonical URL.
- Re-implement `auth.api.organization.*` server-side or attach `requireOrgPermission` to plugin endpoints — the plugin owns role checks for `/api/auth/organization/*`. Custom guards apply to **our** business routes only.
- Add a Presigned POST flow to upload — providers like R2 don't implement POST policies (verified 2026). PUT presigned + `confirm` is the correct shape.
- Skip the owner-prefix check (`key.startsWith("<userId>/")`) in download/confirm — any authenticated user could otherwise presign a GET / verify any key in the bucket. (Storage rule 2.)
- Trust the size or content-type a client declares at `presign` without running `confirm` — server is blind during upload. (Storage rule 6.)
- Skip `requireOrg` on a handler reading/writing rows scoped by `organizationId` — silently accepts requests with no active org. (Org R1.)
- Allow Personal org deletion via the normal flow — `beforeDeleteOrganization` rejects, front hides the button. Account deletion is the only path. (Org R5.)
- Implement `BaseRepository<T>` for an aggregate that carries `userId` / `organizationId` — middleware is not a substitute for a port-level invariant (rule 18). Use `ScopedRepository<T, ScopeOf<"user"|"org"|"user-in-org">>`.
- Return `Result.fail("FORBIDDEN")` on wrong-owner reads — leaks existence of rows the caller doesn't own. Reads return `Option.none()`; writes return `NOT_FOUND`. (Rule 17.)
- Re-create a `requireOrgOwnership` / `withOrg` style helper — removed on purpose (rule 18). Cross-org / cross-user check belongs in the repo, not in middleware or query helpers.
